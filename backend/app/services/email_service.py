"""The emails subscribers get: the daily digest, and the link that confirms a sign-up.

Usage:
    from app.services.email_service import send_digest_email

    sent, failed = send_digest_email(clusters, subscribers)

Sent through app/services/mailer.py (RESEND_API_KEY, RESEND_FROM). Every digest
carries the subscriber's own unsubscribe link, in the footer and as a one-click
List-Unsubscribe header (RFC 8058); sipply.dev receives no mail, so nothing asks
the reader to reply. Links use SITE_URL, not the API's address: a link in an old
email must keep working.
"""

from __future__ import annotations

import html
import logging
import os
from datetime import date
from typing import TYPE_CHECKING

from app.services import mailer
from app.services.headlines import story_slug, story_title

if TYPE_CHECKING:
    from app.models.cluster import Cluster
    from app.models.subscriber import Subscriber

logger = logging.getLogger(__name__)

# The canonical origin (the apex redirects to www): links land on the page in one hop
_SITE = os.getenv("SITE_URL", "https://www.sipply.dev").rstrip("/")


# ---------------------------------------------------------------------------
# HTML builder
# ---------------------------------------------------------------------------

# The site's light theme, in colours mail clients can show: a serif headline,
# small mono capitals for labels, one accent, a white card on a pale page.
_SERIF = "Georgia, 'Times New Roman', serif"
_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
_MONO = "'SF Mono', Menlo, Consolas, 'Courier New', monospace"
_INK = "#0b1829"
_SOFT = "#344a63"
_MUTED = "#4a6480"
_ACCENT = "#1d6fe8"
_PAGE = "#f5f8ff"
_RULE = "rgba(11,24,41,.10)"
_LABEL = f"margin:0;font-family:{_MONO};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:{_MUTED};"


def _story_url(cluster: "Cluster") -> str:
    """The story's permanent address, /story/<slug>."""
    if getattr(cluster, "id", None) is None:
        return _SITE
    return f"{_SITE}/story/{story_slug(cluster)}"


def confirm_url(token: str, lang: str = "en") -> str:
    """The page that confirms a sign-up, in the language the reader signed up in."""
    return f"{_SITE}{'/zh' if lang == 'zh' else ''}/subscribe/confirm?token={token}"


def unsubscribe_url(token: str) -> str:
    """The page with the unsubscribe button: the link in the digest's footer."""
    return f"{_SITE}/unsubscribe?token={token}"


def one_click_unsubscribe_url(token: str) -> str:
    """Where a mail client POSTs "List-Unsubscribe=One-Click" (app/api/unsubscribe/route.ts)."""
    return f"{_SITE}/api/unsubscribe?token={token}"


def _build_html(clusters: list["Cluster"], today: date, *, unsubscribe: str) -> str:
    date_str = today.strftime("%B %-d, %Y")

    # Top cluster (featured)
    featured = clusters[0] if clusters else None
    rest = clusters[1:4]  # up to 3 more

    featured_block = ""
    if featured:
        # Feed titles may carry leftover entities; decode, then escape for HTML
        title = html.escape(story_title(featured) or "Today's top story")
        summary = html.escape(featured.summary or "")
        summary_html = (
            f'<p style="margin:0 0 20px;font-family:{_SANS};font-size:15.5px;line-height:1.65;color:{_SOFT};">'
            f'{summary[:320]}{"…" if len(summary) > 320 else ""}</p>'
            if summary
            else ""
        )
        featured_block = f"""
        <p style="{_LABEL}color:{_ACCENT};">Today's lead</p>
        <h2 style="margin:10px 0 14px;font-family:{_SERIF};font-size:27px;font-weight:normal;line-height:1.18;letter-spacing:-.01em;color:{_INK};">{title}</h2>
        {summary_html}
        <a href="{_story_url(featured)}" style="display:inline-block;background:{_INK};color:{_PAGE};text-decoration:none;padding:11px 20px;border-radius:999px;font-family:{_SANS};font-size:14px;font-weight:500;">Read the story &rarr;</a>
        """

    more_block = ""
    if rest:
        items = "".join(
            f'<tr><td style="padding:14px 0;border-top:1px solid {_RULE};">'
            f'<a href="{_story_url(c)}" style="font-family:{_SERIF};font-size:17px;line-height:1.3;color:{_INK};text-decoration:none;">'
            f'{html.escape(story_title(c) or "Story")}</a>'
            + (
                f'<p style="margin:5px 0 0;font-family:{_SANS};font-size:13.5px;line-height:1.5;color:{_MUTED};">'
                f'{html.escape((c.summary or "")[:140])}{"…" if len(c.summary or "") > 140 else ""}</p>'
                if c.summary
                else ""
            )
            + "</td></tr>"
            for c in rest
        )
        more_block = f"""
        <p style="{_LABEL}margin-top:36px;">More today</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px;border-collapse:collapse;">{items}</table>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{_PAGE};font-family:{_SANS};">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="background:#ffffff;border:1px solid {_RULE};border-radius:20px;box-shadow:0 18px 44px rgba(29,111,232,.08);overflow:hidden;">

      <!-- Header -->
      <div style="padding:26px 32px 0;">
        <p style="margin:0;font-family:{_SERIF};font-size:24px;line-height:1;color:{_INK};">Sip<span style="color:{_ACCENT};">ply</span></p>
        <p style="{_LABEL}margin-top:10px;">Daily digest &middot; {date_str}</p>
      </div>

      <!-- Body -->
      <div style="padding:30px 32px 32px;">
        {featured_block}
        {more_block}
        <p style="margin:32px 0 0;font-family:{_SANS};font-size:14px;">
          <a href="{_SITE}" style="color:{_ACCENT};text-decoration:none;font-weight:500;">Open today's full digest &rarr;</a>
        </p>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;border-top:1px solid {_RULE};background:{_PAGE};">
        <p style="margin:0;font-family:{_SANS};font-size:12px;line-height:1.6;color:{_MUTED};">
          You're receiving this because you subscribed at <a href="{_SITE}" style="color:{_ACCENT};text-decoration:none;">sipply.dev</a>.
          <a href="{unsubscribe}" style="color:{_ACCENT};">Unsubscribe</a>
        </p>
      </div>

    </div>
  </div>
</body>
</html>"""


def _build_text(clusters: list["Cluster"], today: date, *, unsubscribe: str) -> str:
    date_str = today.strftime("%B %-d, %Y")
    lines = [f"SIPPLY — Daily digest · {date_str}", "=" * 50, ""]
    for i, c in enumerate(clusters[:4]):
        prefix = "FEATURED: " if i == 0 else f"{i}. "
        lines.append(f"{prefix}{story_title(c) or 'Story'}")
        if c.summary:
            lines.append(c.summary[:200] + ("…" if len(c.summary) > 200 else ""))
        lines.append(_story_url(c))
        lines.append("")
    lines += [f"Read more: {_SITE}", "", "---", f"Unsubscribe: {unsubscribe}"]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Send
# ---------------------------------------------------------------------------

def digest_message(clusters: list["Cluster"], subscriber: "Subscriber", today: date) -> mailer.Message:
    """Today's digest for one subscriber, with their own unsubscribe link."""
    unsubscribe = unsubscribe_url(subscriber.token)
    return {
        "to": [subscriber.email],
        "subject": f"Sipply Digest — {today.strftime('%B %-d, %Y')}",
        "html": _build_html(clusters, today, unsubscribe=unsubscribe),
        "text": _build_text(clusters, today, unsubscribe=unsubscribe),
        "headers": {
            "List-Unsubscribe": f"<{one_click_unsubscribe_url(subscriber.token)}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    }


def send_digest_email(
    clusters: list["Cluster"],
    subscribers: list["Subscriber"],
    *,
    today: date | None = None,
) -> tuple[int, int]:
    """Send today's digest to each subscriber (only confirmed ones are passed in).

    Returns (sent_count, failed_count). Skips everything if RESEND_API_KEY is not set.
    """
    if not mailer.configured():
        logger.warning("email_service: RESEND_API_KEY not set — skipping digest email")
        return 0, 0

    if not subscribers:
        logger.info("email_service: no subscribers — nothing to send")
        return 0, 0

    if not clusters:
        logger.warning("email_service: no clusters — skipping digest email")
        return 0, 0

    today = today or date.today()
    sent = 0
    failed = 0
    for sub in subscribers:
        try:
            mailer.send(digest_message(clusters, sub, today))
            sent += 1
        except Exception:
            logger.exception("email_service: failed to send the digest to subscriber %s", sub.id)
            failed += 1

    logger.info("email_service: sent=%d failed=%d", sent, failed)
    return sent, failed


# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------

_CONFIRM_COPY = {
    "en": {
        "subject": "Confirm your Sipply subscription",
        "heading": "Confirm your subscription",
        "body": "Someone, hopefully you, asked for the Sipply daily digest at this address. "
        "To start getting it, confirm with the link below.",
        "button": "Confirm subscription",
        "ignore": "If it wasn't you, ignore this email: nothing more is sent, and the address "
        "is deleted within {days} days.",
    },
    "zh": {
        "subject": "请确认订阅 Sipply",
        "heading": "确认订阅",
        "body": "有人（希望是你）用这个邮箱订阅了 Sipply 每日摘要（摘要是英文的）。点下面的链接确认后，就会开始收到。",
        "button": "确认订阅",
        "ignore": "如果不是你本人操作，忽略这封邮件即可：不会再收到任何邮件，这个地址会在 {days} 天内删除。",
    },
}


def confirmation_message(subscriber: "Subscriber", *, lang: str, forget_after_days: int) -> mailer.Message:
    """The email with the link that confirms a sign-up."""
    copy = _CONFIRM_COPY.get(lang, _CONFIRM_COPY["en"])
    url = confirm_url(subscriber.token, lang if lang in _CONFIRM_COPY else "en")
    ignore = copy["ignore"].format(days=forget_after_days)
    page = f"""<!DOCTYPE html>
<html lang="{'zh-CN' if lang == 'zh' else 'en'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{_PAGE};font-family:{_SANS};">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="background:#ffffff;border:1px solid {_RULE};border-radius:20px;padding:26px 32px 32px;">
      <p style="margin:0;font-family:{_SERIF};font-size:24px;line-height:1;color:{_INK};">Sip<span style="color:{_ACCENT};">ply</span></p>
      <h1 style="margin:26px 0 12px;font-family:{_SERIF};font-size:24px;font-weight:normal;line-height:1.2;color:{_INK};">{html.escape(copy["heading"])}</h1>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:{_SOFT};">{html.escape(copy["body"])}</p>
      <a href="{url}" style="display:inline-block;background:{_INK};color:{_PAGE};text-decoration:none;padding:11px 20px;border-radius:999px;font-size:14px;font-weight:500;">{html.escape(copy["button"])}</a>
      <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:{_MUTED};word-break:break-all;">{url}</p>
      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:{_MUTED};">{html.escape(ignore)}</p>
    </div>
  </div>
</body>
</html>"""
    text = "\n".join([copy["heading"], "", copy["body"], "", url, "", ignore])
    return {"to": [subscriber.email], "subject": copy["subject"], "html": page, "text": text}


def send_confirmation_email(subscriber: "Subscriber", *, lang: str, forget_after_days: int) -> None:
    """Raises if the email couldn't be sent (see mailer.send)."""
    mailer.send(confirmation_message(subscriber, lang=lang, forget_after_days=forget_after_days))
