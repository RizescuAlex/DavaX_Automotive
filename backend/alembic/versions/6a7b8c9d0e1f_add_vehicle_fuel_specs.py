"""add vehicle fuel specifications and selected trim

Revision ID: 6a7b8c9d0e1f
Revises: 5b4c1d8e9a21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "6a7b8c9d0e1f"
down_revision: Union[str, None] = "5b4c1d8e9a21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("selected_trim_id", sa.Integer(), nullable=True))
    op.add_column("vehicles", sa.Column("selected_trim_name", sa.String(length=100), nullable=True))
    op.add_column("vehicles", sa.Column("fuel_type", sa.String(length=20), nullable=True))

    op.create_table(
        "vehicle_fuel_specs",
        sa.Column("vehicle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("car_api_id", sa.Integer(), nullable=True),
        sa.Column("submodel_id", sa.Integer(), nullable=True),
        sa.Column("trim_id", sa.Integer(), nullable=False),
        sa.Column("submodel", sa.String(length=150), nullable=True),
        sa.Column("trim", sa.String(length=150), nullable=True),
        sa.Column("trim_description", sa.String(length=500), nullable=True),
        sa.Column("fuel_tank_capacity_gal", sa.Numeric(8, 2), nullable=True),
        sa.Column("combined_mpg", sa.Numeric(8, 2), nullable=True),
        sa.Column("city_mpg", sa.Numeric(8, 2), nullable=True),
        sa.Column("highway_mpg", sa.Numeric(8, 2), nullable=True),
        sa.Column("range_city_miles", sa.Numeric(10, 2), nullable=True),
        sa.Column("range_highway_miles", sa.Numeric(10, 2), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vehicle_id", "trim_id", name="uq_vehicle_fuel_spec_trim"),
    )


def downgrade() -> None:
    op.drop_table("vehicle_fuel_specs")
    op.drop_column("vehicles", "fuel_type")
    op.drop_column("vehicles", "selected_trim_name")
    op.drop_column("vehicles", "selected_trim_id")
