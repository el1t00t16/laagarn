import { LatLngPoint, TrafficIncident } from './routingEngine';
import {
  searchOfflineEstablishments,
  establishmentToLatLngPoint,
} from './establishmentData';
import {
  searchTrafficLights,
  trafficLightToLatLngPoint,
} from './trafficLightData';

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
  // Southern Mindanao, Sarangani & Davao del Sur Highway Corridors
  { name: 'Malungon Municipal Hall', region: 'Malungon, Sarangani', lat: 6.2575, lng: 125.2633 },
  { name: 'Malandag Junction', region: 'Malungon, Sarangani', lat: 6.3686, lng: 125.2514 },
  { name: 'Sulop Municipal Hall', region: 'Sulop, Davao del Sur', lat: 6.6264, lng: 125.3444 },
  { name: 'Padada Public Terminal', region: 'Padada, Davao del Sur', lat: 6.6711, lng: 125.3622 },
  { name: 'Hagonoy Poblacion', region: 'Hagonoy, Davao del Sur', lat: 6.6917, lng: 125.3725 },
  { name: 'Digos City Rizal Park', region: 'Digos City, Davao del Sur', lat: 6.7570, lng: 125.3564 },
  { name: 'Santa Cruz Municipal Plaza', region: 'Santa Cruz, Davao del Sur', lat: 6.8378, lng: 125.4144 },
  { name: 'Bansalan Town Proper', region: 'Bansalan, Davao del Sur', lat: 6.7867, lng: 125.2150 },
  { name: 'Matanao Poblacion', region: 'Matanao, Davao del Sur', lat: 6.7025, lng: 125.2389 },
  { name: 'Kiblawan Municipal Hall', region: 'Kiblawan, Davao del Sur', lat: 6.5911, lng: 125.2578 },
  { name: 'Magsaysay Town Center', region: 'Magsaysay, Davao del Sur', lat: 6.7622, lng: 125.1844 },
  { name: 'Malita Port Plaza', region: 'Malita, Davao Occidental', lat: 6.4117, lng: 125.6117 },
  { name: 'Santa Maria Poblacion', region: 'Santa Maria, Davao Occidental', lat: 6.5517, lng: 125.4744 },
  { name: 'Polomolok Town Hall', region: 'Polomolok, South Cotabato', lat: 6.2208, lng: 125.0658 },
  { name: 'Tupi Public Market', region: 'Tupi, South Cotabato', lat: 6.3314, lng: 124.9525 },
  { name: 'Koronadal City Roundball (Marbel)', region: 'Koronadal City, South Cotabato', lat: 6.5028, lng: 124.8464 },
  { name: 'Alabel Sarangani Provincial Capitol', region: 'Alabel, Sarangani', lat: 6.1039, lng: 125.2917 },
  { name: 'Glan Town Hall', region: 'Glan, Sarangani', lat: 5.8239, lng: 125.2039 },
  { name: 'Maasim Municipal Hall', region: 'Maasim, Sarangani', lat: 5.8600, lng: 125.0100 },
  { name: 'Toril Public Market', region: 'Toril, Davao City', lat: 7.0183, lng: 125.5000 },
  { name: 'Tagum City Rotary Park', region: 'Tagum City, Davao del Norte', lat: 7.4478, lng: 125.8078 },
  { name: 'Panabo City Hall', region: 'Panabo City, Davao del Norte', lat: 7.3047, lng: 125.6842 },
  { name: 'Mati City Baywalk', region: 'Mati City, Davao Oriental', lat: 6.9550, lng: 126.2167 },
  { name: 'Kidapawan City Plaza', region: 'Kidapawan City, Cotabato', lat: 7.0083, lng: 125.0894 },
  { name: 'Cotabato City Plaza Pershing', region: 'Cotabato City, BARMM', lat: 7.2236, lng: 124.2464 },
  // Major Luzon & Visayas Corridors
  { name: 'Calamba City Plaza', region: 'Calamba, Laguna', lat: 14.2117, lng: 121.1656 },
  { name: 'Lipa City Plaza', region: 'Lipa City, Batangas', lat: 13.9419, lng: 121.1644 },
  { name: 'San Pablo City Cathedral', region: 'San Pablo, Laguna', lat: 14.0683, lng: 121.3256 },
  { name: 'Tarlac City Plazuela', region: 'Tarlac City, Tarlac', lat: 15.4802, lng: 120.5979 },
  { name: 'Urdaneta City Park', region: 'Urdaneta, Pangasinan', lat: 15.9761, lng: 120.5711 },
  { name: 'Dagupan City Plaza', region: 'Dagupan City, Pangasinan', lat: 16.0433, lng: 120.3333 },
  { name: 'San Fernando City Hall (La Union)', region: 'San Fernando, La Union', lat: 16.6158, lng: 120.3208 },
  { name: 'Carcar City Plaza', region: 'Carcar City, Cebu', lat: 10.1067, lng: 123.6425 },
  { name: 'Toledo City Port', region: 'Toledo City, Cebu', lat: 10.3789, lng: 123.6389 },
  { name: 'Roxas City Plaza', region: 'Roxas City, Capiz', lat: 11.5853, lng: 122.7511 },
  { name: 'Kalibo Pastrana Park', region: 'Kalibo, Aklan', lat: 11.7067, lng: 122.3644 },
  { name: 'Caticlan Jetty Port', region: 'Malay / Caticlan, Aklan', lat: 11.9367, lng: 121.9547 },
];

// Initial realistic Philippine Traffic Congestion & Heavy Traffic Hotspots
export const INITIAL_TRAFFIC_INCIDENTS: TrafficIncident[] = [
  {
    id: 'inc-edsa-guadalupe-heavy',
    title: 'Severe Stop-and-Go Gridlock',
    corridor: 'EDSA (Guadalupe to Shaw Blvd, Northbound)',
    type: 'congestion',
    severity: 'heavy',
    lat: 14.5675,
    lng: 121.0456,
    delayMinutes: 28,
    speedKmh: 8,
    description: 'Heavy vehicular volume around Guadalupe bridge with bottleneck into Shaw underpass.',
    updatedMinutesAgo: 4,
    active: true,
  },
  {
    id: 'inc-slex-alabang-heavy',
    title: 'Alabang Viaduct Merge Bottleneck',
    corridor: 'SLEX Alabang Viaduct (Northbound)',
    type: 'congestion',
    severity: 'heavy',
    lat: 14.4192,
    lng: 121.0442,
    delayMinutes: 24,
    speedKmh: 12,
    description: 'Lane reduction bottleneck from 5 lanes to 3 lanes over viaduct approach.',
    updatedMinutesAgo: 8,
    active: true,
  },
  {
    id: 'inc-c5-libis-heavy',
    title: 'C5 Eastwood Commercial Congestion',
    corridor: 'C5 E. Rodriguez Jr. Ave (Libis, Southbound)',
    type: 'congestion',
    severity: 'heavy',
    lat: 14.6094,
    lng: 121.0808,
    delayMinutes: 22,
    speedKmh: 11,
    description: 'Heavy commercial and truck volume merging around Eastwood flyover.',
    updatedMinutesAgo: 6,
    active: true,
  },
  {
    id: 'inc-nlex-bocaue-heavy',
    title: 'Toll Plaza Queue Congestion',
    corridor: 'NLEX Bocaue Tollway (Southbound)',
    type: 'congestion',
    severity: 'heavy',
    lat: 14.8014,
    lng: 120.9419,
    delayMinutes: 25,
    speedKmh: 14,
    description: 'Extended toll queue stretching 1.8km before Bocaue barrier.',
    updatedMinutesAgo: 10,
    active: true,
  },
  {
    id: 'inc-skyway-quezon-ave',
    title: 'Skyway Stage 3 Off-Ramp Heavy Traffic',
    corridor: 'Skyway Stage 3 (Quezon Ave Off-Ramp)',
    type: 'congestion',
    severity: 'heavy',
    lat: 14.6367,
    lng: 121.0189,
    delayMinutes: 18,
    speedKmh: 14,
    description: 'Slow-moving exit queue spilling back onto elevated expressway mainline.',
    updatedMinutesAgo: 12,
    active: true,
  },
  {
    id: 'inc-commonwealth-lane-squeeze',
    title: 'MRT-7 Works Lane Squeeze',
    corridor: 'Commonwealth Ave (Tandang Sora, Eastbound)',
    type: 'congestion',
    severity: 'heavy',
    lat: 14.6681,
    lng: 121.0664,
    delayMinutes: 20,
    speedKmh: 15,
    description: 'Heavy volume reduced to 2 lanes due to transit construction zone.',
    updatedMinutesAgo: 15,
    active: true,
  },
  {
    id: 'inc-cebu-banilad-heavy',
    title: 'Banilad-Talamban Corridor Gridlock',
    corridor: 'Gov. M. Cuenco Ave (Banilad, Cebu City)',
    type: 'congestion',
    severity: 'heavy',
    lat: 10.3456,
    lng: 123.9142,
    delayMinutes: 22,
    speedKmh: 10,
    description: 'Severe peak-hour crawl through commercial center and flyover merge.',
    updatedMinutesAgo: 5,
    active: true,
  },
  {
    id: 'inc-davao-matina-heavy',
    title: 'Matina Crossing Peak Hour Heavy Crawl',
    corridor: 'McArthur Highway (Matina, Davao City)',
    type: 'congestion',
    severity: 'heavy',
    lat: 7.0519,
    lng: 125.5878,
    delayMinutes: 18,
    speedKmh: 12,
    description: 'Heavy intersection back-up across Matina Galleria junction.',
    updatedMinutesAgo: 9,
    active: true,
  },
  {
    id: 'inc-tagaytay-rotonda-heavy',
    title: 'Tagaytay Ridge Tourist Traffic',
    corridor: 'Tagaytay Rotonda (Aguinaldo Highway junction)',
    type: 'congestion',
    severity: 'heavy',
    lat: 14.1153,
    lng: 120.9622,
    delayMinutes: 20,
    speedKmh: 12,
    description: 'High volume of vehicles heading towards Taal ridge restaurants and hotels.',
    updatedMinutesAgo: 11,
    active: true,
  },
];

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
  {
    id: 'pack-mindanao-davao-sarangani',
    name: 'Mindanao: Davao del Sur, Sarangani & GenSan Corridor',
    subtitle: 'Davao City, Digos, Sulop, Malungon, GenSan & South Cotabato (zoom 10–13)',
    southWest: { lat: 5.75, lng: 124.70 },
    northEast: { lat: 7.25, lng: 125.80 },
    center: { lat: 6.7570, lng: 125.3564 },
    zoomLevels: [10, 11, 12, 13],
    estimatedSizeMb: 4.5,
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

  // Check known establishments
  const estMatches = searchOfflineEstablishments(clean, { limit: 1 });
  if (estMatches.length > 0) {
    return establishmentToLatLngPoint(estMatches[0]);
  }

  // Check known traffic lights & signalized intersections
  const tlMatches = searchTrafficLights(clean, { limit: 1 });
  if (tlMatches.length > 0) {
    return trafficLightToLatLngPoint(tlMatches[0]);
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
