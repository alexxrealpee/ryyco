/**
 * Clasificación global de productos en Firebase.
 *
 * - productClassifications/{productId}: fuente de verdad (la escriben solo estas
 *   funciones; el administrador general solo puede poner una corrección manual o
 *   pedir reclasificar). Guarda la huella del texto para no recalcular sin motivo.
 * - products/{productId}: copia para el catálogo (globalCategoryIds, globalMealTags,
 *   classification*). Se actualiza con update() de solo esos campos: nunca toca
 *   nombre, precio, imagen, disponibilidad ni la categoría interna. Como el panel del
 *   restaurante guarda el producto completo (setDoc), si esa copia se borra, el
 *   trigger la repone sin volver a clasificar.
 * - classifierRuns/{runId}: proceso por lotes con avance, pausa y reanudación.
 */
const { FieldPath } = require('firebase-admin/firestore');
const C = require('./productClassifier.cjs');

const CLS = 'productClassifications';
const RUNS = 'classifierRuns';
const BATCH_SIZE = 40;
const LEASE_MS = 330000;

/** Lo que el catálogo debe mostrar para una clasificación (la corrección manual manda). */
function effectiveFields(cls) {
  if (cls.manual) {
    const ids = (cls.manual.globalCategoryIds || []).filter(id => C.CATEGORY_IDS.has(id));
    return {
      globalCategoryIds: ids,
      globalMealTags: (cls.manual.globalMealTags || cls.globalMealTags || []).filter(t => C.TAG_IDS.has(t)),
      classificationSource: 'manual',
      classificationConfidence: 1,
      classificationVersion: cls.version || C.CLASSIFIER_VERSION,
      classificationUpdatedAt: cls.manual.at || cls.updatedAt,
      classificationStatus: ids.length ? 'classified' : 'hidden',
    };
  }
  return {
    globalCategoryIds: cls.globalCategoryIds || [],
    globalMealTags: cls.globalMealTags || [],
    classificationSource: cls.source,
    classificationConfidence: cls.confidence,
    classificationVersion: cls.version,
    classificationUpdatedAt: cls.updatedAt,
    classificationStatus: cls.status,
  };
}

function sameValue(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

function productNeedsSync(product, fields) {
  return Object.entries(fields).some(([key, value]) => !sameValue(product[key], value));
}

/**
 * IA opcional: solo si el servidor tiene RYYCO_CLASSIFIER_OPENAI_KEY (variable de
 * entorno de Cloud Functions; nunca llega al navegador). Elige entre las categorías
 * permitidas y responde en JSON estructurado.
 */
function createAiClassifier(env = process.env) {
  const key = env.RYYCO_CLASSIFIER_OPENAI_KEY;
  if (!key) return null;
  const model = env.RYYCO_CLASSIFIER_MODEL || 'gpt-4o-mini';
  return async function classifyWithAi(product) {
    const categories = C.GLOBAL_CATEGORIES.map(c => `${c.id} (${c.label.replace(/^\S+\s/, '')})`).join(', ');
    const body = {
      model,
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'clasificacion', strict: true, schema: {
        type: 'object', additionalProperties: false,
        required: ['primaryCategoryId', 'secondaryCategoryIds', 'mealTags', 'confidence'],
        properties: {
          primaryCategoryId: { type: 'string', enum: [...C.CATEGORY_IDS, 'unknown'] },
          secondaryCategoryIds: { type: 'array', items: { type: 'string', enum: [...C.CATEGORY_IDS] } },
          mealTags: { type: 'array', items: { type: 'string', enum: [...C.TAG_IDS] } },
          confidence: { type: 'number' },
        } } } },
      messages: [
        { role: 'system', content: 'Clasificas productos de restaurantes de Ipiales (Colombia) para el catálogo de una app de domicilios. ' +
          `Categorías permitidas: ${categories}. Si no es comida ni bebida o no es claro, responde "unknown" con confianza baja. ` +
          'No inventes: confianza entre 0 y 1.' },
        { role: 'user', content: JSON.stringify({ nombre: product.name || '', categoriaDelRestaurante: product.category || '',
          descripcion: String(product.description || '').slice(0, 500) }) },
      ],
    };
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`IA respondió ${response.status}`);
    const data = await response.json();
    return C.sanitizeAiResult(JSON.parse(data.choices?.[0]?.message?.content || '{}'));
  };
}

/** Reglas primero; IA solo si las reglas no alcanzan y hay IA configurada. */
async function classifyProduct(product, ai) {
  const rules = C.classifyWithRules(product);
  if (rules.status === 'classified' || !ai) return { ...rules, source: 'rules' };
  try {
    const result = await ai(product);
    if (result) return { ...result, source: 'ai',
      suggestedCategoryIds: result.suggestedCategoryIds.length ? result.suggestedCategoryIds : rules.suggestedCategoryIds };
  } catch (err) {
    console.warn('[clasificador] IA no disponible, queda para revisión:', err.message);
  }
  return { ...rules, source: 'rules' };
}

/**
 * Clasifica (si hace falta) y sincroniza un producto.
 * force: reclasificar aunque el texto no haya cambiado (la corrección manual se respeta siempre).
 * Devuelve { status, classified, wroteClassification, wroteProduct, usedAi }.
 */
async function processProduct(db, productId, product, { force = false, ai = null, now = new Date().toISOString() } = {}) {
  const clsRef = db.collection(CLS).doc(productId);
  const snap = await clsRef.get();
  const existing = snap.exists ? snap.data() : null;
  const hash = C.inputHash(product);
  const needsAuto = force || !existing || existing.inputHash !== hash || existing.version !== C.CLASSIFIER_VERSION;
  let cls = existing;
  let wroteClassification = false;
  let usedAi = false;

  if (needsAuto) {
    const result = await classifyProduct(product, ai);
    usedAi = result.source === 'ai';
    const next = {
      productId,
      storeId: product.userId || null,
      productName: String(product.name || '').slice(0, 120),
      internalCategory: String(product.category || '').slice(0, 80),
      inputHash: hash,
      version: C.CLASSIFIER_VERSION,
      source: result.source,
      status: result.status,
      confidence: result.confidence,
      globalCategoryIds: result.globalCategoryIds,
      globalMealTags: result.globalMealTags,
      suggestedCategoryIds: result.suggestedCategoryIds,
      reason: result.reason || '',
      reclassifyRequestedAt: null,
    };
    // Sin cambios reales (ej. reclasificación forzada con el mismo resultado): no se escribe.
    const unchanged = existing && Object.entries(next).every(([k, v]) => sameValue(existing[k], v));
    if (!unchanged) {
      cls = await db.runTransaction(async tx => {
        const fresh = await tx.get(clsRef);
        // La corrección manual puede haber llegado mientras se clasificaba: se conserva.
        const manual = fresh.exists ? fresh.get('manual') || null : null;
        const doc = { ...next, manual, updatedAt: now, ...(fresh.exists ? {} : { createdAt: now }) };
        tx.set(clsRef, doc, { merge: true });
        return { ...(fresh.exists ? fresh.data() : {}), ...doc };
      });
      wroteClassification = true;
    }
  }

  const fields = effectiveFields(cls);
  let wroteProduct = false;
  if (productNeedsSync(product, fields)) {
    try {
      // update(): solo estos campos; si el producto se borró, falla y no se recrea.
      await db.collection('products').doc(productId).update(fields);
      wroteProduct = true;
    } catch (err) {
      if (err.code !== 5) throw err; // 5 = NOT_FOUND
    }
  }
  return { status: fields.classificationStatus, classified: fields.globalCategoryIds.length > 0,
    wroteClassification, wroteProduct, usedAi, source: fields.classificationSource };
}

/** Trigger: un producto se creó, cambió o se borró. No bloquea la publicación (corre después). */
async function onProductWritten(db, event, ai) {
  const productId = event.params.productId;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  if (!after) {
    await db.collection(CLS).doc(productId).delete().catch(() => {});
    return;
  }
  await processProduct(db, productId, after, { ai });
}

/** Trigger: el administrador corrigió a mano o pidió reclasificar. */
async function onClassificationWritten(db, event, ai) {
  const productId = event.params.productId;
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;
  const reclassify = after.reclassifyRequestedAt && after.reclassifyRequestedAt !== (before && before.reclassifyRequestedAt);
  const manualChanged = !sameValue(before && before.manual, after.manual);
  if (!reclassify && !manualChanged) return; // escrituras propias de la función
  const productSnap = await db.collection('products').doc(productId).get();
  if (!productSnap.exists) return;
  await processProduct(db, productId, productSnap.data(), { force: !!reclassify, ai });
}

/**
 * Un lote de un proceso de clasificación. Reanudable: guarda el cursor (último ID).
 * mode 'missing': solo productos sin clasificar o con texto/versión cambiados.
 * mode 'all': reclasifica todo (las correcciones manuales se respetan).
 */
async function runBatch(db, runId, { ai = null, owner = 'manual', batchSize = BATCH_SIZE, log = () => {} } = {}) {
  const runRef = db.collection(RUNS).doc(runId);
  const run = await db.runTransaction(async tx => {
    const snap = await tx.get(runRef);
    const data = snap.exists ? snap.data() : null;
    if (!data || !['queued', 'running'].includes(data.status)) return null;
    if (data.leaseUntil && data.leaseUntil > Date.now() && data.leaseOwner !== owner) return null;
    tx.update(runRef, { status: 'running', leaseUntil: Date.now() + LEASE_MS, leaseOwner: owner,
      startedAt: data.startedAt || new Date().toISOString() });
    return data;
  });
  if (!run) return { done: false, skipped: true };

  let query = db.collection('products').orderBy(FieldPath.documentId()).limit(batchSize);
  if (run.cursor) query = query.startAfter(run.cursor);
  const snapshot = await query.get();
  const stats = { processed: 0, classified: 0, review: 0, manual: 0, errors: 0, written: 0, aiCalls: 0 };
  const errors = [];
  const maxAi = Number(run.maxAiCalls ?? 200);
  let aiUsed = Number(run.aiCalls || 0);
  const budgetedAi = ai ? async product => {
    if (aiUsed >= maxAi) return null;
    aiUsed += 1; stats.aiCalls += 1;
    return ai(product);
  } : null;

  for (const doc of snapshot.docs) {
    try {
      const result = await processProduct(db, doc.id, doc.data(), { force: run.mode === 'all', ai: budgetedAi });
      stats.processed += 1;
      if (result.source === 'manual') stats.manual += 1;
      if (result.classified) stats.classified += 1; else stats.review += 1;
      if (result.wroteClassification || result.wroteProduct) stats.written += 1;
    } catch (err) {
      stats.errors += 1;
      errors.push(`${doc.id}: ${String(err.message || err).slice(0, 140)}`);
    }
  }
  const done = snapshot.size < batchSize;
  const now = new Date().toISOString();
  await runRef.update({
    processed: (run.processed || 0) + stats.processed,
    classified: (run.classified || 0) + stats.classified,
    review: (run.review || 0) + stats.review,
    manual: (run.manual || 0) + stats.manual,
    errors: (run.errors || 0) + stats.errors,
    written: (run.written || 0) + stats.written,
    aiCalls: aiUsed,
    lastErrors: [...errors, ...(run.lastErrors || [])].slice(0, 20),
    cursor: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1].id : (run.cursor || null),
    batch: (run.batch || 0) + 1,
    status: done ? 'done' : 'running',
    leaseUntil: 0,
    leaseOwner: null,
    updatedAt: now,
    ...(done ? { finishedAt: now } : {}),
  });
  log(`Lote ${(run.batch || 0) + 1}: ${stats.processed} productos (${stats.classified} clasificados, ${stats.review} a revisión, ${stats.errors} errores)`);
  return { done, skipped: false, stats };
}

/** Trigger del proceso: cada lote terminado dispara el siguiente (encadenado, sin bucles largos). */
async function onRunWritten(db, event, ai) {
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  if (!after || after.driver === 'cli' || !['queued', 'running'].includes(after.status)) return;
  const advanced = !before || before.batch !== after.batch || before.status !== after.status || before.resumeAt !== after.resumeAt;
  if (!advanced) return;
  // El id del evento identifica la invocación: un reintento del mismo evento puede retomar su lote.
  await runBatch(db, event.params.runId, { ai, owner: event.id || 'trigger' });
}

module.exports = { CLS, RUNS, effectiveFields, productNeedsSync, createAiClassifier, classifyProduct, processProduct,
  onProductWritten, onClassificationWritten, runBatch, onRunWritten };
