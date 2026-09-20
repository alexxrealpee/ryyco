/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { UserProfile, ProductItem } from '../types';
import { 
  fetchOpenRestaurantsFromFirebase, 
  fetchProductsForStoreFromFirebase,
  fetchAllActiveProductsAndStores,
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
}

// Instant synchronous cache retrieval to achieve 0ms initial render
function getCachedStoreData(): {
  openRestaurants: UserProfile[];
  products: ProductItem[];
  profiles: Record<string, UserProfile>;
  hasCache: boolean;
} {
  try {
    const rawLocal = typeof window !== 'undefined' ? localStorage.getItem('linnk_all_active_data_cache') : null;
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      if (parsed && (Array.isArray(parsed.products) || parsed.profiles)) {
        const profilesMap = (parsed.profiles || {}) as Record<string, UserProfile>;
        const rawProducts = Array.isArray(parsed.products) ? (parsed.products as ProductItem[]) : [];
        
        const openStores: UserProfile[] = [];
        const seen = new Set<string>();
        Object.values(profilesMap).forEach(p => {
          if (p && p.uid && !seen.has(p.uid) && !p.suspended && !checkIsStoreClosed(p)) {
            if (p.displayName || p.username) {
              seen.add(p.uid);
              openStores.push(p);
            }
          }
        });

        if (openStores.length > 0 || rawProducts.length > 0) {
          return {
            openRestaurants: openStores,
            products: rawProducts,
            profiles: profilesMap,
            hasCache: true
          };
        }
      }
    }

    if (typeof window !== 'undefined' && (window as any).__INITIAL_CATALOG_DATA__?.catalog) {
      const apiCatalog = (window as any).__INITIAL_CATALOG_DATA__.catalog;
      const apiStores = apiCatalog.stores || [];
      const apiProducts = apiCatalog.products || [];
      if (apiStores.length > 0 || apiProducts.length > 0) {
        const profilesMap: Record<string, UserProfile> = {};
        const openStores: UserProfile[] = [];
        apiStores.forEach((s: any) => {
          const isSuspended = s.suspended === true || s.subscriptionStatus === 'suspended' || s.subscriptionStatus === 'expired';
          const prof: UserProfile = {
            ...s,
            uid: s.uid,
            username: s.username,
            displayName: s.displayName || s.storeName || s.username || 'Restaurante',
            suspended: isSuspended,
            isClosed: isSuspended ? true : s.isClosed === true
          };
          if (prof.uid) profilesMap[prof.uid] = prof;
          if (prof.username) profilesMap[prof.username.toLowerCase()] = prof;
          if (!isSuspended && !prof.isClosed && (prof.displayName || prof.username)) {
            openStores.push(prof);
          }
        });

        const rawProducts: ProductItem[] = apiProducts.map((p: any) => ({
          ...p,
          id: String(p.id).trim(),
          name: p.name || 'Producto',
          price: typeof p.price === 'number' && !isNaN(p.price) ? p.price : parseFloat(p.price) || 0,
          stock: typeof p.stock === 'number' ? p.stock : 99,
          active: p.active !== false
        }));

        return {
          openRestaurants: openStores,
          products: rawProducts,
          profiles: profilesMap,
          hasCache: true
        };
      }
    }
  } catch (e) {}
  return { openRestaurants: [], products: [], profiles: {}, hasCache: false };
}

export function useProgressiveStoreLoader(): UseProgressiveStoreLoaderResult {
  const initialDataRef = useRef(getCachedStoreData());
  const initial = initialDataRef.current;

  const [openRestaurants, setOpenRestaurants] = useState<UserProfile[]>(() => initial.openRestaurants);
  const [loadedLogos, setLoadedLogos] = useState<UserProfile[]>(() => initial.openRestaurants);
  const [loadedProducts, setLoadedProducts] = useState<ProductItem[]>(() => initial.products);
  const [profilesMap, setProfilesMap] = useState<Record<string, UserProfile>>(() => initial.profiles);
  
  const [stage, setStage] = useState<ProgressiveLoadingStage>(() => initial.hasCache ? 'idle' : 'fetching_open_restaurants');
  const [firstStore, setFirstStore] = useState<UserProfile | null>(() => initial.openRestaurants[0] || null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(!initial.hasCache);
  const [statusMessage, setStatusMessage] = useState('');

  // State refs to prevent stale closures and avoid race conditions
  const currentStoreIdxRef = useRef(0);
  const storeLastDocsRef = useRef<Record<string, any>>({});
  const loadedProductIdsRef = useRef<Set<string>>(
    new Set(initial.products.map(p => p.id).filter(Boolean))
  );
  const isFetchingMoreRef = useRef(false);
  const isInitializedRef = useRef(false);
  const openRestaurantsRef = useRef<UserProfile[]>(initial.openRestaurants);

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
        
        // Filter out any product already loaded or without valid id
        const fresh = result.products.filter(p => p && p.id && !loadedProductIdsRef.current.has(p.id));
        
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
      // 1. Check local memory/storage cache for unrendered products first (instant response, 0ms)
      let availablePool: ProductItem[] = [];
      try {
        const rawLocal = localStorage.getItem('linnk_all_active_data_cache');
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          if (Array.isArray(parsed?.products)) availablePool = parsed.products;
        }
      } catch (e) {}

      if (availablePool.length === 0 && (window as any).__INITIAL_CATALOG_DATA__?.catalog?.products) {
        availablePool = (window as any).__INITIAL_CATALOG_DATA__.catalog.products;
      }

      const unrendered = availablePool.filter(p => p && p.id && !loadedProductIdsRef.current.has(p.id));
      if (unrendered.length > 0) {
        const nextBatch = unrendered.slice(0, 4);
        nextBatch.forEach(p => {
          if (p.id) loadedProductIdsRef.current.add(p.id);
        });
        setLoadedProducts(prev => [...prev, ...nextBatch]);
        setHasMore(unrendered.length > 4 || currentStoreIdxRef.current < openRestaurantsRef.current.length);
        return nextBatch;
      }

      // 2. If no buffered products in local storage, fetch full catalog from server API
      try {
        const res = await fetch('/api/catalog/available');
        if (res.ok) {
          const fullData = await res.json();
          const catalogProducts: ProductItem[] = fullData?.catalog?.products || [];
          if (catalogProducts.length > 0) {
            const freshFromApi = catalogProducts.filter(p => p && p.id && !loadedProductIdsRef.current.has(p.id));
            if (freshFromApi.length > 0) {
              const nextBatch = freshFromApi.slice(0, 4);
              nextBatch.forEach(p => {
                if (p.id) loadedProductIdsRef.current.add(p.id);
              });
              setLoadedProducts(prev => [...prev, ...nextBatch]);
              setHasMore(freshFromApi.length > 4 || currentStoreIdxRef.current < openRestaurantsRef.current.length);
              return nextBatch;
            }
          }
        }
      } catch (e) {}

      // 3. Fallback: Fetch sequentially from Firestore across open restaurants
      const newBatch = await fetchBatch(4);

      if (newBatch.length > 0) {
        setLoadedProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const uniqueNew = newBatch.filter(p => p && p.id && !existingIds.has(p.id));
          return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev;
        });
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

  // Listen for background full catalog completion
  useEffect(() => {
    const handleCatalogUpdate = (e: any) => {
      const detail = e.detail;
      const incomingProducts: ProductItem[] = 
        (Array.isArray(detail?.products) ? detail.products : detail?.catalog?.products) || [];
      const incomingProfiles: Record<string, UserProfile> = detail?.profiles || {};

      if (incomingProducts.length > 0) {
        setLoadedProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newProducts = incomingProducts.filter(p => p && p.id && !existingIds.has(p.id));
          if (newProducts.length === 0) return prev;
          newProducts.forEach(p => {
            if (p.id) loadedProductIdsRef.current.add(p.id);
          });
          return [...prev, ...newProducts];
        });

        if (Object.keys(incomingProfiles).length > 0) {
          setProfilesMap(prev => ({ ...prev, ...incomingProfiles }));
        }

        setHasMore(true);
      }
    };

    window.addEventListener('linnk:catalog_updated', handleCatalogUpdate);
    return () => window.removeEventListener('linnk:catalog_updated', handleCatalogUpdate);
  }, []);

  // Main Progressive Loading Orchestrator with Stale-While-Revalidate speed
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    async function runProgressivePipeline() {
      try {
        if (!initial.hasCache) {
          setStage('fetching_open_restaurants');
        }

        // Parallel fetch for active data (profiles + products in one single fast pass)
        const activeData = await fetchAllActiveProductsAndStores(false);
        const pMap = activeData.profiles || {};

        const seenUids = new Set<string>();
        let openStores: UserProfile[] = [];
        Object.values(pMap).forEach(s => {
          if (s && s.uid && !seenUids.has(s.uid) && !s.suspended && !checkIsStoreClosed(s)) {
            if (s.displayName || s.username) {
              seenUids.add(s.uid);
              openStores.push(s);
            }
          }
        });

        // Fallback if pMap did not yield open stores
        if (openStores.length === 0) {
          openStores = await fetchOpenRestaurantsFromFirebase();
        }

        if (openStores.length > 0) {
          openRestaurantsRef.current = openStores;
          setOpenRestaurants(openStores);
          setLoadedLogos(openStores);
          setFirstStore(openStores[0]);
        }

        setProfilesMap(pMap);

        if (activeData.products && activeData.products.length > 0) {
          const openStoreUids = new Set(openStores.map(s => s.uid));
          const openStoreUsernames = new Set(openStores.map(s => s.username?.toLowerCase()).filter(Boolean));

          const openStoreProducts = activeData.products.filter(p => {
            const matchedUid = p.userId && openStoreUids.has(p.userId);
            const matchedUsername = p.storeUsername && openStoreUsernames.has(p.storeUsername.toLowerCase());
            return matchedUid || matchedUsername;
          });

          const candidateProducts = openStoreProducts.length > 0 ? openStoreProducts : activeData.products;

          const seen = new Set<string>();
          const uniqueInitial = candidateProducts.filter(p => {
            if (!p || !p.id || seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });

          const finalInitialProducts = orderProductBatch(uniqueInitial);
          finalInitialProducts.forEach(p => {
            if (p.id) loadedProductIdsRef.current.add(p.id);
          });

          setLoadedProducts(finalInitialProducts);
          setProfilesMap(prev => ({ ...prev, ...activeData.profiles }));
          // Ensure hasMore remains true so user can scroll to load the remaining products
          setHasMore(true);
        } else if (openStores.length > 0) {
          const initialBatch = await fetchBatch(8);
          if (initialBatch.length > 0) {
            initialBatch.forEach(p => {
              if (p.id) loadedProductIdsRef.current.add(p.id);
            });
            setLoadedProducts(initialBatch);
          }
        }

        setStage('idle');
      } catch (error) {
        console.error('Error in progressive loading pipeline:', error);
        setStage('idle');
      }
    }

    runProgressivePipeline();
  }, [fetchBatch, initial.hasCache]);

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
