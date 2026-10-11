import { describe, expect, it } from "vitest";
import { calculateFuelLevelAfterDistance } from "./fuelConsumption";

describe("distance-based fuel consumption", () => {
  it("uses the vehicle consumption rate and tank capacity", () => {
    expect(calculateFuelLevelAfterDistance(100, 100_000, 7.5, 50)).toBe(85);
  });

  it("uses partial distance proportionally", () => {
    expect(calculateFuelLevelAfterDistance(50, 1_000, 7.5, 50)).toBeCloseTo(49.85);
  });

  it("never drops below empty", () => {
    expect(calculateFuelLevelAfterDistance(10, 500_000, 10, 40)).toBe(0);
  });

  it("keeps the current level when distance or vehicle data is invalid", () => {
    expect(calculateFuelLevelAfterDistance(42, 0, 8, 50)).toBe(42);
    expect(calculateFuelLevelAfterDistance(42, 1_000, 8, 0)).toBe(42);
  });
});
