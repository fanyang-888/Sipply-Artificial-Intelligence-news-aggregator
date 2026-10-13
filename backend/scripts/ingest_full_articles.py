"""Fetch full article HTML for trusted sources and persist into ``articles``.

Run from ``backend/`` (requires ``.env`` with ``DATABASE_URL``, etc.):

    alembic upgrade head
    python -m scripts.ingest_full_articles
    python -m scripts.ingest_full_articles --slug openai-news --per-source-limit 2
    python -m scripts.ingest_full_articles --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from collections import defaultdict
from datetime import datetime, timezone
from uuid import UUID

from app.adapters import get_adapter
from app.adapters.registry import AdapterNotRegisteredError
from app.crud.article import get_article_by_url
from app.crud.ingest_url_state import (
    force_reset_ingest_url_failures,
    is_url_ingest_blocked,
    record_fetch_success,
    record_http_403,
)
from app.db import session_scope
from app.logging_config import configure_logging
from app.services.article_ingest import (
    repair_missing_published_at,
    normalized_from_candidate_fetch,
    persist_fetched_article,
)
from app.services.source_sync import update_source_poll_state, upsert_source_from_trusted_config
from app.source_catalog.loader import load_trusted_sources

# Per-source hard wall-clock timeout (seconds). Override via PER_SOURCE_TIMEOUT_SECONDS env var.
import os as _os
_PER_SOURCE_TIMEOUT = int(_os.getenv("PER_SOURCE_TIMEOUT_SECONDS", "180"))

logger = logging.getLogger(__name__)


async def _run(
    slug: str | None,
    per_source_limit: int,
    dry_run: bool,
    force_retry_failures: bool,
) -> int:
    if force_retry_failures and not dry_run:
        with session_scope() as db:
            n = force_reset_ingest_url_failures(db)
        logger.warning("ingest --force-retry-failures cleared ingest_url_states rows=%s", n)

    configs = load_trusted_sources()
    if slug:
        configs = [c for c in configs if c.slug == slug]
        if not configs:
            logger.error("no active trusted source with slug=%r", slug)
            return 1

    totals: dict[str, int] = defaultdict(int)
    candidates_seen = 0

    for cfg in configs:
        slug_label = cfg.slug
        st: dict[str, int] = defaultdict(int)
        try:
            adapter = get_adapter(cfg)
        except AdapterNotRegisteredError as e:
            logger.error("adapter not registered slug=%s err=%s", slug_label, e)
            totals["registry_error"] += 1
            continue

        if dry_run:
            source_id = UUID(int=0)
            source = None
        else:
            with session_scope() as db:
                source = upsert_source_from_trusted_config(db, cfg)
                source_id = source.id
                # Poll frequency gate — skip if fetched too recently
                if source.last_polled_at and cfg.fetch_frequency_minutes:
                    now = datetime.now(timezone.utc)
                    elapsed_min = (now - source.last_polled_at).total_seconds() / 60
                    if elapsed_min < cfg.fetch_frequency_minutes:
                        logger.info(
                            "skip source=%s (polled %.0fm ago, freq=%dm)",
                            slug_label,
                            elapsed_min,
                            cfg.fetch_frequency_minutes,
                        )
                        totals["skipped_poll_gate"] += 1
                        continue
                # Thread etag into config so adapter can use it
                cfg.etag = source.etag

        try:
            index_items = await adapter.fetch_index()
        except Exception as e:
            logger.exception(
                "fetch_index failed slug=%s adapter=%s err=%s",
                slug_label,
                adapter.adapter_key,
                e,
            )
            totals["index_failed"] += 1
            st["index_failed"] += 1
            continue

        # Persist last_polled_at + new etag (even on 304 / empty index)
        if not dry_run and source is not None:
            new_etag = getattr(adapter, "_new_etag", None)
            with session_scope() as db:
                update_source_poll_state(db, source_id, etag=new_etag)

        # Walk index in order until we get ``per_source_limit`` successful fetches (skips 403/parse
        # errors and already-ingested articles).
        # Cap at per_source_limit*3 so a large RSS feed (100+ items) can't make us try every entry
        # — each failing fetch can take up to 2 min with retries.
        max_attempts = min(len(index_items), per_source_limit * 3)
        logger.info(
            "ingest source=%s adapter=%s index=%s target_successes=%s max_attempts=%s dry_run=%s",
            cfg.name,
            adapter.adapter_key,
            len(index_items),
            per_source_limit,
            max_attempts,
            dry_run,
        )

        async def _fetch_source_articles() -> None:
            nonlocal candidates_seen
            successes = 0
            remaining = max_attempts
            for cand in index_items:
                if successes >= per_source_limit:
                    break
                if remaining <= 0:
                    break
                remaining -= 1
                candidates_seen += 1
                cand_url = (cand.get("url") or "").strip()

                if not dry_run and cand_url:
                    # ── Skip already-ingested articles (no HTTP needed) ────────────────
                    with session_scope() as db:
                        existing = get_article_by_url(db, cand_url)
                        if existing is not None:
                            totals["skipped_already_ingested"] += 1
                            st["skipped_already_ingested"] += 1
                            if repair_missing_published_at(existing, cand):
                                totals["repaired_published_at"] += 1
                                st["repaired_published_at"] += 1
                            # Do NOT count as success — we want to keep searching for new articles
                            continue
                    # ── Skip permanently blocked URLs (repeated 403s) ─────────────────
                    # (feed-body sources never request the page, so a past block doesn't matter)
                    with session_scope() as db:
                        if not cfg.body_from_feed and is_url_ingest_blocked(db, cand_url):
                            totals["skipped_blocked"] += 1
                            st["skipped_blocked"] += 1
                            logger.info(
                                "skip fetch (permanent_failure after 403s) slug=%s url=%s",
                                slug_label,
                                cand_url[:200],
                            )
                            continue

                fr = adapter.feed_body_result(cand) if cfg.body_from_feed else await adapter.fetch_article(cand)
                if fr.get("status") != "ok":
                    totals["fetch_failed"] += 1
                    st["fetch_failed"] += 1
                    if not dry_run and cand_url and fr.get("http_status") == 403:
                        with session_scope() as db:
                            record_http_403(db, cand_url)
                    logger.error(
                        "fetch_article failed slug=%s adapter=%s url=%s type=%s err=%s",
                        slug_label,
                        fr.get("adapter_key", adapter.adapter_key),
                        (fr.get("url") or cand_url or "")[:200],
                        fr.get("error_type"),
                        fr.get("error"),
                    )
                    continue

                if not dry_run and cand_url:
                    with session_scope() as db:
                        record_fetch_success(db, cand_url)

                successes += 1
                normalized = normalized_from_candidate_fetch(
                    source_id=source_id,
                    config=cfg,
                    candidate=cand,
                    fetch_ok=fr,
                )
                if dry_run:
                    totals["dry_run_ok"] += 1
                    st["dry_run_ok"] += 1
                    logger.info(
                        "dry_run skip persist slug=%s url=%s title=%r",
                        slug_label,
                        normalized.url[:120],
                        (normalized.title or "")[:80],
                    )
                    continue

                with session_scope() as db:
                    outcome = persist_fetched_article(
                        db,
                        normalized,
                        adapter_key=adapter.adapter_key,
                    )
                totals[outcome.value] += 1
                st[outcome.value] += 1

        try:
            await asyncio.wait_for(_fetch_source_articles(), timeout=_PER_SOURCE_TIMEOUT)
        except asyncio.TimeoutError:
            logger.warning(
                "ingest source=%s TIMED OUT after %ds — skipping remaining articles",
                slug_label,
                _PER_SOURCE_TIMEOUT,
            )
            totals["source_timeout"] += 1
            st["source_timeout"] = 1

        logger.info("[ingest summary] slug=%s %s", slug_label, dict(st))

    if candidates_seen == 0 and totals.get("skipped_poll_gate", 0) == 0:
        logger.error("no candidates processed (empty index or no sources)")
        return 1

    logger.info(
        "ingest_full_articles done candidates_seen=%s totals=%s",
        candidates_seen,
        dict(totals),
    )
    return 0


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(description="Full article fetch + persist for trusted sources")
    parser.add_argument("--slug", help="Only this trusted source slug (YAML)")
    parser.add_argument(
        "--per-source-limit",
        type=int,
        default=3,
        help="Max index items to fetch full body per source (default: 3)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and parse only; do not write to the database",
    )
    parser.add_argument(
        "--force-retry-failures",
        action="store_true",
        help="Delete all rows in ingest_url_states (403 counters / bans) before running",
    )
    args = parser.parse_args()
    code = asyncio.run(
        _run(
            args.slug,
            args.per_source_limit,
            args.dry_run,
            args.force_retry_failures,
        )
    )
    sys.exit(code)


if __name__ == "__main__":
    main()
