from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.v1.auth import _get_user_from_token
from app.core.dependencies import get_db
from app.core.exceptions import NotFoundError
from app.core.security import get_current_token
from app.models.vehicle import Vehicle
from app.models.vehicle_fuel_spec import VehicleFuelSpec
from app.schemas.vehicle import VehicleOut
from app.schemas.vehicle_fuel_spec import VehicleFuelSpecOut

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


@router.get("/me/fuel-specs", response_model=list[VehicleFuelSpecOut])
async def get_my_vehicle_fuel_specs(
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    current_user = await _get_user_from_token(token, db)
    vehicle = await db.scalar(select(Vehicle).where(Vehicle.user_id == current_user.id))
    if vehicle is None:
        raise NotFoundError("Vehicle")
    result = await db.execute(
        select(VehicleFuelSpec)
        .where(VehicleFuelSpec.vehicle_id == vehicle.id)
        .order_by(VehicleFuelSpec.trim_id)
    )
    return list(result.scalars().all())


@router.put("/me/selected-trim", response_model=VehicleOut)
async def select_vehicle_trim(
    trim_id: int,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    current_user = await _get_user_from_token(token, db)
    vehicle = await db.scalar(select(Vehicle).where(Vehicle.user_id == current_user.id))
    if vehicle is None:
        raise NotFoundError("Vehicle")

    spec = await db.scalar(
        select(VehicleFuelSpec).where(
            VehicleFuelSpec.vehicle_id == vehicle.id,
            VehicleFuelSpec.trim_id == trim_id,
        )
    )
    if spec is None:
        raise HTTPException(status_code=404, detail="Fuel specification not found")

    vehicle.selected_trim_id = spec.trim_id
    vehicle.selected_trim_name = spec.trim or spec.submodel
    await db.commit()
    await db.refresh(vehicle)
    return vehicle
