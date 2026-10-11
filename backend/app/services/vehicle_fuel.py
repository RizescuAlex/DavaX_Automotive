"""Resolve a user's selected vehicle data into normalized route fuel units."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.onboarding_profile import OnboardingProfile
from app.models.vehicle import Vehicle
from app.models.vehicle_fuel_spec import VehicleFuelSpec
from app.services.fuel import FuelConfig, get_fuel_config

US_GALLON_TO_LITERS = 3.785411784
US_MPG_TO_L_PER_100KM = 235.214583


@dataclass(frozen=True)
class VehicleFuelProfile:
    config: FuelConfig
    capacity_unit: str
    consumption_unit: str
    source: str
    consumption_source: str
    selected_trim_name: str | None = None


async def get_user_vehicle_fuel_profile(
    db: AsyncSession,
    user_id: str,
) -> VehicleFuelProfile:
    """Use the user's explicitly selected CarAPI trim, with configured fallback."""
    vehicle = await db.scalar(select(Vehicle).where(Vehicle.user_id == user_id))
    preferred_fuel_type = await db.scalar(
        select(OnboardingProfile.preferred_fuel_type).where(
            OnboardingProfile.user_id == user_id
        )
    )
    fuel_type = (vehicle.fuel_type if vehicle else None) or preferred_fuel_type or "gasoline"
    config = get_fuel_config(fuel_type)
    spec = None

    if vehicle:
        specs = list((await db.scalars(
            select(VehicleFuelSpec)
            .where(VehicleFuelSpec.vehicle_id == vehicle.id)
            .order_by(VehicleFuelSpec.trim_id)
        )).all())
        if vehicle.selected_trim_id is not None:
            spec = next((item for item in specs if item.trim_id == vehicle.selected_trim_id), None)
        elif len(specs) == 1:
            # A sole API result is unambiguous; multiple trims require selection.
            spec = specs[0]

    combined_mpg = float(spec.combined_mpg or 0) if spec else 0.0
    if spec and config.is_ev:
        # The CarAPI MPG field for EVs is MPGe, which can estimate consumption,
        # but it does not provide battery size. Retain the conservative battery
        # capacity default and convert MPGe to kWh per 100 km.
        if combined_mpg > 0:
            config.consumption_l_per_100km = 2_093.0 / combined_mpg
    elif spec:
        capacity_gal = float(spec.fuel_tank_capacity_gal or 0)
        config = get_fuel_config(
            fuel_type,
            tank_capacity_l=(
                capacity_gal * US_GALLON_TO_LITERS if capacity_gal > 0 else None
            ),
            consumption_l_per_100km=(
                US_MPG_TO_L_PER_100KM / combined_mpg if combined_mpg > 0 else None
            ),
        )

    is_ev = config.is_ev
    return VehicleFuelProfile(
        config=config,
        capacity_unit="kWh" if is_ev else "L",
        consumption_unit="kWh/100 km" if is_ev else "L/100 km",
        source="carapi" if spec else "default",
        consumption_source="carapi" if combined_mpg > 0 else "default",
        selected_trim_name=(spec.trim or spec.submodel or vehicle.selected_trim_name)
        if spec and vehicle else None,
    )
