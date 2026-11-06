import { Capacitor, registerPlugin } from '@capacitor/core';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth, app } from './firebase';
import type { DriverProfile, OrderItem } from '../types';
import type { GpsPoint } from './deliveryTracking';

export const isNativeDriverLocation = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
interface NativeStatus { running: boolean; error: string; lastUpdate: number; lat: number; lng: number; accuracy: number; gpsTimestamp: number }
const plugin = registerPlugin<{ configure(data: Record<string, unknown>): Promise<void>; stop(): Promise<void>; status(): Promise<NativeStatus> }>('DriverLocation');
let operations: Promise<unknown> = Promise.resolve();
export function stopNativeDriverLocation() {
  if (!isNativeDriverLocation()) return Promise.resolve();
  operations = operations.catch(() => {}).then(() => plugin.stop());
  return operations;
}
export function useNativeDriverLocation(driver: DriverProfile | null, available: boolean, order: OrderItem | null, ready = true) {
  const [state, setState] = useState<NativeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const delivery = !!order && !['delivered','cancelled'].includes(order.status) && !['delivered','cancelled'].includes(order.deliveryStep);
  const driverId = driver?.id || driver?.uid;
  const enabled = driver?.status === 'approved' && (available || delivery);
  useEffect(() => {
    if (!isNativeDriverLocation()) return;
    let disposed = false;
    const sync = () => {
      operations = operations.catch(() => {}).then(async () => {
        if (disposed || !ready || !driverId) return;
        if (!enabled || !driverId || !auth.currentUser) { await plugin.stop(); return; }
        const user = auth.currentUser;
        await user.getIdToken(); // Ensure this is a usable Firebase session before storing its refresh credential.
        if (disposed || auth.currentUser?.uid !== user.uid) return;
        await plugin.configure({ driverId, authUid: user.uid, refreshToken: user.refreshToken,
          apiKey: app.options.apiKey, orderId: delivery ? order?.id : '' });
      }).then(() => { if (!disposed) setError(null); }).catch(() => {
        if (!disposed) setError('No se pudo activar el GPS en segundo plano. Revisa la ubicación precisa y verifica tu cuenta.');
      });
    };
    const stopAuth = onAuthStateChanged(auth, sync);
    // Unmounting/minimizing the portal must not stop the native service.
    return () => { disposed = true; stopAuth(); };
  }, [driverId, enabled, delivery, order?.id, available, ready]);
  useEffect(() => {
    if (!isNativeDriverLocation()) return;
    let disposed = false;
    const update = () => plugin.status().then(next => { if (!disposed) setState(next); }).catch(() => {});
    void update(); const timer = setInterval(update, 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  const currentCoords = state?.gpsTimestamp ? { lat: state.lat, lng: state.lng, latitude: state.lat, longitude: state.lng,
    accuracy: state.accuracy, timestamp: state.gpsTimestamp } as GpsPoint & { latitude: number; longitude: number } : null;
  return { isTracking: !!state?.running, currentCoords, lastUpdate: state?.lastUpdate ? new Date(state.lastUpdate) : null,
    error: error || state?.error || null, manualForceSync: () => plugin.status().then(setState).catch(() => {}) };
}
