"""AI answer tracking: the question a reader would ask an AI assistant about a
Trend Radar topic, and what an assistant with web search answered and cited.

signal_topics.question_en is written by describe_signal_topics; answer_checks
rows by check_ai_answers. Additive only.

Revision ID: w4d4_answer_checks
Revises: w4d3_signal_topic_description
Create Date: 2026-10-14
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "w4d4_answer_checks"
down_revision = "w4d3_signal_topic_description"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("signal_topics", sa.Column("question_en", sa.Text(), nullable=True))
    op.create_table(
        "answer_checks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("topic_label", sa.Text(), nullable=True),
        # Sipply's story on the topic at check time (None = Sipply had none)
        sa.Column("covered_cluster_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("model", sa.String(64), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        # [{"url", "title", "domain"}] cited inline in the answer, in order
        sa.Column("citations", postgresql.JSONB(), nullable=False, server_default="[]"),
        # Every URL the search consulted (often more than it cited)
        sa.Column("sources", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("sipply_cited", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sipply_in_sources", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_answer_checks_checked_at", "answer_checks", ["checked_at"])
    op.create_index("ix_answer_checks_question", "answer_checks", ["question"])


def downgrade() -> None:
    op.drop_index("ix_answer_checks_question", table_name="answer_checks")
    op.drop_index("ix_answer_checks_checked_at", table_name="answer_checks")
    op.drop_table("answer_checks")
    op.drop_column("signal_topics", "question_en")
