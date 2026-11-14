import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWatermarkLayout,
  formatWatermarkCoordinates,
  formatWatermarkTimestamp,
  resolveWatermarkLocation,
  truncateCanvasText,
  drawDashcamWatermark,
} from './dashcamWatermark';

test('formatWatermarkTimestamp outputs clean deterministic DD MMM YYYY · HH:MM:SS', () => {
  const d = new Date(2026, 10, 9, 18, 48, 5); // Nov 9, 2026 18:48:05
  assert.equal(formatWatermarkTimestamp(d), '09 NOV 2026 · 18:48:05');
});

test('formatWatermarkCoordinates includes N/S E/W, heading, and accuracy', () => {
  const formatted = formatWatermarkCoordinates({
    lat: 6.4028,
    lng: 125.1896,
    accuracyMeters: 7.6,
    heading: 142.4,
    speedKmh: 7,
    addressLabel: 'Datal Batong, Malungon',
    withinPhilippines: true,
    timestamp: Date.now(),
  });
  assert.equal(formatted, '6.4028° N, 125.1896° E · HDG 142° · ±8m');
  assert.equal(formatWatermarkCoordinates(null), 'GPS SATELLITE LOCK PENDING');
});

test('resolveWatermarkLocation prefers meaningful roadName then gps addressLabel', () => {
  assert.equal(
    resolveWatermarkLocation('Arrive at Datal Batong', {
      lat: 6.4028,
      lng: 125.1896,
      accuracyMeters: 5,
      heading: null,
      speedKmh: 7,
      addressLabel: 'Malungon, Sarangani',
      withinPhilippines: true,
      timestamp: 1,
    }),
    'Arrive at Datal Batong'
  );
  assert.equal(
    resolveWatermarkLocation('', {
      lat: 6.4028,
      lng: 125.1896,
      accuracyMeters: 5,
      heading: null,
      speedKmh: 7,
      addressLabel: 'Datal Batong, Malungon',
      withinPhilippines: true,
      timestamp: 1,
    }),
    'Datal Batong, Malungon'
  );
});

test('truncateCanvasText guarantees fitted text never exceeds maxWidth', () => {
  const mockCtx = {
    measureText: (str: string) => ({ width: str.length * 10 } as TextMetrics),
  };
  const long = 'Pan-Philippine Highway (AH26), Barangay Datal Batong, Malungon';
  const fitted = truncateCanvasText(mockCtx, long, 180);
  assert.ok(mockCtx.measureText(fitted).width <= 180);
  assert.ok(fitted.endsWith('…'));
  assert.equal(truncateCanvasText(mockCtx, 'Short Rd', 180), 'Short Rd');
});

test('computeWatermarkLayout keeps all regions strictly inside bounds in portrait and landscape', () => {
  const resolutions = [
    [720, 1280], // 9:16 mobile portrait (exact bug scenario!)
    [473, 1024], // tall narrow mobile portrait
    [1080, 1920], // Full HD mobile portrait
    [1280, 720], // 16:9 HD landscape
    [960, 720], // 4:3 landscape
    [720, 720], // 1:1 square
  ];

  for (const [w, h] of resolutions) {
    const m = computeWatermarkLayout(w, h, 72);
    assert.ok(m.cardX >= 0, `cardX >= 0 for ${w}x${h}`);
    assert.ok(m.cardX + m.cardW <= w, `card fits horizontally for ${w}x${h}`);
    assert.ok(m.cardY >= 0 && m.cardY + m.cardH <= h, `card fits vertically for ${w}x${h}`);
    assert.ok(m.dividerX > m.cardX && m.dividerX < m.infoX, `speed pod separated from info for ${w}x${h}`);
    assert.ok(m.infoMaxWidth >= 100, `ample info width (${m.infoMaxWidth}) for ${w}x${h}`);
    assert.ok(m.row1Y < m.row2Y && m.row2Y < m.row3Y, `strict vertical row ordering for ${w}x${h}`);
  }
});

test('drawDashcamWatermark renders without horizontal or vertical text collisions on portrait 720x1280', () => {
  const drawnTexts: {
    text: string;
    x: number;
    y: number;
    align: CanvasTextAlign;
    fontPx: number;
    width: number;
  }[] = [];

  let currentFont = '12px sans-serif';
  let currentAlign: CanvasTextAlign = 'left';

  const getFontPx = () => {
    const match = currentFont.match(/(\d+(?:\.\d+)?)px/);
    return match ? Number(match[1]) : 12;
  };

  const measureWidth = (str: string) => str.length * getFontPx() * 0.6;

  const mockGradient = { addColorStop: () => {} };
  const mockCtx: any = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    createLinearGradient: () => mockGradient,
    measureText: (str: string) => ({ width: measureWidth(str) }),
    set font(val: string) {
      currentFont = val;
    },
    get font() {
      return currentFont;
    },
    set textAlign(val: CanvasTextAlign) {
      currentAlign = val;
    },
    get textAlign() {
      return currentAlign;
    },
    textBaseline: 'alphabetic',
    fillStyle: '#fff',
    strokeStyle: '#fff',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    fillText: (text: string, x: number, y: number) => {
      drawnTexts.push({
        text,
        x,
        y,
        align: currentAlign,
        fontPx: getFontPx(),
        width: measureWidth(text),
      });
    },
  };

  drawDashcamWatermark(mockCtx, 720, 1280, {
    gps: {
      lat: 6.4028,
      lng: 125.1896,
      accuracyMeters: 6,
      heading: 185,
      speedKmh: 7,
      addressLabel: 'Datal Batong, Malungon, Sarangani',
      withinPhilippines: true,
      timestamp: Date.now(),
    },
    roadName: 'Arrive at Datal Batong',
    lens: '0.5x',
    recordingMode: 'timelapse',
    timestamp: new Date(2026, 10, 9, 18, 48, 5),
  });

  assert.equal(drawnTexts.length, 6);

  // Convert each drawn text into [left, right] X interval and verify every text stays inside [0, 720]
  const boxes = drawnTexts.map((t) => {
    const left =
      t.align === 'right' ? t.x - t.width : t.align === 'center' ? t.x - t.width / 2 : t.x;
    const right = left + t.width;
    const top = t.y - t.fontPx * 0.85;
    const bottom = t.y + t.fontPx * 0.2;
    assert.ok(left >= 0, `"${t.text}" clipped off left edge (left=${left})`);
    assert.ok(right <= 720, `"${t.text}" clipped off right edge (right=${right})`);
    return { ...t, left, right, top, bottom };
  });

  // Verify NO pair of drawn text bounding boxes overlap
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const horizOverlap = a.left < b.right && a.right > b.left;
      const vertOverlap = a.top < b.bottom && a.bottom > b.top;
      assert.equal(
        horizOverlap && vertOverlap,
        false,
        `Collision detected between "${a.text}" and "${b.text}"`
      );
    }
  }
});

test('drawDashcamWatermark never overlaps text across narrow portrait, Davao-GenSan highway, and high-speed cases', () => {
  const cases = [
    { width: 240, height: 426, speedKmh: 0, roadName: 'Depart from Davao-GenSan Highway', lens: '0.5x' as const, mode: 'timelapse' as const },
    { width: 360, height: 640, speedKmh: 125, roadName: 'Depart from Davao-GenSan Highway', lens: '0.5x' as const, mode: 'timelapse' as const },
    { width: 473, height: 1024, speedKmh: 0, roadName: 'Depart from Davao-GenSan Highway', lens: '1x' as const, mode: 'normal' as const },
    { width: 720, height: 1280, speedKmh: 0, roadName: 'Depart from Davao-GenSan Highway', lens: '1x' as const, mode: 'normal' as const },
    { width: 1920, height: 1080, speedKmh: 188, roadName: 'Maharlika Highway Diversion Rd Bypass Section 4', lens: '0.5x' as const, mode: 'timelapse' as const },
  ];

  for (const tc of cases) {
    const drawnTexts: Array<{
      text: string;
      x: number;
      y: number;
      align: CanvasTextAlign;
      fontPx: number;
      width: number;
    }> = [];
    let currentFont = '12px Inter';
    let currentAlign: CanvasTextAlign = 'left';

    const getFontPx = () => {
      const match = currentFont.match(/(\d+(?:\.\d+)?)px/);
      return match ? Number(match[1]) : 12;
    };
    const measureWidth = (str: string) => str.length * getFontPx() * 0.6;
    const mockGradient = { addColorStop: () => {} };
    const mockCtx: any = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      arc: () => {},
      closePath: () => {},
      fill: () => {},
      stroke: () => {},
      fillRect: () => {},
      createLinearGradient: () => mockGradient,
      measureText: (str: string) => ({ width: measureWidth(str) }),
      set font(val: string) { currentFont = val; },
      get font() { return currentFont; },
      set textAlign(val: CanvasTextAlign) { currentAlign = val; },
      get textAlign() { return currentAlign; },
      textBaseline: 'alphabetic',
      fillStyle: '#fff',
      strokeStyle: '#fff',
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetY: 0,
      lineWidth: 1,
      fillText: (text: string, x: number, y: number) => {
        drawnTexts.push({
          text,
          x,
          y,
          align: currentAlign,
          fontPx: getFontPx(),
          width: measureWidth(text),
        });
      },
    };

    drawDashcamWatermark(mockCtx, tc.width, tc.height, {
      gps: {
        lat: 6.3733,
        lng: 125.2731,
        accuracyMeters: 8,
        heading: 180,
        speedKmh: tc.speedKmh,
        addressLabel: tc.roadName,
        withinPhilippines: true,
        timestamp: Date.now(),
      },
      roadName: tc.roadName,
      lens: tc.lens,
      recordingMode: tc.mode,
      timestamp: new Date(2026, 10, 14, 14, 3, 30),
    });

    const boxes = drawnTexts.map((t) => {
      const left = t.align === 'right' ? t.x - t.width : t.align === 'center' ? t.x - t.width / 2 : t.x;
      const right = left + t.width;
      const top = t.y - t.fontPx * 0.82;
      const bottom = t.y + t.fontPx * 0.18;
      assert.ok(left >= 0, `${tc.width}x${tc.height}: "${t.text}" clipped left (${left})`);
      assert.ok(right <= tc.width, `${tc.width}x${tc.height}: "${t.text}" clipped right (${right})`);
      return { ...t, left, right, top, bottom };
    });

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const horizOverlap = a.left < b.right && a.right > b.left;
        const vertOverlap = a.top < b.bottom && a.bottom > b.top;
        assert.equal(
          horizOverlap && vertOverlap,
          false,
          `${tc.width}x${tc.height}: Collision between "${a.text}" and "${b.text}"`
        );
      }
    }
  }
});
