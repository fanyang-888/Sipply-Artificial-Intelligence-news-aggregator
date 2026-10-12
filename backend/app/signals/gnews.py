"""Google News keyword search via its public RSS feed — free, no key.

Each request returns at most 100 items, ranked by relevance rather than date.
To sample every day at a similar density, the fetch window is split into
CHUNK_DAYS-day ranges (``after:``/``before:`` search operators), so the
first 14-day backfill isn't capped at 100 items per query while later runs
get 100 per 3 days. Volume still saturates for very big stories.
"""

from __future__ import annotations

import asyncio
import calendar
import hashlib
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

import feedparser
import httpx

from app.adapters.http_fetch import get_with_retry
from app.signals.base import SignalItem, SourceResult
from app.signals.config import GNewsConfig

logger = logging.getLogger(__name__)

GNEWS_SEARCH_URL = "https://news.google.com/rss/search"
CHUNK_DAYS = 3


def date_chunks(since: datetime, now: datetime, chunk_days: int = CHUNK_DAYS) -> list[tuple[date, date]]:
    """Consecutive (first, last) UTC date ranges covering ``since``..``now``."""
    first, today = since.astimezone(timezone.utc).date(), now.astimezone(timezone.utc).date()
    chunks = []
    while first <= today:
        last = min(first + timedelta(days=chunk_days - 1), today)
        chunks.append((first, last))
        first = last + timedelta(days=1)
    return chunks


def range_query(query: str, first: date, last: date) -> str:
    # One day of slack on each side, whatever Google's boundary semantics; dupes are dropped
    return f"{query} after:{first - timedelta(days=1):%Y-%m-%d} before:{last + timedelta(days=1):%Y-%m-%d}"


def parse_gnews_entry(entry: Any, query: str | None = None) -> SignalItem | None:
    link = (entry.get("link") or "").strip()
    title = (entry.get("title") or "").strip()
    published = entry.get("published_parsed")
    if not link or not title or not published:
        return None
    source = entry.get("source") or {}
    outlet = (source.get("title") or "").strip() or None
    # Google appends the publisher: "Headline - Outlet"
    if outlet and title.endswith(f" - {outlet}"):
        title = title[: -len(f" - {outlet}")].strip()
    guid = entry.get("id") or link
    return SignalItem(
        source_kind="gnews_item",
        # Google's guids are long opaque strings; a digest keeps the key short
        external_id=hashlib.sha1(guid.encode("utf-8")).hexdigest(),
        url=link,
        title=title,
        outlet=outlet,
        published_at=datetime.fromtimestamp(calendar.timegm(published), tz=timezone.utc),
        query=query,
        raw={"source_url": source.get("href")} if source.get("href") else None,
    )


async def fetch_gnews(
    client: httpx.AsyncClient,
    cfg: GNewsConfig,
    *,
    since: datetime,
    now: datetime,
    pause_sec: float = 0.5,
) -> SourceResult:
    """News items published after ``since`` for each configured query."""
    if not cfg.enabled:
        return SourceResult(family="news", status="skipped", note="disabled in signal_sources.yaml")

    items: dict[str, SignalItem] = {}
    requests = errors = 0

    for query in cfg.queries:
        for first, last in date_chunks(since, now):
            params = {"q": range_query(query, first, last), "hl": cfg.hl, "gl": cfg.gl, "ceid": cfg.ceid}
            requests += 1
            try:
                resp = await get_with_retry(client, str(httpx.URL(GNEWS_SEARCH_URL, params=params)))
            except httpx.HTTPError as exc:
                errors += 1
                logger.warning("signals gnews query=%r %s..%s failed: %s", query, first, last, exc)
                continue
            feed = feedparser.parse(resp.content)
            for entry in feed.entries:
                item = parse_gnews_entry(entry, query)
                if item is not None and item.published_at >= since and item.external_id not in items:
                    items[item.external_id] = item
            if pause_sec:
                await asyncio.sleep(pause_sec)

    if errors and not items:
        status = "failed"
    elif errors:
        status = "partial"
    else:
        status = "ok"
    return SourceResult(
        family="news",
        status=status,
        items=list(items.values()),
        requests=requests,
        note=f"{errors} request(s) failed" if errors else None,
    )
