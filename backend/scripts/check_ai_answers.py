"""Ask an AI assistant with web search the Trend Radar questions; record what it cites.

Usage (from backend/):
    python -m scripts.check_ai_answers            # up to MAX_CHECKS questions
    python -m scripts.check_ai_answers --limit 3

The cron pipeline runs this once a day (ANSWER_CHECK_HOUR_UTC). Skipped when
OPENAI_API_KEY is not set. See app/signals/answers.py for what it costs.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone

from app.config import settings
from app.db import session_scope
from app.logging_config import configure_logging
from app.signals.answers import MAX_CHECKS, run_checks

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(description="Check what AI assistants cite for Trend Radar questions")
    parser.add_argument("--limit", type=int, default=MAX_CHECKS)
    args = parser.parse_args(argv)
    key = settings.openai_api_key
    if not key:
        logger.warning("check_ai_answers skipped: OPENAI_API_KEY not set")
        return 0

    from openai import OpenAI

    client = OpenAI(api_key=key.get_secret_value(), timeout=120.0)
    with session_scope() as db:
        summary = run_checks(db, client, now=datetime.now(timezone.utc), limit=args.limit)
    print(
        f"Done — questions={summary['questions']} checked={summary['checked']} "
        f"sipply_cited={summary['sipply_cited']} failed={summary['failed']} cost=${summary['cost_usd']}"
    )
    return 1 if summary["failed"] and not summary["checked"] else 0


if __name__ == "__main__":
    sys.exit(main())
