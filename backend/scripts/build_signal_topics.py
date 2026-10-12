"""Group recent signals into scored Trend Radar topics (rebuilds ``signal_topics``).

Usage (from backend/):
    python -m scripts.build_signal_topics
"""

from __future__ import annotations

import argparse
import logging
import sys

from app.config import settings
from app.db import session_scope
from app.logging_config import configure_logging
from app.signals.config import radar_config
from app.signals.topics import build_topics

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    argparse.ArgumentParser(description="Build Trend Radar topics").parse_args(argv)
    # HN and Google News always run; YouTube only with a key
    active_families = 3 if settings.youtube_api_key else 2
    with session_scope() as db:
        summary = build_topics(
            db, window_days=radar_config().window_days, active_families=active_families
        )
    print(
        f"Done — signals={summary['signals']} groups={summary['groups']} "
        f"topics={summary['topics']} rising={summary['rising']} pruned={summary['pruned']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
