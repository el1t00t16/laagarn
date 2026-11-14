import test from 'node:test';
import assert from 'node:assert/strict';
import { boxesIntersect, selectVisibleMapLabels } from './mapLabelDeclutter';

test('selectVisibleMapLabels suppresses dense low-zoom labels except alwaysShow pins', () => {
  const candidates = [
    { id: 'est-1', lat: 14.55, lng: 121.02, priority: 10, widthPx: 110, heightPx: 18 },
    { id: 'tl-1', lat: 14.551, lng: 121.021, priority: 20, widthPx: 105, heightPx: 16 },
    { id: 'selected', lat: 14.552, lng: 121.022, priority: 100, widthPx: 110, heightPx: 18, alwaysShow: true },
  ];

  const visibleZoom12 = selectVisibleMapLabels(
    candidates,
    (lat, lng) => ({ x: lng * 1000, y: -lat * 1000 }),
    12
  );

  assert.equal(visibleZoom12.has('selected'), true);
  assert.equal(visibleZoom12.has('est-1'), false);
  assert.equal(visibleZoom12.has('tl-1'), false);
});

test('selectVisibleMapLabels prevents overlapping labels at street zoom while keeping higher priority', () => {
  const candidates = [
    { id: 'heavy-1', lat: 14.55, lng: 121.02, priority: 90, widthPx: 60, heightPx: 18 },
    { id: 'est-overlap', lat: 14.5501, lng: 121.0201, priority: 10, widthPx: 110, heightPx: 18 },
    { id: 'est-clear', lat: 14.58, lng: 121.08, priority: 10, widthPx: 110, heightPx: 18 },
  ];

  const visibleZoom15 = selectVisibleMapLabels(
    candidates,
    (lat, lng) => ({ x: (lng - 121) * 5000, y: -(lat - 14.5) * 5000 }),
    15
  );

  assert.equal(visibleZoom15.has('heavy-1'), true);
  assert.equal(visibleZoom15.has('est-overlap'), false);
  assert.equal(visibleZoom15.has('est-clear'), true);
});

test('boxesIntersect detects padded collisions accurately', () => {
  const a = { left: 0, top: 0, right: 100, bottom: 20 };
  const closeRight = { left: 103, top: 0, right: 200, bottom: 20 };
  const farRight = { left: 110, top: 0, right: 200, bottom: 20 };

  assert.equal(boxesIntersect(a, closeRight, 4), true);
  assert.equal(boxesIntersect(a, farRight, 4), false);
});

test('selectVisibleMapLabels honors per-candidate minZoom for heavy traffic vs POIs', () => {
  const candidates = [
    { id: 'heavy-1', lat: 14.55, lng: 121.02, priority: 85, widthPx: 56, heightPx: 18, minZoom: 11 },
    { id: 'heavy-2', lat: 14.5502, lng: 121.0202, priority: 84, widthPx: 56, heightPx: 18, minZoom: 11 },
    { id: 'est-1', lat: 14.60, lng: 121.06, priority: 15, widthPx: 110, heightPx: 18 },
  ];

  const visibleZoom12 = selectVisibleMapLabels(
    candidates,
    (lat, lng) => ({ x: lng * 2000, y: -lat * 2000 }),
    12
  );

  assert.equal(visibleZoom12.has('heavy-1'), true);
  assert.equal(visibleZoom12.has('heavy-2'), false);
  assert.equal(visibleZoom12.has('est-1'), false);
});
