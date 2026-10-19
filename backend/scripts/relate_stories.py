"""Work out each story's related stories once per run (app/services/related.py), so the
story API reads them instead of computing them on every request.

Usage (from backend/):
    python -m scripts.relate_stories
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone

from app.db import session_scope
from app.logging_config import configure_logging
from app.services.related import assign_related

logger = logging.getLogger(__name__)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    argparse.ArgumentParser(description="Work out related stories").parse_args(argv)
    with session_scope() as db:
        summary = assign_related(db, now=datetime.now(timezone.utc))
    logger.info("relate_stories %s", summary)
    print(f"Done — stories={summary['stories']} related={summary['related']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
