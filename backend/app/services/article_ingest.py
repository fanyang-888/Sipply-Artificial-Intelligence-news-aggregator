"""Persist normalized full-article fetches (service layer on top of ``create_article``)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.crud.article import (
    apply_article_create_to_row,
    create_article,
    find_article_by_canonical_or_url,
    get_article_by_url,
)
from app.adapters.base import FEED_SUMMARY_METHOD
from app.models.article import Article
from app.schemas.article import ArticleCreate
from app.schemas.normalized_article import NormalizedFetchedArticle
from app.schemas.trusted_source_config import TrustedSourceConfig
from app.utils.datetime_parse import iso_to_utc_datetime
from app.utils.text_stats import (
    content_sha256_hex,
    minimal_clean_text,
    sanitize_plaintext_for_storage,
    word_count,
)
from app.utils.url_normalize import normalize_article_url

logger = logging.getLogger(__name__)

# Full article should be substantial; cookie banners often exceed 80 chars.
_MIN_BODY_CHARS = 400
# Feed summaries (body_from_feed sources) are a sentence or two by design
_MIN_FEED_SUMMARY_CHARS = 60
# When DOM fallback is used, require a minimum share of text in <p>/<li> vs total (nav-heavy pages fail).
_MIN_PARAGRAPH_RATIO_DOM = 0.12
_MIN_PARAGRAPH_RATIO_TECHCRUNCH = 0.08
# When re-fetching an existing row, do not replace body if the new extract is much shorter (WAF / parser regression).
_MIN_BODY_MERGE_RATIO = 0.8


def normalized_from_candidate_fetch(
    *,
    source_id: UUID,
    config: TrustedSourceConfig,
    candidate: dict[str, Any],
    fetch_ok: dict[str, Any],
) -> NormalizedFetchedArticle:
    """Build :class:`NormalizedFetchedArticle` from index candidate + successful ``fetch_article``."""
    title = (fetch_ok.get("title_guess") or candidate.get("title") or "").strip()
    author = fetch_ok.get("author_guess") or candidate.get("author_name")
    author_s = author.strip() if isinstance(author, str) and author.strip() else None
    pub = iso_to_utc_datetime(candidate.get("published_at"))
    raw = (fetch_ok.get("raw_text") or "").strip()
    return NormalizedFetchedArticle(
        source_id=source_id,
        title=title or "Untitled",
        url=(candidate.get("url") or "").strip(),
        canonical_url=fetch_ok.get("canonical_url"),
        author_name=author_s,
        organization_name=config.name,
        published_at=pub,
        fetched_at=datetime.now(timezone.utc),
        raw_text=raw,
        cleaned_text=minimal_clean_text(raw),
        excerpt=(fetch_ok.get("excerpt") or "").strip() or None,
        language=config.default_language,
        raw_meta=dict(fetch_ok.get("raw_meta") or {}),
    )


def repair_missing_published_at(article: Article, candidate: dict[str, Any]) -> bool:
    """Give an already-stored article the index's publish date if it never had one.

    Rows ingested while a parser couldn't read dates (Anthropic, DeepMind) have
    ``published_at`` NULL and are never clustered; seeing them again in a fixed
    index repairs them. Returns True when the row changed.
    """
    if article.published_at is not None:
        return False
    pub = iso_to_utc_datetime(candidate.get("published_at"))
    if pub is None:
        return False
    article.published_at = pub
    return True


class PersistArticleOutcome(str, Enum):
    inserted = "inserted"
    updated = "updated"
    duplicate = "duplicate"
    rejected = "rejected"


def _full_fetch_meta(raw_meta: dict[str, Any]) -> dict[str, Any]:
    ff = raw_meta.get("full_fetch")
    return ff if isinstance(ff, dict) else {}


def _effective_body_len(row: Article) -> int:
    return max(len((row.cleaned_text or "").strip()), len((row.raw_text or "").strip()))


def _apply_body_merge_guard(existing: Article, data: dict[str, Any]) -> None:
    """If the new body is much shorter than stored text, keep existing body fields and merge flags into ``raw_meta``."""
    ex_len = _effective_body_len(existing)
    new_raw = (data.get("raw_text") or "").strip()
    new_clean = (data.get("cleaned_text") or "").strip()
    new_len = max(len(new_raw), len(new_clean))
    if ex_len < _MIN_BODY_CHARS:
        return
    if new_len >= ex_len * _MIN_BODY_MERGE_RATIO:
        return
    data["raw_text"] = existing.raw_text
    data["cleaned_text"] = existing.cleaned_text
    data["content_hash"] = existing.content_hash
    data["word_count"] = existing.word_count
    meta = dict(data.get("raw_meta") or {})
    ing_m = dict(meta.get("ingestion") or {}) if isinstance(meta.get("ingestion"), dict) else {}
    ing_m["body_preserved_short_fetch"] = True
    ing_m["existing_body_len"] = ex_len
    ing_m["attempted_body_len"] = new_len
    ing_m["word_count"] = existing.word_count
    meta["ingestion"] = ing_m
    data["raw_meta"] = meta
    logger.info(
        "ingest body_preserved (new shorter than %.0f%% of existing) article_id=%s existing_len=%s new_len=%s",
        _MIN_BODY_MERGE_RATIO * 100,
        existing.id,
        ex_len,
        new_len,
    )


def persist_fetched_article(
    db: Session,
    normalized: NormalizedFetchedArticle,
    *,
    adapter_key: str = "",
) -> PersistArticleOutcome:
    """Insert or update by ``url`` / ``canonical_url``.

    Re-fetch updates an existing row, but if the new extract is much shorter than stored text (likely WAF /
    parser regression), **body** fields are preserved and only metadata / ``raw_meta`` hints are merged.

    ``content_hash`` uses SHA-256 over cleaned/raw text (see module comment in ``text_stats``); identical
    text across URLs yields identical hashes (possible future cross-post merge signal — not applied today).
    """
    title = (normalized.title or "").strip()
    if not title:
        logger.warning(
            "ingest rejected reason=empty_title adapter=%s url=%s",
            adapter_key,
            normalized.url[:200],
        )
        return PersistArticleOutcome.rejected

    raw_t = sanitize_plaintext_for_storage((normalized.raw_text or "").strip())
    cleaned = sanitize_plaintext_for_storage((normalized.cleaned_text or "").strip())
    if not cleaned and raw_t:
        cleaned = minimal_clean_text(raw_t)
        cleaned = sanitize_plaintext_for_storage(cleaned)
    if not raw_t and cleaned:
        raw_t = cleaned

    from_feed = _full_fetch_meta(dict(normalized.raw_meta)).get("extraction_method") == FEED_SUMMARY_METHOD
    min_chars = _MIN_FEED_SUMMARY_CHARS if from_feed else _MIN_BODY_CHARS
    if len(cleaned) < min_chars and len(raw_t) < min_chars:
        logger.warning(
            "ingest rejected reason=short_body adapter=%s url=%s raw_len=%s cleaned_len=%s",
            adapter_key,
            normalized.url[:200],
            len(raw_t),
            len(cleaned),
        )
        return PersistArticleOutcome.rejected

    meta_in = dict(normalized.raw_meta)
    ff = _full_fetch_meta(meta_in)
    method = ff.get("extraction_method")
    p_ratio = ff.get("paragraph_ratio")
    min_dom_ratio = (
        _MIN_PARAGRAPH_RATIO_TECHCRUNCH if adapter_key == "techcrunch_ai" else _MIN_PARAGRAPH_RATIO_DOM
    )
    if (
        isinstance(method, str)
        and method != "json_ld"
        and p_ratio is not None
        and isinstance(p_ratio, (int, float))
        and float(p_ratio) < min_dom_ratio
    ):
        logger.warning(
            "ingest rejected reason=low_paragraph_density adapter=%s url=%s method=%s ratio=%s min=%s",
            adapter_key,
            normalized.url[:200],
            method,
            p_ratio,
            min_dom_ratio,
        )
        return PersistArticleOutcome.rejected

    basis = cleaned if cleaned else raw_t
    wc = normalized.word_count if normalized.word_count is not None else word_count(basis)
    ch = normalized.content_hash if normalized.content_hash else content_sha256_hex(basis)

    meta = dict(normalized.raw_meta)
    ing_meta = meta.get("ingestion")
    if not isinstance(ing_meta, dict):
        ing_meta = {}
    ing_meta = {**ing_meta, "word_count": wc}
    if adapter_key:
        ing_meta["adapter_key"] = adapter_key
    meta = {**meta, "ingestion": ing_meta}

    url_n = normalize_article_url(normalized.url, base=None)
    canonical_raw = (normalized.canonical_url or "").strip()
    canonical_n = normalize_article_url(canonical_raw, base=None) if canonical_raw else None

    payload = ArticleCreate(
        source_id=normalized.source_id,
        title=title,
        url=url_n,
        canonical_url=canonical_n,
        published_at=normalized.published_at,
        fetched_at=normalized.fetched_at,
        raw_text=raw_t or None,
        cleaned_text=cleaned or None,
        excerpt=(normalized.excerpt or "").strip() or None,
        content_hash=ch,
        language=normalized.language,
        author_name=normalized.author_name,
        organization_name=normalized.organization_name,
        raw_meta=meta,
        word_count=wc,
    )
    data = payload.model_dump()

    if canonical_n:
        existing = find_article_by_canonical_or_url(db, canonical_n)
        if existing is not None:
            if url_n != existing.url:
                occupant = get_article_by_url(db, url_n)
                if occupant is None or occupant.id == existing.id:
                    data["url"] = url_n
                else:
                    data["url"] = existing.url
            _apply_body_merge_guard(existing, data)
            apply_article_create_to_row(existing, data)
            logger.info(
                "ingest updated (canonical match) adapter=%s article_id=%s url=%s",
                adapter_key,
                existing.id,
                url_n[:200],
            )
            return PersistArticleOutcome.updated

    row = create_article(db, payload)
    if row is not None:
        logger.info(
            "ingest inserted adapter=%s article_id=%s url=%s",
            adapter_key,
            row.id,
            url_n[:200],
        )
        return PersistArticleOutcome.inserted

    by_url = get_article_by_url(db, url_n)
    if by_url is not None:
        _apply_body_merge_guard(by_url, data)
        apply_article_create_to_row(by_url, data)
        logger.info(
            "ingest updated (same url re-fetch) adapter=%s article_id=%s url=%s",
            adapter_key,
            by_url.id,
            url_n[:200],
        )
        return PersistArticleOutcome.updated

    logger.info(
        "ingest duplicate_skip adapter=%s url=%s",
        adapter_key,
        url_n[:200],
    )
    return PersistArticleOutcome.duplicate
