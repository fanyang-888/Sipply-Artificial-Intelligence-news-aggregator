"""Operator emails: a failed pipeline run, and once a day how the runs went.

Both go to ALERT_EMAIL through Resend (RESEND_API_KEY, RESEND_FROM, the same
account as the digest). With ALERT_EMAIL unset nothing is sent.
"""

from __future__ import annotations

import html
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.cluster import Cluster
from app.models.pipeline_run import PipelineRun

logger = logging.getLogger(__name__)

SITE_URL = os.getenv("SITE_URL", "https://www.sipply.dev").rstrip("/")
ADMIN_RUNS = f"{SITE_URL}/admin/pipeline-runs"

# A message is {"to": [...], "subject": str, "html": str, "text": str}
Sender = Callable[[dict[str, Any]], None]


def _recipient() -> str | None:
    return os.getenv("ALERT_EMAIL", "").strip() or None


def _resend_sender(message: dict[str, Any]) -> None:
    """Send through Resend; raises if the key is missing or the API refuses."""
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("RESEND_API_KEY not set")
    import resend  # imported lazily, like the digest

    resend.api_key = api_key
    resend.Emails.send({"from": os.getenv("RESEND_FROM", "Sipply <digest@sipply.dev>"), **message})


def _deliver(message: dict[str, Any], sender: Sender | None) -> str:
    try:
        (sender or _resend_sender)(message)
    except Exception as exc:
        logger.warning("alert email not sent (%s: %s)", type(exc).__name__, str(exc)[:200])
        return "failed"
    logger.info("alert email sent: %s", message["subject"])
    return "sent"


def send_failure_alert(
    stage_results: dict[str, Any],
    *,
    started_at: datetime,
    news_failed: bool,
    sender: Sender | None = None,
) -> str:
    """Email the failed stages of a run. Returns "sent", "skipped" or "failed"; never raises."""
    to = _recipient()
    failed = [name for name, r in stage_results.items() if isinstance(r, dict) and r.get("status") == "failed"]
    if not to or not failed:
        return "skipped"
    when = started_at.strftime("%Y-%m-%d %H:%M UTC")
    impact = (
        "The site was not updated: a news stage failed, so the cache was kept and nothing was submitted to search engines."
        if news_failed
        else "The site was updated; only best-effort stages failed (or an earlier run never finished)."
    )
    # A stage that knows why it failed says so ("interrupted_runs: run(s) started … stopped before finishing")
    def why(name: str) -> str:
        reason = stage_results[name].get("reason")
        return f": {reason}" if reason else ""

    lines = [f"- {name} ({stage_results[name].get('elapsed_sec', 0)}s){why(name)}" for name in failed]
    text = "\n".join([f"Pipeline run of {when}", impact, "", "Failed stages:", *lines, "", f"Run log: {ADMIN_RUNS}"])
    items = "".join(f"<li><code>{html.escape(name)}</code>{html.escape(why(name))}</li>" for name in failed)
    body = (
        f"<p>Pipeline run of {html.escape(when)}</p><p>{html.escape(impact)}</p>"
        f"<p>Failed stages:</p><ul>{items}</ul><p><a href=\"{ADMIN_RUNS}\">Run log</a></p>"
    )
    subject = f"Sipply pipeline: {len(failed)} stage{'s' if len(failed) != 1 else ''} failed ({', '.join(failed)})"
    return _deliver({"to": [to], "subject": subject, "html": body, "text": text}, sender)


def send_daily_summary(db: Session, *, now: datetime, sender: Sender | None = None) -> str:
    """Email the last 24 hours: each run (time, status, duration, failed stages), the new
    stories and how many URLs went to search engines. Returns "sent", "skipped" or "failed"."""
    to = _recipient()
    if not to:
        return "skipped"
    since = now - timedelta(hours=24)
    runs = db.execute(
        select(PipelineRun).where(PipelineRun.started_at >= since, PipelineRun.started_at <= now).order_by(PipelineRun.started_at)
    ).scalars().all()
    new_stories = db.execute(select(func.count()).select_from(Cluster).where(Cluster.first_seen_at >= since)).scalar_one()

    lines: list[str] = []
    submitted = 0
    failed_runs = 0
    for run in runs:
        results = run.stage_results or {}
        failed = [n for n, r in results.items() if isinstance(r, dict) and r.get("status") == "failed"]
        failed_runs += run.status == "failed"
        submitted += int((results.get("notify_indexnow") or {}).get("submitted") or 0)
        elapsed = f"{round(run.total_elapsed_sec or 0)}s"
        # The DB session may hand times back in its own zone; the summary speaks UTC like the cron
        start = run.started_at.astimezone(timezone.utc)
        lines.append(f"{start:%H:%M} UTC  {run.status:<7}  {elapsed}" + (f"  {', '.join(failed)}" if failed else ""))

    stories = f"{new_stories} new {'story' if new_stories == 1 else 'stories'}"
    health = f"{len(runs)} run{'s' if len(runs) != 1 else ''}" + (f", {failed_runs} failed" if failed_runs else ", all ok")
    subject = f"Sipply daily: {health} · {stories} · {submitted} URLs to search engines"
    text = "\n".join([f"Last 24 hours, to {now:%Y-%m-%d %H:%M} UTC", "", *lines, "", stories, f"{submitted} URLs submitted to IndexNow", "", f"Run log: {ADMIN_RUNS}"])
    body = (
        f"<p>Last 24 hours, to {now:%Y-%m-%d %H:%M} UTC</p>"
        f"<pre style=\"font-family:Menlo,Consolas,monospace;font-size:13px\">{html.escape(chr(10).join(lines))}</pre>"
        f"<p>{html.escape(stories)} · {submitted} URLs submitted to IndexNow</p><p><a href=\"{ADMIN_RUNS}\">Run log</a></p>"
    )
    return _deliver({"to": [to], "subject": subject, "html": body, "text": text}, sender)
