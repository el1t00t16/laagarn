import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateConvoyRoomCode,
  sanitizeRoomCode,
  enrichPeerMetrics,
  buildConvoyShareUrl,
  buildQrCodeImageUrl,
  peerToLatLngPoint,
  ConvoyPeer,
} from './convoySync';

test('generateConvoyRoomCode produces valid LAAG-XXXX code format', () => {
  const code = generateConvoyRoomCode();
  assert.match(code, /^LAAG-\d{4}$/);
});

test('sanitizeRoomCode formats clean uppercase alphanumeric room code', () => {
  assert.strictEqual(sanitizeRoomCode('  laag-7281  '), 'LAAG-7281');
  assert.strictEqual(sanitizeRoomCode('cebu-ride#1'), 'CEBU-RIDE1');
});

test('enrichPeerMetrics calculates accurate distance and cardinal direction', () => {
  const peer: ConvoyPeer = {
    id: 'peer-test-1',
    name: 'Juan Rider',
    vehicle: 'motorcycle',
    color: '#06b6d4',
    lat: 14.5505,
    lng: 121.0283, // Makati Ayala
    updatedAt: Date.now() - 5000,
    status: 'active',
  };

  const userLat = 14.5826;
  const userLng = 120.9787; // Manila Rizal Park

  const enriched = enrichPeerMetrics(peer, userLat, userLng);
  assert.ok(enriched.distanceKm !== undefined && enriched.distanceKm > 5 && enriched.distanceKm < 15);
  assert.ok(enriched.cardinalDirection !== undefined);
  assert.strictEqual(enriched.status, 'active');
});

test('enrichPeerMetrics marks peer as idle or offline if timestamp is old', () => {
  const peerIdle: ConvoyPeer = {
    id: 'peer-test-idle',
    name: 'Maria',
    vehicle: 'car',
    color: '#ec4899',
    lat: 14.55,
    lng: 121.02,
    updatedAt: Date.now() - 45000, // 45s ago
    status: 'active',
  };
  const enrichedIdle = enrichPeerMetrics(peerIdle);
  assert.strictEqual(enrichedIdle.status, 'idle');

  const peerOffline: ConvoyPeer = {
    id: 'peer-test-offline',
    name: 'Ben',
    vehicle: 'van',
    color: '#10b981',
    lat: 14.55,
    lng: 121.02,
    updatedAt: Date.now() - 120000, // 2 mins ago
    status: 'active',
  };
  const enrichedOffline = enrichPeerMetrics(peerOffline);
  assert.strictEqual(enrichedOffline.status, 'offline');
});

test('buildConvoyShareUrl builds url with encoded room parameter', () => {
  const url = buildConvoyShareUrl('LAAG-8821');
  assert.ok(url.includes('convoy=LAAG-8821'));
});

test('buildQrCodeImageUrl generates SVG QR code API link', () => {
  const qrUrl = buildQrCodeImageUrl('https://laagarn.web.app/?convoy=LAAG-8821');
  assert.ok(qrUrl.startsWith('https://api.qrserver.com/v1/create-qr-code/'));
  assert.ok(qrUrl.includes('LAAG-8821'));
});

test('peerToLatLngPoint converts peer into router waypoint', () => {
  const peer: ConvoyPeer = {
    id: 'peer-2',
    name: 'Alex Rider',
    vehicle: 'motorcycle',
    color: '#06b6d4',
    lat: 10.3157,
    lng: 123.8854,
    updatedAt: Date.now(),
    status: 'active',
  };
  const pt = peerToLatLngPoint(peer);
  assert.strictEqual(pt.lat, 10.3157);
  assert.strictEqual(pt.lng, 123.8854);
  assert.ok(pt.name.includes('Alex Rider'));
  assert.ok(pt.name.includes('🏍️'));
});
