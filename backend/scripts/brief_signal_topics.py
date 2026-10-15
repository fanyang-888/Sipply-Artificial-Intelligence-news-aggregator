"""Write content briefs for Trend Radar topics Sipply hasn't covered yet.

Usage (from backend/):
    python -m scripts.brief_signal_topics

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
from app.signals.briefs import run_briefs

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    argparse.ArgumentParser(description="Brief Trend Radar topics Sipply hasn't covered").parse_args(argv)
    key = settings.openai_api_key
    if not key:
        logger.warning("brief_signal_topics skipped: OPENAI_API_KEY not set")
        return 0

    from openai import OpenAI

    client = OpenAI(api_key=key.get_secret_value(), timeout=90.0)
    with session_scope() as db:
        summary = run_briefs(db, client, now=datetime.now(timezone.utc))
    print(
        f"Done — pending={summary['pending']} briefed={summary['briefed']} "
        f"failed={summary['failed']} cost=${summary['cost_usd']}"
    )
    return 1 if summary["failed"] and not summary["briefed"] else 0


if __name__ == "__main__":
    sys.exit(main())
