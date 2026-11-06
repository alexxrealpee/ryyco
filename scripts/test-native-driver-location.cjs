const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function setup() {
  const effects = [], calls = [], errors = [];
  const plugin = { configure: async data => calls.push({ type: 'configure', data }), stop: async () => calls.push({ type: 'stop' }),
    status: async () => ({ running: false, error: '', lastUpdate: 0 }) };
  const auth = { currentUser: { uid: 'driver-auth', refreshToken: 'test-only-refresh', getIdToken: async () => 'test-only-id' } };
  let authCallback;
  const modules = {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' }, registerPlugin: () => plugin },
    'firebase/auth': { onAuthStateChanged: (_, fn) => { authCallback = fn; fn(); return () => {}; } },
    react: { useState: initial => [initial, value => { if (typeof value === 'string') errors.push(value); }], useEffect: fn => effects.push(fn) },
    './firebase': { auth, app: { options: { apiKey: 'test-public-key' } } }
  };
  const context = { exports: {}, require: name => modules[name], setInterval: () => 1, clearInterval: () => {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/nativeDriverLocation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, context);
  return { api: context.exports, calls, errors, auth, plugin, effects, changeAuth: () => authCallback?.() };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('available driver transmits without an order and unmount does not stop native service', async () => {
  const t = setup();
  t.api.useNativeDriverLocation({ id: 'd', status: 'approved' }, true, null, true);
  const cleanups = t.effects.map(fn => fn()); await tick();
  assert.equal(t.calls[0].type, 'configure'); assert.equal(t.calls[0].data.orderId, '');
  cleanups.forEach(fn => fn?.()); await tick();
  assert(!t.calls.some(call => call.type === 'stop'));
  await t.api.stopNativeDriverLocation(); assert.equal(t.calls.at(-1).type, 'stop');
});
test('unavailable driver retains active delivery; finished delivery and unapproved driver stop GPS', async () => {
  for (const [status, order, expected] of [
    ['approved', { id: 'o', status: 'delivering', deliveryStep: 'picked_up' }, 'configure'],
    ['approved', { id: 'o', status: 'delivered', deliveryStep: 'delivered' }, 'stop'],
    ['approved', { id: 'o', status: 'cancelled', deliveryStep: 'cancelled' }, 'stop'],
    ['suspended', { id: 'o', status: 'delivering' }, 'stop']
  ]) {
    const t = setup(); t.api.useNativeDriverLocation({ id: 'd', status }, false, order, true);
    t.effects.forEach(fn => fn()); await tick();
    assert.equal(t.calls[0].type, expected);
    if (expected === 'configure') assert.equal(t.calls[0].data.orderId, 'o');
  }
});
test('hydration does not stop an ongoing service, logout stops it, permission failure stays visible', async () => {
  const pending = setup(); pending.api.useNativeDriverLocation({ id: 'd', status: 'approved' }, false, null, false);
  pending.effects.forEach(fn => fn()); await tick(); assert.equal(pending.calls.length, 0);
  const loggedOut = setup(); loggedOut.auth.currentUser = null;
  loggedOut.api.useNativeDriverLocation({ id: 'd', status: 'approved' }, true, null, true);
  loggedOut.effects.forEach(fn => fn()); await tick(); assert.equal(loggedOut.calls[0].type, 'stop');
  const denied = setup(); denied.plugin.configure = async () => { throw Error('permission denied'); };
  denied.api.useNativeDriverLocation({ id: 'd', status: 'approved' }, true, null, true);
  denied.effects.forEach(fn => fn()); await tick(); assert(denied.errors.some(error => error.includes('ubicación precisa')));
});
