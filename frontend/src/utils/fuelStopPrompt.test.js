import { describe, expect, it } from "vitest";
import {
  FUEL_STOP_PROMPT_AFTER_SECONDS,
  shouldShowFuelStopWarning,
} from "./fuelStopPrompt";

describe("fuel stop advisory conditions", () => {
  it("waits until the drive is longer than two hours", () => {
    expect(shouldShowFuelStopWarning(FUEL_STOP_PROMPT_AFTER_SECONDS, 50)).toBe(false);
    expect(shouldShowFuelStopWarning(FUEL_STOP_PROMPT_AFTER_SECONDS + 1, 50)).toBe(true);
  });

  it("recommends a stop below 30% fuel at any drive duration", () => {
    expect(shouldShowFuelStopWarning(0, 29.9)).toBe(true);
    expect(shouldShowFuelStopWarning(0, 30)).toBe(false);
  });

  it("uses either trigger, but not before either condition is met", () => {
    expect(shouldShowFuelStopWarning(3_600, 75)).toBe(false);
    expect(shouldShowFuelStopWarning(3_600, 25)).toBe(true);
    expect(shouldShowFuelStopWarning(8_000, 75)).toBe(true);
  });
});
