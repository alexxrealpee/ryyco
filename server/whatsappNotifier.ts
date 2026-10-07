/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import axios from 'axios';

export interface WhatsAppOrderStoreInfo {
  storeOwnerId?: string;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  whatsapp?: string;
  ownerWhatsapp?: string;
  phone?: string;
}

export interface WhatsAppDriverInfo {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone: string;
  vehicleType?: string;
  rating?: number;
}

export interface WhatsAppOrderPayload {
  orderId: string;
  orderNumber?: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryType?: 'delivery' | 'pickup' | 'table';
  deliveryCost?: number;
  totalAmount?: number;
  paymentMethod?: string;
  notes?: string;
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
    variantName?: string;
    options?: any;
    notes?: string;
  }>;
  store?: WhatsAppOrderStoreInfo;
  activeDrivers?: WhatsAppDriverInfo[];
}

/**
 * Normalizes phone number into international WhatsApp E.164 without '+'
 * Handles Colombian 10-digit mobile numbers (e.g. 3123456789 -> 573123456789)
 */
export function normalizeWhatsAppNumber(rawPhone?: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('57')) {
    return digits;
  }
  return digits;
}

/**
 * Formats COP currency nicely
 */
function formatCOP(num?: number): string {
  if (typeof num !== 'number' || isNaN(num)) return '$0';
  return `$${Math.round(num).toLocaleString('es-CO')}`;
}

/**
 * Builds structured, high-conversion WhatsApp message for the Restaurant
 */
export function buildRestaurantWhatsAppMessage(order: WhatsAppOrderPayload): string {
  const num = order.orderNumber ? `#${order.orderNumber}` : 'S/N';
  const customer = order.customerName || 'Cliente';
  const phone = order.customerPhone ? `+${order.customerPhone}` : 'No registrado';
  const address = order.customerAddress || 'Ipiales';
  const typeText = order.deliveryType === 'table' 
    ? '🍽️ En Mesa / Salón' 
    : order.deliveryType === 'pickup' 
    ? '🛍️ Para Recoger en Restaurante' 
    : '🛵 Domicilio a Destino';

  const itemsLines = (order.items && order.items.length > 0)
    ? order.items.map(it => {
        const qty = it.quantity || 1;
        const name = it.name || 'Producto';
        const vName = it.variantName ? ` (${it.variantName})` : '';
        const price = formatCOP((it.price || 0) * qty);
        const notes = it.notes ? `\n   ↳ _Nota: ${it.notes}_` : '';
        return `• *${qty}x* ${name}${vName} — ${price}${notes}`;
      }).join('\n')
    : '• 1x Pedido del Catálogo';

  const subtotalCalc = (order.totalAmount || 0) - (order.deliveryCost || 0);
  const subtotal = formatCOP(subtotalCalc > 0 ? subtotalCalc : order.totalAmount);
  const delivery = formatCOP(order.deliveryCost || 0);
  const total = formatCOP(order.totalAmount || 0);
  const payMethod = order.paymentMethod === 'whatsapp' 
    ? '📱 Coordinar por WhatsApp' 
    : order.paymentMethod === 'transfer' 
    ? '💳 Transferencia / Nequi / Daviplata' 
    : '💵 Efectivo contraentrega';

  const notesSection = order.notes 
    ? `\n\n📝 *Instrucciones del Cliente:*\n"${order.notes}"` 
    : '';

  return (
`🛎️ *¡NUEVO PEDIDO RECIBIDO EN RYYCO!* 🛎️
━━━━━━━━━━━━━━━━━━━
📋 *Pedido:* ${num}
📅 *Fecha:* ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
🏷️ *Modalidad:* ${typeText}

👤 *Cliente:* ${customer}
📞 *Teléfono:* ${phone}
📍 *Dirección:* ${address}

📦 *DETALLE DE PRODUCTOS:*
${itemsLines}
${notesSection}

💰 *Subtotal:* ${subtotal}
🛵 *Costo Domicilio:* ${delivery}
💳 *TOTAL A COBRAR:* *${total} COP*
💵 *Forma de Pago:* ${payMethod}
━━━━━━━━━━━━━━━━━━━
👉 _Por favor confirma la preparación y alista el despacho en tu panel de Ryyco._`
  );
}

/**
 * Builds structured, appealing WhatsApp message for Delivery Drivers
 */
export function buildDriverWhatsAppMessage(order: WhatsAppOrderPayload): string {
  const num = order.orderNumber ? `#${order.orderNumber}` : 'S/N';
  const storeName = order.store?.storeName || 'Restaurante Asociado';
  const storeAddress = order.store?.storeAddress || 'Ipiales';
  const storePhone = order.store?.storePhone || order.store?.whatsapp || '';
  const customer = order.customerName || 'Cliente';
  const destination = order.customerAddress || 'Ipiales';
  const deliveryGain = formatCOP(order.deliveryCost || 3000);
  const totalAmount = formatCOP(order.totalAmount || 0);
  const payMethod = order.paymentMethod === 'transfer' 
    ? '💳 Ya pagado por transferencia (No cobrar)' 
    : '💵 Cobrar en efectivo al entregar';

  const storePhoneLine = storePhone ? `\n📞 *Contacto Restaurante:* +${normalizeWhatsAppNumber(storePhone)}` : '';

  return (
`🛵 *¡NUEVO DOMICILIO DISPONIBLE EN RYYCO!* 🛵
━━━━━━━━━━━━━━━━━━━
📦 *Pedido:* ${num}
💵 *GANANCIA DOMICILIARIO:* *${deliveryGain} COP*

🏪 *Recoger en:* ${storeName}
📍 *Dirección Tienda:* ${storeAddress}${storePhoneLine}

📍 *Entregar a:* ${destination}
👤 *Cliente:* ${customer}
💰 *Total Pedido a cobrar:* ${totalAmount} (${payMethod})
━━━━━━━━━━━━━━━━━━━
⚡ _Abre tu portal de Domiciliarios Ryyco para tomar esta entrega de inmediato antes que otro domiciliario la acepte._`
  );
}

/**
 * Dispatches WhatsApp notifications using Axios to both the Restaurant and available Delivery Drivers
 */
export async function dispatchOrderWhatsAppNotifications(payload: WhatsAppOrderPayload): Promise<{
  success: boolean;
  orderNumber?: number;
  restaurantNotified: boolean;
  restaurantWhatsAppUrl?: string;
  activeDriversDeliveredCount: number;
  driversWhatsAppUrls: Array<{ driverId: string; name: string; phone: string; whatsappUrl: string }>;
  logs: string[];
}> {
  const logs: string[] = [];
  const driversUrls: Array<{ driverId: string; name: string; phone: string; whatsappUrl: string }> = [];

  const restaurantMessage = buildRestaurantWhatsAppMessage(payload);
  const driverMessage = buildDriverWhatsAppMessage(payload);

  // 1. Process Restaurant WhatsApp Contact
  const rawStorePhone = payload.store?.storePhone || 
                         payload.store?.whatsapp || 
                         payload.store?.ownerWhatsapp || 
                         payload.store?.phone || '';
  const storePhoneClean = normalizeWhatsAppNumber(rawStorePhone);
  const restaurantWhatsAppUrl = storePhoneClean 
    ? `https://wa.me/${storePhoneClean}?text=${encodeURIComponent(restaurantMessage)}`
    : undefined;

  let restaurantNotified = false;

  // Generic/Configured WhatsApp Gateway Webhooks (Evolution API, Baileys, WhatsApp Cloud API, Z-API, Custom Webhook)
  const webhookUrl = process.env.WHATSAPP_API_URL || 
                     process.env.WHATSAPP_WEBHOOK_URL || 
                     process.env.EVOLUTION_API_URL || '';
  const apiToken = process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_TOKEN || '';

  // 1.1 Notify Restaurant via Axios if Webhook/Gateway is configured
  if (webhookUrl && storePhoneClean) {
    try {
      logs.push(`[WHATSAPP-AXIOS] Enviando notificación al restaurante ${payload.store?.storeName || 'Tienda'} (+${storePhoneClean})...`);
      const res = await axios.post(
        webhookUrl,
        {
          event: 'ORDER_NEW_RESTAURANT_NOTIFICATION',
          recipientType: 'RESTAURANT',
          phone: storePhoneClean,
          message: restaurantMessage,
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          storeName: payload.store?.storeName,
          totalAmount: payload.totalAmount
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {})
          },
          timeout: 7000
        }
      );
      if (res.status >= 200 && res.status < 300) {
        restaurantNotified = true;
        logs.push(`[WHATSAPP-AXIOS] ✓ Restaurante notificado exitosamente por webhook (Status: ${res.status}).`);
      }
    } catch (err: any) {
      logs.push(`[WHATSAPP-AXIOS] Aviso: Webhook restaurante respondió con error (${err?.response?.status || err.message}). Fallback manual disponible.`);
    }
  } else {
    // Direct link generated and logged
    if (storePhoneClean) {
      restaurantNotified = true;
      logs.push(`[WHATSAPP-AXIOS] 🛎️ Enlace directo de WhatsApp generado para restaurante: +${storePhoneClean}`);
    } else {
      logs.push(`[WHATSAPP-AXIOS] Restaurante sin teléfono WhatsApp registrado.`);
    }
  }

  // 2. Process Available Delivery Drivers WhatsApp Notification
  const activeDrivers = Array.isArray(payload.activeDrivers) ? payload.activeDrivers : [];
  let driversDeliveredCount = 0;

  for (const driver of activeDrivers) {
    const rawDriverPhone = driver.phone || '';
    const driverPhoneClean = normalizeWhatsAppNumber(rawDriverPhone);
    const driverName = driver.name || `${driver.firstName || 'Domiciliario'} ${driver.lastName || ''}`.trim();

    if (!driverPhoneClean) continue;

    const driverWaUrl = `https://wa.me/${driverPhoneClean}?text=${encodeURIComponent(driverMessage)}`;
    driversUrls.push({
      driverId: driver.id,
      name: driverName,
      phone: driverPhoneClean,
      whatsappUrl: driverWaUrl
    });

    if (webhookUrl) {
      try {
        const res = await axios.post(
          webhookUrl,
          {
            event: 'ORDER_AVAILABLE_FOR_DRIVER',
            recipientType: 'DRIVER',
            driverId: driver.id,
            driverName,
            phone: driverPhoneClean,
            message: driverMessage,
            orderId: payload.orderId,
            orderNumber: payload.orderNumber,
            storeName: payload.store?.storeName,
            deliveryCost: payload.deliveryCost
          },
          {
            headers: {
              'Content-Type': 'application/json',
              ...(apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {})
            },
            timeout: 6000
          }
        );
        if (res.status >= 200 && res.status < 300) {
          driversDeliveredCount++;
        }
      } catch (err: any) {
        // Individual failure doesn't block the rest
      }
    } else {
      driversDeliveredCount++;
    }
  }

  logs.push(`[WHATSAPP-AXIOS] 🛵 ${driversUrls.length} domiciliarios disponibles procesados para aviso por WhatsApp de pedido #${payload.orderNumber || 'S/N'}.`);

  return {
    success: true,
    orderNumber: payload.orderNumber,
    restaurantNotified,
    restaurantWhatsAppUrl,
    activeDriversDeliveredCount: driversDeliveredCount,
    driversWhatsAppUrls: driversUrls,
    logs
  };
}
