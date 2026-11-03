"""Pipeline stage: send today's digest email to every confirmed subscriber.

Run from backend/:
    python -m scripts.send_digest_email
    python -m scripts.send_digest_email --dry-run   # list recipients, don't send

Requires RESEND_API_KEY in env (or .env).
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.crud.cluster import get_top_clusters
from app.db import session_scope
from app.logging_config import configure_logging
from app.services.email_service import send_digest_email
from app.services.subscriptions import digest_recipients

configure_logging()
logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description="Send digest email to subscribers")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List recipients and cluster titles; do not send",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=4,
        help="Number of top clusters to include (default: 4)",
    )
    args = parser.parse_args(argv)

    with session_scope() as db:
        clusters = get_top_clusters(db, limit=args.limit)
        subscribers = digest_recipients(db)

        logger.info(
            "send_digest_email: clusters=%d subscribers=%d dry_run=%s",
            len(clusters),
            len(subscribers),
            args.dry_run,
        )

        if args.dry_run:
            print(f"\nDRY RUN — {len(subscribers)} subscriber(s), {len(clusters)} cluster(s)\n")
            print("Clusters:")
            for i, c in enumerate(clusters):
                print(f"  {i+1}. {c.representative_title}")
            print("\nRecipients:")
            for s in subscribers:
                print(f"  {s.email}")
            return 0

        sent, failed = send_digest_email(clusters, subscribers)

    logger.info("send_digest_email done: sent=%d failed=%d", sent, failed)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
