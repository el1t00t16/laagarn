import { haversineKmPrecise, calculateBearing, getCardinalDirection, LatLngPoint } from './routingEngine';
import { GpsPositionState } from './gpsAndGeocoding';

export type ConvoyVehicleType = 'motorcycle' | 'car' | 'van' | 'bicycle' | 'pedestrian';

export interface ConvoyPeer {
  id: string;
  name: string;
  vehicle: ConvoyVehicleType;
  color: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speedKmh?: number | null;
  accuracyMeters?: number | null;
  updatedAt: number;
  batteryLevel?: number | null;
  status: 'active' | 'idle' | 'offline';
  isSelf?: boolean;
  isHost?: boolean;
  distanceKm?: number;
  cardinalDirection?: string;
}

export interface ConvoyJoinRequest {
  peerId: string;
  name: string;
  vehicle: ConvoyVehicleType;
  color: string;
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
  timestamp: number;
}

export interface ConvoySharedRoute {
  id: string;
  label: string;
  stops: LatLngPoint[];
  totalDistanceKm: number;
  durationMinutes: number;
  suggestedByPeerId: string;
  suggestedByName: string;
  timestamp: number;
  isHostRoute?: boolean;
}

export interface ConvoyTelemetryPacket {
  type:
    | 'telemetry'
    | 'leave'
    | 'ping'
    | 'route_share'
    | 'route_suggest'
    | 'join_request'
    | 'join_accepted'
    | 'join_declined';
  peerId: string;
  name: string;
  vehicle: ConvoyVehicleType;
  color: string;
  lat: number;
  lng: number;
  heading: number | null;
  speedKmh: number | null;
  accuracyMeters?: number | null;
  updatedAt: number;
  batteryLevel?: number | null;
  route?: ConvoySharedRoute;
  targetPeerId?: string;
  isHost?: boolean;
}

export const CONVOY_VEHICLE_OPTIONS: { id: ConvoyVehicleType; label: string; emoji: string }[] = [
  { id: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' },
  { id: 'car', label: 'Car / Sedan', emoji: '🚗' },
  { id: 'van', label: 'Van / SUV', emoji: '🚐' },
  { id: 'bicycle', label: 'Bicycle', emoji: '🚲' },
  { id: 'pedestrian', label: 'Walking', emoji: '🚶' },
];

export const CONVOY_COLOR_PALETTE = [
  '#06b6d4', // Cyan
  '#ec4899', // Pink / Fuchsia
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#14b8a6', // Teal
];

/**
 * Generate a clean, human-readable 6-character room code (e.g. LAAG-7281).
 */
export function generateConvoyRoomCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `LAAG-${num}`;
}

/**
 * Normalize and clean room code input.
 * Ensures consistent handling whether user enters "6689", "laag-6689", "LAAG6689", or "LAAG-6689".
 */
export function normalizeConvoyCode(code: string): string {
  if (!code) return '';
  const trimmed = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!trimmed) return '';

  // If user only typed 4 digits (e.g. "6689"), prefix with LAAG-
  if (/^\d{4}$/.test(trimmed)) {
    return `LAAG-${trimmed}`;
  }

  // If user typed "LAAG" followed directly by digits (e.g. "LAAG6689")
  if (/^LAAG\d{4}$/.test(trimmed)) {
    return `LAAG-${trimmed.slice(4)}`;
  }

  return trimmed.slice(0, 16);
}

/**
 * Backwards-compatible sanitize function that uses normalizeConvoyCode.
 */
export function sanitizeRoomCode(code: string): string {
  return normalizeConvoyCode(code);
}

/**
 * Derives a deterministic canonical MQTT topic from any room code format.
 * Strips hyphens so that "6689", "LAAG-6689", and "laag6689" all resolve to "laagarn/convoy/laag6689".
 */
export function getConvoyMqttTopic(code: string): string {
  const norm = normalizeConvoyCode(code);
  const clean = norm.replace(/[^A-Z0-9]/gi, '').toLowerCase();
  return `laagarn/convoy/${clean || 'lobby'}`;
}

/**
 * Derives a deterministic canonical topic from any room code format.
 * Strips hyphens so that "6689", "LAAG-6689", and "laag6689" all resolve to "laagarn_convoy_laag6689".
 */
export function getConvoyTopic(code: string): string {
  const norm = normalizeConvoyCode(code);
  const clean = norm.replace(/[^A-Z0-9]/gi, '').toLowerCase();
  return `laagarn_convoy_${clean || 'lobby'}`;
}

/**
 * Generates a persistent random peer ID for this device session.
 */
export function getOrCreatePeerId(): string {
  if (typeof localStorage === 'undefined') {
    return `peer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }
  const stored = localStorage.getItem('laagarn_peer_id');
  if (stored) return stored;
  const newId = `peer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  try {
    localStorage.setItem('laagarn_peer_id', newId);
  } catch {
    // Ignore storage errors
  }
  return newId;
}

/**
 * Retrieve saved user nickname from localStorage or generate a default.
 */
export function getSavedNickname(): string {
  if (typeof localStorage === 'undefined') return 'Rider Buddy';
  return localStorage.getItem('laagarn_nickname') || 'Rider Buddy';
}

/**
 * Save user nickname to localStorage.
 */
export function saveNickname(name: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem('laagarn_nickname', name.trim());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Retrieve saved vehicle choice from localStorage.
 */
export function getSavedVehicle(): ConvoyVehicleType {
  if (typeof localStorage === 'undefined') return 'motorcycle';
  const val = localStorage.getItem('laagarn_vehicle') as ConvoyVehicleType;
  if (CONVOY_VEHICLE_OPTIONS.some((v) => v.id === val)) return val;
  return 'motorcycle';
}

/**
 * Save vehicle choice to localStorage.
 */
export function saveVehicle(vehicle: ConvoyVehicleType): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem('laagarn_vehicle', vehicle);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Retrieve saved color choice.
 */
export function getSavedColor(): string {
  if (typeof localStorage === 'undefined') return CONVOY_COLOR_PALETTE[0];
  const val = localStorage.getItem('laagarn_color');
  if (val && CONVOY_COLOR_PALETTE.includes(val)) return val;
  const randomColor = CONVOY_COLOR_PALETTE[Math.floor(Math.random() * CONVOY_COLOR_PALETTE.length)];
  return randomColor;
}

/**
 * Calculate distance and direction from current user to a peer.
 */
export function enrichPeerMetrics(
  peer: ConvoyPeer,
  userLat?: number,
  userLng?: number
): ConvoyPeer {
  // Status calculation: inactive if no update in > 90 seconds
  const ageMs = Date.now() - peer.updatedAt;
  const status: ConvoyPeer['status'] =
    ageMs > 90000 ? 'offline' : ageMs > 30000 ? 'idle' : 'active';

  if (userLat === undefined || userLng === undefined) {
    return {
      ...peer,
      status,
    };
  }

  const dist = haversineKmPrecise(
    { lat: userLat, lng: userLng },
    { lat: peer.lat, lng: peer.lng }
  );
  const bearing = calculateBearing(
    { lat: userLat, lng: userLng },
    { lat: peer.lat, lng: peer.lng }
  );
  const cardinal = getCardinalDirection(bearing);

  return {
    ...peer,
    distanceKm: dist,
    cardinalDirection: cardinal,
    status,
  };
}

/**
 * Format relative distance humanely:
 * e.g. "Same spot (<15m)", "~45m (Same area / indoors)", "850 m away", "2.4 km away".
 */
export function formatConvoyDistance(distanceKm?: number): string {
  if (distanceKm === undefined || isNaN(distanceKm)) return '--';
  const meters = Math.round(distanceKm * 1000);
  if (meters < 15) return 'Same spot (<15m)';
  if (meters < 100) return `~${meters}m (Same area / indoors)`;
  if (meters < 1000) return `${meters} m away`;
  return `${distanceKm.toFixed(1)} km away`;
}

/**
 * Build a shareable URL containing the room code.
 */
export function buildConvoyShareUrl(roomCode: string): string {
  if (typeof window === 'undefined') {
    return `https://laagarn.web.app/?convoy=${encodeURIComponent(roomCode)}`;
  }
  const origin = window.location.origin;
  return `${origin}/?convoy=${encodeURIComponent(roomCode)}`;
}

/**
 * Build a QR code image URL for instant camera scanning.
 */
export function buildQrCodeImageUrl(url: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&format=svg&data=${encodeURIComponent(url)}`;
}

/**
 * Converts a ConvoyPeer into a router LatLngPoint destination.
 */
export function peerToLatLngPoint(peer: ConvoyPeer): LatLngPoint {
  const emoji =
    CONVOY_VEHICLE_OPTIONS.find((v) => v.id === peer.vehicle)?.emoji || '👤';
  return {
    name: `${emoji} ${peer.name}`,
    region: 'Convoy Buddy (Live Location)',
    lat: peer.lat,
    lng: peer.lng,
  };
}
