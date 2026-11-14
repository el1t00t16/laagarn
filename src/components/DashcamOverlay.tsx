import React, { useState } from 'react';
import {
  Camera,
  CameraOff,
  Play,
  Square,
  RefreshCw,
  Maximize2,
  Minimize2,
  X,
  Navigation2,
  Sparkles,
  Film,
} from 'lucide-react';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import { UseCameraRecorderResult } from '../hooks/useCameraRecorder';
import { RouteStep } from '../utils/routingEngine';
import { formatDurationSec } from '../utils/stravaRecorder';
import { DashcamPreviewModal } from './DashcamPreviewModal';

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
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [flashActive, setFlashActive] = useState(false);

  // Auto-pop preview modal as soon as a recording finishes
  const prevIsRecordingRef = React.useRef(recorder.isRecording);
  React.useEffect(() => {
    if (prevIsRecordingRef.current && !recorder.isRecording && recorder.recordedBlobUrl) {
      setShowPreviewModal(true);
    }
    prevIsRecordingRef.current = recorder.isRecording;
  }, [recorder.isRecording, recorder.recordedBlobUrl]);

  const handleSaveRecording = () => {
    recorder.saveToDevice();
  };

  const handleTakeSnapshot = async () => {
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 180);
    const ok = await recorder.capturePhotoSnapshot();
    if (ok) {
      setShowPreviewModal(true);
    }
  };

  if (viewMode === 'hidden') {
    return (
      <>
        {/* Recovery banner if a previous video/photo was preserved from an interrupted session */}
        {recorder.hasRecoveredRecording && recorder.recordedBlobUrl && !showPreviewModal && (
          <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] left-3 right-3 max-w-md mx-auto z-[900] p-3 rounded-2xl bg-[#120824]/95 backdrop-blur-xl border border-emerald-500/50 shadow-2xl flex items-center justify-between gap-2.5 text-white animate-fadeIn">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="text-xs font-bold truncate">
                Recovered Dashcam Clip ({(recorder.recordedBlobSize / (1024 * 1024)).toFixed(1)} MB)
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="px-3 py-1.5 bg-emerald-600 active:scale-95 text-white mono text-[10px] font-bold uppercase rounded-xl cursor-pointer"
              >
                Open
              </button>
              <button
                type="button"
                onClick={recorder.discardRecording}
                className="p-1.5 text-gray-400 hover:text-white mono text-xs cursor-pointer"
                aria-label="Dismiss recovered recording"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <DashcamPreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          videoUrl={recorder.recordedBlobUrl}
          videoSize={recorder.recordedBlobSize}
          durationSeconds={recorder.recordingSeconds}
          mode={recorder.recordingMode}
          mediaKind={recorder.capturedMediaKind}
          mimeType={recorder.videoMimeType}
          onSaveToDevice={handleSaveRecording}
          onShareToPhotos={recorder.shareToPhotosOrApps}
          onDiscard={recorder.discardRecording}
          theme={theme}
        />
      </>
    );
  }

  const speed =
    gpsState?.speedKmh !== null && gpsState?.speedKmh !== undefined
      ? Math.max(0, Math.round(gpsState.speedKmh))
      : 0;

  /* =========================================================================
   * MODE 1: MOBILE PICTURE-IN-PICTURE (PiP) FLOATING WINDOW OVER MAP
   * ========================================================================= */
  if (viewMode === 'pip') {
    return (
      <>
        <div className="cockpit-shell fixed top-[calc(7.1rem+env(safe-area-inset-top,0px))] lg:top-16 right-3 lg:right-4 z-[600] w-44 lg:w-56 rounded-2xl overflow-hidden animate-fadeIn select-none border-[var(--accent)]/45">
          {/* Live Camera Preview */}
          <div className="relative h-48 lg:h-52 bg-[#090410] flex items-center justify-center overflow-hidden">
            <video
              ref={recorder.videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity ${
                recorder.cameraActive ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {!recorder.cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center gap-2 bg-gradient-to-b from-[#160a2a] to-[#090410]">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/35 flex items-center justify-center text-[#c084fc]">
                  <CameraOff className="w-4.5 h-4.5" />
                </div>
                <p className="text-[11px] font-medium text-purple-100/85 leading-snug line-clamp-2">
                  {recorder.cameraError ? 'Camera blocked' : 'Camera standby'}
                </p>
                <button
                  type="button"
                  onClick={() => recorder.startCamera()}
                  className="px-2.5 py-1 rounded-lg bg-[#a855f7] hover:bg-[#9333ea] text-white text-[10px] font-semibold cursor-pointer active:scale-95 transition-all"
                >
                  Retry Feed
                </button>
              </div>
            )}

            {flashActive && <div className="absolute inset-0 bg-white/80 pointer-events-none" />}

            {/* Recording Status Pill */}
            {recorder.isRecording ? (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600/95 text-white mono text-[10px] font-bold shadow-md">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span>{formatDurationSec(recorder.recordingSeconds)}</span>
              </div>
            ) : (
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/65 border border-purple-500/30 text-purple-200 mono text-[9px] font-bold uppercase">
                {recorder.recordingMode === 'timelapse' ? 'TL' : 'VID'}
              </div>
            )}

            {/* Top-Right PiP Controls */}
            <div className="absolute top-2 right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChangeViewMode('hud')}
                className="w-7 h-7 rounded-lg bg-black/65 active:scale-95 text-white flex items-center justify-center cursor-pointer"
                title="Expand Fullscreen HUD"
                aria-label="Expand Fullscreen HUD"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('hidden')}
                className="w-7 h-7 rounded-lg bg-black/65 active:bg-red-600 text-white flex items-center justify-center cursor-pointer"
                title="Close Dashcam"
                aria-label="Close Dashcam"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Clean Bottom Mini-HUD inside PiP */}
            <div className="absolute inset-x-1.5 bottom-1.5 px-2 py-1 rounded-xl bg-black/75 backdrop-blur-md border border-purple-500/30 flex items-center justify-between text-white">
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-black leading-none">{speed}</span>
                <span className="text-[8px] mono text-[#c084fc] font-bold">KM/H</span>
              </div>
              {recorder.facingMode === 'environment' && recorder.supportsUltraWide && (
                <button
                  type="button"
                  onClick={() =>
                    recorder.setLensZoom(recorder.currentLens === '0.5x' ? '1x' : '0.5x')
                  }
                  className={`px-1.5 py-0.5 rounded text-[9px] mono font-bold cursor-pointer ${
                    recorder.currentLens === '0.5x'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-purple-200'
                  }`}
                >
                  {recorder.currentLens}
                </button>
              )}
            </div>
          </div>

          {/* PiP Action Bar */}
          <div className="p-1.5 flex items-center justify-between gap-1 bg-[#0e071a] border-t border-purple-500/25">
            <button
              type="button"
              onClick={recorder.toggleCamera}
              className="w-8 h-8 rounded-xl bg-white/10 active:scale-95 text-purple-200 flex items-center justify-center cursor-pointer"
              title="Flip Camera"
              aria-label="Flip Camera"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {recorder.isRecording ? (
              <button
                type="button"
                onClick={recorder.stopRecording}
                className="flex-1 h-8 rounded-xl bg-red-600 active:scale-95 text-white mono font-bold flex items-center justify-center gap-1 text-[10px] cursor-pointer"
              >
                <Square className="w-3 h-3 fill-white" /> STOP
              </button>
            ) : (
              <button
                type="button"
                onClick={recorder.startRecording}
                className="flex-1 h-8 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#7c3aed] active:scale-95 text-white mono font-bold flex items-center justify-center gap-1 text-[10px] cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-red-400" /> REC
              </button>
            )}

            <button
              type="button"
              onClick={handleTakeSnapshot}
              className="w-8 h-8 rounded-xl bg-white/10 active:scale-95 text-white flex items-center justify-center cursor-pointer"
              title="Take Watermarked Photo"
              aria-label="Take Watermarked Photo"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          {recorder.recordedBlobUrl && !recorder.isRecording && (
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              className="w-full py-1.5 px-2 bg-emerald-600/90 active:bg-emerald-500 text-white mono text-[10px] font-bold uppercase flex items-center justify-center gap-1 cursor-pointer"
            >
              <Play className="w-3 h-3 fill-white" /> View Last Capture
            </button>
          )}
        </div>

        <DashcamPreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          videoUrl={recorder.recordedBlobUrl}
          videoSize={recorder.recordedBlobSize}
          durationSeconds={recorder.recordingSeconds}
          mode={recorder.recordingMode}
          mediaKind={recorder.capturedMediaKind}
          mimeType={recorder.videoMimeType}
          onSaveToDevice={handleSaveRecording}
          onShareToPhotos={recorder.shareToPhotosOrApps}
          onDiscard={recorder.discardRecording}
          theme={theme}
        />
      </>
    );
  }

  /* =========================================================================
   * MODE 2: FULLSCREEN MOBILE CAMERA & AR DASHCAM HUD
   * ========================================================================= */
  return (
    <div className="fixed inset-0 z-[700] bg-black overflow-hidden flex flex-col justify-between animate-fadeIn select-none">
      {/* Fullscreen Camera Feed */}
      <video
        ref={recorder.videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity ${
          recorder.cameraActive ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {!recorder.cameraActive && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center px-6 text-center bg-gradient-to-b from-[#130724] via-[#090410] to-[#05020a]">
          <div className="cockpit-card max-w-xs p-5 flex flex-col items-center gap-3 border-purple-500/35">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-[#c084fc]">
              <CameraOff className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Camera Feed Standby</h3>
              <p className="text-xs text-purple-200/75 mt-1 leading-relaxed">
                {recorder.cameraError || 'Grant camera access or connect a webcam to stream live video behind the telemetry HUD.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => recorder.startCamera()}
              className="btn-primary py-2.5 px-4 w-auto min-h-[38px] text-xs mt-0"
            >
              Enable Camera
            </button>
          </div>
        </div>
      )}

      {/* Camera Shutter Flash Feedback */}
      {flashActive && <div className="absolute inset-0 z-30 bg-white/80 pointer-events-none" />}

      {/* Subtle Top & Bottom Contrast Vignette */}
      <div className="absolute inset-0 z-10 pointer-events-none bg-gradient-to-b from-black/70 via-transparent to-black/85" />

      {/* TOP SAFE-AREA BAR */}
      <div className="relative z-20 px-3.5 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] flex flex-col gap-2.5 max-w-lg w-full mx-auto">
        <div className="flex items-center justify-between gap-2">
          {/* Recording / Mode Pill */}
          <div className="flex items-center gap-2 min-w-0">
            {recorder.isRecording ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/95 text-white mono text-xs font-bold shadow-lg shadow-red-600/40">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>REC {formatDurationSec(recorder.recordingSeconds)}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => recorder.setBurnTelemetry(!recorder.burnTelemetry)}
                className={`px-3 py-1.5 rounded-full backdrop-blur-xl border mono text-[11px] font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
                  recorder.burnTelemetry
                    ? 'bg-purple-950/75 border-purple-400/50 text-purple-200'
                    : 'bg-black/60 border-white/20 text-gray-400'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#c084fc]" />
                <span>HUD Stamp: {recorder.burnTelemetry ? 'ON' : 'OFF'}</span>
              </button>
            )}
          </div>

          {/* Minimize & Exit Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onChangeViewMode('pip')}
              className="w-10 h-10 rounded-2xl bg-black/65 backdrop-blur-xl border border-purple-500/35 text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Minimize to Picture-in-Picture"
              aria-label="Minimize to Picture-in-Picture"
            >
              <Minimize2 className="w-4.5 h-4.5" />
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('hidden')}
              className="h-10 px-3 rounded-2xl bg-red-600/90 active:scale-95 backdrop-blur-xl border border-red-400/50 text-white flex items-center gap-1 font-bold mono text-xs cursor-pointer shadow-lg"
              title="Close Dashcam"
              aria-label="Close Dashcam"
            >
              <X className="w-4.5 h-4.5 stroke-[2.5]" />
              <span>Exit</span>
            </button>
          </div>
        </div>

        {/* Camera Error Notice */}
        {recorder.cameraError && (
          <div className="p-3 rounded-2xl bg-red-950/90 border border-red-500/50 text-red-200 text-xs font-semibold">
            {recorder.cameraError}
          </div>
        )}

        {/* Turn-by-Turn Guidance Card (when navigating) */}
        {currentStep && (
          <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-black/75 backdrop-blur-xl border border-purple-500/40 shadow-2xl text-white">
            <div className="w-9 h-9 rounded-xl bg-[#a855f7]/30 border border-[#a855f7]/60 flex items-center justify-center text-[#c084fc] shrink-0">
              <Navigation2 className="w-5 h-5 rotate-45" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] mono uppercase font-bold text-[#c084fc] flex items-center gap-1.5 truncate">
                <span className="shrink-0">
                  {currentStep.distanceKm ? `${(currentStep.distanceKm * 1000).toFixed(0)}m` : 'Ahead'}
                </span>
                <span>&middot;</span>
                <span className="truncate">{currentStep.instruction}</span>
              </div>
              <div className="text-xs font-semibold text-gray-200 truncate">
                {nextStep ? `Then ${nextStep.instruction}` : activeRouteLabel}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM NATIVE MOBILE CAMERA CONTROLS & LIVE WATERMARK PREVIEW */}
      <div className="relative z-20 px-3.5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-3 max-w-lg w-full mx-auto">
        {/* Lens Zoom (0.5x / 1x) & Recording Mode Selector Pills */}
        <div className="flex items-center justify-between gap-2">
          {/* 0.5x / 1x Lens Pill */}
          {recorder.facingMode === 'environment' && recorder.supportsUltraWide ? (
            <div className="flex items-center p-1 rounded-full bg-black/75 backdrop-blur-xl border border-purple-500/35">
              {(['0.5x', '1x'] as const).map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => recorder.setLensZoom(z)}
                  className={`px-3 py-1 rounded-full mono text-xs font-black transition-all cursor-pointer ${
                    recorder.currentLens === z
                      ? 'bg-[#a855f7] text-white shadow'
                      : 'text-purple-200/80'
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          ) : (
            <div />
          )}

          {/* Video vs Timelapse Segmented Control */}
          <div className="flex items-center gap-1.5">
            {!recorder.isRecording && (
              <div className="flex items-center p-1 rounded-full bg-black/75 backdrop-blur-xl border border-purple-500/35">
                <button
                  type="button"
                  onClick={() => recorder.setRecordingMode('timelapse')}
                  className={`px-3 py-1 rounded-full mono text-[11px] font-bold uppercase transition-all cursor-pointer ${
                    recorder.recordingMode === 'timelapse'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-300'
                  }`}
                >
                  Timelapse
                </button>
                <button
                  type="button"
                  onClick={() => recorder.setRecordingMode('normal')}
                  className={`px-3 py-1 rounded-full mono text-[11px] font-bold uppercase transition-all cursor-pointer ${
                    recorder.recordingMode === 'normal'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-300'
                  }`}
                >
                  Video
                </button>
              </div>
            )}

            {recorder.recordingMode === 'timelapse' && !recorder.isRecording && (
              <select
                value={recorder.timelapseIntervalSec}
                onChange={(e) => recorder.setTimelapseIntervalSec(Number(e.target.value))}
                aria-label="Timelapse frame interval"
                className="h-8 px-2.5 rounded-full bg-black/75 backdrop-blur-xl border border-purple-500/35 text-purple-200 mono text-xs font-bold outline-none cursor-pointer"
              >
                <option value={0.5}>0.5s</option>
                <option value={1}>1s</option>
                <option value={2}>2s</option>
                <option value={5}>5s</option>
              </select>
            )}
          </div>
        </div>

        {/* Clean Live HUD Card (Matches Recorded Watermark Layout — Zero Overlap!) */}
        <div className="p-3 rounded-2xl bg-[#10081e]/88 backdrop-blur-2xl border border-purple-500/45 shadow-2xl flex items-center gap-3 text-white">
          <div className="w-1.5 self-stretch rounded-full bg-gradient-to-b from-[#c084fc] to-[#7c3aed] shrink-0" />
          <div className="pr-3 border-r border-purple-500/25 text-center min-w-[68px] shrink-0">
            <div className="text-3xl font-black mono leading-none tracking-tight tabular-nums">{speed}</div>
            <div className="text-[9px] mono font-extrabold text-[#c084fc] mt-1 tracking-wider">KM/H</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[9.5px] mono font-bold">
              <span className="text-[#c084fc] flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7] shrink-0" />
                <span className="truncate">
                  LAAGARN GPS{recorder.currentLens === '0.5x' ? ' · 0.5x' : ''}
                  {recorder.recordingMode === 'timelapse' ? ' · TL' : ''}
                </span>
              </span>
              <span className="text-purple-200/80 shrink-0 tabular-nums">
                {recorder.isRecording ? `REC ${formatDurationSec(recorder.recordingSeconds)}` : 'LIVE HUD'}
              </span>
            </div>
            <div className="text-sm font-bold text-white truncate mt-0.5 leading-snug">
              {gpsState?.addressLabel || activeRouteLabel || 'Philippine Highway'}
            </div>
            <div className="text-[10.5px] mono text-indigo-200/90 truncate mt-0.5 tabular-nums">
              {gpsState
                ? `${Math.abs(gpsState.lat).toFixed(4)}° ${gpsState.lat >= 0 ? 'N' : 'S'}, ${Math.abs(
                    gpsState.lng
                  ).toFixed(4)}° ${gpsState.lng >= 0 ? 'E' : 'W'}`
                : 'GPS satellite lock pending'}
            </div>
          </div>
        </div>

        {/* Native Mobile Camera Shutter Bar */}
        <div className="pt-1 flex items-center justify-around">
          {/* Left: Flip Front/Back Camera OR Open Last Capture */}
          <div className="flex items-center gap-2.5 w-24 justify-start">
            <button
              type="button"
              onClick={recorder.toggleCamera}
              className="w-12 h-12 rounded-full bg-black/70 backdrop-blur-xl border border-white/20 text-white flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
              title="Flip Camera"
              aria-label="Flip Camera"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* Center: Tactile Circular Video REC / STOP Shutter Ring */}
          {recorder.isRecording ? (
            <button
              type="button"
              onClick={recorder.stopRecording}
              aria-label="Stop Recording"
              className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center bg-black/40 active:scale-95 transition-all cursor-pointer shadow-[0_0_25px_rgba(239,68,68,0.6)]"
            >
              <span className="w-7 h-7 rounded-lg bg-red-500 block" />
            </button>
          ) : (
            <button
              type="button"
              onClick={recorder.startRecording}
              aria-label="Start Video Recording"
              className="w-[72px] h-[72px] rounded-full border-4 border-white p-1.5 flex items-center justify-center bg-black/30 active:scale-95 transition-all cursor-pointer shadow-[0_0_25px_rgba(168,85,247,0.5)]"
            >
              <span className="w-full h-full rounded-full bg-gradient-to-br from-red-500 via-[#ec4899] to-[#a855f7] block" />
            </button>
          )}

          {/* Right: 1-Tap Watermarked Photo Snapshot + Last Clip Pill */}
          <div className="flex items-center gap-2 w-24 justify-end">
            {recorder.recordedBlobUrl && !recorder.isRecording && (
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="w-11 h-11 rounded-2xl bg-emerald-600/90 border border-emerald-400/60 text-white flex items-center justify-center active:scale-90 transition-transform cursor-pointer shadow-lg"
                title="Preview & Save Last Capture"
                aria-label="Preview & Save Last Capture"
              >
                <Film className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleTakeSnapshot}
              className="w-12 h-12 rounded-full bg-black/70 backdrop-blur-xl border border-purple-400/40 text-white flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
              title="Snap Watermarked Photo"
              aria-label="Snap Watermarked Photo"
            >
              <Camera className="w-5 h-5 text-[#c084fc]" />
            </button>
          </div>
        </div>
      </div>

      {/* Preview & Native Share Sheet Modal */}
      <DashcamPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        videoUrl={recorder.recordedBlobUrl}
        videoSize={recorder.recordedBlobSize}
        durationSeconds={recorder.recordingSeconds}
        mode={recorder.recordingMode}
        mediaKind={recorder.capturedMediaKind}
        mimeType={recorder.videoMimeType}
        onSaveToDevice={handleSaveRecording}
        onShareToPhotos={recorder.shareToPhotosOrApps}
        onDiscard={recorder.discardRecording}
        theme={theme}
      />
    </div>
  );
};
