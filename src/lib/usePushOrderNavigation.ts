import { useEffect, useRef } from 'react';

// Resolve only orders already loaded by the authenticated portal; never trust push data as an order.
export function usePushOrderNavigation<T extends { id: string }>(
  role: 'admin' | 'seller' | 'driver', orders: T[], open: (order: T) => void, showOrders: () => void
) {
  const callbacks = useRef({ open, showOrders });
  callbacks.current = { open, showOrders };
  useEffect(() => {
    const navigate = () => {
      const url = new URL(window.location.href);
      const id = url.searchParams.get('pushOrder');
      if (!id) return;
      callbacks.current.showOrders();
      const order = orders.find(item => item.id === id);
      if (!order) return; // Keep the destination while authenticated data is loading.
      callbacks.current.open(order);
      url.searchParams.delete('pushOrder');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    };
    navigate();
    window.addEventListener(`ryyco:${role}-navigate-tab`, navigate);
    window.addEventListener('popstate', navigate);
    return () => {
      window.removeEventListener(`ryyco:${role}-navigate-tab`, navigate);
      window.removeEventListener('popstate', navigate);
    };
  }, [role, orders]);
}
