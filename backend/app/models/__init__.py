from app.models.base import Base
from app.models.user import User
from app.models.contact import UserContact
from app.models.onboarding_profile import OnboardingProfile
from app.models.preference import UserPreference
from app.models.vehicle_settings import VehicleSettings
from app.models.location import FrequentedLocation
from app.models.trip import Trip # <-- ADD THIS
from app.models.vehicle import Vehicle

__all__ = [
    "Base",
    "User",
    "UserContact",
    "OnboardingProfile",
    "UserPreference",
    "VehicleSettings",
    "FrequentedLocation",
    "Trip",
    "Vehicle",
]

