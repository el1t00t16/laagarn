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
  exportRouteToGpx,
  parseGpxFile,
} from '../utils/gpxHandler';
import { Download, Upload, CheckCircle2, Activity, Share2 } from 'lucide-react';

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
    }, 280);
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
    }, 280);
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
      `Location "${clean}" could not be recognized. Try selecting a suggested Philippine place or tap 'Set on Map'.`
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
        prelimCheck.error || 'Please enter both Departure Point and Arrival Port.'
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
          finalCheck.error || 'Departure Point and Arrival Port are identical.'
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
    <div className="flex flex-col gap-10 min-h-full">
      {/* Section I: Journey Definition */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="section-label mono !mb-0">I. Journey Definition</span>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
            <input
              ref={gpxInputRef}
              type="file"
              accept=".gpx,application/gpx+xml"
              className="hidden"
              onChange={handleGpxUpload}
            />
            <button
              type="button"
              onClick={() => gpxInputRef.current?.click()}
              className="mono text-[0.62rem] uppercase tracking-[0.1em] text-[var(--accent)] font-bold hover:underline cursor-pointer flex items-center gap-1"
              title="Import GPX route file"
            >
              <Upload className="w-3 h-3" />
              <span>Import GPX</span>
            </button>
            {activeRoute && (
              <button
                type="button"
                onClick={handleExportGpx}
                className="mono text-[0.62rem] uppercase tracking-[0.1em] text-[var(--accent)] font-bold hover:underline cursor-pointer flex items-center gap-1"
                title="Export current route as GPX file"
              >
                <Download className="w-3 h-3" />
                <span>Export GPX</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onLocateUserGps(true)}
              disabled={gpsLoading}
              className="mono text-[0.62rem] uppercase tracking-[0.1em] text-[var(--accent)] font-bold hover:underline cursor-pointer"
            >
              {gpsLoading ? 'Locating...' : 'Use GPS'}
            </button>
            <button
              type="button"
              onClick={handleSwapEndpoints}
              className="mono text-[0.62rem] uppercase tracking-[0.1em] text-[var(--ink-dim)] font-bold hover:text-[var(--ink)] cursor-pointer"
            >
              Swap
            </button>
            {waypointInputs.length < 3 && (
              <button
                type="button"
                onClick={handleAddWaypointField}
                className="mono text-[0.62rem] uppercase tracking-[0.1em] text-[var(--ink-dim)] font-bold hover:text-[var(--ink)] cursor-pointer"
              >
                + Stop
              </button>
            )}
            {stops.length > 0 && (
              <button
                type="button"
                onClick={onClearRoute}
                className="mono text-[0.62rem] uppercase tracking-[0.1em] text-[var(--ink-dim)] font-bold hover:text-[var(--accent)] cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Mode Selector (.mode-selector from Variation 2) */}
        <div
          role="group"
          aria-label="Travel mode selection"
          className="mode-selector mb-3"
        >
          {(
            [
              { id: 'driving', label: 'Drive' },
              { id: 'transit', label: 'Transit' },
              { id: 'cycling', label: 'Cycle' },
              { id: 'walking', label: 'Walk' },
            ] as { id: TravelMode; label: string }[]
          ).map((item) => {
            const active = travelMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTravelMode(item.id)}
                className={active ? 'active' : ''}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Motorcycle Sub-400cc / Tollway Avoidance Toggle */}
        <div className="mb-4 p-2.5 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">🏍️</span>
            <div className="min-w-0">
              <div className="mono text-[0.62rem] uppercase tracking-wider font-bold text-[var(--ink)] truncate">
                Sub-400cc Expressway Avoidance
              </div>
              <div className="text-[10px] text-[var(--ink-dim)] truncate">
                {motorcycleAvoidTolls
                  ? 'Bypasses tollways (SLEX, NLEX, Skyway) via National Highway'
                  : 'Allows restricted Philippine expressways & tollways'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleMotorcycleAvoidTolls}
            className={`px-2.5 py-1 text-[10px] mono font-bold rounded-lg border transition-all shrink-0 cursor-pointer ${
              motorcycleAvoidTolls
                ? 'bg-purple-600 text-white border-purple-400 shadow-sm shadow-purple-500/30'
                : 'bg-[var(--surface)] text-[var(--ink-dim)] border-[var(--border)] hover:border-[var(--accent)]'
            }`}
          >
            {motorcycleAvoidTolls ? 'ACTIVE' : 'OFF'}
          </button>
        </div>

        {/* GPX Notification Toast */}
        {gpxSuccessMessage && (
          <div className="mb-4 p-2.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl flex items-center gap-2 text-emerald-300 mono text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{gpxSuccessMessage}</span>
          </div>
        )}

        {/* Live GPS Status Pill if active or error */}
        {(gpsState || gpsError) && (
          <div className="mb-4 p-3 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl shadow-sm">
            {gpsState && (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="mono text-[0.6rem] uppercase tracking-[0.15em] text-[var(--accent)] font-bold">
                    Where Am I · GPS Locked (±{gpsState.accuracyMeters}m)
                  </div>
                  <div className="text-xs font-semibold text-[var(--ink)] truncate mt-0.5">
                    {gpsState.addressLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleGpsWatch}
                  className="mono text-[0.55rem] uppercase px-2.5 py-1 border border-[var(--border)] text-[var(--ink)] hover:border-[var(--accent)] font-bold rounded-lg shrink-0 cursor-pointer bg-[var(--surface)]"
                >
                  {gpsWatchActive ? 'Tracking On' : 'Track'}
                </button>
              </div>
            )}
            {gpsError && (
              <div className="mono text-[0.6rem] text-red-500 font-medium leading-relaxed">
                {gpsError}
              </div>
            )}
          </div>
        )}

        {/* Variation 2 Underline Inputs Form (.input-group + .editorial-input) */}
        <form onSubmit={handleSubmitRoute} noValidate>
          <div className="input-group">
            <div className="flex items-center justify-between">
              <label htmlFor="origin-location-input" className="mono">
                Departure Point (Where Am I?)
              </label>
              <button
                type="button"
                onClick={() =>
                  onPickOnMap(mapClickAction === 'origin' ? 'none' : 'origin')
                }
                className="mono text-[0.58rem] uppercase tracking-[0.1em] text-[var(--ink-dim)] font-bold hover:text-[var(--accent)] cursor-pointer mb-1"
              >
                {mapClickAction === 'origin' ? 'Click Map...' : 'Set on Map'}
              </button>
            </div>
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
              placeholder="Search street, city, or click Use GPS..."
              className="editorial-input"
            />
            {searchingOrigin && (
              <div className="mono text-[0.55rem] text-[var(--ink-dim)] mt-1 font-medium">
                Searching Philippines...
              </div>
            )}
            {originSuggestions.length > 0 && (
              <div className="mt-1 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] divide-y divide-[var(--border-subtle)] rounded-xl max-h-40 overflow-y-auto z-30 shadow-lg">
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
                    className="w-full text-left px-3 py-2 hover:bg-[var(--accent)]/15 transition-colors block cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-[var(--ink)]">
                      {sug.name}
                    </div>
                    <div className="mono text-[0.55rem] text-[var(--ink-dim)]">
                      {sug.region}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {waypointInputs.map((wp, idx) => (
            <div key={`wp-${idx}`} className="input-group">
              <div className="flex items-center justify-between">
                <label htmlFor={`waypoint-input-${idx}`} className="mono">
                  Intermediate
                </label>
                <button
                  type="button"
                  onClick={() => handleRemoveWaypointField(idx)}
                  className="mono text-[0.58rem] uppercase tracking-[0.1em] text-[var(--accent)] font-bold hover:underline cursor-pointer mb-1"
                >
                  Remove
                </button>
              </div>
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
                placeholder="Intermediate Philippine stop..."
                className="editorial-input"
              />
            </div>
          ))}

          <div className="input-group">
            <div className="flex items-center justify-between">
              <label htmlFor="destination-location-input" className="mono">
                Arrival Port (Where To Go?)
              </label>
              <button
                type="button"
                onClick={() =>
                  onPickOnMap(
                    mapClickAction === 'destination' ? 'none' : 'destination'
                  )
                }
                className="mono text-[0.58rem] uppercase tracking-[0.1em] text-[var(--ink-dim)] font-bold hover:text-[var(--accent)] cursor-pointer mb-1"
              >
                {mapClickAction === 'destination' ? 'Click Map...' : 'Set on Map'}
              </button>
            </div>
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
              placeholder="Search destination in the Philippines..."
              className="editorial-input"
            />
            {searchingDest && (
              <div className="mono text-[0.55rem] text-[var(--ink-dim)] mt-1 font-medium">
                Searching Philippines...
              </div>
            )}
            {destSuggestions.length > 0 && (
              <div className="mt-1 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] divide-y divide-[var(--border-subtle)] rounded-xl max-h-40 overflow-y-auto z-30 shadow-lg">
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
                    className="w-full text-left px-3 py-2 hover:bg-[var(--accent)]/15 transition-colors block cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-[var(--ink)]">
                      {sug.name}
                    </div>
                    <div className="mono text-[0.55rem] text-[var(--ink-dim)]">
                      {sug.region}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Philippine Corridor Presets */}
          <div className="mb-4">
            <div className="mono text-[0.65rem] font-bold text-[var(--ink-dim)] mb-2 uppercase tracking-wider">
              Popular Routes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                {
                  label: 'Malungon ➔ Digos',
                  origin: { name: 'Malungon Municipal Hall', region: 'Malungon, Sarangani', lat: 6.2575, lng: 125.2633 },
                  dest: { name: 'Digos City Rizal Park', region: 'Digos City, Davao del Sur', lat: 6.7570, lng: 125.3564 },
                },
                {
                  label: 'Davao ➔ GenSan',
                  origin: { name: 'Davao People’s Park', region: 'Davao City, Davao del Sur', lat: 7.0707, lng: 125.6114 },
                  dest: { name: 'General Santos Oval Plaza', region: 'General Santos, South Cotabato', lat: 6.1128, lng: 125.1717 },
                },
                {
                  label: 'Manila ➔ Baguio',
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
                  className="px-2.5 py-1.5 bg-[var(--surface)] hover:bg-[var(--accent)]/15 border border-[var(--border)] hover:border-[var(--accent)] rounded-lg text-[11px] mono font-bold text-[var(--ink)] transition-colors cursor-pointer shadow-sm"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {validationError && (
            <div
              role="alert"
              className="mb-3 p-2.5 border border-[#a855f7] bg-[rgba(168,85,247,0.12)] mono text-[0.62rem] text-[#c084fc] rounded-lg"
            >
              {validationError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || routeLoading}
            className="btn-primary display"
          >
            {submitting || routeLoading
              ? 'Calculating Corridor...'
              : 'Calculate Corridor'}
          </button>
        </form>
      </div>

      {/* Section II: Preferred Route */}
      <div>
        <span className="section-label mono">II. Preferred Route</span>
        {activeRoute ? (
          <div>
            {routes.map((rt, idx) => {
              const isSelected = idx === activeRouteIndex;
              return (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => onSelectRouteIndex(idx)}
                  className={`w-full text-left route-card ${
                    isSelected ? 'active' : ''
                  }`}
                >
                  <div className="route-card-header">
                    <span className="route-title">
                      {idx === 0 ? 'Fastest Path' : rt.label}
                    </span>
                    <span className="route-time mono">
                      {rt.totalDurationMinutes}m
                    </span>
                  </div>
                  <div className="route-meta mono">
                    {rt.totalDistanceKm} KM ·{' '}
                    <span
                      style={{
                        color:
                          rt.trafficDelayMinutes > 0
                            ? 'var(--accent)'
                            : undefined,
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
        ) : (
          <div className="route-card cursor-default">
            <div className="route-meta mono leading-relaxed">
              Enter your Departure Point (or click Use GPS) and Arrival Port to
              compute Philippine street corridors.
            </div>
          </div>
        )}
      </div>

      {/* Section III: Manifest */}
      <div className="flex-grow">
        <span className="section-label mono">III. Manifest</span>
        {activeRoute ? (
          <div className="manifest-list">
            {activeRoute.steps.map((step, sIdx) => (
              <button
                key={step.id}
                type="button"
                onClick={() => onFocusCoordinate(step.lat, step.lng, 15)}
                className="w-full text-left step block cursor-pointer group"
              >
                <span className="step-num mono">
                  {String(sIdx + 1).padStart(2, '0')}
                </span>
                <p className="step-text group-hover:text-[#c084fc] transition-colors">
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
        ) : (
          <div className="step">
            <span className="step-num mono">01</span>
            <p className="step-text text-[var(--ink-dim)]">
              Turn-by-turn street maneuvers will appear here once a route is
              calculated.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Launch Navigation HUD & Drive Simulator Actions */}
      <div className="flex flex-col sm:flex-row gap-2 mt-2">
        <button
          type="button"
          disabled={!activeRoute}
          onClick={onStartNavigation}
          className="btn-primary display !mt-0 flex-1"
          style={{ background: 'var(--ink)', color: 'var(--bg)' }}
        >
          Launch Nav HUD
        </button>
        {onStartSimulation && (
          <button
            type="button"
            disabled={!activeRoute}
            onClick={onStartSimulation}
            className="btn-primary display !mt-0 flex-1 transition-all"
            style={{
              background: isSimulating ? '#dc2626' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
              color: '#ffffff',
            }}
          >
            {isSimulating ? '⏸ Pause Sim' : '▶ Simulate Drive'}
          </button>
        )}
      </div>

      {/* Convoy Route Sharing Action (when convoy is active) */}
      {isConvoySharing && onShareRouteToConvoy && activeRoute && (
        <button
          type="button"
          onClick={onShareRouteToConvoy}
          className="w-full mt-2 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:brightness-110 active:scale-98 text-white mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Share Route to Convoy {convoyRoomCode ? `(${convoyRoomCode})` : ''}</span>
        </button>
      )}

      {/* Strava Simulation Tracker Status */}
      {onOpenStravaModal && (
        <div className="mt-2.5 p-3 rounded-xl border border-[#fc5200]/30 bg-[#fc5200]/10 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                stravaRecordingActive ? 'bg-[#fc5200] animate-pulse' : 'bg-gray-400'
              }`}
            />
            <div className="text-xs font-bold text-[#fc5200] mono uppercase flex items-center gap-1.5 truncate">
              <Activity className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Strava GPX {stravaPointsCount > 0 ? `(${stravaPointsCount} pts)` : '(Sim / Live)'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenStravaModal}
            className="px-3 py-1.5 rounded-lg bg-[#fc5200] hover:bg-[#e04500] text-white mono text-[10px] font-black uppercase transition-colors cursor-pointer shrink-0 shadow-sm"
          >
            Strava Activity
          </button>
        </div>
      )}
    </div>
  );
};
