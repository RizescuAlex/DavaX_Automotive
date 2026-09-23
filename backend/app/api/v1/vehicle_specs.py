import httpx
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import _get_user_from_token
from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.models.vehicle import Vehicle
from app.models.vehicle_fuel_spec import VehicleFuelSpec
from app.schemas.vehicle_fuel_spec import VehicleFuelSpecOut

router = APIRouter()

CAR_API_URL = "https://carapi.app/api/mileages/v2"


@router.get("", response_model=list[VehicleFuelSpecOut])
async def get_vehicle_specs(
    year: int = Query(..., ge=2015, le=2020),
    make: str = Query(..., min_length=1),
    model: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    current_user = await _get_user_from_token(token, db)
    result = await db.execute(select(Vehicle).where(Vehicle.user_id == current_user.id))
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if (vehicle.model_year, vehicle.make.casefold(), vehicle.model.casefold()) != (
        year,
        make.casefold(),
        model.casefold(),
    ):
        raise HTTPException(status_code=400, detail="Requested vehicle does not match your saved vehicle")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                CAR_API_URL,
                params={"year": year, "make": make, "model": model},
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise HTTPException(status_code=502, detail="CarAPI returned an invalid response format")
            rows = payload.get("data", [])
            if not isinstance(rows, list):
                raise HTTPException(status_code=502, detail="CarAPI returned an invalid data format")

            fetched_at = datetime.now(timezone.utc)
            persisted = []
            for row in rows:
                trim_id = row.get("trim_id")
                if trim_id is None:
                    continue

                values = {
                    "car_api_id": row.get("id"),
                    "submodel_id": row.get("submodel_id"),
                    "trim_id": trim_id,
                    "submodel": row.get("submodel"),
                    "trim": row.get("trim"),
                    "trim_description": row.get("trim_description"),
                    "fuel_tank_capacity_gal": _decimal(row.get("fuel_tank_capacity")),
                    "combined_mpg": _decimal(row.get("combined_mpg")),
                    "city_mpg": _decimal(row.get("epa_city_mpg")),
                    "highway_mpg": _decimal(row.get("epa_highway_mpg")),
                    "range_city_miles": _decimal(row.get("range_city")),
                    "range_highway_miles": _decimal(row.get("range_highway")),
                    "raw_payload": row,
                    "source": "carapi",
                    "fetched_at": fetched_at,
                }
                existing = await db.scalar(
                    select(VehicleFuelSpec).where(
                        VehicleFuelSpec.vehicle_id == vehicle.id,
                        VehicleFuelSpec.trim_id == trim_id,
                    )
                )
                if existing is None:
                    existing = VehicleFuelSpec(vehicle_id=vehicle.id, **values)
                    db.add(existing)
                else:
                    for field, value in values.items():
                        setattr(existing, field, value)
                persisted.append(existing)

            await db.commit()
            for spec in persisted:
                await db.refresh(spec)
            return [VehicleFuelSpecOut.model_validate(spec) for spec in persisted]
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"CarAPI request failed: {exc}") from exc


def _decimal(value) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
