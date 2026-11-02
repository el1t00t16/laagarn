import test from 'node:test';
import assert from 'node:assert';
import { exportRouteToGpx, parseGpxFile } from './gpxHandler';
import { ComputedRoute, LatLngPoint } from './routingEngine';

test('exportRouteToGpx generates valid GPX XML structure with waypoints and trackpoints', () => {
  const dummyRoute: ComputedRoute = {
    id: 'route-test-1',
    label: 'Malungon to Digos Test',
    mode: 'driving',
    source: 'live',
    totalDistanceKm: 42.5,
    baseDurationMinutes: 48,
    totalDurationMinutes: 52,
    trafficDelayMinutes: 4,
    averageSpeedKmh: 49,
    fuelOrEnergyEstimate: '2.8L',
    co2Kg: 6.5,
    coordinates: [
      [6.381, 125.275],
      [6.452, 125.291],
      [6.755, 125.356],
    ],
    steps: [],
    segments: [],
    stops: [],
    affectedIncidents: [],
  };

  const stops: LatLngPoint[] = [
    { name: 'Malungon Town Hall', lat: 6.381, lng: 125.275, region: 'Sarangani' },
    { name: 'Digos Rizal Park', lat: 6.755, lng: 125.356, region: 'Davao del Sur' },
  ];

  const gpx = exportRouteToGpx(dummyRoute, stops);
  assert.ok(gpx.includes('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(gpx.includes('<gpx version="1.1"'));
  assert.ok(gpx.includes('<name>Malungon to Digos Test</name>'));
  assert.ok(gpx.includes('<wpt lat="6.381000" lon="125.275000">'));
  assert.ok(gpx.includes('<trkpt lat="6.381000" lon="125.275000"/>'));
  assert.ok(gpx.includes('<trkpt lat="6.755000" lon="125.356000"/>'));
});

test('parseGpxFile extracts waypoints, track name, and coordinates from GPX string', () => {
  const rawGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LAAGARN">
  <metadata>
    <name>Mindanao Trail 1</name>
  </metadata>
  <wpt lat="6.3815" lon="125.2754">
    <name>Malungon Junction</name>
  </wpt>
  <wpt lat="6.7552" lon="125.3561">
    <name>Digos Terminal</name>
  </wpt>
  <trk>
    <name>Mindanao Trail 1</name>
    <trkseg>
      <trkpt lat="6.3815" lon="125.2754"/>
      <trkpt lat="6.5200" lon="125.3100"/>
      <trkpt lat="6.7552" lon="125.3561"/>
    </trkseg>
  </trk>
</gpx>`;

  const result = parseGpxFile(rawGpx);
  assert.strictEqual(result.name, 'Mindanao Trail 1');
  assert.strictEqual(result.stops.length, 2);
  assert.strictEqual(result.stops[0].name, 'Malungon Junction');
  assert.strictEqual(result.stops[1].name, 'Digos Terminal');
  assert.strictEqual(result.coordinates.length, 3);
  assert.strictEqual(result.coordinates[1][0], 6.52);
  assert.strictEqual(result.coordinates[1][1], 125.31);
});

test('parseGpxFile handles GPX tracks without explicit waypoints by assigning start and end', () => {
  const rawTrackOnly = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <metadata><name>Raw Davao Track</name></metadata>
  <trk>
    <trkseg>
      <trkpt lat="7.0700" lon="125.6100"/>
      <trkpt lat="7.1000" lon="125.6300"/>
      <trkpt lat="7.1500" lon="125.6500"/>
    </trkseg>
  </trk>
</gpx>`;

  const result = parseGpxFile(rawTrackOnly);
  assert.strictEqual(result.coordinates.length, 3);
  assert.strictEqual(result.stops.length, 2);
  assert.ok(result.stops[0].name.includes('Start'));
  assert.ok(result.stops[1].name.includes('End'));
});
