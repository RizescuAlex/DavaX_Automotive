"""add SmartRoute trip proposals

Revision ID: d2f0bce19a73
Revises: 8c2d4e6f7a90
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d2f0bce19a73"
down_revision: Union[str, None] = "8c2d4e6f7a90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Main has a parallel migration that creates the same trips table. Keep
    # both branch paths safe regardless of which one Alembic applies first.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("trips"):
        op.create_table(
            "trips",
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("origin", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("destination", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("proposed_routes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("selected_index", sa.SmallInteger(), nullable=True),
            sa.Column("final_route", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("fuel_input", sa.SmallInteger(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if not inspector.has_index("trips", "ix_trips_user_id"):
        op.create_index("ix_trips_user_id", "trips", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trips_user_id", table_name="trips")
    op.drop_table("trips")
