from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.article import Article


class Cluster(Base):
    """A story cluster grouping one or more articles about the same event or theme."""

    __tablename__ = "clusters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # "event" | "theme"
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="event")
    # "new" | "ongoing" | "escalating" | "peaking" | "fading"
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="new")

    representative_title: Mapped[str] = mapped_column(Text, nullable=False)

    cluster_score: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)
    article_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    tags: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    topic_tag: Mapped[str | None] = mapped_column(String(64), nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # ---------- LLM Summary (English) ----------
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    takeaways: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)  # list[str]
    why_it_matters: Mapped[str | None] = mapped_column(Text, nullable=True)
    why_it_matters_pm: Mapped[str | None] = mapped_column(Text, nullable=True)
    why_it_matters_dev: Mapped[str | None] = mapped_column(Text, nullable=True)
    why_it_matters_students: Mapped[str | None] = mapped_column(Text, nullable=True)
    summarized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ---------- Chinese translations ----------
    representative_title_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    takeaways_zh: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)  # list[str]
    why_it_matters_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    why_it_matters_pm_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    why_it_matters_dev_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    why_it_matters_students_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    translated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    articles: Mapped[list[Article]] = relationship("Article", back_populates="cluster")
