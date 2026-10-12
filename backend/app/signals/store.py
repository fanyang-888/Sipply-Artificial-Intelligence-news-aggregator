"""Persist signals: upsert by (source_kind, external_id), refreshing live metrics."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.signal import Signal
from app.signals.base import SignalItem, kinds_for_family

# Columns refreshed when a signal is seen again (points and comments keep moving)
_REFRESHED = (
    "title",
    "url",
    "text",
    "outlet",
    "points",
    "num_comments",
    "view_count",
    "like_count",
    "is_question",
    "raw",
)


def upsert_signals(db: Session, items: list[SignalItem], *, now: datetime | None = None) -> int:
    """Insert new signals and refresh metrics on known ones. Returns rows written."""
    if not items:
        return 0
    fetched_at = now or datetime.now(timezone.utc)
    rows = {}
    for it in items:
        # One row per key, or Postgres rejects the batch ("cannot affect row a second time")
        rows[(it.source_kind, it.external_id)] = {
            "source_kind": it.source_kind,
            "external_id": it.external_id,
            "url": it.url,
            "discussion_url": it.discussion_url,
            "title": it.title,
            "text": it.text,
            "author": it.author,
            "outlet": it.outlet,
            "published_at": it.published_at,
            "query": it.query,
            "is_question": it.is_question,
            "points": it.points,
            "num_comments": it.num_comments,
            "view_count": it.view_count,
            "like_count": it.like_count,
            "raw": it.raw,
            "fetched_at": fetched_at,
        }
    values = list(rows.values())
    for start in range(0, len(values), 500):
        stmt = insert(Signal).values(values[start : start + 500])
        stmt = stmt.on_conflict_do_update(
            constraint="uq_signals_source_kind_external_id",
            set_={
                **{col: stmt.excluded[col] for col in (*_REFRESHED, "fetched_at")},
                # A changed title needs a fresh translation
                "title_zh": case(
                    (Signal.title == stmt.excluded.title, Signal.title_zh), else_=None
                ),
            },
        )
        db.execute(stmt)
    # Every row is either inserted or updated (rowcount is unreliable for multi-VALUES)
    return len(values)


def last_fetched_at(db: Session, family: str) -> datetime | None:
    """Most recent fetch time for a source family, or None before its first run."""
    return db.execute(
        select(func.max(Signal.fetched_at)).where(Signal.source_kind.in_(kinds_for_family(family)))
    ).scalar_one_or_none()
