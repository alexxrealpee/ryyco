/**
 * Resumen por cliente para el ranking de "Clientes" del panel de administración.
 *
 * Cada documento customerStats/{key} agrupa los pedidos de un cliente (por teléfono,
 * correo o nombre, igual que hacía el panel en el navegador) y una copia reducida de
 * su perfil en customers/. Así el panel puede ordenar y paginar de 4 en 4 directamente
 * en Firestore (limit + startAfter) sin descargar todos los pedidos.
 *
 * El documento guarda un mapa `orders` con un resumen de cada pedido. Los totales se
 * recalculan siempre desde ese mapa, por eso los triggers son idempotentes: si una
 * función se reintenta, el resultado es el mismo.
 */

const STATS = 'customerStats';
const MAX_SEARCH_TERMS = 300;
const MAX_PREFIX = 20;

const PLACEHOLDER_NAMES = new Set([
  'cliente', 'cliente sin nombre', 'sin nombre', 'usuario', 'comensal', 'anonimo',
  'cliente registrado', 'consumidor final',
]);

function canonicalPhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 12 && digits.startsWith('57')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('57')) digits = digits.slice(2);
  else if (digits.length > 10 && digits.startsWith('573')) digits = digits.slice(2);
  return digits;
}

function normalizeName(name) {
  if (!name) return '';
  return String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function isPlaceholderName(name) {
  const norm = normalizeName(name);
  return !norm || PLACEHOLDER_NAMES.has(norm);
}

function toIso(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  return '';
}

/** Clave del cliente de un pedido: teléfono > correo > nombre > el propio pedido. */
function keyForOrder(order, orderId) {
  const phone = canonicalPhone(order.customerPhone);
  if (phone.length >= 7) return `p_${phone}`;
  const email = String(order.customerEmail || '').toLowerCase().trim();
  if (email.includes('@')) return `e_${email.replace(/\//g, '_')}`.slice(0, 200);
  if (!isPlaceholderName(order.customerName)) return `n_${normalizeName(order.customerName).replace(/ /g, '_')}`.slice(0, 200);
  return `o_${orderId}`;
}

/** Clave del cliente de un perfil registrado (customers/{id}). */
function keyForProfile(profile, profileId) {
  const phone = canonicalPhone(profile.phone || profileId);
  return phone.length >= 7 ? `p_${phone}` : `prof_${String(profileId).replace(/\//g, '_')}`;
}

function orderSummary(order) {
  return {
    status: String(order.status || 'pending'),
    amount: Number(order.totalAmount) || 0,
    store: String(order.storeOwnerId || 'unknown'),
    storeName: String(order.storeName || ''),
    at: toIso(order.createdAt),
    address: String(order.customerAddress || '').trim(),
    name: String(order.customerName || '').trim(),
    phone: String(order.customerPhone || '').trim(),
    email: String(order.customerEmail || '').toLowerCase().trim(),
  };
}

/** Copia reducida del perfil: solo lo que muestra el ranking (sin movimientos ni authUid). */
function profileSummary(profile, profileId) {
  if (!profile) return null;
  const pick = {
    id: profileId,
    name: profile.name || '',
    phone: profile.phone || '',
    email: profile.email || '',
    address: profile.address || '',
    welcomeMessageSentAt: profile.welcomeMessageSentAt || null,
    totalOrdersCount: Number(profile.totalOrdersCount) || 0,
    totalSpent: Number(profile.totalSpent) || 0,
    spinsAvailable: Number(profile.spinsAvailable) || 0,
    createdAt: toIso(profile.createdAt),
    updatedAt: toIso(profile.updatedAt),
  };
  if (profile.points !== undefined && profile.points !== null) pick.points = Number(profile.points) || 0;
  if (profile.ryycos !== undefined && profile.ryycos !== null) pick.ryycos = Number(profile.ryycos) || 0;
  return pick;
}

function addPrefixes(set, word) {
  const w = word.slice(0, MAX_PREFIX);
  for (let i = 2; i <= w.length; i++) set.add(w.slice(0, i));
}

function buildSearchTerms({ name, cleanPhone, favoriteStoreName, addresses, email }) {
  const terms = new Set();
  normalizeName(name).split(' ').filter(Boolean).forEach(word => addPrefixes(terms, word));
  if (cleanPhone) for (let i = 3; i <= cleanPhone.length; i++) terms.add(cleanPhone.slice(0, i));
  normalizeName(favoriteStoreName).split(' ').filter(Boolean).forEach(word => addPrefixes(terms, word));
  addresses.slice(0, 2).forEach(addr => normalizeName(addr).split(' ').filter(Boolean).forEach(word => addPrefixes(terms, word)));
  if (email) addPrefixes(terms, normalizeName(email.split('@')[0]).replace(/ /g, ''));
  return [...terms].slice(0, MAX_SEARCH_TERMS);
}

/**
 * Calcula el documento completo de un cliente desde su mapa de pedidos y su perfil.
 * Devuelve null si ya no tiene pedidos ni perfil (el documento se borra).
 * Replica los cálculos que hacía AdminCustomersRanking en el navegador.
 */
function buildStatsDoc(key, ordersMap, profile) {
  const orders = Object.entries(ordersMap || {}).map(([id, o]) => ({ id, ...o }));
  if (orders.length === 0 && !profile) return null;
  // Del más antiguo al más reciente para elegir nombre/teléfono como antes.
  orders.sort((a, b) => (a.at || '').localeCompare(b.at || ''));

  let name = '';
  let rawPhone = '';
  let cleanPhone = '';
  let email = '';
  const addresses = [];
  const stores = {};
  let totalSpent = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let activeOrders = 0;

  orders.forEach((o, index) => {
    const placeholder = isPlaceholderName(o.name);
    const phone = canonicalPhone(o.phone);
    if (index === 0) {
      name = placeholder ? (o.name || 'Cliente') : o.name;
      rawPhone = o.phone;
      cleanPhone = phone;
    } else if (isPlaceholderName(name) && !placeholder) {
      name = o.name;
    } else if (!placeholder && o.name.length > name.length) {
      name = o.name;
    }
    if (cleanPhone.length < 7 && phone.length >= 7) { cleanPhone = phone; rawPhone = o.phone; }
    if (!email && o.email) email = o.email;
    if (o.status === 'delivered') completedOrders++;
    else if (o.status === 'cancelled') cancelledOrders++;
    else activeOrders++;
    if (o.status !== 'cancelled') totalSpent += o.amount;
    const st = stores[o.store] || (stores[o.store] = { name: '', count: 0, spent: 0 });
    st.count += 1;
    if (o.storeName) st.name = o.storeName;
    if (o.status !== 'cancelled') st.spent += o.amount;
  });
  // Direcciones: la más reciente primero.
  for (let i = orders.length - 1; i >= 0; i--) {
    const addr = orders[i].address;
    if (addr && !addresses.includes(addr) && addresses.length < 10) addresses.push(addr);
  }

  const registered = !!profile;
  let totalOrders = orders.length;
  let firstOrderAt = orders[0]?.at || '';
  let lastOrderAt = orders[orders.length - 1]?.at || '';
  let favoriteStoreId = null;
  let favoriteStoreName = 'Varias tiendas';
  let maxCount = 0;
  for (const [id, st] of Object.entries(stores)) {
    if (st.count > maxCount) { maxCount = st.count; favoriteStoreId = id; favoriteStoreName = st.name; }
  }

  if (orders.length === 0) {
    // Perfil registrado sin pedidos: mismos valores que mostraba el panel.
    name = profile.name || 'Cliente Registrado';
    rawPhone = profile.phone || profile.id || '';
    cleanPhone = canonicalPhone(rawPhone);
    email = profile.email || '';
    if (profile.address) addresses.push(profile.address);
    totalOrders = profile.totalOrdersCount;
    completedOrders = profile.totalOrdersCount;
    totalSpent = profile.totalSpent;
    firstOrderAt = profile.createdAt || '';
    lastOrderAt = profile.updatedAt || profile.createdAt || '';
    favoriteStoreId = null;
    favoriteStoreName = 'Sin pedidos aún';
  } else if (!name) {
    name = 'Cliente';
  }

  const validOrders = orders.filter(o => o.status !== 'cancelled').length;
  const ryycos = registered
    ? (profile.points !== undefined ? profile.points : (profile.ryycos !== undefined ? profile.ryycos : 0))
    : 500 + validOrders * 500;
  const spinsAvailable = registered ? profile.spinsAvailable : Math.max(1, validOrders);
  const averageTicket = orders.length > 0 && totalOrders - cancelledOrders > 0
    ? Math.round(totalSpent / (totalOrders - cancelledOrders)) : 0;
  const welcomeMessageSentAt = (profile && profile.welcomeMessageSentAt) || null;
  const hasWhatsapp = cleanPhone.length >= 7;

  const tags = [];
  if (totalOrders >= 5) tags.push('vip');
  else if (totalOrders >= 2) tags.push('frequent');
  else if (totalOrders === 1) tags.push('new');
  if (totalOrders > 1) tags.push('recurring');
  if (hasWhatsapp) tags.push('has_whatsapp');
  if (ryycos > 0) tags.push('has_ryycos');
  if (welcomeMessageSentAt) tags.push('welcome_sent');
  else if (hasWhatsapp) tags.push('welcome_pending');

  return {
    key,
    name,
    rawPhone,
    cleanPhone,
    email,
    addresses,
    totalOrders,
    completedOrders,
    cancelledOrders,
    activeOrders,
    totalSpent,
    averageTicket,
    firstOrderAt,
    lastOrderAt,
    favoriteStoreId,
    favoriteStoreName,
    stores,
    orders: ordersMap || {},
    ryycos,
    spinsAvailable,
    isRegisteredProfile: registered,
    welcomeMessageSentAt,
    profile: profile || null,
    tags,
    searchTerms: buildSearchTerms({ name, cleanPhone, favoriteStoreName, addresses, email }),
    updatedAt: new Date().toISOString(),
  };
}

async function findProfileForKeyTx(db, tx, key) {
  if (!key.startsWith('p_')) return null;
  const phone = key.slice(2);
  for (const id of [phone, `57${phone}`]) {
    const snap = await tx.get(db.collection('customers').doc(id));
    if (snap.exists) return profileSummary(snap.data(), snap.id);
  }
  const q = await tx.get(db.collection('customers').where('phone', '==', phone).limit(1));
  return q.empty ? null : profileSummary(q.docs[0].data(), q.docs[0].id);
}

/** Trigger: un pedido se creó, cambió o se borró. */
async function onOrderWritten(db, event) {
  const orderId = event.params.orderId;
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  const keyBefore = before ? keyForOrder(before, orderId) : null;
  const keyAfter = after ? keyForOrder(after, orderId) : null;
  const sumAfter = after ? orderSummary(after) : null;
  // La mayoría de cambios de un pedido (repartidor, tiempos…) no afectan el ranking.
  if (keyBefore === keyAfter && before && after && JSON.stringify(orderSummary(before)) === JSON.stringify(sumAfter)) return;

  const keys = [...new Set([keyBefore, keyAfter].filter(Boolean))];
  await db.runTransaction(async tx => {
    const refs = keys.map(k => db.collection(STATS).doc(k));
    const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
    const profiles = await Promise.all(keys.map((k, i) => snaps[i].exists
      ? Promise.resolve(snaps[i].get('profile') || null)
      : findProfileForKeyTx(db, tx, k)));
    keys.forEach((k, i) => {
      const orders = { ...(snaps[i].exists ? snaps[i].get('orders') || {} : {}) };
      delete orders[orderId];
      if (k === keyAfter) orders[orderId] = sumAfter;
      const next = buildStatsDoc(k, orders, profiles[i]);
      if (next) tx.set(refs[i], next);
      else if (snaps[i].exists) tx.delete(refs[i]);
    });
  });
}

/** Trigger: un perfil de cliente (RYYCOS, bienvenida, nombre…) se creó, cambió o se borró. */
async function onCustomerWritten(db, event) {
  const profileId = event.params.customerId;
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  const keyBefore = before ? keyForProfile(before, profileId) : null;
  const keyAfter = after ? keyForProfile(after, profileId) : null;
  const pAfter = profileSummary(after, profileId);
  if (keyBefore === keyAfter && JSON.stringify(profileSummary(before, profileId)) === JSON.stringify(pAfter)) return;

  const keys = [...new Set([keyBefore, keyAfter].filter(Boolean))];
  await db.runTransaction(async tx => {
    const refs = keys.map(k => db.collection(STATS).doc(k));
    const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
    keys.forEach((k, i) => {
      const current = snaps[i].exists ? snaps[i].get('profile') : null;
      // Solo quitamos el perfil si el que había era este mismo documento.
      let profile = current;
      if (k === keyAfter) profile = pAfter;
      else if (current && current.id === profileId) profile = null;
      const orders = snaps[i].exists ? snaps[i].get('orders') || {} : {};
      const next = buildStatsDoc(k, orders, profile);
      if (next) tx.set(refs[i], next);
      else if (snaps[i].exists) tx.delete(refs[i]);
    });
  });
}

/** Reconstruye toda la colección desde orders y customers (llenado inicial o reparación). */
async function rebuildAll(db, { dryRun = false, log = console.log } = {}) {
  const [ordersSnap, customersSnap, statsSnap] = await Promise.all([
    db.collection('orders').get(),
    db.collection('customers').get(),
    db.collection(STATS).select().get(),
  ]);
  const ordersByKey = new Map();
  ordersSnap.forEach(doc => {
    const data = doc.data();
    const key = keyForOrder(data, doc.id);
    if (!ordersByKey.has(key)) ordersByKey.set(key, {});
    ordersByKey.get(key)[doc.id] = orderSummary(data);
  });
  const profileByKey = new Map();
  customersSnap.forEach(doc => {
    const key = keyForProfile(doc.data(), doc.id);
    const existing = profileByKey.get(key);
    // Si hay dos documentos para el mismo teléfono, gana el que tiene más datos.
    const candidate = profileSummary(doc.data(), doc.id);
    if (!existing || (candidate.totalOrdersCount + (candidate.points || 0)) > (existing.totalOrdersCount + (existing.points || 0))) {
      profileByKey.set(key, candidate);
    }
  });
  const keys = new Set([...ordersByKey.keys(), ...profileByKey.keys()]);
  const docs = [];
  keys.forEach(key => {
    const next = buildStatsDoc(key, ordersByKey.get(key) || {}, profileByKey.get(key) || null);
    if (next) docs.push(next);
  });
  const stale = statsSnap.docs.filter(doc => !keys.has(doc.id));
  log(`Pedidos: ${ordersSnap.size} · Perfiles: ${customersSnap.size} · Clientes resumidos: ${docs.length} · Documentos viejos a borrar: ${stale.length}`);
  if (dryRun) return { orders: ordersSnap.size, profiles: customersSnap.size, customers: docs.length, deleted: stale.length, sample: docs.slice(0, 3) };

  let batch = db.batch();
  let pending = 0;
  const flush = async () => { if (pending) { await batch.commit(); batch = db.batch(); pending = 0; } };
  for (const docData of docs) {
    batch.set(db.collection(STATS).doc(docData.key), docData);
    if (++pending >= 400) await flush();
  }
  for (const doc of stale) {
    batch.delete(doc.ref);
    if (++pending >= 400) await flush();
  }
  await flush();
  return { orders: ordersSnap.size, profiles: customersSnap.size, customers: docs.length, deleted: stale.length };
}

module.exports = {
  STATS, canonicalPhone, normalizeName, keyForOrder, keyForProfile, orderSummary, profileSummary,
  buildStatsDoc, onOrderWritten, onCustomerWritten, rebuildAll,
};
