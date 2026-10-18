import type { ProductItem, UserProfile } from '../types';

const normalize = (value?: string) => (value || '').trim().toLowerCase();

// A known owner wins over a conflicting legacy username. Never guess by display name.
export function resolveProductStore<T extends { uid: string; username?: string }>(
  product: { userId?: string; storeUsername?: string }, stores: T[]
): T | undefined {
  return stores.find(store => store.uid === product.userId) ||
    stores.find(store => normalize(store.username) &&
      (normalize(store.username) === normalize(product.storeUsername) ||
       normalize(store.username) === normalize(product.userId)));
}

// Keep the committed prefix fixed, then choose the least represented shop.
// This also gives newly opened shops a turn before repeating an established shop.
export function balanceCatalog(products: ProductItem[], stores: UserProfile[], prefix: string[] = []): ProductItem[] {
  const byId = new Map(products.map(product => [product.id, product]));
  const result = prefix.flatMap(id => {
    const product = byId.get(id);
    if (!product) return [];
    byId.delete(id);
    return [product];
  });
  const queues = new Map<string, ProductItem[]>();
  const counts = new Map<string, number>();
  const owner = (product: ProductItem) => resolveProductStore(product, stores)?.uid || product.userId;
  result.forEach(product => counts.set(owner(product), (counts.get(owner(product)) || 0) + 1));
  byId.forEach(product => {
    const key = owner(product);
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key)!.push(product);
  });
  while (queues.size) {
    let next: string | undefined;
    for (const key of queues.keys()) {
      if (next === undefined || (counts.get(key) || 0) < (counts.get(next) || 0)) next = key;
    }
    const queue = queues.get(next!)!;
    result.push(queue.shift()!);
    counts.set(next!, (counts.get(next!) || 0) + 1);
    if (!queue.length) queues.delete(next!);
  }
  return result;
}
