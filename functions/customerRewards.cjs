// Lógica de clientes y RYYCOS que antes corría en el navegador.
// El navegador ya no puede escribir saldos, giros ni premios: lo hace este servidor.
const { HttpsError } = require('firebase-functions/v2/https');

const CUSTOMER_EMAIL_DOMAIN = 'clientes.ryyco.com';
const PURCHASE_POINTS = 500;
const PURCHASE_SPINS = 1;
const MAX_MOVEMENTS = 50;

// Copia exacta de sanitizeCustomerPhone() de src/lib/firebase.ts
function sanitizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (cleaned.length === 12 && cleaned.startsWith('57')) cleaned = cleaned.substring(2);
  else if (cleaned.length === 11 && cleaned.startsWith('57')) cleaned = cleaned.substring(2);
  else if (cleaned.length > 10 && cleaned.startsWith('573')) cleaned = cleaned.substring(2);
  return cleaned;
}

function requirePhone(raw) {
  const phone = sanitizePhone(raw);
  if (!phone || phone.length < 7 || phone.length > 12) throw new HttpsError('invalid-argument', 'Número de celular inválido.');
  return phone;
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para continuar.');
  return request.auth;
}

const firstName = (name) => String(name || 'Cliente').trim().split(/\s+/)[0].slice(0, 30);
const balanceOf = (data) => Number(data.points !== undefined ? data.points : (data.ryycos !== undefined ? data.ryycos : 0)) || 0;
const movementId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Busca el documento del cliente por celular (id = celular, o 57+celular en datos antiguos).
async function findCustomerByPhone(db, phone) {
  for (const id of [phone, `57${phone}`]) {
    const snap = await db.collection('customers').doc(id).get();
    if (snap.exists) return snap;
  }
  const q = await db.collection('customers').where('phone', '==', phone).limit(1).get();
  return q.empty ? null : q.docs[0];
}

async function findCustomerByUid(db, uid) {
  const q = await db.collection('customers').where('authUid', '==', uid).limit(1).get();
  return q.empty ? null : q.docs[0];
}

// El celular pertenece a quien inició sesión con la cuenta <celular>@clientes.ryyco.com.
const ownsPhoneByEmail = (auth, phone) => String(auth.token.email || '').toLowerCase() === `${phone}@${CUSTOMER_EMAIL_DOMAIN}`;

/** ¿Existe un cliente con este celular? Solo devuelve el primer nombre. */
async function checkPhone(db, request) {
  const phone = requirePhone(request.data && request.data.phone);
  const snap = await findCustomerByPhone(db, phone);
  if (!snap) return { exists: false };
  const data = snap.data();
  return { exists: true, hasAccount: Boolean(data.authUid), firstName: firstName(data.name) };
}

/**
 * Vincula el perfil del celular a la cuenta que inició sesión, solo si aún no
 * tiene dueño (o ya es suyo). Un perfil vinculado a otra cuenta no se cede.
 * La cuenta de contraseña <celular>@clientes.ryyco.com se trata igual: el
 * celular nunca se verificó por SMS, así que no "gana" sobre una cuenta previa.
 */
async function claimProfile(db, request) {
  const auth = requireAuth(request);
  const phone = requirePhone(request.data && request.data.phone);
  const snap = await findCustomerByPhone(db, phone);
  if (!snap) return { claimed: false, exists: false };
  const result = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(snap.ref);
    const owner = fresh.get('authUid') || '';
    if (owner && owner !== auth.uid) {
      throw new HttpsError('permission-denied', ownsPhoneByEmail(auth, phone)
        ? 'Este celular ya está vinculado a tu cuenta de Google. Entra con el botón de Google.'
        : 'Este celular ya está vinculado a otra cuenta. Inicia sesión con esa cuenta.');
    }
    if (!owner) tx.update(snap.ref, { authUid: auth.uid, updatedAt: new Date().toISOString() });
    return { claimed: true, exists: true, docId: snap.id };
  });
  // Pedidos antiguos de este celular sin dueño: pasan a ser de esta cuenta,
  // para que el cliente los vea con las reglas que exigen customerUid.
  await adoptOrphanOrders(db, phone, auth.uid).catch((err) => console.warn('adoptOrphanOrders', err.message));
  return result;
}

function phoneVariants(phone) {
  return [...new Set([phone, `57${phone}`, `+57${phone}`])];
}

async function adoptOrphanOrders(db, phone, uid) {
  const snap = await db.collection('orders')
    .where('customerPhone', 'in', phoneVariants(phone))
    .where('customerUid', '==', '')
    .limit(400).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { customerUid: uid }));
  await batch.commit();
  return snap.size;
}

/** Busca destinatario de transferencia: nombre parcial, nunca datos privados. */
async function findRecipient(db, request) {
  const auth = requireAuth(request);
  const phone = requirePhone(request.data && request.data.phone);
  const sender = await findCustomerByUid(db, auth.uid);
  if (sender && sanitizePhone(sender.get('phone') || sender.id) === phone) {
    return { found: false, error: 'No puedes transferirte RYYCOS a ti mismo.' };
  }
  const snap = await findCustomerByPhone(db, phone);
  if (!snap) return { found: false, error: `No encontramos ningún cliente registrado con el celular ${phone} en RYYCO.` };
  return { found: true, name: firstName(snap.get('name')), phone };
}

/** Transferencia de RYYCOS (atómica). El remitente es siempre quien inició sesión. */
async function transfer(db, request) {
  const auth = requireAuth(request);
  const recipientPhone = requirePhone(request.data && request.data.recipientPhone);
  const amount = Math.floor(Number(request.data && request.data.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'La cantidad mínima a transferir es 1 RYYCO.');
  if (amount > 1000000) throw new HttpsError('invalid-argument', 'Cantidad demasiado alta.');

  const senderSnap = await findCustomerByUid(db, auth.uid);
  if (!senderSnap) throw new HttpsError('failed-precondition', 'No encontramos tu perfil de cliente. Cierra sesión y vuelve a entrar.');
  const recipientSnap = await findCustomerByPhone(db, recipientPhone);
  if (!recipientSnap) throw new HttpsError('not-found', `No encontramos ningún cliente registrado con el celular ${recipientPhone} en RYYCO.`);
  if (recipientSnap.id === senderSnap.id) throw new HttpsError('invalid-argument', 'No puedes enviarte RYYCOS a tu propio número.');

  const now = new Date().toISOString();
  const ref = 'TRF-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  return db.runTransaction(async (tx) => {
    const [s, r] = await Promise.all([tx.get(senderSnap.ref), tx.get(recipientSnap.ref)]);
    const sData = s.data(), rData = r.data();
    const sPhone = sanitizePhone(sData.phone || s.id), rPhone = sanitizePhone(rData.phone || r.id);
    const sBal = balanceOf(sData), rBal = balanceOf(rData);
    if (sBal < amount) throw new HttpsError('failed-precondition', `Saldo insuficiente de RYYCOS. Tienes ${sBal.toLocaleString('es-CO')} RYYCOS disponibles.`);
    const sAfter = sBal - amount, rAfter = rBal + amount;
    const out = { id: `mov_tx_${ref}_out`, customerId: sPhone, type: 'transfer_sent', amount: -amount, balanceAfter: sAfter,
      description: `Envío de RYYCOS a ${firstName(rData.name)} (${rPhone})`, referenceId: ref, targetPhone: rPhone, targetName: firstName(rData.name), createdAt: now };
    const inn = { id: `mov_tx_${ref}_in`, customerId: rPhone, type: 'transfer_received', amount, balanceAfter: rAfter,
      description: `Recibiste RYYCOS de ${firstName(sData.name)} (${sPhone})`, referenceId: ref, senderPhone: sPhone, senderName: firstName(sData.name), createdAt: now };
    tx.update(s.ref, { points: sAfter, ryycos: sAfter, movements: [out, ...(sData.movements || [])].slice(0, MAX_MOVEMENTS), updatedAt: now });
    tx.update(r.ref, { points: rAfter, ryycos: rAfter, movements: [inn, ...(rData.movements || [])].slice(0, MAX_MOVEMENTS), updatedAt: now });
    tx.set(db.collection('ryyco_transactions').doc(ref), {
      referenceId: ref, senderPhone: sPhone, senderName: firstName(sData.name), senderUid: auth.uid, recipientPhone: rPhone, recipientName: firstName(rData.name),
      amount, senderBalanceBefore: sBal, senderBalanceAfter: sAfter, recipientBalanceBefore: rBal, recipientBalanceAfter: rAfter, status: 'completed', createdAt: now,
    });
    return { referenceId: ref, senderPhone: sPhone, senderName: firstName(sData.name), recipientPhone: rPhone, recipientName: firstName(rData.name), amount, senderBalanceAfter: sAfter, createdAt: now };
  });
}

/**
 * Giro de la ruleta. Igual que hoy en la app ("modo temporal"): el giro siempre
 * cae en "Sigue intentando" y solo descuenta un giro. El resultado lo decide el servidor.
 */
async function spin(db, request) {
  const auth = requireAuth(request);
  const snap = await findCustomerByUid(db, auth.uid);
  if (!snap) throw new HttpsError('failed-precondition', 'No encontramos tu perfil de cliente.');
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(snap.ref);
    const spins = Number(fresh.get('spinsAvailable') || 0);
    if (spins <= 0) throw new HttpsError('failed-precondition', 'No tienes giros disponibles. ¡Haz un nuevo pedido para ganar más giros!');
    tx.update(snap.ref, { spinsAvailable: spins - 1, updatedAt: new Date().toISOString() });
    return { result: 'lose', spinsAvailable: spins - 1 };
  });
}

/**
 * Premia al cliente cuando su pedido se ENTREGA (no al crearlo, para que no se
 * puedan ganar puntos con pedidos falsos). Se ejecuta una sola vez por pedido.
 */
async function awardOnDelivered(db, event) {
  const before = event.data && event.data.before.data();
  const after = event.data && event.data.after.data();
  if (!after || after.status !== 'delivered' || (before && before.status === 'delivered')) return;
  const orderRef = event.data.after.ref;

  let customerSnap = null;
  if (after.customerUid) customerSnap = await findCustomerByUid(db, after.customerUid);
  if (!customerSnap && after.customerPhone) {
    const phone = sanitizePhone(after.customerPhone);
    if (phone.length >= 7) customerSnap = await findCustomerByPhone(db, phone);
  }
  const noPoints = after.clientPlatform === 'android';

  await db.runTransaction(async (tx) => {
    const order = await tx.get(orderRef);
    if (order.get('ryycoAwardedAt')) return; // ya premiado
    const now = new Date().toISOString();
    if (!customerSnap) { tx.update(orderRef, { ryycoAwardedAt: now, ryycoAwardSkipped: 'sin-perfil' }); return; }
    const cust = await tx.get(customerSnap.ref);
    const data = cust.data();
    const points = noPoints ? 0 : PURCHASE_POINTS;
    const spins = noPoints ? 0 : PURCHASE_SPINS;
    const balance = balanceOf(data) + points;
    const update = {
      totalOrdersCount: Number(data.totalOrdersCount || 0) + 1,
      totalSpent: Number(data.totalSpent || 0) + (Number(after.totalAmount) || 0),
      updatedAt: now,
    };
    if (points > 0) {
      update.points = balance;
      update.ryycos = balance;
      update.spinsAvailable = Number(data.spinsAvailable || 0) + spins;
      update.movements = [{
        id: movementId('mov'), customerId: sanitizePhone(data.phone || cust.id), type: 'earned_purchase', amount: points, balanceAfter: balance,
        description: `Ganaste ${points.toLocaleString('es-CO')} RYYCOS por compra #${after.orderNumber || ''}`,
        referenceId: after.orderNumber !== undefined ? String(after.orderNumber) : order.id, createdAt: now,
      }, ...(data.movements || [])].slice(0, MAX_MOVEMENTS);
    }
    tx.update(customerSnap.ref, update);
    tx.update(orderRef, { ryycoAwardedAt: now, ryycoPointsAwarded: points });
  });
}

module.exports = { checkPhone, claimProfile, findRecipient, transfer, spin, awardOnDelivered, sanitizePhone };
