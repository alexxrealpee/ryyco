import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/firebase.ts', import.meta.url), 'utf8');
const names = new Set(['fetchProfileByUid', 'fetchProductsAllState', 'fetchOrders', 'saveProduct', 'isUsernameAvailable', 'cacheServerProducts']);
const ast = ts.createSourceFile('firebase.ts', source, ts.ScriptTarget.Latest, true);
const extracted = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n');
const code = ts.transpileModule(extracted, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(overrides = {}) {
  const writes = [];
  const context = { exports: {}, console: { warn() {}, error() {} }, db: {},
    doc: (...args) => args, collection: (...args) => args, query: (...args) => args, where: (...args) => args,
    localStorage: { getItem() { return null; }, setItem(...args) { writes.push(args); } },
    deduplicateOrders: value => value, deduplicateProducts: value => value,
    sanitizeUsername: value => value.toLowerCase(), cleanUndefined: value => value,
    ...overrides };
  vm.runInNewContext(code, context);
  return { ...context.exports, cacheServerProducts: context.cacheServerProducts, writes };
}

test('new device loads canonical profile identity from server, without local cache', async () => {
  const api = setup({ getDocFromServer: async () => ({ exists: () => true, id: 'real-owner', data: () => ({ uid: 'stale-field', username: 'store' }) }) });
  const profile = await api.fetchProfileByUid('real-owner', { requireServer: true });
  assert.equal(profile.uid, 'real-owner');
  assert.equal(profile.username, 'store');
});

test('failed profile read does not turn into a missing account', async () => {
  const api = setup({ getDocFromServer: async () => { throw new Error('unavailable'); } });
  await assert.rejects(api.fetchProfileByUid('owner', { requireServer: true }), /no necesitas crear otra cuenta/);
  assert.equal(api.writes.length, 0);
});

test('new device distinguishes failed products/orders requests from empty cloud results', async () => {
  const failed = setup({ getDocsFromServer: async () => { throw new Error('permission-denied'); } });
  await assert.rejects(failed.fetchProductsAllState('owner', { requireServer: true }), /sincronizar los productos/);
  await assert.rejects(failed.fetchOrders('owner', { requireServer: true }), /sincronizar los pedidos/);
  const empty = setup({ getDocsFromServer: async () => ({ forEach() {} }) });
  assert.equal((await empty.fetchProductsAllState('owner', { requireServer: true })).length, 0);
  assert.equal((await empty.fetchOrders('owner', { requireServer: true })).length, 0);
});

test('failed product write is not reported as a successful local-only save', async () => {
  const api = setup({ setDoc: async () => { throw new Error('permission-denied'); } });
  await assert.rejects(api.saveProduct({ id: 'product1', userId: 'owner', name: 'Food', price: 10 }), /guardar el producto en el servidor/);
  assert.equal(api.writes.length, 0);
});

test('offline device cannot claim that an existing username is available', async () => {
  const api = setup({ getDocsFromServer: async () => { throw new Error('unavailable'); } });
  await assert.rejects(api.isUsernameAvailable('broasterking'), /verificar el nombre/);
});

test('refresh preserves local-only products in a separate recovery backup', () => {
  const storage = new Map([['linnk_products_owner', JSON.stringify([{ id: 'local-only', name: 'Draft' }])]]);
  const api = setup({ localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  api.cacheServerProducts('owner', [{ id: 'cloud-product' }]);
  assert.equal(JSON.parse(storage.get('linnk_products_unsynced_backup_owner'))[0].id, 'local-only');
  assert.equal(JSON.parse(storage.get('linnk_products_owner'))[0].id, 'cloud-product');
});
