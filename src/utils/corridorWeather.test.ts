import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distancePointToPolyline,
  predictWeatherAtEta,
  evaluateStationHazards,
  extractRouteCorridorStations,
  evaluateRouteCorridorHazards,
} from './corridorWeather';
import { calculateMultiStopRoute, LatLngPoint, WeatherSnapshot } from './routingEngine';
import { KNOWN_LOCATIONS } from './travelData';

test('distancePointToPolyline accurately measures distance to a line', () => {
  const polyline: [number, number][] = [
    [6.2575, 125.2633], // Malungon
    [6.6264, 125.3444], // Sulop
    [6.7570, 125.3564], // Digos
  ];

  // Point right next to Sulop
  const sulopPoint: LatLngPoint = { name: 'Sulop', lat: 6.6264, lng: 125.3444 };
  const res = distancePointToPolyline(sulopPoint, polyline);
  assert.ok(res.minDistanceKm < 0.05, 'Point exactly on polyline should have ~0 distance');
  assert.ok(res.alongKm > 30, 'Along km should be positive and halfway along the polyline');

  // Point far away (e.g. Manila)
  const manilaPoint: LatLngPoint = { name: 'Manila', lat: 14.5826, lng: 120.9787 };
  const resManila = distancePointToPolyline(manilaPoint, polyline);
  assert.ok(resManila.minDistanceKm > 800, 'Manila is >800 km away from Davao del Sur polyline');
});

test('predictWeatherAtEta extracts the predicted conditions for the arrival hour', () => {
  const fakeSnapshot: WeatherSnapshot = {
    locationName: 'Digos City',
    lat: 6.757,
    lng: 125.3564,
    tempC: 30,
    feelsLikeC: 34,
    condition: 'Partly Cloudy',
    windKmh: 12,
    humidityPct: 75,
    precipProbPct: 20,
    visibilityKm: 16,
    uvIndex: 7,
    hourly: [
      { timeLabel: 'Now', tempC: 30, precipProbPct: 20, windKmh: 12, condition: 'Partly Cloudy' },
      { timeLabel: '14:00', tempC: 32, precipProbPct: 35, windKmh: 15, condition: 'Partly Cloudy' },
      { timeLabel: '16:00', tempC: 28, precipProbPct: 65, windKmh: 20, condition: 'Light Rain' },
      { timeLabel: '18:00', tempC: 26, precipProbPct: 80, windKmh: 25, condition: 'Heavy Rain' },
    ],
    daily: [],
  };

  const etaNow = Date.now();
  const predNow = predictWeatherAtEta(fakeSnapshot, etaNow);
  assert.equal(predNow.tempC, 30);
  assert.equal(predNow.condition, 'Partly Cloudy');
});

test('evaluateStationHazards flags rain, slick roads and mountain passes', () => {
  const malungonStation: LatLngPoint = {
    name: 'Malungon Municipal Hall',
    region: 'Malungon, Sarangani',
    lat: 6.2575,
    lng: 125.2633,
  };

  const rainyWeather = {
    tempC: 27,
    feelsLikeC: 30,
    condition: 'Heavy Rain' as const,
    precipProbPct: 85,
    windKmh: 35,
    visibilityKm: 4.0,
    timeLabel: '14:30',
  };

  const hazards = evaluateStationHazards(malungonStation, rainyWeather);
  assert.ok(hazards.length >= 2, 'Should flag heavy rain, mountain pass and crosswind hazards');
  assert.ok(hazards.some((h) => h.kind === 'rain' && h.severity === 'warning'));
  assert.ok(hazards.some((h) => h.kind === 'mountain-pass'));
  assert.ok(hazards.some((h) => h.kind === 'crosswind'));
});

test('extractRouteCorridorStations extracts Sulop and en-route municipalities between Malungon and Digos', async () => {
  const stops: LatLngPoint[] = [
    { name: 'Malungon Municipal Hall', region: 'Malungon, Sarangani', lat: 6.2575, lng: 125.2633 },
    { name: 'Digos City Rizal Park', region: 'Digos City, Davao del Sur', lat: 6.7570, lng: 125.3564 },
  ];

  const route = calculateMultiStopRoute(stops, 'driving', [], 0);

  // Extract corridor stations with offline mode enabled for deterministic test
  const stations = await extractRouteCorridorStations(route, KNOWN_LOCATIONS, true);

  assert.ok(stations.length >= 3, `Expected at least 3 stations, got ${stations.length}`);

  // Origin must be first
  assert.ok(stations[0].name.includes('Malungon'));
  assert.equal(stations[0].distanceAlongKm, 0);

  // Destination must be last
  assert.ok(stations[stations.length - 1].name.includes('Digos'));

  // Intermediate stations must include Sulop
  const stationNames = stations.map((s) => s.name);
  assert.ok(
    stationNames.some((n) => n.includes('Sulop')),
    `Expected Sulop to be in corridor stations: ${stationNames.join(', ')}`
  );

  // Sequence must be monotonically increasing in distance
  for (let i = 0; i < stations.length - 1; i++) {
    assert.ok(
      stations[i].distanceAlongKm <= stations[i + 1].distanceAlongKm,
      `Stations should be ordered by alongKm: ${stations[i].name} (${stations[i].distanceAlongKm}) vs ${stations[i + 1].name} (${stations[i + 1].distanceAlongKm})`
    );
  }

  // Report evaluation
  const report = evaluateRouteCorridorHazards(stations, 'Digos City');
  assert.ok(report.safetyScore >= 0 && report.safetyScore <= 100);
  assert.ok(report.destinationEtaSummary.includes('Digos'));
  assert.ok(report.precautionChecklist.length >= 1);
  assert.ok(report.emergencyHotlines.some((h) => h.number === '911'));
});
