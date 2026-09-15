/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { UserProfile, ProductItem } from '../types';
import { 
  fetchOpenRestaurantsFromFirebase, 
  fetchProductsForStoreFromFirebase,
  fetchAllActiveProductsAndStores
} from '../lib/firebase';

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
  loadNextFourProducts: () => Promise<void>;
  statusMessage: string;
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
  const [statusMessage, setStatusMessage] = useState('Consultando restaurantes abiertos en Firebase...');

  // State refs to prevent stale closures and avoid race conditions
  const currentStoreIdxRef = useRef(0);
  const storeLastDocsRef = useRef<Record<string, any>>({});
  const loadedProductIdsRef = useRef<Set<string>>(new Set());
  const isFetchingMoreRef = useRef(false);
  const isInitializedRef = useRef(false);
  const openRestaurantsRef = useRef<UserProfile[]>([]);

  // Function to load the next batch of 4 products (on scroll or button click)
  const loadNextFourProducts = useCallback(async () => {
    if (isFetchingMoreRef.current) return;
    const stores = openRestaurantsRef.current;
    if (stores.length === 0) return;

    let idx = currentStoreIdxRef.current;
    if (idx >= stores.length) {
      setHasMore(false);
      return;
    }

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);
    setStatusMessage('Cargando 4 productos más...');

    try {
      const currentStore = stores[idx];
      const lastDoc = storeLastDocsRef.current[currentStore.uid];
      const result = await fetchProductsForStoreFromFirebase(currentStore, 4, lastDoc);

      const freshProducts = result.products.filter(p => !loadedProductIdsRef.current.has(p.id));

      if (freshProducts.length > 0) {
        freshProducts.forEach(p => loadedProductIdsRef.current.add(p.id));
        storeLastDocsRef.current[currentStore.uid] = result.lastDoc;
        setLoadedProducts(prev => [...prev, ...freshProducts]);
      }

      // If current store ran out of products or gave fewer than 4, advance to next open store
      if (!result.hasMore || freshProducts.length < 4) {
        currentStoreIdxRef.current = idx + 1;

        // If we still need more products to make a full 4-pack, fetch from the next store
        if (idx + 1 < stores.length && freshProducts.length < 4) {
          const needed = 4 - freshProducts.length;
          const nextStore = stores[idx + 1];
          const nextResult = await fetchProductsForStoreFromFirebase(nextStore, needed);
          const nextFresh = nextResult.products.filter(p => !loadedProductIdsRef.current.has(p.id));

          if (nextFresh.length > 0) {
            nextFresh.forEach(p => loadedProductIdsRef.current.add(p.id));
            storeLastDocsRef.current[nextStore.uid] = nextResult.lastDoc;
            setLoadedProducts(prev => [...prev, ...nextFresh]);
          }
        }
      }

      if (currentStoreIdxRef.current >= stores.length && !result.hasMore) {
        setHasMore(false);
      }
    } catch (err) {
      console.warn('Error loading next 4 products on scroll:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
      setStatusMessage('');
    }
  }, []);

  // Main Progressive Loading Orchestrator
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    async function runProgressivePipeline() {
      try {
        // =========================================================================
        // PASO 1: Consulta a Firebase para obtener los restaurantes que están abiertos
        // =========================================================================
        setStage('fetching_open_restaurants');
        setStatusMessage('Consultando restaurantes abiertos...');

        let openStores = await fetchOpenRestaurantsFromFirebase();

        // Fallback: If no open restaurants returned from profiles, retrieve via global active sync
        if (openStores.length === 0) {
          const fallbackData = await fetchAllActiveProductsAndStores();
          openStores = Object.values(fallbackData.profiles).filter(p => p && !p.suspended && !p.isClosed);
        }

        if (openStores.length === 0) {
          setStage('idle');
          setStatusMessage('No se encontraron restaurantes abiertos');
          setHasMore(false);
          return;
        }

        openRestaurantsRef.current = openStores;
        setOpenRestaurants(openStores);

        // Build profiles dictionary
        const pMap: Record<string, UserProfile> = {};
        openStores.forEach(s => {
          pMap[s.uid] = s;
          if (s.username) pMap[s.username.toLowerCase()] = s;
        });
        setProfilesMap(pMap);

        // =========================================================================
        // PASO 2: Para el primer restaurante que cargue:
        //         1. Muestra su logo primero
        //         2. Después consulta y renderiza sus primeros 4 productos
        // =========================================================================
        const first = openStores[0];
        setFirstStore(first);
        setStage('showing_first_logo');
        setStatusMessage(`Cargando logo de ${first.displayName || first.username}...`);

        // Render first logo immediately
        setLoadedLogos([first]);

        // Small visual pause (350ms) so the user perceives the logo rendering first
        await new Promise(r => setTimeout(r, 350));

        // Query and render its first four products
        setStage('fetching_first_products');
        setStatusMessage(`Cargando los primeros 4 productos de ${first.displayName || first.username}...`);

        let initialResult = await fetchProductsForStoreFromFirebase(first, 4);
        let firstBatch = initialResult.products;

        // If the first store has fewer than 4 products and there is a 2nd store, fetch to complete 4
        if (firstBatch.length < 4 && openStores.length > 1) {
          const needed = 4 - firstBatch.length;
          const secondStore = openStores[1];
          const secondResult = await fetchProductsForStoreFromFirebase(secondStore, needed);
          secondResult.products.forEach(p => {
            if (!firstBatch.some(existing => existing.id === p.id)) {
              firstBatch.push(p);
            }
          });
          currentStoreIdxRef.current = 1;
        }

        firstBatch.forEach(p => loadedProductIdsRef.current.add(p.id));
        storeLastDocsRef.current[first.uid] = initialResult.lastDoc;
        setLoadedProducts(firstBatch);

        // =========================================================================
        // PASO 3: Una vez hecho esto, procede a cargar el logo del siguiente
        //         restaurante abierto, y luego el otro logo...
        // =========================================================================
        setStage('loading_subsequent_logos');
        setStatusMessage('Cargando logos de los siguientes restaurantes abiertos...');

        for (let i = 1; i < openStores.length; i++) {
          // Stagger each logo entrance by ~220ms so each restaurant logo appears sequentially
          await new Promise(r => setTimeout(r, 220));
          const nextStore = openStores[i];
          setLoadedLogos(prev => {
            if (prev.some(s => s.uid === nextStore.uid)) return prev;
            return [...prev, nextStore];
          });
        }

        // =========================================================================
        // PASO 4: Listo para cargar los otros 4 productos cuando el usuario realice scroll
        // =========================================================================
        setStage('idle');
        setStatusMessage('');
      } catch (error) {
        console.error('Error in progressive loading pipeline:', error);
        setStage('idle');
        setStatusMessage('');
      }
    }

    runProgressivePipeline();
  }, []);

  // Listen to window scroll to trigger loading 4 more products when approaching the bottom
  useEffect(() => {
    let timeoutId: any = null;

    const handleScroll = () => {
      if (timeoutId) return;
      timeoutId = setTimeout(() => {
        timeoutId = null;

        // Trigger when the user is within 350px of the page bottom
        const scrollBottom = window.innerHeight + window.scrollY;
        const pageHeight = document.documentElement.scrollHeight;

        if (scrollBottom >= pageHeight - 350) {
          if (!isFetchingMoreRef.current && hasMore && stage === 'idle') {
            loadNextFourProducts();
          }
        }
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [hasMore, stage, loadNextFourProducts]);

  return {
    openRestaurants,
    loadedLogos,
    loadedProducts,
    profilesMap,
    stage,
    firstStore,
    isLoadingMore,
    hasMore,
    totalOpenCount: openRestaurants.length,
    loadNextFourProducts,
    statusMessage
  };
}
