import { useEffect, useRef, useState, useCallback } from 'react';
import { ComputedRoute, calculateBearing, haversineKmPrecise } from '../utils/routingEngine';
import { GpsPositionState } from '../utils/gpsAndGeocoding';

export interface RouteSimulation {
  isSimulating: boolean;
  simulatedGps: GpsPositionState | null;
  speedMultiplier: number;
  progressPercent: number;
  startSimulation: () => void;
  pauseSimulation: () => void;
  resetSimulation: () => void;
  setSpeedMultiplier: (multiplier: number) => void;
}

/**
 * Simulates driving along a route from A to B at realistic road speeds.
 * Interpolates coordinates smoothly along the polyline and computes
 * tangent bearings so the car icon rotates and glides realistically.
 */
export function useRouteSimulation(activeRoute: ComputedRoute | null): RouteSimulation {
  const [isSimulating, setIsSimulating] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(2);
  const [simulatedGps, setSimulatedGps] = useState<GpsPositionState | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  const distanceKmRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  const resetSimulation = useCallback(() => {
    setIsSimulating(false);
    distanceKmRef.current = 0;
    setProgressPercent(0);
    if (activeRoute && activeRoute.coordinates.length > 0) {
      const first = activeRoute.coordinates[0];
      const second = activeRoute.coordinates[1] || first;
      const initialBearing = calculateBearing(
        { lat: first[0], lng: first[1] },
        { lat: second[0], lng: second[1] }
      );
      setSimulatedGps({
        lat: first[0],
        lng: first[1],
        accuracyMeters: 3,
        heading: initialBearing,
        speedKmh: 0,
        addressLabel: activeRoute.stops[0]?.name || 'Origin (A)',
        withinPhilippines: true,
        timestamp: Date.now(),
        source: 'manual',
      });
    } else {
      setSimulatedGps(null);
    }
  }, [activeRoute]);

  const startSimulation = useCallback(() => {
    if (!activeRoute || activeRoute.coordinates.length < 2) return;
    lastTimeRef.current = performance.now();
    setIsSimulating(true);
  }, [activeRoute]);

  const pauseSimulation = useCallback(() => {
    setIsSimulating(false);
  }, []);

  // Main 60fps simulation loop
  useEffect(() => {
    if (!isSimulating || !activeRoute || activeRoute.coordinates.length < 2) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const coords = activeRoute.coordinates;
    const totalKm = activeRoute.totalDistanceKm || 1;
    // Base simulation speed: 60 km/h driving, scaled by multiplier
    const baseKmh = activeRoute.averageSpeedKmh > 0 ? activeRoute.averageSpeedKmh : 55;

    // Precalculate segment lengths
    const segDistances: number[] = [];
    for (let i = 0; i < coords.length - 1; i++) {
      segDistances.push(
        haversineKmPrecise(
          { lat: coords[i][0], lng: coords[i][1] },
          { lat: coords[i + 1][0], lng: coords[i + 1][1] }
        )
      );
    }

    const loop = (time: number) => {
      const dt = Math.min(100, time - (lastTimeRef.current || time));
      lastTimeRef.current = time;

      const deltaKm = ((baseKmh * speedMultiplier) / 3600000) * dt;
      distanceKmRef.current += deltaKm;

      if (distanceKmRef.current >= totalKm) {
        distanceKmRef.current = totalKm;
        setIsSimulating(false);
        const last = coords[coords.length - 1];
        setSimulatedGps({
          lat: last[0],
          lng: last[1],
          accuracyMeters: 2,
          heading: 0,
          speedKmh: 0,
          addressLabel: activeRoute.stops[activeRoute.stops.length - 1]?.name || 'Destination (B)',
          withinPhilippines: true,
          timestamp: Date.now(),
          source: 'manual',
        });
        setProgressPercent(100);
        return;
      }

      // Find current segment along the path
      let accumulated = 0;
      let segIdx = 0;
      for (let i = 0; i < segDistances.length; i++) {
        if (accumulated + segDistances[i] >= distanceKmRef.current) {
          segIdx = i;
          break;
        }
        accumulated += segDistances[i];
      }

      const p1 = coords[segIdx];
      const p2 = coords[Math.min(segIdx + 1, coords.length - 1)];
      const segLen = segDistances[segIdx] || 0.001;
      const t = Math.max(0, Math.min(1, (distanceKmRef.current - accumulated) / segLen));

      const lat = Number((p1[0] + (p2[0] - p1[0]) * t).toFixed(6));
      const lng = Number((p1[1] + (p2[1] - p1[1]) * t).toFixed(6));
      const heading = calculateBearing({ lat: p1[0], lng: p1[1] }, { lat: p2[0], lng: p2[1] });

      setSimulatedGps({
        lat,
        lng,
        accuracyMeters: 3,
        heading,
        speedKmh: Math.round(baseKmh * speedMultiplier),
        addressLabel: `Moving towards ${activeRoute.stops[activeRoute.stops.length - 1]?.name || 'Destination'}`,
        withinPhilippines: true,
        timestamp: Date.now(),
        source: 'manual',
      });

      setProgressPercent(Math.min(100, Math.round((distanceKmRef.current / totalKm) * 100)));

      animFrameRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isSimulating, activeRoute, speedMultiplier]);

  return {
    isSimulating,
    simulatedGps,
    speedMultiplier,
    progressPercent,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    setSpeedMultiplier,
  };
}
