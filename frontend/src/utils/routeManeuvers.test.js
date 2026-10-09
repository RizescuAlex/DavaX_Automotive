import { describe, expect, it } from "vitest";
import {
  advanceTurnSignal,
  detectRouteTurns,
} from "./routeManeuvers";

const METERS_PER_DEGREE = 111_319.49;

function routeFromLegs(legs) {
  let x = 0;
  let y = 0;
  const path = [{ lat: 0, lng: 0 }];

  for (const { direction, length } of legs) {
    const steps = Math.ceil(length / 2);
    const stepLength = length / steps;
    for (let index = 0; index < steps; index += 1) {
      if (direction === "north") y += stepLength;
      if (direction === "south") y -= stepLength;
      if (direction === "east") x += stepLength;
      if (direction === "west") x -= stepLength;
      path.push({
        lat: y / METERS_PER_DEGREE,
        lng: x / METERS_PER_DEGREE,
      });
    }
  }
  return path;
}

describe("route turn signals", () => {
  it("activates 25m before a left or right turn and clears after the exit", () => {
    const left = detectRouteTurns(routeFromLegs([
      { direction: "north", length: 100 },
      { direction: "west", length: 80 },
    ])).turns[0];
    const right = detectRouteTurns(routeFromLegs([
      { direction: "north", length: 100 },
      { direction: "east", length: 80 },
    ])).turns[0];

    expect(left.direction).toBe("left");
    expect(right.direction).toBe("right");

    for (const turn of [left, right]) {
      const trigger = turn.entryDistance - 25;
      expect(advanceTurnSignal([turn], trigger - 0.1).signal).toBeNull();
      expect(advanceTurnSignal([turn], trigger).signal).toBe(turn.direction);
      expect(advanceTurnSignal([turn], turn.exitDistance - 0.1).signal).toBe(turn.direction);
      expect(advanceTurnSignal([turn], turn.exitDistance).signal).toBeNull();
    }
  });

  it("handles a frame crossing the threshold and starts a nearby next turn on completion", () => {
    const turns = detectRouteTurns(routeFromLegs([
      { direction: "north", length: 60 },
      { direction: "east", length: 30 },
      { direction: "south", length: 30 },
      { direction: "east", length: 50 },
    ])).turns;

    expect(turns.length).toBeGreaterThanOrEqual(2);
    const firstTrigger = turns[0].entryDistance - 25;
    expect(advanceTurnSignal(turns, firstTrigger - 0.2).signal).toBeNull();
    expect(advanceTurnSignal(turns, firstTrigger + 0.2).signal).toBe("right");

    const afterFirst = advanceTurnSignal(turns, turns[0].exitDistance);
    expect(afterFirst.nextTurnIndex).toBe(1);
    expect(afterFirst.signal).toBe(
      turns[1].entryDistance - 25 <= turns[0].exitDistance
        ? turns[1].direction
        : null
    );
  });

  it("ignores duplicate points, straight routes, and small heading noise", () => {
    const straight = routeFromLegs([{ direction: "north", length: 160 }]);
    const withDuplicates = straight.flatMap((point) => [point, point]);
    expect(detectRouteTurns(withDuplicates).turns).toEqual([]);

    const noisy = straight.map((point, index) => ({
      lat: point.lat,
      lng: point.lng + (Math.sin(index * 2.3) * 0.25) / METERS_PER_DEGREE,
    }));
    expect(detectRouteTurns(noisy).turns).toEqual([]);
  });

  it("keeps the signal through a curved turn until the outgoing road is established", () => {
    const radius = 20;
    const path = [];
    for (let northing = 0; northing <= 100; northing += 2) {
      path.push({ lat: northing / METERS_PER_DEGREE, lng: 0 });
    }
    for (let index = 1; index <= 25; index += 1) {
      const angle = Math.PI - (index / 25) * (Math.PI / 2);
      path.push({
        lat: (100 + radius * Math.sin(angle)) / METERS_PER_DEGREE,
        lng: (radius + radius * Math.cos(angle)) / METERS_PER_DEGREE,
      });
    }
    for (let easting = 22; easting <= 80; easting += 2) {
      path.push({
        lat: 120 / METERS_PER_DEGREE,
        lng: easting / METERS_PER_DEGREE,
      });
    }

    const turn = detectRouteTurns(path).turns[0];
    expect(turn.direction).toBe("right");
    expect(turn.entryDistance).toBeGreaterThanOrEqual(99);
    expect(turn.exitDistance).toBeGreaterThanOrEqual(130);
    expect(advanceTurnSignal([turn], turn.entryDistance - 25).signal).toBe("right");
    expect(advanceTurnSignal([turn], 125).signal).toBe("right");
    expect(advanceTurnSignal([turn], turn.exitDistance).signal).toBeNull();
  });

  it("treats a 359° to 1° heading change as a small change, not a turn", () => {
    let x = 0;
    let y = 0;
    const path = [{ lat: 0, lng: 0 }];
    for (const bearing of [359, 1]) {
      for (let index = 0; index < 50; index += 1) {
        const angle = (bearing * Math.PI) / 180;
        x += (Math.sin(angle) * 2) / METERS_PER_DEGREE;
        y += (Math.cos(angle) * 2) / METERS_PER_DEGREE;
        path.push({ lat: y, lng: x });
      }
    }
    expect(detectRouteTurns(path).turns).toEqual([]);
  });

  it("uses explicit provider direction for a geometrically ambiguous U-turn", () => {
    const path = routeFromLegs([
      { direction: "north", length: 70 },
      { direction: "south", length: 60 },
    ]);
    const withoutManeuver = detectRouteTurns(path).turns;
    const withManeuver = detectRouteTurns(path, [{
      type: "uturn-left",
      start_location: path[35],
      end_location: path[40],
    }]).turns;

    expect(withoutManeuver).toEqual([]);
    expect(withManeuver[0]?.direction).toBe("left");
  });

  it("does not guess a signal direction inside a roundabout", () => {
    const path = routeFromLegs([
      { direction: "north", length: 70 },
      { direction: "east", length: 60 },
    ]);
    const turns = detectRouteTurns(path, [{
      type: "roundabout",
      start_location: path[35],
      end_location: path[path.length - 1],
    }]).turns;

    expect(turns).toEqual([]);
  });

  it("activates immediately when the route begins within the trigger distance", () => {
    const turns = detectRouteTurns(routeFromLegs([
      { direction: "north", length: 10 },
      { direction: "east", length: 80 },
    ])).turns;

    expect(turns[0]?.direction).toBe("right");
    expect(advanceTurnSignal(turns, 0).signal).toBe("right");
  });
});
