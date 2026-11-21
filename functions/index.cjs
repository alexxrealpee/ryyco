const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { deliverOrder } = require('./orderPush.cjs');
const rewards = require('./customerRewards.cjs');
initializeApp();
const database = 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15';

// Clientes y RYYCOS (antes en el navegador). Llamadas desde la app con httpsCallable.
const callable = { region: 'us-central1', maxInstances: 10, cors: true };
const db = () => getFirestore(database);
exports.ryycoCheckPhone = onCall(callable, request => rewards.checkPhone(db(), request));
exports.ryycoClaimProfile = onCall(callable, request => rewards.claimProfile(db(), request));
exports.ryycoFindRecipient = onCall(callable, request => rewards.findRecipient(db(), request));
exports.ryycoTransfer = onCall(callable, request => rewards.transfer(db(), request));
exports.ryycoSpin = onCall(callable, request => rewards.spin(db(), request));

// Premia con RYYCOS cuando el pedido pasa a "entregado".
exports.ryycoAwardOnDelivered = onDocumentUpdated({
  document: 'orders/{orderId}', database, region: 'us-central1', retry: true,
  timeoutSeconds: 120, maxInstances: 10,
}, event => rewards.awardOnDelivered(db(), event));
exports.orderNotifications = onDocumentCreated({
  document: 'orders/{orderId}', database, region: 'us-central1', retry: true,
  timeoutSeconds: 300, maxInstances: 10,
}, event => deliverOrder(getFirestore(database), getMessaging(), event.params.orderId));

// Releasing an existing order does not fire the creation trigger.
exports.orderReassignmentNotifications = onDocumentUpdated({
  document: 'orders/{orderId}', database, region: 'us-central1', retry: true,
  timeoutSeconds: 300, maxInstances: 10,
}, event => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!after?.reassignmentId || after.reassignmentId === before?.reassignmentId || after.status !== 'pending') return;
  return deliverOrder(getFirestore(database), getMessaging(), event.params.orderId, after.reassignmentId);
});

// Categorías globales de productos (página de inicio): reglas + IA opcional en el servidor.
const classification = require('./productClassification.cjs');
const classifierAi = () => classification.createAiClassifier(); // null si no hay llave configurada
const classifierTrigger = { database, region: 'us-central1', retry: true, timeoutSeconds: 120, maxInstances: 5 };
exports.productClassificationOnProduct = onDocumentWritten({ ...classifierTrigger, document: 'products/{productId}' },
  event => classification.onProductWritten(db(), event, classifierAi()));
exports.productClassificationOnReview = onDocumentWritten({ ...classifierTrigger, document: 'productClassifications/{productId}' },
  event => classification.onClassificationWritten(db(), event, classifierAi()));
exports.productClassificationRun = onDocumentWritten({ ...classifierTrigger, timeoutSeconds: 300, maxInstances: 1, document: 'classifierRuns/{runId}' },
  event => classification.onRunWritten(db(), event, classifierAi()));
