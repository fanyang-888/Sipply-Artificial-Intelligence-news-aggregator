"""Add the Trend Radar topic description: a short summary (EN + 中文) and the
Sipply story that covers the topic, if any.

Filled by the describe_signal_topics pipeline stage; additive and nullable.
covered_cluster_id has no foreign key on purpose: topics are rebuilt every run
and a story that disappears just reads as "not covered" until the next check.

Revision ID: w4d3_signal_topic_description
Revises: w4d2_signal_title_zh
Create Date: 2026-10-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "w4d3_signal_topic_description"
down_revision = "w4d2_signal_title_zh"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("signal_topics", sa.Column("summary_en", sa.Text(), nullable=True))
    op.add_column("signal_topics", sa.Column("summary_zh", sa.Text(), nullable=True))
    op.add_column("signal_topics", sa.Column("covered_cluster_id", UUID(as_uuid=True), nullable=True))
    op.add_column("signal_topics", sa.Column("described_signal_count", sa.Integer(), nullable=True))
    op.add_column("signal_topics", sa.Column("described_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("signal_topics", "described_at")
    op.drop_column("signal_topics", "described_signal_count")
    op.drop_column("signal_topics", "covered_cluster_id")
    op.drop_column("signal_topics", "summary_zh")
    op.drop_column("signal_topics", "summary_en")
