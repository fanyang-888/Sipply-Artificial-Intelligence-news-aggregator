"""Subscribing to the digest (app/services/subscriptions.py).

POST /api/subscribe          {"email", "lang"}: emails a confirmation link
POST /api/subscribe/confirm  {"token"}: the confirm page's button
POST /api/unsubscribe?token= the unsubscribe page's button, and mail clients' one-click unsubscribe

The site calls the last two from its own routes (app/api/subscribe/confirm and
app/api/unsubscribe), so their requests come from a few servers; they aren't
rate-limited, and a token can't be guessed. Sign-ups are: 5 requests/minute per IP.
"""

import re
import logging
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.db import get_db
from app.rate_limit import limiter
from app.services import subscriptions

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["subscribe"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SubscribeRequest(BaseModel):
    email: str
    # The language of the confirmation email and page
    lang: Literal["en", "zh"] = "en"

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        if len(v) > 254:
            raise ValueError("Email too long")
        return v


class SubscribeResponse(BaseModel):
    status: Literal["confirm_sent", "already_subscribed"]


class ConfirmRequest(BaseModel):
    token: str = Field(min_length=1, max_length=64)


class ConfirmResponse(BaseModel):
    status: Literal["confirmed", "already_confirmed"]


class UnsubscribeResponse(BaseModel):
    status: Literal["unsubscribed", "not_subscribed"]


@router.post("/subscribe", response_model=SubscribeResponse, status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
def subscribe(
    request: Request,
    req: SubscribeRequest,
    db: Session = Depends(get_db),
) -> SubscribeResponse:
    try:
        result = subscriptions.subscribe(db, req.email, lang=req.lang, now=datetime.now(timezone.utc))
    except subscriptions.ConfirmationNotSent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The confirmation email couldn't be sent. Try again in a moment.",
        )
    logger.info("subscribe: %s", result)
    return SubscribeResponse(status=result)


@router.post("/subscribe/confirm", response_model=ConfirmResponse)
def confirm_subscription(
    req: ConfirmRequest,
    db: Session = Depends(get_db),
) -> ConfirmResponse:
    result = subscriptions.confirm(db, req.token, now=datetime.now(timezone.utc))
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This link names no subscription.")
    return ConfirmResponse(status=result)


@router.post("/unsubscribe", response_model=UnsubscribeResponse)
def unsubscribe(
    token: str = Query(min_length=1, max_length=64),
    db: Session = Depends(get_db),
) -> UnsubscribeResponse:
    """200 either way, so a mail client doesn't retry: "not_subscribed" when the token names no
    one (used already, or the address was removed). The body ("List-Unsubscribe=One-Click")
    is ignored."""
    if not subscriptions.unsubscribe(db, token):
        return UnsubscribeResponse(status="not_subscribed")
    logger.info("unsubscribe: removed")
    return UnsubscribeResponse(status="unsubscribed")
