import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStravaStats,
  generateStravaGpx,
  StravaTrackPoint,
} from './stravaRecorder';

test('stravaRecorder: computes valid statistics from trackpoints', () => {
  const points: StravaTrackPoint[] = [
    {
      lat: 14.5995,
      lng: 120.9842,
      ele: 15,
      time: '2026-11-05T10:00:00.000Z',
      speedKmh: 40,
    },
    {
      lat: 14.6050,
      lng: 120.9890,
      ele: 25,
      time: '2026-11-05T10:01:00.000Z',
      speedKmh: 45,
    },
    {
      lat: 14.6100,
      lng: 120.9950,
      ele: 30,
      time: '2026-11-05T10:02:00.000Z',
      speedKmh: 50,
    },
  ];

  const stats = calculateStravaStats(points);
  assert.equal(stats.pointCount, 3);
  assert.equal(stats.elapsedSeconds, 120);
  assert.ok(stats.totalDistanceKm > 1.0);
  assert.equal(stats.maxSpeedKmh, 50);
  assert.equal(stats.elevationGainM, 15);
  assert.ok(stats.avgSpeedKmh > 0);
});

test('stravaRecorder: generates valid Strava GPX 1.1 format with ISO timestamps', () => {
  const points: StravaTrackPoint[] = [
    {
      lat: 14.5995,
      lng: 120.9842,
      ele: 12.5,
      time: '2026-11-05T10:00:00.000Z',
      speedKmh: 36,
    },
  ];

  const xml = generateStravaGpx('Morning Highway Simulation', points, 'VirtualRide');
  assert.ok(xml.includes('<?xml version="1.0"'));
  assert.ok(xml.includes('<type>VirtualRide</type>'));
  assert.ok(xml.includes('<ele>12.5</ele>'));
  assert.ok(xml.includes('<time>2026-11-05T10:00:00.000Z</time>'));
  assert.ok(xml.includes('<gpxtpx:speed>10.00</gpxtpx:speed>'));
});
