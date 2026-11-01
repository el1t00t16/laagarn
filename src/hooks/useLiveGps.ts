import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GpsPositionState,
  isPointWithinPhilippines,
  offlineLocationLabel,
  reverseGeocodePhilippines,
} from '../utils/gpsAndGeocoding';
import { calculateBearing, haversineKmPrecise } from '../utils/routingEngine';
import { isBrowserOnline, readJson, writeJson } from '../utils/config';

const LAST_FIX_KEY = 'wayfarer_last_fix_v2';

export type GpsStatus = 'idle' | 'locating' | 'tracking' | 'error';

export interface LiveGps {
  position: GpsPositionState | null;
  status: GpsStatus;
  error: string | null;
  tracking: boolean;
  locateOnce: () => Promise<GpsPositionState | null>;
  startTracking: () => void;
  stopTracking: () => void;
  setManualPosition: (lat: number, lng: number, label?: string) => void;
}

function describeGeoError(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return 'Location permission denied. Enable location for this site in your browser/phone settings, or tap the map to set your position.';
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return 'GPS signal unavailable. Move to an open area with a clear view of the sky — still trying…';
  }
  return 'Waiting for a GPS fix… (satellite lock can take up to a minute outdoors)';
}

function geolocationUnavailableReason(): string | null {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return 'This device/browser does not support GPS geolocation.';
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'GPS requires a secure (HTTPS) connection. Open the app via https:// or localhost.';
  }
  return null;
}

/**
 * Real-time GPS engine.
 *
 * Satellite positioning works without internet, so every fix is published to
 * the UI immediately. Network work (reverse geocoding) is decoupled, throttled
 * and optional — the previous implementation awaited a network request inside
 * every watchPosition callback, which stalled live tracking for seconds per fix
 * whenever the connection was slow or down.
 */
export function useLiveGps(): LiveGps {
  const [position, setPosition] = useState<GpsPositionState | null>(() => {
    const last = readJson<GpsPositionState | null>(LAST_FIX_KEY, null);
    return last ? { ...last, source: 'last-known' } : null;
  });
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const lastFixRef = useRef<GpsPositionState | null>(null);
  const labelRef = useRef<{ label: string; lat: number; lng: number } | null>(null);
  const geocodeRef = useRef<{ lat: number; lng: number; at: number; inFlight: boolean }>({
    lat: 0,
    lng: 0,
    at: 0,
    inFlight: false,
  });
  const lastPersistRef = useRef(0);

  const refreshLabel = useCallback((lat: number, lng: number) => {
    // Instant offline label when we've moved meaningfully.
    const prevLabel = labelRef.current;
    if (!prevLabel || haversineKmPrecise(prevLabel, { lat, lng }) > 0.3) {
      labelRef.current = { label: offlineLocationLabel(lat, lng).name, lat, lng };
    }

    // Throttled network label: ≥30 s apart and ≥150 m moved (Nominatim policy friendly).
    const g = geocodeRef.current;
    const now = Date.now();
    const moved = g.at === 0 ? Infinity : haversineKmPrecise(g, { lat, lng });
    if (!g.inFlight && isBrowserOnline() && now - g.at > 30000 && moved > 0.15) {
      geocodeRef.current = { lat, lng, at: now, inFlight: true };
      reverseGeocodePhilippines(lat, lng)
        .then((rev) => {
          labelRef.current = { label: rev.name, lat, lng };
          setPosition((prev) => (prev ? { ...prev, addressLabel: rev.name } : prev));
        })
        .finally(() => {
          geocodeRef.current.inFlight = false;
        });
    }
    return labelRef.current!.label;
  }, []);

  const buildState = useCallback(
    (pos: GeolocationPosition): GpsPositionState | null => {
      const { latitude, longitude, accuracy, heading, speed, altitude } = pos.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      const prev = lastFixRef.current;
      const now = pos.timestamp || Date.now();

      // Reject a sudden low-quality fix right after a good one (Wi-Fi/cell jump).
      if (
        prev &&
        prev.source === 'gps' &&
        accuracy > 150 &&
        prev.accuracyMeters < 50 &&
        now - prev.timestamp < 15000
      ) {
        return null;
      }

      let computedHeading: number | null =
        heading !== null && Number.isFinite(heading) && !Number.isNaN(heading) ? heading : null;
      let speedKmh: number | null =
        speed !== null && Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null;

      if (prev && prev.source === 'gps') {
        const distKm = haversineKmPrecise(prev, { lat: latitude, lng: longitude });
        const dtH = (now - prev.timestamp) / 3_600_000;
        if (speedKmh === null && dtH > 0) {
          const derived = distKm / dtH;
          speedKmh = derived < 300 ? derived : null;
        }
        if (computedHeading === null) {
          computedHeading =
            distKm * 1000 > Math.max(4, accuracy * 0.5)
              ? calculateBearing(prev, { lat: latitude, lng: longitude })
              : prev.heading;
        }
      }

      return {
        lat: Number(latitude.toFixed(6)),
        lng: Number(longitude.toFixed(6)),
        accuracyMeters: Math.max(1, Math.round(accuracy || 0)),
        heading: computedHeading,
        speedKmh: speedKmh !== null ? Math.round(speedKmh) : null,
        altitudeMeters: altitude ?? null,
        addressLabel: refreshLabel(latitude, longitude),
        withinPhilippines: isPointWithinPhilippines(latitude, longitude),
        timestamp: now,
        source: 'gps',
      };
    },
    [refreshLabel]
  );

  const publish = useCallback((next: GpsPositionState) => {
    lastFixRef.current = next;
    setPosition(next);
    setError(null);
    if (Date.now() - lastPersistRef.current > 15000) {
      lastPersistRef.current = Date.now();
      writeJson(LAST_FIX_KEY, next);
    }
  }, []);

  const locateOnce = useCallback((): Promise<GpsPositionState | null> => {
    const reason = geolocationUnavailableReason();
    if (reason) {
      setError(reason);
      setStatus('error');
      return Promise.resolve(null);
    }
    setStatus((s) => (s === 'tracking' ? s : 'locating'));
    setError(null);

    const attempt = (highAccuracy: boolean) =>
      new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? 15000 : 10000,
          maximumAge: highAccuracy ? 3000 : 60000,
        })
      );

    return attempt(true)
      .catch((err: GeolocationPositionError) => {
        if (err.code === err.PERMISSION_DENIED) throw err;
        return attempt(false);
      })
      .then((pos) => {
        const next = buildState(pos);
        if (next) {
          publish(next);
          writeJson(LAST_FIX_KEY, next);
        }
        setStatus(watchIdRef.current !== null ? 'tracking' : 'idle');
        return next;
      })
      .catch((err: GeolocationPositionError) => {
        setError(describeGeoError(err));
        setStatus(watchIdRef.current !== null ? 'tracking' : 'error');
        return null;
      });
  }, [buildState, publish]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setTracking(false);
    setStatus('idle');
    if (lastFixRef.current) writeJson(LAST_FIX_KEY, lastFixRef.current);
  }, []);

  const startTracking = useCallback(() => {
    const reason = geolocationUnavailableReason();
    if (reason) {
      setError(reason);
      setStatus('error');
      return;
    }
    if (watchIdRef.current !== null) return;
    setError(null);
    setTracking(true);
    setStatus('tracking');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next = buildState(pos);
        if (next) publish(next);
      },
      (err) => {
        setError(describeGeoError(err));
        if (err.code === err.PERMISSION_DENIED) {
          if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
          setTracking(false);
          setStatus('error');
        }
        // TIMEOUT / UNAVAILABLE: the watch keeps running and recovers automatically.
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 }
    );
  }, [buildState, publish]);

  const setManualPosition = useCallback(
    (lat: number, lng: number, label?: string) => {
      const next: GpsPositionState = {
        lat,
        lng,
        accuracyMeters: 5,
        heading: null,
        speedKmh: null,
        addressLabel: label || offlineLocationLabel(lat, lng).name,
        withinPhilippines: isPointWithinPhilippines(lat, lng),
        timestamp: Date.now(),
        source: 'manual',
      };
      lastFixRef.current = next;
      setPosition(next);
      setError(null);
      if (!label) {
        reverseGeocodePhilippines(lat, lng).then((rev) =>
          setPosition((prev) =>
            prev && prev.source === 'manual' && prev.lat === lat && prev.lng === lng
              ? { ...prev, addressLabel: rev.name }
              : prev
          )
        );
      }
    },
    []
  );

  // Clean up the watch on unmount and persist the last fix when the page is hidden.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && lastFixRef.current) {
        writeJson(LAST_FIX_KEY, lastFixRef.current);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    position,
    status,
    error,
    tracking,
    locateOnce,
    startTracking,
    stopTracking,
    setManualPosition,
  };
}
