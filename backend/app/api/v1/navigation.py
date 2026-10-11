import asyncio
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.api.v1.auth import _get_user_from_token
from app.models.onboarding_profile import OnboardingProfile
from app.models.trip import Trip
from app.schemas.navigation import (
    RouteFuelStopRequest, RouteFuelStopResponse,
    RouteCandidate, RouteRequest, RouteResponse, RouteScores,
    WeatherWarning, TripConfirmRequest, TripConfirmResponse,
    SuggestedStop,
)
from app.services.fuel import (
    compute_fuel_at_distance,
    decode_route_points,
    estimate_fuel_stop_count,
    project_places_onto_route,
    select_evenly_spaced_fuel_stops,
)
from app.services.geocoding import (
    resolve_country_and_currency,
    get_default_fuel_price,
)

from app.services.personalization import get_user_weights, upsert_frequented_location
from app.services.places import (
    find_fuel_stops,
    find_family_stops,
    find_scenic_stops,
    compute_family_place_points,
    find_regional_family_attractions,
    find_regional_scenic_spots,
    find_corridor_hub,
)
from app.services.routing import compute_routes
from app.services.scoring import RouteFeatures, score_and_rank
from app.services.weather import assess_route_weather
from app.services.vehicle_fuel import get_user_vehicle_fuel_profile

logger = logging.getLogger("davax.navigation")

router = APIRouter()

# Keep station searches close enough to the current route that a user-selected
# detour remains practical. The ranking below accounts for a round trip to the
# station while preferring stations earlier along the remaining route.
MAX_FUEL_STOP_OFF_ROUTE_M = 5_000


def _distance_between_m(lat_a: float, lng_a: float, lat_b: float, lng_b: float) -> float:
    """Great-circle distance for sorting nearby fuel locations."""
    earth_radius_m = 6_371_000
    phi_a, phi_b = math.radians(lat_a), math.radians(lat_b)
    delta_phi = math.radians(lat_b - lat_a)
    delta_lambda = math.radians(lng_b - lng_a)
    value = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi_a) * math.cos(phi_b) * math.sin(delta_lambda / 2) ** 2
    )
    value = min(1.0, max(0.0, value))
    return earth_radius_m * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


@router.post("/route-fuel-stop", response_model=RouteFuelStopResponse | None)
async def get_route_fuel_stop(
    request: RouteFuelStopRequest,
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    """Find the closest practical fuel/charging stop ahead on the current route."""
    current_user = await _get_user_from_token(token, db)
    profile = await get_user_vehicle_fuel_profile(db, str(current_user.id))
    route_points = decode_route_points([request.encoded_route])
    if len(route_points) < 2:
        return None

    candidates = await find_fuel_stops(
        request.encoded_route,
        fuel_type=profile.config.fuel_type,
        max_results=20,
    )
    if not candidates:
        return None

    route_distance_m = sum(
        _distance_between_m(first[0], first[1], second[0], second[1])
        for first, second in zip(route_points, route_points[1:])
    )
    project_places_onto_route(candidates, route_points, route_distance_m)
    practical_stops = [
        place for place in candidates
        if place.route_distance_m is not None
        and place.route_distance_m >= 100
        and place.distance_to_route_m is not None
        and place.distance_to_route_m <= MAX_FUEL_STOP_OFF_ROUTE_M
    ]
    if not practical_stops:
        return None

    station = min(
        practical_stops,
        key=lambda place: place.route_distance_m + 2 * place.distance_to_route_m,
    )
    return RouteFuelStopResponse(
        place_id=station.place_id,
        name=station.name,
        address=station.address,
        lat=station.lat,
        lng=station.lng,
        distance_ahead_m=round(station.route_distance_m),
        distance_to_route_m=round(station.distance_to_route_m),
        station_type="charging" if profile.config.is_ev else "fuel",
    )
def _get_route_midpoint(route: dict) -> tuple[float, float] | None:
    polylines = route.get("polylines", [])
    if not polylines:
        overview = route.get("overview_polyline")
        if overview:
            polylines = [overview]
    if not polylines:
        return None
    pts = decode_route_points(polylines)
    if not pts:
        return None
    return pts[len(pts) // 2]


def _min_distance_to_route_m(lat: float, lng: float, route_points: list[tuple[float, float]]) -> float:
    if not route_points:
        return 0.0
    step = max(1, len(route_points) // 60)
    sampled = route_points[::step]
    return min(_distance_between_m(lat, lng, pt[0], pt[1]) for pt in sampled)


def _is_duplicate_route(r1: dict, r2: dict) -> bool:
    """Check if two routes follow the same physical corridor."""
    poly1 = r1.get("overview_polyline")
    poly2 = r2.get("overview_polyline")
    if poly1 and poly2 and poly1 == poly2:
        return True

    # Check spatial midpoint separation
    mid1 = _get_route_midpoint(r1)
    mid2 = _get_route_midpoint(r2)
    if mid1 and mid2:
        sep_m = _distance_between_m(mid1[0], mid1[1], mid2[0], mid2[1])
        if sep_m > 3_000:
            return False  # Distinct geographical corridors (e.g. different valley or pass)!

    dist_diff = abs(r1.get("distance_m", 0) - r2.get("distance_m", 0))
    dur_diff = abs(r1.get("duration_s", 0) - r2.get("duration_s", 0))
    max_dist = max(r1.get("distance_m", 1), r2.get("distance_m", 1))
    return (dist_diff / max_dist < 0.02) and (dur_diff < 90)


def _bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate forward initial bearing in radians."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_lambda = math.radians(lng2 - lng1)
    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    return math.atan2(y, x)


def _destination_point(lat: float, lng: float, bearing_rad: float, d_m: float) -> tuple[float, float]:
    """Calculate destination point given start point, bearing, and distance."""
    R = 6_371_000.0
    phi1 = math.radians(lat)
    lambda1 = math.radians(lng)
    phi2 = math.asin(math.sin(phi1) * math.cos(d_m / R) + math.cos(phi1) * math.sin(d_m / R) * math.cos(bearing_rad))
    lambda2 = lambda1 + math.atan2(
        math.sin(bearing_rad) * math.sin(d_m / R) * math.cos(phi1),
        math.cos(d_m / R) - math.sin(phi1) * math.sin(phi2)
    )
    return (math.degrees(phi2), math.degrees(lambda2))


def _estimate_highway_fraction(labels: list[str]) -> float:
    if "MOUNTAIN_CORRIDOR" in labels or "SCENIC_REGIONAL" in labels:
        return 0.1
    if "FUEL_EFFICIENT" in labels:
        return 0.4
    return 0.7


def _get_route_overview_polyline(route: dict) -> str:
    """Get a single overview polyline for Places API search-along-route."""
    overview = route.get("overview_polyline")
    if overview:
        return overview
    polylines = route.get("polylines", [])
    if len(polylines) == 1:
        return polylines[0]
    return polylines[0] if polylines else ""


@router.post("/route", response_model=RouteResponse)
async def get_route(
    request: RouteRequest,
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Full SmartRoute pipeline:
    1. Generate candidate routes (Routes API)
    2. Weather enrichment
    3. Preference and fuel-feasibility scoring & ranking
    4. Save Trip proposal for feedback loop
    """
    # ── Resolve database user (works for both Firebase and email auth) ─────
    current_user = await _get_user_from_token(token, db)
    user_id = str(current_user.id)

    # ── Hard constraints from profile ─────────────────────────────────────
    avoid_tolls = False
    avoid_highways = False

    result = await db.execute(
        select(OnboardingProfile).where(
            OnboardingProfile.user_id == current_user.id
        )
    )
    profile = result.scalar_one_or_none()
    vehicle_fuel_profile = await get_user_vehicle_fuel_profile(db, user_id)
    fuel_config = vehicle_fuel_profile.config

    if request.overrides:
        if request.overrides.avoid_tolls is not None:
            avoid_tolls = request.overrides.avoid_tolls
        if request.overrides.avoid_highways is not None:
            avoid_highways = request.overrides.avoid_highways
    elif profile:
        avoid_tolls = profile.avoid_tolls
        avoid_highways = profile.avoid_highways

    waypoints = None
    if request.waypoints:
        waypoints = [{"lat": wp.lat, "lng": wp.lng} for wp in request.waypoints]

    # ── Step 1: Candidate generation (Standard, Mountain, and Regional Corridors) ──
    weights = await get_user_weights(user_id, db)

    direct_dist_m = _distance_between_m(request.origin_lat, request.origin_lng, request.dest_lat, request.dest_lng)
    mid_lat = (request.origin_lat + request.dest_lat) / 2.0
    mid_lng = (request.origin_lng + request.dest_lng) / 2.0
    bearing = _bearing(request.origin_lat, request.origin_lng, request.dest_lat, request.dest_lng)

    query_tasks = [
        compute_routes(
            origin_lat=request.origin_lat,
            origin_lng=request.origin_lng,
            dest_lat=request.dest_lat,
            dest_lng=request.dest_lng,
            avoid_tolls=avoid_tolls,
            avoid_highways=avoid_highways,
            departure_time=request.departure_time,
            waypoints=waypoints,
        ),
    ]

    if not avoid_highways:
        query_tasks.append(
            compute_routes(
                origin_lat=request.origin_lat,
                origin_lng=request.origin_lng,
                dest_lat=request.dest_lat,
                dest_lng=request.dest_lng,
                avoid_tolls=avoid_tolls,
                avoid_highways=True,
                departure_time=request.departure_time,
                waypoints=waypoints,
            )
        )

    # For inter-city trips (>= 30 km): dynamically discover lateral corridors (Left & Right)
    corridor_hub_tasks = []
    if direct_dist_m >= 30_000:
        # Lateral offset scaled to trip distance, clamped between 20 km and 75 km
        lat_offset_m = min(75_000.0, max(20_000.0, direct_dist_m * 0.25))

        # 1. Early-stage corridor (35% along the journey) - crucial for mountain chains branching early
        p35_lat = request.origin_lat + 0.35 * (request.dest_lat - request.origin_lat)
        p35_lng = request.origin_lng + 0.35 * (request.dest_lng - request.origin_lng)
        left_35_lat, left_35_lng = _destination_point(p35_lat, p35_lng, bearing - (math.pi / 2.0), lat_offset_m)
        right_35_lat, right_35_lng = _destination_point(p35_lat, p35_lng, bearing + (math.pi / 2.0), lat_offset_m)
        corridor_hub_tasks.append(("mountain", left_35_lat, left_35_lng, find_corridor_hub(left_35_lat, left_35_lng, radius_m=40_000)))
        corridor_hub_tasks.append(("tourist", right_35_lat, right_35_lng, find_corridor_hub(right_35_lat, right_35_lng, radius_m=40_000)))

        # 2. Midpoint corridor (50% along the journey)
        left_mid_lat, left_mid_lng = _destination_point(mid_lat, mid_lng, bearing - (math.pi / 2.0), lat_offset_m)
        right_mid_lat, right_mid_lng = _destination_point(mid_lat, mid_lng, bearing + (math.pi / 2.0), lat_offset_m)
        corridor_hub_tasks.append(("mountain", left_mid_lat, left_mid_lng, find_corridor_hub(left_mid_lat, left_mid_lng, radius_m=40_000)))
        corridor_hub_tasks.append(("tourist", right_mid_lat, right_mid_lng, find_corridor_hub(right_mid_lat, right_mid_lng, radius_m=40_000)))

    all_initial_tasks = query_tasks + [t[3] for t in corridor_hub_tasks]
    initial_results = await asyncio.gather(*all_initial_tasks, return_exceptions=True)

    standard_routes = initial_results[0] if isinstance(initial_results[0], list) else []
    if not standard_routes and isinstance(initial_results[0], Exception):
        logger.error("Route computation failed: %s", initial_results[0])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error computing routes: {initial_results[0]}",
        )

    scenic_candidate_routes = []
    if not avoid_highways and len(initial_results) > 1 and isinstance(initial_results[1], list):
        for r in initial_results[1]:
            r_labels = list(r.get("labels", []))
            if "SCENIC_REGIONAL" not in r_labels:
                r_labels.append("SCENIC_REGIONAL")
            r["labels"] = r_labels
            scenic_candidate_routes.append(r)

    # Decode standard route points to ensure discovered corridor hubs are genuinely separate from standard routes
    standard_route_pts = []
    if standard_routes:
        polylines = standard_routes[0].get("polylines", []) or [standard_routes[0].get("overview_polyline")]
        if polylines and polylines[0]:
            standard_route_pts = decode_route_points([p for p in polylines if p])

    # Route through discovered lateral corridor hubs
    hub_offset_idx = len(query_tasks)
    corridor_route_tasks = []
    seen_hub_names = set()

    for i, (tag, _anchor_lat, _anchor_lng, _) in enumerate(corridor_hub_tasks):
        hub_res = initial_results[hub_offset_idx + i]
        if isinstance(hub_res, tuple) and len(hub_res) == 3:
            h_lat, h_lng, h_name = hub_res
            if h_name in seen_hub_names:
                continue

            # Ensure hub is meaningfully separated (>= 12 km) from the primary highway
            if standard_route_pts:
                dist_to_std = _min_distance_to_route_m(h_lat, h_lng, standard_route_pts)
                if dist_to_std < 12_000:
                    logger.info("Corridor hub '%s' is only %.1f km from standard route, skipping", h_name, dist_to_std / 1000.0)
                    continue

            seen_hub_names.add(h_name)
            logger.info("Scheduling corridor route via '%s' (lat=%.4f, lng=%.4f, tag=%s)", h_name, h_lat, h_lng, tag)
            corridor_route_tasks.append((tag, h_name, compute_routes(
                origin_lat=request.origin_lat,
                origin_lng=request.origin_lng,
                dest_lat=request.dest_lat,
                dest_lng=request.dest_lng,
                avoid_tolls=avoid_tolls,
                avoid_highways=avoid_highways,
                departure_time=request.departure_time,
                waypoints=(waypoints or []) + [{"lat": h_lat, "lng": h_lng, "via": True}],
                compute_alternatives=False,
            )))

    if corridor_route_tasks:
        corridor_results = await asyncio.gather(*(t[2] for t in corridor_route_tasks), return_exceptions=True)
        for (tag, h_name, _), c_res in zip(corridor_route_tasks, corridor_results):
            if isinstance(c_res, list) and c_res:
                for r in c_res:
                    r_labels = list(r.get("labels", []))
                    if tag == "mountain":
                        if "MOUNTAIN_CORRIDOR" not in r_labels:
                            r_labels.append("MOUNTAIN_CORRIDOR")
                        if "SCENIC_REGIONAL" not in r_labels:
                            r_labels.append("SCENIC_REGIONAL")
                    else:
                        if "TOURIST_CORRIDOR" not in r_labels:
                            r_labels.append("TOURIST_CORRIDOR")
                    r["labels"] = r_labels
                    r["corridor_via_name"] = h_name
                    scenic_candidate_routes.append(r)
            else:
                logger.warning("Corridor route via '%s' returned no routes or error: %s", h_name, c_res)

    # Merge and deduplicate candidates using spatial midpoint separation
    all_raw = standard_routes + scenic_candidate_routes
    parsed_routes = []
    for cand in all_raw:
        if not any(_is_duplicate_route(cand, existing) for existing in parsed_routes):
            cand["index"] = len(parsed_routes)
            parsed_routes.append(cand)
        if len(parsed_routes) >= 5:
            break

    # ── Step 2: Weather enrichment ────────────────────────────────────────
    departure = datetime.now(timezone.utc)
    if request.departure_time:
        try:
            departure = datetime.fromisoformat(request.departure_time.replace("Z", "+00:00"))
        except ValueError:
            pass

    weather_by_route: dict[int, Any] = {}
    all_warnings: list[dict] = []

    for route in parsed_routes:
        try:
            weather = await assess_route_weather(
                polylines=route["polylines"],
                duration_s=route["duration_s"],
                departure_time=departure,
            )
            weather_by_route[route["index"]] = weather
            all_warnings.extend(weather.warnings)
        except Exception as e:
            logger.warning("Weather assessment failed for route %d: %s", route["index"], e)
            weather_by_route[route["index"]] = None

    # ── Currency & Fuel Price for origin country ──────────────────────────
    _, currency = await resolve_country_and_currency(request.origin_lat, request.origin_lng)
    fuel_price = get_default_fuel_price(currency, is_ev=fuel_config.is_ev)

    # ── Step 3: Places enrichment (Scenic & Family Attractions per route) ──
    scenic_score_by_route = {}
    family_score_by_route = {}

    async def _enrich_route_places(route: dict) -> tuple[int, float, float]:
        r_index = route["index"]
        poly = _get_route_overview_polyline(route)
        if not poly:
            return r_index, 0.0, 0.0

        s_score = 0.0
        f_score = 0.0
        try:
            tasks = []
            if weights.scenic > 0.15:
                tasks.append(("scenic", find_scenic_stops(poly, max_results=6)))
            if weights.family > 0.15:
                tasks.append(("family", find_family_stops(poly, max_results=8)))

            if tasks:
                results = await asyncio.gather(*(t[1] for t in tasks), return_exceptions=True)
                for (kind, _), res in zip(tasks, results):
                    if isinstance(res, list):
                        if kind == "scenic":
                            s_score = min(1.0, len(res) / 5.0)
                        elif kind == "family":
                            total_pts = sum(compute_family_place_points(p) for p in res)
                            f_score = min(1.0, total_pts / 8.0)
        except Exception as e:
            logger.warning("Places enrichment failed for route %d: %s", r_index, e)

        return r_index, s_score, f_score

    if weights.scenic > 0.15 or weights.family > 0.15:
        route_enrichments = await asyncio.gather(*(_enrich_route_places(r) for r in parsed_routes))
        for r_index, s_score, f_score in route_enrichments:
            scenic_score_by_route[r_index] = s_score
            family_score_by_route[r_index] = f_score
    else:
        for r in parsed_routes:
            scenic_score_by_route[r["index"]] = 0.0
            family_score_by_route[r["index"]] = 0.0

    # ── Step 3b: Fuel stops along routes (evenly distanced) ───────────────
    route_stops_by_index: dict[int, list[SuggestedStop]] = {}
    for route in parsed_routes:
        route_stops_by_index[route["index"]] = []
        overview_poly = _get_route_overview_polyline(route)
        if overview_poly:
            try:
                fuel_places = await find_fuel_stops(
                    overview_poly,
                    fuel_type=fuel_config.fuel_type,
                    max_results=20,
                )
                if fuel_places:
                    r_points = decode_route_points(route.get("polylines", []))
                    project_places_onto_route(fuel_places, r_points, route["distance_m"])
                    chosen_places = select_evenly_spaced_fuel_stops(
                        fuel_places,
                        route["distance_m"],
                        max_stops=4,
                    )
                    curr_fuel = request.current_fuel_level if request.current_fuel_level is not None else 100.0
                    route_weather = weather_by_route.get(route["index"])
                    w_risk = route_weather.route_risk if route_weather else 0.0
                    h_frac = _estimate_highway_fraction(route.get("labels", []))

                    stops: list[SuggestedStop] = []
                    for cp in chosen_places:
                        arrival_pct = round(compute_fuel_at_distance(
                            curr_fuel,
                            cp.route_distance_m or 0.0,
                            fuel_config,
                            w_risk,
                            h_frac,
                        ))
                        arrival_l = round(fuel_config.tank_capacity_l * (arrival_pct / 100.0), 1)
                        detour_m = cp.distance_to_route_m or 0.0
                        detour_min = max(1, int((detour_m * 2) / 1000.0 / 40.0 * 60.0))
                        stops.append(SuggestedStop(
                            place_id=cp.place_id,
                            name=cp.name,
                            type="charging" if fuel_config.is_ev else "fuel",
                            lat=cp.lat,
                            lng=cp.lng,
                            arrival_fuel_pct=arrival_pct,
                            arrival_fuel_liters=arrival_l,
                            arrival_fuel_amount=arrival_l,
                            distance_from_start_km=round((cp.route_distance_m or 0.0) / 1000.0, 1),
                            detour_min=detour_min,
                            fuel_price=fuel_price,
                            fuel_currency=currency,
                        ))
                    route_stops_by_index[route["index"]] = stops
            except Exception as e:
                logger.warning("Fuel stop search failed for route %d: %s", route["index"], e)

    # ── Step 4: Score and rank ────────────────────────────────────────────
    features = []
    for route in parsed_routes:
        toll_cost = 0.0
        if route.get("toll_estimate"):
            toll_cost = route["toll_estimate"].get("amount", 0.0)

        weather = weather_by_route.get(route["index"])
        weather_risk = weather.route_risk if weather else 0.0

        corridor_via_name = route.get("corridor_via_name", "")
        features.append(RouteFeatures(
            index=route["index"],
            duration_s=route["duration_s"],
            distance_m=route["distance_m"],
            toll_cost=toll_cost,
            highway_fraction=_estimate_highway_fraction(route.get("labels", [])),
            labels=route.get("labels", []),
            weather_risk=weather_risk,
            scenic_score=scenic_score_by_route.get(route["index"], 0.0),
            family_stop_score=family_score_by_route.get(route["index"], 0.0),
            corridor_via_name=corridor_via_name,
            fuel_stop_count=estimate_fuel_stop_count(
                route["distance_m"],
                request.current_fuel_level if request.current_fuel_level is not None else 100.0,
                fuel_config,
                weather_risk,
                _estimate_highway_fraction(route.get("labels", [])),
            ),
        ))

    scored_routes = score_and_rank(
        features=features,
        weights=weights,
        fuel_price_per_l=fuel_price,
        consumption_l_per_100km=fuel_config.consumption_l_per_100km,
    )

    # ── Build response ────────────────────────────────────────────────────
    route_by_index = {r["index"]: r for r in parsed_routes}
    candidates = []
    for rank, scored in enumerate(scored_routes):
        route = route_by_index[scored.index]
        cand_stops = route_stops_by_index.get(scored.index, [])
        est_fuel_litres = round((route["distance_m"] / 100_000.0) * fuel_config.consumption_l_per_100km, 1)
        est_trip_cost = round(est_fuel_litres * fuel_price, 1)
        candidates.append(
            RouteCandidate(
                index=scored.index,
                selected=(rank == 0),
                polylines=route["polylines"],
                distance_m=route["distance_m"],
                distance_text=route["distance_text"],
                duration_s=route["duration_s"],
                duration_text=route["duration_text"],
                destination_address=route["destination_address"],
                toll_estimate=route["toll_estimate"],
                estimated_fuel_stops=next(
                    feature.fuel_stop_count
                    for feature in features
                    if feature.index == route["index"]
                ),
                labels=route.get("labels", []),
                maneuvers=route.get("maneuvers", []),
                scores=RouteScores(
                    time=round(scored.time_score, 1),
                    cost=round(scored.cost_score, 1),
                    scenic=round(scored.scenic_score, 1),
                    family=round(scored.family_score, 1),
                    weather_risk=round(scored.weather_risk, 2),
                    utility=round(scored.utility, 3),
                ),
                explanation=scored.explanation,
                estimated_trip_cost=est_trip_cost,
                estimated_fuel_litres=est_fuel_litres,
                fuel_price_per_l=fuel_price,
                fuel_currency=currency,
                suggested_stops=cand_stops,
            )
        )

    # Deduplicate warnings
    seen_warnings = set()
    unique_warnings = []
    for w in all_warnings:
        if isinstance(w, dict):
            key = f"{w.get('lat', 0):.1f},{w.get('lng', 0):.1f},{w.get('condition', '')}"
            if key not in seen_warnings:
                seen_warnings.add(key)
                unique_warnings.append(WeatherWarning(**w))

    selected = candidates[0] if candidates else None

    # ── Phase 5: Save Trip Proposal ───────────────────────────────────────
    trip_id_str = None
    try:
        trip = Trip(
            user_id=current_user.id,
            origin={"lat": request.origin_lat, "lng": request.origin_lng},
            destination={"lat": request.dest_lat, "lng": request.dest_lng},
            proposed_routes=[c.model_dump() for c in candidates],
            fuel_input=(
                round(request.current_fuel_level)
                if request.current_fuel_level is not None
                else None
            ),
            status="proposed",
        )
        db.add(trip)
        await db.commit()
        trip_id_str = str(trip.id)
    except Exception as e:
        logger.warning("Failed to save trip proposal: %s", e)
        await db.rollback()

    return RouteResponse(
        polylines=selected.polylines if selected else [],
        distance_text=selected.distance_text if selected else "",
        duration_text=selected.duration_text if selected else "",
        destination_address=selected.destination_address if selected else None,
        routes=candidates,
        weather_warnings=unique_warnings,
        suggested_stops=selected.suggested_stops if selected else [],
        trip_id=trip_id_str,
        maneuvers=selected.maneuvers if selected else [],
        fuel_currency=currency,
    )



# ── Phase 5: Trip Confirm Endpoint ────────────────────────────────────────────

@router.post("/trips/{trip_id}/confirm", response_model=TripConfirmResponse)
async def confirm_trip(
    trip_id: str,
    request: TripConfirmRequest,
    token: dict = Depends(get_current_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Confirm a trip selection.
    Saves the final choice and upserts the destination into frequented locations.
    """
    current_user = await _get_user_from_token(token, db)

    # Validate trip_id is a valid UUID
    try:
        trip_uuid = uuid.UUID(trip_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid trip ID format")

    result = await db.execute(
        select(Trip).where(Trip.id == trip_uuid, Trip.user_id == current_user.id)
    )
    trip = result.scalar_one_or_none()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if trip.status == "confirmed":
        return TripConfirmResponse(trip_id=trip_id, status="confirmed", message="Already confirmed")

    # Update trip status
    trip.selected_index = request.selected_route_index
    trip.status = "confirmed"
    trip.confirmed_at = datetime.now(timezone.utc)

    trip.final_route = {
        "selected_index": request.selected_route_index,
        "kept_stops": request.kept_stops,
        "destination_place_id": request.destination_place_id,
    }

    # Upsert destination into frequented locations
    if request.destination_place_id:
        try:
            dest = trip.destination or {}
            if "lat" in dest and "lng" in dest:
                await upsert_frequented_location(
                    user_id=current_user.id,
                    lat=dest["lat"],
                    lng=dest["lng"],
                    db=db,
                    place_id=request.destination_place_id,
                    category="destination",
                    is_arrival=False,
                )
        except Exception as e:
            logger.warning("Failed to upsert frequented location on trip confirm: %s", e)

    await db.commit()


    return TripConfirmResponse(
        trip_id=trip_id,
        status="confirmed",
        message="Trip confirmed and locations updated.",
    )
