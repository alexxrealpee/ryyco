import {
  collection, documentId, getAggregateFromServer, getCountFromServer, getDocs, limit, orderBy,
  query, startAfter, sum, count, where,
} from 'firebase/firestore';
import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { CustomerProfile, OrderItem } from '../types';

/**
 * Consultas del ranking de Clientes del panel de administración.
 *
 * Los clientes se leen de customerStats (un documento por cliente, mantenido por las
 * Cloud Functions de functions/customerStats.cjs). Así se puede ordenar por pedidos,
 * gasto, RYYCOS o fecha y paginar de 4 en 4 directamente en Firestore.
 */

export const ADMIN_CUSTOMER_PAGE_SIZE = 4;
const STATS = 'customerStats';

export type CustomerSortOption = 'orders_desc' | 'orders_asc' | 'spent_desc' | 'recent_desc' | 'ryycos_desc' | 'ryycos_asc';
export type CustomerSegmentOption = 'all' | 'vip' | 'frequent' | 'new' | 'has_whatsapp' | 'has_ryycos' | 'welcome_pending' | 'welcome_sent';

export interface CustomerStatsOrderSummary {
  status: string;
  amount: number;
  store: string;
  storeName: string;
  at: string;
}

export interface CustomerStatsProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  points?: number;
  ryycos?: number;
  spinsAvailable: number;
  welcomeMessageSentAt?: string | null;
  totalOrdersCount: number;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerStatsDoc {
  key: string;
  name: string;
  rawPhone: string;
  cleanPhone: string;
  email?: string;
  addresses: string[];
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  totalSpent: number;
  averageTicket: number;
  firstOrderAt: string;
  lastOrderAt: string;
  favoriteStoreId: string | null;
  favoriteStoreName: string;
  stores: Record<string, { name: string; count: number; spent: number }>;
  orders: Record<string, CustomerStatsOrderSummary>;
  ryycos: number;
  spinsAvailable: number;
  isRegisteredProfile: boolean;
  welcomeMessageSentAt: string | null;
  profile: CustomerStatsProfile | null;
  tags: string[];
  searchTerms: string[];
}

export interface CustomerStatsQueryOptions {
  sortBy: CustomerSortOption;
  segment: CustomerSegmentOption;
  search: string;
}

const SORT_FIELDS: Record<CustomerSortOption, [string, 'asc' | 'desc'][]> = {
  orders_desc: [['totalOrders', 'desc'], ['totalSpent', 'desc']],
  orders_asc: [['totalOrders', 'asc'], ['totalSpent', 'asc']],
  spent_desc: [['totalSpent', 'desc'], ['totalOrders', 'desc']],
  recent_desc: [['lastOrderAt', 'desc']],
  ryycos_desc: [['ryycos', 'desc'], ['totalOrders', 'desc']],
  ryycos_asc: [['ryycos', 'asc'], ['totalOrders', 'asc']],
};

const MAX_PREFIX = 20;

function normalizeText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convierte lo que escribe el administrador en términos de búsqueda.
 * - Teléfono (solo números, espacios, + o -): prefijo del número sin +57.
 * - Texto: cada palabra debe ser el inicio de una palabra del nombre, la tienda
 *   habitual, la dirección o el correo. El servidor filtra por la palabra más larga
 *   y el resto se comprueba aquí.
 */
export function parseCustomerSearch(raw: string): { serverTerm: string | null; allTerms: string[] } {
  const trimmed = raw.trim();
  if (!trimmed) return { serverTerm: null, allTerms: [] };
  if (/^[\d\s+\-()]+$/.test(trimmed)) {
    let digits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
    if ((trimmed.startsWith('+57') || digits.length > 10) && digits.startsWith('57')) digits = digits.slice(2);
    if (digits.length < 3) return { serverTerm: null, allTerms: [] };
    const term = digits.slice(0, 10);
    return { serverTerm: term, allTerms: [term] };
  }
  const words = normalizeText(trimmed).split(' ').filter(w => w.length >= 2).map(w => w.slice(0, MAX_PREFIX));
  if (words.length === 0) return { serverTerm: null, allTerms: [] };
  const serverTerm = [...words].sort((a, b) => b.length - a.length)[0];
  return { serverTerm, allTerms: [...new Set(words)] };
}

function filtersFor(opts: CustomerStatsQueryOptions): { server: QueryConstraint[]; refine: (doc: CustomerStatsDoc) => boolean } {
  const { serverTerm, allTerms } = parseCustomerSearch(opts.search);
  const segmentTag = opts.segment === 'all' ? null : opts.segment;
  // Firestore permite un solo array-contains por consulta: si hay búsqueda, el
  // segmento se comprueba aquí; si no, el segmento va al servidor.
  const server: QueryConstraint[] = serverTerm
    ? [where('searchTerms', 'array-contains', serverTerm)]
    : segmentTag ? [where('tags', 'array-contains', segmentTag)] : [];
  const refine = (doc: CustomerStatsDoc) => {
    if (serverTerm && segmentTag && !(doc.tags || []).includes(segmentTag)) return false;
    if (allTerms.length > 1) {
      const terms = new Set(doc.searchTerms || []);
      return allTerms.every(t => terms.has(t));
    }
    return true;
  };
  return { server, refine };
}

/** True si parte del filtro se aplica en el navegador (el conteo del servidor es aproximado). */
export function hasClientSideRefine(opts: CustomerStatsQueryOptions): boolean {
  const { serverTerm, allTerms } = parseCustomerSearch(opts.search);
  return !!serverTerm && (opts.segment !== 'all' || allTerms.length > 1);
}

function baseQuery(opts: CustomerStatsQueryOptions, extra: QueryConstraint[] = []) {
  const { server } = filtersFor(opts);
  const sorts = SORT_FIELDS[opts.sortBy].map(([field, dir]) => orderBy(field, dir));
  const ref = collection(db, STATS);
  return query(ref, ...server, ...sorts, ...extra);
}

function toStatsDoc(snapshot: QueryDocumentSnapshot): CustomerStatsDoc {
  return { ...(snapshot.data() as CustomerStatsDoc), key: snapshot.id };
}

/** Una página de máximo 4 clientes, ordenada y filtrada en Firestore. */
export async function fetchCustomerStatsPage(opts: CustomerStatsQueryOptions, cursor: QueryDocumentSnapshot | null) {
  const snapshot = await getDocs(baseQuery(opts, [
    ...(cursor ? [startAfter(cursor)] : []),
    limit(ADMIN_CUSTOMER_PAGE_SIZE),
  ]));
  const { refine } = filtersFor(opts);
  return {
    docs: snapshot.docs.map(toStatsDoc).filter(refine),
    cursor: snapshot.docs.at(-1) ?? cursor,
    fetched: snapshot.size,
    hasMore: snapshot.size === ADMIN_CUSTOMER_PAGE_SIZE,
  };
}

/** Total de clientes que cumplen los filtros, contado en el servidor (sin descargar documentos). */
export async function countCustomerStats(opts: CustomerStatsQueryOptions): Promise<number> {
  const { server } = filtersFor(opts);
  const ref = collection(db, STATS);
  const snapshot = await getCountFromServer(query(ref, ...server));
  return snapshot.data().count;
}

/** Tarjetas de resumen de toda la plataforma, con consultas de agregación (count/sum). */
export async function fetchCustomerSummary() {
  const ref = collection(db, STATS);
  const countTag = async (tag: string) =>
    (await getCountFromServer(query(ref, where('tags', 'array-contains', tag)))).data().count;
  const [totals, withWhatsApp, recurring, welcomeSent, welcomePending, vip, frequent, newCount, hasRyycos, top] = await Promise.all([
    getAggregateFromServer(query(ref), { total: count(), spent: sum('totalSpent'), ryycos: sum('ryycos') }),
    countTag('has_whatsapp'),
    countTag('recurring'),
    countTag('welcome_sent'),
    countTag('welcome_pending'),
    countTag('vip'),
    countTag('frequent'),
    countTag('new'),
    countTag('has_ryycos'),
    getDocs(query(ref, orderBy('totalOrders', 'desc'), orderBy('totalSpent', 'desc'), limit(1))),
  ]);
  const data = totals.data();
  return {
    totalCustomers: data.total,
    totalPlatformSpent: Number(data.spent) || 0,
    totalPlatformRyycos: Number(data.ryycos) || 0,
    withWhatsApp,
    recurringCustomers: recurring,
    welcomeSentCount: welcomeSent,
    welcomePendingCount: welcomePending,
    vipCount: vip,
    frequentCount: frequent,
    newCount,
    hasRyycosCount: hasRyycos,
    top: top.empty ? null : toStatsDoc(top.docs[0]),
  };
}

/** Todos los clientes que cumplen los filtros, solo para exportar CSV (acción manual). */
export async function fetchAllCustomerStats(opts: CustomerStatsQueryOptions): Promise<CustomerStatsDoc[]> {
  const snapshot = await getDocs(baseQuery(opts));
  const { refine } = filtersFor(opts);
  return snapshot.docs.map(toStatsDoc).filter(refine);
}

/** Siguiente cliente con bienvenida pendiente, saltando los marcados en este navegador. */
export async function fetchNextPendingWelcome(skipPhones: Set<string>): Promise<CustomerStatsDoc | null> {
  let cursor: QueryDocumentSnapshot | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await getDocs(query(collection(db, STATS), where('tags', 'array-contains', 'welcome_pending'),
      orderBy('totalOrders', 'desc'), orderBy('totalSpent', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(10)));
    const found = snapshot.docs.map(toStatsDoc).find(doc => !skipPhones.has(doc.cleanPhone));
    if (found) return found;
    if (snapshot.size < 10) return null;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
  return null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Historial de un cliente: solo sus pedidos, por ID, al abrir el detalle. */
export async function fetchOrdersByIds(ids: string[]): Promise<OrderItem[]> {
  const results = await Promise.all(chunks(ids, 30).map(group =>
    getDocs(query(collection(db, 'orders'), where(documentId(), 'in', group)))));
  return results.flatMap(snap => snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as OrderItem)))
    .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
}

export type TimeRangeOption = 'all' | 'this_month' | 'last_30_days' | 'last_7_days';

function rangeStart(range: TimeRangeOption): string | null {
  const now = new Date();
  if (range === 'this_month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (range === 'last_30_days') return new Date(now.getTime() - 30 * 86400000).toISOString();
  if (range === 'last_7_days') return new Date(now.getTime() - 7 * 86400000).toISOString();
  return null;
}

/**
 * Filtros por tienda o por periodo: se piden solo los pedidos de esa tienda y/o de ese
 * periodo (no toda la colección) y los perfiles de esos clientes desde customerStats.
 */
export async function fetchScopedOrders(store: string, range: TimeRangeOption) {
  const constraints: QueryConstraint[] = [];
  if (store !== 'all') constraints.push(where('storeOwnerId', '==', store));
  const start = rangeStart(range);
  if (start) constraints.push(where('createdAt', '>=', start));
  if (constraints.length === 0) throw new Error('fetchScopedOrders requiere tienda o periodo');
  const snapshot = await getDocs(query(collection(db, 'orders'), ...constraints));
  const orders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as OrderItem));

  const phoneKeys = new Set<string>();
  orders.forEach(order => {
    let digits = String(order.customerPhone || '').replace(/\D/g, '').replace(/^0+/, '');
    if ((digits.length === 12 || digits.length === 11) && digits.startsWith('57')) digits = digits.slice(2);
    else if (digits.length > 10 && digits.startsWith('573')) digits = digits.slice(2);
    if (digits.length >= 7) phoneKeys.add(`p_${digits}`);
  });
  const statsSnaps = await Promise.all(chunks([...phoneKeys], 30).map(group =>
    getDocs(query(collection(db, STATS), where(documentId(), 'in', group)))));
  const profiles: CustomerProfile[] = [];
  statsSnaps.forEach(snap => snap.docs.forEach(doc => {
    const p = (doc.data() as CustomerStatsDoc).profile;
    if (p) profiles.push({ ...p, movements: [], points: p.points ?? p.ryycos ?? 0 } as unknown as CustomerProfile);
  }));
  return { orders, profiles };
}
