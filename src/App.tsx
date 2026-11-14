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
import { ConvoySharedRoute } from './utils/convoySync';
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
import { useCameraRecorder } from './hooks/useCameraRecorder';
import { DashcamOverlay, DashcamViewMode } from './components/DashcamOverlay';
import { useStravaTrackRecorder } from './hooks/useStravaTrackRecorder';
import { StravaActivityModal } from './components/StravaActivityModal';
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
  Store,
  Search,
  Crosshair,
  Share,
  PlusSquare,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

export type AppTheme = 'dark' | 'amoled' | 'light';
type ActiveTab = 'routes' | 'places' | 'traffic' | 'convoy' | 'weather' | 'offline';
type MobileSheetState = 'peek' | 'half' | 'full';

function triggerLightHaptic(ms = 8): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms);
    } catch {
      // Ignore unsupported environments
    }
  }
}

export default function App() {
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('laagarn_theme');
      if (saved === 'dark' || saved === 'amoled' || saved === 'light') return saved;
    }
    return 'dark';
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('routes');
  const [mobileSheetState, setMobileSheetState] = useState<MobileSheetState>('peek');
  const [isShortLandscape, setIsShortLandscape] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight < 520 : false
  );
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState<boolean>(true);

  // Track short landscape & desktop split viewport breakpoints
  useEffect(() => {
    const onResize = () => {
      setIsShortLandscape(window.innerHeight < 520);
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
  const [trafficLights] = useState<TrafficLight[]>(KNOWN_TRAFFIC_LIGHTS);
  const [showTrafficLightsLayer, setShowTrafficLightsLayer] = useState<boolean>(true);
  const [showWeatherLayer, setShowWeatherLayer] = useState<boolean>(true);
  const [showConvoyLayer, setShowConvoyLayer] = useState<boolean>(true);

  // Establishments state
  const [establishments] = useState<Establishment[]>(KNOWN_ESTABLISHMENTS);
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
    triggerLightHaptic();
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

  // PWA install prompt & iOS standalone detection
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosInstallGuide, setShowIosInstallGuide] = useState<boolean>(false);
  const isStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any)?.standalone === true
    );
  }, []);
  const isIosDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }, []);

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
    isHost: isConvoyHost,
    joinApprovalStatus: convoyJoinApprovalStatus,
    pendingJoinRequests: convoyPendingJoinRequests,
    autoAccept: convoyAutoAccept,
    myName: convoyMyName,
    myVehicle: convoyMyVehicle,
    myColor: convoyMyColor,
    peers: convoyPeers,
    activePeersCount: convoyActivePeersCount,
    connectionStatus: convoyConnectionStatus,
    lastBroadcastAt: convoyLastBroadcastAt,
    sharedRoute: convoySharedRoute,
    routeSuggestions: convoyRouteSuggestions,
    createConvoy,
    joinConvoy,
    leaveConvoy,
    cancelJoinRequest: cancelConvoyJoinRequest,
    acceptJoinRequest: acceptConvoyJoinRequest,
    declineJoinRequest: declineConvoyJoinRequest,
    setAutoAccept: setConvoyAutoAccept,
    updateProfile: updateConvoyProfile,
    shareRouteToConvoy,
    suggestRouteToConvoy,
    dismissRouteSuggestion,
  } = useConvoy(effectiveGps);

  // Highway Dashcam & Timelapse recorder hook
  const [dashcamViewMode, setDashcamViewMode] = useState<DashcamViewMode>('hidden');
  useWakeLock(navigationActive || isSimulating || dashcamViewMode !== 'hidden');
  const cameraRecorder = useCameraRecorder({
    effectiveGps,
    currentRoadName:
      activeRoute?.steps[activeStepIndex]?.instruction ||
      activeRoute?.label ||
      effectiveGps?.addressLabel,
  });

  // Strava Simulation Track Recorder hook
  const [stravaModalOpen, setStravaModalOpen] = useState<boolean>(false);
  const stravaRecorder = useStravaTrackRecorder(
    effectiveGps,
    isSimulating,
    activeRoute?.label || 'Philippine Highway Simulation'
  );

  // Swipeable Bottom Sheet Gesture State
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [isDraggingSheet, setIsDraggingSheet] = useState<boolean>(false);
  const dragMetaRef = useRef<{
    active: boolean;
    startY: number;
    lastY: number;
    startTime: number;
    moved: boolean;
  }>({
    active: false,
    startY: 0,
    lastY: 0,
    startTime: 0,
    moved: false,
  });

  const handleSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore taps on nested quick action buttons inside the peek bar
    if ((e.target as HTMLElement).closest('[data-peek-action]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragMetaRef.current = {
      active: true,
      startY: e.clientY,
      lastY: e.clientY,
      startTime: performance.now(),
      moved: false,
    };
    setIsDraggingSheet(true);
    setDragOffsetY(0);
  };

  const handleSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMetaRef.current.active) return;
    const dy = e.clientY - dragMetaRef.current.startY;
    dragMetaRef.current.lastY = e.clientY;
    if (Math.abs(dy) > 6) {
      dragMetaRef.current.moved = true;
    }
    // Apply gentle rubber-band resistance at extremes
    if (mobileSheetState === 'full' && dy < 0) {
      setDragOffsetY(dy * 0.25);
    } else if (mobileSheetState === 'peek' && dy > 0) {
      setDragOffsetY(dy * 0.2);
    } else {
      setDragOffsetY(dy);
    }
  };

  const finishSheetGesture = () => {
    if (!dragMetaRef.current.active) return;
    const { startY, lastY, startTime, moved } = dragMetaRef.current;
    dragMetaRef.current.active = false;
    setIsDraggingSheet(false);
    setDragOffsetY(0);

    const dy = lastY - startY;
    const dt = Math.max(16, performance.now() - startTime);
    const velocityY = dy / dt; // px/ms (negative = swipe up, positive = swipe down)

    if (!moved) {
      // Simple tap on handle toggles intuitively
      triggerLightHaptic(6);
      setMobileSheetState((curr) =>
        curr === 'peek' ? 'half' : curr === 'half' ? 'peek' : 'half'
      );
      return;
    }

    const fastUp = velocityY < -0.55;
    const fastDown = velocityY > 0.55;

    if (dy < -55 || fastUp) {
      triggerLightHaptic(8);
      setMobileSheetState((curr) => {
        if (curr === 'peek') return fastUp && dy < -140 ? 'full' : 'half';
        return 'full';
      });
    } else if (dy > 55 || fastDown) {
      triggerLightHaptic(8);
      setMobileSheetState((curr) => {
        if (curr === 'full') return fastDown && dy > 150 ? 'peek' : 'half';
        return 'peek';
      });
    }
  };

  const handleLoadSharedRoute = useCallback(
    (route: ConvoySharedRoute) => {
      if (route.stops && route.stops.length >= 2) {
        setStops(route.stops);
        setActiveTab('routes');
        setMobileSheetState('half');
        speakGuidance(`Loaded convoy route: ${route.label}`);
      }
    },
    [speakGuidance]
  );

  const handleShareCurrentRouteToConvoy = useCallback(() => {
    if (!activeRoute) return;
    const shared: ConvoySharedRoute = {
      id: `route-${Date.now()}`,
      label: activeRoute.label,
      stops: activeRoute.stops,
      totalDistanceKm: activeRoute.totalDistanceKm,
      durationMinutes: activeRoute.totalDurationMinutes,
      suggestedByPeerId: 'self',
      suggestedByName: convoyMyName,
      timestamp: Date.now(),
      isHostRoute: true,
    };
    shareRouteToConvoy(shared);
    speakGuidance(`Shared ${activeRoute.label} to convoy`);
  }, [activeRoute, convoyMyName, shareRouteToConvoy, speakGuidance]);

  const handleSuggestCurrentRouteToConvoy = useCallback(() => {
    if (!activeRoute) return;
    const sug: ConvoySharedRoute = {
      id: `sug-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      label: activeRoute.label,
      stops: activeRoute.stops,
      totalDistanceKm: activeRoute.totalDistanceKm,
      durationMinutes: activeRoute.totalDurationMinutes,
      suggestedByPeerId: 'self',
      suggestedByName: convoyMyName,
      timestamp: Date.now(),
    };
    suggestRouteToConvoy(sug);
    speakGuidance(`Suggested route to convoy: ${activeRoute.label}`);
  }, [activeRoute, convoyMyName, suggestRouteToConvoy, speakGuidance]);

  const handleToggleDashcam = () => {
    triggerLightHaptic(10);
    if (dashcamViewMode === 'hidden') {
      setDashcamViewMode('pip');
      cameraRecorder.startCamera();
    } else if (dashcamViewMode === 'pip') {
      setDashcamViewMode('hud');
    } else {
      setDashcamViewMode('hidden');
    }
  };

  // Handle PWA deep-link URL params (?convoy=CODE, ?tab=..., ?dashcam=hud|pip)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('convoy');
    const urlTab = params.get('tab') as ActiveTab | null;
    const urlDashcam = params.get('dashcam');

    if (urlCode) {
      setActiveTab('convoy');
      setMobileSheetState('half');
    } else if (
      urlTab &&
      ['routes', 'places', 'traffic', 'convoy', 'weather', 'offline'].includes(urlTab)
    ) {
      setActiveTab(urlTab);
      setMobileSheetState('half');
    }

    if (urlDashcam === 'hud' || urlDashcam === 'pip') {
      setDashcamViewMode(urlDashcam);
      cameraRecorder.startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Anti-Vibration & Touch-Outside Blur (Suppresses iOS WebKit "Undo Typing" dialog)
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

    if (progress.nextStepIndex !== activeStepIndex) {
      setActiveStepIndex(progress.nextStepIndex);
      const nextStep = activeRoute.steps[progress.nextStepIndex];
      if (nextStep) {
        speakGuidance(buildSpokenInstruction(nextStep, progress.distanceToNextStepKm));
      }
    }

    if (progress.arrived) {
      speakGuidance('You have arrived at your destination.');
      if (cameraRecorder.isRecording) {
        cameraRecorder.stopRecording();
        speakGuidance('Your dashcam recording is finished and ready to preview and save.');
      }
    }
  }, [effectiveGps, navigationActive, isSimulating, activeRoute, routeIndex, activeStepIndex, speakGuidance, cameraRecorder]);

  // Handle GPS Locate button
  const handleLocateUserGps = useCallback(
    async (setAsOrigin = true) => {
      triggerLightHaptic(8);
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
    setMobileSheetState('half');
  };

  const handleClearRoute = () => {
    resetSimulation();
    setStops([]);
    setComputedRoutes([]);
    setNavigationActive(false);
    setActiveStepIndex(0);
  };

  const handleToggleSimulation = () => {
    triggerLightHaptic(10);
    if (isSimulating) {
      pauseSimulation();
    } else {
      startSimulation();
      setFollowGps(true);
      setMobileSheetState('peek');
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
      setMobileSheetState('half');
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
      setMobileSheetState('half');
    } else if (action === 'waypoint') {
      setStops((prev) => {
        if (prev.length < 2) return [...prev, customPoint];
        return [...prev.slice(0, -1), customPoint, prev[prev.length - 1]];
      });
      setMapClickAction('none');
      setMobileSheetState('half');
    } else if (action === 'weather') {
      const snap = await fetchLocationWeather(customPoint, isOfflineMode);
      setWeatherSnapshots((prev) => [snap, ...prev.slice(0, 4)]);
      setActiveTab('weather');
      setMapClickAction('none');
      setMobileSheetState('half');
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
    setMobileSheetState('half');
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
    setMobileSheetState('half');
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
    setMobileSheetState('half');
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
    setMobileSheetState('half');
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
    setMobileSheetState('half');
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
    setMobileSheetState('peek');
  };

  const handleFocusEstablishment = (est: Establishment) => {
    setSelectedEstablishmentId(est.id);
    setFocusedCoord({ lat: est.lat, lng: est.lng, zoom: 16 });
    setMobileSheetState('peek');
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
    triggerLightHaptic(14);
    setNavigationActive(true);
    setActiveStepIndex(0);
    setFollowGps(true);
    startTracking();
    setMobileSheetState('peek');
    if (activeRoute?.steps[0]) {
      handleFocusCoordinate(activeRoute.steps[0].lat, activeRoute.steps[0].lng, 16);
      speakGuidance(`Starting navigation to ${activeRoute.stops[activeRoute.stops.length - 1].name}.`);
    }
  };

  const handleInstallPwa = async () => {
    triggerLightHaptic(8);
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else if (isIosDevice && !isStandalone) {
      setShowIosInstallGuide(true);
    }
  };

  const handleOpenWhereToSearch = () => {
    triggerLightHaptic(8);
    setActiveTab('routes');
    if (isDesktop) {
      setDesktopSidebarOpen(true);
    } else {
      setMobileSheetState((curr) => (curr === 'peek' ? 'half' : 'full'));
    }
    setTimeout(() => {
      const destEl = document.getElementById('destination-location-input');
      if (destEl && !activeRoute) {
        destEl.focus();
      }
    }, 180);
  };

  // Brand Logo Tap: Return to Home Map / Reset
  const handleHomeOrRefresh = (e?: React.MouseEvent) => {
    e?.preventDefault();
    triggerLightHaptic(8);

    setActiveTab('routes');
    setSelectedEstablishmentId(null);
    setNavigationActive(false);
    resetSimulation();
    setMobileSheetState('peek');

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

    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname || '/');
    }
  };

  // Compute responsive sheet CSS height (with live finger-drag offset)
  const baseSheetHeightVh =
    mobileSheetState === 'peek'
      ? 0
      : mobileSheetState === 'half'
      ? isShortLandscape
        ? 64
        : 54
      : isShortLandscape
      ? 92
      : 88;

  const sheetDynamicStyle: React.CSSProperties | undefined = isDesktop
    ? undefined
    : mobileSheetState === 'peek' && dragOffsetY >= 0
    ? {}
    : {
        height:
          mobileSheetState === 'peek'
            ? `calc(6.75rem + env(safe-area-inset-bottom, 0px) + ${Math.max(0, -dragOffsetY)}px)`
            : `clamp(110px, calc(${baseSheetHeightVh}dvh - ${dragOffsetY}px), 94dvh)`,
      };

  const activeIncidentsCount = incidents.filter((i) => i.active).length;

  const navTabs: {
    id: ActiveTab;
    label: string;
    icon: any;
    badge?: number;
    alertDot?: boolean;
  }[] = [
    { id: 'routes', label: 'Route', icon: Navigation },
    { id: 'places', label: 'Places', icon: Store },
    {
      id: 'traffic',
      label: 'Traffic',
      icon: AlertTriangle,
      badge: activeIncidentsCount,
    },
    {
      id: 'convoy',
      label: 'Convoy',
      icon: Users,
      badge:
        isConvoySharing && convoyActivePeersCount > 0
          ? convoyActivePeersCount + 1
          : undefined,
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
  ];

  const peekSummaryLabel =
    activeTab === 'routes'
      ? activeRoute
        ? `${activeRoute.totalDurationMinutes} min · ${activeRoute.totalDistanceKm} km`
        : 'Plan Your Ride or Drive'
      : activeTab === 'places'
      ? `Places Nearby (${establishments.length})`
      : activeTab === 'traffic'
      ? `Road & Hazard Alerts (${activeIncidentsCount})`
      : activeTab === 'convoy'
      ? isConvoySharing
        ? `Convoy ${convoyRoomCode} · ${convoyActivePeersCount + 1} Riders`
        : 'Live Convoy Pack'
      : activeTab === 'weather'
      ? 'Corridor Weather & Grade'
      : `Offline Maps (${tileStats.tileCount} tiles)`;

  const destinationShortName =
    activeRoute && activeRoute.stops.length >= 2
      ? activeRoute.stops[activeRoute.stops.length - 1].name.split(',')[0]
      : null;

  return (
    <div
      className={`relative h-full h-[100dvh] w-full overflow-hidden select-none font-sans transition-colors duration-200 ${
        theme === 'amoled'
          ? 'bg-[#000000] text-white'
          : theme === 'dark'
          ? 'bg-[#090410] text-[#f8f6fc]'
          : 'bg-[#f8f6fc] text-[#160a2c]'
      }`}
    >
      {/* 1. Full-Bleed Edge-to-Edge Interactive Map Canvas */}
      <main className="absolute inset-0 w-full h-full z-0">
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
            setMobileSheetState('half');
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
          onToggleDashcam={handleToggleDashcam}
          dashcamActive={dashcamViewMode !== 'hidden'}
          isRecordingVideo={cameraRecorder.isRecording}
          mobileSheetOpen={!isDesktop && mobileSheetState !== 'peek'}
          desktopSidebarOpen={isDesktop && desktopSidebarOpen}
          onOpenStravaModal={() => setStravaModalOpen(true)}
          stravaRecordingActive={stravaRecorder.isRecording}
          stravaPointsCount={stravaRecorder.trackPoints.length}
          convoySharedRoute={convoySharedRoute}
          onLoadSharedRoute={handleLoadSharedRoute}
          pendingConvoyJoinRequests={convoyPendingJoinRequests}
          onAcceptConvoyJoinRequest={acceptConvoyJoinRequest}
          onDeclineConvoyJoinRequest={declineConvoyJoinRequest}
          theme={theme}
        />
      </main>

      {/* 2. Floating Mobile Top Search & Status Capsule (Hidden on Desktop where Left Rail integrates it) */}
      {!(navigationActive || isSimulating) && (
        <header className="lg:hidden absolute top-0 left-0 right-0 z-[500] pt-[max(0.45rem,env(safe-area-inset-top))] px-3 pointer-events-none">
          <div className="cockpit-shell pointer-events-auto max-w-[480px] mx-auto h-12 px-2 flex items-center justify-between gap-1.5 rounded-2xl transition-colors text-[var(--ink)]">
            {/* Brand Home Pill */}
            <button
              type="button"
              onClick={handleHomeOrRefresh}
              aria-label="LAAGARN Home"
              className="flex items-center gap-1.5 pl-0.5 pr-1.5 py-1 rounded-xl active:scale-95 transition-transform cursor-pointer shrink-0"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center text-white shadow-md shadow-purple-500/35">
                <Compass className="w-4.5 h-4.5 animate-[spin_14s_linear_infinite]" />
              </div>
              <span className="display text-xs font-black tracking-wider hidden xs:inline">
                LAAGARN
              </span>
            </button>

            {/* Interactive "Where to?" / Active Route Search Pill */}
            <button
              type="button"
              onClick={handleOpenWhereToSearch}
              className="flex-1 min-w-0 h-8 px-2.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex items-center gap-2 text-left active:scale-[0.98] transition-all cursor-pointer text-[var(--ink)]"
            >
              <Search className="w-3.5 h-3.5 text-[var(--accent-light)] shrink-0" />
              {destinationShortName ? (
                <div className="min-w-0 flex items-center gap-1.5 text-xs truncate">
                  <span className="font-semibold truncate">{destinationShortName}</span>
                  <span className="mono text-[10px] text-[var(--accent-light)] font-bold shrink-0">
                    · {activeRoute?.totalDurationMinutes}m
                  </span>
                </div>
              ) : (
                <span className="text-xs font-medium truncate text-[var(--ink-dim)]">
                  Where to?
                </span>
              )}
            </button>

            {/* Right Compact Status & Actions */}
            <div className="flex items-center gap-1 shrink-0">
              {isConvoySharing && (
                <button
                  type="button"
                  onClick={() => {
                    triggerLightHaptic(8);
                    setActiveTab('convoy');
                    setMobileSheetState('half');
                  }}
                  aria-label="Open Active Convoy"
                  className="h-8 px-2 bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 mono text-[10px] font-bold rounded-xl flex items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 animate-pulse" />
                  <span>{convoyActivePeersCount + 1}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleToggleTheme}
                aria-label={`Switch theme (current: ${theme})`}
                className="w-8 h-8 rounded-xl bg-[var(--surface-pill)] border border-[var(--border-subtle)] text-[var(--ink)] flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Zap className="w-3.5 h-3.5 text-[#c084fc]" />
                ) : theme === 'amoled' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-[#7c3aed]" />
                )}
              </button>

              {!isStandalone && (deferredPrompt || isIosDevice) && (
                <button
                  type="button"
                  onClick={handleInstallPwa}
                  aria-label="Install Mobile App"
                  title="Install LAAGARN App"
                  className="h-8 px-2 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white flex items-center gap-1 shadow-md shadow-purple-500/30 rounded-xl active:scale-95 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}

              {isOfflineMode ? (
                <div
                  title="Offline Mode Active"
                  className="h-8 px-2 bg-amber-500/15 border border-amber-500/35 text-amber-400 rounded-xl flex items-center"
                >
                  <WifiOff className="w-3 h-3" />
                </div>
              ) : (
                <div
                  title="Live Network Connected"
                  className="h-8 px-2 bg-[var(--surface-pill)] border border-[var(--border-subtle)] rounded-xl flex items-center"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Desktop Reopen Cockpit Pill when Sidebar is Collapsed */}
      {isDesktop && !desktopSidebarOpen && (
        <div className="hidden lg:flex fixed top-4 left-4 z-[510] items-center gap-2 cockpit-shell px-2.5 py-2 rounded-2xl text-[var(--ink)]">
          <button
            type="button"
            onClick={() => setDesktopSidebarOpen(true)}
            aria-label="Open LAAGARN Cockpit Panel"
            className="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-[var(--surface-pill)] transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center text-white shadow-sm">
              <Compass className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold tracking-tight">Open Panel</span>
            <PanelLeftOpen className="w-4 h-4 text-[var(--accent-light)]" />
          </button>
        </div>
      )}

      {/* 3. Unified Responsive Command Surface: Desktop Left Glass Cockpit Rail + Mobile Bottom Sheet */}
      <div
        style={sheetDynamicStyle}
        className={`fixed left-0 right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-[480px] bottom-0 lg:left-4 lg:right-auto lg:top-4 lg:bottom-4 lg:translate-x-0 lg:w-[404px] lg:max-w-[404px] z-[500] cockpit-shell border-t sm:border rounded-t-3xl lg:rounded-3xl flex flex-col overflow-hidden ${
          isDraggingSheet
            ? 'transition-none'
            : 'transition-[height,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'
        } ${
          isDesktop && !desktopSidebarOpen ? 'lg:hidden' : ''
        } ${
          !isDesktop && mobileSheetState === 'peek' && dragOffsetY >= 0 ? 'h-auto' : ''
        }`}
      >
        {/* Desktop Brand Capsule & Segmented Navigation Bar */}
        <div className="hidden lg:flex flex-col shrink-0 border-b border-[var(--border-subtle)]">
          <div className="px-3.5 pt-3 pb-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleHomeOrRefresh}
              className="flex items-center gap-2 rounded-xl pr-2 py-0.5 active:scale-95 transition-transform cursor-pointer shrink-0"
              title="Reset to Philippines Map Overview"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center text-white shadow-md shadow-purple-500/35">
                <Compass className="w-4.5 h-4.5 animate-[spin_14s_linear_infinite]" />
              </div>
              <div className="text-left">
                <div className="display text-xs font-black tracking-wider text-[var(--ink)] leading-none">
                  LAAGARN
                </div>
                <div className="mono text-[9.5px] text-[var(--accent-light)] font-semibold mt-0.5">
                  PH Cockpit
                </div>
              </div>
            </button>

            <div className="flex items-center gap-1">
              {isConvoySharing && (
                <button
                  type="button"
                  onClick={() => setActiveTab('convoy')}
                  aria-label="Open Active Convoy"
                  className="h-8 px-2 bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 mono text-[10px] font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{convoyActivePeersCount + 1}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleToggleTheme}
                aria-label={`Switch theme (current: ${theme})`}
                title={`Theme: ${theme}`}
                className="w-8 h-8 rounded-xl bg-[var(--surface-pill)] border border-[var(--border-subtle)] flex items-center justify-center hover:border-[var(--accent)] transition-all cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Zap className="w-3.5 h-3.5 text-[#c084fc]" />
                ) : theme === 'amoled' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-[#7c3aed]" />
                )}
              </button>

              {!isStandalone && (deferredPrompt || isIosDevice) && (
                <button
                  type="button"
                  onClick={handleInstallPwa}
                  aria-label="Install App"
                  title="Install LAAGARN App"
                  className="h-8 px-2 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white rounded-xl flex items-center cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setDesktopSidebarOpen(false)}
                aria-label="Collapse Sidebar"
                title="Collapse Left Panel"
                className="w-8 h-8 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[var(--ink-dim)] hover:text-[var(--ink)] flex items-center justify-center transition-colors cursor-pointer"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Desktop 6-Module Navigation Tabs */}
          <nav aria-label="Desktop Navigation Tabs" className="px-2.5 pb-2.5 grid grid-cols-6 gap-1">
            {navTabs.map((tab) => {
              const isCurrent = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    triggerLightHaptic(8);
                    setActiveTab(tab.id);
                  }}
                  className={`relative py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer select-none ${
                    isCurrent
                      ? 'bg-[var(--surface-pill)] border border-[var(--accent)]/50 text-[var(--ink)] shadow-sm'
                      : 'text-[var(--ink-dim)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] border border-transparent'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <Icon
                      className={`w-4 h-4 ${
                        isCurrent ? 'text-[var(--accent-light)]' : ''
                      }`}
                    />
                    {typeof tab.badge === 'number' && tab.badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-[14px] bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
                        {tab.badge}
                      </span>
                    )}
                    {tab.alertDot && (
                      <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </div>
                  <span className="text-[10px] font-semibold tracking-tight leading-none">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Mobile Touch-Draggable Sheet Grabber & Actionable Peek Summary Bar */}
        <div
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={finishSheetGesture}
          onPointerCancel={finishSheetGesture}
          className="lg:hidden w-full pt-2 pb-2 px-4 flex flex-col cursor-grab active:cursor-grabbing touch-none select-none border-b border-[var(--border-subtle)]"
        >
          {/* Centered Pill Grabber */}
          <div className="w-10 h-1 rounded-full mx-auto mb-2 bg-purple-400/40" />

          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight truncate text-[var(--ink)]">
                {peekSummaryLabel}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* 1-Tap Quick Action right inside Peek Strip */}
              {activeRoute && !navigationActive ? (
                <button
                  type="button"
                  data-peek-action
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartNavigation();
                  }}
                  className="h-7 px-3 rounded-full bg-emerald-500 active:scale-95 text-slate-950 text-[11px] font-bold flex items-center gap-1 shadow-md shadow-emerald-500/25 cursor-pointer"
                >
                  <Navigation className="w-3 h-3 fill-current" />
                  <span>Start</span>
                </button>
              ) : !navigationActive ? (
                <button
                  type="button"
                  data-peek-action
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLocateUserGps(true);
                  }}
                  className="h-7 px-2.5 rounded-full bg-[var(--surface-pill)] border border-[var(--border)] active:scale-95 text-[var(--accent-light)] mono text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Crosshair className="w-3 h-3" />
                  <span>GPS</span>
                </button>
              ) : null}

              <button
                type="button"
                aria-label={mobileSheetState === 'peek' ? 'Expand sheet panel' : 'Collapse sheet panel'}
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileSheetState((curr) => (curr === 'peek' ? 'half' : 'peek'));
                }}
                className="p-1 text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer"
              >
                {mobileSheetState === 'peek' ? (
                  <ChevronUp className="w-4.5 h-4.5" />
                ) : (
                  <ChevronDown className="w-4.5 h-4.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Panel Body */}
        <div
          className={`${
            !isDesktop && mobileSheetState === 'peek' && dragOffsetY >= 0
              ? 'hidden lg:block lg:flex-1 lg:min-h-0 lg:overflow-y-auto px-4 pt-3.5 pb-6'
              : 'flex-1 min-h-0 overflow-y-auto mobile-scroll px-4 pt-3.5 pb-6 overscroll-contain'
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
              onPickOnMap={(mode) => {
                setMapClickAction(mode);
                if (mode !== 'none') setMobileSheetState('peek');
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
              onOpenStravaModal={() => setStravaModalOpen(true)}
              stravaRecordingActive={stravaRecorder.isRecording}
              stravaPointsCount={stravaRecorder.trackPoints.length}
              isConvoySharing={isConvoySharing}
              convoyRoomCode={convoyRoomCode}
              onShareRouteToConvoy={handleShareCurrentRouteToConvoy}
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
              isHost={isConvoyHost}
              joinApprovalStatus={convoyJoinApprovalStatus}
              pendingJoinRequests={convoyPendingJoinRequests}
              autoAccept={convoyAutoAccept}
              myName={convoyMyName}
              myVehicle={convoyMyVehicle}
              myColor={convoyMyColor}
              peers={convoyPeers}
              activePeersCount={convoyActivePeersCount}
              connectionStatus={convoyConnectionStatus}
              lastBroadcastAt={convoyLastBroadcastAt}
              gpsState={effectiveGps}
              currentRoute={activeRoute}
              sharedRoute={convoySharedRoute}
              routeSuggestions={convoyRouteSuggestions}
              onCreateConvoy={createConvoy}
              onJoinConvoy={joinConvoy}
              onLeaveConvoy={leaveConvoy}
              onCancelJoinRequest={cancelConvoyJoinRequest}
              onAcceptJoinRequest={acceptConvoyJoinRequest}
              onDeclineJoinRequest={declineConvoyJoinRequest}
              onSetAutoAccept={setConvoyAutoAccept}
              onUpdateProfile={updateConvoyProfile}
              onFocusCoordinate={(lat, lng, zoom, label) => {
                handleFocusCoordinate(lat, lng, zoom, label);
                setMobileSheetState('peek');
              }}
              onFitBounds={handleFitConvoyBounds}
              onRouteToPeer={handleRouteToPeer}
              onAddPeerStop={handleAddPeerStop}
              onShareRouteToConvoy={handleShareCurrentRouteToConvoy}
              onSuggestRouteToConvoy={handleSuggestCurrentRouteToConvoy}
              onLoadSharedRoute={handleLoadSharedRoute}
              onDismissRouteSuggestion={dismissRouteSuggestion}
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

        {/* Bottom Navigation Tab Dock (Mobile Only — Desktop uses Top Rail Tabs) */}
        <nav
          aria-label="Mobile Navigation Dock"
          className="lg:hidden mobile-bottom-bar shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 xs:px-2.5 flex items-center justify-around gap-0.5 z-30"
        >
          {navTabs.map((tab) => {
            const isCurrent = activeTab === tab.id;
            const isExpandedActive = isCurrent && mobileSheetState !== 'peek';
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerLightHaptic(8);
                  if (isCurrent && mobileSheetState !== 'peek') {
                    setMobileSheetState('peek');
                  } else {
                    setActiveTab(tab.id);
                    if (mobileSheetState === 'peek') {
                      setMobileSheetState('half');
                    }
                  }
                }}
                className="relative flex-1 min-w-0 py-1.5 flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer select-none"
              >
                {isExpandedActive && (
                  <motion.div
                    layoutId="activeMobileTabPill"
                    className="absolute inset-0 rounded-2xl border bg-[var(--surface-pill)] border-[var(--accent)]/45 shadow-[0_0_12px_var(--accent-glow)]"
                    transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                  />
                )}

                <div className="relative z-10 flex flex-col items-center justify-center w-full px-0.5">
                  <div className="relative flex items-center justify-center">
                    <Icon
                      className={`w-5 h-5 transition-transform duration-200 ${
                        isCurrent
                          ? 'text-[var(--accent-light)] scale-105'
                          : 'text-[var(--ink-dim)]'
                      }`}
                    />
                    {typeof tab.badge === 'number' && tab.badge > 0 && (
                      <span className="absolute -top-1 -right-2 px-1 min-w-[14px] h-[14px] bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shadow-md leading-none">
                        {tab.badge}
                      </span>
                    )}
                    {tab.alertDot && (
                      <>
                        <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-400" />
                      </>
                    )}
                  </div>
                  <span
                    className={`text-[10px] tracking-tight font-semibold transition-colors truncate max-w-full text-center leading-none mt-1 ${
                      isCurrent ? 'text-[var(--ink)]' : 'text-[var(--ink-dim)]'
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

      {/* 4. iOS Safari "Add to Home Screen" Guide Bottom Sheet */}
      {showIosInstallGuide && (
        <div
          className="fixed inset-0 z-[1300] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowIosInstallGuide(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-t-3xl sm:rounded-3xl border-t sm:border p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4 shadow-2xl ${
              theme !== 'light'
                ? 'bg-[#120824] border-purple-500/35 text-white'
                : 'bg-white border-purple-200 text-[#160a2c]'
            }`}
          >
            <div className="w-10 h-1 rounded-full bg-purple-400/35 mx-auto sm:hidden" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center text-white shadow-md">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <div className="mono text-[10px] uppercase font-bold text-[#c084fc]">
                    Full-Screen Mobile App
                  </div>
                  <h3 className="text-sm font-black">Install LAAGARN on iPhone</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosInstallGuide(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center opacity-75 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center gap-3">
                <Share className="w-5 h-5 text-[#c084fc] shrink-0" />
                <span>
                  1. Tap the <strong>Share</strong> button in Safari&apos;s bottom bar.
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center gap-3">
                <PlusSquare className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  2. Scroll down and tap <strong>Add to Home Screen</strong> for fullscreen offline GPS &amp; Dashcam.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosInstallGuide(false)}
              className="w-full min-h-[44px] rounded-2xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white mono text-xs uppercase font-bold cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* 5. Highway Dashcam & Timelapse Overlay (PiP or Fullscreen AR HUD) */}
      <DashcamOverlay
        recorder={cameraRecorder}
        viewMode={dashcamViewMode}
        onChangeViewMode={setDashcamViewMode}
        gpsState={effectiveGps}
        currentStep={activeRoute?.steps[activeStepIndex]}
        nextStep={activeRoute?.steps[activeStepIndex + 1]}
        activeRouteLabel={activeRoute?.label}
        theme={theme}
      />

      {/* 6. Strava Simulation Activity Summary Modal */}
      <StravaActivityModal
        isOpen={stravaModalOpen}
        onClose={() => setStravaModalOpen(false)}
        stats={stravaRecorder.stats}
        activityName={stravaRecorder.activityName}
        sportType={stravaRecorder.sportType}
        onChangeSportType={stravaRecorder.setSportType}
        onResetRecording={stravaRecorder.resetRecording}
        isRecording={stravaRecorder.isRecording}
        onDownloadGpx={stravaRecorder.downloadGpx}
        theme={theme}
      />
    </div>
  );
}
