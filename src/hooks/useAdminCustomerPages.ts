import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { CustomerProfile, OrderItem } from '../types';
import {
  countCustomerStats, fetchCustomerStatsPage, fetchScopedOrders, hasClientSideRefine,
} from '../lib/adminCustomerPage';
import type { CustomerStatsDoc, CustomerStatsQueryOptions, TimeRangeOption } from '../lib/adminCustomerPage';

/** Páginas seguidas sin resultados visibles antes de pausar la carga automática. */
const MAX_EMPTY_AUTO_PAGES = 5;

/**
 * Clientes desde customerStats, de 4 en 4 (limit + startAfter).
 * Al cambiar orden, segmento o búsqueda se reinicia la paginación y se ignoran
 * las respuestas de consultas anteriores.
 */
export function useCustomerStatsPages(options: CustomerStatsQueryOptions, enabled: boolean) {
  const [clients, setClients] = useState<CustomerStatsDoc[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const lastVisible = useRef<QueryDocumentSnapshot | null>(null);
  const pending = useRef(false);
  const more = useRef(true);
  const generation = useRef(0);
  const seen = useRef(new Set<string>());
  const emptyPages = useRef(0);
  const optionsRef = useRef(options);
  const totalRef = useRef<number | null>(null);
  const key = `${options.sortBy}|${options.segment}|${options.search.trim().toLowerCase()}`;

  const loadMore = useCallback(async (manual = false) => {
    if (pending.current || !more.current) return;
    if (!manual && emptyPages.current >= MAX_EMPTY_AUTO_PAGES) return;
    const gen = generation.current;
    if (manual) {
      emptyPages.current = 0;
      setIsPaused(false);
      // Si el contador también había fallado, se vuelve a pedir.
      if (totalRef.current === null) {
        countCustomerStats(optionsRef.current)
          .then(count => { if (gen === generation.current) { totalRef.current = count; setTotal(count); } })
          .catch(err => console.warn('[Clientes] No se pudo contar', err));
      }
    }
    const isFirst = lastVisible.current === null;
    pending.current = true;
    if (isFirst) setIsLoading(true); else setIsLoadingMore(true);
    setError(null);
    try {
      const page = await fetchCustomerStatsPage(optionsRef.current, lastVisible.current);
      if (gen !== generation.current) return; // filtros cambiaron: respuesta vieja
      const fresh = page.docs.filter(doc => !seen.current.has(doc.key));
      fresh.forEach(doc => seen.current.add(doc.key));
      lastVisible.current = page.cursor;
      more.current = page.hasMore;
      setHasMore(page.hasMore);
      if (fresh.length > 0) {
        emptyPages.current = 0;
        setClients(previous => [...previous, ...fresh]);
      } else if (page.hasMore && ++emptyPages.current >= MAX_EMPTY_AUTO_PAGES) {
        setIsPaused(true);
      }
    } catch (err) {
      if (gen !== generation.current) return;
      console.warn('[Clientes] Error cargando página', err);
      setError('No se pudieron cargar más clientes. Revisa tu conexión.');
    } finally {
      if (gen === generation.current) {
        pending.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, []);

  // Reinicio al cambiar filtros (la búsqueda llega ya con debounce desde el componente).
  useEffect(() => {
    optionsRef.current = options;
    generation.current += 1;
    const gen = generation.current;
    lastVisible.current = null;
    pending.current = false;
    more.current = true;
    seen.current = new Set();
    emptyPages.current = 0;
    setClients([]);
    setHasMore(true);
    setError(null);
    setIsPaused(false);
    setTotal(null);
    totalRef.current = null;
    if (!enabled) { setIsLoading(false); return; }
    void loadMore();
    countCustomerStats(options)
      .then(count => { if (gen === generation.current) { totalRef.current = count; setTotal(count); } })
      .catch(err => console.warn('[Clientes] No se pudo contar', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, loadMore]);

  useEffect(() => () => { generation.current += 1; }, []);

  const patchClient = useCallback((clientKey: string, patch: Partial<CustomerStatsDoc>) => {
    setClients(previous => previous.map(c => c.key === clientKey ? { ...c, ...patch } : c));
  }, []);

  return {
    clients, isLoading, isLoadingMore, hasMore, error, isPaused,
    total, totalIsApproximate: hasClientSideRefine(options), loadMore, patchClient,
  };
}

/**
 * Filtro por tienda y/o periodo: solo los pedidos de ese alcance (no toda la colección),
 * más los perfiles de esos clientes. El componente los muestra de 4 en 4.
 */
export function useScopedCustomerOrders(store: string, range: TimeRangeOption, enabled: boolean) {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) { setOrders([]); setProfiles([]); setError(null); setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setOrders([]);
    setProfiles([]);
    fetchScopedOrders(store, range)
      .then(result => { if (!cancelled) { setOrders(result.orders); setProfiles(result.profiles); } })
      .catch(err => {
        if (cancelled) return;
        console.warn('[Clientes] Error cargando pedidos filtrados', err);
        setError('No se pudieron cargar los clientes de este filtro. Revisa tu conexión.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [store, range, enabled, attempt]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);
  return { orders, profiles, setProfiles, isLoading, error, retry };
}
