"""
Weather service with provider interface, forecast caching, and risk scoring.

Samples weather conditions along a route's polyline at regular intervals,
computes per-segment risk scores, and aggregates into route-level risk
with human-readable warnings.

Default provider: Open-Meteo (free, no API key required).
Swappable via the WeatherProvider interface.
"""

from __future__ import annotations

import logging
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("davax.weather")

# ── Data Structures ───────────────────────────────────────────────────────────


@dataclass
class WeatherPoint:
    """Weather forecast for a specific location and time."""
    lat: float
    lng: float
    eta: datetime
    temperature_c: float = 20.0
    precipitation_mm: float = 0.0
    rain_mm: float = 0.0
    snowfall_cm: float = 0.0
    wind_speed_kmh: float = 0.0
    wind_gusts_kmh: float = 0.0
    visibility_m: float = 10000.0
    weather_code: int = 0  # WMO weather code
    risk: float = 0.0
    condition: str = "clear"
    message: str = ""


@dataclass
class RouteWeather:
    """Aggregated weather data for an entire route."""
    points: list[WeatherPoint] = field(default_factory=list)
    route_risk: float = 0.0  # 0.0 = clear, 1.0 = severe
    warnings: list[dict] = field(default_factory=list)


# ── WMO Weather Codes ─────────────────────────────────────────────────────────

WMO_CONDITIONS = {
    0: "clear", 1: "mainly_clear", 2: "partly_cloudy", 3: "overcast",
    45: "fog", 48: "freezing_fog",
    51: "light_drizzle", 53: "drizzle", 55: "heavy_drizzle",
    56: "freezing_drizzle", 57: "heavy_freezing_drizzle",
    61: "light_rain", 63: "rain", 65: "heavy_rain",
    66: "freezing_rain", 67: "heavy_freezing_rain",
    71: "light_snow", 73: "snow", 75: "heavy_snow",
    77: "snow_grains",
    80: "light_showers", 81: "showers", 82: "heavy_showers",
    85: "light_snow_showers", 86: "heavy_snow_showers",
    95: "thunderstorm", 96: "thunderstorm_hail", 99: "heavy_thunderstorm_hail",
}

WMO_LABELS = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Freezing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
    56: "Freezing drizzle", 57: "Heavy freezing drizzle",
    61: "Light rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Light snow", 73: "Moderate snow", 75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers", 81: "Moderate showers", 82: "Violent showers",
    85: "Light snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
}


# ── Risk Scoring ──────────────────────────────────────────────────────────────

def compute_point_risk(point: WeatherPoint) -> float:
    """
    Compute a 0–1 risk score for a single weather observation.

    Risk factors (cumulative, capped at 1.0):
    - Precipitation intensity
    - Ice risk (temp near 0°C + any precipitation)
    - Wind speed
    - Low visibility
    - Thunderstorms (WMO codes 95–99)
    """
    risk = 0.0

    # Precipitation risk
    if point.snowfall_cm > 2.0:
        risk += 0.5
    elif point.snowfall_cm > 0.5:
        risk += 0.3
    elif point.rain_mm > 7.0:
        risk += 0.35
    elif point.rain_mm > 2.5:
        risk += 0.2
    elif point.precipitation_mm > 0.5:
        risk += 0.1

    # Ice risk: temperature near or below 0°C with any moisture
    if point.temperature_c <= 2.0 and point.precipitation_mm > 0:
        ice_risk = 0.4 if point.temperature_c <= 0.0 else 0.25
        risk += ice_risk
    elif point.temperature_c <= -5.0:
        risk += 0.15  # dry but very cold, road ice possible

    # Wind risk
    if point.wind_gusts_kmh > 90:
        risk += 0.35
    elif point.wind_speed_kmh > 60:
        risk += 0.2
    elif point.wind_speed_kmh > 40:
        risk += 0.1

    # Visibility risk
    if point.visibility_m < 200:
        risk += 0.4
    elif point.visibility_m < 500:
        risk += 0.25
    elif point.visibility_m < 1000:
        risk += 0.1

    # Thunderstorm (WMO codes 95–99)
    if point.weather_code >= 95:
        risk += 0.5
    elif point.weather_code in (45, 48):  # fog / freezing fog
        risk += 0.15

    return min(1.0, risk)


def _risk_to_condition(point: WeatherPoint) -> tuple[str, str]:
    """Return (condition_key, human_message) based on risk factors."""
    code = point.weather_code
    condition = WMO_CONDITIONS.get(code, "unknown")
    label = WMO_LABELS.get(code, "Unknown conditions")
    return condition, label


# ── Polyline Sampling ─────────────────────────────────────────────────────────

def _decode_polyline(encoded: str) -> list[tuple[float, float]]:
    """Decode a Google-encoded polyline string into (lat, lng) tuples."""
    result = []
    index = 0
    lat = 0
    lng = 0

    while index < len(encoded):
        # Decode latitude
        shift = 0
        value = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            value |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        lat += (~(value >> 1) if (value & 1) else (value >> 1))

        # Decode longitude
        shift = 0
        value = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            value |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        lng += (~(value >> 1) if (value & 1) else (value >> 1))

        result.append((lat / 1e5, lng / 1e5))

    return result


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance between two points in meters."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def sample_points_along_route(
    polylines: list[str],
    total_duration_s: int,
    departure_time: datetime,
    interval_m: int = 40_000,  # sample every ~40 km
) -> list[tuple[float, float, datetime]]:
    """
    Sample (lat, lng, eta) points along a route at regular distance intervals.

    Returns a list of (lat, lng, estimated_arrival_time) tuples.
    """
    # Decode all polylines into a single path
    full_path = []
    for encoded in polylines:
        full_path.extend(_decode_polyline(encoded))

    if len(full_path) < 2:
        return []

    # Compute total distance along path
    cumulative_distances = [0.0]
    for i in range(1, len(full_path)):
        d = _haversine_m(
            full_path[i - 1][0], full_path[i - 1][1],
            full_path[i][0], full_path[i][1],
        )
        cumulative_distances.append(cumulative_distances[-1] + d)

    total_distance = cumulative_distances[-1]
    if total_distance == 0:
        return []

    # Speed assumption: uniform speed along route
    avg_speed_ms = total_distance / max(total_duration_s, 1)

    # Sample at intervals
    samples = []
    distance_covered = 0.0
    point_idx = 0

    while distance_covered <= total_distance:
        # Find the path segment containing this distance
        while point_idx < len(cumulative_distances) - 1 and cumulative_distances[point_idx + 1] < distance_covered:
            point_idx += 1

        if point_idx >= len(full_path) - 1:
            break

        # Interpolate within segment
        seg_start_dist = cumulative_distances[point_idx]
        seg_end_dist = cumulative_distances[point_idx + 1]
        seg_length = seg_end_dist - seg_start_dist

        if seg_length > 0:
            fraction = (distance_covered - seg_start_dist) / seg_length
        else:
            fraction = 0.0

        lat = full_path[point_idx][0] + fraction * (full_path[point_idx + 1][0] - full_path[point_idx][0])
        lng = full_path[point_idx][1] + fraction * (full_path[point_idx + 1][1] - full_path[point_idx][1])

        # ETA at this point
        time_to_point = distance_covered / avg_speed_ms if avg_speed_ms > 0 else 0
        eta = departure_time + timedelta(seconds=time_to_point)

        samples.append((lat, lng, eta))
        distance_covered += interval_m

    return samples


# ── Weather Provider Interface ────────────────────────────────────────────────

class WeatherProvider(ABC):
    """Abstract interface for weather data providers."""

    @abstractmethod
    async def fetch_forecasts(
        self,
        points: list[tuple[float, float, datetime]],
    ) -> list[WeatherPoint]:
        """Fetch weather forecasts for a list of (lat, lng, eta) points."""
        ...


class OpenMeteoProvider(WeatherProvider):
    """
    Free weather provider using Open-Meteo API.
    No API key required. Provides hourly forecasts up to 16 days.
    """

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self._cache: dict[str, Any] = {}  # grid_cell+hour → forecast

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=10.0),
            )
        return self._client

    @staticmethod
    def _grid_key(lat: float, lng: float, hour: datetime) -> str:
        """Round to ~10 km grid cell + hour for caching."""
        grid_lat = round(lat * 10) / 10  # ~11 km resolution
        grid_lng = round(lng * 10) / 10
        return f"{grid_lat},{grid_lng},{hour.strftime('%Y%m%d%H')}"

    async def fetch_forecasts(
        self,
        points: list[tuple[float, float, datetime]],
    ) -> list[WeatherPoint]:
        if not points:
            return []

        results = []
        # Group by grid cell to avoid duplicate API calls
        uncached_points: list[tuple[int, float, float, datetime]] = []

        for i, (lat, lng, eta) in enumerate(points):
            hour = eta.replace(minute=0, second=0, microsecond=0)
            key = self._grid_key(lat, lng, hour)
            if key in self._cache:
                wp = self._cache[key]
                results.append(WeatherPoint(
                    lat=lat, lng=lng, eta=eta,
                    **{k: v for k, v in wp.items() if k not in ("lat", "lng", "eta")},
                ))
            else:
                uncached_points.append((i, lat, lng, eta))
                results.append(None)  # placeholder

        # Batch fetch uncached points (Open-Meteo supports one location per call)
        client = self._get_client()
        for idx, lat, lng, eta in uncached_points:
            hour = eta.replace(minute=0, second=0, microsecond=0)
            key = self._grid_key(lat, lng, hour)

            # Check cache again (another point in same grid cell may have populated it)
            if key in self._cache:
                wp_data = self._cache[key]
                results[idx] = WeatherPoint(
                    lat=lat, lng=lng, eta=eta,
                    **{k: v for k, v in wp_data.items() if k not in ("lat", "lng", "eta")},
                )
                continue

            try:
                resp = await client.get(
                    settings.WEATHER_API_URL,
                    params={
                        "latitude": round(lat, 2),
                        "longitude": round(lng, 2),
                        "hourly": ",".join([
                            "temperature_2m",
                            "precipitation",
                            "rain",
                            "snowfall",
                            "weather_code",
                            "wind_speed_10m",
                            "wind_gusts_10m",
                            "visibility",
                        ]),
                        "forecast_days": 3,
                        "timezone": "UTC",
                    },
                )

                if resp.status_code != 200:
                    logger.warning("Open-Meteo returned %d for %.2f,%.2f", resp.status_code, lat, lng)
                    results[idx] = WeatherPoint(lat=lat, lng=lng, eta=eta)
                    continue

                data = resp.json()
                hourly = data.get("hourly", {})
                times = hourly.get("time", [])

                # Find the closest hour
                target_str = hour.strftime("%Y-%m-%dT%H:%M")
                hour_idx = None
                for hi, t in enumerate(times):
                    if t == target_str:
                        hour_idx = hi
                        break

                if hour_idx is None:
                    # Find nearest
                    for hi, t in enumerate(times):
                        if t >= target_str:
                            hour_idx = hi
                            break

                if hour_idx is None:
                    hour_idx = 0

                wp_data = {
                    "temperature_c": _safe_get(hourly, "temperature_2m", hour_idx, 20.0),
                    "precipitation_mm": _safe_get(hourly, "precipitation", hour_idx, 0.0),
                    "rain_mm": _safe_get(hourly, "rain", hour_idx, 0.0),
                    "snowfall_cm": _safe_get(hourly, "snowfall", hour_idx, 0.0),
                    "weather_code": int(_safe_get(hourly, "weather_code", hour_idx, 0)),
                    "wind_speed_kmh": _safe_get(hourly, "wind_speed_10m", hour_idx, 0.0),
                    "wind_gusts_kmh": _safe_get(hourly, "wind_gusts_10m", hour_idx, 0.0),
                    "visibility_m": _safe_get(hourly, "visibility", hour_idx, 10000.0),
                }

                self._cache[key] = wp_data
                results[idx] = WeatherPoint(lat=lat, lng=lng, eta=eta, **wp_data)

            except httpx.TransportError as e:
                logger.warning("Open-Meteo request failed: %s", e)
                results[idx] = WeatherPoint(lat=lat, lng=lng, eta=eta)

        # Fill any remaining None placeholders with defaults
        results = [r if r is not None else WeatherPoint(lat=0, lng=0, eta=datetime.now(timezone.utc)) for r in results]

        return results

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()


def _safe_get(hourly: dict, key: str, idx: int, default: float) -> float:
    """Safely get a value from Open-Meteo hourly arrays."""
    values = hourly.get(key, [])
    if idx < len(values) and values[idx] is not None:
        return float(values[idx])
    return default


# ── Route Weather Assessment ──────────────────────────────────────────────────

# Singleton provider (swappable for testing)
_provider: WeatherProvider | None = None


def get_weather_provider() -> WeatherProvider:
    global _provider
    if _provider is None:
        _provider = OpenMeteoProvider()
    return _provider


def set_weather_provider(provider: WeatherProvider) -> None:
    """Swap the weather provider (useful for testing)."""
    global _provider
    _provider = provider


async def assess_route_weather(
    polylines: list[str],
    duration_s: int,
    departure_time: datetime,
    interval_m: int = 40_000,
) -> RouteWeather:
    """
    Full weather assessment for a route:
    1. Sample points along the polyline
    2. Fetch forecasts for each point
    3. Compute per-point risk
    4. Aggregate into route-level risk and warnings
    """
    # Step 1: sample
    samples = sample_points_along_route(polylines, duration_s, departure_time, interval_m)

    if not samples:
        return RouteWeather()

    # Step 2: fetch
    provider = get_weather_provider()
    points = await provider.fetch_forecasts(samples)

    # Step 3: per-point risk
    for point in points:
        point.risk = compute_point_risk(point)
        condition, label = _risk_to_condition(point)
        point.condition = condition
        point.message = label

    # Step 4: aggregate
    if not points:
        return RouteWeather()

    risks = [p.risk for p in points]
    max_risk = max(risks)
    avg_risk = sum(risks) / len(risks)

    # Weight toward the worst segment (70% worst, 30% average)
    route_risk = 0.7 * max_risk + 0.3 * avg_risk

    # Generate warnings for segments above threshold
    warnings = []
    for point in points:
        if point.risk >= 0.25:
            warnings.append({
                "location": f"{point.lat:.2f}, {point.lng:.2f}",
                "lat": point.lat,
                "lng": point.lng,
                "eta": point.eta.isoformat(),
                "condition": point.condition,
                "message": f"{point.message} expected at {point.eta.strftime('%H:%M')}",
                "risk": round(point.risk, 2),
            })

    return RouteWeather(
        points=points,
        route_risk=min(1.0, route_risk),
        warnings=warnings,
    )
