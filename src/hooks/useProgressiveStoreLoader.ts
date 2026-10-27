/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, onSnapshot, getDocsFromServer, query, limit, orderBy, startAfter, documentId } from 'firebase/firestore';
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
  const storeBootstrapRef = useRef((window as any).__RYYCO_STORES__ as Promise<any> | undefined);
  const productBootstrapRef = useRef((window as any).__RYYCO_PRODUCTS__ as Promise<any> | undefined);
  const isFetchingMoreRef = useRef(false);
  const pageRequestRef = useRef<Promise<{ items: ProductItem[]; cursor: string | null; hasMore: boolean }> | null>(null);
  const cursorRef = useRef<string | null>(null);
  const completeRef = useRef(false);
  const firstRequestRef = useRef(true);
  const openRestaurantsRef = useRef<UserProfile[]>([]);

  const loadNextFourProducts = useCallback(async (): Promise<ProductItem[]> => {
    if (isFetchingMoreRef.current || completeRef.current) return [];
    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);
    setProductsError(null);
    if (!pageRequestRef.current) {
      const cursor = cursorRef.current;
      const prefetched = firstRequestRef.current ? productBootstrapRef.current : undefined;
      firstRequestRef.current = false;
      (window as any).__RYYCO_PRODUCTS__ = null;
      pageRequestRef.current = (async () => {
        try {
          const requestPage = async () => {
            const url = '/api/catalog-page.php?kind=products&limit=12' + (cursor ? '&after=' + encodeURIComponent(cursor) : '');
            const options = { cache: 'no-store' as RequestCache, priority: 'high' as RequestPriority, signal: AbortSignal.timeout(12000) };
            let result = await fetch(url, options);
            // A transient gateway failure should not immediately trigger a larger SDK download.
            if (result.status >= 500) result = await fetch(url, options);
            return result.ok ? result.json() : null;
          };
          const response = prefetched ? await prefetched : await requestPage();
          if (response?.source !== 'firestore-server' || response.kind !== 'products' || !Array.isArray(response.items) ||
              typeof response.hasMore !== 'boolean' || (response.hasMore && (!response.cursor || response.cursor === cursor))) throw Error('unconfirmed-page');
          return response;
        } catch (error) {
          performance.mark?.('ryyco:page-fallback', {detail: error instanceof Error ? error.message : 'unknown'});
          // A native app or unavailable PHP uses the same bounded document-ID pagination.
          const constraints = [orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(12)];
          const snapshot = await getDocsFromServer(query(collection(db, 'products'), ...constraints));
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) throw Error('unconfirmed-page');
          return {items:snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProductItem)),
            cursor:snapshot.docs.at(-1)?.id || null, hasMore:snapshot.docs.length === 12};
        }
      })();
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const page = await Promise.race([pageRequestRef.current, new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(Error('catalog-timeout')), 15000);
      })]);
      performance.mark?.('ryyco:page-ready', {detail: {count:page.items.length, hasMore:page.hasMore}});
      const items = orderProductBatch(page.items.filter(product => product?.id && product.active !== false));
      setLoadedProducts(previous => Array.from(new Map([...previous, ...items].map(p => [p.id, p])).values()));
      cursorRef.current = page.cursor;
      completeRef.current = !page.hasMore;
      setHasMore(page.hasMore);
      pageRequestRef.current = null;
      return items;
    } catch (error) {
      performance.mark?.('ryyco:page-error', {detail: error instanceof Error ? error.message : 'unknown'});
      if (!(error instanceof Error) || error.message !== 'catalog-timeout') pageRequestRef.current = null;
      setProductsError('No pudimos cargar más productos. Revisa tu conexión y reintenta.');
      return [];
    } finally {
      clearTimeout(timeout);
      isFetchingMoreRef.current = false;
      setIsLoadingMore(false);
      setStage('idle');
    }
  }, []);

  useEffect(() => { void loadNextFourProducts(); }, [loadNextFourProducts]);

  // Only server-confirmed profiles may publish restaurant availability.
  useEffect(() => {
    let active = true;
    let confirmed = false;
    let listenerConfirmed = false;
    let allowBootstrap = listenerAttempt === 0;
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
      allowBootstrap = false;
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
    let unsubscribe = () => {};
    let subscribed = false;
    let subscribeTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshController = new AbortController();
    const renewAvailability = async () => {
      if (!active || listenerConfirmed || !allowBootstrap) return;
      try {
        const response = await fetch('/api/catalog-page.php?kind=stores', {
          cache: 'no-store', priority: 'high', signal: refreshController.signal
        });
        if (response.ok) {
          acceptBootstrap(await response.json());
          return;
        }
      } catch { /* A failed renewal never extends freshness. */ }
      if (active && allowBootstrap && !listenerConfirmed) refreshTimer = setTimeout(renewAvailability, 2000);
    };
    const subscribe = () => {
      if (!active || subscribed) return;
      subscribed = true;
      clearTimeout(subscribeTimer);
      unsubscribe = onSnapshot(collection(db, 'profiles'),
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
          if (confirmed && listenerConfirmed) waitForServer();
          return;
        }
        clearTimeout(deadline);
        deadline = undefined;
        confirmed = true;
        listenerConfirmed = true;
        clearTimeout(refreshTimer);
        refreshController.abort();
        allowBootstrap = false;
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
    };
    // Give the in-flight lightweight response a head start on mobile connections.
    // Live updates attach as soon as it settles, or after a bounded fallback delay.
    if (storeBootstrapRef.current) subscribeTimer = setTimeout(subscribe, 2500);
    else subscribe();
    // The server response contains fresh availability, unlike the old static JSON.
    // It can publish the whole restaurant list before the multi-megabyte SDK snapshot.
    const acceptBootstrap = (response: any) => {
      if (!active || !allowBootstrap || navigator.onLine === false ||
          response?.source !== 'firestore-server' || response.kind !== 'stores' ||
          !Array.isArray(response.items)) return;
      (window as any).__RYYCO_STORES__ = null;
      clearTimeout(deadline);
      deadline = undefined;
      liveProfiles = Object.fromEntries(response.items.map((store: UserProfile) => [store.uid, store]));
      confirmed = true;
      publish();
      // Keep confirmation bounded if the live listener never connects.
      deadline = setTimeout(() => fail('deadline-exceeded'), 15000);
      // Until the large legacy realtime snapshot connects, renew with a fresh
      // projected server query. A failed renewal never extends the 15s lease.
      refreshTimer = setTimeout(renewAvailability, 8000);
    };
    void storeBootstrapRef.current?.then(acceptBootstrap).catch(() => {}).finally(subscribe);
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
      clearTimeout(subscribeTimer);
      clearTimeout(refreshTimer);
      refreshController.abort();
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
