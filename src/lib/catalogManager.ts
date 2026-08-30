/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, checkIsStoreClosed, findStoreForProduct } from './firebase';
import { ProductItem, UserProfile } from '../types';

export interface ClientAvailableCatalog {
  stores: UserProfile[];
  products: ProductItem[];
  profilesMap: Record<string, UserProfile>;
  catalogUpdatedAt: string;
  version: number;
}

export const CATALOG_UPDATED_EVENT = 'linnk:available_catalog_updated';

// In-Memory Client Available Catalog
let clientAvailableCatalog: ClientAvailableCatalog = {
  stores: [],
  products: [],
  profilesMap: {},
  catalogUpdatedAt: new Date().toISOString(),
  version: 1
};

// Raw caches
const rawProfilesMap = new Map<string, UserProfile>();
const rawProductsMap = new Map<string, ProductItem>();
let isClientInitialized = false;
const catalogListeners: Array<(catalog: ClientAvailableCatalog) => void> = [];

/**
 * Rebuilds client availableCatalog:
 * Strictly keeps ONLY stores where isClosed === false (not true) and their active products.
 */
export function rebuildClientAvailableCatalog(): ClientAvailableCatalog {
  const openStores: UserProfile[] = [];
  const profilesMap: Record<string, UserProfile> = {};
  const openStoreUids = new Set<string>();
  const openStoreUsernames = new Set<string>();

  rawProfilesMap.forEach((prof, key) => {
    const isSuspended = prof.suspended === true || prof.subscriptionStatus === 'suspended' || prof.subscriptionStatus === 'expired';
    const isClosed = isSuspended || prof.isClosed === true || checkIsStoreClosed(prof);

    // isClosed === true || suspended -> CLOSED / HIDDEN from clients
    // isClosed === false -> OPEN
    if (!isClosed && !isSuspended) {
      const cleanProf: UserProfile = {
        ...prof,
        isClosed: false,
        suspended: false
      };
      if (prof.uid && !openStoreUids.has(prof.uid)) {
        openStores.push(cleanProf);
        openStoreUids.add(prof.uid);
      }
      if (prof.username) {
        openStoreUsernames.add(prof.username.toLowerCase());
      }
      profilesMap[key] = cleanProf;
      if (prof.uid) profilesMap[prof.uid] = cleanProf;
      if (prof.username) profilesMap[prof.username.toLowerCase()] = cleanProf;
    }
  });

  const availableProducts: ProductItem[] = [];
  rawProductsMap.forEach((prod) => {
    if (prod.active !== false) {
      const isStoreOpen = 
        (prod.userId && openStoreUids.has(prod.userId)) ||
        (prod.storeUsername && openStoreUsernames.has(prod.storeUsername.toLowerCase()));

      if (isStoreOpen) {
        const matchedStore = findStoreForProduct(prod, profilesMap);
        availableProducts.push({
          ...prod,
          storeName: matchedStore?.displayName || prod.storeName || 'Restaurante Asociado',
          storeUsername: matchedStore?.username || prod.storeUsername || 'tienda'
        });
      }
    }
  });

  clientAvailableCatalog = {
    stores: openStores,
    products: availableProducts,
    profilesMap,
    catalogUpdatedAt: new Date().toISOString(),
    version: clientAvailableCatalog.version + 1
  };

  // Dispatch custom window event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT, { detail: clientAvailableCatalog }));
  }

  // Notify registered callbacks
  catalogListeners.forEach(listener => {
    try {
      listener(clientAvailableCatalog);
    } catch (e) {}
  });

  // Push immediate sync to backend server cache
  syncWithBackendServer(openStores, availableProducts).catch(() => {});

  return clientAvailableCatalog;
}

/**
 * Pushes client state to backend server cache to keep both in absolute parity
 */
async function syncWithBackendServer(stores: UserProfile[], products: ProductItem[]) {
  try {
    await fetch('/api/catalog/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stores: stores.map(s => ({
          uid: s.uid,
          username: s.username,
          displayName: s.displayName,
          bio: s.bio,
          isClosed: s.isClosed === true,
          suspended: s.suspended === true
        })),
        products: products.map(p => ({
          id: p.id,
          userId: p.userId,
          name: p.name,
          description: p.description,
          price: p.price,
          category: p.category,
          storeName: p.storeName,
          storeUsername: p.storeUsername,
          active: p.active !== false
        }))
      })
    }).catch(() => {});
  } catch (e) {}
}

/**
 * Initializes real-time Firebase listeners and 5-minute background refresh
 */
export function initClientCatalogManager(): () => void {
  if (isClientInitialized) return () => {};
  isClientInitialized = true;

  // 1. Initial snapshot fetch
  fetchCatalogData();

  // 2. Real-time Firebase listeners for instantaneous updates (isClosed: false <-> true, stock, prices)
  let unsubProfiles = () => {};
  let unsubProducts = () => {};

  try {
    unsubProfiles = onSnapshot(collection(db, 'profiles'), (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data() as UserProfile;
        const uid = data.uid || change.doc.id;

        if (change.type === 'removed') {
          rawProfilesMap.delete(uid);
          if (data.username) rawProfilesMap.delete(data.username.toLowerCase());
        } else {
          const profileObj: UserProfile = {
            ...data,
            uid,
            isClosed: data.isClosed === true
          };
          rawProfilesMap.set(uid, profileObj);
          if (data.username) rawProfilesMap.set(data.username.toLowerCase(), profileObj);
        }
      });
      rebuildClientAvailableCatalog();
    }, (err) => {
      console.warn("Firestore profiles real-time listener notice:", err);
    });

    unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data() as ProductItem;
        if (change.type === 'removed') {
          rawProductsMap.delete(change.doc.id);
        } else {
          rawProductsMap.set(change.doc.id, {
            id: change.doc.id,
            ...data,
            name: data.name || 'Producto',
            price: typeof data.price === 'number' && !isNaN(data.price) ? data.price : parseFloat(data.price as any) || 0,
            active: data.active !== false
          });
        }
      });
      rebuildClientAvailableCatalog();
    }, (err) => {
      console.warn("Firestore products real-time listener notice:", err);
    });
  } catch (err) {
    console.warn("Could not attach Firestore listeners on client:", err);
  }

  // 3. 5-Minute Fallback Refresh Timer
  const intervalId = setInterval(() => {
    fetchCatalogData();
  }, 5 * 60 * 1000);

  return () => {
    unsubProfiles();
    unsubProducts();
    clearInterval(intervalId);
  };
}

/**
 * Full fetch from Firestore and merge with local session caches
 */
export async function fetchCatalogData(): Promise<ClientAvailableCatalog> {
  try {
    // 1. Fetch profiles
    try {
      const profilesSnap = await getDocs(collection(db, 'profiles'));
      if (profilesSnap && !profilesSnap.empty) {
        profilesSnap.forEach(docSnap => {
          const data = docSnap.data() as UserProfile;
          const uid = data.uid || docSnap.id;
          const profileObj: UserProfile = {
            ...data,
            uid,
            isClosed: data.isClosed === true
          };
          rawProfilesMap.set(uid, profileObj);
          if (data.username) rawProfilesMap.set(data.username.toLowerCase(), profileObj);
        });
      }
    } catch (e) {}

    // 2. Fetch products
    try {
      const productsSnap = await getDocs(collection(db, 'products'));
      if (productsSnap && !productsSnap.empty) {
        productsSnap.forEach(docSnap => {
          const data = docSnap.data() as ProductItem;
          rawProductsMap.set(docSnap.id, {
            id: docSnap.id,
            ...data,
            name: data.name || 'Producto',
            price: typeof data.price === 'number' && !isNaN(data.price) ? data.price : parseFloat(data.price as any) || 0,
            active: data.active !== false
          });
        });
      }
    } catch (e) {}

    return rebuildClientAvailableCatalog();
  } catch (e) {
    return rebuildClientAvailableCatalog();
  }
}

/**
 * Returns the currently active Client Available Catalog
 */
export function getClientAvailableCatalog(): ClientAvailableCatalog {
  if (clientAvailableCatalog.stores.length === 0 && clientAvailableCatalog.products.length === 0) {
    // If empty, initiate fetch
    fetchCatalogData().catch(() => {});
  }
  return clientAvailableCatalog;
}

/**
 * Subscribe to catalog updates
 */
export function subscribeToAvailableCatalog(callback: (catalog: ClientAvailableCatalog) => void): () => void {
  catalogListeners.push(callback);
  // Send initial state immediately
  callback(getClientAvailableCatalog());
  return () => {
    const idx = catalogListeners.indexOf(callback);
    if (idx !== -1) catalogListeners.splice(idx, 1);
  };
}

/**
 * Real-time Validation against Firestore before Cart Add or Quantity Change
 */
export async function validateStoreAndProductBeforeCart(productId: string, storeId?: string): Promise<{
  valid: boolean;
  reason?: string;
}> {
  try {
    // 1. Check in local availableCatalog first
    const catalog = getClientAvailableCatalog();
    const product = catalog.products.find(p => p.id === productId);

    // 2. Real-time Firestore check for store's isClosed status
    const targetStoreId = product?.userId || storeId;
    if (targetStoreId) {
      try {
        const storeDoc = await getDoc(doc(db, 'profiles', targetStoreId));
        if (storeDoc.exists()) {
          const data = storeDoc.data() as UserProfile;
          if (data.isClosed === true) {
            const storeName = data.displayName || data.username || 'El restaurante';
            return {
              valid: false,
              reason: `${storeName} se encuentra actualmente cerrado y no puede recibir pedidos.`
            };
          }
        }
      } catch (e) {}
    }

    if (!product && productId) {
      // Check if product exists in raw list
      const rawProd = rawProductsMap.get(productId);
      if (rawProd) {
        const store = rawProfilesMap.get(rawProd.userId);
        if (store && store.isClosed === true) {
          return {
            valid: false,
            reason: `${store.displayName || store.username} se encuentra cerrado.`
          };
        }
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: true };
  }
}

/**
 * Real-time Validation against Firestore before Order Confirmation
 */
export async function validateCartBeforeOrder(cartItems: Array<{ product: ProductItem; quantity: number }>): Promise<{
  valid: boolean;
  reason?: string;
}> {
  try {
    for (const item of cartItems) {
      const storeId = item.product.userId;
      if (storeId) {
        try {
          const storeDoc = await getDoc(doc(db, 'profiles', storeId));
          if (storeDoc.exists()) {
            const storeData = storeDoc.data() as UserProfile;
            if (storeData.isClosed === true) {
              const sName = storeData.displayName || storeData.username || 'El restaurante';
              return {
                valid: false,
                reason: `No podemos completar tu pedido porque ${sName} se encuentra cerrado en este momento.`
              };
            }
          }
        } catch (e) {}
      }

      // Check product is active
      try {
        const prodDoc = await getDoc(doc(db, 'products', item.product.id));
        if (prodDoc.exists()) {
          const prodData = prodDoc.data() as ProductItem;
          if (prodData.active === false) {
            return {
              valid: false,
              reason: `El producto "${item.product.name}" ya no se encuentra disponible.`
            };
          }
        }
      } catch (e) {}
    }

    return { valid: true };
  } catch (err) {
    return { valid: true };
  }
}
