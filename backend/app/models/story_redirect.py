"""A story merged into another (app/services/story_merge.py): its old id and slug now lead there."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class StoryRedirect(Base):
    __tablename__ = "story_redirects"

    old_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    # None when the story was merged before it had a public address
    old_slug: Mapped[str | None] = mapped_column(String(96), nullable=True, unique=True, index=True)
    # The story it became
    cluster_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clusters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The merged story's own fields and article ids, to undo a wrong merge by hand
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
