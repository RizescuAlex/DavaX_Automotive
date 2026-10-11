from app.services.fuel import (
    FuelConfig,
    RefuelStop,
    build_fuel_plan,
    compute_fuel_at_distance,
    decode_route_points,
    estimate_fuel_stop_count,
    project_places_onto_route,
)
from app.services.places import PlaceResult
from app.services.scoring import RouteFeatures, UserWeights, score_and_rank


def _encode_polyline(points: list[tuple[float, float]]) -> str:
    encoded = []
    previous_lat = previous_lng = 0
    for latitude, longitude in points:
        lat = round(latitude * 1e5)
        lng = round(longitude * 1e5)
        for value in (lat - previous_lat, lng - previous_lng):
            value = ~(value << 1) if value < 0 else value << 1
            while value >= 0x20:
                encoded.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            encoded.append(chr(value + 63))
        previous_lat, previous_lng = lat, lng
    return "".join(encoded)


def _station(place_id: str, distance_m: float, score: float = 0.8) -> RefuelStop:
    return RefuelStop(
        place=PlaceResult(
            place_id=place_id,
            name=place_id,
            route_distance_m=distance_m,
            distance_to_route_m=0,
        ),
        rank_score=score,
    )


def test_20_liters_in_40_liter_tank_plans_a_safe_stop_on_500_km_trip():
    config = FuelConfig(
        tank_capacity_l=40,
        consumption_l_per_100km=8,
        reserve_threshold_pct=20,
    )
    plan = build_fuel_plan(
        fuel_pct=50,
        distance_m=500_000,
        config=config,
        ranked_stops=[
            _station("early", 80_000),
            _station("target", 105_000),
            _station("too-far", 250_000),
        ],
    )

    assert plan.needs_refueling is True
    assert [stop.place.place_id for stop in plan.stops] == ["target"]
    assert 20 <= plan.stops[0].arrival_fuel_pct < 35
    assert plan.arrival_fuel_pct > config.reserve_threshold_pct
    expected_arrival_liters = round(
        config.tank_capacity_l * plan.arrival_fuel_pct / 100,
        2,
    )
    assert plan.arrival_fuel_liters == expected_arrival_liters


def test_current_fuel_level_changes_estimated_refuel_count():
    config = FuelConfig(tank_capacity_l=40, consumption_l_per_100km=8, reserve_threshold_pct=20)

    assert estimate_fuel_stop_count(500_000, 50, config) == 1
    assert estimate_fuel_stop_count(500_000, 100, config) == 1
    assert estimate_fuel_stop_count(500_000, 20, config) == 2


def test_route_projection_orders_places_by_progress_and_filters_distance():
    route = [(0.0, 0.0), (0.0, 0.01), (0.0, 0.02)]
    on_route = PlaceResult(place_id="on", lat=0.0001, lng=0.01)
    far_off_route = PlaceResult(place_id="far", lat=0.02, lng=0.01)

    project_places_onto_route([on_route, far_off_route], route, route_distance_m=2_000)

    assert on_route.route_distance_m == 1_000
    assert on_route.distance_to_route_m < 20
    assert far_off_route.distance_to_route_m > 2_000


def test_duplicate_step_endpoints_are_removed_when_decoding_route_geometry():
    route = [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]
    first_step = _encode_polyline(route[:2])
    second_step = _encode_polyline(route[1:])
    points = decode_route_points([first_step, second_step])

    assert points == route


def test_route_consumption_estimate_matches_configured_fuel_use():
    config = FuelConfig(tank_capacity_l=40, consumption_l_per_100km=8, reserve_threshold_pct=20)

    assert compute_fuel_at_distance(50, 100_000, config) == 30


def test_route_cost_prefers_a_route_needing_fewer_fuel_stops():
    routes = [
        RouteFeatures(index=0, distance_m=500_000, duration_s=10_000, fuel_stop_count=1),
        RouteFeatures(index=1, distance_m=500_000, duration_s=10_000, fuel_stop_count=0),
    ]

    ranked = score_and_rank(
        routes,
        UserWeights(time=0, cost=1, scenic=0, family=0),
        consumption_l_per_100km=8,
    )

    assert ranked[0].index == 1
