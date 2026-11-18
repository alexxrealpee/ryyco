const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => deps[name] || require(name), module, module.exports);
  return module.exports;
}
const logic = load('src/lib/driverPerformance.ts');
const { calculateDriverPerformance: calculate, selectPerformanceDrivers: select, buildDriverRankings: rank } = logic;
const delivered = (id, changes = {}) => ({ id, status: 'delivered', deliveryDriverId: 'a', ...changes });
const review = (id, orderId, stars, changes = {}) => ({ id, orderId, driverId: 'a', stars, createdAt: '2026-11-01', ...changes });
const driver = (id, changes = {}) => ({ id, firstName: id, lastName: 'Pérez', docNumber: `CC-${id}`, status: 'approved', isAvailable: true, ...changes });
const stat = (completed, average, ratingCount) => ({ completed, average, ratingCount, checkedAt: 100 });

test('counts completed orders once; excludes cancelled, rejected, pending and reassigned orders', () => {
  const orders = [delivered('1'), delivered('1'), delivered('2', { deliveryDriverId: '', driverId: 'a' }),
    delivered('3', { status: 'cancelled', deliveryStep: 'delivered' }),
    delivered('4', { status: 'pending', deliveryStep: 'delivered' }),
    delivered('5', { status: 'rejected', deliveryStep: 'delivered' }),
    delivered('6', { deliveryDriverId: 'b', driverId: 'a' }),
    delivered('7', { status: 'delivering' }),
    delivered('8', { status: 'delivering', deliveryStep: 'delivered' })];
  assert.equal(calculate('a', orders, []).completed, 3);
});

test('reviews require a matching completed order, valid stars and unique order ID', () => {
  const result = calculate('a', [delivered('1'), delivered('2'), delivered('3')], [
    review('r1', '1', 4), review('r2', '1', 5, { createdAt: '2026-11-02' }),
    review('r3', '2', 5), review('r4', 'missing', 5), review('r5', '3', 6),
    review('r6', '3', NaN), review('r7', '3', 3, { driverId: 'b' }),
  ], 123);
  assert.deepEqual(result, { completed: 3, ratingCount: 2, average: 4.5, checkedAt: 123 });
  assert.equal(calculate('a', [], []).average, null);
});

test('availability, approval, document/name search and delivery ordering compose without mutating input', () => {
  const drivers = [driver('a'), driver('b'), driver('c', { isAvailable: false }), driver('d', { status: 'pending' })];
  const stats = { a: stat(12, 4, 2), b: stat(40, 4.9, 25), c: stat(90, 5, 1), d: stat(100, 5, 2) };
  assert.deepEqual(select(drivers, stats, 'pérez', 'approved', 'available', 'deliveries').map(d => d.id), ['b', 'a']);
  assert.deepEqual(select(drivers, stats, '', 'approved', 'available', 'deliveries', true).map(d => d.id), ['a', 'b']);
  assert.deepEqual(select(drivers, stats, 'CC-b', 'all', 'all', 'rating').map(d => d.id), ['b']);
  assert.deepEqual(select(drivers, stats, 'absent', 'all', 'all', 'rating'), []);
  assert.deepEqual(drivers.map(d => d.id), ['a', 'b', 'c', 'd']);
});

test('real average breaks ties by evaluation count; unknown statistics always sort last', () => {
  const drivers = ['z', 'a', 'b', 'c'].map(id => driver(id));
  const stats = { a: stat(20, 4.9, 10), b: stat(100, 4.9, 80), c: stat(0, null, 0) };
  assert.deepEqual(select(drivers, stats, '', 'all', 'all', 'rating').map(d => d.id), ['b', 'a', 'c', 'z']);
  assert.equal(select(drivers, stats, '', 'all', 'all', 'deliveries', true).at(-1).id, 'z');
});

test('ranking excludes non-approved drivers, honors minimum and adjusts small samples', () => {
  const drivers = [driver('a'), driver('b'), driver('c'), driver('d', { status: 'suspended' })];
  const stats = { a: stat(1, 5, 1), b: stat(100, 4.9, 100), c: stat(100, 3, 100), d: stat(500, 5, 500) };
  assert.deepEqual(rank(drivers, stats, 5).ratings.map(r => r.driver.id), ['b', 'c']);
  assert.equal(rank(drivers, stats, 1).ratings[0].driver.id, 'b');
  assert.equal(rank(drivers, stats, 200).ratings.length, 0);
  assert.equal(rank(drivers, stats).deliveries.some(d => d.id === 'd'), false);
  const many = Array.from({ length: 15 }, (_, n) => driver(String(n)));
  assert.equal(rank(many, Object.fromEntries(many.map(d => [d.id, stat(10, 4, 10)]))).ratings.length, 10);
});

function dataHarness() {
  const auth = { currentUser: { uid: 'admin' } };
  const stored = new Map();
  global.sessionStorage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  let calls = 0, fail = false;
  const api = {
    collection: (_, path) => path, where: (field, op, value) => ({ field, value }), query: (path, filter) => ({ path, filter }),
    getDocsFromServer: async ({ path, filter }) => {
      calls++;
      if (fail) throw Error('offline');
      const rows = path === 'driver_ratings' ? [review('r1', '1', 4)] : [delivered('1')];
      assert.equal(filter.value, 'a');
      return { docs: rows.map(({ id, ...rest }) => ({ id, data: () => rest })) };
    },
  };
  const create = () => load('src/lib/driverPerformanceData.ts', { 'firebase/firestore': api, './firebase': { auth, db: {} }, './driverPerformance': logic });
  return { create, auth, stored, calls: () => calls, fail: value => { fail = value; } };
}

test('parallel requests deduplicate, session cache survives reload, force refresh and expiry query again', async () => {
  const h = dataHarness();
  const data = h.create();
  const [a, b] = await Promise.all([data.fetchDriverPerformance('a'), data.fetchDriverPerformance('a')]);
  assert.equal(h.calls(), 3);
  assert.equal(a.completed, 1);
  assert.deepEqual(a, b);
  await h.create().fetchDriverPerformance('a');
  assert.equal(h.calls(), 3);
  await data.fetchDriverPerformance('a', true);
  assert.equal(h.calls(), 6);
  for (const [key, value] of h.stored) h.stored.set(key, JSON.stringify({ ...JSON.parse(value), checkedAt: Date.now() - 600001 }));
  await h.create().fetchDriverPerformance('a');
  assert.equal(h.calls(), 9);
});

test('failed reads remain unknown, retry succeeds, and cache is isolated by administrator', async () => {
  const h = dataHarness();
  const data = h.create();
  h.fail(true);
  await assert.rejects(data.fetchDriverPerformance('a'), /offline/);
  assert.equal(h.stored.size, 0);
  h.fail(false);
  await data.fetchDriverPerformance('a');
  h.auth.currentUser = { uid: 'other-admin' };
  await data.fetchDriverPerformance('a');
  assert.equal(h.calls(), 9);
  h.auth.currentUser = null;
  await assert.rejects(data.fetchDriverPerformance('a'), /Inicia sesión/);
});
