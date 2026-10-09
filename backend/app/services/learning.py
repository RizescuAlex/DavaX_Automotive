"""
ML Learning Layer for Smart Route Recommendation.
Dynamically adjusts user preference weights based on their historical route selections.
"""
import logging
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.trip import Trip

logger = logging.getLogger("davax.learning")

# How much one trip shifts the weight (out of 10)
LEARNING_RATE = 0.05
MAX_TRIPS_HISTORY = 50

async def compute_learned_deltas(user_id: str, db: AsyncSession) -> dict[str, float]:
    """
    Compute weight adjustments (deltas) based on the user's past trip selections.
    Returns a dict with deltas for time, cost, scenic, family.
    """
    try:
        # Trip user_id is stored as UUID, so we cast the string to UUID implicitly 
        # or rely on SQLAlchemy to cast it.
        result = await db.execute(
            select(Trip)
            .where(Trip.user_id == user_id, Trip.status.in_(["confirmed", "completed"]))
            .order_by(desc(Trip.created_at))
            .limit(MAX_TRIPS_HISTORY)
        )
        trips = result.scalars().all()
    except Exception as e:
        logger.warning("Could not fetch trips for learning layer: %s", e)
        return {"time": 0.0, "cost": 0.0, "scenic": 0.0, "family": 0.0}

    deltas = {"time": 0.0, "cost": 0.0, "scenic": 0.0, "family": 0.0}
    
    if not trips:
        return deltas

    for trip in trips:
        if not trip.proposed_routes or trip.selected_index is None:
            continue
        
        candidates = trip.proposed_routes
        if len(candidates) <= 1:
            continue
            
        # Find the chosen route
        chosen = next((c for c in candidates if c.get("index") == trip.selected_index), None)
        if not chosen or "scores" not in chosen:
            continue
            
        others = [c for c in candidates if c.get("index") != trip.selected_index and "scores" in c]
        if not others:
            continue
            
        for feature in deltas.keys():
            chosen_score = chosen["scores"].get(feature, 5.0)
            avg_other = sum(o["scores"].get(feature, 5.0) for o in others) / len(others)
            
            # If they picked a route with a higher score than the alternatives,
            # we want to increase the weight for that feature.
            diff = chosen_score - avg_other
            deltas[feature] += diff * LEARNING_RATE
            
    return deltas
