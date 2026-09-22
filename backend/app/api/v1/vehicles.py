from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.v1.auth import _get_user_from_token
from app.core.dependencies import get_db
from app.core.exceptions import NotFoundError
from app.core.security import get_current_token
from app.models.vehicle import Vehicle
from app.schemas.vehicle import VehicleOut

router = APIRouter()


@router.get("/me", response_model=VehicleOut)
async def get_my_vehicle(
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    current_user = await _get_user_from_token(token, db)
    result = await db.execute(select(Vehicle).where(Vehicle.user_id == current_user.id))
    vehicle = result.scalar_one_or_none()

    if vehicle is None:
        raise NotFoundError("Vehicle")

    return vehicle
