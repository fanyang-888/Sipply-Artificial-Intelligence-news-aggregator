"""Article filtering service — second-pass quality gate after ingestion.

The ingestion layer already blocks truly broken content (empty body, cookie
banners, low paragraph density).  This service applies higher-level filters
to articles already stored in the DB:

  1. short_body       — cleaned_text word count < MIN_WORD_COUNT (not applied to
                        bodies taken from a feed summary, which are short by design)
  2. short_title      — title < MIN_TITLE_CHARS chars (likely stub/redirect)
  3. off_topic        — no AI-related keywords in title + excerpt/text (not applied
                        to the AI labs' own newsrooms — source type company_news —
                        where everything published is AI-industry news)
  4. duplicate_hash   — content_hash already exists on a different article
                        (cross-URL reposts); only the earlier row is kept

After filtering, ``is_filtered_out`` is set to:
  False  — article passes all checks → eligible for scoring & clustering
  True   — article is excluded from downstream pipeline

The scoring service should query:
    WHERE signal_score IS NULL AND (is_filtered_out IS NULL OR is_filtered_out = false)
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.base import FEED_SUMMARY_METHOD
from app.crud.article import get_unassessed_articles, mark_article_filter_result
from app.models.article import Article

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------
MIN_WORD_COUNT = 80          # articles below this are likely stubs
MIN_TITLE_CHARS = 10         # very short titles are usually navigation artifacts

# AI-relevance keyword set — intentionally broad (sources are already curated)
# An article is off-topic only if NONE of these appear in title + leading text.
_AI_KEYWORDS = re.compile(
    r"\b("
    r"ai|a\.i\.|ml|llm|gpt|chatgpt|codex|copilot|sora|claude|gemini|mistral|llama|falcon|phi|"
    r"openai|anthropic|deepmind|google|nvidia|meta|hugging\s?face|"
    r"model|neural|transformer|diffusion|generative|foundation|"
    r"machine\s+learning|deep\s+learning|reinforcement|"
    r"agent|inference|benchmark|dataset|training|fine.?tun|"
    r"embedding|parameter|billion|trillion|token|chatbot|"
    r"research|paper|release|launch|product|safety|alignment"
    r")\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Filter result
# ---------------------------------------------------------------------------

@dataclass
class FilterResult:
    is_filtered_out: bool
    reason: str | None  # None when article passes


def _is_feed_summary(article: Article) -> bool:
    """Body came from the publisher's feed summary (sources with body_from_feed)."""
    ff = (getattr(article, "raw_meta", None) or {}).get("full_fetch")
    return isinstance(ff, dict) and ff.get("extraction_method") == FEED_SUMMARY_METHOD


def _check(article: Article) -> FilterResult:
    # 1. Short body
    wc = article.word_count or 0
    if wc < MIN_WORD_COUNT and not _is_feed_summary(article):
        # Recompute from text in case word_count was not set at ingest time
        text_len = len((article.cleaned_text or article.raw_text or "").split())
        if text_len < MIN_WORD_COUNT:
            return FilterResult(is_filtered_out=True, reason="short_body")

    # 2. Short title
    title = (article.title or "").strip()
    if len(title) < MIN_TITLE_CHARS:
        return FilterResult(is_filtered_out=True, reason="short_title")

    # 3. Off-topic (no AI keywords anywhere in title + first 800 chars of body).
    # An AI lab's own newsroom is on-topic by definition: its usage-policy or
    # watermarking posts were being dropped for lacking a keyword up front.
    source = getattr(article, "source", None)
    if getattr(source, "type", None) == "company_news":
        return FilterResult(is_filtered_out=False, reason=None)
    search_text = title + " " + (article.excerpt or article.cleaned_text or "")[:800]
    if not _AI_KEYWORDS.search(search_text):
        return FilterResult(is_filtered_out=True, reason="off_topic")

    return FilterResult(is_filtered_out=False, reason=None)


# ---------------------------------------------------------------------------
# Duplicate hash check (batch-level — run once per session)
# ---------------------------------------------------------------------------

def _build_seen_hashes(db: Session) -> set[str]:
    """Return content_hash values that are already on a *passing* article
    (is_filtered_out = False).  Used to flag later duplicates."""
    rows = db.execute(
        select(Article.content_hash).where(
            Article.content_hash.is_not(None),
            Article.is_filtered_out == False,  # noqa: E712
        )
    ).scalars().all()
    return set(rows)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def filter_unassessed_articles(db: Session, batch_size: int = 500) -> dict[str, int]:
    """Run filter checks on all articles where ``is_filtered_out IS NULL``.

    Returns ``{"assessed": N, "filtered_out": M, "kept": K, "skipped": S}``.
    """
    articles = get_unassessed_articles(db, limit=batch_size)
    if not articles:
        logger.info("filter: no unassessed articles found")
        return {"assessed": 0, "filtered_out": 0, "kept": 0, "skipped": 0}

    # Pre-build seen-hash set from already-passing articles
    seen_hashes: set[str] = _build_seen_hashes(db)

    assessed = filtered_out = kept = skipped = 0

    for article in articles:
        try:
            result = _check(article)

            # Duplicate hash check (only meaningful after first pass)
            if not result.is_filtered_out and article.content_hash:
                if article.content_hash in seen_hashes:
                    result = FilterResult(is_filtered_out=True, reason="duplicate_hash")
                else:
                    seen_hashes.add(article.content_hash)

            mark_article_filter_result(
                db,
                article_id=article.id,
                is_filtered_out=result.is_filtered_out,
                filter_reason=result.reason,
            )

            assessed += 1
            if result.is_filtered_out:
                filtered_out += 1
                logger.info(
                    "filter excluded article_id=%s reason=%s title=%.60s",
                    article.id, result.reason, article.title,
                )
            else:
                kept += 1
                logger.debug("filter kept article_id=%s title=%.60s", article.id, article.title)

        except Exception:
            logger.exception("filter error article_id=%s", article.id)
            skipped += 1

    if assessed:
        db.commit()
        logger.info(
            "filter batch done: assessed=%d kept=%d filtered_out=%d skipped=%d",
            assessed, kept, filtered_out, skipped,
        )

    return {"assessed": assessed, "filtered_out": filtered_out, "kept": kept, "skipped": skipped}
