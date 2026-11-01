import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRouteIndex,
  computeRouteProgress,
  directBearingGuidance,
  buildSpokenInstruction,
} from './navigation';
import { calculateMultiStopRoute, LatLngPoint } from './routingEngine';

const manilaOrigin: LatLngPoint = {
  name: 'Manila Rizal Park',
  lat: 14.5826,
  lng: 120.9787,
};

const makatiDest: LatLngPoint = {
  name: 'Makati Ayala Center',
  lat: 14.5509,
  lng: 121.0244,
};

test('buildRouteIndex creates accurate along-route distance lookup', () => {
  const route = calculateMultiStopRoute([manilaOrigin, makatiDest], 'driving');
  const index = buildRouteIndex(route);

  assert.equal(index.routeId, route.id);
  assert.ok(index.totalKm > 4);
  assert.equal(index.cumulativeKm[0], 0);
  assert.equal(index.stepAlongKm.length, route.steps.length);
});

test('computeRouteProgress calculates real-time progress and step progression from GPS fix', () => {
  const route = calculateMultiStopRoute([manilaOrigin, makatiDest], 'driving');
  const index = buildRouteIndex(route);

  // Position at start
  const progressStart = computeRouteProgress(route, index, {
    lat: manilaOrigin.lat,
    lng: manilaOrigin.lng,
    speedKmh: 40,
  });

  assert.ok(progressStart.alongKm < 0.2);
  assert.ok(progressStart.remainingKm > 4);
  assert.equal(progressStart.arrived, false);

  // Position near destination
  const progressDest = computeRouteProgress(route, index, {
    lat: makatiDest.lat,
    lng: makatiDest.lng,
  });

  assert.ok(progressDest.remainingKm < 0.05);
  assert.equal(progressDest.arrived, true);
});

test('directBearingGuidance provides offline compass heading to target', () => {
  const guidance = directBearingGuidance(manilaOrigin, makatiDest);
  assert.ok(guidance.bearing >= 110 && guidance.bearing <= 160);
  assert.equal(guidance.cardinal, 'Southeast');
  assert.ok(guidance.distanceKm > 4 && guidance.distanceKm < 8);
});

test('buildSpokenInstruction formats clear voice maneuvers for drivers', () => {
  const step = {
    id: 'step-1',
    instruction: 'Turn right onto Epifanio de los Santos Ave',
    maneuver: 'turn-right' as const,
    distanceKm: 0.3,
    durationMinutes: 1,
    roadName: 'EDSA',
    lat: 14.55,
    lng: 121.02,
    trafficStatus: 'normal' as const,
  };

  const spokenFar = buildSpokenInstruction(step, 0.3);
  assert.equal(spokenFar, 'In 300 meters, turn right onto Epifanio de los Santos Ave');

  const spokenNear = buildSpokenInstruction(step, 0.02);
  assert.equal(spokenNear, 'Turn right onto Epifanio de los Santos Ave');
});
