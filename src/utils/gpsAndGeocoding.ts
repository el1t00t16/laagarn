import {
  applyTrafficToRoute,
  calculateMultiStopRoute,
  ComputedRoute,
  estimateEnergy,
  haversineKmPrecise,
  LatLngPoint,
  ManeuverKind,
  RouteStep,
  TrafficIncident,
  TravelMode,
} from './routingEngine';
import { KNOWN_LOCATIONS } from './travelData';
import {
  searchOfflineEstablishments,
  establishmentToLatLngPoint,
} from './establishmentData';
import {
  APP_CONFIG,
  fetchWithTimeout,
  isBrowserOnline,
  readJson,
  writeJson,
} from './config';

export interface GpsPositionState {
  lat: number;
  lng: number;
  accuracyMeters: number;
  /** Degrees clockwise from true north, or null when unknown. */
  heading: number | null;
  speedKmh: number | null;
  altitudeMeters?: number | null;
  addressLabel: string;
  withinPhilippines: boolean;
  timestamp: number;
  /** Where this fix came from. */
  source?: 'gps' | 'manual' | 'last-known';
}

const GEOCODE_CACHE_KEY = 'wayfarer_geocode_cache_v2';
const PLACE_CACHE_KEY = 'wayfarer_place_cache_v2';
const ROUTE_CACHE_KEY = 'wayfarer_route_cache_v2';

// ---------------------------------------------------------------------------
// Offline gazetteer helpers
// ---------------------------------------------------------------------------

function getKnownPlaces(): LatLngPoint[] {
  const remembered = readJson<LatLngPoint[]>(PLACE_CACHE_KEY, []);
  return [...KNOWN_LOCATIONS, ...remembered];
}

function rememberPlaces(places: LatLngPoint[]): void {
  if (places.length === 0) return;
  const existing = readJson<LatLngPoint[]>(PLACE_CACHE_KEY, []);
  const merged = [...places, ...existing];
  const seen = new Set<string>();
  const unique = merged.filter((p) => {
    const key = `${p.name.toLowerCase()}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  writeJson(PLACE_CACHE_KEY, unique.slice(0, 300));
}

/** Nearest remembered/known place — gives a human label with zero network. */
export function nearestKnownPlace(
  lat: number,
  lng: number
): { place: LatLngPoint; distanceKm: number } | null {
  let best: { place: LatLngPoint; distanceKm: number } | null = null;
  for (const place of getKnownPlaces()) {
    const d = haversineKmPrecise({ lat, lng }, place);
    if (!best || d < best.distanceKm) best = { place, distanceKm: d };
  }
  return best;
}

export function offlineLocationLabel(lat: number, lng: number): { name: string; region: string } {
  const near = nearestKnownPlace(lat, lng);
  if (near && near.distanceKm < 25) {
    const dist =
      near.distanceKm < 1
        ? `${Math.round(near.distanceKm * 1000)} m`
        : `${near.distanceKm.toFixed(1)} km`;
    return {
      name: near.distanceKm < 0.15 ? near.place.name : `${dist} from ${near.place.name}`,
      region: near.place.region || 'Philippines',
    };
  }
  return {
    name: `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`,
    region: isPointWithinPhilippines(lat, lng) ? 'Philippines' : 'Outside PH coverage',
  };
}

// ---------------------------------------------------------------------------
// Reverse geocoding (Nominatim, cached, offline-safe)
// ---------------------------------------------------------------------------

export async function reverseGeocodePhilippines(
  lat: number,
  lng: number
): Promise<{ name: string; region: string }> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cache = readJson<Record<string, { name: string; region: string }>>(GEOCODE_CACHE_KEY, {});
  if (cache[cacheKey]) return cache[cacheKey];

  if (isBrowserOnline()) {
    try {
      const url = `${APP_CONFIG.nominatimUrl}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1&accept-language=en`;
      const res = await fetchWithTimeout(url, 4000, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const primary =
          data.name ||
          [addr.house_number, addr.road].filter(Boolean).join(' ') ||
          addr.neighbourhood ||
          addr.suburb ||
          addr.village ||
          addr.town ||
          addr.city;
        if (primary) {
          const result = {
            name: String(primary),
            region:
              [addr.city || addr.town || addr.municipality, addr.state || addr.region]
                .filter(Boolean)
                .join(', ') || 'Philippines',
          };
          const keys = Object.keys(cache);
          if (keys.length > 400) {
            for (const k of keys.slice(0, keys.length - 400)) delete cache[k];
          }
          cache[cacheKey] = result;
          writeJson(GEOCODE_CACHE_KEY, cache);
          return result;
        }
      }
    } catch {
      // fall through to the offline label
    }
  }

  return offlineLocationLabel(lat, lng);
}

// ---------------------------------------------------------------------------
// Forward search
// ---------------------------------------------------------------------------

function parseCoordinateQuery(query: string): LatLngPoint | null {
  const match = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return {
    name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    region: isPointWithinPhilippines(lat, lng) ? 'Coordinate' : 'Coordinate (outside PH)',
    lat,
    lng,
  };
}

export function searchOfflinePlaces(query: string): LatLngPoint[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const coord = parseCoordinateQuery(q);
  if (coord) return [coord];

  const placeMatches = getKnownPlaces().filter(
    (loc) => loc.name.toLowerCase().includes(q) || (loc.region && loc.region.toLowerCase().includes(q))
  );

  const establishmentMatches = searchOfflineEstablishments(q, { limit: 8 }).map(
    establishmentToLatLngPoint
  );

  const combined = [...establishmentMatches, ...placeMatches];
  const seen = new Set<string>();
  return combined.filter((p) => {
    const key = `${p.name.toLowerCase()}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Searches real places in the Philippines via Nominatim (`countrycodes=ph`),
 * with an offline gazetteer (built-ins + every place you've searched before).
 */
export async function searchPhilippinePlaces(query: string): Promise<LatLngPoint[]> {
  const clean = query.trim();
  if (!clean) return [];

  const coord = parseCoordinateQuery(clean);
  if (coord) return [coord];

  const localMatches = searchOfflinePlaces(clean);
  if (!isBrowserOnline()) return localMatches;

  try {
    const url = `${APP_CONFIG.nominatimUrl}/search?format=jsonv2&countrycodes=ph&limit=6&addressdetails=1&accept-language=en&q=${encodeURIComponent(
      clean
    )}`;
    const res = await fetchWithTimeout(url, 4500, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items) && items.length > 0) {
        const remoteResults: LatLngPoint[] = items
          .map((item: Record<string, any>) => {
            const lat = Number(parseFloat(item.lat).toFixed(6));
            const lng = Number(parseFloat(item.lon).toFixed(6));
            const addr = item.address || {};
            const shortName =
              item.name ||
              (typeof item.display_name === 'string'
                ? item.display_name.split(',').slice(0, 2).join(',')
                : clean);
            const region =
              [addr.city || addr.town || addr.municipality || addr.county, addr.state || addr.region]
                .filter(Boolean)
                .join(', ') || 'Philippines';
            return { name: String(shortName).trim(), region, lat, lng };
          })
          .filter((p: LatLngPoint) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

        const combined = [...remoteResults, ...localMatches];
        const seen = new Set<string>();
        return combined.filter((p) => {
          const key = `${p.name.toLowerCase()}-${p.lat.toFixed(3)}-${p.lng.toFixed(3)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
  } catch {
    // Offline fallback uses localMatches
  }

  return localMatches;
}

/** Call when the user commits to a place so it becomes searchable offline later. */
export function rememberPlace(place: LatLngPoint): void {
  rememberPlaces([place]);
}

// ---------------------------------------------------------------------------
// Routing (OSRM live → cached → offline direct bearing)
// ---------------------------------------------------------------------------

interface CachedRouteEntry {
  key: string;
  savedAt: number;
  routes: ComputedRoute[];
}

export function routeCacheKey(stops: LatLngPoint[], mode: TravelMode): string {
  return `${mode}|${stops.map((s) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`).join(';')}`;
}

function loadCachedRoutes(key: string): ComputedRoute[] | null {
  const entries = readJson<CachedRouteEntry[]>(ROUTE_CACHE_KEY, []);
  const hit = entries.find((e) => e.key === key);
  return hit ? hit.routes.map((r) => ({ ...r, source: 'cached' as const })) : null;
}

function saveCachedRoutes(key: string, routes: ComputedRoute[]): void {
  const entries = readJson<CachedRouteEntry[]>(ROUTE_CACHE_KEY, []).filter((e) => e.key !== key);
  entries.unshift({ key, savedAt: Date.now(), routes });
  // Route geometries can be large; keep the most recent few.
  let trimmed = entries.slice(0, 8);
  while (!writeJson(ROUTE_CACHE_KEY, trimmed) && trimmed.length > 1) {
    trimmed = trimmed.slice(0, -1);
  }
}

function mapOsrmManeuver(type: string, modifier?: string): ManeuverKind {
  if (type === 'depart') return 'depart';
  if (type === 'arrive') return 'arrive';
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') return 'roundabout';
  if (type === 'merge') return 'merge';
  if (type === 'on ramp' || type === 'off ramp' || type === 'fork') return 'ramp';
  switch (modifier) {
    case 'left':
      return 'turn-left';
    case 'right':
      return 'turn-right';
    case 'slight left':
      return 'slight-left';
    case 'slight right':
      return 'slight-right';
    case 'sharp left':
      return 'sharp-left';
    case 'sharp right':
      return 'sharp-right';
    case 'uturn':
      return 'uturn';
    default:
      return 'straight';
  }
}

function buildOsrmInstruction(
  st: Record<string, any>,
  legIndex: number,
  legCount: number,
  stops: LatLngPoint[]
): string {
  const type: string = st.maneuver?.type || 'continue';
  const modifier: string | undefined = st.maneuver?.modifier;
  const road = st.name || st.ref || '';
  const onto = road ? ` onto ${road}` : '';
  const dir = modifier ? ` ${modifier}` : '';

  switch (type) {
    case 'depart':
      return legIndex === 0
        ? `Depart from ${stops[0].name}${road ? ` via ${road}` : ''}`
        : `Continue from stop ${stops[legIndex].name}${road ? ` via ${road}` : ''}`;
    case 'arrive':
      return legIndex === legCount - 1
        ? `Arrive at ${stops[stops.length - 1].name}`
        : `Arrive at stop ${stops[legIndex + 1].name}`;
    case 'turn':
    case 'end of road':
      return `Turn${dir}${onto}`;
    case 'new name':
    case 'continue':
      return road ? `Continue on ${road}` : `Continue${dir}`;
    case 'merge':
      return `Merge${dir}${onto}`;
    case 'on ramp':
      return `Take the ramp${dir}${onto}`;
    case 'off ramp':
      return `Take the exit${dir}${onto}`;
    case 'fork':
      return `Keep${dir} at the fork${onto}`;
    case 'roundabout':
    case 'rotary': {
      const exit = st.maneuver?.exit ? ` and take exit ${st.maneuver.exit}` : '';
      return `Enter the roundabout${exit}${onto}`;
    }
    case 'roundabout turn':
      return `At the roundabout, turn${dir}${onto}`;
    default:
      return road ? `Continue on ${road}` : 'Continue';
  }
}

function osrmBaseUrls(mode: TravelMode): string[] {
  if (mode === 'walking') return [APP_CONFIG.osrmWalkingUrl];
  if (mode === 'cycling') return [APP_CONFIG.osrmCyclingUrl];
  return [APP_CONFIG.osrmDrivingUrl, APP_CONFIG.osrmDrivingFallbackUrl].filter(Boolean);
}

async function fetchOsrmRoutes(
  stops: LatLngPoint[],
  mode: TravelMode,
  incidents: TrafficIncident[]
): Promise<ComputedRoute[] | null> {
  const coordString = stops.map((s) => `${s.lng.toFixed(6)},${s.lat.toFixed(6)}`).join(';');
  const alternatives = stops.length === 2 ? 'true' : 'false';

  const baseUrls = osrmBaseUrls(mode);
  let data: any = null;

  for (const base of baseUrls) {
    try {
      const url = `${base}/${coordString}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;
      const res = await fetchWithTimeout(url, 7000);
      if (res.ok) {
        const json = await res.json();
        if (json && json.code === 'Ok' && Array.isArray(json.routes) && json.routes.length > 0) {
          data = json;
          break;
        }
      }
    } catch {
      // try next fallback server
    }
  }

  if (!data || !Array.isArray(data.routes) || data.routes.length === 0) {
    return null;
  }

  const labels = ['Fastest Route', 'Alternative Route', 'Alternative Route II'];

  return data.routes.slice(0, 3).map((osrmRt: Record<string, any>, idx: number) => {
    const coordinates: [number, number][] = (osrmRt.geometry?.coordinates || []).map(
      (pair: [number, number]) => [Number(pair[1].toFixed(6)), Number(pair[0].toFixed(6))]
    );

    const steps: RouteStep[] = [];
    const legs: Record<string, any>[] = Array.isArray(osrmRt.legs) ? osrmRt.legs : [];
    legs.forEach((leg, legIndex) => {
      const legSteps: Record<string, any>[] = Array.isArray(leg.steps) ? leg.steps : [];
      legSteps.forEach((st, stepIdx) => {
        const type: string = st.maneuver?.type || 'continue';
        // Intermediate "arrive"/"depart" pairs collapse into a single waypoint step.
        if (type === 'depart' && legIndex > 0) return;
        const isWaypointArrival = type === 'arrive' && legIndex < legs.length - 1;
        const loc: [number, number] = st.maneuver?.location || [stops[0].lng, stops[0].lat];
        steps.push({
          id: `osrm-${idx}-${legIndex}-${stepIdx}`,
          instruction: buildOsrmInstruction(st, legIndex, legs.length, stops),
          maneuver: isWaypointArrival ? 'waypoint' : mapOsrmManeuver(type, st.maneuver?.modifier),
          distanceKm: Number(((st.distance || 0) / 1000).toFixed(2)),
          durationMinutes: Number(((st.duration || 0) / 60).toFixed(1)),
          roadName: st.name || st.ref || '',
          lat: Number(loc[1]),
          lng: Number(loc[0]),
          trafficStatus: 'normal',
        });
      });
    });

    const totalDistanceKm = Number(((osrmRt.distance || 0) / 1000).toFixed(1));
    const rawMinutes = Math.max(1, Math.round((osrmRt.duration || 60) / 60));
    // Public OSRM has no transit profile; approximate with driving time + boarding overhead.
    const baseDurationMinutes = mode === 'transit' ? Math.round(rawMinutes * 1.35 + 8) : rawMinutes;

    const route: ComputedRoute = {
      id: `route-live-${mode}-${idx}-${routeCacheKey(stops, mode)}`,
      label: labels[idx] || `Route ${idx + 1}`,
      mode,
      source: 'live',
      stops,
      coordinates,
      segments: [],
      steps,
      totalDistanceKm,
      baseDurationMinutes,
      trafficDelayMinutes: 0,
      totalDurationMinutes: baseDurationMinutes,
      averageSpeedKmh: Number((totalDistanceKm / (baseDurationMinutes / 60)).toFixed(1)),
      ...estimateEnergy(mode, totalDistanceKm),
      affectedIncidents: [],
    };
    return applyTrafficToRoute(route, incidents);
  });
}

export interface RouteComputationResult {
  routes: ComputedRoute[];
  source: 'live' | 'cached' | 'offline-direct';
}

/**
 * Live OSRM road routes when online; otherwise the last cached road route for
 * the same stops; otherwise an honest offline direct-bearing route.
 */
export async function computeLiveOrOfflineRoutes(
  stops: LatLngPoint[],
  mode: TravelMode,
  incidents: TrafficIncident[],
  forceOffline: boolean
): Promise<ComputedRoute[]> {
  return (await computeRoutesDetailed(stops, mode, incidents, forceOffline)).routes;
}

export async function computeRoutesDetailed(
  stops: LatLngPoint[],
  mode: TravelMode,
  incidents: TrafficIncident[],
  forceOffline: boolean
): Promise<RouteComputationResult> {
  if (stops.length < 2) return { routes: [], source: 'offline-direct' };

  const key = routeCacheKey(stops, mode);
  const online = !forceOffline && isBrowserOnline() && typeof fetch !== 'undefined';

  if (online) {
    try {
      const live = await fetchOsrmRoutes(stops, mode, incidents);
      if (live && live.length > 0) {
        saveCachedRoutes(key, live);
        return { routes: live, source: 'live' };
      }
    } catch {
      // network failure → cached/offline below
    }
  }

  const cached = loadCachedRoutes(key);
  if (cached && cached.length > 0) {
    return { routes: cached.map((r) => applyTrafficToRoute(r, incidents)), source: 'cached' };
  }

  return { routes: [calculateMultiStopRoute(stops, mode, incidents, 0)], source: 'offline-direct' };
}

// ---------------------------------------------------------------------------
// Coverage helpers
// ---------------------------------------------------------------------------

export function isPointWithinPhilippines(lat: number, lng: number): boolean {
  return lat >= 4.4 && lat <= 21.3 && lng >= 116.5 && lng <= 127.0;
}

/**
 * Previously this clamped out-of-country fixes onto the PH border, which showed
 * users a fake location. It now returns the true position plus a coverage flag.
 */
export function normalizeGpsToPhilippines(
  lat: number,
  lng: number
): { lat: number; lng: number; withinPhilippines: boolean } {
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    withinPhilippines: isPointWithinPhilippines(lat, lng),
  };
}
