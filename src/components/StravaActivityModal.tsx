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

  const isDark = theme !== 'light';

  const handleDownload = () => {
    onDownloadGpx();
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 4000);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl relative transition-all ${
          isDark
            ? 'bg-[#120824] border-purple-500/30 text-white'
            : 'bg-white border-purple-200 text-gray-900 shadow-purple-950/20'
        }`}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#fc5200]/20 border border-[#fc5200]/40 flex items-center justify-center text-[#fc5200]">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] mono uppercase font-bold tracking-wider text-[#fc5200]">
              Strava Activity Track
            </div>
            <h2 className="text-lg font-black truncate max-w-[260px]">
              {activityName || 'Highway Simulation'}
            </h2>
          </div>
        </div>

        {/* Sport Type Selector */}
        {onChangeSportType && (
          <div className="mb-3">
            <div className="mono text-[9px] uppercase font-bold text-gray-400 mb-1.5">
              Activity Sport Type
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(['VirtualRide', 'Ride', 'Drive', 'Run'] as StravaSportType[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => onChangeSportType(st)}
                  className={`py-1.5 px-1 rounded-lg mono text-[10px] font-bold text-center transition-all cursor-pointer ${
                    sportType === st
                      ? 'bg-[#fc5200] text-white shadow-sm'
                      : isDark
                      ? 'bg-white/5 hover:bg-white/10 text-gray-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
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
          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-purple-950/30 border-purple-500/20' : 'bg-purple-50 border-purple-200/60'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs opacity-70 mono">
              <Share2 className="w-3.5 h-3.5 text-purple-400" /> Distance
            </div>
            <div className="text-xl font-black mt-1">
              {stats.totalDistanceKm} <span className="text-xs font-normal opacity-70">KM</span>
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-purple-950/30 border-purple-500/20' : 'bg-purple-50 border-purple-200/60'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs opacity-70 mono">
              <Timer className="w-3.5 h-3.5 text-purple-400" /> Moving Time
            </div>
            <div className="text-xl font-black mt-1">
              {formatDurationSec(stats.movingSeconds || stats.elapsedSeconds)}
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-purple-950/30 border-purple-500/20' : 'bg-purple-50 border-purple-200/60'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs opacity-70 mono">
              <Gauge className="w-3.5 h-3.5 text-purple-400" /> Avg / Max Speed
            </div>
            <div className="text-base font-black mt-1">
              {stats.avgSpeedKmh}{' '}
              <span className="text-xs font-normal opacity-70">/ {stats.maxSpeedKmh} kph</span>
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-purple-950/30 border-purple-500/20' : 'bg-purple-50 border-purple-200/60'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs opacity-70 mono">
              <Mountain className="w-3.5 h-3.5 text-purple-400" /> Elevation Gain
            </div>
            <div className="text-xl font-black mt-1">
              +{stats.elevationGainM} <span className="text-xs font-normal opacity-70">m</span>
            </div>
          </div>
        </div>

        {/* Badge detail */}
        <div
          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs mono mb-4 border ${
            isDark ? 'bg-black/40 border-purple-500/20' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <span className="opacity-70">Recorded Trackpoints:</span>
          <span className="font-bold text-[#c084fc]">{stats.pointCount} points</span>
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
            className={`w-full py-2.5 px-4 rounded-xl border text-center text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              isDark
                ? 'border-purple-500/30 hover:bg-white/5 text-purple-200'
                : 'border-purple-200 hover:bg-purple-50 text-purple-900'
            }`}
          >
            Upload to Strava Web App <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
