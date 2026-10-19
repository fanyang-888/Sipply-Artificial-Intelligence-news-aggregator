"""Each story's related stories, worked out by the pipeline.

clusters.related_ids holds the ids of up to four related stories, written by
the relate_stories stage (app/services/related.py) instead of being computed
on every story request. NULL means not worked out yet; the API then computes
them itself. Additive only.

Revision ID: w4d9_cluster_related_ids
Revises: w4d8_story_redirects
Create Date: 2026-10-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "w4d9_cluster_related_ids"
down_revision = "w4d8_story_redirects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clusters", sa.Column("related_ids", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("clusters", "related_ids")
