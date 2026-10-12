"""
Daily pipeline orchestrator.

Runs all pipeline stages in sequence.  Designed to be invoked by a
Railway Cron service (see railway.cron.toml) but also works locally:

    cd backend/
    python -m scripts.run_pipeline
    python -m scripts.run_pipeline --triggered-by manual
    python -m scripts.run_pipeline --triggered-by manual --force-email

The pipeline runs several times a day, but the digest email goes out only
once: on the cron run that starts at DIGEST_EMAIL_HOUR_UTC (default 20, the
last run of the day). Other runs record send_digest_email as "skipped".

Exit code 0 = all stages succeeded.
Exit code 1 = one or more stages failed (details in logs).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

# Hard wall-clock timeout for the entire pipeline run.
# Default: 90 minutes.  Override via PIPELINE_TIMEOUT_MINUTES env var.
_PIPELINE_TIMEOUT_SECONDS = int(os.getenv("PIPELINE_TIMEOUT_MINUTES", "90")) * 60

# Must match one of the hours in railway.cron.toml's cronSchedule, or no email is ever sent.
_DIGEST_EMAIL_HOUR_UTC = int(os.getenv("DIGEST_EMAIL_HOUR_UTC", "20"))


# Trend Radar stages depend on third-party APIs; their failure is recorded in
# stage_results but doesn't mark the news pipeline as failed.
_BEST_EFFORT_STAGES = frozenset({"ingest_signals", "build_signal_topics", "translate_signals"})


def _is_digest_email_run(started_at: datetime, triggered_by: str) -> bool:
    """Only the scheduled run at the email hour sends; manual runs never do unless forced."""
    return triggered_by == "cron" and started_at.hour == _DIGEST_EMAIL_HOUR_UTC


def _install_timeout(timeout_sec: int) -> None:
    """Start a daemon thread that kills the process after timeout_sec.

    Uses threading.Timer instead of SIGALRM so it works reliably in Docker
    containers where signals may not be delivered to PID 1.
    """
    def _kill() -> None:
        logging.getLogger(__name__).critical(
            "pipeline TIMED OUT after %d minutes — aborting process",
            timeout_sec // 60,
        )
        os._exit(2)

    t = threading.Timer(timeout_sec, _kill)
    t.daemon = True  # cleaned up automatically if pipeline finishes normally
    t.start()


from app.db import session_scope  # noqa: E402
from app.logging_config import configure_logging  # noqa: E402
from app.models.pipeline_run import PipelineRun  # noqa: E402

configure_logging()
logger = logging.getLogger(__name__)


def _create_run(triggered_by: str) -> uuid.UUID:
    """Insert a new pipeline_run row with status=running; return its id."""
    with session_scope() as db:
        run = PipelineRun(
            id=uuid.uuid4(),
            started_at=datetime.now(timezone.utc),
            status="running",
            triggered_by=triggered_by,
        )
        db.add(run)
        db.commit()
        return run.id


def _finish_run(
    run_id: uuid.UUID,
    *,
    status: str,
    stage_results: dict[str, Any],
    total_elapsed_sec: float,
) -> None:
    """Update the pipeline_run row with final status and timing."""
    with session_scope() as db:
        run = db.get(PipelineRun, run_id)
        if run is None:
            return
        run.finished_at = datetime.now(timezone.utc)
        run.status = status
        run.stage_results = stage_results
        run.total_elapsed_sec = round(total_elapsed_sec, 2)
        db.commit()


def _run_stage(name: str, fn: Callable[[], int]) -> tuple[bool, float]:
    """Run fn(), log timing and result.  Returns (success, elapsed_sec)."""
    logger.info("pipeline  stage=%-22s  status=STARTING", name)
    t0 = time.monotonic()
    try:
        code = fn()
    except SystemExit as exc:
        code = int(exc.code) if exc.code is not None else 0
    except Exception:
        logger.exception("pipeline  stage=%s  status=EXCEPTION", name)
        elapsed = time.monotonic() - t0
        logger.error(
            "pipeline  stage=%-22s  status=FAILED    elapsed=%.1fs", name, elapsed
        )
        return False, elapsed
    elapsed = time.monotonic() - t0
    if code == 0:
        logger.info(
            "pipeline  stage=%-22s  status=OK        elapsed=%.1fs", name, elapsed
        )
        return True, elapsed
    logger.error(
        "pipeline  stage=%-22s  status=FAILED    elapsed=%.1fs  exit_code=%s",
        name,
        elapsed,
        code,
    )
    return False, elapsed


def main(triggered_by: str = "cron", force_email: bool = False) -> int:
    # Arm the hard timeout FIRST — this caps the entire run regardless of what hangs
    _install_timeout(_PIPELINE_TIMEOUT_SECONDS)
    # Decide on the email from the start time, not the (much later) email-stage time
    started_at = datetime.now(timezone.utc)
    send_email = force_email or _is_digest_email_run(started_at, triggered_by)
    logger.info(
        "========== daily pipeline starting  timeout=%dm  send_email=%s ==========",
        _PIPELINE_TIMEOUT_SECONDS // 60,
        send_email,
    )
    t_total = time.monotonic()

    # Record run start
    run_id = _create_run(triggered_by)
    stage_results: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Stage 1: ingest  (async; call _run() directly to avoid sys.argv)
    # ------------------------------------------------------------------
    from scripts import ingest_full_articles

    ingest_ok, ingest_elapsed = _run_stage(
        "ingest_full_articles",
        lambda: asyncio.run(
            ingest_full_articles._run(
                slug=None,
                per_source_limit=10,
                dry_run=False,
                force_retry_failures=False,
            )
        ),
    )
    stage_results["ingest_full_articles"] = {
        "status": "ok" if ingest_ok else "failed",
        "elapsed_sec": round(ingest_elapsed, 2),
    }

    if not ingest_ok:
        elapsed_total = time.monotonic() - t_total
        logger.error("pipeline ABORTED after ingest failure — total=%.1fs", elapsed_total)
        _finish_run(run_id, status="failed", stage_results=stage_results, total_elapsed_sec=elapsed_total)
        return 1

    # ------------------------------------------------------------------
    # Stages 2–11: synchronous
    # ------------------------------------------------------------------
    from scripts import (
        filter_articles,
        score_articles,
        cluster_articles,
        update_cluster_status,
        dedup_clusters,
        summarize,
        translate_clusters,
        ingest_signals,
        build_signal_topics,
        translate_signals,
        send_digest_email,
    )

    stages: list[tuple[str, Callable[[], int]]] = [
        ("filter_articles",       lambda: filter_articles.main([])),
        ("score_articles",        lambda: score_articles.main([])),
        ("cluster_articles",      lambda: cluster_articles.main([])),
        ("update_cluster_status", lambda: update_cluster_status.main([])),
        ("dedup_clusters",        lambda: dedup_clusters.main([])),
        ("summarize",             lambda: summarize.main([])),
        ("translate_clusters",    lambda: translate_clusters.main(["--batch-size", "50"])),
        ("ingest_signals",        lambda: ingest_signals.main([])),
        ("build_signal_topics",   lambda: build_signal_topics.main([])),
        ("translate_signals",     lambda: translate_signals.main([])),
    ]
    if send_email:
        stages.append(("send_digest_email", lambda: send_digest_email.main([])))

    failures: list[str] = []
    for name, fn in stages:
        ok, elapsed = _run_stage(name, fn)
        stage_results[name] = {
            "status": "ok" if ok else "failed",
            "elapsed_sec": round(elapsed, 2),
        }
        if not ok and name not in _BEST_EFFORT_STAGES:
            failures.append(name)
            # Continue — later stages can still run on already-processed rows.

    if not send_email:
        logger.info(
            "pipeline  stage=%-22s  status=SKIPPED   (email only on the %02d:00 UTC cron run)",
            "send_digest_email",
            _DIGEST_EMAIL_HOUR_UTC,
        )
        stage_results["send_digest_email"] = {"status": "skipped", "elapsed_sec": 0}

    elapsed_total = time.monotonic() - t_total
    final_status = "failed" if failures else "success"
    _finish_run(run_id, status=final_status, stage_results=stage_results, total_elapsed_sec=elapsed_total)

    # Bust API cache so next request reflects fresh data
    if not failures:
        try:
            from app.cache import cache_delete_pattern
            n = cache_delete_pattern("ai_tool:*")
            logger.info("pipeline cache invalidated keys=%s", n)
        except Exception:
            logger.warning("pipeline cache invalidation failed", exc_info=True)

    if failures:
        logger.error(
            "========== daily pipeline DONE  failures=%s  total=%.1fs ==========",
            failures,
            elapsed_total,
        )
        return 1

    logger.info(
        "========== daily pipeline DONE  all OK  total=%.1fs ==========",
        elapsed_total,
    )
    return 0


def _cli_main() -> None:
    parser = argparse.ArgumentParser(description="Run the full daily pipeline")
    parser.add_argument(
        "--triggered-by",
        default="cron",
        help='Label stored in pipeline_runs.triggered_by (default: "cron")',
    )
    parser.add_argument(
        "--force-email",
        action="store_true",
        help="Send the digest email on this run regardless of the hour",
    )
    args = parser.parse_args()
    sys.exit(main(triggered_by=args.triggered_by, force_email=args.force_email))


if __name__ == "__main__":
    _cli_main()
