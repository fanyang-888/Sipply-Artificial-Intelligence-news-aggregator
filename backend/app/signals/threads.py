"""Threads posts by keyword (Meta's official keyword_search endpoint).

Skipped until THREADS_ACCESS_TOKEN is set. Public posts are only searchable
once the app's ``threads_keyword_search`` permission is approved by Meta;
before that the endpoint only returns the token owner's own posts. Limits:
2,200 queries per rolling 24h per user; long-lived tokens expire after 60
days. Results carry no like/reply counts, so Threads adds volume and text,
not engagement. https://developers.facebook.com/documentation/threads/keyword-search

The token goes in an ``Authorization: Bearer`` header (as community clients
do) rather than the URL, so it never shows up in logged URLs.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

import httpx

from app.adapters.http_fetch import get_with_retry
from app.signals.base import SignalItem, SourceResult, parse_iso, plain_text
from app.signals.config import ThreadsConfig

logger = logging.getLogger(__name__)

THREADS_SEARCH_URL = "https://graph.threads.net/v1.0/keyword_search"
_FIELDS = "id,text,media_type,permalink,timestamp,username,has_replies,is_quote_post,is_reply"


def parse_threads_post(post: dict[str, Any], query: str | None = None) -> SignalItem | None:
    post_id = post.get("id")
    text = plain_text(post.get("text"), limit=300)
    url = post.get("permalink")
    created = parse_iso(post.get("timestamp"))
    if not post_id or not text or not url or created is None:
        return None
    return SignalItem(
        source_kind="threads_post",
        external_id=str(post_id),
        url=url,
        discussion_url=url,
        title=text,
        text=text,
        author=post.get("username"),
        outlet=f"@{post['username']}" if post.get("username") else None,
        published_at=created,
        query=query,
        raw={"is_reply": post.get("is_reply"), "has_replies": post.get("has_replies")},
    )


async def fetch_threads(
    client: httpx.AsyncClient,
    cfg: ThreadsConfig,
    *,
    since: datetime,
    access_token: str | None,
    pause_sec: float = 0.5,
) -> SourceResult:
    if not cfg.enabled:
        return SourceResult(family="threads", status="skipped", note="disabled in signal_sources.yaml")
    if not access_token:
        return SourceResult(family="threads", status="skipped", note="THREADS_ACCESS_TOKEN not set")

    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    items: dict[str, SignalItem] = {}
    requests = 0
    stopped: str | None = None
    for query in cfg.queries:
        params = {
            "q": query,
            "search_type": "TOP",
            "fields": _FIELDS,
            "limit": cfg.limit,
            "since": int(since.timestamp()),
        }
        requests += 1
        try:
            resp = await get_with_retry(client, str(httpx.URL(THREADS_SEARCH_URL, params=params)), headers=headers)
            posts = resp.json().get("data") or []
        except httpx.HTTPStatusError as exc:
            # Expired token, missing permission, quota: every other query would fail too
            stopped = f"Threads API {exc.response.status_code}; stopped for this run"
            logger.warning("signals threads query=%r: %s", query, stopped)
            break
        except (httpx.HTTPError, ValueError) as exc:
            stopped = f"Threads request failed ({type(exc).__name__}); stopped for this run"
            logger.warning("signals threads query=%r: %s", query, stopped)
            break
        for post in posts:
            item = parse_threads_post(post, query)
            if item is not None and item.published_at >= since and item.external_id not in items:
                items[item.external_id] = item
        if pause_sec:
            await asyncio.sleep(pause_sec)

    status = "failed" if stopped and not items else "partial" if stopped else "ok"
    return SourceResult(family="threads", status=status, items=list(items.values()), requests=requests, note=stopped)
