"""
Fuel range calculator and refuel stop planner.

Simulates fuel consumption along a route, determines where refueling
is needed, and ranks candidate fuel stops by detour time, price,
and amenities.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any

from app.config import settings
from app.services.places import PlaceResult

logger = logging.getLogger("davax.fuel")


@dataclass
class FuelConfig:
    """Vehicle fuel/energy configuration."""
    tank_capacity_l: float = 50.0
    consumption_l_per_100km: float = 7.5
    reserve_threshold_pct: int = 20
    fuel_type: str = "gasoline"  # gasoline, diesel, electric, hybrid

    @property
    def usable_capacity_l(self) -> float:
        """Fuel available above reserve."""
        reserve = self.tank_capacity_l * (self.reserve_threshold_pct / 100.0)
        return self.tank_capacity_l - reserve

    @property
    def is_ev(self) -> bool:
        return self.fuel_type.lower() in ("electric", "ev")

    @property
    def is_hybrid(self) -> bool:
        return self.fuel_type.lower() == "hybrid"


@dataclass
class RefuelStop:
    """A planned refueling stop along the route."""
    place: PlaceResult
    distance_from_start_m: float = 0.0
    arrival_fuel_pct: float = 0.0
    departure_fuel_pct: float = 100.0
    detour_estimate_min: int = 0
    fuel_price: float | None = None
    charge_time_min: int = 0  # EV only
    rank_score: float = 0.0  # higher = better stop


@dataclass
class FuelPlan:
    """Complete fuel plan for a route."""
    initial_fuel_pct: float = 100.0
    initial_fuel_liters: float = 0.0
    arrival_fuel_pct: float = 0.0
    arrival_fuel_liters: float = 0.0
    total_fuel_cost: float = 0.0
    range_km: float = 0.0
    needs_refueling: bool = False
    stops: list[RefuelStop] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ── Range Calculation ─────────────────────────────────────────────────────────

def compute_range_km(
    fuel_pct: float,
    config: FuelConfig,
    weather_penalty: float = 0.0,
    highway_fraction: float = 0.5,
) -> float:
    """
    Compute range in km from current fuel level.

    Adjusts consumption based on:
    - Weather (cold/rain increases consumption)
    - Highway fraction (higher speed = higher consumption)
    - Vehicle type (EVs lose more range in cold)
    """
    fuel_l = config.tank_capacity_l * (fuel_pct / 100.0)
    reserve_l = config.tank_capacity_l * (config.reserve_threshold_pct / 100.0)
    usable_l = max(0, fuel_l - reserve_l)

    consumption = _adjusted_consumption(config, weather_penalty, highway_fraction)

    if consumption <= 0:
        return 0.0

    return (usable_l / consumption) * 100.0


def _adjusted_consumption(
    config: FuelConfig,
    weather_penalty: float = 0.0,
    highway_fraction: float = 0.5,
) -> float:
    consumption = config.consumption_l_per_100km

    # Highway adjustment: +10% consumption at sustained high speed
    if highway_fraction > 0.6:
        consumption *= 1.0 + (highway_fraction - 0.6) * 0.25

    # Weather adjustment
    if weather_penalty > 0.3:
        if config.is_ev:
            consumption *= 1.0 + weather_penalty * 0.4  # EVs lose up to 40% in severe cold
        else:
            consumption *= 1.0 + weather_penalty * 0.15  # ICE: up to 15%

    return consumption


def compute_fuel_at_distance(
    fuel_pct: float,
    distance_m: float,
    config: FuelConfig,
    weather_penalty: float = 0.0,
    highway_fraction: float = 0.5,
) -> float:
    """Compute remaining fuel percentage after traveling a given distance."""
    consumption = _adjusted_consumption(config, weather_penalty, highway_fraction)

    distance_km = distance_m / 1000.0
    fuel_used_l = (distance_km / 100.0) * consumption
    fuel_used_pct = (fuel_used_l / config.tank_capacity_l) * 100.0

    return max(0.0, fuel_pct - fuel_used_pct)


def estimate_fuel_stop_count(
    distance_m: float,
    fuel_pct: float,
    config: FuelConfig,
    weather_penalty: float = 0.0,
    highway_fraction: float = 0.5,
) -> int:
    """Estimate stops needed while keeping the same reserve and range margin."""
    current_range_m = compute_range_km(
        fuel_pct, config, weather_penalty, highway_fraction,
    ) * 1_000
    full_range_m = compute_range_km(
        80.0 if config.is_ev else 100.0,
        config,
        weather_penalty,
        highway_fraction,
    ) * 1_000
    if distance_m <= current_range_m or full_range_m <= 0:
        return 0
    return math.ceil((distance_m - current_range_m) / full_range_m)


# ── Stop Ranking ──────────────────────────────────────────────────────────────

def _estimate_detour_min(
    stop: PlaceResult,
    route_lat: float,
    route_lng: float,
) -> int:
    """Rough detour estimate based on distance from the route centerline."""
    if stop.distance_to_route_m is not None:
        dist_m = stop.distance_to_route_m
    else:
        R = 6_371_000
        phi1, phi2 = math.radians(stop.lat), math.radians(route_lat)
        dphi = math.radians(route_lat - stop.lat)
        dlam = math.radians(route_lng - stop.lng)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
        dist_m = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    # Assume 40 km/h average in/out of the stop, round trip.
    detour_km = (dist_m * 2) / 1000.0
    return max(1, int(detour_km / 40.0 * 60.0))


def _get_fuel_price(stop: PlaceResult, fuel_type: str) -> float | None:
    """Extract fuel price for the relevant fuel type, if available."""
    if not stop.fuel_prices:
        return None

    type_map = {
        "gasoline": ["REGULAR_UNLEADED", "MIDGRADE", "PREMIUM"],
        "diesel": ["DIESEL"],
    }
    target_types = type_map.get(fuel_type.lower(), ["REGULAR_UNLEADED"])

    for fp in stop.fuel_prices:
        if fp.get("type") in target_types:
            try:
                return float(fp.get("price", 0))
            except (ValueError, TypeError):
                pass
    return None


def rank_fuel_stops(
    candidates: list[PlaceResult],
    route_center_lat: float,
    route_center_lng: float,
    fuel_type: str = "gasoline",
    family_weight: float = 0.0,
    route_points: list[tuple[float, float]] | None = None,
    route_distance_m: float | None = None,
) -> list[RefuelStop]:
    """
    Rank fuel stop candidates by:
    - Detour time (lower = better)
    - Fuel price (lower = better, where available)
    - Rating (higher = better)
    - Family amenities (if family weight is high)
    """
    if route_points:
        project_places_onto_route(candidates, route_points, route_distance_m)

    stops = []
    for place in candidates:
        detour = _estimate_detour_min(place, route_center_lat, route_center_lng)
        price = _get_fuel_price(place, fuel_type)

        # Score components (all 0–1, higher = better)
        detour_score = max(0, 1.0 - (detour / 15.0))  # 15 min detour = 0 score
        rating_score = (place.rating / 5.0) if place.rating else 0.5
        price_score = 0.5  # default when price unknown
        if price is not None and price > 0:
            price_score = max(0, 1.0 - (price / 15.0))  # normalize against ~15 RON/L max

        family_score = 0.0
        if family_weight > 0:
            if place.good_for_children:
                family_score += 0.5
            if place.has_restroom:
                family_score += 0.3
            if place.rating and place.rating >= 4.0:
                family_score += 0.2

        # Weighted rank
        rank = (
            0.4 * detour_score
            + 0.25 * price_score
            + 0.15 * rating_score
            + 0.2 * family_score * family_weight
        )

        stops.append(RefuelStop(
            place=place,
            detour_estimate_min=detour,
            fuel_price=price,
            rank_score=rank,
        ))

    stops.sort(key=lambda s: s.rank_score, reverse=True)
    return stops


def decode_route_points(encoded_polylines: list[str]) -> list[tuple[float, float]]:
    """Decode and join route step polylines, removing duplicate step endpoints."""
    points: list[tuple[float, float]] = []
    for encoded in encoded_polylines:
        if not encoded:
            continue
        index = 0
        lat = 0
        lng = 0
        decoded = []
        try:
            while index < len(encoded):
                values = []
                for _ in range(2):
                    result = shift = 0
                    while True:
                        byte = ord(encoded[index]) - 63
                        index += 1
                        result |= (byte & 0x1F) << shift
                        shift += 5
                        if byte < 0x20:
                            break
                    values.append(~(result >> 1) if result & 1 else result >> 1)
                lat += values[0]
                lng += values[1]
                decoded.append((lat / 1e5, lng / 1e5))
        except (IndexError, ValueError):
            continue
        for point in decoded:
            if not points or _haversine_m(*points[-1], *point) > 0.5:
                points.append(point)
    return points


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    value = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlng / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def project_places_onto_route(
    places: list[PlaceResult],
    route_points: list[tuple[float, float]],
    route_distance_m: float | None = None,
) -> None:
    """Attach approximate along-route progress and cross-track distance to places."""
    if len(route_points) < 2:
        return

    radius = 6_371_000
    cumulative = [0.0]
    for first, second in zip(route_points, route_points[1:]):
        cumulative.append(cumulative[-1] + _haversine_m(*first, *second))
    geometric_length = cumulative[-1]
    if geometric_length <= 0:
        return
    scale = (
        route_distance_m / geometric_length
        if route_distance_m and route_distance_m > 0
        else 1.0
    )

    for place in places:
        best_distance = float("inf")
        best_progress = 0.0
        for index, (first, second) in enumerate(zip(route_points, route_points[1:])):
            lat0 = math.radians((first[0] + second[0] + place.lat) / 3)
            x_scale = radius * math.cos(lat0) * math.pi / 180
            y_scale = radius * math.pi / 180
            ax, ay = first[1] * x_scale, first[0] * y_scale
            bx, by = second[1] * x_scale, second[0] * y_scale
            px, py = place.lng * x_scale, place.lat * y_scale
            dx, dy = bx - ax, by - ay
            length_sq = dx * dx + dy * dy
            projection = ((px - ax) * dx + (py - ay) * dy) / length_sq if length_sq else 0.0
            fraction = max(0.0, min(1.0, projection))
            projected_x, projected_y = ax + fraction * dx, ay + fraction * dy
            cross_track = math.hypot(px - projected_x, py - projected_y)
            if cross_track < best_distance:
                segment_length = cumulative[index + 1] - cumulative[index]
                best_distance = cross_track
                best_progress = (cumulative[index] + segment_length * fraction) * scale
        place.route_distance_m = best_progress
        place.distance_to_route_m = best_distance


# ── Fuel Plan Builder ─────────────────────────────────────────────────────────

def build_fuel_plan(
    fuel_pct: float,
    distance_m: float,
    config: FuelConfig,
    ranked_stops: list[RefuelStop],
    weather_penalty: float = 0.0,
    highway_fraction: float = 0.5,
    family_rest_interval_m: float = 200_000,  # suggest rest every ~200 km (2h)
    family_weight: float = 0.0,
) -> FuelPlan:
    """Plan refueling at actual candidate locations while preserving a reserve.

    The planner targets stops at roughly 75% of the remaining safe range and
    only selects stations projected onto the route within 5 km cross-track.
    It keeps a 20% default tank reserve plus a 10% range margin before stops.
    """
    range_km = compute_range_km(fuel_pct, config, weather_penalty, highway_fraction)
    distance_km = distance_m / 1000.0
    initial_liters = config.tank_capacity_l * max(0.0, min(100.0, fuel_pct)) / 100.0
    plan = FuelPlan(
        initial_fuel_pct=fuel_pct,
        initial_fuel_liters=initial_liters,
        range_km=range_km,
    )
    arrival_fuel = compute_fuel_at_distance(
        fuel_pct, distance_m, config, weather_penalty, highway_fraction,
    )
    if arrival_fuel > config.reserve_threshold_pct:
        plan.arrival_fuel_pct = arrival_fuel
        plan.arrival_fuel_liters = config.tank_capacity_l * arrival_fuel / 100.0
        plan.needs_refueling = False
        fuel_used_pct = fuel_pct - arrival_fuel
        fuel_used_l = config.tank_capacity_l * (fuel_used_pct / 100.0)
        plan.total_fuel_cost = fuel_used_l * 7.0
        if family_weight > 0.3 and distance_m > family_rest_interval_m:
            plan.warnings.append(f"Plan a rest break during this {distance_km:.0f} km trip")
        return plan

    plan.needs_refueling = True
    if not ranked_stops:
        plan.warnings.append(
            "Refueling is needed, but no suitable fuel stations were found along this route"
        )
        plan.arrival_fuel_pct = max(0, arrival_fuel)
        plan.arrival_fuel_liters = config.tank_capacity_l * plan.arrival_fuel_pct / 100.0
        return plan

    current_fuel = max(0.0, min(100.0, fuel_pct))
    distance_covered = 0.0
    selected_stops: list[RefuelStop] = []
    total_cost = 0.0
    ordered_stops = sorted(
        (stop for stop in ranked_stops if stop.place.route_distance_m is not None),
        key=lambda stop: stop.place.route_distance_m or 0.0,
    )

    for _ in range(10):
        remaining_distance = distance_m - distance_covered
        current_range_m = compute_range_km(
            current_fuel, config, weather_penalty, highway_fraction,
        ) * 1000.0
        if remaining_distance <= current_range_m:
            break
        # Reach stations with a further 10% range margin, on top of the tank reserve.
        safe_range_m = current_range_m * 0.9

        reachable = [
            stop for stop in ordered_stops
            if stop not in selected_stops
            and stop.place.route_distance_m is not None
            and stop.place.route_distance_m > distance_covered + 1_000
            and stop.place.route_distance_m <= distance_covered + safe_range_m
            and (stop.place.distance_to_route_m or 0.0) <= 5_000
        ]
        if not reachable:
            plan.warnings.append("No fuel station was found within the safe driving range")
            break

        target_distance = distance_covered + safe_range_m * 0.75
        best_stop = max(
            reachable,
            key=lambda stop: stop.rank_score - 0.25 * (
                abs(stop.place.route_distance_m - target_distance) / max(safe_range_m, 1)
            ),
        )
        stop_distance = best_stop.place.route_distance_m
        fuel_at_stop = compute_fuel_at_distance(
            current_fuel,
            stop_distance - distance_covered,
            config,
            weather_penalty,
            highway_fraction,
        )
        if config.is_ev:
            best_stop.arrival_fuel_pct = fuel_at_stop
            best_stop.departure_fuel_pct = 80.0
            charge_pct = 80.0 - fuel_at_stop
            best_stop.charge_time_min = max(5, int(charge_pct * 0.8))
            current_fuel = 80.0
        else:
            best_stop.arrival_fuel_pct = fuel_at_stop
            best_stop.departure_fuel_pct = 100.0
            current_fuel = 100.0
        best_stop.distance_from_start_m = stop_distance
        price = best_stop.fuel_price or 7.0
        fill_l = config.tank_capacity_l * ((best_stop.departure_fuel_pct - fuel_at_stop) / 100.0)
        total_cost += fill_l * price
        selected_stops.append(best_stop)
        distance_covered = stop_distance
    else:
        plan.warnings.append("Route requires more than 10 refueling stops")

    final_fuel = compute_fuel_at_distance(
        current_fuel,
        max(0, distance_m - distance_covered),
        config,
        weather_penalty,
        highway_fraction,
    )

    plan.stops = selected_stops
    plan.arrival_fuel_pct = final_fuel
    plan.arrival_fuel_liters = config.tank_capacity_l * final_fuel / 100.0
    plan.total_fuel_cost = total_cost

    if final_fuel < config.reserve_threshold_pct:
        plan.warnings.append(
            f"Estimated arrival fuel is below the {config.reserve_threshold_pct}% reserve"
        )

    # Family rest stop suggestion
    if family_weight > 0.3 and distance_m > family_rest_interval_m:
        num_rest_stops = int(distance_m / family_rest_interval_m)
        if num_rest_stops > len(selected_stops):
            plan.warnings.append(
                f"Consider {num_rest_stops} rest stop(s) for a family trip of {distance_km:.0f} km"
            )

    return plan


def get_fuel_config(
    fuel_type: str | None = None,
    tank_capacity_l: float | None = None,
    consumption_l_per_100km: float | None = None,
) -> FuelConfig:
    """Build a FuelConfig from settings and user fuel type."""
    config = FuelConfig(
        tank_capacity_l=settings.FUEL_TANK_CAPACITY_L,
        consumption_l_per_100km=settings.FUEL_CONSUMPTION_L_PER_100KM,
        reserve_threshold_pct=settings.FUEL_RESERVE_THRESHOLD_PCT,
        fuel_type=fuel_type or "gasoline",
    )

    if tank_capacity_l and tank_capacity_l > 0:
        config.tank_capacity_l = tank_capacity_l
    if consumption_l_per_100km and consumption_l_per_100km > 0:
        config.consumption_l_per_100km = consumption_l_per_100km

    # Adjust defaults by vehicle type
    if config.is_ev:
        config.tank_capacity_l = tank_capacity_l or 60  # kWh battery
        config.consumption_l_per_100km = consumption_l_per_100km or 18.0  # kWh/100km
    elif config.is_hybrid and not consumption_l_per_100km:
        config.consumption_l_per_100km *= 0.7  # hybrids use ~30% less

    return config


def select_evenly_spaced_fuel_stops(
    candidates: list[PlaceResult],
    route_distance_m: float,
    max_stops: int = 4,
    min_separation_m: float = 12_000,
) -> list[PlaceResult]:
    """
    Selects fuel stops evenly distanced along the route.
    Partitions the route length into (N + 1) segments so stops are placed
    at approximately 1/(N+1), 2/(N+1), ... of the route.
    """
    valid = [
        p for p in candidates
        if p.route_distance_m is not None
        and 1_000 <= p.route_distance_m <= max(1_000, route_distance_m - 1_000)
        and (p.distance_to_route_m or 0.0) <= 5_000
    ]
    if not valid:
        return []

    if route_distance_m < 35_000:
        target_count = min(1, len(valid))
    elif route_distance_m < 90_000:
        target_count = min(2, len(valid), max_stops)
    elif route_distance_m < 200_000:
        target_count = min(3, len(valid), max_stops)
    else:
        target_count = min(4, len(valid), max_stops)

    if target_count <= 0:
        return []

    # Checkpoint distances: 1/(N+1), 2/(N+1), ... of total route length
    step = route_distance_m / (target_count + 1)
    target_checkpoints = [step * (i + 1) for i in range(target_count)]
    min_sep = min(min_separation_m, step * 0.45)

    chosen: list[PlaceResult] = []
    available = list(valid)

    for target_m in target_checkpoints:
        candidates_for_point = [
            p for p in available
            if all(abs(p.route_distance_m - c.route_distance_m) >= min_sep for c in chosen)
        ]
        if not candidates_for_point:
            continue

        best = min(
            candidates_for_point,
            key=lambda p: abs(p.route_distance_m - target_m) + 1.5 * (p.distance_to_route_m or 0.0),
        )
        chosen.append(best)
        available.remove(best)

    chosen.sort(key=lambda p: p.route_distance_m or 0.0)
    return chosen
