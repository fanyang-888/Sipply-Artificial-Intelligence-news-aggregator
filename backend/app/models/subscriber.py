from __future__ import annotations

import secrets
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def new_token() -> str:
    return secrets.token_urlsafe(32)


class Subscriber(Base):
    """Email subscriber who signed up via the subscribe bar (app/services/subscriptions.py)."""

    __tablename__ = "subscribers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # In the subscriber's confirmation and unsubscribe links
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True, default=new_token)
    # Only confirmed subscribers get the digest
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirm_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirm_sends: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # The language of the pages their links open ("en" or "zh"); the digest itself is English
    lang: Mapped[str] = mapped_column(String(2), nullable=False, default="en", server_default="en")
