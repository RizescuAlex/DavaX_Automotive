import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from app.config import settings
from app.core.security import get_current_token
from app.schemas.navigation import RouteRequest, RouteResponse

router = APIRouter()

@router.post("/route", response_model=RouteResponse)
async def get_route(
    request: RouteRequest,
    token: dict = Depends(get_current_token),
):
    """
    Fetch routing data from Google Maps Directions API securely.
    """
    url = "https://maps.googleapis.com/maps/api/directions/json"
    params = {
        "origin": f"{request.origin_lat},{request.origin_lng}",
        "destination": f"{request.dest_lat},{request.dest_lng}",
        "key": settings.GOOGLE_MAPS_API_KEY,
    }

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
            
        # Extract high-resolution polylines from each step instead of the simplified overview
        route = data["routes"][0]
        leg = route["legs"][0]
        polylines = [step["polyline"]["points"] for step in leg.get("steps", [])]
        
        return RouteResponse(
            polylines=polylines,
            distance_text=leg["distance"]["text"],
            duration_text=leg["duration"]["text"],
            destination_address=leg.get("end_address", ""),
        )
