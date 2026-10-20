"""Describe Trend Radar topics: a short summary (EN + 中文) and the Sipply story
that already covers the topic, if there is one.

Topics in the two inner rings (enough evidence to act on, see
topics.evidence_ring) are described wherever they rank; weak signals only while
the public radar shows them. GPT also says whether a topic is news at all:
memes, AI art and teaser videos are kept off the public radar (2026-10-18:
"Orc Carving a Pumpkin #synthart" ranked 14th). For each one, TF-IDF over Sipply's story
titles and summaries in the radar window picks CANDIDATES_PER_TOPIC candidate
stories; gpt-4o-mini writes the summary from the topic's post titles and says
which candidate (if any) is about the same event. On 23 hand-checked topics
(2026-10-13) the right story was among the top 5 candidates for all 12 topics
Sipply had covered.

A described topic is skipped on later runs (build_topics carries the
description over) unless it has grown by REDESCRIBE_GROWTH since, or, in the
inner rings, Sipply had no story on it yet — Sipply may have written one since.
Normal runs cost well under a cent.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cluster import Cluster
from app.models.signal import Signal, SignalTopic
from app.signals.base import strip_hn_prefix
from app.signals.topics import engagement_of, evidence_ring

logger = logging.getLogger(__name__)

MODEL = "gpt-4o-mini"
BATCH_SIZE = 8
MAX_TOPICS_PER_RUN = 40
# The /radar page shows the top 40 topics (fetchRadar in lib/api/index.ts)
PUBLIC_TOPICS = 40
TITLES_PER_TOPIC = 8
CANDIDATES_PER_TOPIC = 5
MIN_CANDIDATE_SIMILARITY = 0.02
STORY_SUMMARY_CHARS = 300
# Opening of each candidate story's summary sent to GPT with its title (2026-10-14:
# from titles alone it matched "defenses against distillation attacks" to an
# arXiv paper titled "Distillation for Incrimination and …")
STORY_ABOUT_CHARS = 200
REDESCRIBE_GROWTH = 1.5
# The newsworthy rules gained creator comparison videos and hashtag promotion posts
# (2026-10-20); topics judged news before then are judged once more
NEWSWORTHY_RULES_SINCE = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
SUMMARY_MAX_CHARS = 400
QUESTION_MAX_CHARS = 200
# USD per 1M tokens (same table as app/services/summarization.py)
_PRICE_INPUT = 0.15
_PRICE_OUTPUT = 0.60

_SYSTEM = """You write for Sipply, an AI news site. Each input topic is a group of posts people shared in the last two weeks (Hacker News, news sites, YouTube, Bluesky, GitHub…), given as their titles, plus a few candidate Sipply stories.

For every topic return:
- "summary_en": one or two plain sentences (at most 45 words) saying what happened. Use only what the titles say; do not speculate or add hype; do not start with "This topic".
- "summary_zh": the same in Simplified Chinese (简体中文). Keep names of products, models, companies and people in English.
- "story": the id of the candidate story that reports the same event or announcement, or null if none does. Use each story's title and "about" text. A story about the same company but a different event is not a match, and neither is a research paper that only shares a keyword. Judge the topic as a whole: if the posts are a mix of unrelated items, a story matching just one of them is not a match.
- "question": the question a curious reader would type into an AI assistant to learn about this story, in English, at most 15 words, naming the company or product (e.g. "What did Microsoft's president say about AI regulation and milk?").
- "newsworthy": true if the posts are about something an AI news site would report: a release, announcement, research result, deal, lawsuit, policy, outage, or a notable person's statement. false for memes and jokes, personal anecdotes, AI-generated art or videos, lists of prompts, generic tips and tutorials, hype videos whose teaser titles name no concrete event, creator videos comparing assistants or reacting to them ("ChatGPT vs Claude vs Gemini: which is best?", "is it better than…?") that report nothing new, and promotional posts made mostly of hashtags. Judge the topic as a whole; when unsure, true.

Input is a JSON list of {"id": ..., "posts": [...], "stories": [{"id": ..., "title": ..., "about": ...}]}.
Return JSON: {"topics": [{"id": ..., "summary_en": ..., "summary_zh": ..., "story": ..., "question": ..., "newsworthy": ...}, ...]} with one entry for every input id."""


def needs_description(topic: SignalTopic, *, inner: bool = True) -> bool:
    if topic.described_at is None or topic.question_en is None or topic.newsworthy is None:
        return True
    if topic.newsworthy and topic.described_at < NEWSWORTHY_RULES_SINCE:
        return True
    # Only for topics Sipply would act on: it may have written a story since
    if inner and topic.covered_cluster_id is None:
        return True
    described = topic.described_signal_count or 0
    return topic.signal_count >= described * REDESCRIBE_GROWTH


def topics_to_describe(
    db: Session, *, limit: int = MAX_TOPICS_PER_RUN, public: int = PUBLIC_TOPICS
) -> list[SignalTopic]:
    """Topics that are new, have grown, or (inner rings) had no Sipply story yet; best first.

    Inner- and middle-ring topics wherever they rank; weak signals only among the
    top ``public`` topics the radar shows (not counting ones judged not news), so
    every topic a reader sees has been judged.
    """
    topics = db.execute(
        select(SignalTopic).order_by(SignalTopic.score.desc(), SignalTopic.engagement.desc())
    ).scalars().all()
    shown = {t.id for t in [t for t in topics if t.newsworthy is not False][:public]}
    picked = []
    for t in topics:
        inner = evidence_ring(t.signal_count, len(t.source_counts or {})) <= 2
        if (inner or t.id in shown) and needs_description(t, inner=inner):
            picked.append(t)
    return picked[:limit]


def recent_stories(db: Session, *, now: datetime, window_days: int) -> list[Cluster]:
    return list(
        db.execute(
            select(Cluster).where(Cluster.last_seen_at >= now - timedelta(days=window_days))
        ).scalars().all()
    )


def story_text(story: Cluster) -> str:
    return f"{story.representative_title} {(story.summary or '')[:STORY_SUMMARY_CHARS]}".strip()


def candidate_stories(
    topic_texts: list[str],
    story_texts: list[str],
    *,
    k: int = CANDIDATES_PER_TOPIC,
    min_similarity: float = MIN_CANDIDATE_SIMILARITY,
) -> list[list[int]]:
    """Indices of the ``k`` stories most similar to each topic (TF-IDF cosine), best first."""
    if not topic_texts or not story_texts:
        return [[] for _ in topic_texts]
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
    try:
        matrix = vectorizer.fit_transform(topic_texts + story_texts)
    except ValueError:  # every text was stop words
        return [[] for _ in topic_texts]
    sims = cosine_similarity(matrix[: len(topic_texts)], matrix[len(topic_texts):])
    out = []
    for row in sims:
        order = row.argsort()[::-1][:k]
        out.append([int(j) for j in order if row[j] >= min_similarity])
    return out


def describe_batch(
    client: Any, items: list[dict[str, Any]]
) -> tuple[list[dict[str, Any] | None], int, int]:
    """Describe topics in one request.

    ``items``: [{"posts": [title, …], "stories": [(story key, title, opening of its summary), …]}].
    Returns ({"summary_en", "summary_zh", "story": story key or None, "question": str or None,
    "newsworthy": bool or None} or None per item, prompt tokens, completion tokens).
    """
    payload = [
        {
            "id": i,
            "posts": item["posts"],
            "stories": [
                {"id": f"s{j}", "title": title, "about": about} for j, (_, title, about) in enumerate(item["stories"])
            ],
        }
        for i, item in enumerate(items)
    ]
    response = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        temperature=0.2,
        max_tokens=4000,
    )
    usage = getattr(response, "usage", None)
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0

    out: list[dict[str, Any] | None] = [None] * len(items)
    try:
        rows = json.loads(response.choices[0].message.content or "{}").get("topics") or []
    except (ValueError, AttributeError):
        rows = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        idx = row.get("id")
        if not isinstance(idx, int) or not 0 <= idx < len(items):
            continue
        en, zh = row.get("summary_en"), row.get("summary_zh")
        if not (isinstance(en, str) and en.strip() and isinstance(zh, str) and zh.strip()):
            continue
        keys = {f"s{j}": story[0] for j, story in enumerate(items[idx]["stories"])}
        question = row.get("question")
        out[idx] = {
            "summary_en": en.strip()[:SUMMARY_MAX_CHARS],
            "summary_zh": zh.strip()[:SUMMARY_MAX_CHARS],
            # Anything but one of this topic's own candidate ids counts as "no story"
            "story": keys.get(row.get("story")) if isinstance(row.get("story"), str) else None,
            "question": question.strip()[:QUESTION_MAX_CHARS] if isinstance(question, str) and question.strip() else None,
            # Only a yes/no answer counts; anything else leaves the topic unjudged (and shown)
            "newsworthy": row.get("newsworthy") if isinstance(row.get("newsworthy"), bool) else None,
        }
    return out, prompt_tokens, completion_tokens


def _topic_titles(db: Session, topics: list[SignalTopic]) -> dict[Any, list[str]]:
    members: dict[Any, list[Signal]] = defaultdict(list)
    for s in db.execute(select(Signal).where(Signal.topic_id.in_([t.id for t in topics]))).scalars():
        members[s.topic_id].append(s)
    titles: dict[Any, list[str]] = {}
    for t in topics:
        ranked = sorted(members[t.id], key=lambda s: (engagement_of(s), s.published_at), reverse=True)
        seen: list[str] = []
        for s in ranked:
            title = strip_hn_prefix(s.title)
            if title not in seen:
                seen.append(title)
            if len(seen) == TITLES_PER_TOPIC:
                break
        titles[t.id] = seen or [t.label]
    return titles


def run_describe(
    db: Session,
    client: Any,
    *,
    now: datetime,
    window_days: int,
    batch_size: int = BATCH_SIZE,
) -> dict[str, Any]:
    topics = topics_to_describe(db)
    stories = recent_stories(db, now=now, window_days=window_days) if topics else []
    titles = _topic_titles(db, topics) if topics else {}
    candidates = candidate_stories(
        [" ".join([t.label, *titles[t.id]]) for t in topics], [story_text(s) for s in stories]
    )

    described = covered = not_news = failed = prompt_tokens = completion_tokens = 0
    for start in range(0, len(topics), batch_size):
        batch = topics[start : start + batch_size]
        items = [
            {
                "posts": titles[t.id],
                "stories": [
                    (stories[j].id, stories[j].representative_title, (stories[j].summary or "")[:STORY_ABOUT_CHARS])
                    for j in candidates[start + i]
                ],
            }
            for i, t in enumerate(batch)
        ]
        try:
            results, p, c = describe_batch(client, items)
        except Exception as exc:
            # Bad key, quota, outage: the next batch would fail the same way
            remaining = len(topics) - start
            logger.warning(
                "describe_signal_topics stopped (%s: %s); %d topics left for the next run",
                type(exc).__name__, str(exc)[:200], remaining,
            )
            failed += remaining
            break
        prompt_tokens += p
        completion_tokens += c
        for topic, result in zip(batch, results):
            if result is None:
                failed += 1
                continue
            topic.summary_en = result["summary_en"]
            topic.summary_zh = result["summary_zh"]
            topic.covered_cluster_id = result["story"]
            topic.question_en = result["question"]
            topic.newsworthy = result["newsworthy"]
            topic.described_signal_count = topic.signal_count
            topic.described_at = now
            described += 1
            covered += result["story"] is not None
            not_news += result["newsworthy"] is False
        db.commit()

    cost = (prompt_tokens * _PRICE_INPUT + completion_tokens * _PRICE_OUTPUT) / 1_000_000
    summary = {
        "pending": len(topics),
        "described": described,
        "covered": covered,
        "not_news": not_news,
        "failed": failed,
        "stories": len(stories),
        "cost_usd": round(cost, 4),
    }
    logger.info("describe_signal_topics %s", summary)
    return summary
