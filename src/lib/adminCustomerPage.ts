import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { CustomerProfile, OrderItem } from '../types';

export const ADMIN_CUSTOMER_PAGE_SIZE = 4;

export async function fetchAdminCustomerPage(cursor: QueryDocumentSnapshot | null) {
  // Document ID includes legacy profiles without an order counter or creation date.
  const snapshot = await getDocs(query(collection(db, 'customers'), orderBy(documentId()),
    ...(cursor ? [startAfter(cursor)] : []), limit(ADMIN_CUSTOMER_PAGE_SIZE)));
  const profiles = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CustomerProfile));
  const orders = new Map<string, OrderItem>();
  await Promise.all(profiles.map(async profile => {
    const raw = profile.phone || profile.id;
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    const national = digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
    if (national.length < 7) return;
    const international = national.length === 10 ? `57${national}` : digits;
    const variants = [...new Set([raw.trim(), digits, national, international, `+${international}`])];
    // Only the four selected customers' histories, never the full orders collection.
    const history = await getDocs(query(collection(db, 'orders'), where('customerPhone', 'in', variants)));
    history.docs.forEach(doc => orders.set(doc.id, { ...doc.data(), id: doc.id } as OrderItem));
  }));
  return { profiles, orders: [...orders.values()], cursor: snapshot.docs.at(-1) ?? cursor,
    hasMore: snapshot.size === ADMIN_CUSTOMER_PAGE_SIZE };
}
