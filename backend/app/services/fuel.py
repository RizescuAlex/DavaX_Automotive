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
    reserve_threshold_pct: int = 15
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
    arrival_fuel_pct: float = 0.0
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

    if consumption <= 0:
        return 0.0

    return (usable_l / consumption) * 100.0


def compute_fuel_at_distance(
    fuel_pct: float,
    distance_m: float,
    config: FuelConfig,
    weather_penalty: float = 0.0,
    highway_fraction: float = 0.5,
) -> float:
    """Compute remaining fuel percentage after traveling a given distance."""
    consumption = config.consumption_l_per_100km

    if highway_fraction > 0.6:
        consumption *= 1.0 + (highway_fraction - 0.6) * 0.25

    if weather_penalty > 0.3:
        if config.is_ev:
            consumption *= 1.0 + weather_penalty * 0.4
        else:
            consumption *= 1.0 + weather_penalty * 0.15

    distance_km = distance_m / 1000.0
    fuel_used_l = (distance_km / 100.0) * consumption
    fuel_used_pct = (fuel_used_l / config.tank_capacity_l) * 100.0

    return max(0.0, fuel_pct - fuel_used_pct)


# ── Stop Ranking ──────────────────────────────────────────────────────────────

def _estimate_detour_min(
    stop: PlaceResult,
    route_lat: float,
    route_lng: float,
) -> int:
    """Rough detour estimate based on distance from the route centerline."""
    R = 6_371_000
    phi1, phi2 = math.radians(stop.lat), math.radians(route_lat)
    dphi = math.radians(route_lat - stop.lat)
    dlam = math.radians(route_lng - stop.lng)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    dist_m = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    # Assume 40 km/h average in/out of the stop, round trip
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
) -> list[RefuelStop]:
    """
    Rank fuel stop candidates by:
    - Detour time (lower = better)
    - Fuel price (lower = better, where available)
    - Rating (higher = better)
    - Family amenities (if family weight is high)
    """
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
    """
    Build a complete fuel plan for a route.

    For trips longer than one tank range, uses a greedy approach
    selecting the highest-ranked stop before the must-refuel point.

    For EV, models charge time to 80%.
    """
    range_km = compute_range_km(fuel_pct, config, weather_penalty, highway_fraction)
    distance_km = distance_m / 1000.0

    plan = FuelPlan(
        initial_fuel_pct=fuel_pct,
        range_km=range_km,
    )

    # Check if trip is within range
    arrival_fuel = compute_fuel_at_distance(
        fuel_pct, distance_m, config, weather_penalty, highway_fraction,
    )

    if arrival_fuel > config.reserve_threshold_pct:
        # No refueling needed
        plan.arrival_fuel_pct = arrival_fuel
        plan.needs_refueling = False

        # Estimate cost
        fuel_used_pct = fuel_pct - arrival_fuel
        fuel_used_l = config.tank_capacity_l * (fuel_used_pct / 100.0)
        plan.total_fuel_cost = fuel_used_l * 7.0  # default price

        # Family rest stops (even if fuel is fine)
        if family_weight > 0.3 and distance_m > family_rest_interval_m:
            plan.warnings.append(
                f"Consider a rest stop — trip is {distance_km:.0f} km"
            )

        return plan

    # Refueling needed
    plan.needs_refueling = True

    if not ranked_stops:
        plan.warnings.append(
            "⚠️ Refueling needed but no fuel stations found along this route"
        )
        plan.arrival_fuel_pct = max(0, arrival_fuel)
        return plan

    # Greedy refuel planner
    current_fuel = fuel_pct
    distance_covered = 0.0
    selected_stops = []
    total_cost = 0.0

    # Sort stops roughly by their position along the route (by distance from start)
    # For now, use the first ranked stops that fall within range windows
    remaining_distance = distance_m

    while remaining_distance > 0:
        current_range_m = compute_range_km(
            current_fuel, config, weather_penalty, highway_fraction,
        ) * 1000.0

        if current_range_m >= remaining_distance:
            # Can reach destination
            break

        # Must refuel before running out — find best stop within range
        must_refuel_at_m = distance_covered + current_range_m * 0.85  # safety margin

        best_stop = None
        for stop in ranked_stops:
            if stop not in selected_stops:
                best_stop = stop
                break

        if best_stop is None:
            plan.warnings.append(
                "⚠️ May not have enough fuel to complete the trip"
            )
            break

        # Simulate refueling
        fuel_at_stop = compute_fuel_at_distance(
            current_fuel,
            must_refuel_at_m - distance_covered,
            config,
            weather_penalty,
            highway_fraction,
        )

        if config.is_ev:
            # EV: charge to 80%
            best_stop.arrival_fuel_pct = fuel_at_stop
            best_stop.departure_fuel_pct = 80.0
            charge_pct = 80.0 - fuel_at_stop
            # Rough charge time: ~1% per minute on fast charger
            best_stop.charge_time_min = max(5, int(charge_pct * 0.8))
            current_fuel = 80.0
        else:
            # ICE: fill to 100%
            best_stop.arrival_fuel_pct = fuel_at_stop
            best_stop.departure_fuel_pct = 100.0
            current_fuel = 100.0

        best_stop.distance_from_start_m = must_refuel_at_m

        # Estimate cost for this fill
        price = best_stop.fuel_price or 7.0
        fill_l = config.tank_capacity_l * ((best_stop.departure_fuel_pct - fuel_at_stop) / 100.0)
        total_cost += fill_l * price

        selected_stops.append(best_stop)
        distance_covered = must_refuel_at_m
        remaining_distance = distance_m - distance_covered

        # Safety: prevent infinite loops
        if len(selected_stops) > 10:
            plan.warnings.append("Route requires many fuel stops")
            break

    # Final arrival fuel
    final_fuel = compute_fuel_at_distance(
        current_fuel,
        max(0, distance_m - distance_covered),
        config,
        weather_penalty,
        highway_fraction,
    )

    plan.stops = selected_stops
    plan.arrival_fuel_pct = final_fuel
    plan.total_fuel_cost = total_cost

    if final_fuel < config.reserve_threshold_pct:
        plan.warnings.append(
            f"⚠️ Arrival fuel ({final_fuel:.0f}%) is below reserve ({config.reserve_threshold_pct}%)"
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
) -> FuelConfig:
    """Build a FuelConfig from settings and user fuel type."""
    config = FuelConfig(
        tank_capacity_l=settings.FUEL_TANK_CAPACITY_L,
        consumption_l_per_100km=settings.FUEL_CONSUMPTION_L_PER_100KM,
        reserve_threshold_pct=settings.FUEL_RESERVE_THRESHOLD_PCT,
        fuel_type=fuel_type or "gasoline",
    )

    # Adjust defaults by vehicle type
    if config.is_ev:
        config.tank_capacity_l = 60  # kWh battery
        config.consumption_l_per_100km = 18.0  # kWh/100km
    elif config.is_hybrid:
        config.consumption_l_per_100km *= 0.7  # hybrids use ~30% less

    return config
