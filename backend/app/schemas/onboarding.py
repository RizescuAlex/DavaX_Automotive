from pydantic import BaseModel, Field

class OnboardingProfileCreate(BaseModel):
    fastest_arrival: int = Field(default=5, ge=0, le=10)
    lowest_cost: int = Field(default=5, ge=0, le=10)
    scenic_routes: int = Field(default=3, ge=0, le=10)
    family_friendly: int = Field(default=3, ge=0, le=10)
    avoid_tolls: bool = False
    avoid_highways: bool = False
    preferred_fuel_type: str | None = None

class OnboardingProfileOut(OnboardingProfileCreate):
    class Config:
        from_attributes = True
