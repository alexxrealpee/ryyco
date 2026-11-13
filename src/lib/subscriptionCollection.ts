import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db, isSubscriptionExpiredOrSuspended } from './firebase';
import { collectionPeriod, CollectionSubscription, CollectionFollowup } from './subscriptionCollectionState';

export const COLLECTION_FOLLOWUPS = 'subscription_collection_followups';

/** Atomic, idempotent operations. No WhatsApp sending and no subscription mutations. */
export async function updateCollectionFollowup(
  user: CollectionSubscription, action: 'attempt' | 'confirm' | 'undo', expectedId?: string,
): Promise<string | null> {
  const actorId = auth.currentUser?.uid;
  if (!actorId) throw new Error('Inicia sesión como administrador para guardar el seguimiento.');
  const periodId = collectionPeriod(user);
  const summaryRef = doc(db, COLLECTION_FOLLOWUPS, user.uid);
  const cycleRef = doc(summaryRef, 'periods', periodId);
  const eventId = action === 'attempt' ? doc(collection(cycleRef, 'messages')).id : expectedId;
  if (!eventId) throw new Error('Selecciona primero el intento de cobro.');

  return runTransaction(db, async (tx) => {
    const profile = await tx.get(doc(db, 'profiles', user.uid));
    if (!profile.exists()) throw new Error('No se encontró el restaurante. Actualiza el panel.');
    const live = { ...profile.data(), uid: user.uid } as CollectionSubscription;
    // Recheck the live subscription inside the transaction: payment and renewal can race a click.
    if (collectionPeriod(live) !== periodId || !isSubscriptionExpiredOrSuspended(live).isExpired) {
      throw new Error('La suscripción cambió o ya no está vencida. Actualiza el panel.');
    }
    const cycle = await tx.get(cycleRef);
    const state: CollectionFollowup = cycle.exists() ? cycle.data() as CollectionFollowup : {
      restaurantId: user.uid, periodId, pendingAttemptId: null, lastAttemptAt: null,
      lastConfirmedId: null, lastConfirmedAt: null, confirmedCount: 0, reminderCount: 0, status: 'pending',
    };
    const eventRef = doc(cycleRef, 'messages', eventId);
    const event = action === 'attempt' ? null : await tx.get(eventRef);
    const stamp = serverTimestamp();
    let next: CollectionFollowup;
    if (action === 'attempt') {
      // All devices reuse the pending attempt until it is confirmed; repeated clicks cannot create reminders.
      if (state.pendingAttemptId) {
        const reopened = { ...state, lastAttemptAt: stamp, updatedAt: stamp };
        tx.update(doc(cycleRef, 'messages', state.pendingAttemptId), { lastOpenedAt: stamp });
        tx.set(cycleRef, reopened);
        tx.set(summaryRef, reopened);
        return state.pendingAttemptId;
      }
      tx.set(eventRef, { restaurantId: user.uid, periodId, attemptedAt: stamp, attemptedBy: actorId, status: 'attempted' });
      next = { ...state, pendingAttemptId: eventId, lastAttemptAt: stamp };
    } else if (action === 'confirm') {
      if (event?.data()?.status === 'confirmed') return eventId;
      if (state.pendingAttemptId !== eventId || event?.data()?.status !== 'attempted') {
        throw new Error('Este intento ya cambió en otro dispositivo. Revisa el estado antes de confirmar.');
      }
      tx.update(eventRef, {
        status: 'confirmed', confirmedAt: stamp, confirmedBy: actorId,
        previousConfirmedId: state.lastConfirmedId, previousConfirmedAt: state.lastConfirmedAt,
      });
      next = { ...state, pendingAttemptId: null, lastConfirmedId: eventId,
        lastConfirmedAt: stamp, confirmedCount: state.confirmedCount + 1, reminderCount: state.confirmedCount, status: 'sent' };
    } else {
      if (event?.data()?.status === 'corrected') return eventId;
      if (state.lastConfirmedId !== eventId || event?.data()?.status !== 'confirmed') {
        throw new Error('Solo se puede corregir el último envío confirmado. Actualiza el panel.');
      }
      const previous = event.data();
      tx.update(eventRef, { status: 'corrected', correctedAt: stamp, correctedBy: actorId });
      next = { ...state, lastConfirmedId: previous.previousConfirmedId || null,
        lastConfirmedAt: previous.previousConfirmedAt || null, confirmedCount: Math.max(0, state.confirmedCount - 1),
        reminderCount: Math.max(0, state.confirmedCount - 2), status: previous.previousConfirmedId ? 'sent' : 'pending' };
    }
    tx.set(cycleRef, { ...next, updatedAt: stamp });
    tx.set(summaryRef, { ...next, updatedAt: stamp });
    return eventId;
  });
}
