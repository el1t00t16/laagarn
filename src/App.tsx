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
import { useLiveGps } from './hooks/useLiveGps';
import { useDeviceCompass } from './hooks/useOrientation';
import { useWakeLock } from './hooks/useWakeLock';
import { useSpeechGuidance } from './hooks/useSpeechGuidance';
import { useRouteSimulation } from './hooks/useRouteSimulation';
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
} from 'lucide-react';

type ActiveTab = 'routes' | 'traffic' | 'weather' | 'offline';
type MobileSheetState = 'peek' | 'half' | 'full';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('laagarn_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'dark';
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('routes');
  const [mobileSheetState, setMobileSheetState] = useState<MobileSheetState>('half');

  // Synchronize theme with DOM root and PWA theme-color
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#f8f6fc');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
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

  // Traffic incidents state
  const [incidents, setIncidents] = useState<TrafficIncident[]>(INITIAL_TRAFFIC_INCIDENTS);
  const [showTrafficLayer, setShowTrafficLayer] = useState<boolean>(true);
  const [showWeatherLayer, setShowWeatherLayer] = useState<boolean>(true);

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
      const next = prev === 'dark' ? 'light' : 'dark';
      if (next === 'light' && mapStyle === 'dark') {
        setMapStyle('street');
      } else if (next === 'dark' && mapStyle === 'street') {
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

  const handleFocusCoordinate = (lat: number, lng: number, zoom = 14) => {
    setFocusedCoord({ lat, lng, zoom });
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

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden select-none font-sans transition-colors duration-200 ${
      theme === 'dark' ? 'bg-[#090410] text-[#f8f6fc]' : 'bg-[#f8f6fc] text-[#160a2c]'
    }`}>
      {/* Top Header / App Bar (Glassy Purple with mobile notch safe-area padding) */}
      <header className={`shrink-0 flex items-center justify-between px-4 sm:px-6 border-b transition-colors z-50 pt-[max(env(safe-area-inset-top,0px),0.75rem)] min-h-[calc(4rem+env(safe-area-inset-top,0px))] pb-2 shadow-lg backdrop-blur-xl ${
        theme === 'dark'
          ? 'bg-[#0d0717]/85 border-purple-500/20 text-[#f8f6fc] shadow-black/40'
          : 'bg-white/85 border-purple-300/40 text-[#160a2c] shadow-purple-900/5'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center text-white shadow-lg shadow-purple-500/35">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h1 className={`logo display text-base sm:text-lg font-black tracking-tight leading-none ${
              theme === 'dark' ? 'text-white' : 'text-[#160a2c]'
            }`}>
              LAAGARN
            </h1>
            <div className={`mono text-[9px] uppercase tracking-wider mt-0.5 ${
              theme === 'dark' ? 'text-purple-300/60' : 'text-purple-700/70'
            }`}>
              My Way, Your Travel Buddy.
            </div>
          </div>
        </div>

        {/* Desktop View Navigation */}
        <nav
          aria-label="Workspace Tabs"
          className="hidden lg:flex items-center gap-6"
        >
          {(
            [
              { id: 'routes', label: 'Planner' },
              { id: 'traffic', label: 'Traffic' },
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
                  ? theme === 'dark'
                    ? 'text-[#c084fc] border-b-2 border-[#a855f7] pb-1 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                    : 'text-[#7c3aed] border-b-2 border-[#9333ea] pb-1 drop-shadow-[0_0_8px_rgba(147,51,234,0.3)]'
                  : theme === 'dark'
                  ? 'text-gray-400 hover:text-white'
                  : 'text-purple-900/60 hover:text-purple-950'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right Header: Theme Toggle, Install PWA & Status Badges */}
        <div className="flex items-center gap-2">
          {/* Dark / Light Mode Toggle Button */}
          <button
            type="button"
            onClick={handleToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg border transition-all flex items-center gap-1.5 mono text-[10px] font-bold uppercase cursor-pointer ${
              theme === 'dark'
                ? 'bg-purple-950/40 border-purple-500/30 text-purple-200 hover:text-white hover:border-[#a855f7]'
                : 'bg-purple-100/80 border-purple-300/60 text-purple-900 hover:border-purple-500 shadow-sm'
            }`}
          >
            {theme === 'dark' ? (
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
              className="px-2.5 py-1 bg-gradient-to-r from-[#a855f7] to-[#9333ea] hover:from-[#c084fc] hover:to-[#a855f7] text-white mono text-[10px] font-bold uppercase flex items-center gap-1 shadow-lg shadow-purple-500/30 rounded cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

          {isOfflineMode ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 mono text-[10px] uppercase font-bold rounded">
              <WifiOff className="w-3 h-3" />
              <span>Offline</span>
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 border mono text-[10px] uppercase font-bold rounded ${
              theme === 'dark'
                ? 'bg-purple-950/40 border-purple-500/30 text-purple-300'
                : 'bg-purple-100/80 border-purple-300/60 text-purple-800'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="hidden sm:inline">Online</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Container: Split Desktop layout & Mobile Drawer layout */}
      <main className="flex-1 relative w-full h-[calc(100vh-4rem)] overflow-hidden flex flex-col lg:flex-row">
        {/* Desktop Sidebar (Left side, Glassy Purple) */}
        <aside
          aria-label="Travel Planning Controls"
          className={`hidden lg:flex flex-col w-[390px] shrink-0 backdrop-blur-2xl border-r p-6 overflow-y-auto transition-colors ${
            theme === 'dark'
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

          {activeTab === 'traffic' && (
            <TrafficPanel
              incidents={incidents}
              onToggleIncidentActive={handleToggleIncidentActive}
              onAddIncident={handleAddIncident}
              onFocusCoordinate={handleFocusCoordinate}
              activeRouteDelayMinutes={activeRoute?.trafficDelayMinutes || 0}
              gpsState={effectiveGps}
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
            theme === 'dark'
              ? 'bg-[#110820]/90 border-purple-500/25 shadow-[0_-12px_36px_rgba(5,2,14,0.85)]'
              : 'bg-white/95 border-purple-200/80 shadow-[0_-12px_36px_rgba(100,50,150,0.12)]'
          } ${
            mobileSheetState === 'peek'
              ? 'h-24'
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
              theme === 'dark' ? 'border-purple-500/15' : 'border-purple-200/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-8 h-1 rounded-full mx-auto ${
                theme === 'dark' ? 'bg-purple-400/40' : 'bg-purple-400/60'
              }`} />
              <span className={`mono text-[10px] uppercase tracking-wider ${
                theme === 'dark' ? 'text-purple-200/70' : 'text-purple-900/80 font-semibold'
              }`}>
                {activeTab === 'routes'
                  ? activeRoute
                    ? `${activeRoute.totalDurationMinutes}m · ${activeRoute.totalDistanceKm} km`
                    : 'Route Planner'
                  : activeTab === 'traffic'
                  ? `Traffic Alerts (${incidents.filter((i) => i.active).length})`
                  : activeTab === 'weather'
                  ? 'En-Route Weather'
                  : 'Offline Cache'}
              </span>
            </div>

            <button
              type="button"
              className={`p-1 hover:opacity-100 ${theme === 'dark' ? 'text-gray-400' : 'text-purple-900/60'}`}
              aria-label="Toggle Drawer Height"
            >
              {mobileSheetState === 'peek' ? (
                <ChevronUp className={`w-5 h-5 ${theme === 'dark' ? 'text-[#c084fc]' : 'text-[#7c3aed]'}`} />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Drawer Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
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

            {activeTab === 'traffic' && (
              <TrafficPanel
                incidents={incidents}
                onToggleIncidentActive={handleToggleIncidentActive}
                onAddIncident={handleAddIncident}
                onFocusCoordinate={(lat, lng, zoom) => {
                  handleFocusCoordinate(lat, lng, zoom);
                  setMobileSheetState('peek');
                }}
                activeRouteDelayMinutes={activeRoute?.trafficDelayMinutes || 0}
                gpsState={effectiveGps}
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

          {/* Mobile Bottom Navigation Bar (Thumb Accessible with safe-area padding) */}
          <div className={`min-h-[3.5rem] pb-[max(env(safe-area-inset-bottom,0px),0.25rem)] shrink-0 backdrop-blur-2xl border-t grid grid-cols-4 items-center ${
            theme === 'dark'
              ? 'bg-[#0a0414]/95 border-purple-500/20'
              : 'bg-white/95 border-purple-200/80 shadow-md'
          }`}>
            {(
              [
                { id: 'routes', label: 'Planner', icon: Navigation },
                { id: 'traffic', label: 'Traffic', icon: AlertTriangle },
                { id: 'weather', label: 'Weather', icon: CloudRain },
                { id: 'offline', label: 'Offline', icon: HardDriveDownload },
              ] as { id: ActiveTab; label: string; icon: any }[]
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
                  className={`h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                    isCurrent
                      ? theme === 'dark'
                        ? 'text-[#c084fc] drop-shadow-[0_0_8px_rgba(168,85,247,0.6)] font-bold'
                        : 'text-[#7c3aed] drop-shadow-[0_0_8px_rgba(147,51,234,0.4)] font-bold'
                      : theme === 'dark'
                      ? 'text-gray-400 hover:text-purple-200'
                      : 'text-purple-900/50 hover:text-purple-950'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="mono text-[10px] font-bold uppercase tracking-wider">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
