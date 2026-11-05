import { useState, useRef, useCallback, useEffect } from 'react';
import { GpsPositionState } from '../utils/gpsAndGeocoding';

export type CameraFacingMode = 'environment' | 'user';
export type RecordingMode = 'normal' | 'timelapse';

export interface UseCameraRecorderOptions {
  effectiveGps?: GpsPositionState | null;
  currentRoadName?: string;
  defaultFacingMode?: CameraFacingMode;
}

export interface UseCameraRecorderResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraActive: boolean;
  cameraError: string | null;
  facingMode: CameraFacingMode;
  isRecording: boolean;
  isPaused: boolean;
  recordingMode: RecordingMode;
  recordingSeconds: number;
  timelapseIntervalSec: number;
  burnTelemetry: boolean;
  recordedBlobUrl: string | null;
  recordedBlob: Blob | null;
  recordedBlobSize: number;
  startCamera: (mode?: CameraFacingMode) => Promise<boolean>;
  stopCamera: () => void;
  toggleCamera: () => Promise<void>;
  setRecordingMode: (mode: RecordingMode) => void;
  setTimelapseIntervalSec: (sec: number) => void;
  setBurnTelemetry: (burn: boolean) => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  discardRecording: () => void;
  saveToDevice: (filenamePrefix?: string) => void;
  shareToPhotosOrApps: (filenamePrefix?: string) => Promise<boolean>;
}

export function useCameraRecorder({
  effectiveGps = null,
  currentRoadName = '',
  defaultFacingMode = 'environment',
}: UseCameraRecorderOptions = {}): UseCameraRecorderResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>(defaultFacingMode);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('timelapse');
  const [timelapseIntervalSec, setTimelapseIntervalSec] = useState<number>(1);
  const [burnTelemetry, setBurnTelemetry] = useState<boolean>(true);

  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedBlobSize, setRecordedBlobSize] = useState<number>(0);

  // References for MediaStream and Recorder
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Canvas refs for telemetry stamping and timelapse compositing
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderAnimFrameRef = useRef<number | null>(null);
  const timelapseIntervalTimerRef = useRef<number | null>(null);

  const gpsRef = useRef(effectiveGps);
  const roadNameRef = useRef(currentRoadName);
  useEffect(() => {
    gpsRef.current = effectiveGps;
    roadNameRef.current = currentRoadName;
  }, [effectiveGps, currentRoadName]);

  /**
   * Starts camera stream with environment (back) camera preference.
   */
  const startCamera = useCallback(
    async (mode: CameraFacingMode = facingMode): Promise<boolean> => {
      setCameraError(null);

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not supported on this browser or connection.');
        return false;
      }

      // Stop any existing tracks
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        mediaStreamRef.current = stream;
        setFacingMode(mode);
        setCameraActive(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        return true;
      } catch (err: any) {
        console.warn('Failed to start camera:', err);
        setCameraError(err?.message || 'Unable to access phone camera.');
        setCameraActive(false);
        return false;
      }
    },
    [facingMode]
  );

  /**
   * Stops camera stream and releases hardware.
   */
  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  /**
   * Toggles between front and rear cameras.
   */
  const toggleCamera = useCallback(async () => {
    const nextMode: CameraFacingMode = facingMode === 'environment' ? 'user' : 'environment';
    await startCamera(nextMode);
  }, [facingMode, startCamera]);

  /**
   * Draws telemetry overlay on canvas:
   * Speedometer, Road Name, Timestamp, Coordinates, and LAAGARN badge.
   */
  const drawTelemetryOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const gps = gpsRef.current;
      const road = roadNameRef.current || 'Philippine Highway';
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

      ctx.save();

      // Bottom Telemetry Bar Backdrop
      const barHeight = Math.max(50, height * 0.1);
      const gradient = ctx.createLinearGradient(0, height - barHeight - 20, 0, height);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.78)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, height - barHeight - 20, width, barHeight + 20);

      // Speedometer badge (Bottom Left)
      const speedKmh = gps?.speedKmh !== null && gps?.speedKmh !== undefined ? gps.speedKmh : 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px "Space Grotesk", sans-serif';
      ctx.fillText(`${speedKmh}`, 24, height - 28);

      ctx.fillStyle = '#c084fc';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.fillText('KM/H', 24 + ctx.measureText(`${speedKmh}`).width + 8, height - 32);

      // Road Name & Coordinates
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 15px sans-serif';
      const displayRoad = road.length > 35 ? road.slice(0, 35) + '…' : road;
      ctx.fillText(displayRoad, 24, height - 12);

      if (gps) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px "JetBrains Mono", monospace';
        const coordsText = `${gps.lat.toFixed(4)}°, ${gps.lng.toFixed(4)}°`;
        ctx.fillText(coordsText, 180, height - 12);
      }

      // Date / Time / App Logo (Bottom Right)
      ctx.textAlign = 'right';
      ctx.fillStyle = '#a855f7';
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.fillText('LAAGARN DASHCAM', width - 24, height - 34);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '13px "JetBrains Mono", monospace';
      ctx.fillText(`${dateStr} ${timeStr}`, width - 24, height - 16);

      ctx.restore();
    },
    []
  );

  /**
   * Starts video recording (standard or timelapse).
   */
  const startRecording = useCallback(() => {
    if (!mediaStreamRef.current || !videoRef.current) {
      startCamera().then((ok) => {
        if (ok) startRecording();
      });
      return;
    }

    recordedChunksRef.current = [];
    setRecordedBlobUrl(null);
    setRecordedBlobSize(0);
    setRecordingSeconds(0);
    setIsPaused(false);

    // Pick best supported MIME type
    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ];
    let selectedMime = '';
    for (const mime of mimeCandidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    // Set up canvas for rendering frames
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    let recordingStream: MediaStream;

    if (recordingMode === 'timelapse') {
      // Timelapse mode: capture at 30 fps stream, but only update canvas content on interval
      recordingStream = canvas.captureStream(30);

      // Render initial frame
      ctx.drawImage(video, 0, 0, width, height);
      if (burnTelemetry) {
        drawTelemetryOverlay(ctx, width, height);
      }

      // Frame sampler timer
      const intervalMs = Math.max(250, timelapseIntervalSec * 1000);
      timelapseIntervalTimerRef.current = window.setInterval(() => {
        if (!video || video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, width, height);
        if (burnTelemetry) {
          drawTelemetryOverlay(ctx, width, height);
        }
      }, intervalMs);
    } else {
      // Normal video mode
      if (burnTelemetry) {
        recordingStream = canvas.captureStream(30);
        const loop = () => {
          if (!video || video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, width, height);
          drawTelemetryOverlay(ctx, width, height);
          renderAnimFrameRef.current = requestAnimationFrame(loop);
        };
        renderAnimFrameRef.current = requestAnimationFrame(loop);
      } else {
        recordingStream = mediaStreamRef.current;
      }
    }

    try {
      const recorder = new MediaRecorder(
        recordingStream,
        selectedMime ? { mimeType: selectedMime } : undefined
      );

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: selectedMime || 'video/webm',
        });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedBlobUrl(url);
        setRecordedBlobSize(blob.size);
      };

      recorder.start(1000); // 1-second chunks
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Elapsed seconds timer
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Failed to start MediaRecorder:', err);
      setCameraError('Failed to initialize video recording.');
    }
  }, [burnTelemetry, recordingMode, timelapseIntervalSec, startCamera, drawTelemetryOverlay]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (timelapseIntervalTimerRef.current) {
      clearInterval(timelapseIntervalTimerRef.current);
      timelapseIntervalTimerRef.current = null;
    }
    if (renderAnimFrameRef.current) {
      cancelAnimationFrame(renderAnimFrameRef.current);
      renderAnimFrameRef.current = null;
    }
  }, []);

  const discardRecording = useCallback(() => {
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
    }
    setRecordedBlob(null);
    setRecordedBlobUrl(null);
    setRecordedBlobSize(0);
    setRecordingSeconds(0);
  }, [recordedBlobUrl]);

  /**
   * Downloads the recorded clip to the phone's storage.
   */
  const saveToDevice = useCallback(
    (filenamePrefix: string = 'laagarn_dashcam') => {
      if (!recordedBlobUrl || recordedChunksRef.current.length === 0) return;

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
      const modeTag = recordingMode === 'timelapse' ? 'timelapse' : 'clip';
      const extension = recordedChunksRef.current[0]?.type?.includes('mp4') ? 'mp4' : 'webm';
      const filename = `${filenamePrefix}_${modeTag}_${datePart}_${timePart}.${extension}`;

      const a = document.createElement('a');
      a.href = recordedBlobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [recordedBlobUrl, recordingMode]
  );

  /**
   * Triggers the native iOS / Android Web Share Sheet with the video file.
   * On iPhone (Safari), this opens the native sheet with "Save Video" to Camera Roll!
   */
  const shareToPhotosOrApps = useCallback(
    async (filenamePrefix: string = 'laagarn_dashcam'): Promise<boolean> => {
      if (!recordedBlob) {
        saveToDevice(filenamePrefix);
        return false;
      }

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
      const modeTag = recordingMode === 'timelapse' ? 'timelapse' : 'clip';
      const extension = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const filename = `${filenamePrefix}_${modeTag}_${datePart}_${timePart}.${extension}`;

      try {
        const file = new File([recordedBlob], filename, { type: recordedBlob.type });
        if (
          typeof navigator !== 'undefined' &&
          navigator.canShare &&
          navigator.canShare({ files: [file] })
        ) {
          await navigator.share({
            files: [file],
            title: 'LAAGARN Highway Recording',
            text: 'Highway recording from LAAGARN GPS Navigation',
          });
          return true;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // User dismissed the share sheet
          return false;
        }
        console.warn('Native share failed, falling back to download:', err);
      }

      // Fallback to regular file download
      saveToDevice(filenamePrefix);
      return true;
    },
    [recordedBlob, recordingMode, saveToDevice]
  );

  // Clean up timers and streams on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (timelapseIntervalTimerRef.current) clearInterval(timelapseIntervalTimerRef.current);
      if (renderAnimFrameRef.current) cancelAnimationFrame(renderAnimFrameRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (recordedBlobUrl) {
        URL.revokeObjectURL(recordedBlobUrl);
      }
    };
  }, []);

  return {
    videoRef,
    cameraActive,
    cameraError,
    facingMode,
    isRecording,
    isPaused,
    recordingMode,
    recordingSeconds,
    timelapseIntervalSec,
    burnTelemetry,
    recordedBlobUrl,
    recordedBlob,
    recordedBlobSize,
    startCamera,
    stopCamera,
    toggleCamera,
    setRecordingMode,
    setTimelapseIntervalSec,
    setBurnTelemetry,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    saveToDevice,
    shareToPhotosOrApps,
  };
}
