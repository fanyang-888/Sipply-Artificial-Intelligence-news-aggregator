"""POST /api/events — client-side event tracking.

Tracked event types:
  cluster_viewed          — user opened a cluster page

Two sinks (both best-effort; failures are swallowed so the client never errors):
  1. Postgres `events` table — durable, per-device rows for behaviour/retention/NSM.
  2. Redis counters — fast aggregates for the admin dashboard:
       events:{type}              HASH    entity_id → count  (permanent)
       events:daily:{date}:{type} STRING  counter            (90-day TTL)
"""

from __future__ import annotations

import logging
import re
from datetime import date

from fastapi import APIRouter, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["events"])

_ALLOWED_TYPES = frozenset({"cluster_viewed"})

_DAILY_TTL = 90 * 86_400  # 90 days in seconds

# Crawlers that run the page's JavaScript (Googlebot renders it), our own test browsers
# (the CI stability check sends "sipply-stability", headless Chrome says so) and tools.
# In the week of 2026-10-19 they made 8,039 "views" against 85 the week before.
_AUTOMATED = re.compile(
    r"bot\b|bot/|crawl|spider|slurp|headless|lighthouse|playwright|puppeteer|sipply-"
    r"|python-|curl/|wget/|httpx|node-fetch|axios/|facebookexternalhit|preview",
    re.IGNORECASE,
)


def is_automated(user_agent: str | None) -> bool:
    """A crawler, a test browser or a script rather than a reader (no user agent counts as one)."""
    return not user_agent or bool(_AUTOMATED.search(user_agent))


class EventPayload(BaseModel):
    type: str
    entity_id: str
    device_id: str | None = None
    role: str | None = None


# Sync def so FastAPI runs it in a threadpool — the Redis + DB calls are blocking.
@router.post("/events", status_code=204)
def record_event(payload: EventPayload, request: Request) -> None:
    """Record a single client-side event. Always returns 204; errors are silent."""
    if payload.type not in _ALLOWED_TYPES:
        return  # silently drop unknown types
    if is_automated(request.headers.get("user-agent")):
        return  # not a reader: keep the metrics about people

    entity_id = payload.entity_id[:128]
    device_id = (payload.device_id or None) and payload.device_id[:64]
    role = (payload.role or None) and payload.role[:32]

    # 1) Durable, per-device row — enables retention / NSM / personalization.
    try:
        from app.db import session_scope
        from app.models.event import Event

        with session_scope() as db:
            db.add(Event(
                device_id=device_id,
                type=payload.type,
                entity_id=entity_id,
                role=role,
            ))
    except Exception as exc:
        logger.debug("events: db error %s", exc)

    # 2) Redis fast counters for the admin dashboard.
    try:
        from app.cache import _get_client
        client = _get_client()
        if client is None:
            return

        today = date.today().isoformat()
        # Per-entity lifetime counter
        client.hincrby(f"events:{payload.type}", entity_id, 1)
        # Daily aggregate counter
        daily_key = f"events:daily:{today}:{payload.type}"
        client.incr(daily_key)
        client.expire(daily_key, _DAILY_TTL)
    except Exception as exc:
        logger.debug("events: redis error %s", exc)
