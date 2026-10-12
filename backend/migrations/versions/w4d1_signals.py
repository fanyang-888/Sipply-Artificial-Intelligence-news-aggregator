"""Add signals + signal_topics tables for the Trend Radar.

Community/search signals (Hacker News, Google News, YouTube) live apart from
articles: they are never sent to the LLM and keep live engagement numbers.
Additive only — no existing table is touched.

Revision ID: w4d1_signals
Revises: w3d4_events_table
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "w4d1_signals"
down_revision = "w3d4_events_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "signal_topics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("topic_tag", sa.String(64), nullable=False, server_default="Other"),
        sa.Column("keywords", postgresql.JSONB(), nullable=True),
        sa.Column("signal_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source_counts", postgresql.JSONB(), nullable=True),
        sa.Column("engagement", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("score_components", postgresql.JSONB(), nullable=True),
        sa.Column("velocity", sa.Float(), nullable=False, server_default="0"),
        sa.Column("rising", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("daily_counts", postgresql.JSONB(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_signal_topics"),
    )
    op.create_index("ix_signal_topics_score", "signal_topics", ["score"])

    op.create_table(
        "signals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_kind", sa.String(16), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("discussion_url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("author", sa.String(255), nullable=True),
        sa.Column("outlet", sa.String(255), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("query", sa.String(128), nullable=True),
        sa.Column("is_question", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("num_comments", sa.Integer(), nullable=True),
        sa.Column("view_count", sa.BigInteger(), nullable=True),
        sa.Column("like_count", sa.BigInteger(), nullable=True),
        sa.Column("raw", postgresql.JSONB(), nullable=True),
        sa.Column("topic_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["topic_id"],
            ["signal_topics.id"],
            name="fk_signals_topic_id_signal_topics",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_signals"),
        sa.UniqueConstraint(
            "source_kind", "external_id", name="uq_signals_source_kind_external_id"
        ),
    )
    op.create_index("ix_signals_source_kind", "signals", ["source_kind"])
    op.create_index("ix_signals_published_at", "signals", ["published_at"])
    op.create_index("ix_signals_topic_id", "signals", ["topic_id"])


def downgrade() -> None:
    op.drop_index("ix_signals_topic_id", table_name="signals")
    op.drop_index("ix_signals_published_at", table_name="signals")
    op.drop_index("ix_signals_source_kind", table_name="signals")
    op.drop_table("signals")
    op.drop_index("ix_signal_topics_score", table_name="signal_topics")
    op.drop_table("signal_topics")
