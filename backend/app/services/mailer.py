"""Sending email through Resend: the digest, confirmation emails and operator alerts.

RESEND_API_KEY is the account's key, RESEND_FROM the verified sender (default
"Sipply <digest@sipply.dev>"). sipply.dev receives no mail (no MX record), so
no email may ask the reader to reply.
"""

from __future__ import annotations

import os
from typing import Any

# {"to": [...], "subject": str, "html": str, "text": str}, optionally "headers": {...}
Message = dict[str, Any]

# A sign-up waits for its confirmation email; don't hold it for Resend's 30 s default
TIMEOUT_SEC = 10


def configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY", "").strip())


def send(message: Message) -> None:
    """Send one email. Raises if RESEND_API_KEY is missing or Resend refuses it."""
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("RESEND_API_KEY not set")
    import resend  # imported lazily so a missing package never breaks import
    from resend.http_client_requests import RequestsClient

    resend.api_key = api_key
    resend.default_http_client = RequestsClient(timeout=TIMEOUT_SEC)
    resend.Emails.send({"from": os.getenv("RESEND_FROM", "Sipply <digest@sipply.dev>"), **message})
