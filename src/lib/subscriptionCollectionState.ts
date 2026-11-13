/** Collection metadata only: subscription eligibility remains owned by firebase.ts. */
export interface CollectionSubscription {
  uid: string;
  subscriptionPaidUntil?: string;
  subscriptionTrialExpires?: string;
  subscriptionStatus?: string;
  suspended?: boolean;
  createdAt?: string;
}

export interface CollectionFollowup {
  restaurantId: string;
  periodId: string;
  pendingAttemptId: string | null;
  lastAttemptAt: any;
  lastConfirmedId: string | null;
  lastConfirmedAt: any;
  confirmedCount: number;
  reminderCount: number;
  status: 'pending' | 'sent';
}

export function collectionTimestamp(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

// A debt keeps the SAME period while overdue; the calendar month never resets it.
// Renewal changes paidUntil and therefore starts a new cycle on its next expiration.
export function collectionPeriod(user: CollectionSubscription): string {
  for (const [kind, value] of [
    ['paid', user.subscriptionPaidUntil], ['trial', user.subscriptionTrialExpires], ['created', user.createdAt],
  ]) {
    const time = collectionTimestamp(value);
    if (time) return `${kind}-${time}`;
  }
  return 'legacy-expiration';
}

export function currentCollection(user: CollectionSubscription, saved?: CollectionFollowup): CollectionFollowup | undefined {
  return saved?.periodId === collectionPeriod(user) ? saved : undefined;
}

export function collectionVisualState(expired: boolean, saved?: CollectionFollowup, now = Date.now()) {
  if (!expired) return 'inactive';
  const sent = collectionTimestamp(saved?.lastConfirmedAt);
  if (!sent) return 'pending';
  return now - sent >= 24 * 60 * 60 * 1000 ? 'due' : 'sent';
}

export function collectionDate(value: any): string {
  const time = collectionTimestamp(value);
  return time ? new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short',
  }).format(time) : '';
}

export function collectionElapsed(value: any, now: number): string {
  const minutes = Math.max(0, Math.floor((now - collectionTimestamp(value)) / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} días y ${hours % 24} h`;
}
