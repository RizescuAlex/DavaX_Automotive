const EARTH_RADIUS_METERS = 6_378_137;
// Collapse sub-half-meter duplicate route vertices before building distances.
const DUPLICATE_POINT_METERS = 0.5;
// Compare 10m bearings on either side, scanning every 2m. A 35° change in
// this 20m window filters normal road curvature and small polyline noise.
const BEARING_SAMPLE_METERS = 10;
const SCAN_STEP_METERS = 2;
const TURN_ANGLE_DEGREES = 35;
const TURN_EDGE_TOLERANCE_DEGREES = 5;
// More extreme turns are ambiguous without a matching provider maneuver.
const MAX_UNSPECIFIED_TURN_DEGREES = 150;
const MANEUVER_MATCH_METERS = 60;

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function distanceBetween(a, b) {
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = radians(b.lng - a.lng);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function bearingBetween(a, b) {
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const dLng = radians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// Signed clockwise difference: 359° -> 1° is +2°, while 1° -> 359° is -2°.
function headingDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function interpolatePoint(a, b, fraction) {
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lng: a.lng + (b.lng - a.lng) * fraction,
  };
}

export function buildRouteProfile(path) {
  const points = [];

  for (const point of path ?? []) {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) continue;
    const previous = points[points.length - 1];
    if (!previous || distanceBetween(previous, point) >= DUPLICATE_POINT_METERS) {
      points.push({ lat: point.lat, lng: point.lng });
    }
  }

  const segments = [];
  const pointDistances = points.length ? [0] : [];
  let totalDistance = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = distanceBetween(start, end);
    if (length < 0.01) continue;
    segments.push({ start, end, length, startDistance: totalDistance });
    totalDistance += length;
    pointDistances.push(totalDistance);
  }

  const pointAt = (distance) => {
    if (!segments.length) return points[0] ?? null;
    const clamped = Math.max(0, Math.min(distance, totalDistance));
    let low = 0;
    let high = segments.length - 1;

    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (clamped > segments[middle].startDistance + segments[middle].length) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    const segment = segments[low];
    const fraction = Math.max(
      0,
      Math.min(1, (clamped - segment.startDistance) / segment.length)
    );
    return interpolatePoint(segment.start, segment.end, fraction);
  };

  const bearingAt = (distance) => {
    const start = pointAt(Math.max(0, distance - BEARING_SAMPLE_METERS / 2));
    const end = pointAt(Math.min(totalDistance, distance + BEARING_SAMPLE_METERS / 2));
    return start && end ? bearingBetween(start, end) : 0;
  };

  const distanceTo = (location) => {
    if (!location || !segments.length) return Infinity;
    let nearestDistance = 0;
    let nearestError = Infinity;

    // Provider maneuver locations are route vertices or very close to them.
    // Searching vertices keeps matching linear in the compact encoded path.
    for (let index = 0; index < points.length; index += 1) {
      const error = distanceBetween(points[index], location);
      if (error < nearestError) {
        nearestError = error;
        nearestDistance = pointDistances[index] ?? 0;
      }
    }
    return nearestDistance;
  };

  return { points, segments, totalDistance, pointAt, bearingAt, distanceTo };
}

function maneuverDirection(maneuver) {
  const type = String(maneuver?.type ?? "").toLowerCase();
  if (type.includes("left")) return "left";
  if (type.includes("right")) return "right";
  return null;
}

function findStructuredManeuver(distance, maneuvers) {
  let closest = null;
  let closestDistance = Infinity;

  for (const maneuver of maneuvers ?? []) {
    const maneuverDistance = maneuver.startDistance;
    const separation = Math.abs(maneuverDistance - distance);
    if (separation < closestDistance) {
      closest = maneuver;
      closestDistance = separation;
    }
  }

  return closestDistance <= MANEUVER_MATCH_METERS ? closest : null;
}

function coveringSpecialManeuver(distance, maneuvers) {
  return (maneuvers ?? []).find((maneuver) => {
    if (!/roundabout|uturn|u_turn|u-turn/i.test(maneuver?.type ?? "")) return false;
    const start = maneuver.startDistance;
    const end = maneuver.endDistance;
    return distance >= Math.min(start, end) - 5 && distance <= Math.max(start, end) + 5;
  });
}

export function detectRouteTurns(path, maneuvers = []) {
  const profile = buildRouteProfile(path);
  if (profile.totalDistance < BEARING_SAMPLE_METERS * 2) {
    return { profile, turns: [] };
  }
  const positionedManeuvers = maneuvers.map((maneuver) => ({
    ...maneuver,
    startDistance: profile.distanceTo(maneuver.start_location),
    endDistance: profile.distanceTo(maneuver.end_location),
  }));

  const observations = [];
  for (
    let distance = BEARING_SAMPLE_METERS;
    distance <= profile.totalDistance - BEARING_SAMPLE_METERS;
    distance += SCAN_STEP_METERS
  ) {
    const before = profile.bearingAt(distance - BEARING_SAMPLE_METERS);
    const after = profile.bearingAt(distance + BEARING_SAMPLE_METERS);
    const delta = headingDelta(before, after);
    observations.push({ distance, delta });
  }

  const clusters = [];
  for (const observation of observations) {
    if (Math.abs(observation.delta) < TURN_ANGLE_DEGREES) continue;
    const sign = Math.sign(observation.delta);
    const current = clusters[clusters.length - 1];
    if (
      current &&
      current.sign === sign &&
      observation.distance - current.endDistance <= SCAN_STEP_METERS * 1.5
    ) {
      current.endDistance = observation.distance;
    } else {
      clusters.push({
        sign,
        startDistance: observation.distance,
        endDistance: observation.distance,
      });
    }
  }

  const turns = [];
  for (const cluster of clusters) {
    const centerDistance = (cluster.startDistance + cluster.endDistance) / 2;
    const structured = findStructuredManeuver(centerDistance, positionedManeuvers);
    const explicitDirection = maneuverDirection(structured);
    const coveringSpecial = coveringSpecialManeuver(centerDistance, positionedManeuvers);
    const inferredDirection = cluster.sign > 0 ? "right" : "left";
    const totalAngle = headingDelta(
      profile.bearingAt(Math.max(0, cluster.startDistance - BEARING_SAMPLE_METERS)),
      profile.bearingAt(
        Math.min(profile.totalDistance, cluster.endDistance + BEARING_SAMPLE_METERS)
      )
    );
    const ambiguous = Math.abs(totalAngle) > MAX_UNSPECIFIED_TURN_DEGREES;
    const specialManeuver = Boolean(coveringSpecial);

    // A sharp U-turn or roundabout is only signaled when provider maneuver
    // data explicitly gives its direction. Geometry alone stays conservative.
    if (
      (ambiguous || specialManeuver) &&
      (!explicitDirection ||
        (specialManeuver &&
          Math.abs(
            centerDistance - coveringSpecial.startDistance
          ) > MANEUVER_MATCH_METERS))
    ) {
      continue;
    }

    // Refine the rolling-window detection bounds against the route bearings.
    // Entry is the first 5° departure from the incoming heading; exit is after
    // the outgoing heading returns within 5°, with at least 5m beyond the
    // detected turn center so a sharp corner clears on the outgoing road.
    const incomingHeading = profile.bearingAt(
      Math.max(0, cluster.startDistance - 8)
    );
    const outgoingHeading = profile.bearingAt(
      Math.min(profile.totalDistance, cluster.endDistance + 8)
    );
    let entryDistance = cluster.startDistance;
    for (
      let distance = Math.max(0, cluster.startDistance - 15);
      distance <= centerDistance;
      distance += SCAN_STEP_METERS
    ) {
      const departure = headingDelta(incomingHeading, profile.bearingAt(distance));
      if (departure * cluster.sign >= TURN_EDGE_TOLERANCE_DEGREES) {
        entryDistance = distance;
        break;
      }
    }

    let exitDistance = cluster.endDistance;
    for (
      let distance = centerDistance;
      distance <= Math.min(profile.totalDistance, cluster.endDistance + 12);
      distance += SCAN_STEP_METERS
    ) {
      if (
        Math.abs(headingDelta(profile.bearingAt(distance), outgoingHeading)) <=
        TURN_EDGE_TOLERANCE_DEGREES
      ) {
        exitDistance = distance;
        break;
      }
    }
    exitDistance = Math.max(exitDistance, centerDistance + 5);

    turns.push({
      direction: explicitDirection ?? inferredDirection,
      entryDistance,
      exitDistance: Math.min(profile.totalDistance, exitDistance),
      centerDistance,
      type: structured?.type ?? null,
    });
  }

  return { profile, turns };
}

export const TURN_SIGNAL_TRIGGER_METERS = 25;

export function advanceTurnSignal(turns, distanceTravelled, nextTurnIndex = 0) {
  let nextIndex = nextTurnIndex;
  while (nextIndex < turns.length && distanceTravelled >= turns[nextIndex].exitDistance) {
    nextIndex += 1;
  }

  const nextTurn = turns[nextIndex];
  const signal = nextTurn &&
    distanceTravelled >= Math.max(0, nextTurn.entryDistance - TURN_SIGNAL_TRIGGER_METERS)
    ? nextTurn.direction
    : null;

  return { nextTurnIndex: nextIndex, signal };
}
