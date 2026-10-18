import { resolveProductStore } from '../src/lib/catalogProducts';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import fs from 'fs';
import path from 'path';
import { externalizeCatalogImages, writeCatalogCaches } from './catalogAssets.mjs';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc,
  onSnapshot
} from 'firebase/firestore';

export interface CatalogProduct {
  id: string;
  userId: string;
  name: string;
  description?: string;
  price: number;
  stock?: number;
  category?: string;
  imageURL?: string;
  storeName?: string;
  storeUsername?: string;
  active?: boolean;
  variants?: Array<{ name: string; price: number; options?: string[] }>;
  options?: Array<{ name: string; choices: string[] }>;
  addons?: Array<{ id: string; name: string; price: number }>;
  packagingCost?: number;
  variantsText?: string;
  variantPrices?: Record<string, number>;
  allowsHalfAndHalf?: boolean;
  flavorsText?: string;
  flavorsList?: string[];
  allowSingleFlavor?: boolean;
  [key: string]: any;
}

export interface CatalogStore {
  uid: string;
  username: string;
  displayName: string;
  bio?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  isClosed: boolean;
  suspended?: boolean;
  photoURL?: string;
  bannerURL?: string;
  deliveryFee?: number;
  schedule?: any;
  [key: string]: any;
}

export interface AvailableCatalog {
  stores: CatalogStore[];
  products: CatalogProduct[];
  catalogUpdatedAt: string;
  version: number;
  complete: boolean;
}

const firebaseConfig = {
  projectId: "studio-9002217802-13e05",
  appId: "1:420228694243:web:ba7bb9daa9aba66f0285d6",
  apiKey: "AIzaSyDSK4fAbGpJ59_OXSzvrDH4rDLj9gYP5b8",
  authDomain: "studio-9002217802-13e05.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-be9196c8-7041-4ba9-b337-ca71c1485d15",
  storageBucket: "studio-9002217802-13e05.firebasestorage.app",
  messagingSenderId: "420228694243"
};

// Singleton Firebase initialization on backend
let firestoreDb: any = null;

function getBackendDb() {
  if (!firestoreDb) {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
  return firestoreDb;
}

// In-Memory Catalog Cache
let currentAvailableCatalog: AvailableCatalog = {
  stores: [],
  products: [],
  catalogUpdatedAt: new Date().toISOString(),
  complete: false,
  version: 1
};

// Raw caches for quick rebuild
let rawStoresMap: Map<string, CatalogStore> = new Map();
let rawProductsMap: Map<string, CatalogProduct> = new Map();
let isInitialized = false;
let profilesConfirmed = false;
let productsConfirmed = false;
let listenerFailed = false;
let stopProfiles: (() => void) | undefined;
let stopProducts: (() => void) | undefined;
let pendingConfirmation: Promise<AvailableCatalog> | null = null;
const confirmationWaiters = new Set<() => void>();

function getColombiaCurrentDayAndMinutes(): { dayId: string; dayIndex: number; currentMinutes: number } {
  const DAY_IDS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
      weekday: 'short'
    });
    const parts = formatter.formatToParts(new Date());
    const weekdayPart = parts.find(p => p.type === 'weekday')?.value;
    const hourPart = parts.find(p => p.type === 'hour')?.value;
    const minutePart = parts.find(p => p.type === 'minute')?.value;
    
    const weekdayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
    };
    const dayIndex = (weekdayPart && weekdayMap[weekdayPart] !== undefined) ? weekdayMap[weekdayPart] : new Date().getDay();
    const dayId = DAY_IDS[dayIndex] || 'lunes';
    
    const bH = hourPart ? parseInt(hourPart, 10) : new Date().getHours();
    const bM = minutePart ? parseInt(minutePart, 10) : new Date().getMinutes();
    const currentMinutes = (!isNaN(bH) && !isNaN(bM)) ? (bH % 24) * 60 + bM : (new Date().getHours() * 60 + new Date().getMinutes());

    return { dayId, dayIndex, currentMinutes };
  } catch {
    const now = new Date();
    const dayIndex = now.getDay();
    const dayId = DAY_IDS[dayIndex] || 'lunes';
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return { dayId, dayIndex, currentMinutes };
  }
}

export function isStoreCurrentlyClosed(profile: any): boolean {
  if (!profile) return true;

  // 1. Explicitly suspended or expired subscription
  if (
    profile.suspended === true || 
    profile.subscriptionStatus === 'suspended' || 
    profile.subscriptionStatus === 'expired'
  ) {
    return true;
  }

  // 2. Paid subscription expiration check
  const now = Date.now();
  const hasValidPaidUntil = !!(
    profile.subscriptionPaidUntil && 
    !isNaN(new Date(profile.subscriptionPaidUntil).getTime()) && 
    new Date(profile.subscriptionPaidUntil).getTime() >= now
  );

  if (!hasValidPaidUntil) {
    if (profile.subscriptionStatus !== 'active' && profile.subscriptionStatus !== 'under_review') {
      if (profile.subscriptionTrialExpires) {
        const trialExp = new Date(profile.subscriptionTrialExpires).getTime();
        if (!isNaN(trialExp) && trialExp < now) {
          return true;
        }
      }
    }
  }

  // 3. Manual override
  if (profile.isClosed === true) return true;

  // 4. Operating hours schedule check
  if (profile.scheduleEnabled === true) {
    try {
      const { dayId, dayIndex, currentMinutes } = getColombiaCurrentDayAndMinutes();
      const DAY_IDS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

      // Custom weeklySchedule
      if (profile.weeklySchedule && typeof profile.weeklySchedule === 'object') {
        const todaySched = profile.weeklySchedule[dayId];
        
        // Check overnight shift from yesterday
        const prevDayIndex = (dayIndex + 6) % 7;
        const prevDayId = DAY_IDS[prevDayIndex];
        const prevSched = profile.weeklySchedule[prevDayId];
        let coveredByPrevDayOvernight = false;

        if (prevSched && prevSched.isOpen && prevSched.openTime && prevSched.closeTime) {
          const [pO_H, pO_M] = prevSched.openTime.split(':').map((n: string) => parseInt(n, 10));
          const [pC_H, pC_M] = prevSched.closeTime.split(':').map((n: string) => parseInt(n, 10));
          if (!isNaN(pO_H) && !isNaN(pO_M) && !isNaN(pC_H) && !isNaN(pC_M)) {
            const prevOpenM = pO_H * 60 + pO_M;
            const prevCloseM = pC_H * 60 + pC_M;
            if (prevCloseM < prevOpenM && currentMinutes < prevCloseM) {
              coveredByPrevDayOvernight = true;
            }
          }
        }

        if (coveredByPrevDayOvernight) {
          return false; // Open right now!
        }

        if (!todaySched || !todaySched.isOpen) {
          return true; // Closed today
        }

        if (todaySched.openTime && todaySched.closeTime) {
          const [oH, oM] = todaySched.openTime.split(':').map((n: string) => parseInt(n, 10));
          const [cH, cM] = todaySched.closeTime.split(':').map((n: string) => parseInt(n, 10));
          if (!isNaN(oH) && !isNaN(oM) && !isNaN(cH) && !isNaN(cM)) {
            const openM = oH * 60 + oM;
            const closeM = cH * 60 + cM;
            if (closeM < openM) {
              if (currentMinutes < openM && currentMinutes >= closeM) {
                return true;
              }
            } else {
              if (currentMinutes < openM || currentMinutes >= closeM) {
                return true;
              }
            }
          }
        }
      } else if (profile.openTime && profile.closeTime) {
        const [oH, oM] = profile.openTime.split(':').map((n: string) => parseInt(n, 10));
        const [cH, cM] = profile.closeTime.split(':').map((n: string) => parseInt(n, 10));
        if (!isNaN(oH) && !isNaN(oM) && !isNaN(cH) && !isNaN(cM)) {
          const openM = oH * 60 + oM;
          const closeM = cH * 60 + cM;
          if (closeM < openM) {
            if (currentMinutes < openM && currentMinutes >= closeM) {
              return true;
            }
          } else {
            if (currentMinutes < openM || currentMinutes >= closeM) {
              return true;
            }
          }
        }
      }
    } catch (e) {
      console.error("Error evaluating store schedule on backend:", e);
    }
  }

  return false;
}

/**
 * Builds the available catalog by strictly filtering:
 * 1. ONLY stores where isClosed === false (strictly excludes isClosed === true)
 * 2. ONLY active/available products belonging to those open stores
 */
export function buildAvailableCatalog(): AvailableCatalog {
  const openStores: CatalogStore[] = [];
  const openStoreUids = new Set<string>();

  rawStoresMap.forEach((store) => {
    // Re-evaluate live store closed/open status (operating hours schedule, manual toggle, subscription)
    const isClosed = isStoreCurrentlyClosed(store);
    if (!isClosed && !store.suspended) {
      openStores.push({
        ...store,
        isClosed: false
      });
      if (store.uid) openStoreUids.add(store.uid);
    }
  });

  const availableProducts: CatalogProduct[] = [];
  rawProductsMap.forEach(prod => {
    const owner = resolveProductStore(prod, Array.from(rawStoresMap.values()));
    if (prod.active !== false && owner && openStoreUids.has(owner.uid)) {
      availableProducts.push({ ...prod, userId: owner.uid,
        storeName: owner.displayName, storeUsername: owner.username });
    }
  });

  currentAvailableCatalog = {
    complete: profilesConfirmed && productsConfirmed,
    stores: openStores,
    products: availableProducts,
    catalogUpdatedAt: new Date().toISOString(),
    version: currentAvailableCatalog.version + 1
  };

  try {
    const directories = [path.join(process.cwd(), 'public')];
    if (fs.existsSync(path.join(process.cwd(), 'dist'))) {
      directories.push(path.join(process.cwd(), 'dist'));
    }
    currentAvailableCatalog = externalizeCatalogImages(currentAvailableCatalog, directories);
    if (currentAvailableCatalog.complete) writeCatalogCaches(currentAvailableCatalog, directories);
  } catch (e) {}

  return currentAvailableCatalog;
}

/**
 * Loads and refreshes catalog from Firestore
 */
export async function refreshCatalogFromFirestore(): Promise<AvailableCatalog> {
  initBackendCatalogManager();
  if (profilesConfirmed && productsConfirmed) return getAvailableCatalog();
  // All callers await the existing listeners, without repeating collection reads.
  if (!pendingConfirmation) {
    pendingConfirmation = new Promise<AvailableCatalog>((resolve, reject) => {
      const done = () => {
        if (!profilesConfirmed || !productsConfirmed) return;
        clearTimeout(deadline);
        confirmationWaiters.delete(done);
        resolve(getAvailableCatalog());
      };
      const deadline = setTimeout(() => {
        confirmationWaiters.delete(done);
        reject(Error('Firestore did not confirm both catalog collections'));
      }, 8000);
      confirmationWaiters.add(done);
      done();
    }).finally(() => { pendingConfirmation = null; });
  }
  return pendingConfirmation;
}

/** One listener per collection. Metadata, errors and empty snapshots are significant. */
export function initBackendCatalogManager() {
  if (isInitialized && !listenerFailed) return;
  stopProfiles?.();
  stopProducts?.();
  isInitialized = true;
  listenerFailed = false;
  profilesConfirmed = productsConfirmed = false;
  const db = getBackendDb();
  const fail = (collectionName: string, error: any) => {
    if (collectionName === 'profiles') profilesConfirmed = false;
    else productsConfirmed = false;
    listenerFailed = true;
    currentAvailableCatalog.complete = false;
    console.warn('Firestore backend catalog listener:', collectionName, error.code || 'unavailable');
  };
  const publish = () => {
    if (!profilesConfirmed || !productsConfirmed) {
      currentAvailableCatalog.complete = false;
      return;
    }
    buildAvailableCatalog();
    confirmationWaiters.forEach(done => done());
  };
  stopProfiles = onSnapshot(collection(db, 'profiles'), { includeMetadataChanges: true }, snapshot => {
    profilesConfirmed = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
    if (profilesConfirmed) {
      rawStoresMap.clear();
      snapshot.forEach(doc => {
        const data = doc.data();
        const uid = data.uid || doc.id;
        rawStoresMap.set(uid, { ...data, uid, username: data.username || uid,
          displayName: data.displayName || data.storeName || data.username || 'Restaurante',
          // Persist only the manual flag; schedules are evaluated at build time.
          isClosed: data.isClosed === true });
      });
    }
    publish();
  }, error => fail('profiles', error));
  stopProducts = onSnapshot(collection(db, 'products'), { includeMetadataChanges: true }, snapshot => {
    productsConfirmed = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
    if (productsConfirmed) {
      rawProductsMap.clear();
      snapshot.forEach(doc => {
        const data = doc.data();
        // Preserve owner aliases, creation order and all product options.
        rawProductsMap.set(doc.id, { ...data, id: doc.id, userId: data.userId || '',
          storeUsername: data.storeUsername || '', name: data.name || 'Producto',
          price: Number(data.price) || 0, active: data.active !== false });
      });
    }
    publish();
  }, error => fail('products', error));
}

let lastCatalogBuildTime = 0;

/**
 * Returns the latest Available Catalog
 */
export function getAvailableCatalog(): AvailableCatalog {
  const now = Date.now();
  // If more than 15s elapsed, re-evaluate operating hours/schedules against live clock
  if (now - lastCatalogBuildTime > 15 * 1000 && rawStoresMap.size > 0) {
    lastCatalogBuildTime = now;
    buildAvailableCatalog();
  }
  return currentAvailableCatalog;
}

/**
 * Allows client-side synchronization updates
 */
export function syncCatalogFromClient(stores: CatalogStore[], products: CatalogProduct[]): AvailableCatalog {
  // Client submissions are not proof of server completeness; listeners own this cache.
  return getAvailableCatalog();
}

/**
 * Real-time Validation against Firestore before Cart Add or Quantity Change
 */
export async function validateProductForCart(productId: string, storeIdOrUsername?: string): Promise<{
  valid: boolean;
  reason?: string;
  product?: CatalogProduct;
  store?: CatalogStore;
}> {
  try {
    const db = getBackendDb();

    // 1. Fetch live product from Firestore
    let productData: any = null;
    try {
      const prodDoc = await getDoc(doc(db, 'products', productId));
      if (prodDoc.exists()) {
        productData = { id: prodDoc.id, ...prodDoc.data() };
      }
    } catch (e) {}

    if (!productData) {
      productData = rawProductsMap.get(productId);
    }

    if (!productData || productData.active === false) {
      return { valid: false, reason: "El producto no existe o se encuentra inactivo." };
    }

    // 2. Fetch live store profile from Firestore
    const storeUid = productData.userId || storeIdOrUsername;
    let storeData: any = null;

    if (storeUid) {
      try {
        const storeDoc = await getDoc(doc(db, 'profiles', storeUid));
        if (storeDoc.exists()) {
          storeData = { uid: storeDoc.id, ...storeDoc.data() };
        }
      } catch (e) {}

      if (!storeData) {
        storeData = rawStoresMap.get(storeUid);
      }
    }

    // 3. Strict Check: isClosed === true
    if (storeData && storeData.isClosed === true) {
      const storeName = storeData.displayName || storeData.storeName || storeData.username || 'La tienda';
      return { 
        valid: false, 
        reason: `${storeName} se encuentra actualmente cerrada y no puede recibir pedidos.` 
      };
    }

    return {
      valid: true,
      product: productData,
      store: storeData
    };
  } catch (err: any) {
    return { valid: true }; // Permissive fallback on network error
  }
}

/**
 * Real-time Validation against Firestore before Order Confirmation / Creation
 */
export async function validateOrderPayload(orderItems: Array<{ productId: string; quantity: number; price?: number }>, storeOwnerId?: string): Promise<{
  valid: boolean;
  reason?: string;
  errors?: string[];
}> {
  try {
    const db = getBackendDb();
    const errors: string[] = [];

    // 1. Verify Store is NOT Closed
    if (storeOwnerId) {
      let storeData: any = null;
      try {
        const sDoc = await getDoc(doc(db, 'profiles', storeOwnerId));
        if (sDoc.exists()) {
          storeData = sDoc.data();
        }
      } catch (e) {}

      if (!storeData) {
        storeData = rawStoresMap.get(storeOwnerId);
      }

      if (storeData && storeData.isClosed === true) {
        const storeName = storeData.displayName || storeData.storeName || storeData.username || 'El restaurante';
        return {
          valid: false,
          reason: `No se puede procesar el pedido porque ${storeName} se encuentra cerrado actualmente.`,
          errors: [`Tienda cerrada: ${storeName}`]
        };
      }
    }

    // 2. Verify all items are active and from open stores
    for (const item of orderItems) {
      let prodData: any = null;
      try {
        const pDoc = await getDoc(doc(db, 'products', item.productId));
        if (pDoc.exists()) {
          prodData = pDoc.data();
        }
      } catch (e) {}

      if (!prodData) {
        prodData = rawProductsMap.get(item.productId);
      }

      if (!prodData || prodData.active === false) {
        errors.push(`El producto "${item.productId}" ya no está disponible.`);
        continue;
      }

      const itemStoreUid = prodData.userId || storeOwnerId;
      if (itemStoreUid) {
        let sData: any = null;
        try {
          const sDoc = await getDoc(doc(db, 'profiles', itemStoreUid));
          if (sDoc.exists()) {
            sData = sDoc.data();
          }
        } catch (e) {}

        if (!sData) {
          sData = rawStoresMap.get(itemStoreUid);
        }

        if (sData && sData.isClosed === true) {
          const sName = sData.displayName || sData.username || 'El restaurante';
          errors.push(`El restaurante "${sName}" del producto "${prodData.name}" está cerrado.`);
        }
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        reason: errors[0],
        errors
      };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: true };
  }
}

/**
 * Fetch global system settings on backend
 */
export async function fetchBackendSystemSettings() {
  try {
    const db = getBackendDb();
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) {
      return { defaultDeliveryFee: 7000, ...snap.data() };
    }
  } catch (err) {
    console.warn("Backend settings fetch warning:", err);
  }
  return { defaultDeliveryFee: 7000, adminEmails: ["alexxrealpee@gmail.com"] };
}

/**
 * Fetch user profile on backend
 */
export async function fetchBackendUserProfile(uid: string) {
  try {
    const db = getBackendDb();
    const snap = await getDoc(doc(db, 'profiles', uid));
    if (snap.exists()) {
      return { uid, ...snap.data() };
    }
  } catch (err) {
    console.warn("Backend user profile fetch warning:", err);
  }
  return null;
}
