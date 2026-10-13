"""Google DeepMind Blog adapter — the blog's RSS feed if configured; HTML index as fallback.

The HTML index has no dates and many cards whose link text is just "Learn more",
so the feed (https://deepmind.google/blog/rss.xml) is the primary source.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.adapters.article_html import extract_deepmind_article, fetch_html
from app.adapters.base import BaseSourceAdapter
from app.adapters.html_index import extract_deepmind_candidates
from app.adapters.http_client import ingestion_http_client
from app.adapters.http_fetch import get_with_retry
from app.adapters.ingestion_limits import apply_entry_limits
from app.adapters.rss import fetch_feed_entries

logger = logging.getLogger(__name__)


class DeepMindBlogAdapter(BaseSourceAdapter):
    source_name = "Google DeepMind Blog"
    adapter_key = "deepmind_blog"

    async def fetch_index(self) -> list[dict[str, Any]]:
        slug = self.source_config.slug
        logger.info("fetch_index start source=%s slug=%s", self.source_name, slug)
        raw_entries: list[dict[str, Any]] = []
        rss_ok = False
        try:
            async with ingestion_http_client(self.source_config) as client:
                if self.source_config.feed_url:
                    try:
                        feed_entries, new_etag = await fetch_feed_entries(
                            str(self.source_config.feed_url), client, etag=self.source_config.etag
                        )
                        self._new_etag: str | None = new_etag
                        raw_entries = [r for r in feed_entries if r.get("link")]
                        # An empty answer can be 304 Not Modified: nothing new, not a failure
                        rss_ok = True
                    except Exception as e:
                        logger.warning(
                            "fetch_index rss failed, using html index source=%s slug=%s type=%s msg=%s",
                            self.source_name, slug, type(e).__name__, e,
                        )
                if not rss_ok:
                    resp = await get_with_retry(client, str(self.source_config.index_url))
                    base = str(self.source_config.base_url).rstrip("/")
                    raw_entries = extract_deepmind_candidates(resp.text, base_url=base)
            rows = apply_entry_limits(
                [r for r in raw_entries if r.get("link")],
                self.source_config,
            )
            candidates = [self.normalize(r) for r in rows]
            logger.info(
                "fetch_index success source=%s slug=%s items=%d",
                self.source_name, slug, len(candidates),
            )
            return candidates
        except Exception as e:
            logger.exception(
                "fetch_index failure source=%s slug=%s type=%s msg=%s",
                self.source_name, slug, type(e).__name__, e,
            )
            raise

    async def fetch_article(self, item: dict[str, Any]) -> dict[str, Any]:
        url = (item.get("url") or "").strip()
        if not url:
            return {
                "status": "failed",
                "error": "missing candidate url",
                "error_type": "ValueError",
                "adapter_key": self.adapter_key,
            }
        try:
            async with ingestion_http_client(self.source_config) as client:
                html, final_url = await fetch_html(client, url)
        except httpx.HTTPStatusError as e:
            logger.warning(
                "fetch_article http error adapter=%s url=%s status=%s",
                self.adapter_key, url[:200], e.response.status_code,
            )
            return {
                "status": "failed",
                "error": str(e),
                "error_type": type(e).__name__,
                "http_status": e.response.status_code,
                "url": url,
                "adapter_key": self.adapter_key,
            }
        except Exception as e:
            logger.exception(
                "fetch_article http failure adapter=%s url=%s",
                self.adapter_key, url[:200],
            )
            return {
                "status": "failed",
                "error": str(e),
                "error_type": type(e).__name__,
                "url": url,
                "adapter_key": self.adapter_key,
            }
        extracted = extract_deepmind_article(html, final_url)
        raw = (extracted.get("raw_text") or "").strip()
        if len(raw) < 200:
            return {
                "status": "failed",
                "error": "empty_or_short_extraction",
                "error_type": "ParseError",
                "url": url,
                "adapter_key": self.adapter_key,
                "raw_meta": {
                    "full_fetch": {
                        "extraction_method": extracted.get("extraction_method"),
                        "http_final_url": extracted.get("http_final_url"),
                        "paragraph_ratio": extracted.get("paragraph_ratio"),
                        "parser_version": extracted.get("parser_version"),
                    }
                },
            }
        base_meta = dict(item.get("raw_meta") or {})
        base_meta["full_fetch"] = {
            "site": "deepmind.google",
            "extraction_method": extracted.get("extraction_method"),
            "http_final_url": extracted.get("http_final_url"),
            "paragraph_ratio": extracted.get("paragraph_ratio"),
            "parser_version": extracted.get("parser_version"),
        }
        return {
            "status": "ok",
            "url": url,
            "raw_text": raw,
            "canonical_url": extracted.get("canonical_url"),
            "title_guess": extracted.get("title_guess"),
            "author_guess": extracted.get("author_guess"),
            "excerpt": extracted.get("excerpt"),
            "raw_meta": base_meta,
        }
