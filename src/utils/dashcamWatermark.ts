import { GpsPositionState } from './gpsAndGeocoding';
import { LensZoom } from '../hooks/useCameraRecorder';

export interface WatermarkTelemetryInput {
  gps: GpsPositionState | null;
  roadName?: string;
  lens?: LensZoom;
  recordingMode?: 'normal' | 'timelapse';
  timestamp?: Date;
}

export interface WatermarkLayoutMetrics {
  isPortrait: boolean;
  scale: number;
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  cardRadius: number;
  speedPodW: number;
  speedCenterX: number;
  speedValueY: number;
  speedUnitY: number;
  dividerX: number;
  infoX: number;
  infoRight: number;
  infoMaxWidth: number;
  row1Y: number;
  row2Y: number;
  row3Y: number;
  speedFontPx: number;
  unitFontPx: number;
  headerFontPx: number;
  roadFontPx: number;
  coordsFontPx: number;
}

const MONTHS_SHORT = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/**
 * Formats a clean, unambiguous, locale-independent dashcam timestamp:
 * e.g. "09 NOV 2026 · 18:48:05"
 */
export function formatWatermarkTimestamp(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[date.getMonth()] || 'JAN';
  const year = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${day} ${mon} ${year} · ${hh}:${mm}:${ss}`;
}

/**
 * Resolves the cleanest human-readable location / highway label for the watermark.
 */
export function resolveWatermarkLocation(
  roadName?: string,
  gps?: GpsPositionState | null
): string {
  const rawRoad = (roadName || '').trim();
  const rawAddress = (gps?.addressLabel || '').trim();

  if (rawRoad && rawRoad.toLowerCase() !== 'philippine highway') {
    return rawRoad;
  }
  if (rawAddress) {
    return rawAddress;
  }
  return 'Philippine Highway';
}

/**
 * Formats GPS coordinates & live motion metadata cleanly for row 3.
 */
export function formatWatermarkCoordinates(gps?: GpsPositionState | null): string {
  if (!gps || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) {
    return 'GPS SATELLITE LOCK PENDING';
  }
  const latDir = gps.lat >= 0 ? 'N' : 'S';
  const lngDir = gps.lng >= 0 ? 'E' : 'W';
  const parts = [
    `${Math.abs(gps.lat).toFixed(4)}° ${latDir}, ${Math.abs(gps.lng).toFixed(4)}° ${lngDir}`,
  ];

  if (gps.heading !== null && gps.heading !== undefined && Number.isFinite(gps.heading)) {
    const normalized = ((Math.round(gps.heading) % 360) + 360) % 360;
    parts.push(`HDG ${normalized}°`);
  }

  if (gps.accuracyMeters && Number.isFinite(gps.accuracyMeters)) {
    parts.push(`±${Math.round(gps.accuracyMeters)}m`);
  }

  return parts.join(' · ');
}

/**
 * Computes responsive, orientation-aware HUD watermark geometry that guarantees
 * zero text overlap on both Portrait (9:16, 3:4) and Landscape (16:9, 4:3) frames.
 */
export function computeWatermarkLayout(
  width: number,
  height: number,
  measuredSpeedWidthPx?: number
): WatermarkLayoutMetrics {
  const safeW = Math.max(240, width);
  const safeH = Math.max(240, height);
  const isPortrait = safeH > safeW;

  // Scale relative to canvas width in portrait (720px baseline) or balanced width/height in landscape
  const refW = isPortrait ? 720 : 1120;
  const u = Math.max(0.35, Math.min(2.4, Math.min(safeW / refW, safeH / 640)));

  const marginX = Math.round(18 * u);
  const marginBottom = Math.round(18 * u);

  // Cap max card width on ultrawide landscape frames while spanning cleanly on mobile portrait
  const maxCardW = isPortrait ? safeW - marginX * 2 : Math.min(safeW - marginX * 2, Math.round(960 * u));
  const cardW = Math.max(200, maxCardW);
  const cardX = marginX;
  const cardRadius = Math.round(16 * u);

  const speedFontPx = Math.max(18, Math.round(40 * u));
  const unitFontPx = Math.max(8, Math.round(11 * u));
  const headerFontPx = Math.max(8, Math.round(11.5 * u));
  const roadFontPx = Math.max(11, Math.round(17.5 * u));
  const coordsFontPx = Math.max(8, Math.round(12 * u));

  const padY = Math.max(8, Math.round(12 * u));
  const minRowGap = Math.max(4, Math.round(6 * u));
  const speedGap = Math.max(4, Math.round(6 * u));

  // Derive card height from clamped font metrics so low-res portrait frames never squeeze rows together
  const minCardHForRows =
    padY * 2 +
    Math.ceil(headerFontPx * 1.05 + roadFontPx * 1.05 + coordsFontPx * 1.05 + minRowGap * 2);
  const minCardHForSpeed =
    padY * 2 + Math.ceil(speedFontPx * 1.05 + unitFontPx * 1.05 + speedGap);

  const cardH = Math.min(
    safeH - marginBottom * 2,
    Math.max(Math.round(96 * u), minCardHForRows, minCardHForSpeed)
  );
  const cardY = safeH - marginBottom - cardH;

  const minPodW = Math.round(92 * u);
  const maxPodW = Math.max(minPodW, Math.round(Math.min(168 * u, cardW * 0.36)));
  const desiredPodW = measuredSpeedWidthPx
    ? Math.ceil(measuredSpeedWidthPx + Math.max(24, 34 * u))
    : minPodW;
  const speedPodW = Math.max(minPodW, Math.min(maxPodW, desiredPodW));

  const accentOffset = Math.round(8 * u);
  const speedCenterX = cardX + accentOffset + (speedPodW - accentOffset) / 2;
  const speedBlockH = speedFontPx + speedGap + unitFontPx;
  const speedTop = cardY + Math.round((cardH - speedBlockH) / 2);
  const speedValueY = speedTop + Math.round(speedFontPx * 0.86);
  const speedUnitY = speedTop + speedFontPx + speedGap + Math.round(unitFontPx * 0.85);

  const dividerX = cardX + speedPodW;
  const innerPadX = Math.max(10, Math.round(15 * u));
  const infoX = dividerX + innerPadX;
  const infoRight = cardX + cardW - innerPadX;
  const infoMaxWidth = Math.max(60, infoRight - infoX);

  const innerH = cardH - padY * 2;
  const totalTextH = headerFontPx + roadFontPx + coordsFontPx;
  const rowGap = Math.max(minRowGap, Math.floor((innerH - totalTextH) / 2));
  const row1Y = cardY + padY + Math.round(headerFontPx * 0.85);
  const row2Y = cardY + padY + headerFontPx + rowGap + Math.round(roadFontPx * 0.85);
  const row3Y =
    cardY + padY + headerFontPx + rowGap + roadFontPx + rowGap + Math.round(coordsFontPx * 0.85);

  return {
    isPortrait,
    scale: u,
    cardX,
    cardY,
    cardW,
    cardH,
    cardRadius,
    speedPodW,
    speedCenterX,
    speedValueY,
    speedUnitY,
    dividerX,
    infoX,
    infoRight,
    infoMaxWidth,
    row1Y,
    row2Y,
    row3Y,
    speedFontPx,
    unitFontPx,
    headerFontPx,
    roadFontPx,
    coordsFontPx,
  };
}

/**
 * Truncates text with an ellipsis ('…') so its rendered width never exceeds maxWidth.
 */
export function truncateCanvasText(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number
): string {
  if (!text || maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;

  const ellipsis = '…';
  if (ctx.measureText(ellipsis).width > maxWidth) return '';

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = text.slice(0, mid).trimEnd() + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low > 0 ? text.slice(0, low).trimEnd() + ellipsis : ellipsis;
}

function fillAndStrokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillStyle: string | CanvasGradient,
  strokeStyle?: string,
  lineWidth = 1
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  ctx.fillStyle = fillStyle;
  ctx.fill();

  if (strokeStyle && lineWidth > 0) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/**
 * Draws the clean, collision-free LAAGARN GPS HUD watermark onto a 2D canvas.
 */
export function drawDashcamWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  telemetry: WatermarkTelemetryInput
): void {
  const { gps, roadName, lens = '1x', recordingMode = 'normal', timestamp = new Date() } = telemetry;

  ctx.save();

  const speedVal =
    gps?.speedKmh !== null && gps?.speedKmh !== undefined && Number.isFinite(gps.speedKmh)
      ? Math.max(0, Math.round(gps.speedKmh))
      : 0;
  const speedStr = `${speedVal}`;

  // Initial pass to get font scale, then measure exact speed width for dynamic pod sizing
  const prelim = computeWatermarkLayout(width, height);
  ctx.font = `900 ${prelim.speedFontPx}px "Manrope", system-ui, -apple-system, sans-serif`;
  const speedTextW = ctx.measureText(speedStr).width;
  const layout = computeWatermarkLayout(width, height, speedTextW);
  const u = layout.scale;

  // 1. Subtle bottom road scrim for extra readability against bright asphalt/concrete
  const scrimTop = Math.max(0, layout.cardY - Math.round(32 * u));
  const scrimGrad = ctx.createLinearGradient(0, scrimTop, 0, height);
  scrimGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  scrimGrad.addColorStop(1, 'rgba(5, 2, 12, 0.62)');
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(0, scrimTop, width, height - scrimTop);

  // 2. Glassmorphic HUD Card Container
  const cardGrad = ctx.createLinearGradient(0, layout.cardY, 0, layout.cardY + layout.cardH);
  cardGrad.addColorStop(0, 'rgba(16, 8, 30, 0.86)');
  cardGrad.addColorStop(1, 'rgba(8, 4, 18, 0.94)');

  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = Math.round(16 * u);
  ctx.shadowOffsetY = Math.round(4 * u);
  fillAndStrokeRoundedRect(
    ctx,
    layout.cardX,
    layout.cardY,
    layout.cardW,
    layout.cardH,
    layout.cardRadius,
    cardGrad,
    'rgba(168, 85, 247, 0.45)',
    Math.max(1, 1.5 * u)
  );
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Left vertical neon accent strip
  const accentGrad = ctx.createLinearGradient(0, layout.cardY, 0, layout.cardY + layout.cardH);
  accentGrad.addColorStop(0, '#c084fc');
  accentGrad.addColorStop(1, '#7c3aed');
  fillAndStrokeRoundedRect(
    ctx,
    layout.cardX + Math.round(6 * u),
    layout.cardY + Math.round(13 * u),
    Math.max(3, Math.round(4 * u)),
    layout.cardH - Math.round(26 * u),
    Math.round(2 * u),
    accentGrad
  );

  // 3. Left Speedometer Pod
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
  ctx.shadowBlur = Math.round(10 * u);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${layout.speedFontPx}px "Manrope", system-ui, -apple-system, sans-serif`;
  ctx.fillText(speedStr, layout.speedCenterX, layout.speedValueY);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#c084fc';
  ctx.font = `800 ${layout.unitFontPx}px "JetBrains Mono", monospace`;
  ctx.fillText('KM/H', layout.speedCenterX, layout.speedUnitY);

  // Vertical separator between Speed Pod and Telemetry Stack
  ctx.beginPath();
  ctx.moveTo(layout.dividerX, layout.cardY + Math.round(14 * u));
  ctx.lineTo(layout.dividerX, layout.cardY + layout.cardH - Math.round(14 * u));
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.25)';
  ctx.lineWidth = Math.max(1, 1.2 * u);
  ctx.stroke();

  // 4. Right Telemetry Stack — Row 1: Brand Badge (Left) + Timestamp (Right)
  const dotRadius = Math.max(2, Math.round(3.2 * u));
  const dotX = layout.infoX + dotRadius;
  const dotY = layout.row1Y - Math.round(layout.headerFontPx * 0.34);

  const lensTag = lens === '0.5x' ? ' · 0.5x' : '';
  const modeTag = recordingMode === 'timelapse' ? ' · TL' : '';
  const rawBrand = `LAAGARN GPS${lensTag}${modeTag}`;
  const brandX = dotX + dotRadius + Math.max(4, Math.round(6 * u));
  const headerGap = Math.max(8, Math.round(12 * u));

  const fullTimestamp = formatWatermarkTimestamp(timestamp);
  ctx.font = `700 ${layout.headerFontPx}px "JetBrains Mono", monospace`;
  let timestampStr = fullTimestamp;
  let tsWidth = ctx.measureText(timestampStr).width;

  // On ultra-narrow streams, use HH:MM:SS so brand and clock never squeeze into each other
  if (layout.infoRight - tsWidth - brandX - headerGap < Math.round(54 * Math.max(0.75, u))) {
    const shortMatch = fullTimestamp.match(/\d{2}:\d{2}:\d{2}$/);
    if (shortMatch) {
      timestampStr = shortMatch[0];
      tsWidth = ctx.measureText(timestampStr).width;
    }
  }

  const brandMaxW = Math.max(0, layout.infoRight - tsWidth - brandX - headerGap);
  const fittedTs = truncateCanvasText(ctx, timestampStr, Math.max(0, layout.infoRight - brandX));

  ctx.textAlign = 'right';
  ctx.fillStyle = '#cbd5e1';
  if (fittedTs) {
    ctx.fillText(fittedTs, layout.infoRight, layout.row1Y);
  }

  if (brandMaxW >= Math.round(18 * u)) {
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#c084fc';
    ctx.font = `800 ${layout.headerFontPx}px "JetBrains Mono", monospace`;
    const fittedBrand = truncateCanvasText(ctx, rawBrand, brandMaxW);
    if (fittedBrand) {
      ctx.fillText(fittedBrand, brandX, layout.row1Y);
    }
  }

  // 5. Row 2: Road / Location Name
  const locationLabel = resolveWatermarkLocation(roadName, gps);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${layout.roadFontPx}px "Manrope", system-ui, -apple-system, sans-serif`;
  const fittedLocation = truncateCanvasText(ctx, locationLabel, layout.infoMaxWidth);
  ctx.fillText(fittedLocation, layout.infoX, layout.row2Y);

  // 6. Row 3: GPS Coordinates, Heading & Accuracy
  const coordsLabel = formatWatermarkCoordinates(gps);
  ctx.fillStyle = '#a5b4fc';
  ctx.font = `600 ${layout.coordsFontPx}px "JetBrains Mono", monospace`;
  const fittedCoords = truncateCanvasText(ctx, coordsLabel, layout.infoMaxWidth);
  ctx.fillText(fittedCoords, layout.infoX, layout.row3Y);

  ctx.restore();
}
