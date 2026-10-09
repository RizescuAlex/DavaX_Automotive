"""
Personalization service.

Reads user onboarding profile to derive scoring weights,
and provides frequented-location boosting logic.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.location import FrequentedLocation
from app.models.onboarding_profile import OnboardingProfile
from app.services.scoring import UserWeights, extract_weights

logger = logging.getLogger("davax.personalization")


from app.services.learning import compute_learned_deltas

async def get_user_weights(user_id: str, db: AsyncSession) -> UserWeights:
    """
    Load the onboarding profile for a user and return scoring weights,
    adjusted dynamically by the ML learning layer based on past trips.
    """
    result = await db.execute(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()

    if profile is None:
        logger.info("No onboarding profile for user %s, using equal weights", user_id)
        raw_weights = {"time": 5.0, "cost": 5.0, "scenic": 5.0, "family": 5.0}
    else:
        raw_weights = {
            "time": float(profile.fastest_arrival),
            "cost": float(profile.lowest_cost),
            "scenic": float(profile.scenic_routes),
            "family": float(profile.family_friendly),
        }

    # Apply ML layer deltas
    try:
        deltas = await compute_learned_deltas(user_id, db)
    except Exception as e:
        logger.warning("Failed to compute learned deltas: %s", e)
        deltas = {"time": 0.0, "cost": 0.0, "scenic": 0.0, "family": 0.0}

    final_time = max(0.0, min(10.0, raw_weights["time"] + deltas.get("time", 0.0)))
    final_cost = max(0.0, min(10.0, raw_weights["cost"] + deltas.get("cost", 0.0)))
    final_scenic = max(0.0, min(10.0, raw_weights["scenic"] + deltas.get("scenic", 0.0)))
    final_family = max(0.0, min(10.0, raw_weights["family"] + deltas.get("family", 0.0)))

    logger.info("User %s weights: raw=%s, deltas=%s", user_id, raw_weights, deltas)

    return extract_weights(
        fastest_arrival=final_time,
        lowest_cost=final_cost,
        scenic_routes=final_scenic,
        family_friendly=final_family,
    )


async def get_user_fuel_type(user_id: str, db: AsyncSession) -> str | None:
    """Return the user's preferred fuel type from onboarding, or None."""
    result = await db.execute(
        select(OnboardingProfile.preferred_fuel_type).where(
            OnboardingProfile.user_id == user_id
        )
    )
    row = result.scalar_one_or_none()
    return row


# ── Frequented Locations ──────────────────────────────────────────────────────

PROXIMITY_THRESHOLD_M = 150  # meters


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two lat/lng points in meters."""
    R = 6_371_000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def frecency_score(visit_count: int, last_visited_at: datetime | None) -> float:
    """
    Compute a frequency-with-recency-decay score.

    Higher visit count + more recent = higher score.
    Score decays with a half-life of 30 days.
    """
    if visit_count == 0:
        return 0.0

    recency = 1.0
    if last_visited_at:
        now = datetime.now(timezone.utc)
        days_ago = (now - last_visited_at).total_seconds() / 86400
        half_life = 30.0
        recency = 2.0 ** (-days_ago / half_life)

    return visit_count * recency


async def get_frequented_locations(
    user_id: str,
    db: AsyncSession,
    limit: int = 20,
) -> list[dict]:
    """
    Return the user's most relevant frequented locations,
    sorted by frecency score (frequency × recency).
    """
    result = await db.execute(
        select(FrequentedLocation).where(
            FrequentedLocation.user_id == user_id
        )
    )
    locations = result.scalars().all()

    scored = []
    for loc in locations:
        score = frecency_score(loc.visit_count, loc.last_visited_at)
        scored.append({
            "id": str(loc.id),
            "label": loc.label,
            "address": loc.address,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "visit_count": loc.visit_count,
            "is_favorite": loc.is_favorite,
            "frecency": score,
        })

    scored.sort(key=lambda x: x["frecency"], reverse=True)
    return scored[:limit]


async def boost_nearby_locations(
    user_id: str,
    candidates: list[dict],
    db: AsyncSession,
) -> list[dict]:
    """
    Boost stop candidates that are near the user's frequented locations.

    Returns the same list with an added 'familiarity_boost' field.
    """
    freq_locations = await get_frequented_locations(user_id, db)

    for candidate in candidates:
        clat = candidate.get("lat", 0)
        clng = candidate.get("lng", 0)
        best_boost = 0.0

        for floc in freq_locations:
            dist = _haversine_m(clat, clng, floc["latitude"], floc["longitude"])
            if dist <= PROXIMITY_THRESHOLD_M:
                best_boost = max(best_boost, floc["frecency"])

        candidate["familiarity_boost"] = best_boost

    return candidates



async def upsert_frequented_location(
    user_id: str,
    lat: float,
    lng: float,
    db: AsyncSession,
    place_id: str | None = None,
    label: str | None = None,
    category: str | None = None,
    is_arrival: bool = False,
) -> None:
    """
    Upsert a location into frequented_locations.

    If place_id matches, or if it's within PROXIMITY_THRESHOLD_M of an existing
    location, we increment the visit_count and update last_visited_at.
    Otherwise, we insert a new row.
    """
    now = datetime.now(timezone.utc)
    increment = 3 if is_arrival else 1

    # 1. Try to find by place_id
    if place_id:
        result = await db.execute(
            select(FrequentedLocation)
            .where(FrequentedLocation.user_id == user_id, FrequentedLocation.place_id == place_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.visit_count += increment
            existing.last_visited_at = now
            if not existing.label and label:
                existing.label = label
            if not existing.category and category:
                existing.category = category
            return

    # 2. Try to find by proximity
    result = await db.execute(
        select(FrequentedLocation).where(FrequentedLocation.user_id == user_id)
    )
    locations = result.scalars().all()

    best_match = None
    min_dist = PROXIMITY_THRESHOLD_M

    for loc in locations:
        dist = _haversine_m(lat, lng, loc.latitude, loc.longitude)
        if dist < min_dist:
            min_dist = dist
            best_match = loc

    if best_match:
        best_match.visit_count += increment
        best_match.last_visited_at = now
        if place_id and not best_match.place_id:
            best_match.place_id = place_id
        return

    # 3. Insert new location
    new_loc = FrequentedLocation(
        user_id=user_id,
        place_id=place_id,
        label=label,
        category=category,
        latitude=lat,
        longitude=lng,
        visit_count=increment,
        last_visited_at=now,
    )
    db.add(new_loc)
