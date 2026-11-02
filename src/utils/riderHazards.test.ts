import test from 'node:test';
import assert from 'node:assert';
import { createRiderReportedHazard, RIDER_HAZARD_PRESETS } from './riderHazards';

test('createRiderReportedHazard constructs accurate incident with safety advice', () => {
  const hazard = createRiderReportedHazard(
    'gravel',
    6.3821,
    125.2754,
    'Davao-GenSan Highway',
    'Heavy gravel near river bridge'
  );

  assert.ok(hazard.id.startsWith('rider-hazard-'));
  assert.strictEqual(hazard.title, 'Loose Gravel / Sand');
  assert.strictEqual(hazard.severity, 'heavy');
  assert.strictEqual(hazard.lat, 6.3821);
  assert.strictEqual(hazard.lng, 125.2754);
  assert.strictEqual(hazard.corridor, 'Davao-GenSan Highway');
  assert.strictEqual(hazard.description, 'Heavy gravel near river bridge');
  assert.strictEqual(hazard.active, true);
});

test('RIDER_HAZARD_PRESETS covers motorcycle essential road hazards', () => {
  const types = RIDER_HAZARD_PRESETS.map((p) => p.id);
  assert.ok(types.includes('gravel'));
  assert.ok(types.includes('landslide'));
  assert.ok(types.includes('flood'));
  assert.ok(types.includes('construction'));
  assert.ok(types.includes('checkpoint'));
});
