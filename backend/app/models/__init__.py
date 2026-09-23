from app.models.base import Base
from app.models.user import User
from app.models.onboarding_profile import OnboardingProfile
from app.models.preference import UserPreference
from app.models.vehicle_settings import VehicleSettings
from app.models.location import FrequentedLocation
from app.models.vehicle import Vehicle
from app.models.vehicle_fuel_spec import VehicleFuelSpec

__all__ = [
    "Base",
    "User",
    "OnboardingProfile",
    "UserPreference",
    "VehicleSettings",
    "FrequentedLocation",
    "Vehicle",
]
