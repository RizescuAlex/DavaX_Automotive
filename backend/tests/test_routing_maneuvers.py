from app.schemas.navigation import RouteCandidate, RouteResponse, RouteScores
from app.services.routing import FIELD_MASK, _parse_route


def test_routes_api_parser_preserves_step_maneuvers_and_locations():
    route = {
        "duration": "120s",
        "distanceMeters": 850,
        "legs": [
            {
                "steps": [
                    {
                        "polyline": {"encodedPolyline": "encoded-step"},
                        "startLocation": {"latLng": {"latitude": 1.0, "longitude": 2.0}},
                        "endLocation": {"latLng": {"latitude": 1.1, "longitude": 2.1}},
                        "navigationInstruction": {"maneuver": "TURN_LEFT"},
                    }
                ],
                "endLocation": {"latLng": {"latitude": 1.1, "longitude": 2.1}},
            }
        ],
    }

    parsed = _parse_route(route, 0)

    assert parsed["polylines"] == ["encoded-step"]
    assert parsed["maneuvers"] == [
        {
            "type": "TURN_LEFT",
            "start_location": {"lat": 1.0, "lng": 2.0},
            "end_location": {"lat": 1.1, "lng": 2.1},
        }
    ]
    assert "routes.legs.steps.navigationInstruction.maneuver" in FIELD_MASK


def test_smart_route_response_keeps_existing_fields_and_adds_optional_maneuvers():
    maneuver = {
        "type": "TURN_RIGHT",
        "start_location": {"lat": 1.0, "lng": 2.0},
        "end_location": {"lat": 1.1, "lng": 2.1},
    }
    route = RouteCandidate(
        index=0,
        selected=True,
        polylines=["encoded"],
        distance_m=850,
        distance_text="850 m",
        duration_s=120,
        duration_text="2 min",
        labels=[],
        scores=RouteScores(
            time=1,
            cost=1,
            scenic=0,
            family=0,
            weather_risk=0,
            utility=1,
        ),
        explanation="Fastest route",
        maneuvers=[maneuver],
    )
    response = RouteResponse(
        polylines=["encoded"],
        distance_text="850 m",
        duration_text="2 min",
        routes=[route],
        maneuvers=[maneuver],
    )

    assert response.routes[0].maneuvers[0].type == "TURN_RIGHT"
    assert response.maneuvers[0].start_location.lat == 1.0
