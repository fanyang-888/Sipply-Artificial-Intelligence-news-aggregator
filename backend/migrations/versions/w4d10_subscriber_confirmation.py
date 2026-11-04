"""Subscribers confirm their address and can leave with one click.

- token: a secret per subscriber, in their confirmation and unsubscribe links.
  The database fills it in too, for the previous release, which inserts only
  (id, email) and may still be serving while this runs.
- confirmed_at: when they clicked the confirmation link; only confirmed
  subscribers get the digest.
- confirm_sent_at, confirm_sends: when the last confirmation email went out, and
  how many have, so the sign-up box can't be used to flood an inbox.
- lang: the language they signed up in, for the pages their links open.

Subscribers from before this signed up when there was no confirmation step:
they count as confirmed from the day they signed up, and from now on every
digest carries their own unsubscribe link.

Revision ID: w4d10_subscriber_confirmation
Revises: w4d9_cluster_related_ids
Create Date: 2026-11-03
"""

import secrets

from alembic import op
import sqlalchemy as sa

revision = "w4d10_subscriber_confirmation"
down_revision = "w4d9_cluster_related_ids"
branch_labels = None
depends_on = None


# 64 hex characters from two random UUIDs (gen_random_uuid() uses a strong random source)
_TOKEN_DEFAULT = sa.text("replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')")


def upgrade() -> None:
    op.add_column("subscribers", sa.Column("token", sa.String(64), nullable=True))
    op.add_column("subscribers", sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("subscribers", sa.Column("confirm_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("subscribers", sa.Column("confirm_sends", sa.Integer(), server_default="0", nullable=False))
    op.add_column("subscribers", sa.Column("lang", sa.String(2), server_default="en", nullable=False))

    conn = op.get_bind()
    for (subscriber_id,) in conn.execute(sa.text("SELECT id FROM subscribers")).all():
        conn.execute(
            sa.text("UPDATE subscribers SET token = :token, confirmed_at = created_at WHERE id = :id"),
            {"token": secrets.token_urlsafe(32), "id": subscriber_id},
        )

    op.alter_column("subscribers", "token", nullable=False, server_default=_TOKEN_DEFAULT)
    op.create_index("ix_subscribers_token", "subscribers", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_subscribers_token", table_name="subscribers")
    op.drop_column("subscribers", "lang")
    op.drop_column("subscribers", "confirm_sends")
    op.drop_column("subscribers", "confirm_sent_at")
    op.drop_column("subscribers", "confirmed_at")
    op.drop_column("subscribers", "token")
