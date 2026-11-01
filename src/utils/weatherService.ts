import { LatLngPoint, WeatherSnapshot } from './routingEngine';
import { APP_CONFIG, fetchWithTimeout, isBrowserOnline, readJson, writeJson } from './config';

const WEATHER_STORAGE_KEY = 'wayfarer_weather_cache_v2';
/** Live forecasts are reused for this long before refetching. */
const LIVE_TTL_MS = 30 * 60 * 1000;
/** Persisted forecasts remain useful offline for up to this long. */
const OFFLINE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const weatherMemoryCache = new Map<string, WeatherSnapshot>();

function cacheKeyFor(point: { lat: number; lng: number }): string {
  return `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`;
}

function loadPersisted(): Record<string, WeatherSnapshot> {
  return readJson<Record<string, WeatherSnapshot>>(WEATHER_STORAGE_KEY, {});
}

function persist(key: string, snapshot: WeatherSnapshot): void {
  const all = loadPersisted();
  all[key] = snapshot;
  const entries = Object.entries(all)
    .sort((a, b) => (b[1].fetchedAt || 0) - (a[1].fetchedAt || 0))
    .slice(0, 40);
  writeJson(WEATHER_STORAGE_KEY, Object.fromEntries(entries));
}

function mapWmoCodeToCondition(code: number): WeatherSnapshot['condition'] {
  if (code === 0 || code === 1) return 'Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Fog';
  if (code >= 51 && code <= 63) return 'Light Rain';
  if (code >= 65 && code <= 67) return 'Heavy Rain';
  if (code >= 71 && code <= 77) return 'Mountain Snow';
  if (code >= 80 && code <= 81) return 'Light Rain';
  if (code === 82) return 'Heavy Rain';
  if (code >= 95) return 'Heavy Rain';
  return 'Partly Cloudy';
}

function weekdayLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'Today';
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-PH', { weekday: 'short' });
}

/**
 * Climatology-based estimate used only when no live or cached forecast exists
 * (e.g. first launch while offline). Clearly flagged as `estimated` in the UI.
 */
export function buildDeterministicWeatherSnapshot(point: LatLngPoint): WeatherSnapshot {
  const latSeed = Math.abs(Math.round(point.lat * 100));
  const lngSeed = Math.abs(Math.round(point.lng * 100));
  const combined = (latSeed + lngSeed) % 100;

  // Baguio (~16.4N, Cordillera) and Tagaytay (~14.1N) are cooler Philippine highlands.
  const isCordillera = point.lat > 16.0 && point.lat < 17.6 && point.lng > 120.4 && point.lng < 121.3;
  const isTagaytayRidge = point.lat > 14.05 && point.lat < 14.18 && point.lng > 120.85 && point.lng < 121.05;
  const isMindanao = point.lat < 9.8;

  const baseTempC = isCordillera ? 19 : isTagaytayRidge ? 23 : 30;
  const tempC = baseTempC + ((combined % 3) - 1);
  const feelsLikeC = isCordillera || isTagaytayRidge ? tempC : tempC + 3;

  const condition: WeatherSnapshot['condition'] =
    isTagaytayRidge && combined % 2 === 1 ? 'Light Rain' : 'Partly Cloudy';

  const windKmh = isTagaytayRidge ? 24 + (combined % 10) : 12 + (combined % 10);
  const precipProbPct = isCordillera ? 40 : isTagaytayRidge ? 35 : isMindanao ? 35 : 25;
  const humidityPct = isCordillera ? 82 : 76;
  const visibilityKm = isCordillera || isTagaytayRidge ? 10 : 14;

  const nowHour = new Date().getHours();
  const hourly = [0, 2, 4, 6, 8, 10].map((offset, idx) => {
    const hour = (nowHour + offset) % 24;
    // Diurnal curve peaking ~14:00.
    const diurnal = Math.round(Math.cos(((hour - 14) / 24) * 2 * Math.PI) * 3);
    return {
      timeLabel: idx === 0 ? 'Now' : `${String(hour).padStart(2, '0')}:00`,
      tempC: baseTempC + diurnal,
      precipProbPct: Math.min(95, Math.max(5, precipProbPct + (hour >= 13 && hour <= 18 ? 15 : 0))),
      windKmh: Math.max(5, windKmh + (idx % 2 === 0 ? 2 : -2)),
      condition,
    };
  });

  const daily = [0, 1, 2, 3, 4].map((idx) => ({
    dayLabel: weekdayLabel(idx),
    highC: baseTempC + 3,
    lowC: baseTempC - 5,
    precipProbPct: Math.min(90, Math.max(5, precipProbPct + ((idx * 11) % 20) - 10)),
    condition,
  }));

  return {
    locationName: point.name,
    lat: point.lat,
    lng: point.lng,
    tempC,
    feelsLikeC,
    condition,
    windKmh,
    humidityPct,
    precipProbPct,
    visibilityKm,
    uvIndex: isCordillera ? 6 : 8,
    estimated: true,
    fetchedAt: Date.now(),
    hourly,
    daily,
  };
}

async function fetchLiveWeather(point: LatLngPoint): Promise<WeatherSnapshot | null> {
  const url = `${APP_CONFIG.weatherUrl}?latitude=${point.lat.toFixed(4)}&longitude=${point.lng.toFixed(
    4
  )}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,visibility,uv_index&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5`;

  const res = await fetchWithTimeout(url, 6000);
  if (!res.ok) return null;
  const data = await res.json();
  const current = data.current || {};
  const condition = mapWmoCodeToCondition(current.weather_code ?? 1);
  const tempC = Math.round(current.temperature_2m ?? 28);
  const feelsLikeC = Math.round(current.apparent_temperature ?? tempC);
  const windKmh = Math.round(current.wind_speed_10m ?? 10);
  const humidityPct = Math.round(current.relative_humidity_2m ?? 70);

  const hourlyTimes: string[] = data.hourly?.time || [];
  const hourlyTemps: number[] = data.hourly?.temperature_2m || [];
  const hourlyPrecip: number[] = data.hourly?.precipitation_probability || [];
  const hourlyWind: number[] = data.hourly?.wind_speed_10m || [];
  const hourlyCodes: number[] = data.hourly?.weather_code || [];

  // Hourly arrays start at local midnight — align to the current hour.
  const currentTime: string | undefined = current.time;
  let startIdx = currentTime
    ? hourlyTimes.findIndex((t) => t.slice(0, 13) === currentTime.slice(0, 13))
    : -1;
  if (startIdx < 0) startIdx = Math.min(new Date().getHours(), Math.max(0, hourlyTimes.length - 1));

  const precipProbPct = Math.round(
    current.precipitation_probability ?? hourlyPrecip[startIdx] ?? 15
  );

  const hourly = [0, 2, 4, 6, 8, 10].map((offset, idx) => {
    const i = startIdx + offset;
    const label = hourlyTimes[i] ? hourlyTimes[i].slice(11, 16) : `+${offset}h`;
    return {
      timeLabel: idx === 0 ? 'Now' : label,
      tempC: Math.round(hourlyTemps[i] ?? tempC),
      precipProbPct: Math.round(hourlyPrecip[i] ?? precipProbPct),
      windKmh: Math.round(hourlyWind[i] ?? windKmh),
      condition: mapWmoCodeToCondition(hourlyCodes[i] ?? 1),
    };
  });

  const dailyTimes: string[] = data.daily?.time || [];
  const dailyMax: number[] = data.daily?.temperature_2m_max || [];
  const dailyMin: number[] = data.daily?.temperature_2m_min || [];
  const dailyPrecip: number[] = data.daily?.precipitation_probability_max || [];
  const dailyCodes: number[] = data.daily?.weather_code || [];

  const daily = [0, 1, 2, 3, 4].map((idx) => ({
    dayLabel:
      idx === 0
        ? 'Today'
        : dailyTimes[idx]
        ? new Date(`${dailyTimes[idx]}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'short' })
        : weekdayLabel(idx),
    highC: Math.round(dailyMax[idx] ?? tempC + 3),
    lowC: Math.round(dailyMin[idx] ?? tempC - 4),
    precipProbPct: Math.round(dailyPrecip[idx] ?? precipProbPct),
    condition: mapWmoCodeToCondition(dailyCodes[idx] ?? 1),
  }));

  const visibilityKm =
    typeof current.visibility === 'number'
      ? Number((current.visibility / 1000).toFixed(1))
      : condition === 'Fog'
      ? 3.8
      : condition === 'Heavy Rain'
      ? 4.5
      : 16.0;

  return {
    locationName: point.name,
    lat: point.lat,
    lng: point.lng,
    tempC,
    feelsLikeC,
    condition,
    windKmh,
    humidityPct,
    precipProbPct,
    visibilityKm,
    uvIndex: Math.round(current.uv_index ?? 5),
    estimated: false,
    fetchedAt: Date.now(),
    hourly,
    daily,
  };
}

/**
 * Live forecast (Open-Meteo) → recent cached forecast → climatology estimate.
 * Never throws.
 */
export async function fetchLocationWeather(
  point: LatLngPoint,
  forceOffline = false,
  forceRefresh = false
): Promise<WeatherSnapshot> {
  const key = cacheKeyFor(point);
  const now = Date.now();
  const memo = weatherMemoryCache.get(key);
  const persisted = memo || loadPersisted()[key];

  const isFreshLive =
    persisted && !persisted.estimated && now - (persisted.fetchedAt || 0) < LIVE_TTL_MS;
  if (isFreshLive && !forceRefresh) {
    return { ...persisted, locationName: point.name, lat: point.lat, lng: point.lng };
  }

  if (!forceOffline && isBrowserOnline() && typeof fetch !== 'undefined') {
    try {
      const live = await fetchLiveWeather(point);
      if (live) {
        weatherMemoryCache.set(key, live);
        persist(key, live);
        return live;
      }
    } catch {
      // fall back below
    }
  }

  if (persisted && !persisted.estimated && now - (persisted.fetchedAt || 0) < OFFLINE_MAX_AGE_MS) {
    return { ...persisted, locationName: point.name, lat: point.lat, lng: point.lng };
  }

  // Estimates are *not* cached so the next online attempt fetches real data.
  return buildDeterministicWeatherSnapshot(point);
}
