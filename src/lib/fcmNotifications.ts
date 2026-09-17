/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Firebase Cloud Messaging (FCM) & Push Notifications Module for RYYCO
 * Handles token generation, service worker registration, background alerts,
 * and multi-channel notification dispatch when new orders arrive in Administration.
 */

import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { doc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { app, db } from './firebase';
import { OrderItem } from '../types';

let messagingInstance: Messaging | null = null;
let serviceWorkerReg: ServiceWorkerRegistration | null = null;
let isFCMSupported = false;

// Audio Chime Synthesizer using Web Audio API for high-reliability order alerts
export function playOrderAlertChime() {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const playBeep = (freq: number, startTime: number, duration: number, volume = 0.35) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Pleasant 4-tone ascending chime sequence
    playBeep(587.33, now + 0.0, 0.22, 0.4);  // D5
    playBeep(739.99, now + 0.18, 0.22, 0.45); // F#5
    playBeep(880.00, now + 0.36, 0.25, 0.5);  // A5
    playBeep(1174.66, now + 0.56, 0.6, 0.6); // D6
  } catch (err) {
    console.warn('[FCM] Error playing alert chime:', err);
  }
}

// Spoken voice announcement helper
export function speakOrderVoiceAlert(text: string) {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-CO';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.warn('[FCM] Speech synthesis error:', e);
  }
}

// Audio Chime Synthesizer specifically designed for delivery drivers (high-volume attention chime)
export function playDriverOrderAlertChime() {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const playBeep = (freq: number, startTime: number, duration: number, volume = 0.5) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Rapid energetic alert chime sequence (E5 -> A5 -> C#6 -> E6 -> ping)
    playBeep(659.25, now + 0.0, 0.15, 0.5);   // E5
    playBeep(880.00, now + 0.12, 0.15, 0.55); // A5
    playBeep(1108.73, now + 0.24, 0.18, 0.6); // C#6
    playBeep(1318.51, now + 0.38, 0.35, 0.7); // E6
    playBeep(1318.51, now + 0.52, 0.45, 0.7); // E6 accent ping
  } catch (err) {
    console.warn('[FCM] Error playing driver alert chime:', err);
  }
}

// Spoken voice announcement for delivery drivers
export function speakDriverVoiceAlert(text: string) {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-CO';
      utterance.rate = 1.08;
      utterance.pitch = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.warn('[FCM] Driver speech synthesis error:', e);
  }
}

/**
 * Initialize Firebase Cloud Messaging & Service Worker
 */
export async function initializeFCM(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const supported = await isSupported();
    if (!supported) {
      console.info('[FCM] Firebase Cloud Messaging is not supported in this browser environment.');
      return false;
    }

    isFCMSupported = true;

    // Register official Firebase Messaging Service Worker
    if ('serviceWorker' in navigator) {
      try {
        serviceWorkerReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/'
        });
        console.log('[FCM] Service worker registered successfully with scope:', serviceWorkerReg.scope);
      } catch (swErr) {
        console.warn('[FCM] Service worker registration error:', swErr);
      }
    }

    messagingInstance = getMessaging(app);

    // Foreground FCM message handler
    onMessage(messagingInstance, (payload) => {
      console.log('[FCM] Foreground push message received:', payload);
      
      const isDriver = payload.data?.isDriver === 'true' || payload.data?.role === 'driver' || payload.data?.type === 'DRIVER_REQUEST';
      const isSeller = !isDriver && (payload.data?.isSeller === 'true' || Boolean(payload.data?.storeOwnerId));
      
      let defaultTitle = '🚨 ¡Nuevo Pedido en RYYCO!';
      let defaultBody = 'Ha llegado un nuevo pedido a la administración general.';
      let clickUrl = '/?view=admin&tab=orders';

      if (isDriver) {
        defaultTitle = '🛵 ¡Nueva Solicitud de Domicilio!';
        defaultBody = 'Hay un nuevo pedido disponible para entregar de inmediato.';
        clickUrl = '/?view=driver';
      } else if (isSeller) {
        defaultTitle = '🔔 ¡Nuevo Pedido en Tu Tienda!';
        defaultBody = 'Tienes un nuevo pedido pendiente para despachar en tu tienda.';
        clickUrl = '/?view=dashboard&tab=orders';
      }

      const title = payload.notification?.title || payload.data?.title || defaultTitle;
      const body = payload.notification?.body || payload.data?.body || defaultBody;
      clickUrl = payload.data?.url || clickUrl;
      
      // 1. Play alert chime
      if (isDriver) {
        playDriverOrderAlertChime();
      } else {
        playOrderAlertChime();
      }

      // 2. Speak voice alert
      if (isDriver) {
        speakDriverVoiceAlert('¡Atención! Nueva solicitud de domicilio disponible en RYYCO');
      } else if (isSeller) {
        speakOrderVoiceAlert('¡Atención! Nuevo pedido recibido en tu tienda');
      } else {
        speakOrderVoiceAlert('¡Atención! Nuevo pedido recibido en administración general');
      }

      // 3. Dispatch global browser event for React views
      const eventName = isDriver ? 'ryyco:new-driver-request' : (isSeller ? 'ryyco:new-seller-order' : 'ryyco:new-admin-order');
      const customEvent = new CustomEvent(eventName, {
        detail: {
          payload,
          orderId: payload.data?.orderId,
          orderNumber: payload.data?.orderNumber,
          storeOwnerId: payload.data?.storeOwnerId,
          storeName: payload.data?.storeName,
          address: payload.data?.address || payload.data?.customerAddress
        }
      });
      window.dispatchEvent(customEvent);

      // 4. Show notification if allowed
      if (Notification.permission === 'granted') {
        const tag = isDriver
          ? (payload.data?.orderId ? `driver-fg-${payload.data.orderId}` : `driver-fg-${Date.now()}`)
          : (isSeller
            ? (payload.data?.orderId ? `seller-fg-${payload.data.orderId}` : `seller-fg-${Date.now()}`)
            : (payload.data?.orderId ? `ryyco-fg-${payload.data.orderId}` : `ryyco-fg-${Date.now()}`));

        if (serviceWorkerReg) {
          serviceWorkerReg.showNotification(title, {
            body,
            icon: '/logoryyco.png',
            badge: '/favicon.svg',
            vibrate: isDriver ? [400, 200, 400, 200, 600] : [350, 150, 350, 150, 500],
            tag,
            renotify: true,
            data: { 
              url: clickUrl,
              isDriver,
              isSeller,
              orderId: payload.data?.orderId,
              orderNumber: payload.data?.orderNumber
            },
            actions: isDriver ? [
              { action: 'open_driver_order', title: '🛵 Ver Solicitud' }
            ] : (isSeller ? [
              { action: 'open_seller_orders', title: '📦 Atender Pedido' }
            ] : [
              { action: 'open_admin', title: '📋 Ver en Administración' }
            ])
          } as any);
        } else {
          new Notification(title, {
            body,
            icon: '/logoryyco.png'
          });
        }
      }
    });

    return true;
  } catch (error) {
    console.warn('[FCM] Initialization failed:', error);
    return false;
  }
}

/**
 * Request Push Permission and Obtain / Store FCM Registration Token
 */
export async function requestAdminFCMPermission(adminUser?: {
  uid?: string;
  email?: string;
  name?: string;
}): Promise<{ success: boolean; token?: string; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No se puede ejecutar en el servidor' };
  }

  if (!('Notification' in window)) {
    return { success: false, error: 'Este navegador no soporta notificaciones push nativas.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permiso de notificaciones denegado por el usuario.' };
    }

    // Ensure FCM is initialized
    if (!messagingInstance) {
      await initializeFCM();
    }

    if (!messagingInstance) {
      // Fallback to standard web push if FCM instance cannot be constructed
      return {
        success: true,
        token: 'web_push_native_granted'
      };
    }

    // Ensure service worker is ready
    if (!serviceWorkerReg && 'serviceWorker' in navigator) {
      serviceWorkerReg = await navigator.serviceWorker.ready;
    }

    // Check if custom VAPID key is configured
    const configuredVapidKey = localStorage.getItem('ryyco_fcm_vapid_key') || undefined;

    let fcmToken = '';
    try {
      fcmToken = await getToken(messagingInstance, {
        serviceWorkerRegistration: serviceWorkerReg || undefined,
        vapidKey: configuredVapidKey
      });
    } catch (tokenErr: any) {
      console.warn('[FCM] getToken with custom vapidKey failed, retrying default:', tokenErr);
      try {
        fcmToken = await getToken(messagingInstance, {
          serviceWorkerRegistration: serviceWorkerReg || undefined
        });
      } catch (defaultTokenErr: any) {
        console.warn('[FCM] getToken default also returned error:', defaultTokenErr);
        // If getToken fails due to missing VAPID key in this environment, fallback to registered web push
        fcmToken = 'web_push_' + (adminUser?.uid || 'admin') + '_' + Date.now();
      }
    }

    // Save token in localStorage
    localStorage.setItem('ryyco_admin_fcm_token', fcmToken);

    // Save token in Firestore collection `admin_fcm_tokens`
    try {
      const sanitizedTokenId = fcmToken.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-100) || 'admin_token_' + Date.now();
      await setDoc(doc(db, 'admin_fcm_tokens', sanitizedTokenId), {
        token: fcmToken,
        adminUid: adminUser?.uid || 'admin',
        adminEmail: adminUser?.email || 'admin@ryyco.com',
        adminName: adminUser?.name || 'Administrador General RYYCO',
        device: 'web_browser',
        userAgent: navigator.userAgent,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log('[FCM] Admin FCM token saved to Firestore successfully.');
    } catch (saveErr) {
      console.warn('[FCM] Warning saving token to Firestore:', saveErr);
    }

    // Play confirmation chime
    playOrderAlertChime();

    return {
      success: true,
      token: fcmToken
    };
  } catch (error: any) {
    console.error('[FCM] Error requesting FCM permission:', error);
    return {
      success: false,
      error: error?.message || 'Error desconocido al solicitar notificaciones push FCM.'
    };
  }
}

/**
 * Dispatch Push Notification for a new order to the Service Worker and active Admin devices
 */
export async function triggerAdminOrderPush(
  order: OrderItem,
  storeNameFallback?: string
) {
  if (typeof window === 'undefined') return;

  const orderNum = order.orderNumber ? `#${order.orderNumber}` : 'S/N';
  const storeName = order.storeName || storeNameFallback || 'Restaurante en RYYCO';
  const customer = order.customerName || 'Cliente';
  const total = (order.totalAmount || 0).toLocaleString('es-CO');
  const itemsCount = order.items?.length || 1;

  const title = `🚨 ¡Nuevo Pedido ${orderNum} en ${storeName}!`;
  const body = `${customer} • Total: $${total} COP (${itemsCount} items)`;
  const clickUrl = '/?view=admin&tab=orders';

  // 1. Play alert chime sound
  playOrderAlertChime();

  // 2. Announce with speech synthesis
  speakOrderVoiceAlert(`¡Nuevo pedido número ${order.orderNumber || ''} en ${storeName}!`);

  // 3. Post message to active Service Worker to show background notification
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        reg.showNotification(title, {
          body,
          icon: '/logoryyco.png',
          badge: '/favicon.svg',
          vibrate: [350, 150, 350, 150, 500],
          tag: 'ryyco-order-' + order.id,
          renotify: true,
          requireInteraction: true,
          data: {
            url: clickUrl,
            orderId: order.id,
            orderNumber: order.orderNumber
          },
          actions: [
            { action: 'open_admin', title: '📋 Ver en Administración' }
          ]
        } as any);
      }

      // Also post message to service worker controller if active
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TRIGGER_ADMIN_ORDER_NOTIFICATION',
          title,
          body,
          orderId: order.id,
          orderNumber: order.orderNumber,
          url: clickUrl
        });
      }
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/logoryyco.png'
      });
    }
  } catch (err) {
    console.warn('[FCM] Error displaying local push notification:', err);
  }

  // 4. Send to backend FCM broadcast route
  try {
    fetch('/api/fcm/broadcast-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeName,
        customerName: customer,
        totalAmount: order.totalAmount,
        itemsCount
      })
    }).catch(() => {});
  } catch (backendErr) {
    // Non-blocking
  }
}

/**
 * Get current FCM / Push Notification Status for Administration
 */
export function getFCMStatus(): {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  hasToken: boolean;
  tokenPreview: string | null;
} {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      supported: false,
      permission: 'unsupported',
      hasToken: false,
      tokenPreview: null
    };
  }

  const token = localStorage.getItem('ryyco_admin_fcm_token');
  return {
    supported: true,
    permission: Notification.permission,
    hasToken: Boolean(token),
    tokenPreview: token ? (token.length > 24 ? `${token.slice(0, 12)}...${token.slice(-8)}` : token) : null
  };
}

/**
 * Request Push Permission and Obtain / Store FCM Registration Token for Store Sellers (Vendedores)
 */
export async function requestSellerFCMPermission(seller: {
  uid: string;
  email?: string;
  storeName?: string;
}): Promise<{ success: boolean; token?: string; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No se puede ejecutar en el servidor' };
  }

  if (!('Notification' in window)) {
    return { success: false, error: 'Este navegador o dispositivo no soporta notificaciones push nativas.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permiso de notificaciones denegado en el navegador.' };
    }

    // Ensure FCM is initialized
    if (!messagingInstance) {
      await initializeFCM();
    }

    // Ensure service worker is ready
    if (!serviceWorkerReg && 'serviceWorker' in navigator) {
      serviceWorkerReg = await navigator.serviceWorker.ready;
    }

    const configuredVapidKey = localStorage.getItem('ryyco_fcm_vapid_key') || undefined;

    let fcmToken = '';
    if (messagingInstance) {
      try {
        fcmToken = await getToken(messagingInstance, {
          serviceWorkerRegistration: serviceWorkerReg || undefined,
          vapidKey: configuredVapidKey
        });
      } catch (tokenErr: any) {
        console.warn('[FCM-SELLER] getToken with vapidKey failed, trying default:', tokenErr);
        try {
          fcmToken = await getToken(messagingInstance, {
            serviceWorkerRegistration: serviceWorkerReg || undefined
          });
        } catch (defaultErr: any) {
          console.warn('[FCM-SELLER] Default getToken fallback error:', defaultErr);
          fcmToken = 'seller_web_push_' + seller.uid + '_' + Date.now();
        }
      }
    } else {
      fcmToken = 'seller_native_push_' + seller.uid + '_' + Date.now();
    }

    // Store in localStorage for the seller
    localStorage.setItem('ryyco_seller_fcm_token', fcmToken);
    localStorage.setItem('ryyco_seller_fcm_store_id', seller.uid);

    // Save token in Firestore collection `seller_fcm_tokens`
    try {
      const sanitizedTokenId = fcmToken.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-100) || `seller_token_${seller.uid}_${Date.now()}`;
      await setDoc(doc(db, 'seller_fcm_tokens', sanitizedTokenId), {
        token: fcmToken,
        storeOwnerId: seller.uid,
        sellerUid: seller.uid,
        sellerEmail: seller.email || '',
        storeName: seller.storeName || 'Mi Tienda',
        device: 'web_browser',
        userAgent: navigator.userAgent,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log('[FCM-SELLER] Token de vendedor guardado en Firestore con éxito.');
    } catch (saveErr) {
      console.warn('[FCM-SELLER] Error al guardar token en Firestore:', saveErr);
    }

    // Play confirmation chime and announce
    playOrderAlertChime();

    return {
      success: true,
      token: fcmToken
    };
  } catch (error: any) {
    console.error('[FCM-SELLER] Error solicitando permisos FCM:', error);
    return {
      success: false,
      error: error?.message || 'Error desconocido al activar notificaciones push para vendedores.'
    };
  }
}

/**
 * Dispatch Push Notification for a new order to the Seller's device and Service Worker
 */
export async function triggerSellerOrderPush(
  order: OrderItem,
  storeNameFallback?: string
) {
  if (typeof window === 'undefined') return;

  const orderNum = order.orderNumber ? `#${order.orderNumber}` : 'S/N';
  const customer = order.customerName || 'Cliente';
  const total = (order.totalAmount || 0).toLocaleString('es-CO');
  const itemsCount = order.items?.length || 1;
  const storeName = order.storeName || storeNameFallback || 'Tu Tienda';

  const title = `🔔 ¡Nuevo Pedido ${orderNum}!`;
  const body = `${customer} • Total: $${total} COP (${itemsCount} productos)`;
  const clickUrl = '/?view=dashboard&tab=orders';

  // 1. Play alert chime sound
  playOrderAlertChime();

  // 2. Announce with speech synthesis
  speakOrderVoiceAlert(`¡Nuevo pedido número ${order.orderNumber || ''} para tu tienda!`);

  // 3. Post message to active Service Worker to show background notification
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        reg.showNotification(title, {
          body,
          icon: '/logoryyco.png',
          badge: '/favicon.svg',
          vibrate: [350, 150, 350, 150, 500],
          tag: 'seller-order-' + order.id,
          renotify: true,
          requireInteraction: true,
          data: {
            url: clickUrl,
            isSeller: true,
            orderId: order.id,
            orderNumber: order.orderNumber
          },
          actions: [
            { action: 'open_seller_orders', title: '📦 Atender Pedido' }
          ]
        } as any);
      }

      // Also notify active controller
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TRIGGER_SELLER_ORDER_NOTIFICATION',
          title,
          body,
          orderId: order.id,
          orderNumber: order.orderNumber,
          url: clickUrl
        });
      }
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/logoryyco.png'
      });
    }
  } catch (err) {
    console.warn('[FCM-SELLER] Error displaying local seller notification:', err);
  }

  // 4. Send to backend FCM broadcast route for sellers
  try {
    fetch('/api/fcm/broadcast-seller-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeOwnerId: order.storeOwnerId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeName,
        customerName: customer,
        totalAmount: order.totalAmount,
        itemsCount
      })
    }).catch(() => {});
  } catch (backendErr) {
    // Non-blocking
  }
}

/**
 * Get current FCM / Push Notification Status for Sellers (Vendedores)
 */
export function getSellerFCMStatus(storeOwnerId?: string): {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  hasToken: boolean;
  token: string | null;
  tokenPreview: string | null;
} {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      supported: false,
      permission: 'unsupported',
      hasToken: false,
      token: null,
      tokenPreview: null
    };
  }

  const token = localStorage.getItem('ryyco_seller_fcm_token');
  return {
    supported: true,
    permission: Notification.permission,
    hasToken: Boolean(token),
    token,
    tokenPreview: token ? (token.length > 24 ? `${token.slice(0, 12)}...${token.slice(-8)}` : token) : null
  };
}

/**
 * Request Push Permission and Obtain / Store FCM Registration Token for Delivery Drivers (Domiciliarios)
 */
export async function requestDriverFCMPermission(driver: {
  id: string;
  name?: string;
  phone?: string;
  vehicleType?: string;
}): Promise<{ success: boolean; token?: string; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No se puede ejecutar en el servidor' };
  }

  if (!('Notification' in window)) {
    return { success: false, error: 'Este dispositivo no soporta notificaciones push nativas.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permiso de notificaciones denegado en el navegador.' };
    }

    if (!messagingInstance) {
      await initializeFCM();
    }

    if (!serviceWorkerReg && 'serviceWorker' in navigator) {
      serviceWorkerReg = await navigator.serviceWorker.ready;
    }

    const configuredVapidKey = localStorage.getItem('ryyco_fcm_vapid_key') || undefined;

    let fcmToken = '';
    if (messagingInstance) {
      try {
        fcmToken = await getToken(messagingInstance, {
          serviceWorkerRegistration: serviceWorkerReg || undefined,
          vapidKey: configuredVapidKey
        });
      } catch (tokenErr: any) {
        console.warn('[FCM-DRIVER] getToken with vapidKey failed, trying default:', tokenErr);
        try {
          fcmToken = await getToken(messagingInstance, {
            serviceWorkerRegistration: serviceWorkerReg || undefined
          });
        } catch (defaultErr: any) {
          console.warn('[FCM-DRIVER] Default getToken fallback error:', defaultErr);
          fcmToken = 'driver_web_push_' + driver.id + '_' + Date.now();
        }
      }
    } else {
      fcmToken = 'driver_native_push_' + driver.id + '_' + Date.now();
    }

    // Save locally
    localStorage.setItem('ryyco_driver_fcm_token', fcmToken);
    localStorage.setItem('ryyco_driver_fcm_driver_id', driver.id);

    // Save in Firestore collection `driver_fcm_tokens`
    try {
      const sanitizedTokenId = fcmToken.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-100) || `driver_token_${driver.id}_${Date.now()}`;
      await setDoc(doc(db, 'driver_fcm_tokens', sanitizedTokenId), {
        token: fcmToken,
        driverId: driver.id,
        driverName: driver.name || 'Domiciliario RYYCO',
        phone: driver.phone || '',
        vehicleType: driver.vehicleType || 'moto',
        device: 'web_browser',
        userAgent: navigator.userAgent,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log('[FCM-DRIVER] Token de domiciliario guardado en Firestore con éxito.');
    } catch (saveErr) {
      console.warn('[FCM-DRIVER] Error al guardar token de domiciliario en Firestore:', saveErr);
    }

    // Play confirmation chime & speech
    playDriverOrderAlertChime();
    speakDriverVoiceAlert('Notificaciones push activadas para domiciliarios');

    return {
      success: true,
      token: fcmToken
    };
  } catch (error: any) {
    console.error('[FCM-DRIVER] Error solicitando permisos FCM:', error);
    return {
      success: false,
      error: error?.message || 'Error desconocido al activar notificaciones push para domiciliarios.'
    };
  }
}

/**
 * Dispatch Push Notification for a new delivery order request to the Driver's device and Service Worker
 */
export async function triggerDriverDeliveryPush(
  order: OrderItem,
  storeNameFallback?: string
) {
  if (typeof window === 'undefined') return;

  const orderNum = order.orderNumber ? `#${order.orderNumber}` : 'S/N';
  const storeName = order.storeName || storeNameFallback || 'Restaurante RYYCO';
  const address = order.customerAddress || 'Ipiales';
  const deliveryFee = order.deliveryCost ? `$${order.deliveryCost.toLocaleString('es-CO')}` : '$3.000';

  const title = `🛵 ¡Nueva Solicitud de Domicilio ${orderNum}!`;
  const body = `De: ${storeName}\nPara: ${address} • Ganancia: ${deliveryFee}`;
  const clickUrl = '/?view=driver';

  // 1. Play driver alert chime sound
  playDriverOrderAlertChime();

  // 2. Announce with speech synthesis
  speakDriverVoiceAlert(`¡Nueva entrega disponible en ${storeName}!`);

  // 3. Post message to active Service Worker to show background notification
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        reg.showNotification(title, {
          body,
          icon: '/logoryyco.png',
          badge: '/favicon.svg',
          vibrate: [400, 200, 400, 200, 600],
          tag: 'driver-order-' + order.id,
          renotify: true,
          requireInteraction: true,
          data: {
            url: clickUrl,
            isDriver: true,
            orderId: order.id,
            orderNumber: order.orderNumber,
            storeName,
            address,
            deliveryCost: order.deliveryCost
          },
          actions: [
            { action: 'open_driver_order', title: '🛵 Ver Solicitud de Entrega' }
          ]
        } as any);
      }

      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TRIGGER_DRIVER_REQUEST_NOTIFICATION',
          title,
          body,
          orderId: order.id,
          orderNumber: order.orderNumber,
          storeName,
          address,
          deliveryCost: order.deliveryCost,
          url: clickUrl
        });
      }
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/logoryyco.png'
      });
    }
  } catch (err) {
    console.warn('[FCM-DRIVER] Error displaying local driver notification:', err);
  }

  // 4. Send to backend FCM broadcast route for drivers
  try {
    fetch('/api/fcm/broadcast-driver-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeName,
        customerAddress: address,
        customerName: order.customerName,
        deliveryCost: order.deliveryCost || 3000,
        totalAmount: order.totalAmount,
        itemsCount: order.items?.length || 1
      })
    }).catch(() => {});
  } catch (backendErr) {
    // Non-blocking
  }
}

/**
 * Get current FCM / Push Notification Status for Drivers (Domiciliarios)
 */
export function getDriverFCMStatus(driverId?: string): {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  hasToken: boolean;
  token: string | null;
  tokenPreview: string | null;
} {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      supported: false,
      permission: 'unsupported',
      hasToken: false,
      token: null,
      tokenPreview: null
    };
  }

  const token = localStorage.getItem('ryyco_driver_fcm_token');
  return {
    supported: true,
    permission: Notification.permission,
    hasToken: Boolean(token),
    token,
    tokenPreview: token ? (token.length > 24 ? `${token.slice(0, 12)}...${token.slice(-8)}` : token) : null
  };
}

export interface DriverFCMTokenRecord {
  id: string;
  token: string;
  driverId: string;
  driverName?: string;
  phone?: string;
  vehicleType?: string;
  device?: string;
  userAgent?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SellerFCMTokenRecord {
  id: string;
  token: string;
  storeOwnerId: string;
  sellerUid: string;
  sellerEmail?: string;
  storeName?: string;
  device?: string;
  userAgent?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminFCMTokenRecord {
  id: string;
  token: string;
  adminUid: string;
  adminEmail?: string;
  adminName?: string;
  device?: string;
  userAgent?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Fetch all registered driver FCM device tokens from Firestore
 */
export async function fetchDriverFCMTokens(): Promise<DriverFCMTokenRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'driver_fcm_tokens'));
    const tokens: DriverFCMTokenRecord[] = [];
    snap.forEach((d) => {
      tokens.push({ id: d.id, ...(d.data() as any) });
    });
    return tokens.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } catch (err) {
    console.warn('[FCM] Error fetching driver tokens from Firestore:', err);
    return [];
  }
}

/**
 * Delete a driver FCM token
 */
export async function deleteDriverFCMToken(tokenId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'driver_fcm_tokens', tokenId));
    return true;
  } catch (err) {
    console.warn('[FCM] Error deleting driver token:', err);
    return false;
  }
}

/**
 * Send an Admin broadcast push notification to a specific driver or to all drivers
 */
export async function sendAdminPushToDriver(params: {
  driverId: string;
  driverName?: string;
  title: string;
  message: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/fcm/broadcast-to-driver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    return { success: data.status === 'ok' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al emitir notificación al domiciliario' };
  }
}

/**
 * Fetch all registered seller FCM device tokens from Firestore
 */
export async function fetchSellerFCMTokens(): Promise<SellerFCMTokenRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'seller_fcm_tokens'));
    const tokens: SellerFCMTokenRecord[] = [];
    snap.forEach((d) => {
      tokens.push({ id: d.id, ...(d.data() as any) });
    });
    // Sort newest first
    return tokens.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } catch (err) {
    console.warn('[FCM] Error fetching seller tokens from Firestore:', err);
    return [];
  }
}

/**
 * Fetch all registered admin FCM device tokens from Firestore
 */
export async function fetchAdminFCMTokens(): Promise<AdminFCMTokenRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'admin_fcm_tokens'));
    const tokens: AdminFCMTokenRecord[] = [];
    snap.forEach((d) => {
      tokens.push({ id: d.id, ...(d.data() as any) });
    });
    return tokens.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } catch (err) {
    console.warn('[FCM] Error fetching admin tokens from Firestore:', err);
    return [];
  }
}

/**
 * Delete a seller FCM token
 */
export async function deleteSellerFCMToken(tokenId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'seller_fcm_tokens', tokenId));
    return true;
  } catch (err) {
    console.warn('[FCM] Error deleting seller token:', err);
    return false;
  }
}

/**
 * Send an Admin broadcast push notification to a specific seller or to all sellers
 */
export async function sendAdminPushToSeller(params: {
  storeOwnerId: string;
  storeName?: string;
  title: string;
  message: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/fcm/broadcast-to-seller', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    return { success: data.status === 'ok' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al emitir notificación al vendedor' };
  }
}

/**
 * Connect to real-time Server-Sent Events (SSE) push stream for instant delivery across tabs
 */
export function connectFCMStream(
  role: 'admin' | 'seller' | 'driver',
  entityUid?: string, // sellerUid or driverId
  onEvent?: (data: any) => void
): () => void {
  if (typeof window === 'undefined' || !('EventSource' in window)) {
    return () => {};
  }

  let eventSource: EventSource | null = null;
  try {
    const params = new URLSearchParams({ role });
    if (role === 'seller' && entityUid) params.set('sellerUid', entityUid);
    if (role === 'driver' && entityUid) params.set('driverId', entityUid);

    eventSource = new EventSource(`/api/fcm/stream?${params.toString()}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CONNECTED') {
          console.log('[FCM-SSE] Connected to push stream:', data.clientId, 'role:', role);
          return;
        }

        if (onEvent) {
          onEvent(data);
        }

        // Auto-handle driver order request push
        if (data.type === 'DRIVER_REQUEST_PUSH' && role === 'driver') {
          playDriverOrderAlertChime();
          speakDriverVoiceAlert(`¡Nueva solicitud de domicilio en ${data.storeName || 'RYYCO'}!`);
          window.dispatchEvent(new CustomEvent('ryyco:new-driver-request', {
            detail: data
          }));
          if (Notification.permission === 'granted') {
            const orderNum = data.orderNumber ? `#${data.orderNumber}` : '';
            const fee = data.deliveryCost ? `$${Number(data.deliveryCost).toLocaleString('es-CO')}` : '$3.000';
            new Notification(`🛵 ¡Nueva Solicitud de Domicilio ${orderNum}!`, {
              body: `Restaurante: ${data.storeName || 'Tienda'}\nEntrega: ${data.customerAddress || 'Ipiales'} • Ganancia: ${fee}`,
              icon: '/logoryyco.png'
            });
          }
        } else if (data.type === 'CUSTOM_DRIVER_ALERT' && role === 'driver') {
          if (!entityUid || data.driverId === 'all' || data.driverId === entityUid) {
            playDriverOrderAlertChime();
            speakDriverVoiceAlert(data.title || 'Aviso para domiciliarios RYYCO');
            if (Notification.permission === 'granted') {
              new Notification(data.title || '🛵 RYYCO Domicilios', {
                body: data.message,
                icon: '/logoryyco.png'
              });
            }
          }
        } else if (data.type === 'SELLER_ORDER_PUSH' && role === 'seller') {
          if (!entityUid || data.storeOwnerId === entityUid) {
            playOrderAlertChime();
            speakOrderVoiceAlert(`¡Nuevo pedido número ${data.orderNumber || ''} en tu tienda!`);
            window.dispatchEvent(new CustomEvent('ryyco:new-seller-order', {
              detail: data
            }));
          }
        } else if (data.type === 'ADMIN_ORDER_PUSH' && role === 'admin') {
          playOrderAlertChime();
          speakOrderVoiceAlert(`¡Nuevo pedido número ${data.orderNumber || ''} en RYYCO!`);
          window.dispatchEvent(new CustomEvent('ryyco:new-admin-order', {
            detail: data
          }));
        } else if (data.type === 'CUSTOM_SELLER_ALERT' && role === 'seller') {
          if (!entityUid || data.storeOwnerId === 'all' || data.storeOwnerId === entityUid) {
            playOrderAlertChime();
            speakOrderVoiceAlert(data.title || 'Mensaje de administración RYYCO');
            if (Notification.permission === 'granted') {
              new Notification(data.title || '🔔 RYYCO Tiendas', {
                body: data.message,
                icon: '/logoryyco.png'
              });
            }
          }
        }
      } catch (err) {
        // Heartbeat or comment
      }
    };

    eventSource.onerror = (err) => {
      console.warn('[FCM-SSE] Stream connection error, will auto-reconnect:', err);
    };
  } catch (e) {
    console.warn('[FCM-SSE] Failed to initialize EventSource:', e);
  }

  return () => {
    if (eventSource) {
      eventSource.close();
    }
  };
}
