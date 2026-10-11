/** Calculate remaining fuel percentage after traveling a distance in meters. */
export function calculateFuelLevelAfterDistance(
  fuelLevelPct,
  distanceMeters,
  consumptionPer100Km,
  capacity
) {
  const currentFuel = Number(fuelLevelPct);
  const distance = Number(distanceMeters);
  const consumption = Number(consumptionPer100Km);
  const tankCapacity = Number(capacity);

  if (!Number.isFinite(currentFuel)) return 0;
  const boundedFuel = Math.max(0, Math.min(100, currentFuel));
  if (
    !Number.isFinite(distance) || distance <= 0 ||
    !Number.isFinite(consumption) || consumption <= 0 ||
    !Number.isFinite(tankCapacity) || tankCapacity <= 0
  ) {
    return boundedFuel;
  }

  const consumedAmount = (distance / 1_000 / 100) * consumption;
  const consumedPct = consumedAmount / tankCapacity * 100;
  return Math.max(0, boundedFuel - consumedPct);
}
