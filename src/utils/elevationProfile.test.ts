import test from 'node:test';
import assert from 'node:assert';
import { computeRouteElevationProfile, estimatePhilippineElevation } from './elevationProfile';
import { ComputedRoute } from './routingEngine';

test('estimatePhilippineElevation returns higher altitudes for mountain regions than sea level', () => {
  // Mount Apo foothills
  const apoElev = estimatePhilippineElevation(6.98, 125.27);
  // Davao City coastal port
  const coastalElev = estimatePhilippineElevation(7.07, 125.64);

  assert.ok(apoElev > 500, `Expected Apo elevation > 500m, got ${apoElev}`);
  assert.ok(coastalElev < 150, `Expected coastal elevation < 150m, got ${coastalElev}`);
});

test('computeRouteElevationProfile generates sequential distance-elevation points and gain', () => {
  const dummyRoute: ComputedRoute = {
    id: 'elev-test-route',
    label: 'Malungon to Digos',
    mode: 'driving',
    source: 'live',
    totalDistanceKm: 55,
    baseDurationMinutes: 65,
    totalDurationMinutes: 65,
    trafficDelayMinutes: 0,
    averageSpeedKmh: 50,
    fuelOrEnergyEstimate: '3.5L',
    co2Kg: 8.2,
    coordinates: [
      [6.38, 125.27],
      [6.45, 125.28],
      [6.55, 125.30],
      [6.65, 125.32],
      [6.75, 125.35],
    ],
    steps: [],
    segments: [],
    stops: [],
    affectedIncidents: [],
  };

  const profile = computeRouteElevationProfile(dummyRoute, 5);
  assert.ok(profile.points.length >= 4);
  assert.strictEqual(profile.points[0].distanceKm, 0);
  assert.ok(profile.maxElevationM >= profile.minElevationM);
  assert.ok(profile.totalGainM >= 0);
});
