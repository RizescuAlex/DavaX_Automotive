"""Merge multiple heads

Revision ID: 48f37e156dd1
Revises: ('098c2e4c7842', '92e960f265a5')
Create Date: 2026-09-28 10:58:33.859032

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '48f37e156dd1'
down_revision: Union[str, None] = ('098c2e4c7842', '92e960f265a5')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
