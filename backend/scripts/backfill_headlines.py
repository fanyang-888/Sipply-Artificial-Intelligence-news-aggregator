"""Write Sipply's own headlines for stories summarized before headlines existed.

A few per run, newest first, back 60 days (app/services/headlines.py). New
stories get theirs with the summary, so this runs out on its own. Their URLs
(slugs) stay as they are.

Usage (from backend/):
    python -m scripts.backfill_headlines [--limit N]

Skipped when OPENAI_API_KEY is not set.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone

from app.config import settings
from app.db import session_scope
from app.logging_config import configure_logging
from app.services.headlines import backfill_headlines

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description="Backfill Sipply headlines for older stories")
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args(argv)
    key = settings.openai_api_key
    if not key:
        logger.warning("backfill_headlines skipped: OPENAI_API_KEY not set")
        return 0

    from openai import OpenAI

    client = OpenAI(api_key=key.get_secret_value(), timeout=90.0)
    with session_scope() as db:
        result = backfill_headlines(db, client, now=datetime.now(timezone.utc), limit=args.limit)
    print(f"Done — written={result['written']} unusable={result['unusable']} failed={result['failed']} cost=${result['cost_usd']}")
    return 1 if result["failed"] and not result["written"] else 0


if __name__ == "__main__":
    sys.exit(main())
