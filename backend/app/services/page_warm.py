"""Ask the site to rebuild its cached pages right after a pipeline run.

Vercel rebuilds a page in the background when a request finds it older than
its revalidate time (5 minutes); that request still gets the old copy. Without
this, the first reader after a quiet spell sees the previous run's page (and
radar questions, rings and stories from hours ago). Requesting each page once
here does the triggering instead, so readers get the rebuilt page.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

SITE_URL = os.getenv("SITE_URL", "https://www.sipply.dev").rstrip("/")
# The pages whose content changes with every run (story pages refresh on their own visits)
WARM_PATHS: tuple[str, ...] = ("/", "/radar", "/weekly", "/topics", "/archive")
TIMEOUT_SEC = 20.0


def warm_pages(
    client: httpx.Client | None = None,
    site: str = SITE_URL,
    paths: tuple[str, ...] = WARM_PATHS,
) -> dict[str, str]:
    """GET each page once; returns {path: "<status> <x-vercel-cache>"} (or the error). Never raises."""
    own = client is None
    client = client or httpx.Client(timeout=TIMEOUT_SEC, follow_redirects=True, headers={"User-Agent": "sipply-pipeline-warm"})
    results: dict[str, str] = {}
    try:
        for path in paths:
            try:
                resp = client.get(f"{site}{path}")
                results[path] = f"{resp.status_code} {resp.headers.get('x-vercel-cache', '-')}"
            except httpx.HTTPError as exc:
                results[path] = f"error {type(exc).__name__}"
    finally:
        if own:
            client.close()
    logger.info("pipeline pages warmed %s", " ".join(f"{p}={r}" for p, r in results.items()))
    return results
