"""Run LLM summarization on articles and clusters.

Usage (from backend/):
    python -m scripts.summarize                    # articles then clusters
    python -m scripts.summarize --articles-only
    python -m scripts.summarize --clusters-only
    python -m scripts.summarize --batch-size 20    # default 50 articles / 20 clusters
    python -m scripts.summarize --reset-articles   # clear article summaries and re-run
    python -m scripts.summarize --reset-clusters   # clear cluster summaries and re-run

Requires OPENAI_API_KEY in .env (or environment).
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.db import session_scope
from app.logging_config import configure_logging
from app.services.headlines import assign_missing_slugs
from app.services.summarization import (
    summarize_unsummarized_articles,
    summarize_unsummarized_clusters,
)

logger = logging.getLogger(__name__)


def _reset_articles(db) -> None:
    from sqlalchemy import update
    from app.models.article import Article
    db.execute(update(Article).values(
        short_summary=None, takeaways=None, tags=None,
        entities=None, themes=None, why_it_matters=None, summarized_at=None,
    ))
    db.commit()
    logger.info("reset all article summaries")


def _reset_clusters(db) -> None:
    from sqlalchemy import update
    from app.models.cluster import Cluster
    db.execute(update(Cluster).values(
        summary=None, takeaways=None, why_it_matters=None,
        why_it_matters_pm=None, why_it_matters_dev=None,
        why_it_matters_students=None, summarized_at=None,
    ))
    db.commit()
    logger.info("reset all cluster summaries")


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description="LLM summarization for articles and clusters")
    parser.add_argument("--articles-only", action="store_true")
    parser.add_argument("--clusters-only", action="store_true")
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--reset-articles", action="store_true")
    parser.add_argument("--reset-clusters", action="store_true")
    args = parser.parse_args(argv)

    do_articles = not args.clusters_only
    do_clusters = not args.articles_only

    with session_scope() as db:
        if args.reset_articles:
            _reset_articles(db)
        if args.reset_clusters:
            _reset_clusters(db)

        if do_articles:
            ar = summarize_unsummarized_articles(db, batch_size=args.batch_size)
            print(f"Articles — processed={ar['processed']} skipped={ar['skipped']}")

        if do_clusters:
            cluster_batch = max(1, args.batch_size // 3)
            cr = summarize_unsummarized_clusters(db, batch_size=cluster_batch)
            print(f"Clusters — processed={cr['processed']} skipped={cr['skipped']}")
            # Stories summarized before slugs existed get theirs now, from today's title,
            # before any headline backfill could change the words (no API key needed)
            slugs = assign_missing_slugs(db)
            db.commit()
            print(f"Slugs — assigned={slugs}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
