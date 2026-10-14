"""Merge Trend Radar topics that are about the same story.

Topic grouping links titles by shared words (app/signals/topics.py), so
coverage of one event in different words lands in separate topics: "OpenAI
finds recording device in one of their offices" and "OpenAI engineer arrested
in bugging of executive conference room" share little besides "OpenAI". On 60
real topics (2026-10-14) word overlap alone could not tell duplicates apart:
between topic centroids, true duplicates scored as low as 0.26 and different
stories as high as 0.53. So:

1. candidate pairs: topic centroids (TF-IDF over member titles) with cosine
   >= MIN_PAIR_SIMILARITY, best first, at most MAX_PAIRS;
2. gpt-4o-mini says for each pair whether both are the same story (one event
   or announcement, with its follow-ups, reactions and demos);
3. confirmed pairs are joined (union-find), and each group becomes its
   highest-scoring topic, re-scored over all members.

Runs right after build_signal_topics; about a tenth of a cent per run.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.signal import Signal, SignalTopic
from app.signals.base import strip_hn_prefix
from app.signals.topics import (
    DESCRIPTION_FIELDS,
    RelevanceFn,
    default_relevance_fn,
    draft_group,
    engagement_of,
)

logger = logging.getLogger(__name__)

MODEL = "gpt-4o-mini"
MIN_PAIR_SIMILARITY = 0.15
MAX_PAIRS = 40
TITLES_PER_TOPIC = 5
MAX_KEYWORDS = 4
# USD per 1M tokens (same table as app/services/summarization.py)
_PRICE_INPUT = 0.15
_PRICE_OUTPUT = 0.60

_SYSTEM = """You check whether two groups of AI-news headlines are about the same story.
A story is one specific event, announcement or product launch, together with follow-up coverage of it: reactions, analysis, explainers, demos and later developments of the same incident.
Answer "same": true only when both groups are about the same story. Separate announcements or different products from the same company are different stories (for example a model launch and a separate robotics model built on it, or two unrelated lawsuits against one company).

Input is a JSON list of {"id": ..., "a": [headlines], "b": [headlines]}.
Return JSON: {"pairs": [{"id": ..., "same": true or false}, ...]} with one entry for every input id."""


def candidate_pairs(
    titles_per_topic: list[list[str]],
    *,
    min_similarity: float = MIN_PAIR_SIMILARITY,
    limit: int = MAX_PAIRS,
) -> list[tuple[int, int, float]]:
    """(i, j, cosine) for topic pairs whose title centroids are similar, most similar first."""
    if len(titles_per_topic) < 2:
        return []
    import numpy as np
    from sklearn.feature_extraction.text import TfidfVectorizer

    vectorizer = TfidfVectorizer(stop_words="english", sublinear_tf=True)
    try:
        vectorizer.fit([t for titles in titles_per_topic for t in titles])
    except ValueError:  # nothing but stop words
        return []
    rows = []
    for titles in titles_per_topic:
        centroid = np.asarray(vectorizer.transform(titles or [""]).mean(axis=0)).ravel()
        norm = float(np.linalg.norm(centroid))
        rows.append(centroid / norm if norm else centroid)
    sims = np.vstack(rows) @ np.vstack(rows).T
    pairs = [
        (i, j, float(sims[i, j]))
        for i in range(len(rows))
        for j in range(i + 1, len(rows))
        if sims[i, j] >= min_similarity
    ]
    pairs.sort(key=lambda p: -p[2])
    return pairs[:limit]


def judge_pairs(client: Any, items: list[tuple[list[str], list[str]]]) -> tuple[list[bool | None], int, int]:
    """Ask once whether each (titles a, titles b) pair is the same story. None = no answer."""
    payload = [{"id": k, "a": a, "b": b} for k, (a, b) in enumerate(items)]
    response = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        temperature=0,
        max_tokens=2000,
    )
    usage = getattr(response, "usage", None)
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0

    out: list[bool | None] = [None] * len(items)
    try:
        rows = json.loads(response.choices[0].message.content or "{}").get("pairs") or []
    except (ValueError, AttributeError):
        rows = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        idx, same = row.get("id"), row.get("same")
        if isinstance(idx, int) and 0 <= idx < len(items) and isinstance(same, bool):
            out[idx] = same
    return out, prompt_tokens, completion_tokens


def merge_sets(n: int, same: list[tuple[int, int]]) -> list[list[int]]:
    """Join confirmed pairs (union-find). Returns groups of 2+ indices, each sorted ascending."""
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, j in same:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[max(ri, rj)] = min(ri, rj)
    groups: dict[int, list[int]] = defaultdict(list)
    for k in range(n):
        groups[find(k)].append(k)
    return sorted((g for g in groups.values() if len(g) > 1), key=lambda g: g[0])


def _top_titles(members: list[Signal], k: int) -> list[str]:
    ranked = sorted(members, key=lambda s: (engagement_of(s), s.published_at), reverse=True)
    titles: list[str] = []
    for s in ranked:
        title = strip_hn_prefix(s.title)
        if title not in titles:
            titles.append(title)
        if len(titles) == k:
            break
    return titles


def run_merge(
    db: Session,
    client: Any,
    *,
    now: datetime,
    window_days: int,
    active_families: int,
    relevance_fn: RelevanceFn | None = None,
) -> dict[str, Any]:
    topics = list(
        db.execute(
            select(SignalTopic).order_by(SignalTopic.score.desc(), SignalTopic.engagement.desc())
        ).scalars().all()
    )
    members: dict[Any, list[Signal]] = defaultdict(list)
    if topics:
        for s in db.execute(select(Signal).where(Signal.topic_id.in_([t.id for t in topics]))).scalars():
            members[s.topic_id].append(s)

    pairs = candidate_pairs([[strip_hn_prefix(s.title) for s in members[t.id]] for t in topics])
    summary: dict[str, Any] = {"topics": len(topics), "pairs": len(pairs), "same": 0, "merged_away": 0, "failed": False}
    if not pairs:
        logger.info("merge_signal_topics %s", summary)
        return summary

    items = [
        (_top_titles(members[topics[i].id], TITLES_PER_TOPIC), _top_titles(members[topics[j].id], TITLES_PER_TOPIC))
        for i, j, _ in pairs
    ]
    try:
        verdicts, prompt_tokens, completion_tokens = judge_pairs(client, items)
    except Exception as exc:
        # Topics stay as built; the next run tries again
        logger.warning("merge_signal_topics skipped (%s: %s)", type(exc).__name__, str(exc)[:200])
        summary["failed"] = True
        return summary

    same = [(i, j) for (i, j, _), verdict in zip(pairs, verdicts) if verdict]
    relevance = relevance_fn or default_relevance_fn()
    for group in merge_sets(len(topics), same):
        keep, dropped = topics[group[0]], [topics[k] for k in group[1:]]
        all_members = [s for t in (keep, *dropped) for s in members[t.id]]
        keywords: list[str] = []
        for t in (keep, *dropped):
            keywords += [k for k in (t.keywords or []) if k not in keywords]
        draft = draft_group(
            all_members,
            keywords=keywords[:MAX_KEYWORDS],
            now=now,
            window_days=window_days,
            active_families=active_families,
            relevance_fn=relevance,
        )
        keep.label, keep.topic_tag, keep.keywords = draft.label, draft.topic_tag, draft.keywords
        keep.signal_count, keep.source_counts, keep.engagement = draft.signal_count, draft.source_counts, draft.engagement
        keep.score, keep.score_components = draft.score, draft.components
        keep.velocity, keep.rising, keep.daily_counts = draft.velocity, draft.rising, draft.daily_counts
        keep.first_seen_at, keep.last_seen_at = draft.first_seen_at, draft.last_seen_at
        if keep.described_at is None:
            # Keep a description one of the merged topics already had
            donor = next((t for t in dropped if t.described_at is not None), None)
            if donor is not None:
                for field in DESCRIPTION_FIELDS:
                    setattr(keep, field, getattr(donor, field))
        db.execute(
            update(Signal).where(Signal.topic_id.in_([t.id for t in dropped])).values(topic_id=keep.id)
        )
        db.execute(delete(SignalTopic).where(SignalTopic.id.in_([t.id for t in dropped])))
        summary["merged_away"] += len(dropped)
        logger.info(
            "merged topics into %r: %s", keep.label[:80], [t.label[:60] for t in dropped]
        )
    db.commit()

    summary["same"] = len(same)
    summary["cost_usd"] = round(
        (prompt_tokens * _PRICE_INPUT + completion_tokens * _PRICE_OUTPUT) / 1_000_000, 4
    )
    logger.info("merge_signal_topics %s", summary)
    return summary
