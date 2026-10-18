/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, onSnapshot, getDocsFromServer } from 'firebase/firestore';
import { UserProfile, ProductItem } from '../types';
import { 
  db,
  checkIsStoreClosed
} from '../lib/firebase';
import { orderProductBatch } from '../lib/productUtils';

export type ProgressiveLoadingStage = 
  | 'fetching_open_restaurants'
  | 'showing_first_logo'
  | 'fetching_first_products'
  | 'loading_subsequent_logos'
  | 'idle';

export interface UseProgressiveStoreLoaderResult {
  openRestaurants: UserProfile[];
  loadedLogos: UserProfile[];
  loadedProducts: ProductItem[];
  profilesMap: Record<string, UserProfile>;
  stage: ProgressiveLoadingStage;
  firstStore: UserProfile | null;
  isLoadingMore: boolean;
  hasMore: boolean;
  totalOpenCount: number;
  loadNextFourProducts: () => Promise<ProductItem[]>;
  statusMessage: string;
  isLoadingRestaurants: boolean;
  isLoadingProducts: boolean;
  restaurantsError: { code: string; message: string } | null;
  retryRestaurants: () => void;
  productsError: string | null;
  retryProducts: () => Promise<ProductItem[]>;
}

// Purge legacy persistent session cache on module load to guarantee live freshness from Firebase
if (typeof window !== 'undefined') {
  try {
    sessionStorage.removeItem('linnk_fast_open_cache');
  } catch (e) {}
}

export function useProgressiveStoreLoader(): UseProgressiveStoreLoaderResult {
  const [openRestaurants, setOpenRestaurants] = useState<UserProfile[]>([]);
  const [loadedLogos, setLoadedLogos] = useState<UserProfile[]>([]);
  const [loadedProducts, setLoadedProducts] = useState<ProductItem[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, UserProfile>>({});
  
  const [stage, setStage] = useState<ProgressiveLoadingStage>('fetching_open_restaurants');
  const [firstStore, setFirstStore] = useState<UserProfile | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [restaurantsReady, setRestaurantsReady] = useState(false);
  const [restaurantsError, setRestaurantsError] = useState<{ code: string; message: string } | null>(null);
  const [listenerAttempt, setListenerAttempt] = useState(0);
  const retryRestaurants = useCallback(() => setListenerAttempt(attempt => attempt + 1), []);

  // State refs to prevent stale closures and avoid race conditions
  const isFetchingMoreRef = useRef(false);
  const fullCatalogRequestRef = useRef<Promise<ProductItem[]> | null>(null);
  const catalogCompleteRef = useRef(false);
  // null means the server-confirmed products collection covers even closed stores.
  const coveredStoresRef = useRef<Set<string> | null>(new Set());
  const openRestaurantsRef = useRef<UserProfile[]>([]);

  const getFullCatalog = useCallback((): Promise<ProductItem[]> => {
    if (fullCatalogRequestRef.current) return fullCatalogRequestRef.current;
    fullCatalogRequestRef.current = (async () => {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 10000);
      try {
        // The HTML prefetch requests the same complete catalog; reuse it once.
        const prefetched = (window as any).__CATALOG_PREFETCH__;
        (window as any).__CATALOG_PREFETCH__ = null;
        const response = prefetched ? await prefetched : await fetch('/api/catalog/available', {
          signal: controller.signal, cache: 'no-store'
        }).then(r => r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null);
        if (response?.source === 'firestore-server' && response.complete === true &&
            response.isPartial === false && !response.storeFiltered &&
            Array.isArray(response.catalog?.products) && Array.isArray(response.catalog?.stores) &&
            response.totalProducts === response.catalog.products.length) {
          const covered = new Set<string>(response.catalog.stores.map((store: UserProfile) => store.uid));
          if (openRestaurantsRef.current.every(store => covered.has(store.uid))) {
            coveredStoresRef.current = covered;
            return orderProductBatch(response.catalog.products);
          }
        }
      } catch {} finally { clearTimeout(deadline); }
      // A static JSON file is a preview, never evidence that Firestore is exhausted.
      // Keep the pending SDK operation shared after a timeout to avoid duplicate reads.
      const snapshot = await getDocsFromServer(collection(db, 'products'));
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) throw Error('unconfirmed-catalog');
      coveredStoresRef.current = null;
      return orderProductBatch(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProductItem))
        .filter(product => product.active !== false));
    })().catch(error => {
      fullCatalogRequestRef.current = null;
      throw error;
    });
    return fullCatalogRequestRef.current;
  }, []);

  // Historical name retained for callers; metadata is buffered once, UI reveals six.
  const loadNextFourProducts = useCallback(async (): Promise<ProductItem[]> => {
    if (isFetchingMoreRef.current || catalogCompleteRef.current) return [];
    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);
    setProductsError(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const products = await Promise.race([getFullCatalog(), new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(Error('catalog-timeout')), 20000);
      })]);
      const unique = Array.from(new Map<string, ProductItem>(products.filter(p => p?.id).map(p => [p.id, p])).values());
      // Replace: deleted/inactive products must not survive an authoritative refresh.
      setLoadedProducts(unique);
      catalogCompleteRef.current = true;
      setHasMore(false);
      return unique;
    } catch (error) {
      setProductsError('No se pudo confirmar el catálogo. Comprueba tu conexión y vuelve a intentar.');
      setHasMore(true);
      console.warn('Could not confirm catalog:', error);
      return [];
    } finally {
      clearTimeout(timeout);
      isFetchingMoreRef.current = false;
      setIsLoadingMore(false);
      setStage('idle');
    }
  }, [getFullCatalog]);

  useEffect(() => { void loadNextFourProducts(); }, [loadNextFourProducts]);

  useEffect(() => {
    if (!catalogCompleteRef.current || coveredStoresRef.current === null ||
        openRestaurants.every(store => coveredStoresRef.current!.has(store.uid))) return;
    // A newly opened shop was outside the API's previous open-store scope.
    catalogCompleteRef.current = false;
    fullCatalogRequestRef.current = null;
    setHasMore(true);
    void loadNextFourProducts();
  }, [openRestaurants, loadNextFourProducts]);

  // Only server-confirmed profiles may publish restaurant availability.
  useEffect(() => {
    let active = true;
    let confirmed = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let liveProfiles: Record<string, UserProfile> = {};
    const clearAvailability = () => {
      confirmed = false;
      liveProfiles = {};
      openRestaurantsRef.current = [];
      setOpenRestaurants([]);
      setLoadedLogos([]);
      setProfilesMap({});
      setFirstStore(null);
      setRestaurantsReady(false);
    };
    const fail = (code: string) => {
      if (!active) return;
      clearTimeout(deadline);
      deadline = undefined;
      clearAvailability();
      const message = code === 'permission-denied'
        ? 'No se pudo consultar la disponibilidad por un problema de permisos.'
        : code === 'offline'
          ? 'Sin conexión. No podemos confirmar qué restaurantes están abiertos.'
          : 'No se pudo confirmar la disponibilidad. Comprueba tu conexión e intenta de nuevo.';
      setRestaurantsError({ code, message });
      setStatusMessage(message);
      console.warn('[restaurants] availability unavailable', JSON.stringify({ code }));
    };
    const waitForServer = () => {
      if (!active || deadline) return;
      clearAvailability();
      setRestaurantsError(null);
      setStatusMessage('');
      // A stalled Listen transport need not invoke onSnapshot's error callback.
      // Keep that listener alive so SDK reconnection can recover without a new query.
      deadline = setTimeout(() => fail('deadline-exceeded'), 15000);
    };
    waitForServer();
    if (navigator.onLine === false) fail('offline');
    const publish = () => {
      if (!confirmed) return;
      const stores = Object.values(liveProfiles).filter(s =>
        (s.displayName || s.username) && !checkIsStoreClosed(s)
      ).sort((a, b) => Number(Boolean(b.photoURL)) - Number(Boolean(a.photoURL)));
      // Preserve existing positions across updates. New validated restaurants append;
      // adding/changing a photo must not move a restaurant to another position.
      const positions = new Map<string, number>(openRestaurantsRef.current.map((store, index): [string, number] => [store.uid, index]));
      stores.sort((a, b) => (positions.get(a.uid) ?? positions.size) - (positions.get(b.uid) ?? positions.size));
      const aliases: Record<string, UserProfile> = { ...liveProfiles };
      Object.values(liveProfiles).forEach(s => {
        if (s.username) aliases[s.username.toLowerCase()] = s;
      });
      openRestaurantsRef.current = stores;
      setProfilesMap(aliases);
      const unchanged = (previous: UserProfile[]) => previous.length === stores.length &&
        previous.every((store, index) => store === stores[index]) ? previous : stores;
      setOpenRestaurants(unchanged);
      setLoadedLogos(unchanged);
      setFirstStore(stores[0] || null);
      setRestaurantsReady(true);
      setRestaurantsError(null);
      setStatusMessage('');
    };
    const unsubscribe = onSnapshot(collection(db, 'profiles'),
      { includeMetadataChanges: true }, snapshot => {
        if (!active) return;
        if (import.meta.env?.DEV) console.debug('[restaurants] snapshot', JSON.stringify({
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          documents: snapshot.size,
          elapsedMs: Date.now() - startedAt
        }));
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          // Losing server confirmation must not leave old availability on screen.
          if (confirmed) waitForServer();
          return;
        }
        clearTimeout(deadline);
        deadline = undefined;
        confirmed = true;
        // Replace, rather than merge: deleted profiles and old aliases must disappear.
        liveProfiles = {};
        snapshot.forEach(doc => {
          const data = doc.data() as UserProfile;
          const uid = data.uid || doc.id;
          liveProfiles[uid] = { ...data, uid };
        });
        publish();
        if (import.meta.env?.DEV) console.debug('[restaurants] confirmed', JSON.stringify({
          documents: snapshot.size, open: openRestaurantsRef.current.length,
          elapsedMs: Date.now() - startedAt
        }));
      }, error => {
        if (!active) return;
        fail(error.code || 'unknown');
      });
    const offline = () => fail('offline');
    const online = () => waitForServer();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    // Re-evaluate schedules from raw flags; never freeze a computed closure in isClosed.
    const timer = setInterval(() => {
      if (active && confirmed) publish();
    }, 15000);
    return () => {
      active = false;
      unsubscribe();
      clearTimeout(deadline);
      clearInterval(timer);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [listenerAttempt]);

  const isLoadingRestaurants = !restaurantsReady && !restaurantsError;
  const isLoadingProducts = stage !== 'idle' && loadedProducts.length === 0;
  return {
    openRestaurants, loadedLogos, loadedProducts, profilesMap, stage, firstStore,
    isLoadingMore, hasMore, totalOpenCount: openRestaurants.length,
    loadNextFourProducts, statusMessage, isLoadingRestaurants, isLoadingProducts,
    restaurantsError, retryRestaurants, productsError, retryProducts: loadNextFourProducts
  };
}
