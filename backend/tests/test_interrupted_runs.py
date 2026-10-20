"""A run stopped before it finished (a redeploy, a crash, the timeout) is closed by the next run."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import scripts.run_pipeline as rp

NOW = datetime(2026, 10, 20, 20, 0, tzinfo=timezone.utc)


def test_the_next_run_closes_runs_left_running(db):
    from sqlalchemy import delete

    from app.models.pipeline_run import PipelineRun

    db.execute(delete(PipelineRun))
    stopped = PipelineRun(id=uuid.uuid4(), started_at=NOW - timedelta(hours=6), status="running", triggered_by="cron")
    still_going = PipelineRun(id=uuid.uuid4(), started_at=NOW - timedelta(minutes=20), status="running", triggered_by="manual")
    done = PipelineRun(id=uuid.uuid4(), started_at=NOW - timedelta(hours=12), status="success", triggered_by="cron")
    db.add_all([stopped, still_going, done])
    db.flush()

    closed = rp.close_interrupted_runs(db, now=NOW)
    assert closed == [stopped.started_at]
    db.refresh(stopped)
    assert stopped.status == "failed" and stopped.finished_at == NOW
    assert stopped.stage_results["interrupted"]["status"] == "failed"
    # One that may still be running (a manual run, inside the timeout) is left alone
    assert still_going.status == "running" and done.status == "success"
    assert rp.close_interrupted_runs(db, now=NOW) == []
