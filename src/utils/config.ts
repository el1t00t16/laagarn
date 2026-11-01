/**
 * Runtime service endpoints. All are overridable at build time through Vite env
 * variables (see `.env.example`) so production deployments can point at
 * self-hosted or commercial providers that permit their traffic volume.
 */
const env: Record<string, string | undefined> =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env) ||
  {};

function pick(key: string, fallback: string): string {
  const value = env[key];
  return value && value.trim().length > 0 ? value.trim().replace(/\/+$/, '') : fallback;
}

export const APP_CONFIG = {
  /** Raster tile template. `{s}` is optional; `{z}/{x}/{y}` are required. */
  tileUrl: pick('VITE_TILE_URL', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  tileAttribution:
    env.VITE_TILE_ATTRIBUTION ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  /** OSRM-compatible routing servers, per travel profile. */
  osrmDrivingUrl: pick('VITE_OSRM_DRIVING_URL', 'https://router.project-osrm.org/route/v1/driving'),
  osrmCyclingUrl: pick(
    'VITE_OSRM_CYCLING_URL',
    'https://routing.openstreetmap.de/routed-bike/route/v1/bike'
  ),
  osrmWalkingUrl: pick(
    'VITE_OSRM_WALKING_URL',
    'https://routing.openstreetmap.de/routed-foot/route/v1/foot'
  ),
  nominatimUrl: pick('VITE_NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
  weatherUrl: pick('VITE_WEATHER_URL', 'https://api.open-meteo.com/v1/forecast'),
};

export function buildTileUrl(z: number, x: number, y: number): string {
  const subdomains = ['a', 'b', 'c'];
  return APP_CONFIG.tileUrl
    .replace('{s}', subdomains[Math.abs(x + y) % subdomains.length])
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', '');
}

/** Escapes untrusted text before it is interpolated into Leaflet HTML popups. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** fetch() with a hard timeout that never throws on abort cleanup. */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Returns `false` when the write failed (quota exceeded / private mode). */
export function writeJson(key: string, value: unknown): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Persistence is best-effort.
    return false;
  }
}
