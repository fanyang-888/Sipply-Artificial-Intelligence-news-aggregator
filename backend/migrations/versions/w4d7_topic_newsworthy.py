"""Whether a Trend Radar topic is news.

signal_topics.newsworthy is set by describe_signal_topics: False hides memes,
jokes, AI art and teaser videos from the public radar. NULL means not judged
yet and shows as before. Additive only.

Revision ID: w4d7_topic_newsworthy
Revises: w4d6_story_slugs_headlines
Create Date: 2026-10-18
"""

from alembic import op
import sqlalchemy as sa

revision = "w4d7_topic_newsworthy"
down_revision = "w4d6_story_slugs_headlines"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("signal_topics", sa.Column("newsworthy", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("signal_topics", "newsworthy")
