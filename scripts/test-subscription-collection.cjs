const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require: name => dependencies[name], Date, Intl });
  return exports;
}
const state = load('src/lib/subscriptionCollectionState.ts');
// Exercise the application's existing eligibility function, not a test reimplementation.
const firebaseSource = fs.readFileSync('src/lib/firebase.ts', 'utf8');
const ast = ts.createSourceFile('firebase.ts', firebaseSource, ts.ScriptTarget.Latest, true);
const eligibilityNode = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'isSubscriptionExpiredOrSuspended');
const eligibilityExports = {};
vm.runInNewContext(ts.transpileModule(eligibilityNode.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: eligibilityExports, Date });

const expired = { uid: 'restaurant', subscriptionStatus: 'active', subscriptionPaidUntil: '2026-01-01T00:00:00Z' };
function harness() {
  const documents = new Map([['profiles/restaurant', structuredClone(expired)]]);
  let id = 0, clock = Date.now(), queue = Promise.resolve();
  const path = (...parts) => parts.filter(x => x !== null).map(x => x.path || x).join('/');
  const snapshot = key => ({ exists: () => documents.has(key), data: () => structuredClone(documents.get(key)) });
  const sdk = {
    collection: path,
    doc: (...parts) => {
      const value = parts.length === 1 ? `${path(...parts)}/auto-${++id}` : path(...parts);
      return { path: value, id: value.split('/').at(-1) };
    },
    serverTimestamp: () => ({ seconds: clock / 1000 }),
    // Serialized commits model transaction retry isolation; no actual Firebase writes.
    runTransaction: (_, run) => {
      const operation = queue.then(async () => {
        const writes = [];
        const result = await run({ get: async key => snapshot(key.path), set: (key, value) => writes.push([key.path, value]),
          update: (key, value) => writes.push([key.path, { ...documents.get(key.path), ...value }]) });
        for (const [key, value] of writes) documents.set(key, structuredClone(value));
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
  const service = load('src/lib/subscriptionCollection.ts', { 'firebase/firestore': sdk,
    './firebase': { auth: { currentUser: { uid: 'admin' } }, db: null, ...eligibilityExports },
    './subscriptionCollectionState': state });
  return { documents, act: service.updateCollectionFollowup,
    summary: () => documents.get('subscription_collection_followups/restaurant'),
    advance: ms => { clock += ms; } };
}

test('24 hour boundary uses persisted timestamp and does not depend on open page', () => {
  const saved = { lastConfirmedAt: { seconds: 1000 } };
  assert.equal(state.collectionVisualState(true, saved, 1000000 + 86400000 - 1), 'sent');
  assert.equal(state.collectionVisualState(true, saved, 1000000 + 86400000), 'due');
  assert.equal(state.collectionVisualState(false, saved, 1000000 + 864000000), 'inactive');
  assert.equal(state.collectionVisualState(true, undefined), 'pending');
});

test('cycle is stable while overdue and changes on renewal; old records are ignored', () => {
  assert.equal(state.collectionPeriod(expired), `paid-${Date.parse(expired.subscriptionPaidUntil)}`);
  const renewed = { ...expired, subscriptionPaidUntil: '2026-02-01T00:00:00Z' };
  assert.notEqual(state.collectionPeriod(renewed), state.collectionPeriod(expired));
  assert.equal(state.currentCollection(renewed, { periodId: state.collectionPeriod(expired) }), undefined);
  assert.equal(state.collectionPeriod({ uid: 'x' }), 'legacy-expiration');
});

test('opening WhatsApp creates only an attempt; concurrent double click reuses it', async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.act(expired, 'attempt'), h.act(expired, 'attempt')]);
  assert.equal(a, b);
  assert.equal(h.summary().confirmedCount, 0);
  assert.equal(h.summary().lastConfirmedAt, null);
  assert.equal([...h.documents.keys()].filter(k => k.includes('/messages/')).length, 1);
});

test('confirmation is idempotent across devices and persists server timestamp', async () => {
  const h = harness();
  const attempt = await h.act(expired, 'attempt');
  await Promise.all([h.act(expired, 'confirm', attempt), h.act(expired, 'confirm', attempt)]);
  assert.equal(h.summary().confirmedCount, 1);
  assert.equal(h.summary().reminderCount, 0);
  assert.equal(h.summary().pendingAttemptId, null);
  assert.ok(h.summary().lastConfirmedAt.seconds);
  assert.equal(h.summary().status, 'sent');
});

test('another confirmed reminder resets timestamp, undo restores prior message and keeps audit', async () => {
  const h = harness();
  const first = await h.act(expired, 'attempt');
  await h.act(expired, 'confirm', first);
  const previous = h.summary().lastConfirmedAt.seconds;
  h.advance(86400001);
  const second = await h.act(expired, 'attempt');
  await h.act(expired, 'confirm', second);
  assert.equal(h.summary().confirmedCount, 2);
  assert.equal(h.summary().reminderCount, 1);
  assert.ok(h.summary().lastConfirmedAt.seconds > previous);
  await assert.rejects(h.act(expired, 'undo', first), /último envío/);
  await Promise.all([h.act(expired, 'undo', second), h.act(expired, 'undo', second)]);
  assert.equal(h.summary().confirmedCount, 1);
  assert.equal(h.summary().lastConfirmedAt.seconds, previous);
  const event = [...h.documents].find(([key]) => key.endsWith(`/messages/${second}`))[1];
  assert.equal(event.status, 'corrected');
  assert.ok(event.correctedAt.seconds);
  await assert.rejects(h.act(expired, 'confirm', second), /ya cambió/);
  await h.act(expired, 'undo', first);
  assert.equal(h.summary().confirmedCount, 0);
  assert.equal(h.summary().lastConfirmedAt, null);
  assert.equal(h.summary().reminderCount, 0);
});

test('actual button displays sent, due, unpaid and synchronized states without changing active subscriptions', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const ui = load('src/components/SubscriptionCollectionFollowup.tsx', {
    react: React, 'firebase/auth': {}, 'firebase/firestore': {},
    '../lib/firebase': eligibilityExports, '../lib/subscriptionCollection': {},
    '../lib/subscriptionCollectionState': state,
  });
  const now = Date.now();
  const tracking = { ready: true, now, records: {}, error: '', retry() {} };
  const render = (t, user = expired) => renderToStaticMarkup(React.createElement(ui.SubscriptionCollectionButton, { user, tracking: t, onClick() {} }));
  assert.match(render(tracking), /COBRAR/);
  const saved = { periodId: state.collectionPeriod(expired), lastConfirmedAt: { seconds: now / 1000 }, confirmedCount: 1 };
  const sent = { ...tracking, records: { restaurant: saved } };
  assert.match(render(sent), /COBRO ENVIADO/);
  assert.match(render({ ...sent, now: now + 86400000 }), /VOLVER A COBRAR/);
  assert.doesNotMatch(render({ ...sent, ready: false }), /COBRO ENVIADO|VOLVER A COBRAR/);
  assert.doesNotMatch(render(sent, { ...expired, subscriptionPaidUntil: '2099-01-01' }), /COBRO ENVIADO|VOLVER A COBRAR/);
});

test('payment before confirmation blocks stale action without modifying subscription', async () => {
  const h = harness();
  const attempt = await h.act(expired, 'attempt');
  const paid = { ...expired, subscriptionPaidUntil: '2099-01-01T00:00:00Z' };
  h.documents.set('profiles/restaurant', paid);
  await assert.rejects(h.act(expired, 'confirm', attempt), /suscripción cambió/);
  assert.deepEqual(h.documents.get('profiles/restaurant'), paid);
  assert.equal(h.summary().confirmedCount, 0);
});

test('new expiration creates clean cycle and preserves previous cycle and messages', async () => {
  const h = harness();
  const first = await h.act(expired, 'attempt');
  await h.act(expired, 'confirm', first);
  const next = { ...expired, subscriptionPaidUntil: '2026-02-01T00:00:00Z' };
  h.documents.set('profiles/restaurant', next);
  const second = await h.act(next, 'attempt');
  assert.equal(h.summary().confirmedCount, 0);
  await h.act(next, 'confirm', second);
  assert.equal(h.summary().confirmedCount, 1);
  const oldCycle = h.documents.get(`subscription_collection_followups/restaurant/periods/${state.collectionPeriod(expired)}`);
  assert.equal(oldCycle.confirmedCount, 1);
  assert.equal([...h.documents.keys()].filter(k => k.includes('/messages/')).length, 2);
});

test('active, under review, trial and suspended without overdue eligibility are not tracked', async () => {
  for (const subscriptionStatus of ['active', 'trial', 'under_review', 'suspended', 'pending_payment']) {
    const h = harness();
    const user = { uid: 'restaurant', subscriptionStatus };
    h.documents.set('profiles/restaurant', user);
    await assert.rejects(h.act(user, 'attempt'), /ya no está vencida/);
    assert.equal(h.summary(), undefined);
  }
});
