"""Trim data the site no longer needs (app/services/data_retention.py).

Usage (from backend/):
    python -m scripts.prune_old_data
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone

from app.db import session_scope
from app.logging_config import configure_logging
from app.services.data_retention import prune_article_text

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    argparse.ArgumentParser(description="Trim data the site no longer needs").parse_args(argv)
    with session_scope() as db:
        trimmed = prune_article_text(db, now=datetime.now(timezone.utc))
    logger.info("prune_old_data article_text_trimmed=%d", trimmed)
    print(f"Done — article texts trimmed={trimmed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
