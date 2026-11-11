/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupplierProduct } from '../types/ryycoB2B';

/**
 * Formatea valores monetarios en Pesos Colombianos (COP) sin centavos
 */
export function formatCop(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(amount));
}

/**
 * Sanea números de teléfono internacionales al estándar de clave primaria RYYCO:
 * sin espacios, guiones ni signo '+' (ej. "573154954232")
 */
export function sanitizeRyycoPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  return digits;
}

/**
 * Calcula el precio unitario efectivo de una presentación según la cantidad ordenada
 * evaluando las escalas mayoristas (volumeTiers).
 */
export function getEffectiveUnitPrice(product: SupplierProduct, quantity: number): number {
  let effective = product.priceCop;
  const sortedTiers = [...product.volumeTiers].sort((a, b) => a.minQty - b.minQty);
  for (const tier of sortedTiers) {
    if (quantity >= tier.minQty) {
      effective = tier.unitPriceCop;
    }
  }
  return effective;
}

/**
 * Calcula el costo real normalizado por unidad de medida base (ej. COP por 1 kg, 1 litro o 1 unidad)
 * para comparar objetivamente proveedores con empaques de distinto tamaño.
 */
export function getNormalizedUnitCost(product: SupplierProduct, quantity: number = 1): number {
  const presentationPrice = getEffectiveUnitPrice(product, quantity);
  return presentationPrice / Math.max(product.baseUnitQuantity, 0.001);
}

/**
 * Formatea duraciones en segundos para auditoría de KPIs de RYYCO
 */
export function formatDurationKpi(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

/**
 * Genera un PIN numérico aleatorio de 4 dígitos para verificación de entrega en cocina
 */
export function generateDeliveryPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
