from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Signal(Base):
    """One community/search signal for the Trend Radar: an HN post, a news hit, a video.

    Kept apart from ``articles`` on purpose: signals are not summarized by the
    LLM and keep their engagement numbers, which change while the post is live.
    """

    __tablename__ = "signals"
    __table_args__ = (
        UniqueConstraint("source_kind", "external_id", name="uq_signals_source_kind_external_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # "hn_story" | "hn_ask" | "gnews_item" | "yt_video"
    source_kind: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)

    url: Mapped[str] = mapped_column(Text, nullable=False)
    # Where people talk about it (the HN thread); None for news/video
    discussion_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    # Simplified Chinese title (translate_signals stage); reset when the title changes
    title_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    author: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Publisher (news) or channel (video)
    outlet: Mapped[str | None] = mapped_column(String(255), nullable=True)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # The radar keyword that surfaced this signal
    query: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_question: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    num_comments: Mapped[int | None] = mapped_column(Integer, nullable=True)
    view_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    like_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    raw: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("signal_topics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SignalTopic(Base):
    """A group of related signals, scored for the Trend Radar.

    Rebuilt from scratch on every pipeline run (see app/signals/topics.py).
    """

    __tablename__ = "signal_topics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    # One of the canonical cluster topic_tag values ("Model Release", …, "Other")
    topic_tag: Mapped[str] = mapped_column(String(64), nullable=False, default="Other")
    keywords: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    signal_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # {"hn": 3, "news": 2, "youtube": 0}
    source_counts: Mapped[dict[str, int] | None] = mapped_column(JSONB, nullable=True)
    engagement: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, index=True)
    # {"volume": 0–100, "engagement": …, "velocity": …, "recency": …, "relevance": …}
    score_components: Mapped[dict[str, float] | None] = mapped_column(JSONB, nullable=True)
    # Daily rate over the last 3 days ÷ daily rate over the 11 days before
    velocity: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rising: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Signals per UTC day, oldest first, one entry per day of the radar window
    daily_counts: Mapped[list[int] | None] = mapped_column(JSONB, nullable=True)

    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
