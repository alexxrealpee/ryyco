import { collection, getDocsFromServer, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { DriverRating, OrderItem } from '../types';
import { calculateDriverPerformance, type DriverPerformance } from './driverPerformance';

export const PERFORMANCE_CACHE_MS = 10 * 60 * 1000;
const pending = new Map<string, Promise<DriverPerformance>>();
const memory = new Map<string, DriverPerformance>();

// Cache only verified summaries, scoped to the signed-in administrator. Never cache failures as zeros.
export async function fetchDriverPerformance(driverId: string, force = false): Promise<DriverPerformance> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para consultar el rendimiento.');
  const key = `ryyco_driver_performance_v1:${uid}:${driverId}`;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  if (!force) {
    let cached = memory.get(key);
    try { cached ||= JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { /* storage unavailable */ }
    if (cached && Number.isInteger(cached.completed) && cached.completed >= 0 &&
        Number.isInteger(cached.ratingCount) && cached.ratingCount >= 0 && cached.ratingCount <= cached.completed &&
        (cached.ratingCount === 0 ? cached.average === null : typeof cached.average === 'number' && cached.average >= 1 && cached.average <= 5) &&
        Date.now() >= cached.checkedAt && Date.now() - cached.checkedAt < PERFORMANCE_CACHE_MS) return cached;
  }
  const request = (async () => {
    // Existing single-field indexes; no full orders-collection scan or new indexes required.
    const [current, legacy, ratings] = await Promise.all([
      getDocsFromServer(query(collection(db, 'orders'), where('deliveryDriverId', '==', driverId))),
      getDocsFromServer(query(collection(db, 'orders'), where('driverId', '==', driverId))),
      getDocsFromServer(query(collection(db, 'driver_ratings'), where('driverId', '==', driverId))),
    ]);
    const orders = new Map<string, OrderItem>();
    // Current driver field is authoritative when an old alias remains after reassignment.
    for (const snapshot of [legacy, current]) snapshot.docs.forEach(d => orders.set(d.id, { ...d.data(), id: d.id } as OrderItem));
    const result = calculateDriverPerformance(driverId, [...orders.values()], ratings.docs.map(d => ({ ...d.data(), id: d.id } as DriverRating)));
    if (auth.currentUser?.uid !== uid) throw new Error('La sesión cambió. Actualiza los datos.');
    memory.set(key, result);
    try { sessionStorage.setItem(key, JSON.stringify(result)); } catch { /* memory cache remains available */ }
    return result;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
