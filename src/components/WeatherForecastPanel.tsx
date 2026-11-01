import React, { useState } from 'react';
import {
  AlertTriangle,
  CloudRain,
  CloudLightning,
  ShieldCheck,
  ShieldAlert,
  Navigation,
  Wind,
  Sun,
  Phone,
  Eye,
  CheckCircle2,
  MapPin,
  Thermometer,
  Droplets,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  evaluateWeatherTravelAdvisory,
  WeatherSnapshot,
} from '../utils/routingEngine';
import {
  CorridorStation,
  HazardSeverity,
  RouteCorridorHazardReport,
} from '../utils/corridorWeather';

interface WeatherForecastPanelProps {
  snapshots: WeatherSnapshot[];
  corridorStations?: CorridorStation[];
  hazardReport?: RouteCorridorHazardReport | null;
  loading: boolean;
  onFocusCoordinate: (lat: number, lng: number, zoom?: number) => void;
  onRefreshWeather: () => void;
  onSpotWeatherOnMap: () => void;
  destinationName?: string;
}

type WeatherViewTab = 'corridor' | 'hazards' | 'outlook';

export const WeatherForecastPanel: React.FC<WeatherForecastPanelProps> = ({
  snapshots,
  corridorStations = [],
  hazardReport = null,
  loading,
  onFocusCoordinate,
  onRefreshWeather,
  onSpotWeatherOnMap,
  destinationName,
}) => {
  const [activeTab, setActiveTab] = useState<WeatherViewTab>(
    corridorStations.length > 0 ? 'corridor' : 'outlook'
  );
  const [selectedStationIndex, setSelectedStationIndex] = useState<number>(0);

  // If corridor stations are available, use their snapshots; otherwise fallback to input snapshots
  const activeStations =
    corridorStations.length > 0
      ? corridorStations
      : snapshots.map((s, idx) => ({
          id: `s-${idx}`,
          name: s.locationName,
          region: 'Philippines',
          lat: s.lat,
          lng: s.lng,
          distanceAlongKm: 0,
          pctOfRoute: 0,
          etaMinutes: 0,
          etaLabel: idx === 0 ? 'Departure' : `Stop ${idx + 1}`,
          etaTimestamp: Date.now(),
          weather: s,
          predictedAtEta: {
            tempC: s.tempC,
            feelsLikeC: s.feelsLikeC,
            condition: s.condition,
            precipProbPct: s.precipProbPct,
            windKmh: s.windKmh,
            visibilityKm: s.visibilityKm,
            timeLabel: 'Now',
          },
          hazards: [],
        }));

  const currentStation =
    activeStations[selectedStationIndex] || activeStations[0];
  const currentSnapshot = currentStation?.weather || snapshots[0];

  const destinationStation =
    corridorStations.length > 0
      ? corridorStations[corridorStations.length - 1]
      : null;

  if (loading && activeStations.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-[rgba(242,242,242,0.1)] animate-pulse rounded" />
        <div className="h-32 w-full bg-[rgba(242,242,242,0.05)] animate-pulse rounded" />
        <div className="h-24 w-full bg-[rgba(242,242,242,0.05)] animate-pulse rounded" />
      </div>
    );
  }

  if (!currentSnapshot) {
    return (
      <div>
        <span className="section-label mono">En-Route Meteorological Predictor</span>
        <div className="route-card cursor-default">
          <div className="route-meta mono leading-relaxed text-sm">
            No route or GPS location active yet. Plan a trip from Malungon to
            Digos, or click below to inspect live weather anywhere in the Philippines.
          </div>
          <button
            type="button"
            onClick={onSpotWeatherOnMap}
            className="btn-primary display mt-4 flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            Click Map to Spot Weather
          </button>
        </div>
      </div>
    );
  }

  const advisory = evaluateWeatherTravelAdvisory(currentSnapshot);

  // Helper for badge color based on hazard severity
  const severityBadge = (severity: HazardSeverity) => {
    switch (severity) {
      case 'severe':
        return 'bg-red-950/80 text-red-400 border border-red-700/60';
      case 'warning':
        return 'bg-amber-950/80 text-amber-400 border border-amber-600/60';
      case 'caution':
        return 'bg-yellow-950/80 text-yellow-300 border border-yellow-600/60';
      case 'nominal':
      default:
        return 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/50';
    }
  };

  return (
    <div className="flex flex-col gap-6 min-h-full pb-8">
      {/* 1. Header with Sync Button */}
      <div className="flex items-center justify-between">
        <div>
          <span className="section-label mono !mb-0 text-[#ff4d00]">
            Weather & Road Hazards
          </span>
          <div className="text-xs text-[rgba(242,242,242,0.6)] mono mt-0.5">
            Real-time Philippine corridor forecasts & safety precautions
          </div>
        </div>
        <button
          type="button"
          onClick={onRefreshWeather}
          disabled={loading}
          className="flex items-center gap-1.5 mono text-[0.65rem] uppercase tracking-[0.1em] text-[#ff4d00] hover:text-[#ff6a26] transition-colors cursor-pointer py-1 px-2 border border-[#ff4d00]/30 hover:border-[#ff4d00] rounded"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* 2. Destination Arrival Weather Forecast Banner (if route active) */}
      {destinationStation && (
        <div className="p-4 bg-gradient-to-r from-[#18181b] to-[#121214] border border-[#ff4d00]/30 rounded shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#ff4d00]/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-[#ff4d00]" />
              <span className="mono text-[0.7rem] uppercase tracking-wider text-gray-400">
                Destination Arrival Weather
              </span>
            </div>
            <span className="mono text-[0.65rem] text-[#ff4d00] bg-[#ff4d00]/10 px-2 py-0.5 rounded border border-[#ff4d00]/20 font-bold">
              ETA: {destinationStation.predictedAtEta.timeLabel}
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div>
              <div className="text-xl display font-extrabold text-white">
                {destinationName || destinationStation.name}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Arrival condition: <span className="text-gray-200 font-semibold">{destinationStation.predictedAtEta.condition}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-3xl display font-black text-white">
                {destinationStation.predictedAtEta.tempC}°C
              </span>
              <div className="mono text-[0.65rem] text-gray-400">
                Rain: <span className="text-[#ff4d00] font-bold">{destinationStation.predictedAtEta.precipProbPct}%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10 text-center mono text-[0.65rem]">
            <div className="bg-black/30 p-1.5 rounded">
              <div className="text-gray-500">WIND</div>
              <div className="text-gray-200 font-bold mt-0.5">{destinationStation.predictedAtEta.windKmh} KM/H</div>
            </div>
            <div className="bg-black/30 p-1.5 rounded">
              <div className="text-gray-500">VISIBILITY</div>
              <div className="text-gray-200 font-bold mt-0.5">{destinationStation.predictedAtEta.visibilityKm} KM</div>
            </div>
            <div className="bg-black/30 p-1.5 rounded">
              <div className="text-gray-500">FEELS LIKE</div>
              <div className="text-gray-200 font-bold mt-0.5">{destinationStation.predictedAtEta.feelsLikeC}°C</div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Navigation View Switcher Tabs */}
      <div className="flex border-b border-white/10 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('corridor')}
          className={`pb-2.5 px-3 text-xs mono uppercase tracking-wider font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'corridor'
              ? 'border-[#ff4d00] text-[#ff4d00]'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          Corridor Waypoints ({activeStations.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hazards')}
          className={`pb-2.5 px-3 text-xs mono uppercase tracking-wider font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer relative ${
            activeTab === 'hazards'
              ? 'border-[#ff4d00] text-[#ff4d00]'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          {hazardReport && hazardReport.overallLevel !== 'nominal' ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          )}
          Hazards & Precautions
          {hazardReport && hazardReport.hazards.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('outlook')}
          className={`pb-2.5 px-3 text-xs mono uppercase tracking-wider font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'outlook'
              ? 'border-[#ff4d00] text-[#ff4d00]'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          Detailed Outlook
        </button>
      </div>

      {/* 4. TAB CONTENT: Corridor Waypoints */}
      {activeTab === 'corridor' && (
        <div className="space-y-4">
          <div className="text-xs text-gray-400 mono">
            Sequential weather timeline for each municipality along the travel path:
          </div>

          <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-white/10">
            {activeStations.map((station, idx) => {
              const isSelected = idx === selectedStationIndex;
              const hasHazards = station.hazards.length > 0;
              const pred = station.predictedAtEta;

              return (
                <div
                  key={station.id}
                  onClick={() => {
                    setSelectedStationIndex(idx);
                    onFocusCoordinate(station.lat, station.lng, 13);
                  }}
                  className={`relative p-3 rounded border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#1e1e22] border-[#ff4d00] shadow-md shadow-[#ff4d00]/10'
                      : 'bg-[#141416] border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Timeline dot */}
                  <div
                    className={`absolute -left-[1.85rem] top-4 w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                      hasHazards
                        ? 'bg-amber-500 border-[#141416]'
                        : isSelected
                        ? 'bg-[#ff4d00] border-[#141416]'
                        : 'bg-gray-600 border-[#141416]'
                    }`}
                  />

                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">
                          {station.name}
                        </span>
                        {idx === 0 && (
                          <span className="text-[9px] mono px-1.5 py-0.2 bg-white/10 text-gray-300 rounded">
                            START
                          </span>
                        )}
                        {idx === activeStations.length - 1 && (
                          <span className="text-[9px] mono px-1.5 py-0.2 bg-[#ff4d00]/20 text-[#ff4d00] rounded font-bold">
                            DESTINATION
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {station.region} · {station.distanceAlongKm > 0 ? `${station.distanceAlongKm} km from origin` : 'Departure Point'}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-lg font-black text-white">
                        {pred.tempC}°C
                      </span>
                      <div className="text-[0.65rem] mono text-[#ff4d00]">
                        {pred.precipProbPct}% rain
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[0.7rem] mono text-gray-400">
                    <span className="text-gray-300 font-medium">
                      {pred.condition} · Wind {pred.windKmh} km/h
                    </span>
                    <span className="text-[#ff4d00] font-semibold">
                      {station.etaLabel}
                    </span>
                  </div>

                  {/* Active hazard notice if any */}
                  {station.hazards.length > 0 && (
                    <div className="mt-2.5 p-2 bg-amber-950/40 border border-amber-600/40 rounded text-xs flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-amber-300 font-bold text-[0.7rem] uppercase tracking-wide">
                          {station.hazards[0].title}:
                        </span>
                        <p className="text-[0.75rem] text-amber-200/90 mt-0.5 leading-snug">
                          {station.hazards[0].precaution}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: Hazards & Safety Precautions */}
      {activeTab === 'hazards' && (
        <div className="space-y-5">
          {/* Overall Route Safety Score Card */}
          {hazardReport ? (
            <div className="p-4 bg-[#141416] border border-white/10 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="section-label mono !mb-0">
                  Route Safety Assessment
                </span>
                <span
                  className={`mono text-[0.65rem] font-bold uppercase px-2.5 py-1 rounded ${severityBadge(
                    hazardReport.overallLevel
                  )}`}
                >
                  {hazardReport.overallLevel === 'nominal'
                    ? 'SAFE PASSAGE'
                    : `${hazardReport.overallLevel} ALERT`}
                </span>
              </div>

              <div className="flex items-center gap-4 mb-3">
                <div className="text-3xl font-black display text-white">
                  {hazardReport.safetyScore}
                  <span className="text-xs text-gray-500 mono font-normal">/100</span>
                </div>
                <div className="flex-1">
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        hazardReport.safetyScore >= 80
                          ? 'bg-emerald-500'
                          : hazardReport.safetyScore >= 60
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${hazardReport.safetyScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[0.65rem] mono text-gray-500 mt-1">
                    <span>Critical Risk</span>
                    <span>Caution</span>
                    <span>Optimal</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed">
                {hazardReport.summary}
              </p>
              <div className="text-xs text-[#ff4d00] mono mt-2 pt-2 border-t border-white/10">
                {hazardReport.destinationEtaSummary}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#141416] border border-white/10 rounded text-xs text-gray-400 mono">
              Plot a route between two Philippine points (e.g. Malungon to Digos) to view corridor hazard analysis.
            </div>
          )}

          {/* Localized Hazard Alerts along the Corridor */}
          {hazardReport && hazardReport.hazards.length > 0 && (
            <div>
              <span className="section-label mono">
                Active Localized Hazards ({hazardReport.hazards.length})
              </span>
              <div className="space-y-2.5 mt-2">
                {hazardReport.hazards.map((hazard) => (
                  <div
                    key={hazard.id}
                    className="p-3 bg-gradient-to-r from-[#1c1917] to-[#141416] border border-amber-600/30 rounded-md"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300">
                        {hazard.kind === 'rain' ? (
                          <CloudRain className="w-3.5 h-3.5 text-blue-400" />
                        ) : hazard.kind === 'thunderstorm' ? (
                          <CloudLightning className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{hazard.title}</span>
                      </div>
                      <span className="mono text-[0.65rem] text-gray-400">
                        {hazard.stationName}
                      </span>
                    </div>

                    <p className="text-xs text-gray-300 leading-relaxed mb-2">
                      {hazard.description}
                    </p>

                    <div className="p-2 bg-black/40 rounded border border-white/5 text-[0.72rem] text-amber-100 flex items-start gap-2">
                      <span className="text-[#ff4d00] font-bold mono shrink-0">ACTION:</span>
                      <span>{hazard.precaution}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actionable Driver & Motorcyclist Safety Precautions Checklist */}
          {hazardReport && (
            <div>
              <span className="section-label mono">
                Driver & Rider Precautions Checklist
              </span>
              <div className="p-4 bg-[#141416] border border-white/10 rounded-lg space-y-2.5">
                {hazardReport.precautionChecklist.map((precaution, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-gray-200">
                    <CheckCircle2 className="w-4 h-4 text-[#ff4d00] shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{precaution}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Emergency Hotlines */}
          {hazardReport && (
            <div>
              <span className="section-label mono">
                Corridor Emergency Hotlines
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {hazardReport.emergencyHotlines.map((hotline, idx) => (
                  <a
                    key={idx}
                    href={`tel:${hotline.number.replace(/[^0-9+]/g, '')}`}
                    className="p-3 bg-[#111113] border border-white/10 hover:border-[#ff4d00]/50 rounded flex items-center justify-between group transition-colors"
                  >
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-[#ff4d00] transition-colors">
                        {hotline.name}
                      </div>
                      <div className="text-[0.65rem] text-gray-400">
                        {hotline.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mono text-xs font-bold text-[#ff4d00] bg-[#ff4d00]/10 px-2 py-1 rounded">
                      <Phone className="w-3 h-3" />
                      {hotline.number}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. TAB CONTENT: Detailed Outlook */}
      {activeTab === 'outlook' && (
        <div className="space-y-6">
          {/* Station Selector Pill Carousel */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="mono text-[0.65rem] uppercase text-gray-400">
                Selected Meteorological Station
              </span>
              <button
                type="button"
                onClick={onSpotWeatherOnMap}
                className="mono text-[0.65rem] text-[#ff4d00] hover:underline flex items-center gap-1"
              >
                <Search className="w-3 h-3" /> Spot Other Location
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {activeStations.map((station, idx) => (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => {
                    setSelectedStationIndex(idx);
                    onFocusCoordinate(station.lat, station.lng, 13);
                  }}
                  className={`px-3 py-1.5 rounded text-xs mono whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                    idx === selectedStationIndex
                      ? 'bg-[#ff4d00] text-black font-bold'
                      : 'bg-[#18181b] text-gray-300 border border-white/10 hover:border-white/30'
                  }`}
                >
                  <span>{station.name}</span>
                  <span className="text-[10px] opacity-80">{station.weather.tempC}°</span>
                </button>
              ))}
            </div>
          </div>

          {/* Atmospheric Reading Card */}
          <div className="route-card cursor-default">
            <div className="route-card-header">
              <div>
                <span className="text-4xl display font-black text-white">
                  {currentSnapshot.tempC}°C
                </span>
                <div className="route-meta mono text-xs mt-1">
                  FEELS LIKE {currentSnapshot.feelsLikeC}°C · {currentSnapshot.condition.toUpperCase()}
                </div>
              </div>
              <div className="text-right">
                <div className="mono text-xs font-bold text-[#ff4d00]">
                  {currentStation.name}
                </div>
                <div className="text-[10px] text-gray-400 mono">
                  {currentStation.region}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-[rgba(242,242,242,0.1)] text-center">
              <div className="bg-black/30 p-2 rounded">
                <div className="text-[0.65rem] text-gray-400 mono flex items-center justify-center gap-1">
                  <Wind className="w-3 h-3" /> Wind
                </div>
                <div className="mono text-xs text-white font-bold mt-1">
                  {currentSnapshot.windKmh} KM/H
                </div>
              </div>
              <div className="bg-black/30 p-2 rounded">
                <div className="text-[0.65rem] text-gray-400 mono flex items-center justify-center gap-1">
                  <Droplets className="w-3 h-3" /> Rain
                </div>
                <div className="mono text-xs text-[#ff4d00] font-bold mt-1">
                  {currentSnapshot.precipProbPct}%
                </div>
              </div>
              <div className="bg-black/30 p-2 rounded">
                <div className="text-[0.65rem] text-gray-400 mono flex items-center justify-center gap-1">
                  <Eye className="w-3 h-3" /> Vis
                </div>
                <div className="mono text-xs text-white font-bold mt-1">
                  {currentSnapshot.visibilityKm} KM
                </div>
              </div>
              <div className="bg-black/30 p-2 rounded">
                <div className="text-[0.65rem] text-gray-400 mono flex items-center justify-center gap-1">
                  <Sun className="w-3 h-3" /> UV
                </div>
                <div className="mono text-xs text-white font-bold mt-1">
                  {currentSnapshot.uvIndex}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[rgba(242,242,242,0.1)]">
              <div className="route-meta mono text-xs">
                <span className="text-[#ff4d00] font-bold">
                  ADVISORY: {advisory.level.toUpperCase()}
                </span>{' '}
                · SURFACE: {advisory.roadSurface.toUpperCase()}
              </div>
              <p className="step-text mt-1.5 !text-xs text-[rgba(242,242,242,0.7)] leading-relaxed">
                {advisory.summary}
              </p>
            </div>
          </div>

          {/* Hourly Horizon Outlook */}
          <div>
            <span className="section-label mono">Hourly Horizon Outlook</span>
            <div className="grid grid-cols-6 gap-1 mb-4">
              {currentSnapshot.hourly.map((hr) => (
                <div
                  key={hr.timeLabel}
                  className="p-2 bg-[#111113] border border-[rgba(242,242,242,0.1)] text-center rounded"
                >
                  <div className="route-meta mono text-[0.65rem]">{hr.timeLabel}</div>
                  <div className="mono text-xs font-bold text-white mt-1">
                    {hr.tempC}°
                  </div>
                  <div className="mono text-[0.55rem] text-[#ff4d00] mt-0.5 font-semibold">
                    {hr.precipProbPct}%
                  </div>
                </div>
              ))}
            </div>

            {/* 5-Day Daily Forecast */}
            <div className="divide-y divide-[rgba(242,242,242,0.1)] border-t border-b border-[rgba(242,242,242,0.1)]">
              {currentSnapshot.daily.map((day) => (
                <div
                  key={day.dayLabel}
                  className="py-2.5 flex items-center justify-between text-xs"
                >
                  <span className="route-meta mono !text-white w-16 font-semibold">
                    {day.dayLabel}
                  </span>
                  <span className="text-gray-400 flex-1">
                    {day.condition}
                  </span>
                  <span className="route-meta mono !text-[#ff4d00] w-12 text-right font-bold">
                    {day.precipProbPct}%
                  </span>
                  <span className="route-meta mono !text-white w-20 text-right">
                    {day.highC}° / {day.lowC}°C
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
