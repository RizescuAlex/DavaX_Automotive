import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import _get_user_from_token
from app.config import settings
from app.core.dependencies import get_db
from app.core.security import get_current_token
from app.models.onboarding_profile import OnboardingProfile
from app.schemas.navigation import RouteRequest, RouteResponse


router = APIRouter()


@router.post("/route", response_model=RouteResponse)
async def get_route(
    request: RouteRequest,
    db: AsyncSession = Depends(get_db),
    token: dict = Depends(get_current_token),
):
    """
    Fetch routing data from Google Maps Directions API securely
    using the current user's route preferences.
    """
    current_user = await _get_user_from_token(token, db)

    result = await db.execute(
        select(OnboardingProfile).where(
            OnboardingProfile.user_id == current_user.id
        )
    )
    profile = result.scalar_one_or_none()

    avoid_features = []

    if profile:
        if profile.avoid_tolls:
            avoid_features.append("tolls")

        if profile.avoid_highways:
            avoid_features.append("highways")

    url = "https://maps.googleapis.com/maps/api/directions/json"

    params = {
        "origin": f"{request.origin_lat},{request.origin_lng}",
        "destination": f"{request.dest_lat},{request.dest_lng}",
        "key": settings.GOOGLE_MAPS_API_KEY,
    }

    if avoid_features:
        params["avoid"] = "|".join(avoid_features)

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params)

        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Error communicating with Google Maps API",
            )

        data = resp.json()

        if data.get("status") != "OK":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Directions request failed: {data.get('status')}",
            )

        # Extract high-resolution polylines from each step
        # instead of the simplified overview.
        route = data["routes"][0]
        leg = route["legs"][0]
        polylines = [
            step["polyline"]["points"]
            for step in leg.get("steps", [])
        ]

        return RouteResponse(
            polylines=polylines,
            distance_text=leg["distance"]["text"],
            duration_text=leg["duration"]["text"],
            destination_address=leg.get("end_address", ""),
        )