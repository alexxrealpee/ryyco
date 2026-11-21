// Pruebas de functions/customerRewards.cjs con una base de datos en memoria.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// firebase-functions solo se usa para HttpsError.
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) { return req === 'firebase-functions/v2/https' ? 'mock-https' : origResolve.call(this, req, ...rest); };
require.cache['mock-https'] = { id: 'mock-https', filename: 'mock-https', loaded: true, exports: { HttpsError } };
const rewards = require(path.resolve(process.argv[2] || path.join(__dirname, '..', 'functions', 'customerRewards.cjs')));

function makeDb(initial) {
  const cols = {};
  for (const [c, docs] of Object.entries(initial)) cols[c] = new Map(Object.entries(docs).map(([k, v]) => [k, structuredClone(v)]));
  const col = (c) => (cols[c] ||= new Map());
  const snap = (c, id) => { const d = col(c).get(id); return { id, exists: !!d, ref: ref(c, id), data: () => d && structuredClone(d), get: (f) => d && d[f] }; };
  const ref = (c, id) => ({ id, col: c, get: async () => snap(c, id), update: async (u) => Object.assign(col(c).get(id), u), set: async (v) => col(c).set(id, structuredClone(v)) });
  const query = (c, filters = [], lim = Infinity) => ({
    where: (f, op, v) => query(c, [...filters, [f, op, v]], lim),
    limit: (n) => query(c, filters, n),
    get: async () => {
      const docs = [...col(c).keys()].filter((id) => filters.every(([f, op, v]) => { const x = col(c).get(id)[f]; return op === 'in' ? v.includes(x) : x === v; })).slice(0, lim).map((id) => snap(c, id));
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  });
  return {
    cols,
    collection: (c) => ({ doc: (id) => ref(c, id), ...query(c) }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, u) => Object.assign(col(r.col).get(r.id), u), set: (r, v) => col(r.col).set(r.id, structuredClone(v)) }),
    batch: () => { const ops = []; return { update: (r, u) => ops.push(() => Object.assign(col(r.col).get(r.id), u)), commit: async () => ops.forEach((o) => o()) }; },
  };
}

(async () => {
  const db = makeDb({
    customers: {
      '3001111111': { phone: '3001111111', name: 'Ana Pérez', authUid: 'uidAna', points: 1000, ryycos: 1000, spinsAvailable: 1, movements: [] },
      '3002222222': { phone: '3002222222', name: 'Beto Ruiz', authUid: '', points: 200, ryycos: 200, spinsAvailable: 0, movements: [] },
    },
    orders: {
      o1: { customerPhone: '+573002222222', customerUid: '', status: 'confirmed', totalAmount: 20000, orderNumber: 7 },
      o2: { customerPhone: '+573001111111', customerUid: 'uidAna', status: 'shipped', totalAmount: 15000, orderNumber: 8 },
    },
  });
  const as = (uid, data, email) => ({ auth: uid ? { uid, token: { email } } : null, data });

  // checkPhone
  assert.deepEqual(await rewards.checkPhone(db, as(null, { phone: '+57 300 111 1111' })), { exists: true, hasAccount: true, firstName: 'Ana' });
  assert.deepEqual(await rewards.checkPhone(db, as(null, { phone: '3009999999' })), { exists: false });

  // claimProfile: perfil sin dueño -> se vincula y adopta pedidos huérfanos
  const c = await rewards.claimProfile(db, as('uidBeto', { phone: '3002222222' }));
  assert.equal(c.claimed, true);
  assert.equal(db.cols.customers.get('3002222222').authUid, 'uidBeto');
  assert.equal(db.cols.orders.get('o1').customerUid, 'uidBeto');
  // otra cuenta no puede quitárselo
  await assert.rejects(rewards.claimProfile(db, as('uidMalo', { phone: '3002222222' })), /vinculado a otra cuenta/);
  await assert.rejects(rewards.claimProfile(db, as(null, { phone: '3002222222' })), /Inicia sesión/);

  // transfer: Ana -> Beto 300
  const r = await rewards.transfer(db, as('uidAna', { recipientPhone: '3002222222', amount: 300 }));
  assert.equal(r.senderBalanceAfter, 700);
  assert.equal(db.cols.customers.get('3002222222').points, 500);
  assert.equal(db.cols.customers.get('3001111111').movements[0].type, 'transfer_sent');
  assert.equal(db.cols.ryyco_transactions.size, 1);
  await assert.rejects(rewards.transfer(db, as('uidAna', { recipientPhone: '3002222222', amount: 999999 })), /Saldo insuficiente/);
  await assert.rejects(rewards.transfer(db, as('uidAna', { recipientPhone: '3001111111', amount: 1 })), /propio número/);
  await assert.rejects(rewards.transfer(db, as('uidAna', { recipientPhone: '3002222222', amount: -5 })), /mínima/);

  // findRecipient: solo primer nombre
  assert.deepEqual(await rewards.findRecipient(db, as('uidAna', { phone: '3002222222' })), { found: true, name: 'Beto', phone: '3002222222' });

  // spin: Ana tiene 1 giro
  assert.deepEqual(await rewards.spin(db, as('uidAna', {})), { result: 'lose', spinsAvailable: 0 });
  await assert.rejects(rewards.spin(db, as('uidAna', {})), /No tienes giros/);

  // awardOnDelivered: solo al pasar a delivered, una vez
  const ev = (id, before, after) => ({ data: { before: { data: () => before }, after: { data: () => after, ref: db.collection('orders').doc(id) } } });
  const o2 = db.cols.orders.get('o2');
  await rewards.awardOnDelivered(db, ev('o2', { ...o2 }, { ...o2, status: 'confirmed' }));
  assert.equal(db.cols.customers.get('3001111111').points, 700, 'no premia si no se entrega');
  db.cols.orders.get('o2').status = 'delivered';
  await rewards.awardOnDelivered(db, ev('o2', { ...o2, status: 'shipped' }, { ...db.cols.orders.get('o2') }));
  assert.equal(db.cols.customers.get('3001111111').points, 1200);
  assert.equal(db.cols.customers.get('3001111111').spinsAvailable, 1);
  assert.equal(db.cols.customers.get('3001111111').totalOrdersCount, 1);
  await rewards.awardOnDelivered(db, ev('o2', { ...o2, status: 'shipped' }, { ...db.cols.orders.get('o2') }));
  assert.equal(db.cols.customers.get('3001111111').points, 1200, 'no premia dos veces');

  console.log('PASS customerRewards: checkPhone, claimProfile (+pedidos huérfanos), transfer, findRecipient, spin, awardOnDelivered');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
