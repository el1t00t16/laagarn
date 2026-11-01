import {
  calculateBearing,
  ComputedRoute,
  getCardinalDirection,
  haversineKmPrecise,
  MODE_BASE_SPEED_KMH,
  RouteStep,
} from './routingEngine';

/**
 * Pure, network-free navigation maths. Everything here runs on-device so turn
 * guidance, remaining distance, ETA and off-route detection keep updating in
 * real time from raw GPS fixes even with no internet connection.
 */

export interface RouteIndex {
  routeId: string;
  coords: [number, number][];
  /** Cumulative distance (km) from the start of the route to each vertex. */
  cumulativeKm: number[];
  totalKm: number;
  /** Along-route distance (km) of each step's maneuver point. */
  stepAlongKm: number[];
}

export interface RouteProgress {
  /** Closest point on the route to the user. */
  snapped: { lat: number; lng: number };
  /** Distance from the user to the route line, in metres. */
  offRouteMeters: number;
  alongKm: number;
  remainingKm: number;
  remainingMinutes: number;
  /** Index of the next maneuver the user has not yet reached. */
  nextStepIndex: number;
  distanceToNextStepKm: number;
  /** Bearing (deg) of the route at the snapped point. */
  routeBearing: number;
  arrived: boolean;
}

/** Local equirectangular projection (metres) — accurate for short segments. */
function toLocalXY(origin: { lat: number; lng: number }, p: { lat: number; lng: number }) {
  const R = 6371000;
  const x = ((p.lng - origin.lng) * Math.PI * R * Math.cos((origin.lat * Math.PI) / 180)) / 180;
  const y = ((p.lat - origin.lat) * Math.PI * R) / 180;
  return { x, y };
}

interface Projection {
  segmentIndex: number;
  t: number;
  distanceMeters: number;
  point: { lat: number; lng: number };
}

function projectOntoSegment(
  p: { lat: number; lng: number },
  a: [number, number],
  b: [number, number]
): { t: number; distanceMeters: number; point: { lat: number; lng: number } } {
  const A = { lat: a[0], lng: a[1] };
  const B = { lat: b[0], lng: b[1] };
  const bXY = toLocalXY(A, B);
  const pXY = toLocalXY(A, p);
  const lenSq = bXY.x * bXY.x + bXY.y * bXY.y;
  let t = lenSq > 0 ? (pXY.x * bXY.x + pXY.y * bXY.y) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = pXY.x - bXY.x * t;
  const dy = pXY.y - bXY.y * t;
  return {
    t,
    distanceMeters: Math.sqrt(dx * dx + dy * dy),
    point: { lat: A.lat + (B.lat - A.lat) * t, lng: A.lng + (B.lng - A.lng) * t },
  };
}

function projectOntoPolyline(
  p: { lat: number; lng: number },
  coords: [number, number][],
  searchFrom = 0,
  searchTo = coords.length - 1
): Projection {
  let best: Projection = {
    segmentIndex: 0,
    t: 0,
    distanceMeters: Number.POSITIVE_INFINITY,
    point: { lat: coords[0][0], lng: coords[0][1] },
  };
  const from = Math.max(0, searchFrom);
  const to = Math.min(coords.length - 1, searchTo);
  for (let i = from; i < to; i++) {
    const proj = projectOntoSegment(p, coords[i], coords[i + 1]);
    if (proj.distanceMeters < best.distanceMeters) {
      best = { segmentIndex: i, ...proj };
    }
  }
  return best;
}

export function buildRouteIndex(route: ComputedRoute): RouteIndex {
  const coords = route.coordinates;
  const cumulativeKm: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulativeKm.push(
      cumulativeKm[i - 1] +
        haversineKmPrecise(
          { lat: coords[i - 1][0], lng: coords[i - 1][1] },
          { lat: coords[i][0], lng: coords[i][1] }
        )
    );
  }
  const totalKm = cumulativeKm[cumulativeKm.length - 1] || 0;

  // Steps are ordered, so constrain each search window to start where the previous step was found.
  let cursor = 0;
  const stepAlongKm = route.steps.map((step: RouteStep, idx) => {
    if (coords.length < 2) return 0;
    if (idx === route.steps.length - 1 && step.maneuver === 'arrive') return totalKm;
    const proj = projectOntoPolyline(step, coords, cursor);
    cursor = proj.segmentIndex;
    const segLen = cumulativeKm[proj.segmentIndex + 1] - cumulativeKm[proj.segmentIndex];
    return cumulativeKm[proj.segmentIndex] + segLen * proj.t;
  });

  return { routeId: route.id, coords, cumulativeKm, totalKm, stepAlongKm };
}

/**
 * Computes live progress along a route from a GPS fix.
 * `previousAlongKm` keeps the snap monotonic on routes that double back on themselves.
 */
export function computeRouteProgress(
  route: ComputedRoute,
  index: RouteIndex,
  position: { lat: number; lng: number; speedKmh?: number | null },
  previousAlongKm = 0
): RouteProgress {
  const coords = index.coords;
  if (coords.length < 2) {
    const dest = route.stops[route.stops.length - 1];
    const remainingKm = haversineKmPrecise(position, dest);
    return {
      snapped: { lat: position.lat, lng: position.lng },
      offRouteMeters: 0,
      alongKm: 0,
      remainingKm,
      remainingMinutes: (remainingKm / MODE_BASE_SPEED_KMH[route.mode]) * 60,
      nextStepIndex: route.steps.length - 1,
      distanceToNextStepKm: remainingKm,
      routeBearing: calculateBearing(position, dest),
      arrived: remainingKm < 0.03,
    };
  }

  // Prefer the portion of the route at/after the previous position (avoids snapping backwards
  // onto an earlier overlapping section), but fall back to a global search if far away.
  let startSeg = 0;
  if (previousAlongKm > 0) {
    const target = Math.max(0, previousAlongKm - 0.3);
    while (startSeg < index.cumulativeKm.length - 2 && index.cumulativeKm[startSeg + 1] < target) {
      startSeg++;
    }
  }
  let proj = projectOntoPolyline(position, coords, startSeg);
  if (startSeg > 0 && proj.distanceMeters > 80) {
    const global = projectOntoPolyline(position, coords);
    if (global.distanceMeters < proj.distanceMeters) proj = global;
  }

  const segStart = index.cumulativeKm[proj.segmentIndex];
  const segLen = index.cumulativeKm[proj.segmentIndex + 1] - segStart;
  const alongKm = segStart + segLen * proj.t;
  const remainingKm = Math.max(0, index.totalKm - alongKm);

  let nextStepIndex = index.stepAlongKm.findIndex((d) => d > alongKm + 0.015);
  if (nextStepIndex === -1) nextStepIndex = route.steps.length - 1;
  const distanceToNextStepKm = Math.max(0, index.stepAlongKm[nextStepIndex] - alongKm);

  // ETA: blend the route's planned average speed with the user's live speed when moving.
  const plannedSpeed =
    route.averageSpeedKmh > 0 ? route.averageSpeedKmh : MODE_BASE_SPEED_KMH[route.mode];
  const liveSpeed = position.speedKmh && position.speedKmh > 3 ? position.speedKmh : null;
  const effectiveSpeed = liveSpeed ? plannedSpeed * 0.6 + liveSpeed * 0.4 : plannedSpeed;

  const a = coords[proj.segmentIndex];
  const b = coords[proj.segmentIndex + 1];
  const dest = route.stops[route.stops.length - 1];

  return {
    snapped: proj.point,
    offRouteMeters: proj.distanceMeters,
    alongKm,
    remainingKm,
    remainingMinutes: (remainingKm / Math.max(1, effectiveSpeed)) * 60,
    nextStepIndex,
    distanceToNextStepKm,
    routeBearing: calculateBearing({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }),
    arrived: remainingKm < 0.03 || haversineKmPrecise(position, dest) < 0.03,
  };
}

/** Compass guidance used when off-route and no network is available to re-route. */
export function directBearingGuidance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number; name?: string }
): { bearing: number; cardinal: string; distanceKm: number } {
  const bearing = calculateBearing(from, to);
  return {
    bearing,
    cardinal: getCardinalDirection(bearing),
    distanceKm: haversineKmPrecise(from, to),
  };
}

/** Converts a step + live distance into a short spoken phrase. */
export function buildSpokenInstruction(step: RouteStep, distanceKm: number): string {
  if (step.maneuver === 'arrive') {
    return distanceKm < 0.05 ? step.instruction : `In ${spokenDistance(distanceKm)}, ${step.instruction}`;
  }
  if (distanceKm < 0.04) return step.instruction;
  return `In ${spokenDistance(distanceKm)}, ${lowerFirst(step.instruction)}`;
}

function spokenDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} meters`;
  return `${km.toFixed(1)} kilometers`;
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}
