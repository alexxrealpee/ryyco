import { useEffect, useRef } from 'react';

// Resolve through authenticated portal data or a server lookup; push data alone is not an order.
export function usePushOrderNavigation<T extends { id: string }>(
  role: 'admin' | 'seller' | 'driver', orders: T[], open: (order: T) => void, showOrders: () => void,
  resolveOrder?: (orderId: string) => Promise<T | null>
) {
  const callbacks = useRef({ open, showOrders });
  const lookups = useRef(new Map<string, Promise<T | null>>());
  callbacks.current = { open, showOrders };
  useEffect(() => {
    let active = true;
    const openOrder = (order: T) => {
      const url = new URL(window.location.href);
      if (!active || url.searchParams.get('pushOrder') !== order.id) return;
      callbacks.current.open(order);
      url.searchParams.delete('pushOrder');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    };
    const navigate = () => {
      const url = new URL(window.location.href);
      const id = url.searchParams.get('pushOrder');
      if (!id) return;
      callbacks.current.showOrders();
      const order = orders.find(item => item.id === id);
      if (order) return openOrder(order);
      if (!resolveOrder) return;
      let lookup = lookups.current.get(id);
      if (!lookup) {
        lookup = resolveOrder(id).finally(() => lookups.current.delete(id));
        lookups.current.set(id, lookup);
      }
      void lookup.then(result => { if (result) openOrder(result); }).catch(() => {});
    };
    navigate();
    window.addEventListener(`ryyco:${role}-navigate-tab`, navigate);
    window.addEventListener('popstate', navigate);
    return () => {
      active = false;
      window.removeEventListener(`ryyco:${role}-navigate-tab`, navigate);
      window.removeEventListener('popstate', navigate);
    };
  }, [role, orders, resolveOrder]);
}
