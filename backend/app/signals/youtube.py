"""YouTube videos via the YouTube Data API v3.

Free within the daily quota of 10,000 units (search.list costs 100,
videos.list costs 1). Without YOUTUBE_API_KEY the source is skipped. Each run
stops before it would spend more than ``max_units_per_run``, and any API error
(quota exhausted, bad key) stops the source for the run instead of retrying.

The key travels in the X-Goog-Api-Key header so it never appears in a logged URL.
"""

from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.adapters.http_fetch import get_with_retry
from app.signals.base import SignalItem, SourceResult, plain_text, to_int
from app.signals.config import YouTubeConfig

logger = logging.getLogger(__name__)

YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
SEARCH_COST = 100
VIDEOS_COST = 1


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def parse_youtube_video(video: dict[str, Any], query: str | None = None) -> SignalItem | None:
    video_id = video.get("id")
    snippet = video.get("snippet") or {}
    stats = video.get("statistics") or {}
    title = html.unescape((snippet.get("title") or "").strip())
    published_at = _parse_iso(snippet.get("publishedAt"))
    if not isinstance(video_id, str) or not title or published_at is None:
        return None
    return SignalItem(
        source_kind="yt_video",
        external_id=video_id,
        url=f"https://www.youtube.com/watch?v={video_id}",
        title=title,
        text=plain_text(snippet.get("description")),
        author=snippet.get("channelTitle"),
        outlet=snippet.get("channelTitle"),
        published_at=published_at,
        query=query,
        view_count=to_int(stats.get("viewCount")),
        like_count=to_int(stats.get("likeCount")),
        num_comments=to_int(stats.get("commentCount")),
    )


def _error_reason(response: httpx.Response) -> str:
    try:
        errors = response.json()["error"]["errors"]
        return str(errors[0].get("reason") or "unknown")
    except (ValueError, KeyError, IndexError, TypeError):
        return "unknown"


async def fetch_youtube(
    client: httpx.AsyncClient,
    cfg: YouTubeConfig,
    *,
    since: datetime,
    api_key: str | None,
) -> SourceResult:
    if not cfg.enabled:
        return SourceResult(family="youtube", status="skipped", note="disabled in signal_sources.yaml")
    if not api_key:
        return SourceResult(family="youtube", status="skipped", note="YOUTUBE_API_KEY not set")

    headers = {"X-Goog-Api-Key": api_key, "Accept": "application/json"}
    published_after = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    items: dict[str, SignalItem] = {}
    units = requests = 0
    stopped: str | None = None

    for query in cfg.queries:
        if units + SEARCH_COST + VIDEOS_COST > cfg.max_units_per_run:
            stopped = f"per-run quota cap reached ({units}/{cfg.max_units_per_run} units)"
            break
        search_params = {
            "part": "snippet",
            "q": query,
            "type": "video",
            "order": "relevance",
            "publishedAfter": published_after,
            "maxResults": cfg.max_results,
            "relevanceLanguage": "en",
        }
        try:
            requests += 1
            units += SEARCH_COST
            resp = await get_with_retry(
                client, str(httpx.URL(YT_SEARCH_URL, params=search_params)), headers=headers
            )
            ids = [
                it["id"]["videoId"]
                for it in resp.json().get("items") or []
                if isinstance(it.get("id"), dict) and it["id"].get("videoId")
            ]
            if not ids:
                continue
            requests += 1
            units += VIDEOS_COST
            resp = await get_with_retry(
                client,
                str(httpx.URL(YT_VIDEOS_URL, params={"part": "snippet,statistics", "id": ",".join(ids)})),
                headers=headers,
            )
            videos = resp.json().get("items") or []
        except httpx.HTTPStatusError as exc:
            reason = _error_reason(exc.response)
            stopped = f"YouTube API {exc.response.status_code} {reason}; stopped for this run"
            logger.warning("signals youtube query=%r: %s", query, stopped)
            break
        except (httpx.HTTPError, ValueError) as exc:
            stopped = f"YouTube request failed ({type(exc).__name__}); stopped for this run"
            logger.warning("signals youtube query=%r: %s", query, stopped)
            break
        for video in videos:
            item = parse_youtube_video(video, query)
            if item is not None and item.external_id not in items:
                items[item.external_id] = item

    failed = stopped is not None and not stopped.startswith("per-run")
    if failed and not items:
        status = "failed"
    elif failed:
        status = "partial"
    else:
        status = "ok"
    logger.info("signals youtube units_used=%d videos=%d", units, len(items))
    return SourceResult(
        family="youtube",
        status=status,
        items=list(items.values()),
        requests=requests,
        note=stopped,
    )
