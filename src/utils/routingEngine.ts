export type TravelMode = 'driving' | 'cycling' | 'walking' | 'transit';

export type TrafficSeverity = 'low' | 'moderate' | 'heavy' | 'closure';

export type CongestionLevel = 'normal' | 'moderate' | 'heavy';

export interface LatLngPoint {
  lat: number;
  lng: number;
  name: string;
  region?: string;
}

export interface TrafficIncident {
  id: string;
  title: string;
  corridor: string;
  type: 'congestion' | 'accident' | 'roadwork' | 'weather';
  severity: TrafficSeverity;
  lat: number;
  lng: number;
  delayMinutes: number;
  speedKmh: number;
  description: string;
  updatedMinutesAgo: number;
  active: boolean;
  createdAt?: number;
}

export type ManeuverKind =
  | 'depart'
  | 'turn-left'
  | 'turn-right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'uturn'
  | 'straight'
  | 'roundabout'
  | 'merge'
  | 'ramp'
  | 'arrive'
  | 'waypoint';

export interface RouteStep {
  id: string;
  instruction: string;
  maneuver: ManeuverKind;
  distanceKm: number;
  durationMinutes: number;
  roadName: string;
  lat: number;
  lng: number;
  trafficStatus: CongestionLevel;
}

export interface RouteSegment {
  coordinates: [number, number][];
  congestion: CongestionLevel;
  speedKmh: number;
  distanceKm: number;
}

export type RouteSource = 'live' | 'cached' | 'offline-direct';

export interface ComputedRoute {
  id: string;
  label: string;
  mode: TravelMode;
  source: RouteSource;
  stops: LatLngPoint[];
  coordinates: [number, number][];
  segments: RouteSegment[];
  steps: RouteStep[];
  totalDistanceKm: number;
  baseDurationMinutes: number;
  trafficDelayMinutes: number;
  totalDurationMinutes: number;
  averageSpeedKmh: number;
  fuelOrEnergyEstimate: string;
  co2Kg: number;
  affectedIncidents: TrafficIncident[];
}

export interface WeatherSnapshot {
  locationName: string;
  lat: number;
  lng: number;
  tempC: number;
  feelsLikeC: number;
  condition: 'Clear' | 'Partly Cloudy' | 'Overcast' | 'Light Rain' | 'Heavy Rain' | 'Fog' | 'Mountain Snow';
  windKmh: number;
  humidityPct: number;
  precipProbPct: number;
  visibilityKm: number;
  uvIndex: number;
  /** `true` when produced by the offline climatology estimator rather than a live API. */
  estimated?: boolean;
  fetchedAt?: number;
  hourly: {
    timeLabel: string;
    tempC: number;
    precipProbPct: number;
    windKmh: number;
    condition: string;
  }[];
  daily: {
    dayLabel: string;
    highC: number;
    lowC: number;
    precipProbPct: number;
    condition: string;
  }[];
}

export interface WeatherTravelAdvisory {
  level: 'Nominal' | 'Caution' | 'Severe';
  roadSurface: 'Dry' | 'Damp' | 'Wet' | 'Low Visibility' | 'Icy / Hazardous';
  speedReductionPct: number;
  summary: string;
}

export interface RouteValidationResult {
  valid: boolean;
  error?: string;
}

const EARTH_RADIUS_KM = 6371;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Unrounded great-circle distance — use for navigation maths. */
export function haversineKmPrecise(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function calculateHaversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  return Number(haversineKmPrecise(a, b).toFixed(2));
}

export function calculateBearing(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const φ1 = toRadians(a.lat);
  const φ2 = toRadians(b.lat);
  const Δλ = toRadians(b.lng - a.lng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return Math.round(((θ * 180) / Math.PI + 360) % 360);
}

export function getCardinalDirection(bearing: number): string {
  const normalized = ((bearing % 360) + 360) % 360;
  const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  const index = Math.round(normalized / 45) % 8;
  return directions[index];
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.max(0, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export function validateRouteInputs(
  originName: string,
  destinationName: string,
  stops: LatLngPoint[] = []
): RouteValidationResult {
  const cleanOrigin = originName.trim();
  const cleanDest = destinationName.trim();

  if (!cleanOrigin) {
    return { valid: false, error: 'Please enter a starting origin location.' };
  }
  if (!cleanDest) {
    return { valid: false, error: 'Please enter a destination location.' };
  }
  if (cleanOrigin.toLowerCase() === cleanDest.toLowerCase()) {
    return {
      valid: false,
      error: 'Origin and destination cannot be the same location.',
    };
  }
  if (stops.length >= 2) {
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (calculateHaversineDistanceKm(first, last) < 0.05) {
      return {
        valid: false,
        error: 'Origin and destination coordinates are too close to plot a route.',
      };
    }
  }
  return { valid: true };
}

export const MODE_BASE_SPEED_KMH: Record<TravelMode, number> = {
  driving: 42,
  transit: 28,
  cycling: 16,
  walking: 4.8,
};

const MODE_ROAD_FACTOR: Record<TravelMode, number> = {
  driving: 1.24,
  transit: 1.28,
  cycling: 1.16,
  walking: 1.12,
};

/**
 * Straight, densified geometry between two points. Used for the offline
 * "direct bearing" fallback so the line on the map is honest (no invented
 * roads) while still being dense enough for traffic proximity checks and
 * live GPS progress tracking.
 *
 * `variantIndex` is retained for backwards compatibility and ignored.
 */
export function interpolateCorridorGeometry(
  start: LatLngPoint,
  end: LatLngPoint,
  _variantIndex = 0
): [number, number][] {
  const distKm = haversineKmPrecise(start, end);
  const stepsCount = Math.max(2, Math.min(200, Math.ceil(distKm / 0.5)));
  const points: [number, number][] = [];
  for (let i = 0; i <= stepsCount; i++) {
    const t = i / stepsCount;
    points.push([
      Number((start.lat + (end.lat - start.lat) * t).toFixed(6)),
      Number((start.lng + (end.lng - start.lng) * t).toFixed(6)),
    ]);
  }
  return points;
}

export function calculateTrafficImpact(
  coordinates: [number, number][],
  incidents: TrafficIncident[],
  mode: TravelMode
): {
  affectedIncidents: TrafficIncident[];
  totalDelayMinutes: number;
  segmentCongestions: CongestionLevel[];
} {
  const activeIncidents = incidents.filter((inc) => inc.active);
  const affectedMap = new Map<string, TrafficIncident>();
  const segmentCongestions: CongestionLevel[] = [];

  // Radius (km) within which an incident is considered to affect a route point.
  const proximityThresholdKm = 1.2;

  const segmentCount = Math.max(1, coordinates.length - 1);
  for (let i = 0; i < segmentCount; i++) {
    const coord = coordinates[i];
    if (!coord) {
      segmentCongestions.push('normal');
      continue;
    }
    const pt = { lat: coord[0], lng: coord[1] };
    let worstForSegment: CongestionLevel = 'normal';

    for (const inc of activeIncidents) {
      const dist = haversineKmPrecise(pt, { lat: inc.lat, lng: inc.lng });
      if (dist <= proximityThresholdKm) {
        affectedMap.set(inc.id, inc);
        if (inc.severity === 'heavy' || inc.severity === 'closure') {
          worstForSegment = 'heavy';
        } else if (inc.severity === 'moderate' && worstForSegment === 'normal') {
          worstForSegment = 'moderate';
        }
      }
    }
    segmentCongestions.push(worstForSegment);
  }

  const affectedIncidents = Array.from(affectedMap.values());
  const modeMultiplier =
    mode === 'driving' ? 1.0 : mode === 'transit' ? 0.65 : mode === 'cycling' ? 0.15 : 0.0;

  const rawDelay = affectedIncidents.reduce((sum, inc) => sum + inc.delayMinutes, 0);
  const totalDelayMinutes = Math.round(rawDelay * modeMultiplier);

  return {
    affectedIncidents,
    totalDelayMinutes,
    segmentCongestions,
  };
}

/** Groups consecutive coordinates with identical congestion into polyline segments. */
export function buildCongestionSegments(
  coordinates: [number, number][],
  congestions: CongestionLevel[],
  baseSpeed: number
): RouteSegment[] {
  const segments: RouteSegment[] = [];
  if (coordinates.length < 2) return segments;

  let current: RouteSegment | null = null;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const level = congestions[i] || 'normal';
    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    const d = haversineKmPrecise({ lat: p1[0], lng: p1[1] }, { lat: p2[0], lng: p2[1] });
    if (!current || current.congestion !== level) {
      current = {
        coordinates: [p1],
        congestion: level,
        speedKmh:
          level === 'heavy'
            ? Math.round(baseSpeed * 0.38)
            : level === 'moderate'
            ? Math.round(baseSpeed * 0.68)
            : baseSpeed,
        distanceKm: 0,
      };
      segments.push(current);
    }
    current.coordinates.push(p2);
    current.distanceKm = Number((current.distanceKm + d).toFixed(3));
  }
  return segments;
}

export function estimateEnergy(mode: TravelMode, totalDistanceKm: number): {
  fuelOrEnergyEstimate: string;
  co2Kg: number;
} {
  if (mode === 'driving') {
    const liters = Number((totalDistanceKm * 0.078).toFixed(1));
    return {
      co2Kg: Number((liters * 2.31).toFixed(1)),
      fuelOrEnergyEstimate: `${liters} L fuel (${(totalDistanceKm * 0.18).toFixed(1)} kWh EV)`,
    };
  }
  if (mode === 'transit') {
    return {
      co2Kg: Number((totalDistanceKm * 0.042).toFixed(1)),
      fuelOrEnergyEstimate: 'Public transit · Low carbon',
    };
  }
  if (mode === 'cycling') {
    return { co2Kg: 0, fuelOrEnergyEstimate: `${Math.round(totalDistanceKm * 28)} kcal active burn` };
  }
  return { co2Kg: 0, fuelOrEnergyEstimate: `${Math.round(totalDistanceKm * 58)} kcal active walk` };
}

/**
 * Re-applies the current incident list to an existing route without refetching
 * geometry (works fully offline).
 */
export function applyTrafficToRoute(
  route: ComputedRoute,
  incidents: TrafficIncident[]
): ComputedRoute {
  const { affectedIncidents, totalDelayMinutes, segmentCongestions } = calculateTrafficImpact(
    route.coordinates,
    incidents,
    route.mode
  );
  const baseSpeed = MODE_BASE_SPEED_KMH[route.mode];
  const totalDurationMinutes = route.baseDurationMinutes + totalDelayMinutes;
  return {
    ...route,
    affectedIncidents,
    trafficDelayMinutes: totalDelayMinutes,
    totalDurationMinutes,
    averageSpeedKmh: Number(
      (route.totalDistanceKm / Math.max(1 / 60, totalDurationMinutes / 60)).toFixed(1)
    ),
    segments: buildCongestionSegments(route.coordinates, segmentCongestions, baseSpeed),
    steps: route.steps.map((step) => {
      const near = affectedIncidents.filter(
        (inc) => haversineKmPrecise(step, { lat: inc.lat, lng: inc.lng }) <= 1.5
      );
      const trafficStatus: CongestionLevel = near.some(
        (inc) => inc.severity === 'heavy' || inc.severity === 'closure'
      )
        ? 'heavy'
        : near.length > 0
        ? 'moderate'
        : 'normal';
      return { ...step, trafficStatus };
    }),
  };
}

/**
 * Offline route: honest straight-line ("as the crow flies") legs with compass
 * guidance. Distances/durations are road-factor estimates. Real-time GPS
 * progress tracking works on top of this with no network at all.
 */
export function calculateMultiStopRoute(
  stops: LatLngPoint[],
  mode: TravelMode,
  incidents: TrafficIncident[] = [],
  variantIndex = 0
): ComputedRoute {
  if (stops.length < 2) {
    throw new Error('At least two stops (origin and destination) are required.');
  }

  const allCoordinates: [number, number][] = [];
  const steps: RouteStep[] = [];
  const legEstimatesKm: number[] = [];
  let totalStraightKm = 0;

  for (let legIdx = 0; legIdx < stops.length - 1; legIdx++) {
    const legStart = stops[legIdx];
    const legEnd = stops[legIdx + 1];
    const legCoords = interpolateCorridorGeometry(legStart, legEnd);
    allCoordinates.push(...(legIdx === 0 ? legCoords : legCoords.slice(1)));
    const straightKm = haversineKmPrecise(legStart, legEnd);
    totalStraightKm += straightKm;
    legEstimatesKm.push(straightKm * MODE_ROAD_FACTOR[mode]);
  }

  const totalDistanceKm = Number((totalStraightKm * MODE_ROAD_FACTOR[mode]).toFixed(1));
  const { affectedIncidents, totalDelayMinutes, segmentCongestions } = calculateTrafficImpact(
    allCoordinates,
    incidents,
    mode
  );

  const baseSpeed = MODE_BASE_SPEED_KMH[mode];
  const baseDurationMinutes = Math.max(1, Math.round((totalDistanceKm / baseSpeed) * 60));
  const totalDurationMinutes = baseDurationMinutes + totalDelayMinutes;
  const averageSpeedKmh = Number((totalDistanceKm / (totalDurationMinutes / 60)).toFixed(1));

  const minutesFor = (km: number) => Math.max(1, Math.round((km / baseSpeed) * 60));

  for (let legIdx = 0; legIdx < stops.length - 1; legIdx++) {
    const start = stops[legIdx];
    const end = stops[legIdx + 1];
    const cardinal = getCardinalDirection(calculateBearing(start, end));
    const legKm = legEstimatesKm[legIdx];
    const roadName = 'Direct bearing (offline)';
    const legTraffic: CongestionLevel = affectedIncidents.some(
      (inc) =>
        (inc.severity === 'heavy' || inc.severity === 'closure') &&
        haversineKmPrecise(start, inc) + haversineKmPrecise(inc, end) <= haversineKmPrecise(start, end) + 2
    )
      ? 'heavy'
      : 'normal';

    steps.push({
      id: `step-${legIdx === 0 ? 'depart' : 'waypoint'}-${legIdx}`,
      instruction:
        legIdx === 0
          ? `Head ${cardinal} from ${start.name} toward ${end.name}`
          : `Arrive at stop ${start.name}, then head ${cardinal} toward ${end.name}`,
      maneuver: legIdx === 0 ? 'depart' : 'waypoint',
      distanceKm: Number((legKm * 0.5).toFixed(1)),
      durationMinutes: minutesFor(legKm * 0.5),
      roadName,
      lat: start.lat,
      lng: start.lng,
      trafficStatus: legTraffic,
    });

    const mid = {
      lat: Number((start.lat + (end.lat - start.lat) * 0.5).toFixed(6)),
      lng: Number((start.lng + (end.lng - start.lng) * 0.5).toFixed(6)),
    };
    steps.push({
      id: `step-mid-${legIdx}`,
      instruction: `Keep heading ${cardinal} — about ${formatDistance(legKm * 0.5)} to ${end.name}`,
      maneuver: 'straight',
      distanceKm: Number((legKm * 0.3).toFixed(1)),
      durationMinutes: minutesFor(legKm * 0.3),
      roadName,
      lat: mid.lat,
      lng: mid.lng,
      trafficStatus: legTraffic,
    });

    const approach = {
      lat: Number((start.lat + (end.lat - start.lat) * 0.8).toFixed(6)),
      lng: Number((start.lng + (end.lng - start.lng) * 0.8).toFixed(6)),
    };
    steps.push({
      id: `step-approach-${legIdx}`,
      instruction: `Approaching ${end.name} — about ${formatDistance(legKm * 0.2)} remaining`,
      maneuver: 'straight',
      distanceKm: Number((legKm * 0.2).toFixed(1)),
      durationMinutes: minutesFor(legKm * 0.2),
      roadName,
      lat: approach.lat,
      lng: approach.lng,
      trafficStatus: 'normal',
    });
  }

  const finalStop = stops[stops.length - 1];
  steps.push({
    id: 'step-arrive-final',
    instruction: `Arrive at destination: ${finalStop.name}`,
    maneuver: 'arrive',
    distanceKm: 0,
    durationMinutes: 0,
    roadName: finalStop.name,
    lat: finalStop.lat,
    lng: finalStop.lng,
    trafficStatus: 'normal',
  });

  return {
    id: `route-offline-${mode}-${variantIndex}-${stops
      .map((s) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`)
      .join('|')}`,
    label: 'Offline Direct Bearing',
    mode,
    source: 'offline-direct',
    stops,
    coordinates: allCoordinates,
    segments: buildCongestionSegments(allCoordinates, segmentCongestions, baseSpeed),
    steps,
    totalDistanceKm,
    baseDurationMinutes,
    trafficDelayMinutes: totalDelayMinutes,
    totalDurationMinutes,
    averageSpeedKmh,
    ...estimateEnergy(mode, totalDistanceKm),
    affectedIncidents,
  };
}

export function evaluateWeatherTravelAdvisory(
  weather: Pick<WeatherSnapshot, 'tempC' | 'precipProbPct' | 'windKmh' | 'visibilityKm' | 'condition'>
): WeatherTravelAdvisory {
  if (weather.tempC <= 1 && weather.precipProbPct >= 50) {
    return {
      level: 'Severe',
      roadSurface: 'Icy / Hazardous',
      speedReductionPct: 35,
      summary: 'Sub-freezing precipitation likely. Expect icy bridge decks and reduced traction.',
    };
  }
  if (weather.precipProbPct >= 70 || weather.windKmh >= 48 || weather.visibilityKm < 2.5) {
    return {
      level: 'Severe',
      roadSurface: weather.visibilityKm < 2.5 ? 'Low Visibility' : 'Wet',
      speedReductionPct: 25,
      summary: 'Heavy precipitation or crosswinds along corridor. Increase following distance.',
    };
  }
  if (weather.precipProbPct >= 35 || weather.windKmh >= 30 || weather.visibilityKm < 6) {
    return {
      level: 'Caution',
      roadSurface: 'Damp',
      speedReductionPct: 10,
      summary: 'Intermittent showers or moderate gusts expected along elevated segments.',
    };
  }
  return {
    level: 'Nominal',
    roadSurface: 'Dry',
    speedReductionPct: 0,
    summary: 'Optimal road surface conditions and clear corridor visibility.',
  };
}

export function latLngToTileXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = toRadians(lat);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

export function getTileCoordinatesForBounds(
  southWest: { lat: number; lng: number },
  northEast: { lat: number; lng: number },
  zoomLevels: number[] = [11, 12],
  maxTilesCap = 64
): { z: number; x: number; y: number; key: string }[] {
  const tiles: { z: number; x: number; y: number; key: string }[] = [];

  for (const z of zoomLevels) {
    const minTile = latLngToTileXY(northEast.lat, southWest.lng, z);
    const maxTile = latLngToTileXY(southWest.lat, northEast.lng, z);

    const xStart = Math.min(minTile.x, maxTile.x);
    const xEnd = Math.max(minTile.x, maxTile.x);
    const yStart = Math.min(minTile.y, maxTile.y);
    const yEnd = Math.max(minTile.y, maxTile.y);

    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        tiles.push({ z, x, y, key: `${z}/${x}/${y}` });
        if (tiles.length >= maxTilesCap) {
          return tiles;
        }
      }
    }
  }
  return tiles;
}
