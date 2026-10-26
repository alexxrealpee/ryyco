import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/firebase.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('firebase.ts', source, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) &&
  ['saveCustomerProfile', 'awardCustomerPointsAndSpin'].includes(node.name?.text));
assert.equal(functions.length, 2);
const code = ts.transpileModule(functions.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
let native = true;
let existing = null;
const context = {
  exports: {}, console,
  isAndroidApp: () => native,
  sanitizeCustomerPhone: phone => phone,
  fetchCustomerProfileByPhone: async () => existing,
  setDoc: async () => {}, doc: () => ({}), db: {}, cleanUndefined: value => value
};
vm.runInNewContext(code, context);
const { saveCustomerProfile, awardCustomerPointsAndSpin } = context.exports;
let profile = await saveCustomerProfile({ phone: '3001234567', name: 'Cliente', points: 500, spinsAvailable: 1 });
assert.equal(profile.points, 0);
assert.equal(profile.ryycos, 0);
assert.equal(profile.spinsAvailable, 0);
assert.equal(profile.movements.length, 0);
existing = { ...profile, points: 750, ryycos: 750, spinsAvailable: 3 };
profile = await saveCustomerProfile({ phone: existing.phone, name: existing.name, points: 1000, spinsAvailable: 1 });
assert.equal(profile.points, 750);
assert.equal(profile.spinsAvailable, 3);
const result = await awardCustomerPointsAndSpin({ customerPhone: existing.phone, totalAmount: 12000 });
assert.equal(result.earnedPoints, 0);
assert.equal(result.spinsAwarded, 0);
assert.equal(result.newTotalPoints, 750);
native = false;
existing = null;
profile = await saveCustomerProfile({ phone: '3001234567', name: 'Cliente web' });
assert.equal(profile.points, 500);
assert.equal(profile.spinsAvailable, 1);
assert.equal(profile.movements.length, 1);
console.log('Native accounts and purchases do not award coins or spins; existing balances and web rewards are preserved.');
