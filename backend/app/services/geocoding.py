"""
Geocoding and currency resolution service.
Determines country and currency code for route origins.
"""

from __future__ import annotations

import logging
from typing import Tuple
import httpx
from app.config import settings

logger = logging.getLogger("davax.geocoding")

_cache: dict[Tuple[float, float], Tuple[str, str]] = {}

COUNTRY_TO_CURRENCY: dict[str, str] = {
    "RO": "RON",
    "US": "USD",
    "GB": "GBP",
    "CA": "CAD",
    "AU": "AUD",
    "DE": "EUR",
    "FR": "EUR",
    "IT": "EUR",
    "ES": "EUR",
    "NL": "EUR",
    "BE": "EUR",
    "AT": "EUR",
    "PT": "EUR",
    "GR": "EUR",
    "FI": "EUR",
    "IE": "EUR",
    "SK": "EUR",
    "SI": "EUR",
    "LT": "EUR",
    "LV": "EUR",
    "EE": "EUR",
    "HR": "EUR",
    "CY": "EUR",
    "MT": "EUR",
    "LU": "EUR",
    "BG": "BGN",
    "HU": "HUF",
    "PL": "PLN",
    "CZ": "CZK",
    "CH": "CHF",
    "SE": "SEK",
    "NO": "NOK",
    "DK": "DKK",
    "TR": "TRY",
    "MD": "MDL",
    "UA": "UAH",
    "RS": "RSD",
    "JP": "JPY",
}

DEFAULT_FUEL_PRICES: dict[str, float] = {
    "RON": 7.30,
    "EUR": 1.75,
    "USD": 0.95,
    "GBP": 1.45,
    "CHF": 1.85,
    "BGN": 2.70,
    "HUF": 620.0,
    "PLN": 6.50,
    "CZK": 38.0,
    "MDL": 24.50,
}

DEFAULT_EV_PRICES: dict[str, float] = {
    "RON": 2.50,
    "EUR": 0.55,
    "USD": 0.35,
    "GBP": 0.50,
    "CHF": 0.60,
}


def _get_offline_country(lat: float, lng: float) -> str:
    """Fast bounding-box fallback when offline or API is unavailable."""
    if 43.5 <= lat <= 48.5 and 20.2 <= lng <= 29.8:
        return "RO"
    if 24.0 <= lat <= 50.0 and -125.0 <= lng <= -66.0:
        return "US"
    if 49.8 <= lat <= 60.9 and -8.6 <= lng <= 1.8:
        return "GB"
    if 35.0 <= lat <= 71.0 and -10.0 <= lng <= 40.0:
        return "DE"  # General EUR zone fallback
    return "RO"


async def resolve_country_and_currency(lat: float, lng: float) -> Tuple[str, str]:
    """Resolves (country_code, currency_code) for a coordinate."""
    key = (round(lat, 2), round(lng, 2))
    if key in _cache:
        return _cache[key]

    country = "RO"
    api_key = settings.GOOGLE_MAPS_API_KEY
    if api_key:
        try:
            url = (
                f"https://maps.googleapis.com/maps/api/geocode/json"
                f"?latlng={lat},{lng}&key={api_key}&result_type=country"
            )
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    if results:
                        for comp in results[0].get("address_components", []):
                            if "country" in comp.get("types", []):
                                country = comp.get("short_name", "RO").upper()
                                break
                    else:
                        country = _get_offline_country(lat, lng)
                else:
                    country = _get_offline_country(lat, lng)
        except Exception as e:
            logger.warning("Reverse geocoding failed: %s", e)
            country = _get_offline_country(lat, lng)
    else:
        country = _get_offline_country(lat, lng)

    currency = COUNTRY_TO_CURRENCY.get(country, "RON")
    _cache[key] = (country, currency)
    return country, currency


def get_default_fuel_price(currency: str, is_ev: bool = False) -> float:
    if is_ev:
        return DEFAULT_EV_PRICES.get(currency, 2.50)
    return DEFAULT_FUEL_PRICES.get(currency, 7.30)
