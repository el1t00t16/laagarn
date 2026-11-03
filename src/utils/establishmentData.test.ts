import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_ESTABLISHMENTS,
  searchOfflineEstablishments,
  mapOsmTagToCategory,
  establishmentToLatLngPoint,
  ESTABLISHMENT_CATEGORIES,
} from './establishmentData';

test('KNOWN_ESTABLISHMENTS contains essential categories and valid Philippine coordinates', () => {
  assert.ok(KNOWN_ESTABLISHMENTS.length >= 30, 'Should have a rich seed gazetteer of establishments');

  const categories = new Set(KNOWN_ESTABLISHMENTS.map((e) => e.category));
  assert.ok(categories.has('fuel'), 'Should include gas/fuel stations');
  assert.ok(categories.has('food'), 'Should include food/fast-food establishments');
  assert.ok(categories.has('mall'), 'Should include malls/shopping centers');
  assert.ok(categories.has('hospital'), 'Should include hospitals');
  assert.ok(categories.has('pharmacy'), 'Should include pharmacies');
  assert.ok(categories.has('bank'), 'Should include banks/ATMs');

  for (const est of KNOWN_ESTABLISHMENTS) {
    assert.ok(est.name && est.name.length > 0, 'Establishment name must not be empty');
    assert.ok(est.lat >= 4.4 && est.lat <= 21.3, `Latitude ${est.lat} must be within Philippines bounds`);
    assert.ok(est.lng >= 116.5 && est.lng <= 127.0, `Longitude ${est.lng} must be within Philippines bounds`);
  }
});

test('searchOfflineEstablishments filters by keyword search', () => {
  const jollibeeResults = searchOfflineEstablishments('Jollibee');
  assert.ok(jollibeeResults.length > 0, 'Should find Jollibee branches');
  for (const item of jollibeeResults) {
    const matches =
      item.name.toLowerCase().includes('jollibee') ||
      (item.brand && item.brand.toLowerCase().includes('jollibee'));
    assert.ok(matches, 'Results should match Jollibee');
  }

  const petronResults = searchOfflineEstablishments('Petron');
  assert.ok(petronResults.length > 0, 'Should find Petron gas stations');
  assert.equal(petronResults[0].category, 'fuel');

  const hospitalResults = searchOfflineEstablishments('St. Luke');
  assert.ok(hospitalResults.length > 0, 'Should find St. Luke Medical Center');
  assert.equal(hospitalResults[0].category, 'hospital');
});

test('searchOfflineEstablishments filters by category and calculates distance', () => {
  const fuelOnly = searchOfflineEstablishments('', { category: 'fuel' });
  assert.ok(fuelOnly.length > 0, 'Should return gas stations');
  for (const item of fuelOnly) {
    assert.equal(item.category, 'fuel');
  }

  // Luneta coordinates as reference
  const lunetaLat = 14.5826;
  const lunetaLng = 120.9787;
  const nearby = searchOfflineEstablishments('', {
    nearLat: lunetaLat,
    nearLng: lunetaLng,
    radiusKm: 15,
  });

  assert.ok(nearby.length > 0, 'Should find establishments within 15 km of Luneta');
  for (const item of nearby) {
    assert.ok(typeof item.distanceKm === 'number', 'Should attach distanceKm');
    assert.ok(item.distanceKm <= 15, `Distance ${item.distanceKm} must be within 15 km`);
  }

  // Check sorting (closest first)
  for (let i = 1; i < nearby.length; i++) {
    assert.ok(nearby[i].distanceKm! >= nearby[i - 1].distanceKm!, 'Results must be sorted by distance');
  }
});

test('mapOsmTagToCategory correctly classifies OpenStreetMap tags', () => {
  assert.equal(mapOsmTagToCategory({ type: 'fast_food' }).category, 'food');
  assert.equal(mapOsmTagToCategory({ type: 'fuel' }).category, 'fuel');
  assert.equal(mapOsmTagToCategory({ type: 'supermarket' }).category, 'mall');
  assert.equal(mapOsmTagToCategory({ type: 'hospital' }).category, 'hospital');
  assert.equal(mapOsmTagToCategory({ type: 'pharmacy' }).category, 'pharmacy');
  assert.equal(mapOsmTagToCategory({ type: 'bank' }).category, 'bank');
  assert.equal(mapOsmTagToCategory({ type: 'hotel' }).category, 'hotel');
});

test('establishmentToLatLngPoint converts establishment to router point', () => {
  const sample = KNOWN_ESTABLISHMENTS[0];
  const point = establishmentToLatLngPoint(sample);
  assert.equal(point.name, sample.name);
  assert.equal(point.lat, sample.lat);
  assert.equal(point.lng, sample.lng);
  assert.ok(point.region && point.region.length > 0);
});

test('resolveLocationInput resolves establishment names directly', async () => {
  const { resolveLocationInput } = await import('./travelData');
  const resolved = resolveLocationInput('Jollibee BGC');
  assert.ok(resolved, 'Should resolve Jollibee BGC');
  assert.match(resolved.name, /Jollibee/i);
  assert.ok(resolved.lat > 14 && resolved.lat < 15);
  assert.ok(resolved.lng > 120 && resolved.lng < 122);

  const resolvedPetron = resolveLocationInput('Petron SLEX');
  assert.ok(resolvedPetron, 'Should resolve Petron SLEX');
  assert.match(resolvedPetron.name, /Petron SLEX/i);
});
