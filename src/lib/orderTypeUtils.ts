import { OrderItem } from '../types';

export function checkIsTableOrder(order?: Partial<OrderItem> | null): boolean {
  if (!order) return false;
  if (order.orderType === 'table' || order.isTableOrder) return true;
  if (order.customerName?.toLowerCase().startsWith('mesa ') || order.customerAddress?.toLowerCase().includes('mesa')) return true;
  return false;
}

export function checkIsPickupOrder(order?: Partial<OrderItem> | null): boolean {
  if (!order) return false;
  if (order.orderType === 'pickup') return true;
  if (order.customerAddress?.toLowerCase().includes('recoger')) return true;
  return false;
}
