from decimal import Decimal

from app.api.v1.vehicle_specs import _decimal


def test_decimal_normalizes_car_api_values():
    assert _decimal("13.2") == Decimal("13.2")
    assert _decimal(32) == Decimal("32")


def test_decimal_returns_none_for_missing_or_invalid_values():
    assert _decimal(None) is None
    assert _decimal("") is None
    assert _decimal("not-a-number") is None
