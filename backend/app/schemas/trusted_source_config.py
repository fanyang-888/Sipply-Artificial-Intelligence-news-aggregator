"""Validated trusted-source definitions (YAML-backed, Week 2 Day 2)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

# Browser-like default when YAML omits ``user_agent`` (Cloudflare-friendly).
DEFAULT_TRUSTED_BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

IngestionMethod = Literal["rss", "rss_primary_html_fallback"]


class TrustedSourceConfig(BaseModel):
    """One trusted publisher entry; drives adapter registry and fetch behavior.

    YAML is data-only; loading/validation lives in ``app.source_catalog.loader``.
    """

    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9-]+$")
    type: str = Field(min_length=1, description="High-level channel, e.g. company_news")
    base_url: HttpUrl
    feed_url: HttpUrl | None = None
    index_url: HttpUrl
    adapter_key: str = Field(min_length=1)
    ingestion_method: IngestionMethod
    is_active: bool = True
    fetch_frequency_minutes: int = Field(ge=1)
    source_priority: int = Field(ge=0, description="Lower = higher priority for future ranking")
    default_language: str = Field(min_length=2, max_length=16)
    user_agent: str | None = Field(
        default=None,
        description="HTTP User-Agent for this source; falls back to env SOURCE_FETCH_USER_AGENT.",
    )
    import_limit: int | None = Field(
        default=None,
        ge=1,
        description="Max index items after newest-first sort (caps RSS backlog).",
    )
    since_date: date | None = Field(
        default=None,
        description="Drop entries older than this UTC calendar day (RSS); undated rows kept.",
    )
    etag: str | None = Field(
        default=None,
        description="Last ETag received from the RSS feed; used for conditional requests.",
    )
    body_from_feed: bool = Field(
        default=False,
        description=(
            "Use the feed's own summary as the article body instead of fetching the page — "
            "for publishers whose pages refuse automated requests but whose RSS is public."
        ),
    )

    def effective_user_agent(self, fallback: str) -> str:
        for candidate in (self.user_agent, fallback, DEFAULT_TRUSTED_BROWSER_USER_AGENT):
            if candidate and str(candidate).strip():
                return str(candidate).strip()
        return DEFAULT_TRUSTED_BROWSER_USER_AGENT
