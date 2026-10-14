"""What an AI assistant with web search answered to a Trend Radar question, and what it cited."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AnswerCheck(Base):
    __tablename__ = "answer_checks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    topic_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Sipply's story on the topic at check time; None = Sipply had none
    covered_cluster_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{"url", "title", "domain"}] cited inline in the answer, in order
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    # Every URL the search consulted (often more than it cited)
    sources: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    sipply_cited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sipply_in_sources: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
