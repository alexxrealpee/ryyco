import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, deleteField, type Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import type { DeliveryTrackingData } from '../types';
import { validCoordinates, distanceMeters } from './deliveryTracking';

export type TrackingConnection = 'connecting' | 'live' | 'cached' | 'offline' | 'error';

export function createDeliveryTrackingService(db: Firestore) {
  // Serialize location and stop writes across hook restarts, not just within one watch.
  const writes = new Map<string, Promise<void>>();
  function enqueue(orderId: string, operation: () => Promise<void>) {
    const next = (writes.get(orderId) || Promise.resolve()).catch(() => {}).then(operation);
    writes.set(orderId, next);
    const release = () => { if (writes.get(orderId) === next) writes.delete(orderId); };
    next.then(release, release);
    return next;
  }

  function updateDeliveryLiveLocation(data: Partial<DeliveryTrackingData> & { orderId: string; driverId: string }) {
    if (!data.orderId || !data.driverId ||
        ((data.lat !== undefined || data.lng !== undefined) && !validCoordinates(data.lat, data.lng))) {
      return Promise.reject(new Error('Datos GPS inválidos.'));
    }
    const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    return enqueue(data.orderId, async () => {
      const auth = getAuth(db.app);
      if (!auth.currentUser) await auth.authStateReady?.();
      const user = auth.currentUser;
      if (!user) throw Object.assign(new Error('Inicia sesión para transmitir GPS.'), { code: 'permission-denied' });
      if (data.gpsTimestamp !== undefined && Date.now() - data.gpsTimestamp > 15_000) {
        throw Object.assign(new Error('La posición GPS pendiente ya es antigua.'), { code: 'stale-gps' });
      }
      await setDoc(doc(db, 'delivery_tracking', data.orderId), {
        ...clean, updatedAt: new Date().toISOString(), serverUpdatedAt: serverTimestamp(),
        heartbeatAt: serverTimestamp(), driverAuthUid: user.uid, isTrackingActive: data.isTrackingActive ?? true,
      }, { merge: true });
    });
  }

  function listenToDeliveryTracking(orderId: string, onUpdate: (data: DeliveryTrackingData | null) => void,
    onConnection?: (state: TrackingConnection, error?: string) => void): () => void {
    if (!orderId) { onUpdate(null); return () => {}; }
    let lastGps = 0, lastServer = 0;
    let previous: { lat: number; lng: number; accuracy: number; timestamp: number } | null = null;
    return onSnapshot(doc(db, 'delivery_tracking', orderId), { includeMetadataChanges: true }, snapshot => {
      onConnection?.(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? 'cached' : 'live');
      if (!snapshot.exists()) { onUpdate(null); return; }
      const raw = snapshot.data();
      const stamp = raw.serverUpdatedAt?.toMillis?.() || Date.parse(raw.updatedAt) || 0;
      if (stamp < lastServer) return;
      const gps = raw.gpsTimestamp ?? Date.parse(raw.updatedAt);
      // Heartbeats/terminal states may change without changing the last GPS fix.
      if (Number.isFinite(gps) && gps < lastGps && raw.isTrackingActive !== false) return;
      if (raw.isTrackingActive !== false && validCoordinates(raw.lat, raw.lng) && Number.isFinite(gps)) {
        const point = { lat: raw.lat, lng: raw.lng, accuracy: Math.max(0, raw.accuracy ?? 0), timestamp: gps };
        if (previous && distanceMeters(previous, point) >
            42 * Math.max(0, gps - previous.timestamp) / 1000 + previous.accuracy + point.accuracy) return;
        previous = point;
      }
      lastServer = stamp;
      lastGps = Math.max(lastGps, Number.isFinite(gps) ? gps : 0);
      onUpdate({ ...raw, orderId: snapshot.id, fromCache: snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites,
        serverUpdatedAtMs: stamp } as DeliveryTrackingData);
    }, error => onConnection?.('error', error.code === 'permission-denied'
      ? 'No hay permiso para consultar este rastreo.' : 'No se pudo conectar con el rastreo.'));
  }

  function stopDeliveryTracking(orderId: string, status?: 'delivered' | 'cancelled') {
    return enqueue(orderId, async () => {
      try {
        await updateDoc(doc(db, 'delivery_tracking', orderId), {
          isTrackingActive: false, ...(status ? { status } : {}),
          updatedAt: new Date().toISOString(), serverUpdatedAt: serverTimestamp(),
          lat: deleteField(), lng: deleteField(), heading: deleteField(), speed: deleteField(), accuracy: deleteField(),
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'not-found') throw error;
      }
    });
  }
  return { updateDeliveryLiveLocation, listenToDeliveryTracking, stopDeliveryTracking };
}
