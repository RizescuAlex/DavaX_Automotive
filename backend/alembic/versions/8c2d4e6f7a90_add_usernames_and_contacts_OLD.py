"""add unique usernames and contacts

Revision ID: 8c2d4e6f7a90
Revises: 92e960f265a5
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8c2d4e6f7a90"
down_revision: Union[str, None] = "92e960f265a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(length=32), nullable=True))

    # Use the email local-part where possible, then add a stable numeric suffix
    # for collisions. This keeps existing accounts usable after deployment.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY base_username ORDER BY created_at, id
                   ) AS suffix,
                   base_username
            FROM (
                SELECT id, created_at,
                       regexp_replace(
                           lower(coalesce(nullif(split_part(email, '@', 1), ''), nullif(display_name, ''), 'driver')),
                           '[^a-z0-9_.]+', '_', 'g'
                       ) AS base_username
                FROM users
            ) source
        )
        UPDATE users
        SET username = left(ranked.base_username, 24) || '_' || substring(md5(ranked.id::text), 1, 7)
        FROM ranked
        WHERE users.id = ranked.id
        """
    )
    op.alter_column("users", "username", nullable=False)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "user_contacts",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("contact_user_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "contact_user_id", name="uq_user_contact"),
    )


def downgrade() -> None:
    op.drop_table("user_contacts")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_column("users", "username")
