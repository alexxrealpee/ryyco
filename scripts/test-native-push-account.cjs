const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup(bindings = {}, options = {}) {
  const storage = new Map(Object.entries(bindings));
  const calls = [];
  let rotated = false;
  const modules = {
    './nativePush': {
      isNativePush: () => true, nativePushPermission: () => 'granted',
      clearNativePushBinding: async () => {
        calls.push('invalidate');
        if (options.failInvalidation) throw Error('No se pudo invalidar el token anterior');
        rotated = true;
      },
      registerNativePush: async persist => {
        calls.push('register');
        const token = rotated ? 'fresh-token' : 'original-token';
        await persist(token);
        return token;
      },
    },
    'firebase/messaging': {},
    'firebase/firestore': {
      doc: (_, collection, id) => `${collection}/${id}`,
      deleteDoc: async ref => { calls.push(['delete', ref]); if (options.denyDelete) throw Error('permission-denied'); },
      setDoc: async (ref, data) => { calls.push(['save', ref, data]); },
    },
    './firebase': { db: {}, auth: { currentUser: { uid: 'authenticated-driver' } } },
  };
  const context = { exports: {}, require: name => modules[name], window: {},
    __importMeta: { env: {} }, navigator: { userAgent: 'Android test' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  };
  const source = fs.readFileSync('src/lib/fcmNotifications.ts', 'utf8').replaceAll('import.meta', '__importMeta');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, context);
  return { api: context.exports, calls, storage };
}

test('seller to driver invalidates old token before denied cleanup and saves a fresh native token', async () => {
  const t = setup({ ryyco_seller_native_token: 'old-seller-token', ryyco_seller_native_owner: 'seller' }, { denyDelete: true });
  const result = await t.api.requestDriverFCMPermission({ id: 'driver' });
  assert.equal(result.success, true);
  assert.equal(result.token, 'fresh-token');
  assert.equal(t.calls[0], 'invalidate');
  const saved = t.calls.find(call => call[0] === 'save');
  assert.equal(saved[1], 'driver_fcm_tokens/fresh-token');
  assert.equal(saved[2].driverId, 'driver');
  assert.equal(saved[2].device, 'android');
  assert.equal(t.storage.has('ryyco_seller_native_token'), false);
  assert.equal(t.storage.get('ryyco_driver_native_owner'), 'driver');
});

test('different driver or legacy unknown owner rotates; same owner refresh preserves token', async () => {
  for (const owner of ['old-driver', undefined, 'driver']) {
    const bindings = { ryyco_driver_native_token: 'original-token' };
    if (owner) bindings.ryyco_driver_native_owner = owner;
    const t = setup(bindings);
    const result = await t.api.requestDriverFCMPermission({ id: 'driver' });
    assert.equal(result.success, true);
    assert.equal(t.calls.includes('invalidate'), owner !== 'driver');
    assert.equal(result.token, owner === 'driver' ? 'original-token' : 'fresh-token');
  }
});

test('failed invalidation prevents rebinding and preserves old association for retry', async () => {
  const t = setup({ ryyco_driver_native_token: 'old-token', ryyco_driver_native_owner: 'old-driver' }, { failInvalidation: true });
  const result = await t.api.requestDriverFCMPermission({ id: 'driver' });
  assert.equal(result.success, false);
  assert.equal(t.calls.includes('register'), false);
  assert.equal(t.storage.get('ryyco_driver_native_token'), 'old-token');
});
