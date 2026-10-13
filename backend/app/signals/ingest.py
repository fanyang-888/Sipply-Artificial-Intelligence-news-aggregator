"""Fetch every enabled signal source and upsert the results."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.signals.base import SignalCredentials, SourceResult
from app.signals.bluesky import fetch_bluesky
from app.signals.config import RadarConfig
from app.signals.devto import fetch_devto
from app.signals.github import fetch_github
from app.signals.gnews import fetch_gnews
from app.signals.hn import fetch_hn
from app.signals.lobsters import fetch_lobsters
from app.signals.store import last_fetched_at, upsert_signals
from app.signals.threads import fetch_threads
from app.signals.youtube import fetch_youtube

logger = logging.getLogger(__name__)


def signals_http_client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(20.0, connect=10.0),
        headers={
            "User-Agent": settings.source_fetch_user_agent,
            "Accept": "application/json, application/rss+xml;q=0.9, */*;q=0.5",
        },
        follow_redirects=True,
        transport=transport,
    )


def fetch_since(db: Session, family: str, cfg: RadarConfig, now: datetime) -> datetime:
    """Backfill the whole window on the first run; afterwards only the recent overlap."""
    window_start = now - timedelta(days=cfg.window_days)
    last = last_fetched_at(db, family)
    if last is None:
        return window_start
    return max(window_start, last - timedelta(days=cfg.refresh_overlap_days))


async def run_ingest(
    db: Session,
    client: httpx.AsyncClient,
    cfg: RadarConfig,
    *,
    now: datetime,
    credentials: SignalCredentials,
    pause_sec: float | None = None,
) -> dict[str, dict[str, Any]]:
    """Fetch every signal source, upsert into ``signals``; per-source summary.

    ``pause_sec`` overrides each source's polite delay between requests (tests pass 0).
    """
    p = {} if pause_sec is None else {"pause_sec": pause_sec}
    # Sources whose stars/likes keep moving re-read the whole window every run
    window_start = now - timedelta(days=cfg.window_days)
    results: list[SourceResult] = [
        await fetch_hn(client, cfg.hn, since=fetch_since(db, "hn", cfg, now), **p),
        await fetch_gnews(client, cfg.gnews, since=fetch_since(db, "news", cfg, now), now=now, **p),
        await fetch_youtube(
            client, cfg.youtube, since=fetch_since(db, "youtube", cfg, now), api_key=credentials.youtube_api_key
        ),
        await fetch_github(client, cfg.github, since=window_start, **p),
        await fetch_devto(client, cfg.devto, since=window_start, now=now, **p),
        await fetch_lobsters(client, cfg.lobsters, since=window_start, **p),
        await fetch_bluesky(
            client,
            cfg.bluesky,
            since=window_start,
            handle=credentials.bluesky_handle,
            app_password=credentials.bluesky_app_password,
            **p,
        ),
        await fetch_threads(
            client, cfg.threads, since=window_start, access_token=credentials.threads_access_token, **p
        ),
    ]
    summary: dict[str, dict[str, Any]] = {}
    for r in results:
        written = upsert_signals(db, r.items, now=now)
        summary[r.family] = {
            "status": r.status,
            "items": len(r.items),
            "written": written,
            "requests": r.requests,
            "note": r.note,
        }
        logger.info(
            "signals source=%s status=%s items=%d written=%d requests=%d note=%s",
            r.family, r.status, len(r.items), written, r.requests, r.note,
        )
    db.commit()
    return summary
