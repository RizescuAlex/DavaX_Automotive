"""
Google Routes API client for candidate route generation.

Replaces the legacy Directions API with the modern Routes API,
supporting alternatives, traffic-aware routing, toll estimates,
and fuel-efficient route labels.
"""

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("davax.routing")

ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

# Only request the fields we actually use — controls billing
FIELD_MASK = ",".join([
    "routes.duration",
    "routes.distanceMeters",
    "routes.polyline.encodedPolyline",
    "routes.legs.duration",
    "routes.legs.distanceMeters",
    "routes.legs.startLocation",
    "routes.legs.endLocation",
    "routes.legs.steps.polyline.encodedPolyline",
    "routes.legs.steps.distanceMeters",
    "routes.legs.steps.staticDuration",
    "routes.routeLabels",
    "routes.travelAdvisory.tollInfo",
    "routes.description",
])

# Reusable client — created once, shares connection pool
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=10.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


async def close_client() -> None:
    """Call on app shutdown to release connections."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


def _build_request_body(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    avoid_tolls: bool = False,
    avoid_highways: bool = False,
    departure_time: str | None = None,
    waypoints: list[dict] | None = None,
) -> dict[str, Any]:
    """Build the Routes API request body."""
    body: dict[str, Any] = {
        "origin": {
            "location": {
                "latLng": {"latitude": origin_lat, "longitude": origin_lng}
            }
        },
        "destination": {
            "location": {
                "latLng": {"latitude": dest_lat, "longitude": dest_lng}
            }
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": True,
        "routeModifiers": {
            "avoidTolls": avoid_tolls,
            "avoidHighways": avoid_highways,
        },
        "languageCode": "en-US",
        "units": "METRIC",
        "extraComputations": ["TOLLS"],
    }

    if departure_time:
        body["departureTime"] = departure_time

    if waypoints:
        body["intermediates"] = [
            {
                "location": {
                    "latLng": {"latitude": wp["lat"], "longitude": wp["lng"]}
                }
            }
            for wp in waypoints
        ]

    return body


def _parse_duration_string(duration_str: str) -> int:
    """Parse Routes API duration string like '1522s' into seconds."""
    if duration_str and duration_str.endswith("s"):
        try:
            return int(duration_str.rstrip("s"))
        except ValueError:
            pass
    return 0


def _format_duration(seconds: int) -> str:
    """Convert seconds to human-readable duration like '2 h 10 min'."""
    if seconds < 60:
        return f"{seconds} sec"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes // 60
    remaining = minutes % 60
    if remaining == 0:
        return f"{hours} h"
    return f"{hours} h {remaining} min"


def _format_distance(meters: int) -> str:
    """Convert meters to human-readable distance like '165 km'."""
    if meters < 1000:
        return f"{meters} m"
    km = meters / 1000
    if km >= 10:
        return f"{int(round(km))} km"
    return f"{km:.1f} km"


def _parse_route(route: dict, index: int) -> dict[str, Any]:
    """Parse a single route from the Routes API response."""
    duration_s = _parse_duration_string(route.get("duration", "0s"))
    distance_m = route.get("distanceMeters", 0)

    # Extract step-level polylines for high-resolution rendering
    polylines = []
    legs = route.get("legs", [])
    for leg in legs:
        for step in leg.get("steps", []):
            encoded = step.get("polyline", {}).get("encodedPolyline")
            if encoded:
                polylines.append(encoded)

    # Fallback to route-level polyline if steps are missing
    if not polylines:
        overview = route.get("polyline", {}).get("encodedPolyline")
        if overview:
            polylines = [overview]

    # Toll info
    toll_info = route.get("travelAdvisory", {}).get("tollInfo")
    toll_estimate = None
    if toll_info and toll_info.get("estimatedPrice"):
        price = toll_info["estimatedPrice"][0]
        toll_estimate = {
            "amount": float(price.get("units", 0)) + float(price.get("nanos", 0)) / 1e9,
            "currency": price.get("currencyCode", ""),
        }

    # Route labels (e.g., DEFAULT_ROUTE, FUEL_EFFICIENT)
    labels = route.get("routeLabels", [])

    # Destination address from last leg
    dest_address = ""
    if legs:
        end_loc = legs[-1].get("endLocation", {}).get("latLng", {})
        if end_loc:
            dest_address = f"{end_loc.get('latitude', '')},{end_loc.get('longitude', '')}"

    return {
        "index": index,
        "polylines": polylines,
        "distance_m": distance_m,
        "distance_text": _format_distance(distance_m),
        "duration_s": duration_s,
        "duration_text": _format_duration(duration_s),
        "destination_address": route.get("description", dest_address),
        "toll_estimate": toll_estimate,
        "labels": labels,
    }


async def compute_routes(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    avoid_tolls: bool = False,
    avoid_highways: bool = False,
    departure_time: str | None = None,
    waypoints: list[dict] | None = None,
) -> list[dict[str, Any]]:
    """
    Call the Google Routes API and return parsed candidate routes.

    Returns a list of parsed route dicts, each with:
    - index, polylines, distance_m, distance_text, duration_s, duration_text,
      destination_address, toll_estimate, labels
    """
    body = _build_request_body(
        origin_lat, origin_lng, dest_lat, dest_lng,
        avoid_tolls=avoid_tolls,
        avoid_highways=avoid_highways,
        departure_time=departure_time,
        waypoints=waypoints,
    )

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
    }

    client = _get_client()

    # Retry logic: 1 retry on transient failures
    last_error = None
    for attempt in range(2):
        try:
            resp = await client.post(ROUTES_API_URL, json=body, headers=headers)
            break
        except httpx.TransportError as e:
            last_error = e
            logger.warning("Routes API transport error (attempt %d): %s", attempt + 1, e)
            if attempt == 1:
                raise RuntimeError(f"Routes API unreachable after 2 attempts: {last_error}") from e

    if resp.status_code != 200:
        error_detail = resp.text[:500]
        logger.error("Routes API error %d: %s", resp.status_code, error_detail)
        raise RuntimeError(f"Routes API returned {resp.status_code}: {error_detail}")

    data = resp.json()
    raw_routes = data.get("routes", [])

    if not raw_routes:
        raise RuntimeError("Routes API returned no routes for this origin/destination")

    return [_parse_route(route, i) for i, route in enumerate(raw_routes)]
