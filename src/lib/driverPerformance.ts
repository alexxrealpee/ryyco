import type { DriverProfile, DriverRating, OrderItem } from '../types';

export interface DriverPerformance {
  completed: number;
  ratingCount: number;
  average: number | null;
  checkedAt: number;
}
export type DriverPerformanceSort = 'default' | 'deliveries' | 'rating';

/** Only retained, completed orders belonging to this driver are evidence of delivery. */
export function calculateDriverPerformance(
  driverId: string,
  orders: Pick<OrderItem, 'id' | 'status' | 'deliveryStep' | 'deliveryDriverId' | 'driverId'>[],
  ratings: Pick<DriverRating, 'id' | 'orderId' | 'driverId' | 'stars' | 'createdAt'>[],
  checkedAt = Date.now(),
): DriverPerformance {
  const completed = new Set(orders.filter(order =>
    (order.deliveryDriverId || order.driverId) === driverId &&
    order.status !== 'cancelled' &&
    (order.status === 'delivered' ||
      (order.deliveryStep === 'delivered' && ['confirmed', 'preparing', 'ready', 'picked_up', 'delivering', 'processing', 'shipped'].includes(order.status)))
  ).map(order => order.id).filter(Boolean));
  // Old submissions used auto IDs. Keep the first valid evaluation per delivered order.
  const unique = new Map<string, number>();
  [...ratings].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id))
    .forEach(rating => {
      if (rating.driverId !== driverId || !completed.has(rating.orderId) || unique.has(rating.orderId) ||
          !Number.isInteger(rating.stars) || rating.stars < 1 || rating.stars > 5) return;
      unique.set(rating.orderId, rating.stars);
    });
  const sum = [...unique.values()].reduce((total, stars) => total + stars, 0);
  return { completed: completed.size, ratingCount: unique.size, average: unique.size ? sum / unique.size : null, checkedAt };
}

export function selectPerformanceDrivers(
  drivers: DriverProfile[], stats: Record<string, DriverPerformance>,
  search: string, status: string, availability: string,
  sort: DriverPerformanceSort, ascending = false,
) {
  const term = search.trim().toLocaleLowerCase('es');
  const selected = drivers.filter(d =>
    `${d.firstName || ''} ${d.lastName || ''} ${d.docNumber || ''} ${d.email || ''} ${d.phone || ''}`.toLocaleLowerCase('es').includes(term) &&
    (status === 'all' || d.status === status) &&
    (availability === 'all' || (availability === 'available' ? !!d.isAvailable : !d.isAvailable))
  );
  if (sort === 'default') return selected;
  return selected.sort((a, b) => {
    const left = stats[a.id], right = stats[b.id];
    const x = sort === 'deliveries' ? left?.completed : left?.average;
    const y = sort === 'deliveries' ? right?.completed : right?.average;
    // Unknown values always follow verified values, even in ascending order.
    if (x == null || y == null) return x == null && y == null ? a.id.localeCompare(b.id) : x == null ? 1 : -1;
    return (ascending && sort === 'deliveries' ? x - y : y - x) ||
      (sort === 'rating' ? right.ratingCount - left.ratingCount : 0) || a.id.localeCompare(b.id);
  });
}

/** Empirical Bayesian mean: 10 evaluations of weight at the observed cohort mean. */
export function buildDriverRankings(drivers: DriverProfile[], stats: Record<string, DriverPerformance>, minimum = 5) {
  const eligible = drivers.filter(d => d.status === 'approved' && stats[d.id]);
  const rated = eligible.filter(d => stats[d.id].ratingCount > 0 && stats[d.id].average !== null);
  const votes = rated.reduce((sum, d) => sum + stats[d.id].ratingCount, 0);
  const prior = votes ? rated.reduce((sum, d) => sum + stats[d.id].average! * stats[d.id].ratingCount, 0) / votes : 0;
  const minimumCount = Number.isFinite(minimum) ? Math.max(1, Math.floor(minimum)) : 5;
  return {
    deliveries: eligible.filter(d => stats[d.id].completed > 0)
      .sort((a, b) => stats[b.id].completed - stats[a.id].completed || a.id.localeCompare(b.id)).slice(0, 10),
    ratings: rated.filter(d => stats[d.id].ratingCount >= minimumCount).map(driver => {
      const s = stats[driver.id];
      return { driver, score: (s.average! * s.ratingCount + 10 * prior) / (s.ratingCount + 10) };
    }).sort((a, b) => b.score - a.score || stats[b.driver.id].ratingCount - stats[a.driver.id].ratingCount || a.driver.id.localeCompare(b.driver.id)).slice(0, 10),
  };
}
