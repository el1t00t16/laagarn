import React, { useEffect, useState } from 'react';
import {
  ComputedRoute,
  LatLngPoint,
  TravelMode,
  validateRouteInputs,
} from '../utils/routingEngine';
import { resolveLocationInput } from '../utils/travelData';
import {
  GpsPositionState,
  rememberPlace,
  searchPhilippinePlaces,
} from '../utils/gpsAndGeocoding';
import { MapClickAction } from './LeafletMapView';
import {
  downloadGpxFile,
  parseGpxFile,
} from '../utils/gpxHandler';
import {
  Download,
  Upload,
  CheckCircle2,
  Activity,
  Share2,
  ArrowUpDown,
  Crosshair,
  MapPin,
  Flag,
  Plus,
  X,
  Navigation,
  Play,
  Pause,
  Trash2,
  ChevronDown,
  ChevronUp,
  Car,
  Bus,
  Bike,
  Footprints,
  Zap,
} from 'lucide-react';

interface RoutePlannerPanelProps {
  stops: LatLngPoint[];
  travelMode: TravelMode;
  routes: ComputedRoute[];
  routeLoading: boolean;
  activeRouteIndex: number;
  gpsState: GpsPositionState | null;
  gpsLoading: boolean;
  gpsError: string | null;
  gpsWatchActive: boolean;
  onLocateUserGps: (setAsOrigin?: boolean) => void;
  onToggleGpsWatch: () => void;
  onPickOnMap: (action: MapClickAction) => void;
  mapClickAction: MapClickAction;
  onSelectRouteIndex: (idx: number) => void;
  onChangeTravelMode: (mode: TravelMode) => void;
  onApplyStops: (newStops: LatLngPoint[]) => void;
  onClearRoute: () => void;
  onFocusCoordinate: (lat: number, lng: number, zoom?: number) => void;
  onStartNavigation: () => void;
  onStartSimulation?: () => void;
  isSimulating?: boolean;
  onOpenStravaModal?: () => void;
  stravaRecordingActive?: boolean;
  stravaPointsCount?: number;
  isConvoySharing?: boolean;
  convoyRoomCode?: string | null;
  onShareRouteToConvoy?: () => void;
}

export const RoutePlannerPanel: React.FC<RoutePlannerPanelProps> = ({
  stops,
  travelMode,
  routes,
  routeLoading,
  activeRouteIndex,
  gpsState,
  gpsLoading,
  gpsError,
  gpsWatchActive,
  onLocateUserGps,
  onToggleGpsWatch,
  onPickOnMap,
  mapClickAction,
  onSelectRouteIndex,
  onChangeTravelMode,
  onApplyStops,
  onClearRoute,
  onFocusCoordinate,
  onStartNavigation,
  onStartSimulation,
  isSimulating = false,
  onOpenStravaModal,
  stravaRecordingActive = false,
  stravaPointsCount = 0,
  isConvoySharing = false,
  convoyRoomCode = null,
  onShareRouteToConvoy,
}) => {
  const [originInput, setOriginInput] = useState<string>(stops[0]?.name || '');
  const [destInput, setDestInput] = useState<string>(
    stops.length >= 2 ? stops[stops.length - 1].name : ''
  );
  const [waypointInputs, setWaypointInputs] = useState<string[]>(
    stops.length > 2 ? stops.slice(1, -1).map((s) => s.name) : []
  );

  const [originPoint, setOriginPoint] = useState<LatLngPoint | null>(
    stops[0] || null
  );
  const [destPoint, setDestPoint] = useState<LatLngPoint | null>(
    stops.length >= 2 ? stops[stops.length - 1] : null
  );

  const [originSuggestions, setOriginSuggestions] = useState<LatLngPoint[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<LatLngPoint[]>([]);
  const [searchingOrigin, setSearchingOrigin] = useState<boolean>(false);
  const [searchingDest, setSearchingDest] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [gpxSuccessMessage, setGpxSuccessMessage] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState<boolean>(true);
  const [motorcycleAvoidTolls, setMotorcycleAvoidTolls] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('laagarn_avoid_tolls') === 'true';
    }
    return false;
  });
  const gpxInputRef = React.useRef<HTMLInputElement | null>(null);

  const activeRoute = routes[activeRouteIndex] || routes[0];

  const handleToggleMotorcycleAvoidTolls = () => {
    setMotorcycleAvoidTolls((prev) => {
      const next = !prev;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('laagarn_avoid_tolls', String(next));
      }
      return next;
    });
  };

  const handleGpxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error('File is empty.');
        const parsed = parseGpxFile(text);
        if (parsed.stops.length < 2) {
          throw new Error('GPX route requires at least 2 points (origin & destination).');
        }
        onApplyStops(parsed.stops);
        setGpxSuccessMessage(`Imported ${parsed.stops.length} points from ${file.name}`);
        setTimeout(() => setGpxSuccessMessage(null), 4000);
      } catch (err: any) {
        setValidationError(err?.message || 'Failed to parse GPX route.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportGpx = () => {
    if (!activeRoute) return;
    downloadGpxFile(activeRoute, stops);
    setGpxSuccessMessage(`Exported ${(activeRoute.label || 'route').toLowerCase()}.gpx!`);
    setTimeout(() => setGpxSuccessMessage(null), 3500);
  };

  useEffect(() => {
    if (stops.length >= 1) {
      setOriginInput(stops[0].name);
      setOriginPoint(stops[0]);
    } else {
      setOriginInput('');
      setOriginPoint(null);
    }

    if (stops.length >= 2) {
      setDestInput(stops[stops.length - 1].name);
      setDestPoint(stops[stops.length - 1]);
      setWaypointInputs(stops.slice(1, -1).map((s) => s.name));
    } else {
      setDestInput('');
      setDestPoint(null);
      setWaypointInputs([]);
    }
  }, [stops]);

  useEffect(() => {
    const q = originInput.trim();
    if (q.length < 2 || (originPoint && originPoint.name === q)) {
      setOriginSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingOrigin(true);
      const results = await searchPhilippinePlaces(q);
      setOriginSuggestions(results.slice(0, 5));
      setSearchingOrigin(false);
    }, 260);
    return () => clearTimeout(timer);
  }, [originInput, originPoint]);

  useEffect(() => {
    const q = destInput.trim();
    if (q.length < 2 || (destPoint && destPoint.name === q)) {
      setDestSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingDest(true);
      const results = await searchPhilippinePlaces(q);
      setDestSuggestions(results.slice(0, 5));
      setSearchingDest(false);
    }, 260);
    return () => clearTimeout(timer);
  }, [destInput, destPoint]);

  const handleSwapEndpoints = () => {
    setValidationError(null);
    const nextOriginText = destInput;
    const nextDestText = originInput;
    const nextOriginPt = destPoint;
    const nextDestPt = originPoint;
    const reversedWaypoints = [...waypointInputs].reverse();

    setOriginInput(nextOriginText);
    setDestInput(nextDestText);
    setOriginPoint(nextOriginPt);
    setDestPoint(nextDestPt);
    setWaypointInputs(reversedWaypoints);

    if (stops.length >= 2) {
      onApplyStops([...stops].reverse());
    }
  };

  const handleAddWaypointField = () => {
    if (waypointInputs.length >= 3) return;
    setWaypointInputs([...waypointInputs, '']);
  };

  const handleRemoveWaypointField = (idx: number) => {
    const updated = waypointInputs.filter((_, i) => i !== idx);
    setWaypointInputs(updated);
  };

  const handleWaypointChange = (idx: number, val: string) => {
    const updated = [...waypointInputs];
    updated[idx] = val;
    setWaypointInputs(updated);
  };

  const resolveInputToLatLng = async (
    text: string,
    cachedPoint: LatLngPoint | null
  ): Promise<LatLngPoint> => {
    const clean = text.trim();
    if (cachedPoint && cachedPoint.name.toLowerCase() === clean.toLowerCase()) {
      return cachedPoint;
    }
    const liveMatches = await searchPhilippinePlaces(clean);
    if (liveMatches.length > 0) {
      return liveMatches[0];
    }
    const resolved = resolveLocationInput(clean);
    if (resolved) {
      return resolved;
    }
    throw new Error(
      `Location "${clean}" could not be recognized. Tap a suggested place or use Pick on Map.`
    );
  };

  const handleSubmitRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const prelimCheck = validateRouteInputs(originInput, destInput);
    if (!prelimCheck.valid) {
      setValidationError(
        prelimCheck.error || 'Please enter both Departure and Destination.'
      );
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    try {
      const resolvedOrigin = await resolveInputToLatLng(originInput, originPoint);
      const resolvedWaypoints: LatLngPoint[] = [];
      for (const wp of waypointInputs) {
        if (wp.trim().length > 0) {
          const rWp = await resolveInputToLatLng(wp, null);
          resolvedWaypoints.push(rWp);
          rememberPlace(rWp);
        }
      }
      const resolvedDest = await resolveInputToLatLng(destInput, destPoint);

      const allStops = [resolvedOrigin, ...resolvedWaypoints, resolvedDest];
      const finalCheck = validateRouteInputs(originInput, destInput, allStops);
      if (!finalCheck.valid) {
        setValidationError(
          finalCheck.error || 'Departure and Destination are identical.'
        );
        return;
      }

      rememberPlace(resolvedOrigin);
      rememberPlace(resolvedDest);
      setOriginPoint(resolvedOrigin);
      setDestPoint(resolvedDest);
      setOriginSuggestions([]);
      setDestSuggestions([]);
      onApplyStops(allStops);
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to locate points.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <input
        ref={gpxInputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        className="hidden"
        onChange={handleGpxUpload}
      />

      {/* 1. Travel Mode Segmented Control */}
      <div
        role="group"
        aria-label="Travel mode selection"
        className="mode-selector !mb-0"
      >
        {(
          [
            { id: 'driving', label: 'Drive', icon: Car },
            { id: 'transit', label: 'Transit', icon: Bus },
            { id: 'cycling', label: 'Cycle', icon: Bike },
            { id: 'walking', label: 'Walk', icon: Footprints },
          ] as { id: TravelMode; label: string; icon: React.ComponentType<{ className?: string }> }[]
        ).map((item) => {
          const active = travelMode === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTravelMode(item.id)}
              className={`flex items-center justify-center gap-1.5 ${active ? 'active' : ''}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Horizontal Touch Quick-Action Chip Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
        <button
          type="button"
          onClick={() => onLocateUserGps(true)}
          disabled={gpsLoading}
          className="min-h-[36px] px-3 rounded-full bg-purple-500/15 border border-purple-500/35 text-[var(--accent)] mono text-[11px] font-bold flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform cursor-pointer"
        >
          <Crosshair className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
          <span>{gpsLoading ? 'Locating…' : 'My GPS'}</span>
        </button>

        <button
          type="button"
          onClick={() =>
            onPickOnMap(mapClickAction === 'destination' ? 'none' : 'destination')
          }
          className={`min-h-[36px] px-3 rounded-full border mono text-[11px] font-bold flex items-center gap-1.5 shrink-0 active:scale-95 transition-all cursor-pointer ${
            mapClickAction === 'destination'
              ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-md'
              : 'bg-[var(--surface)] border-[var(--border)] text-[var(--ink)]'
          }`}
        >
          <Flag className="w-3.5 h-3.5 text-emerald-400" />
          <span>{mapClickAction === 'destination' ? 'Tap Map…' : 'Pick Dest'}</span>
        </button>

        {waypointInputs.length < 3 && (
          <button
            type="button"
            onClick={handleAddWaypointField}
            className="min-h-[36px] px-3 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] mono text-[11px] font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-transform cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Add Stop</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => gpxInputRef.current?.click()}
          className="min-h-[36px] px-3 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] mono text-[11px] font-bold flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>GPX In</span>
        </button>

        {activeRoute && (
          <button
            type="button"
            onClick={handleExportGpx}
            className="min-h-[36px] px-3 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] mono text-[11px] font-bold flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Save GPX</span>
          </button>
        )}

        {stops.length > 0 && (
          <button
            type="button"
            onClick={onClearRoute}
            className="min-h-[36px] px-3 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 mono text-[11px] font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-transform cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* GPX Toast */}
      {gpxSuccessMessage && (
        <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl flex items-center gap-2 text-emerald-400 mono text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{gpxSuccessMessage}</span>
        </div>
      )}

      {/* Live GPS Lock Banner */}
      {(gpsState || gpsError) && (
        <div className="px-3 py-2.5 cockpit-subcard flex items-center justify-between gap-2">
          {gpsState ? (
            <>
              <div className="min-w-0 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <div className="min-w-0">
                  <div className="mono text-[10px] uppercase font-bold text-[var(--accent)] tabular-nums">
                    GPS Locked · ±{gpsState.accuracyMeters}m
                  </div>
                  <div className="text-xs font-semibold text-[var(--ink)] truncate">
                    {gpsState.addressLabel}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleGpsWatch}
                className={`min-h-[32px] px-2.5 rounded-xl mono text-[10px] uppercase font-bold border shrink-0 cursor-pointer transition-colors ${
                  gpsWatchActive
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                    : 'cockpit-pill'
                }`}
              >
                {gpsWatchActive ? 'Live On' : 'Track'}
              </button>
            </>
          ) : (
            <div className="mono text-[11px] text-rose-500 font-medium leading-snug">
              {gpsError}
            </div>
          )}
        </div>
      )}

      {/* 3. Connected Origin -> Waypoints -> Destination Mobile Route Card */}
      <form onSubmit={handleSubmitRoute} noValidate className="space-y-3">
        <div className="relative p-3 cockpit-card">
          <div className="flex items-stretch gap-2.5">
            {/* Left Route Timeline Rail */}
            <div className="flex flex-col items-center py-3.5 shrink-0 w-4">
              <span className="w-3 h-3 rounded-full bg-[var(--accent)] ring-4 ring-purple-500/20 shrink-0" />
              <div className="flex-1 w-0.5 border-l-2 border-dashed border-purple-500/35 my-1" />
              {waypointInputs.map((_, idx) => (
                <React.Fragment key={`dot-${idx}`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-white shrink-0" />
                  <div className="flex-1 w-0.5 border-l-2 border-dashed border-purple-500/35 my-1" />
                </React.Fragment>
              ))}
              <span className="w-3 h-3 rounded-sm rotate-45 bg-emerald-400 ring-4 ring-emerald-500/20 shrink-0" />
            </div>

            {/* Center Stacked Inputs */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Origin Input Row */}
              <div>
                <div className="relative flex items-center">
                  <input
                    id="origin-location-input"
                    type="text"
                    value={originInput}
                    onChange={(e) => {
                      setOriginInput(e.target.value);
                      setOriginPoint(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLElement).blur();
                      }
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Departure Point"
                    placeholder="Starting point or tap My GPS…"
                    className="editorial-input !pr-16"
                  />
                  <div className="absolute right-1.5 flex items-center gap-0.5">
                    {originInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setOriginInput('');
                          setOriginPoint(null);
                          setOriginSuggestions([]);
                        }}
                        aria-label="Clear origin"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onPickOnMap(mapClickAction === 'origin' ? 'none' : 'origin')
                      }
                      title="Pick Origin on Map"
                      aria-label="Pick Origin on Map"
                      className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                        mapClickAction === 'origin'
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--accent)] hover:bg-purple-500/15'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {searchingOrigin && (
                  <div className="mono text-[10px] text-[var(--ink-dim)] mt-1 px-1">
                    Searching Philippines…
                  </div>
                )}
                {originSuggestions.length > 0 && (
                  <div className="mt-1.5 bg-[var(--bg)] border border-[var(--border)] divide-y divide-[var(--border-subtle)] rounded-2xl max-h-44 overflow-y-auto z-30 shadow-xl">
                    {originSuggestions.map((sug, sIdx) => (
                      <button
                        key={`${sug.name}-${sIdx}`}
                        type="button"
                        onClick={() => {
                          if (document.activeElement instanceof HTMLElement) {
                            document.activeElement.blur();
                          }
                          setOriginInput(sug.name);
                          setOriginPoint(sug);
                          setOriginSuggestions([]);
                          onFocusCoordinate(sug.lat, sug.lng, 14);
                        }}
                        className="w-full min-h-[44px] text-left px-3.5 py-2 active:bg-[var(--accent)]/20 hover:bg-[var(--accent)]/10 transition-colors block cursor-pointer"
                      >
                        <div className="text-xs font-bold text-[var(--ink)] truncate">
                          {sug.name}
                        </div>
                        <div className="mono text-[10px] text-[var(--ink-dim)] truncate">
                          {sug.region}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Intermediate Waypoint Rows */}
              {waypointInputs.map((wp, idx) => (
                <div key={`wp-${idx}`} className="relative flex items-center">
                  <input
                    id={`waypoint-input-${idx}`}
                    type="text"
                    value={wp}
                    onChange={(e) => handleWaypointChange(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLElement).blur();
                      }
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label={`Stop ${idx + 1}`}
                    placeholder={`Stop ${idx + 1} along route…`}
                    className="editorial-input !pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveWaypointField(idx)}
                    aria-label={`Remove stop ${idx + 1}`}
                    className="absolute right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Destination Input Row */}
              <div>
                <div className="relative flex items-center">
                  <input
                    id="destination-location-input"
                    type="text"
                    value={destInput}
                    onChange={(e) => {
                      setDestInput(e.target.value);
                      setDestPoint(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLElement).blur();
                      }
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Destination"
                    placeholder="Where to? Search city, landmark…"
                    className="editorial-input !pr-16"
                  />
                  <div className="absolute right-1.5 flex items-center gap-0.5">
                    {destInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setDestInput('');
                          setDestPoint(null);
                          setDestSuggestions([]);
                        }}
                        aria-label="Clear destination"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onPickOnMap(
                          mapClickAction === 'destination' ? 'none' : 'destination'
                        )
                      }
                      title="Pick Destination on Map"
                      aria-label="Pick Destination on Map"
                      className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                        mapClickAction === 'destination'
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-emerald-400 hover:bg-emerald-500/15'
                      }`}
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {searchingDest && (
                  <div className="mono text-[10px] text-[var(--ink-dim)] mt-1 px-1">
                    Searching Philippines…
                  </div>
                )}
                {destSuggestions.length > 0 && (
                  <div className="mt-1.5 bg-[var(--bg)] border border-[var(--border)] divide-y divide-[var(--border-subtle)] rounded-2xl max-h-44 overflow-y-auto z-30 shadow-xl">
                    {destSuggestions.map((sug, sIdx) => (
                      <button
                        key={`${sug.name}-${sIdx}`}
                        type="button"
                        onClick={() => {
                          if (document.activeElement instanceof HTMLElement) {
                            document.activeElement.blur();
                          }
                          setDestInput(sug.name);
                          setDestPoint(sug);
                          setDestSuggestions([]);
                          onFocusCoordinate(sug.lat, sug.lng, 14);
                        }}
                        className="w-full min-h-[44px] text-left px-3.5 py-2 active:bg-[var(--accent)]/20 hover:bg-[var(--accent)]/10 transition-colors block cursor-pointer"
                      >
                        <div className="text-xs font-bold text-[var(--ink)] truncate">
                          {sug.name}
                        </div>
                        <div className="mono text-[10px] text-[var(--ink-dim)] truncate">
                          {sug.region}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Swap Endpoints Button */}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={handleSwapEndpoints}
                title="Swap Origin & Destination"
                aria-label="Swap Origin and Destination"
                className="w-9 h-9 rounded-full bg-purple-500/15 border border-purple-500/30 text-[var(--accent)] flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Sub-400cc Tollway Avoidance Compact Row */}
        <div className="px-3 py-2 cockpit-subcard flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-purple-500/12 border border-purple-500/25 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Bike className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--ink)] truncate">
                Sub-400cc Tollway Bypass
              </div>
              <div className="text-[10.5px] text-[var(--ink-dim)] truncate">
                {motorcycleAvoidTolls
                  ? 'Avoids SLEX, NLEX, Skyway & expressways'
                  : 'Expressways & toll roads allowed'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleMotorcycleAvoidTolls}
            aria-pressed={motorcycleAvoidTolls}
            className={`min-h-[32px] px-3 text-[10px] mono font-bold rounded-xl border transition-all shrink-0 cursor-pointer ${
              motorcycleAvoidTolls
                ? 'bg-[var(--accent)] text-white border-purple-400/60 shadow-sm shadow-purple-500/30'
                : 'cockpit-pill text-[var(--ink-dim)]'
            }`}
          >
            {motorcycleAvoidTolls ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Popular Philippine Corridors */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {[
            {
              label: 'Malungon → Digos',
              origin: { name: 'Malungon Municipal Hall', region: 'Malungon, Sarangani', lat: 6.2575, lng: 125.2633 },
              dest: { name: 'Digos City Rizal Park', region: 'Digos City, Davao del Sur', lat: 6.7570, lng: 125.3564 },
            },
            {
              label: 'Davao → GenSan',
              origin: { name: 'Davao People’s Park', region: 'Davao City, Davao del Sur', lat: 7.0707, lng: 125.6114 },
              dest: { name: 'General Santos Oval Plaza', region: 'General Santos, South Cotabato', lat: 6.1128, lng: 125.1717 },
            },
            {
              label: 'Manila → Baguio',
              origin: { name: 'Manila Rizal Park (Luneta)', region: 'City of Manila, NCR', lat: 14.5826, lng: 120.9787 },
              dest: { name: 'Baguio Burnham Park', region: 'Baguio City, Benguet', lat: 16.4124, lng: 120.5929 },
            },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setOriginInput(preset.origin.name);
                setDestInput(preset.dest.name);
                setOriginPoint(preset.origin);
                setDestPoint(preset.dest);
                setWaypointInputs([]);
                setValidationError(null);
                onApplyStops([preset.origin, preset.dest]);
              }}
              className="min-h-[34px] px-3 cockpit-pill active:bg-purple-500/20 rounded-xl text-[11px] font-semibold shrink-0 cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {validationError && (
          <div
            role="alert"
            className="p-3 border border-purple-500/45 bg-purple-500/10 text-[11px] font-medium text-[var(--accent)] rounded-2xl"
          >
            {validationError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || routeLoading}
          className="btn-primary !mt-1"
        >
          {submitting || routeLoading ? 'Finding Best Route…' : 'Find Best Route'}
        </button>
      </form>

      {/* 4. Computed Routes + Immediate 1-Tap Start Navigation & Simulate CTAs */}
      {activeRoute && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between px-0.5">
            <span className="section-label mono !mb-0">Route Options</span>
            <span className="mono text-[10px] text-emerald-400 font-bold">
              {activeRoute.steps.length} maneuvers
            </span>
          </div>

          <div className="space-y-2">
            {routes.map((rt, idx) => {
              const isSelected = idx === activeRouteIndex;
              return (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => onSelectRouteIndex(idx)}
                  className={`w-full text-left route-card !mb-0 ${
                    isSelected ? 'active' : ''
                  }`}
                >
                  <div className="route-card-header">
                    <span className="route-title inline-flex items-center gap-1.5">
                      {idx === 0 ? (
                        <>
                          <Zap className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                          <span>Fastest Route</span>
                        </>
                      ) : (
                        rt.label
                      )}
                    </span>
                    <span className="route-time mono">
                      {rt.totalDurationMinutes} min
                    </span>
                  </div>
                  <div className="route-meta mono">
                    {rt.totalDistanceKm} KM ·{' '}
                    <span
                      style={{
                        color:
                          rt.trafficDelayMinutes > 0
                            ? 'var(--accent)'
                            : '#34d399',
                      }}
                    >
                      {rt.trafficDelayMinutes > 0
                        ? `+${rt.trafficDelayMinutes}M TRAFFIC`
                        : 'CLEAR FLOW'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Primary Mobile Navigation Action Bar (Right above steps for zero-scroll 1-tap launch!) */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onStartNavigation}
              className="min-h-[48px] px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-xs uppercase tracking-[0.07em] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 cursor-pointer transition-all"
            >
              <Navigation className="w-4 h-4 fill-current" />
              <span>Start Ride</span>
            </button>

            {onStartSimulation && (
              <button
                type="button"
                onClick={onStartSimulation}
                className={`min-h-[48px] px-4 rounded-2xl font-bold text-xs uppercase tracking-[0.07em] flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] cursor-pointer transition-all text-white ${
                  isSimulating
                    ? 'bg-rose-600 shadow-rose-600/25'
                    : 'bg-gradient-to-r from-[#a855f7] to-[#7c3aed] shadow-purple-500/25'
                }`}
              >
                {isSimulating ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>Pause Sim</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Simulate</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Convoy Route Share Button */}
          {isConvoySharing && onShareRouteToConvoy && (
            <button
              type="button"
              onClick={onShareRouteToConvoy}
              className="w-full min-h-[42px] px-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 active:scale-[0.98] text-white mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Broadcast Route to Convoy {convoyRoomCode ? `(${convoyRoomCode})` : ''}</span>
            </button>
          )}
        </div>
      )}

      {/* 5. Strava Activity Quick Card */}
      {onOpenStravaModal && (
        <div className="p-3 rounded-2xl border border-[#fc5200]/30 bg-[#fc5200]/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                stravaRecordingActive ? 'bg-[#fc5200] animate-pulse' : 'bg-zinc-400'
              }`}
            />
            <div className="text-xs font-bold text-[#fc5200] mono uppercase flex items-center gap-1.5 truncate">
              <Activity className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Strava GPX {stravaPointsCount > 0 ? `(${stravaPointsCount} pts)` : 'Recorder'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenStravaModal}
            className="min-h-[34px] px-3 rounded-xl bg-[#fc5200] active:scale-95 text-white mono text-[10px] font-black uppercase cursor-pointer shrink-0 shadow-sm"
          >
            Open
          </button>
        </div>
      )}

      {/* 6. Collapsible Turn-by-Turn Maneuvers */}
      {activeRoute && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="w-full py-2 px-1 flex items-center justify-between cursor-pointer"
          >
            <span className="section-label mono !mb-0">
              Turn-by-Turn Steps ({activeRoute.steps.length})
            </span>
            {showSteps ? (
              <ChevronUp className="w-4 h-4 text-[var(--ink-dim)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--ink-dim)]" />
            )}
          </button>

          {showSteps && (
            <div className="manifest-list mt-1">
              {activeRoute.steps.map((step, sIdx) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onFocusCoordinate(step.lat, step.lng, 15)}
                  className="w-full text-left step block cursor-pointer group active:bg-purple-500/10 rounded-xl px-2 transition-colors"
                >
                  <span className="step-num mono">
                    {String(sIdx + 1).padStart(2, '0')}
                  </span>
                  <p className="step-text group-hover:text-[var(--accent)] transition-colors">
                    {step.instruction}
                  </p>
                  <p
                    className="step-meta mono"
                    style={{
                      color:
                        step.trafficStatus === 'heavy'
                          ? 'var(--accent)'
                          : undefined,
                    }}
                  >
                    {step.distanceKm > 0 ? `${step.distanceKm} KM · ` : ''}
                    {step.trafficStatus === 'heavy'
                      ? 'HEAVY TRAFFIC'
                      : step.trafficStatus === 'moderate'
                      ? 'MODERATE SLOWING'
                      : 'CLEAR FLOW'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
