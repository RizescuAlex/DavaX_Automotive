"""merge rearview mirror and fuel specs heads

Revision ID: 42693d64e17d
Revises: ('227bea924bb6', '6a7b8c9d0e1f')
Create Date: 2026-09-23 14:44:08.180655

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '42693d64e17d'
down_revision: Union[str, None] = ('227bea924bb6', '6a7b8c9d0e1f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
