/**
 * Llenado inicial de customerStats (una sola vez, o para reparar).
 *
 *   cd functions
 *   npm install
 *   node scripts/backfillCustomerStats.cjs --dry-run   # solo cuenta, no escribe
 *   node scripts/backfillCustomerStats.cjs             # escribe
 *
 * Credenciales: GOOGLE_APPLICATION_CREDENTIALS apuntando a la llave JSON de una
 * cuenta de servicio del proyecto, o `gcloud auth application-default login`.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { rebuildAll } = require('../customerStats.cjs');

const DATABASE = 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15';
const PROJECT = process.env.GCLOUD_PROJECT || 'studio-9002217802-13e05';

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const dryRun = process.argv.includes('--dry-run');

rebuildAll(getFirestore(DATABASE), { dryRun })
  .then(result => {
    console.log(dryRun ? 'Prueba (no se escribió nada):' : 'Listo:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Error reconstruyendo customerStats:', error);
    process.exit(1);
  });
