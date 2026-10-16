"""Tell search engines which pages are new or changed (IndexNow, https://www.indexnow.org).

One POST to api.indexnow.org reaches Bing, Yandex, Seznam, Naver and Yep;
Bing's index is what ChatGPT search and Copilot read. The key is public by
design: search engines check it against https://www.sipply.dev/{key}.txt
(frontend public/), which proves we own the host.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.cluster import Cluster
from app.services.entities import entities_in

logger = logging.getLogger(__name__)

ENDPOINT = "https://api.indexnow.org/indexnow"
SITE_URL = os.getenv("SITE_URL", "https://www.sipply.dev").rstrip("/")
# Must match the file name and content of frontend public/{key}.txt
KEY = os.getenv("INDEXNOW_KEY", "aa8db26b0873dac1032938789ff80a3a")
MAX_URLS = 10_000  # per request, the protocol's limit
TIMEOUT_SEC = 20.0
# Pages that change with every run, submitted each time
HUB_PATHS: tuple[str, ...] = ("/", "/radar", "/archive", "/topics", "/weekly")


def _week_key(when: datetime) -> str:
    year, week, _ = when.date().isocalendar()
    return f"{year}-W{week:02d}"


def changed_urls(db: Session, *, since: datetime, now: datetime, site: str = SITE_URL) -> list[str]:
    """The hub pages, this week's recap, and every story page that is new or
    changed since ``since`` (summarized, or given new articles once summarized),
    plus the company pages those stories appear on."""
    stories = db.execute(
        select(Cluster.id, Cluster.representative_title).where(
            Cluster.summarized_at.is_not(None),
            or_(Cluster.summarized_at >= since, and_(Cluster.last_seen_at.is_not(None), Cluster.last_seen_at >= since)),
        )
    ).all()
    urls = [f"{site}{path}" for path in HUB_PATHS]
    urls.append(f"{site}/weekly/{_week_key(now)}")
    urls += [f"{site}/cluster/{story_id}" for story_id, _ in stories]
    slugs = dict.fromkeys(e.slug for _, title in stories for e in entities_in(title or ""))
    urls += [f"{site}/topics/{slug}" for slug in slugs]
    return list(dict.fromkeys(urls))


def submit(
    urls: list[str],
    *,
    client: httpx.Client | None = None,
    key: str = KEY,
    site: str = SITE_URL,
) -> dict[str, Any]:
    """POST the URLs (deduplicated, in order) for this site. Never raises.

    200/202 mean received; 403 means the key file isn't served, 422 that a URL
    isn't on the host, 429 too many requests.
    """
    unique = list(dict.fromkeys(urls))[:MAX_URLS]
    if not unique:
        return {"status": "skipped", "submitted": 0}
    host = httpx.URL(site).host
    body = {"host": host, "key": key, "keyLocation": f"{site}/{key}.txt", "urlList": unique}
    own = client is None
    client = client or httpx.Client(timeout=TIMEOUT_SEC)
    try:
        resp = client.post(ENDPOINT, json=body)
    except httpx.HTTPError as exc:
        logger.warning("indexnow submit failed (%s: %s)", type(exc).__name__, exc)
        return {"status": "failed", "submitted": 0, "error": type(exc).__name__}
    finally:
        if own:
            client.close()
    if resp.status_code in (200, 202):
        logger.info("indexnow submitted urls=%d http=%d", len(unique), resp.status_code)
        return {"status": "ok", "submitted": len(unique), "http_status": resp.status_code}
    logger.warning("indexnow refused urls=%d http=%d body=%s", len(unique), resp.status_code, resp.text[:200])
    return {"status": "failed", "submitted": 0, "http_status": resp.status_code}
