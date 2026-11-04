"""Who gets the digest: signing up, confirming the address, leaving.

A sign-up stores the address unconfirmed and emails it a confirmation link;
only confirmed subscribers get the digest, so nobody can sign up someone else
(double opt-in). Every digest carries the subscriber's unsubscribe link, which
deletes the address. An address never confirmed gets MAX_CONFIRMATION_EMAILS at
most, RESEND_AFTER apart, and is deleted UNCONFIRMED_DAYS after it signed up
(the prune_old_data stage).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.subscriber import Subscriber
from app.services import email_service

logger = logging.getLogger(__name__)

# Signing up again sends the link again, but no sooner than this and no more than that many
# times: the sign-up box can't be used to flood someone else's inbox
RESEND_AFTER = timedelta(minutes=15)
MAX_CONFIRMATION_EMAILS = 3
UNCONFIRMED_DAYS = 7


class ConfirmationNotSent(Exception):
    """The confirmation email couldn't be sent; signing up again tries again."""


def _by_email(db: Session, email: str) -> Subscriber | None:
    return db.execute(select(Subscriber).where(Subscriber.email == email)).scalar_one_or_none()


def _by_token(db: Session, token: str) -> Subscriber | None:
    return db.execute(select(Subscriber).where(Subscriber.token == token)).scalar_one_or_none()


def subscribe(db: Session, email: str, *, lang: str = "en", now: datetime) -> str:
    """Sign ``email`` (already normalized) up. Returns "confirm_sent" or "already_subscribed";
    raises ConfirmationNotSent if the confirmation email couldn't be sent. A link sent recently,
    or MAX_CONFIRMATION_EMAILS already, means no new email, though the answer is the same."""
    sub = _by_email(db, email)
    if sub is not None and sub.confirmed_at is not None:
        return "already_subscribed"
    if sub is None:
        sub = Subscriber(email=email, lang=lang)
        db.add(sub)
        try:
            db.flush()
        except IntegrityError:  # the same address signed up at the same moment
            db.rollback()
            return subscribe(db, email, lang=lang, now=now)
    sub.lang = lang
    recently = sub.confirm_sent_at is not None and now - sub.confirm_sent_at < RESEND_AFTER
    if recently or sub.confirm_sends >= MAX_CONFIRMATION_EMAILS:
        db.commit()
        return "confirm_sent"
    try:
        email_service.send_confirmation_email(sub, forget_after_days=UNCONFIRMED_DAYS)
    except Exception as exc:
        logger.warning("confirmation email not sent (%s: %s)", type(exc).__name__, str(exc)[:200])
        db.commit()  # keep the sign-up, so signing up again just resends
        raise ConfirmationNotSent from exc
    sub.confirm_sent_at = now
    sub.confirm_sends += 1
    db.commit()
    return "confirm_sent"


def confirm(db: Session, token: str, *, now: datetime) -> str | None:
    """The confirm page's button was clicked. Returns "confirmed", "already_confirmed", or None for
    a link that names no one (never sent, or deleted since)."""
    sub = _by_token(db, token)
    if sub is None:
        return None
    if sub.confirmed_at is not None:
        return "already_confirmed"
    sub.confirmed_at = now
    db.commit()
    return "confirmed"


def unsubscribe(db: Session, token: str) -> bool:
    """Delete the subscriber with this token. Returns whether there was one."""
    result = db.execute(delete(Subscriber).where(Subscriber.token == token))
    db.commit()
    return bool(result.rowcount)


def digest_recipients(db: Session) -> list[Subscriber]:
    """Confirmed subscribers, oldest first."""
    query = select(Subscriber).where(Subscriber.confirmed_at.is_not(None)).order_by(Subscriber.created_at)
    return list(db.execute(query).scalars().all())


def prune_unconfirmed(db: Session, *, now: datetime) -> int:
    """Delete addresses not confirmed within UNCONFIRMED_DAYS of signing up (a resend doesn't
    postpone it). Returns how many were deleted."""
    cutoff = now - timedelta(days=UNCONFIRMED_DAYS)
    result = db.execute(
        delete(Subscriber).where(Subscriber.confirmed_at.is_(None), Subscriber.created_at < cutoff)
    )
    db.commit()
    return result.rowcount or 0
