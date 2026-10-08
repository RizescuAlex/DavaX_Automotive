from pydantic import BaseModel, Field

class Waypoint(BaseModel):
    lat: float
    lng: float

class RouteOverrides(BaseModel):
    avoid_tolls: bool | None = None
    avoid_highways: bool | None = None

class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    departure_time: str | None = None
    waypoints: list[Waypoint] | None = None
    overrides: RouteOverrides | None = None
    current_fuel_level: int | None = None


class RouteLocation(BaseModel):
    lat: float
    lng: float


class RouteManeuver(BaseModel):
    type: str | None = None
    start_location: RouteLocation
    end_location: RouteLocation


class RouteScores(BaseModel):
    time: float
    cost: float
    scenic: float
    family: float
    weather_risk: float
    utility: float

class RouteCandidate(BaseModel):
    index: int
    selected: bool
    polylines: list[str]
    distance_m: int
    distance_text: str
    duration_s: int
    duration_text: str
    destination_address: str | None = None
    toll_estimate: dict | None = None
    labels: list[str] = Field(default_factory=list)
    maneuvers: list[RouteManeuver] = Field(default_factory=list)
    scores: RouteScores
    explanation: str

class WeatherWarning(BaseModel):
    location: str
    lat: float
    lng: float
    eta: str
    condition: str
    message: str

class SuggestedStop(BaseModel):
    place_id: str
    name: str
    type: str
    lat: float
    lng: float
    arrival_fuel_pct: int
    detour_min: int
    fuel_price: float | None = None

class RouteResponse(BaseModel):
    polylines: list[str]
    distance_text: str
    duration_text: str
    destination_address: str | None = None
    routes: list[RouteCandidate]
    weather_warnings: list[WeatherWarning] = Field(default_factory=list)
    suggested_stops: list[SuggestedStop] = Field(default_factory=list)
    trip_id: str | None = None
    maneuvers: list[RouteManeuver] = Field(default_factory=list)

class TripConfirmRequest(BaseModel):
    selected_route_index: int
    kept_stops: list[str] = Field(default_factory=list)
    destination_place_id: str | None = None

class TripConfirmResponse(BaseModel):
    trip_id: str
    status: str
    message: str
