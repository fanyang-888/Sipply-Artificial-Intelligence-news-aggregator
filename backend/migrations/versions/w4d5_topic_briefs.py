"""Content briefs for Trend Radar topics Sipply hasn't covered yet.

signal_topics.brief holds what brief_signal_topics wrote (headline, angle,
reader questions, facts each tied to a post); brief_signal_count is the
topic's size then, so a grown topic gets a fresh brief. Additive only.

Revision ID: w4d5_topic_briefs
Revises: w4d4_answer_checks
Create Date: 2026-10-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "w4d5_topic_briefs"
down_revision = "w4d4_answer_checks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("signal_topics", sa.Column("brief", postgresql.JSONB(), nullable=True))
    op.add_column("signal_topics", sa.Column("brief_signal_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("signal_topics", "brief_signal_count")
    op.drop_column("signal_topics", "brief")
