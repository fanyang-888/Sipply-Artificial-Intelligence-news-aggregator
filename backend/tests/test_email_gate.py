"""The digest email goes out once a day, on the 20:00 UTC cron run only.

Drives the real run_pipeline.main() with every stage and the pipeline_runs
bookkeeping stubbed out, and a faked start time.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

import scripts.run_pipeline as rp


@pytest.fixture(autouse=True)
def _no_interrupted_runs(monkeypatch):
    """main() checks the database for runs that never finished; these tests have none."""
    monkeypatch.setattr(rp, "_previous_interrupted", lambda now: None)


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

    def _run(hour: int, triggered_by: str = "cron", force: bool = False, day: int = 25):
        # 2026-09-25 is a Friday; day=28 is the next Monday
        class FakeDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 9, day, hour, 0, 30, tzinfo=timezone.utc)

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
    assert len(content_stages) == 17  # + relate_stories
    # Related stories are worked out once titles and translations are final
    assert content_stages.index("relate_stories") == content_stages.index("backfill_headlines") + 1
    # Duplicates are merged before summarize, so the kept story is summarized over all its sources
    assert content_stages.index("merge_duplicate_stories") == content_stages.index("dedup_clusters") + 1


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


@pytest.mark.parametrize(
    "stage",
    ["merge_duplicate_stories", "relate_stories", "ingest_signals", "build_signal_topics", "merge_signal_topics", "translate_signals", "describe_signal_topics"],
)
def test_best_effort_stage_failure_does_not_fail_the_pipeline(run_with_failure, stage):
    code, recorded = run_with_failure(stage)
    assert code == 0
    assert recorded["_status"] == "success"
    assert recorded[stage]["status"] == "failed"  # still visible in the admin run log


def test_news_stage_failure_still_fails_the_pipeline(run_with_failure):
    code, recorded = run_with_failure("summarize")
    assert code == 1
    assert recorded["_status"] == "failed"


def test_ai_answer_check_runs_once_a_week_by_default(run, monkeypatch):
    monkeypatch.delenv("ANSWER_CHECKS_ENABLED", raising=False)
    _, executed, _ = run(14, day=28)
    assert "check_ai_answers" in executed  # Monday's 14:00 UTC cron run: about $0.18 a week
    for day, hour in ((25, 14), (28, 8), (28, 20), (29, 14)):
        _, executed, recorded = run(hour, day=day)
        assert "check_ai_answers" not in executed, (day, hour)
        assert recorded["check_ai_answers"]["status"] == "skipped"
    _, executed, _ = run(14, triggered_by="manual", day=28)
    assert "check_ai_answers" not in executed


def test_ai_answer_check_can_be_switched_off(run, monkeypatch):
    monkeypatch.setenv("ANSWER_CHECKS_ENABLED", "off")
    _, executed, recorded = run(14, day=28)
    assert "check_ai_answers" not in executed and recorded["check_ai_answers"]["status"] == "skipped"


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


@pytest.fixture
def indexnow_calls(monkeypatch):
    """Search-engine submissions the pipeline makes (network and DB stubbed)."""
    calls: list[list[str]] = []
    urls = ["https://www.sipply.dev/", "https://www.sipply.dev/cluster/x"]
    monkeypatch.setattr("app.services.indexnow.changed_urls", lambda db, *, since, now: urls)
    monkeypatch.setattr(
        "app.services.indexnow.submit",
        lambda u: calls.append(u) or {"status": "ok", "submitted": len(u), "http_status": 200},
    )
    return calls


def test_successful_production_run_tells_search_engines_what_changed(run, monkeypatch, indexnow_calls):
    monkeypatch.setenv("APP_ENV", "production")
    code, _, recorded = run(8)
    assert code == 0
    assert indexnow_calls == [["https://www.sipply.dev/", "https://www.sipply.dev/cluster/x"]]
    assert recorded["notify_indexnow"] == {"status": "ok", "submitted": 2, "http_status": 200}


def test_runs_outside_production_never_submit(run, monkeypatch, indexnow_calls):
    monkeypatch.setenv("APP_ENV", "development")
    _, _, recorded = run(8)
    assert indexnow_calls == []
    assert recorded["notify_indexnow"]["status"] == "skipped"


def test_a_failed_news_run_submits_nothing(run_with_failure, monkeypatch, indexnow_calls):
    monkeypatch.setenv("APP_ENV", "production")
    code, recorded = run_with_failure("summarize")
    assert code == 1
    assert indexnow_calls == []
    assert recorded["notify_indexnow"]["status"] == "skipped"


@pytest.fixture
def operator_emails(monkeypatch):
    """Operator emails the pipeline asks for (sending stubbed)."""
    asked: list[tuple] = []
    monkeypatch.setattr(
        "app.services.alerts.send_failure_alert",
        lambda results, *, started_at, news_failed: asked.append(("failure", sorted(n for n, r in results.items() if r.get("status") == "failed"), news_failed)) or "sent",
    )
    monkeypatch.setattr("app.services.alerts.send_daily_summary", lambda db, *, now: asked.append(("daily",)) or "sent")
    return asked


def test_a_failed_radar_stage_alerts_but_the_site_still_updates(run_with_failure, operator_emails):
    code, recorded = run_with_failure("ingest_signals")
    assert code == 0
    assert operator_emails == [("failure", ["ingest_signals"], False)]


def test_a_failed_news_stage_alerts_that_the_site_was_not_updated(run_with_failure, operator_emails):
    code, _ = run_with_failure("summarize")
    assert code == 1
    assert operator_emails == [("failure", ["summarize"], True)]


def test_clean_runs_send_nothing_and_the_evening_run_sends_the_daily_summary(run, operator_emails):
    run(8)
    assert operator_emails == []
    run(20)
    assert operator_emails == [("daily",)]


def test_an_email_problem_never_fails_the_pipeline(run_with_failure, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("resend down")

    monkeypatch.setattr("app.services.alerts.send_failure_alert", boom)
    code, recorded = run_with_failure("ingest_signals")
    assert code == 0 and recorded["_status"] == "success"


@pytest.fixture
def after_run(monkeypatch):
    """What the pipeline does with the site after a run, in order (network and DB stubbed)."""
    order: list[str] = []
    monkeypatch.setattr("app.services.site_revalidate.revalidate_tags", lambda db, *, since: ["run", "story-id:x"])
    monkeypatch.setattr(
        "app.services.site_revalidate.submit",
        lambda tags: order.append(f"revalidate {' '.join(tags)}") or {"status": "ok", "tags": len(tags), "http_status": 200},
    )
    monkeypatch.setattr("app.services.page_warm.warm_pages", lambda *a, **k: order.append("warm") or {})
    monkeypatch.setattr("app.services.indexnow.changed_urls", lambda db, *, since, now: ["https://www.sipply.dev/"])
    monkeypatch.setattr("app.services.indexnow.submit", lambda u: order.append("indexnow") or {"status": "ok"})
    return order


def test_a_successful_run_has_the_site_rebuild_what_changed_before_warming_it(run, monkeypatch, after_run):
    monkeypatch.setenv("APP_ENV", "production")
    code, _, recorded = run(8)
    assert code == 0
    # Rebuild marks first, so the warm-up and the crawlers IndexNow sends get the new pages
    assert after_run == ["revalidate run story-id:x", "warm", "indexnow"]
    assert recorded["revalidate_site"] == {"status": "ok", "tags": 2, "http_status": 200}


def test_the_site_is_left_alone_by_local_and_failed_runs(run, run_with_failure, monkeypatch, after_run):
    monkeypatch.setenv("APP_ENV", "development")
    _, _, recorded = run(8)
    assert recorded["revalidate_site"]["status"] == "skipped" and not any(s.startswith("revalidate") for s in after_run)
    monkeypatch.setenv("APP_ENV", "production")
    _, recorded = run_with_failure("summarize")
    assert recorded["revalidate_site"]["status"] == "skipped"


def test_a_run_that_never_finished_is_reported_by_the_next_one(run, monkeypatch, operator_emails):
    note = {"status": "failed", "reason": "run(s) started 2026-10-20 14:03 UTC stopped before finishing"}
    monkeypatch.setattr(rp, "_previous_interrupted", lambda now: note)
    code, _, recorded = run(8)
    assert code == 0  # this run itself is fine
    assert recorded["interrupted_runs"] == note
    assert operator_emails == [("failure", ["interrupted_runs"], False)]
