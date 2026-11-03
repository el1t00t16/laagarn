import React, { useState, useMemo } from 'react';
import { TrafficIncident, TrafficSeverity, LatLngPoint } from '../utils/routingEngine';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import {
  RIDER_HAZARD_PRESETS,
  RiderHazardType,
  createRiderReportedHazard,
} from '../utils/riderHazards';
import {
  TrafficLight,
  KNOWN_TRAFFIC_LIGHTS,
  searchTrafficLights,
  trafficLightToLatLngPoint,
} from '../utils/trafficLightData';
import {
  AlertTriangle,
  ShieldAlert,
  Mountain,
  Waves,
  Construction,
  AlertOctagon,
  CheckCircle2,
  Search,
  Navigation,
  Plus,
  Crosshair,
  Timer,
  Zap,
} from 'lucide-react';

interface TrafficPanelProps {
  incidents: TrafficIncident[];
  onToggleIncidentActive: (id: string) => void;
  onAddIncident: (incident: Omit<TrafficIncident, 'id' | 'updatedMinutesAgo'>) => void;
  onFocusCoordinate: (lat: number, lng: number, zoom?: number, label?: string) => void;
  activeRouteDelayMinutes: number;
  gpsState: GpsPositionState | null;
  trafficLights?: TrafficLight[];
  onSelectDestination?: (point: LatLngPoint) => void;
  onAddStop?: (point: LatLngPoint) => void;
}

export const TrafficPanel: React.FC<TrafficPanelProps> = ({
  incidents,
  onToggleIncidentActive,
  onAddIncident,
  onFocusCoordinate,
  activeRouteDelayMinutes,
  gpsState,
  trafficLights = KNOWN_TRAFFIC_LIGHTS,
  onSelectDestination,
  onAddStop,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'heavy' | 'lights' | 'roadwork'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showReportForm, setShowReportForm] = useState<boolean>(false);

  const [newTitle, setNewTitle] = useState<string>('');
  const [newCorridor, setNewCorridor] = useState<string>(
    gpsState ? gpsState.addressLabel : ''
  );
  const [newType, setNewType] = useState<TrafficIncident['type']>('congestion');
  const [newSeverity, setNewSeverity] = useState<TrafficSeverity>('moderate');
  const [newDelay, setNewDelay] = useState<string>('10');
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Compute heavy incidents count
  const heavyCount = useMemo(() => {
    return incidents.filter((i) => i.active && (i.severity === 'heavy' || i.severity === 'closure')).length;
  }, [incidents]);

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return incidents.filter((inc) => {
      if (filterType === 'heavy') {
        if (inc.severity !== 'heavy' && inc.severity !== 'closure') return false;
      } else if (filterType === 'roadwork') {
        if (inc.type !== 'roadwork') return false;
      }

      if (!q) return true;
      return (
        inc.title.toLowerCase().includes(q) ||
        inc.corridor.toLowerCase().includes(q) ||
        inc.description.toLowerCase().includes(q)
      );
    });
  }, [incidents, filterType, searchQuery]);

  // Filtered traffic lights
  const filteredTrafficLights = useMemo(() => {
    return searchTrafficLights(searchQuery.trim(), {
      nearLat: gpsState?.lat,
      nearLng: gpsState?.lng,
    });
  }, [searchQuery, gpsState?.lat, gpsState?.lng]);

  const activeCount = incidents.filter((i) => i.active).length;
  const averageCorridorSpeed =
    activeCount > 0
      ? Math.round(
          incidents
            .filter((i) => i.active)
            .reduce((acc, i) => acc + i.speedKmh, 0) / activeCount
        )
      : 60;

  const handleCreateReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setFormError('Please provide an incident description or title.');
      return;
    }
    if (!newCorridor.trim()) {
      setFormError('Please specify the highway or street corridor.');
      return;
    }
    const parsedDelay = Math.max(2, Math.min(90, parseInt(newDelay, 10) || 10));
    setFormError(null);

    onAddIncident({
      title: newTitle.trim(),
      corridor: newCorridor.trim(),
      type: newType,
      severity: newSeverity,
      lat: gpsState ? gpsState.lat : 14.5826,
      lng: gpsState ? gpsState.lng : 120.9787,
      delayMinutes: parsedDelay,
      speedKmh: newSeverity === 'heavy' ? 14 : newSeverity === 'moderate' ? 35 : 50,
      description: `Reported ${newType} along ${newCorridor.trim()}.`,
      active: true,
    });

    setNewTitle('');
    setShowReportForm(false);
  };

  const handleQuickDropHazard = (presetId: RiderHazardType) => {
    const lat = gpsState ? gpsState.lat : 14.5826;
    const lng = gpsState ? gpsState.lng : 120.9787;
    const corridor = gpsState ? gpsState.addressLabel : 'Philippine Corridor';
    const incident = createRiderReportedHazard(presetId, lat, lng, corridor);

    onAddIncident({
      title: incident.title,
      corridor: incident.corridor,
      type: incident.type,
      severity: incident.severity,
      lat: incident.lat,
      lng: incident.lng,
      delayMinutes: incident.delayMinutes,
      speedKmh: incident.speedKmh,
      description: incident.description,
      active: true,
    });

    const preset = RIDER_HAZARD_PRESETS.find((p) => p.id === presetId);
    setToastMessage(`Logged: ${preset?.label || 'Hazard'}!`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'AlertOctagon':
        return <AlertOctagon className="w-4 h-4 text-amber-400" />;
      case 'Mountain':
        return <Mountain className="w-4 h-4 text-rose-400" />;
      case 'Waves':
        return <Waves className="w-4 h-4 text-sky-400" />;
      case 'Construction':
        return <Construction className="w-4 h-4 text-yellow-400" />;
      case 'AlertTriangle':
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'ShieldAlert':
        return <ShieldAlert className="w-4 h-4 text-blue-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 min-h-full">
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="section-label mono !mb-0">I. Corridor & Signal Dispatch</span>
          <button
            type="button"
            onClick={() => setShowReportForm((v) => !v)}
            className="mono text-[0.6rem] uppercase tracking-[0.1em] text-[var(--accent)] hover:underline cursor-pointer"
          >
            {showReportForm ? 'Close' : '+ Log Incident'}
          </button>
        </div>

        {/* Dispatch Metrics Overview */}
        <div className="grid grid-cols-4 gap-2.5 p-3.5 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl shadow-xs">
          <div>
            <div className="route-meta mono text-[9px]">Alerts</div>
            <div className="text-lg display font-extrabold text-[var(--ink)] mt-0.5">
              {activeCount}
            </div>
          </div>
          <div>
            <div className="route-meta mono text-[9px] text-rose-500 font-bold">Heavy Bottlenecks</div>
            <div className="text-lg display font-extrabold text-rose-500 mt-0.5">
              {heavyCount}
            </div>
          </div>
          <div>
            <div className="route-meta mono text-[9px] text-emerald-500 font-bold">Traffic Lights</div>
            <div className="text-lg display font-extrabold text-emerald-500 mt-0.5">
              {trafficLights.length}
            </div>
          </div>
          <div>
            <div className="route-meta mono text-[9px]">Avg Speed</div>
            <div className="text-lg display font-extrabold text-[var(--ink)] mt-0.5">
              {averageCorridorSpeed}
              <span className="text-[0.55rem] ml-0.5 mono">KM/H</span>
            </div>
          </div>
        </div>

        {/* 🏍️ 1-Tap Rider Quick Hazard Drops */}
        <div className="mt-4 p-3 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 mono text-[0.62rem] uppercase tracking-wider font-bold text-[var(--accent)]">
              <span>🏍️</span>
              <span>1-Tap Rider Hazard Drop</span>
            </div>
            <span className="mono text-[9px] text-[var(--ink-dim)]">No typing needed</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {RIDER_HAZARD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleQuickDropHazard(preset.id)}
                className="p-2.5 bg-[var(--surface)] hover:bg-[var(--accent)]/15 border border-[var(--border)] hover:border-[var(--accent)] rounded-xl text-left transition-all active:scale-95 cursor-pointer flex flex-col justify-between group shadow-xs"
              >
                <div className="flex items-center justify-between">
                  {getPresetIcon(preset.iconName)}
                  <span className="mono text-[9px] font-bold text-[var(--accent)]">+{preset.delayMinutes}m</span>
                </div>
                <div className="text-[11px] font-bold text-[var(--ink)] mt-2 leading-tight group-hover:text-[var(--accent)] transition-colors">
                  {preset.label}
                </div>
              </button>
            ))}
          </div>

          {toastMessage && (
            <div className="mt-2.5 p-2 bg-emerald-500/15 border border-emerald-500/40 rounded-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-300 mono text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
          )}
        </div>

        {/* Report Form */}
        {showReportForm && (
          <form
            onSubmit={handleCreateReport}
            className="mt-4 p-4 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl shadow-sm"
            noValidate
          >
            <div className="input-group">
              <label htmlFor="incident-title-input" className="mono">
                Incident Summary
              </label>
              <input
                id="incident-title-input"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Describe road condition or hazard..."
                className="editorial-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="input-group">
                <label htmlFor="incident-corridor-input" className="mono">
                  Expressway / Street
                </label>
                <input
                  id="incident-corridor-input"
                  type="text"
                  value={newCorridor}
                  onChange={(e) => setNewCorridor(e.target.value)}
                  placeholder="Street or highway..."
                  className="editorial-input"
                />
              </div>
              <div className="input-group">
                <label htmlFor="incident-delay-input" className="mono">
                  Est. Delay (Min)
                </label>
                <input
                  id="incident-delay-input"
                  type="number"
                  min={2}
                  max={90}
                  value={newDelay}
                  onChange={(e) => setNewDelay(e.target.value)}
                  className="editorial-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="input-group">
                <label htmlFor="incident-type-select" className="mono">
                  Category
                </label>
                <select
                  id="incident-type-select"
                  value={newType}
                  onChange={(e) =>
                    setNewType(e.target.value as TrafficIncident['type'])
                  }
                  className="editorial-input bg-[var(--surface)] text-[var(--ink)]"
                >
                  <option value="congestion">Congestion / Heavy Crawl</option>
                  <option value="roadwork">Roadwork / Construction</option>
                  <option value="accident">Collision / Hazard</option>
                  <option value="weather">Weather Hazard</option>
                </select>
              </div>
              <div className="input-group">
                <label htmlFor="incident-severity-select" className="mono">
                  Severity
                </label>
                <select
                  id="incident-severity-select"
                  value={newSeverity}
                  onChange={(e) =>
                    setNewSeverity(e.target.value as TrafficSeverity)
                  }
                  className="editorial-input bg-[var(--surface)] text-[var(--ink)]"
                >
                  <option value="heavy">Heavy Delay / Gridlock</option>
                  <option value="moderate">Moderate Slowing</option>
                  <option value="low">Minor Advisory</option>
                </select>
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="mb-3 p-2.5 border border-rose-500 bg-rose-500/10 mono text-[0.62rem] text-rose-500 rounded-lg"
              >
                {formError}
              </div>
            )}

            <button type="submit" className="btn-primary display">
              Publish Traffic Report
            </button>
          </form>
        )}
      </div>

      {/* II. Ledger & Locator Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="section-label mono !mb-0">II. Traffic & Signal Locator</span>
          {activeRouteDelayMinutes > 0 && (
            <span className="mono text-[10px] text-rose-500 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
              +{activeRouteDelayMinutes}m En-Route Delay
            </span>
          )}
        </div>

        {/* Search input for quick location */}
        <div className="relative mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search EDSA, C5, Alabang, Ayala, Shaw, Cebu..."
            className="editorial-input !pl-8"
          />
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-dim)] pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs mono text-[var(--ink-dim)] hover:text-[var(--ink)]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Mode Selector Tabs */}
        <div
          role="group"
          aria-label="Filter traffic and signals"
          className="mode-selector !grid-cols-4 mb-4 text-[10px]"
        >
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={filterType === 'all' ? 'active' : ''}
          >
            All ({incidents.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('heavy')}
            className={`flex items-center justify-center gap-1 ${filterType === 'heavy' ? 'active' : ''}`}
          >
            <span>🛑</span>
            <span>Heavy ({heavyCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('lights')}
            className={`flex items-center justify-center gap-1 ${filterType === 'lights' ? 'active' : ''}`}
          >
            <span>🚦</span>
            <span>Signals ({trafficLights.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('roadwork')}
            className={filterType === 'roadwork' ? 'active' : ''}
          >
            Roadwork
          </button>
        </div>

        {/* VIEW 1: Traffic Lights View */}
        {filterType === 'lights' ? (
          <div>
            <div className="p-3 mb-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🚦</span>
                <div>
                  <div className="text-xs font-bold text-[var(--ink)]">
                    Signalized Intersections ({filteredTrafficLights.length})
                  </div>
                  <div className="text-[10px] text-[var(--ink-dim)] mono">
                    MMDA Smart Traffic, SCATS & Provincial signal systems
                  </div>
                </div>
              </div>
            </div>

            {filteredTrafficLights.length === 0 ? (
              <div className="route-card text-center py-6 text-xs text-[var(--ink-dim)] mono">
                No signalized intersections match &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredTrafficLights.map((tl) => (
                  <div key={tl.id} className="route-card cursor-default group hover:border-[var(--accent)] transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🚦</span>
                          <span className="route-title text-[13px] font-bold text-[var(--ink)]">
                            {tl.name}
                          </span>
                        </div>
                        <div className="route-meta mono text-[10px] text-[var(--accent)] font-semibold mt-1">
                          {tl.intersection}
                        </div>
                        <div className="route-meta mono text-[9px] text-[var(--ink-dim)]">
                          {tl.corridor} &middot; {tl.region}
                        </div>
                      </div>

                      {/* Distance / Cycle badge */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {tl.cycleSeconds && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 mono text-[9px] font-bold flex items-center gap-1">
                            <Timer className="w-2.5 h-2.5" />
                            {tl.cycleSeconds}s Cycle
                          </span>
                        )}
                        {tl.distanceKm !== undefined && (
                          <span className="mono text-[9px] text-[var(--ink-dim)] font-medium">
                            {tl.distanceKm.toFixed(1)} km away
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Features list */}
                    {tl.features && tl.features.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--ink-dim)] mono text-[8.5px] uppercase font-bold">
                          {tl.junctionType}
                        </span>
                        {tl.features.map((feat) => (
                          <span
                            key={feat}
                            className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-subtle)] text-[var(--ink)] mono text-[8.5px]"
                          >
                            {feat}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={() => onFocusCoordinate(tl.lat, tl.lng, 16, tl.name)}
                        className="mono text-[0.62rem] uppercase text-[var(--accent)] hover:underline cursor-pointer font-bold flex items-center gap-1"
                      >
                        <Crosshair className="w-3 h-3" />
                        <span>Locate on Map</span>
                      </button>

                      <div className="flex items-center gap-3">
                        {onAddStop && (
                          <button
                            type="button"
                            onClick={() => onAddStop(trafficLightToLatLngPoint(tl))}
                            className="mono text-[0.62rem] uppercase text-[var(--ink-dim)] hover:text-[var(--accent)] cursor-pointer font-bold flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Stop</span>
                          </button>
                        )}
                        {onSelectDestination && (
                          <button
                            type="button"
                            onClick={() => onSelectDestination(trafficLightToLatLngPoint(tl))}
                            className="mono text-[0.62rem] uppercase text-[var(--ink)] hover:text-[var(--accent)] cursor-pointer font-bold flex items-center gap-0.5"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Route Here</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* VIEW 2: Incidents View (All, Heavy, Roadwork) */
          <div>
            {filterType === 'heavy' && (
              <div className="p-3 mb-3 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🛑</span>
                  <div>
                    <div className="text-xs font-bold text-rose-500">
                      Heavy Bottlenecks & Gridlocks ({filteredIncidents.length})
                    </div>
                    <div className="text-[10px] text-[var(--ink-dim)] mono">
                      Severe stop-and-go crawls and expressway queue choke points
                    </div>
                  </div>
                </div>
              </div>
            )}

            {filteredIncidents.length === 0 ? (
              <div className="route-card cursor-default">
                <div className="route-meta mono leading-relaxed">
                  No matching traffic advisories logged. Click{' '}
                  <button
                    type="button"
                    onClick={() => setShowReportForm(true)}
                    className="text-[var(--accent)] underline cursor-pointer font-bold"
                  >
                    + LOG INCIDENT
                  </button>{' '}
                  above to report live roadwork or congestion.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredIncidents.map((inc) => {
                  const isHeavy = inc.severity === 'heavy' || inc.severity === 'closure';
                  return (
                    <div
                      key={inc.id}
                      className={`route-card cursor-default group transition-colors ${
                        isHeavy ? 'border-rose-500/40 hover:border-rose-500' : ''
                      }`}
                    >
                      <div className="route-card-header">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {isHeavy && <span className="text-sm shrink-0">🛑</span>}
                          <span className="route-title truncate font-bold text-[var(--ink)]">
                            {inc.title}
                          </span>
                        </div>
                        <span
                          className={`route-time mono shrink-0 px-2 py-0.5 rounded text-[11px] font-extrabold ${
                            isHeavy
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                              : 'text-[var(--accent)]'
                          }`}
                        >
                          +{inc.delayMinutes}m
                        </span>
                      </div>

                      <div className="route-meta mono text-[10px] text-[var(--accent)] font-semibold mt-1">
                        {inc.corridor}
                      </div>

                      <div className="flex items-center gap-2 mt-1 mono text-[9.5px]">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] font-bold flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-amber-500" />
                          {inc.speedKmh} KM/H
                        </span>
                        {isHeavy && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-300 font-bold uppercase">
                            Severe Crawl
                          </span>
                        )}
                        <span className="text-[var(--ink-dim)]">
                          {inc.updatedMinutesAgo}m ago
                        </span>
                      </div>

                      <div className="text-xs text-[var(--ink-dim)] mt-2 leading-relaxed">
                        {inc.description}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={() => onFocusCoordinate(inc.lat, inc.lng, 15, inc.title)}
                          className="mono text-[0.62rem] uppercase text-[var(--accent)] hover:underline cursor-pointer font-bold flex items-center gap-1"
                        >
                          <Crosshair className="w-3 h-3" />
                          <span>Locate on Map</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggleIncidentActive(inc.id)}
                          className="mono text-[0.62rem] uppercase text-[var(--ink-dim)] hover:text-[var(--accent)] cursor-pointer font-bold"
                        >
                          {inc.active ? 'Mark Cleared' : 'Reactivate'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
