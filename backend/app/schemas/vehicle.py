from pydantic import BaseModel, ConfigDict, Field


class ClimateSettings(BaseModel):
    """
    Cabin climate control.

    This is the only settings group with a defined shape so far — the seat,
    mirror, steering and lighting groups stay untyped dicts until something
    actually writes them.
    """

    target_temp: float = Field(default=21.0, ge=16.0, le=28.0)
    fan_speed: int = Field(default=2, ge=0, le=5)
    ac_on: bool = True
    auto_mode: bool = True


class VehicleSettingsUpdate(BaseModel):
    """Partial update — any group left out of the body is untouched."""

    climate_settings: ClimateSettings | None = None
    seat_position: dict | None = None
    mirror_left: dict | None = None
    mirror_right: dict | None = None
    steering_position: dict | None = None
    lighting_settings: dict | None = None


class VehicleSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    profile_name: str
    climate_settings: ClimateSettings
    seat_position: dict | None = None
    mirror_left: dict | None = None
    mirror_right: dict | None = None
    steering_position: dict | None = None
    lighting_settings: dict | None = None
