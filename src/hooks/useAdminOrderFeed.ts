import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { deduplicateOrders, fetchAdminOrdersBatch, subscribeToRecentAdminOrders } from '../lib/firebase';
import type { PaginatedOrdersResult } from '../lib/firebase';
import type { OrderItem } from '../types';

type RecentOrders = (orders: OrderItem[], incoming: OrderItem[], removed: Set<string>) => void;

function ranksBefore(order: OrderItem, boundary: QueryDocumentSnapshot): boolean {
  const rawDate = boundary.get('createdAt');
  const boundaryDate = typeof rawDate === 'string' ? rawDate : rawDate?.toDate?.().toISOString();
  const difference = Date.parse(order.createdAt) - Date.parse(boundaryDate);
  return difference === 0 ? order.id > boundary.id : difference > 0;
}

export function useAdminOrderFeed(onRecentOrders: RecentOrders) {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const recentCallback = useRef(onRecentOrders);
  recentCallback.current = onRecentOrders;
  const history = useRef({ cursor: null as QueryDocumentSnapshot | null, pending: false, active: false, liveReady: false, failed: false });

  useEffect(() => {
    const state = { cursor: null as QueryDocumentSnapshot | null, pending: false, active: true, liveReady: false, failed: false };
    history.current = state;
    setOrders([]);
    setHasMore(false);
    setLoading(true);
    setError(null);
    const timeout = window.setTimeout(() => {
      if (!state.active || state.liveReady) return;
      setLoading(false);
      setError('No se pudo sincronizar la lista de pedidos.');
    }, 15000);

    let recent: PaginatedOrdersResult | undefined;
    const seen = new Set<string>();
    const unsubscribe = subscribeToRecentAdminOrders(page => {
      if (!state.active) return;
      const previous = recent;
      const latestIds = new Set(page.orders.map(order => order.id));
      const removed = new Set(previous?.orders.filter(order => !latestIds.has(order.id) &&
        (!page.hasMore || (page.lastDoc && ranksBefore(order, page.lastDoc)))).map(order => order.id));

      // Keep orders displaced by newer arrivals. A burst beyond the previous
      // window invalidates cached history so a later page cannot skip the gap.
      const latestTail = page.orders.at(-1);
      const jumpedWindow = previous?.lastDoc && latestTail && ranksBefore(latestTail, previous.lastDoc) &&
        previous.orders.every(order => !latestIds.has(order.id));
      if (!state.liveReady || jumpedWindow || (previous && !previous.hasMore && page.hasMore)) {
        state.cursor = page.hasMore ? page.lastDoc : null;
        setHasMore(Boolean(state.cursor));
      }
      if (!state.liveReady) {
        window.clearTimeout(timeout);
        setLoading(false);
        setError(null);
      }
      state.liveReady = true;
      recent = page;

      const incoming = previous ? page.orders.filter(order => !seen.has(order.id) &&
        (!previous.hasMore || (previous.lastDoc && ranksBefore(order, previous.lastDoc)))) : [];
      page.orders.forEach(order => seen.add(order.id));
      setOrders(prior => {
        const retained = jumpedWindow ? [] : prior.filter(order => !removed.has(order.id));
        const merged = new Map(retained.map(order => [order.id, order]));
        page.orders.forEach(order => merged.set(order.id, order));
        return Array.from(merged.values());
      });
      recentCallback.current(page.orders, incoming, removed);
    }, () => {
      if (!state.active) return;
      window.clearTimeout(timeout);
      state.failed = true;
      setLoading(false);
      setError('No se pudo sincronizar la lista de pedidos.');
    });

    return () => {
      state.active = false;
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, [attempt]);

  const loadNext = useCallback(async () => {
    const state = history.current;
    const cursor = state.cursor;
    if (!state.active || !cursor || state.pending || state.failed) return false;
    state.pending = true;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminOrdersBatch(cursor);
      if (!state.active || state.cursor !== cursor) return false;
      setOrders(prior => {
        const existingIds = new Set(prior.map(order => order.id));
        return [...prior, ...page.orders.filter(order => !existingIds.has(order.id))];
      });
      state.cursor = page.hasMore ? page.lastDoc : null;
      setHasMore(Boolean(state.cursor));
      return true;
    } catch {
      if (state.active && state.cursor === cursor) setError('No se pudieron cargar los siguientes pedidos.');
      return false;
    } finally {
      state.pending = false;
      if (state.active) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => setAttempt(previous => previous + 1), []);
  const retry = useCallback(async () => {
    if (history.current.failed || !history.current.liveReady) {
      refresh();
      return false;
    }
    return loadNext();
  }, [refresh, loadNext]);
  const sortedOrders = useMemo(() => deduplicateOrders([...orders].sort((a, b) =>
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || (a.id < b.id ? 1 : -1)
  )), [orders]);
  return { orders: sortedOrders, setOrders, hasMore, loading, error, loadNext, refresh, retry };
}
