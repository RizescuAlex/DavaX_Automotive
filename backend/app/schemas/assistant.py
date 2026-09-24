from typing import Any, Literal

from pydantic import BaseModel, Field


class VehicleContext(BaseModel):
    """A snapshot of the dashboard, sent with every message.

    The model reads this instead of calling read-only tools. Speed and fuel are
    simulated in the frontend and climate lives in the store, so the browser
    already holds everything — shipping it as context costs one field each and
    saves a tool round trip per question.

    Every field is optional: the frontend sends what it has, and a missing one
    simply goes unmentioned in the prompt rather than being reported as zero.
    """

    # Simulated drive state (read-only — no tool writes these).
    speed: float | None = None
    fuel_level: float | None = None
    engine_temp: float | None = None
    cabin_temp: float | None = None

    # Climate — writable via set_climate.
    target_temperature: float | None = None
    fan_speed: int | None = None
    ac_level: int | None = None
    auto_mode: bool | None = None
    seat_heat_left: int | None = None
    seat_heat_right: int | None = None
    front_defrost: bool | None = None
    rear_defrost: bool | None = None

    # Exterior controls — writable via set_vehicle_controls.
    headlights: bool | None = None
    hazards: bool | None = None
    left_signal: bool | None = None
    right_signal: bool | None = None
    wipers: bool | None = None
    # True while the dusk sensor, not the driver, decides the headlights.
    headlights_auto: bool | None = None
    fog_lights: bool | None = None
    rear_fog_lights: bool | None = None

    # The screen — writable via set_display.
    theme: Literal["dark", "light"] | None = None
    preferences_open: bool | None = None


class AssistantMessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    context: VehicleContext = Field(default_factory=VehicleContext)


class AssistantAction(BaseModel):
    """One tool call for the frontend to apply.

    The backend never executes these. `tool` is always a name the frontend
    knows: the route drops anything outside TOOL_NAMES before responding.
    """

    tool: str
    args: dict[str, Any]


class AssistantMessageOut(BaseModel):
    reply: str
    actions: list[AssistantAction] = Field(default_factory=list)
