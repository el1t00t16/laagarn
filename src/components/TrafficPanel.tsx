import React, { useState } from 'react';
import { TrafficIncident, TrafficSeverity } from '../utils/routingEngine';
import { GpsPositionState } from '../utils/gpsAndGeocoding';

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

        <div className="grid grid-cols-3 gap-3 p-4 bg-[#110820]/80 backdrop-blur-md border border-purple-500/25 rounded-xl">
          <div>
            <div className="route-meta mono">Alerts</div>
            <div className="text-xl display font-extrabold text-[#f2f2f2] mt-1">
              {activeCount}
            </div>
          </div>
          <div>
            <div className="route-meta mono">Velocity</div>
            <div className="text-xl display font-extrabold text-[#f2f2f2] mt-1">
              {averageCorridorSpeed}
              <span className="text-[0.6rem] ml-1 mono">KM/H</span>
            </div>
          </div>
          <div>
            <div className="route-meta mono">Delay</div>
            <div className="text-xl display font-extrabold text-[#c084fc] mt-1">
              +{activeRouteDelayMinutes}m
            </div>
          </div>
        </div>

        {showReportForm && (
          <form
            onSubmit={handleCreateReport}
            className="mt-5 p-4 bg-[#110820]/90 backdrop-blur-md border border-purple-500/25 rounded-xl"
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
                  className="editorial-input bg-[#111113]"
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
                  className="editorial-input bg-[#111113]"
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
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[rgba(242,242,242,0.08)]">
                    <button
                      type="button"
                      onClick={() => onFocusCoordinate(inc.lat, inc.lng, 14)}
                      className="mono text-[0.6rem] uppercase text-[#f2f2f2] hover:text-[#c084fc] underline cursor-pointer"
                    >
                      Locate on Map
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleIncidentActive(inc.id)}
                      className="mono text-[0.6rem] uppercase text-[rgba(242,242,242,0.5)] hover:text-[#c084fc] cursor-pointer"
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
