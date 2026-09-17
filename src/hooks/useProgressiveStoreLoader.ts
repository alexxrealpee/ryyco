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

  // State refs to prevent stale closures and avoid race conditions
  const currentStoreIdxRef = useRef(0);
  const storeLastDocsRef = useRef<Record<string, any>>({});
  const loadedProductIdsRef = useRef<Set<string>>(new Set());
  const isFetchingMoreRef = useRef(false);
  const isInitializedRef = useRef(false);
  const openRestaurantsRef = useRef<UserProfile[]>([]);

  /**
   * Helper function: fetches a sequential batch of products across open restaurants.
   * Gathers up to batchSize products in order, advancing from store to store as needed.
   */
  const fetchBatch = useCallback(async (batchSize: number = 4): Promise<ProductItem[]> => {
    const stores = openRestaurantsRef.current;
    if (stores.length === 0) return [];

    const batch: ProductItem[] = [];

    while (batch.length < batchSize && currentStoreIdxRef.current < stores.length) {
      const currentStore = stores[currentStoreIdxRef.current];
      const needed = batchSize - batch.length;
      const lastDoc = storeLastDocsRef.current[currentStore.uid];

      try {
        const result = await fetchProductsForStoreFromFirebase(currentStore, needed, lastDoc);
        
        // Filter out any product already loaded
        const fresh = result.products.filter(p => !loadedProductIdsRef.current.has(p.id));
        
        fresh.forEach(p => {
          loadedProductIdsRef.current.add(p.id);
          batch.push(p);
        });

        storeLastDocsRef.current[currentStore.uid] = result.lastDoc;

        // If the current store ran out of items or returned fewer than needed, advance to the next open restaurant
        if (!result.hasMore || result.products.length < needed) {
          currentStoreIdxRef.current += 1;
        }
      } catch (err) {
        console.warn(`Error fetching batch for store ${currentStore.displayName || currentStore.uid}:`, err);
        currentStoreIdxRef.current += 1;
      }
    }

    if (currentStoreIdxRef.current >= stores.length && batch.length === 0) {
      setHasMore(false);
    }

    // Order this specific batch internally (food first, then newest first)
    return orderProductBatch(batch);
  }, []);

  /**
   * Loads the next 4 products in order and strictly appends them.
   * Products already rendered on screen are never displaced.
   */
  const loadNextFourProducts = useCallback(async (): Promise<ProductItem[]> => {
    if (isFetchingMoreRef.current || !hasMore) return [];

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const newBatch = await fetchBatch(4);

      if (newBatch.length > 0) {
        setLoadedProducts(prev => [...prev, ...newBatch]);
      } else {
        setHasMore(false);
      }

      return newBatch;
    } catch (err) {
      console.warn('Error in loadNextFourProducts:', err);
      return [];
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [fetchBatch, hasMore]);

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

        let openStores = await fetchOpenRestaurantsFromFirebase();

        // Fallback: If no open restaurants returned from profiles, retrieve via global active sync
        if (openStores.length === 0) {
          const fallbackData = await fetchAllActiveProductsAndStores();
          openStores = Object.values(fallbackData.profiles).filter(p => p && !p.suspended && !p.isClosed);
        }

        if (openStores.length === 0) {
          setStage('idle');
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

        // PASO 2: Disponibilizar inmediatamente todos los restaurantes abiertos
        const first = openStores[0];
        setFirstStore(first);
        setLoadedLogos(openStores);

        // PASO 3: Carga diferida (Lazy Load) estricta:
        // NO leer productos de Firebase en la carga inicial de la página.
        // Los productos solo se leen de Firebase cuando el usuario hace clic en el restaurante.
        setStage('idle');
      } catch (error) {
        console.error('Error in progressive loading pipeline:', error);
        setStage('idle');
      }
    }

    runProgressivePipeline();
  }, [fetchBatch]);

  const isLoadingRestaurants = stage === 'fetching_open_restaurants' && openRestaurants.length === 0;
  const isLoadingProducts = (stage === 'fetching_open_restaurants' || stage === 'showing_first_logo' || stage === 'fetching_first_products') && loadedProducts.length === 0;

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
    statusMessage,
    isLoadingRestaurants,
    isLoadingProducts
  };
}
