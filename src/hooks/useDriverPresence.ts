import { isNativeDriverLocation } from '../lib/nativeDriverLocation';
import { useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { DriverProfile, OrderItem } from '../types';
import { acceptGpsPosition, type GpsPoint } from '../lib/deliveryTracking';

// Serialize cleanup and writes across effect generations (including StrictMode).
let queue: Promise<unknown> = Promise.resolve();
export function useDriverPresence(driver: DriverProfile | null, available: boolean,
  order: OrderItem | null, deliveryPoint: GpsPoint | null) {
  const [error, setError] = useState<string | null>(null);
  const pointRef = useRef(deliveryPoint);
  pointRef.current = deliveryPoint;
  const id = driver?.id || driver?.uid;
  const enabled = !!id && driver?.status === 'approved' && available && !!driver.isAvailable;
  const deliveryGps = !!order && !['delivered', 'cancelled'].includes(order.status) &&
    !['delivered', 'cancelled'].includes(order.deliveryStep);
  useEffect(() => {
    setError(null);
    if (isNativeDriverLocation()) return;
    if (!enabled || !id) return;
    const ref = doc(db, 'driver_presence', id);
    let stopped = false, busy = false, lastSent = 0;
    let sample: GpsPoint | null = null;
    const send = () => {
      const point = deliveryGps ? pointRef.current : sample;
      if (stopped || busy || !point || Date.now() - point.timestamp > 15000 ||
          Date.now() - lastSent < 3000 || !navigator.onLine) return;
      busy = true;
      lastSent = Date.now();
      queue = queue.catch(() => {}).then(async () => {
        if (stopped) return;
        await setDoc(ref, {
          lat: point.lat,
          lng: point.lng,
          accuracy: point.accuracy,
          ...(typeof point.heading === 'number' && Number.isFinite(point.heading) ? { heading: point.heading } : {}),
          ...(typeof point.speed === 'number' && Number.isFinite(point.speed) ? { speed: point.speed } : {}),
          gpsTimestamp: point.timestamp,
          updatedAt: serverTimestamp()
        });
      }).then(() => { if (!stopped) setError(null); }).catch(() => {
        if (!stopped) setError('No se pudo compartir el GPS con administración. Revisa tu conexión y sesión.');
      }).finally(() => { busy = false; });
    };
    let watch: number | undefined;
    if (!deliveryGps) {
      if (!navigator.geolocation) setError('Este dispositivo no permite obtener GPS.');
      else watch = navigator.geolocation.watchPosition(position => {
        const accepted = acceptGpsPosition(position, sample);
        if (accepted) { sample = accepted; send(); }
      }, () => setError('Activa el permiso de ubicación para aparecer en el mapa de administración.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    }
    const timer = window.setInterval(send, 1500);
    send();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      queue = queue.catch(() => {}).then(() => deleteDoc(ref)).catch(() => {});
    };
  }, [id, enabled, deliveryGps]);
  return error;
}
