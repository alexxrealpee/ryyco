import { useEffect, useState } from 'react';
import type { DeliveryTrackingData } from '../types';
import { listenToDeliveryTracking } from '../lib/firebase';
import type { TrackingConnection } from '../lib/deliveryTrackingService';

export function useDeliveryTracking(orderId: string | undefined, enabled: boolean) {
  const [tracking, setTracking] = useState<DeliveryTrackingData | null>(null);
  const [connection, setConnection] = useState<TrackingConnection>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setTracking(previous => enabled && previous?.orderId === orderId ? previous : null);
    setError(null);
    setConnection(navigator.onLine === false ? 'offline' : 'connecting');
    if (!enabled || !orderId) return;
    const unsubscribe = listenToDeliveryTracking(orderId, setTracking, (state, message) => {
      setConnection(navigator.onLine === false ? 'offline' : state);
      setError(message || null);
    });
    const offline = () => setConnection('offline');
    const online = () => setAttempt(value => value + 1);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      unsubscribe(); clearInterval(tick);
      window.removeEventListener('offline', offline); window.removeEventListener('online', online);
    };
  }, [enabled, orderId, attempt]);
  const gpsTime = tracking?.gpsTimestamp ?? (tracking?.updatedAt ? Date.parse(tracking.updatedAt) : 0);
  const secondsAgo = Number.isFinite(gpsTime) && gpsTime > 0 ? Math.max(0, Math.floor((now - gpsTime) / 1000)) : null;
  return { tracking: tracking?.orderId === orderId ? tracking : null, connection, error, secondsAgo, now, retry: () => setAttempt(value => value + 1) };
}
