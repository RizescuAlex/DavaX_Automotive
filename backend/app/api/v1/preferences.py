from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import _get_user_from_token
from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.models.onboarding_profile import OnboardingProfile
from app.schemas.preferences import PreferencesOut, PreferencesUpdate

router = APIRouter()


@router.get("/me", response_model=PreferencesOut)
async def get_my_preferences(
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    user = await _get_user_from_token(token, db)
    profile = await db.scalar(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user.id)
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return profile


@router.patch("/me", response_model=PreferencesOut)
async def update_my_preferences(
    body: PreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    user = await _get_user_from_token(token, db)
    profile = await db.scalar(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user.id)
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Preferences not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile
