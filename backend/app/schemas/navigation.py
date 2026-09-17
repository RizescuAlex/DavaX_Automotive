from pydantic import BaseModel

class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float

class RouteResponse(BaseModel):
    polylines: list[str]
    distance_text: str
    duration_text: str
    destination_address: str | None = None
