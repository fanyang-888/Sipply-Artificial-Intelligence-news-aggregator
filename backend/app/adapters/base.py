"""Abstract base for trusted source adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.schemas.trusted_source_config import TrustedSourceConfig
from app.utils.datetime_parse import published_raw_to_utc_datetime, utc_datetime_to_iso
from app.utils.url_normalize import normalize_article_url


# raw_meta.full_fetch.extraction_method for bodies taken from the feed (see feed_body_result)
FEED_SUMMARY_METHOD = "feed_summary"


class BaseSourceAdapter(ABC):
    """Fetch and normalize article candidates from one configured trusted source."""

    source_name: str
    adapter_key: str

    def __init__(self, source_config: TrustedSourceConfig | dict) -> None:
        if isinstance(source_config, dict):
            source_config = TrustedSourceConfig.model_validate(source_config)
        self.source_config = source_config

    @abstractmethod
    async def fetch_index(self) -> list[dict[str, Any]]:
        """Fetch recent article candidates (normalized dicts)."""

    async def fetch_article(self, item: dict[str, Any]) -> dict[str, Any]:
        """Download and parse one article page; concrete adapters override (Day 3)."""
        return {
            "status": "failed",
            "error": "fetch_article not implemented for this adapter",
            "error_type": "NotImplementedError",
            "adapter_key": getattr(self, "adapter_key", ""),
            "url": item.get("url"),
        }

    def feed_body_result(self, item: dict[str, Any]) -> dict[str, Any]:
        """A ``fetch_article``-shaped result built from the feed entry itself, no HTTP.

        For sources with ``body_from_feed``: their pages refuse automated requests,
        but the publisher's RSS carries a summary we can use as the body.
        """
        url = (item.get("url") or "").strip()
        meta = dict(item.get("raw_meta") or {})
        summary = " ".join(str(meta.get("summary") or "").split())
        if not url or not summary:
            return {
                "status": "failed",
                "error": "feed entry has no summary",
                "error_type": "ParseError",
                "url": url,
                "adapter_key": getattr(self, "adapter_key", ""),
            }
        meta["full_fetch"] = {"extraction_method": FEED_SUMMARY_METHOD}
        return {
            "status": "ok",
            "url": url,
            "raw_text": summary,
            "canonical_url": None,
            "title_guess": None,
            "author_guess": None,
            "excerpt": summary,
            "raw_meta": meta,
        }

    def normalize(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Map parser-specific ``raw`` into the shared candidate schema."""
        title = (raw.get("title") or "").strip() or "Untitled"
        link = (raw.get("link") or "").strip()
        base = str(self.source_config.base_url)
        url = normalize_article_url(link, base=base) if link else ""
        author = raw.get("author")
        author_name = author.strip() if isinstance(author, str) and author.strip() else None
        dt = published_raw_to_utc_datetime(raw)
        published_at = utc_datetime_to_iso(dt)
        raw_meta = {
            "summary": raw.get("summary"),
            "tags": raw.get("tags") or [],
            "feed_title": raw.get("feed_title"),
            "parser": raw.get("_parser"),
        }
        return {
            "title": title,
            "url": url,
            "published_at": published_at,
            "author_name": author_name,
            "raw_meta": raw_meta,
        }
