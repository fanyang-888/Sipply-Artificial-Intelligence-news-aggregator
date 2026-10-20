"""Tell the site which cached pages a pipeline run changed.

Vercel stores every rebuilt page (an ISR write; the Hobby plan includes 200K
write units a month) and no two rebuilds of a Next.js page are byte for byte
the same, so each rebuild costs writes whether or not the story changed. Pages
are therefore cached for long (stories a week, everything else a day) and this
asks the site, right after a successful run, to rebuild only what the run
changed (POST /api/revalidate, app/api/revalidate/route.ts):

- "run": the home page, radar, topics, weeks, days and feeds, which change with
  every run;
- "story:<slug>" and "story-id:<id>": each story the run created or changed
  (the same stories IndexNow is told about), and each story merged into another,
  so its old address starts redirecting.

Needs REVALIDATE_SECRET, the same value as on Vercel; without it nothing is sent
and pages refresh when their cache lifetime ends.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.services.headlines import story_slug
from app.services.indexnow import SITE_URL, changed_stories, merged_since

logger = logging.getLogger(__name__)

RUN_TAG = "run"
TIMEOUT_SEC = 20.0


def revalidate_tags(db: Session, *, since: datetime) -> list[str]:
    """The cache tags this run changed, "run" first, without duplicates."""
    tags = [RUN_TAG]
    for s in changed_stories(db, since=since):
        tags += [f"story:{story_slug(s)}", f"story-id:{s.id}"]
    for r in merged_since(db, since=since):
        tags += ([f"story:{r.old_slug}"] if r.old_slug else []) + [f"story-id:{r.old_id}"]
    return list(dict.fromkeys(tags))


def submit(
    tags: list[str],
    *,
    client: httpx.Client | None = None,
    secret: str | None = None,
    site: str = SITE_URL,
) -> dict[str, Any]:
    """POST the tags to the site. Never raises."""
    secret = os.getenv("REVALIDATE_SECRET", "") if secret is None else secret
    if not secret:
        return {"status": "skipped", "reason": "REVALIDATE_SECRET not set"}
    own = client is None
    client = client or httpx.Client(timeout=TIMEOUT_SEC)
    try:
        resp = client.post(f"{site}/api/revalidate", json={"tags": tags}, headers={"Authorization": f"Bearer {secret}"})
        if resp.status_code != 200:
            logger.warning("site revalidate refused status=%s", resp.status_code)
            return {"status": "failed", "tags": 0, "http_status": resp.status_code}
        logger.info("site revalidate tags=%d", len(tags))
        return {"status": "ok", "tags": len(tags), "http_status": resp.status_code}
    except httpx.HTTPError as exc:
        logger.warning("site revalidate failed (%s)", type(exc).__name__)
        return {"status": "failed", "tags": 0, "error": type(exc).__name__}
    finally:
        if own:
            client.close()
