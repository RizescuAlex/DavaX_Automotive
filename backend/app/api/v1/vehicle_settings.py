from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import _get_user_from_token
from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.models.vehicle_settings import VehicleSettings
from app.schemas.vehicle_settings import VehicleSettingsBase, VehicleSettingsOut

router = APIRouter()


@router.get("/me", response_model=VehicleSettingsOut | None)
async def get_vehicle_settings(
    profile_name: str = "default",
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    current_user = await _get_user_from_token(token, db)

    result = await db.execute(
        select(VehicleSettings).where(
            VehicleSettings.user_id == current_user.id,
            VehicleSettings.profile_name == profile_name,
        )
    )

    return result.scalar_one_or_none()


@router.put("/me", response_model=VehicleSettingsOut)
async def update_vehicle_settings(
    settings_in: VehicleSettingsBase,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    current_user = await _get_user_from_token(token, db)

    data = settings_in.dict()
    profile_name = data["profile_name"]

    result = await db.execute(
        select(VehicleSettings).where(
            VehicleSettings.user_id == current_user.id,
            VehicleSettings.profile_name == profile_name,
        )
    )

    settings = result.scalar_one_or_none()

    if settings is None:
        settings = VehicleSettings(
            user_id=current_user.id,
            **data,
        )
        db.add(settings)
    else:
        for field, value in data.items():
            setattr(settings, field, value)

    await db.commit()
    await db.refresh(settings)

    return settings