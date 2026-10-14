"""Summarize Trend Radar topics and link the Sipply story that covers each one.

Usage (from backend/):
    python -m scripts.describe_signal_topics

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
from app.signals.config import radar_config
from app.signals.describe import run_describe

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    argparse.ArgumentParser(description="Describe Trend Radar topics").parse_args(argv)
    key = settings.openai_api_key
    if not key:
        logger.warning("describe_signal_topics skipped: OPENAI_API_KEY not set")
        return 0

    from openai import OpenAI

    client = OpenAI(api_key=key.get_secret_value(), timeout=60.0)
    with session_scope() as db:
        summary = run_describe(
            db, client, now=datetime.now(timezone.utc), window_days=radar_config().window_days
        )
    print(
        f"Done — pending={summary['pending']} described={summary['described']} "
        f"covered={summary['covered']} failed={summary['failed']} cost=${summary['cost_usd']}"
    )
    return 1 if summary["failed"] and not summary["described"] else 0


if __name__ == "__main__":
    sys.exit(main())
