import {
  ComputedRoute,
  haversineKmPrecise,
  LatLngPoint,
  WeatherSnapshot,
} from './routingEngine';
import { fetchLocationWeather } from './weatherService';
import { offlineLocationLabel, reverseGeocodePhilippines } from './gpsAndGeocoding';

export type HazardSeverity = 'nominal' | 'caution' | 'warning' | 'severe';

export type HazardKind =
  | 'rain'
  | 'thunderstorm'
  | 'mountain-pass'
  | 'crosswind'
  | 'low-visibility'
  | 'extreme-heat'
  | 'slick-road';

export interface WeatherHazardItem {
  id: string;
  kind: HazardKind;
  severity: HazardSeverity;
  stationName: string;
  title: string;
  description: string;
  precaution: string;
}

export interface PredictedEtaWeather {
  tempC: number;
  feelsLikeC: number;
  condition: string;
  precipProbPct: number;
  windKmh: number;
  visibilityKm: number;
  timeLabel: string;
}

export interface CorridorStation {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  distanceAlongKm: number;
  pctOfRoute: number;
  etaMinutes: number;
  etaLabel: string;
  etaTimestamp: number;
  weather: WeatherSnapshot;
  predictedAtEta: PredictedEtaWeather;
  hazards: WeatherHazardItem[];
}

export interface RouteCorridorHazardReport {
  overallLevel: HazardSeverity;
  safetyScore: number; // 0 to 100
  summary: string;
  destinationEtaSummary: string;
  hazards: WeatherHazardItem[];
  precautionChecklist: string[];
  emergencyHotlines: { name: string; number: string; description: string }[];
}

// ---------------------------------------------------------------------------
// Polyline projection & along-route geometry
// ---------------------------------------------------------------------------

/**
 * Projects a point onto a line segment [a, b] in Cartesian approximation,
 * returning the perpendicular distance in km and the along-segment distance.
 */
function projectPointToSegment(
  p: LatLngPoint,
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): { distanceKm: number; alongKm: number; proj: { lat: number; lng: number } } {
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const segLenSq = dLat * dLat + dLng * dLng;

  if (segLenSq === 0) {
    const d = haversineKmPrecise(p, a);
    return { distanceKm: d, alongKm: 0, proj: a };
  }

  // Parameter t clamped to [0, 1]
  const t = Math.max(
    0,
    Math.min(1, ((p.lat - a.lat) * dLat + (p.lng - a.lng) * dLng) / segLenSq)
  );

  const proj = {
    lat: a.lat + t * dLat,
    lng: a.lng + t * dLng,
  };

  const distanceKm = haversineKmPrecise(p, proj);
  const alongKm = haversineKmPrecise(a, proj);

  return { distanceKm, alongKm, proj };
}

/**
 * Finds the minimum distance from point `p` to a polyline, plus the total
 * distance in km along the polyline from its start up to the projected point.
 */
export function distancePointToPolyline(
  p: LatLngPoint,
  polyline: [number, number][]
): { minDistanceKm: number; alongKm: number } {
  if (polyline.length === 0) {
    return { minDistanceKm: Infinity, alongKm: 0 };
  }
  if (polyline.length === 1) {
    const d = haversineKmPrecise(p, { lat: polyline[0][0], lng: polyline[0][1] });
    return { minDistanceKm: d, alongKm: 0 };
  }

  let minDistanceKm = Infinity;
  let bestAlongKm = 0;
  let accumulatedKm = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = { lat: polyline[i][0], lng: polyline[i][1] };
    const b = { lat: polyline[i + 1][0], lng: polyline[i + 1][1] };
    const segLen = haversineKmPrecise(a, b);

    const proj = projectPointToSegment(p, a, b);
    if (proj.distanceKm < minDistanceKm) {
      minDistanceKm = proj.distanceKm;
      bestAlongKm = accumulatedKm + proj.alongKm;
    }

    accumulatedKm += segLen;
  }

  return { minDistanceKm, alongKm: bestAlongKm };
}

// ---------------------------------------------------------------------------
// Weather Prediction at Arrival ETA
// ---------------------------------------------------------------------------

/**
 * Matches the arrival ETA timestamp to the closest hourly forecast slot in the
 * snapshot to predict conditions at the exact time of arrival.
 */
export function predictWeatherAtEta(
  snapshot: WeatherSnapshot,
  etaTimestamp: number
): PredictedEtaWeather {
  const etaDate = new Date(etaTimestamp);
  const etaHour = etaDate.getHours();

  // If snapshot has hourly array, match closest hour
  if (Array.isArray(snapshot.hourly) && snapshot.hourly.length > 0) {
    let bestSlot = snapshot.hourly[0];
    let minDiff = Infinity;

    for (const hr of snapshot.hourly) {
      if (hr.timeLabel === 'Now') {
        const nowHour = new Date().getHours();
        const diff = Math.abs(etaHour - nowHour);
        if (diff < minDiff) {
          minDiff = diff;
          bestSlot = hr;
        }
      } else {
        const parsedHour = parseInt(hr.timeLabel.slice(0, 2), 10);
        if (!isNaN(parsedHour)) {
          const diff = Math.min(
            Math.abs(etaHour - parsedHour),
            24 - Math.abs(etaHour - parsedHour)
          );
          if (diff < minDiff) {
            minDiff = diff;
            bestSlot = hr;
          }
        }
      }
    }

    const timeLabel = etaDate.toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      tempC: bestSlot.tempC,
      feelsLikeC:
        bestSlot.tempC >= 29 ? bestSlot.tempC + 3 : bestSlot.tempC,
      condition: bestSlot.condition,
      precipProbPct: bestSlot.precipProbPct,
      windKmh: bestSlot.windKmh,
      visibilityKm:
        bestSlot.condition === 'Fog'
          ? 3.5
          : bestSlot.condition === 'Heavy Rain'
          ? 4.5
          : snapshot.visibilityKm,
      timeLabel,
    };
  }

  // Fallback to snapshot's current readings
  return {
    tempC: snapshot.tempC,
    feelsLikeC: snapshot.feelsLikeC,
    condition: snapshot.condition,
    precipProbPct: snapshot.precipProbPct,
    windKmh: snapshot.windKmh,
    visibilityKm: snapshot.visibilityKm,
    timeLabel: etaDate.toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

// ---------------------------------------------------------------------------
// Weather Hazards & Precautions Evaluator
// ---------------------------------------------------------------------------

/**
 * Checks whether a station is along a recognized mountain corridor (such as the
 * Sarangani - Davao del Sur rolling pass between Malungon and Sulop/Padada, or
 * Benguet/Cordillera, or Bukidnon highlands).
 */
function isMountainCorridorStation(station: LatLngPoint): boolean {
  const name = (station.name + ' ' + (station.region || '')).toLowerCase();
  if (
    name.includes('malungon') ||
    name.includes('malandag') ||
    name.includes('sulop') ||
    name.includes('cordillera') ||
    name.includes('baguio') ||
    name.includes('benguet') ||
    name.includes('bukidnon') ||
    name.includes('kennon') ||
    name.includes('marcos hwy')
  ) {
    return true;
  }
  // Geographical bounding for Sarangani-Davao del Sur ridge (Malungon pass: ~6.2°N - 6.55°N)
  return station.lat >= 6.2 && station.lat <= 6.55 && station.lng >= 125.18 && station.lng <= 125.32;
}

/**
 * Evaluates weather hazards for a specific station along the route.
 */
export function evaluateStationHazards(
  station: LatLngPoint,
  predicted: PredictedEtaWeather
): WeatherHazardItem[] {
  const hazards: WeatherHazardItem[] = [];
  const isMountain = isMountainCorridorStation(station);

  // 1. Rain and Slick Road / Hydroplaning
  if (predicted.condition === 'Heavy Rain' || predicted.precipProbPct >= 70) {
    hazards.push({
      id: `${station.name}-heavy-rain`,
      kind: 'rain',
      severity: 'warning',
      stationName: station.name,
      title: 'Heavy Rain & Standing Water Alert',
      description: `High precipitation (${predicted.precipProbPct}%) causing water pooling and severe spray on asphalt.`,
      precaution:
        'Increase following distance to 4 seconds. Disengage cruise control and cap speed 20 km/h below highway limit.',
    });
  } else if (
    predicted.condition === 'Light Rain' ||
    predicted.precipProbPct >= 35
  ) {
    hazards.push({
      id: `${station.name}-slick-road`,
      kind: 'slick-road',
      severity: 'caution',
      stationName: station.name,
      title: 'Wet Asphalt & Reduced Braking Traction',
      description: `Scattered rain showers (${predicted.precipProbPct}%) creating slick pavement surfaces.`,
      precaution:
        'Avoid abrupt braking or hard cornering. Watch for slippery painted highway centerlines.',
    });
  }

  // 2. Thunderstorm / Gusts
  if (
    predicted.condition === 'Heavy Rain' &&
    predicted.windKmh >= 28
  ) {
    hazards.push({
      id: `${station.name}-thunderstorm`,
      kind: 'thunderstorm',
      severity: 'severe',
      stationName: station.name,
      title: 'Thunderstorm & Severe Wind Gusts',
      description: `Strong squalls with gusts up to ${predicted.windKmh} km/h and reduced visibility.`,
      precaution:
        'Turn on low-beam headlights immediately. Do not park under large trees or low-hanging power lines.',
    });
  }

  // 3. Mountain Pass & Landslide Risk (e.g. Malungon - Sulop ridge)
  if (isMountain && predicted.precipProbPct >= 40) {
    hazards.push({
      id: `${station.name}-mountain-hazard`,
      kind: 'mountain-pass',
      severity: predicted.precipProbPct >= 70 ? 'severe' : 'caution',
      stationName: station.name,
      title: 'Mountain Highway & Runoff Caution',
      description:
        'Hilly mountain pass with sharp winding grades. Heavy rainfall elevates risk of mud runoff and loose rockfalls.',
      precaution:
        'Scan cuttings and hillside slopes for falling debris. Watch for slow-moving overloaded cargo trucks on climbs.',
    });
  }

  // 4. Strong Crosswinds
  if (predicted.windKmh >= 32) {
    hazards.push({
      id: `${station.name}-crosswind`,
      kind: 'crosswind',
      severity: predicted.windKmh >= 45 ? 'warning' : 'caution',
      stationName: station.name,
      title: 'Strong Highway Crosswinds',
      description: `Sustained winds of ${predicted.windKmh} km/h along open highway stretches and elevated causeways.`,
      precaution:
        'Motorcycles and high-profile vehicles maintain firm two-handed grip; provide wide berth when overtaking haulers.',
    });
  }

  // 5. Low Visibility / Fog
  if (predicted.visibilityKm <= 5.0 || predicted.condition === 'Fog') {
    hazards.push({
      id: `${station.name}-visibility`,
      kind: 'low-visibility',
      severity: predicted.visibilityKm <= 2.5 ? 'warning' : 'caution',
      stationName: station.name,
      title: 'Reduced Horizon Visibility',
      description: `Corridor visibility drops to ${predicted.visibilityKm} km due to atmospheric moisture.`,
      precaution:
        'Switch to low-beam headlights or fog lamps. Do not use high beams, which reflect off fog droplets.',
    });
  }

  // 6. Extreme Heat / High Surface Temperature
  if (predicted.tempC >= 33 || predicted.feelsLikeC >= 38) {
    hazards.push({
      id: `${station.name}-extreme-heat`,
      kind: 'extreme-heat',
      severity: predicted.feelsLikeC >= 41 ? 'warning' : 'caution',
      stationName: station.name,
      title: 'High Pavement Heat & Heat Index',
      description: `Ambient ${predicted.tempC}°C (Feels like ${predicted.feelsLikeC}°C). Hot asphalt accelerates tire pressure expansion.`,
      precaution:
        'Check tire cold inflation and radiator coolant levels. Stay well-hydrated to avoid driver fatigue.',
    });
  }

  return hazards;
}

// ---------------------------------------------------------------------------
// Corridor Stations Extraction
// ---------------------------------------------------------------------------

/**
 * Identifies all municipalities, cities, and key barangays crossed by a route,
 * sorted in chronological order of travel from Origin to Destination.
 */
export async function extractRouteCorridorStations(
  route: ComputedRoute,
  candidatePlaces: LatLngPoint[],
  isOffline = false
): Promise<CorridorStation[]> {
  if (route.stops.length < 2 || route.coordinates.length < 2) {
    return [];
  }

  const originStop = route.stops[0];
  const destStop = route.stops[route.stops.length - 1];
  const totalKm = route.totalDistanceKm;
  const totalDurationMin = route.totalDurationMinutes;

  // 1. Candidate intermediate towns along highway corridor (within 5.5 km of polyline)
  interface RawCandidate {
    point: LatLngPoint;
    alongKm: number;
    perpKm: number;
  }

  const found: RawCandidate[] = [];

  for (const place of candidatePlaces) {
    // Skip if identical or extremely close to origin/dest
    const dOrigin = haversineKmPrecise(place, originStop);
    const dDest = haversineKmPrecise(place, destStop);
    if (dOrigin < 2.5 || dDest < 2.5) continue;

    const { minDistanceKm, alongKm } = distancePointToPolyline(
      place,
      route.coordinates
    );

    // Within 5.5 km of the highway polyline and between start & finish
    if (
      minDistanceKm <= 5.5 &&
      alongKm > 2.0 &&
      alongKm < totalKm - 2.0
    ) {
      found.push({
        point: place,
        alongKm,
        perpKm: minDistanceKm,
      });
    }
  }

  // 2. Sort by along-route distance
  found.sort((a, b) => a.alongKm - b.alongKm);

  // 3. Deduplicate towns that are too close along the highway (< 3.8 km apart)
  const filtered: RawCandidate[] = [];
  for (const c of found) {
    const prev = filtered[filtered.length - 1];
    if (!prev || Math.abs(c.alongKm - prev.alongKm) >= 3.8) {
      filtered.push(c);
    } else if (c.perpKm < prev.perpKm) {
      // Replace with the one that is closer to the actual highway line
      filtered[filtered.length - 1] = c;
    }
  }

  // 4. Build complete station sequence: Origin -> Intermediate Towns -> Destination
  const stationsToResolve: {
    point: LatLngPoint;
    alongKm: number;
    role: 'origin' | 'waypoint' | 'destination';
  }[] = [
    { point: originStop, alongKm: 0, role: 'origin' },
    ...filtered.map((f) => ({ point: f.point, alongKm: f.alongKm, role: 'waypoint' as const })),
    { point: destStop, alongKm: totalKm, role: 'destination' },
  ];

  // 5. Fetch weather and predict conditions for each station at its ETA
  const now = Date.now();
  const stationPromises = stationsToResolve.map(async (st, idx) => {
    const fraction = Math.min(1, Math.max(0, st.alongKm / Math.max(0.1, totalKm)));
    const etaMinutes = Math.round(fraction * totalDurationMin);
    const etaTimestamp = now + etaMinutes * 60 * 1000;

    let etaLabel = 'Departure';
    if (st.role === 'destination') {
      etaLabel = `Arrival in ${etaMinutes}m (${new Date(etaTimestamp).toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
      })})`;
    } else if (etaMinutes > 0) {
      etaLabel = `+${etaMinutes}m (${new Date(etaTimestamp).toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
      })})`;
    }

    const weather = await fetchLocationWeather(st.point, isOffline);
    const predicted = predictWeatherAtEta(weather, etaTimestamp);
    const hazards = evaluateStationHazards(st.point, predicted);

    const station: CorridorStation = {
      id: `station-${idx}-${st.point.lat.toFixed(3)}-${st.point.lng.toFixed(3)}`,
      name: st.point.name,
      region: st.point.region || 'Philippines',
      lat: st.point.lat,
      lng: st.point.lng,
      distanceAlongKm: Number(st.alongKm.toFixed(1)),
      pctOfRoute: Math.round(fraction * 100),
      etaMinutes,
      etaLabel,
      etaTimestamp,
      weather,
      predictedAtEta: predicted,
      hazards,
    };

    return station;
  });

  return Promise.all(stationPromises);
}

// ---------------------------------------------------------------------------
// Route Corridor Hazard Report
// ---------------------------------------------------------------------------

/**
 * Aggregates all hazards found along the corridor into an overall road safety
 * report with driver precautions and emergency hotlines.
 */
export function evaluateRouteCorridorHazards(
  stations: CorridorStation[],
  destinationName: string
): RouteCorridorHazardReport {
  const allHazards: WeatherHazardItem[] = [];
  stations.forEach((s) => allHazards.push(...s.hazards));

  // Determine overall severity level
  let overallLevel: HazardSeverity = 'nominal';
  if (allHazards.some((h) => h.severity === 'severe')) {
    overallLevel = 'severe';
  } else if (allHazards.some((h) => h.severity === 'warning')) {
    overallLevel = 'warning';
  } else if (allHazards.some((h) => h.severity === 'caution')) {
    overallLevel = 'caution';
  }

  // Safety Score: 100 base, deductions for hazards
  let safetyScore = 100;
  for (const h of allHazards) {
    if (h.severity === 'severe') safetyScore -= 20;
    else if (h.severity === 'warning') safetyScore -= 10;
    else if (h.severity === 'caution') safetyScore -= 4;
  }
  safetyScore = Math.max(25, Math.min(100, safetyScore));

  // Summary message
  let summary = 'Optimal and clear driving conditions across all corridor municipalities.';
  const rainStations = stations.filter(
    (s) => s.predictedAtEta.condition === 'Heavy Rain' || s.predictedAtEta.precipProbPct >= 40
  );
  if (rainStations.length > 0) {
    const names = rainStations.map((s) => s.name.replace(/ Municipal.*| Town.*| Poblacion.*/i, '')).join(', ');
    summary = `Rain showers and wet pavement expected along ${names}. Exercise caution against hydroplaning.`;
  } else if (overallLevel === 'caution') {
    summary = 'Mild atmospheric variations along corridor. Maintain standard highway speeds.';
  }

  // Destination ETA forecast summary
  const destStation = stations[stations.length - 1];
  let destinationEtaSummary = `Predicted arrival at ${destinationName}: Clear & nominal.`;
  if (destStation) {
    const pred = destStation.predictedAtEta;
    destinationEtaSummary = `Arriving in ${destStation.name} at ${pred.timeLabel}: ${pred.tempC}°C, ${pred.condition} with ${pred.precipProbPct}% rain chance.`;
  }

  // Driver precaution checklist
  const precautions = new Set<string>();

  if (overallLevel === 'nominal') {
    precautions.add('Standard defensive driving rules apply. Wear seatbelts/helmets at all times.');
    precautions.add('Maintain posted highway speed limits and observe lane markings.');
    precautions.add('Enjoy safe driving conditions across all corridor municipalities.');
  } else {
    precautions.add('Reduce cruising speed by 15–20 km/h on wet asphalt and during rain showers.');
    precautions.add('Double following distance to 4 seconds to compensate for reduced braking friction.');
    precautions.add('Turn on low-beam headlights so oncoming vehicles and haulers can spot you easily.');

    if (allHazards.some((h) => h.kind === 'mountain-pass')) {
      precautions.add(
        'Mountain Highway Pass: Watch for loose rocks, gravel runoff, and slow freight haulers on winding grades.'
      );
    }
    if (allHazards.some((h) => h.kind === 'crosswind')) {
      precautions.add(
        'Crosswind Caution: Maintain a firm two-handed grip on the steering wheel/handlebars over open bridges.'
      );
    }
    if (allHazards.some((h) => h.kind === 'extreme-heat')) {
      precautions.add(
        'Heat Index Advisory: Check cold tire pressure before highway cruising; keep engine coolant topped up.'
      );
    }
    precautions.add(
      'Motorcycle & Tricycle Riders: Wear high-visibility rain gear and avoid riding on wet painted white lines.'
    );
  }

  const emergencyHotlines = [
    { name: 'Philippine National Emergency', number: '911', description: 'Police, Fire, Ambulance & Rescue' },
    { name: 'Philippine Red Cross', number: '143', description: 'Medical Emergency & Disaster Assistance' },
    {
      name: 'NDRRMC Disaster Center',
      number: '(02) 8911-1406',
      description: 'National Disaster Risk Reduction & Management',
    },
    {
      name: 'Digos City CDRRMO / Rescue',
      number: '(082) 553-2900',
      description: 'Local Davao del Sur Emergency Hotline',
    },
    {
      name: 'Malungon MDRRMO / Rescue',
      number: '(083) 508-8000',
      description: 'Sarangani Corridor Highway Assistance',
    },
  ];

  return {
    overallLevel,
    safetyScore,
    summary,
    destinationEtaSummary,
    hazards: allHazards,
    precautionChecklist: Array.from(precautions),
    emergencyHotlines,
  };
}
