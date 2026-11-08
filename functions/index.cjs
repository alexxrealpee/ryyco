const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { deliverOrder } = require('./orderPush.cjs');
initializeApp();
const database = 'ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15';
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
