/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, checkIsStoreClosed, findStoreForProduct } from './firebase';
import { ProductItem, UserProfile } from '../types';
import { smartApiFetch } from './apiConfig';

export interface ClientAvailableCatalog {
  stores: UserProfile[];
  products: ProductItem[];
  profilesMap: Record<string, UserProfile>;
  catalogUpdatedAt: string;
  version: number;
  isLoaded: boolean;
}

export const CATALOG_UPDATED_EVENT = 'linnk:available_catalog_updated';
const SESSION_CATALOG_STORAGE_KEY = 'ryyco_open_catalog_json';

// In-Memory Open Stores Catalog Singleton (Accessible in 0ms by AI during conversation)
let clientAvailableCatalog: ClientAvailableCatalog = initInMemoryFromStorage();
let isClientInitialized = false;
let inFlightPromise: Promise<ClientAvailableCatalog> | null = null;
const catalogListeners: Array<(catalog: ClientAvailableCatalog) => void> = [];

/**
 * Fast synchronous initializer: reads warm session storage if available
 * so the catalog is ready in memory in 0ms without waiting for network.
 */
function initInMemoryFromStorage(): ClientAvailableCatalog {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(SESSION_CATALOG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.stores) && Array.isArray(parsed.products)) {
          return {
            stores: parsed.stores,
            products: parsed.products,
            profilesMap: parsed.profilesMap || {},
            catalogUpdatedAt: parsed.catalogUpdatedAt || new Date().toISOString(),
            version: parsed.version || 1,
            isLoaded: true
          };
        }
      }
    }
  } catch (e) {}

  return {
    stores: [],
    products: [],
    profilesMap: {},
    catalogUpdatedAt: new Date().toISOString(),
    version: 1,
    isLoaded: false
  };
}

/**
 * Persists current in-memory catalog to session storage
 */
function persistToSessionStorage(catalog: ClientAvailableCatalog) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(SESSION_CATALOG_STORAGE_KEY, JSON.stringify({
        stores: catalog.stores,
        products: catalog.products,
        profilesMap: catalog.profilesMap,
        catalogUpdatedAt: catalog.catalogUpdatedAt,
        version: catalog.version
      }));
    }
  } catch (e) {}
}

/**
 * Updates the in-memory catalog and notifies listeners
 */
function updateInMemoryCatalog(
  stores: UserProfile[], 
  products: ProductItem[], 
  profilesMap: Record<string, UserProfile>
): ClientAvailableCatalog {
  clientAvailableCatalog = {
    stores,
    products,
    profilesMap,
    catalogUpdatedAt: new Date().toISOString(),
    version: clientAvailableCatalog.version + 1,
    isLoaded: true
  };

  persistToSessionStorage(clientAvailableCatalog);

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

  return clientAvailableCatalog;
}

/**
 * Background fetcher:
 * 1. Executes in the background without blocking the UI rendering.
 * 2. Downloads ONLY open restaurants (isClosed === false) and their active products.
 * 3. Keeps the resulting JSON in memory for the voice & text AI.
 */
export async function loadOpenStoresCatalogInBackground(forceRefresh: boolean = false): Promise<ClientAvailableCatalog> {
  // If already loaded and not forcing refresh, return in-memory immediately
  if (!forceRefresh && clientAvailableCatalog.isLoaded && clientAvailableCatalog.stores.length > 0) {
    return clientAvailableCatalog;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    try {
      // 1. Primary Strategy: Download the pre-built open-stores JSON from server endpoint
      try {
        const res = await smartApiFetch('/api/catalog/available');
        if (res && res.ok) {
          const data = await res.json();
          if (data && data.success && data.catalog) {
            const serverStores: any[] = data.catalog.stores || [];
            const serverProducts: any[] = data.catalog.products || [];

            const formattedStores: UserProfile[] = [];
            const profilesMap: Record<string, UserProfile> = {};

            serverStores.forEach((s: any) => {
              const prof: UserProfile = {
                uid: s.uid,
                email: s.email || '',
                username: s.username || '',
                displayName: s.displayName || s.username || 'Restaurante',
                bio: s.bio || '',
                address: s.address || '',
                phone: s.phone || '',
                whatsapp: s.whatsapp || '',
                role: 'user',
                plan: 'pro',
                createdAt: s.createdAt || new Date().toISOString(),
                isClosed: false,
                suspended: false
              };
              formattedStores.push(prof);
              if (prof.uid) profilesMap[prof.uid] = prof;
              if (prof.username) profilesMap[prof.username.toLowerCase()] = prof;
            });

            const formattedProducts: ProductItem[] = serverProducts.map((p: any) => ({
              id: p.id,
              userId: p.userId,
              name: p.name || 'Producto',
              description: p.description || '',
              price: typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0,
              stock: typeof p.stock === 'number' ? p.stock : parseInt(p.stock) || 0,
              category: p.category || 'General',
              imageURL: p.imageURL || '',
              storeName: p.storeName || 'Restaurante Asociado',
              storeUsername: p.storeUsername || 'tienda',
              active: true,
              variants: p.variants,
              options: p.options
            }));

            return updateInMemoryCatalog(formattedStores, formattedProducts, profilesMap);
          }
        }
      } catch (apiErr) {
        console.warn("Server catalog download notice, falling back to direct background query:", apiErr);
      }

      // 2. Fallback Strategy: Direct query to Firestore in background
      const openStores: UserProfile[] = [];
      const profilesMap: Record<string, UserProfile> = {};
      const openStoreUids = new Set<string>();
      const openStoreUsernames = new Set<string>();

      try {
        const profilesSnap = await getDocs(collection(db, 'profiles'));
        if (profilesSnap && !profilesSnap.empty) {
          profilesSnap.forEach(docSnap => {
            const data = docSnap.data() as UserProfile;
            const uid = data.uid || docSnap.id;
            const isSuspended = data.suspended === true || data.subscriptionStatus === 'suspended' || data.subscriptionStatus === 'expired';
            const isClosed = isSuspended || data.isClosed === true || checkIsStoreClosed(data);

            // Filter ONLY open stores
            if (!isClosed && !isSuspended) {
              const cleanProf: UserProfile = {
                ...data,
                uid,
                isClosed: false,
                suspended: false
              };
              openStores.push(cleanProf);
              openStoreUids.add(uid);
              if (data.username) {
                openStoreUsernames.add(data.username.toLowerCase());
              }
              profilesMap[uid] = cleanProf;
              if (data.username) profilesMap[data.username.toLowerCase()] = cleanProf;
            }
          });
        }
      } catch (profErr) {
        console.warn("Firestore profiles background query notice:", profErr);
      }

      // Query products and retain ONLY products belonging to open stores
      const availableProducts: ProductItem[] = [];
      try {
        const productsSnap = await getDocs(collection(db, 'products'));
        if (productsSnap && !productsSnap.empty) {
          productsSnap.forEach(docSnap => {
            const data = docSnap.data() as ProductItem;
            if (data && data.active !== false) {
              const belongsToOpenStore = 
                (data.userId && openStoreUids.has(data.userId)) ||
                (data.storeUsername && openStoreUsernames.has(data.storeUsername.toLowerCase()));

              if (belongsToOpenStore) {
                const matchedStore = findStoreForProduct(data, profilesMap);
                availableProducts.push({
                  ...data,
                  id: docSnap.id,
                  name: data.name || 'Producto',
                  price: typeof data.price === 'number' && !isNaN(data.price) ? data.price : parseFloat(data.price as any) || 0,
                  storeName: matchedStore?.displayName || data.storeName || 'Restaurante Asociado',
                  storeUsername: matchedStore?.username || data.storeUsername || 'tienda',
                  active: true
                });
              }
            }
          });
        }
      } catch (prodErr) {
        console.warn("Firestore products background query notice:", prodErr);
      }

      return updateInMemoryCatalog(openStores, availableProducts, profilesMap);
    } catch (err) {
      console.warn("Background open catalog generation notice:", err);
      return clientAvailableCatalog;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

/**
 * Initializes the client catalog manager in the background:
 * - Defers execution so initial page rendering & user interaction is 100% instantaneous.
 * - Schedules a periodic 3-minute silent refresh to keep open restaurants updated in memory.
 */
export function initClientCatalogManager(): () => void {
  if (isClientInitialized) return () => {};
  isClientInitialized = true;

  // Defer background load to idle time so visual UI loads first
  const scheduleDeferredLoad = () => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        loadOpenStoresCatalogInBackground().catch(() => {});
      }, { timeout: 1500 });
    } else {
      setTimeout(() => {
        loadOpenStoresCatalogInBackground().catch(() => {});
      }, 150);
    }
  };

  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    scheduleDeferredLoad();
  } else if (typeof window !== 'undefined') {
    window.addEventListener('load', scheduleDeferredLoad, { once: true });
    scheduleDeferredLoad();
  }

  // Periodic 3-minute background refresh to keep open stores up to date
  const intervalId = setInterval(() => {
    loadOpenStoresCatalogInBackground(true).catch(() => {});
  }, 3 * 60 * 1000);

  return () => {
    clearInterval(intervalId);
  };
}

/**
 * Fast synchronous access to the in-memory catalog.
 * The AI uses this as the sole source of truth during conversations.
 * NO repeated Firebase calls during chat.
 */
export function getClientAvailableCatalog(): ClientAvailableCatalog {
  if (!clientAvailableCatalog.isLoaded && !inFlightPromise) {
    // Fire background load without blocking
    loadOpenStoresCatalogInBackground().catch(() => {});
  }
  return clientAvailableCatalog;
}

/**
 * Alias for clarity
 */
export const getInMemoryOpenCatalog = getClientAvailableCatalog;

/**
 * Subscribe to in-memory catalog updates
 */
export function subscribeToAvailableCatalog(callback: (catalog: ClientAvailableCatalog) => void): () => void {
  catalogListeners.push(callback);
  // Send current in-memory state immediately
  callback(clientAvailableCatalog);
  return () => {
    const idx = catalogListeners.indexOf(callback);
    if (idx !== -1) catalogListeners.splice(idx, 1);
  };
}

/**
 * In-Memory Validation before Cart Add or Quantity Change (0ms, zero Firebase reads)
 */
export async function validateStoreAndProductBeforeCart(productId: string, storeId?: string): Promise<{
  valid: boolean;
  reason?: string;
}> {
  try {
    const catalog = getClientAvailableCatalog();
    
    // If catalog hasn't finished loading yet, allow action
    if (!catalog.isLoaded || (catalog.stores.length === 0 && catalog.products.length === 0)) {
      return { valid: true };
    }

    const product = catalog.products.find(p => p.id === productId);
    const targetStoreId = product?.userId || storeId;

    if (targetStoreId) {
      const store = catalog.stores.find(s => s.uid === targetStoreId || s.username?.toLowerCase() === targetStoreId.toLowerCase());
      if (!store) {
        return {
          valid: false,
          reason: "El restaurante se encuentra actualmente cerrado y no puede recibir pedidos."
        };
      }
    }

    if (productId && !product) {
      return {
        valid: false,
        reason: "El producto seleccionado ya no se encuentra disponible."
      };
    }

    return { valid: true };
  } catch (err) {
    return { valid: true };
  }
}

/**
 * In-Memory Validation before Order Confirmation (0ms, zero Firebase reads)
 */
export async function validateCartBeforeOrder(cartItems: Array<{ product: ProductItem; quantity: number }>): Promise<{
  valid: boolean;
  reason?: string;
}> {
  try {
    const catalog = getClientAvailableCatalog();

    if (!catalog.isLoaded || (catalog.stores.length === 0 && catalog.products.length === 0)) {
      return { valid: true };
    }

    for (const item of cartItems) {
      const storeId = item.product.userId;
      if (storeId) {
        const store = catalog.stores.find(s => s.uid === storeId || s.username?.toLowerCase() === storeId.toLowerCase());
        if (!store) {
          const sName = item.product.storeName || 'El restaurante';
          return {
            valid: false,
            reason: `No podemos completar tu pedido porque ${sName} se encuentra cerrado en este momento.`
          };
        }
      }

      const availableProd = catalog.products.find(p => p.id === item.product.id);
      if (!availableProd) {
        return {
          valid: false,
          reason: `El producto "${item.product.name}" ya no se encuentra disponible.`
        };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: true };
  }
}

// Legacy alias for compatibility
export const fetchCatalogData = loadOpenStoresCatalogInBackground;
export const rebuildClientAvailableCatalog = getClientAvailableCatalog;
