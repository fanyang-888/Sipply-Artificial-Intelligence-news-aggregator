"""Content briefs for Trend Radar topics Sipply hasn't covered yet.

The radar finds what people discuss (signals → topics), the question they would
ask an AI assistant (describe), whether Sipply has a story (coverage), and who
AI assistants cite (answers). This closes the loop for the gaps: for each
mainstream or picking-up topic with no Sipply story it writes what an editor
needs to cover it: a headline, the angle, the questions readers ask, and a few
facts, each taken from one of the topic's posts and linked to it.

gpt-4o-mini may only use the posts it is given. A fact that doesn't name one of
the topic's posts is dropped, and a brief with fewer than MIN_FACTS facts is
not stored. A topic is briefed once and again only after it grows by
REBRIEF_GROWTH; normal runs cost well under a cent.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.signal import Signal, SignalTopic
from app.signals.base import source_family, strip_hn_prefix
from app.signals.topics import engagement_of, evidence_ring

logger = logging.getLogger(__name__)

MODEL = "gpt-4o-mini"
BATCH_SIZE = 5
MAX_BRIEFS_PER_RUN = 15
POSTS_PER_TOPIC = 8
POST_TEXT_CHARS = 400
MIN_FACTS = 2
MAX_FACTS = 5
MAX_QUESTIONS = 3
REBRIEF_GROWTH = 1.5
HEADLINE_MAX_CHARS = 160
ANGLE_MAX_CHARS = 400
FACT_MAX_CHARS = 300
QUESTION_MAX_CHARS = 200
# USD per 1M tokens (same table as app/signals/describe.py)
_PRICE_INPUT = 0.15
_PRICE_OUTPUT = 0.60

_SYSTEM = """You prepare content briefs for Sipply, an AI news site, about topics people are discussing that Sipply hasn't covered yet. Each input topic has a short summary, the question readers ask AI assistants about it, and its most-engaged posts, numbered, with platform, title and text.

For every topic return:
- "headline_en": a factual news headline, at most 14 words, no clickbait.
- "headline_zh": the same in Simplified Chinese (简体中文). Keep names of products, models, companies and people in English.
- "angle_en": one sentence, at most 35 words: why it matters to people who build with AI, and what a story should explain.
- "angle_zh": the same in Simplified Chinese.
- "questions": up to 3 questions readers would ask an AI assistant about it, each {"en": ..., "zh": ...}. The first may be the given question.
- "facts": 3 to 5 facts a story should state, each {"en": ..., "zh": ..., "post": n} where n is the number of the post that states it. Use only what the posts say: never add numbers, dates, names or claims that are not in them. When posts disagree, say who claims what.

Input is a JSON list of {"id", "summary", "question", "posts": [{"n", "platform", "title", "text"}]}.
Return JSON: {"topics": [{"id": ..., "headline_en": ..., "headline_zh": ..., "angle_en": ..., "angle_zh": ..., "questions": [...], "facts": [...]}, ...]} with one entry for every input id."""


def needs_brief(topic: SignalTopic) -> bool:
    """A described inner-ring topic with no Sipply story, never briefed or grown since."""
    if evidence_ring(topic.signal_count, len(topic.source_counts or {})) > 2:
        return False
    if topic.described_at is None or topic.covered_cluster_id is not None:
        return False
    if topic.brief is None:
        return True
    return topic.signal_count >= (topic.brief_signal_count or 0) * REBRIEF_GROWTH


def topics_to_brief(db: Session, *, limit: int = MAX_BRIEFS_PER_RUN) -> list[SignalTopic]:
    topics = db.execute(
        select(SignalTopic).order_by(SignalTopic.score.desc(), SignalTopic.engagement.desc())
    ).scalars().all()
    return [t for t in topics if needs_brief(t)][:limit]


def _text(value: Any, limit: int) -> str | None:
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


def parse_brief(row: dict[str, Any], posts: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Validate one GPT row against the topic's posts; None when it isn't usable.

    ``posts``: [{"title", "url", "platform"}, …] in the order they were numbered (1-based).
    """
    headline_en = _text(row.get("headline_en"), HEADLINE_MAX_CHARS)
    if not headline_en:
        return None
    facts = []
    for fact in row.get("facts") or []:
        if not isinstance(fact, dict):
            continue
        en = _text(fact.get("en"), FACT_MAX_CHARS)
        n = fact.get("post")
        # A fact must come from one of this topic's posts
        if not en or not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= len(posts):
            continue
        facts.append({"en": en, "zh": _text(fact.get("zh"), FACT_MAX_CHARS) or en, "source": posts[n - 1]})
        if len(facts) == MAX_FACTS:
            break
    if len(facts) < MIN_FACTS:
        return None
    questions = []
    for q in row.get("questions") or []:
        en = _text(q.get("en"), QUESTION_MAX_CHARS) if isinstance(q, dict) else None
        if en:
            questions.append({"en": en, "zh": _text(q.get("zh"), QUESTION_MAX_CHARS) or en})
        if len(questions) == MAX_QUESTIONS:
            break
    sources: list[dict[str, Any]] = []
    for fact in facts:
        if fact["source"] not in sources:
            sources.append(fact["source"])
    angle_en = _text(row.get("angle_en"), ANGLE_MAX_CHARS)
    return {
        "headlineEn": headline_en,
        "headlineZh": _text(row.get("headline_zh"), HEADLINE_MAX_CHARS) or headline_en,
        "angleEn": angle_en,
        "angleZh": _text(row.get("angle_zh"), ANGLE_MAX_CHARS) or angle_en,
        "questions": questions,
        "facts": facts,
        "sources": sources,
        "model": MODEL,
    }


def brief_batch(client: Any, items: list[dict[str, Any]]) -> tuple[list[dict[str, Any] | None], int, int]:
    """Brief topics in one request.

    ``items``: [{"summary", "question", "posts": [{"title", "url", "platform", "text"}, …]}].
    Returns (brief or None per item, prompt tokens, completion tokens).
    """
    payload = [
        {
            "id": i,
            "summary": item["summary"],
            "question": item["question"],
            "posts": [
                {"n": n, "platform": p["platform"], "title": p["title"], "text": p["text"]}
                for n, p in enumerate(item["posts"], start=1)
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
        max_tokens=6000,
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
        posts = [{"title": p["title"], "url": p["url"], "platform": p["platform"]} for p in items[idx]["posts"]]
        out[idx] = parse_brief(row, posts)
    return out, prompt_tokens, completion_tokens


def topic_posts(db: Session, topics: list[SignalTopic]) -> dict[Any, list[dict[str, Any]]]:
    """Each topic's most-engaged posts (distinct titles), with platform, url and the start of their text."""
    members: dict[Any, list[Signal]] = defaultdict(list)
    for s in db.execute(select(Signal).where(Signal.topic_id.in_([t.id for t in topics]))).scalars():
        members[s.topic_id].append(s)
    out: dict[Any, list[dict[str, Any]]] = {}
    for t in topics:
        posts: list[dict[str, Any]] = []
        for s in sorted(members[t.id], key=lambda s: (engagement_of(s), s.published_at), reverse=True):
            title = strip_hn_prefix(s.title)
            if any(p["title"] == title for p in posts):
                continue
            posts.append(
                {
                    "title": title,
                    "url": s.url,
                    "platform": source_family(s.source_kind),
                    "text": (s.text or "")[:POST_TEXT_CHARS],
                }
            )
            if len(posts) == POSTS_PER_TOPIC:
                break
        out[t.id] = posts
    return out


def run_briefs(db: Session, client: Any, *, now: datetime, batch_size: int = BATCH_SIZE) -> dict[str, Any]:
    topics = topics_to_brief(db)
    posts = topic_posts(db, topics) if topics else {}
    topics = [t for t in topics if posts.get(t.id)]

    briefed = failed = prompt_tokens = completion_tokens = 0
    for start in range(0, len(topics), batch_size):
        batch = topics[start : start + batch_size]
        items = [
            {"summary": t.summary_en or t.label, "question": t.question_en, "posts": posts[t.id]} for t in batch
        ]
        try:
            results, p, c = brief_batch(client, items)
        except Exception as exc:
            # Bad key, quota, outage: the next batch would fail the same way
            remaining = len(topics) - start
            logger.warning(
                "brief_signal_topics stopped (%s: %s); %d topics left for the next run",
                type(exc).__name__, str(exc)[:200], remaining,
            )
            failed += remaining
            break
        prompt_tokens += p
        completion_tokens += c
        for topic, brief in zip(batch, results):
            if brief is None:
                failed += 1
                continue
            topic.brief = {**brief, "writtenAt": now.isoformat()}
            topic.brief_signal_count = topic.signal_count
            briefed += 1
        db.commit()

    cost = (prompt_tokens * _PRICE_INPUT + completion_tokens * _PRICE_OUTPUT) / 1_000_000
    summary = {"pending": len(topics), "briefed": briefed, "failed": failed, "cost_usd": round(cost, 4)}
    logger.info("brief_signal_topics %s", summary)
    return summary
