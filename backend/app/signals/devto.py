"""DEV (dev.to) — developer blog posts by tag, with reactions and comments.

Public API, no key (https://developers.forem.com/api/v1#tag/articles):
``/api/articles?tag=ai&top=N`` is the tag's most-reacted posts of the last N days.
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime
from typing import Any

import httpx

from app.adapters.http_fetch import get_with_retry
from app.signals.base import SignalItem, SourceResult, parse_iso, plain_text, to_int
from app.signals.config import DevtoConfig

logger = logging.getLogger(__name__)

DEVTO_ARTICLES_URL = "https://dev.to/api/articles"


def parse_devto_post(post: dict[str, Any], query: str | None = None) -> SignalItem | None:
    title = (post.get("title") or "").strip()
    url = post.get("url")
    published = parse_iso(post.get("published_at"))
    if not title or not url or published is None or post.get("id") is None:
        return None
    username = (post.get("user") or {}).get("username")
    return SignalItem(
        source_kind="devto_post",
        external_id=str(post["id"]),
        url=url,
        title=title,
        text=plain_text(post.get("description"), limit=500),
        author=username,
        outlet=f"@{username}" if username else None,
        published_at=published,
        query=query,
        points=to_int(post.get("public_reactions_count")),
        num_comments=to_int(post.get("comments_count")),
        raw={"tags": (post.get("tag_list") or [])[:8]},
    )


async def fetch_devto(
    client: httpx.AsyncClient,
    cfg: DevtoConfig,
    *,
    since: datetime,
    now: datetime,
    pause_sec: float = 0.5,
) -> SourceResult:
    if not cfg.enabled:
        return SourceResult(family="devto", status="skipped", note="disabled in signal_sources.yaml")

    days = max(1, math.ceil((now - since).total_seconds() / 86400))
    items: dict[str, SignalItem] = {}
    requests = errors = 0
    for tag in cfg.tags:
        params = {"tag": tag, "top": days, "per_page": cfg.per_page}
        requests += 1
        try:
            resp = await get_with_retry(client, str(httpx.URL(DEVTO_ARTICLES_URL, params=params)))
            posts = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            errors += 1
            logger.warning("signals devto tag=%r failed: %s", tag, exc)
            continue
        for post in posts if isinstance(posts, list) else []:
            item = parse_devto_post(post, tag)
            if (
                item is not None
                and item.published_at >= since
                and (item.points or 0) >= cfg.min_reactions
                and item.external_id not in items
            ):
                items[item.external_id] = item
        if pause_sec:
            await asyncio.sleep(pause_sec)

    status = "failed" if errors and not items else "partial" if errors else "ok"
    return SourceResult(
        family="devto", status=status, items=list(items.values()), requests=requests,
        note=f"{errors} request(s) failed" if errors else None,
    )
