import { 
  collection, 
  doc, 
  addDoc, 
  setDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp, 
  updateDoc,
  increment 
} from 'firebase/firestore';
import { db } from './firebase';
import { OrderChatMessage, OrderChatSenderRole } from '../types';

/**
 * Subscribes to real-time chat messages between driver and customer for a specific order.
 * Returns an unsubscribe callback.
 */
export function subscribeToOrderChat(
  orderId: string,
  onUpdate: (messages: OrderChatMessage[]) => void
): () => void {
  if (!orderId) {
    onUpdate([]);
    return () => {};
  }

  try {
    const messagesRef = collection(db, 'orders', orderId, 'chat_messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(150));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs: OrderChatMessage[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          msgs.push({
            id: docSnap.id,
            orderId: data.orderId || orderId,
            senderRole: data.senderRole as OrderChatSenderRole,
            senderId: data.senderId,
            senderName: data.senderName || (data.senderRole === 'driver' ? 'Domiciliario' : 'Cliente'),
            text: data.text || '',
            createdAt: data.createdAt || new Date().toISOString(),
            timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
            readByCustomer: data.readByCustomer ?? false,
            readByDriver: data.readByDriver ?? false,
          });
        });
        onUpdate(msgs);
      },
      (error) => {
        console.warn(`[OrderChat] Snapshot warning for order ${orderId}:`, error);
        // Fallback: poll or direct fetch
        fallbackFetchOrderChat(orderId)
          .then(onUpdate)
          .catch(() => onUpdate([]));
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error(`[OrderChat] Error creating listener for order ${orderId}:`, err);
    return () => {};
  }
}

/**
 * Fallback one-shot fetch in case of stream connection issue
 */
export async function fallbackFetchOrderChat(orderId: string): Promise<OrderChatMessage[]> {
  try {
    const messagesRef = collection(db, 'orders', orderId, 'chat_messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));
    const snapshot = await getDocs(q);
    const msgs: OrderChatMessage[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      msgs.push({
        id: docSnap.id,
        orderId: data.orderId || orderId,
        senderRole: data.senderRole as OrderChatSenderRole,
        senderId: data.senderId,
        senderName: data.senderName,
        text: data.text || '',
        createdAt: data.createdAt || new Date().toISOString(),
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
        readByCustomer: data.readByCustomer ?? false,
        readByDriver: data.readByDriver ?? false,
      });
    });
    return msgs;
  } catch (e) {
    console.warn(`[OrderChat] Fallback fetch failed:`, e);
    return [];
  }
}

/**
 * Sends a message in the order chat thread.
 */
export async function sendOrderChatMessage(params: {
  orderId: string;
  senderRole: OrderChatSenderRole;
  senderId?: string;
  senderName: string;
  text: string;
}): Promise<boolean> {
  const { orderId, senderRole, senderId, senderName, text } = params;
  const trimmed = text.trim();
  if (!orderId || !trimmed) return false;

  const nowIso = new Date().toISOString();

  try {
    const messagesRef = collection(db, 'orders', orderId, 'chat_messages');
    await addDoc(messagesRef, {
      orderId,
      senderRole,
      senderId: senderId || '',
      senderName: senderName || (senderRole === 'driver' ? 'Domiciliario' : 'Cliente'),
      text: trimmed,
      createdAt: nowIso,
      timestamp: Date.now(),
      readByCustomer: senderRole === 'customer',
      readByDriver: senderRole === 'driver',
    });

    // Update parent order with last chat snippet & increment unread counter
    try {
      const orderRef = doc(db, 'orders', orderId);
      const updates: any = {
        lastChatMessage: trimmed,
        lastChatAt: nowIso,
        lastChatSenderRole: senderRole
      };

      if (senderRole === 'driver') {
        updates.customerUnreadChatCount = increment(1);
      } else if (senderRole === 'customer') {
        updates.driverUnreadChatCount = increment(1);
      }

      await updateDoc(orderRef, updates).catch(() => {});
    } catch (e) {
      // non-blocking
    }

    // Play subtle outgoing pop/chime if available
    playChatChime(false);

    return true;
  } catch (error) {
    console.error(`[OrderChat] Failed to send message:`, error);
    return false;
  }
}

/**
 * Marks messages as read by the specified role
 */
export async function markOrderChatAsRead(orderId: string, role: 'driver' | 'customer'): Promise<void> {
  if (!orderId) return;
  try {
    const orderRef = doc(db, 'orders', orderId);
    if (role === 'driver') {
      await updateDoc(orderRef, { driverUnreadChatCount: 0 }).catch(() => {});
    } else {
      await updateDoc(orderRef, { customerUnreadChatCount: 0 }).catch(() => {});
    }
  } catch (e) {
    // non-blocking
  }
}

/**
 * Plays an audio chime when a message is received or sent
 */
export function playChatChime(isIncoming: boolean = true) {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const freq = isIncoming ? 620 : 780;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (isIncoming) {
      osc.frequency.exponentialRampToValueAtTime(840, ctx.currentTime + 0.12);
    } else {
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
    }

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch (e) {
    // Non-blocking
  }
}
