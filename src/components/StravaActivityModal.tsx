import React, { useState } from 'react';
import {
  StravaActivityStats,
  StravaSportType,
  formatDurationSec,
} from '../utils/stravaRecorder';
import {
  Activity,
  Download,
  CheckCircle,
  ExternalLink,
  Flame,
  Gauge,
  Mountain,
  Timer,
  X,
  Share2,
} from 'lucide-react';

interface StravaActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: StravaActivityStats;
  activityName: string;
  sportType: StravaSportType;
  onChangeSportType?: (sport: StravaSportType) => void;
  onResetRecording?: () => void;
  isRecording?: boolean;
  onDownloadGpx: () => void;
  theme?: 'dark' | 'amoled' | 'light';
}

export const StravaActivityModal: React.FC<StravaActivityModalProps> = ({
  isOpen,
  onClose,
  stats,
  activityName,
  sportType,
  onChangeSportType,
  onResetRecording,
  isRecording = false,
  onDownloadGpx,
  theme = 'dark',
}) => {
  const [downloaded, setDownloaded] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    onDownloadGpx();
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 4000);
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border-t sm:border p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] cockpit-shell text-[var(--ink)] relative transition-all"
      >
        <div className="w-10 h-1 rounded-full bg-purple-400/35 mx-auto mb-3 sm:hidden" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Strava Modal"
          className="absolute top-4 right-4 w-9 h-9 rounded-full cockpit-pill flex items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pr-10">
          <div className="w-10 h-10 rounded-xl bg-[#fc5200]/15 border border-[#fc5200]/40 flex items-center justify-center text-[#fc5200] shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] mono uppercase font-bold tracking-wider text-[#fc5200]">
              Strava Activity Track
            </div>
            <h2 className="text-base font-extrabold truncate text-[var(--ink)]">
              {activityName || 'Highway Simulation'}
            </h2>
          </div>
        </div>

        {/* Sport Type Selector */}
        {onChangeSportType && (
          <div className="mb-3">
            <div className="mono text-[9.5px] uppercase font-bold text-[var(--ink-dim)] mb-1.5">
              Activity Sport Type
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(['VirtualRide', 'Ride', 'Drive', 'Run'] as StravaSportType[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => onChangeSportType(st)}
                  className={`py-1.5 px-1 rounded-xl mono text-[10px] font-bold text-center transition-all cursor-pointer border ${
                    sportType === st
                      ? 'bg-[#fc5200] border-[#fc5200] text-white shadow-sm'
                      : 'cockpit-pill text-[var(--ink-dim)] hover:text-[var(--ink)]'
                  }`}
                >
                  {st === 'VirtualRide' ? 'Virtual' : st}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5 my-4">
          <div className="p-3 cockpit-subcard">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-dim)] mono">
              <Share2 className="w-3.5 h-3.5 text-[var(--accent)]" /> Distance
            </div>
            <div className="text-xl font-black mono tabular-nums mt-1 text-[var(--ink)]">
              {stats.totalDistanceKm} <span className="text-xs font-semibold text-[var(--ink-dim)]">KM</span>
            </div>
          </div>

          <div className="p-3 cockpit-subcard">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-dim)] mono">
              <Timer className="w-3.5 h-3.5 text-[var(--accent)]" /> Moving Time
            </div>
            <div className="text-xl font-black mono tabular-nums mt-1 text-[var(--ink)]">
              {formatDurationSec(stats.movingSeconds || stats.elapsedSeconds)}
            </div>
          </div>

          <div className="p-3 cockpit-subcard">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-dim)] mono">
              <Gauge className="w-3.5 h-3.5 text-[var(--accent)]" /> Avg / Max Speed
            </div>
            <div className="text-base font-black mono tabular-nums mt-1 text-[var(--ink)]">
              {stats.avgSpeedKmh}{' '}
              <span className="text-xs font-semibold text-[var(--ink-dim)]">/ {stats.maxSpeedKmh} kph</span>
            </div>
          </div>

          <div className="p-3 cockpit-subcard">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-dim)] mono">
              <Mountain className="w-3.5 h-3.5 text-[var(--accent)]" /> Elevation Gain
            </div>
            <div className="text-xl font-black mono tabular-nums mt-1 text-[var(--ink)]">
              +{stats.elevationGainM} <span className="text-xs font-semibold text-[var(--ink-dim)]">m</span>
            </div>
          </div>
        </div>

        {/* Badge detail */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl text-xs mono tabular-nums mb-4 cockpit-subcard">
          <span className="text-[var(--ink-dim)]">Recorded Trackpoints</span>
          <span className="font-bold text-[var(--accent)]">{stats.pointCount} points</span>
        </div>

        {/* Download & Upload Actions */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleDownload}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#fc5200] to-[#e04500] hover:brightness-110 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#fc5200]/25 transition-all cursor-pointer"
          >
            {downloaded ? (
              <>
                <CheckCircle className="w-5 h-5" /> Saved Strava GPX File!
              </>
            ) : (
              <>
                <Download className="w-5 h-5" /> Download Strava GPX (.gpx)
              </>
            )}
          </button>

          <a
            href="https://www.strava.com/upload/select"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 rounded-xl cockpit-pill text-center text-xs font-semibold flex items-center justify-center gap-1.5 text-[var(--ink)] hover:border-[var(--accent)] transition-colors cursor-pointer"
          >
            Upload to Strava Web App <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
