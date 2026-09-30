import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9_.]{0,30}[a-z0-9])?$")


def normalize_username(value: str) -> str:
    return value.strip().lower()


def validate_username(value: str) -> str:
    username = normalize_username(value)
    if not USERNAME_RE.fullmatch(username):
        raise ValueError("Username must be 2-32 characters and use only letters, numbers, underscores, or periods")
    return username


async def make_unique_username(db: AsyncSession, seed: str) -> str:
    base = re.sub(r"[^a-z0-9_.]+", "_", seed.lower()).strip("._") or "driver"
    base = base[:32]
    candidate = base
    suffix = 2
    while (await db.execute(select(User.id).where(User.username == candidate))).scalar_one_or_none():
        suffix_text = str(suffix)
        candidate = f"{base[:32 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return candidate
