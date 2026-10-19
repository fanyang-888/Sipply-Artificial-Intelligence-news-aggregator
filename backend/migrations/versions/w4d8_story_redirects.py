"""Where a merged story's address goes.

When two stories turn out to report the same event (app/services/story_merge.py),
one is merged into the other and deleted. Its URL stays valid: the API answers
for its old id and slug with the story it became, and the site redirects there.
snapshot keeps the deleted story's fields and article ids, so a wrong merge can
be undone by hand. Additive only.

Revision ID: w4d8_story_redirects
Revises: w4d7_topic_newsworthy
Create Date: 2026-10-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "w4d8_story_redirects"
down_revision = "w4d7_topic_newsworthy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_redirects",
        sa.Column("old_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("old_slug", sa.String(length=96), nullable=True),
        sa.Column(
            "cluster_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clusters.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_story_redirects_old_slug", "story_redirects", ["old_slug"], unique=True)
    op.create_index("ix_story_redirects_cluster_id", "story_redirects", ["cluster_id"])


def downgrade() -> None:
    op.drop_index("ix_story_redirects_cluster_id", table_name="story_redirects")
    op.drop_index("ix_story_redirects_old_slug", table_name="story_redirects")
    op.drop_table("story_redirects")
