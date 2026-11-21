import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { CustomerProfile, OrderItem } from '../types';
import { fetchAdminCustomerPage } from '../lib/adminCustomerPage';

export function useAdminCustomerPages() {
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const pending = useRef(false);
  const cursor = useRef<QueryDocumentSnapshot | null>(null);
  const more = useRef(true);
  const loadNext = useCallback(async () => {
    if (!active.current || pending.current || !more.current) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminCustomerPage(cursor.current);
      if (!active.current) return;
      setProfiles(previous => [...new Map([...previous, ...page.profiles].map(p => [p.id, p])).values()]);
      setOrders(previous => [...new Map([...previous, ...page.orders].map(o => [o.id, o])).values()]);
      cursor.current = page.cursor;
      more.current = page.hasMore;
      setHasMore(page.hasMore);
    } catch {
      if (active.current) setError('No se pudieron cargar los clientes. Puedes reintentar sin perder los ya cargados.');
    } finally {
      pending.current = false;
      if (active.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    void loadNext();
    return () => { active.current = false; };
  }, [loadNext]);
  return { profiles, setProfiles, orders, loading, hasMore, error, loadNext };
}
