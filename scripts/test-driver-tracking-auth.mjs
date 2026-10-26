import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let identity = { email: 'driver@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
let status = 'approved';
const issued = [];
const admin = { verifyIdToken: async () => identity, createCustomToken: async id => { issued.push(id); return 'test-token'; } };
const modules = {
  'firebase-admin/app': { getApps: () => [{}], initializeApp: () => ({}), applicationDefault: () => ({}) },
  'firebase-admin/auth': { getAuth: () => admin },
  'firebase-admin/firestore': { getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({
    exists: true, get: key => key === 'email' ? 'driver@example.com' : status
  }) }) }) }) }
};
const code = ts.transpileModule(readFileSync(new URL('../server/driverTrackingAuth.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const context = { exports: {}, require: name => modules[name], process: { env: {} } };
vm.runInNewContext(code, context);
async function call(driverId = 'driver_driver_example_com', bearer = true) {
  const res = { code: 200, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await context.exports.driverTrackingAuth({ headers: bearer ? { authorization: 'Bearer verified-token' } : {}, body: { driverId } }, res);
  return res;
}
assert.equal((await call(undefined, false)).code, 401);
assert.equal((await call('another-driver')).code, 403);
identity.email_verified = false;
assert.equal((await call()).code, 403);
identity.email_verified = true;
status = 'pending';
assert.equal((await call()).code, 403);
assert.equal(issued.length, 0);
status = 'approved';
assert.equal((await call()).body.token, 'test-token');
assert.deepEqual(issued, ['driver_driver_example_com']);
console.log('PASS driver GPS authentication: verified matching Google account and approval required; no browser password trusted.');
