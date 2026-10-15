"""Resend-backed email service for Sipply digest emails.

Usage:
    from app.services.email_service import send_digest_email

    sent, failed = send_digest_email(clusters, subscribers)

Requires:
    RESEND_API_KEY   — Resend API key (https://resend.com)
    RESEND_FROM      — Verified sender address (default: digest@sipply.dev)
"""

from __future__ import annotations

import html
import logging
import os
from datetime import date
from typing import TYPE_CHECKING

from app.services.text_clean import clean_title

if TYPE_CHECKING:
    from app.models.cluster import Cluster
    from app.models.subscriber import Subscriber

logger = logging.getLogger(__name__)

_FROM = os.getenv("RESEND_FROM", "Sipply <digest@sipply.dev>")
_SITE = "https://sipply.dev"


# ---------------------------------------------------------------------------
# HTML builder
# ---------------------------------------------------------------------------

def _build_html(clusters: list["Cluster"], today: date) -> str:
    date_str = today.strftime("%B %-d, %Y")

    # Top cluster (featured)
    featured = clusters[0] if clusters else None
    rest = clusters[1:4]  # up to 3 more

    featured_block = ""
    if featured:
        # Feed titles may carry leftover entities; decode, then escape for HTML
        title = html.escape(clean_title(featured.representative_title) or "Today's top story")
        summary = html.escape(featured.summary or "")
        featured_block = f"""
        <div style="background:#f0f7ff;border-left:4px solid #0ea5e9;padding:16px 20px;border-radius:6px;margin-bottom:24px;">
          <p style="margin:0 0 6px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Featured Story</p>
          <h2 style="margin:0 0 10px;font-size:18px;color:#0f172a;line-height:1.4;">{title}</h2>
          {f'<p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.6;">{summary[:300]}{"…" if len(summary) > 300 else ""}</p>' if summary else ""}
          <a href="{_SITE}" style="font-size:13px;color:#0ea5e9;text-decoration:none;font-weight:600;">Read full story →</a>
        </div>
        """

    more_block = ""
    if rest:
        items = "".join(
            f'<li style="margin-bottom:10px;font-size:14px;color:#334155;line-height:1.5;">'
            f'<strong>{html.escape(clean_title(c.representative_title) or "Story")}</strong>'
            f'{"<br><span style=\'color:#64748b;font-size:13px;\'>" + html.escape((c.summary or "")[:120]) + "…</span>" if c.summary else ""}'
            f"</li>"
            for c in rest
        )
        more_block = f"""
        <h3 style="margin:0 0 12px;font-size:15px;color:#0f172a;">More stories today</h3>
        <ul style="margin:0 0 24px;padding-left:18px;">{items}</ul>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:#0e3f62;padding:24px 32px;">
      <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-.3px;">Sipply</p>
      <p style="margin:4px 0 0;font-size:13px;color:#7dd3fc;">AI Intelligence Digest · {date_str}</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      {featured_block}
      {more_block}
      <a href="{_SITE}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;">Open today's full digest</a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;">
      <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
        You're receiving this because you subscribed at <a href="{_SITE}" style="color:#0ea5e9;text-decoration:none;">sipply.dev</a>.
        To unsubscribe, reply with "unsubscribe" in the subject.
      </p>
    </div>

  </div>
</body>
</html>"""


def _build_text(clusters: list["Cluster"], today: date) -> str:
    date_str = today.strftime("%B %-d, %Y")
    lines = [f"SIPPLY — AI Intelligence Digest · {date_str}", "=" * 50, ""]
    for i, c in enumerate(clusters[:4]):
        prefix = "FEATURED: " if i == 0 else f"{i}. "
        lines.append(f"{prefix}{clean_title(c.representative_title) or 'Story'}")
        if c.summary:
            lines.append(c.summary[:200] + ("…" if len(c.summary) > 200 else ""))
        lines.append("")
    lines += [f"Read more: {_SITE}", "", "---", "Unsubscribe: reply with 'unsubscribe' in subject"]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Send
# ---------------------------------------------------------------------------

def send_digest_email(
    clusters: list["Cluster"],
    subscribers: list["Subscriber"],
    *,
    today: date | None = None,
) -> tuple[int, int]:
    """Send today's digest to all subscribers.

    Returns (sent_count, failed_count).
    Requires RESEND_API_KEY env var; silently skips if not set.
    """
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not api_key:
        logger.warning("email_service: RESEND_API_KEY not set — skipping digest email")
        return 0, 0

    if not subscribers:
        logger.info("email_service: no subscribers — nothing to send")
        return 0, 0

    if not clusters:
        logger.warning("email_service: no clusters — skipping digest email")
        return 0, 0

    import resend  # imported lazily so missing package never crashes import-time
    resend.api_key = api_key

    today = today or date.today()
    subject = f"Sipply Digest — {today.strftime('%B %-d, %Y')}"
    html = _build_html(clusters, today)
    text = _build_text(clusters, today)

    sent = 0
    failed = 0
    for sub in subscribers:
        try:
            resend.Emails.send({
                "from": _FROM,
                "to": [sub.email],
                "subject": subject,
                "html": html,
                "text": text,
            })
            sent += 1
            logger.debug("email sent to %s", sub.email)
        except Exception:
            logger.exception("email_service: failed to send to %s", sub.email)
            failed += 1

    logger.info("email_service: sent=%d failed=%d", sent, failed)
    return sent, failed
