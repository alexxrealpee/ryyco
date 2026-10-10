/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WhatsApp Driver Notifications Module for RYYCO
 * Handles formatted WhatsApp message generation, link building, real-time tracking
 * of online/active delivery drivers, and sequential or batch dispatch when an order
 * arrives in General Administration.
 */

import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { DriverProfile, OrderItem } from '../types';

/**
 * Normalizes any Colombian or international phone number to the standard WhatsApp format (e.g. 573106502043)
 */
export function normalizeWhatsAppNumber(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';

  // If already starts with 57 and is 12 digits, keep it
  if (digits.startsWith('57') && digits.length >= 12) {
    return digits;
  }
  // Standard Colombian mobile: 10 digits starting with 3
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  // If 11 digits starting with 0 or other prefix
  if (digits.length === 11 && digits.startsWith('573')) {
    return digits;
  }
  // If 10 digits other
  if (digits.length === 10) {
    return `57${digits}`;
  }
  return digits;
}

/**
 * Formats a clean display phone number for UI badges (e.g. "310 650 2043")
 */
export function formatPhoneDisplay(rawPhone?: string | null): string {
  if (!rawPhone) return 'Sin teléfono';
  const clean = normalizeWhatsAppNumber(rawPhone);
  const core = clean.startsWith('57') && clean.length >= 12 ? clean.slice(2) : clean;
  if (core.length === 10) {
    return `${core.slice(0, 3)} ${core.slice(3, 6)} ${core.slice(6)}`;
  }
  return core;
}

/**
 * Generates an attractive, high-converting WhatsApp notification text for delivery drivers
 */
export function buildDriverOrderWhatsAppMessage(
  order: OrderItem,
  driver?: DriverProfile | null,
  storeNameFallback?: string,
  customTemplate?: string
): string {
  const orderNum = order.orderNumber ? `#${order.orderNumber}` : 'S/N';
  const storeName = order.storeName || storeNameFallback || 'Restaurante / Tienda en RYYCO';
  const address = order.customerAddress || 'Dirección de Entrega';
  const reference = order.customerReference ? `\n📌 *Referencia Entrega:* ${order.customerReference}` : '';
  const storeAddress = order.storeAddress ? `\n📍 *Recoger en:* ${order.storeAddress}` : '';
  const storeRef = order.storeReference ? `\n🏢 *Ref Tienda:* ${order.storeReference}` : '';
  const fee = order.deliveryCost || order.deliveryFee || 3000;
  const feeFormatted = `$${Number(fee).toLocaleString('es-CO')} COP`;
  const totalFormatted = `$${Number(order.totalAmount || 0).toLocaleString('es-CO')} COP`;
  const driverGreeting = driver?.firstName ? `¡Hola *${driver.firstName}*! ` : '¡Hola! ';
  
  const paymentMethodLabel = 
    order.paymentMethod === 'cod' ? 'Contra entrega (Efectivo)' :
    order.paymentMethod === 'delivery_cash' ? 'Efectivo contra entrega' :
    order.paymentMethod === 'transfer' ? 'Transferencia (Ya pagado)' :
    order.paymentMethod === 'whatsapp' ? 'Por WhatsApp' : 'Efectivo';

  const itemsSummary = order.items && order.items.length > 0 
    ? order.items.map(i => `• ${i.quantity}x ${i.name}${i.selectedVariant ? ` (${i.selectedVariant})` : ''}`).join('\n')
    : (order.notes ? `• ${order.notes}` : '• Productos del pedido');

  // If a custom template is provided, we can support basic replacements
  if (customTemplate && customTemplate.trim().length > 10) {
    return customTemplate
      .replace(/{orderNumber}/g, String(order.orderNumber || ''))
      .replace(/{storeName}/g, storeName)
      .replace(/{customerAddress}/g, address)
      .replace(/{customerName}/g, order.customerName || 'Cliente')
      .replace(/{deliveryFee}/g, feeFormatted)
      .replace(/{totalAmount}/g, totalFormatted)
      .replace(/{driverName}/g, driver?.firstName || 'Domiciliario')
      .replace(/{itemsSummary}/g, itemsSummary);
  }

  return (
    `*Pedido:*\n` +
    `${itemsSummary}\n\n` +
    `👉 *¡Ingresa ya a tu app de Domiciliario para ACEPTAR el servicio antes que los demás!*:\n` +
    `📲 https://ryyco.com/?view=driver\n\n` +
    `📞 *Recuerda llamar al restaurante antes de ir por el pedido*\n\n` +
    `_Sistema Central de Administración General RYYCO_`
  );
}

/**
 * Builds the direct WhatsApp Web / App universal link
 */
export function buildDriverWhatsAppUrl(rawPhone?: string | null, messageText?: string): string {
  const cleanNumber = normalizeWhatsAppNumber(rawPhone);
  if (!cleanNumber) return '#';
  const textEncoded = encodeURIComponent(messageText || 'Hola, nuevo pedido disponible en RYYCO.');
  return `https://wa.me/${cleanNumber}?text=${textEncoded}`;
}

/**
 * Filter list of drivers to return ONLY those who are approved and currently active (switch ON)
 */
export function filterActiveDrivers(drivers: DriverProfile[]): DriverProfile[] {
  return drivers.filter(d => {
    const isApproved = d.status === 'approved';
    const isAvailable = Boolean(d.isAvailable);
    const isOnline = d.isOnline !== false;
    return isApproved && isAvailable && isOnline;
  });
}

/**
 * Real-time listener for active delivery drivers across the platform
 */
export function subscribeToActiveDrivers(
  callback: (activeDrivers: DriverProfile[], allApprovedDrivers: DriverProfile[]) => void
): () => void {
  const driversCol = collection(db, 'drivers');

  const unsubscribe = onSnapshot(driversCol, (snapshot) => {
    const allApproved: DriverProfile[] = [];
    const activeOnline: DriverProfile[] = [];

    snapshot.forEach(docSnap => {
      const driver = { id: docSnap.id, ...docSnap.data() } as DriverProfile;
      if (driver.status === 'approved') {
        allApproved.push(driver);
        if (driver.isAvailable && driver.isOnline !== false) {
          activeOnline.push(driver);
        }
      }
    });

    // Sort by rating or name
    activeOnline.sort((a, b) => (b.rating || 5) - (a.rating || 5));
    callback(activeOnline, allApproved);
  }, (err) => {
    console.warn("subscribeToActiveDrivers error:", err);
  });

  return unsubscribe;
}
