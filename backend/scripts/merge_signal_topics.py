"""Merge Trend Radar topics that cover the same story (see app/signals/merge.py).

Usage (from backend/):
    python -m scripts.merge_signal_topics

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
from app.signals.base import credentials_from_settings
from app.signals.config import radar_config
from app.signals.merge import run_merge

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    argparse.ArgumentParser(description="Merge duplicate Trend Radar topics").parse_args(argv)
    key = settings.openai_api_key
    if not key:
        logger.warning("merge_signal_topics skipped: OPENAI_API_KEY not set")
        return 0

    from openai import OpenAI

    client = OpenAI(api_key=key.get_secret_value(), timeout=60.0)
    with session_scope() as db:
        summary = run_merge(
            db,
            client,
            now=datetime.now(timezone.utc),
            window_days=radar_config().window_days,
            active_families=len(credentials_from_settings().active_families()),
        )
    print(
        f"Done — topics={summary['topics']} pairs={summary['pairs']} same={summary['same']} "
        f"merged_away={summary['merged_away']} cost=${summary.get('cost_usd', 0)}"
    )
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
