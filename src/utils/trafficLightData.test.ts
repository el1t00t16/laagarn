import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_TRAFFIC_LIGHTS,
  searchTrafficLights,
  trafficLightToLatLngPoint,
} from './trafficLightData';

test('KNOWN_TRAFFIC_LIGHTS contains signalized intersections with valid Philippine coordinates', () => {
  assert.ok(KNOWN_TRAFFIC_LIGHTS.length >= 20, 'Should have a rich list of signalized junctions');

  for (const tl of KNOWN_TRAFFIC_LIGHTS) {
    assert.ok(tl.name && tl.name.length > 0, 'Name must not be empty');
    assert.ok(tl.intersection && tl.intersection.length > 0, 'Intersection must be defined');
    assert.ok(tl.lat >= 4.4 && tl.lat <= 21.3, `Latitude ${tl.lat} must be within Philippines bounds`);
    assert.ok(tl.lng >= 116.5 && tl.lng <= 127.0, `Longitude ${tl.lng} must be within Philippines bounds`);
    assert.ok(tl.systemType && tl.systemType.length > 0, 'Must have a traffic system type');
  }
});

test('searchTrafficLights filters by keyword', () => {
  const edsaResults = searchTrafficLights('EDSA');
  assert.ok(edsaResults.length >= 4, 'Should find EDSA traffic lights');

  const ayalaResults = searchTrafficLights('Ayala');
  assert.ok(ayalaResults.length >= 2, 'Should find Ayala Ave traffic lights');

  const cebuResults = searchTrafficLights('Cebu');
  assert.ok(cebuResults.length >= 3, 'Should find Cebu signalized junctions');

  const davaoResults = searchTrafficLights('Davao');
  assert.ok(davaoResults.length >= 2, 'Should find Davao traffic lights');
});

test('searchTrafficLights supports proximity sorting by coordinates', () => {
  // Makati coordinate
  const makatiLat = 14.5505;
  const makatiLng = 121.0283;

  const nearby = searchTrafficLights('', {
    nearLat: makatiLat,
    nearLng: makatiLng,
    radiusKm: 10,
  });

  assert.ok(nearby.length > 0, 'Should find traffic lights near Makati');
  assert.equal(nearby[0].id, 'tl-edsa-ayala', 'Closest should be EDSA-Ayala');
  assert.ok(nearby[0].distanceKm! < 0.1, 'Distance should be under 100 meters');

  // Verify sorting
  for (let i = 1; i < nearby.length; i++) {
    assert.ok(nearby[i].distanceKm! >= nearby[i - 1].distanceKm!, 'Must be sorted by proximity');
  }
});

test('trafficLightToLatLngPoint converts correctly', () => {
  const sample = KNOWN_TRAFFIC_LIGHTS[0];
  const point = trafficLightToLatLngPoint(sample);
  assert.equal(point.name, sample.name);
  assert.equal(point.lat, sample.lat);
  assert.equal(point.lng, sample.lng);
  assert.ok(point.region && point.region.includes('EDSA'));
});
