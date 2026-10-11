"""Merge main and SmartRoutes migration histories.

Revision ID: af2d7c91e630
Revises: 0d166398f683, d2f0bce19a73
"""
from typing import Sequence, Union

revision: str = "af2d7c91e630"
down_revision: Union[str, None] = ("0d166398f683", "d2f0bce19a73")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
