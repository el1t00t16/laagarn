import { haversineKmPrecise, LatLngPoint } from './routingEngine';
import { APP_CONFIG, fetchWithTimeout, isBrowserOnline } from './config';

export interface TrafficLight {
  id: string;
  name: string;
  intersection: string;
  corridor: string;
  region: string;
  lat: number;
  lng: number;
  junctionType: '4-way' | '3-way' | 't-junction' | 'pedestrian' | 'rotary';
  systemType: string;
  cycleSeconds?: number;
  features?: string[];
  distanceKm?: number;
}

/**
 * Curated offline registry of major signalized traffic light intersections
 * across Philippine urban centers and national arterial highways.
 */
export const KNOWN_TRAFFIC_LIGHTS: TrafficLight[] = [
  // ==================== METRO MANILA / EDSA ====================
  {
    id: 'tl-edsa-ayala',
    name: 'EDSA cor. Ayala Ave Signalized Intersection',
    intersection: 'EDSA & Ayala Avenue',
    corridor: 'EDSA / Ayala CBD Corridor',
    region: 'Makati City, NCR',
    lat: 14.5505,
    lng: 121.0283,
    junctionType: '4-way',
    systemType: 'MMDA Adaptive Smart Signal System',
    cycleSeconds: 120,
    features: ['Pedestrian Countdown', 'Bus Lane Priority', 'CCTV Enforced'],
  },
  {
    id: 'tl-edsa-buendia',
    name: 'EDSA cor. Sen. Gil Puyat (Buendia) Signal',
    intersection: 'EDSA & Sen. Gil Puyat Ave',
    corridor: 'EDSA Corridor',
    region: 'Makati City, NCR',
    lat: 14.5542,
    lng: 121.0317,
    junctionType: '4-way',
    systemType: 'MMDA Smart Traffic Signal',
    cycleSeconds: 110,
    features: ['U-Turn Slots', 'Pedestrian Crossing', 'Busway Access'],
  },
  {
    id: 'tl-edsa-shaw',
    name: 'EDSA cor. Shaw Blvd Underpass Signal',
    intersection: 'EDSA & Shaw Boulevard',
    corridor: 'EDSA / Ortigas Corridor',
    region: 'Mandaluyong City, NCR',
    lat: 14.5833,
    lng: 121.0531,
    junctionType: '4-way',
    systemType: 'MMDA Intelligent Traffic Signal',
    cycleSeconds: 130,
    features: ['Underpass Bypass', 'MRT-3 Link', 'Countdown Timers'],
  },
  {
    id: 'tl-edsa-quezon-ave',
    name: 'EDSA cor. Quezon Ave Signalized Rotonda',
    intersection: 'EDSA & Quezon Avenue',
    corridor: 'EDSA / Quezon Ave',
    region: 'Quezon City, NCR',
    lat: 14.6436,
    lng: 121.0389,
    junctionType: '4-way',
    systemType: 'MMDA Adaptive Signal Network',
    cycleSeconds: 120,
    features: ['Underpass Mainline', 'Left Turn Slots', 'Pedestrian Overpass'],
  },
  {
    id: 'tl-edsa-north-ave',
    name: 'EDSA cor. North Ave (SM North / Trinoma) Signal',
    intersection: 'EDSA & North Avenue',
    corridor: 'EDSA North Corridor',
    region: 'Quezon City, NCR',
    lat: 14.6536,
    lng: 121.0319,
    junctionType: '4-way',
    systemType: 'MMDA Intelligent Signal',
    cycleSeconds: 100,
    features: ['Transit Hub Integration', 'Pedestrian Countdown'],
  },

  // ==================== METRO MANILA / C5 & BGC ====================
  {
    id: 'tl-c5-ortigas',
    name: 'C5 cor. Ortigas Ave Signalized Interchange',
    intersection: 'C5 (E. Rodriguez Jr. Ave) & Ortigas Ave',
    corridor: 'C5 / Ortigas Corridor',
    region: 'Pasig City, NCR',
    lat: 14.5908,
    lng: 121.0767,
    junctionType: '4-way',
    systemType: 'Pasig City Intelligent Signal System',
    cycleSeconds: 140,
    features: ['Flyover Mainline', 'At-Grade Turning Signal', 'Heavy Truck Route'],
  },
  {
    id: 'tl-c5-kalayaan',
    name: 'C5 cor. Kalayaan Ave Signal',
    intersection: 'C5 & Kalayaan Avenue',
    corridor: 'C5 Corridor',
    region: 'Makati / Taguig, NCR',
    lat: 14.5558,
    lng: 121.0608,
    junctionType: '3-way',
    systemType: 'MMDA Traffic Light Network',
    cycleSeconds: 90,
    features: ['Elevated U-turn Link', 'BGC East Entrance'],
  },
  {
    id: 'tl-c5-32nd-bgc',
    name: 'C5 cor. 32nd St Signal (BGC Entry)',
    intersection: 'C5 & 32nd Street',
    corridor: 'C5 / BGC Gateway',
    region: 'Taguig City, NCR',
    lat: 14.5489,
    lng: 121.0583,
    junctionType: '3-way',
    systemType: 'BGC Smart Traffic Management',
    cycleSeconds: 90,
    features: ['Signalized Left Turn', 'BGC North Gate'],
  },
  {
    id: 'tl-ayala-paseo',
    name: 'Ayala Ave cor. Paseo de Roxas Signal',
    intersection: 'Ayala Ave & Paseo de Roxas',
    corridor: 'Makati CBD Central Spine',
    region: 'Makati City, NCR',
    lat: 14.5547,
    lng: 121.0219,
    junctionType: '4-way',
    systemType: 'Makati CBD Automated Light System',
    cycleSeconds: 90,
    features: ['Audible Pedestrian Beacon', 'Countdown Display', 'Underground Walkway'],
  },
  {
    id: 'tl-ayala-makati-ave',
    name: 'Ayala Ave cor. Makati Ave Signal',
    intersection: 'Ayala Ave & Makati Avenue',
    corridor: 'Makati CBD Central Spine',
    region: 'Makati City, NCR',
    lat: 14.5522,
    lng: 121.0264,
    junctionType: '4-way',
    systemType: 'Makati CBD Automated Light System',
    cycleSeconds: 90,
    features: ['Pedestrian Priority Phase', 'LED Countdown Display'],
  },

  // ==================== TAFT & ROXAS CORRIDORS ====================
  {
    id: 'tl-taft-vito-cruz',
    name: 'Taft Ave cor. Pablo Ocampo (Vito Cruz) Signal',
    intersection: 'Taft Ave & P. Ocampo St',
    corridor: 'Taft Ave / University Belt',
    region: 'City of Manila, NCR',
    lat: 14.5636,
    lng: 120.9947,
    junctionType: '4-way',
    systemType: 'Manila City Traffic Signal System',
    cycleSeconds: 100,
    features: ['LRT-1 Vito Cruz Station', 'Student Pedestrian Phase'],
  },
  {
    id: 'tl-taft-pedro-gil',
    name: 'Taft Ave cor. Pedro Gil St Signal',
    intersection: 'Taft Ave & Pedro Gil St',
    corridor: 'Taft Ave / PGH Corridor',
    region: 'City of Manila, NCR',
    lat: 14.5772,
    lng: 120.9897,
    junctionType: '4-way',
    systemType: 'Manila City Smart Traffic Signal',
    cycleSeconds: 110,
    features: ['PGH Emergency Ambulance Priority', 'Pedestrian Crosswalk'],
  },
  {
    id: 'tl-roxas-buendia',
    name: 'Roxas Blvd cor. Sen. Gil Puyat (Buendia) Signal',
    intersection: 'Roxas Blvd & Sen. Gil Puyat Ave',
    corridor: 'Roxas Blvd Coastal Arterial',
    region: 'Pasay City, NCR',
    lat: 14.5539,
    lng: 120.9889,
    junctionType: '4-way',
    systemType: 'MMDA Arterial Signal Network',
    cycleSeconds: 120,
    features: ['Coastal Scenic Corridor', 'Left Turn Phase', 'Container Truck Route'],
  },
  {
    id: 'tl-roxas-edsa',
    name: 'Roxas Blvd cor. EDSA Extension Signal',
    intersection: 'Roxas Blvd & EDSA Extension',
    corridor: 'EDSA / Roxas Junction',
    region: 'Pasay City, NCR',
    lat: 14.5367,
    lng: 120.9889,
    junctionType: '4-way',
    systemType: 'MMDA Smart Traffic System',
    cycleSeconds: 110,
    features: ['MOA Approach', 'Heritage Boulevard Link'],
  },

  // ==================== QUEZON CITY & COMMONWEALTH ====================
  {
    id: 'tl-commonwealth-tandang-sora',
    name: 'Commonwealth Ave cor. Tandang Sora Signal',
    intersection: 'Commonwealth Ave & Tandang Sora',
    corridor: 'Commonwealth Highway Corridor',
    region: 'Quezon City, NCR',
    lat: 14.6681,
    lng: 121.0664,
    junctionType: '4-way',
    systemType: 'MMDA Wide Highway Adaptive Signal',
    cycleSeconds: 130,
    features: ['Multi-Lane Traffic', 'Motorcycle Lane Delineated', 'MRT-7 Works'],
  },
  {
    id: 'tl-espana-morayta',
    name: 'España Blvd cor. Nicanor Reyes (Morayta) Signal',
    intersection: 'España Blvd & N. Reyes St',
    corridor: 'España University Belt',
    region: 'City of Manila, NCR',
    lat: 14.6042,
    lng: 120.9892,
    junctionType: '4-way',
    systemType: 'Manila City Traffic Bureau Signal',
    cycleSeconds: 95,
    features: ['High Pedestrian Volume', 'UST Campus Crosswalk'],
  },

  // ==================== CALABARZON ====================
  {
    id: 'tl-aguinaldo-bacoor',
    name: 'Aguinaldo Highway cor. Tirona Highway Signal',
    intersection: 'Aguinaldo Hwy & Tirona Hwy (SM Bacoor)',
    corridor: 'Aguinaldo Highway Cavite Arterial',
    region: 'Bacoor, Cavite',
    lat: 14.4533,
    lng: 120.9497,
    junctionType: '4-way',
    systemType: 'Cavite Provincial Highway Signal',
    cycleSeconds: 110,
    features: ['Coastal Road Flyover Entry', 'High Volume PUV Stop'],
  },
  {
    id: 'tl-tagaytay-rotonda',
    name: 'Tagaytay Rotonda Junction Signal',
    intersection: 'Aguinaldo Hwy, Tagaytay-Calamba Rd & Mahogany Ave',
    corridor: 'Tagaytay Ridge Hub',
    region: 'Tagaytay City, Cavite',
    lat: 14.1153,
    lng: 120.9622,
    junctionType: 'rotary',
    systemType: 'Tagaytay City Roundabout Signal System',
    cycleSeconds: 90,
    features: ['Rotonda Roundabout Metering', 'Weekend Tourist Flow'],
  },
  {
    id: 'tl-santa-rosa-nuvali',
    name: 'Santa Rosa-Tagaytay Rd cor. Nuvali Blvd Signal',
    intersection: 'Santa Rosa-Tagaytay Rd & Nuvali Blvd',
    corridor: 'Santa Rosa Commercial Corridor',
    region: 'Santa Rosa, Laguna',
    lat: 14.2389,
    lng: 121.0583,
    junctionType: '4-way',
    systemType: 'Nuvali Estate Intelligent Traffic Light',
    cycleSeconds: 85,
    features: ['Bicycle Phase', 'Pedestrian Crossing', 'Mall Access'],
  },

  // ==================== CEBU / CENTRAL VISAYAS ====================
  {
    id: 'tl-cebu-fuente',
    name: 'Fuente Osmeña cor. B. Rodriguez St Signal',
    intersection: 'Fuente Osmeña Circle & B. Rodriguez St',
    corridor: 'Fuente Osmeña Uptown Corridor',
    region: 'Cebu City, Central Visayas',
    lat: 10.3114,
    lng: 123.8942,
    junctionType: 'rotary',
    systemType: 'CCTO SCATS Adaptive Traffic Light System',
    cycleSeconds: 100,
    features: ['Hospital Emergency Route', 'Rotary Metering Signal'],
  },
  {
    id: 'tl-cebu-colon',
    name: 'Colon St cor. Osmeña Blvd Signal',
    intersection: 'Colon St & Osmeña Blvd',
    corridor: 'Downtown Historic Cebu',
    region: 'Cebu City, Central Visayas',
    lat: 10.2975,
    lng: 123.8992,
    junctionType: '4-way',
    systemType: 'CCTO SCATS Traffic Control System',
    cycleSeconds: 90,
    features: ['Historic District Crosswalk', 'Countdown Display'],
  },
  {
    id: 'tl-cebu-itpark',
    name: 'Salinas Drive cor. Cebu IT Park Gov. Cuenco Signal',
    intersection: 'Salinas Drive & Gov. M. Cuenco Ave',
    corridor: 'Lahug / IT Park Corridor',
    region: 'Cebu City, Central Visayas',
    lat: 10.3294,
    lng: 123.9056,
    junctionType: '4-way',
    systemType: 'CCTO Computerized Traffic Signal',
    cycleSeconds: 110,
    features: ['24/7 BPO Traffic Adaptive', 'Pedestrian Countdown'],
  },
  {
    id: 'tl-cebu-sm-reclamation',
    name: 'Juan Luna Ave cor. A. Soriano Ave Signal (SM Cebu)',
    intersection: 'Juan Luna Ave & A. Soriano Ave',
    corridor: 'North Reclamation Port Corridor',
    region: 'Cebu City, Central Visayas',
    lat: 10.3125,
    lng: 123.9189,
    junctionType: '4-way',
    systemType: 'CCTO SCATS Traffic Signal',
    cycleSeconds: 115,
    features: ['Port Container Truck Route', 'Mall Customer Crossing'],
  },

  // ==================== DAVAO / SOUTHERN MINDANAO ====================
  {
    id: 'tl-davao-matina',
    name: 'McArthur Highway cor. Tulip Drive Signal (Matina)',
    intersection: 'McArthur Highway & Tulip Drive',
    corridor: 'Davao South Arterial Corridor',
    region: 'Davao City, Davao del Sur',
    lat: 7.0519,
    lng: 125.5878,
    junctionType: '4-way',
    systemType: 'CTTMO SCATS Computerized Traffic Signal',
    cycleSeconds: 110,
    features: ['CCTV Speed Monitoring', 'High-Capacity Highway Signal'],
  },
  {
    id: 'tl-davao-claveria',
    name: 'C.M. Recto Ave cor. San Pedro St Signal',
    intersection: 'C.M. Recto (Claveria) & San Pedro St',
    corridor: 'Davao City Center Spine',
    region: 'Davao City, Davao del Sur',
    lat: 7.0683,
    lng: 125.6111,
    junctionType: '4-way',
    systemType: 'CTTMO Smart Traffic Light Network',
    cycleSeconds: 85,
    features: ['City Hall Zone', 'Countdown Timer', 'Pedestrian Crossing'],
  },
  {
    id: 'tl-davao-bajada',
    name: 'J.P. Laurel Ave cor. R. Castillo St Signal (Bajada)',
    intersection: 'J.P. Laurel Ave & R. Castillo St',
    corridor: 'Bajada North Arterial',
    region: 'Davao City, Davao del Sur',
    lat: 7.0864,
    lng: 125.6111,
    junctionType: '4-way',
    systemType: 'CTTMO SCATS Traffic Signal System',
    cycleSeconds: 115,
    features: ['Mall & Hospital Corridor', 'Emergency Vehicle Preemption'],
  },
  {
    id: 'tl-gensan-pioneer',
    name: 'Pioneer Ave cor. Santiago Blvd Signal',
    intersection: 'Pioneer Ave & Santiago Blvd',
    corridor: 'General Santos City Core',
    region: 'General Santos City, South Cotabato',
    lat: 6.1189,
    lng: 125.1783,
    junctionType: '4-way',
    systemType: 'GenSan City Traffic Engineering Signal',
    cycleSeconds: 90,
    features: ['Oval Plaza Junction', 'Countdown Timer'],
  },
];

export interface TrafficLightSearchOptions {
  nearLat?: number;
  nearLng?: number;
  radiusKm?: number;
  limit?: number;
}

/**
 * Search traffic lights with optional proximity ranking.
 */
export function searchTrafficLights(
  query: string,
  options?: TrafficLightSearchOptions
): TrafficLight[] {
  const q = query.trim().toLowerCase();
  let list = [...KNOWN_TRAFFIC_LIGHTS];

  if (q.length > 0) {
    list = list.filter((tl) => {
      const matchName = tl.name.toLowerCase().includes(q);
      const matchIntersection = tl.intersection.toLowerCase().includes(q);
      const matchCorridor = tl.corridor.toLowerCase().includes(q);
      const matchRegion = tl.region.toLowerCase().includes(q);
      const matchSystem = tl.systemType.toLowerCase().includes(q);
      return matchName || matchIntersection || matchCorridor || matchRegion || matchSystem;
    });
  }

  if (options?.nearLat !== undefined && options?.nearLng !== undefined) {
    const ref = { lat: options.nearLat, lng: options.nearLng };
    list = list.map((tl) => ({
      ...tl,
      distanceKm: Number(haversineKmPrecise(ref, { lat: tl.lat, lng: tl.lng }).toFixed(2)),
    }));

    if (options.radiusKm && options.radiusKm > 0) {
      list = list.filter((tl) => tl.distanceKm! <= options.radiusKm!);
    }

    list.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }

  const limit = options?.limit ?? 30;
  return list.slice(0, limit);
}

/**
 * Convert TrafficLight to LatLngPoint for route planning.
 */
export function trafficLightToLatLngPoint(tl: TrafficLight): LatLngPoint {
  return {
    name: tl.name,
    region: `${tl.intersection}, ${tl.region}`,
    lat: tl.lat,
    lng: tl.lng,
  };
}
