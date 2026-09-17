/**
 * Firebase Cloud Messaging Service Worker for RYYCO
 * Handles background push notifications when new orders arrive in the general administration panel.
 */

// Import Firebase scripts for Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
const firebaseConfig = {
  projectId: "studio-9002217802-13e05",
  appId: "1:420228694243:web:ba7bb9daa9aba66f0285d6",
  apiKey: "AIzaSyDSK4fAbGpJ59_OXSzvrDH4rDLj9gYP5b8",
  authDomain: "studio-9002217802-13e05.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15",
  storageBucket: "studio-9002217802-13e05.firebasestorage.app",
  messagingSenderId: "420228694243"
};

try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Firebase already initialized or error:', e);
}

let messaging = null;
try {
  messaging = firebase.messaging();
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Messaging initialization warning:', e);
}

// Handle FCM Background Messages
if (messaging) {
  messaging.onBackgroundMessage(function(payload) {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);

    const isSeller = payload.data?.isSeller === 'true' || payload.data?.isSeller === true || Boolean(payload.data?.storeOwnerId);
    const title = payload.notification?.title || payload.data?.title || (isSeller ? '🔔 ¡Nuevo Pedido en Tu Tienda!' : '🚨 ¡Nuevo Pedido en RYYCO!');
    const body = payload.notification?.body || payload.data?.body || (isSeller ? 'Tienes un nuevo pedido pendiente para despachar en tu tienda.' : 'Ha llegado un nuevo pedido en administración general.');
    const orderId = payload.data?.orderId || '';
    const orderNumber = payload.data?.orderNumber || '';
    const clickUrl = payload.data?.url || (isSeller ? '/?view=dashboard&tab=orders' : '/?view=admin&tab=orders');

    const notificationOptions = {
      body: body,
      icon: payload.notification?.icon || '/logoryyco.png',
      badge: '/favicon.svg',
      image: payload.notification?.image || payload.data?.image || undefined,
      vibrate: [350, 150, 350, 150, 500],
      tag: orderId ? (isSeller ? `seller-order-${orderId}` : `ryyco-order-${orderId}`) : `ryyco-order-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: {
        url: clickUrl,
        isSeller: isSeller,
        orderId: orderId,
        orderNumber: orderNumber,
        timestamp: Date.now()
      },
      actions: isSeller ? [
        { action: 'open_seller_orders', title: '📦 Atender Pedido' }
      ] : [
        { action: 'open_admin', title: '📋 Ver en Administración' }
      ]
    };

    return self.registration.showNotification(title, notificationOptions);
  });
}

// Fallback & Standard Web Push event listener
self.addEventListener('push', function(event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const isSeller = data.isSeller === true || data.isSeller === 'true' || Boolean(data.storeOwnerId);
    const title = data.title || data.notification?.title || (isSeller ? '🔔 ¡Nuevo Pedido en Tu Tienda!' : '🚨 ¡Nuevo Pedido en RYYCO!');
    const body = data.body || data.notification?.body || (isSeller ? 'Tienes un nuevo pedido de un cliente para despachar.' : 'Tienes un nuevo pedido en la administración general.');
    const orderId = data.orderId || data.data?.orderId || '';
    const orderNumber = data.orderNumber || data.data?.orderNumber || '';
    const clickUrl = data.url || data.data?.url || (isSeller ? '/?view=dashboard&tab=orders' : '/?view=admin&tab=orders');

    const options = {
      body: body,
      icon: data.icon || '/logoryyco.png',
      badge: '/favicon.svg',
      vibrate: [350, 150, 350, 150, 500],
      tag: orderId ? (isSeller ? `seller-order-${orderId}` : `ryyco-order-${orderId}`) : `ryyco-push-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: {
        url: clickUrl,
        isSeller: isSeller,
        orderId: orderId,
        orderNumber: orderNumber
      },
      actions: isSeller ? [
        { action: 'open_seller_orders', title: '📦 Atender Pedido' }
      ] : [
        { action: 'open_admin', title: '📋 Ver en Administración' }
      ]
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    // If text payload
    const text = event.data.text();
    const options = {
      body: text,
      icon: '/logoryyco.png',
      badge: '/favicon.svg',
      vibrate: [350, 150, 350],
      tag: 'ryyco-text-push-' + Date.now(),
      data: { url: '/?view=dashboard&tab=orders' }
    };
    event.waitUntil(self.registration.showNotification('🔔 RYYCO Tiendas', options));
  }
});

// Direct communication from client to trigger push notification via Service Worker
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'TRIGGER_ADMIN_ORDER_NOTIFICATION') {
    const { title, body, orderId, orderNumber, url } = event.data;
    const options = {
      body: body || 'Nuevo pedido recibido en administración general.',
      icon: '/logoryyco.png',
      badge: '/favicon.svg',
      vibrate: [350, 150, 350, 150, 500],
      tag: orderId ? `ryyco-order-${orderId}` : `ryyco-admin-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: {
        url: url || '/?view=admin&tab=orders',
        isSeller: false,
        orderId: orderId,
        orderNumber: orderNumber
      },
      actions: [
        { action: 'open_admin', title: '📋 Ver Pedido' }
      ]
    };

    self.registration.showNotification(title || '🚨 ¡Nuevo Pedido en RYYCO!', options);
  } else if (event.data && event.data.type === 'TRIGGER_SELLER_ORDER_NOTIFICATION') {
    const { title, body, orderId, orderNumber, url } = event.data;
    const options = {
      body: body || 'Nuevo pedido recibido en tu tienda.',
      icon: '/logoryyco.png',
      badge: '/favicon.svg',
      vibrate: [350, 150, 350, 150, 500],
      tag: orderId ? `seller-order-${orderId}` : `seller-order-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: {
        url: url || '/?view=dashboard&tab=orders',
        isSeller: true,
        orderId: orderId,
        orderNumber: orderNumber
      },
      actions: [
        { action: 'open_seller_orders', title: '📦 Atender Pedido' }
      ]
    };

    self.registration.showNotification(title || '🔔 ¡Nuevo Pedido en Tu Tienda!', options);
  }
});

// Notification click handler: focus tab or open administration / seller dashboard
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const isSeller = event.notification.data?.isSeller === true;
  const targetUrl = event.notification.data?.url || (isSeller ? '/?view=dashboard&tab=orders' : '/?view=admin&tab=orders');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a tab is already open, focus it and broadcast event
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          client.postMessage({
            type: isSeller ? 'RYYCO_SELLER_ORDER_NOTIFICATION_CLICK' : 'RYYCO_ORDER_NOTIFICATION_CLICK',
            orderId: event.notification.data?.orderId,
            orderNumber: event.notification.data?.orderNumber,
            url: targetUrl
          });
          return client.focus();
        }
      }
      // If no tab is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
