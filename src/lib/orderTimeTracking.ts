/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RYYCO Order Time Measurement & State Lifecycle Engine
 * Official states: Pendiente -> Procesando -> Enviado -> Entregado / Cancelado
 * Handles automated timestamping, stage duration calculation in seconds,
 * active order real-time elapsed tickers, historical audit reconstruction, and global/store analytics.
 */

import { OrderItem, OrderStatus, OrderStatusHistoryItem } from '../types';

export type OfficialOrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export const OFFICIAL_ORDER_STATUSES: OfficialOrderStatus[] = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled'
];

export const STATUS_METADATA: Record<OfficialOrderStatus, {
  label: string;
  shortLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
  iconName: string;
}> = {
  pending: {
    label: 'Pendiente',
    shortLabel: 'Pend.',
    badgeBg: 'bg-amber-950/80',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-800/60',
    dotColor: 'bg-amber-400',
    iconName: 'Clock'
  },
  processing: {
    label: 'Procesando',
    shortLabel: 'Proc.',
    badgeBg: 'bg-sky-950/80',
    badgeText: 'text-sky-400',
    badgeBorder: 'border-sky-800/60',
    dotColor: 'bg-sky-400',
    iconName: 'PackageCheck'
  },
  shipped: {
    label: 'Enviado',
    shortLabel: 'Env.',
    badgeBg: 'bg-purple-950/80',
    badgeText: 'text-purple-400',
    badgeBorder: 'border-purple-800/60',
    dotColor: 'bg-purple-400',
    iconName: 'Bike'
  },
  delivered: {
    label: 'Entregado',
    shortLabel: 'Entr.',
    badgeBg: 'bg-emerald-950/80',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-800/60',
    dotColor: 'bg-emerald-400',
    iconName: 'CheckCircle2'
  },
  cancelled: {
    label: 'Cancelado',
    shortLabel: 'Canc.',
    badgeBg: 'bg-red-950/80',
    badgeText: 'text-red-400',
    badgeBorder: 'border-red-800/60',
    dotColor: 'bg-red-400',
    iconName: 'XCircle'
  }
};

/**
 * Normalizes any legacy or custom internal order status into one of the 5 official states
 */
export function normalizeOfficialStatus(rawStatus?: OrderStatus | string | null): OfficialOrderStatus {
  if (!rawStatus) return 'pending';
  const s = rawStatus.toLowerCase().trim();

  if (s === 'delivered') return 'delivered';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'shipped' || s === 'delivering' || s === 'picked_up' || s === 'to_client' || s === 'at_destination') {
    return 'shipped';
  }
  if (s === 'processing' || s === 'confirmed' || s === 'preparing' || s === 'ready' || s === 'accepted') {
    return 'processing';
  }
  return 'pending';
}

/**
 * Parses an ISO string or Date to Unix epoch seconds
 */
export function toEpochSeconds(dateInput?: string | Date | null): number | null {
  if (!dateInput) return null;
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const t = d.getTime();
  if (isNaN(t)) return null;
  return Math.floor(t / 1000);
}

/**
 * Formats a duration in seconds into clean human readable format (e.g., "6 min", "40 min", "1 h 15 min")
 */
export function formatDurationHuman(seconds?: number | null, fallback = '-'): string {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) {
    return fallback;
  }
  if (seconds === 0) return '0 min';
  if (seconds < 60) {
    return '< 1 min';
  }
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${hours} h ${remainingMinutes} min`;
}

/**
 * Formats only the time (e.g. "18:32") in Colombia local time
 */
export function formatTimeColombian(isoString?: string | null): string {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Formats date and time for timeline display (e.g. "18:32 • 24 Sep")
 */
export function formatDateTimeColombian(isoString?: string | null): string {
  if (!isoString) return 'Sin fecha';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Sin fecha';
  const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  return `${time} (${date})`;
}

/**
 * Calculates updated timestamps, durations in seconds and audit history when transitioning order status.
 * Guarantees that timestamps are never deleted, and durations are persisted accurately in seconds.
 */
export function applyOrderTimeTransition(
  currentOrder: OrderItem,
  rawNextStatus: OrderStatus,
  meta?: {
    userId?: string;
    userRole?: 'admin' | 'restaurant' | 'driver' | 'customer' | 'system';
    restaurantId?: string;
    driverId?: string;
    note?: string;
    reason?: string;
    cancelledBy?: 'admin' | 'restaurant' | 'driver' | 'customer' | 'system';
  }
): Partial<OrderItem> {
  const now = new Date().toISOString();
  const nowSec = Math.floor(new Date(now).getTime() / 1000);
  const nextOfficial = normalizeOfficialStatus(rawNextStatus);

  // Preserve existing timestamps or initialize pendingAt
  const pendingAt = currentOrder.pendingAt || currentOrder.createdAt || now;
  const pendingSec = toEpochSeconds(pendingAt) || nowSec;

  let processingAt = currentOrder.processingAt;
  let shippedAt = currentOrder.shippedAt;
  let deliveredAt = currentOrder.deliveredAt;
  let cancelledAt = currentOrder.cancelledAt;

  let pendingDuration = currentOrder.pendingDuration;
  let processingDuration = currentOrder.processingDuration;
  let shippingDuration = currentOrder.shippingDuration;
  let totalDuration = currentOrder.totalDuration;
  let cancellationDuration = currentOrder.cancellationDuration;

  if (nextOfficial === 'processing') {
    if (!processingAt) {
      processingAt = now;
      const procSec = nowSec;
      pendingDuration = Math.max(0, procSec - pendingSec);
    }
  } else if (nextOfficial === 'shipped') {
    if (!processingAt) {
      // If skipped directly from pending to shipped
      processingAt = pendingAt;
      pendingDuration = 0;
    }
    if (!shippedAt) {
      shippedAt = now;
      const shipSec = nowSec;
      const procSec = toEpochSeconds(processingAt) || pendingSec;
      processingDuration = Math.max(0, shipSec - procSec);
    }
  } else if (nextOfficial === 'delivered') {
    if (!processingAt) {
      processingAt = pendingAt;
      pendingDuration = 0;
    }
    if (!shippedAt) {
      shippedAt = processingAt;
      processingDuration = 0;
    }
    if (!deliveredAt) {
      deliveredAt = now;
      const delSec = nowSec;
      const shipSec = toEpochSeconds(shippedAt) || toEpochSeconds(processingAt) || pendingSec;
      shippingDuration = Math.max(0, delSec - shipSec);
      totalDuration = Math.max(0, delSec - pendingSec);
    }
  } else if (nextOfficial === 'cancelled') {
    if (!cancelledAt) {
      cancelledAt = now;
      const cancSec = nowSec;
      cancellationDuration = Math.max(0, cancSec - pendingSec);
    }
  }

  // Construct new audit history record
  const defaultNotes: Record<OfficialOrderStatus, string> = {
    pending: 'Pedido recibido - Pendiente',
    processing: 'Pedido en cocina / procesando',
    shipped: 'Pedido entregado al domiciliario - En camino',
    delivered: '¡Pedido entregado con éxito!',
    cancelled: meta?.reason || meta?.note || 'Pedido cancelado'
  };

  const newHistoryRecord: OrderStatusHistoryItem = {
    status: rawNextStatus,
    timestamp: now,
    note: meta?.note || defaultNotes[nextOfficial],
    updatedBy: meta?.userRole || (nextOfficial === 'cancelled' ? meta?.cancelledBy : undefined) || 'system',
    userId: meta?.userId,
    userRole: meta?.userRole,
    restaurantId: meta?.restaurantId || currentOrder.storeOwnerId,
    driverId: meta?.driverId || currentOrder.deliveryDriverId || currentOrder.driverId
  };

  const existingHistory = currentOrder.orderStatusHistory || currentOrder.statusHistory || [
    {
      status: 'pending',
      timestamp: pendingAt,
      note: 'Inicio de pedido',
      updatedBy: 'customer',
      userRole: 'customer'
    }
  ];

  const updatedHistory = [...existingHistory, newHistoryRecord];

  const updates: Partial<OrderItem> = {
    status: rawNextStatus,
    pendingAt,
    orderStatusHistory: updatedHistory,
    statusHistory: updatedHistory
  };

  if (processingAt) updates.processingAt = processingAt;
  if (shippedAt) updates.shippedAt = shippedAt;
  if (deliveredAt && nextOfficial !== 'cancelled') updates.deliveredAt = deliveredAt;
  if (cancelledAt) updates.cancelledAt = cancelledAt;

  if (pendingDuration !== undefined) updates.pendingDuration = pendingDuration;
  if (processingDuration !== undefined) updates.processingDuration = processingDuration;
  if (shippingDuration !== undefined) updates.shippingDuration = shippingDuration;
  if (totalDuration !== undefined && nextOfficial !== 'cancelled') updates.totalDuration = totalDuration;
  if (cancellationDuration !== undefined) updates.cancellationDuration = cancellationDuration;

  if (nextOfficial === 'cancelled') {
    updates.cancelledBy = meta?.cancelledBy || meta?.userRole || 'admin';
    updates.cancellationReason = meta?.reason || meta?.note || currentOrder.cancellationReason || 'Cancelado por administración';
    // Ensure deliveredAt is not set on cancelled orders
    delete (updates as any).deliveredAt;
    delete (updates as any).totalDuration;
  }

  return updates;
}

export interface TimelineStep {
  status: OfficialOrderStatus;
  label: string;
  timeFormatted: string;
  timestamp: string;
  stageDurationSeconds?: number;
  stageDurationFormatted?: string;
  isCompleted: boolean;
  isCurrent: boolean;
  note?: string;
  updatedByRole?: string;
}

export interface OrderTimelineResult {
  officialStatus: OfficialOrderStatus;
  steps: TimelineStep[];
  totalDurationSeconds?: number;
  totalDurationFormatted: string;
  cancellationDurationSeconds?: number;
  cancellationDurationFormatted?: string;
  isCancelled: boolean;
  cancelledBy?: string;
  cancellationReason?: string;
  cancellationStage?: OfficialOrderStatus;
}

/**
 * Reconstructs or extracts the complete visual timeline of an order.
 * Works seamlessly with both newly created and historic pre-existing orders.
 */
export function getOrderTimeline(order: OrderItem): OrderTimelineResult {
  const officialStatus = normalizeOfficialStatus(order.status);
  const isCancelled = officialStatus === 'cancelled';

  // 1. Primary timestamps from persisted fields
  let pendingAt = order.pendingAt || order.createdAt;
  let processingAt = order.processingAt;
  let shippedAt = order.shippedAt;
  let deliveredAt = order.deliveredAt;
  let cancelledAt = order.cancelledAt;

  // 2. If timestamps are missing on historic orders, inspect audit history
  const history = order.orderStatusHistory || order.statusHistory || [];
  if (history.length > 0) {
    history.forEach(item => {
      const canonical = normalizeOfficialStatus(item.status);
      if (canonical === 'pending' && !pendingAt) pendingAt = item.timestamp;
      if (canonical === 'processing' && !processingAt) processingAt = item.timestamp;
      if (canonical === 'shipped' && !shippedAt) shippedAt = item.timestamp;
      if (canonical === 'delivered' && !deliveredAt) deliveredAt = item.timestamp;
      if (canonical === 'cancelled' && !cancelledAt) cancelledAt = item.timestamp;
    });
  }

  // 3. Fallbacks for completed orders if intermediate stamps weren't written
  if (officialStatus === 'delivered' && !deliveredAt) {
    deliveredAt = order.createdAt;
  }
  if (isCancelled && !cancelledAt) {
    cancelledAt = order.createdAt;
  }

  // Durations
  const pendingSec = toEpochSeconds(pendingAt);
  const procSec = toEpochSeconds(processingAt);
  const shipSec = toEpochSeconds(shippedAt);
  const delSec = toEpochSeconds(deliveredAt);
  const cancSec = toEpochSeconds(cancelledAt);

  const pendingDuration = order.pendingDuration !== undefined
    ? order.pendingDuration
    : (pendingSec && procSec ? Math.max(0, procSec - pendingSec) : undefined);

  const processingDuration = order.processingDuration !== undefined
    ? order.processingDuration
    : (procSec && shipSec ? Math.max(0, shipSec - procSec) : undefined);

  const shippingDuration = order.shippingDuration !== undefined
    ? order.shippingDuration
    : (shipSec && delSec ? Math.max(0, delSec - shipSec) : undefined);

  const totalDuration = !isCancelled
    ? (order.totalDuration !== undefined
        ? order.totalDuration
        : (pendingSec && delSec ? Math.max(0, delSec - pendingSec) : undefined))
    : undefined;

  const cancellationDuration = isCancelled
    ? (order.cancellationDuration !== undefined
        ? order.cancellationDuration
        : (pendingSec && cancSec ? Math.max(0, cancSec - pendingSec) : undefined))
    : undefined;

  // Build steps
  const steps: TimelineStep[] = [];

  // Step 1: Pendiente
  steps.push({
    status: 'pending',
    label: 'Pendiente',
    timestamp: pendingAt,
    timeFormatted: formatTimeColombian(pendingAt),
    stageDurationSeconds: undefined,
    stageDurationFormatted: undefined,
    isCompleted: Boolean(processingAt || shippedAt || deliveredAt || isCancelled),
    isCurrent: officialStatus === 'pending'
  });

  // If order moved through processing
  if (processingAt || officialStatus === 'processing' || officialStatus === 'shipped' || officialStatus === 'delivered' || (isCancelled && procSec)) {
    steps.push({
      status: 'processing',
      label: 'Procesando',
      timestamp: processingAt || '',
      timeFormatted: processingAt ? formatTimeColombian(processingAt) : '--:--',
      stageDurationSeconds: pendingDuration,
      stageDurationFormatted: pendingDuration !== undefined ? `${formatDurationHuman(pendingDuration)} en Pendiente` : undefined,
      isCompleted: Boolean(shippedAt || deliveredAt || (isCancelled && cancSec && procSec && cancSec > procSec)),
      isCurrent: officialStatus === 'processing'
    });
  }

  // If order moved through shipped
  if (shippedAt || officialStatus === 'shipped' || officialStatus === 'delivered' || (isCancelled && shipSec)) {
    steps.push({
      status: 'shipped',
      label: 'Enviado',
      timestamp: shippedAt || '',
      timeFormatted: shippedAt ? formatTimeColombian(shippedAt) : '--:--',
      stageDurationSeconds: processingDuration,
      stageDurationFormatted: processingDuration !== undefined ? `${formatDurationHuman(processingDuration)} en Procesando` : undefined,
      isCompleted: Boolean(deliveredAt),
      isCurrent: officialStatus === 'shipped'
    });
  }

  // Final step: Delivered OR Cancelled
  if (isCancelled) {
    let cancellationStage: OfficialOrderStatus = 'pending';
    if (shipSec && cancSec && cancSec >= shipSec) cancellationStage = 'shipped';
    else if (procSec && cancSec && cancSec >= procSec) cancellationStage = 'processing';

    steps.push({
      status: 'cancelled',
      label: 'Cancelado',
      timestamp: cancelledAt || '',
      timeFormatted: cancelledAt ? formatTimeColombian(cancelledAt) : '--:--',
      stageDurationSeconds: cancellationDuration,
      stageDurationFormatted: cancellationDuration !== undefined ? `${formatDurationHuman(cancellationDuration)} hasta cancelación` : undefined,
      isCompleted: true,
      isCurrent: true,
      note: order.cancellationReason || 'Cancelado',
      updatedByRole: order.cancelledBy || 'admin'
    });

    return {
      officialStatus,
      steps,
      cancellationDurationSeconds: cancellationDuration,
      cancellationDurationFormatted: formatDurationHuman(cancellationDuration),
      isCancelled: true,
      cancelledBy: order.cancelledBy,
      cancellationReason: order.cancellationReason,
      cancellationStage,
      totalDurationFormatted: '-'
    };
  }

  // Normal delivered flow
  if (deliveredAt || officialStatus === 'delivered') {
    steps.push({
      status: 'delivered',
      label: 'Entregado',
      timestamp: deliveredAt || '',
      timeFormatted: deliveredAt ? formatTimeColombian(deliveredAt) : '--:--',
      stageDurationSeconds: shippingDuration,
      stageDurationFormatted: shippingDuration !== undefined ? `${formatDurationHuman(shippingDuration)} en Enviado` : undefined,
      isCompleted: true,
      isCurrent: true
    });
  }

  return {
    officialStatus,
    steps,
    totalDurationSeconds: totalDuration,
    totalDurationFormatted: formatDurationHuman(totalDuration),
    isCancelled: false
  };
}

export interface ActiveOrderElapsedResult {
  status: OfficialOrderStatus;
  statusLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  elapsedSeconds: number;
  elapsedMinutes: number;
  elapsedFormatted: string;
  badgeShortText: string;
  urgencyLevel: 'normal' | 'warning' | 'critical';
}

/**
 * Calculates live elapsed time in current status for an active order (Pendiente, Procesando, Enviado)
 */
export function getActiveOrderElapsed(order: OrderItem, nowMs: number = Date.now()): ActiveOrderElapsedResult | null {
  const status = normalizeOfficialStatus(order.status);
  if (status === 'delivered' || status === 'cancelled') {
    return null;
  }

  let startIso = order.pendingAt || order.createdAt;
  if (status === 'processing') {
    startIso = order.processingAt || order.pendingAt || order.createdAt;
  } else if (status === 'shipped') {
    startIso = order.shippedAt || order.processingAt || order.pendingAt || order.createdAt;
  }

  const startSec = toEpochSeconds(startIso) || Math.floor(nowMs / 1000);
  const nowSec = Math.floor(nowMs / 1000);
  const elapsedSeconds = Math.max(0, nowSec - startSec);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  const meta = STATUS_METADATA[status];

  // Thresholds for visual warnings (e.g. pending > 10m is warning, > 20m is critical)
  let urgencyLevel: 'normal' | 'warning' | 'critical' = 'normal';
  if (status === 'pending') {
    if (elapsedMinutes >= 15) urgencyLevel = 'critical';
    else if (elapsedMinutes >= 7) urgencyLevel = 'warning';
  } else if (status === 'processing') {
    if (elapsedMinutes >= 35) urgencyLevel = 'critical';
    else if (elapsedMinutes >= 20) urgencyLevel = 'warning';
  } else if (status === 'shipped') {
    if (elapsedMinutes >= 45) urgencyLevel = 'critical';
    else if (elapsedMinutes >= 25) urgencyLevel = 'warning';
  }

  const durationStr = elapsedMinutes < 1 ? '< 1 min' : `${elapsedMinutes} min`;

  return {
    status,
    statusLabel: meta.label,
    badgeBg: meta.badgeBg,
    badgeText: meta.badgeText,
    badgeBorder: meta.badgeBorder,
    elapsedSeconds,
    elapsedMinutes,
    elapsedFormatted: `Lleva: ${durationStr}`,
    badgeShortText: `${meta.label} • ${durationStr}`,
    urgencyLevel
  };
}

export type OrderDateFilterType = 
  | 'all'
  | 'today'
  | 'yesterday'
  | '7days'
  | '30days'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface OrderTimeStats {
  totalOrdersCount: number;
  deliveredCount: number;
  cancelledCount: number;
  activeCount: number;
  deliveredRate: number; // percentage 0 - 100
  cancelledRate: number; // percentage 0 - 100

  // Averages in seconds and formatted
  avgPendingSeconds: number;
  avgPendingFormatted: string;

  avgProcessingSeconds: number;
  avgProcessingFormatted: string;

  avgShippingSeconds: number;
  avgShippingFormatted: string;

  avgTotalSeconds: number;
  avgTotalFormatted: string;

  avgCancellationSeconds: number;
  avgCancellationFormatted: string;

  // Breakdown by store
  storesBreakdown: StoreOrderTimeStats[];

  // Active orders with elapsed time
  activeOrdersList: {
    order: OrderItem;
    elapsed: ActiveOrderElapsedResult;
  }[];
}

export interface StoreOrderTimeStats {
  storeId: string;
  storeName: string;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  deliveredRate: number;
  cancelledRate: number;
  avgPendingFormatted: string;
  avgProcessingFormatted: string;
  avgShippingFormatted: string;
  avgTotalFormatted: string;
}

/**
 * Filter orders according to date and time range using Colombia local time
 */
export function filterOrdersByDate(
  orders: OrderItem[],
  dateFilter: OrderDateFilterType,
  customStart?: string,
  customEnd?: string
): OrderItem[] {
  if (dateFilter === 'all') return orders;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return orders.filter(o => {
    const d = new Date(o.createdAt);
    if (isNaN(d.getTime())) return false;

    if (dateFilter === 'today') {
      return d >= startOfDay && d <= endOfDay;
    }

    if (dateFilter === 'yesterday') {
      const yestStart = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);
      const yestEnd = new Date(endOfDay.getTime() - 24 * 60 * 60 * 1000);
      return d >= yestStart && d <= yestEnd;
    }

    if (dateFilter === '7days') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d >= past7 && d <= now;
    }

    if (dateFilter === '30days') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return d >= past30 && d <= now;
    }

    if (dateFilter === 'this_month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return d >= monthStart && d <= endOfDay;
    }

    if (dateFilter === 'last_month') {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return d >= lastMonthStart && d <= lastMonthEnd;
    }

    if (dateFilter === 'custom') {
      if (customStart && customEnd) {
        const cStart = new Date(`${customStart}T00:00:00`);
        const cEnd = new Date(`${customEnd}T23:59:59`);
        return d >= cStart && d <= cEnd;
      } else if (customStart) {
        const cStart = new Date(`${customStart}T00:00:00`);
        return d >= cStart;
      } else if (customEnd) {
        const cEnd = new Date(`${customEnd}T23:59:59`);
        return d <= cEnd;
      }
    }

    return true;
  });
}

/**
 * Calculates global and per-store order time statistics
 */
export function calculateOrderTimeStatistics(
  allOrders: OrderItem[],
  filters: {
    storeId?: string;
    dateFilter?: OrderDateFilterType;
    customStartDate?: string;
    customEndDate?: string;
  },
  storeNamesMap: Record<string, string> = {},
  nowMs: number = Date.now()
): OrderTimeStats {
  const {
    storeId = 'all',
    dateFilter = 'all',
    customStartDate,
    customEndDate
  } = filters;

  // 1. Filter by store if specified
  let filtered = storeId && storeId !== 'all' 
    ? allOrders.filter(o => o.storeOwnerId === storeId) 
    : allOrders;

  // 2. Filter by date period
  filtered = filterOrdersByDate(filtered, dateFilter, customStartDate, customEndDate);

  let totalOrdersCount = filtered.length;
  let deliveredCount = 0;
  let cancelledCount = 0;
  let activeCount = 0;

  let pendingDurationSum = 0;
  let pendingDurationCount = 0;

  let processingDurationSum = 0;
  let processingDurationCount = 0;

  let shippingDurationSum = 0;
  let shippingDurationCount = 0;

  let totalDurationSum = 0;
  let totalDurationCount = 0;

  let cancellationDurationSum = 0;
  let cancellationDurationCount = 0;

  // Per-store accumulator
  const storeMap: Record<string, {
    storeId: string;
    storeName: string;
    total: number;
    delivered: number;
    cancelled: number;
    active: number;
    pendingSum: number;
    pendingCount: number;
    procSum: number;
    procCount: number;
    shipSum: number;
    shipCount: number;
    totalSum: number;
    totalCount: number;
  }> = {};

  const activeOrdersList: { order: OrderItem; elapsed: ActiveOrderElapsedResult }[] = [];

  filtered.forEach(order => {
    const sId = order.storeOwnerId || 'general';
    const sName = storeNamesMap[sId] || order.storeName || 'Tienda RYYCO';

    if (!storeMap[sId]) {
      storeMap[sId] = {
        storeId: sId,
        storeName: sName,
        total: 0,
        delivered: 0,
        cancelled: 0,
        active: 0,
        pendingSum: 0,
        pendingCount: 0,
        procSum: 0,
        procCount: 0,
        shipSum: 0,
        shipCount: 0,
        totalSum: 0,
        totalCount: 0
      };
    }
    storeMap[sId].total += 1;

    const timeline = getOrderTimeline(order);
    const { officialStatus } = timeline;

    if (officialStatus === 'delivered') {
      deliveredCount++;
      storeMap[sId].delivered++;

      if (timeline.totalDurationSeconds && timeline.totalDurationSeconds > 0) {
        totalDurationSum += timeline.totalDurationSeconds;
        totalDurationCount++;
        storeMap[sId].totalSum += timeline.totalDurationSeconds;
        storeMap[sId].totalCount++;
      }
    } else if (officialStatus === 'cancelled') {
      cancelledCount++;
      storeMap[sId].cancelled++;

      if (timeline.cancellationDurationSeconds && timeline.cancellationDurationSeconds > 0) {
        cancellationDurationSum += timeline.cancellationDurationSeconds;
        cancellationDurationCount++;
      }
    } else {
      activeCount++;
      storeMap[sId].active++;

      const elapsed = getActiveOrderElapsed(order, nowMs);
      if (elapsed) {
        activeOrdersList.push({ order, elapsed });
      }
    }

    // Step durations (only include non-cancelled in delivery averages, but pending/processing can contribute if valid)
    timeline.steps.forEach(step => {
      if (step.status === 'processing' && step.stageDurationSeconds && step.stageDurationSeconds > 0) {
        pendingDurationSum += step.stageDurationSeconds;
        pendingDurationCount++;
        storeMap[sId].pendingSum += step.stageDurationSeconds;
        storeMap[sId].pendingCount++;
      }
      if (step.status === 'shipped' && step.stageDurationSeconds && step.stageDurationSeconds > 0) {
        processingDurationSum += step.stageDurationSeconds;
        processingDurationCount++;
        storeMap[sId].procSum += step.stageDurationSeconds;
        storeMap[sId].procCount++;
      }
      if (step.status === 'delivered' && step.stageDurationSeconds && step.stageDurationSeconds > 0) {
        shippingDurationSum += step.stageDurationSeconds;
        shippingDurationCount++;
        storeMap[sId].shipSum += step.stageDurationSeconds;
        storeMap[sId].shipCount++;
      }
    });
  });

  // Sort active orders by oldest/most urgent first
  activeOrdersList.sort((a, b) => b.elapsed.elapsedSeconds - a.elapsed.elapsedSeconds);

  // Compute global averages
  const avgPendingSeconds = pendingDurationCount > 0 ? Math.round(pendingDurationSum / pendingDurationCount) : 0;
  const avgProcessingSeconds = processingDurationCount > 0 ? Math.round(processingDurationSum / processingDurationCount) : 0;
  const avgShippingSeconds = shippingDurationCount > 0 ? Math.round(shippingDurationSum / shippingDurationCount) : 0;
  const avgTotalSeconds = totalDurationCount > 0 ? Math.round(totalDurationSum / totalDurationCount) : 0;
  const avgCancellationSeconds = cancellationDurationCount > 0 ? Math.round(cancellationDurationSum / cancellationDurationCount) : 0;

  const deliveredRate = totalOrdersCount > 0 ? Math.round((deliveredCount / totalOrdersCount) * 100) : 0;
  const cancelledRate = totalOrdersCount > 0 ? Math.round((cancelledCount / totalOrdersCount) * 100) : 0;

  // Build per-store breakdown list sorted by most orders
  const storesBreakdown: StoreOrderTimeStats[] = Object.values(storeMap)
    .map(s => {
      const avgP = s.pendingCount > 0 ? Math.round(s.pendingSum / s.pendingCount) : 0;
      const avgProc = s.procCount > 0 ? Math.round(s.procSum / s.procCount) : 0;
      const avgS = s.shipCount > 0 ? Math.round(s.shipSum / s.shipCount) : 0;
      const avgT = s.totalCount > 0 ? Math.round(s.totalSum / s.totalCount) : 0;
      const dRate = s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0;
      const cRate = s.total > 0 ? Math.round((s.cancelled / s.total) * 100) : 0;

      return {
        storeId: s.storeId,
        storeName: s.storeName,
        totalOrders: s.total,
        deliveredOrders: s.delivered,
        cancelledOrders: s.cancelled,
        activeOrders: s.active,
        deliveredRate: dRate,
        cancelledRate: cRate,
        avgPendingFormatted: formatDurationHuman(avgP),
        avgProcessingFormatted: formatDurationHuman(avgProc),
        avgShippingFormatted: formatDurationHuman(avgS),
        avgTotalFormatted: formatDurationHuman(avgT)
      };
    })
    .sort((a, b) => b.totalOrders - a.totalOrders);

  return {
    totalOrdersCount,
    deliveredCount,
    cancelledCount,
    activeCount,
    deliveredRate,
    cancelledRate,
    avgPendingSeconds,
    avgPendingFormatted: formatDurationHuman(avgPendingSeconds),
    avgProcessingSeconds,
    avgProcessingFormatted: formatDurationHuman(avgProcessingSeconds),
    avgShippingSeconds,
    avgShippingFormatted: formatDurationHuman(avgShippingSeconds),
    avgTotalSeconds,
    avgTotalFormatted: formatDurationHuman(avgTotalSeconds),
    avgCancellationSeconds,
    avgCancellationFormatted: formatDurationHuman(avgCancellationSeconds),
    storesBreakdown,
    activeOrdersList
  };
}
