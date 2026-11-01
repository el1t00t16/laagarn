import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHaversineDistanceKm,
  calculateBearing,
  getCardinalDirection,
  validateRouteInputs,
  calculateMultiStopRoute,
  evaluateWeatherTravelAdvisory,
  latLngToTileXY,
  getTileCoordinatesForBounds,
  TrafficIncident,
  LatLngPoint,
} from './routingEngine';

const manilaOrigin: LatLngPoint = {
  name: 'Manila Rizal Park (Luneta)',
  lat: 14.5826,
  lng: 120.9787,
};

const makatiWaypoint: LatLngPoint = {
  name: 'Makati Ayala Center',
  lat: 14.5509,
  lng: 121.0244,
};

const tagaytayDest: LatLngPoint = {
  name: 'Tagaytay Sky Ranch Ridge',
  lat: 14.0953,
  lng: 120.938,
};

test('calculateHaversineDistanceKm computes accurate geodesic distance in the Philippines', () => {
  const dist = calculateHaversineDistanceKm(manilaOrigin, tagaytayDest);
  assert.ok(dist > 48 && dist < 62, `Expected ~54km, got ${dist}km`);
  assert.equal(calculateHaversineDistanceKm(manilaOrigin, manilaOrigin), 0);
});

test('calculateBearing and getCardinalDirection return accurate compass headings', () => {
  const bearingSouth = calculateBearing(manilaOrigin, tagaytayDest);
  assert.ok(bearingSouth >= 170 && bearingSouth <= 200);
  assert.equal(getCardinalDirection(180), 'South');
  assert.equal(getCardinalDirection(0), 'North');
  assert.equal(getCardinalDirection(90), 'East');
});

test('validateRouteInputs enforces non-empty and distinct Philippine locations', () => {
  assert.deepEqual(validateRouteInputs('', 'Tagaytay'), {
    valid: false,
    error: 'Please enter a starting origin location.',
  });
  assert.deepEqual(validateRouteInputs('Manila', '   '), {
    valid: false,
    error: 'Please enter a destination location.',
  });
  assert.deepEqual(validateRouteInputs('Makati Ayala Center', 'makati ayala center'), {
    valid: false,
    error: 'Origin and destination cannot be the same location.',
  });
  assert.deepEqual(
    validateRouteInputs('Manila', 'Tagaytay', [manilaOrigin, tagaytayDest]),
    { valid: true }
  );
});

test('calculateMultiStopRoute computes Philippine multi-stop geometry, steps, and traffic delays', () => {
  const mockIncident: TrafficIncident = {
    id: 'inc-edsa-1',
    title: 'EDSA Guadalupe Southbound Congestion',
    corridor: 'EDSA Makati',
    type: 'congestion',
    severity: 'heavy',
    lat: 14.5509,
    lng: 121.0244,
    delayMinutes: 16,
    speedKmh: 20,
    description: 'Heavy volume approaching Guadalupe Bridge.',
    updatedMinutesAgo: 3,
    active: true,
  };

  const routeWithTraffic = calculateMultiStopRoute(
    [manilaOrigin, makatiWaypoint, tagaytayDest],
    'driving',
    [mockIncident],
    0
  );

  assert.ok(routeWithTraffic.totalDistanceKm > 55);
  assert.equal(routeWithTraffic.trafficDelayMinutes, 16);
  assert.equal(
    routeWithTraffic.totalDurationMinutes,
    routeWithTraffic.baseDurationMinutes + 16
  );
  assert.equal(routeWithTraffic.affectedIncidents.length, 1);
  assert.ok(routeWithTraffic.steps.length >= 6);
  assert.equal(routeWithTraffic.steps[0].maneuver, 'depart');
  assert.equal(
    routeWithTraffic.steps[routeWithTraffic.steps.length - 1].maneuver,
    'arrive'
  );
});

test('evaluateWeatherTravelAdvisory classifies nominal, caution, and severe conditions', () => {
  const nominal = evaluateWeatherTravelAdvisory({
    tempC: 29,
    precipProbPct: 15,
    windKmh: 14,
    visibilityKm: 16,
    condition: 'Clear',
  });
  assert.equal(nominal.level, 'Nominal');
  assert.equal(nominal.roadSurface, 'Dry');

  const severe = evaluateWeatherTravelAdvisory({
    tempC: 24,
    precipProbPct: 85,
    windKmh: 54,
    visibilityKm: 3.5,
    condition: 'Heavy Rain',
  });
  assert.equal(severe.level, 'Severe');
  assert.equal(severe.speedReductionPct, 25);
});

test('latLngToTileXY and getTileCoordinatesForBounds generate deterministic Philippine slippy-map tile keys', () => {
  const tile = latLngToTileXY(14.5826, 120.9787, 12);
  assert.ok(tile.x > 0 && tile.y > 0);

  const boundsTiles = getTileCoordinatesForBounds(
    { lat: 14.48, lng: 120.94 },
    { lat: 14.68, lng: 121.08 },
    [11, 12]
  );
  assert.ok(boundsTiles.length > 0);
  assert.ok(boundsTiles[0].key.startsWith('11/'));
});
