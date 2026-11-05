import React, { useState } from 'react';
import {
  Camera,
  Video,
  Disc,
  Pause,
  Play,
  Square,
  Download,
  RefreshCw,
  Maximize2,
  Minimize2,
  X,
  Gauge,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
  Navigation2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import { UseCameraRecorderResult, RecordingMode } from '../hooks/useCameraRecorder';
import { RouteStep } from '../utils/routingEngine';
import { formatDurationSec } from '../utils/stravaRecorder';

export type DashcamViewMode = 'pip' | 'hud' | 'hidden';

interface DashcamOverlayProps {
  recorder: UseCameraRecorderResult;
  viewMode: DashcamViewMode;
  onChangeViewMode: (mode: DashcamViewMode) => void;
  gpsState: GpsPositionState | null;
  currentStep?: RouteStep | null;
  nextStep?: RouteStep | null;
  activeRouteLabel?: string;
  theme?: 'dark' | 'amoled' | 'light';
}

export const DashcamOverlay: React.FC<DashcamOverlayProps> = ({
  recorder,
  viewMode,
  onChangeViewMode,
  gpsState,
  currentStep,
  nextStep,
  activeRouteLabel = 'Highway Navigation',
  theme = 'dark',
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (viewMode === 'hidden') return null;

  const isDark = theme !== 'light';
  const speed = gpsState?.speedKmh !== null && gpsState?.speedKmh !== undefined ? gpsState.speedKmh : 0;

  const handleSaveRecording = () => {
    recorder.saveToDevice();
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3500);
  };

  /* =========================================================================
   * MODE 1: PICTURE-IN-PICTURE (PiP) DOCKED OVER MAP
   * ========================================================================= */
  if (viewMode === 'pip') {
    return (
      <div className="absolute top-20 right-3 z-[600] w-48 sm:w-60 rounded-2xl overflow-hidden shadow-2xl border border-purple-500/40 bg-black/90 backdrop-blur-md animate-fadeIn transition-all">
        {/* Video feed container */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={recorder.videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Recording Badge */}
          {recorder.isRecording && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600/90 text-white mono text-[10px] font-bold shadow-md">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span>{formatDurationSec(recorder.recordingSeconds)}</span>
            </div>
          )}

          {/* Speed badge */}
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 border border-purple-500/30 text-white mono text-[10px] font-black">
            {speed} <span className="text-[8px] text-[#c084fc]">KM/H</span>
          </div>

          {/* Top-Right Quick Action Buttons */}
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChangeViewMode('hud')}
              className="p-1 rounded bg-black/60 hover:bg-black/90 text-white transition-colors cursor-pointer"
              title="Expand to Full HUD"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('hidden')}
              className="p-1 rounded bg-black/60 hover:bg-red-600 text-white transition-colors cursor-pointer"
              title="Close Dashcam"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Bottom PiP Control Bar */}
        <div className="p-2 flex items-center justify-between text-xs mono bg-[#0e071a] border-t border-purple-500/20">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={recorder.toggleCamera}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-purple-200 cursor-pointer"
              title="Switch Front/Rear Camera"
            >
              <RefreshCw className="w-3 h-3" />
            </button>

            <span className="text-[10px] text-purple-300 uppercase font-semibold">
              {recorder.recordingMode === 'timelapse' ? 'Timelapse' : 'Video'}
            </span>
          </div>

          {/* Shutter / Stop Button */}
          {recorder.isRecording ? (
            <button
              type="button"
              onClick={recorder.stopRecording}
              className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1 text-[11px] cursor-pointer"
            >
              <Square className="w-3 h-3 fill-white" /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={recorder.startRecording}
              className="px-2.5 py-1 rounded-lg bg-[#a855f7] hover:bg-[#9333ea] text-white font-bold flex items-center gap-1 text-[11px] cursor-pointer shadow-md"
            >
              <Disc className="w-3 h-3 text-red-300" /> REC
            </button>
          )}
        </div>

        {/* Save Recording Prompt if clip ready */}
        {recorder.recordedBlobUrl && !recorder.isRecording && (
          <div className="p-2 bg-purple-950/80 border-t border-purple-500/30 flex items-center justify-between">
            <span className="text-[10px] text-purple-200 truncate">Clip Ready!</span>
            <button
              type="button"
              onClick={handleSaveRecording}
              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3 h-3" /> Save
            </button>
          </div>
        )}
      </div>
    );
  }

  /* =========================================================================
   * MODE 2: FULLSCREEN HIGHWAY AR HUD (DASHBOARD OVERLAY OVER CAMERA)
   * ========================================================================= */
  return (
    <div className="fixed inset-0 z-[700] bg-black overflow-hidden flex flex-col justify-between animate-fadeIn select-none">
      {/* Background Fullscreen Native Camera Feed */}
      <video
        ref={recorder.videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover z-0"
      />

      {/* Subtle Road Vignette Gradient */}
      <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-t from-black/85 via-black/20 to-black/75" />

      {/* TOP HUD: Turn-by-turn guidance and Recording Status Bar */}
      <div className="relative z-20 p-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          {/* Turn Direction Card */}
          {currentStep ? (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-black/60 backdrop-blur-xl border border-purple-500/40 shadow-2xl text-white max-w-sm">
              <div className="w-10 h-10 rounded-xl bg-[#a855f7]/30 border border-[#a855f7]/60 flex items-center justify-center text-[#c084fc]">
                <Navigation2 className="w-6 h-6 rotate-45" />
              </div>
              <div>
                <div className="text-[11px] mono uppercase font-bold text-[#c084fc] flex items-center gap-1">
                  <span>{currentStep.distanceKm ? `${(currentStep.distanceKm * 1000).toFixed(0)}m` : 'Ahead'}</span>
                  <span>&middot;</span>
                  <span className="truncate max-w-[150px]">{currentStep.instruction}</span>
                </div>
                <div className="text-xs font-semibold text-gray-200 truncate max-w-[200px]">
                  {nextStep ? `Then ${nextStep.instruction}` : activeRouteLabel}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-xl border border-purple-500/30 text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#c084fc]" />
              <span className="text-xs mono font-bold uppercase tracking-wider">{activeRouteLabel}</span>
            </div>
          )}

          {/* Top-Right HUD Controls */}
          <div className="flex items-center gap-2">
            {/* Recording Badge */}
            {recorder.isRecording ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/90 text-white mono text-xs font-bold shadow-lg shadow-red-600/30">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                <span>REC {formatDurationSec(recorder.recordingSeconds)}</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-purple-500/30 text-purple-200 mono text-xs font-semibold">
                {recorder.recordingMode === 'timelapse'
                  ? `Timelapse (${recorder.timelapseIntervalSec}s)`
                  : 'Standard Video'}
              </div>
            )}

            <button
              type="button"
              onClick={() => onChangeViewMode('pip')}
              className="p-2.5 rounded-xl bg-black/60 backdrop-blur-xl border border-purple-500/30 text-white hover:bg-black/90 transition-colors cursor-pointer"
              title="Minimize to Map Picture-in-Picture"
            >
              <Minimize2 className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('hidden')}
              className="p-2.5 rounded-xl bg-black/60 backdrop-blur-xl border border-purple-500/30 text-white hover:bg-red-600 transition-colors cursor-pointer"
              title="Close Dashcam HUD"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM HUD: Telemetry Speedometer, Highway Label & Dashcam Controls */}
      <div className="relative z-20 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex flex-col sm:flex-row items-end justify-between gap-4">
        {/* Speedometer & Location Badge */}
        <div className="flex items-center gap-4">
          <div className="px-5 py-3 rounded-3xl bg-black/75 backdrop-blur-2xl border border-purple-500/50 shadow-2xl flex items-baseline gap-2 text-white">
            <span className="text-5xl sm:text-6xl font-black display tracking-tight leading-none text-white drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]">
              {speed}
            </span>
            <div className="flex flex-col">
              <span className="text-xs mono font-extrabold uppercase text-[#c084fc] leading-none">
                KM/H
              </span>
              <span className="text-[9px] mono uppercase text-gray-400 mt-1">SPEED</span>
            </div>
          </div>

          <div className="hidden sm:flex flex-col px-4 py-2.5 rounded-2xl bg-black/60 backdrop-blur-xl border border-purple-500/30 text-white">
            <div className="text-xs font-bold truncate max-w-[220px]">
              {gpsState?.addressLabel || 'Philippine Highway'}
            </div>
            <div className="text-[10px] mono text-purple-300 mt-0.5">
              {gpsState ? `${gpsState.lat.toFixed(4)}°, ${gpsState.lng.toFixed(4)}°` : 'Acquiring GPS…'}
            </div>
          </div>
        </div>

        {/* Center / Right Control Panel */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Flip Camera */}
          <button
            type="button"
            onClick={recorder.toggleCamera}
            className="p-3 rounded-2xl bg-black/70 backdrop-blur-xl border border-purple-500/30 text-white hover:bg-purple-900/40 transition-colors cursor-pointer"
            title="Switch Front/Rear Camera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {/* Mode Selector (Timelapse vs Normal) */}
          <button
            type="button"
            disabled={recorder.isRecording}
            onClick={() =>
              recorder.setRecordingMode(
                recorder.recordingMode === 'timelapse' ? 'normal' : 'timelapse'
              )
            }
            className="px-3.5 py-3 rounded-2xl bg-black/70 backdrop-blur-xl border border-purple-500/30 text-white mono text-xs font-bold hover:bg-purple-900/40 transition-colors disabled:opacity-40 cursor-pointer"
          >
            {recorder.recordingMode === 'timelapse' ? 'TIMELAPSE' : 'NORMAL'}
          </button>

          {/* Interval Selector (Only in Timelapse mode) */}
          {recorder.recordingMode === 'timelapse' && !recorder.isRecording && (
            <select
              value={recorder.timelapseIntervalSec}
              onChange={(e) => recorder.setTimelapseIntervalSec(Number(e.target.value))}
              className="px-3 py-3 rounded-2xl bg-black/70 backdrop-blur-xl border border-purple-500/30 text-white mono text-xs font-bold cursor-pointer outline-none"
            >
              <option value={0.5}>0.5s / frame</option>
              <option value={1}>1.0s / frame</option>
              <option value={2}>2.0s / frame</option>
              <option value={5}>5.0s / frame</option>
            </select>
          )}

          {/* REC / STOP Trigger Button */}
          {recorder.isRecording ? (
            <button
              type="button"
              onClick={recorder.stopRecording}
              className="px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black mono text-sm flex items-center gap-2 shadow-2xl shadow-red-600/40 transition-all cursor-pointer"
            >
              <Square className="w-4 h-4 fill-white" /> STOP REC
            </button>
          ) : (
            <button
              type="button"
              onClick={recorder.startRecording}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] hover:brightness-110 text-white font-black mono text-sm flex items-center gap-2 shadow-2xl shadow-purple-600/40 transition-all cursor-pointer"
            >
              <Disc className="w-5 h-5 text-red-300" /> START REC
            </button>
          )}

          {/* Save to Phone Storage Button */}
          {recorder.recordedBlobUrl && !recorder.isRecording && (
            <button
              type="button"
              onClick={handleSaveRecording}
              className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold mono text-xs flex items-center gap-1.5 shadow-xl transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{downloadSuccess ? 'Saved to Phone!' : 'Save Video'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
