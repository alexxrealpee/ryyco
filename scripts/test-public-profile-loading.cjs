const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.createSourceFile('PublicProfile.tsx', fs.readFileSync('src/components/PublicProfile.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let calculation;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'baseOrderAmountBeforePaymentFee') calculation = node.initializer.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(calculation);
const compute = (profile, deliveryType = 'delivery') => vm.runInNewContext(calculation, {
  profile, deliveryType, totalCartCost: 25000, totalPackagingCost: 1000,
  systemDeliveryFee: 7000, rewardDiscountAmount: 0, useMemo: callback => callback(),
});
test('initial render and missing restaurant do not crash while profile is null', () => {
  assert.equal(compute(null), 33000);
  assert.equal(compute(undefined), 33000);
});
test('loaded profiles retain paid delivery and free delivery totals', () => {
  assert.equal(compute({}), 33000);
  assert.equal(compute({ freeDeliveryEnabled: false }), 33000);
  assert.equal(compute({ freeDeliveryEnabled: true }), 26000);
  assert.equal(compute(null, 'pickup'), 26000);
  assert.equal(compute(null, 'table'), 26000);
});
