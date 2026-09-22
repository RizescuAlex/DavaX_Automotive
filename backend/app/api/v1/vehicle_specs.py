import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

CAR_API_URL = "https://carapi.app/api/mileages/v2"


@router.get("")
async def get_vehicle_specs(
    year: int = Query(..., ge=2015, le=2020),
    make: str = Query(..., min_length=1),
    model: str = Query(..., min_length=1),
):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                CAR_API_URL,
                params={"year": year, "make": make, "model": model},
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"CarAPI request failed: {exc}") from exc
