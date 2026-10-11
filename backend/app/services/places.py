"""
Places service for searching stops along a route.

Uses Google Places API (New) Text Search with searchAlongRouteParameters to find
fuel stations, EV chargers, and family-friendly places along a route.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("davax.places")

PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.types",
    "places.rating",
    "places.fuelOptions",
    "places.evChargeOptions",
    "places.goodForChildren",
    "places.restroom",
])

# Reusable client
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=10.0),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


@dataclass
class PlaceResult:
    """A place found along the route."""
    place_id: str = ""
    name: str = ""
    address: str = ""
    lat: float = 0.0
    lng: float = 0.0
    types: list[str] = field(default_factory=list)
    rating: float = 0.0
    has_fuel: bool = False
    has_ev_charging: bool = False
    good_for_children: bool = False
    has_restroom: bool = False
    fuel_prices: list[dict] | None = None
    ev_charge_options: dict | None = None
    # Set by route planning after projecting this place onto the route geometry.
    route_distance_m: float | None = None
    distance_to_route_m: float | None = None


def _parse_place(place: dict) -> PlaceResult:
    """Parse a single place from the Places API response."""
    location = place.get("location", {})
    display_name = place.get("displayName", {})
    types = place.get("types", [])

    fuel_options = place.get("fuelOptions")
    ev_options = place.get("evChargeOptions")

    fuel_prices = None
    if fuel_options and fuel_options.get("fuelPrices"):
        fuel_prices = [
            {
                "type": fp.get("type", ""),
                "price": fp.get("price", {}).get("units", ""),
                "currency": fp.get("price", {}).get("currencyCode", ""),
            }
            for fp in fuel_options["fuelPrices"]
        ]

    ev_charge = None
    if ev_options:
        ev_charge = {
            "connector_count": ev_options.get("connectorCount", 0),
            "connectors": [
                {
                    "type": c.get("type", ""),
                    "max_charge_rate_kw": c.get("maxChargeRateKw", 0),
                    "count": c.get("count", 0),
                }
                for c in ev_options.get("connectorAggregation", [])
            ],
        }

    fuel_types = {"gas_station", "fuel"}
    has_fuel = bool(fuel_types & set(types)) or fuel_options is not None

    return PlaceResult(
        place_id=place.get("id", ""),
        name=display_name.get("text", ""),
        address=place.get("formattedAddress", ""),
        lat=location.get("latitude", 0.0),
        lng=location.get("longitude", 0.0),
        types=types,
        rating=place.get("rating", 0.0),
        has_fuel=has_fuel,
        has_ev_charging=ev_options is not None,
        good_for_children=place.get("goodForChildren", False),
        has_restroom=place.get("restroom", False),
        fuel_prices=fuel_prices,
        ev_charge_options=ev_charge,
    )


async def search_along_route(
    query: str,
    encoded_polyline: str,
    max_results: int = 10,
) -> list[PlaceResult]:
    """
    Search for places along a route using Google Places API (New).

    Args:
        query: Text query (e.g., "gas station", "EV charger", "rest stop")
        encoded_polyline: Route-level encoded polyline from Routes API
        max_results: Maximum number of results to return
    """
    body = {
        "textQuery": query,
        "searchAlongRouteParameters": {
            "polyline": {
                "encodedPolyline": encoded_polyline,
            }
        },
        "maxResultCount": min(max_results, 20),
        "languageCode": "en",
    }

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
    }

    client = _get_client()

    try:
        resp = await client.post(PLACES_SEARCH_URL, json=body, headers=headers)
    except httpx.TransportError as e:
        logger.error("Places API transport error: %s", e)
        return []

    if resp.status_code != 200:
        logger.error("Places API error %d: %s", resp.status_code, resp.text[:300])
        return []

    data = resp.json()
    raw_places = data.get("places", [])

    return [_parse_place(p) for p in raw_places]


async def find_fuel_stops(
    encoded_polyline: str,
    fuel_type: str | None = None,
    max_results: int = 10,
) -> list[PlaceResult]:
    """Search specifically for fuel/charging stations along the route."""
    if fuel_type and fuel_type.lower() in ("electric", "ev"):
        query = "EV charging station"
    elif fuel_type and fuel_type.lower() == "diesel":
        query = "diesel gas station"
    else:
        query = "gas station"

    results = await search_along_route(query, encoded_polyline, max_results)
    # Filter to only actual fuel/EV stops
    return [r for r in results if r.has_fuel or r.has_ev_charging]


FAMILY_ATTRACTION_TYPES = {
    "tourist_attraction",
    "amusement_park",
    "theme_park",
    "water_park",
    "zoo",
    "aquarium",
    "museum",
    "historical_landmark",
    "historical_place",
    "castle",
    "palace",
    "national_park",
    "botanical_garden",
    "cultural_center",
    "planetarium",
}


def compute_family_place_points(place: PlaceResult) -> float:
    """
    Score a place based on its tourist attraction value, kid-friendliness,
    and visitor rating.
    """
    points = 0.0
    place_types = set(place.types)

    # 1. Tourist Attraction & Landmark (primary weight: +2.5 pts)
    is_attraction = bool(place_types & FAMILY_ATTRACTION_TYPES)
    name_lower = place.name.lower()
    attraction_keywords = (
        "castle", "palace", "museum", "zoo", "aquarium", "fortress",
        "monument", "amusement", "theme park", "water park", "botanical"
    )
    if is_attraction or any(kw in name_lower for kw in attraction_keywords):
        points += 2.5

    # 2. Kid-friendly amenities (+1.0 pt)
    if place.good_for_children:
        points += 1.0

    # 3. Restroom / comfort facility (+0.5 pt)
    if place.has_restroom:
        points += 0.5

    # 4. Rating bonus: 4.0+ stars gets a 1.25x multiplier
    if place.rating and place.rating >= 4.0:
        points *= 1.25

    return points


async def find_family_stops(
    encoded_polyline: str,
    max_results: int = 8,
) -> list[PlaceResult]:
    """Search for family tourist attractions, museums, landmarks, and kid-friendly rest spots along the route."""
    results = await search_along_route(
        "family tourist attraction museum landmark amusement park zoo playground",
        encoded_polyline,
        max_results,
    )
    return results


async def find_scenic_stops(
    encoded_polyline: str,
    max_results: int = 8,
) -> list[PlaceResult]:
    """Search for scenic viewpoints and parks along the route."""
    results = await search_along_route("scenic viewpoint park nature", encoded_polyline, max_results)
    return results


async def search_places_in_region(
    query: str,
    center_lat: float,
    center_lng: float,
    radius_m: float = 40_000,
    max_results: int = 10,
) -> list[PlaceResult]:
    """
    Search for places within a geographic region (circle) using Google Places API (New).
    Used to discover attractions and scenic corridors beyond the primary highway path.
    """
    body = {
        "textQuery": query,
        "locationBias": {
            "circle": {
                "center": {
                    "latitude": center_lat,
                    "longitude": center_lng,
                },
                "radius": min(float(radius_m), 48_000.0),
            }
        },
        "maxResultCount": min(max_results, 20),
        "languageCode": "en",
    }

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
    }

    client = _get_client()

    try:
        resp = await client.post(PLACES_SEARCH_URL, json=body, headers=headers)
    except httpx.TransportError as e:
        logger.error("Places API regional search transport error: %s", e)
        return []

    if resp.status_code != 200:
        logger.error("Places API regional search error %d: %s", resp.status_code, resp.text[:300])
        return []

    data = resp.json()
    raw_places = data.get("places", [])

    return [_parse_place(p) for p in raw_places]


async def find_regional_family_attractions(
    center_lat: float,
    center_lng: float,
    radius_m: float = 40_000,
    max_results: int = 10,
) -> list[PlaceResult]:
    """Search for top family tourist attractions, museums, castles, and theme parks in a region."""
    return await search_places_in_region(
        "tourist attraction castle museum landmark amusement park zoo aquarium botanical garden",
        center_lat,
        center_lng,
        radius_m,
        max_results,
    )


async def find_regional_scenic_spots(
    center_lat: float,
    center_lng: float,
    radius_m: float = 40_000,
    max_results: int = 10,
) -> list[PlaceResult]:
    """Search for scenic viewpoints, mountain passes, nature reserves, and national parks in a region."""
    return await search_places_in_region(
        "scenic viewpoint mountain pass nature reserve national park panorama lake",
        center_lat,
        center_lng,
        radius_m,
        max_results,
    )


async def find_corridor_hub(
    anchor_lat: float,
    anchor_lng: float,
    radius_m: float = 40_000,
) -> tuple[float, float, str] | None:
    """
    Find a prominent tourist attraction, scenic viewpoint, or landmark in a lateral corridor.
    Queries Google Places using clean keywords.
    Returns (lat, lng, name) of a verified real-world place, or None if no place is found.
    """
    for query in ("tourist attraction", "scenic viewpoint"):
        places = await search_places_in_region(
            query=query,
            center_lat=anchor_lat,
            center_lng=anchor_lng,
            radius_m=min(float(radius_m), 45_000.0),
            max_results=8,
        )
        if places:
            best = max(places, key=lambda p: (p.rating or 3.5) + (2.0 if p.good_for_children else 0.0))
            logger.info("Found corridor landmark '%s' at (%.4f, %.4f) for query '%s'", best.name, best.lat, best.lng, query)
            return best.lat, best.lng, best.name

    logger.info("No corridor landmark found near (%.4f, %.4f)", anchor_lat, anchor_lng)
    return None
