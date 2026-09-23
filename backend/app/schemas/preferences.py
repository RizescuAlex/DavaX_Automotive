from pydantic import BaseModel, Field


class PreferencesUpdate(BaseModel):
    fastest_arrival: int | None = Field(default=None, ge=0, le=10)
    lowest_cost: int | None = Field(default=None, ge=0, le=10)
    scenic_routes: int | None = Field(default=None, ge=0, le=10)
    family_friendly: int | None = Field(default=None, ge=0, le=10)
    avoid_tolls: bool | None = None
    avoid_highways: bool | None = None
    preferred_fuel_type: str | None = Field(default=None, max_length=20)


class PreferencesOut(BaseModel):
    fastest_arrival: int
    lowest_cost: int
    scenic_routes: int
    family_friendly: int
    avoid_tolls: bool
    avoid_highways: bool
    preferred_fuel_type: str | None

    model_config = {"from_attributes": True}
