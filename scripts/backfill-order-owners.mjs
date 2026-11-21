#!/usr/bin/env node
/**
 * Fase 2 de seguridad: completa en los pedidos existentes los campos que usan
 * las reglas nuevas de Firestore.
 *   - customerUid: cuenta del cliente (por su celular). '' si aún no tiene cuenta;
 *     se asigna sola cuando el cliente crea su cuenta (Cloud Function ryycoClaimProfile).
 *   - deliveryDriverId: '' en pedidos sin domiciliario (o el valor de driverId).
 *
 * Uso (cuenta de servicio privada):
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/privada.json node scripts/backfill-order-owners.mjs          # simulación
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/privada.json node scripts/backfill-order-owners.mjs --apply  # ejecutar
 * Es seguro repetirlo: solo completa campos que faltan.
 */
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'studio-9002217802-13e05';
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15';
const APPLY = process.argv.includes('--apply');

// Copia exacta de sanitizeCustomerPhone() de src/lib/firebase.ts
function sanitizeCustomerPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (cleaned.length === 12 && cleaned.startsWith('57')) cleaned = cleaned.substring(2);
  else if (cleaned.length === 11 && cleaned.startsWith('57')) cleaned = cleaned.substring(2);
  else if (cleaned.length > 10 && cleaned.startsWith('573')) cleaned = cleaned.substring(2);
  return cleaned;
}

const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault();
const db = getFirestore(initializeApp({ credential, projectId: PROJECT_ID }), DATABASE_ID);

console.log(APPLY ? '>>> MODO REAL: se actualizarán pedidos.' : '>>> SIMULACIÓN (agrega --apply para ejecutar).');

// Celular -> cuenta del cliente
const phoneToUid = new Map();
(await db.collection('customers').get()).forEach((d) => {
  const uid = d.get('authUid');
  const phone = sanitizeCustomerPhone(d.get('phone') || d.id);
  if (uid && phone && !phoneToUid.has(phone)) phoneToUid.set(phone, uid);
});

const orders = await db.collection('orders').get();
const stats = { orders: orders.size, ownerAssigned: 0, ownerEmpty: 0, driverFieldAdded: 0, untouched: 0 };
let batch = db.batch(), pending = 0;

for (const d of orders.docs) {
  const data = d.data();
  const update = {};
  if (!('customerUid' in data)) {
    const uid = phoneToUid.get(sanitizeCustomerPhone(data.customerPhone)) || '';
    update.customerUid = uid;
    uid ? stats.ownerAssigned++ : stats.ownerEmpty++;
  }
  if (!('deliveryDriverId' in data)) {
    update.deliveryDriverId = typeof data.driverId === 'string' ? data.driverId : '';
    stats.driverFieldAdded++;
  }
  if (Object.keys(update).length === 0) { stats.untouched++; continue; }
  if (APPLY) {
    batch.update(d.ref, update);
    if (++pending === 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
}
if (APPLY && pending) await batch.commit();

console.log('\nResumen:');
console.log(`  Pedidos revisados:                          ${stats.orders}`);
console.log(`  Con cuenta de cliente asignada:             ${stats.ownerAssigned}`);
console.log(`  Sin cuenta todavía (customerUid vacío):     ${stats.ownerEmpty}`);
console.log(`  Con deliveryDriverId completado:            ${stats.driverFieldAdded}`);
console.log(`  Ya estaban completos:                       ${stats.untouched}`);
console.log(`  Clientes con cuenta usados para asignar:    ${phoneToUid.size}`);
if (!APPLY) console.log('\nNada cambió. Ejecuta de nuevo con --apply.');
process.exit(0);
