from pydantic import BaseModel
from typing import Any

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
    labels: list[str] = []
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
    weather_warnings: list[WeatherWarning]
    suggested_stops: list[SuggestedStop]
    trip_id: str | None = None

class TripConfirmRequest(BaseModel):
    selected_route_index: int
    kept_stops: list[str] = []
    destination_place_id: str | None = None

class TripConfirmResponse(BaseModel):
    trip_id: str
    status: str
    message: str
