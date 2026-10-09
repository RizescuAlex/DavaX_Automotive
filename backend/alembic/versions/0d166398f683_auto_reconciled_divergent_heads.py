"""Auto-reconciled divergent heads

Revision ID: 0d166398f683
Revises: ('48f37e156dd1', '8c2d4e6f7a90')
Create Date: 2026-09-30 10:21:09.298815

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0d166398f683'
down_revision: Union[str, None] = ('48f37e156dd1', '8c2d4e6f7a90')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
