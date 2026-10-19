import { useEffect, useRef } from 'react';
import { animateGps, type GpsPoint } from '../lib/deliveryTracking';

export function useCourierAnimation(point: GpsPoint | null, enabled: boolean, identity: string | undefined,
  onFrame: (point: GpsPoint) => void, renderer?: unknown) {
  const visual = useRef<GpsPoint | null>(null);
  const callback = useRef(onFrame);
  callback.current = onFrame;
  useEffect(() => { visual.current = null; }, [identity]);
  useEffect(() => {
    if (!point) { visual.current = null; return; }
    return animateGps(enabled ? visual.current : null, point, value => {
      visual.current = value; callback.current(value);
    });
  }, [point?.lat, point?.lng, point?.timestamp, point?.heading, enabled, identity, renderer]);
}
