from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import _get_user_from_token
from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.models.vehicle_settings import VehicleSettings
from app.schemas.vehicle import (
    ClimateSettings,
    VehicleSettingsOut,
    VehicleSettingsUpdate,
)

router = APIRouter()

# The model allows several named profiles per user (unique on user_id +
# profile_name). Nothing exposes profile switching yet, so every request works
# against this one.
DEFAULT_PROFILE = "default"


async def _get_or_create_settings(user_id: UUID, db: AsyncSession) -> VehicleSettings:
    """
    Load the user's settings row, creating it on first access.

    Vehicle settings are state that should simply exist for every user, so a
    missing row is not an error the client has to handle: the first read
    materialises it with defaults.
    """
    result = await db.execute(
        select(VehicleSettings).where(
            VehicleSettings.user_id == user_id,
            VehicleSettings.profile_name == DEFAULT_PROFILE,
        )
    )
    settings = result.scalar_one_or_none()

    if settings is None:
        settings = VehicleSettings(
            user_id=user_id,
            profile_name=DEFAULT_PROFILE,
            climate_settings=ClimateSettings().model_dump(),
        )
        db.add(settings)
        await db.flush()
    elif settings.climate_settings is None:
        # Row predates the climate card — fill it in rather than handing the
        # client a null it would have to special-case.
        settings.climate_settings = ClimateSettings().model_dump()
        await db.flush()

    return settings


@router.get("/settings", response_model=VehicleSettingsOut)
async def get_vehicle_settings(
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    """Return the current user's vehicle settings, creating defaults if needed."""
    user = await _get_user_from_token(token, db)
    return await _get_or_create_settings(user.id, db)


@router.patch("/settings", response_model=VehicleSettingsOut)
async def update_vehicle_settings(
    body: VehicleSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    """
    Merge a partial update into the user's vehicle settings.

    Only the groups present in the body are written, so the climate card can
    PATCH `climate_settings` alone without clobbering the rest.
    """
    user = await _get_user_from_token(token, db)
    settings = await _get_or_create_settings(user.id, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)

    await db.flush()
    return settings
