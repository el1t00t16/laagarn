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

  const activeRoute = routes[activeRouteIndex] || routes[0];

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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onLocateUserGps(true)}
              disabled={gpsLoading}
              className="mono text-[0.6rem] uppercase tracking-[0.1em] text-[#ff4d00] hover:underline cursor-pointer"
            >
              {gpsLoading ? 'Locating...' : 'Use GPS'}
            </button>
            <button
              type="button"
              onClick={handleSwapEndpoints}
              className="mono text-[0.6rem] uppercase tracking-[0.1em] text-[rgba(242,242,242,0.5)] hover:text-[#f2f2f2] cursor-pointer"
            >
              Swap
            </button>
            {waypointInputs.length < 3 && (
              <button
                type="button"
                onClick={handleAddWaypointField}
                className="mono text-[0.6rem] uppercase tracking-[0.1em] text-[rgba(242,242,242,0.5)] hover:text-[#f2f2f2] cursor-pointer"
              >
                + Stop
              </button>
            )}
            {stops.length > 0 && (
              <button
                type="button"
                onClick={onClearRoute}
                className="mono text-[0.6rem] uppercase tracking-[0.1em] text-[rgba(242,242,242,0.5)] hover:text-[#ff4d00] cursor-pointer"
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
          className="mode-selector mb-5"
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

        {/* Live GPS Status Pill if active or error */}
        {(gpsState || gpsError) && (
          <div className="mb-4 p-3 bg-[#111113] border border-[rgba(242,242,242,0.1)]">
            {gpsState && (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="mono text-[0.55rem] uppercase tracking-[0.15em] text-[#ff4d00]">
                    Where Am I · GPS Locked (±{gpsState.accuracyMeters}m)
                  </div>
                  <div className="text-xs font-medium text-[#f2f2f2] truncate mt-0.5">
                    {gpsState.addressLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleGpsWatch}
                  className="mono text-[0.55rem] uppercase px-2 py-1 border border-[rgba(242,242,242,0.2)] text-[#f2f2f2] hover:border-[#ff4d00] shrink-0 cursor-pointer"
                >
                  {gpsWatchActive ? 'Tracking On' : 'Track'}
                </button>
              </div>
            )}
            {gpsError && (
              <div className="mono text-[0.6rem] text-[#ff4d00] leading-relaxed">
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
                className="mono text-[0.55rem] uppercase tracking-[0.1em] text-[rgba(242,242,242,0.5)] hover:text-[#ff4d00] cursor-pointer mb-1"
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
              placeholder="Search street, city, or click Use GPS..."
              className="editorial-input"
            />
            {searchingOrigin && (
              <div className="mono text-[0.55rem] text-[rgba(242,242,242,0.45)] mt-1">
                Searching Philippines...
              </div>
            )}
            {originSuggestions.length > 0 && (
              <div className="mt-1 bg-[#111113] border border-[rgba(242,242,242,0.2)] divide-y divide-[rgba(242,242,242,0.08)] max-h-40 overflow-y-auto z-30">
                {originSuggestions.map((sug, sIdx) => (
                  <button
                    key={`${sug.name}-${sIdx}`}
                    type="button"
                    onClick={() => {
                      setOriginInput(sug.name);
                      setOriginPoint(sug);
                      setOriginSuggestions([]);
                      onFocusCoordinate(sug.lat, sug.lng, 14);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[rgba(255,77,0,0.15)] transition-colors block cursor-pointer"
                  >
                    <div className="text-xs font-medium text-[#f2f2f2]">
                      {sug.name}
                    </div>
                    <div className="mono text-[0.55rem] text-[rgba(242,242,242,0.5)]">
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
                  className="mono text-[0.55rem] uppercase tracking-[0.1em] text-[#ff4d00] hover:underline cursor-pointer mb-1"
                >
                  Remove
                </button>
              </div>
              <input
                id={`waypoint-input-${idx}`}
                type="text"
                value={wp}
                onChange={(e) => handleWaypointChange(idx, e.target.value)}
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
                className="mono text-[0.55rem] uppercase tracking-[0.1em] text-[rgba(242,242,242,0.5)] hover:text-[#ff4d00] cursor-pointer mb-1"
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
              placeholder="Search destination in the Philippines..."
              className="editorial-input"
            />
            {searchingDest && (
              <div className="mono text-[0.55rem] text-[rgba(242,242,242,0.45)] mt-1">
                Searching Philippines...
              </div>
            )}
            {destSuggestions.length > 0 && (
              <div className="mt-1 bg-[#111113] border border-[rgba(242,242,242,0.2)] divide-y divide-[rgba(242,242,242,0.08)] max-h-40 overflow-y-auto z-30">
                {destSuggestions.map((sug, sIdx) => (
                  <button
                    key={`${sug.name}-${sIdx}`}
                    type="button"
                    onClick={() => {
                      setDestInput(sug.name);
                      setDestPoint(sug);
                      setDestSuggestions([]);
                      onFocusCoordinate(sug.lat, sug.lng, 14);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[rgba(255,77,0,0.15)] transition-colors block cursor-pointer"
                  >
                    <div className="text-xs font-medium text-[#f2f2f2]">
                      {sug.name}
                    </div>
                    <div className="mono text-[0.55rem] text-[rgba(242,242,242,0.5)]">
                      {sug.region}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Philippine Corridor Presets */}
          <div className="mb-4">
            <div className="mono text-[0.6rem] text-gray-400 mb-1.5 uppercase tracking-wider">
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
                  className="px-2 py-1 bg-[#141416] hover:bg-[#ff4d00]/15 border border-white/10 hover:border-[#ff4d00]/50 rounded text-[10px] mono text-gray-300 hover:text-white transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {validationError && (
            <div
              role="alert"
              className="mb-3 p-2.5 border border-[#ff4d00] bg-[rgba(255,77,0,0.08)] mono text-[0.62rem] text-[#ff4d00]"
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
                <p className="step-text group-hover:text-[#ff4d00] transition-colors">
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
            <p className="step-text text-[rgba(242,242,242,0.55)]">
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
              background: isSimulating ? '#dc2626' : '#ff4d00',
              color: '#ffffff',
            }}
          >
            {isSimulating ? '⏸ Pause Sim' : '▶ Simulate Drive'}
          </button>
        )}
      </div>
    </div>
  );
};
