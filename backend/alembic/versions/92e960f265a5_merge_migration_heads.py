"""merge migration heads

Revision ID: 92e960f265a5
Revises: ('42693d64e17d', '7e9a2c1f4b6d')
Create Date: 2026-09-24 13:04:06.446050

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '92e960f265a5'
down_revision: Union[str, None] = ('42693d64e17d', '7e9a2c1f4b6d')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
