import { isNativePush, initializeNativePush, nativePushPermission, registerNativePush, clearNativePushBinding } from './nativePush';
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
import { app, db, auth } from './firebase';
import { OrderItem } from '../types';

const nativeTokenId = (token: string) => token.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-100);
export async function disableNativePushForLogout() {
  if (!isNativePush()) return;
  await clearNativePushBinding();
  for (const role of ['admin', 'seller', 'driver']) {
    const token = localStorage.getItem(`ryyco_${role}_native_token`);
    if (token) await deleteDoc(doc(db, `${role}_fcm_tokens`, nativeTokenId(token))).catch(() => {});
    localStorage.removeItem(`ryyco_${role}_native_token`);
    localStorage.removeItem(`ryyco_${role}_fcm_token`);
  }
  localStorage.removeItem('ryyco_driver_notifications_enabled');
}
async function requestNativeRole(role: 'admin' | 'seller' | 'driver', identity: Record<string, string>) {
  try {
    const sessionUid = auth.currentUser?.uid;
    if (!sessionUid) throw new Error('Inicia sesión para activar las notificaciones.');
    // Only report success after the native token is stored under the authenticated account.
    const token = await registerNativePush(async value => {
      if (auth.currentUser?.uid !== sessionUid) throw new Error('La sesión cambió. Vuelve a activar las notificaciones.');
      for (const otherRole of ['admin', 'seller', 'driver'].filter(value => value !== role)) {
        const otherToken = localStorage.getItem(`ryyco_${otherRole}_native_token`);
        if (otherToken) {
          await deleteDoc(doc(db, `${otherRole}_fcm_tokens`, nativeTokenId(otherToken)));
          localStorage.removeItem(`ryyco_${otherRole}_native_token`);
          localStorage.removeItem(`ryyco_${otherRole}_fcm_token`);
        }
      }
      const previous = localStorage.getItem(`ryyco_${role}_native_token`);
      await setDoc(doc(db, `${role}_fcm_tokens`, nativeTokenId(value)), {
        ...identity, token: value, device: 'android', active: true,
        userAgent: navigator.userAgent, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }, { merge: true });
      if (previous && previous !== value) await deleteDoc(doc(db, `${role}_fcm_tokens`, nativeTokenId(previous)));
      localStorage.setItem(`ryyco_${role}_native_token`, value);
      localStorage.setItem(`ryyco_${role}_fcm_token`, value);
      localStorage.setItem(`ryyco_${role}_native_owner`, identity.driverId || identity.storeOwnerId || identity.adminUid);
    });
    return { success: true, token };
  } catch (error: any) { return { success: false, error: error?.message || 'No se pudo activar el dispositivo Android.' }; }
}
function nativeRoleStatus(role: string, owner?: string) {
  const token = localStorage.getItem(`ryyco_${role}_native_token`);
  const matches = !owner || owner === localStorage.getItem(`ryyco_${role}_native_owner`);
  return { supported: true, permission: nativePushPermission(), token: matches ? token : null,
    hasToken: Boolean(matches && token && nativePushPermission() === 'granted'),
    tokenPreview: matches && token ? `${token.slice(0, 12)}...${token.slice(-8)}` : null };
}

let messagingInstance: Messaging | null = null;
let serviceWorkerReg: ServiceWorkerRegistration | null = null;
let isFCMSupported = false;

/**
 * Official Firebase Cloud Messaging Web Push Certificate (VAPID Key)
 * From Firebase Project Console: studio-9002217802-13e05
 */
export const DEFAULT_FCM_VAPID_KEY = 'BHxp46AT5NMBfuRVQJpU5KpSI-ktnNumkurOO2jGAEwqEaJHi_jJayQM_ulze1QPuA9o42INMAT5S6i8Zmlit80';

/**
 * Retrieves the active Web Push VAPID key (custom or project default)
 */
export function getFCMVapidKey(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('ryyco_fcm_vapid_key');
    // If stored key matches old corrupted/mistyped transcription or legacy key rejected by current project, auto-heal
    if (custom && (custom === DEFAULT_FCM_VAPID_KEY || custom.includes('002jGAEwqea') || custom.includes('KpSl') || custom.includes('ZmIit') || custom.includes('_uIze'))) {
      localStorage.removeItem('ryyco_fcm_vapid_key');
    } else if (custom && custom.trim().length > 10) {
      return custom.trim();
    }
  }
  const envKey = (import.meta as any)?.env?.VITE_FCM_VAPID_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim().length > 10 && envKey.trim() !== DEFAULT_FCM_VAPID_KEY) {
    return envKey.trim();
  }
  return '';
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function ensureActiveServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  try {
    if (!serviceWorkerReg) {
      serviceWorkerReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/', updateViaCache: 'none'
      });
    }
    const readyReg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration | null>((resolve) => setTimeout(() => resolve(serviceWorkerReg), 4000))
    ]);
    if (readyReg) {
      serviceWorkerReg = readyReg;
    }
    const pendingWorker = serviceWorkerReg?.installing || serviceWorkerReg?.waiting;
    if (!serviceWorkerReg?.active && pendingWorker) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3500);
        const onStateChange = () => {
          if (pendingWorker.state === 'activated' || pendingWorker.state === 'redundant') {
            clearTimeout(timer);
            pendingWorker.removeEventListener('statechange', onStateChange);
            resolve();
          }
        };
        pendingWorker.addEventListener('statechange', onStateChange);
      });
    }
    return serviceWorkerReg || undefined;
  } catch (err) {
    console.warn('[FCM] ensureActiveServiceWorker warning:', err);
    return serviceWorkerReg || undefined;
  }
}

async function resetPushSubscription(swReg?: ServiceWorkerRegistration | null): Promise<void> {
  try {
    const reg = swReg || serviceWorkerReg || (typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null);
    if (reg?.pushManager) {
      const existingSub = await reg.pushManager.getSubscription().catch(() => null);
      if (existingSub) {
        await existingSub.unsubscribe().catch(() => {});
      }
    }
  } catch {}
  try {
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('firebase-messaging-database');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
        setTimeout(resolve, 400);
      });
    }
  } catch {}
}

async function requestDirectFirebaseRegistrationToken(): Promise<string> {
  const options = app.options;
  const projectId = options.projectId || 'studio-9002217802-13e05';
  const apiKey = options.apiKey || '';
  const appId = options.appId || '1:420228694243:web:ba7bb9daa9aba66f0285d6';
  if (!apiKey || typeof crypto === 'undefined' || !crypto.subtle) return '';

  const fidBytes = new Uint8Array(17);
  crypto.getRandomValues(fidBytes);
  fidBytes[0] = 0b01110000 + (fidBytes[0] % 16);
  const fid = arrayBufferToBase64Url(fidBytes.buffer).slice(0, 22);

  const instRes = await fetch(`https://firebaseinstallations.googleapis.com/v1/projects/${projectId}/installations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ fid, appId, authVersion: 'FIS_v2', sdkVersion: 'w:0.6.4' })
  });
  if (!instRes.ok) return '';
  const inst = await instRes.json();
  const authToken = inst?.authToken?.token;
  if (!authToken) return '';

  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const p256dh = arrayBufferToBase64Url(rawPub);
  const authBytes = new Uint8Array(16);
  crypto.getRandomValues(authBytes);
  const authSecret = arrayBufferToBase64Url(authBytes.buffer);
  const endpointBytes = new Uint8Array(16);
  crypto.getRandomValues(endpointBytes);
  const endpointId = arrayBufferToBase64Url(endpointBytes.buffer);

  const regRes = await fetch(`https://fcmregistrations.googleapis.com/v1/projects/${projectId}/registrations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-firebase-installations-auth': authToken
    },
    body: JSON.stringify({
      web: {
        endpoint: `https://fcm.googleapis.com/fcm/send/${endpointId}`,
        auth: authSecret,
        p256dh
      }
    })
  });
  if (!regRes.ok) return '';
  const regData = await regRes.json();
  return typeof regData?.token === 'string' ? regData.token : '';
}

async function obtainWebFCMToken(): Promise<string> {
  if (!messagingInstance) {
    await initializeFCM();
  }
  const swReg = await ensureActiveServiceWorker();

  // If browser has a stale PushSubscription created with the legacy rejected VAPID key, clear it first
  try {
    const existingSub = await swReg?.pushManager?.getSubscription().catch(() => null);
    const existingKeyBuffer = existingSub?.options?.applicationServerKey;
    if (existingKeyBuffer) {
      const existingKeyB64 = arrayBufferToBase64Url(existingKeyBuffer);
      if (existingKeyB64 === DEFAULT_FCM_VAPID_KEY) {
        await resetPushSubscription(swReg);
      }
    }
  } catch {}

  const configuredVapidKey = getFCMVapidKey();

  if (messagingInstance) {
    // 1. Primary attempt: Use Firebase project default Web Push key (or custom env key if explicitly provided)
    try {
      const token = await getToken(messagingInstance, {
        serviceWorkerRegistration: swReg,
        ...(configuredVapidKey ? { vapidKey: configuredVapidKey } : {})
      });
      if (token) return token;
    } catch (firstErr) {
      console.warn('[FCM] Initial getToken attempt failed, resetting subscription and retrying:', firstErr);
      await resetPushSubscription(swReg);
    }

    // 2. Clean retry after unsubscribing any mismatched applicationServerKey
    try {
      const retrySwReg = await ensureActiveServiceWorker();
      const token = await getToken(messagingInstance, {
        serviceWorkerRegistration: retrySwReg
      });
      if (token) return token;
    } catch (secondErr) {
      console.warn('[FCM] Clean default getToken retry failed:', secondErr);
    }
  }

  // 3. Fallback for cross-origin preview iframes or browsers blocking PushManager.subscribe
  try {
    const directToken = await requestDirectFirebaseRegistrationToken();
    if (directToken) return directToken;
  } catch (directErr) {
    console.warn('[FCM] Direct Firebase registration fallback warning:', directErr);
  }

  throw new Error('Firebase no pudo generar un token válido. Reintenta activar las notificaciones.');
}

/**
 * Register Admin FCM token with the backend server memory
 */
export async function registerAdminFCMTokenWithServer(
  token: string,
  adminUser?: { uid?: string; email?: string; name?: string }
): Promise<boolean> {
  if (!token || typeof window === 'undefined') return false;
  try {
    const res = await fetch('/api/fcm/register-admin-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        adminUid: adminUser?.uid || 'admin',
        adminEmail: adminUser?.email || 'admin@ryyco.com',
        adminName: adminUser?.name || 'Administrador General RYYCO'
      })
    });
    const data = await res.json();
    return data.status === 'ok';
  } catch (err) {
    console.warn('[FCM] Server token registration error:', err);
    return false;
  }
}

export { playOrderNotificationSound as playOrderAlertChime } from './orderNotificationSound';
import { playOrderNotificationSound as playOrderAlertChime } from './orderNotificationSound';

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

// Audio notification for delivery drivers (exact same official 3-second notification chime as general administration)
export function playDriverOrderAlertChime() {
  try {
    playOrderAlertChime();
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
  if (isNativePush()) return initializeNativePush();
  if (messagingInstance && serviceWorkerReg?.active) return true;

  try {
    const supported = await isSupported();
    if (!supported) {
      console.info('[FCM] Firebase Cloud Messaging is not supported in this browser environment.');
      return false;
    }

    isFCMSupported = true;

    // Register and wait for active Firebase Messaging Service Worker
    if ('serviceWorker' in navigator) {
      await ensureActiveServiceWorker();
    }

    if (!messagingInstance) {
      messagingInstance = getMessaging(app);
    }

    // Foreground FCM message handler
    onMessage(messagingInstance, (payload) => {
      console.log('[FCM] Foreground push message received:', payload);
      
      const isDriver = payload.data?.isDriver === 'true' || payload.data?.role === 'driver' || payload.data?.type === 'DRIVER_REQUEST';
      const isSeller = !isDriver && (payload.data?.isSeller === 'true' || (payload.data?.role !== 'admin' && payload.data?.isSeller !== 'false' && Boolean(payload.data?.storeOwnerId)));
      
      // STRICT REQUIREMENT: Only pending orders trigger notifications
      if (!isDriver && payload.data?.status && payload.data?.status !== 'pending') {
        return;
      }
      
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
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const tag = isDriver
          ? (payload.data?.orderId ? `driver-fg-${payload.data.orderId}` : `driver-fg-${Date.now()}`)
          : (isSeller
            ? (payload.data?.orderId ? `seller-fg-${payload.data.orderId}` : `seller-fg-${Date.now()}`)
            : (payload.data?.orderId ? `ryyco-fg-${payload.data.orderId}` : `ryyco-fg-${Date.now()}`));

        if (serviceWorkerReg && serviceWorkerReg.showNotification) {
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
          } as any).catch(() => {
            try {
              new Notification(title, {
                body,
                icon: '/logoryyco.png'
              });
            } catch (e) {}
          });
        } else {
          try {
            new Notification(title, {
              body,
              icon: '/logoryyco.png'
            });
          } catch (e) {}
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

  if (isNativePush()) return requestNativeRole('admin', { adminUid: adminUser?.uid || '', adminEmail: adminUser?.email || '', adminName: adminUser?.name || 'Administración RYYCO' });

  if (!('Notification' in window)) {
    return { success: false, error: 'Este navegador no soporta notificaciones push nativas.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permiso de notificaciones denegado por el usuario.' };
    }

    const fcmToken = await obtainWebFCMToken();

    // Save token in localStorage
    localStorage.setItem('ryyco_admin_fcm_token', fcmToken);

    // Save token in Firestore collection `admin_fcm_tokens`
    try {
      const sanitizedTokenId = `${adminUser?.uid || 'admin'}_${fcmToken.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-60)}`;
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
      localStorage.removeItem('ryyco_admin_fcm_token');
      throw new Error('No se pudo guardar este dispositivo para recibir notificaciones con la app cerrada.');
    }

    // Also register with server memory registry
    try {
      await registerAdminFCMTokenWithServer(fcmToken, adminUser);
    } catch (srvErr) {}

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

  // STRICT REQUIREMENT: Only pending orders trigger notifications and sound alerts!
  if (!order || order.status !== 'pending') {
    return;
  }

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

  // 3. Post message to active Service Worker to show background notification
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
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
          } as any).catch(err => {
            console.warn('[FCM] reg.showNotification caught error:', err);
          });
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
      } else {
        try {
          new Notification(title, {
            body,
            icon: '/logoryyco.png'
          });
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn('[FCM] Error displaying local push notification:', err);
  }

  // 4. Send to backend FCM broadcast route with active admin tokens
  try {
    let adminTokens: string[] = [];
    const localToken = localStorage.getItem('ryyco_admin_fcm_token');
    if (localToken) adminTokens.push(localToken);

    try {
      const snap = await getDocs(collection(db, 'admin_fcm_tokens'));
      snap.forEach(d => {
        const data = d.data();
        if (data?.token && data?.active !== false) {
          adminTokens.push(data.token);
        }
      });
    } catch (e) {}

    adminTokens = Array.from(new Set(adminTokens));

    fetch('/api/fcm/broadcast-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeName,
        customerName: customer,
        totalAmount: order.totalAmount,
        status: order.status || 'pending',
        itemsCount,
        tokens: adminTokens
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
  if (isNativePush()) return nativeRoleStatus('admin');
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      supported: false,
      permission: 'unsupported',
      hasToken: false,
      tokenPreview: null
    };
  }

  const token = localStorage.getItem('ryyco_admin_fcm_token');
  const isGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  return {
    supported: true,
    permission: Notification.permission,
    hasToken: Boolean(token && isGranted && !/^(driver_|seller_)?(web|native)_push_/.test(token)),
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

  if (isNativePush()) return requestNativeRole('seller', { storeOwnerId: seller.uid, sellerUid: seller.uid, sellerEmail: seller.email || '', storeName: seller.storeName || 'Restaurante' });

  if (!('Notification' in window)) {
    return { success: false, error: 'Este navegador o dispositivo no soporta notificaciones push nativas.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permiso de notificaciones denegado en el navegador.' };
    }

    const fcmToken = await obtainWebFCMToken();

    // Store in localStorage for the seller
    localStorage.setItem('ryyco_seller_fcm_token', fcmToken);
    localStorage.setItem('ryyco_seller_fcm_store_id', seller.uid);

    // Save token in Firestore collection `seller_fcm_tokens`
    try {
      const sanitizedTokenId = `${seller.uid}_${fcmToken.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-60)}`;
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
      localStorage.removeItem('ryyco_seller_fcm_token');
      throw new Error('No se pudo guardar este dispositivo para recibir pedidos con la app cerrada.');
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

  // 3. Post message to active Service Worker to show background notification
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
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
          } as any).catch(err => {
            console.warn('[FCM-SELLER] reg.showNotification caught error:', err);
          });
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
      } else {
        try {
          new Notification(title, {
            body,
            icon: '/logoryyco.png'
          });
        } catch (e) {}
      }
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
  if (isNativePush()) return nativeRoleStatus('seller', storeOwnerId);
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
  const isGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  return {
    supported: true,
    permission: Notification.permission,
    hasToken: Boolean(token && isGranted && !/^(driver_|seller_)?(web|native)_push_/.test(token)),
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

  if (isNativePush()) return requestNativeRole('driver', { driverId: driver.id, driverName: driver.name || 'Domiciliario', phone: driver.phone || '', vehicleType: driver.vehicleType || 'moto' });

  if (!('Notification' in window)) {
    return { success: false, error: 'Este dispositivo no soporta notificaciones push nativas.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permiso de notificaciones denegado en el navegador.' };
    }

    const fcmToken = await obtainWebFCMToken();

    // Save locally
    localStorage.setItem('ryyco_driver_fcm_token', fcmToken);
    localStorage.setItem('ryyco_driver_fcm_driver_id', driver.id);
    localStorage.setItem('ryyco_driver_notifications_enabled', 'true');

    // Save in Firestore collection `driver_fcm_tokens`
    try {
      const sanitizedTokenId = `${driver.id}_${fcmToken.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-60)}`;
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
      localStorage.removeItem('ryyco_driver_fcm_token');
      localStorage.removeItem('ryyco_driver_notifications_enabled');
      throw new Error('No se pudo guardar el dispositivo en Firebase.');
    }

    // Also register token with server for direct Google FCM dispatch when Chrome is closed
    try {
      fetch('/api/fcm/register-driver-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: fcmToken,
          driverId: driver.id,
          driverName: driver.name || 'Domiciliario RYYCO',
          phone: driver.phone || '',
          vehicleType: driver.vehicleType || 'moto'
        })
      }).catch(() => {});
    } catch (regServerErr) {}

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
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: '/logoryyco.png',
            badge: '/favicon.svg',
            vibrate: [350, 150, 350, 150, 500],
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
          } as any).catch(err => {
            console.warn('[FCM-DRIVER] reg.showNotification caught error:', err);
          });
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
      } else {
        try {
          new Notification(title, {
            body,
            icon: '/logoryyco.png'
          });
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn('[FCM-DRIVER] Error displaying local driver notification:', err);
  }

  // 4. Send to backend FCM broadcast route for drivers (includes stored device tokens for closed-browser delivery)
  try {
    let activeTokens: string[] = [];
    try {
      const snap = await getDocs(collection(db, 'driver_fcm_tokens'));
      snap.forEach(d => {
        const data = d.data();
        if (data?.token && data?.active !== false) {
          activeTokens.push(data.token);
        }
      });
    } catch (tokenErr) {
      console.warn('[FCM-DRIVER] Error al consultar tokens activos de Firestore:', tokenErr);
    }

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
        itemsCount: order.items?.length || 1,
        tokens: activeTokens
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
  if (isNativePush()) return nativeRoleStatus('driver', driverId);
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
  const isGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const hasToken = Boolean(isGranted && token && !/^driver_(web|native)_push_/.test(token) && (!driverId || localStorage.getItem('ryyco_driver_fcm_driver_id') === driverId));

  return {
    supported: true,
    permission: Notification.permission,
    hasToken,
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
          // Suppress alert if driver already has an active delivery in progress
          const hasActiveDelivery = typeof window !== 'undefined' && (
            localStorage.getItem('ryyco_driver_has_active_delivery') === 'true' ||
            (entityUid ? Boolean(localStorage.getItem(`ryyco_active_delivery_${entityUid}`)) : false)
          );
          if (hasActiveDelivery) {
            console.log('[FCM-SSE] Suppressed new driver request push because driver has an active delivery in progress.');
            return;
          }

          playDriverOrderAlertChime();
          speakDriverVoiceAlert(`¡Nueva solicitud de domicilio en ${data.storeName || 'RYYCO'}!`);
          window.dispatchEvent(new CustomEvent('ryyco:new-driver-request', {
            detail: data
          }));
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const orderNum = data.orderNumber ? `#${data.orderNumber}` : '';
            const fee = data.deliveryCost ? `$${Number(data.deliveryCost).toLocaleString('es-CO')}` : '$3.000';
            try {
              new Notification(`🛵 ¡Nueva Solicitud de Domicilio ${orderNum}!`, {
                body: `Restaurante: ${data.storeName || 'Tienda'}\nEntrega: ${data.customerAddress || 'Ipiales'} • Ganancia: ${fee}`,
                icon: '/logoryyco.png'
              });
            } catch (e) {}
          }
        } else if (data.type === 'CUSTOM_DRIVER_ALERT' && role === 'driver') {
          if (!entityUid || data.driverId === 'all' || data.driverId === entityUid) {
            playDriverOrderAlertChime();
            speakDriverVoiceAlert(data.title || 'Aviso para domiciliarios RYYCO');
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(data.title || '🛵 RYYCO Domicilios', {
                  body: data.message,
                  icon: '/logoryyco.png'
                });
              } catch (e) {}
            }
          }
        } else if (data.type === 'SELLER_ORDER_PUSH' && role === 'seller') {
          if (!entityUid || data.storeOwnerId === entityUid) {
            playOrderAlertChime();
            window.dispatchEvent(new CustomEvent('ryyco:new-seller-order', {
              detail: data
            }));
          }
        } else if (data.type === 'ADMIN_ORDER_PUSH' && role === 'admin') {
          // Strictly only alert if order is pending
          if (data.status && data.status !== 'pending') {
            return;
          }
          playOrderAlertChime();
          window.dispatchEvent(new CustomEvent('ryyco:new-admin-order', {
            detail: data
          }));
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const orderNum = data.orderNumber ? `#${data.orderNumber}` : '';
            const store = data.storeName || 'Restaurante en RYYCO';
            const total = data.totalAmount ? `$${Number(data.totalAmount).toLocaleString('es-CO')} COP` : '';
            const cust = data.customerName ? `${data.customerName} • ` : '';
            const title = `🚨 ¡Nuevo Pedido ${orderNum} en ${store}!`;
            const body = `${cust}Total: ${total} (${data.itemsCount || 1} items)`;

            if (serviceWorkerReg && serviceWorkerReg.showNotification) {
              serviceWorkerReg.showNotification(title, {
                body,
                icon: '/logoryyco.png',
                badge: '/favicon.svg',
                vibrate: [350, 150, 350, 150, 500],
                tag: 'admin-order-' + (data.orderId || Date.now()),
                renotify: true,
                requireInteraction: true,
                data: {
                  url: '/?view=admin&tab=orders',
                  orderId: data.orderId,
                  orderNumber: data.orderNumber
                },
                actions: [
                  { action: 'open_admin', title: '📋 Ver en Administración' }
                ]
              } as any).catch(() => {
                try {
                  new Notification(title, { body, icon: '/logoryyco.png' });
                } catch (e) {}
              });
            } else {
              try {
                new Notification(title, { body, icon: '/logoryyco.png' });
              } catch (e) {}
            }
          }
        } else if (data.type === 'CUSTOM_SELLER_ALERT' && role === 'seller') {
          if (!entityUid || data.storeOwnerId === 'all' || data.storeOwnerId === entityUid) {
            playOrderAlertChime();
            speakOrderVoiceAlert(data.title || 'Mensaje de administración RYYCO');
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(data.title || '🔔 RYYCO Tiendas', {
                  body: data.message,
                  icon: '/logoryyco.png'
                });
              } catch (e) {}
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
