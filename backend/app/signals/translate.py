"""Translate Trend Radar titles to Simplified Chinese for the site's 中文 mode.

Only titles the radar can show are translated — topic members and
question-shaped posts in the window — and each title only once (stored in
``signals.title_zh``; a changed title is reset by the upsert). Titles go to
gpt-4o-mini in batches of BATCH_SIZE as one JSON request, capped at
MAX_PER_RUN per run. First backfill ≈ 1,000 short titles ≈ $0.02; a normal
run afterwards translates a few dozen new ones.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.signal import Signal

logger = logging.getLogger(__name__)

MODEL = "gpt-4o-mini"
BATCH_SIZE = 40
MAX_PER_RUN = 1200
# USD per 1M tokens (same table as app/services/summarization.py)
_PRICE_INPUT = 0.15
_PRICE_OUTPUT = 0.60

_SYSTEM = """You translate short English headlines and forum post titles about AI into Simplified Chinese (简体中文).
Keep names of products, models, companies and people in English (Claude, GPT-6, OpenAI, Hugging Face, Sam Altman).
Keep the prefixes "Ask HN:", "Show HN:" and "Tell HN:" as they are.
Be faithful and concise. Do not add commentary.

Input is a JSON list of {"id": ..., "en": ...}.
Return JSON: {"translations": [{"id": ..., "zh": ...}, ...]} with one entry for every input id."""


def pending_signals(db: Session, *, now: datetime, window_days: int, limit: int) -> list[Signal]:
    """Untranslated signals the radar can show, most-engaged first."""
    engagement = (
        func.coalesce(Signal.points, 0) + func.coalesce(Signal.num_comments, 0) + func.coalesce(Signal.like_count, 0)
    )
    return list(
        db.execute(
            select(Signal)
            .where(
                Signal.title_zh.is_(None),
                Signal.published_at >= now - timedelta(days=window_days),
                or_(Signal.topic_id.is_not(None), Signal.is_question.is_(True)),
            )
            .order_by(engagement.desc(), Signal.published_at.desc())
            .limit(limit)
        ).scalars().all()
    )


def translate_batch(client: Any, titles: list[str]) -> tuple[list[str | None], int, int]:
    """Translate titles in one request. Returns (zh per input or None, prompt tokens, completion tokens)."""
    payload = json.dumps([{"id": i, "en": t} for i, t in enumerate(titles)], ensure_ascii=False)
    response = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": _SYSTEM}, {"role": "user", "content": payload}],
        temperature=0.2,
        max_tokens=4000,
    )
    usage = getattr(response, "usage", None)
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0

    out: list[str | None] = [None] * len(titles)
    try:
        rows = json.loads(response.choices[0].message.content or "{}").get("translations") or []
    except (ValueError, AttributeError):
        rows = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        idx, zh = row.get("id"), row.get("zh")
        if isinstance(idx, int) and 0 <= idx < len(titles) and isinstance(zh, str) and zh.strip():
            out[idx] = zh.strip()
    return out, prompt_tokens, completion_tokens


def run_translate(
    db: Session,
    client: Any,
    *,
    now: datetime,
    window_days: int,
    limit: int = MAX_PER_RUN,
    batch_size: int = BATCH_SIZE,
) -> dict[str, Any]:
    signals = pending_signals(db, now=now, window_days=window_days, limit=limit)
    translated = failed = prompt_tokens = completion_tokens = 0
    for start in range(0, len(signals), batch_size):
        batch = signals[start : start + batch_size]
        try:
            zh, p, c = translate_batch(client, [s.title for s in batch])
        except Exception as exc:
            # Bad key, quota, outage: the next batch would fail the same way
            remaining = len(signals) - start
            logger.warning(
                "translate_signals stopped (%s: %s); %d titles left for the next run",
                type(exc).__name__, str(exc)[:200], remaining,
            )
            failed += remaining
            break
        prompt_tokens += p
        completion_tokens += c
        for sig, text in zip(batch, zh):
            if text:
                sig.title_zh = text
                translated += 1
            else:
                failed += 1
        db.commit()
    cost = (prompt_tokens * _PRICE_INPUT + completion_tokens * _PRICE_OUTPUT) / 1_000_000
    summary = {
        "pending": len(signals),
        "translated": translated,
        "failed": failed,
        "cost_usd": round(cost, 4),
    }
    logger.info("translate_signals %s", summary)
    return summary
