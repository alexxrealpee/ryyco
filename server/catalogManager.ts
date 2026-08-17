/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
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
}

export interface AvailableCatalog {
  stores: CatalogStore[];
  products: CatalogProduct[];
  catalogUpdatedAt: string;
  version: number;
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
  version: 1
};

// Raw caches for quick rebuild
let rawStoresMap: Map<string, CatalogStore> = new Map();
let rawProductsMap: Map<string, CatalogProduct> = new Map();
let isInitialized = false;
let refreshInterval: NodeJS.Timeout | null = null;

/**
 * Builds the available catalog by strictly filtering:
 * 1. ONLY stores where isClosed === false (strictly excludes isClosed === true)
 * 2. ONLY active/available products belonging to those open stores
 */
export function buildAvailableCatalog(): AvailableCatalog {
  const openStores: CatalogStore[] = [];
  const openStoreUids = new Set<string>();
  const openStoreUsernames = new Set<string>();

  rawStoresMap.forEach((store) => {
    // Strict requirement: isClosed === true means CLOSED. isClosed === false means OPEN.
    if (store.isClosed !== true && !store.suspended) {
      openStores.push({
        ...store,
        isClosed: false
      });
      if (store.uid) openStoreUids.add(store.uid);
      if (store.username) openStoreUsernames.add(store.username.toLowerCase());
    }
  });

  const availableProducts: CatalogProduct[] = [];
  rawProductsMap.forEach((prod) => {
    if (prod.active !== false) {
      const belongsToOpenStore = 
        (prod.userId && openStoreUids.has(prod.userId)) ||
        (prod.storeUsername && openStoreUsernames.has(prod.storeUsername.toLowerCase()));

      if (belongsToOpenStore) {
        // Find matching store info to enrich product
        const matchedStore = openStores.find(s => 
          s.uid === prod.userId || 
          (s.username && prod.storeUsername && s.username.toLowerCase() === prod.storeUsername.toLowerCase())
        );

        availableProducts.push({
          ...prod,
          storeName: matchedStore?.displayName || prod.storeName || 'Restaurante Asociado',
          storeUsername: matchedStore?.username || prod.storeUsername || 'tienda'
        });
      }
    }
  });

  currentAvailableCatalog = {
    stores: openStores,
    products: availableProducts,
    catalogUpdatedAt: new Date().toISOString(),
    version: currentAvailableCatalog.version + 1
  };

  return currentAvailableCatalog;
}

/**
 * Loads and refreshes catalog from Firestore
 */
export async function refreshCatalogFromFirestore(): Promise<AvailableCatalog> {
  try {
    const db = getBackendDb();

    // 1. Fetch all profiles
    const profilesSnap = await getDocs(collection(db, 'profiles')).catch(() => null);
    if (profilesSnap && !profilesSnap.empty) {
      rawStoresMap.clear();
      profilesSnap.forEach(docSnap => {
        const data = docSnap.data() as any;
        const uid = data.uid || docSnap.id;
        rawStoresMap.set(uid, {
          uid,
          username: data.username || uid,
          displayName: data.displayName || data.storeName || data.username || 'Restaurante',
          bio: data.bio || '',
          address: data.address || '',
          phone: data.phone || '',
          whatsapp: data.whatsapp || '',
          isClosed: data.isClosed === true,
          suspended: data.suspended === true
        });
      });
    }

    // 2. Fetch all products
    const productsSnap = await getDocs(collection(db, 'products')).catch(() => null);
    if (productsSnap && !productsSnap.empty) {
      rawProductsMap.clear();
      productsSnap.forEach(docSnap => {
        const data = docSnap.data() as any;
        rawProductsMap.set(docSnap.id, {
          id: docSnap.id,
          userId: data.userId || '',
          name: data.name || 'Producto',
          description: data.description || '',
          price: typeof data.price === 'number' ? data.price : parseFloat(data.price) || 0,
          stock: typeof data.stock === 'number' ? data.stock : parseInt(data.stock) || 0,
          category: data.category || 'General',
          imageURL: data.imageURL || '',
          storeName: data.storeName || '',
          storeUsername: data.storeUsername || '',
          active: data.active !== false,
          variants: data.variants || [],
          options: data.options || []
        });
      });
    }

    return buildAvailableCatalog();
  } catch (err) {
    console.warn("Backend Firestore catalog refresh notice:", err);
    return buildAvailableCatalog();
  }
}

/**
 * Initializes the backend catalog manager with 5-minute auto-refresh and real-time Firestore listeners
 */
export function initBackendCatalogManager() {
  if (isInitialized) return;
  isInitialized = true;

  // Initial load
  refreshCatalogFromFirestore().catch(() => {});

  // 5-Minute fallback sync interval
  refreshInterval = setInterval(() => {
    refreshCatalogFromFirestore().catch(() => {});
  }, 5 * 60 * 1000); // exactly 5 minutes

  // Attach Real-Time Firestore listeners for instantaneous store state & product changes
  try {
    const db = getBackendDb();

    // Listen to profiles collection
    onSnapshot(collection(db, 'profiles'), (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data() as any;
        const uid = data.uid || change.doc.id;

        if (change.type === 'removed') {
          rawStoresMap.delete(uid);
        } else {
          rawStoresMap.set(uid, {
            uid,
            username: data.username || uid,
            displayName: data.displayName || data.storeName || data.username || 'Restaurante',
            bio: data.bio || '',
            address: data.address || '',
            phone: data.phone || '',
            whatsapp: data.whatsapp || '',
            isClosed: data.isClosed === true,
            suspended: data.suspended === true
          });
        }
      });
      // Immediately rebuild catalog upon any store status change (e.g. isClosed: false -> true)
      buildAvailableCatalog();
    }, (err) => {
      console.warn("Firestore backend profiles listener notice:", err);
    });

    // Listen to products collection
    onSnapshot(collection(db, 'products'), (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data() as any;
        if (change.type === 'removed') {
          rawProductsMap.delete(change.doc.id);
        } else {
          rawProductsMap.set(change.doc.id, {
            id: change.doc.id,
            userId: data.userId || '',
            name: data.name || 'Producto',
            description: data.description || '',
            price: typeof data.price === 'number' ? data.price : parseFloat(data.price) || 0,
            stock: typeof data.stock === 'number' ? data.stock : parseInt(data.stock) || 0,
            category: data.category || 'General',
            imageURL: data.imageURL || '',
            storeName: data.storeName || '',
            storeUsername: data.storeUsername || '',
            active: data.active !== false,
            variants: data.variants || [],
            options: data.options || []
          });
        }
      });
      buildAvailableCatalog();
    }, (err) => {
      console.warn("Firestore backend products listener notice:", err);
    });
  } catch (err) {
    console.warn("Could not attach backend Firestore listeners, relying on 5-minute interval:", err);
  }
}

/**
 * Returns the latest Available Catalog
 */
export function getAvailableCatalog(): AvailableCatalog {
  return currentAvailableCatalog;
}

/**
 * Allows client-side synchronization updates
 */
export function syncCatalogFromClient(stores: CatalogStore[], products: CatalogProduct[]): AvailableCatalog {
  if (Array.isArray(stores) && stores.length > 0) {
    stores.forEach(s => {
      if (s.uid) {
        rawStoresMap.set(s.uid, {
          ...s,
          isClosed: s.isClosed === true
        });
      }
    });
  }
  if (Array.isArray(products) && products.length > 0) {
    products.forEach(p => {
      if (p.id) {
        rawProductsMap.set(p.id, p);
      }
    });
  }
  return buildAvailableCatalog();
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
