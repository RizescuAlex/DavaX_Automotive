from pydantic import BaseModel


class VehicleFuelProfileOut(BaseModel):
    fuel_type: str
    capacity: float
    capacity_unit: str
    consumption: float
    consumption_unit: str
    consumption_source: str
    reserve_threshold_pct: int
    source: str
    selected_trim_name: str | None = None
