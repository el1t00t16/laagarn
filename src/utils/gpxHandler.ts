import { ComputedRoute, LatLngPoint } from './routingEngine';

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
 * Generates a valid, standards-compliant GPX 1.1 XML document
 * from a LAAGARN computed road route and stops.
 */
export function exportRouteToGpx(
  route: ComputedRoute,
  stops: LatLngPoint[] = []
): string {
  const timestamp = new Date().toISOString();
  const routeName = escapeXml(route.label || 'LAAGARN Route');

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LAAGARN - My Way, Your Travel Buddy (https://laagarn.web.app)"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${routeName}</name>
    <desc>Philippine corridor navigation route. Distance: ${route.totalDistanceKm} km, Duration: ${route.totalDurationMinutes} mins.</desc>
    <time>${timestamp}</time>
  </metadata>
`;

  // 1. Waypoints (Stops)
  stops.forEach((stop, index) => {
    const role =
      index === 0
        ? 'Departure'
        : index === stops.length - 1
        ? 'Destination'
        : `Stop ${index}`;
    xml += `  <wpt lat="${stop.lat.toFixed(6)}" lon="${stop.lng.toFixed(6)}">
    <name>${escapeXml(stop.name)}</name>
    <desc>${role} - ${escapeXml(stop.region || 'Philippines')}</desc>
    <type>${role}</type>
  </wpt>
`;
  });

  // 2. Track Segment (Coordinates)
  xml += `  <trk>
    <name>${routeName}</name>
    <trkseg>
`;

  route.coordinates.forEach(([lat, lng]) => {
    xml += `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>\n`;
  });

  xml += `    </trkseg>
  </trk>
</gpx>`;

  return xml;
}

/**
 * Initiates browser download of the generated GPX file.
 */
export function downloadGpxFile(
  route: ComputedRoute,
  stops: LatLngPoint[] = []
): void {
  if (typeof window === 'undefined') return;

  const gpxContent = exportRouteToGpx(route, stops);
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = (route.label || 'laagarn-route')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');

  anchor.href = url;
  anchor.download = `${safeName}.gpx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export interface ParsedGpxResult {
  name: string;
  stops: LatLngPoint[];
  coordinates: [number, number][];
}

/**
 * Parses a GPX XML string into stops and coordinates.
 * Works across browser DOMParser and node test environments.
 */
export function parseGpxFile(gpxString: string): ParsedGpxResult {
  let name = 'Imported GPX Track';
  const stops: LatLngPoint[] = [];
  const coordinates: [number, number][] = [];

  // 1. Extract Track Name
  const nameMatch = gpxString.match(/<name>([^<]+)<\/name>/i);
  if (nameMatch && nameMatch[1]) {
    name = nameMatch[1].trim();
  }

  // 2. Extract Waypoints (<wpt lat="..." lon="..."> ... <name>...</name> </wpt>)
  const wptRegex = /<wpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>(?:[\s\S]*?<name>([^<]+)<\/name>)?[\s\S]*?<\/wpt>/gi;
  let wptMatch: RegExpExecArray | null;
  let wptIndex = 1;

  while ((wptMatch = wptRegex.exec(gpxString)) !== null) {
    const lat = parseFloat(wptMatch[1]);
    const lng = parseFloat(wptMatch[2]);
    const stopName = wptMatch[3]?.trim() || `Waypoint ${wptIndex}`;
    if (!isNaN(lat) && !isNaN(lng)) {
      stops.push({
        name: stopName,
        lat,
        lng,
        region: 'GPX Import',
      });
      wptIndex++;
    }
  }

  // 3. Extract Track Points (<trkpt lat="..." lon="...">)
  const trkptRegex = /<trkpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["']/gi;
  let trkptMatch: RegExpExecArray | null;

  while ((trkptMatch = trkptRegex.exec(gpxString)) !== null) {
    const lat = parseFloat(trkptMatch[1]);
    const lng = parseFloat(trkptMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      coordinates.push([lat, lng]);
    }
  }

  // Fallback: If no waypoints were defined, use first and last trackpoint as Origin and Destination
  if (stops.length === 0 && coordinates.length >= 2) {
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    stops.push({
      name: `${name} (Start)`,
      lat: start[0],
      lng: start[1],
      region: 'Imported Route',
    });
    stops.push({
      name: `${name} (End)`,
      lat: end[0],
      lng: end[1],
      region: 'Imported Route',
    });
  }

  return {
    name,
    stops,
    coordinates,
  };
}
