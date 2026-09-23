import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class VehicleFuelSpecOut(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    car_api_id: int | None = None
    submodel_id: int | None = None
    trim_id: int
    submodel: str | None = None
    trim: str | None = None
    trim_description: str | None = None
    fuel_tank_capacity_gal: Decimal | None = None
    combined_mpg: Decimal | None = None
    city_mpg: Decimal | None = None
    highway_mpg: Decimal | None = None
    range_city_miles: Decimal | None = None
    range_highway_miles: Decimal | None = None
    source: str
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)
