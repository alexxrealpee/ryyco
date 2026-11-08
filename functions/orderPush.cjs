const { createHash } = require('node:crypto');
function deliveryOrder(order) {
  return !['table', 'pickup'].includes(order.orderType) && !order.isTableOrder &&
    order.deliveryType !== 'restaurant' &&
    !String(order.customerName || '').toLowerCase().startsWith('mesa ') &&
    !/mesa|recoger/i.test(order.customerAddress || '') && !order.driverId && !order.deliveryDriverId;
}
function buildMessage(token, role, id, order, native) {
  const title = role === 'driver' ? 'Nuevo domicilio disponible' : role === 'seller' ? 'Nuevo pedido en tu restaurante' : 'Nuevo pedido en RYYCO';
  const body = `Pedido #${order.orderNumber || id} · ${order.storeName || 'RYYCO'}`;
  return { token, data: { role, status: 'pending', orderId: id, orderNumber: String(order.orderNumber || ''),
    storeOwnerId: String(order.storeOwnerId || ''), title, body,
    isDriver: String(role === 'driver'), isSeller: String(role === 'seller'),
    type: role === 'driver' ? 'DRIVER_REQUEST_PUSH' : role === 'seller' ? 'SELLER_ORDER_PUSH' : 'ADMIN_ORDER_PUSH',
    url: role === 'driver' ? '/?view=driver' : role === 'seller' ? '/?view=dashboard&tab=orders' : '/admin?tab=orders' },
    ...(native ? { notification: { title, body }, android: { priority: 'high', ttl: 3600000,
      notification: { channelId: 'ryyco_orders_v2', icon: 'ic_notification', color: '#E63946', sound: 'ryyco_order', defaultVibrateTimings: true, visibility: 'public', priority: 'high', tag: `${role}-${id}` } } }
      : { webpush: { headers: { Urgency: 'high', TTL: '3600' } } }) };
}
async function deliverOrder(db, messaging, id, reassignmentId) {
  const orderRef = db.collection('orders').doc(id);
  const order = (await orderRef.get()).data();
  if (!order || order.status !== 'pending') return;
  if (reassignmentId && (order.reassignmentId !== reassignmentId || !deliveryOrder(order))) return;
  const previousDriver = reassignmentId ? order.reassignmentHistory?.at(-1)?.previousDriverId : undefined;
  const admins = reassignmentId ? { docs: [] } : await db.collection('admin_fcm_tokens').where('active', '==', true).get();
  const sellers = !reassignmentId && order.storeOwnerId ? await db.collection('seller_fcm_tokens').where('storeOwnerId', '==', order.storeOwnerId).get() : { docs: [] };
  const recipients = [...admins.docs.map(doc => ({ doc, role: 'admin' })),
    ...sellers.docs.filter(doc => doc.get('active') === true).map(doc => ({ doc, role: 'seller' }))];
  if (deliveryOrder(order)) {
    const tokens = await db.collection('driver_fcm_tokens').where('active', '==', true).get();
    const drivers = new Map();
    for (const doc of tokens.docs) {
      const driverId = doc.get('driverId');
      if (!driverId || driverId === previousDriver) continue;
      if (!drivers.has(driverId)) drivers.set(driverId, (await db.collection('drivers').doc(driverId).get()).data());
      const driver = drivers.get(driverId);
      if (driver?.status === 'approved' && driver.isAvailable === true) recipients.push({ doc, role: 'driver' });
    }
  }
  for (const { doc, role } of recipients) {
    const token = doc.get('token');
    if (typeof token !== 'string' || token.length < 40 || /^(driver_|seller_)?(web|native)_push_/.test(token)) continue;
    const current = (await orderRef.get()).data();
    if (!current || current.status !== 'pending') return;
    if (reassignmentId && current.reassignmentId !== reassignmentId) return;
    if (role === 'driver' && !deliveryOrder(current)) continue;
    // Each release has its own delivery receipt; retries of that release are deduplicated.
    const key = createHash('sha256').update(`${id}:${role}:${token}${reassignmentId ? ':' + reassignmentId : ''}`).digest('hex');
    const receipt = db.collection('_push_receipts').doc(key);
    const acquired = await db.runTransaction(async tx => {
      const old = await tx.get(receipt);
      if (old.get('sent')) return false;
      if ((old.get('leaseUntil') || 0) > Date.now()) throw new Error('Delivery in progress');
      tx.set(receipt, { leaseUntil: Date.now() + 120000 }); return true;
    });
    if (!acquired) continue;
    try {
      await messaging.send(buildMessage(token, role, id, current, doc.get('device') === 'android'));
      await receipt.set({ sent: true, sentAt: new Date().toISOString() });
    } catch (error) {
      if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code)) {
        await doc.ref.update({ active: false }); await receipt.set({ sent: true, invalidToken: true });
      } else { await receipt.delete(); throw error; }
    }
  }
}
module.exports = { deliverOrder, buildMessage, deliveryOrder };
