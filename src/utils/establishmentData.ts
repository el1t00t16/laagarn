import { haversineKmPrecise, LatLngPoint } from './routingEngine';
import { APP_CONFIG, fetchWithTimeout, isBrowserOnline, readJson, writeJson } from './config';

export type EstablishmentCategory =
  | 'fuel'
  | 'food'
  | 'mall'
  | 'convenience'
  | 'hospital'
  | 'pharmacy'
  | 'bank'
  | 'hotel'
  | 'transit'
  | 'services';

export interface Establishment {
  id: string;
  name: string;
  category: EstablishmentCategory;
  categoryLabel: string;
  brand?: string;
  address: string;
  region: string;
  lat: number;
  lng: number;
  openingHours?: string;
  phone?: string;
  features?: string[];
  rating?: number;
  distanceKm?: number;
}

export interface CategoryMeta {
  id: EstablishmentCategory;
  label: string;
  iconName: string;
  color: string;
  bgLight: string;
  bgDark: string;
  emoji: string;
}

export const ESTABLISHMENT_CATEGORIES: CategoryMeta[] = [
  {
    id: 'fuel',
    label: 'Gas & EV Fuel',
    iconName: 'Fuel',
    color: '#f59e0b',
    bgLight: '#fef3c7',
    bgDark: 'rgba(245, 158, 11, 0.18)',
    emoji: '⛽',
  },
  {
    id: 'food',
    label: 'Food & Dining',
    iconName: 'Utensils',
    color: '#f43f5e',
    bgLight: '#ffe4e6',
    bgDark: 'rgba(244, 63, 94, 0.18)',
    emoji: '🍔',
  },
  {
    id: 'mall',
    label: 'Malls & Retail',
    iconName: 'ShoppingBag',
    color: '#a855f7',
    bgLight: '#f3e8ff',
    bgDark: 'rgba(168, 85, 247, 0.18)',
    emoji: '🛍️',
  },
  {
    id: 'convenience',
    label: '24/7 Stores',
    iconName: 'Store',
    color: '#06b6d4',
    bgLight: '#cffafe',
    bgDark: 'rgba(6, 182, 212, 0.18)',
    emoji: '🏪',
  },
  {
    id: 'hospital',
    label: 'Hospitals & Medical',
    iconName: 'Hospital',
    color: '#ef4444',
    bgLight: '#fee2e2',
    bgDark: 'rgba(239, 68, 68, 0.18)',
    emoji: '🏥',
  },
  {
    id: 'pharmacy',
    label: 'Pharmacies',
    iconName: 'Pill',
    color: '#10b981',
    bgLight: '#d1fae5',
    bgDark: 'rgba(16, 185, 129, 0.18)',
    emoji: '💊',
  },
  {
    id: 'bank',
    label: 'Banks & ATMs',
    iconName: 'Landmark',
    color: '#3b82f6',
    bgLight: '#dbeafe',
    bgDark: 'rgba(59, 130, 246, 0.18)',
    emoji: '🏦',
  },
  {
    id: 'hotel',
    label: 'Hotels & Lodging',
    iconName: 'Hotel',
    color: '#6366f1',
    bgLight: '#e0e7ff',
    bgDark: 'rgba(99, 102, 241, 0.18)',
    emoji: '🏨',
  },
  {
    id: 'transit',
    label: 'Transit Terminals',
    iconName: 'Building2',
    color: '#8b5cf6',
    bgLight: '#ede9fe',
    bgDark: 'rgba(139, 92, 246, 0.18)',
    emoji: '🚌',
  },
];

/**
 * Rich seed gazetteer of popular and critical Philippine establishments.
 * Available 100% offline across NCR, CALABARZON, Central Luzon, Visayas, and Mindanao.
 */
export const KNOWN_ESTABLISHMENTS: Establishment[] = [
  // ==================== FUEL & GAS STATIONS ====================
  {
    id: 'fuel-petron-slex-south',
    name: 'Petron SLEX Southbound Mega Station',
    category: 'fuel',
    categoryLabel: 'Gas Station & Rest Stop',
    brand: 'Petron',
    address: 'South Luzon Expressway (KM 23), San Pedro',
    region: 'Laguna, CALABARZON',
    lat: 14.3642,
    lng: 121.0503,
    openingHours: '24/7',
    features: ['24/7', 'Restrooms', 'ATM', 'Food Court', 'Air/Water'],
    rating: 4.6,
  },
  {
    id: 'fuel-shell-slex-north',
    name: 'Shell SLEX Northbound Mamplasan',
    category: 'fuel',
    categoryLabel: 'Gas Station & Service Bay',
    brand: 'Shell',
    address: 'SLEX Northbound, Mamplasan, Biñan',
    region: 'Laguna, CALABARZON',
    lat: 14.3167,
    lng: 121.0833,
    openingHours: '24/7',
    features: ['24/7', 'Shell Select', 'EV Charging', 'ATM', 'Deli2Go'],
    rating: 4.7,
  },
  {
    id: 'fuel-caltex-slex-south',
    name: 'Caltex SLEX Southbound Station',
    category: 'fuel',
    categoryLabel: 'Gas Station & Rest Plaza',
    brand: 'Caltex',
    address: 'SLEX Southbound, San Pedro',
    region: 'Laguna, CALABARZON',
    lat: 14.3528,
    lng: 121.0556,
    openingHours: '24/7',
    features: ['24/7', '7-Eleven', 'Restrooms', 'Techron Fuel'],
    rating: 4.4,
  },
  {
    id: 'fuel-petron-nlex-north',
    name: 'Petron NLEX Northbound Mega Station',
    category: 'fuel',
    categoryLabel: 'Gas Station & Expressway Center',
    brand: 'Petron',
    address: 'North Luzon Expressway (KM 23), Marilao',
    region: 'Bulacan, Central Luzon',
    lat: 14.7725,
    lng: 120.9575,
    openingHours: '24/7',
    features: ['24/7', 'Food Court', 'Car Wash', 'Clean Restrooms', 'ATM'],
    rating: 4.6,
  },
  {
    id: 'fuel-shell-nlex-south',
    name: 'Shell NLEX Southbound Balagtas',
    category: 'fuel',
    categoryLabel: 'Gas Station & Travel Oasis',
    brand: 'Shell',
    address: 'NLEX Southbound, Balagtas',
    region: 'Bulacan, Central Luzon',
    lat: 14.8167,
    lng: 120.9083,
    openingHours: '24/7',
    features: ['24/7', 'Shell Select', 'Restaurants', 'ATM', 'EV Charging'],
    rating: 4.6,
  },
  {
    id: 'fuel-petron-edsa-sierra',
    name: 'Petron EDSA Sierra Madre',
    category: 'fuel',
    categoryLabel: 'Gas Station & Quick Service',
    brand: 'Petron',
    address: 'EDSA cor. Sierra Madre St., Mandaluyong',
    region: 'Metro Manila, NCR',
    lat: 14.5772,
    lng: 121.0494,
    openingHours: '24/7',
    features: ['24/7', 'Treats Store', 'Air/Water'],
    rating: 4.3,
  },
  {
    id: 'fuel-shell-edsa-buendia',
    name: 'Shell EDSA Buendia (Gil Puyat)',
    category: 'fuel',
    categoryLabel: 'Gas Station & Convenience',
    brand: 'Shell',
    address: 'EDSA cor. Sen. Gil Puyat Ave, Makati',
    region: 'Metro Manila, NCR',
    lat: 14.5539,
    lng: 121.0317,
    openingHours: '24/7',
    features: ['24/7', 'Shell Select', 'ATM'],
    rating: 4.4,
  },
  {
    id: 'fuel-cleanfuel-edsa-cubao',
    name: 'Cleanfuel EDSA Cubao',
    category: 'fuel',
    categoryLabel: 'Gas Station & Auto LPG',
    brand: 'Cleanfuel',
    address: 'EDSA Southbound, Cubao, Quezon City',
    region: 'Metro Manila, NCR',
    lat: 14.6192,
    lng: 121.0525,
    openingHours: '24/7',
    features: ['24/7', 'Clean Restrooms', 'Air/Water'],
    rating: 4.4,
  },
  {
    id: 'fuel-petron-srp-cebu',
    name: 'Petron SRP South Coastal Road',
    category: 'fuel',
    categoryLabel: 'Gas Station & Seaside Stop',
    brand: 'Petron',
    address: 'Cebu South Coastal Road, SRP, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.2867,
    lng: 123.8867,
    openingHours: '24/7',
    features: ['24/7', 'Treats Convenience', 'Restrooms'],
    rating: 4.5,
  },
  {
    id: 'fuel-shell-maxilom-cebu',
    name: 'Shell General Maxilom Ave',
    category: 'fuel',
    categoryLabel: 'Gas Station & Service',
    brand: 'Shell',
    address: 'Gen. Maxilom Ave cor. Echavez St., Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3139,
    lng: 123.9014,
    openingHours: '24/7',
    features: ['24/7', 'Shell Select', 'ATM'],
    rating: 4.5,
  },
  {
    id: 'fuel-phoenix-lanang-davao',
    name: 'Phoenix Petroleum Mega Station Lanang',
    category: 'fuel',
    categoryLabel: 'Gas Station & Highway Hub',
    brand: 'Phoenix',
    address: 'J.P. Laurel Ave, Lanang, Davao City',
    region: 'Davao City, Davao del Sur',
    lat: 7.1008,
    lng: 125.6339,
    openingHours: '24/7',
    features: ['24/7', 'FamilyMart', 'Car Care', 'ATM'],
    rating: 4.6,
  },
  {
    id: 'fuel-petron-digos-bypass',
    name: 'Petron Digos Bypass Road',
    category: 'fuel',
    categoryLabel: 'Gas Station & Highway Stop',
    brand: 'Petron',
    address: 'Digos-Makar Bypass Road, Digos City',
    region: 'Davao del Sur',
    lat: 6.7611,
    lng: 125.3611,
    openingHours: '24/7',
    features: ['24/7', 'Restrooms', 'Motorcycle Lane'],
    rating: 4.5,
  },
  {
    id: 'fuel-shell-malungon',
    name: 'Shell National Highway Malungon',
    category: 'fuel',
    categoryLabel: 'Gas Station & Mountain Corridor Stop',
    brand: 'Shell',
    address: 'Davao-GenSan National Highway, Poblacion, Malungon',
    region: 'Sarangani',
    lat: 6.2592,
    lng: 125.2644,
    openingHours: '24/7',
    features: ['24/7', 'Restrooms', 'Tire Pressure Check'],
    rating: 4.5,
  },
  {
    id: 'fuel-caltex-gensan',
    name: 'Caltex Santiago Blvd GenSan',
    category: 'fuel',
    categoryLabel: 'Gas Station',
    brand: 'Caltex',
    address: 'Santiago Blvd, General Santos City',
    region: 'South Cotabato',
    lat: 6.1167,
    lng: 125.175,
    openingHours: '24/7',
    features: ['24/7', '7-Eleven', 'ATM'],
    rating: 4.3,
  },
  {
    id: 'fuel-petron-baguio-burnham',
    name: 'Petron Burnham Kisad Road',
    category: 'fuel',
    categoryLabel: 'Gas Station',
    brand: 'Petron',
    address: 'Kisad Road cor. Gov. Pack Rd, Baguio City',
    region: 'Baguio City, Benguet',
    lat: 16.4095,
    lng: 120.5933,
    openingHours: '24/7',
    features: ['24/7', 'Air/Water', 'Restrooms'],
    rating: 4.4,
  },

  // ==================== FOOD & FAST FOOD ====================
  {
    id: 'food-jollibee-bgc',
    name: 'Jollibee BGC Bonifacio High Street',
    category: 'food',
    categoryLabel: 'Fast Food Restaurant',
    brand: 'Jollibee',
    address: '7th Ave cor. 28th St., BGC, Taguig',
    region: 'Metro Manila, NCR',
    lat: 14.5508,
    lng: 121.0509,
    openingHours: '6:00 AM – 11:00 PM',
    phone: '(02) 8898-7777',
    features: ['Dine-in', 'Take-out', 'Drive-thru', 'Delivery', 'WiFi'],
    rating: 4.7,
  },
  {
    id: 'food-jollibee-luneta',
    name: 'Jollibee Luneta Rizal Park',
    category: 'food',
    categoryLabel: 'Fast Food Restaurant',
    brand: 'Jollibee',
    address: 'Padre Burgos Ave cor. Maria Orosa, Ermita, Manila',
    region: 'City of Manila, NCR',
    lat: 14.5829,
    lng: 120.9782,
    openingHours: '24/7',
    features: ['24/7', 'Dine-in', 'Take-out', 'Tourist Friendly'],
    rating: 4.5,
  },
  {
    id: 'food-mcdonalds-greenbelt',
    name: "McDonald's Greenbelt 1",
    category: 'food',
    categoryLabel: 'Fast Food Restaurant',
    brand: "McDonald's",
    address: 'Paseo de Roxas cor. Legazpi St., Makati',
    region: 'Metro Manila, NCR',
    lat: 14.5528,
    lng: 121.0205,
    openingHours: '24/7',
    features: ['24/7', 'McCafé', 'Dine-in', 'Drive-thru', 'WiFi'],
    rating: 4.5,
  },
  {
    id: 'food-mcdonalds-tagaytay',
    name: "McDonald's Tagaytay Calamba Road",
    category: 'food',
    categoryLabel: 'Fast Food with Taal Volcano View',
    brand: "McDonald's",
    address: 'Tagaytay-Calamba Road, San Jose, Tagaytay City',
    region: 'Cavite, CALABARZON',
    lat: 14.1153,
    lng: 120.9622,
    openingHours: '24/7',
    features: ['24/7', 'Taal View Deck', 'Drive-thru', 'McCafé', 'Parking'],
    rating: 4.8,
  },
  {
    id: 'food-starbucks-tagaytay-ridge',
    name: 'Starbucks Tagaytay Ridge Calamba Road',
    category: 'food',
    categoryLabel: 'Coffeehouse & Scenic View Deck',
    brand: 'Starbucks',
    address: 'Calamba Road, Tagaytay Ridge, Tagaytay',
    region: 'Cavite, CALABARZON',
    lat: 14.1036,
    lng: 120.9531,
    openingHours: '6:30 AM – 11:30 PM',
    features: ['Lake View Patio', 'WiFi', 'Drive-thru', 'Nitro Cold Brew'],
    rating: 4.8,
  },
  {
    id: 'food-jollibee-cebu-fuente',
    name: 'Jollibee Fuente Osmeña Circle',
    category: 'food',
    categoryLabel: 'Fast Food Restaurant',
    brand: 'Jollibee',
    address: 'Fuente Osmeña Circle, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3114,
    lng: 123.8942,
    openingHours: '24/7',
    features: ['24/7', 'Dine-in', 'Take-out', 'Drive-thru'],
    rating: 4.6,
  },
  {
    id: 'food-mcdonalds-cebu-itpark',
    name: "McDonald's Cebu IT Park",
    category: 'food',
    categoryLabel: 'Fast Food Restaurant',
    brand: "McDonald's",
    address: 'Salinas Drive, Lahug, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3292,
    lng: 123.9056,
    openingHours: '24/7',
    features: ['24/7', 'McCafé', 'Dine-in', 'WiFi'],
    rating: 4.6,
  },
  {
    id: 'food-jollibee-davao-matina',
    name: 'Jollibee Matina Crossing Davao',
    category: 'food',
    categoryLabel: 'Fast Food Restaurant',
    brand: 'Jollibee',
    address: 'McArthur Highway, Matina, Davao City',
    region: 'Davao City, Davao del Sur',
    lat: 7.0517,
    lng: 125.5861,
    openingHours: '24/7',
    features: ['24/7', 'Drive-thru', 'Play Place', 'Parking'],
    rating: 4.6,
  },
  {
    id: 'food-jollibee-session-baguio',
    name: 'Jollibee Session Road Baguio',
    category: 'food',
    categoryLabel: 'Fast Food Restaurant',
    brand: 'Jollibee',
    address: 'Session Road cor. Mabini St., Baguio City',
    region: 'Baguio City, Benguet',
    lat: 16.4131,
    lng: 120.5975,
    openingHours: '24/7',
    features: ['24/7', 'Dine-in', 'Breakfast'],
    rating: 4.5,
  },
  {
    id: 'food-mang-inasal-megamall',
    name: 'Mang Inasal SM Megamall',
    category: 'food',
    categoryLabel: 'Filipino Grill & Chicken Inasal',
    brand: 'Mang Inasal',
    address: 'Lower Ground Floor, Building A, SM Megamall, Mandaluyong',
    region: 'Metro Manila, NCR',
    lat: 14.5841,
    lng: 121.0562,
    openingHours: '10:00 AM – 10:00 PM',
    features: ['Unlimited Rice', 'Dine-in', 'Take-out'],
    rating: 4.5,
  },
  {
    id: 'food-chowking-cubao',
    name: 'Chowking Araneta Center Cubao',
    category: 'food',
    categoryLabel: 'Chinese Fast Food',
    brand: 'Chowking',
    address: 'General Roxas Ave, Araneta City, Quezon City',
    region: 'Metro Manila, NCR',
    lat: 14.6208,
    lng: 121.0536,
    openingHours: '24/7',
    features: ['24/7', 'Chao Fan', 'Halo-Halo', 'Dine-in'],
    rating: 4.3,
  },

  // ==================== MALLS & SHOPPING ====================
  {
    id: 'mall-sm-mall-of-asia',
    name: 'SM Mall of Asia (MOA)',
    category: 'mall',
    categoryLabel: 'Supermall & Entertainment Complex',
    brand: 'SM Supermalls',
    address: 'Seaside Blvd, Bay City, Pasay',
    region: 'Metro Manila, NCR',
    lat: 14.5353,
    lng: 120.9822,
    openingHours: '10:00 AM – 10:00 PM',
    phone: '(02) 8831-7000',
    features: ['Supermarket', 'Department Store', 'Cinema', 'Baywalk', 'EV Charging', 'Parking'],
    rating: 4.8,
  },
  {
    id: 'mall-sm-megamall',
    name: 'SM Megamall Ortigas',
    category: 'mall',
    categoryLabel: 'Supermall & Fashion Hall',
    brand: 'SM Supermalls',
    address: 'EDSA cor. Doña Julia Vargas Ave, Ortigas Center, Mandaluyong',
    region: 'Metro Manila, NCR',
    lat: 14.5843,
    lng: 121.0567,
    openingHours: '10:00 AM – 10:00 PM',
    features: ['Mega Fashion Hall', 'Ice Skating Rink', 'IMAX Cinema', 'Food Court', 'Parking'],
    rating: 4.7,
  },
  {
    id: 'mall-sm-north-edsa',
    name: 'SM City North EDSA',
    category: 'mall',
    categoryLabel: 'Supermall & Sky Garden',
    brand: 'SM Supermalls',
    address: 'North Ave cor. EDSA, Quezon City',
    region: 'Metro Manila, NCR',
    lat: 14.6565,
    lng: 121.0289,
    openingHours: '10:00 AM – 10:00 PM',
    features: ['Sky Garden', 'The Block', 'Cyberzone', 'Direct Transit Access', 'Parking'],
    rating: 4.7,
  },
  {
    id: 'mall-ayala-greenbelt',
    name: 'Greenbelt Ayala Center Makati',
    category: 'mall',
    categoryLabel: 'Luxury Shopping & Garden Dining',
    brand: 'Ayala Malls',
    address: 'Legazpi St cor. Esperanza St, Makati',
    region: 'Metro Manila, NCR',
    lat: 14.5522,
    lng: 121.0208,
    openingHours: '11:00 AM – 10:00 PM',
    features: ['Garden Park', 'High-end Dining', 'Cinema', 'Valet Parking'],
    rating: 4.8,
  },
  {
    id: 'mall-robinsons-place-manila',
    name: 'Robinsons Place Manila',
    category: 'mall',
    categoryLabel: 'Shopping Mall',
    brand: 'Robinsons Malls',
    address: 'Pedro Gil cor. M. Adriatico St., Ermita, Manila',
    region: 'City of Manila, NCR',
    lat: 14.5778,
    lng: 120.9856,
    openingHours: '10:00 AM – 9:00 PM',
    features: ['Supermarket', 'Department Store', 'Food Hall', 'Cinema'],
    rating: 4.6,
  },
  {
    id: 'mall-sm-city-cebu',
    name: 'SM City Cebu',
    category: 'mall',
    categoryLabel: 'Supermall',
    brand: 'SM Supermalls',
    address: 'North Reclamation Area, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3117,
    lng: 123.9181,
    openingHours: '10:00 AM – 9:00 PM',
    features: ['Cyberzone', 'Department Store', 'Cinema', 'Bowling', 'Parking'],
    rating: 4.7,
  },
  {
    id: 'mall-sm-seaside-cebu',
    name: 'SM Seaside City Cebu',
    category: 'mall',
    categoryLabel: 'Destination Mall & Ocean Wing',
    brand: 'SM Supermalls',
    address: 'South Road Properties (SRP), Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.2822,
    lng: 123.8817,
    openingHours: '10:00 AM – 9:00 PM',
    features: ['Seaside Tower', 'Olympic Ice Rink', 'Sky Park', 'Rooftop Garden'],
    rating: 4.8,
  },
  {
    id: 'mall-ayala-center-cebu',
    name: 'Ayala Center Cebu',
    category: 'mall',
    categoryLabel: 'Shopping & Dining Hub',
    brand: 'Ayala Malls',
    address: 'Cebu Business Park, Archbishop Reyes Ave, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3175,
    lng: 123.905,
    openingHours: '10:00 AM – 9:00 PM',
    features: ['The Terraces', 'Rustan’s', 'Cinema', 'Alfresco Dining'],
    rating: 4.8,
  },
  {
    id: 'mall-sm-city-davao',
    name: 'SM City Davao (Ecoland)',
    category: 'mall',
    categoryLabel: 'Supermall',
    brand: 'SM Supermalls',
    address: 'Quimpo Blvd, Ecoland, Matina, Davao City',
    region: 'Davao City, Davao del Sur',
    lat: 7.0494,
    lng: 125.5925,
    openingHours: '10:00 AM – 9:00 PM',
    features: ['Supermarket', 'Department Store', 'Annex Building', 'Parking'],
    rating: 4.7,
  },
  {
    id: 'mall-sm-city-gensan',
    name: 'SM City General Santos',
    category: 'mall',
    categoryLabel: 'Supermall',
    brand: 'SM Supermalls',
    address: 'Santiago Blvd cor. San Miguel St, General Santos',
    region: 'South Cotabato',
    lat: 6.1189,
    lng: 125.1783,
    openingHours: '10:00 AM – 9:00 PM',
    features: ['Department Store', 'Supermarket', 'Cyberzone', 'Cinema'],
    rating: 4.7,
  },
  {
    id: 'mall-gaisano-grand-digos',
    name: 'Gaisano Grand Mall Digos',
    category: 'mall',
    categoryLabel: 'Shopping Mall',
    brand: 'Gaisano Grand',
    address: 'Rizal Ave cor. Estrada St, Digos City',
    region: 'Davao del Sur',
    lat: 6.755,
    lng: 125.3533,
    openingHours: '9:00 AM – 8:30 PM',
    features: ['Department Store', 'Supermarket', 'Food Court'],
    rating: 4.4,
  },
  {
    id: 'mall-sm-city-baguio',
    name: 'SM City Baguio',
    category: 'mall',
    categoryLabel: 'Mountain Ridge Supermall',
    brand: 'SM Supermalls',
    address: 'Luneta Hill, Upper Session Road, Baguio City',
    region: 'Baguio City, Benguet',
    lat: 16.4089,
    lng: 120.5989,
    openingHours: '10:00 AM – 9:00 PM',
    features: ['Sky Terrace', 'Pine Tree Views', 'Natural Ventilation', 'Cinemas'],
    rating: 4.8,
  },
  {
    id: 'mall-sm-city-clark',
    name: 'SM City Clark',
    category: 'mall',
    categoryLabel: 'Supermall & BPO Park',
    brand: 'SM Supermalls',
    address: 'M.A. Roxas Highway, Clark Freeport, Angeles, Pampanga',
    region: 'Pampanga, Central Luzon',
    lat: 15.1722,
    lng: 120.5786,
    openingHours: '10:00 AM – 9:00 PM',
    features: ['IMAX', 'Sky Line', 'EV Charging', 'Transit Hub'],
    rating: 4.7,
  },

  // ==================== CONVENIENCE STORES ====================
  {
    id: 'store-7eleven-bgc',
    name: '7-Eleven BGC Stopover',
    category: 'convenience',
    categoryLabel: '24/7 Convenience Store',
    brand: '7-Eleven',
    address: '31st St cor. 2nd Ave, BGC, Taguig',
    region: 'Metro Manila, NCR',
    lat: 14.5514,
    lng: 121.0475,
    openingHours: '24/7',
    features: ['24/7', 'City Blends Coffee', 'CLiQQ Kiosk', 'Bills Payment', 'ATM'],
    rating: 4.5,
  },
  {
    id: 'store-7eleven-edsa-taft',
    name: '7-Eleven EDSA MRT Taft Station',
    category: 'convenience',
    categoryLabel: '24/7 Convenience Store',
    brand: '7-Eleven',
    address: 'EDSA cor. Taft Ave, Pasay',
    region: 'Metro Manila, NCR',
    lat: 14.5375,
    lng: 121.0014,
    openingHours: '24/7',
    features: ['24/7', 'Transit Accessible', 'Hot Bites', 'CLiQQ'],
    rating: 4.3,
  },
  {
    id: 'store-7eleven-cebu-itpark',
    name: '7-Eleven Cebu IT Park Skyrise',
    category: 'convenience',
    categoryLabel: '24/7 Convenience Store',
    brand: '7-Eleven',
    address: 'Skyrise 1, Cebu IT Park, Lahug, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3297,
    lng: 123.9067,
    openingHours: '24/7',
    features: ['24/7', 'Coffee', 'Seating', 'ATM'],
    rating: 4.6,
  },
  {
    id: 'store-7eleven-davao-bolton',
    name: '7-Eleven Bolton Davao',
    category: 'convenience',
    categoryLabel: '24/7 Convenience Store',
    brand: '7-Eleven',
    address: 'Bolton St cor. San Pedro St, Davao City',
    region: 'Davao City, Davao del Sur',
    lat: 7.0678,
    lng: 125.6103,
    openingHours: '24/7',
    features: ['24/7', 'City Blends', 'Bills Payment'],
    rating: 4.4,
  },
  {
    id: 'store-uncle-johns-pioneer',
    name: "Uncle John's Cybergate Pioneer",
    category: 'convenience',
    categoryLabel: '24/7 Convenience Store',
    brand: "Uncle John's",
    address: 'Pioneer St cor. EDSA, Mandaluyong',
    region: 'Metro Manila, NCR',
    lat: 14.5722,
    lng: 121.0478,
    openingHours: '24/7',
    features: ['24/7', 'Fried Chicken', 'Chillz Drinks', 'ATM'],
    rating: 4.5,
  },

  // ==================== HOSPITALS & MEDICAL CENTERS ====================
  {
    id: 'hospital-st-lukes-bgc',
    name: "St. Luke's Medical Center - Global City",
    category: 'hospital',
    categoryLabel: 'Tertiary Hospital & Emergency',
    brand: "St. Luke's",
    address: '32nd St cor. 5th Ave, BGC, Taguig',
    region: 'Metro Manila, NCR',
    lat: 14.5539,
    lng: 121.0483,
    openingHours: '24/7 Emergency',
    phone: '(02) 8789-7700',
    features: ['24/7 Emergency', 'Trauma Center', 'Helipad', 'Intensive Care', 'Pharmacy'],
    rating: 4.8,
  },
  {
    id: 'hospital-pgh-manila',
    name: 'Philippine General Hospital (PGH)',
    category: 'hospital',
    categoryLabel: 'National University Hospital & Trauma Center',
    brand: 'PGH',
    address: 'Taft Ave, Ermita, Manila',
    region: 'City of Manila, NCR',
    lat: 14.5786,
    lng: 120.9882,
    openingHours: '24/7 Emergency',
    phone: '(02) 8554-8400',
    features: ['24/7 Emergency', 'National Referral Center', 'Trauma Care'],
    rating: 4.7,
  },
  {
    id: 'hospital-makati-med',
    name: 'Makati Medical Center (Makati Med)',
    category: 'hospital',
    categoryLabel: 'Tertiary Hospital & Emergency',
    brand: 'Makati Med',
    address: '2 Amorsolo St, Legazpi Village, Makati',
    region: 'Metro Manila, NCR',
    lat: 14.559,
    lng: 121.0147,
    openingHours: '24/7 Emergency',
    phone: '(02) 8888-8999',
    features: ['24/7 Emergency', 'Cardiology Center', 'Valet Parking', 'Pharmacy'],
    rating: 4.8,
  },
  {
    id: 'hospital-the-medical-city',
    name: 'The Medical City (Ortigas)',
    category: 'hospital',
    categoryLabel: 'Tertiary General Hospital',
    brand: 'The Medical City',
    address: 'Ortigas Ave, Pasig City',
    region: 'Metro Manila, NCR',
    lat: 14.5894,
    lng: 121.0692,
    openingHours: '24/7 Emergency',
    phone: '(02) 8988-1000',
    features: ['24/7 Emergency', 'Cancer Center', 'Cardiovascular Center'],
    rating: 4.7,
  },
  {
    id: 'hospital-asian-hospital',
    name: 'Asian Hospital and Medical Center',
    category: 'hospital',
    categoryLabel: 'Tertiary Hospital & Emergency',
    brand: 'Asian Hospital',
    address: 'Civic Drive, Filinvest City, Alabang, Muntinlupa',
    region: 'Metro Manila, NCR',
    lat: 14.4172,
    lng: 121.0425,
    openingHours: '24/7 Emergency',
    features: ['24/7 Emergency', 'Helipad', 'Specialized Care', 'Parking'],
    rating: 4.7,
  },
  {
    id: 'hospital-chong-hua-cebu',
    name: 'Chong Hua Hospital (Fuente)',
    category: 'hospital',
    categoryLabel: 'Tertiary Medical Center',
    brand: 'Chong Hua',
    address: 'Don Mariano Cui St, Fuente Osmeña, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3122,
    lng: 123.8925,
    openingHours: '24/7 Emergency',
    phone: '(032) 255-8000',
    features: ['24/7 Emergency', 'Heart Institute', 'Cancer Center'],
    rating: 4.8,
  },
  {
    id: 'hospital-davao-doctors',
    name: 'Davao Doctors Hospital',
    category: 'hospital',
    categoryLabel: 'Tertiary Medical Center',
    brand: 'Davao Doctors',
    address: '118 Elpidio Quirino Ave, Davao City',
    region: 'Davao City, Davao del Sur',
    lat: 7.0672,
    lng: 125.6067,
    openingHours: '24/7 Emergency',
    phone: '(082) 222-8000',
    features: ['24/7 Emergency', 'Diagnostic Center', 'Intensive Care'],
    rating: 4.7,
  },
  {
    id: 'hospital-spmc-davao',
    name: 'Southern Philippines Medical Center (SPMC)',
    category: 'hospital',
    categoryLabel: 'National Government Hospital & Regional Trauma Center',
    brand: 'SPMC',
    address: 'J.P. Laurel Ave, Bajada, Davao City',
    region: 'Davao City, Davao del Sur',
    lat: 7.0939,
    lng: 125.6261,
    openingHours: '24/7 Emergency',
    features: ['24/7 Emergency', 'Regional Trauma Center', 'Pediatric ICU'],
    rating: 4.7,
  },
  {
    id: 'hospital-digos-doctors',
    name: 'Digos Doctors Hospital',
    category: 'hospital',
    categoryLabel: 'General Hospital & Emergency',
    brand: 'Digos Doctors',
    address: 'McArthur Highway, Digos City',
    region: 'Davao del Sur',
    lat: 6.7533,
    lng: 125.3583,
    openingHours: '24/7 Emergency',
    features: ['24/7 Emergency', 'Radiology', 'Pharmacy'],
    rating: 4.5,
  },
  {
    id: 'hospital-gensan-doctors',
    name: 'General Santos Doctors Hospital',
    category: 'hospital',
    categoryLabel: 'Tertiary Medical Hospital',
    brand: 'GenSan Doctors',
    address: 'National Highway, General Santos City',
    region: 'South Cotabato',
    lat: 6.115,
    lng: 125.1733,
    openingHours: '24/7 Emergency',
    features: ['24/7 Emergency', 'ICU', 'Laboratory'],
    rating: 4.6,
  },
  {
    id: 'hospital-baguio-gen',
    name: 'Baguio General Hospital & Medical Center (BGHMC)',
    category: 'hospital',
    categoryLabel: 'Regional Medical Center & Trauma',
    brand: 'BGHMC',
    address: 'Gov. Pack Road, Baguio City',
    region: 'Baguio City, Benguet',
    lat: 16.4025,
    lng: 120.5961,
    openingHours: '24/7 Emergency',
    features: ['24/7 Emergency', 'High Altitude Trauma', 'ICU'],
    rating: 4.7,
  },

  // ==================== PHARMACIES & DRUGSTORES ====================
  {
    id: 'pharmacy-mercury-edsa-taft',
    name: 'Mercury Drug EDSA Taft 24/7',
    category: 'pharmacy',
    categoryLabel: '24/7 Pharmacy & Convenience',
    brand: 'Mercury Drug',
    address: 'EDSA cor. Taft Ave, Pasay',
    region: 'Metro Manila, NCR',
    lat: 14.5381,
    lng: 121.0019,
    openingHours: '24/7',
    phone: '(02) 8851-1122',
    features: ['24/7', 'Prescription Rx', 'Over-the-counter', 'Emergency Meds'],
    rating: 4.6,
  },
  {
    id: 'pharmacy-mercury-cebu-fuente',
    name: 'Mercury Drug Fuente Osmeña',
    category: 'pharmacy',
    categoryLabel: '24/7 Pharmacy',
    brand: 'Mercury Drug',
    address: 'Fuente Osmeña, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3119,
    lng: 123.8936,
    openingHours: '24/7',
    features: ['24/7', 'Prescriptions', 'Medical Supplies'],
    rating: 4.6,
  },
  {
    id: 'pharmacy-mercury-davao-san-pedro',
    name: 'Mercury Drug San Pedro Davao',
    category: 'pharmacy',
    categoryLabel: '24/7 Pharmacy',
    brand: 'Mercury Drug',
    address: 'San Pedro St cor. City Hall Drive, Davao City',
    region: 'Davao City, Davao del Sur',
    lat: 7.0664,
    lng: 125.6089,
    openingHours: '24/7',
    features: ['24/7', 'Prescriptions', 'Drive-thru Pickup'],
    rating: 4.6,
  },
  {
    id: 'pharmacy-watsons-moa',
    name: 'Watsons SM Mall of Asia',
    category: 'pharmacy',
    categoryLabel: 'Pharmacy & Wellness Store',
    brand: 'Watsons',
    address: 'Main Mall, SM Mall of Asia, Pasay',
    region: 'Metro Manila, NCR',
    lat: 14.5358,
    lng: 120.9825,
    openingHours: '10:00 AM – 10:00 PM',
    features: ['Pharmacy Counter', 'Health & Beauty', 'Vaccinations'],
    rating: 4.6,
  },

  // ==================== BANKS & ATMS ====================
  {
    id: 'bank-bdo-head-office',
    name: 'BDO Corporate Center & Branch',
    category: 'bank',
    categoryLabel: 'Universal Bank & 24/7 ATM',
    brand: 'BDO',
    address: '7899 Makati Ave, Makati',
    region: 'Metro Manila, NCR',
    lat: 14.5567,
    lng: 121.0244,
    openingHours: '9:00 AM – 4:30 PM (ATMs 24/7)',
    features: ['24/7 ATM', 'Cash Deposit Machine', 'Forex', 'Parking'],
    rating: 4.5,
  },
  {
    id: 'bank-bpi-ayala-main',
    name: 'BPI Ayala Main Branch & ATM Center',
    category: 'bank',
    categoryLabel: 'Universal Bank & 24/7 Express Teller',
    brand: 'BPI',
    address: 'Ayala Ave cor. Paseo de Roxas, Makati',
    region: 'Metro Manila, NCR',
    lat: 14.5542,
    lng: 121.0242,
    openingHours: '9:00 AM – 4:30 PM (ATMs 24/7)',
    features: ['Express Teller 24/7', 'Forex Exchange', 'Preferred Banking'],
    rating: 4.6,
  },
  {
    id: 'bank-metrobank-plaza',
    name: 'Metrobank Plaza Head Office',
    category: 'bank',
    categoryLabel: 'Universal Bank',
    brand: 'Metrobank',
    address: 'Sen. Gil Puyat Ave, Makati',
    region: 'Metro Manila, NCR',
    lat: 14.5583,
    lng: 121.0289,
    openingHours: '9:00 AM – 4:30 PM (ATMs 24/7)',
    features: ['24/7 ATM', 'Wealth Management'],
    rating: 4.5,
  },
  {
    id: 'bank-bdo-cebu-fuente',
    name: 'BDO Cebu Fuente Osmeña',
    category: 'bank',
    categoryLabel: 'Bank & 24/7 ATM',
    brand: 'BDO',
    address: 'Fuente Osmeña, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3111,
    lng: 123.8931,
    openingHours: '9:00 AM – 4:30 PM (ATMs 24/7)',
    features: ['24/7 ATM', 'Cash Deposit'],
    rating: 4.4,
  },
  {
    id: 'bank-bpi-davao-c-m-recto',
    name: 'BPI Davao C.M. Recto Branch',
    category: 'bank',
    categoryLabel: 'Bank & 24/7 ATM',
    brand: 'BPI',
    address: 'C.M. Recto Ave, Davao City',
    region: 'Davao City, Davao del Sur',
    lat: 7.0719,
    lng: 125.6128,
    openingHours: '9:00 AM – 4:30 PM (ATMs 24/7)',
    features: ['24/7 ATM', 'Full Banking'],
    rating: 4.5,
  },

  // ==================== HOTELS & LODGING ====================
  {
    id: 'hotel-shangrila-bgc',
    name: 'Shangri-La The Fort, Manila',
    category: 'hotel',
    categoryLabel: '5-Star Luxury Hotel',
    brand: 'Shangri-La',
    address: '30th St cor. 5th Ave, BGC, Taguig',
    region: 'Metro Manila, NCR',
    lat: 14.5519,
    lng: 121.0478,
    openingHours: '24/7 Front Desk',
    phone: '(02) 8820-0888',
    features: ['24/7 Concierge', 'Valet', 'Fine Dining', 'Kerry Sports', 'Swimming Pool'],
    rating: 4.9,
  },
  {
    id: 'hotel-okada-manila',
    name: 'Okada Manila Resort & Hotel',
    category: 'hotel',
    categoryLabel: 'Integrated Resort & 5-Star Hotel',
    brand: 'Okada',
    address: 'New Seaside Drive, Entertainment City, Parañaque',
    region: 'Metro Manila, NCR',
    lat: 14.5153,
    lng: 120.9797,
    openingHours: '24/7 Front Desk',
    features: ['The Fountain', 'Casino', 'Valet Parking', 'Luxury Suites'],
    rating: 4.8,
  },
  {
    id: 'hotel-taal-vista',
    name: 'Taal Vista Hotel',
    category: 'hotel',
    categoryLabel: 'Historic Mountain Resort Hotel',
    brand: 'Taal Vista',
    address: 'Kilometer 60, Emilio Aguinaldo Highway, Tagaytay',
    region: 'Cavite, CALABARZON',
    lat: 14.095,
    lng: 120.935,
    openingHours: '24/7 Front Desk',
    features: ['Taal Lake View Deck', 'Historic Grounds', 'Swimming Pool', 'Spa'],
    rating: 4.7,
  },
  {
    id: 'hotel-the-manor-baguio',
    name: 'The Manor at Camp John Hay',
    category: 'hotel',
    categoryLabel: 'Mountain Resort Hotel',
    brand: 'The Manor',
    address: 'Loakan Road, Camp John Hay, Baguio City',
    region: 'Baguio City, Benguet',
    lat: 16.4011,
    lng: 120.6203,
    openingHours: '24/7 Front Desk',
    features: ['Pine Forest View', 'Fireplace Garden', 'Golf Course', 'Spa'],
    rating: 4.8,
  },
  {
    id: 'hotel-seda-ayala-cebu',
    name: 'Seda Ayala Center Cebu',
    category: 'hotel',
    categoryLabel: 'Business & Leisure Hotel',
    brand: 'Seda Hotels',
    address: 'Cardinal Rosales Ave, Cebu Business Park, Cebu City',
    region: 'Cebu City, Central Visayas',
    lat: 10.3181,
    lng: 123.9061,
    openingHours: '24/7 Front Desk',
    features: ['Direct Mall Access', 'Executive Lounge', 'Pool', 'Gym'],
    rating: 4.7,
  },

  // ==================== TRANSIT TERMINALS ====================
  {
    id: 'transit-pitx',
    name: 'Parañaque Integrated Terminal Exchange (PITX)',
    category: 'transit',
    categoryLabel: 'Intermodal Bus & Transit Terminal',
    brand: 'PITX',
    address: '1 Kennedy Road, Tambo, Parañaque',
    region: 'Metro Manila, NCR',
    lat: 14.5103,
    lng: 120.9917,
    openingHours: '24/7',
    features: ['Provincial Buses', 'EDSA Carousel', 'PUV Hub', 'Food Court', 'ATM'],
    rating: 4.6,
  },
  {
    id: 'transit-araneta-bus-port',
    name: 'Araneta City Bus Port (Cubao)',
    category: 'transit',
    categoryLabel: 'Provincial Bus Port',
    brand: 'Araneta City',
    address: 'Gen. Romulo Ave, Cubao, Quezon City',
    region: 'Metro Manila, NCR',
    lat: 14.62,
    lng: 121.0531,
    openingHours: '24/7',
    features: ['Airconditioned Waiting Lounges', 'Bicol/Visayas Buses', 'Ticketing'],
    rating: 4.5,
  },
  {
    id: 'transit-one-ayala',
    name: 'One Ayala Intermodal Terminal',
    category: 'transit',
    categoryLabel: 'Intermodal Transit Hub',
    brand: 'One Ayala',
    address: 'Ayala cor. EDSA, Makati',
    region: 'Metro Manila, NCR',
    lat: 14.5492,
    lng: 121.0286,
    openingHours: '24/7',
    features: ['P2P Buses', 'EDSA Busway Concourse', 'MRT-3 Link', 'Dining'],
    rating: 4.7,
  },
];

const ESTABLISHMENTS_CACHE_KEY = 'laagarn_cached_establishments_v2';

/**
 * Retrieve cached establishments stored on device.
 */
function getCachedCustomEstablishments(): Establishment[] {
  return readJson<Establishment[]>(ESTABLISHMENTS_CACHE_KEY, []);
}

function rememberEstablishments(newItems: Establishment[]): void {
  if (newItems.length === 0) return;
  const existing = getCachedCustomEstablishments();
  const merged = [...newItems, ...existing];
  const seen = new Set<string>();
  const unique = merged.filter((item) => {
    const key = `${item.name.toLowerCase()}|${item.lat.toFixed(3)}|${item.lng.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  writeJson(ESTABLISHMENTS_CACHE_KEY, unique.slice(0, 500));
}

/**
 * Maps raw OpenStreetMap tags (from Nominatim) into our EstablishmentCategory.
 */
export function mapOsmTagToCategory(
  item: Record<string, any>
): { category: EstablishmentCategory; categoryLabel: string } {
  const osmCategory = String(item.category || item.class || '').toLowerCase();
  const osmType = String(item.type || item.addresstype || '').toLowerCase();
  const extratags = item.extratags || {};
  const amenity = String(extratags.amenity || '').toLowerCase();
  const shop = String(extratags.shop || '').toLowerCase();

  if (
    osmType === 'fuel' ||
    osmCategory === 'fuel' ||
    amenity === 'fuel' ||
    osmType === 'charging_station'
  ) {
    return { category: 'fuel', categoryLabel: 'Gas & Service Station' };
  }

  if (
    osmType === 'fast_food' ||
    osmType === 'restaurant' ||
    osmType === 'cafe' ||
    osmType === 'food_court' ||
    amenity === 'fast_food' ||
    amenity === 'restaurant' ||
    amenity === 'cafe'
  ) {
    return { category: 'food', categoryLabel: 'Food & Dining' };
  }

  if (
    osmType === 'mall' ||
    osmType === 'supermarket' ||
    osmType === 'department_store' ||
    shop === 'mall' ||
    shop === 'supermarket' ||
    shop === 'department_store'
  ) {
    return { category: 'mall', categoryLabel: 'Mall & Supermarket' };
  }

  if (
    osmType === 'convenience' ||
    shop === 'convenience' ||
    osmType === 'kiosk'
  ) {
    return { category: 'convenience', categoryLabel: '24/7 Convenience Store' };
  }

  if (
    osmType === 'hospital' ||
    osmType === 'clinic' ||
    amenity === 'hospital' ||
    amenity === 'clinic'
  ) {
    return { category: 'hospital', categoryLabel: 'Hospital & Clinic' };
  }

  if (
    osmType === 'pharmacy' ||
    osmType === 'chemist' ||
    amenity === 'pharmacy' ||
    shop === 'chemist'
  ) {
    return { category: 'pharmacy', categoryLabel: 'Pharmacy & Drugstore' };
  }

  if (
    osmType === 'bank' ||
    osmType === 'atm' ||
    amenity === 'bank' ||
    amenity === 'atm'
  ) {
    return { category: 'bank', categoryLabel: 'Bank & ATM' };
  }

  if (
    osmType === 'hotel' ||
    osmType === 'motel' ||
    osmType === 'guest_house' ||
    osmCategory === 'tourism'
  ) {
    return { category: 'hotel', categoryLabel: 'Hotel & Lodging' };
  }

  if (
    osmType === 'bus_station' ||
    osmType === 'terminal' ||
    amenity === 'bus_station'
  ) {
    return { category: 'transit', categoryLabel: 'Transit Terminal' };
  }

  return { category: 'services', categoryLabel: 'Local Establishment' };
}

/**
 * Convert a raw Nominatim result into a typed Establishment.
 */
function parseNominatimEstablishment(raw: Record<string, any>): Establishment | null {
  const lat = parseFloat(raw.lat);
  const lng = parseFloat(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const { category, categoryLabel } = mapOsmTagToCategory(raw);
  const addr = raw.address || {};
  const extratags = raw.extratags || {};

  const name =
    raw.name ||
    addr.fast_food ||
    addr.restaurant ||
    addr.fuel ||
    addr.shop ||
    addr.hospital ||
    addr.bank ||
    raw.display_name?.split(',')[0] ||
    'Establishment';

  const brand = extratags.brand || extratags['brand:wikipedia']?.split(':')?.[1] || undefined;

  const city = addr.city || addr.town || addr.municipality || addr.city_district || '';
  const stateOrRegion = addr.state || addr.region || 'Philippines';
  const region = [city, stateOrRegion].filter(Boolean).join(', ') || 'Philippines';

  const road = [addr.house_number, addr.road].filter(Boolean).join(' ');
  const suburb = addr.suburb || addr.neighbourhood || addr.quarter || '';
  const address = [road, suburb, city].filter(Boolean).join(', ') || raw.display_name?.split(',').slice(0, 3).join(',') || region;

  const openingHours = extratags.opening_hours || (category === 'convenience' || category === 'hospital' ? '24/7' : undefined);
  const phone = extratags.phone || extratags['contact:phone'];

  const features: string[] = [];
  if (openingHours?.includes('24/7')) features.push('24/7');
  if (extratags.drive_through === 'yes' || extratags.takeaway === 'yes') features.push('Drive-thru');
  if (extratags.atm === 'yes') features.push('ATM');
  if (extratags.wheelchair === 'yes') features.push('Accessible');
  if (extratags.internet_access === 'wlan' || extratags.wifi === 'yes') features.push('Free WiFi');

  return {
    id: `osm-${raw.osm_type || 'node'}-${raw.osm_id || raw.place_id}`,
    name: String(name).trim(),
    category,
    categoryLabel,
    brand,
    address,
    region,
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
    openingHours,
    phone,
    features: features.length > 0 ? features : undefined,
  };
}

export interface EstablishmentSearchOptions {
  category?: EstablishmentCategory | 'all';
  nearLat?: number;
  nearLng?: number;
  radiusKm?: number;
  limit?: number;
}

/**
 * Filter and sort establishments locally (always works 100% offline).
 */
export function searchOfflineEstablishments(
  query: string,
  options?: EstablishmentSearchOptions
): Establishment[] {
  const q = query.trim().toLowerCase();
  const allKnown = [...KNOWN_ESTABLISHMENTS, ...getCachedCustomEstablishments()];

  // Deduplicate by ID
  const map = new Map<string, Establishment>();
  for (const item of allKnown) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }

  let list = Array.from(map.values());

  // Category filter
  if (options?.category && options.category !== 'all') {
    list = list.filter((item) => item.category === options.category);
  }

  // Text search filter
  if (q.length > 0) {
    list = list.filter((item) => {
      const matchName = item.name.toLowerCase().includes(q);
      const matchBrand = item.brand ? item.brand.toLowerCase().includes(q) : false;
      const matchCategory = item.category.toLowerCase().includes(q) || item.categoryLabel.toLowerCase().includes(q);
      const matchAddress = item.address.toLowerCase().includes(q) || item.region.toLowerCase().includes(q);
      const matchFeatures = item.features ? item.features.some((f) => f.toLowerCase().includes(q)) : false;
      return matchName || matchBrand || matchCategory || matchAddress || matchFeatures;
    });
  }

  // Calculate distance if reference coordinate provided
  if (options?.nearLat !== undefined && options?.nearLng !== undefined) {
    const ref = { lat: options.nearLat, lng: options.nearLng };
    list = list.map((item) => ({
      ...item,
      distanceKm: Number(haversineKmPrecise(ref, { lat: item.lat, lng: item.lng }).toFixed(2)),
    }));

    if (options.radiusKm && options.radiusKm > 0) {
      list = list.filter((item) => item.distanceKm! <= options.radiusKm!);
    }

    // Sort by proximity
    list.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }

  const limit = options?.limit ?? 30;
  return list.slice(0, limit);
}

/**
 * Search establishments with live Nominatim OpenStreetMap POI discovery
 * plus offline gazetteer fallback & caching.
 */
export async function searchEstablishments(
  query: string,
  options?: EstablishmentSearchOptions
): Promise<Establishment[]> {
  const localResults = searchOfflineEstablishments(query, options);

  if (!isBrowserOnline()) {
    return localResults;
  }

  const q = query.trim();
  // Build query parameter for Nominatim
  let searchQuery = q;
  if (!searchQuery && options?.category && options.category !== 'all') {
    const catMeta = ESTABLISHMENT_CATEGORIES.find((c) => c.id === options.category);
    searchQuery = catMeta ? catMeta.label : options.category;
  }

  if (!searchQuery && !options?.nearLat) {
    return localResults;
  }

  try {
    let url = `${APP_CONFIG.nominatimUrl}/search?format=jsonv2&countrycodes=ph&limit=15&addressdetails=1&extratags=1&accept-language=en&q=${encodeURIComponent(
      searchQuery || 'establishment'
    )}`;

    // Add viewbox bias if coordinate provided
    if (options?.nearLat !== undefined && options?.nearLng !== undefined) {
      const delta = (options.radiusKm || 25) / 111.0;
      const left = (options.nearLng - delta).toFixed(4);
      const right = (options.nearLng + delta).toFixed(4);
      const top = (options.nearLat + delta).toFixed(4);
      const bottom = (options.nearLat - delta).toFixed(4);
      url += `&viewbox=${left},${top},${right},${bottom}&bounded=0`;
    }

    const res = await fetchWithTimeout(url, 4500, {
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items) && items.length > 0) {
        const remoteParsed = items
          .map(parseNominatimEstablishment)
          .filter((item): item is Establishment => Boolean(item));

        // Filter by category if requested
        let filteredRemote = remoteParsed;
        if (options?.category && options.category !== 'all') {
          filteredRemote = filteredRemote.filter((item) => item.category === options.category);
        }

        // Cache remote findings
        rememberEstablishments(filteredRemote);

        // Merge local & remote
        const merged = [...filteredRemote, ...localResults];
        const seen = new Set<string>();
        const unique: Establishment[] = [];

        for (const item of merged) {
          const key = `${item.name.toLowerCase()}|${item.lat.toFixed(3)}|${item.lng.toFixed(3)}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
          }
        }

        // Compute distance
        if (options?.nearLat !== undefined && options?.nearLng !== undefined) {
          const ref = { lat: options.nearLat, lng: options.nearLng };
          unique.forEach((item) => {
            if (item.distanceKm === undefined) {
              item.distanceKm = Number(haversineKmPrecise(ref, { lat: item.lat, lng: item.lng }).toFixed(2));
            }
          });

          if (options.radiusKm && options.radiusKm > 0) {
            const filtered = unique.filter((item) => (item.distanceKm ?? 0) <= options.radiusKm!);
            filtered.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
            return filtered.slice(0, options?.limit ?? 30);
          }

          unique.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
        }

        return unique.slice(0, options?.limit ?? 30);
      }
    }
  } catch {
    // Return local results on network error
  }

  return localResults;
}

/**
 * Converts an Establishment to a LatLngPoint suitable for routing.
 */
export function establishmentToLatLngPoint(est: Establishment): LatLngPoint {
  return {
    name: est.name,
    region: est.address || est.region,
    lat: est.lat,
    lng: est.lng,
  };
}
