from typing import Any

from pydantic import BaseModel, Field


class VehicleSettingsBase(BaseModel):
    profile_name: str = Field(default="default", max_length=50)
    seat_position: dict[str, Any] | None = None
    mirror_left: dict[str, Any] | None = None
    mirror_right: dict[str, Any] | None = None
    steering_position: dict[str, Any] | None = None
    climate_settings: dict[str, Any] | None = None
    lighting_settings: dict[str, Any] | None = None
    is_active: bool = True


class VehicleSettingsOut(VehicleSettingsBase):
    class Config:
        from_attributes = True