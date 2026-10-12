"""Translate Trend Radar titles to Simplified Chinese (fills ``signals.title_zh``).

Usage (from backend/):
    python -m scripts.translate_signals

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
from app.signals.translate import run_translate

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    argparse.ArgumentParser(description="Translate Trend Radar titles to Chinese").parse_args(argv)
    key = settings.openai_api_key
    if not key:
        logger.warning("translate_signals skipped: OPENAI_API_KEY not set")
        return 0

    from openai import OpenAI

    client = OpenAI(api_key=key.get_secret_value(), timeout=60.0)
    with session_scope() as db:
        summary = run_translate(
            db, client, now=datetime.now(timezone.utc), window_days=radar_config().window_days
        )
    print(
        f"Done — pending={summary['pending']} translated={summary['translated']} "
        f"failed={summary['failed']} cost=${summary['cost_usd']}"
    )
    return 1 if summary["failed"] and not summary["translated"] else 0


if __name__ == "__main__":
    sys.exit(main())
