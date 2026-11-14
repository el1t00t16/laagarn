import { useState, useRef, useCallback, useEffect } from 'react';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import { drawDashcamWatermark } from '../utils/dashcamWatermark';

export type CameraFacingMode = 'environment' | 'user';
export type RecordingMode = 'normal' | 'timelapse';
export type LensZoom = '0.5x' | '1x';
export type CapturedMediaKind = 'video' | 'photo';

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
  capturedMediaKind: CapturedMediaKind;
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
  capturePhotoSnapshot: () => Promise<boolean>;
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

/**
 * Waits briefly for <video> intrinsic dimensions so portrait vs landscape frame size is accurate.
 */
async function resolveVideoDimensions(
  video: HTMLVideoElement,
  stream: MediaStream | null
): Promise<{ rawW: number; rawH: number }> {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return { rawW: video.videoWidth, rawH: video.videoHeight };
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    const timer = window.setTimeout(finish, 450);
    video.addEventListener(
      'loadedmetadata',
      () => {
        clearTimeout(timer);
        finish();
      },
      { once: true }
    );
  });

  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return { rawW: video.videoWidth, rawH: video.videoHeight };
  }

  const settings = stream?.getVideoTracks()[0]?.getSettings();
  if (settings?.width && settings?.height) {
    return { rawW: settings.width, rawH: settings.height };
  }

  const screenPortrait =
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
  return screenPortrait ? { rawW: 720, rawH: 1280 } : { rawW: 1280, rawH: 720 };
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
  const [capturedMediaKind, setCapturedMediaKind] = useState<CapturedMediaKind>('video');
  const [hasRecoveredRecording, setHasRecoveredRecording] = useState<boolean>(false);
  const recordedBlobRef = useRef<Blob | null>(null);
  const [videoMimeType, setVideoMimeType] = useState<string>(isIOS ? 'video/mp4' : 'video/webm');
  const selectedMimeRef = useRef<string>(isIOS ? 'video/mp4' : 'video/webm');
  const recordingModeRef = useRef<RecordingMode>('timelapse');

  useEffect(() => {
    recordingModeRef.current = recordingMode;
  }, [recordingMode]);

  // Attempt to recover previously recorded media from IndexedDB in case of unexpected tab reload/close
  useEffect(() => {
    loadBackupRecording()
      .then((blob) => {
        if (blob && blob.size > 0 && !recordedBlobRef.current) {
          const url = URL.createObjectURL(blob);
          const isImage = (blob.type || '').startsWith('image/');
          setRecordedBlob(blob);
          recordedBlobRef.current = blob;
          setRecordedBlobUrl(url);
          setRecordedBlobSize(blob.size);
          setCapturedMediaKind(isImage ? 'photo' : 'video');
          if (blob.type) setVideoMimeType(blob.type);
          setHasRecoveredRecording(true);
        }
      })
      .catch(() => {});
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

      if (!foundUltraWideId && backCams.length >= 2) {
        foundWideId = foundWideId || backCams[0].deviceId;
        foundUltraWideId = backCams[1].deviceId;
      }

      if (foundWideId) wideDeviceIdRef.current = foundWideId;
      if (foundUltraWideId) ultraWideDeviceIdRef.current = foundUltraWideId;

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

      if (!ultraWideDeviceIdRef.current || !wideDeviceIdRef.current) {
        await detectAndCategorizeCameras();
      }

      const targetDeviceId =
        zoom === '0.5x' ? ultraWideDeviceIdRef.current : wideDeviceIdRef.current;

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
   * Renders clean, collision-free HUD telemetry watermark onto canvas.
   */
  const drawTelemetryOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, modeOverride?: RecordingMode) => {
      drawDashcamWatermark(ctx, width, height, {
        gps: gpsRef.current,
        roadName: roadNameRef.current,
        lens: currentLensRef.current,
        recordingMode: modeOverride || recordingModeRef.current,
      });
    },
    []
  );

  /**
   * Captures a high-resolution GPS watermarked JPEG snapshot from the live camera feed.
   */
  const capturePhotoSnapshot = useCallback(async (): Promise<boolean> => {
    if (!mediaStreamRef.current || !videoRef.current) {
      const ok = await startCamera();
      if (!ok || !videoRef.current) return false;
    }

    const video = videoRef.current;
    const { rawW, rawH } = await resolveVideoDimensions(video, mediaStreamRef.current);
    const aspect = rawW / Math.max(1, rawH);

    // Cap photo long-edge at 1920px for crisp social/gallery quality
    let width = rawW;
    let height = rawH;
    if (rawW >= rawH && rawW > 1920) {
      width = 1920;
      height = Math.round(width / aspect);
    } else if (rawH > rawW && rawH > 1920) {
      height = 1920;
      width = Math.round(height * aspect);
    }

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = width;
    snapCanvas.height = height;
    const ctx = snapCanvas.getContext('2d');
    if (!ctx) return false;

    ctx.drawImage(video, 0, 0, width, height);
    if (burnTelemetry) {
      drawTelemetryOverlay(ctx, width, height, 'normal');
    }

    return new Promise((resolve) => {
      snapCanvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(false);
            return;
          }
          if (recordedBlobUrl) {
            URL.revokeObjectURL(recordedBlobUrl);
          }
          const url = URL.createObjectURL(blob);
          setRecordedBlob(blob);
          recordedBlobRef.current = blob;
          setRecordedBlobUrl(url);
          setRecordedBlobSize(blob.size);
          setCapturedMediaKind('photo');
          setVideoMimeType('image/jpeg');
          setHasRecoveredRecording(false);
          saveBackupRecording(blob);
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(15);
          }
          resolve(true);
        },
        'image/jpeg',
        0.93
      );
    });
  }, [burnTelemetry, drawTelemetryOverlay, recordedBlobUrl, startCamera]);

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

    const launch = async () => {
      const video = videoRef.current;
      if (!video || !mediaStreamRef.current) return;

      recordedChunksRef.current = [];
      if (recordedBlobUrl) {
        URL.revokeObjectURL(recordedBlobUrl);
      }
      setRecordedBlobUrl(null);
      setRecordedBlobSize(0);
      setRecordingSeconds(0);
      setIsPaused(false);
      setCapturedMediaKind('video');

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

      // Resolve accurate live camera dimensions (preserving portrait 9:16 vs landscape 16:9)
      const { rawW, rawH } = await resolveVideoDimensions(video, mediaStreamRef.current);
      const aspect = rawW / Math.max(1, rawH);

      let width = 1280;
      let height = 720;
      if (rawW >= rawH) {
        width = Math.min(1280, rawW);
        height = Math.round(width / aspect);
      } else {
        height = Math.min(1280, rawH);
        width = Math.round(height * aspect);
      }
      // Ensure even dimensions for H.264 hardware encoders on mobile chipsets
      width = Math.max(2, width - (width % 2));
      height = Math.max(2, height - (height % 2));

      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = width;
      canvas.height = height;

      let recordingStream: MediaStream;

      if (recordingMode === 'timelapse') {
        recordingStream = canvas.captureStream(10);

        ctx.drawImage(video, 0, 0, width, height);
        if (burnTelemetry) {
          drawTelemetryOverlay(ctx, width, height, 'timelapse');
        }

        const intervalMs = Math.max(250, timelapseIntervalSec * 1000);
        timelapseIntervalTimerRef.current = window.setInterval(() => {
          if (!video || video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, width, height);
          if (burnTelemetry) {
            drawTelemetryOverlay(ctx, width, height, 'timelapse');
          }
        }, intervalMs);
      } else if (burnTelemetry) {
        recordingStream = canvas.captureStream(30);
        const loop = () => {
          if (!video || video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, width, height);
          drawTelemetryOverlay(ctx, width, height, 'normal');
          renderAnimFrameRef.current = requestAnimationFrame(loop);
        };
        renderAnimFrameRef.current = requestAnimationFrame(loop);
      } else {
        recordingStream = mediaStreamRef.current;
      }

      try {
        const recorder = new MediaRecorder(recordingStream, {
          mimeType: selectedMime ? selectedMime : undefined,
          videoBitsPerSecond: recordingMode === 'timelapse' ? 1_800_000 : 2_800_000,
        });

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
          setCapturedMediaKind('video');
          setHasRecoveredRecording(false);
          saveBackupRecording(blob);
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(20);
        }

        timerIntervalRef.current = window.setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      } catch (err: any) {
        console.error('Failed to start MediaRecorder:', err);
        setCameraError('Failed to initialize video recording.');
      }
    };

    launch();
  }, [
    burnTelemetry,
    recordingMode,
    timelapseIntervalSec,
    recordedBlobUrl,
    startCamera,
    drawTelemetryOverlay,
  ]);

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
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([15, 30, 15]);
    }

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
   * Downloads the recorded clip or photo to the phone's storage.
   */
  const saveToDevice = useCallback(
    (filenamePrefix: string = 'laagarn_dashcam') => {
      if (!recordedBlobUrl || !recordedBlob) return;

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');

      let extension = 'webm';
      let modeTag: string = recordingMode === 'timelapse' ? 'timelapse' : 'clip';
      if (capturedMediaKind === 'photo' || (recordedBlob.type || '').startsWith('image/')) {
        extension = 'jpg';
        modeTag = 'photo';
      } else {
        const isMp4 =
          (recordedBlob.type || selectedMimeRef.current || '').toLowerCase().includes('mp4') ||
          isIOS;
        extension = isMp4 ? 'mp4' : 'webm';
      }

      const filename = `${filenamePrefix}_${modeTag}_${datePart}_${timePart}.${extension}`;
      const a = document.createElement('a');
      a.href = recordedBlobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [recordedBlobUrl, recordingMode, recordedBlob, capturedMediaKind]
  );

  /**
   * Triggers the native iOS / Android Web Share Sheet with the video or photo file.
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

      const isPhoto =
        capturedMediaKind === 'photo' || (recordedBlob.type || '').startsWith('image/');
      let extension = 'webm';
      let mimeType = recordedBlob.type || 'video/webm';
      let modeTag: string = recordingMode === 'timelapse' ? 'timelapse' : 'clip';

      if (isPhoto) {
        extension = 'jpg';
        mimeType = 'image/jpeg';
        modeTag = 'photo';
      } else {
        const isMp4 =
          (recordedBlob.type || selectedMimeRef.current || '').toLowerCase().includes('mp4') ||
          isIOS;
        extension = isMp4 ? 'mp4' : 'webm';
        mimeType = isMp4 ? 'video/mp4' : recordedBlob.type || 'video/webm';
      }

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
            title: isPhoto ? 'LAAGARN GPS Photo' : 'LAAGARN Highway Recording',
            text: 'Captured with LAAGARN GPS Navigation',
          });
          return true;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return false;
        }
        console.warn('Native share failed, falling back to download:', err);
      }

      saveToDevice(filenamePrefix);
      return true;
    },
    [recordedBlob, recordingMode, capturedMediaKind, saveToDevice]
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
    capturedMediaKind,
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
    capturePhotoSnapshot,
    discardRecording,
    saveToDevice,
    shareToPhotosOrApps,
  };
}
