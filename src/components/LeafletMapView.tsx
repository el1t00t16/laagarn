import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronLeft,
  Volume2,
  VolumeX,
  Navigation2,
  Crosshair,
  Layers,
  Compass,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Hand,
  MapPin,
  Flag,
  PlusCircle,
  ChevronDown,
  Camera,
  Activity,
  Plus,
  Minus,
} from 'lucide-react';
import { selectVisibleMapLabels, LabelCandidate } from '../utils/mapLabelDeclutter';
import {
  ComputedRoute,
  LatLngPoint,
  TrafficIncident,
  WeatherSnapshot,
  formatDistance,
} from '../utils/routingEngine';
import { CorridorStation, RouteCorridorHazardReport } from '../utils/corridorWeather';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import {
  Establishment,
  ESTABLISHMENT_CATEGORIES,
} from '../utils/establishmentData';
import {
  TrafficLight,
  KNOWN_TRAFFIC_LIGHTS,
} from '../utils/trafficLightData';
import {
  ConvoyPeer,
  ConvoySharedRoute,
  ConvoyJoinRequest,
  CONVOY_VEHICLE_OPTIONS,
  peerToLatLngPoint,
} from '../utils/convoySync';
import {
  getCachedTileObjectUrl,
  generatePlaceholderTileSvg,
} from '../utils/tileCacheStorage';
import { APP_CONFIG, buildTileUrl, escapeHtml } from '../utils/config';

export type MapClickAction =
  | 'none'
  | 'gps'
  | 'origin'
  | 'waypoint'
  | 'destination'
  | 'weather';
export type MapStyleMode = 'street' | 'terrain' | 'dark';

interface LeafletMapViewProps {
  stops: LatLngPoint[];
  routes: ComputedRoute[];
  activeRouteIndex: number;
  onSelectRouteIndex: (idx: number) => void;
  gpsState: GpsPositionState | null;
  gpsLoading: boolean;
  gpsCompassHeading?: number | null;
  onLocateUserGps: () => void;
  incidents: TrafficIncident[];
  showTrafficLayer: boolean;
  onToggleTrafficLayer: () => void;
  weatherSnapshots: WeatherSnapshot[];
  corridorStations?: CorridorStation[];
  hazardReport?: RouteCorridorHazardReport | null;
  showWeatherLayer: boolean;
  onToggleWeatherLayer: () => void;
  establishments?: Establishment[];
  showEstablishmentsLayer?: boolean;
  onToggleEstablishmentsLayer?: () => void;
  selectedEstablishmentId?: string | null;
  onSelectEstablishmentRoute?: (est: Establishment) => void;
  onAddEstablishmentStop?: (est: Establishment) => void;
  onSelectEstablishment?: (est: Establishment) => void;
  trafficLights?: TrafficLight[];
  showTrafficLightsLayer?: boolean;
  onToggleTrafficLightsLayer?: () => void;
  onSelectTrafficLightRoute?: (tl: TrafficLight) => void;
  onAddTrafficLightStop?: (tl: TrafficLight) => void;
  convoyPeers?: ConvoyPeer[];
  showConvoyLayer?: boolean;
  onToggleConvoyLayer?: () => void;
  onRouteToPeer?: (point: LatLngPoint) => void;
  onAddPeerStop?: (point: LatLngPoint) => void;
  isOfflineMode: boolean;
  mapStyle: MapStyleMode;
  onChangeMapStyle: (style: MapStyleMode) => void;
  mapClickAction: MapClickAction;
  onChangeMapClickAction: (action: MapClickAction) => void;
  onMapPickLocation: (lat: number, lng: number, action: MapClickAction) => void;
  onCacheViewport: (
    southWest: { lat: number; lng: number },
    northEast: { lat: number; lng: number }
  ) => void;
  focusedCoord: { lat: number; lng: number; zoom?: number; label?: string } | null;
  navigationActive: boolean;
  activeStepIndex: number;
  onStepChange: (stepIdx: number) => void;
  onExitNavigation: () => void;
  voiceGuidance?: boolean;
  onToggleVoiceGuidance?: () => void;
  followGps?: boolean;
  onToggleFollowGps?: () => void;
  // Simulation Controls
  isSimulating?: boolean;
  onToggleSimulation?: () => void;
  onResetSimulation?: () => void;
  simulationProgress?: number;
  simSpeedMultiplier?: number;
  onChangeSimSpeed?: (speed: number) => void;
  onToggleDashcam?: () => void;
  dashcamActive?: boolean;
  isRecordingVideo?: boolean;
  mobileSheetOpen?: boolean;
  desktopSidebarOpen?: boolean;
  onOpenStravaModal?: () => void;
  stravaRecordingActive?: boolean;
  stravaPointsCount?: number;
  convoySharedRoute?: ConvoySharedRoute | null;
  onLoadSharedRoute?: (route: ConvoySharedRoute) => void;
  pendingConvoyJoinRequests?: ConvoyJoinRequest[];
  onAcceptConvoyJoinRequest?: (peerId: string) => void;
  onDeclineConvoyJoinRequest?: (peerId: string) => void;
  theme?: 'dark' | 'amoled' | 'light';
}

function applyTileStyleFilter(
  img: HTMLImageElement,
  style: MapStyleMode,
  isPlaceholder: boolean
) {
  if (isPlaceholder) {
    img.style.filter = 'none';
    return;
  }
  if (style === 'street') {
    img.style.filter = 'contrast(1.04) saturate(1.06)';
  } else if (style === 'terrain') {
    img.style.filter = 'sepia(0.22) contrast(1.08) saturate(1.25) brightness(0.98)';
  } else {
    img.style.filter =
      'invert(0.9) hue-rotate(185deg) saturate(1.35) brightness(1.12) contrast(1.08)';
  }
}

/**
 * High-performance offline-aware Leaflet TileLayer.
 */
function createOfflineAwareTileLayer(
  style: MapStyleMode,
  isOffline: boolean
): L.TileLayer {
  const CustomLayer = L.TileLayer.extend({
    createTile: function (coords: L.Coords, done: L.DoneCallback) {
      const img = document.createElement('img');
      img.alt = `Philippines map tile ${coords.z}/${coords.x}/${coords.y}`;
      img.setAttribute('role', 'presentation');

      const z = coords.z;
      const x = coords.x;
      const y = coords.y;
      let blobUrl: string | null = null;

      const cleanup = () => {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          blobUrl = null;
        }
      };

      if (isOffline) {
        getCachedTileObjectUrl(z, x, y).then((url) => {
          if (url) {
            blobUrl = url;
            applyTileStyleFilter(img, style, false);
            img.src = url;
          } else {
            applyTileStyleFilter(img, style, true);
            img.src = generatePlaceholderTileSvg(z, x, y, style === 'dark');
          }
          done(undefined, img);
        });
        return img;
      }

      applyTileStyleFilter(img, style, false);
      const liveUrl = buildTileUrl(z, x, y);

      let settled = false;
      const fallbackTimer = setTimeout(async () => {
        if (!settled) {
          settled = true;
          const cachedUrl = await getCachedTileObjectUrl(z, x, y);
          if (cachedUrl) {
            blobUrl = cachedUrl;
            applyTileStyleFilter(img, style, false);
            img.src = cachedUrl;
          } else {
            applyTileStyleFilter(img, style, true);
            img.src = generatePlaceholderTileSvg(z, x, y, style === 'dark');
          }
          done(undefined, img);
        }
      }, 4000);

      img.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        done(undefined, img);
      };

      img.onerror = async () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        const cachedUrl = await getCachedTileObjectUrl(z, x, y);
        if (cachedUrl) {
          blobUrl = cachedUrl;
          applyTileStyleFilter(img, style, false);
          img.src = cachedUrl;
        } else {
          applyTileStyleFilter(img, style, true);
          img.src = generatePlaceholderTileSvg(z, x, y, style === 'dark');
        }
        done(undefined, img);
      };

      img.src = liveUrl;
      (img as any)._cleanup = cleanup;
      return img;
    },
    _revokeTile: function (tile: HTMLElement) {
      if ((tile as any)._cleanup) {
        (tile as any)._cleanup();
      }
    },
  });

  const templateUrl = APP_CONFIG.tileUrl;

  return new (CustomLayer as unknown as new (
    url: string,
    options?: L.TileLayerOptions
  ) => L.TileLayer)(templateUrl, {
    maxZoom: 18,
    minZoom: 5,
    attribution: APP_CONFIG.tileAttribution,
  });
}

function createTechnicalMarkerIcon(
  code: string,
  name: string,
  isEndpoint: boolean
): L.DivIcon {
  const shortName = escapeHtml(name.split('(')[0].trim().toUpperCase());
  const safeCode = escapeHtml(code);
  const fullLabel = `${safeCode}: ${shortName}`;
  const dotBg = isEndpoint ? '#a855f7' : '#140a24';
  const dotBorder = isEndpoint ? '2px solid #ffffff' : '2px solid #c084fc';
  return L.divIcon({
    className: 'v2-technical-pin',
    html: `<div style="position:relative;width:18px;height:18px;background:${dotBg};border:${dotBorder};box-shadow:0 0 12px rgba(168,85,247,0.5);border-radius:4px;">
      <div class="technical-pin-label" style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;backdrop-filter:blur(10px);padding:3px 8px;border-radius:3px;">${fullLabel}</div>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

function createGpsVehicleIcon(heading: number | null, label: string): L.DivIcon {
  const safeShort = escapeHtml(label.split(',')[0].trim().toUpperCase());
  const hasHeading = heading !== null && Number.isFinite(heading);

  if (hasHeading) {
    // Dynamic Navigational Chevron rotated precisely towards road direction (Glassy Purple glow)
    return L.divIcon({
      className: 'v2-gps-vehicle-chevron',
      html: `<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:2px;border-radius:9999px;background:rgba(168,85,247,0.25);box-shadow:0 0 20px rgba(168,85,247,0.75);"></div>
        <div style="transform:rotate(${heading}deg);transition:transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);display:flex;align-items:center;justify-content:center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L4 21L12 17L20 21L12 2Z" fill="#a855f7" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
          </svg>
        </div>
        <div style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;background:linear-gradient(135deg, #a855f7, #7c3aed);color:#ffffff;border:1px solid rgba(255,255,255,0.25);padding:2px 6px;box-shadow:0 4px 12px rgba(0,0,0,0.5);border-radius:3px;pointer-events:none;">
          ${safeShort}
        </div>
      </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
    });
  }

  // Stationary pulsating circular beacon
  return L.divIcon({
    className: 'v2-gps-beacon',
    html: `<div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(168,85,247,0.35);border:1.5px solid #a855f7;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="width:12px;height:12px;border-radius:9999px;background:#a855f7;border:2px solid #ffffff;box-shadow:0 0 12px #c084fc;"></div>
      <div style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;background:linear-gradient(135deg, #a855f7, #7c3aed);color:#ffffff;border:1px solid rgba(255,255,255,0.2);padding:2px 6px;box-shadow:0 4px 12px rgba(0,0,0,0.45);border-radius:3px;pointer-events:none;">
        YOU ARE HERE · ${safeShort}
      </div>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function getEstablishmentGlyphSvg(category: string, px: number): string {
  const s = Math.max(10, Math.round(px));
  const common = `width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  switch (category) {
    case 'gas_station':
      return `<svg ${common}><path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M3 22h12"/><path d="M7 9h4"/><path d="m15 10 3-3 2 2v9a2 2 0 0 1-2 2h-1"/></svg>`;
    case 'hospital':
      return `<svg ${common}><path d="M12 6v12"/><path d="M6 12h12"/></svg>`;
    case 'food':
      return `<svg ${common}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`;
    case 'mall':
      return `<svg ${common}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
    case 'store':
      return `<svg ${common}><path d="M3 9l2-5h14l2 5"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 21v-6h6v6"/></svg>`;
    case 'pharmacy':
      return `<svg ${common}><rect x="4" y="6" width="16" height="12" rx="6"/><path d="m9 9 6 6"/></svg>`;
    case 'atm_bank':
      return `<svg ${common}><path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="m12 2 9 5H3l9-5Z"/></svg>`;
    case 'lodging':
      return `<svg ${common}><path d="M2 18V7"/><path d="M2 13h20v5"/><path d="M22 18v-2a3 3 0 0 0-3-3h-7"/><circle cx="7" cy="10" r="2"/></svg>`;
    default:
      return `<svg ${common}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
  }
}

function createEstablishmentMarkerIcon(
  est: Establishment,
  isSelected: boolean,
  showLabel: boolean
): L.DivIcon {
  const catMeta = ESTABLISHMENT_CATEGORIES.find((c) => c.id === est.category);
  const color = catMeta?.color || '#a855f7';
  const safeName = escapeHtml(est.name.split('(')[0].trim());
  const size = isSelected ? 28 : 22;
  const shadow = isSelected
    ? `box-shadow: 0 0 0 3px #ffffff, 0 0 16px ${color};`
    : `box-shadow: 0 3px 8px rgba(0,0,0,0.45);`;

  const dotHtml = `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;${shadow}cursor:pointer;transition:transform 0.15s ease;">
    ${getEstablishmentGlyphSvg(est.category, size * 0.55)}
  </div>`;

  if (!showLabel) {
    return L.divIcon({
      className: 'v2-establishment-pin',
      html: dotHtml,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });
  }

  return L.divIcon({
    className: 'v2-establishment-pin',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      ${dotHtml}
      <div class="est-pin-label" style="margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:700;letter-spacing:0.03em;white-space:nowrap;padding:1.5px 6px;border-radius:5px;max-width:116px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;">
        ${safeName}
      </div>
    </div>`,
    iconSize: [116, size + 20],
    iconAnchor: [58, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createTrafficLightMarkerIcon(tl: TrafficLight, showLabel: boolean): L.DivIcon {
  const safeName = escapeHtml(tl.name.split('(')[0].replace(/ Signal.*| Intersection/i, '').trim());
  const signalHtml = `<div style="
    width: 18px;
    height: 28px;
    background: #111827;
    border: 1.5px solid #475569;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-evenly;
    padding: 2px 0;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5), 0 0 8px rgba(16, 185, 129, 0.35);
    cursor: pointer;
  ">
    <span style="width: 4.5px; height: 4.5px; border-radius: 50%; background: #ef4444; opacity: 0.75;"></span>
    <span style="width: 4.5px; height: 4.5px; border-radius: 50%; background: #f59e0b; opacity: 0.75;"></span>
    <span style="width: 5px; height: 5px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
  </div>`;

  if (!showLabel) {
    return L.divIcon({
      className: 'v2-traffic-light-pin',
      html: signalHtml,
      iconSize: [18, 28],
      iconAnchor: [9, 14],
      popupAnchor: [0, -14],
    });
  }

  return L.divIcon({
    className: 'v2-traffic-light-pin',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      ${signalHtml}
      <div class="tl-pin-label" style="margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:700;letter-spacing:0.03em;white-space:nowrap;padding:1.5px 6px;border-radius:5px;max-width:108px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;">
        ${safeName}
      </div>
    </div>`,
    iconSize: [108, 48],
    iconAnchor: [54, 14],
    popupAnchor: [0, -14],
  });
}

function createHeavyTrafficMarkerIcon(inc: TrafficIncident, showLabel: boolean): L.DivIcon {
  const pulseDot = `<div class="heavy-traffic-pulse" style="
    width: 24px;
    height: 24px;
    background: #dc2626;
    border: 2px solid #ffffff;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.75);
    animation: heavy-radar-pulse 1.8s infinite;
    cursor: pointer;
  ">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
  </div>`;

  if (!showLabel) {
    return L.divIcon({
      className: 'v2-heavy-traffic-pin',
      html: pulseDot,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12],
    });
  }

  return L.divIcon({
    className: 'v2-heavy-traffic-pin',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      ${pulseDot}
      <div style="
        margin-top: 3px;
        background: #991b1b;
        color: #ffffff;
        font-family: 'JetBrains Mono', monospace;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: 0.03em;
        white-space: nowrap;
        padding: 1.5px 6px;
        border-radius: 5px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        pointer-events: none;
      ">
        +${inc.delayMinutes}m
      </div>
    </div>`,
    iconSize: [64, 46],
    iconAnchor: [32, 12],
    popupAnchor: [0, -12],
  });
}

function createConvoyPeerMarkerIcon(peer: ConvoyPeer): L.DivIcon {
  const emoji =
    CONVOY_VEHICLE_OPTIONS.find((v) => v.id === peer.vehicle)?.emoji || '👤';
  const safeName = escapeHtml(peer.name.split(' ')[0]);
  const hasHeading = typeof peer.heading === 'number';
  const headingDeg = hasHeading ? Math.round(peer.heading!) : 0;
  const speedText =
    peer.speedKmh !== null && peer.speedKmh !== undefined
      ? `${peer.speedKmh}k`
      : '';
  const color = peer.color || '#06b6d4';

  return L.divIcon({
    className: 'v2-convoy-peer-pin',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="
        position:relative;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: ${color};
        border: 2.5px solid #ffffff;
        box-shadow: 0 0 0 2px ${color}88, 0 4px 12px rgba(0,0,0,0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        cursor: pointer;
      ">
        ${emoji}
        ${
          hasHeading
            ? `<div style="
                position: absolute;
                top: -6px;
                left: 50%;
                transform: translateX(-50%) rotate(${headingDeg}deg);
                transform-origin: 50% 21px;
                width: 0;
                height: 0;
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-bottom: 7px solid ${color};
                filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
              "></div>`
            : ''
        }
      </div>
      <div class="convoy-pin-label" style="
        margin-top: 3px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 0.02em;
        white-space: nowrap;
        padding: 1.5px 5px;
        border-radius: 4px;
        max-width: 105px;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
      ">
        ${safeName}${speedText ? ` &middot; ${speedText}` : ''}
      </div>
    </div>`,
    iconSize: [105, 52],
    iconAnchor: [52, 15],
    popupAnchor: [0, -15],
  });
}

export const LeafletMapView: React.FC<LeafletMapViewProps> = ({
  stops,
  routes,
  activeRouteIndex,
  onSelectRouteIndex,
  gpsState,
  gpsLoading,
  gpsCompassHeading,
  onLocateUserGps,
  incidents,
  showTrafficLayer,
  onToggleTrafficLayer,
  weatherSnapshots,
  corridorStations = [],
  hazardReport = null,
  showWeatherLayer,
  onToggleWeatherLayer,
  establishments = [],
  showEstablishmentsLayer = true,
  onToggleEstablishmentsLayer,
  selectedEstablishmentId = null,
  onSelectEstablishmentRoute,
  onAddEstablishmentStop,
  onSelectEstablishment,
  trafficLights = KNOWN_TRAFFIC_LIGHTS,
  showTrafficLightsLayer = true,
  onToggleTrafficLightsLayer,
  onSelectTrafficLightRoute,
  onAddTrafficLightStop,
  convoyPeers = [],
  showConvoyLayer = true,
  onToggleConvoyLayer,
  onRouteToPeer,
  onAddPeerStop,
  isOfflineMode,
  mapStyle,
  onChangeMapStyle,
  mapClickAction,
  onChangeMapClickAction,
  onMapPickLocation,
  onCacheViewport,
  focusedCoord,
  navigationActive,
  activeStepIndex,
  onStepChange,
  onExitNavigation,
  voiceGuidance = true,
  onToggleVoiceGuidance,
  followGps = false,
  onToggleFollowGps,
  isSimulating = false,
  onToggleSimulation,
  onResetSimulation,
  simulationProgress = 0,
  simSpeedMultiplier = 2,
  onChangeSimSpeed,
  onToggleDashcam,
  dashcamActive = false,
  isRecordingVideo = false,
  mobileSheetOpen = false,
  desktopSidebarOpen = true,
  onOpenStravaModal,
  stravaRecordingActive = false,
  stravaPointsCount = 0,
  convoySharedRoute = null,
  onLoadSharedRoute,
  pendingConvoyJoinRequests = [],
  onAcceptConvoyJoinRequest,
  onDeclineConvoyJoinRequest,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const isAmoled = theme === 'amoled';

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  
  // Decoupled layer groups for 60fps performance
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const gpsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const establishmentsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const trafficLightsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const convoyLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const establishmentsRef = useRef(establishments);
  establishmentsRef.current = establishments;
  const onSelectEstablishmentRouteRef = useRef(onSelectEstablishmentRoute);
  onSelectEstablishmentRouteRef.current = onSelectEstablishmentRoute;
  const onAddEstablishmentStopRef = useRef(onAddEstablishmentStop);
  onAddEstablishmentStopRef.current = onAddEstablishmentStop;

  const trafficLightsRef = useRef(trafficLights);
  trafficLightsRef.current = trafficLights;
  const onSelectTrafficLightRouteRef = useRef(onSelectTrafficLightRoute);
  onSelectTrafficLightRouteRef.current = onSelectTrafficLightRoute;
  const onAddTrafficLightStopRef = useRef(onAddTrafficLightStop);
  onAddTrafficLightStopRef.current = onAddTrafficLightStop;

  const convoyPeersRef = useRef(convoyPeers);
  convoyPeersRef.current = convoyPeers;
  const onRouteToPeerRef = useRef(onRouteToPeer);
  onRouteToPeerRef.current = onRouteToPeer;
  const onAddPeerStopRef = useRef(onAddPeerStop);
  onAddPeerStopRef.current = onAddPeerStop;

  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const layersMenuRef = useRef<HTMLDivElement | null>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (modeMenuRef.current && !modeMenuRef.current.contains(target)) {
        setModeMenuOpen(false);
      }
      if (
        layersMenuRef.current &&
        !layersMenuRef.current.contains(target) &&
        !target?.closest('[data-layers-trigger]')
      ) {
        setShowLayersMenu(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number }>({
    lat: 14.5826,
    lng: 120.9787,
  });
  const [mapZoom, setMapZoom] = useState<number>(12);
  const [mapReady, setMapReady] = useState<boolean>(false);

  const visibleLabelIds = useMemo(() => {
    const map = mapInstanceRef.current;
    const candidates: LabelCandidate[] = [];

    if (showTrafficLayer) {
      incidents
        .filter((inc) => inc.active && (inc.severity === 'heavy' || inc.severity === 'closure'))
        .forEach((inc) => {
          candidates.push({
            id: `inc-${inc.id}`,
            lat: inc.lat,
            lng: inc.lng,
            priority: 85,
            widthPx: 64,
            heightPx: 20,
            minZoom: 11,
          });
        });
    }

    if (showTrafficLightsLayer) {
      trafficLights.forEach((tl) => {
        candidates.push({
          id: `tl-${tl.id}`,
          lat: tl.lat,
          lng: tl.lng,
          priority: 25,
          widthPx: 108,
          heightPx: 18,
          minZoom: 14,
        });
      });
    }

    if (showEstablishmentsLayer) {
      establishments.forEach((est) => {
        const isSel = selectedEstablishmentId === est.id;
        candidates.push({
          id: `est-${est.id}`,
          lat: est.lat,
          lng: est.lng,
          priority: isSel ? 110 : 15,
          widthPx: 116,
          heightPx: 20,
          minZoom: 14,
          alwaysShow: isSel,
        });
      });
    }

    return selectVisibleMapLabels(
      candidates,
      (lat, lng) => {
        if (map && mapReady) {
          const pt = map.latLngToLayerPoint([lat, lng]);
          return { x: pt.x, y: pt.y };
        }
        // Fallback equirectangular projection calibrated near current zoom
        const pxPerDeg = 256 * Math.pow(2, mapZoom) / 360;
        return { x: lng * pxPerDeg, y: -lat * pxPerDeg };
      },
      mapZoom,
      { minDensityZoom: 14, paddingPx: 6 }
    );
  }, [
    mapZoom,
    mapReady,
    incidents,
    showTrafficLayer,
    trafficLights,
    showTrafficLightsLayer,
    establishments,
    showEstablishmentsLayer,
    selectedEstablishmentId,
  ]);

  const pickCallbackRef = useRef(onMapPickLocation);
  pickCallbackRef.current = onMapPickLocation;
  const clickActionRef = useRef(mapClickAction);
  clickActionRef.current = mapClickAction;

  const activeRoute = routes[activeRouteIndex] || routes[0];
  const currentStep =
    activeRoute && activeRoute.steps[activeStepIndex]
      ? activeRoute.steps[activeStepIndex]
      : activeRoute?.steps[0];

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const philippinesBounds = L.latLngBounds(
      L.latLng(4.4, 116.5),
      L.latLng(21.3, 127.0)
    );

    const map = L.map(mapContainerRef.current, {
      center: [14.5826, 120.9787],
      zoom: 12,
      minZoom: 5,
      maxZoom: 18,
      maxBounds: philippinesBounds,
      maxBoundsViscosity: 0.9,
      zoomControl: false,
      attributionControl: true,
      fadeAnimation: false,
    });

    const routeGroup = L.layerGroup().addTo(map);
    const gpsGroup = L.layerGroup().addTo(map);
    const estGroup = L.layerGroup().addTo(map);
    const tlGroup = L.layerGroup().addTo(map);
    const convoyGroup = L.layerGroup().addTo(map);
    routeLayerGroupRef.current = routeGroup;
    gpsLayerGroupRef.current = gpsGroup;
    establishmentsLayerGroupRef.current = estGroup;
    trafficLightsLayerGroupRef.current = tlGroup;
    convoyLayerGroupRef.current = convoyGroup;
    mapInstanceRef.current = map;

    map.on('popupopen', (e: L.PopupEvent) => {
      const container = e.popup.getElement();
      if (!container) return;

      // Establishment Popup Action Handlers (using idempotent onclick handlers)
      const routeBtn = container.querySelector<HTMLButtonElement>('.popup-est-route-btn');
      if (routeBtn) {
        routeBtn.onclick = (ev) => {
          ev.preventDefault();
          const id = routeBtn.dataset.estId;
          const target = establishmentsRef.current.find((x) => x.id === id);
          if (target && onSelectEstablishmentRouteRef.current) {
            onSelectEstablishmentRouteRef.current(target);
            map.closePopup();
          }
        };
      }
      const stopBtn = container.querySelector<HTMLButtonElement>('.popup-est-stop-btn');
      if (stopBtn) {
        stopBtn.onclick = (ev) => {
          ev.preventDefault();
          const id = stopBtn.dataset.estId;
          const target = establishmentsRef.current.find((x) => x.id === id);
          if (target && onAddEstablishmentStopRef.current) {
            onAddEstablishmentStopRef.current(target);
            map.closePopup();
          }
        };
      }

      // Traffic Light Popup Action Handlers
      const tlRouteBtn = container.querySelector<HTMLButtonElement>('.popup-tl-route-btn');
      if (tlRouteBtn) {
        tlRouteBtn.onclick = (ev) => {
          ev.preventDefault();
          const id = tlRouteBtn.dataset.tlId;
          const target = trafficLightsRef.current?.find((x) => x.id === id);
          if (target && onSelectTrafficLightRouteRef.current) {
            onSelectTrafficLightRouteRef.current(target);
            map.closePopup();
          }
        };
      }
      const tlStopBtn = container.querySelector<HTMLButtonElement>('.popup-tl-stop-btn');
      if (tlStopBtn) {
        tlStopBtn.onclick = (ev) => {
          ev.preventDefault();
          const id = tlStopBtn.dataset.tlId;
          const target = trafficLightsRef.current?.find((x) => x.id === id);
          if (target && onAddTrafficLightStopRef.current) {
            onAddTrafficLightStopRef.current(target);
            map.closePopup();
          }
        };
      }

      // Convoy Peer Popup Action Handlers
      const peerRouteBtn = container.querySelector<HTMLButtonElement>('.popup-peer-route-btn');
      if (peerRouteBtn) {
        peerRouteBtn.onclick = (ev) => {
          ev.preventDefault();
          const id = peerRouteBtn.dataset.peerId;
          const target = convoyPeersRef.current?.find((x) => x.id === id);
          if (target && onRouteToPeerRef.current) {
            onRouteToPeerRef.current(peerToLatLngPoint(target));
            map.closePopup();
          }
        };
      }
      const peerStopBtn = container.querySelector<HTMLButtonElement>('.popup-peer-stop-btn');
      if (peerStopBtn) {
        peerStopBtn.onclick = (ev) => {
          ev.preventDefault();
          const id = peerStopBtn.dataset.peerId;
          const target = convoyPeersRef.current?.find((x) => x.id === id);
          if (target && onAddPeerStopRef.current) {
            onAddPeerStopRef.current(peerToLatLngPoint(target));
            map.closePopup();
          }
        };
      }
    });

    const timer = setTimeout(() => {
      map.invalidateSize();
      setMapZoom(map.getZoom());
      setMapReady(true);
    }, 100);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({
        lat: Number(e.latlng.lat.toFixed(4)),
        lng: Number(e.latlng.lng.toFixed(4)),
      });
    });

    map.on('zoomend', () => {
      setMapZoom(map.getZoom());
    });

    map.on('moveend', () => {
      const center = map.getCenter();
      setCursorCoords({
        lat: Number(center.lat.toFixed(4)),
        lng: Number(center.lng.toFixed(4)),
      });
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      setShowLayersMenu(false);
      setModeMenuOpen(false);
      if (
        document.activeElement instanceof HTMLElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA')
      ) {
        document.activeElement.blur();
      }
      if (clickActionRef.current !== 'none') {
        pickCallbackRef.current(
          Number(e.latlng.lat.toFixed(4)),
          Number(e.latlng.lng.toFixed(4)),
          clickActionRef.current
        );
      }
    });

    map.on('dragstart mousedown touchstart', () => {
      setShowLayersMenu(false);
      setModeMenuOpen(false);
      if (
        document.activeElement instanceof HTMLElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA')
      ) {
        document.activeElement.blur();
      }
    });

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Offline-aware tile layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const nextTileLayer = createOfflineAwareTileLayer(mapStyle, isOfflineMode);
    nextTileLayer.addTo(map);
    tileLayerRef.current = nextTileLayer;
  }, [mapStyle, isOfflineMode]);

  // 3. Render Route Polylines, Stops, Traffic & Weather (Static Group - only redrawn when routes/stops change)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = routeLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (stops.length === 1 && !activeRoute) {
      const single = stops[0];
      const marker = L.marker([single.lat, single.lng], {
        icon: createTechnicalMarkerIcon('A', single.name, true),
      });
      marker.addTo(group);
    }

    // Alternative Routes
    routes.forEach((route, idx) => {
      if (idx === activeRouteIndex) return;
      const altLine = L.polyline(route.coordinates, {
        color: mapStyle === 'dark' ? '#71717a' : '#52525b',
        weight: 3.5,
        opacity: 0.65,
        dashArray: '6, 8',
      });
      altLine.bindTooltip(
        `${escapeHtml(route.label)}: ${route.totalDurationMinutes}m (${route.totalDistanceKm} km) — Tap to select`,
        { sticky: true }
      );
      altLine.on('click', () => onSelectRouteIndex(idx));
      altLine.addTo(group);
    });

    // Active Route Polyline
    if (activeRoute) {
      L.polyline(activeRoute.coordinates, {
        color: '#09090b',
        weight: 8,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(group);

      if (showTrafficLayer && activeRoute.segments.length > 0) {
        activeRoute.segments.forEach((seg) => {
          const segColor =
            seg.congestion === 'heavy'
              ? '#dc2626'
              : seg.congestion === 'moderate'
              ? '#f59e0b'
              : '#a855f7';
          L.polyline(seg.coordinates, {
            color: segColor,
            weight: 5,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(group);
        });
      } else {
        L.polyline(activeRoute.coordinates, {
          color: '#a855f7',
          weight: 5,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(group);
      }

      // Origin, Waypoints, Destination pins
      activeRoute.stops.forEach((stop: LatLngPoint, idx: number) => {
        const isOrigin = idx === 0;
        const isDest = idx === activeRoute.stops.length - 1;
        const code = isOrigin ? 'A' : isDest ? 'B' : `${idx}`;

        const marker = L.marker([stop.lat, stop.lng], {
          icon: createTechnicalMarkerIcon(code, stop.name, isOrigin || isDest),
        });
        marker.bindPopup(
          `<div style="min-width:170px;font-family:'Manrope',sans-serif;">
            <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;text-transform:uppercase;letter-spacing:0.15em;color:var(--ink-dim);">${
              isOrigin ? 'Departure Point' : isDest ? 'Arrival Port' : `Stop ${idx}`
            }</div>
            <div style="font-size:14px;font-weight:600;color:var(--ink);margin-top:4px;">${escapeHtml(
              stop.name
            )}</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--accent);margin-top:6px;font-weight:600;">${stop.lat.toFixed(
              4
            )}° N, ${stop.lng.toFixed(4)}° E</div>
          </div>`
        );
        marker.addTo(group);
      });

      // Navigation Step Focus Ring
      if (navigationActive && currentStep) {
        const stepRing = L.circleMarker([currentStep.lat, currentStep.lng], {
          radius: 14,
          color: '#a855f7',
          weight: 3,
          fillColor: '#ffffff',
          fillOpacity: 0.35,
        });
        stepRing.bindTooltip(`Next: ${escapeHtml(currentStep.instruction)}`, {
          permanent: false,
        });
        stepRing.addTo(group);
      }
    }

    // Traffic Incidents
    if (showTrafficLayer) {
      incidents
        .filter((inc) => inc.active)
        .forEach((inc) => {
          const isHeavy = inc.severity === 'heavy' || inc.severity === 'closure';
          const badgeColor = isHeavy ? '#dc2626' : '#d97706';
          const showIncLabel = visibleLabelIds.has(`inc-${inc.id}`);

          const incIcon = isHeavy
            ? createHeavyTrafficMarkerIcon(inc, showIncLabel)
            : L.divIcon({
                className: 'v2-traffic-marker',
                html: `<div style="
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  width:22px;
                  height:22px;
                  background:${badgeColor};
                  border:1.5px solid #ffffff;
                  color:#ffffff;
                  font-family:'JetBrains Mono',monospace;
                  font-size:11px;
                  font-weight:800;
                  border-radius:6px;
                  box-shadow:0 3px 10px rgba(0,0,0,0.6);
                ">!</div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 11],
              });

          const marker = L.marker([inc.lat, inc.lng], {
            icon: incIcon,
            zIndexOffset: isHeavy ? 600 : 200,
          });
          marker.bindTooltip(`${escapeHtml(inc.title)} (+${inc.delayMinutes}m)`, {
            direction: 'top',
            offset: [0, -10],
          });

          marker.bindPopup(
            isHeavy
              ? `<div style="min-width:215px;font-family:'Manrope',sans-serif;padding:3px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                    <span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;text-transform:uppercase;font-weight:800;color:#dc2626;background:#dc262618;padding:2.5px 7px;border-radius:4px;border:1px solid #dc262640;">
                      🛑 HEAVY GRIDLOCK
                    </span>
                    <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;color:#dc2626;">
                      +${inc.delayMinutes}M DELAY
                    </span>
                  </div>
                  <div style="font-size:13.5px;font-weight:800;color:var(--ink);margin-top:6px;line-height:1.25;">
                    ${escapeHtml(inc.title)}
                  </div>
                  <div style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:var(--accent);margin-top:3px;">
                    ${escapeHtml(inc.corridor)}
                  </div>
                  <div style="font-size:12px;color:var(--ink-dim);margin-top:4px;line-height:1.35;">
                    ${escapeHtml(inc.description)}
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:9.5px;">
                    <span style="padding:2px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-weight:800;border:1px solid #fde68a;">
                      ⚡ CRAWL: ${inc.speedKmh} KM/H
                    </span>
                    <span style="color:var(--ink-dim);">
                      Updated ${inc.updatedMinutesAgo}m ago
                    </span>
                  </div>
                </div>`
              : `<div style="min-width:190px;font-family:'Manrope',sans-serif;padding:3px;">
                  <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;text-transform:uppercase;color:var(--accent);font-weight:700;">${escapeHtml(
                    inc.corridor
                  )}</div>
                  <div style="font-size:13.5px;font-weight:700;color:var(--ink);margin-top:3px;">${escapeHtml(
                    inc.title
                  )}</div>
                  <div style="font-size:12px;color:var(--ink-dim);margin-top:4px;">${escapeHtml(
                    inc.description
                  )}</div>
                  <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink);margin-top:6px;font-weight:600;">
                    +${inc.delayMinutes}M DELAY &middot; ${inc.speedKmh} KM/H
                  </div>
                </div>`
          );
          marker.addTo(group);
        });
    }

    // Weather Stations & En-Route Corridor Waypoints
    if (showWeatherLayer) {
      if (corridorStations && corridorStations.length > 0) {
        corridorStations.forEach((st) => {
          const hasHazard = st.hazards.length > 0;
          const isSevere = st.hazards.some((h) => h.severity === 'severe' || h.severity === 'warning');
          const statusDot = isSevere ? '#ef4444' : hasHazard ? '#f59e0b' : '#10b981';
          const cleanName = st.name.replace(/ Municipal.*| Town.*| Poblacion.*/i, '');
          const pred = st.predictedAtEta;

          const weatherIcon = L.divIcon({
            className: 'v2-weather-corridor-marker',
            html: `<div style="
              display:inline-flex;
              align-items:center;
              gap:5px;
              padding:3px 8px;
              background:rgba(20, 10, 36, 0.88);
              backdrop-filter:blur(10px);
              color:#f8f6fc;
              border:1px solid ${hasHazard ? statusDot : 'rgba(168,85,247,0.35)'};
              font-family:'JetBrains Mono',monospace;
              font-size:9.5px;
              font-weight:600;
              white-space:nowrap;
              box-shadow:0 4px 12px rgba(0,0,0,0.55);
              border-radius:4px;
            ">
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${statusDot};"></span>
              <span style="color:#ffffff;">${escapeHtml(cleanName)}</span>
              <span style="color:#c084fc;font-weight:700;">${pred.tempC}&deg;C</span>
              <span style="color:rgba(248,246,252,0.6);font-size:8.5px;">${pred.timeLabel}</span>
            </div>`,
            iconSize: [140, 24],
            iconAnchor: [-10, 18],
          });

          const wMarker = L.marker([st.lat, st.lng], { icon: weatherIcon });
          const hazardHtml = hasHazard
            ? `<div style="margin-top:6px;padding:6px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:4px;">
                <div style="font-size:10px;font-weight:700;color:#f59e0b;text-transform:uppercase;">${escapeHtml(st.hazards[0].title)}</div>
                <div style="font-size:10px;color:#fef3c7;margin-top:2px;">${escapeHtml(st.hazards[0].precaution)}</div>
              </div>`
            : '';

          wMarker.bindPopup(
            `<div style="min-width:210px;font-family:'Manrope',sans-serif;">
              <div style="font-size:13.5px;font-weight:700;color:var(--ink);">${escapeHtml(st.name)}</div>
              <div style="font-size:10.5px;color:var(--ink-dim);">${escapeHtml(st.region)}</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--accent);margin-top:5px;font-weight:700;">
                ETA: ${escapeHtml(st.etaLabel)} &middot; ${st.distanceAlongKm} KM ALONG ROUTE
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink);margin-top:3px;font-weight:600;">
                ${pred.tempC}&deg;C (${escapeHtml(pred.condition)}) &middot; PRECIP ${pred.precipProbPct}%
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-dim);margin-top:2px;">
                WIND ${pred.windKmh} KM/H &middot; VISIBILITY ${pred.visibilityKm} KM
              </div>
              ${hazardHtml}
            </div>`
          );
          wMarker.addTo(group);
        });
      } else {
        weatherSnapshots.forEach((snap) => {
          const weatherIcon = L.divIcon({
            className: 'v2-weather-marker',
            html: `<div class="weather-pin-label" style="
              display:inline-flex;
              align-items:center;
              padding:3px 8px;
              backdrop-filter:blur(10px);
              font-family:'JetBrains Mono',monospace;
              font-size:9.5px;
              font-weight:600;
              text-transform:uppercase;
              letter-spacing:0.1em;
              white-space:nowrap;
              border-radius:4px;
            "><span style="color:#c084fc;margin-right:4px;">${snap.tempC}&deg;C</span> ${escapeHtml(
              snap.condition
            )}</div>`,
            iconSize: [110, 22],
            iconAnchor: [-16, 20],
          });

          const wMarker = L.marker([snap.lat, snap.lng], { icon: weatherIcon });
          wMarker.bindPopup(
            `<div style="min-width:180px;font-family:'Manrope',sans-serif;">
              <div style="font-size:13.5px;font-weight:600;color:var(--ink);">${escapeHtml(
                snap.locationName
              )}</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-dim);margin-top:4px;text-transform:uppercase;">
                ${snap.tempC}&deg;C (${escapeHtml(snap.condition)}) &middot; WIND ${snap.windKmh} KM/H
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--accent);margin-top:4px;text-transform:uppercase;font-weight:700;">
                PRECIP ${snap.precipProbPct}% &middot; VIS ${snap.visibilityKm} KM
              </div>
            </div>`
          );
          wMarker.addTo(group);
        });
      }
    }
  }, [
    stops,
    routes,
    activeRouteIndex,
    activeRoute,
    incidents,
    showTrafficLayer,
    weatherSnapshots,
    corridorStations,
    hazardReport,
    showWeatherLayer,
    navigationActive,
    currentStep,
    mapStyle,
    onSelectRouteIndex,
    visibleLabelIds,
  ]);

  // 4. Dedicated 60fps GPS Vehicle Layer (Smooth Glide & Rotation)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = gpsLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (gpsState) {
      const effectiveHeading =
        gpsCompassHeading !== undefined && gpsCompassHeading !== null
          ? gpsCompassHeading
          : gpsState.heading;

      // Accuracy circle
      L.circle([gpsState.lat, gpsState.lng], {
        radius: Math.max(15, Math.min(gpsState.accuracyMeters, 400)),
        color: '#a855f7',
        weight: 1.5,
        fillColor: '#a855f7',
        fillOpacity: 0.15,
      }).addTo(group);

      // Rotating vehicle chevron marker
      const gpsMarker = L.marker([gpsState.lat, gpsState.lng], {
        icon: createGpsVehicleIcon(effectiveHeading, gpsState.addressLabel),
        zIndexOffset: 1000,
      });

      const safeLabel = escapeHtml(gpsState.addressLabel);
      const safeSpeed = gpsState.speedKmh !== null ? `${gpsState.speedKmh} km/h` : 'Stationary';
      const safeHeading = effectiveHeading !== null ? `${Math.round(effectiveHeading)}°` : 'N/A';

      gpsMarker.bindPopup(
        `<div style="min-width:190px;font-family:'Manrope',sans-serif;padding:2px;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;text-transform:uppercase;color:var(--accent);">
            ${isSimulating ? 'SIMULATED DRIVE' : 'REALTIME GPS FIX'}
          </div>
          <div style="font-size:13.5px;font-weight:600;color:var(--ink);margin-top:4px;">${safeLabel}</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-dim);margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            <span>ACC: ±${gpsState.accuracyMeters}m</span>
            <span>SPEED: ${safeSpeed}</span>
            <span>HDG: ${safeHeading}</span>
            <span>LAT: ${gpsState.lat.toFixed(4)}°</span>
          </div>
        </div>`
      );
      gpsMarker.addTo(group);

      // Auto-follow vehicle during navigation
      if (followGps && (navigationActive || isSimulating)) {
        map.panTo([gpsState.lat, gpsState.lng], { animate: true, duration: 0.25 });
      }
    }
  }, [gpsState, gpsCompassHeading, followGps, navigationActive, isSimulating]);

  // 4b. Render Establishments Layer (Interactive POI Markers)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = establishmentsLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (!showEstablishmentsLayer || !establishments || establishments.length === 0) return;

    establishments.forEach((est) => {
      const isSelected = selectedEstablishmentId === est.id;
      const showLabel = visibleLabelIds.has(`est-${est.id}`);
      const marker = L.marker([est.lat, est.lng], {
        icon: createEstablishmentMarkerIcon(est, isSelected, showLabel),
        zIndexOffset: isSelected ? 800 : 120,
      });
      marker.bindTooltip(escapeHtml(est.name), {
        direction: 'top',
        offset: [0, -12],
      });

      const catMeta = ESTABLISHMENT_CATEGORIES.find((c) => c.id === est.category);
      const color = catMeta?.color || '#a855f7';
      const hoursBadge = est.openingHours
        ? `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--accent);margin-top:4px;font-weight:700;">⏱️ ${escapeHtml(est.openingHours)}</div>`
        : '';
      const phoneBadge = est.phone
        ? `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-dim);margin-top:2px;font-weight:600;">📞 ${escapeHtml(est.phone)}</div>`
        : '';
      const distBadge = typeof est.distanceKm === 'number'
        ? `<div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#059669;margin-top:4px;font-weight:800;">📍 ${est.distanceKm < 1 ? Math.round(est.distanceKm * 1000) + ' m' : est.distanceKm.toFixed(1) + ' km'} away</div>`
        : '';
      const featuresBadges = est.features && est.features.length > 0
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
            ${est.features.slice(0, 3).map((f) => `<span class="est-feature-pill" style="font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;">${escapeHtml(f)}</span>`).join('')}
          </div>`
        : '';

      marker.bindPopup(`
        <div style="min-width:215px;font-family:'Manrope',sans-serif;padding:3px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;text-transform:uppercase;font-weight:800;color:${color};background:${color}18;padding:2.5px 7px;border-radius:4px;border:1px solid ${color}45;">
              ${catMeta?.emoji || ''} ${escapeHtml(est.categoryLabel || est.category)}
            </span>
            ${est.rating ? `<span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;color:#f59e0b;">⭐ ${est.rating}</span>` : ''}
          </div>
          <div style="font-size:14px;font-weight:800;color:var(--ink);margin-top:6px;line-height:1.25;">
            ${escapeHtml(est.name)}
          </div>
          <div style="font-size:11.5px;color:var(--ink-dim);margin-top:3px;line-height:1.35;font-weight:500;">
            ${escapeHtml(est.address || est.region)}
          </div>
          ${distBadge}
          ${hoursBadge}
          ${phoneBadge}
          ${featuresBadges}
          <div style="display:flex;gap:6px;margin-top:9px;padding-top:7px;border-top:1px solid var(--border-subtle, rgba(168,85,247,0.2));">
            <button class="popup-est-route-btn" data-est-id="${escapeHtml(est.id)}" style="flex:1;padding:6px 10px;background:linear-gradient(135deg, #a855f7, #7c3aed);color:#ffffff;border:none;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 2px 8px rgba(168,85,247,0.35);">
              🧭 Directions
            </button>
            <button class="popup-est-stop-btn" data-est-id="${escapeHtml(est.id)}" style="padding:6px 10px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;">
              ➕ Add Stop
            </button>
          </div>
        </div>
      `);

      marker.on('click', () => {
        onSelectEstablishment?.(est);
      });

      marker.addTo(group);

      if (isSelected) {
        marker.openPopup();
      }
    });
  }, [establishments, showEstablishmentsLayer, selectedEstablishmentId, onSelectEstablishment, visibleLabelIds]);

  // 4c. Render Traffic Lights Layer (Signalized Intersections)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = trafficLightsLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (!showTrafficLightsLayer || !trafficLights || trafficLights.length === 0) return;

    trafficLights.forEach((tl) => {
      const showLabel = visibleLabelIds.has(`tl-${tl.id}`);
      const marker = L.marker([tl.lat, tl.lng], {
        icon: createTrafficLightMarkerIcon(tl, showLabel),
        zIndexOffset: 150,
      });
      marker.bindTooltip(`${escapeHtml(tl.name)}`, {
        direction: 'top',
        offset: [0, -14],
      });

      const distBadge = typeof tl.distanceKm === 'number'
        ? `<div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#059669;margin-top:4px;font-weight:800;">📍 ${tl.distanceKm < 1 ? Math.round(tl.distanceKm * 1000) + ' m' : tl.distanceKm.toFixed(1) + ' km'} away</div>`
        : '';

      const featuresBadges = tl.features && tl.features.length > 0
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
            ${tl.features.slice(0, 3).map((f) => `<span class="est-feature-pill" style="font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;">${escapeHtml(f)}</span>`).join('')}
          </div>`
        : '';

      marker.bindPopup(`
        <div style="min-width:215px;font-family:'Manrope',sans-serif;padding:3px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;text-transform:uppercase;font-weight:800;color:#10b981;background:#10b98118;padding:2.5px 7px;border-radius:4px;border:1px solid #10b98145;">
              🚦 TRAFFIC SIGNAL
            </span>
            ${tl.cycleSeconds ? `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:800;color:var(--accent);">⏱️ ${tl.cycleSeconds}s CYCLE</span>` : ''}
          </div>
          <div style="font-size:13.5px;font-weight:800;color:var(--ink);margin-top:6px;line-height:1.25;">
            ${escapeHtml(tl.name)}
          </div>
          <div style="font-size:11.5px;color:var(--accent);font-weight:700;margin-top:3px;">
            ${escapeHtml(tl.intersection)}
          </div>
          <div style="font-size:11px;color:var(--ink-dim);margin-top:2px;font-weight:500;">
            ${escapeHtml(tl.corridor)} &middot; ${escapeHtml(tl.region)}
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--ink-dim);margin-top:4px;">
            System: ${escapeHtml(tl.systemType)}
          </div>
          ${distBadge}
          ${featuresBadges}
          <div style="display:flex;gap:6px;margin-top:9px;padding-top:7px;border-top:1px solid var(--border-subtle, rgba(16,185,129,0.2));">
            <button class="popup-tl-route-btn" data-tl-id="${escapeHtml(tl.id)}" style="flex:1;padding:6px 10px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;">
              🧭 Directions
            </button>
            <button class="popup-tl-stop-btn" data-tl-id="${escapeHtml(tl.id)}" style="padding:6px 10px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;">
              ➕ Add Stop
            </button>
          </div>
        </div>
      `);

      marker.addTo(group);
    });
  }, [trafficLights, showTrafficLightsLayer, visibleLabelIds]);

  // 4d. Render Convoy Peers Layer (Live Friends Tracking)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = convoyLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (!showConvoyLayer || !convoyPeers || convoyPeers.length === 0) return;

    convoyPeers.forEach((peer) => {
      const marker = L.marker([peer.lat, peer.lng], {
        icon: createConvoyPeerMarkerIcon(peer),
        zIndexOffset: 950,
      });

      const distText =
        peer.distanceKm !== undefined
          ? peer.distanceKm < 1
            ? `${Math.round(peer.distanceKm * 1000)} m away`
            : `${peer.distanceKm.toFixed(1)} km away`
          : '';

      const speedText =
        peer.speedKmh !== null && peer.speedKmh !== undefined
          ? `${peer.speedKmh} km/h`
          : 'Stationary';

      const headingText =
        typeof peer.heading === 'number'
          ? `${Math.round(peer.heading)}° ${peer.cardinalDirection || ''}`
          : 'N/A';

      const battText =
        peer.batteryLevel !== null && peer.batteryLevel !== undefined
          ? `🔋 ${Math.round(peer.batteryLevel * 100)}%`
          : '';

      const emoji =
        CONVOY_VEHICLE_OPTIONS.find((v) => v.id === peer.vehicle)?.emoji || '👤';

      const color = peer.color || '#06b6d4';

      marker.bindPopup(`
        <div style="min-width:215px;font-family:'Manrope',sans-serif;padding:3px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;text-transform:uppercase;font-weight:800;color:${color};background:${color}18;padding:2.5px 7px;border-radius:4px;border:1px solid ${color}45;">
              ${emoji} LIVE CONVOY PAL
            </span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;color:#10b981;">
              ● LIVE
            </span>
          </div>
          <div style="font-size:14px;font-weight:800;color:var(--ink);margin-top:6px;line-height:1.25;">
            ${escapeHtml(peer.name)}
          </div>
          ${distText ? `
            <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:var(--accent);margin-top:3px;">
              📍 ${escapeHtml(distText)}
            </div>
          ` : ''}
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:9.5px;">
            <span style="padding:2px 6px;border-radius:4px;background:var(--surface);border:1px solid var(--border);color:var(--ink);font-weight:700;">
              ⚡ ${speedText}
            </span>
            <span style="padding:2px 6px;border-radius:4px;background:var(--surface);border:1px solid var(--border);color:var(--ink-dim);">
              🧭 ${headingText}
            </span>
            ${battText ? `
              <span style="color:var(--ink-dim);margin-left:auto;">
                ${battText}
              </span>
            ` : ''}
          </div>
          <div style="display:flex;gap:6px;margin-top:9px;padding-top:7px;border-top:1px solid var(--border-subtle, rgba(6,182,212,0.2));">
            <button class="popup-peer-route-btn" data-peer-id="${escapeHtml(peer.id)}" style="flex:1;padding:6px 10px;background:linear-gradient(135deg, ${color}, #0891b2);color:#ffffff;border:none;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 2px 8px ${color}55;">
              🧭 Route to Friend
            </button>
            <button class="popup-peer-stop-btn" data-peer-id="${escapeHtml(peer.id)}" style="padding:6px 10px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;">
              ➕ Add Stop
            </button>
          </div>
        </div>
      `);

      marker.addTo(group);
    });
  }, [convoyPeers, showConvoyLayer]);

  // 5. Viewport movement handlers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusedCoord) return;
    map.setView([focusedCoord.lat, focusedCoord.lng], focusedCoord.zoom ?? 14, {
      animate: true,
    });
  }, [focusedCoord]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeRoute || activeRoute.coordinates.length < 2) return;
    const bounds = L.latLngBounds(activeRoute.coordinates);
    map.fitBounds(bounds, { padding: [48, 48] });
  }, [activeRoute?.id]);

  const handleFitRouteOrGps = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (activeRoute && activeRoute.coordinates.length >= 2) {
      const bounds = L.latLngBounds(activeRoute.coordinates);
      map.fitBounds(bounds, { padding: [48, 48] });
    } else if (gpsState) {
      map.setView([gpsState.lat, gpsState.lng], 15, { animate: true });
    } else {
      onLocateUserGps();
    }
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleCacheCurrentView = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    onCacheViewport(
      { lat: Number(sw.lat.toFixed(4)), lng: Number(sw.lng.toFixed(4)) },
      { lat: Number(ne.lat.toFixed(4)), lng: Number(ne.lng.toFixed(4)) }
    );
  };

  return (
    <section
      aria-label="Interactive Philippines Cartography Viewport"
      className="map-viewport flex-1 h-full w-full relative select-none touch-manipulation"
    >
      {/* Main Leaflet Canvas */}
      <div
        ref={mapContainerRef}
        data-testid="leaflet-map-canvas"
        className="w-full h-full z-0"
      />

      {/* Top Floating Quick-Action Bar: Positioned beneath Mobile Top Capsule & clears Desktop Left Rail */}
      {!(navigationActive || isSimulating) && (
        <div
          className={`absolute top-[calc(4.15rem+env(safe-area-inset-top,0px))] left-3 right-3 ${
            desktopSidebarOpen ? 'lg:left-[432px]' : 'lg:left-[208px]'
          } lg:right-4 lg:top-4 z-[400] flex items-center justify-between gap-2 pointer-events-none transition-all duration-200 ${
            mobileSheetOpen ? 'opacity-0 -translate-y-1 pointer-events-none lg:opacity-100 lg:translate-y-0' : 'opacity-100'
          }`}
        >
          <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* GPS Quick Re-center Button */}
          <button
            type="button"
            onClick={onLocateUserGps}
            disabled={gpsLoading}
            className={`cockpit-shell h-9 px-3.5 rounded-2xl text-xs font-semibold tracking-tight flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer transition-all ${
              gpsState
                ? isDark
                  ? 'text-[var(--accent-light)] border-[var(--accent)]/60'
                  : 'text-[var(--accent-deep)] border-[var(--accent)]/50'
                : 'text-[var(--ink)]'
            }`}
            title={gpsState ? 'GPS Locked · Tap to Center Map' : 'Acquire GPS Fix'}
          >
            <Crosshair className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin text-[var(--accent)]' : gpsState ? 'text-emerald-400' : 'text-[var(--accent-light)]'}`} />
            <span>{gpsLoading ? 'Locating' : gpsState ? 'GPS Lock' : 'Locate'}</span>
          </button>

          {/* Map Touch Mode Dropdown (Click-to-Toggle, Stays open until option is clicked or tapped outside) */}
          <div
            ref={modeMenuRef}
            className="relative shrink-0"
          >
            <button
              type="button"
              onClick={() => {
                setModeMenuOpen((v) => !v);
                setShowLayersMenu(false);
              }}
              className={`h-9 px-3.5 border rounded-2xl text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer font-semibold select-none ${
                mapClickAction !== 'none'
                  ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-deep)] text-white border-[var(--accent-light)] shadow-purple-500/30'
                  : 'cockpit-shell text-[var(--ink)] hover:border-[var(--accent)]'
              }`}
              title="Change Map Touch Mode (Pan, Set Origin, Set Dest, Add Stop)"
            >
              {mapClickAction === 'none' && (
                <>
                  <Hand className="w-3.5 h-3.5 text-[#c084fc]" />
                  <span>Pan</span>
                </>
              )}
              {mapClickAction === 'origin' && (
                <>
                  <MapPin className="w-3.5 h-3.5 text-amber-300" />
                  <span>Origin</span>
                </>
              )}
              {mapClickAction === 'destination' && (
                <>
                  <Flag className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Dest</span>
                </>
              )}
              {mapClickAction === 'waypoint' && (
                <>
                  <PlusCircle className="w-3.5 h-3.5 text-purple-200" />
                  <span>+Stop</span>
                </>
              )}
              {mapClickAction === 'weather' && (
                <>
                  <MapPin className="w-3.5 h-3.5 text-blue-300" />
                  <span>Weather</span>
                </>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${modeMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Flyout Menu with Motion Animation */}
            <AnimatePresence>
              {modeMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className={`absolute top-11 left-0 w-52 backdrop-blur-2xl border p-1.5 shadow-2xl rounded-2xl z-[450] space-y-1 ${
                    isDark
                      ? isAmoled
                        ? 'bg-black border-purple-500/40 text-[#f8f6fc]'
                        : 'bg-[#110820]/95 border-purple-500/30 text-[#f8f6fc]'
                      : 'bg-white/95 border-purple-300/50 text-[#160a2c]'
                  }`}
                >
                  <div className="px-2.5 py-1 text-[9px] mono uppercase tracking-wider text-[var(--ink-dim)] font-bold border-b border-[var(--border-subtle)]">
                    Map Touch Mode
                  </div>
                  {[
                    { id: 'none', label: 'Pan & Explore', desc: 'Drag map & view route', icon: Hand },
                    { id: 'origin', label: 'Set Departure (A)', desc: 'Tap map to place origin', icon: MapPin },
                    { id: 'destination', label: 'Set Arrival (B)', desc: 'Tap map to place dest', icon: Flag },
                    { id: 'waypoint', label: 'Add Stop (+)', desc: 'Tap map to drop waypoint', icon: PlusCircle },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = mapClickAction === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          onChangeMapClickAction(opt.id as MapClickAction);
                          setModeMenuOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-[var(--accent)] text-white font-bold shadow-sm'
                            : 'hover:bg-purple-500/15 text-[var(--ink)]'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-[var(--accent)]'}`} />
                        <div className="min-w-0">
                          <div className="text-xs font-bold leading-none">{opt.label}</div>
                          <div className={`text-[9.5px] mt-0.5 truncate ${isSelected ? 'text-purple-100' : 'text-[var(--ink-dim)]'}`}>
                            {opt.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>

          {/* Cartography Layers Button */}
          <button
            type="button"
            data-layers-trigger
            onClick={() => {
              setShowLayersMenu((v) => !v);
              setModeMenuOpen(false);
            }}
            aria-label="Toggle Cartography Layers"
            className={`pointer-events-auto h-9 w-9 border shrink-0 shadow-lg rounded-2xl flex items-center justify-center active:scale-95 cursor-pointer transition-all ${
              showLayersMenu
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'cockpit-shell text-[var(--ink)] hover:border-[var(--accent)]'
            }`}
            title="Map Layers (Street, Terrain, Dark, Traffic, Weather)"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Layers Flyout Menu with Motion Animation */}
      <AnimatePresence>
        {showLayersMenu && (
          <motion.div
            ref={layersMenuRef}
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="cockpit-shell absolute top-[calc(6.75rem+env(safe-area-inset-top,0px))] lg:top-16 right-3 lg:right-4 z-[410] w-60 p-3 rounded-2xl space-y-3 text-[var(--ink)]"
          >
          <div>
            <span className={`mono text-[0.6rem] uppercase tracking-wider block mb-1.5 font-bold ${
              isDark ? 'text-[#c084fc]' : 'text-[#7c3aed]'
            }`}>
              Base Map
            </span>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'street', label: 'Street' },
                  { id: 'terrain', label: 'Terrain' },
                  { id: 'dark', label: 'Dark' },
                ] as { id: MapStyleMode; label: string }[]
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onChangeMapStyle(st.id)}
                  className={`py-1.5 text-center text-xs mono uppercase rounded-lg transition-colors cursor-pointer ${
                    mapStyle === st.id
                      ? 'bg-[#a855f7] text-white font-bold'
                      : isDark
                      ? isAmoled
                        ? 'bg-zinc-950 text-purple-200/80 border border-purple-500/25 hover:border-purple-500/50'
                        : 'bg-[#160b26] text-purple-200/80 border border-purple-500/20 hover:border-purple-500/40'
                      : 'bg-purple-50 text-purple-950 border border-purple-200 hover:border-purple-300'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`border-t pt-2 space-y-1.5 ${isDark ? 'border-purple-500/20' : 'border-purple-200/60'}`}>
            <span className={`mono text-[0.6rem] uppercase tracking-wider block mb-1 font-bold ${
              isDark ? 'text-[#c084fc]' : 'text-[#7c3aed]'
            }`}>
              Overlays
            </span>
            <button
              type="button"
              onClick={onToggleTrafficLayer}
              className={`w-full py-1.5 px-2 text-left text-xs mono uppercase flex items-center justify-between border rounded-lg cursor-pointer ${
                showTrafficLayer
                  ? isDark
                    ? 'border-[#a855f7] text-[#c084fc] bg-[#a855f7]/15'
                    : 'border-purple-500 text-purple-800 bg-purple-100/70'
                  : isDark
                  ? 'border-purple-500/20 text-purple-200/80'
                  : 'border-purple-200 text-purple-900/70'
              }`}
            >
              <span>Traffic & Bottlenecks</span>
              <span className="text-[10px] font-bold">{showTrafficLayer ? 'ON' : 'OFF'}</span>
            </button>
            {onToggleTrafficLightsLayer && (
              <button
                type="button"
                onClick={onToggleTrafficLightsLayer}
                className={`w-full py-1.5 px-2 text-left text-xs mono uppercase flex items-center justify-between border rounded-lg cursor-pointer ${
                  showTrafficLightsLayer
                    ? isDark
                      ? 'border-emerald-500 text-emerald-300 bg-emerald-500/15'
                      : 'border-emerald-600 text-emerald-800 bg-emerald-100/70'
                    : isDark
                    ? 'border-purple-500/20 text-purple-200/80'
                    : 'border-purple-200 text-purple-900/70'
                }`}
              >
                <span>Traffic Lights 🚦</span>
                <span className="text-[10px] font-bold">{showTrafficLightsLayer ? 'ON' : 'OFF'}</span>
              </button>
            )}
            {onToggleConvoyLayer && (
              <button
                type="button"
                onClick={onToggleConvoyLayer}
                className={`w-full py-1.5 px-2 text-left text-xs mono uppercase flex items-center justify-between border rounded-lg cursor-pointer ${
                  showConvoyLayer
                    ? isDark
                      ? 'border-cyan-500 text-cyan-300 bg-cyan-500/15'
                      : 'border-cyan-600 text-cyan-800 bg-cyan-100/70'
                    : isDark
                    ? 'border-purple-500/20 text-purple-200/80'
                    : 'border-purple-200 text-purple-900/70'
                }`}
              >
                <span>Convoy Pals 👥</span>
                <span className="text-[10px] font-bold">{showConvoyLayer ? 'ON' : 'OFF'}</span>
              </button>
            )}
            {onToggleEstablishmentsLayer && (
              <button
                type="button"
                onClick={onToggleEstablishmentsLayer}
                className={`w-full py-1.5 px-2 text-left text-xs mono uppercase flex items-center justify-between border rounded-lg cursor-pointer ${
                  showEstablishmentsLayer
                    ? isDark
                      ? 'border-[#a855f7] text-[#c084fc] bg-[#a855f7]/15'
                      : 'border-purple-500 text-purple-800 bg-purple-100/70'
                    : isDark
                    ? 'border-purple-500/20 text-purple-200/80'
                    : 'border-purple-200 text-purple-900/70'
                }`}
              >
                <span>Establishments</span>
                <span className="text-[10px] font-bold">{showEstablishmentsLayer ? 'ON' : 'OFF'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onToggleWeatherLayer}
              className={`w-full py-1.5 px-2 text-left text-xs mono uppercase flex items-center justify-between border rounded-lg cursor-pointer ${
                showWeatherLayer
                  ? isDark
                    ? 'border-[#a855f7] text-[#c084fc] bg-[#a855f7]/15'
                    : 'border-purple-500 text-purple-800 bg-purple-100/70'
                  : isDark
                  ? 'border-purple-500/20 text-purple-200/80'
                  : 'border-purple-200 text-purple-900/70'
              }`}
            >
              <span>Weather Stations</span>
              <span className="text-[10px] font-bold">{showWeatherLayer ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={handleCacheCurrentView}
              className={`w-full py-1.5 px-2 text-left text-xs mono uppercase border rounded-lg transition-colors cursor-pointer ${
                isDark
                  ? 'border-purple-500/20 text-purple-200/80 hover:text-white hover:border-[#a855f7]'
                  : 'border-purple-200 text-purple-900/70 hover:text-purple-950 hover:border-purple-500'
              }`}
            >
              Archive Viewport Offline
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Floating Host Convoy Join Request Banner on Map */}
      {pendingConvoyJoinRequests && pendingConvoyJoinRequests.length > 0 && onAcceptConvoyJoinRequest && (
        <div
          className={`absolute top-[calc(6.9rem+env(safe-area-inset-top,0px))] lg:top-16 left-3 right-3 ${
            desktopSidebarOpen ? 'lg:left-[432px]' : 'lg:left-4'
          } max-w-md mx-auto z-[425] pointer-events-auto animate-in fade-in slide-in-from-top-4`}
        >
          <div className="p-3.5 bg-black/90 backdrop-blur-xl border-2 border-amber-500/60 rounded-2xl shadow-2xl space-y-2 text-white">
            <div className="flex items-center justify-between">
              <span className="mono text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Convoy Join Request ({pendingConvoyJoinRequests.length})</span>
              </span>
              <span className="mono text-[9px] text-gray-400">Host Approval</span>
            </div>
            {pendingConvoyJoinRequests.map((req) => (
              <div key={req.peerId} className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full border border-white flex items-center justify-center text-xs shadow-sm shrink-0"
                    style={{ background: req.color }}
                  >
                    {CONVOY_VEHICLE_OPTIONS.find((v) => v.id === req.vehicle)?.emoji || '🏍️'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white truncate">{req.name}</div>
                    <div className="mono text-[8.5px] text-gray-400">Wants to join your pack</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAcceptConvoyJoinRequest(req.peerId)}
                    className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white mono text-[9px] font-black uppercase rounded-lg shadow-xs cursor-pointer active:scale-95 transition-all"
                  >
                    Accept
                  </button>
                  {onDeclineConvoyJoinRequest && (
                    <button
                      type="button"
                      onClick={() => onDeclineConvoyJoinRequest(req.peerId)}
                      className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 mono text-[9px] font-bold uppercase rounded-lg cursor-pointer transition-all"
                    >
                      Decline
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Convoy Shared Route Notice on Map */}
      {convoySharedRoute && onLoadSharedRoute && !(navigationActive || isSimulating) && (
        <div
          className={`absolute top-[calc(6.9rem+env(safe-area-inset-top,0px))] lg:top-16 left-3 right-3 ${
            desktopSidebarOpen ? 'lg:left-[432px]' : 'lg:left-4'
          } max-w-md mx-auto z-[415] animate-fadeIn pointer-events-auto`}
        >
          <div className="p-3 rounded-2xl bg-black/85 backdrop-blur-xl border border-cyan-500/50 shadow-2xl flex items-center justify-between gap-3 text-white">
            <div className="min-w-0">
              <div className="text-[9.5px] mono uppercase font-extrabold text-cyan-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Convoy Route Shared by {convoySharedRoute.suggestedByName}</span>
              </div>
              <div className="text-xs font-black truncate mt-0.5">{convoySharedRoute.label}</div>
              <div className="text-[10px] mono text-gray-300">
                {convoySharedRoute.totalDistanceKm} km &middot; {convoySharedRoute.stops.length} stops
              </div>
            </div>
            <button
              type="button"
              onClick={() => onLoadSharedRoute(convoySharedRoute)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:brightness-110 active:scale-95 text-white mono text-[10px] font-black uppercase shrink-0 cursor-pointer shadow-md"
            >
              Load Route
            </button>
          </div>
        </div>
      )}

      {/* Real-time Turn-by-Turn Driving HUD (supports live GPS & Drive Simulation) */}
      {(navigationActive || isSimulating) && activeRoute && currentStep && (
        <div
          role="region"
          aria-label="Real-time Driving HUD"
          className={`cockpit-shell absolute top-[max(0.6rem,env(safe-area-inset-top))] lg:top-4 left-3 right-3 ${
            desktopSidebarOpen ? 'lg:left-[432px]' : 'lg:left-[208px]'
          } lg:right-4 max-w-[500px] mx-auto z-[420] p-3.5 rounded-2xl border-[var(--accent)]/50 text-[var(--ink)]`}
        >
          {/* Top Simulation Banner if active */}
          {isSimulating && (
            <div className={`flex items-center justify-between mb-2 pb-2 border-b text-xs mono ${
              isDark ? 'border-purple-500/20' : 'border-purple-200/60'
            }`}>
              <span className={`font-bold flex items-center gap-1.5 ${
                isDark ? 'text-[#c084fc]' : 'text-[#7c3aed]'
              }`}>
                <span className="w-2 h-2 rounded-full bg-[#a855f7] animate-ping" />
                SIM DRIVE ({simSpeedMultiplier}x)
              </span>

              <div className="flex items-center gap-1.5">
                {onChangeSimSpeed && (
                  <button
                    type="button"
                    onClick={() => onChangeSimSpeed(simSpeedMultiplier === 1 ? 2 : simSpeedMultiplier === 2 ? 5 : 1)}
                    className="px-2 py-0.5 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] font-bold uppercase rounded-lg cursor-pointer"
                  >
                    {simSpeedMultiplier}x
                  </button>
                )}
                {onToggleSimulation && (
                  <button
                    type="button"
                    onClick={onToggleSimulation}
                    className="p-1.5 bg-[#a855f7] text-white hover:bg-[#9333ea] rounded-lg cursor-pointer"
                    title={isSimulating ? 'Pause Drive' : 'Play Drive'}
                  >
                    {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                )}
                {onResetSimulation && (
                  <button
                    type="button"
                    onClick={onResetSimulation}
                    className="p-1.5 bg-white/10 text-gray-300 hover:text-white rounded-lg cursor-pointer"
                    title="Rewind to Start"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-white flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/30">
                <Navigation2 className="w-5 h-5 transform rotate-45" />
              </div>
              <div className="min-w-0">
                <div className={`flex items-center gap-1.5 mono text-[11px] font-bold uppercase ${
                  isDark ? 'text-[#c084fc]' : 'text-[#7c3aed]'
                }`}>
                  <span>
                    {activeStepIndex + 1}/{activeRoute.steps.length}
                  </span>
                  <span>·</span>
                  <span>{formatDistance(currentStep.distanceKm)}</span>
                  <span>·</span>
                  <span>{currentStep.durationMinutes}m</span>
                </div>
                <h3 className={`text-sm sm:text-base font-bold mt-0.5 leading-snug line-clamp-2 ${
                  isDark ? 'text-white' : 'text-[#160a2c]'
                }`}>
                  {currentStep.instruction}
                </h3>
                {currentStep.roadName && (
                  <p className={`mono text-[10px] uppercase tracking-wider mt-0.5 truncate ${
                    isDark ? 'text-purple-300/70' : 'text-purple-800/70'
                  }`}>
                    {currentStep.roadName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onToggleDashcam && (
                <button
                  type="button"
                  onClick={onToggleDashcam}
                  aria-label="Toggle Dashcam"
                  className={`p-2 border rounded-xl transition-colors cursor-pointer ${
                    dashcamActive
                      ? 'bg-purple-600 text-white border-purple-400'
                      : isDark
                      ? 'border-purple-500/25 text-[#c084fc]'
                      : 'border-purple-200 text-purple-800'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}
              {onToggleVoiceGuidance && (
                <button
                  type="button"
                  onClick={onToggleVoiceGuidance}
                  aria-label={voiceGuidance ? 'Mute Voice' : 'Unmute Voice'}
                  className={`p-2 border rounded-xl transition-colors cursor-pointer ${
                    voiceGuidance
                      ? isDark
                        ? 'border-[#a855f7] text-[#c084fc] bg-[#a855f7]/15'
                        : 'border-purple-500 text-purple-800 bg-purple-100'
                      : isDark
                      ? 'border-purple-500/20 text-gray-400'
                      : 'border-purple-200 text-purple-900/50'
                  }`}
                >
                  {voiceGuidance ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              )}
              {onToggleFollowGps && (
                <button
                  type="button"
                  onClick={onToggleFollowGps}
                  title={followGps ? 'Follow Mode On' : 'Follow Mode Off'}
                  className={`p-2 border rounded-xl transition-colors cursor-pointer ${
                    followGps
                      ? isDark
                        ? 'border-[#a855f7] text-[#c084fc] bg-[#a855f7]/15'
                        : 'border-purple-500 text-purple-800 bg-purple-100'
                      : isDark
                      ? 'border-purple-500/20 text-gray-400'
                      : 'border-purple-200 text-purple-900/50'
                  }`}
                >
                  <Compass className={`w-4 h-4 ${followGps ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={onExitNavigation}
                className="px-2.5 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white mono text-xs uppercase font-bold rounded-xl cursor-pointer transition-transform"
              >
                End
              </button>
            </div>
          </div>

          {/* Progress bar along the journey */}
          {simulationProgress > 0 && (
            <div className="w-full bg-purple-950/30 h-1.5 mt-3 overflow-hidden rounded-full border border-purple-500/20">
              <div
                className="bg-gradient-to-r from-[#a855f7] to-[#c084fc] h-full transition-all duration-200"
                style={{ width: `${simulationProgress}%` }}
              />
            </div>
          )}

          {/* Stepper controls */}
          <div className={`flex items-center justify-between mt-3 pt-2.5 border-t text-xs mono ${
            isDark ? 'border-purple-500/20' : 'border-purple-200/60'
          }`}>
            <button
              type="button"
              disabled={activeStepIndex === 0}
              onClick={() => onStepChange(Math.max(0, activeStepIndex - 1))}
              className="min-h-[32px] px-2 flex items-center gap-1 disabled:opacity-30 hover:opacity-100 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>

            <span className={isDark ? 'text-purple-300/80' : 'text-purple-800/80'}>
              {gpsState?.speedKmh !== null && gpsState?.speedKmh !== undefined ? (
                <span className={`font-bold ${isDark ? 'text-[#c084fc]' : 'text-[#7c3aed]'}`}>
                  {gpsState.speedKmh} KM/H
                </span>
              ) : (
                'ETA: ' + activeRoute.totalDurationMinutes + 'm'
              )}
            </span>

            <button
              type="button"
              disabled={activeStepIndex >= activeRoute.steps.length - 1}
              onClick={() => onStepChange(Math.min(activeRoute.steps.length - 1, activeStepIndex + 1))}
              className={`min-h-[32px] px-2 flex items-center gap-1 disabled:opacity-30 font-bold cursor-pointer ${
                isDark ? 'text-[#c084fc]' : 'text-[#7c3aed]'
              }`}
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Speedometer & Status Pill (Clears bottom sheet on mobile & left sidebar on desktop) */}
      <div
        className={`absolute bottom-[calc(7.6rem+env(safe-area-inset-bottom,0px))] lg:bottom-5 left-3 ${
          desktopSidebarOpen ? 'lg:left-[432px]' : 'lg:left-4'
        } z-[450] flex flex-col items-start gap-1.5 pointer-events-none transition-all duration-300 ${
          mobileSheetOpen
            ? 'opacity-0 translate-y-2 pointer-events-none lg:opacity-100 lg:translate-y-0'
            : 'opacity-100 translate-y-0'
        }`}
      >
        {gpsState?.speedKmh !== null && gpsState?.speedKmh !== undefined && (
          <div className="cockpit-shell px-3.5 py-2 text-center pointer-events-auto rounded-2xl flex items-center gap-2.5 text-[var(--ink)] border-[var(--accent)]/45">
            <div className="text-2xl font-black mono leading-none tabular-nums">
              {gpsState.speedKmh}
            </div>
            <div className="text-left">
              <div className="text-[10px] mono uppercase font-bold tracking-wider leading-none text-[var(--accent-light)]">
                KM/H
              </div>
              <div className="text-[8.5px] mono uppercase text-[var(--ink-dim)] leading-none mt-0.5">
                SPEED
              </div>
            </div>
          </div>
        )}

        <div className="cockpit-shell px-3 py-1.5 mono text-[10.5px] pointer-events-auto rounded-2xl text-[var(--ink-dim)]">
          <div className="font-bold flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                gpsState ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-[var(--ink)]">
              {isSimulating
                ? 'Simulating Ride'
                : gpsState
                ? `GPS ±${gpsState.accuracyMeters}m`
                : 'Acquiring GPS…'}
            </span>
          </div>
          <div className="text-[9.5px] uppercase mt-0.5 truncate max-w-[190px] tabular-nums text-[var(--ink-dim)]">
            {isOfflineMode ? 'OFFLINE' : 'PH'} ·{' '}
            {(gpsState ? gpsState.lat : cursorCoords.lat).toFixed(4)}°,{' '}
            {(gpsState ? gpsState.lng : cursorCoords.lng).toFixed(4)}°
          </div>
        </div>
      </div>

      {/* Bottom-Right Thumb FAB Rail (Positioned safely above mobile sheet & bottom-right on desktop) */}
      <div
        className={`absolute bottom-[calc(7.6rem+env(safe-area-inset-bottom,0px))] lg:bottom-5 right-3 lg:right-4 z-[400] flex flex-col gap-2 transition-all duration-300 ${
          mobileSheetOpen
            ? 'opacity-0 translate-y-2 pointer-events-none lg:opacity-100 lg:translate-y-0 lg:pointer-events-auto'
            : 'opacity-100 translate-y-0'
        }`}
      >
        {onOpenStravaModal && (
          <button
            type="button"
            onClick={onOpenStravaModal}
            aria-label="Open Strava Simulation & GPS Activity"
            title="Strava GPX Tracker & Activity"
            className={`w-11 h-11 backdrop-blur-xl border flex items-center justify-center shadow-xl rounded-2xl active:scale-95 transition-all cursor-pointer relative ${
              stravaRecordingActive
                ? 'bg-[#fc5200] border-orange-400 text-white shadow-orange-950/50'
                : isDark
                ? isAmoled
                  ? 'bg-black border-[#fc5200]/40 text-[#fc5200] hover:border-[#fc5200]'
                  : 'bg-[#120824]/90 border-[#fc5200]/40 text-[#fc5200] hover:border-[#fc5200]'
                : 'bg-white/95 border-[#fc5200]/50 text-[#fc5200]'
            }`}
          >
            <Activity className="w-5 h-5" />
            {stravaRecordingActive && (
              <>
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-600" />
              </>
            )}
          </button>
        )}
        {onToggleDashcam && (
          <button
            type="button"
            onClick={onToggleDashcam}
            aria-label="Toggle Dashcam & Highway Timelapse"
            title="Dashcam & Timelapse HUD"
            className={`w-11 h-11 backdrop-blur-xl border flex items-center justify-center text-lg font-bold shadow-xl rounded-2xl active:scale-95 transition-all cursor-pointer relative ${
              dashcamActive
                ? 'bg-purple-600 border-purple-400 text-white'
                : isDark
                ? isAmoled
                  ? 'bg-black border-purple-500/40 text-[#c084fc] hover:border-[#a855f7]'
                  : 'bg-[#0d0717]/90 border-purple-500/30 text-[#c084fc] hover:border-[#a855f7]'
                : 'bg-white/95 border-purple-300/60 text-[#7c3aed] hover:border-purple-500'
            }`}
          >
            <Camera className="w-5 h-5" />
            {isRecordingVideo && (
              <>
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-600" />
              </>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={handleFitRouteOrGps}
          aria-label="Center GPS or Route"
          title="Center GPS / Route"
          className={`w-11 h-11 backdrop-blur-xl border flex items-center justify-center text-lg font-bold shadow-xl rounded-2xl active:scale-95 transition-all cursor-pointer ${
            isDark
              ? isAmoled
                ? 'bg-black border-purple-500/40 text-[#c084fc] hover:border-[#a855f7] active:bg-[#a855f7] active:text-white'
                : 'bg-[#0d0717]/90 border-purple-500/30 text-[#c084fc] hover:border-[#a855f7] active:bg-[#a855f7] active:text-white'
              : 'bg-white/95 border-purple-300/60 text-[#7c3aed] hover:border-purple-500 active:bg-[#7c3aed] active:text-white'
          }`}
        >
          <Crosshair className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          className="cockpit-shell hidden sm:flex w-11 h-11 items-center justify-center rounded-2xl text-[var(--ink)] hover:border-[var(--accent)] active:bg-[var(--accent)] active:text-white active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          className="cockpit-shell hidden sm:flex w-11 h-11 items-center justify-center rounded-2xl text-[var(--ink)] hover:border-[var(--accent)] active:bg-[var(--accent)] active:text-white active:scale-95 transition-all cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
};
