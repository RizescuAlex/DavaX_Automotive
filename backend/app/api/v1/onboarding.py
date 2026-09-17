from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.api.v1.auth import _get_user_from_token
from app.models.onboarding_profile import OnboardingProfile
from app.schemas.onboarding import OnboardingProfileCreate, OnboardingProfileOut

router = APIRouter()

@router.post("", response_model=OnboardingProfileOut, status_code=status.HTTP_201_CREATED)
async def create_onboarding_profile(
    profile_in: OnboardingProfileCreate,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    current_user = await _get_user_from_token(token, db)
    
    if current_user.onboarding_completed:
        raise HTTPException(status_code=400, detail="Onboarding already completed")
    
    # Create the profile
    profile = OnboardingProfile(
        user_id=current_user.id,
        fastest_arrival=profile_in.fastest_arrival,
        lowest_cost=profile_in.lowest_cost,
        scenic_routes=profile_in.scenic_routes,
        family_friendly=profile_in.family_friendly,
        avoid_tolls=profile_in.avoid_tolls,
        avoid_highways=profile_in.avoid_highways,
        preferred_fuel_type=profile_in.preferred_fuel_type,
    )
    
    db.add(profile)
    current_user.onboarding_completed = True
    
    await db.commit()
    await db.refresh(profile)
    
    return profile
