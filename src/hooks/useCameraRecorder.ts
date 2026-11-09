import { useState, useRef, useCallback, useEffect } from 'react';
import { GpsPositionState } from '../utils/gpsAndGeocoding';

export type CameraFacingMode = 'environment' | 'user';
export type RecordingMode = 'normal' | 'timelapse';
export type LensZoom = '0.5x' | '1x';

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
  currentLens: LensZoom;
  supportsUltraWide: boolean;
  setLensZoom: (zoom: LensZoom) => Promise<boolean>;
  isRecording: boolean;
  isPaused: boolean;
  recordingMode: RecordingMode;
  recordingSeconds: number;
  timelapseIntervalSec: number;
  burnTelemetry: boolean;
  recordedBlobUrl: string | null;
  recordedBlob: Blob | null;
  recordedBlobSize: number;
  videoMimeType: string;
  hasRecoveredRecording: boolean;
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

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (typeof navigator.platform === 'string' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1));

/**
 * IndexedDB backup helpers to prevent recorded videos from disappearing
 * even if the mobile browser crashes or refreshes during a drive.
 */
function saveBackupRecording(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve();
      const req = indexedDB.open('laagarn_dashcam_db', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('recordings')) {
          req.result.createObjectStore('recordings');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('recordings', 'readwrite');
        tx.objectStore('recordings').put(blob, 'latest_recording');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function loadBackupRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open('laagarn_dashcam_db', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('recordings')) {
          req.result.createObjectStore('recordings');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('recordings')) return resolve(null);
        const tx = db.transaction('recordings', 'readonly');
        const getReq = tx.objectStore('recordings').get('latest_recording');
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function deleteBackupRecording(): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve();
      const req = indexedDB.open('laagarn_dashcam_db', 1);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('recordings')) return resolve();
        const tx = db.transaction('recordings', 'readwrite');
        tx.objectStore('recordings').delete('latest_recording');
        tx.oncomplete = () => resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
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
  const [hasRecoveredRecording, setHasRecoveredRecording] = useState<boolean>(false);
  const recordedBlobRef = useRef<Blob | null>(null);
  const [videoMimeType, setVideoMimeType] = useState<string>(isIOS ? 'video/mp4' : 'video/webm');
  const selectedMimeRef = useRef<string>(isIOS ? 'video/mp4' : 'video/webm');

  // Attempt to recover previously recorded video from IndexedDB in case of unexpected tab reload/close
  useEffect(() => {
    loadBackupRecording().then((blob) => {
      if (blob && blob.size > 0 && !recordedBlobRef.current) {
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        recordedBlobRef.current = blob;
        setRecordedBlobUrl(url);
        setRecordedBlobSize(blob.size);
        setHasRecoveredRecording(true);
      }
    }).catch(() => {});
  }, []);

  // Prevent accidental tab closure while actively recording
  useEffect(() => {
    if (!isRecording) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Dashcam recording is active. Leaving now will stop the recording.';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRecording]);

  // Lens selection (0.5x Ultra-Wide vs 1x Standard Wide)
  const [currentLens, setCurrentLens] = useState<LensZoom>('1x');
  const [supportsUltraWide, setSupportsUltraWide] = useState<boolean>(isIOS);
  const wideDeviceIdRef = useRef<string | null>(null);
  const ultraWideDeviceIdRef = useRef<string | null>(null);
  const currentLensRef = useRef<LensZoom>('1x');

  useEffect(() => {
    currentLensRef.current = currentLens;
  }, [currentLens]);

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
   * Scans available video cameras to detect ultra-wide (0.5x) vs standard (1x) lenses.
   */
  const detectAndCategorizeCameras = useCallback(async (activeStream?: MediaStream) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');

      let foundWideId: string | null = null;
      let foundUltraWideId: string | null = null;
      const backCams: MediaDeviceInfo[] = [];

      videoInputs.forEach((dev) => {
        const lbl = (dev.label || '').toLowerCase();
        if (
          lbl.includes('front') ||
          lbl.includes('user') ||
          lbl.includes('selfie') ||
          lbl.includes('facetime')
        ) {
          return;
        }
        backCams.push(dev);

        if (
          lbl.includes('ultra') ||
          lbl.includes('0.5') ||
          lbl.includes('super wide') ||
          lbl.includes('wide-angle')
        ) {
          foundUltraWideId = dev.deviceId;
        } else if (lbl.includes('back') || lbl.includes('wide') || lbl.includes('main')) {
          if (!foundWideId) foundWideId = dev.deviceId;
        }
      });

      // If ultra-wide was not matched by keyword, dual camera phones (e.g. iPhone 11/12/13/14)
      // expose standard wide as camera 0 and ultra-wide as camera 1
      if (!foundUltraWideId && backCams.length >= 2) {
        foundWideId = foundWideId || backCams[0].deviceId;
        foundUltraWideId = backCams[1].deviceId;
      }

      if (foundWideId) wideDeviceIdRef.current = foundWideId;
      if (foundUltraWideId) ultraWideDeviceIdRef.current = foundUltraWideId;

      // Also check track zoom capabilities if supported
      const track = (activeStream || mediaStreamRef.current)?.getVideoTracks()[0];
      let hasZoomCap = false;
      if (track && typeof track.getCapabilities === 'function') {
        const caps: any = track.getCapabilities();
        if (caps && caps.zoom && typeof caps.zoom.min === 'number' && caps.zoom.min <= 0.6) {
          hasZoomCap = true;
        }
      }

      const hasUltraWide = Boolean(
        foundUltraWideId || hasZoomCap || (isIOS && backCams.length >= 2) || isIOS
      );
      setSupportsUltraWide(hasUltraWide);
    } catch (err) {
      console.warn('Failed to enumerate camera devices:', err);
    }
  }, []);

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
        const targetDeviceId =
          mode === 'environment' && currentLensRef.current === '0.5x'
            ? ultraWideDeviceIdRef.current
            : mode === 'environment' && currentLensRef.current === '1x'
            ? wideDeviceIdRef.current
            : undefined;

        const videoConstraints: MediaTrackConstraints = targetDeviceId
          ? {
              deviceId: { exact: targetDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }
          : {
              facingMode: { ideal: mode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        mediaStreamRef.current = stream;
        setFacingMode(mode);
        setCameraActive(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        // Detect cameras once stream permission is granted
        detectAndCategorizeCameras(stream);
        return true;
      } catch (err: any) {
        console.warn('Failed to start camera:', err);
        setCameraError(err?.message || 'Unable to access phone camera.');
        setCameraActive(false);
        return false;
      }
    },
    [facingMode, detectAndCategorizeCameras]
  );

  /**
   * Switches between 0.5x Ultra-Wide and 1x Standard Wide lenses.
   */
  const setLensZoom = useCallback(
    async (zoom: LensZoom): Promise<boolean> => {
      currentLensRef.current = zoom;
      setCurrentLens(zoom);

      if (facingMode !== 'environment') {
        return false;
      }

      // 1. Try track hardware zoom constraint if supported
      const currentTrack = mediaStreamRef.current?.getVideoTracks()[0];
      if (currentTrack && typeof currentTrack.getCapabilities === 'function') {
        const caps: any = currentTrack.getCapabilities();
        if (caps && caps.zoom) {
          const targetZoom = zoom === '0.5x' ? (caps.zoom.min <= 0.6 ? caps.zoom.min : 0.5) : 1;
          try {
            await currentTrack.applyConstraints({ advanced: [{ zoom: targetZoom } as any] });
            return true;
          } catch (err) {
            console.warn('Track zoom constraint failed, switching via deviceId:', err);
          }
        }
      }

      // 2. Multi-camera deviceId switch (iOS Safari ultra-wide camera)
      if (!ultraWideDeviceIdRef.current || !wideDeviceIdRef.current) {
        await detectAndCategorizeCameras();
      }

      const targetDeviceId = zoom === '0.5x' ? ultraWideDeviceIdRef.current : wideDeviceIdRef.current;

      try {
        const streamConstraints: MediaStreamConstraints = {
          video: targetDeviceId
            ? {
                deviceId: { exact: targetDeviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
          audio: false,
        };

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        }

        const newStream = await navigator.mediaDevices.getUserMedia(streamConstraints);
        mediaStreamRef.current = newStream;

        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          videoRef.current.play().catch(() => {});
        }

        detectAndCategorizeCameras(newStream);
        return true;
      } catch (err: any) {
        console.warn(`Failed to switch to ${zoom} lens:`, err);
        return false;
      }
    },
    [facingMode, detectAndCategorizeCameras]
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
   * Draws prominent, high-contrast, social-ready telemetry overlay on canvas:
   * Extra-Large Speedometer with neon purple glow, destination/highway banner,
   * GPS coordinates, live timestamp, and prominent LAAGARN GPS DASHCAM badge.
   */
  const drawTelemetryOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const gps = gpsRef.current;
      const road = roadNameRef.current || 'Philippine Highway';
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

      ctx.save();

      // Dynamic scaling factor relative to canvas height (optimized for 720p / 1080p social sharing)
      const scale = Math.max(1.3, height / 500);

      // Deep, vibrant contrast bottom banner with gradient
      const barHeight = Math.max(120, Math.round(105 * scale));
      const gradient = ctx.createLinearGradient(0, height - barHeight - 40, 0, height);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.3, 'rgba(10, 4, 22, 0.75)');
      gradient.addColorStop(1, 'rgba(6, 2, 14, 0.95)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, height - barHeight - 40, width, barHeight + 40);

      // 1. EXTRA-LARGE SPEEDOMETER BADGE (Bottom Left - Social Ready!)
      const speedKmh = gps?.speedKmh !== null && gps?.speedKmh !== undefined ? gps.speedKmh : 0;
      const speedStr = `${speedKmh}`;

      ctx.shadowColor = 'rgba(168, 85, 247, 0.9)';
      ctx.shadowBlur = Math.round(14 * scale);
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.round(54 * scale)}px "Space Grotesk", sans-serif`;
      const leftMargin = Math.round(24 * scale);
      ctx.fillText(speedStr, leftMargin, height - Math.round(40 * scale));

      // Reset shadow for subsequent clean rendering
      ctx.shadowBlur = 0;

      // "KM/H" unit tag
      ctx.fillStyle = '#c084fc';
      ctx.font = `900 ${Math.round(16 * scale)}px "JetBrains Mono", monospace`;
      const speedWidth = ctx.measureText(speedStr).width;
      ctx.fillText('KM/H', leftMargin + speedWidth + Math.round(8 * scale), height - Math.round(46 * scale));

      // 2. ROAD NAME & DESTINATION
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(18 * scale)}px sans-serif`;
      const displayRoad = road.length > 36 ? road.slice(0, 36) + '…' : road;
      ctx.fillText(displayRoad, leftMargin, height - Math.round(15 * scale));

      // 3. GPS COORDINATES
      if (gps) {
        ctx.fillStyle = '#a5b4fc';
        ctx.font = `600 ${Math.round(13 * scale)}px "JetBrains Mono", monospace`;
        const coordsText = `${gps.lat.toFixed(4)}°, ${gps.lng.toFixed(4)}°`;
        ctx.fillText(coordsText, leftMargin + speedWidth + Math.round(80 * scale), height - Math.round(46 * scale));
      }

      // 4. PROMINENT LAAGARN GPS DASHCAM BADGE (Bottom Right - High Social Flex!)
      ctx.textAlign = 'right';
      const rightMargin = width - Math.round(24 * scale);
      const lensSuffix = currentLensRef.current === '0.5x' ? ' · 0.5x ULTRA' : '';
      const brandHeading = `LAAGARN GPS · DASHCAM${lensSuffix}`;

      // Glowing brand text
      ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
      ctx.shadowBlur = Math.round(10 * scale);
      ctx.fillStyle = '#c084fc';
      ctx.font = `900 ${Math.round(18 * scale)}px "JetBrains Mono", monospace`;
      ctx.fillText(brandHeading, rightMargin, height - Math.round(40 * scale));

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `700 ${Math.round(14 * scale)}px "JetBrains Mono", monospace`;
      ctx.fillText(`${dateStr} ${timeStr}`, rightMargin, height - Math.round(16 * scale));

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

    // Prioritize MP4 (H.264) for iOS Photos (Camera Roll), WhatsApp, and universal compatibility.
    // iOS and Apple Photos strictly reject WebM video files.
    const mimeCandidates = [
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    let selectedMime = '';
    for (const mime of mimeCandidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }
    if (!selectedMime && isIOS) {
      selectedMime = 'video/mp4';
    }
    selectedMimeRef.current = selectedMime || (isIOS ? 'video/mp4' : 'video/webm');
    setVideoMimeType(selectedMimeRef.current);

    // Set up canvas with safe capped dimensions (max 1280x720) to prevent WebProcess OOM crashes on mobile Safari
    const video = videoRef.current;
    const rawW = video.videoWidth || 1280;
    const rawH = video.videoHeight || 720;
    const aspect = rawW / Math.max(1, rawH);

    let width = 1280;
    let height = 720;
    if (rawW > rawH) {
      width = Math.min(1280, rawW);
      height = Math.round(width / aspect);
    } else {
      height = Math.min(1280, rawH);
      width = Math.round(height * aspect);
    }

    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;

    let recordingStream: MediaStream;

    if (recordingMode === 'timelapse') {
      // Timelapse mode: capture at 10 fps stream with controlled bitrate to prevent RAM saturation
      recordingStream = canvas.captureStream(10);

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
        {
          mimeType: selectedMime ? selectedMime : undefined,
          videoBitsPerSecond: recordingMode === 'timelapse' ? 1_500_000 : 2_500_000,
        }
      );

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mime = selectedMimeRef.current || (isIOS ? 'video/mp4' : 'video/webm');
        const blob = new Blob(recordedChunksRef.current, {
          type: mime,
        });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        recordedBlobRef.current = blob;
        setRecordedBlobUrl(url);
        setRecordedBlobSize(blob.size);
        setHasRecoveredRecording(false);
        saveBackupRecording(blob);
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
    recordedBlobRef.current = null;
    setRecordedBlobUrl(null);
    setRecordedBlobSize(0);
    setRecordingSeconds(0);
    setHasRecoveredRecording(false);
    deleteBackupRecording();
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
      const isMp4 =
        (recordedBlob?.type || selectedMimeRef.current || '').toLowerCase().includes('mp4') ||
        isIOS;
      const extension = isMp4 ? 'mp4' : 'webm';
      const filename = `${filenamePrefix}_${modeTag}_${datePart}_${timePart}.${extension}`;

      const a = document.createElement('a');
      a.href = recordedBlobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [recordedBlobUrl, recordingMode, recordedBlob]
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
      const isMp4 =
        (recordedBlob?.type || selectedMimeRef.current || '').toLowerCase().includes('mp4') ||
        isIOS;
      const extension = isMp4 ? 'mp4' : 'webm';
      const mimeType = isMp4 ? 'video/mp4' : (recordedBlob?.type || 'video/webm');
      const filename = `${filenamePrefix}_${modeTag}_${datePart}_${timePart}.${extension}`;

      try {
        const file = new File([recordedBlob], filename, { type: mimeType });
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
    currentLens,
    supportsUltraWide,
    setLensZoom,
    isRecording,
    isPaused,
    recordingMode,
    recordingSeconds,
    timelapseIntervalSec,
    burnTelemetry,
    recordedBlobUrl,
    recordedBlob,
    recordedBlobSize,
    videoMimeType,
    hasRecoveredRecording,
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
