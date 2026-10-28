import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let profile, reads = 0;
const writes = [];
const code = ts.transpileModule(readFileSync('src/lib/driverAuth.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const modules = {
  'firebase/firestore': { doc: (_db, _collection, id) => id,
    getDoc: async id => { reads++; return { exists: () => Boolean(profile), data: () => profile }; },
    updateDoc: async (id, data) => writes.push({id, data}), deleteField: () => 'DELETE' },
  './firebase': { withDriverDisplayStats: async data => data }
};
const context = { exports: {}, require: name => modules[name] };
vm.runInNewContext(code, context);
const {loadVerifiedDriver} = context.exports;
const user = (provider='google.com', verified=true, email='test@example.com') => ({
  uid:'google-owner', email, emailVerified:verified, getIdTokenResult: async () => ({signInProvider:provider})
});
assert.equal(await loadVerifiedDriver(user('password')), null);
assert.equal(await loadVerifiedDriver(user('google.com',false)), null);
assert.equal(await loadVerifiedDriver(user(), 'another-driver'), null);
assert.equal(reads,0,'invalid identities must not query private profiles');
profile={id:'driver_test_example_com',uid:'legacy',email:'other@example.com',password:'synthetic'};
assert.equal(await loadVerifiedDriver(user()),null);
assert.equal(writes.length,0,'mismatched email cannot migrate');
profile.email='test@example.com';
const result=await loadVerifiedDriver(user());
assert.equal(result.uid,'google-owner');
assert.equal(result.password,undefined);
assert.equal(writes[0].data.password,'DELETE');
assert.equal(writes[0].id,'driver_test_example_com');
console.log('PASS: verified driver identity, cache forgery rejection and legacy credential removal');
