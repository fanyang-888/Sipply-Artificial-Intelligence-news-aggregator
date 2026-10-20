"""Ask the site to rebuild its main pages right after a pipeline run.

Pages are cached for a day and the run has just marked them stale
(app/services/site_revalidate.py); Vercel rebuilds a stale page on its next
request. Requesting each page once here makes that request ours, so the first
reader gets the rebuilt page instead of waiting for it.
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
