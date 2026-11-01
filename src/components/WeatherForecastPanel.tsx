import React, { useState } from 'react';
import {
  evaluateWeatherTravelAdvisory,
  WeatherSnapshot,
} from '../utils/routingEngine';

interface WeatherForecastPanelProps {
  snapshots: WeatherSnapshot[];
  loading: boolean;
  onFocusCoordinate: (lat: number, lng: number, zoom?: number) => void;
  onRefreshWeather: () => void;
  onSpotWeatherOnMap: () => void;
}

export const WeatherForecastPanel: React.FC<WeatherForecastPanelProps> = ({
  snapshots,
  loading,
  onFocusCoordinate,
  onRefreshWeather,
  onSpotWeatherOnMap,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const current = snapshots[selectedIndex] || snapshots[0];

  if (loading && snapshots.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-[rgba(242,242,242,0.1)]" />
        <div className="h-28 w-full bg-[rgba(242,242,242,0.05)]" />
      </div>
    );
  }

  if (!current) {
    return (
      <div>
        <span className="section-label mono">I. Meteorological Stations</span>
        <div className="route-card cursor-default">
          <div className="route-meta mono leading-relaxed">
            No GPS location or route stops set yet. Lock your GPS position, plot a
            route, or click below to inspect live weather anywhere in the
            Philippines.
          </div>
          <button
            type="button"
            onClick={onSpotWeatherOnMap}
            className="btn-primary display"
          >
            Click Map to Spot Weather
          </button>
        </div>
      </div>
    );
  }

  const advisory = evaluateWeatherTravelAdvisory(current);

  return (
    <div className="flex flex-col gap-10 min-h-full">
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="section-label mono !mb-0">
            I. Meteorological Stations
          </span>
          <button
            type="button"
            onClick={onRefreshWeather}
            className="mono text-[0.6rem] uppercase tracking-[0.1em] text-[#ff4d00] hover:underline cursor-pointer"
          >
            Sync Now
          </button>
        </div>

        <div role="tablist" aria-label="Route weather stations">
          {snapshots.map((snap, idx) => {
            const isSelected = idx === selectedIndex;
            const roleLabel =
              snapshots.length === 1
                ? 'Active Station'
                : idx === 0
                ? 'Departure Point'
                : idx === snapshots.length - 1
                ? 'Arrival Port'
                : `Intermediate ${idx}`;

            return (
              <button
                key={`${snap.locationName}-${idx}`}
                role="tab"
                aria-selected={isSelected}
                type="button"
                onClick={() => {
                  setSelectedIndex(idx);
                  onFocusCoordinate(snap.lat, snap.lng, 13);
                }}
                className={`w-full text-left route-card ${
                  isSelected ? 'active' : ''
                }`}
              >
                <div className="route-card-header">
                  <span className="route-title">{snap.locationName}</span>
                  <span className="route-time mono">{snap.tempC}°C</span>
                </div>
                <div className="route-meta mono">
                  {roleLabel} · {snap.condition}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="section-label mono">II. Atmospheric Reading</span>
        <div className="route-card cursor-default">
          <div className="route-card-header">
            <span className="text-3xl display font-extrabold text-[#f2f2f2]">
              {current.tempC}°C
            </span>
            <span className="route-meta mono">
              {current.condition} · FEELS {current.feelsLikeC}°C
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-[rgba(242,242,242,0.1)]">
            <div>
              <div className="route-meta mono">Wind</div>
              <div className="mono text-xs text-[#f2f2f2] mt-1">
                {current.windKmh} KM/H
              </div>
            </div>
            <div>
              <div className="route-meta mono">Precip</div>
              <div className="mono text-xs text-[#f2f2f2] mt-1">
                {current.precipProbPct}% ({current.humidityPct}% RH)
              </div>
            </div>
            <div>
              <div className="route-meta mono">Visibility</div>
              <div className="mono text-xs text-[#f2f2f2] mt-1">
                {current.visibilityKm} KM
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[rgba(242,242,242,0.1)]">
            <div className="route-meta mono">
              <span style={{ color: 'var(--accent)' }}>
                ADVISORY: {advisory.level}
              </span>{' '}
              · SURFACE: {advisory.roadSurface}
            </div>
            <p className="step-text mt-2 !text-xs text-[rgba(242,242,242,0.7)]">
              {advisory.summary}
            </p>
          </div>
        </div>
      </div>

      <div>
        <span className="section-label mono">III. Horizon Outlook</span>
        <div className="grid grid-cols-6 gap-1 mb-4">
          {current.hourly.map((hr) => (
            <div
              key={hr.timeLabel}
              className="p-2 bg-[#111113] border border-[rgba(242,242,242,0.1)] text-center"
            >
              <div className="route-meta mono">{hr.timeLabel}</div>
              <div className="mono text-xs font-bold text-[#f2f2f2] mt-1">
                {hr.tempC}°
              </div>
              <div className="mono text-[0.55rem] text-[#ff4d00] mt-0.5">
                {hr.precipProbPct}%
              </div>
            </div>
          ))}
        </div>

        <div className="divide-y divide-[rgba(242,242,242,0.1)] border-t border-b border-[rgba(242,242,242,0.1)]">
          {current.daily.map((day) => (
            <div
              key={day.dayLabel}
              className="py-2.5 flex items-center justify-between"
            >
              <span className="route-meta mono !text-[#f2f2f2] w-16">
                {day.dayLabel}
              </span>
              <span className="text-xs text-[rgba(242,242,242,0.65)] flex-1">
                {day.condition}
              </span>
              <span className="route-meta mono !text-[#ff4d00] w-12 text-right">
                {day.precipProbPct}%
              </span>
              <span className="route-meta mono !text-[#f2f2f2] w-20 text-right">
                {day.highC}° / {day.lowC}°C
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
