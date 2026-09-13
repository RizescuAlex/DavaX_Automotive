import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.exceptions import NotFoundError
from app.core.security import get_current_token
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate

router = APIRouter()


async def _get_user_from_token(token: dict, db: AsyncSession) -> User:
    """Load User row based on the unified token payload (email or firebase provider)."""
    if token["provider"] == "email":
        result = await db.execute(
            select(User).where(User.id == uuid.UUID(token["uid"]))
        )
    else:
        result = await db.execute(
            select(User).where(User.firebase_uid == token["uid"])
        )
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("User")
    return user


@router.get("/me", response_model=UserOut)
async def get_profile(
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    return await _get_user_from_token(token, db)


@router.put("/me", response_model=UserOut)
async def update_profile(
    body: UserUpdate,
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_from_token(token, db)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    return user
