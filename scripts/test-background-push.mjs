import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('background FCM renders one notification and preserves admin/seller destinations', async () => {
  const listeners = {};
  const notifications = [];
  let receive;
  const context = {
    self: { location: { origin: 'https://ryyco.com' }, addEventListener(name, callback) { listeners[name] = callback; },
      registration: { showNotification: async (title, options) => notifications.push({ title, options }) } },
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage(callback) { receive = callback; } }) },
    importScripts() {}, Notification: { permission: 'granted' }, console, URL
  };
  vm.runInNewContext(readFileSync(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8'), context);
  const data = { role: 'admin', isSeller: 'false', storeOwnerId: 'store1', orderId: 'order1' };
  await receive({ data });
  assert.equal(notifications[0].options.data.url, '/?view=admin&tab=orders');
  listeners.push({ data: { json: () => ({ from: 'firebase', data }) }, waitUntil() { throw new Error('Duplicate FCM notification'); } });
  assert.equal(notifications.length, 1);
  await receive({ notification: { title: 'Already handled by SDK' }, data });
  assert.equal(notifications.length, 1);
  await receive({ data: { ...data, role: 'seller', isSeller: 'true' } });
  assert.equal(notifications[1].options.data.url, '/?view=dashboard&tab=orders');
});

test('Node sender delivers to both roles without a browser and skips already delivered orders', async () => {
  const records = new Map([
    ['orders/order1', { status: 'pending', storeOwnerId: 'store1', orderNumber: 123 }],
    ['admin_fcm_tokens/admin', { active: true, token: 'a'.repeat(50) }],
    ['seller_fcm_tokens/store', { active: true, storeOwnerId: 'store1', token: 'b'.repeat(50) }],
    ['seller_fcm_tokens/other', { active: true, storeOwnerId: 'other', token: 'c'.repeat(50) }]
  ]);
  const snapshot = key => ({ id: key.split('/')[1], ref: ref(key), exists: records.has(key),
    get: field => records.get(key)?.[field], data: () => records.get(key) });
  const ref = key => ({ get: async () => snapshot(key), set: async value => records.set(key, value),
    delete: async () => records.delete(key), update: async value => records.set(key, { ...records.get(key), ...value }) });
  let listener;
  const db = {
    collection(name) { return {
      doc: id => ref(`${name}/${id}`),
      where(field, operator, value) { return {
        get: async () => ({ docs: [...records.keys()].filter(key => key.startsWith(`${name}/`) && records.get(key)[field] === value).map(snapshot) }),
        onSnapshot(callback) { listener = callback; }
      }; }
    }; },
    runTransaction: callback => callback({ get: item => item.get(), create: (item, value) => item.set(value), set: (item, value) => item.set(value) })
  };
  const sent = [];
  const modules = {
    'firebase-admin/app': { initializeApp() {}, cert() {}, applicationDefault() {} },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => 1 } },
    'firebase-admin/messaging': { getMessaging: () => ({ send: async message => sent.push(message) }) },
    'node:crypto': await import('node:crypto')
  };
  const code = ts.transpileModule(readFileSync(new URL('../server/orderPush.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const context = { exports: {}, require: name => modules[name], console,
    process: { env: { GOOGLE_APPLICATION_CREDENTIALS: 'test-fixture' } }, setInterval: () => ({ unref() {} }) };
  vm.runInNewContext(code, context);
  await context.exports.startOrderPush();
  const event = { docChanges: () => [{ type: 'added', doc: snapshot('orders/order1') }] };
  listener(event);
  for (let i = 0; i < 100; i++) await Promise.resolve();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(message => message.data.role), ['admin', 'seller']);
  assert.equal(sent[1].token, 'b'.repeat(50));
  listener(event);
  for (let i = 0; i < 100; i++) await Promise.resolve();
  assert.equal(sent.length, 2);
});
