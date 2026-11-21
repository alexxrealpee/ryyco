/**
 * Clasificación inicial (o reclasificación) de productos existentes, por lotes.
 *
 *   cd functions && npm install
 *   node scripts/classifyProducts.cjs --dry-run        # solo muestra qué haría (no escribe)
 *   node scripts/classifyProducts.cjs                  # clasifica los que faltan
 *   node scripts/classifyProducts.cjs --all            # reclasifica todo (respeta correcciones manuales)
 *   node scripts/classifyProducts.cjs --resume <runId> # continúa un proceso interrumpido
 *
 * También se puede lanzar desde el panel (pestaña Imágenes → Categorías globales).
 * Credenciales: GOOGLE_APPLICATION_CREDENTIALS o `gcloud auth application-default login`.
 * IA opcional: RYYCO_CLASSIFIER_OPENAI_KEY en el entorno (si no está, solo reglas).
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const C = require('../productClassifier.cjs');
const { RUNS, runBatch, createAiClassifier } = require('../productClassification.cjs');

const DATABASE = 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15';
const PROJECT = process.env.GCLOUD_PROJECT || 'studio-9002217802-13e05';
const args = process.argv.slice(2);

async function dryRun(db) {
  const snap = await db.collection('products').select('name', 'description', 'category').get();
  const counts = {};
  const review = [];
  snap.forEach(doc => {
    const r = C.classifyWithRules(doc.data());
    const key = r.globalCategoryIds[0] || 'PARA REVISIÓN';
    counts[key] = (counts[key] || 0) + 1;
    if (!r.globalCategoryIds.length) review.push(`  - ${doc.get('name')} [${doc.get('category') || ''}]`);
  });
  console.log(`Productos: ${snap.size}`);
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('Para revisión (no se mostrarán en ninguna categoría hasta corregirlos):');
  console.log(review.join('\n'));
}

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  const db = getFirestore(DATABASE);
  if (args.includes('--dry-run')) return dryRun(db);

  let runId = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : null;
  if (runId) {
    await db.collection(RUNS).doc(runId).update({ status: 'running', leaseUntil: 0, driver: 'cli' });
  } else {
    const ref = await db.collection(RUNS).add({
      mode: args.includes('--all') ? 'all' : 'missing', status: 'queued', driver: 'cli',
      createdAt: new Date().toISOString(), createdBy: 'script', processed: 0, batch: 0, maxAiCalls: 200,
    });
    runId = ref.id;
  }
  console.log(`Proceso ${runId} (si se interrumpe: --resume ${runId})`);
  const ai = createAiClassifier();
  console.log(ai ? 'IA configurada: se usa solo cuando las reglas no alcanzan.' : 'Sin IA: solo reglas; los dudosos quedan para revisión.');
  for (;;) {
    const result = await runBatch(db, runId, { ai, owner: 'cli', log: console.log });
    if (result.skipped) { console.log('El proceso no está activo (terminado, pausado o tomado por otro).'); break; }
    if (result.done) break;
  }
  const final = (await db.collection(RUNS).doc(runId).get()).data();
  console.log(`Listo: ${final.processed} productos · ${final.classified} clasificados · ${final.review} para revisión · ${final.errors} errores · ${final.written} con cambios`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
