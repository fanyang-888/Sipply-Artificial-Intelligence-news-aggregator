"""Story URLs and Sipply's own headlines.

clusters.slug is a story's permanent URL key (/story/<slug>); it is filled by
the pipeline (app/services/headlines.py), not here, so this migration stays
independent of the slug rules. headline / headline_zh are Sipply's own
headline and its translation. Additive only.

Revision ID: w4d6_story_slugs_headlines
Revises: w4d5_topic_briefs
Create Date: 2026-10-18
"""

from alembic import op
import sqlalchemy as sa

revision = "w4d6_story_slugs_headlines"
down_revision = "w4d5_topic_briefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clusters", sa.Column("slug", sa.String(length=96), nullable=True))
    op.add_column("clusters", sa.Column("headline", sa.Text(), nullable=True))
    op.add_column("clusters", sa.Column("headline_zh", sa.Text(), nullable=True))
    op.create_index("ix_clusters_slug", "clusters", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_clusters_slug", table_name="clusters")
    op.drop_column("clusters", "headline_zh")
    op.drop_column("clusters", "headline")
    op.drop_column("clusters", "slug")
