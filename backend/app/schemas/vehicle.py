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
    auto_mode: bool = True

    # Compressor output: 0 is off, 1-3 how hard it works. A level rather than a
    # boolean so the dock can offer the same four steps a physical A/C button
    # does; "is the A/C on" is just ac_level > 0.
    ac_level: int = Field(default=2, ge=0, le=3)

    # Comfort. Seat heating is a per-driver preference worth carrying between
    # trips, which is why it lives here rather than in the ephemeral vehicle
    # simulation alongside the headlights.
    seat_heat_left: int = Field(default=0, ge=0, le=3)
    seat_heat_right: int = Field(default=0, ge=0, le=3)
    front_defrost: bool = False
    rear_defrost: bool = False


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
