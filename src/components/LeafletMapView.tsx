import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
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
} from 'lucide-react';
import {
  ComputedRoute,
  LatLngPoint,
  TrafficIncident,
  WeatherSnapshot,
  formatDistance,
} from '../utils/routingEngine';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
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
  showWeatherLayer: boolean;
  onToggleWeatherLayer: () => void;
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
  const dotBg = isEndpoint ? '#ff4d00' : '#1c1c1e';
  const dotBorder = isEndpoint ? '2px solid #f2f2f2' : '2px solid #ff4d00';
  return L.divIcon({
    className: 'v2-technical-pin',
    html: `<div style="position:relative;width:18px;height:18px;background:${dotBg};border:${dotBorder};box-shadow:0 2px 8px rgba(0,0,0,0.65);border-radius:2px;">
      <div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;white-space:nowrap;background:#1c1c1e;color:#f2f2f2;border:1px solid rgba(242,242,242,0.22);padding:3px 8px;box-shadow:0 4px 12px rgba(0,0,0,0.45);">${fullLabel}</div>
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
    // Dynamic Navigational Chevron rotated precisely towards road direction
    return L.divIcon({
      className: 'v2-gps-vehicle-chevron',
      html: `<div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:2px;border-radius:9999px;background:rgba(255,77,0,0.25);box-shadow:0 0 16px rgba(255,77,0,0.6);"></div>
        <div style="transform:rotate(${heading}deg);transition:transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);display:flex;align-items:center;justify-content:center;">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L4 21L12 17L20 21L12 2Z" fill="#ff4d00" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>
          </svg>
        </div>
        <div style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;background:#ff4d00;color:#ffffff;border:1px solid #111113;padding:2px 6px;box-shadow:0 2px 8px rgba(0,0,0,0.5);pointer-events:none;">
          ${safeShort}
        </div>
      </div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -19],
    });
  }

  // Stationary pulsating circular beacon
  return L.divIcon({
    className: 'v2-gps-beacon',
    html: `<div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(255,77,0,0.35);border:1.5px solid #ff4d00;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="width:12px;height:12px;border-radius:9999px;background:#ff4d00;border:2px solid #ffffff;box-shadow:0 0 10px #ff4d00;"></div>
      <div style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;background:#ff4d00;color:#ffffff;border:1px solid #111113;padding:2px 6px;box-shadow:0 4px 12px rgba(0,0,0,0.45);pointer-events:none;">
        YOU ARE HERE · ${safeShort}
      </div>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
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
  showWeatherLayer,
  onToggleWeatherLayer,
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
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  
  // Decoupled layer groups for 60fps performance
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const gpsLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [showLayersMenu, setShowLayersMenu] = useState(false);

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
    routeLayerGroupRef.current = routeGroup;
    gpsLayerGroupRef.current = gpsGroup;
    mapInstanceRef.current = map;

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
      if (clickActionRef.current !== 'none') {
        pickCallbackRef.current(
          Number(e.latlng.lat.toFixed(4)),
          Number(e.latlng.lng.toFixed(4)),
          clickActionRef.current
        );
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
              : '#ff4d00';
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
          color: '#ff4d00',
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
            <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;text-transform:uppercase;letter-spacing:0.15em;color:rgba(242,242,242,0.5);">${
              isOrigin ? 'Departure Point' : isDest ? 'Arrival Port' : `Stop ${idx}`
            }</div>
            <div style="font-size:14px;font-weight:600;color:#f2f2f2;margin-top:4px;">${escapeHtml(
              stop.name
            )}</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#ff4d00;margin-top:6px;">${stop.lat.toFixed(
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
          color: '#ff4d00',
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
          const badgeColor =
            inc.severity === 'heavy' || inc.severity === 'closure'
              ? '#dc2626'
              : '#d97706';

          const incIcon = L.divIcon({
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

          const marker = L.marker([inc.lat, inc.lng], { icon: incIcon });
          marker.bindPopup(
            `<div style="min-width:190px;font-family:'Inter',sans-serif;">
              <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;text-transform:uppercase;color:#ff4d00;">${escapeHtml(
                inc.corridor
              )}</div>
              <div style="font-size:13.5px;font-weight:600;color:#f2f2f2;margin-top:3px;">${escapeHtml(
                inc.title
              )}</div>
              <div style="font-size:12px;color:rgba(242,242,242,0.65);margin-top:4px;">${escapeHtml(
                inc.description
              )}</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#f2f2f2;margin-top:6px;">
                +${inc.delayMinutes}M DELAY &middot; ${inc.speedKmh} KM/H
              </div>
            </div>`
          );
          marker.addTo(group);
        });
    }

    // Weather Stations
    if (showWeatherLayer) {
      weatherSnapshots.forEach((snap) => {
        const weatherIcon = L.divIcon({
          className: 'v2-weather-marker',
          html: `<div style="
            display:inline-flex;
            align-items:center;
            padding:3px 8px;
            background:#1c1c1e;
            color:#f2f2f2;
            border:1px solid rgba(242,242,242,0.22);
            font-family:'JetBrains Mono',monospace;
            font-size:9.5px;
            font-weight:600;
            text-transform:uppercase;
            letter-spacing:0.1em;
            white-space:nowrap;
            box-shadow:0 4px 12px rgba(0,0,0,0.45);
            border-radius:2px;
          "><span style="color:#ff4d00;margin-right:4px;">${snap.tempC}&deg;C</span> ${escapeHtml(
            snap.condition
          )}</div>`,
          iconSize: [110, 22],
          iconAnchor: [-16, 20],
        });

        const wMarker = L.marker([snap.lat, snap.lng], { icon: weatherIcon });
        wMarker.bindPopup(
          `<div style="min-width:180px;font-family:'Inter',sans-serif;">
            <div style="font-size:13.5px;font-weight:600;color:#f2f2f2;">${escapeHtml(
              snap.locationName
            )}</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(242,242,242,0.65);margin-top:4px;text-transform:uppercase;">
              ${snap.tempC}&deg;C (${escapeHtml(snap.condition)}) &middot; WIND ${snap.windKmh} KM/H
            </div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#ff4d00;margin-top:4px;text-transform:uppercase;">
              PRECIP ${snap.precipProbPct}% &middot; VIS ${snap.visibilityKm} KM
            </div>
          </div>`
        );
        wMarker.addTo(group);
      });
    }
  }, [
    stops,
    routes,
    activeRouteIndex,
    activeRoute,
    incidents,
    showTrafficLayer,
    weatherSnapshots,
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
        color: '#ff4d00',
        weight: 1.5,
        fillColor: '#ff4d00',
        fillOpacity: 0.12,
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
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;text-transform:uppercase;color:#ff4d00;">
            ${isSimulating ? 'SIMULATED DRIVE' : 'REALTIME GPS FIX'}
          </div>
          <div style="font-size:13.5px;font-weight:600;color:#f2f2f2;margin-top:4px;">${safeLabel}</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(242,242,242,0.65);margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">
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

      {/* Top Floating Quick-Action Bar */}
      <div className="absolute top-3 left-3 right-3 sm:right-auto sm:max-w-xl z-[400] flex items-center gap-1.5 overflow-x-auto no-scrollbar pointer-events-auto">
        <button
          type="button"
          onClick={onLocateUserGps}
          disabled={gpsLoading}
          className={`px-3 py-2 bg-[#1c1c1e]/90 backdrop-blur-md border border-[rgba(242,242,242,0.15)] text-xs mono font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0 shadow-lg ${
            gpsState ? 'text-[#ff4d00] border-[#ff4d00]/50' : 'text-[#f2f2f2]'
          }`}
        >
          <Crosshair className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
          <span>{gpsLoading ? 'Locating…' : gpsState ? 'GPS Locked' : 'Locate Me'}</span>
        </button>

        {(
          [
            { id: 'none', label: 'Pan' },
            { id: 'origin', label: 'Origin' },
            { id: 'destination', label: 'Dest' },
            { id: 'waypoint', label: '+Stop' },
          ] as { id: MapClickAction; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChangeMapClickAction(item.id)}
            className={`px-2.5 py-2 bg-[#1c1c1e]/90 backdrop-blur-md border text-xs mono uppercase tracking-wider shrink-0 transition-colors shadow-lg ${
              mapClickAction === item.id
                ? 'bg-[#ff4d00] text-white border-[#ff4d00]'
                : 'border-[rgba(242,242,242,0.15)] text-[rgba(242,242,242,0.7)] hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowLayersMenu((v) => !v)}
          className={`p-2 bg-[#1c1c1e]/90 backdrop-blur-md border border-[rgba(242,242,242,0.15)] text-xs shrink-0 shadow-lg ${
            showLayersMenu ? 'text-[#ff4d00] border-[#ff4d00]' : 'text-[#f2f2f2]'
          }`}
          title="Toggle Layers"
          aria-label="Toggle Layers"
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      {/* Layers Flyout Menu */}
      {showLayersMenu && (
        <div className="absolute top-14 right-3 z-[410] w-56 bg-[#1c1c1e] border border-[rgba(242,242,242,0.2)] p-3 shadow-2xl space-y-3">
          <div>
            <span className="mono text-[0.6rem] uppercase tracking-wider text-[#ff4d00] block mb-1.5 font-bold">
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
                  className={`py-1.5 text-center text-xs mono uppercase ${
                    mapStyle === st.id
                      ? 'bg-[#ff4d00] text-white font-bold'
                      : 'bg-[#111113] text-gray-300 border border-white/10'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pt-2 space-y-1.5">
            <span className="mono text-[0.6rem] uppercase tracking-wider text-[#ff4d00] block mb-1 font-bold">
              Overlays
            </span>
            <button
              type="button"
              onClick={onToggleTrafficLayer}
              className={`w-full py-1.5 px-2 text-left text-xs mono uppercase flex items-center justify-between border ${
                showTrafficLayer ? 'border-[#ff4d00] text-[#ff4d00] bg-[#ff4d00]/10' : 'border-white/10 text-gray-300'
              }`}
            >
              <span>Traffic Incidents</span>
              <span className="text-[10px] font-bold">{showTrafficLayer ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleWeatherLayer}
              className={`w-full py-1.5 px-2 text-left text-xs mono uppercase flex items-center justify-between border ${
                showWeatherLayer ? 'border-[#ff4d00] text-[#ff4d00] bg-[#ff4d00]/10' : 'border-white/10 text-gray-300'
              }`}
            >
              <span>Weather Stations</span>
              <span className="text-[10px] font-bold">{showWeatherLayer ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={handleCacheCurrentView}
              className="w-full py-1.5 px-2 text-left text-xs mono uppercase border border-white/10 text-gray-300 hover:text-white hover:border-[#ff4d00]"
            >
              Archive Viewport Offline
            </button>
          </div>
        </div>
      )}

      {/* Real-time Turn-by-Turn Mobile Driving HUD (supports live GPS & Drive Simulation) */}
      {(navigationActive || isSimulating) && activeRoute && currentStep && (
        <div
          role="region"
          aria-label="Real-time Driving HUD"
          className="absolute top-16 left-3 right-3 sm:left-6 sm:right-auto sm:max-w-lg z-[420] bg-[#18181b]/95 backdrop-blur-md border border-[rgba(242,242,242,0.2)] border-l-4 border-l-[#ff4d00] p-4 shadow-2xl rounded-sm"
        >
          {/* Top Simulation Banner if active */}
          {isSimulating && (
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10 text-xs mono">
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                SIMULATED DRIVE ({simSpeedMultiplier}x)
              </span>

              <div className="flex items-center gap-1.5">
                {onChangeSimSpeed && (
                  <button
                    type="button"
                    onClick={() => onChangeSimSpeed(simSpeedMultiplier === 1 ? 2 : simSpeedMultiplier === 2 ? 5 : 1)}
                    className="px-2 py-0.5 bg-white/10 text-white hover:bg-white/20 text-[10px] font-bold uppercase rounded"
                  >
                    {simSpeedMultiplier}x Speed
                  </button>
                )}
                {onToggleSimulation && (
                  <button
                    type="button"
                    onClick={onToggleSimulation}
                    className="p-1 bg-[#ff4d00] text-white hover:bg-[#e04400] rounded"
                    title={isSimulating ? 'Pause Drive' : 'Play Drive'}
                  >
                    {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                )}
                {onResetSimulation && (
                  <button
                    type="button"
                    onClick={onResetSimulation}
                    className="p-1 bg-white/10 text-gray-300 hover:text-white rounded"
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
              <div className="w-10 h-10 rounded bg-[#ff4d00] text-white flex items-center justify-center shrink-0 shadow-md">
                <Navigation2 className="w-6 h-6 transform rotate-45" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mono text-xs font-bold text-[#ff4d00] uppercase">
                  <span>
                    Step {activeStepIndex + 1}/{activeRoute.steps.length}
                  </span>
                  <span>·</span>
                  <span>{formatDistance(currentStep.distanceKm)}</span>
                  <span>·</span>
                  <span>{currentStep.durationMinutes}m</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white mt-1 leading-tight">
                  {currentStep.instruction}
                </h3>
                {currentStep.roadName && (
                  <p className="mono text-[0.7rem] uppercase tracking-wider text-gray-400 mt-1 truncate">
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
                  className={`p-2 border transition-colors ${
                    voiceGuidance
                      ? 'border-[#ff4d00] text-[#ff4d00] bg-[#ff4d00]/10'
                      : 'border-white/15 text-gray-400'
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
                  className={`p-2 border transition-colors ${
                    followGps
                      ? 'border-[#ff4d00] text-[#ff4d00] bg-[#ff4d00]/10'
                      : 'border-white/15 text-gray-400'
                  }`}
                >
                  <Compass className={`w-4 h-4 ${followGps ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={onExitNavigation}
                className="px-2.5 py-2 bg-red-600/80 hover:bg-red-600 text-white mono text-xs uppercase font-bold"
              >
                End
              </button>
            </div>
          </div>

          {/* Progress bar along the journey */}
          {simulationProgress > 0 && (
            <div className="w-full bg-white/10 h-1 mt-3 overflow-hidden rounded-full">
              <div
                className="bg-[#ff4d00] h-full transition-all duration-200"
                style={{ width: `${simulationProgress}%` }}
              />
            </div>
          )}

          {/* Stepper controls */}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/10 text-xs mono">
            <button
              type="button"
              disabled={activeStepIndex === 0}
              onClick={() => onStepChange(Math.max(0, activeStepIndex - 1))}
              className="flex items-center gap-1 text-gray-300 disabled:opacity-30 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>

            <span className="text-gray-400">
              {gpsState?.speedKmh !== null && gpsState?.speedKmh !== undefined ? (
                <span className="font-bold text-[#ff4d00]">{gpsState.speedKmh} KM/H</span>
              ) : (
                'ETA: ' + activeRoute.totalDurationMinutes + 'm'
              )}
            </span>

            <button
              type="button"
              disabled={activeStepIndex >= activeRoute.steps.length - 1}
              onClick={() => onStepChange(Math.min(activeRoute.steps.length - 1, activeStepIndex + 1))}
              className="flex items-center gap-1 text-[#ff4d00] disabled:opacity-30 font-bold"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Speedometer & Status Badge (Bottom-Left) */}
      <div className="absolute bottom-4 left-3 z-[400] flex flex-col gap-1.5 pointer-events-none">
        {gpsState?.speedKmh !== null && gpsState?.speedKmh !== undefined && gpsState.speedKmh > 0 && (
          <div className="bg-[#111113]/90 backdrop-blur-md border border-[#ff4d00] px-3 py-1.5 text-center pointer-events-auto shadow-xl">
            <div className="text-2xl font-black display text-white leading-none">
              {gpsState.speedKmh}
            </div>
            <div className="text-[9px] mono uppercase text-[#ff4d00] font-bold">KM/H SPEED</div>
          </div>
        )}

        <div className="bg-[#1c1c1e]/90 backdrop-blur-md border border-white/15 px-3 py-1.5 mono text-[11px] text-gray-300 pointer-events-auto shadow-md">
          <div className="font-bold text-white flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                gpsState ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>
              {isSimulating
                ? 'Simulated Movement (Moving A → B)'
                : gpsState
                ? `GPS Active: ±${gpsState.accuracyMeters}m`
                : 'Searching Satellites…'}
            </span>
          </div>
          <div className="text-[9px] text-gray-400 uppercase mt-0.5 truncate max-w-[200px]">
            {isOfflineMode ? 'OFFLINE ARCHIVE' : 'PHILIPPINES'} ·{' '}
            {cursorCoords.lat.toFixed(3)}°, {cursorCoords.lng.toFixed(3)}°
          </div>
        </div>
      </div>

      {/* Bottom-Right Thumb Controls */}
      <div className="absolute bottom-4 right-3 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleFitRouteOrGps}
          aria-label="Center GPS or Route"
          title="Center GPS / Route"
          className="w-11 h-11 bg-[#1c1c1e]/95 backdrop-blur-md border border-white/20 text-[#ff4d00] flex items-center justify-center text-lg font-bold shadow-xl active:bg-[#ff4d00] active:text-white"
        >
          <Crosshair className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          className="w-11 h-11 bg-[#1c1c1e]/95 backdrop-blur-md border border-white/20 text-white flex items-center justify-center text-xl font-bold shadow-xl active:bg-[#ff4d00]"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          className="w-11 h-11 bg-[#1c1c1e]/95 backdrop-blur-md border border-white/20 text-white flex items-center justify-center text-xl font-bold shadow-xl active:bg-[#ff4d00]"
        >
          －
        </button>
      </div>
    </section>
  );
};
