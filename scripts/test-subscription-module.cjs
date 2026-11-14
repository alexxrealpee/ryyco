const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/lib/firebase.ts', 'utf8');
const ast = ts.createSourceFile('firebase.ts', source, ts.ScriptTarget.Latest, true);
const names = ['checkIsStoreClosed', 'getSubscriptionAnchorDay', 'addMonthsPreservingAnchor', 'calculateNextExpirationDate', 'getSubscriptionDaysRemaining', 'isSubscriptionExpiredOrSuspended'];
const extracted = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(ast)).join('\n');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(extracted, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject, Date, console, getStoreOperatingScheduleInfo: () => ({ isClosedBySchedule: false }) });
const f = exportsObject;

test('expired paid period stays open and remains flagged for collection', () => {
  const p = { subscriptionStatus: 'active', subscriptionPaidUntil: '2025-01-01', isClosed: false };
  assert.equal(f.isSubscriptionExpiredOrSuspended(p).isExpired, true);
  assert.equal(f.checkIsStoreClosed(p), false);
  assert.equal(f.checkIsStoreClosed({ ...p, subscriptionStatus: 'expired' }), false);
  assert.equal(f.checkIsStoreClosed({ ...p, subscriptionStatus: 'expired', isClosed: true }), true);
});
test('valid payment overrides old trial; manual closing and suspension remain authoritative', () => {
  const p = { subscriptionStatus: 'active', subscriptionPaidUntil: '2099-01-01', subscriptionTrialExpires: '2020-01-01' };
  assert.equal(f.checkIsStoreClosed(p), false);
  assert.equal(f.checkIsStoreClosed({ ...p, isClosed: true }), true);
  assert.equal(f.checkIsStoreClosed({ ...p, suspended: true }), true);
  assert.equal(f.checkIsStoreClosed({ ...p, subscriptionStatus: 'expired' }), false);
});
test('first renewal for old registration produces a future paid period', () => {
  const result = f.calculateNextExpirationDate({ createdAt: '2020-01-15T12:00:00Z', subscriptionAnchorDay: 15 }, 1);
  assert.ok(result.nextPaidUntil.getTime() > Date.now());
  assert.equal(result.anchorDay, 15);
  assert.equal(result.nextPaidUntil.getDate(), 15);
});
test('renewal preserves future balance, end-of-month anchor and negative adjustment', () => {
  const user = { subscriptionPaidUntil: '2099-01-31T12:00:00Z', subscriptionAnchorDay: 31 };
  const next = f.calculateNextExpirationDate(user, 1).nextPaidUntil;
  assert.equal(next.getMonth(), 1);
  assert.equal(next.getDate(), 28);
  assert.equal(f.calculateNextExpirationDate(user, -1).nextPaidUntil.getMonth(), 11);
  assert.equal(f.getSubscriptionDaysRemaining('2020-01-01'), 0);
});
