/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
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
  const [statusMessage, setStatusMessage] = useState('');
  const [restaurantsReady, setRestaurantsReady] = useState(false);
  const [restaurantsError, setRestaurantsError] = useState<{ code: string; message: string } | null>(null);
  const [listenerAttempt, setListenerAttempt] = useState(0);
  const retryRestaurants = useCallback(() => setListenerAttempt(attempt => attempt + 1), []);

  // State refs to prevent stale closures and avoid race conditions
  const isFetchingMoreRef = useRef(false);
  const isInitializedRef = useRef(false);
  const productRequestRef = useRef<Promise<ProductItem[]> | null>(null);
  const fullCatalogRequestRef = useRef<Promise<ProductItem[]> | null>(null);
  const catalogCompleteRef = useRef(false);
  const openRestaurantsRef = useRef<UserProfile[]>([]);

  // Shared by initial loading and pagination: at most one full catalog download.
  const getFullCatalog = useCallback((): Promise<ProductItem[]> => {
    if (!fullCatalogRequestRef.current) {
      fullCatalogRequestRef.current = (async () => {
        for (const url of ['/api/catalog/available', '/catalog-cache.json']) {
          try {
            const response = await fetch(url);
            if (!response.ok || !response.headers.get('content-type')?.includes('json')) continue;
            const data = await response.json();
            if (data?.isPartial !== true && Array.isArray(data?.catalog?.products)) {
              catalogCompleteRef.current = true;
              return orderProductBatch(data.catalog.products as ProductItem[]);
            }
          } catch {}
        }
        const snapshot = await getDocs(collection(db, 'products'));
        catalogCompleteRef.current = true;
        return orderProductBatch(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProductItem))
          .filter(p => p.active !== false));
      })();
    }
    return fullCatalogRequestRef.current;
  }, []);

  // Keep every downloaded record in memory; TiendaGeneral reveals six at a time.
  const appendProducts = useCallback((incoming: ProductItem[]) => {
    setLoadedProducts(previous => {
      const ids = new Set(previous.map(p => p.id));
      const fresh = incoming.filter(p => {
        if (!p?.id || ids.has(p.id)) return false;
        ids.add(p.id);
        return true;
      });
      return fresh.length ? [...previous, ...fresh] : previous;
    });
  }, []);

  const loadNextFourProducts = useCallback(async (): Promise<ProductItem[]> => {
    if (isFetchingMoreRef.current || catalogCompleteRef.current) return [];
    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      // Reuse the first request if it is still running instead of racing it.
      await productRequestRef.current;
      if (catalogCompleteRef.current) return [];
      const products = await getFullCatalog();
      appendProducts(products);
      setHasMore(false);
      return products;
    } catch (error) {
      // Stop automatic scroll retries; a remount can retry a failed catalog request.
      setHasMore(false);
      console.warn('Could not load the remaining catalog:', error);
      return [];
    } finally {
      isFetchingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [getFullCatalog, appendProducts]);

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

  // Product loading is independent of availability and never queries profiles again.
  useEffect(() => {
    let active = true;
    const update = (event: any) => {
      const detail = event.detail;
      if (active) appendProducts(detail?.products || detail?.catalog?.products || []);
    };
    window.addEventListener('linnk:catalog_updated', update);
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      // StrictMode can resubscribe while this shared request is still pending.
      productRequestRef.current = (async () => {
        try {
          const initial = (window as any).__INITIAL_CATALOG_DATA__ ||
            await (window as any).__CATALOG_PREFETCH__;
          if (Array.isArray(initial?.catalog?.products) &&
              (initial.catalog.products.length > 0 || initial.isPartial === false)) {
            catalogCompleteRef.current = initial.isPartial === false;
            return orderProductBatch(initial.catalog.products as ProductItem[]);
          }
        } catch {}
        return getFullCatalog();
      })();
    }
    productRequestRef.current?.then(products => {
      if (active) { appendProducts(products); setHasMore(!catalogCompleteRef.current); }
    }).catch(error => console.warn('Initial products:', error)).finally(() => {
      if (active) setStage('idle');
    });
    return () => { active = false; window.removeEventListener('linnk:catalog_updated', update); };
  }, [appendProducts, getFullCatalog]);

  const isLoadingRestaurants = !restaurantsReady && !restaurantsError;
  const isLoadingProducts = stage !== 'idle' && loadedProducts.length === 0;
  return {
    openRestaurants, loadedLogos, loadedProducts, profilesMap, stage, firstStore,
    isLoadingMore, hasMore, totalOpenCount: openRestaurants.length,
    loadNextFourProducts, statusMessage, isLoadingRestaurants, isLoadingProducts,
    restaurantsError, retryRestaurants
  };
}
