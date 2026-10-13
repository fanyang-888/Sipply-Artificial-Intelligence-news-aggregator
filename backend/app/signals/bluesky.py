"""Bluesky posts by keyword, with likes / reposts / replies.

Search needs a logged-in session (unauthenticated search answers 403), so the
source is skipped until BLUESKY_HANDLE and BLUESKY_APP_PASSWORD are set. Use an
app password (bsky.app → Settings → Privacy and security → App passwords),
never the account password. Endpoints (atproto lexicons):
``com.atproto.server.createSession`` then ``app.bsky.feed.searchPosts``
(sort=top, since=window start, limit ≤ 100).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.adapters.http_fetch import get_with_retry
from app.signals.base import SignalItem, SourceResult, parse_iso, plain_text, to_int
from app.signals.config import BlueskyConfig

logger = logging.getLogger(__name__)

BSKY_ENTRYWAY = "https://bsky.social"


def post_url(uri: str, handle: str) -> str | None:
    """at://did:plc:x/app.bsky.feed.post/<rkey> → https://bsky.app/profile/<handle>/post/<rkey>"""
    parts = uri.split("/")
    if len(parts) < 5 or parts[-2] != "app.bsky.feed.post":
        return None
    return f"https://bsky.app/profile/{handle}/post/{parts[-1]}"


def parse_bsky_post(post: dict[str, Any], query: str | None = None) -> SignalItem | None:
    uri = post.get("uri")
    author = post.get("author") or {}
    record = post.get("record") or {}
    handle = author.get("handle")
    text = plain_text(record.get("text"), limit=300)
    created = parse_iso(record.get("createdAt")) or parse_iso(post.get("indexedAt"))
    url = post_url(uri, handle) if isinstance(uri, str) and handle else None
    if not url or not text or created is None:
        return None
    return SignalItem(
        source_kind="bsky_post",
        external_id=uri,
        url=url,
        discussion_url=url,
        title=text,
        text=text,
        author=handle,
        outlet=f"@{handle}",
        published_at=created,
        query=query,
        points=(to_int(post.get("repostCount")) or 0) + (to_int(post.get("quoteCount")) or 0),
        num_comments=to_int(post.get("replyCount")),
        like_count=to_int(post.get("likeCount")),
    )


async def _session(client: httpx.AsyncClient, handle: str, app_password: str) -> tuple[str, str]:
    """(access JWT, the account's PDS base URL)."""
    resp = await client.post(
        f"{BSKY_ENTRYWAY}/xrpc/com.atproto.server.createSession",
        json={"identifier": handle, "password": app_password},
    )
    resp.raise_for_status()
    data = resp.json()
    pds = BSKY_ENTRYWAY
    for svc in ((data.get("didDoc") or {}).get("service") or []):
        if svc.get("type") == "AtprotoPersonalDataServer" and svc.get("serviceEndpoint"):
            pds = svc["serviceEndpoint"].rstrip("/")
    return data["accessJwt"], pds


async def fetch_bluesky(
    client: httpx.AsyncClient,
    cfg: BlueskyConfig,
    *,
    since: datetime,
    handle: str | None,
    app_password: str | None,
    pause_sec: float = 0.5,
) -> SourceResult:
    if not cfg.enabled:
        return SourceResult(family="bluesky", status="skipped", note="disabled in signal_sources.yaml")
    if not handle or not app_password:
        return SourceResult(family="bluesky", status="skipped", note="BLUESKY_HANDLE / BLUESKY_APP_PASSWORD not set")

    try:
        token, pds = await _session(client, handle, app_password)
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else type(exc).__name__
        logger.warning("signals bluesky login failed (%s)", status)
        return SourceResult(family="bluesky", status="failed", requests=1, note=f"login failed ({status})")

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    since_iso = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    items: dict[str, SignalItem] = {}
    requests, errors = 1, 0
    for query in cfg.queries:
        params: dict[str, Any] = {"q": query, "sort": "top", "since": since_iso, "limit": cfg.limit}
        if cfg.lang:
            params["lang"] = cfg.lang
        requests += 1
        try:
            resp = await get_with_retry(
                client, str(httpx.URL(f"{pds}/xrpc/app.bsky.feed.searchPosts", params=params)), headers=headers
            )
            posts = resp.json().get("posts") or []
        except (httpx.HTTPError, ValueError) as exc:
            errors += 1
            logger.warning("signals bluesky query=%r failed: %s", query, exc)
            continue
        for post in posts:
            item = parse_bsky_post(post, query)
            if (
                item is not None
                and item.published_at >= since
                and (item.like_count or 0) >= cfg.min_likes
                and item.external_id not in items
            ):
                items[item.external_id] = item
        if pause_sec:
            await asyncio.sleep(pause_sec)

    status = "failed" if errors and not items else "partial" if errors else "ok"
    return SourceResult(
        family="bluesky", status=status, items=list(items.values()), requests=requests,
        note=f"{errors} request(s) failed" if errors else None,
    )
