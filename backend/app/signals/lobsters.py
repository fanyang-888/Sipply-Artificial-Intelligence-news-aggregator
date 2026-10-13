"""Lobsters — a small, invite-only tech community; HN-like stories with score and comments.

Public JSON, no key: ``https://lobste.rs/t/<tag>.json`` (newest first, 25 per
page; ``/t/<tag>/page/<n>.json`` for older ones).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

import httpx

from app.adapters.http_fetch import get_with_retry
from app.signals.base import SignalItem, SourceResult, parse_iso, plain_text, to_int
from app.signals.config import LobstersConfig

logger = logging.getLogger(__name__)

LOBSTERS_TAG_URL = "https://lobste.rs/t/{tag}.json"
LOBSTERS_TAG_PAGE_URL = "https://lobste.rs/t/{tag}/page/{page}.json"


def parse_lobsters_story(story: dict[str, Any], query: str | None = None) -> SignalItem | None:
    short_id = story.get("short_id")
    title = (story.get("title") or "").strip()
    created = parse_iso(story.get("created_at"))
    comments_url = story.get("comments_url")
    if not short_id or not title or created is None or not comments_url:
        return None
    submitter = story.get("submitter_user")
    if isinstance(submitter, dict):  # older API versions nest the user
        submitter = submitter.get("username")
    return SignalItem(
        source_kind="lobsters_story",
        external_id=str(short_id),
        url=story.get("url") or comments_url,
        discussion_url=comments_url,
        title=title,
        text=plain_text(story.get("description_plain") or story.get("description"), limit=1000),
        author=submitter if isinstance(submitter, str) else None,
        published_at=created,
        query=query,
        points=to_int(story.get("score")),
        num_comments=to_int(story.get("comment_count")),
        raw={"tags": story.get("tags") or []},
    )


async def fetch_lobsters(
    client: httpx.AsyncClient,
    cfg: LobstersConfig,
    *,
    since: datetime,
    pause_sec: float = 1.0,
) -> SourceResult:
    if not cfg.enabled:
        return SourceResult(family="lobsters", status="skipped", note="disabled in signal_sources.yaml")

    items: dict[str, SignalItem] = {}
    requests = errors = 0
    for tag in cfg.tags:
        for page in range(1, cfg.max_pages + 1):
            url = LOBSTERS_TAG_URL.format(tag=tag) if page == 1 else LOBSTERS_TAG_PAGE_URL.format(tag=tag, page=page)
            requests += 1
            try:
                stories = (await get_with_retry(client, url)).json()
            except (httpx.HTTPError, ValueError) as exc:
                errors += 1
                logger.warning("signals lobsters tag=%r page=%d failed: %s", tag, page, exc)
                break
            reached_window_start = False
            for story in stories if isinstance(stories, list) else []:
                item = parse_lobsters_story(story, tag)
                if item is None:
                    continue
                if item.published_at < since:
                    reached_window_start = True
                    continue
                if (item.points or 0) >= cfg.min_score and item.external_id not in items:
                    items[item.external_id] = item
            if pause_sec:
                await asyncio.sleep(pause_sec)
            if reached_window_start or not stories:
                break

    status = "failed" if errors and not items else "partial" if errors else "ok"
    return SourceResult(
        family="lobsters", status=status, items=list(items.values()), requests=requests,
        note=f"{errors} request(s) failed" if errors else None,
    )
