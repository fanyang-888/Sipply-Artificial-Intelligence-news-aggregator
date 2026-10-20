"""Telling the operator when a pipeline run fails, and once a day how runs went."""

from __future__ import annotations

from datetime import datetime, timezone

from app.services import alerts

STARTED = datetime(2026, 10, 16, 8, 2, tzinfo=timezone.utc)


def outbox():
    sent: list[dict] = []
    return sent, sent.append


def test_a_failed_stage_emails_the_operator(monkeypatch):
    monkeypatch.setenv("ALERT_EMAIL", "ops@example.test")
    sent, sender = outbox()
    result = alerts.send_failure_alert(
        {
            "score_articles": {"status": "ok", "elapsed_sec": 1.0},
            "summarize": {"status": "failed", "elapsed_sec": 3.1},
            "ingest_signals": {"status": "failed", "elapsed_sec": 2.0},
        },
        started_at=STARTED,
        news_failed=True,
        sender=sender,
    )
    assert result == "sent"
    assert sent[0]["to"] == ["ops@example.test"]
    assert sent[0]["subject"] == "Sipply pipeline: 2 stages failed (summarize, ingest_signals)"
    assert "The site was not updated" in sent[0]["text"]
    assert "/admin/pipeline-runs" in sent[0]["html"]


def test_the_alert_says_why_when_a_stage_gives_a_reason(monkeypatch):
    monkeypatch.setenv("ALERT_EMAIL", "ops@example.test")
    sent, sender = outbox()
    note = {"status": "failed", "reason": "run(s) started 2026-10-20 14:03 UTC stopped before finishing"}
    alerts.send_failure_alert({"interrupted_runs": note}, started_at=STARTED, news_failed=False, sender=sender)
    assert "- interrupted_runs (0s): run(s) started 2026-10-20 14:03 UTC stopped before finishing" in sent[0]["text"]
    assert "stopped before finishing" in sent[0]["html"]


def test_no_alert_without_a_recipient_or_a_failure(monkeypatch):
    sent, sender = outbox()
    failed = {"summarize": {"status": "failed", "elapsed_sec": 1.0}}
    monkeypatch.delenv("ALERT_EMAIL", raising=False)
    assert alerts.send_failure_alert(failed, started_at=STARTED, news_failed=True, sender=sender) == "skipped"
    monkeypatch.setenv("ALERT_EMAIL", "ops@example.test")
    ok = {"summarize": {"status": "ok", "elapsed_sec": 1.0}, "check_ai_answers": {"status": "skipped"}}
    assert alerts.send_failure_alert(ok, started_at=STARTED, news_failed=False, sender=sender) == "skipped"
    assert sent == []


def test_a_refused_send_is_reported_not_raised(monkeypatch):
    monkeypatch.setenv("ALERT_EMAIL", "ops@example.test")

    def refuse(message):
        raise RuntimeError("422 domain not verified")

    failed = {"ingest_signals": {"status": "failed", "elapsed_sec": 1.0}}
    assert alerts.send_failure_alert(failed, started_at=STARTED, news_failed=False, sender=refuse) == "failed"


def test_the_daily_summary_lists_the_days_runs_new_stories_and_submissions(db, make_cluster, monkeypatch):
    import uuid
    from datetime import timedelta

    from app.models.pipeline_run import PipelineRun

    monkeypatch.setenv("ALERT_EMAIL", "ops@example.test")
    now = datetime(2026, 10, 16, 20, 6, tzinfo=timezone.utc)

    def run(hour, status, elapsed, results):
        start = now.replace(hour=hour, minute=2)
        db.add(PipelineRun(id=uuid.uuid4(), started_at=start, finished_at=start, status=status,
                           total_elapsed_sec=elapsed, stage_results=results, triggered_by="cron"))

    run(2, "success", 213.0, {"notify_indexnow": {"status": "ok", "submitted": 12}})
    run(8, "success", 170.0, {"notify_indexnow": {"status": "ok", "submitted": 9}})
    run(14, "failed", 388.0, {"summarize": {"status": "failed"}, "notify_indexnow": {"status": "skipped"}})
    db.add(PipelineRun(id=uuid.uuid4(), started_at=now - timedelta(hours=30), status="success", triggered_by="cron"))
    make_cluster(first_seen_at=now - timedelta(hours=2))
    make_cluster(first_seen_at=now - timedelta(hours=30))
    db.flush()

    sent, sender = outbox()
    assert alerts.send_daily_summary(db, now=now, sender=sender) == "sent"
    message = sent[0]
    assert message["subject"] == "Sipply daily: 3 runs, 1 failed · 1 new story · 21 URLs to search engines"
    assert "02:02 UTC  success  213s" in message["text"]
    assert "14:02 UTC  failed   388s  summarize" in message["text"]
