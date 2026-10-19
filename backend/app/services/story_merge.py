"""Merge stories that report the same event in different words.

Story clustering links articles by shared words (app/services/clustering.py),
and dedup_clusters merges a new story into an open one only when the titles
are close (TF-IDF >= 0.35). Coverage of one event in other words stays apart:
on 2026-10-18 Sipply had three stories about Meta's news-scraping terms
(TechCrunch, The Verge, and The Verge's earlier report), two on Google's
Universal Cart and two on YouTube's AI music labels. Their title + summary
similarity ran from 0.13 to 0.40, while unrelated arXiv papers on flow
matching reached 0.23, so no threshold works. As for Trend Radar topics
(app/signals/merge.py):

1. candidate pairs: stories seen in the last WINDOW_DAYS, at most
   MAX_DAYS_APART apart, with TF-IDF cosine (title + summary opening) >=
   MIN_PAIR_SIMILARITY, best first, at most MAX_PAIRS; never two research
   papers, and never a pair already judged different;
2. gpt-4o-mini says for each pair whether both report the same event;
3. confirmed pairs are joined (union-find); a group holding a pair judged
   different is left apart. Each group keeps its oldest
   published story, whose address search engines already know; the others'
   articles move into it and their old addresses redirect there
   (story_redirects). The kept story is summarized and translated again over
   all its sources.

Runs after dedup_clusters, before summarize; well under a cent per run.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Iterable

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.models.answer_check import AnswerCheck
from app.models.cluster import Cluster
from app.models.signal import SignalTopic
from app.models.source import Source
from app.models.story_redirect import StoryRedirect
from app.services.cluster_dedup import merge_into
from app.services.home_ranking import story_kind

logger = logging.getLogger(__name__)

MODEL = "gpt-4o-mini"
WINDOW_DAYS = 4
MAX_DAYS_APART = 3
MIN_PAIR_SIMILARITY = 0.12
MAX_PAIRS = 30
HEADLINES_PER_STORY = 5
ABOUT_CHARS = 300
# cluster.meta key: ids of stories GPT said report something else, never asked again
NOT_SAME_KEY = "not_same_as"
# USD per 1M tokens (same table as app/services/summarization.py)
_PRICE_INPUT = 0.15
_PRICE_OUTPUT = 0.60

_SYSTEM = """You check whether two stories on an AI news site report the same news. Each story is given as the headlines of its articles and the opening of its summary.
Answer "same": true only when both report the same specific event: the same launch, announcement, deal, lawsuit, policy or terms change, incident, or statement, whether the outlets word it differently or one reports a later turn of that same incident (for example a company's change and then its reversal).
Answer false for different announcements from one company, a product's launch and a later review or how-to, two interviews or talks on different subjects, two research papers, and stories that only share a theme. When unsure, answer false.

Input is a JSON list of {"id": ..., "a": {"headlines": [...], "about": ...}, "b": {"headlines": [...], "about": ...}}.
Return JSON: {"pairs": [{"id": ..., "same": true or false}, ...]} with one entry for every input id."""


def candidate_pairs(
    texts: list[str],
    *,
    kinds: list[str],
    seen: list[datetime | None],
    min_similarity: float = MIN_PAIR_SIMILARITY,
    limit: int = MAX_PAIRS,
    skip: Iterable[tuple[int, int]] = (),
) -> list[tuple[int, int, float]]:
    """(i, j, cosine) for story pairs that may report the same event, most similar first.

    ``kinds``: "news" / "research" / "newsletter" per story (home_ranking.story_kind);
    ``seen``: when each story was first seen; ``skip``: pairs (i < j) already judged different.
    """
    if len(texts) < 2:
        return []
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
    try:
        sims = cosine_similarity(vectorizer.fit_transform(texts))
    except ValueError:  # every text was stop words
        return []
    skipped = {(min(i, j), max(i, j)) for i, j in skip}
    pairs = []
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            if sims[i, j] < min_similarity or (i, j) in skipped:
                continue
            # Two papers on one method are separate works, however alike their abstracts
            if kinds[i] == "research" and kinds[j] == "research":
                continue
            a, b = seen[i], seen[j]
            if a is not None and b is not None and abs((a - b).total_seconds()) > MAX_DAYS_APART * 86400:
                continue
            pairs.append((i, j, float(sims[i, j])))
    pairs.sort(key=lambda p: p[2], reverse=True)
    return pairs[:limit]


def judge_pairs(
    client: Any, pairs: list[tuple[dict[str, Any], dict[str, Any]]]
) -> tuple[list[bool | None], int, int]:
    """Ask once whether each pair of stories reports the same event.

    ``pairs``: ({"headlines": [...], "about": str}, same for b). Returns (True / False, or None
    when there's no clear answer, per pair; prompt tokens, completion tokens).
    """
    payload = [{"id": k, "a": a, "b": b} for k, (a, b) in enumerate(pairs)]
    response = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        temperature=0,
        max_tokens=1500,
    )
    usage = getattr(response, "usage", None)
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0

    verdicts: list[bool | None] = [None] * len(pairs)
    try:
        rows = json.loads(response.choices[0].message.content or "{}").get("pairs") or []
    except (ValueError, AttributeError):
        rows = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        k, same = row.get("id"), row.get("same")
        if isinstance(k, int) and 0 <= k < len(pairs) and isinstance(same, bool):
            verdicts[k] = same
    return verdicts, prompt_tokens, completion_tokens


def _about(story: Cluster) -> str:
    """The opening of the story's summary; before it has one, its lead article's."""
    if story.summary:
        return story.summary.strip()[:ABOUT_CHARS]
    lead = max(story.articles, key=lambda a: a.signal_score or 0.0, default=None)
    text = (lead.short_summary or lead.excerpt or (lead.cleaned_text or "")) if lead else ""
    return " ".join(text.split())[:ABOUT_CHARS]


def _headlines(story: Cluster) -> list[str]:
    titles = [story.headline or story.representative_title]
    for a in sorted(story.articles, key=lambda a: a.signal_score or 0.0, reverse=True):
        if a.title not in titles:
            titles.append(a.title)
    return titles[:HEADLINES_PER_STORY]


def _not_same(story: Cluster) -> set[str]:
    return set((story.meta or {}).get(NOT_SAME_KEY) or [])


def _remember_not_same(a: Cluster, b: Cluster) -> None:
    for story, other in ((a, b), (b, a)):
        story.meta = {**(story.meta or {}), NOT_SAME_KEY: sorted(_not_same(story) | {str(other.id)})}
        flag_modified(story, "meta")


def _snapshot(story: Cluster) -> dict[str, Any]:
    def iso(dt: datetime | None) -> str | None:
        return dt.isoformat() if dt else None

    return {
        "title": story.representative_title,
        "title_zh": story.representative_title_zh,
        "headline": story.headline,
        "headline_zh": story.headline_zh,
        "slug": story.slug,
        "summary": story.summary,
        "summary_zh": story.summary_zh,
        "topic_tag": story.topic_tag,
        "status": story.status,
        "cluster_score": story.cluster_score,
        "first_seen_at": iso(story.first_seen_at),
        "last_seen_at": iso(story.last_seen_at),
        "created_at": iso(story.created_at),
        "article_ids": [str(a.id) for a in story.articles],
    }


def merge_story(db: Session, source: Cluster, target: Cluster) -> None:
    """Move ``source``'s articles into ``target`` and delete it; its old id and slug lead to ``target``."""
    # Addresses that led to source now lead to target
    db.execute(update(StoryRedirect).where(StoryRedirect.cluster_id == source.id).values(cluster_id=target.id))
    for model in (SignalTopic, AnswerCheck):
        db.execute(
            update(model).where(model.covered_cluster_id == source.id).values(covered_cluster_id=target.id)
        )
    db.add(StoryRedirect(old_id=source.id, old_slug=source.slug, cluster_id=target.id, snapshot=_snapshot(source)))
    target.meta = {**(target.meta or {}), NOT_SAME_KEY: sorted((_not_same(target) | _not_same(source)) - {str(target.id)})}
    flag_modified(target, "meta")
    # The loaded article list is stale once they move; deleting source would detach them again
    db.expire(source, ["articles"])
    merge_into(db, source=source, target=target)
    # Summarized and translated again over all its sources, later in this run
    target.summarized_at = None
    target.translated_at = None


def _keeper(group: list[Cluster]) -> Cluster:
    """The oldest story with a public address (search engines know it); else the oldest."""
    return min(group, key=lambda c: (c.slug is None, c.created_at))


def run_story_merge(db: Session, client: Any, *, now: datetime) -> dict[str, Any]:
    stories = list(
        db.execute(
            select(Cluster)
            .options(selectinload(Cluster.articles))
            .where(Cluster.last_seen_at >= now - timedelta(days=WINDOW_DAYS))
            .order_by(Cluster.created_at)
        ).scalars().all()
    )
    stories = [c for c in stories if c.articles]
    source_type: dict[uuid.UUID, str] = dict(db.execute(select(Source.id, Source.type)).all())
    index = {str(c.id): k for k, c in enumerate(stories)}
    skip = [(i, index[other]) for i, c in enumerate(stories) for other in _not_same(c) if other in index]
    pairs = candidate_pairs(
        [f"{c.headline or c.representative_title}. {_about(c)}" for c in stories],
        kinds=[story_kind({source_type[a.source_id] for a in c.articles if a.source_id in source_type}) for c in stories],
        seen=[c.first_seen_at for c in stories],
        skip=skip,
    )

    summary: dict[str, Any] = {"stories": len(stories), "pairs": len(pairs), "same": 0, "merged": 0, "failed": 0, "cost_usd": 0.0}
    if not pairs:
        logger.info("merge_duplicate_stories %s", summary)
        return summary
    try:
        verdicts, prompt_tokens, completion_tokens = judge_pairs(
            client,
            [
                ({"headlines": _headlines(stories[i]), "about": _about(stories[i])},
                 {"headlines": _headlines(stories[j]), "about": _about(stories[j])})
                for i, j, _ in pairs
            ],
        )
    except Exception as exc:
        # Bad key, quota, outage: nothing merged, the same pairs are asked next run
        logger.warning("merge_duplicate_stories stopped (%s: %s)", type(exc).__name__, str(exc)[:200])
        summary["failed"] = len(pairs)
        return summary
    summary["cost_usd"] = round((prompt_tokens * _PRICE_INPUT + completion_tokens * _PRICE_OUTPUT) / 1_000_000, 4)

    parent = list(range(len(stories)))

    def find(k: int) -> int:
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    for (i, j, sim), same in zip(pairs, verdicts):
        a, b = stories[i], stories[j]
        # One line per judged pair, so every merge can be audited
        logger.info("merge_duplicate_stories pair sim=%.2f same=%s a=%.70s | b=%.70s", sim, same, a.representative_title, b.representative_title)
        if same is None:
            summary["failed"] += 1
        elif same:
            summary["same"] += 1
            parent[find(j)] = find(i)
        else:
            _remember_not_same(a, b)

    groups: dict[int, list[Cluster]] = {}
    for k, story in enumerate(stories):
        groups.setdefault(find(k), []).append(story)
    for group in groups.values():
        if len(group) < 2:
            continue
        # A = B and B = C but A ≠ C: the judge disagrees with itself, so nothing joins on the chain
        ids = {str(c.id) for c in group}
        if any(_not_same(c) & ids for c in group):
            summary["conflicts"] = summary.get("conflicts", 0) + 1
            logger.info("merge_duplicate_stories conflict, left apart: %s", " | ".join(f"{c.representative_title:.50}" for c in group))
            continue
        keep = _keeper(group)
        for story in group:
            if story is not keep:
                merge_story(db, source=story, target=keep)
                summary["merged"] += 1
    db.commit()
    logger.info("merge_duplicate_stories %s", summary)
    return summary
