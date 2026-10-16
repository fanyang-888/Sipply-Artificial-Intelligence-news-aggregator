"""The digest email goes out once a day, on the 20:00 UTC cron run only.

Drives the real run_pipeline.main() with every stage and the pipeline_runs
bookkeeping stubbed out, and a faked start time.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

import scripts.run_pipeline as rp


@pytest.fixture
def run(monkeypatch):
    executed: list[str] = []
    recorded: dict = {}

    def fake_stage(name, fn):
        executed.append(name)
        return True, 0.01

    def fake_finish(run_id, *, status, stage_results, total_elapsed_sec):
        recorded.update(stage_results)

    monkeypatch.setattr(rp, "_run_stage", fake_stage)
    monkeypatch.setattr(rp, "_create_run", lambda triggered_by: "run-id")
    monkeypatch.setattr(rp, "_finish_run", fake_finish)
    monkeypatch.setattr(rp, "_install_timeout", lambda sec: None)

    def _run(hour: int, triggered_by: str = "cron", force: bool = False):
        class FakeDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 9, 25, hour, 0, 30, tzinfo=timezone.utc)

        monkeypatch.setattr(rp, "datetime", FakeDateTime)
        executed.clear()
        recorded.clear()
        code = rp.main(triggered_by=triggered_by, force_email=force)
        return code, executed, recorded

    return _run


@pytest.mark.parametrize("hour", [2, 8, 14])
def test_earlier_cron_runs_skip_the_email(run, hour):
    code, executed, recorded = run(hour)
    assert code == 0
    assert "send_digest_email" not in executed
    assert recorded["send_digest_email"]["status"] == "skipped"


def test_last_cron_run_sends_the_email(run):
    code, executed, recorded = run(20)
    assert code == 0
    assert executed[-1] == "send_digest_email"
    assert recorded["send_digest_email"]["status"] == "ok"


def test_manual_run_at_the_email_hour_does_not_send(run):
    _, executed, recorded = run(20, triggered_by="manual")
    assert "send_digest_email" not in executed
    assert recorded["send_digest_email"]["status"] == "skipped"


def test_force_email_sends_on_any_run(run):
    _, executed, _ = run(9, triggered_by="manual", force=True)
    assert "send_digest_email" in executed


def test_content_stages_run_every_time(run):
    _, skipped_run, _ = run(2)
    content_stages = list(skipped_run)
    _, email_run, _ = run(20)
    assert [s for s in email_run if s != "send_digest_email"] == content_stages
    assert len(content_stages) == 14


@pytest.fixture
def run_with_failure(monkeypatch):
    """Like ``run`` but the named stage fails; returns (exit code, recorded results)."""
    recorded: dict = {}

    def _run(failing: str):
        def fake_stage(name, fn):
            return name != failing, 0.01

        def fake_finish(run_id, *, status, stage_results, total_elapsed_sec):
            recorded.update(stage_results, _status=status)

        monkeypatch.setattr(rp, "_run_stage", fake_stage)
        monkeypatch.setattr(rp, "_create_run", lambda triggered_by: "run-id")
        monkeypatch.setattr(rp, "_finish_run", fake_finish)
        monkeypatch.setattr(rp, "_install_timeout", lambda sec: None)
        recorded.clear()
        return rp.main(triggered_by="manual"), recorded

    return _run


@pytest.mark.parametrize("stage", ["ingest_signals", "build_signal_topics", "merge_signal_topics", "translate_signals", "describe_signal_topics"])
def test_trend_radar_failure_does_not_fail_the_pipeline(run_with_failure, stage):
    code, recorded = run_with_failure(stage)
    assert code == 0
    assert recorded["_status"] == "success"
    assert recorded[stage]["status"] == "failed"  # still visible in the admin run log


def test_news_stage_failure_still_fails_the_pipeline(run_with_failure):
    code, recorded = run_with_failure("summarize")
    assert code == 1
    assert recorded["_status"] == "failed"


def test_ai_answer_check_is_off_unless_enabled(run, monkeypatch):
    monkeypatch.delenv("ANSWER_CHECKS_ENABLED", raising=False)
    _, executed, recorded = run(14)
    assert "check_ai_answers" not in executed  # paid web searches, switched off by default
    assert recorded["check_ai_answers"]["status"] == "skipped"


def test_ai_answer_check_runs_once_a_day_when_enabled(run, monkeypatch):
    monkeypatch.setenv("ANSWER_CHECKS_ENABLED", "1")
    _, executed, recorded = run(14)
    assert "check_ai_answers" in executed  # the 14:00 UTC cron run only
    for hour in (2, 8, 20):
        _, executed, recorded = run(hour)
        assert "check_ai_answers" not in executed
        assert recorded["check_ai_answers"]["status"] == "skipped"
    _, executed, _ = run(14, triggered_by="manual")
    assert "check_ai_answers" not in executed


def test_ai_answer_check_failure_does_not_fail_the_pipeline(monkeypatch):
    recorded: dict = {}
    monkeypatch.setattr(rp, "_run_stage", lambda name, fn: (name != "check_ai_answers", 0.01))
    monkeypatch.setattr(rp, "_create_run", lambda triggered_by: "run-id")
    monkeypatch.setattr(rp, "_finish_run", lambda run_id, *, status, stage_results, total_elapsed_sec: recorded.update(stage_results, _status=status))
    monkeypatch.setattr(rp, "_install_timeout", lambda sec: None)
    assert rp.main(triggered_by="manual", check_answers=True) == 0
    assert recorded["check_ai_answers"]["status"] == "failed" and recorded["_status"] == "success"


def test_successful_run_warms_the_site_pages(run, monkeypatch):
    warmed: list[bool] = []
    monkeypatch.setattr("app.services.page_warm.warm_pages", lambda *a, **k: warmed.append(True) or {})
    code, _, _ = run(8)
    assert code == 0 and warmed == [True]


def test_failed_run_leaves_the_pages_alone(run, monkeypatch):
    warmed: list[bool] = []
    monkeypatch.setattr("app.services.page_warm.warm_pages", lambda *a, **k: warmed.append(True) or {})
    monkeypatch.setattr(rp, "_run_stage", lambda name, fn: (name != "cluster_articles", 0.01))
    code, _, _ = run(8)
    assert code == 1 and warmed == []
