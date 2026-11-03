/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, checkIsStoreClosed, findStoreForProduct } from './firebase';
import { ProductItem, UserProfile } from '../types';
import { smartApiFetch } from './apiConfig';

export interface CompactAiDish {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
  ingredientes?: string;
  variantes?: string[];
}

export interface CompactAiRestaurant {
  id: string;
  nombre: string;
  usuario: string;
  especialidad?: string;
  platos: CompactAiDish[];
}

export interface CompactAiCatalogPayload {
  actualizadoEn: string;
  version: number;
  totalRestaurantesAbiertos: number;
  totalPlatosDisponibles: number;
  restaurantesAbiertos: CompactAiRestaurant[];
  restaurantesRecienCerrados?: string[];
}

export interface ClientAvailableCatalog {
  stores: UserProfile[];
  products: ProductItem[];
  profilesMap: Record<string, UserProfile>;
  catalogUpdatedAt: string;
  version: number;
  isLoaded: boolean;
  compactAiJson: string;
  compactPayload: CompactAiCatalogPayload;
  recentlyClosedStores: string[];
}

export const CATALOG_UPDATED_EVENT = 'linnk:available_catalog_updated';
const LEGACY_SESSION_STORAGE_KEY = 'ryyco_open_catalog_json';

// Never use stale cached data to determine if a restaurant is open
try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  }
} catch {}

const emptyCompactPayload: CompactAiCatalogPayload = {
  actualizadoEn: new Date().toISOString(),
  version: 0,
  totalRestaurantesAbiertos: 0,
  totalPlatosDisponibles: 0,
  restaurantesAbiertos: [],
  restaurantesRecienCerrados: []
};

let clientAvailableCatalog: ClientAvailableCatalog = {
  stores: [],
  products: [],
  profilesMap: {},
  catalogUpdatedAt: new Date().toISOString(),
  version: 0,
  isLoaded: false,
  compactAiJson: JSON.stringify(emptyCompactPayload),
  compactPayload: emptyCompactPayload,
  recentlyClosedStores: []
};

// Single deduplicated real-time listener state
const rawProfilesMap = new Map<string, UserProfile>();
const rawProductsMap = new Map<string, ProductItem>();
const previousOpenStoreNames = new Map<string, string>();
const recentlyClosedStoreNames = new Set<string>();

let profilesServerConfirmed = false;
let productsServerConfirmed = false;
let isRealtimeListenersAttached = false;
let unsubProfilesListener: (() => void) | null = null;
let unsubProductsListener: (() => void) | null = null;
let scheduleIntervalId: ReturnType<typeof setInterval> | null = null;
let inFlightPromise: Promise<ClientAvailableCatalog> | null = null;
const catalogListeners: Array<(catalog: ClientAvailableCatalog) => void> = [];

/**
 * Sanitizes product names, descriptions, and store bios so embedded text
 * can never be interpreted as prompt-injection commands to alter the AI role.
 */
export function sanitizeCatalogTextForAi(input?: string, maxLength = 160): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(
      /\b(ignore\s+(all\s+)?(previous|prior)\s+instructions?|system\s*prompt|olvida\s+(todas\s+)?(tus\s+)?instrucciones|ignora\s+(todas\s+)?(tus\s+)?instrucciones|cambia\s+tu\s+(rol|papel)|act[uú]a\s+como|deja\s+de\s+ser\s+mesero|you\s+are\s+now)\b/gi,
      ''
    )
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Strictly checks whether a restaurant is currently open.
 */
export function isRestaurantOpenNow(store?: UserProfile | null): boolean {
  if (!store) return false;
  const isSuspended =
    store.suspended === true ||
    store.subscriptionStatus === 'suspended' ||
    store.subscriptionStatus === 'expired';
  if (isSuspended) return false;
  if (store.isClosed === true) return false;
  if (checkIsStoreClosed(store)) return false;
  return true;
}

/**
 * Strictly checks whether a product is available (enabled and not out of stock).
 */
export function isProductAvailableNow(product?: ProductItem | null): boolean {
  if (!product) return false;
  if (product.active === false) return false;
  if ((product as any).disabled === true || (product as any).available === false) return false;
  if (product.stock !== undefined && product.stock !== null && Number(product.stock) <= 0) {
    return false;
  }
  return true;
}

/**
 * Builds the compact AI JSON exclusively with open restaurants and their available dishes.
 */
export function buildCompactAiCatalogPayload(
  openStores: UserProfile[],
  availableProducts: ProductItem[],
  version: number,
  recentlyClosed: string[] = []
): CompactAiCatalogPayload {
  const storesByUid = new Map<string, CompactAiRestaurant>();
  const storesByUsername = new Map<string, CompactAiRestaurant>();

  for (const s of openStores) {
    const cleanName = sanitizeCatalogTextForAi(s.displayName || s.username || 'Restaurante', 70);
    const cleanBio = sanitizeCatalogTextForAi(s.bio || '', 100);
    const entry: CompactAiRestaurant = {
      id: s.uid,
      nombre: cleanName,
      usuario: s.username || s.uid,
      ...(cleanBio ? { especialidad: cleanBio } : {}),
      platos: []
    };
    if (s.uid) storesByUid.set(s.uid, entry);
    if (s.username) storesByUsername.set(s.username.toLowerCase(), entry);
  }

  for (const p of availableProducts) {
    if (!isProductAvailableNow(p)) continue;
    const price = typeof p.price === 'number' && !isNaN(p.price) ? p.price : Number(p.price) || 0;
    if (price <= 0) continue;

    let targetRest =
      (p.userId && storesByUid.get(p.userId)) ||
      (p.storeUsername && storesByUsername.get(p.storeUsername.toLowerCase()));

    if (!targetRest) continue;

    const cleanDishName = sanitizeCatalogTextForAi(p.name, 80);
    if (!cleanDishName) continue;

    const cleanDesc = sanitizeCatalogTextForAi(p.description || '', 140);
    const cleanCat = sanitizeCatalogTextForAi(p.category || 'General', 40);
    const rawVariants = (p as any).variants || p.variantsList;
    const variantsList = Array.isArray(rawVariants)
      ? rawVariants.map((v: any) => sanitizeCatalogTextForAi(typeof v === 'string' ? v : `${v.name || ''}${v.price ? ` (${v.price} COP)` : ''}`, 50)).filter(Boolean)
      : undefined;

    targetRest.platos.push({
      id: p.id,
      nombre: cleanDishName,
      precio: price,
      categoria: cleanCat || 'General',
      ...(cleanDesc ? { ingredientes: cleanDesc } : {}),
      ...(variantsList && variantsList.length > 0 ? { variantes: variantsList } : {})
    });
  }

  const restaurantesAbiertos = Array.from(storesByUid.values());

  return {
    actualizadoEn: new Date().toISOString(),
    version,
    totalRestaurantesAbiertos: restaurantesAbiertos.length,
    totalPlatosDisponibles: restaurantesAbiertos.reduce((sum, r) => sum + r.platos.length, 0),
    restaurantesAbiertos,
    ...(recentlyClosed.length > 0 ? { restaurantesRecienCerrados: recentlyClosed } : {})
  };
}

/**
 * Rebuilds the in-memory open catalog from live confirmed maps and notifies subscribers.
 */
function rebuildAndPublishFromLiveMaps(): ClientAvailableCatalog {
  const openStores: UserProfile[] = [];
  const profilesMap: Record<string, UserProfile> = {};
  const openStoreUids = new Set<string>();
  const openStoreUsernames = new Set<string>();

  rawProfilesMap.forEach((store) => {
    const uid = store.uid;
    if (isRestaurantOpenNow(store)) {
      const cleanStore: UserProfile = {
        ...store,
        uid,
        isClosed: false,
        suspended: false
      };
      openStores.push(cleanStore);
      openStoreUids.add(uid);
      if (store.username) {
        openStoreUsernames.add(store.username.toLowerCase());
        profilesMap[store.username.toLowerCase()] = cleanStore;
      }
      profilesMap[uid] = cleanStore;
      previousOpenStoreNames.set(uid, cleanStore.displayName || cleanStore.username || 'Restaurante');
      recentlyClosedStoreNames.delete(cleanStore.displayName || cleanStore.username || '');
    } else if (previousOpenStoreNames.has(uid)) {
      // A restaurant that was previously open during this session just closed!
      const closedName = previousOpenStoreNames.get(uid)!;
      previousOpenStoreNames.delete(uid);
      if (closedName) {
        recentlyClosedStoreNames.add(closedName);
      }
    }
  });

  const availableProducts: ProductItem[] = [];
  rawProductsMap.forEach((product) => {
    if (!isProductAvailableNow(product)) return;

    const belongsToOpenStore =
      (product.userId && openStoreUids.has(product.userId)) ||
      (product.storeUsername && openStoreUsernames.has(product.storeUsername.toLowerCase()));

    if (!belongsToOpenStore) return;

    const matchedStore = findStoreForProduct(product, profilesMap);
    if (!matchedStore || !isRestaurantOpenNow(matchedStore)) return;

    const numericPrice =
      typeof product.price === 'number' && !isNaN(product.price)
        ? product.price
        : parseFloat(String(product.price)) || 0;

    if (numericPrice <= 0) return;

    availableProducts.push({
      ...product,
      id: product.id,
      userId: matchedStore.uid || product.userId,
      name: sanitizeCatalogTextForAi(product.name || 'Producto', 90) || 'Producto',
      description: sanitizeCatalogTextForAi(product.description || '', 180),
      price: numericPrice,
      storeName: matchedStore.displayName || product.storeName || 'Restaurante',
      storeUsername: matchedStore.username || product.storeUsername || 'tienda',
      active: true
    });
  });

  return updateInMemoryCatalog(
    openStores,
    availableProducts,
    profilesMap,
    Array.from(recentlyClosedStoreNames)
  );
}

/**
 * Updates the in-memory catalog and notifies listeners if data changed.
 */
function updateInMemoryCatalog(
  stores: UserProfile[],
  products: ProductItem[],
  profilesMap: Record<string, UserProfile>,
  recentlyClosed: string[] = []
): ClientAvailableCatalog {
  const nextVersion = clientAvailableCatalog.version + 1;
  const compactPayload = buildCompactAiCatalogPayload(stores, products, nextVersion, recentlyClosed);
  const compactAiJson = JSON.stringify(compactPayload);

  // Avoid redundant notifications if the compact representation hasn't changed
  const prevComparable = JSON.stringify({
    r: clientAvailableCatalog.compactPayload.restaurantesAbiertos,
    c: clientAvailableCatalog.compactPayload.restaurantesRecienCerrados
  });
  const nextComparable = JSON.stringify({
    r: compactPayload.restaurantesAbiertos,
    c: compactPayload.restaurantesRecienCerrados
  });

  if (clientAvailableCatalog.isLoaded && prevComparable === nextComparable) {
    return clientAvailableCatalog;
  }

  clientAvailableCatalog = {
    stores,
    products,
    profilesMap,
    catalogUpdatedAt: compactPayload.actualizadoEn,
    version: nextVersion,
    isLoaded: true,
    compactAiJson,
    compactPayload,
    recentlyClosedStores: recentlyClosed
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT, { detail: clientAvailableCatalog }));
  }

  catalogListeners.forEach(listener => {
    try {
      listener(clientAvailableCatalog);
    } catch {}
  });

  return clientAvailableCatalog;
}

/**
 * Synchronizes confirmed stores and products from the progressive loader once
 * the RYYCO page has loaded and Firebase has confirmed restaurant availability.
 */
export function syncConfirmedCatalogFromPage(
  confirmedOpenStores: UserProfile[],
  confirmedProfilesMap: Record<string, UserProfile>,
  confirmedProducts: ProductItem[]
): void {
  if (!Array.isArray(confirmedOpenStores)) return;

  // Update rawProfilesMap with confirmed profiles
  Object.values(confirmedProfilesMap || {}).forEach(profile => {
    if (profile && profile.uid) {
      rawProfilesMap.set(profile.uid, profile);
    }
  });
  confirmedOpenStores.forEach(store => {
    if (store && store.uid) {
      rawProfilesMap.set(store.uid, store);
    }
  });
  profilesServerConfirmed = true;

  if (Array.isArray(confirmedProducts) && confirmedProducts.length > 0) {
    confirmedProducts.forEach(prod => {
      if (prod && prod.id) {
        rawProductsMap.set(prod.id, prod);
      }
    });
  }

  rebuildAndPublishFromLiveMaps();
  // Ensure real-time onSnapshot listeners are attached non-blockingly
  initClientCatalogManager();
}

/**
 * Attaches a single pair of real-time Firestore `onSnapshot` listeners
 * (using incremental `docChanges()` updates and strict server confirmation).
 */
function attachRealtimeCatalogListeners(): void {
  if (isRealtimeListenersAttached) return;
  isRealtimeListenersAttached = true;

  try {
    unsubProfilesListener = onSnapshot(
      collection(db, 'profiles'),
      { includeMetadataChanges: true },
      snapshot => {
        // Never use stale cached data to determine if a restaurant is open
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          return;
        }

        if (!profilesServerConfirmed) {
          rawProfilesMap.clear();
          snapshot.forEach(docSnap => {
            const data = docSnap.data() as UserProfile;
            const uid = data.uid || docSnap.id;
            rawProfilesMap.set(uid, { ...data, uid });
          });
          profilesServerConfirmed = true;
        } else {
          // Incremental update via docChanges()
          const changes = snapshot.docChanges();
          if (changes.length === 0) return;
          for (const change of changes) {
            const data = change.doc.data() as UserProfile;
            const uid = data.uid || change.doc.id;
            if (change.type === 'removed') {
              if (previousOpenStoreNames.has(uid)) {
                recentlyClosedStoreNames.add(previousOpenStoreNames.get(uid)!);
                previousOpenStoreNames.delete(uid);
              }
              rawProfilesMap.delete(uid);
            } else {
              rawProfilesMap.set(uid, { ...data, uid });
            }
          }
        }

        if (profilesServerConfirmed) {
          rebuildAndPublishFromLiveMaps();
        }
      },
      err => {
        console.warn('Real-time profiles listener notice:', err?.code || err);
      }
    );

    unsubProductsListener = onSnapshot(
      collection(db, 'products'),
      { includeMetadataChanges: true },
      snapshot => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          return;
        }

        if (!productsServerConfirmed) {
          rawProductsMap.clear();
          snapshot.forEach(docSnap => {
            const data = docSnap.data() as ProductItem;
            rawProductsMap.set(docSnap.id, { ...data, id: docSnap.id });
          });
          productsServerConfirmed = true;
        } else {
          // Incremental update via docChanges()
          const changes = snapshot.docChanges();
          if (changes.length === 0) return;
          for (const change of changes) {
            if (change.type === 'removed') {
              rawProductsMap.delete(change.doc.id);
            } else {
              const data = change.doc.data() as ProductItem;
              rawProductsMap.set(change.doc.id, { ...data, id: change.doc.id });
            }
          }
        }

        if (profilesServerConfirmed) {
          rebuildAndPublishFromLiveMaps();
        }
      },
      err => {
        console.warn('Real-time products listener notice:', err?.code || err);
      }
    );

    // Re-evaluate store operating schedules every 30s in memory without extra Firebase reads
    if (!scheduleIntervalId) {
      scheduleIntervalId = setInterval(() => {
        if (profilesServerConfirmed && rawProfilesMap.size > 0) {
          rebuildAndPublishFromLiveMaps();
        }
      }, 30 * 1000);
    }
  } catch (err) {
    isRealtimeListenersAttached = false;
    console.warn('Failed to attach real-time catalog listeners:', err);
  }
}

/**
 * Background fetcher & real-time listener initializer:
 * 1. Executes in the background without blocking visual UI rendering.
 * 2. Downloads ONLY confirmed open restaurants and their available products.
 * 3. Attaches real-time `onSnapshot` listeners for instant updates.
 */
export async function loadOpenStoresCatalogInBackground(forceRefresh: boolean = false): Promise<ClientAvailableCatalog> {
  attachRealtimeCatalogListeners();

  if (!forceRefresh && clientAvailableCatalog.isLoaded && profilesServerConfirmed && productsServerConfirmed) {
    return clientAvailableCatalog;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    try {
      // 1. Primary Strategy: Fetch server-confirmed open-stores catalog
      try {
        const res = await smartApiFetch('/api/catalog/available');
        if (res && res.ok) {
          const data = await res.json();
          if (data && data.success && data.source === 'firestore-server' && data.catalog) {
            const serverStores: any[] = data.catalog.stores || [];
            const serverProducts: any[] = data.catalog.products || [];

            if (!profilesServerConfirmed) {
              rawProfilesMap.clear();
              serverStores.forEach((s: any) => {
                const uid = s.uid;
                if (!uid) return;
                const prof: UserProfile = {
                  ...s,
                  uid,
                  email: s.email || '',
                  username: s.username || uid,
                  displayName: s.displayName || s.username || 'Restaurante',
                  bio: s.bio || '',
                  address: s.address || '',
                  phone: s.phone || '',
                  whatsapp: s.whatsapp || '',
                  role: 'user',
                  plan: 'pro',
                  createdAt: s.createdAt || new Date().toISOString(),
                  isClosed: s.isClosed === true,
                  suspended: s.suspended === true
                };
                if (isRestaurantOpenNow(prof)) {
                  rawProfilesMap.set(uid, prof);
                }
              });
              profilesServerConfirmed = true;
            }

            if (!productsServerConfirmed) {
              rawProductsMap.clear();
              serverProducts.forEach((p: any) => {
                if (!p || !p.id) return;
                rawProductsMap.set(p.id, {
                  ...p,
                  id: p.id,
                  userId: p.userId || '',
                  name: p.name || 'Producto',
                  description: p.description || '',
                  price: typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0,
                  stock: p.stock !== undefined && p.stock !== null ? Number(p.stock) : undefined,
                  category: p.category || 'General',
                  imageURL: p.imageURL || '',
                  storeName: p.storeName || 'Restaurante',
                  storeUsername: p.storeUsername || 'tienda',
                  active: p.active !== false
                });
              });
              productsServerConfirmed = true;
            }

            return rebuildAndPublishFromLiveMaps();
          }
        }
      } catch (apiErr) {
        console.warn('Server catalog endpoint notice, using direct Firestore confirmation:', apiErr);
      }

      // 2. Fallback Strategy: Direct query to Firestore
      if (!profilesServerConfirmed) {
        try {
          const profilesSnap = await getDocs(collection(db, 'profiles'));
          if (profilesSnap && !profilesSnap.metadata.fromCache) {
            rawProfilesMap.clear();
            profilesSnap.forEach(docSnap => {
              const data = docSnap.data() as UserProfile;
              const uid = data.uid || docSnap.id;
              rawProfilesMap.set(uid, { ...data, uid });
            });
            profilesServerConfirmed = true;
          }
        } catch (profErr) {
          console.warn('Firestore profiles query notice:', profErr);
        }
      }

      if (!productsServerConfirmed) {
        try {
          const productsSnap = await getDocs(collection(db, 'products'));
          if (productsSnap && !productsSnap.metadata.fromCache) {
            rawProductsMap.clear();
            productsSnap.forEach(docSnap => {
              const data = docSnap.data() as ProductItem;
              rawProductsMap.set(docSnap.id, { ...data, id: docSnap.id });
            });
            productsServerConfirmed = true;
          }
        } catch (prodErr) {
          console.warn('Firestore products query notice:', prodErr);
        }
      }

      if (profilesServerConfirmed) {
        return rebuildAndPublishFromLiveMaps();
      }
      return clientAvailableCatalog;
    } catch (err) {
      console.warn('Background open catalog generation notice:', err);
      return clientAvailableCatalog;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

/**
 * Initializes the client catalog manager non-blockingly after the page loads
 * and attaches the single shared real-time Firestore `onSnapshot` listeners.
 */
export function initClientCatalogManager(): () => void {
  if (isRealtimeListenersAttached) {
    return () => {};
  }

  const startNonBlocking = () => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(
        () => {
          attachRealtimeCatalogListeners();
          loadOpenStoresCatalogInBackground().catch(() => {});
        },
        { timeout: 1200 }
      );
    } else {
      setTimeout(() => {
        attachRealtimeCatalogListeners();
        loadOpenStoresCatalogInBackground().catch(() => {});
      }, 150);
    }
  };

  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    startNonBlocking();
  } else if (typeof window !== 'undefined') {
    window.addEventListener('load', startNonBlocking, { once: true });
    startNonBlocking();
  }

  return () => {};
}

/**
 * Synchronous access to the live confirmed in-memory catalog.
 */
export function getClientAvailableCatalog(loadIfMissing = true): ClientAvailableCatalog {
  if (loadIfMissing && !clientAvailableCatalog.isLoaded && !inFlightPromise) {
    loadOpenStoresCatalogInBackground().catch(() => {});
  }
  return clientAvailableCatalog;
}

/**
 * Returns the compact JSON string for the Virtual Waiter AI.
 */
export function getCompactAiCatalogJson(): string {
  return getClientAvailableCatalog().compactAiJson;
}

export const getInMemoryOpenCatalog = getClientAvailableCatalog;

/**
 * Subscribe to real-time catalog updates.
 */
export function subscribeToAvailableCatalog(callback: (catalog: ClientAvailableCatalog) => void): () => void {
  if (!catalogListeners.includes(callback)) {
    catalogListeners.push(callback);
  }
  callback(clientAvailableCatalog);
  return () => {
    const idx = catalogListeners.indexOf(callback);
    if (idx !== -1) catalogListeners.splice(idx, 1);
  };
}

/**
 * 4-Point Live Validation against Firebase before offering/adding a product to the cart:
 * 1. The restaurant continues open.
 * 2. The product continues available (active and in stock).
 * 3. The price is still valid.
 * 4. The information corresponds to the right product.
 */
export async function validateStoreAndProductBeforeCart(
  productId: string,
  storeId?: string,
  expectedPrice?: number,
  expectedName?: string
): Promise<{
  valid: boolean;
  reason?: string;
  verifiedProduct?: ProductItem;
  verifiedPrice?: number;
}> {
  if (!productId) {
    return { valid: false, reason: 'Identificador de producto inválido.' };
  }

  // 1. Try server-side validation endpoint first
  try {
    const res = await smartApiFetch('/api/catalog/validate-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        storeId,
        expectedPrice,
        expectedName
      })
    });
    if (res && res.ok) {
      const data = await res.json();
      if (data && typeof data.valid === 'boolean') {
        if (!data.valid) {
          return { valid: false, reason: data.reason || 'El producto o restaurante ya no está disponible.' };
        }
        if (data.product) {
          return {
            valid: true,
            verifiedProduct: data.product,
            verifiedPrice: Number(data.product.price) || expectedPrice
          };
        }
      }
    }
  } catch {}

  // 2. Direct live check against Firestore / confirmed real-time listener state
  try {
    let liveProduct: ProductItem | undefined = rawProductsMap.get(productId);
    if (!liveProduct) {
      const prodSnap = await getDoc(doc(db, 'products', productId));
      if (prodSnap.exists()) {
        liveProduct = { ...(prodSnap.data() as ProductItem), id: prodSnap.id };
        rawProductsMap.set(prodSnap.id, liveProduct);
      }
    }

    if (!liveProduct || !isProductAvailableNow(liveProduct)) {
      return {
        valid: false,
        reason: 'El plato seleccionado se acaba de agotar o ya no se encuentra disponible.'
      };
    }

    // Check 4: Product identity correspondence
    if (expectedName && expectedName.trim()) {
      const normExpected = expectedName.toLowerCase().trim();
      const normActual = (liveProduct.name || '').toLowerCase().trim();
      if (normActual && !normActual.includes(normExpected) && !normExpected.includes(normActual)) {
        return {
          valid: false,
          reason: `La información del producto no coincide con el plato solicitado ("${expectedName}").`
        };
      }
    }

    // Check 1: Restaurant continues open
    const targetStoreId = liveProduct.userId || storeId;
    let liveStore: UserProfile | undefined = targetStoreId ? rawProfilesMap.get(targetStoreId) : undefined;
    if (!liveStore && liveProduct.storeUsername) {
      liveStore = Array.from(rawProfilesMap.values()).find(
        s => s.username?.toLowerCase() === liveProduct!.storeUsername?.toLowerCase()
      );
    }
    if (!liveStore && targetStoreId) {
      const storeSnap = await getDoc(doc(db, 'profiles', targetStoreId));
      if (storeSnap.exists()) {
        liveStore = { ...(storeSnap.data() as UserProfile), uid: storeSnap.id };
        rawProfilesMap.set(storeSnap.id, liveStore);
      }
    }

    if (!liveStore || !isRestaurantOpenNow(liveStore)) {
      const storeLabel = liveStore?.displayName || liveProduct.storeName || 'El restaurante';
      return {
        valid: false,
        reason: `${storeLabel} se encuentra cerrado en este momento y no puede recibir pedidos.`
      };
    }

    // Check 3: Price validity
    const livePrice = typeof liveProduct.price === 'number' ? liveProduct.price : Number(liveProduct.price) || 0;
    if (livePrice <= 0) {
      return {
        valid: false,
        reason: `El precio del producto "${liveProduct.name}" no es válido actualmente.`
      };
    }

    return {
      valid: true,
      verifiedProduct: {
        ...liveProduct,
        price: livePrice,
        storeName: liveStore.displayName || liveProduct.storeName,
        storeUsername: liveStore.username || liveProduct.storeUsername
      },
      verifiedPrice: livePrice
    };
  } catch (err) {
    const catalog = getClientAvailableCatalog(false);
    const fallbackProd = catalog.products.find(p => p.id === productId);
    if (!fallbackProd) {
      return {
        valid: false,
        reason: 'No se pudo confirmar la disponibilidad actual del producto en Firebase.'
      };
    }
    return {
      valid: true,
      verifiedProduct: fallbackProd,
      verifiedPrice: fallbackProd.price
    };
  }
}

/**
 * 4-Point Live Validation before Order Confirmation
 */
export async function validateCartBeforeOrder(
  cartItems: Array<{ product: ProductItem; quantity: number }>
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return { valid: false, reason: 'Tu carrito está vacío.' };
  }

  // 1. Validate each item against live Firebase / server
  for (const item of cartItems) {
    if (!item) continue;
    const prod = item.product || (item as any) || {};
    const prodId = prod.id || (item as any)?.productId || (item as any)?.id;
    const storeId = prod.userId || (item as any)?.storeOwnerId;
    const itemPrice = typeof prod.price === 'number' ? prod.price : Number(prod.price) || undefined;

    const check = await validateStoreAndProductBeforeCart(prodId, storeId, itemPrice, prod.name);
    if (!check.valid) {
      return {
        valid: false,
        reason: check.reason || `El producto "${prod.name || 'seleccionado'}" ya no está disponible.`
      };
    }
    // Sync price in-place if updated in Firebase
    if (check.verifiedPrice && prod && typeof prod === 'object') {
      prod.price = check.verifiedPrice;
    }
  }

  // 2. Final backend order validation
  try {
    const firstProd = cartItems[0]?.product || (cartItems[0] as any) || {};
    const storeOwnerId = firstProd.userId || (cartItems[0] as any)?.storeOwnerId;
    const orderPayloadItems = cartItems.map(i => {
      const p = i.product || (i as any) || {};
      return {
        productId: p.id || (i as any)?.productId || (i as any)?.id,
        name: p.name,
        quantity: i.quantity || 1,
        price: Number(p.price) || 0
      };
    });

    const res = await smartApiFetch('/api/catalog/validate-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: orderPayloadItems, storeOwnerId })
    });
    if (res && res.ok) {
      const data = await res.json();
      if (data && data.valid === false) {
        return {
          valid: false,
          reason: data.reason || 'No se pudo validar el pedido porque un restaurante cerró o un producto se agotó.'
        };
      }
    }
  } catch {}

  return { valid: true };
}

// Legacy aliases for compatibility
export const fetchCatalogData = loadOpenStoresCatalogInBackground;
export const rebuildClientAvailableCatalog = getClientAvailableCatalog;
