import { useState, useRef, useCallback, useEffect } from 'react';
import { GpsPositionState } from '../utils/gpsAndGeocoding';
import {
  StravaTrackPoint,
  StravaSportType,
  StravaActivityStats,
  calculateStravaStats,
  downloadStravaGpx,
} from '../utils/stravaRecorder';
import { estimatePhilippineElevation } from '../utils/elevationProfile';

export interface UseStravaTrackRecorderResult {
  isRecording: boolean;
  isPaused: boolean;
  sportType: StravaSportType;
  activityName: string;
  trackPoints: StravaTrackPoint[];
  stats: StravaActivityStats;
  autoRecordSimulation: boolean;
  setAutoRecordSimulation: (enabled: boolean) => void;
  setSportType: (sport: StravaSportType) => void;
  setActivityName: (name: string) => void;
  startRecording: (name?: string, sport?: StravaSportType) => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => StravaActivityStats;
  resetRecording: () => void;
  downloadGpx: () => void;
}

export function useStravaTrackRecorder(
  effectiveGps: GpsPositionState | null,
  isSimulating: boolean = false,
  routeLabel: string = 'LAAGARN Highway Run'
): UseStravaTrackRecorderResult {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [sportType, setSportType] = useState<StravaSportType>('VirtualRide');
  const [activityName, setActivityName] = useState<string>(routeLabel || 'LAAGARN Highway Run');
  const [trackPoints, setTrackPoints] = useState<StravaTrackPoint[]>([]);
  const [autoRecordSimulation, setAutoRecordSimulation] = useState<boolean>(true);

  const lastRecordedTimeRef = useRef<number>(0);
  const pointsRef = useRef<StravaTrackPoint[]>([]);

  // Keep ref synchronized
  useEffect(() => {
    pointsRef.current = trackPoints;
  }, [trackPoints]);

  // Keep default name in sync with route label if not modified by user
  useEffect(() => {
    if (!isRecording && routeLabel) {
      setActivityName(routeLabel);
    }
  }, [routeLabel, isRecording]);

  const startRecording = useCallback(
    (name?: string, sport?: StravaSportType) => {
      if (name) setActivityName(name);
      if (sport) setSportType(sport);
      setTrackPoints([]);
      pointsRef.current = [];
      lastRecordedTimeRef.current = 0;
      setIsPaused(false);
      setIsRecording(true);
    },
    []
  );

  const pauseRecording = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeRecording = useCallback(() => {
    setIsPaused(false);
  }, []);

  const stopRecording = useCallback((): StravaActivityStats => {
    setIsRecording(false);
    setIsPaused(false);
    return calculateStravaStats(pointsRef.current);
  }, []);

  const resetRecording = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
    setTrackPoints([]);
    pointsRef.current = [];
    lastRecordedTimeRef.current = 0;
  }, []);

  const downloadGpx = useCallback(() => {
    if (pointsRef.current.length === 0) return;
    downloadStravaGpx(activityName, pointsRef.current, sportType);
  }, [activityName, sportType]);

  // Auto-record integration with simulation
  useEffect(() => {
    if (!autoRecordSimulation) return;

    if (isSimulating && !isRecording) {
      startRecording(`${routeLabel || 'Highway'} Simulation`, 'VirtualRide');
    } else if (!isSimulating && isRecording) {
      // Pause or stop when simulation finishes/pauses
      pauseRecording();
    }
  }, [isSimulating, autoRecordSimulation]);

  // Sample GPS trackpoints when recording and not paused
  useEffect(() => {
    if (!isRecording || isPaused || !effectiveGps) return;

    const now = Date.now();
    // Throttle to 1 second minimum interval between trackpoints
    if (now - lastRecordedTimeRef.current < 900) return;
    lastRecordedTimeRef.current = now;

    const ele = estimatePhilippineElevation(effectiveGps.lat, effectiveGps.lng);
    const newPoint: StravaTrackPoint = {
      lat: effectiveGps.lat,
      lng: effectiveGps.lng,
      ele,
      time: new Date(effectiveGps.timestamp || now).toISOString(),
      speedKmh: effectiveGps.speedKmh ?? 0,
      heading: effectiveGps.heading ?? undefined,
    };

    setTrackPoints((prev) => [...prev, newPoint]);
  }, [effectiveGps, isRecording, isPaused]);

  const stats = calculateStravaStats(trackPoints);

  return {
    isRecording,
    isPaused,
    sportType,
    activityName,
    trackPoints,
    stats,
    autoRecordSimulation,
    setAutoRecordSimulation,
    setSportType,
    setActivityName,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    downloadGpx,
  };
}
