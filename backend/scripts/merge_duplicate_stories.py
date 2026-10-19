"""Merge stories that report the same event in different words (app/services/story_merge.py).

Usage (from backend/):
    python -m scripts.merge_duplicate_stories

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
from app.services.story_merge import run_story_merge

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    argparse.ArgumentParser(description="Merge stories that report the same event").parse_args(argv)
    key = settings.openai_api_key
    if not key:
        logger.warning("merge_duplicate_stories skipped: OPENAI_API_KEY not set")
        return 0

    from openai import OpenAI

    client = OpenAI(api_key=key.get_secret_value(), timeout=60.0)
    with session_scope() as db:
        summary = run_story_merge(db, client, now=datetime.now(timezone.utc))
    print(
        f"Done — stories={summary['stories']} pairs={summary['pairs']} same={summary['same']} "
        f"merged={summary['merged']} failed={summary['failed']} cost=${summary['cost_usd']}"
    )
    return 1 if summary["failed"] and summary["failed"] == summary["pairs"] else 0


if __name__ == "__main__":
    sys.exit(main())
