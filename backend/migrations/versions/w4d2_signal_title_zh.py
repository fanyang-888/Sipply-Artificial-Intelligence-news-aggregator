"""Add signals.title_zh — Chinese titles for the Trend Radar's 中文 mode.

Filled by the translate_signals pipeline stage; additive and nullable.

Revision ID: w4d2_signal_title_zh
Revises: w4d1_signals
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa

revision = "w4d2_signal_title_zh"
down_revision = "w4d1_signals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("signals", sa.Column("title_zh", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("signals", "title_zh")
