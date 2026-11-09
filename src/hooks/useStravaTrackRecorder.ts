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
import { haversineKmPrecise } from '../utils/routingEngine';

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

  // Simulation time & distance tracking refs
  const simStartTimeRef = useRef<number>(0);
  const accumulatedSimDistanceKmRef = useRef<number>(0);
  const prevSimPointRef = useRef<{ lat: number; lng: number } | null>(null);

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
      simStartTimeRef.current = Date.now();
      accumulatedSimDistanceKmRef.current = 0;
      prevSimPointRef.current = null;
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
    simStartTimeRef.current = 0;
    accumulatedSimDistanceKmRef.current = 0;
    prevSimPointRef.current = null;
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
    // Throttle to minimum 800ms between recorded points
    if (now - lastRecordedTimeRef.current < 800) return;
    lastRecordedTimeRef.current = now;

    let pointTimeStr = new Date(effectiveGps.timestamp || now).toISOString();
    let pointSpeedKmh = effectiveGps.speedKmh ?? 0;

    if (isSimulating) {
      if (!simStartTimeRef.current) {
        simStartTimeRef.current = now;
      }
      if (prevSimPointRef.current) {
        const segDist = haversineKmPrecise(
          prevSimPointRef.current,
          { lat: effectiveGps.lat, lng: effectiveGps.lng }
        );
        accumulatedSimDistanceKmRef.current += segDist;
      }
      prevSimPointRef.current = { lat: effectiveGps.lat, lng: effectiveGps.lng };

      // Generate realistic Strava road speeds for simulation
      const baseSpeed =
        sportType === 'VirtualRide' || sportType === 'Ride'
          ? 28 + (Math.sin(accumulatedSimDistanceKmRef.current * 2) * 4)
          : sportType === 'Run' || sportType === 'Walk'
          ? 9.5 + (Math.sin(accumulatedSimDistanceKmRef.current * 2) * 1.5)
          : 56 + (Math.sin(accumulatedSimDistanceKmRef.current * 2) * 7);

      pointSpeedKmh = Math.max(5, Math.round(baseSpeed));

      // Monotonically advance simulated time based on real distance covered
      const simulatedElapsedSec = Math.round(
        (accumulatedSimDistanceKmRef.current / (pointSpeedKmh || 30)) * 3600
      );
      pointTimeStr = new Date(simStartTimeRef.current + simulatedElapsedSec * 1000).toISOString();
    }

    const ele = estimatePhilippineElevation(effectiveGps.lat, effectiveGps.lng);
    const newPoint: StravaTrackPoint = {
      lat: effectiveGps.lat,
      lng: effectiveGps.lng,
      ele,
      time: pointTimeStr,
      speedKmh: pointSpeedKmh,
      heading: effectiveGps.heading ?? undefined,
    };

    setTrackPoints((prev) => [...prev, newPoint]);
  }, [effectiveGps, isRecording, isPaused, isSimulating, sportType]);

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
