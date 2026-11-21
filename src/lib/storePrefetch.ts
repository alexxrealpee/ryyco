import { GeoPoint, Timestamp } from 'firebase/firestore';
import { buildProfileFromPrefetch } from './firebase';
import type { UserProfile } from '../types';

/**
 * Datos de la página de un restaurante que index.html empieza a descargar desde
 * /api/store-page.php antes de que cargue la app (ver index.html).
 */
interface StorePagePayload {
  found: boolean;
  username: string;
  profile: { id: string; data: any };
  links: { id: string; data: any }[];
  products: { id: string; data: any }[];
  theme: any | null;
}

interface StorePrefetch {
  u: string;
  t?: number;
  p: Promise<StorePagePayload | null>;
  data?: StorePagePayload | null;
}

type BuiltStore = ReturnType<typeof buildProfileFromPrefetch>;

/** Reconstruye fechas (Timestamp) y coordenadas (GeoPoint) igual que el SDK. */
function revive(value: any): any {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    if (value.__ryycoType === 'timestamp') return Timestamp.fromDate(new Date(value.value));
    if (value.__ryycoType === 'geopoint') return new GeoPoint(value.latitude, value.longitude);
    const out: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) out[key] = revive(item);
    return out;
  }
  return value;
}

function normalize(username: string): string {
  return (username || '').trim().toLowerCase();
}

/** Vigencia de la descarga anticipada: cubre la carga inicial (y un montaje repetido de React). */
const MAX_AGE_MS = 60_000;

function prefetchFor(username: string): StorePrefetch | null {
  const pre = (window as any).__RYYCO_STORE__ as StorePrefetch | undefined;
  if (!pre || pre.u !== normalize(username)) return null;
  if (pre.t && Date.now() - pre.t > MAX_AGE_MS) { (window as any).__RYYCO_STORE__ = undefined; return null; }
  return pre;
}

function build(payload: StorePagePayload | null | undefined, username: string): BuiltStore | null {
  if (!payload || !payload.found || !payload.profile) return null;
  try {
    const profile = { ...revive(payload.profile.data), uid: payload.profile.id } as UserProfile;
    return buildProfileFromPrefetch(
      profile,
      normalize(username),
      payload.links.map(l => ({ id: l.id, data: revive(l.data) })),
      payload.products.map(p => ({ id: p.id, data: revive(p.data) })),
      payload.theme ? revive(payload.theme) : null
    );
  } catch (err) {
    console.warn('[Tienda] Datos precargados inválidos, se usa la carga normal', err);
    return null;
  }
}

/** Si los datos ya llegaron, los devuelve al instante (sin pantalla de carga). */
export function takeReadyStore(username: string): BuiltStore | null {
  const pre = prefetchFor(username);
  if (!pre || pre.data === undefined) return null;
  return build(pre.data, username);
}

/** Espera la descarga anticipada si sigue en curso. Devuelve null si no hay o falló. */
export async function awaitPrefetchedStore(username: string): Promise<BuiltStore | null> {
  const pre = prefetchFor(username);
  if (!pre) return null;
  const payload = pre.data !== undefined ? pre.data : await pre.p.catch(() => null);
  return build(payload, username);
}
