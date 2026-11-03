import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
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
  mobileSheetOpen?: boolean;
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

function createEstablishmentMarkerIcon(
  est: Establishment,
  isSelected: boolean
): L.DivIcon {
  const catMeta = ESTABLISHMENT_CATEGORIES.find((c) => c.id === est.category);
  const color = catMeta?.color || '#a855f7';
  const emoji = catMeta?.emoji || '📍';
  const safeName = escapeHtml(est.name.split('(')[0].trim());
  const size = isSelected ? 28 : 22;
  const shadow = isSelected
    ? `box-shadow: 0 0 0 3px #ffffff, 0 0 16px ${color};`
    : `box-shadow: 0 3px 8px rgba(0,0,0,0.45);`;

  return L.divIcon({
    className: 'v2-establishment-pin',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="width:${size}px;height:${size}px;background:${color};border:2px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${size > 22 ? 14 : 11}px;${shadow}cursor:pointer;transition:transform 0.15s ease;">
        ${emoji}
      </div>
      <div class="est-pin-label" style="margin-top:2px;font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:700;letter-spacing:0.04em;white-space:nowrap;padding:1px 5px;border-radius:3px;max-width:110px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;">
        ${safeName}
      </div>
    </div>`,
    iconSize: [110, size + 16],
    iconAnchor: [55, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createTrafficLightMarkerIcon(tl: TrafficLight): L.DivIcon {
  const safeName = escapeHtml(tl.name.split('(')[0].replace(/ Signal.*| Intersection/i, '').trim());
  return L.divIcon({
    className: 'v2-traffic-light-pin',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="
        width: 22px;
        height: 32px;
        background: #111827;
        border: 1.5px solid #374151;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-evenly;
        padding: 2px 0;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5), 0 0 8px rgba(16, 185, 129, 0.4);
        cursor: pointer;
      ">
        <span style="width: 5px; height: 5px; border-radius: 50%; background: #ef4444; opacity: 0.7;"></span>
        <span style="width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; opacity: 0.7;"></span>
        <span style="width: 5.5px; height: 5.5px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
      </div>
      <div class="tl-pin-label" style="margin-top:2px;font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:700;letter-spacing:0.03em;white-space:nowrap;padding:1px 5px;border-radius:3px;max-width:105px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;">
        🚦 ${safeName}
      </div>
    </div>`,
    iconSize: [105, 50],
    iconAnchor: [52, 16],
    popupAnchor: [0, -16],
  });
}

function createHeavyTrafficMarkerIcon(inc: TrafficIncident): L.DivIcon {
  return L.divIcon({
    className: 'v2-heavy-traffic-pin',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <div class="heavy-traffic-pulse" style="
        width: 28px;
        height: 28px;
        background: #dc2626;
        border: 2px solid #ffffff;
        border-radius: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.75);
        animation: heavy-radar-pulse 1.8s infinite;
        cursor: pointer;
      ">
        🛑
      </div>
      <div style="
        margin-top: 2px;
        background: #991b1b;
        color: #ffffff;
        font-family: 'JetBrains Mono', monospace;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: 0.03em;
        white-space: nowrap;
        padding: 1px 5px;
        border-radius: 3px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        pointer-events: none;
      ">
        +${inc.delayMinutes}m
      </div>
    </div>`,
    iconSize: [80, 50],
    iconAnchor: [40, 14],
    popupAnchor: [0, -14],
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
  mobileSheetOpen = false,
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
    }, 100);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({
        lat: Number(e.latlng.lat.toFixed(4)),
        lng: Number(e.latlng.lng.toFixed(4)),
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
          `<div style="min-width:170px;font-family:'Inter',sans-serif;">
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

          const incIcon = isHeavy
            ? createHeavyTrafficMarkerIcon(inc)
            : L.divIcon({
                className: 'v2-traffic-marker',
                html: `<div style="
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  width:24px;
                  height:24px;
                  background:${badgeColor};
                  border:1.5px solid #ffffff;
                  color:#ffffff;
                  font-family:'JetBrains Mono',monospace;
                  font-size:11px;
                  font-weight:800;
                  border-radius:4px;
                  box-shadow:0 3px 10px rgba(0,0,0,0.6);
                ">!</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              });

          const marker = L.marker([inc.lat, inc.lng], {
            icon: incIcon,
            zIndexOffset: isHeavy ? 600 : 200,
          });

          marker.bindPopup(
            isHeavy
              ? `<div style="min-width:215px;font-family:'Inter',sans-serif;padding:3px;">
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
              : `<div style="min-width:190px;font-family:'Inter',sans-serif;padding:3px;">
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
            `<div style="min-width:210px;font-family:'Inter',sans-serif;">
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
            `<div style="min-width:180px;font-family:'Inter',sans-serif;">
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
        `<div style="min-width:190px;font-family:'Inter',sans-serif;padding:2px;">
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
      const marker = L.marker([est.lat, est.lng], {
        icon: createEstablishmentMarkerIcon(est, isSelected),
        zIndexOffset: isSelected ? 800 : 120,
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
        <div style="min-width:215px;font-family:'Inter',sans-serif;padding:3px;">
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
  }, [establishments, showEstablishmentsLayer, selectedEstablishmentId, onSelectEstablishment]);

  // 4c. Render Traffic Lights Layer (Signalized Intersections)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = trafficLightsLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (!showTrafficLightsLayer || !trafficLights || trafficLights.length === 0) return;

    trafficLights.forEach((tl) => {
      const marker = L.marker([tl.lat, tl.lng], {
        icon: createTrafficLightMarkerIcon(tl),
        zIndexOffset: 150,
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
        <div style="min-width:215px;font-family:'Inter',sans-serif;padding:3px;">
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
  }, [trafficLights, showTrafficLightsLayer]);

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
        <div style="min-width:215px;font-family:'Inter',sans-serif;padding:3px;">
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

      {/* Top Floating Quick-Action Bar: 100% 1-line on all screens (No horizontal sliding!) */}
      {!(navigationActive || isSimulating) && (
        <div className="absolute top-3 left-3 right-3 sm:right-auto z-[400] flex items-center gap-2 pointer-events-auto">
          {/* GPS Quick Re-center Button */}
          <button
            type="button"
            onClick={onLocateUserGps}
            disabled={gpsLoading}
            className={`h-9 px-3 backdrop-blur-xl border rounded-xl text-xs mono font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 shadow-lg cursor-pointer transition-all ${
              isDark
                ? gpsState
                  ? isAmoled
                    ? 'bg-black text-[#c084fc] border-[#a855f7]/70 shadow-purple-500/20'
                    : 'bg-[#110820]/90 text-[#c084fc] border-[#a855f7]/60 shadow-purple-500/20'
                  : isAmoled
                  ? 'bg-black text-[#f8f6fc] border-purple-500/30'
                  : 'bg-[#0d0717]/90 text-[#f8f6fc] border-purple-500/25'
                : gpsState
                ? 'bg-purple-100/90 text-[#7c3aed] border-purple-500/60'
                : 'bg-white/90 text-[#160a2c] border-purple-300/40'
            }`}
            title={gpsState ? 'GPS Locked · Click to Center Map' : 'Acquire GPS Fix'}
          >
            <Crosshair className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin text-purple-400' : gpsState ? 'text-emerald-400' : ''}`} />
            <span>{gpsLoading ? 'Locating' : gpsState ? 'GPS Locked' : 'Locate'}</span>
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
              className={`h-9 px-3 backdrop-blur-xl border rounded-xl text-xs mono uppercase tracking-wider flex items-center gap-1.5 shadow-lg transition-all cursor-pointer font-bold select-none ${
                mapClickAction !== 'none'
                  ? 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white border-[#c084fc] shadow-purple-500/30'
                  : isDark
                  ? isAmoled
                    ? 'bg-black border-purple-500/35 text-[#f8f6fc] hover:border-purple-500/60'
                    : 'bg-[#0d0717]/90 border-purple-500/25 text-[#f8f6fc] hover:border-purple-500/50'
                  : 'bg-white/90 border-purple-300/40 text-[#160a2c] hover:border-purple-500/50'
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

          {/* Cartography Layers Button */}
          <button
            type="button"
            data-layers-trigger
            onClick={() => {
              setShowLayersMenu((v) => !v);
              setModeMenuOpen(false);
            }}
            aria-label="Toggle Cartography Layers"
            className={`h-9 w-9 backdrop-blur-xl border shrink-0 shadow-lg rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
              showLayersMenu
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : isDark
                ? isAmoled
                  ? 'bg-black border-purple-500/35 text-[#f8f6fc] hover:border-[#a855f7]'
                  : 'bg-[#0d0717]/90 border-purple-500/25 text-[#f8f6fc] hover:border-[#a855f7]'
                : 'bg-white/90 border-purple-300/40 text-[#160a2c] hover:border-purple-500'
            }`}
            title="Map Layers (Satellite, Street, Dark, Traffic, Weather)"
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
            className={`absolute top-14 right-3 z-[410] w-56 backdrop-blur-2xl border p-3 shadow-2xl rounded-xl space-y-3 ${
              isDark
                ? isAmoled
                  ? 'bg-black border-purple-500/40 text-[#f8f6fc]'
                  : 'bg-[#110820]/95 border-purple-500/30 text-[#f8f6fc]'
                : 'bg-white/95 border-purple-300/40 text-[#160a2c]'
            }`}
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

      {/* Real-time Turn-by-Turn Mobile Driving HUD (supports live GPS & Drive Simulation) */}
      {(navigationActive || isSimulating) && activeRoute && currentStep && (
        <div
          role="region"
          aria-label="Real-time Driving HUD"
          className={`absolute top-16 left-3 right-3 sm:left-6 sm:right-auto sm:max-w-lg z-[420] backdrop-blur-2xl border border-l-4 p-4 shadow-2xl rounded-xl ${
            isDark
              ? isAmoled
                ? 'bg-black/95 border-purple-500/35 border-l-[#a855f7] text-[#f8f6fc]'
                : 'bg-[#110820]/90 border-purple-500/25 border-l-[#a855f7] text-[#f8f6fc]'
              : 'bg-white/95 border-purple-300/40 border-l-[#9333ea] text-[#160a2c] shadow-purple-950/15'
          }`}
        >
          {/* Top Simulation Banner if active */}
          {isSimulating && (
            <div className={`flex items-center justify-between mb-2 pb-2 border-b text-xs mono ${
              theme === 'dark' ? 'border-purple-500/20' : 'border-purple-200/60'
            }`}>
              <span className={`font-bold flex items-center gap-1 ${
                theme === 'dark' ? 'text-[#c084fc]' : 'text-[#7c3aed]'
              }`}>
                <span className="w-2 h-2 rounded-full bg-[#a855f7] animate-ping" />
                SIMULATED DRIVE ({simSpeedMultiplier}x)
              </span>

              <div className="flex items-center gap-1.5">
                {onChangeSimSpeed && (
                  <button
                    type="button"
                    onClick={() => onChangeSimSpeed(simSpeedMultiplier === 1 ? 2 : simSpeedMultiplier === 2 ? 5 : 1)}
                    className="px-2 py-0.5 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] font-bold uppercase rounded cursor-pointer"
                  >
                    {simSpeedMultiplier}x Speed
                  </button>
                )}
                {onToggleSimulation && (
                  <button
                    type="button"
                    onClick={onToggleSimulation}
                    className="p-1 bg-[#a855f7] text-white hover:bg-[#9333ea] rounded cursor-pointer"
                    title={isSimulating ? 'Pause Drive' : 'Play Drive'}
                  >
                    {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                )}
                {onResetSimulation && (
                  <button
                    type="button"
                    onClick={onResetSimulation}
                    className="p-1 bg-white/10 text-gray-300 hover:text-white rounded cursor-pointer"
                    title="Rewind to Start"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-white flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/30">
                <Navigation2 className="w-6 h-6 transform rotate-45" />
              </div>
              <div className="min-w-0">
                <div className={`flex items-center gap-2 mono text-xs font-bold uppercase ${
                  theme === 'dark' ? 'text-[#c084fc]' : 'text-[#7c3aed]'
                }`}>
                  <span>
                    Step {activeStepIndex + 1}/{activeRoute.steps.length}
                  </span>
                  <span>·</span>
                  <span>{formatDistance(currentStep.distanceKm)}</span>
                  <span>·</span>
                  <span>{currentStep.durationMinutes}m</span>
                </div>
                <h3 className={`text-base sm:text-lg font-bold mt-1 leading-tight ${
                  theme === 'dark' ? 'text-white' : 'text-[#160a2c]'
                }`}>
                  {currentStep.instruction}
                </h3>
                {currentStep.roadName && (
                  <p className={`mono text-[0.7rem] uppercase tracking-wider mt-1 truncate ${
                    theme === 'dark' ? 'text-purple-300/70' : 'text-purple-800/70'
                  }`}>
                    {currentStep.roadName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onToggleVoiceGuidance && (
                <button
                  type="button"
                  onClick={onToggleVoiceGuidance}
                  aria-label={voiceGuidance ? 'Mute Voice' : 'Unmute Voice'}
                  className={`p-2 border rounded-lg transition-colors cursor-pointer ${
                    voiceGuidance
                      ? theme === 'dark'
                        ? 'border-[#a855f7] text-[#c084fc] bg-[#a855f7]/15'
                        : 'border-purple-500 text-purple-800 bg-purple-100'
                      : theme === 'dark'
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
                  className={`p-2 border rounded-lg transition-colors cursor-pointer ${
                    followGps
                      ? theme === 'dark'
                        ? 'border-[#a855f7] text-[#c084fc] bg-[#a855f7]/15'
                        : 'border-purple-500 text-purple-800 bg-purple-100'
                      : theme === 'dark'
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
                className="px-2.5 py-2 bg-red-600/80 hover:bg-red-600 text-white mono text-xs uppercase font-bold rounded-lg cursor-pointer"
              >
                End
              </button>
            </div>
          </div>

          {/* Progress bar along the journey */}
          {simulationProgress > 0 && (
            <div className="w-full bg-purple-950/20 h-1 mt-3 overflow-hidden rounded-full border border-purple-500/20">
              <div
                className="bg-gradient-to-r from-[#a855f7] to-[#c084fc] h-full transition-all duration-200"
                style={{ width: `${simulationProgress}%` }}
              />
            </div>
          )}

          {/* Stepper controls */}
          <div className={`flex items-center justify-between mt-3 pt-2.5 border-t text-xs mono ${
            theme === 'dark' ? 'border-purple-500/20' : 'border-purple-200/60'
          }`}>
            <button
              type="button"
              disabled={activeStepIndex === 0}
              onClick={() => onStepChange(Math.max(0, activeStepIndex - 1))}
              className="flex items-center gap-1 disabled:opacity-30 hover:opacity-100 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>

            <span className={theme === 'dark' ? 'text-purple-300/80' : 'text-purple-800/80'}>
              {gpsState?.speedKmh !== null && gpsState?.speedKmh !== undefined ? (
                <span className={`font-bold ${theme === 'dark' ? 'text-[#c084fc]' : 'text-[#7c3aed]'}`}>
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
              className={`flex items-center gap-1 disabled:opacity-30 font-bold cursor-pointer ${
                theme === 'dark' ? 'text-[#c084fc]' : 'text-[#7c3aed]'
              }`}
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Speedometer & Status Badge (Positioned safely above the mobile bottom drawer: bottom-8.75rem clears the 6rem drawer + safe area) */}
      <div
        className={`absolute bottom-[calc(8.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 left-3 z-[450] flex flex-col sm:flex-row items-start sm:items-center gap-1.5 pointer-events-none transition-all duration-300 ${
          mobileSheetOpen ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        {gpsState?.speedKmh !== null && gpsState?.speedKmh !== undefined && (
          <div
            className={`px-3 py-2 text-center pointer-events-auto shadow-2xl rounded-xl border backdrop-blur-2xl flex items-center gap-2 ${
              isDark
                ? isAmoled
                  ? 'bg-black border-purple-500/50 text-white'
                  : 'bg-[#110820]/90 border-purple-500/40 text-white'
                : 'bg-white/95 border-purple-300/60 text-[#160a2c] shadow-purple-900/10'
            }`}
          >
            <div className="text-2xl sm:text-3xl font-black display leading-none">
              {gpsState.speedKmh}
            </div>
            <div className="text-left">
              <div className={`text-[10px] mono uppercase font-extrabold tracking-wider leading-none ${
                isDark ? 'text-[#c084fc]' : 'text-[#7c3aed]'
              }`}>
                KM/H
              </div>
              <div className="text-[8px] mono uppercase text-gray-400 leading-none mt-0.5">
                SPEED
              </div>
            </div>
          </div>
        )}

        <div
          className={`px-3 py-2 mono text-[11px] pointer-events-auto shadow-xl rounded-xl border backdrop-blur-xl ${
            isDark
              ? isAmoled
                ? 'bg-black border-purple-500/35 text-purple-200/90'
                : 'bg-[#0d0717]/90 border-purple-500/25 text-purple-200/90'
              : 'bg-white/90 border-purple-200/70 text-purple-950/80 shadow-purple-900/5'
          }`}
        >
          <div className="font-bold flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                gpsState ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className={isDark ? 'text-white' : 'text-[#160a2c]'}>
              {isSimulating
                ? 'Simulated Movement (A → B)'
                : gpsState
                ? `GPS Active: ±${gpsState.accuracyMeters}m`
                : 'Searching Satellites…'}
            </span>
          </div>
          <div className={`text-[9px] uppercase mt-0.5 truncate max-w-[200px] ${
            isDark ? 'text-purple-300/60' : 'text-purple-700/60'
          }`}>
            {isOfflineMode ? 'OFFLINE ARCHIVE' : 'PHILIPPINES'} ·{' '}
            {cursorCoords.lat.toFixed(3)}°, {cursorCoords.lng.toFixed(3)}°
          </div>
        </div>
      </div>

      {/* Bottom-Right Thumb Controls (Positioned safely above mobile drawer) */}
      <div
        className={`absolute bottom-[calc(8.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 right-3 z-[400] flex flex-col gap-2 transition-all duration-300 ${
          mobileSheetOpen ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        <button
          type="button"
          onClick={handleFitRouteOrGps}
          aria-label="Center GPS or Route"
          title="Center GPS / Route"
          className={`w-11 h-11 backdrop-blur-xl border flex items-center justify-center text-lg font-bold shadow-xl rounded-xl transition-colors cursor-pointer ${
            isDark
              ? isAmoled
                ? 'bg-black border-purple-500/40 text-[#c084fc] hover:border-[#a855f7] active:bg-[#a855f7] active:text-white'
                : 'bg-[#0d0717]/85 border-purple-500/30 text-[#c084fc] hover:border-[#a855f7] active:bg-[#a855f7] active:text-white'
              : 'bg-white/90 border-purple-300/60 text-[#7c3aed] hover:border-purple-500 active:bg-[#7c3aed] active:text-white'
          }`}
        >
          <Crosshair className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          className={`w-11 h-11 backdrop-blur-xl border flex items-center justify-center text-xl font-bold shadow-xl rounded-xl transition-colors cursor-pointer ${
            isDark
              ? isAmoled
                ? 'bg-black border-purple-500/40 text-white hover:border-[#a855f7] active:bg-[#a855f7]'
                : 'bg-[#0d0717]/85 border-purple-500/30 text-white hover:border-[#a855f7] active:bg-[#a855f7]'
              : 'bg-white/90 border-purple-300/60 text-[#160a2c] hover:border-purple-500 active:bg-purple-100'
          }`}
        >
          ＋
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          className={`w-11 h-11 backdrop-blur-xl border flex items-center justify-center text-xl font-bold shadow-xl rounded-xl transition-colors cursor-pointer ${
            isDark
              ? isAmoled
                ? 'bg-black border-purple-500/40 text-white hover:border-[#a855f7] active:bg-[#a855f7]'
                : 'bg-[#0d0717]/85 border-purple-500/30 text-white hover:border-[#a855f7] active:bg-[#a855f7]'
              : 'bg-white/90 border-purple-300/60 text-[#160a2c] hover:border-purple-500 active:bg-purple-100'
          }`}
        >
          －
        </button>
      </div>
    </section>
  );
};
