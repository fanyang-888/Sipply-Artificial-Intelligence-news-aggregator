from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PipelineRun(Base):
    """One full execution of run_pipeline — records timing and per-stage outcomes."""

    __tablename__ = "pipeline_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # "running" | "success" | "failed"
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    # { stage_name: { status: "ok"|"failed", elapsed_sec: float } }
    stage_results: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    total_elapsed_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    # "cron" | "manual" | "api"
    triggered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
