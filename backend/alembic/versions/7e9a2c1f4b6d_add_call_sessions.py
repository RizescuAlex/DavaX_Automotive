"""add call sessions

Revision ID: 7e9a2c1f4b6d
Revises: 5b4c1d8e9a21
Create Date: 2026-09-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "7e9a2c1f4b6d"
down_revision: Union[str, None] = "5b4c1d8e9a21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "call_sessions",
        sa.Column("caller_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("callee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("room_name", sa.String(length=120), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["caller_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["callee_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("room_name"),
    )
    op.create_index("ix_call_sessions_caller_id", "call_sessions", ["caller_id"])
    op.create_index("ix_call_sessions_callee_id", "call_sessions", ["callee_id"])


def downgrade() -> None:
    op.drop_index("ix_call_sessions_callee_id", table_name="call_sessions")
    op.drop_index("ix_call_sessions_caller_id", table_name="call_sessions")
    op.drop_table("call_sessions")
