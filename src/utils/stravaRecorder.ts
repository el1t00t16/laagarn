import { haversineKmPrecise } from './routingEngine';
import { estimatePhilippineElevation } from './elevationProfile';

export interface StravaTrackPoint {
  lat: number;
  lng: number;
  ele?: number; // Elevation in meters
  time: string; // ISO 8601 UTC timestamp e.g. "2026-11-05T09:50:00.000Z"
  speedKmh?: number;
  heading?: number;
}

export type StravaSportType = 'VirtualRide' | 'Ride' | 'Run' | 'Walk' | 'Drive';

export interface StravaActivityStats {
  totalDistanceKm: number;
  elapsedSeconds: number;
  movingSeconds: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  elevationGainM: number;
  elevationLossM: number;
  startTime: Date | null;
  endTime: Date | null;
  pointCount: number;
}

/**
 * Escapes special XML characters for safe GPX output.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculates comprehensive Strava-style metrics from a sequence of trackpoints.
 */
export function calculateStravaStats(points: StravaTrackPoint[]): StravaActivityStats {
  if (points.length === 0) {
    return {
      totalDistanceKm: 0,
      elapsedSeconds: 0,
      movingSeconds: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      startTime: null,
      endTime: null,
      pointCount: 0,
    };
  }

  const startTime = new Date(points[0].time);
  const endTime = new Date(points[points.length - 1].time);
  const elapsedSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));

  let totalDistanceKm = 0;
  let movingSeconds = 0;
  let maxSpeedKmh = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const speed = pt.speedKmh || 0;
    if (speed > maxSpeedKmh) {
      maxSpeedKmh = speed;
    }

    if (i > 0) {
      const prev = points[i - 1];
      const dist = haversineKmPrecise(
        { lat: prev.lat, lng: prev.lng },
        { lat: pt.lat, lng: pt.lng }
      );
      totalDistanceKm += dist;

      const segDt = Math.max(
        0,
        (new Date(pt.time).getTime() - new Date(prev.time).getTime()) / 1000
      );
      // If moving faster than 1 km/h, count as moving time
      if (speed > 1 || (dist > 0.0005 && segDt < 30)) {
        movingSeconds += segDt;
      }

      const prevEle = prev.ele ?? estimatePhilippineElevation(prev.lat, prev.lng);
      const currEle = pt.ele ?? estimatePhilippineElevation(pt.lat, pt.lng);
      const eleDiff = currEle - prevEle;
      if (eleDiff > 0.5) {
        elevationGainM += eleDiff;
      } else if (eleDiff < -0.5) {
        elevationLossM += Math.abs(eleDiff);
      }
    }
  }

  const movingHours = movingSeconds > 0 ? movingSeconds / 3600 : elapsedSeconds / 3600;
  const avgSpeedKmh = movingHours > 0 ? Number((totalDistanceKm / movingHours).toFixed(1)) : 0;

  return {
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    elapsedSeconds,
    movingSeconds: Math.round(movingSeconds),
    avgSpeedKmh,
    maxSpeedKmh: Number(maxSpeedKmh.toFixed(1)),
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
    startTime,
    endTime,
    pointCount: points.length,
  };
}

/**
 * Generates an official, standards-compliant Strava GPX 1.1 file
 * with required monotonic ISO timestamps, elevation, and speed extensions.
 */
export function generateStravaGpx(
  activityName: string,
  points: StravaTrackPoint[],
  sportType: StravaSportType = 'VirtualRide',
  description?: string
): string {
  const safeName = escapeXml(activityName || 'LAAGARN GPS Activity');
  const safeDesc = escapeXml(
    description ||
      `Recorded with LAAGARN GPS Navigation. Track length: ${points.length} points.`
  );
  const nowIso = new Date().toISOString();
  const timeStr = points.length > 0 ? points[0].time : nowIso;

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1"
     creator="LAAGARN - My Way, Your Travel Buddy (https://laagarn.web.app)"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd
     http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">
  <metadata>
    <name>${safeName}</name>
    <desc>${safeDesc}</desc>
    <time>${timeStr}</time>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <type>${sportType}</type>
    <trkseg>
`;

  points.forEach((pt) => {
    const ele = pt.ele !== undefined ? pt.ele : estimatePhilippineElevation(pt.lat, pt.lng);
    const speedMs = pt.speedKmh ? (pt.speedKmh / 3.6).toFixed(2) : '0.00';

    gpx += `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">
        <ele>${ele.toFixed(1)}</ele>
        <time>${pt.time}</time>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:speed>${speedMs}</gpxtpx:speed>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>\n`;
  });

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  return gpx;
}

/**
 * Triggers a browser download of the Strava-ready GPX file.
 */
export function downloadStravaGpx(
  activityName: string,
  points: StravaTrackPoint[],
  sportType: StravaSportType = 'VirtualRide'
): void {
  if (typeof window === 'undefined' || points.length === 0) return;

  const gpxData = generateStravaGpx(activityName, points, sportType);
  const blob = new Blob([gpxData], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const cleanDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const cleanName = (activityName || 'strava_activity')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');

  a.href = url;
  a.download = `${cleanName}_${cleanDate}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Formats duration in seconds to "HH:MM:SS" or "MM:SS".
 */
export function formatDurationSec(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
