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

    const isDriver = payload.data?.isDriver === 'true' || payload.data?.isDriver === true || payload.data?.role === 'driver' || payload.data?.type === 'DRIVER_REQUEST';
    const isSeller = !isDriver && (payload.data?.isSeller === 'true' || payload.data?.isSeller === true || Boolean(payload.data?.storeOwnerId));
    
    let defaultTitle = '🚨 ¡Nuevo Pedido en RYYCO!';
    let defaultBody = 'Ha llegado un nuevo pedido en administración general.';
    let clickUrl = '/?view=admin&tab=orders';

    if (isDriver) {
      defaultTitle = '🛵 ¡Nueva Solicitud de Domicilio!';
      const storeName = payload.data?.storeName || 'Restaurante';
      const address = payload.data?.customerAddress || payload.data?.address || 'Ipiales';
      const fee = payload.data?.deliveryCost ? `$${Number(payload.data.deliveryCost).toLocaleString('es-CO')}` : '$3.000';
      defaultBody = `De: ${storeName} • Para: ${address} • Ganancia: ${fee}`;
      clickUrl = '/?view=driver';
    } else if (isSeller) {
      defaultTitle = '🔔 ¡Nuevo Pedido en Tu Tienda!';
      defaultBody = 'Tienes un nuevo pedido pendiente para despachar en tu tienda.';
      clickUrl = '/?view=dashboard&tab=orders';
    }

    const title = payload.notification?.title || payload.data?.title || defaultTitle;
    const body = payload.notification?.body || payload.data?.body || defaultBody;
    const orderId = payload.data?.orderId || '';
    const orderNumber = payload.data?.orderNumber || '';
    clickUrl = payload.data?.url || clickUrl;

    const tag = orderId 
      ? (isDriver ? `driver-order-${orderId}` : (isSeller ? `seller-order-${orderId}` : `ryyco-order-${orderId}`))
      : `ryyco-order-${Date.now()}`;

    const notificationOptions = {
      body: body,
      icon: payload.notification?.icon || '/logoryyco.png',
      badge: '/favicon.svg',
      image: payload.notification?.image || payload.data?.image || undefined,
      vibrate: isDriver ? [400, 200, 400, 200, 600] : [350, 150, 350, 150, 500],
      tag: tag,
      renotify: true,
      requireInteraction: true,
      data: {
        url: clickUrl,
        isDriver: isDriver,
        isSeller: isSeller,
        orderId: orderId,
        orderNumber: orderNumber,
        timestamp: Date.now()
      },
      actions: isDriver ? [
        { action: 'open_driver_order', title: '🛵 Ver y Aceptar Solicitud' }
      ] : (isSeller ? [
        { action: 'open_seller_orders', title: '📦 Atender Pedido' }
      ] : [
        { action: 'open_admin', title: '📋 Ver en Administración' }
      ])
    };

    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      return Promise.resolve();
    }

    return self.registration.showNotification(title, notificationOptions).catch(function(err) {
      console.warn('[SW] showNotification background suppressed:', err);
    });
  });
}

// Fallback & Standard Web Push event listener
self.addEventListener('push', function(event) {
  if (!event.data) return;

  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    return;
  }

  try {
    const data = event.data.json();
    const isDriver = data.isDriver === true || data.isDriver === 'true' || data.role === 'driver' || data.type === 'DRIVER_REQUEST';
    const isSeller = !isDriver && (data.isSeller === true || data.isSeller === 'true' || Boolean(data.storeOwnerId));
    
    let defaultTitle = '🚨 ¡Nuevo Pedido en RYYCO!';
    let defaultBody = 'Tienes un nuevo pedido en la administración general.';
    let clickUrl = '/?view=admin&tab=orders';

    if (isDriver) {
      defaultTitle = '🛵 ¡Nueva Solicitud de Domicilio!';
      const storeName = data.storeName || data.data?.storeName || 'Restaurante';
      const address = data.customerAddress || data.data?.customerAddress || 'Ipiales';
      const fee = data.deliveryCost ? `$${Number(data.deliveryCost).toLocaleString('es-CO')}` : '$3.000';
      defaultBody = `De: ${storeName} • Para: ${address} • Ganancia: ${fee}`;
      clickUrl = '/?view=driver';
    } else if (isSeller) {
      defaultTitle = '🔔 ¡Nuevo Pedido en Tu Tienda!';
      defaultBody = 'Tienes un nuevo pedido de un cliente para despachar.';
      clickUrl = '/?view=dashboard&tab=orders';
    }

    const title = data.title || data.notification?.title || defaultTitle;
    const body = data.body || data.notification?.body || defaultBody;
    const orderId = data.orderId || data.data?.orderId || '';
    const orderNumber = data.orderNumber || data.data?.orderNumber || '';
    clickUrl = data.url || data.data?.url || clickUrl;

    const tag = orderId 
      ? (isDriver ? `driver-order-${orderId}` : (isSeller ? `seller-order-${orderId}` : `ryyco-order-${orderId}`))
      : `ryyco-push-${Date.now()}`;

    const options = {
      body: body,
      icon: data.icon || '/logoryyco.png',
      badge: '/favicon.svg',
      vibrate: isDriver ? [400, 200, 400, 200, 600] : [350, 150, 350, 150, 500],
      tag: tag,
      renotify: true,
      requireInteraction: true,
      data: {
        url: clickUrl,
        isDriver: isDriver,
        isSeller: isSeller,
        orderId: orderId,
        orderNumber: orderNumber
      },
      actions: isDriver ? [
        { action: 'open_driver_order', title: '🛵 Ver Solicitud' }
      ] : (isSeller ? [
        { action: 'open_seller_orders', title: '📦 Atender Pedido' }
      ] : [
        { action: 'open_admin', title: '📋 Ver en Administración' }
      ])
    };

    event.waitUntil(
      self.registration.showNotification(title, options).catch(function(err) {
        console.warn('[SW] Push showNotification suppressed:', err);
      })
    );
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
    event.waitUntil(
      self.registration.showNotification('🔔 RYYCO Tiendas', options).catch(function(err) {
        console.warn('[SW] Push text showNotification suppressed:', err);
      })
    );
  }
});

// Direct communication from client to trigger push notification via Service Worker
self.addEventListener('message', function(event) {
  if (!event.data) return;

  // Verify notification permission before attempting to display
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    return;
  }

  if (event.data.type === 'TRIGGER_ADMIN_ORDER_NOTIFICATION') {
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
        isDriver: false,
        orderId: orderId,
        orderNumber: orderNumber
      },
      actions: [
        { action: 'open_admin', title: '📋 Ver Pedido' }
      ]
    };

    self.registration.showNotification(title || '🚨 ¡Nuevo Pedido en RYYCO!', options).catch(function(err) {
      console.warn('[SW] showNotification admin suppressed:', err);
    });
  } else if (event.data.type === 'TRIGGER_SELLER_ORDER_NOTIFICATION') {
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
        isDriver: false,
        orderId: orderId,
        orderNumber: orderNumber
      },
      actions: [
        { action: 'open_seller_orders', title: '📦 Atender Pedido' }
      ]
    };

    self.registration.showNotification(title || '🔔 ¡Nuevo Pedido en Tu Tienda!', options).catch(function(err) {
      console.warn('[SW] showNotification seller suppressed:', err);
    });
  } else if (event.data.type === 'TRIGGER_DRIVER_REQUEST_NOTIFICATION') {
    const { title, body, orderId, orderNumber, url, storeName, address, deliveryCost } = event.data;
    const feeText = deliveryCost ? `$${Number(deliveryCost).toLocaleString('es-CO')}` : '$3.000';
    const options = {
      body: body || `Nueva entrega en ${storeName || 'RYYCO'}\nPara: ${address || 'Ipiales'} • Ganancia: ${feeText}`,
      icon: '/logoryyco.png',
      badge: '/favicon.svg',
      vibrate: [400, 200, 400, 200, 600],
      tag: orderId ? `driver-order-${orderId}` : `driver-order-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: {
        url: url || '/?view=driver',
        isDriver: true,
        isSeller: false,
        orderId: orderId,
        orderNumber: orderNumber
      },
      actions: [
        { action: 'open_driver_order', title: '🛵 Ver Solicitud' }
      ]
    };

    self.registration.showNotification(title || '🛵 ¡Nueva Solicitud de Domicilio!', options).catch(function(err) {
      console.warn('[SW] showNotification driver suppressed:', err);
    });
  }
});

// Notification click handler: focus tab or open administration / seller / driver dashboard
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const isDriver = event.notification.data?.isDriver === true;
  const isSeller = event.notification.data?.isSeller === true;
  
  let targetUrl = '/?view=admin&tab=orders';
  if (isDriver) {
    targetUrl = '/?view=driver';
  } else if (isSeller) {
    targetUrl = '/?view=dashboard&tab=orders';
  }
  if (event.notification.data?.url) {
    targetUrl = event.notification.data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a tab is already open, focus it, navigate if needed, and broadcast event
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          const clickType = isDriver 
            ? 'RYYCO_DRIVER_NOTIFICATION_CLICK' 
            : (isSeller ? 'RYYCO_SELLER_ORDER_NOTIFICATION_CLICK' : 'RYYCO_ORDER_NOTIFICATION_CLICK');

          client.postMessage({
            type: clickType,
            orderId: event.notification.data?.orderId,
            orderNumber: event.notification.data?.orderNumber,
            url: targetUrl
          });

          if ('navigate' in client && client.url && isDriver && !client.url.includes('view=driver') && !client.url.includes('domiciliario')) {
            client.navigate(targetUrl);
          }
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
