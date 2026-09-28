import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.api.v1.auth import _get_user_from_token
from app.models.onboarding_profile import OnboardingProfile
from app.models.trip import Trip
from app.schemas.navigation import (
    RouteCandidate, RouteRequest, RouteResponse, RouteScores,
    SuggestedStop, WeatherWarning, TripConfirmRequest, TripConfirmResponse,
)
from app.services.fuel import build_fuel_plan, get_fuel_config, rank_fuel_stops
from app.services.personalization import get_user_weights, get_user_fuel_type, upsert_frequented_location
from app.services.places import find_fuel_stops, find_family_stops, find_scenic_stops
from app.services.routing import compute_routes
from app.services.scoring import RouteFeatures, UserWeights, score_and_rank
from app.services.weather import assess_route_weather

logger = logging.getLogger("davax.navigation")

router = APIRouter()


def _estimate_highway_fraction(labels: list[str]) -> float:
    if "FUEL_EFFICIENT" in labels:
        return 0.4
    return 0.7


def _get_route_overview_polyline(route: dict) -> str:
    """Get a single overview polyline for Places API search-along-route."""
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
    2. Weather enrichment (Open-Meteo)
    3. Places & fuel stop search (Places API)
    4. Preference-weighted scoring & ranking
    5. Fuel plan for the selected route
    6. Save Trip proposal for feedback loop
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

    # ── Step 1: Candidate generation ──────────────────────────────────────
    try:
        parsed_routes = await compute_routes(
            origin_lat=request.origin_lat,
            origin_lng=request.origin_lng,
            dest_lat=request.dest_lat,
            dest_lng=request.dest_lng,
            avoid_tolls=avoid_tolls,
            avoid_highways=avoid_highways,
            departure_time=request.departure_time,
            waypoints=waypoints,
        )
    except RuntimeError as e:
        logger.error("Route computation failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error computing routes: {e}",
        ) from e

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

    # ── Step 3: Places enrichment (on top candidate only to save API calls) ─
    weights = await get_user_weights(user_id, db)
    fuel_type = await get_user_fuel_type(user_id, db)

    primary_route = parsed_routes[0] if parsed_routes else None
    overview_polyline = _get_route_overview_polyline(primary_route) if primary_route else ""

    scenic_data: list = []
    family_data: list = []

    if overview_polyline:
        try:
            if weights.scenic > 0.15:
                scenic_data = await find_scenic_stops(overview_polyline, max_results=5)
            if weights.family > 0.15:
                family_data = await find_family_stops(overview_polyline, max_results=5)
        except Exception as e:
            logger.warning("Places search failed: %s", e)

    scenic_score_by_route = {}
    family_score_by_route = {}
    for route in parsed_routes:
        scenic_score_by_route[route["index"]] = min(1.0, len(scenic_data) / 5.0) if scenic_data else 0.0
        family_count = sum(1 for p in family_data if p.good_for_children or p.has_restroom)
        family_score_by_route[route["index"]] = min(1.0, family_count / 3.0) if family_data else 0.0

    # ── Step 4: Score and rank ────────────────────────────────────────────
    features = []
    for route in parsed_routes:
        toll_cost = 0.0
        if route.get("toll_estimate"):
            toll_cost = route["toll_estimate"].get("amount", 0.0)

        weather = weather_by_route.get(route["index"])
        weather_risk = weather.route_risk if weather else 0.0

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
        ))

    scored_routes = score_and_rank(
        features=features,
        weights=weights,
        fuel_price_per_l=7.0,
        consumption_l_per_100km=settings.FUEL_CONSUMPTION_L_PER_100KM,
    )

    # ── Step 5: Fuel plan for selected route ──────────────────────────────
    suggested_stops: list[SuggestedStop] = []

    if request.current_fuel_level is not None and primary_route:
        fuel_config = get_fuel_config(fuel_type)
        top_weather = weather_by_route.get(scored_routes[0].index if scored_routes else 0)
        wp = top_weather.route_risk if top_weather else 0.0

        try:
            fuel_stops = await find_fuel_stops(
                overview_polyline,
                fuel_type=fuel_type,
                max_results=10,
            )

            ranked_stops = rank_fuel_stops(
                candidates=[s for s in fuel_stops],
                route_center_lat=(request.origin_lat + request.dest_lat) / 2,
                route_center_lng=(request.origin_lng + request.dest_lng) / 2,
                fuel_type=fuel_type or "gasoline",
                family_weight=weights.family,
            )

            plan = build_fuel_plan(
                fuel_pct=request.current_fuel_level,
                distance_m=primary_route["distance_m"],
                config=fuel_config,
                ranked_stops=ranked_stops,
                weather_penalty=wp,
                highway_fraction=_estimate_highway_fraction(primary_route.get("labels", [])),
                family_weight=weights.family,
            )

            for stop in plan.stops:
                suggested_stops.append(SuggestedStop(
                    place_id=stop.place.place_id,
                    name=stop.place.name,
                    type="ev_charging" if stop.place.has_ev_charging else "fuel",
                    lat=stop.place.lat,
                    lng=stop.place.lng,
                    arrival_fuel_pct=int(stop.arrival_fuel_pct),
                    detour_min=stop.detour_estimate_min,
                    fuel_price=stop.fuel_price,
                ))

            for w in plan.warnings:
                all_warnings.append({
                    "location": "Route",
                    "lat": 0.0,
                    "lng": 0.0,
                    "eta": "",
                    "condition": "fuel_warning",
                    "message": w,
                })

        except Exception as e:
            logger.warning("Fuel planning failed: %s", e)

    # ── Build response ────────────────────────────────────────────────────
    route_by_index = {r["index"]: r for r in parsed_routes}
    candidates = []
    for rank, scored in enumerate(scored_routes):
        route = route_by_index[scored.index]
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
                labels=route.get("labels", []),
                scores=RouteScores(
                    time=round(scored.time_score, 1),
                    cost=round(scored.cost_score, 1),
                    scenic=round(scored.scenic_score, 1),
                    family=round(scored.family_score, 1),
                    weather_risk=round(scored.weather_risk, 2),
                    utility=round(scored.utility, 3),
                ),
                explanation=scored.explanation,
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
            fuel_input=request.current_fuel_level,
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
        suggested_stops=suggested_stops,
        trip_id=trip_id_str,
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
        dest = trip.destination
        await upsert_frequented_location(
            user_id=str(current_user.id),
            lat=dest["lat"],
            lng=dest["lng"],
            db=db,
            place_id=request.destination_place_id,
            category="destination",
            is_arrival=False,
        )

    await db.commit()

    return TripConfirmResponse(
        trip_id=trip_id,
        status="confirmed",
        message="Trip confirmed and locations updated.",
    )
