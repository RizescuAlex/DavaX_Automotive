export const FUEL_STOP_PROMPT_AFTER_SECONDS = 2 * 60 * 60;

/** Recommend a fuel stop after a two-hour drive or when fuel is below 30%. */
export function shouldShowFuelStopWarning(elapsedSeconds, fuelLevelPct) {
  return elapsedSeconds > FUEL_STOP_PROMPT_AFTER_SECONDS || fuelLevelPct < 30;
}
