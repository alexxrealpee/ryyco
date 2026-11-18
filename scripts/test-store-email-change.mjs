import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Mock dependencies
let callerIdentity = { uid: 'admin_123', email: 'admin@ryyco.com' };
let callerRole = 'admin';
let targetProfileData = {
  uid: 'store_456',
  displayName: 'Pizzería Napolitana',
  role: 'user',
  email: 'old_pizza@ryyco.com'
};
let targetAuthUser = {
  uid: 'store_456',
  email: 'old_pizza@ryyco.com'
};
let existingAuthUsersByEmail = {};
let existingProfilesByEmail = {};
let updatedAuthUsers = [];
let updatedFirestoreDocs = [];
let auditLogs = [];

const mockAuth = {
  verifyIdToken: async (token) => {
    if (token === 'invalid-token') {
      const err = new Error('Invalid token');
      err.code = 'auth/invalid-id-token';
      throw err;
    }
    return callerIdentity;
  },
  getUser: async (uid) => {
    if (uid === targetAuthUser?.uid) return targetAuthUser;
    const err = new Error('User not found');
    err.code = 'auth/user-not-found';
    throw err;
  },
  getUserByEmail: async (email) => {
    if (existingAuthUsersByEmail[email]) return existingAuthUsersByEmail[email];
    const err = new Error('User not found by email');
    err.code = 'auth/user-not-found';
    throw err;
  },
  updateUser: async (uid, payload) => {
    updatedAuthUsers.push({ uid, payload });
    return { uid, ...payload };
  }
};

const mockDb = {
  collection: (collName) => {
    if (collName === 'profiles') {
      return {
        doc: (docId) => ({
          get: async () => {
            if (docId === callerIdentity.uid) {
              return {
                exists: true,
                get: (k) => k === 'role' ? callerRole : undefined,
                data: () => ({ role: callerRole, email: callerIdentity.email })
              };
            }
            if (docId === targetProfileData?.uid) {
              return {
                exists: true,
                get: (k) => targetProfileData[k],
                data: () => targetProfileData
              };
            }
            return { exists: false, data: () => null };
          },
          update: async (data) => {
            updatedFirestoreDocs.push({ coll: collName, docId, data });
          }
        }),
        where: (field, op, val) => ({
          limit: (n) => ({
            get: async () => {
              if (field === 'email' && existingProfilesByEmail[val]) {
                return {
                  empty: false,
                  docs: [{ id: existingProfilesByEmail[val].uid, data: () => existingProfilesByEmail[val] }]
                };
              }
              return { empty: true, docs: [] };
            }
          })
        })
      };
    }
    if (collName === 'users') {
      return {
        doc: (docId) => ({
          get: async () => ({ exists: false, data: () => null }),
          update: async (data) => {
            updatedFirestoreDocs.push({ coll: collName, docId, data });
          }
        })
      };
    }
    if (collName === 'admin_audit_logs') {
      return {
        add: async (entry) => {
          auditLogs.push(entry);
        }
      };
    }
    throw new Error('Unknown collection: ' + collName);
  }
};

const modules = {
  'firebase-admin/app': { getApps: () => [{}], initializeApp: () => ({}), applicationDefault: () => ({}), cert: () => ({}) },
  'firebase-admin/auth': { getAuth: () => mockAuth },
  'firebase-admin/firestore': { getFirestore: () => mockDb }
};

const fileSource = readFileSync(new URL('../server/storeEmailAdmin.ts', import.meta.url), 'utf8');
const trans = ts.transpileModule(fileSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;

const context = { exports: {}, require: (name) => modules[name], process: { env: {} }, console };
vm.runInNewContext(trans, context);

const handler = context.exports.createChangeStoreEmailHandler({ auth: mockAuth, db: mockDb });

async function executeCall({ token = 'valid-token', body = {} } = {}) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}`, 'user-agent': 'TestAgent' } : {},
    body,
    ip: '127.0.0.1'
  };
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
  await handler(req, res);
  return res;
}

async function runTests() {
  console.log('--- Running Store Email Change Backend Tests ---');

  // Test 1: Missing Bearer token
  const res1 = await executeCall({ token: null });
  assert.equal(res1.statusCode, 401, 'Should fail with 401 when missing token');

  // Test 2: Invalid/Expired token
  const res2 = await executeCall({ token: 'invalid-token' });
  assert.equal(res2.statusCode, 401, 'Should fail with 401 for invalid token');

  // Test 3: Caller is not an admin
  callerRole = 'driver';
  const res3 = await executeCall({ body: { targetUid: 'store_456', newEmail: 'new_pizza@ryyco.com' } });
  assert.equal(res3.statusCode, 403, 'Should fail with 403 when caller is not admin');
  callerRole = 'admin'; // reset

  // Test 4: Missing targetUid
  const res4 = await executeCall({ body: { newEmail: 'new_pizza@ryyco.com' } });
  assert.equal(res4.statusCode, 400, 'Should fail with 400 when targetUid is missing');

  // Test 5: Invalid email format
  const res5 = await executeCall({ body: { targetUid: 'store_456', newEmail: 'not-an-email' } });
  assert.equal(res5.statusCode, 400, 'Should fail with 400 when email format is invalid');

  // Test 6: Target store does not exist
  const res6 = await executeCall({ body: { targetUid: 'unknown_store', newEmail: 'valid@pizza.com' } });
  assert.equal(res6.statusCode, 404, 'Should fail with 404 when target store does not exist');

  // Test 7: Target is an admin account (not allowed to change via store endpoint)
  targetProfileData.role = 'admin';
  const res7 = await executeCall({ body: { targetUid: 'store_456', newEmail: 'valid@pizza.com' } });
  assert.equal(res7.statusCode, 403, 'Should fail with 403 when target account is admin');
  targetProfileData.role = 'user'; // reset

  // Test 8: New email is identical to current email
  const res8 = await executeCall({ body: { targetUid: 'store_456', newEmail: 'old_pizza@ryyco.com' } });
  assert.equal(res8.statusCode, 400, 'Should fail with 400 when new email is identical');

  // Test 9: New email already taken in Auth by another user
  existingAuthUsersByEmail['taken@other.com'] = { uid: 'other_user_999', email: 'taken@other.com' };
  const res9 = await executeCall({ body: { targetUid: 'store_456', newEmail: 'taken@other.com' } });
  assert.equal(res9.statusCode, 409, 'Should fail with 409 when email taken in Auth');

  // Test 10: New email already taken in Firestore by another store
  existingProfilesByEmail['taken_store@other.com'] = { uid: 'other_store_888', email: 'taken_store@other.com' };
  const res10 = await executeCall({ body: { targetUid: 'store_456', newEmail: 'taken_store@other.com' } });
  assert.equal(res10.statusCode, 409, 'Should fail with 409 when email taken in Firestore');

  // Test 11: SUCCESS FLOW
  updatedAuthUsers = [];
  updatedFirestoreDocs = [];
  auditLogs = [];
  const res11 = await executeCall({ body: { targetUid: 'store_456', newEmail: 'fresh_pizza@ryyco.com' } });
  assert.equal(res11.statusCode, 200, 'Should succeed with 200');
  assert.equal(res11.body.success, true);
  assert.equal(res11.body.newEmail, 'fresh_pizza@ryyco.com');
  assert.equal(res11.body.previousEmail, 'old_pizza@ryyco.com');

  // Verify Auth was updated with exact targetUid and emailVerified: true
  assert.equal(updatedAuthUsers.length, 1);
  assert.equal(updatedAuthUsers[0].uid, 'store_456');
  assert.equal(updatedAuthUsers[0].payload.email, 'fresh_pizza@ryyco.com');
  assert.equal(updatedAuthUsers[0].payload.emailVerified, true);
  assert.equal(updatedAuthUsers[0].payload.password, undefined, 'Password must NOT be touched or reset');

  // Verify Firestore profile was updated
  const profileUpdate = updatedFirestoreDocs.find(d => d.coll === 'profiles' && d.docId === 'store_456');
  assert.ok(profileUpdate, 'Firestore profile doc must be updated');
  assert.equal(profileUpdate.data.email, 'fresh_pizza@ryyco.com');

  // Verify inmutable audit log entry
  assert.equal(auditLogs.length, 1);
  const audit = auditLogs[0];
  assert.equal(audit.action, 'store_email_changed');
  assert.equal(audit.adminUid, 'admin_123');
  assert.equal(audit.adminEmail, 'admin@ryyco.com');
  assert.equal(audit.targetUid, 'store_456');
  assert.equal(audit.targetStoreName, 'Pizzería Napolitana');
  assert.equal(audit.previousEmail, 'old_pizza@ryyco.com');
  assert.equal(audit.newEmail, 'fresh_pizza@ryyco.com');
  assert.ok(audit.timestamp);
  assert.equal(audit.ip, '127.0.0.1');

  console.log('✓ ALL 11 BACKEND TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
