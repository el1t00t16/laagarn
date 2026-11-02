import React, { useState } from 'react';
import { TrafficIncident, TrafficSeverity } from '../utils/routingEngine';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import {
  RIDER_HAZARD_PRESETS,
  RiderHazardType,
  createRiderReportedHazard,
} from '../utils/riderHazards';
import {
  AlertTriangle,
  ShieldAlert,
  Mountain,
  Waves,
  Construction,
  AlertOctagon,
  CheckCircle2,
} from 'lucide-react';

interface TrafficPanelProps {
  incidents: TrafficIncident[];
  onToggleIncidentActive: (id: string) => void;
  onAddIncident: (incident: Omit<TrafficIncident, 'id' | 'updatedMinutesAgo'>) => void;
  onFocusCoordinate: (lat: number, lng: number, zoom?: number) => void;
  activeRouteDelayMinutes: number;
  gpsState: GpsPositionState | null;
}

export const TrafficPanel: React.FC<TrafficPanelProps> = ({
  incidents,
  onToggleIncidentActive,
  onAddIncident,
  onFocusCoordinate,
  activeRouteDelayMinutes,
  gpsState,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'heavy' | 'roadwork'>('all');
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

  const filteredIncidents = incidents.filter((inc) => {
    if (filterType === 'heavy') {
      return inc.severity === 'heavy' || inc.severity === 'closure';
    }
    if (filterType === 'roadwork') {
      return inc.type === 'roadwork';
    }
    return true;
  });

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
      speedKmh: newSeverity === 'heavy' ? 18 : newSeverity === 'moderate' ? 35 : 50,
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
    <div className="flex flex-col gap-10 min-h-full">
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="section-label mono !mb-0">I. Corridor Dispatch</span>
          <button
            type="button"
            onClick={() => setShowReportForm((v) => !v)}
            className="mono text-[0.6rem] uppercase tracking-[0.1em] text-[#c084fc] hover:underline cursor-pointer"
          >
            {showReportForm ? 'Close' : '+ Log Incident'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 p-4 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl shadow-sm">
          <div>
            <div className="route-meta mono">Alerts</div>
            <div className="text-xl display font-extrabold text-[var(--ink)] mt-1">
              {activeCount}
            </div>
          </div>
          <div>
            <div className="route-meta mono">Velocity</div>
            <div className="text-xl display font-extrabold text-[var(--ink)] mt-1">
              {averageCorridorSpeed}
              <span className="text-[0.6rem] ml-1 mono">KM/H</span>
            </div>
          </div>
          <div>
            <div className="route-meta mono">Delay</div>
            <div className="text-xl display font-extrabold text-[var(--accent)] mt-1">
              +{activeRouteDelayMinutes}m
            </div>
          </div>
        </div>

        {/* 🏍️ 1-Tap Rider Quick Hazard Drops */}
        <div className="mt-4 p-3 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-2.5">
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
            <div className="mt-2.5 p-2 bg-emerald-500/15 border border-emerald-500/40 rounded-lg flex items-center gap-2 text-emerald-300 mono text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
          )}
        </div>

        {showReportForm && (
          <form
            onSubmit={handleCreateReport}
            className="mt-5 p-4 bg-[var(--surface)] backdrop-blur-md border border-[var(--border)] rounded-xl shadow-sm"
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
                  <option value="congestion">Congestion</option>
                  <option value="roadwork">Roadwork</option>
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
                  <option value="moderate">Moderate Slowing</option>
                  <option value="heavy">Heavy Delay</option>
                  <option value="low">Minor Advisory</option>
                </select>
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="mb-3 p-2.5 border border-[#a855f7] bg-purple-500/10 mono text-[0.62rem] text-[#c084fc] rounded-lg"
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

      <div>
        <span className="section-label mono">II. Incident Ledger</span>
        {incidents.length === 0 ? (
          <div className="route-card cursor-default">
            <div className="route-meta mono leading-relaxed">
              No active traffic advisories logged. Click{' '}
              <button
                type="button"
                onClick={() => setShowReportForm(true)}
                className="text-[#c084fc] underline cursor-pointer"
              >
                + LOG INCIDENT
              </button>{' '}
              above to report live roadwork or congestion.
            </div>
          </div>
        ) : (
          <>
            <div
              role="group"
              aria-label="Filter traffic incidents"
              className="mode-selector !grid-cols-3 mb-4"
            >
              {(
                [
                  { id: 'all', label: `All (${incidents.length})` },
                  { id: 'heavy', label: 'Heavy' },
                  { id: 'roadwork', label: 'Roadwork' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={filterType === tab.id ? 'active' : ''}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div>
              {filteredIncidents.map((inc) => (
                <div key={inc.id} className="route-card cursor-default">
                  <div className="route-card-header">
                    <span className="route-title">{inc.title}</span>
                    <span className="route-time mono">+{inc.delayMinutes}m</span>
                  </div>
                  <div className="route-meta mono">
                    {inc.corridor} · {inc.speedKmh} KM/H
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => onFocusCoordinate(inc.lat, inc.lng, 14)}
                      className="mono text-[0.62rem] uppercase text-[var(--ink)] hover:text-[var(--accent)] underline cursor-pointer font-bold"
                    >
                      Locate on Map
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
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
