import uuid

from pydantic import BaseModel, Field


class VehicleInput(BaseModel):
    model_year: int = Field(ge=2015, le=2020)
    make: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)


class VehicleOut(VehicleInput):
    id: uuid.UUID

    model_config = {"from_attributes": True}