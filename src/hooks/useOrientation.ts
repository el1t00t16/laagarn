import { useEffect, useState } from 'react';

/**
 * Tracks physical device compass heading (degrees clockwise from North).
 * Supports standard DeviceOrientationEvent and iOS WebKitCompassHeading.
 */
export function useDeviceCompass(fallbackGpsHeading: number | null = null): number | null {
  const [compassHeading, setCompassHeading] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cleanup: (() => void) | null = null;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // iOS Safari provides webkitCompassHeading directly (0-360, 0=North)
      const webkitHeading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof webkitHeading === 'number' && !Number.isNaN(webkitHeading)) {
        setCompassHeading(Math.round(webkitHeading));
        return;
      }

      // Android Chrome / Standard absolute orientation
      if (e.alpha !== null && !Number.isNaN(e.alpha)) {
        const heading = (360 - e.alpha) % 360;
        setCompassHeading(Math.round(heading));
      }
    };

    const win = window as any;
    if ('ondeviceorientationabsolute' in win) {
      win.addEventListener('deviceorientationabsolute', handleOrientation, true);
      cleanup = () => win.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    } else if ('ondeviceorientation' in win) {
      win.addEventListener('deviceorientation', handleOrientation, true);
      cleanup = () => win.removeEventListener('deviceorientation', handleOrientation, true);
    }

    return () => {
      cleanup?.();
    };
  }, []);

  return compassHeading !== null ? compassHeading : fallbackGpsHeading;
}
