import { LatLngPoint, TrafficIncident } from './routingEngine';

export interface OfflineRegionPack {
  id: string;
  name: string;
  subtitle: string;
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };
  center: { lat: number; lng: number };
  zoomLevels: number[];
  estimatedSizeMb: number;
}

// Strict geographic bounding box for the Philippine Archipelago
export const PHILIPPINES_BOUNDS = {
  southWest: { lat: 4.4, lng: 116.5 },
  northEast: { lat: 21.3, lng: 127.0 },
  defaultCenter: { lat: 14.5826, lng: 120.9787 },
};

// Reference Philippine landmarks for offline gazetteer lookup & unit tests
export const KNOWN_LOCATIONS: LatLngPoint[] = [
  {
    name: 'Manila Rizal Park (Luneta)',
    region: 'City of Manila, NCR',
    lat: 14.5826,
    lng: 120.9787,
  },
  {
    name: 'Makati Ayala Center',
    region: 'Makati City, NCR',
    lat: 14.5509,
    lng: 121.0244,
  },
  {
    name: 'NAIA Terminal 3 (Pasay)',
    region: 'Pasay City, NCR',
    lat: 14.5204,
    lng: 121.0138,
  },
  {
    name: 'Quezon Memorial Circle',
    region: 'Quezon City, NCR',
    lat: 14.6516,
    lng: 121.0493,
  },
  {
    name: 'Bonifacio Global City (BGC High Street)',
    region: 'Taguig City, NCR',
    lat: 14.5505,
    lng: 121.0514,
  },
  {
    name: 'Tagaytay Sky Ranch Ridge',
    region: 'Cavite, CALABARZON',
    lat: 14.0953,
    lng: 120.938,
  },
  {
    name: 'Batangas International Port',
    region: 'Batangas City, CALABARZON',
    lat: 13.7544,
    lng: 121.0442,
  },
  {
    name: 'Clark International Airport',
    region: 'Angeles / Mabalacat, Pampanga',
    lat: 15.1859,
    lng: 120.5603,
  },
  {
    name: 'Baguio Burnham Park',
    region: 'Baguio City, Benguet',
    lat: 16.4124,
    lng: 120.5929,
  },
  {
    name: 'Cebu IT Park (Lahug)',
    region: 'Cebu City, Central Visayas',
    lat: 10.3307,
    lng: 123.9064,
  },
  {
    name: 'Mactan–Cebu International Airport',
    region: 'Lapu-Lapu City, Cebu',
    lat: 10.3075,
    lng: 123.9794,
  },
  {
    name: 'Davao People’s Park',
    region: 'Davao City, Davao del Sur',
    lat: 7.0707,
    lng: 125.6114,
  },
  { name: 'Iloilo City Hall', region: 'Iloilo City, Western Visayas', lat: 10.6969, lng: 122.5644 },
  { name: 'Bacolod Public Plaza', region: 'Bacolod City, Negros Occidental', lat: 10.6667, lng: 122.9506 },
  { name: 'Cagayan de Oro Divisoria', region: 'Cagayan de Oro, Misamis Oriental', lat: 8.4822, lng: 124.6472 },
  { name: 'Zamboanga City Hall', region: 'Zamboanga City, Zamboanga Peninsula', lat: 6.9047, lng: 122.0761 },
  { name: 'General Santos Oval Plaza', region: 'General Santos, South Cotabato', lat: 6.1128, lng: 125.1717 },
  { name: 'Puerto Princesa Baywalk', region: 'Puerto Princesa, Palawan', lat: 9.7392, lng: 118.7353 },
  { name: 'El Nido Town Proper', region: 'El Nido, Palawan', lat: 11.1956, lng: 119.4075 },
  { name: 'Boracay Station 2 (White Beach)', region: 'Malay, Aklan', lat: 11.9585, lng: 121.9254 },
  { name: 'Tagbilaran City Port', region: 'Tagbilaran, Bohol', lat: 9.6475, lng: 123.8556 },
  { name: 'Dumaguete Rizal Boulevard', region: 'Dumaguete, Negros Oriental', lat: 9.3103, lng: 123.3081 },
  { name: 'Tacloban Astrodome', region: 'Tacloban City, Leyte', lat: 11.2333, lng: 125.0033 },
  { name: 'Legazpi Embarcadero', region: 'Legazpi City, Albay', lat: 13.1450, lng: 123.7536 },
  { name: 'Naga Plaza Rizal', region: 'Naga City, Camarines Sur', lat: 13.6236, lng: 123.1856 },
  { name: 'Vigan Calle Crisologo', region: 'Vigan City, Ilocos Sur', lat: 17.5714, lng: 120.3869 },
  { name: 'Laoag City Hall', region: 'Laoag City, Ilocos Norte', lat: 18.1978, lng: 120.5936 },
  { name: 'Tuguegarao City Hall', region: 'Tuguegarao, Cagayan', lat: 17.6131, lng: 121.7269 },
  { name: 'San Fernando Pampanga Capitol', region: 'San Fernando, Pampanga', lat: 15.0286, lng: 120.6939 },
  { name: 'Subic Bay Freeport', region: 'Olongapo / Subic, Zambales', lat: 14.8136, lng: 120.2847 },
  { name: 'Antipolo Cathedral', region: 'Antipolo, Rizal', lat: 14.5869, lng: 121.1756 },
  { name: 'Santa Rosa Laguna (Nuvali)', region: 'Santa Rosa, Laguna', lat: 14.2333, lng: 121.0556 },
  { name: 'Lucena Grand Terminal', region: 'Lucena City, Quezon', lat: 13.9411, lng: 121.6236 },
  { name: 'Butuan City Hall', region: 'Butuan, Agusan del Norte', lat: 8.9475, lng: 125.5406 },
  { name: 'Surigao City Port', region: 'Surigao City, Surigao del Norte', lat: 9.7869, lng: 125.4958 },
];

// Clean initial traffic state — no pre-seeded sample incidents
export const INITIAL_TRAFFIC_INCIDENTS: TrafficIncident[] = [];

export const OFFLINE_REGION_PACKS: OfflineRegionPack[] = [
  {
    id: 'pack-metro-manila',
    name: 'Metro Manila & Greater NCR Core',
    subtitle: 'Manila, Quezon City, Makati, BGC, Pasay, NAIA & EDSA/Skyway (street detail, zoom 10–15)',
    southWest: { lat: 14.46, lng: 120.94 },
    northEast: { lat: 14.70, lng: 121.10 },
    center: { lat: 14.5826, lng: 121.015 },
    zoomLevels: [10, 11, 12, 13, 14, 15],
    estimatedSizeMb: 7,
  },
  {
    id: 'pack-calabarzon-tagaytay',
    name: 'CALABARZON: Tagaytay, Cavite & Batangas Corridor',
    subtitle: 'SLEX, CALAX, Aguinaldo Hwy, Taal Ridge & Batangas Port (zoom 10–13)',
    southWest: { lat: 13.72, lng: 120.88 },
    northEast: { lat: 14.35, lng: 121.18 },
    center: { lat: 14.0953, lng: 120.938 },
    zoomLevels: [10, 11, 12, 13],
    estimatedSizeMb: 2.5,
  },
  {
    id: 'pack-north-luzon-baguio',
    name: 'Central Luzon (Clark) & Baguio Cordillera Pack',
    subtitle: 'NLEX, SCTEX, TPLEX, Pampanga & Baguio mountain highways (zoom 10–13)',
    southWest: { lat: 15.12, lng: 120.50 },
    northEast: { lat: 16.46, lng: 120.66 },
    center: { lat: 16.4124, lng: 120.5929 },
    zoomLevels: [10, 11, 12, 13],
    estimatedSizeMb: 2.5,
  },
  {
    id: 'pack-metro-cebu',
    name: 'Metro Cebu & Mactan Island Hub',
    subtitle: 'Cebu City, Mandaue, CCLEX Bridge & Mactan Airport (street detail, zoom 10–15)',
    southWest: { lat: 10.24, lng: 123.85 },
    northEast: { lat: 10.40, lng: 124.02 },
    center: { lat: 10.3307, lng: 123.9064 },
    zoomLevels: [10, 11, 12, 13, 14, 15],
    estimatedSizeMb: 6,
  },
];

export function clampToPhilippines(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Number(
      Math.max(
        PHILIPPINES_BOUNDS.southWest.lat,
        Math.min(PHILIPPINES_BOUNDS.northEast.lat, lat)
      ).toFixed(4)
    ),
    lng: Number(
      Math.max(
        PHILIPPINES_BOUNDS.southWest.lng,
        Math.min(PHILIPPINES_BOUNDS.northEast.lng, lng)
      ).toFixed(4)
    ),
  };
}

export function resolveLocationInput(
  query: string,
  _fallbackCoords?: { lat: number; lng: number }
): LatLngPoint | null {
  const clean = query.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const exactOrPartial =
    KNOWN_LOCATIONS.find((loc) => loc.name.toLowerCase() === lower) ||
    KNOWN_LOCATIONS.find(
      (loc) =>
        loc.name.toLowerCase().includes(lower) ||
        (loc.region && loc.region.toLowerCase().includes(lower))
    );
  if (exactOrPartial) {
    return exactOrPartial;
  }

  // "lat, lng" input
  const coordMatch = clean.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[3]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return {
        name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        region: 'Coordinate',
        lat,
        lng,
      };
    }
  }

  // Unknown place: never invent a coordinate (the old behaviour silently routed
  // users to a pseudo-random point near Manila).
  return null;
}
