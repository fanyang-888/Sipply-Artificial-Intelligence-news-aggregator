"""New AI repositories on GitHub that are gathering stars — what developers are building.

Unauthenticated search API (https://docs.github.com/rest/search/search#search-repositories):
10 requests/minute, plenty for a few queries per run. Each query is a set of
search qualifiers (e.g. ``topic:llm``); the window start and a star floor are
added, results come back most-starred first. Stars are stored as ``points``.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.adapters.http_fetch import get_with_retry
from app.signals.base import SignalItem, SourceResult, parse_iso, plain_text, to_int
from app.signals.config import GitHubConfig

logger = logging.getLogger(__name__)

GITHUB_SEARCH_URL = "https://api.github.com/search/repositories"


def parse_github_repo(repo: dict[str, Any], query: str | None = None) -> SignalItem | None:
    full_name = repo.get("full_name")
    url = repo.get("html_url")
    created = parse_iso(repo.get("created_at"))
    if not full_name or not url or created is None:
        return None
    description = plain_text(repo.get("description"), limit=300)
    return SignalItem(
        source_kind="gh_repo",
        external_id=str(repo.get("id") or full_name),
        url=url,
        title=f"{full_name}: {description}" if description else full_name,
        text=description,
        author=(repo.get("owner") or {}).get("login"),
        published_at=created,
        query=query,
        points=to_int(repo.get("stargazers_count")),
        raw={"language": repo.get("language"), "topics": (repo.get("topics") or [])[:10]},
    )


async def fetch_github(
    client: httpx.AsyncClient,
    cfg: GitHubConfig,
    *,
    since: datetime,
    pause_sec: float = 2.0,
) -> SourceResult:
    if not cfg.enabled:
        return SourceResult(family="github", status="skipped", note="disabled in signal_sources.yaml")

    items: dict[str, SignalItem] = {}
    requests = errors = 0
    created = since.astimezone(timezone.utc).strftime("%Y-%m-%d")
    for query in cfg.queries:
        params = {
            "q": f"{query} created:>={created} stars:>={cfg.min_stars}",
            "sort": "stars",
            "order": "desc",
            "per_page": cfg.per_page,
        }
        requests += 1
        try:
            resp = await get_with_retry(
                client,
                str(httpx.URL(GITHUB_SEARCH_URL, params=params)),
                headers={"Accept": "application/vnd.github+json"},
            )
            repos = resp.json().get("items") or []
        except (httpx.HTTPError, ValueError) as exc:
            errors += 1
            logger.warning("signals github query=%r failed: %s", query, exc)
            continue
        for repo in repos:
            item = parse_github_repo(repo, query)
            if item is not None and item.external_id not in items:
                items[item.external_id] = item
        if pause_sec:
            await asyncio.sleep(pause_sec)

    status = "failed" if errors and not items else "partial" if errors else "ok"
    return SourceResult(
        family="github", status=status, items=list(items.values()), requests=requests,
        note=f"{errors} request(s) failed" if errors else None,
    )
