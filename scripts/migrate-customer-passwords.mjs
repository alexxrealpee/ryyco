#!/usr/bin/env node
/**
 * Migra las contraseñas de clientes guardadas en texto plano en
 * `customers.password` a Firebase Authentication y BORRA el campo de Firestore.
 *
 * Cada cliente queda con una cuenta de Firebase Auth:
 *   correo interno: <celular>@clientes.ryyco.com   (igual que la app)
 *   contraseña:     la misma que tenía (Firebase la guarda cifrada)
 *
 * Uso (desde la raíz del proyecto, con una cuenta de servicio privada):
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/privada/cuenta-servicio.json \
 *     node scripts/migrate-customer-passwords.mjs            # simulación: no cambia nada
 *   ... node scripts/migrate-customer-passwords.mjs --apply  # ejecuta la migración
 *
 * También acepta FIREBASE_SERVICE_ACCOUNT_JSON (contenido del JSON).
 * Es seguro repetirlo: los clientes ya migrados se saltan.
 * Nunca imprime contraseñas ni números completos.
 */
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'studio-9002217802-13e05';
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15';
const EMAIL_DOMAIN = 'clientes.ryyco.com'; // debe coincidir con CUSTOMER_AUTH_EMAIL_DOMAIN en src/lib/firebase.ts
const MIN_FIREBASE_PASSWORD = 6;
const PBKDF2_ROUNDS = 100000;
const APPLY = process.argv.includes('--apply');

// Copia exacta de sanitizeCustomerPhone() de src/lib/firebase.ts
function sanitizeCustomerPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  if (cleaned.length === 12 && cleaned.startsWith('57')) cleaned = cleaned.substring(2);
  else if (cleaned.length === 11 && cleaned.startsWith('57')) cleaned = cleaned.substring(2);
  else if (cleaned.length > 10 && cleaned.startsWith('573')) cleaned = cleaned.substring(2);
  return cleaned;
}

const mask = (phone) => (phone ? `******${phone.slice(-4)}` : '(sin celular)');

function credential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  return applicationDefault();
}

function webApiKey() {
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;
  try {
    return JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8')).apiKey;
  } catch {
    return '';
  }
}

// Comprueba con la API pública de Firebase Auth que la contraseña importada funciona.
async function canSignIn(email, password) {
  const key = webApiKey();
  if (!key) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false })
  });
  return res.ok;
}

async function findUserByEmail(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

// Crea la cuenta con la misma contraseña. Las de 6+ caracteres las crea Firebase
// directamente; las más cortas (la app antes permitía 4) se importan con hash
// PBKDF2 y se verifica que el inicio de sesión funcione.
async function createAuthUser(auth, { uid, email, password, displayName }) {
  if (password.length >= MIN_FIREBASE_PASSWORD) {
    await auth.createUser({ uid, email, password, displayName: displayName || undefined });
    return 'created';
  }
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, PBKDF2_ROUNDS, 32, 'sha256');
  const result = await auth.importUsers(
    [{ uid, email, displayName: displayName || undefined, passwordHash: hash, passwordSalt: salt }],
    { hash: { algorithm: 'PBKDF2_SHA256', rounds: PBKDF2_ROUNDS } }
  );
  if (result.failureCount > 0) throw new Error(result.errors[0]?.error?.message || 'importUsers falló');
  const ok = await canSignIn(email, password);
  if (ok === false) {
    await auth.deleteUser(uid).catch(() => {});
    return 'short-failed';
  }
  return ok === null ? 'imported-unverified' : 'imported';
}

async function main() {
  const app = initializeApp({ credential: credential(), projectId: PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app, DATABASE_ID);

  console.log(APPLY ? '>>> MODO REAL: se crearán cuentas y se borrarán contraseñas.' : '>>> SIMULACIÓN (agrega --apply para ejecutar).');

  const snap = await db.collection('customers').get();
  const stats = { docs: snap.size, withPassword: 0, created: 0, imported: 0, alreadyHadAccount: 0, mustReRegister: 0, invalidPhone: 0, errors: 0 };

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const password = typeof data.password === 'string' ? data.password.trim() : '';
    if (!('password' in data)) continue;

    const phone = sanitizeCustomerPhone(data.phone || docSnap.id);
    const updates = { password: FieldValue.delete() };

    if (!password) {
      // Campo vacío: solo se elimina.
      if (APPLY) await docSnap.ref.update(updates);
      continue;
    }
    stats.withPassword++;

    if (!phone || phone.length < 7) {
      stats.invalidPhone++;
      console.warn(`- Documento ${docSnap.id}: celular inválido; se borra la contraseña sin crear cuenta.`);
      if (APPLY) await docSnap.ref.update(updates);
      continue;
    }

    const email = `${phone}@${EMAIL_DOMAIN}`;
    try {
      const existingUser = await findUserByEmail(auth, email);
      if (existingUser) {
        // Ya tiene cuenta de contraseña (migración anterior o registro con la app nueva).
        stats.alreadyHadAccount++;
        if (!data.authUid) updates.authUid = existingUser.uid;
      } else if (APPLY) {
        const uid = `cust_${phone}`;
        const outcome = await createAuthUser(auth, { uid, email, password, displayName: data.name });
        if (outcome === 'created') stats.created++;
        else if (outcome.startsWith('imported')) {
          stats.imported++;
          if (outcome === 'imported-unverified') console.warn(`- ${mask(phone)}: importada sin verificar (falta FIREBASE_API_KEY).`);
        } else {
          stats.mustReRegister++;
          console.warn(`- ${mask(phone)}: contraseña corta no se pudo importar; deberá crear una nueva desde "Crear cuenta".`);
        }
        if (outcome !== 'short-failed' && !data.authUid) updates.authUid = uid;
      } else {
        password.length >= MIN_FIREBASE_PASSWORD ? stats.created++ : stats.imported++;
      }

      if (APPLY) await docSnap.ref.update(updates);
    } catch (err) {
      stats.errors++;
      console.error(`- ${mask(phone)}: error, NO se borró su contraseña: ${err?.message || err}`);
    }
  }

  console.log('\nResumen:');
  console.log(`  Documentos de clientes revisados:        ${stats.docs}`);
  console.log(`  Con contraseña en texto plano:           ${stats.withPassword}`);
  console.log(`  Cuentas ${APPLY ? 'creadas' : 'a crear'} (6+ caracteres):        ${stats.created}`);
  console.log(`  Cuentas ${APPLY ? 'importadas' : 'a importar'} (contraseña corta):  ${stats.imported}`);
  console.log(`  Ya tenían cuenta de contraseña:          ${stats.alreadyHadAccount}`);
  console.log(`  Deben crear contraseña nueva:            ${stats.mustReRegister}`);
  console.log(`  Celular inválido:                        ${stats.invalidPhone}`);
  console.log(`  Errores (contraseña NO borrada):         ${stats.errors}`);
  if (!APPLY) console.log('\nNada cambió. Ejecuta de nuevo con --apply para migrar.');
}

main().catch((err) => {
  console.error('La migración falló:', err?.message || err);
  process.exit(1);
});
