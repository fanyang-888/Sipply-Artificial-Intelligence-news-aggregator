"""Fetch Trend Radar signals (Hacker News, Google News, YouTube) into ``signals``.

Usage (from backend/):
    python -m scripts.ingest_signals

Sources and keywords live in app/signals/signal_sources.yaml. YouTube,
Bluesky and Threads are skipped until their keys are set. Exit code 1 only
when every source that ran failed.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone

from app.db import session_scope
from app.logging_config import configure_logging
from app.signals.base import credentials_from_settings
from app.signals.config import radar_config
from app.signals.ingest import run_ingest, signals_http_client

logger = logging.getLogger(__name__)


async def _run() -> int:
    async with signals_http_client() as client:
        with session_scope() as db:
            summary = await run_ingest(
                db, client, radar_config(), now=datetime.now(timezone.utc), credentials=credentials_from_settings()
            )
    for family, s in summary.items():
        print(
            f"{family:8s} status={s['status']:8s} items={s['items']:4d} "
            f"written={s['written']:4d} requests={s['requests']:3d}"
            + (f"  ({s['note']})" if s["note"] else "")
        )
    ran = [s for s in summary.values() if s["status"] != "skipped"]
    return 1 if ran and all(s["status"] == "failed" for s in ran) else 0


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    argparse.ArgumentParser(description="Fetch Trend Radar signals").parse_args(argv)
    return asyncio.run(_run())


if __name__ == "__main__":
    sys.exit(main())
