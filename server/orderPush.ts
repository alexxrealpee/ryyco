import { applicationDefault, cert, initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const DATABASE = 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15';
const status = { configured: false, listening: false, error: '' };
export const getOrderPushStatus = () => ({ ...status });

export async function startOrderPush() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (
      process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('AIza') ||
      !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    ) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.K_SERVICE) {
    status.error = 'Faltan credenciales de servicio de Firebase en el servidor.';
    console.warn('[Order push]', status.error);
    return;
  }
  try {
    const existingApp = getApps().find(a => a.name === 'order-push');
    const app = existingApp || initializeApp({
      credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-9002217802-13e05'
    }, 'order-push');
    const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || DATABASE);
    const messaging = getMessaging(app);
    const state = db.collection('_push_state').doc('orders');
    // Start with new orders on first activation; recover up to 24h after restarts.
    const activatedAt = await db.runTransaction(async tx => {
      const saved = await tx.get(state);
      if (saved.exists) return saved.get('activatedAt') as string;
      const now = new Date().toISOString();
      tx.create(state, { activatedAt: now });
      return now;
    });
    const cutoff = [activatedAt, new Date(Date.now() - 86400000).toISOString()].sort().pop()!;
    const pending = new Map<string, FirebaseFirestore.DocumentReference>();
    let draining = false;
    const deliver = async (orderRef: FirebaseFirestore.DocumentReference) => {
      const snapshot = await orderRef.get();
      const order = snapshot.data();
      if (!order || order.status !== 'pending') return;
      const adminTokens = await db.collection('admin_fcm_tokens').where('active', '==', true).get();
      const sellerTokens = order.storeOwnerId
        ? await db.collection('seller_fcm_tokens').where('storeOwnerId', '==', order.storeOwnerId).get() : null;
      const recipients = [
        ...adminTokens.docs.map(doc => ({ doc, role: 'admin' })),
        ...(sellerTokens?.docs || []).filter(doc => doc.get('active') === true).map(doc => ({ doc, role: 'seller' }))
      ];
      for (const { doc, role } of recipients) {
        const token = doc.get('token');
        if (typeof token !== 'string' || token.length < 40 || /^(web_push_|seller_web_push_|seller_native_push_)/.test(token)) continue;
        const key = createHash('sha256').update(`${snapshot.id}:${role}:${token}`).digest('hex');
        const receipt = db.collection('_push_receipts').doc(key);
        const acquired = await db.runTransaction(async tx => {
          const previous = await tx.get(receipt);
          if (previous.get('sent')) return false;
          if ((previous.get('leaseUntil') || 0) > Date.now()) throw new Error('Delivery in progress');
          tx.set(receipt, { leaseUntil: Date.now() + 120000 });
          return true;
        });
        if (!acquired) continue;
        try {
          await messaging.send({ token, data: {
            type: role === 'admin' ? 'ADMIN_ORDER_PUSH' : 'SELLER_ORDER_PUSH',
            role, isSeller: String(role === 'seller'), status: 'pending',
            orderId: snapshot.id, orderNumber: String(order.orderNumber || ''),
            storeOwnerId: String(order.storeOwnerId || ''),
            title: role === 'admin' ? 'Nuevo pedido en Ryyco' : 'Nuevo pedido en tu tienda',
            body: `Pedido #${order.orderNumber || snapshot.id} · ${order.storeName || 'Ryyco'}`,
            url: role === 'admin' ? '/?view=admin&tab=orders' : '/?view=dashboard&tab=orders'
          }, webpush: { headers: { Urgency: 'high', TTL: '3600' } } });
          await receipt.set({ sent: true, sentAt: FieldValue.serverTimestamp() });
        } catch (error: any) {
          if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code)) {
            await doc.ref.update({ active: false });
            await receipt.set({ sent: true, invalidToken: true });
          } else {
            await receipt.delete();
            throw error;
          }
        }
      }
    };
    const drain = async () => {
      if (draining) return;
      draining = true;
      try {
        for (const [id, ref] of pending) {
          try { await deliver(ref); pending.delete(id); }
          catch (error: any) { console.warn('[Order push] Retry pending:', error.code || error.message); }
        }
      } finally { draining = false; }
    };
    status.configured = true;
    db.collection('orders').where('createdAt', '>=', cutoff).onSnapshot(snapshot => {
      status.listening = true;
      status.error = '';
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' && change.doc.get('status') === 'pending') pending.set(change.doc.id, change.doc.ref);
      }
      void drain();
    }, error => {
      status.listening = false;
      status.error = 'Se perdió la escucha de pedidos; revisa las credenciales y reinicia el servidor.';
      console.error('[Order push]', error.message);
    });
    setInterval(() => void drain(), 30000).unref();
  } catch (error: any) {
    status.error = 'No se pudo iniciar push. Revisa las credenciales y permisos de Firebase del servidor.';
    console.error('[Order push]', error.code || status.error);
  }
}
