import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateMultiStopRoute,
  ComputedRoute,
  LatLngPoint,
  TrafficIncident,
  TravelMode,
  WeatherSnapshot,
} from './utils/routingEngine';
import {
  INITIAL_TRAFFIC_INCIDENTS,
  KNOWN_LOCATIONS,
  OfflineRegionPack,
} from './utils/travelData';
import {
  CorridorStation,
  evaluateRouteCorridorHazards,
  extractRouteCorridorStations,
  RouteCorridorHazardReport,
} from './utils/corridorWeather';
import {
  cacheBoundingBoxTiles,
  clearAllCachedTiles,
  getTileCacheStats,
  hydrateMemoryCacheFromIndexedDB,
  TileCacheStats,
} from './utils/tileCacheStorage';
import { fetchLocationWeather } from './utils/weatherService';
import {
  computeLiveOrOfflineRoutes,
  reverseGeocodePhilippines,
} from './utils/gpsAndGeocoding';
import {
  buildRouteIndex,
  computeRouteProgress,
  buildSpokenInstruction,
} from './utils/navigation';
import {
  LeafletMapView,
  MapClickAction,
  MapStyleMode,
} from './components/LeafletMapView';
import { RoutePlannerPanel } from './components/RoutePlannerPanel';
import { TrafficPanel } from './components/TrafficPanel';
import { WeatherForecastPanel } from './components/WeatherForecastPanel';
import { OfflineCachePanel } from './components/OfflineCachePanel';
import { EstablishmentsPanel } from './components/EstablishmentsPanel';
import { ConvoyPanel } from './components/ConvoyPanel';
import {
  Establishment,
  KNOWN_ESTABLISHMENTS,
  establishmentToLatLngPoint,
} from './utils/establishmentData';
import {
  TrafficLight,
  KNOWN_TRAFFIC_LIGHTS,
  trafficLightToLatLngPoint,
} from './utils/trafficLightData';
import { useLiveGps } from './hooks/useLiveGps';
import { useDeviceCompass } from './hooks/useOrientation';
import { useWakeLock } from './hooks/useWakeLock';
import { useSpeechGuidance } from './hooks/useSpeechGuidance';
import { useRouteSimulation } from './hooks/useRouteSimulation';
import { useConvoy } from './hooks/useConvoy';
import { motion } from 'motion/react';
import {
  Compass,
  Navigation,
  CloudRain,
  AlertTriangle,
  HardDriveDownload,
  WifiOff,
  ChevronUp,
  ChevronDown,
  Download,
  Sun,
  Moon,
  Zap,
  Users,
  Radio,
  Store,
} from 'lucide-react';

export type AppTheme = 'dark' | 'amoled' | 'light';
type ActiveTab = 'routes' | 'places' | 'traffic' | 'convoy' | 'weather' | 'offline';
type MobileSheetState = 'peek' | 'half' | 'full';

export default function App() {
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('laagarn_theme');
      if (saved === 'dark' || saved === 'amoled' || saved === 'light') return saved;
    }
    return 'dark';
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('routes');
  const [mobileSheetState, setMobileSheetState] = useState<MobileSheetState>('half');

  // Synchronize theme with DOM root and PWA theme-color
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'amoled');
    if (theme === 'light') {
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#f8f6fc');
    } else if (theme === 'amoled') {
      root.classList.add('dark', 'amoled');
      root.setAttribute('data-theme', 'amoled');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#000000');
    } else {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#090410');
    }
    localStorage.setItem('laagarn_theme', theme);
  }, [theme]);

  // Multi-stop route planning state
  const [stops, setStops] = useState<LatLngPoint[]>([]);
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');
  const [computedRoutes, setComputedRoutes] = useState<ComputedRoute[]>([]);
  const [routeLoading, setRouteLoading] = useState<boolean>(false);
  const [activeRouteIndex, setActiveRouteIndex] = useState<number>(0);

  // Real-time decoupled GPS Hook (runs continuously even offline)
  const {
    position: gpsState,
    status: gpsStatus,
    error: gpsError,
    tracking: gpsWatchActive,
    locateOnce,
    startTracking,
    stopTracking,
    setManualPosition,
  } = useLiveGps();

  // Compass heading (Device orientation sensor + movement heading fallback)
  const compassHeading = useDeviceCompass(gpsState?.heading ?? null);

  // Traffic incidents & Traffic Lights state
  const [incidents, setIncidents] = useState<TrafficIncident[]>(INITIAL_TRAFFIC_INCIDENTS);
  const [showTrafficLayer, setShowTrafficLayer] = useState<boolean>(true);
  const [trafficLights, setTrafficLights] = useState<TrafficLight[]>(KNOWN_TRAFFIC_LIGHTS);
  const [showTrafficLightsLayer, setShowTrafficLightsLayer] = useState<boolean>(true);
  const [showWeatherLayer, setShowWeatherLayer] = useState<boolean>(true);
  const [showConvoyLayer, setShowConvoyLayer] = useState<boolean>(true);

  // Establishments state
  const [establishments, setEstablishments] = useState<Establishment[]>(KNOWN_ESTABLISHMENTS);
  const [showEstablishmentsLayer, setShowEstablishmentsLayer] = useState<boolean>(true);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string | null>(null);

  // Weather state & en-route corridor hazards
  const [weatherSnapshots, setWeatherSnapshots] = useState<WeatherSnapshot[]>([]);
  const [corridorStations, setCorridorStations] = useState<CorridorStation[]>([]);
  const [hazardReport, setHazardReport] = useState<RouteCorridorHazardReport | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);

  // Offline mode state & network listener
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [mapStyle, setMapStyle] = useState<MapStyleMode>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('laagarn_theme');
      return savedTheme === 'light' ? 'street' : 'dark';
    }
    return 'dark';
  });

  const handleToggleTheme = () => {
    setTheme((prev) => {
      let next: AppTheme = 'dark';
      if (prev === 'dark') next = 'amoled';
      else if (prev === 'amoled') next = 'light';
      else next = 'dark';

      if (next === 'light' && (mapStyle === 'dark' || mapStyle === 'terrain')) {
        setMapStyle('street');
      } else if ((next === 'dark' || next === 'amoled') && mapStyle === 'street') {
        setMapStyle('dark');
      }
      return next;
    });
  };
  const [mapClickAction, setMapClickAction] = useState<MapClickAction>('none');
  const [tileStats, setTileStats] = useState<TileCacheStats>(() => getTileCacheStats());

  // Focus coordinate on map
  const [focusedCoord, setFocusedCoord] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    label?: string;
  } | null>(null);

  // Active Navigation & Voice Guidance
  const [navigationActive, setNavigationActive] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [voiceGuidance, setVoiceGuidance] = useState<boolean>(true);
  const [followGps, setFollowGps] = useState<boolean>(true);

  // PWA install prompt handler
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Prevent phone screen from dimming/sleeping during active navigation
  useWakeLock(navigationActive);

  // Turn-by-turn Speech Guidance
  const { speak: speakGuidance } = useSpeechGuidance(voiceGuidance && navigationActive);

  const activeRoute = computedRoutes[activeRouteIndex] || computedRoutes[0];

  // Route Simulation Hook (allows previewing animated drive from A to B)
  const {
    isSimulating,
    simulatedGps,
    speedMultiplier: simSpeedMultiplier,
    progressPercent: simProgressPercent,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    setSpeedMultiplier: setSimSpeedMultiplier,
  } = useRouteSimulation(activeRoute);

  // During simulation, the active displayed GPS is the simulated position; otherwise real satellite GPS
  const effectiveGps = isSimulating && simulatedGps ? simulatedGps : gpsState;

  // Live Convoy & Location Sharing Hook
  const {
    roomCode: convoyRoomCode,
    isSharing: isConvoySharing,
    myName: convoyMyName,
    myVehicle: convoyMyVehicle,
    myColor: convoyMyColor,
    peers: convoyPeers,
    activePeersCount: convoyActivePeersCount,
    connectionStatus: convoyConnectionStatus,
    lastBroadcastAt: convoyLastBroadcastAt,
    createConvoy,
    joinConvoy,
    leaveConvoy,
    updateProfile: updateConvoyProfile,
  } = useConvoy(effectiveGps);

  // Auto-switch to convoy tab if ?convoy=CODE is present in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlCode = new URLSearchParams(window.location.search).get('convoy');
      if (urlCode) {
        setActiveTab('convoy');
        if (window.innerWidth < 1024) {
          setMobileSheetState('half');
        }
      }
    }
  }, []);

  // Route Index for fast on-device geometry calculations
  const routeIndex = useMemo(() => {
    return activeRoute ? buildRouteIndex(activeRoute) : null;
  }, [activeRoute?.id]);

  // Monitor network online/offline transitions
  useEffect(() => {
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 🏍️ Anti-Vibration & Touch-Outside Blur (Suppresses iOS WebKit "Undo Typing" dialog)
  // Motorcycle engine vibration and road bumps cause iPhone 13 accelerometer oscillations.
  // In iOS Safari, if an input field is active when the phone shakes, iOS triggers native "Undo Typing".
  // Auto-blurring inputs on touch-outside and dampening on vehicle motion completely eliminates this modal.
  useEffect(() => {
    const blurActiveInput = () => {
      if (
        document.activeElement instanceof HTMLElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA' ||
          document.activeElement.getAttribute('contenteditable') === 'true')
      ) {
        document.activeElement.blur();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('input, textarea, [contenteditable="true"]')) {
        blurActiveInput();
      }
    };

    const handleDeviceMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc) return;
      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      // Motorcycle vibration spikes or bumps
      if (magnitude > 13.5 || magnitude < 6.0) {
        blurActiveInput();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    }

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
        window.removeEventListener('devicemotion', handleDeviceMotion);
      }
    };
  }, []);

  // Listen for PWA installation prompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Hydrate IndexedDB tile cache on mount
  useEffect(() => {
    hydrateMemoryCacheFromIndexedDB().then((stats) => {
      setTileStats(stats);
    });
  }, []);

  // Compute live OSRM road route (or offline fallback) whenever stops, mode, or incidents change
  useEffect(() => {
    let cancelled = false;
    if (stops.length < 2) {
      setComputedRoutes([]);
      return;
    }

    const immediate = [0, 1, 2].map((variantIdx) =>
      calculateMultiStopRoute(stops, travelMode, incidents, variantIdx)
    );
    setComputedRoutes(immediate);

    setRouteLoading(true);
    computeLiveOrOfflineRoutes(stops, travelMode, incidents, isOfflineMode)
      .then((liveRoutes) => {
        if (!cancelled && liveRoutes.length > 0) {
          setComputedRoutes(liveRoutes);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRouteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [stops, travelMode, incidents, isOfflineMode]);

  // Sync weather for en-route corridor municipalities, destination arrival, and hazards
  const syncEnRouteWeather = useCallback(async () => {
    const targets: LatLngPoint[] =
      stops.length > 0
        ? stops
        : gpsState
        ? [
            {
              name: gpsState.addressLabel,
              region: 'Current GPS Location',
              lat: gpsState.lat,
              lng: gpsState.lng,
            },
          ]
        : [];

    if (targets.length === 0) {
      setWeatherSnapshots([]);
      setCorridorStations([]);
      setHazardReport(null);
      return;
    }

    setWeatherLoading(true);
    try {
      if (activeRoute && activeRoute.stops.length >= 2 && activeRoute.coordinates.length >= 2) {
        const stations = await extractRouteCorridorStations(
          activeRoute,
          KNOWN_LOCATIONS,
          isOfflineMode
        );
        const report = evaluateRouteCorridorHazards(
          stations,
          activeRoute.stops[activeRoute.stops.length - 1].name
        );
        setCorridorStations(stations);
        setHazardReport(report);
        setWeatherSnapshots(stations.map((s) => s.weather));
      } else {
        setCorridorStations([]);
        setHazardReport(null);
        const results = await Promise.all(
          targets.map((stop) => fetchLocationWeather(stop, isOfflineMode))
        );
        setWeatherSnapshots(results);
      }
    } finally {
      setWeatherLoading(false);
    }
  }, [stops, gpsState, activeRoute, isOfflineMode]);

  useEffect(() => {
    syncEnRouteWeather();
  }, [syncEnRouteWeather]);

  // Real-time GPS Progress Tracking along route during Navigation
  const prevAlongKmRef = useRef<number>(0);
  useEffect(() => {
    if ((!navigationActive && !isSimulating) || !activeRoute || !routeIndex || !effectiveGps) return;

    const progress = computeRouteProgress(
      activeRoute,
      routeIndex,
      effectiveGps,
      prevAlongKmRef.current
    );
    prevAlongKmRef.current = progress.alongKm;

    // Auto-advance step when approaching within 40m of next maneuver
    if (progress.nextStepIndex !== activeStepIndex) {
      setActiveStepIndex(progress.nextStepIndex);
      const nextStep = activeRoute.steps[progress.nextStepIndex];
      if (nextStep) {
        speakGuidance(buildSpokenInstruction(nextStep, progress.distanceToNextStepKm));
      }
    }

    // Voice announcement if user arrives at destination
    if (progress.arrived) {
      speakGuidance('You have arrived at your destination.');
    }
  }, [effectiveGps, navigationActive, isSimulating, activeRoute, routeIndex, activeStepIndex, speakGuidance]);

  // Handle GPS Locate button
  const handleLocateUserGps = useCallback(
    async (setAsOrigin = true) => {
      startTracking();
      const pos = await locateOnce();
      if (pos && setAsOrigin) {
        const originPoint: LatLngPoint = {
          name: pos.addressLabel,
          region: 'Live GPS Position',
          lat: pos.lat,
          lng: pos.lng,
        };
        setStops((prev) =>
          prev.length >= 2 ? [originPoint, ...prev.slice(1)] : [originPoint]
        );
        setFocusedCoord({ lat: pos.lat, lng: pos.lng, zoom: 15 });
      }
    },
    [locateOnce, startTracking]
  );

  const handleToggleGpsWatch = useCallback(() => {
    if (gpsWatchActive) {
      stopTracking();
    } else {
      startTracking();
    }
  }, [gpsWatchActive, startTracking, stopTracking]);

  const handleApplyStops = (newStops: LatLngPoint[]) => {
    setStops(newStops);
    setActiveRouteIndex(0);
    setActiveStepIndex(0);
    if (newStops.length > 0) {
      setFocusedCoord({
        lat: newStops[0].lat,
        lng: newStops[0].lng,
        zoom: 13,
      });
    }
    // On mobile, collapse sheet to peek when a route is computed so map is clearly visible
    if (window.innerWidth < 1024) {
      setMobileSheetState('peek');
    }
  };

  const handleClearRoute = () => {
    resetSimulation();
    setStops([]);
    setComputedRoutes([]);
    setNavigationActive(false);
    setActiveStepIndex(0);
  };

  const handleToggleSimulation = () => {
    if (isSimulating) {
      pauseSimulation();
    } else {
      startSimulation();
      setFollowGps(true);
      if (window.innerWidth < 1024) {
        setMobileSheetState('peek');
      }
    }
  };

  const handleMapPickLocation = async (
    lat: number,
    lng: number,
    action: MapClickAction
  ) => {
    const rev = await reverseGeocodePhilippines(lat, lng);
    const customPoint: LatLngPoint = {
      name: rev.name,
      region: rev.region,
      lat,
      lng,
    };

    if (action === 'gps') {
      setManualPosition(lat, lng, rev.name);
      setStops((prev) =>
        prev.length >= 2 ? [customPoint, ...prev.slice(1)] : [customPoint]
      );
      setMapClickAction('none');
    } else if (action === 'origin') {
      setStops((prev) =>
        prev.length >= 2 ? [customPoint, ...prev.slice(1)] : [customPoint]
      );
      setMapClickAction('none');
    } else if (action === 'destination') {
      setStops((prev) => {
        if (prev.length === 0 && gpsState) {
          return [
            {
              name: gpsState.addressLabel,
              region: 'Live GPS Position',
              lat: gpsState.lat,
              lng: gpsState.lng,
            },
            customPoint,
          ];
        }
        if (prev.length === 0) return [customPoint];
        if (prev.length === 1) return [prev[0], customPoint];
        return [...prev.slice(0, -1), customPoint];
      });
      setMapClickAction('none');
    } else if (action === 'waypoint') {
      setStops((prev) => {
        if (prev.length < 2) return [...prev, customPoint];
        return [...prev.slice(0, -1), customPoint, prev[prev.length - 1]];
      });
      setMapClickAction('none');
    } else if (action === 'weather') {
      const snap = await fetchLocationWeather(customPoint, isOfflineMode);
      setWeatherSnapshots((prev) => [snap, ...prev.slice(0, 4)]);
      setActiveTab('weather');
      setMapClickAction('none');
      if (window.innerWidth < 1024) setMobileSheetState('half');
    }
  };

  const handleToggleIncidentActive = (id: string) => {
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, active: !inc.active } : inc))
    );
  };

  const handleAddIncident = (
    newInc: Omit<TrafficIncident, 'id' | 'updatedMinutesAgo'>
  ) => {
    const created: TrafficIncident = {
      ...newInc,
      id: `inc-custom-${Date.now()}`,
      updatedMinutesAgo: 1,
    };
    setIncidents((prev) => [created, ...prev]);
  };

  const handleSelectEstablishmentRoute = (est: Establishment) => {
    const estPoint = establishmentToLatLngPoint(est);
    setSelectedEstablishmentId(est.id);

    if (gpsState) {
      const originPoint: LatLngPoint = {
        name: gpsState.addressLabel || 'Current GPS Location',
        region: 'Live GPS',
        lat: gpsState.lat,
        lng: gpsState.lng,
      };
      setStops([originPoint, estPoint]);
    } else if (stops.length >= 1) {
      setStops([stops[0], estPoint]);
    } else {
      setStops([estPoint]);
    }

    setActiveTab('routes');
    setActiveRouteIndex(0);
    setActiveStepIndex(0);
    setFocusedCoord({ lat: est.lat, lng: est.lng, zoom: 15 });

    if (window.innerWidth < 1024) {
      setMobileSheetState('peek');
    }
  };

  const handleAddEstablishmentStop = (est: Establishment) => {
    const estPoint = establishmentToLatLngPoint(est);
    setSelectedEstablishmentId(est.id);

    if (stops.length === 0) {
      if (gpsState) {
        setStops([
          {
            name: gpsState.addressLabel || 'Current GPS Location',
            region: 'Live GPS',
            lat: gpsState.lat,
            lng: gpsState.lng,
          },
          estPoint,
        ]);
      } else {
        setStops([estPoint]);
      }
    } else if (stops.length === 1) {
      setStops([...stops, estPoint]);
    } else {
      const prev = [...stops];
      prev.splice(prev.length - 1, 0, estPoint);
      setStops(prev);
    }

    setFocusedCoord({ lat: est.lat, lng: est.lng, zoom: 15 });
  };

  const handleSelectTrafficLightRoute = (tl: TrafficLight) => {
    const tlPoint = trafficLightToLatLngPoint(tl);
    if (gpsState) {
      const originPoint: LatLngPoint = {
        name: gpsState.addressLabel || 'Current GPS Location',
        region: 'Live GPS',
        lat: gpsState.lat,
        lng: gpsState.lng,
      };
      setStops([originPoint, tlPoint]);
    } else if (stops.length >= 1) {
      setStops([stops[0], tlPoint]);
    } else {
      setStops([tlPoint]);
    }
    setFocusedCoord({ lat: tl.lat, lng: tl.lng, zoom: 16, label: tl.name });
    setActiveTab('routes');
    if (window.innerWidth < 1024) {
      setMobileSheetState('half');
    }
  };

  const handleAddTrafficLightStop = (tl: TrafficLight) => {
    const tlPoint = trafficLightToLatLngPoint(tl);
    if (stops.length === 0) {
      if (gpsState) {
        setStops([
          {
            name: gpsState.addressLabel || 'Current GPS Location',
            region: 'Live GPS',
            lat: gpsState.lat,
            lng: gpsState.lng,
          },
          tlPoint,
        ]);
      } else {
        setStops([tlPoint]);
      }
    } else if (stops.length === 1) {
      setStops([...stops, tlPoint]);
    } else {
      const prev = [...stops];
      prev.splice(prev.length - 1, 0, tlPoint);
      setStops(prev);
    }
    setFocusedCoord({ lat: tl.lat, lng: tl.lng, zoom: 16, label: tl.name });
    setActiveTab('routes');
    if (window.innerWidth < 1024) {
      setMobileSheetState('half');
    }
  };

  const handleRouteToPeer = (point: LatLngPoint) => {
    if (gpsState) {
      const originPoint: LatLngPoint = {
        name: gpsState.addressLabel || 'Current GPS Location',
        region: 'Live GPS',
        lat: gpsState.lat,
        lng: gpsState.lng,
      };
      setStops([originPoint, point]);
    } else if (stops.length >= 1) {
      setStops([stops[0], point]);
    } else {
      setStops([point]);
    }
    setFocusedCoord({ lat: point.lat, lng: point.lng, zoom: 16, label: point.name });
    setActiveTab('routes');
    if (window.innerWidth < 1024) {
      setMobileSheetState('half');
    }
  };

  const handleAddPeerStop = (point: LatLngPoint) => {
    if (stops.length === 0) {
      if (gpsState) {
        setStops([
          {
            name: gpsState.addressLabel || 'Current GPS Location',
            region: 'Live GPS',
            lat: gpsState.lat,
            lng: gpsState.lng,
          },
          point,
        ]);
      } else {
        setStops([point]);
      }
    } else if (stops.length === 1) {
      setStops([...stops, point]);
    } else {
      const prev = [...stops];
      prev.splice(prev.length - 1, 0, point);
      setStops(prev);
    }
    setFocusedCoord({ lat: point.lat, lng: point.lng, zoom: 16, label: point.name });
    setActiveTab('routes');
    if (window.innerWidth < 1024) {
      setMobileSheetState('half');
    }
  };

  const handleFitConvoyBounds = (points: { lat: number; lng: number }[]) => {
    const valid = points.filter(
      (p) => p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    );
    if (valid.length === 0) return;
    if (valid.length === 1) {
      setFocusedCoord({ lat: valid[0].lat, lng: valid[0].lng, zoom: 16 });
      return;
    }
    const minLat = Math.min(...valid.map((p) => p.lat));
    const maxLat = Math.max(...valid.map((p) => p.lat));
    const minLng = Math.min(...valid.map((p) => p.lng));
    const maxLng = Math.max(...valid.map((p) => p.lng));
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);
    const zoom = maxDiff > 2 ? 8 : maxDiff > 0.8 ? 10 : maxDiff > 0.3 ? 12 : maxDiff > 0.08 ? 14 : 15;
    setFocusedCoord({ lat: centerLat, lng: centerLng, zoom });
  };

  const handleFocusEstablishment = (est: Establishment) => {
    setSelectedEstablishmentId(est.id);
    setFocusedCoord({ lat: est.lat, lng: est.lng, zoom: 16 });
    if (window.innerWidth < 1024) {
      setMobileSheetState('peek');
    }
  };

  const handleDownloadRegionPack = async (
    pack: OfflineRegionPack,
    onProgress: (done: number, total: number) => void
  ) => {
    const res = await cacheBoundingBoxTiles(
      pack.southWest,
      pack.northEast,
      pack.zoomLevels,
      onProgress,
      pack.id
    );
    setTileStats(res.stats);
  };

  const handleCacheActiveRouteCorridor = async (
    onProgress: (done: number, total: number) => void
  ) => {
    if (!activeRoute || activeRoute.coordinates.length === 0) return;
    const lats = activeRoute.coordinates.map((c) => c[0]);
    const lngs = activeRoute.coordinates.map((c) => c[1]);
    const sw = { lat: Math.min(...lats) - 0.04, lng: Math.min(...lngs) - 0.04 };
    const ne = { lat: Math.max(...lats) + 0.04, lng: Math.max(...lngs) + 0.04 };
    const res = await cacheBoundingBoxTiles(sw, ne, [11, 12, 13], onProgress);
    setTileStats(res.stats);
  };

  const handleClearCache = async () => {
    const updated = await clearAllCachedTiles();
    setTileStats(updated);
  };

  const handleFocusCoordinate = (lat: number, lng: number, zoom = 14, label?: string) => {
    setFocusedCoord({ lat, lng, zoom, label });
  };

  const handleStepChange = (stepIdx: number) => {
    setActiveStepIndex(stepIdx);
    const step = activeRoute?.steps[stepIdx];
    if (step) {
      setFocusedCoord({ lat: step.lat, lng: step.lng, zoom: 16 });
      speakGuidance(step.instruction, true);
    }
  };

  const handleStartNavigation = () => {
    setNavigationActive(true);
    setActiveStepIndex(0);
    setFollowGps(true);
    startTracking();
    if (window.innerWidth < 1024) {
      setMobileSheetState('peek');
    }
    if (activeRoute?.steps[0]) {
      handleFocusCoordinate(activeRoute.steps[0].lat, activeRoute.steps[0].lng, 16);
      speakGuidance(`Starting navigation to ${activeRoute.stops[activeRoute.stops.length - 1].name}.`);
    }
  };

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  // Brand Logo Click: Return to Home (Planner) or Refresh
  const handleHomeOrRefresh = (e?: React.MouseEvent) => {
    e?.preventDefault();

    // If already on Home (Planner) with no sub-selection and not in navigation, perform a clean page refresh
    if (activeTab === 'routes' && !selectedEstablishmentId && !navigationActive) {
      if (typeof window !== 'undefined') {
        if (window.location.search) {
          window.location.href = window.location.pathname || '/';
        } else {
          window.location.reload();
        }
      }
      return;
    }

    // Otherwise, smoothly reset to Home dashboard view
    setActiveTab('routes');
    setSelectedEstablishmentId(null);
    setNavigationActive(false);
    resetSimulation();

    if (window.innerWidth < 1024) {
      setMobileSheetState('half');
    }

    // Recenter map camera to live GPS if available, else route or default Philippine center
    if (gpsState) {
      setFocusedCoord({ lat: gpsState.lat, lng: gpsState.lng, zoom: 15 });
    } else if (activeRoute && activeRoute.coordinates.length > 0) {
      setFocusedCoord({
        lat: activeRoute.coordinates[0][0],
        lng: activeRoute.coordinates[0][1],
        zoom: 13,
      });
    } else {
      setFocusedCoord({ lat: 14.5995, lng: 120.9842, zoom: 12 });
    }

    // Clean any query string in the address bar
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname || '/');
    }
  };

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden select-none font-sans transition-colors duration-200 ${
      theme === 'amoled' ? 'bg-[#000000] text-white' : theme === 'dark' ? 'bg-[#090410] text-[#f8f6fc]' : 'bg-[#f8f6fc] text-[#160a2c]'
    }`}>
      {/* Top Header / App Bar (Glassy Purple with mobile notch safe-area padding) */}
      <header className={`app-header shrink-0 flex items-center px-4 sm:px-6 border-b transition-colors z-50 shadow-lg backdrop-blur-xl ${
        theme === 'amoled'
          ? 'bg-[#000000]/95 border-purple-500/30 text-white shadow-black/80'
          : theme === 'dark'
          ? 'bg-[#0d0717]/85 border-purple-500/20 text-[#f8f6fc] shadow-black/40'
          : 'bg-white/85 border-purple-300/40 text-[#160a2c] shadow-purple-900/5'
      }`}>
        <div className="w-full flex items-center justify-between gap-3">
          {/* Left: Brand Identity with Glowing Compass & Subtitle (Click to Return Home or Refresh) */}
          <button
            type="button"
            onClick={handleHomeOrRefresh}
            title={activeTab === 'routes' && !selectedEstablishmentId ? 'Click to refresh page' : 'Click to return to Home (Planner)'}
            aria-label="LAAGARN Home - Return to Planner or Refresh"
            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group select-none transition-transform hover:opacity-95 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded-xl py-1 px-1 -ml-1"
          >
            <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center text-white shadow-lg shadow-purple-500/35 shrink-0 group-hover:scale-105 group-active:scale-95 group-hover:shadow-purple-500/50 transition-all">
              <Compass className="w-5 h-5 animate-[spin_12s_linear_infinite] group-hover:rotate-180 transition-transform duration-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className={`logo display text-base sm:text-lg font-black tracking-wider leading-none transition-colors ${
                  theme !== 'light' ? 'text-white group-hover:text-purple-200' : 'text-[#160a2c] group-hover:text-purple-800'
                }`}>
                  LAAGARN
                </h1>
                <span className={`px-1.5 py-0.5 text-[8px] font-extrabold mono uppercase tracking-wider rounded-md shrink-0 transition-colors ${
                  theme !== 'light'
                    ? 'bg-purple-500/20 text-[#c084fc] border border-purple-500/30 group-hover:bg-purple-500/30'
                    : 'bg-purple-100 text-[#7c3aed] border border-purple-200 group-hover:bg-purple-200'
                }`}>
                  GPS
                </span>
              </div>
              <div className={`mono text-[8.5px] sm:text-[9.5px] uppercase tracking-wider mt-0.5 truncate max-w-[170px] xs:max-w-[210px] sm:max-w-none transition-colors ${
                theme !== 'light' ? 'text-purple-300/60 group-hover:text-purple-300/90' : 'text-purple-700/70 group-hover:text-purple-900'
              }`}>
                My Way, Your Travel Buddy.
              </div>
            </div>
          </button>

          {/* Desktop View Navigation */}
          <nav
            aria-label="Workspace Tabs"
            className="hidden lg:flex items-center gap-6"
          >
            {(
              [
                { id: 'routes', label: 'Planner' },
                { id: 'places', label: 'Places' },
                { id: 'traffic', label: 'Traffic' },
                {
                  id: 'convoy',
                  label: isConvoySharing
                    ? `Convoy (${convoyActivePeersCount + 1})`
                    : 'Convoy 👥',
                },
                { id: 'weather', label: 'Weather' },
                { id: 'offline', label: 'Offline Cartography' },
              ] as { id: ActiveTab; label: string }[]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? theme !== 'light'
                      ? 'text-[#c084fc] border-b-2 border-[#a855f7] pb-1 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                      : 'text-[#7c3aed] border-b-2 border-[#9333ea] pb-1 drop-shadow-[0_0_8px_rgba(147,51,234,0.3)]'
                    : theme !== 'light'
                    ? 'text-gray-400 hover:text-white'
                    : 'text-purple-900/60 hover:text-purple-950'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right Header: Theme Toggle, Install PWA & Status Badges */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Live Convoy Status Badge */}
            {isConvoySharing && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('convoy');
                  if (window.innerWidth < 1024) setMobileSheetState('half');
                }}
                className="h-8 px-2 sm:px-2.5 bg-cyan-500/15 border border-cyan-500/40 text-cyan-600 dark:text-cyan-300 mono text-[10px] uppercase font-bold rounded-xl flex items-center gap-1.5 cursor-pointer hover:border-cyan-400"
                title={`Convoy ${convoyRoomCode} · ${convoyActivePeersCount + 1} Members`}
              >
                <Users className="w-3.5 h-3.5 text-cyan-500 animate-pulse" />
                <span>Convoy {convoyActivePeersCount + 1}</span>
              </button>
            )}
            {/* Theme Toggle Button: Purple -> OLED Black -> Light */}
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={`Current theme: ${theme}. Click to switch theme`}
              title={
                theme === 'dark'
                  ? 'Switch to OLED Black (Battery Saver)'
                  : theme === 'amoled'
                  ? 'Switch to Light Mode'
                  : 'Switch to Glassy Purple Dark Mode'
              }
              className={`h-8 px-2 sm:px-2.5 rounded-xl border transition-all flex items-center gap-1.5 mono text-[10px] font-bold uppercase cursor-pointer ${
                theme === 'amoled'
                  ? 'bg-black border-purple-500/50 text-[#c084fc] shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                  : theme === 'dark'
                  ? 'bg-purple-950/40 border-purple-500/30 text-purple-200 hover:text-white hover:border-[#a855f7]'
                  : 'bg-purple-100/80 border-purple-300/60 text-purple-900 hover:border-purple-500 shadow-sm'
              }`}
            >
              {theme === 'dark' ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-purple-300" />
                  <span className="hidden sm:inline">OLED</span>
                </>
              ) : theme === 'amoled' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-purple-700" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>

            {deferredPrompt && (
              <button
                type="button"
                onClick={handleInstallPwa}
                className="h-8 px-2.5 bg-gradient-to-r from-[#a855f7] to-[#9333ea] hover:from-[#c084fc] hover:to-[#a855f7] text-white mono text-[10px] font-bold uppercase flex items-center gap-1 shadow-lg shadow-purple-500/30 rounded-xl cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Install</span>
              </button>
            )}

            {/* Online / Offline Status Badge (Always shows legible text, never truncated to an empty dot) */}
            {isOfflineMode ? (
              <div className="h-8 px-2 sm:px-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 mono text-[10px] uppercase font-bold rounded-xl flex items-center gap-1.5">
                <WifiOff className="w-3 h-3 text-amber-400" />
                <span>Offline</span>
              </div>
            ) : (
              <div className={`h-8 px-2 sm:px-2.5 border mono text-[10px] uppercase font-bold rounded-xl flex items-center gap-1.5 ${
                theme !== 'light'
                  ? 'bg-purple-950/40 border-purple-500/30 text-purple-200'
                  : 'bg-purple-100/80 border-purple-300/60 text-purple-900'
              }`}>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span>Live</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container: Split Desktop layout & Mobile Drawer layout */}
      <main className="flex-1 relative w-full h-[calc(100vh-4rem)] overflow-hidden flex flex-col lg:flex-row">
        {/* Desktop Sidebar (Left side, Glassy Purple) */}
        <aside
          aria-label="Travel Planning Controls"
          className={`hidden lg:flex flex-col w-[390px] shrink-0 backdrop-blur-2xl border-r p-6 overflow-y-auto transition-colors ${
            theme === 'amoled'
              ? 'bg-black/95 border-purple-500/25 shadow-2xl'
              : theme === 'dark'
              ? 'bg-[#0e0719]/80 border-purple-500/20 shadow-2xl'
              : 'bg-white/80 border-purple-200/60 shadow-xl shadow-purple-900/5'
          }`}
        >
          {activeTab === 'routes' && (
            <RoutePlannerPanel
              stops={stops}
              travelMode={travelMode}
              routes={computedRoutes}
              routeLoading={routeLoading}
              activeRouteIndex={activeRouteIndex}
              gpsState={gpsState}
              gpsLoading={gpsStatus === 'locating'}
              gpsError={gpsError}
              gpsWatchActive={gpsWatchActive}
              onLocateUserGps={handleLocateUserGps}
              onToggleGpsWatch={handleToggleGpsWatch}
              onPickOnMap={(mode) => setMapClickAction(mode)}
              mapClickAction={mapClickAction}
              onSelectRouteIndex={setActiveRouteIndex}
              onChangeTravelMode={setTravelMode}
              onApplyStops={handleApplyStops}
              onClearRoute={handleClearRoute}
              onFocusCoordinate={handleFocusCoordinate}
              onStartNavigation={handleStartNavigation}
              onStartSimulation={handleToggleSimulation}
              isSimulating={isSimulating}
            />
          )}

          {activeTab === 'places' && (
            <EstablishmentsPanel
              gpsState={effectiveGps}
              onLocateUserGps={() => handleLocateUserGps(false)}
              onSelectEstablishmentRoute={handleSelectEstablishmentRoute}
              onFocusEstablishment={handleFocusEstablishment}
              onAddEstablishmentStop={handleAddEstablishmentStop}
              selectedEstablishmentId={selectedEstablishmentId}
              theme={theme}
            />
          )}

          {activeTab === 'traffic' && (
            <TrafficPanel
              incidents={incidents}
              onToggleIncidentActive={handleToggleIncidentActive}
              onAddIncident={handleAddIncident}
              onFocusCoordinate={handleFocusCoordinate}
              activeRouteDelayMinutes={activeRoute?.trafficDelayMinutes || 0}
              gpsState={effectiveGps}
              trafficLights={trafficLights}
              onSelectDestination={(point) => {
                if (gpsState) {
                  setStops([
                    {
                      name: gpsState.addressLabel || 'Current GPS Location',
                      region: 'Live GPS',
                      lat: gpsState.lat,
                      lng: gpsState.lng,
                    },
                    point,
                  ]);
                } else if (stops.length >= 1) {
                  setStops([stops[0], point]);
                } else {
                  setStops([point]);
                }
                setFocusedCoord({ lat: point.lat, lng: point.lng, zoom: 16, label: point.name });
                setActiveTab('routes');
              }}
              onAddStop={(point) => {
                if (stops.length === 0) {
                  if (gpsState) {
                    setStops([
                      {
                        name: gpsState.addressLabel || 'Current GPS Location',
                        region: 'Live GPS',
                        lat: gpsState.lat,
                        lng: gpsState.lng,
                      },
                      point,
                    ]);
                  } else {
                    setStops([point]);
                  }
                } else if (stops.length === 1) {
                  setStops([...stops, point]);
                } else {
                  const prev = [...stops];
                  prev.splice(prev.length - 1, 0, point);
                  setStops(prev);
                }
                setFocusedCoord({ lat: point.lat, lng: point.lng, zoom: 16, label: point.name });
                setActiveTab('routes');
              }}
            />
          )}

          {activeTab === 'convoy' && (
            <ConvoyPanel
              roomCode={convoyRoomCode}
              isSharing={isConvoySharing}
              myName={convoyMyName}
              myVehicle={convoyMyVehicle}
              myColor={convoyMyColor}
              peers={convoyPeers}
              activePeersCount={convoyActivePeersCount}
              connectionStatus={convoyConnectionStatus}
              lastBroadcastAt={convoyLastBroadcastAt}
              gpsState={effectiveGps}
              onCreateConvoy={createConvoy}
              onJoinConvoy={joinConvoy}
              onLeaveConvoy={leaveConvoy}
              onUpdateProfile={updateConvoyProfile}
              onFocusCoordinate={handleFocusCoordinate}
              onFitBounds={handleFitConvoyBounds}
              onRouteToPeer={handleRouteToPeer}
              onAddPeerStop={handleAddPeerStop}
              theme={theme}
            />
          )}

          {activeTab === 'weather' && (
            <WeatherForecastPanel
              snapshots={weatherSnapshots}
              corridorStations={corridorStations}
              hazardReport={hazardReport}
              destinationName={activeRoute?.stops[activeRoute.stops.length - 1]?.name}
              loading={weatherLoading}
              onFocusCoordinate={handleFocusCoordinate}
              onRefreshWeather={syncEnRouteWeather}
              onSpotWeatherOnMap={() => setMapClickAction('weather')}
              activeRoute={activeRoute}
            />
          )}

          {activeTab === 'offline' && (
            <OfflineCachePanel
              stats={tileStats}
              isOfflineMode={isOfflineMode}
              onToggleOfflineMode={() => setIsOfflineMode((v) => !v)}
              onDownloadRegionPack={handleDownloadRegionPack}
              onCacheActiveRouteCorridor={handleCacheActiveRouteCorridor}
              onClearCache={handleClearCache}
              onFocusCoordinate={handleFocusCoordinate}
              hasActiveRoute={Boolean(activeRoute && activeRoute.coordinates.length > 0)}
            />
          )}
        </aside>

        {/* Map Viewport Canvas */}
        <div className="flex-1 w-full h-full relative z-0">
          <LeafletMapView
            stops={stops}
            routes={computedRoutes}
            activeRouteIndex={activeRouteIndex}
            onSelectRouteIndex={setActiveRouteIndex}
            gpsState={effectiveGps}
            gpsLoading={gpsStatus === 'locating'}
            gpsCompassHeading={compassHeading}
            onLocateUserGps={() => handleLocateUserGps(true)}
            incidents={incidents}
            showTrafficLayer={showTrafficLayer}
            onToggleTrafficLayer={() => setShowTrafficLayer((v) => !v)}
            weatherSnapshots={weatherSnapshots}
            corridorStations={corridorStations}
            hazardReport={hazardReport}
            showWeatherLayer={showWeatherLayer}
            onToggleWeatherLayer={() => setShowWeatherLayer((v) => !v)}
            establishments={establishments}
            showEstablishmentsLayer={showEstablishmentsLayer}
            onToggleEstablishmentsLayer={() => setShowEstablishmentsLayer((v) => !v)}
            selectedEstablishmentId={selectedEstablishmentId}
            onSelectEstablishmentRoute={handleSelectEstablishmentRoute}
            onAddEstablishmentStop={handleAddEstablishmentStop}
            onSelectEstablishment={handleFocusEstablishment}
            trafficLights={trafficLights}
            showTrafficLightsLayer={showTrafficLightsLayer}
            onToggleTrafficLightsLayer={() => setShowTrafficLightsLayer((v) => !v)}
            onSelectTrafficLightRoute={handleSelectTrafficLightRoute}
            onAddTrafficLightStop={handleAddTrafficLightStop}
            convoyPeers={convoyPeers}
            showConvoyLayer={showConvoyLayer}
            onToggleConvoyLayer={() => setShowConvoyLayer((v) => !v)}
            onRouteToPeer={handleRouteToPeer}
            onAddPeerStop={handleAddPeerStop}
            isOfflineMode={isOfflineMode}
            mapStyle={mapStyle}
            onChangeMapStyle={setMapStyle}
            mapClickAction={mapClickAction}
            onChangeMapClickAction={setMapClickAction}
            onMapPickLocation={handleMapPickLocation}
            onCacheViewport={async (sw, ne) => {
              setActiveTab('offline');
              if (window.innerWidth < 1024) setMobileSheetState('half');
              const res = await cacheBoundingBoxTiles(sw, ne, [11, 12]);
              setTileStats(res.stats);
            }}
            focusedCoord={focusedCoord}
            navigationActive={navigationActive}
            activeStepIndex={activeStepIndex}
            onStepChange={handleStepChange}
            onExitNavigation={() => {
              setNavigationActive(false);
              pauseSimulation();
            }}
            voiceGuidance={voiceGuidance}
            onToggleVoiceGuidance={() => setVoiceGuidance((v) => !v)}
            followGps={followGps}
            onToggleFollowGps={() => setFollowGps((v) => !v)}
            isSimulating={isSimulating}
            onToggleSimulation={handleToggleSimulation}
            onResetSimulation={resetSimulation}
            simulationProgress={simProgressPercent}
            simSpeedMultiplier={simSpeedMultiplier}
            onChangeSimSpeed={setSimSpeedMultiplier}
            mobileSheetOpen={mobileSheetState !== 'peek'}
            theme={theme}
          />
        </div>

        {/* Mobile Interactive Bottom Sheet Drawer (Shown on screens < 1024px) */}
        <div
          className={`lg:hidden absolute left-0 right-0 bottom-0 z-[500] backdrop-blur-2xl border-t transition-all duration-300 flex flex-col ${
            theme === 'amoled'
              ? 'bg-black/95 border-purple-500/30 shadow-[0_-12px_36px_rgba(0,0,0,0.95)]'
              : theme === 'dark'
              ? 'bg-[#110820]/90 border-purple-500/25 shadow-[0_-12px_36px_rgba(5,2,14,0.85)]'
              : 'bg-white/95 border-purple-200/80 shadow-[0_-12px_36px_rgba(100,50,150,0.12)]'
          } ${
            mobileSheetState === 'peek'
              ? 'h-auto'
              : mobileSheetState === 'half'
              ? 'h-[50vh]'
              : 'h-[86vh]'
          }`}
        >
          {/* Drawer Handle & Quick Route Summary Bar */}
          <div
            onClick={() => {
              setMobileSheetState((curr) =>
                curr === 'peek' ? 'half' : curr === 'half' ? 'full' : 'peek'
              );
            }}
            className={`w-full pt-2 pb-1.5 px-4 flex items-center justify-between cursor-pointer border-b active:bg-purple-500/5 ${
              theme !== 'light' ? 'border-purple-500/15' : 'border-purple-200/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-8 h-1 rounded-full mx-auto ${
                theme !== 'light' ? 'bg-purple-400/40' : 'bg-purple-400/60'
              }`} />
              <span className={`mono text-[10px] uppercase tracking-wider ${
                theme !== 'light' ? 'text-purple-200/70' : 'text-purple-900/80 font-semibold'
              }`}>
                {activeTab === 'routes'
                  ? activeRoute
                    ? `${activeRoute.totalDurationMinutes}m · ${activeRoute.totalDistanceKm} km`
                    : 'Route Planner'
                  : activeTab === 'places'
                  ? `Places & Establishments (${establishments.length})`
                  : activeTab === 'traffic'
                  ? `Traffic Alerts (${incidents.filter((i) => i.active).length})`
                  : activeTab === 'weather'
                  ? 'En-Route Weather'
                  : 'Offline Cache'}
              </span>
            </div>

            <button
              type="button"
              className={`p-1 hover:opacity-100 ${theme !== 'light' ? 'text-gray-400' : 'text-purple-900/60'}`}
              aria-label="Toggle Drawer Height"
            >
              {mobileSheetState === 'peek' ? (
                <ChevronUp className={`w-5 h-5 ${theme !== 'light' ? 'text-[#c084fc]' : 'text-[#7c3aed]'}`} />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Drawer Scrollable Content (Hidden when drawer is in peek mode to prevent squashed content) */}
          <div className={`${mobileSheetState === 'peek' ? 'hidden' : 'flex-1 overflow-y-auto px-4 pt-3 pb-32 overscroll-contain'}`}>
            {activeTab === 'routes' && (
              <RoutePlannerPanel
                stops={stops}
                travelMode={travelMode}
                routes={computedRoutes}
                routeLoading={routeLoading}
                activeRouteIndex={activeRouteIndex}
                gpsState={gpsState}
                gpsLoading={gpsStatus === 'locating'}
                gpsError={gpsError}
                gpsWatchActive={gpsWatchActive}
                onLocateUserGps={handleLocateUserGps}
                onToggleGpsWatch={handleToggleGpsWatch}
                onPickOnMap={(mode) => {
                  setMapClickAction(mode);
                  setMobileSheetState('peek');
                }}
                mapClickAction={mapClickAction}
                onSelectRouteIndex={setActiveRouteIndex}
                onChangeTravelMode={setTravelMode}
                onApplyStops={handleApplyStops}
                onClearRoute={handleClearRoute}
                onFocusCoordinate={(lat, lng, zoom) => {
                  handleFocusCoordinate(lat, lng, zoom);
                  setMobileSheetState('peek');
                }}
                onStartNavigation={handleStartNavigation}
                onStartSimulation={handleToggleSimulation}
                isSimulating={isSimulating}
              />
            )}

            {activeTab === 'places' && (
              <EstablishmentsPanel
                gpsState={effectiveGps}
                onLocateUserGps={() => handleLocateUserGps(false)}
                onSelectEstablishmentRoute={handleSelectEstablishmentRoute}
                onFocusEstablishment={handleFocusEstablishment}
                onAddEstablishmentStop={handleAddEstablishmentStop}
                selectedEstablishmentId={selectedEstablishmentId}
                theme={theme}
              />
            )}

            {activeTab === 'traffic' && (
              <TrafficPanel
                incidents={incidents}
                onToggleIncidentActive={handleToggleIncidentActive}
                onAddIncident={handleAddIncident}
                onFocusCoordinate={(lat, lng, zoom, label) => {
                  handleFocusCoordinate(lat, lng, zoom, label);
                  setMobileSheetState('peek');
                }}
                activeRouteDelayMinutes={activeRoute?.trafficDelayMinutes || 0}
                gpsState={effectiveGps}
                trafficLights={trafficLights}
                onSelectDestination={(point) => {
                  if (gpsState) {
                    setStops([
                      {
                        name: gpsState.addressLabel || 'Current GPS Location',
                        region: 'Live GPS',
                        lat: gpsState.lat,
                        lng: gpsState.lng,
                      },
                      point,
                    ]);
                  } else if (stops.length >= 1) {
                    setStops([stops[0], point]);
                  } else {
                    setStops([point]);
                  }
                  setFocusedCoord({ lat: point.lat, lng: point.lng, zoom: 16, label: point.name });
                  setActiveTab('routes');
                  setMobileSheetState('half');
                }}
                onAddStop={(point) => {
                  if (stops.length === 0) {
                    if (gpsState) {
                      setStops([
                        {
                          name: gpsState.addressLabel || 'Current GPS Location',
                          region: 'Live GPS',
                          lat: gpsState.lat,
                          lng: gpsState.lng,
                        },
                        point,
                      ]);
                    } else {
                      setStops([point]);
                    }
                  } else if (stops.length === 1) {
                    setStops([...stops, point]);
                  } else {
                    const prev = [...stops];
                    prev.splice(prev.length - 1, 0, point);
                    setStops(prev);
                  }
                  setFocusedCoord({ lat: point.lat, lng: point.lng, zoom: 16, label: point.name });
                  setActiveTab('routes');
                  setMobileSheetState('half');
                }}
              />
            )}

            {activeTab === 'convoy' && (
              <ConvoyPanel
                roomCode={convoyRoomCode}
                isSharing={isConvoySharing}
                myName={convoyMyName}
                myVehicle={convoyMyVehicle}
                myColor={convoyMyColor}
                peers={convoyPeers}
                activePeersCount={convoyActivePeersCount}
                connectionStatus={convoyConnectionStatus}
                lastBroadcastAt={convoyLastBroadcastAt}
                gpsState={effectiveGps}
                onCreateConvoy={createConvoy}
                onJoinConvoy={joinConvoy}
                onLeaveConvoy={leaveConvoy}
                onUpdateProfile={updateConvoyProfile}
                onFocusCoordinate={(lat, lng, zoom, label) => {
                  handleFocusCoordinate(lat, lng, zoom, label);
                  setMobileSheetState('peek');
                }}
                onFitBounds={handleFitConvoyBounds}
                onRouteToPeer={handleRouteToPeer}
                onAddPeerStop={handleAddPeerStop}
                theme={theme}
              />
            )}

            {activeTab === 'weather' && (
              <WeatherForecastPanel
                snapshots={weatherSnapshots}
                corridorStations={corridorStations}
                hazardReport={hazardReport}
                destinationName={activeRoute?.stops[activeRoute.stops.length - 1]?.name}
                loading={weatherLoading}
                onFocusCoordinate={(lat, lng, zoom) => {
                  handleFocusCoordinate(lat, lng, zoom);
                  setMobileSheetState('peek');
                }}
                onRefreshWeather={syncEnRouteWeather}
                onSpotWeatherOnMap={() => {
                  setMapClickAction('weather');
                  setMobileSheetState('peek');
                }}
                activeRoute={activeRoute}
              />
            )}

            {activeTab === 'offline' && (
              <OfflineCachePanel
                stats={tileStats}
                isOfflineMode={isOfflineMode}
                onToggleOfflineMode={() => setIsOfflineMode((v) => !v)}
                onDownloadRegionPack={handleDownloadRegionPack}
                onCacheActiveRouteCorridor={handleCacheActiveRouteCorridor}
                onClearCache={handleClearCache}
                onFocusCoordinate={(lat, lng, zoom) => {
                  handleFocusCoordinate(lat, lng, zoom);
                  setMobileSheetState('peek');
                }}
                hasActiveRoute={Boolean(activeRoute && activeRoute.coordinates.length > 0)}
              />
            )}
          </div>

          {/* Mobile Bottom Navigation Dock (Thumb Accessible with safe-area padding & Tactile Framer Motion Active Indicator) */}
          <nav
            aria-label="Mobile Navigation Dock"
            className={`mobile-bottom-bar shrink-0 backdrop-blur-2xl border-t px-1 xs:px-2 sm:px-3 flex items-center justify-around gap-0.5 xs:gap-1 ${
              theme === 'amoled'
                ? 'bg-black/98 border-purple-500/25 shadow-[0_-10px_30px_rgba(0,0,0,0.9)]'
                : theme === 'dark'
                ? 'bg-[#0a0414]/95 border-purple-500/25 shadow-[0_-10px_30px_rgba(5,2,14,0.7)]'
                : 'bg-white/95 border-purple-200/80 shadow-[0_-10px_30px_rgba(100,50,150,0.08)]'
            }`}
          >
            {(
              [
                { id: 'routes', label: 'Planner', icon: Navigation },
                { id: 'places', label: 'Places', icon: Store, badge: establishments.length },
                {
                  id: 'traffic',
                  label: 'Traffic',
                  icon: AlertTriangle,
                  badge: incidents.filter((i) => i.active).length,
                },
                {
                  id: 'convoy',
                  label: 'Convoy',
                  icon: Users,
                  badge: isConvoySharing && convoyActivePeersCount > 0 ? convoyActivePeersCount : undefined,
                  alertDot: isConvoySharing && convoyActivePeersCount === 0,
                },
                {
                  id: 'weather',
                  label: 'Weather',
                  icon: CloudRain,
                  alertDot: Boolean(hazardReport && hazardReport.overallLevel !== 'nominal'),
                },
                {
                  id: 'offline',
                  label: 'Offline',
                  icon: HardDriveDownload,
                  alertDot: isOfflineMode,
                },
              ] as {
                id: ActiveTab;
                label: string;
                icon: any;
                badge?: number;
                alertDot?: boolean;
              }[]
            ).map((tab) => {
              const isCurrent = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (mobileSheetState === 'peek') {
                      setMobileSheetState('half');
                    }
                  }}
                  className="relative flex-1 min-w-0 py-1.5 flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer select-none"
                >
                  {isCurrent && (
                    <motion.div
                      layoutId="activeMobileTabPill"
                      className={`absolute inset-0 rounded-2xl border ${
                        theme !== 'light'
                          ? 'bg-gradient-to-b from-[#a855f7]/25 to-[#7c3aed]/15 border-purple-400/40 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                          : 'bg-purple-100 border-purple-300 shadow-sm'
                      }`}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}

                  <div className="relative z-10 flex flex-col items-center gap-1 w-full px-0.5">
                    <div className="relative">
                      <Icon
                        className={`w-5 h-5 transition-transform duration-200 ${
                          isCurrent
                            ? theme !== 'light'
                              ? 'text-[#c084fc] scale-110 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]'
                              : 'text-[#7c3aed] scale-110'
                            : theme !== 'light'
                            ? 'text-zinc-400'
                            : 'text-zinc-500'
                        }`}
                      />
                      {/* Badge count for Traffic */}
                      {typeof tab.badge === 'number' && tab.badge > 0 && (
                        <span className="absolute -top-1 -right-2.5 px-1 min-w-[15px] h-[15px] bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-md">
                          {tab.badge}
                        </span>
                      )}
                      {/* Alert dot for Weather Hazards / Offline */}
                      {tab.alertDot && (
                        <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      )}
                      {tab.alertDot && (
                        <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#0a0414]" />
                      )}
                    </div>
                    <span
                      className={`mono text-[8.5px] xs:text-[10px] uppercase tracking-tight xs:tracking-wider font-extrabold transition-colors truncate max-w-full text-center ${
                        isCurrent
                          ? theme !== 'light'
                            ? 'text-[#f8f6fc]'
                            : 'text-[#160a2c]'
                          : theme !== 'light'
                          ? 'text-zinc-400'
                          : 'text-zinc-500'
                      }`}
                    >
                      {tab.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </main>
    </div>
  );
}
