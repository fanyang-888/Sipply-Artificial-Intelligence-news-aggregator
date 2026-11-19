from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.cluster import Cluster
    from app.models.source import Source


class Article(Base):
    """``url`` is the UNIQUE dedupe key. Persistence also merges rows by matching ``canonical_url``
    (see :func:`app.services.article_ingest.persist_fetched_article`).
    """

    __tablename__ = "articles"
    __table_args__ = (
        # Partial indexes, as migrations w2d4 and w2d7 created them
        sa.Index(
            "ix_articles_canonical_url_present",
            "canonical_url",
            postgresql_where=text("canonical_url IS NOT NULL"),
        ),
        sa.Index(
            "ix_articles_filter_keep",
            "is_filtered_out",
            postgresql_where=text("is_filtered_out = false"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    # UNIQUE implies a backing unique index on PostgreSQL (dedupe + lookup); avoid duplicate index=True.
    url: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    canonical_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    cleaned_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language: Mapped[str | None] = mapped_column(String(32), nullable=True)
    author_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    organization_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_meta: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ---------- LLM Summary ----------
    short_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    takeaways: Mapped[list | None] = mapped_column(JSONB, nullable=True)   # list[str]
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)        # list[str]
    entities: Mapped[list | None] = mapped_column(JSONB, nullable=True)    # list[str]
    themes: Mapped[list | None] = mapped_column(JSONB, nullable=True)      # list[str]
    why_it_matters: Mapped[str | None] = mapped_column(Text, nullable=True)
    summarized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ---------- Filtering ----------
    # NULL = not yet assessed | False = keep | True = excluded from pipeline
    is_filtered_out: Mapped[bool | None] = mapped_column(sa.Boolean, nullable=True)
    # Short tag: "short_body" | "short_title" | "off_topic" | "duplicate_hash"
    filter_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # ---------- Scoring ----------
    # 0–100 composite signal score; NULL = not yet scored.
    signal_score: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)
    # Per-dimension breakdown: {"source_credibility": 5.0, "recency": 4.0, ...}
    score_components: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Per-dimension scores and weights used to compute signal_score",
    )
    scored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ---------- Cluster ----------
    cluster_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clusters.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    cluster: Mapped[Cluster | None] = relationship("Cluster", back_populates="articles")
    source: Mapped[Source] = relationship("Source", back_populates="articles")
