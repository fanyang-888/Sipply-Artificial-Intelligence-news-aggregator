"""Hacker News stories and Ask HN threads via the Algolia search API.

https://hn.algolia.com/api — free, no key. Typo tolerance is switched off:
with it on, a query like "LLM" also matches unrelated words.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.adapters.http_fetch import get_with_retry
from app.signals.base import SignalItem, SourceResult, plain_text, to_int
from app.signals.config import HNConfig

logger = logging.getLogger(__name__)

HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date"
HN_ITEM_URL = "https://news.ycombinator.com/item?id={}"


def parse_hn_hit(hit: dict[str, Any], query: str | None = None) -> SignalItem | None:
    object_id = str(hit.get("objectID") or "").strip()
    title = (hit.get("title") or "").strip()
    created = hit.get("created_at_i")
    if not object_id or not title or created is None:
        return None
    tags = hit.get("_tags") or []
    # Algolia tags every text post ask_hn (Ask HN, Tell HN, essays); is_question decides questions
    discussion_url = HN_ITEM_URL.format(object_id)
    return SignalItem(
        source_kind="hn_ask" if "ask_hn" in tags else "hn_story",
        external_id=object_id,
        url=hit.get("url") or discussion_url,
        discussion_url=discussion_url,
        title=title,
        text=plain_text(hit.get("story_text")),
        author=hit.get("author"),
        published_at=datetime.fromtimestamp(int(created), tz=timezone.utc),
        query=query,
        points=to_int(hit.get("points")),
        num_comments=to_int(hit.get("num_comments")),
        raw={"tags": tags},
    )


async def fetch_hn(
    client: httpx.AsyncClient,
    cfg: HNConfig,
    *,
    since: datetime,
    pause_sec: float = 0.25,
) -> SourceResult:
    """Stories + Ask HN threads created after ``since`` that match any configured query."""
    if not cfg.enabled:
        return SourceResult(family="hn", status="skipped", note="disabled in signal_sources.yaml")

    items: dict[str, SignalItem] = {}
    requests = errors = 0
    since_i = int(since.timestamp())

    for query in cfg.queries:
        for tag, min_points in (("story", cfg.min_points), ("ask_hn", cfg.ask_min_points)):
            for page in range(cfg.max_pages):
                params = {
                    "query": query,
                    "tags": tag,
                    "numericFilters": f"created_at_i>{since_i},points>={min_points}",
                    "hitsPerPage": cfg.hits_per_page,
                    "page": page,
                    "typoTolerance": "false",
                }
                requests += 1
                try:
                    resp = await get_with_retry(client, str(httpx.URL(HN_SEARCH_URL, params=params)))
                    data = resp.json()
                except (httpx.HTTPError, ValueError) as exc:
                    errors += 1
                    logger.warning("signals hn query=%r tag=%s failed: %s", query, tag, exc)
                    break
                for hit in data.get("hits") or []:
                    item = parse_hn_hit(hit, query)
                    if item is not None and item.external_id not in items:
                        items[item.external_id] = item
                if pause_sec:
                    await asyncio.sleep(pause_sec)
                if page + 1 >= int(data.get("nbPages") or 0):
                    break

    if errors and not items:
        status = "failed"
    elif errors:
        status = "partial"
    else:
        status = "ok"
    return SourceResult(
        family="hn",
        status=status,
        items=list(items.values()),
        requests=requests,
        note=f"{errors} request(s) failed" if errors else None,
    )
