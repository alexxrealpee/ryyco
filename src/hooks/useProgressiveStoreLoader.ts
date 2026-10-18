/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { UserProfile, ProductItem } from '../types';
import { 
  db,
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

// Browser / in-memory logo image cache to prevent re-downloads and flickering
const preloadedLogosCache = new Set<string>();

export function preloadStoreLogos(stores?: UserProfile[]) {
  if (typeof window === 'undefined' || !Array.isArray(stores)) return;
  for (const s of stores) {
    const url = s?.photoURL;
    if (url && typeof url === 'string' && !preloadedLogosCache.has(url)) {
      preloadedLogosCache.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  }
}

export function isLogoCached(url?: string): boolean {
  if (!url) return false;
  return preloadedLogosCache.has(url);
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
  const fetchBatch = useCallback(async (batchSize: number = 6): Promise<ProductItem[]> => {
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
   * Loads the next 6 products in order and strictly appends them.
   * Products already rendered on screen are never displaced.
   */
  const loadNextFourProducts = useCallback(async (): Promise<ProductItem[]> => {
    if (isFetchingMoreRef.current || !hasMore) return [];

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      // 1. Unrendered products pool from memory/server (never read from persistent cache)
      let availablePool: ProductItem[] = [];

      if ((window as any).__INITIAL_CATALOG_DATA__?.catalog?.products) {
        availablePool = (window as any).__INITIAL_CATALOG_DATA__.catalog.products;
      }

      const unrendered = availablePool.filter(p => p && p.id && !loadedProductIdsRef.current.has(p.id));
      if (unrendered.length > 0) {
        const nextBatch = unrendered.slice(0, 6);
        nextBatch.forEach(p => {
          if (p.id) loadedProductIdsRef.current.add(p.id);
        });
        setLoadedProducts(prev => [...prev, ...nextBatch]);
        setHasMore(unrendered.length > 6 || currentStoreIdxRef.current < openRestaurantsRef.current.length);
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
              const nextBatch = freshFromApi.slice(0, 6);
              nextBatch.forEach(p => {
                if (p.id) loadedProductIdsRef.current.add(p.id);
              });
              setLoadedProducts(prev => [...prev, ...nextBatch]);
              setHasMore(freshFromApi.length > 6 || currentStoreIdxRef.current < openRestaurantsRef.current.length);
              return nextBatch;
            }
          }
        }
      } catch (e) {}

      // 3. Fallback: Fetch sequentially from Firestore across open restaurants
      const newBatch = await fetchBatch(6);

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
      console.warn('Error in loadNextBatch:', err);
      return [];
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [fetchBatch, hasMore]);

  // Listen for background full catalog completion and store status changes
  useEffect(() => {
    const handleCatalogUpdate = (e: any) => {
      const detail = e.detail;
      const incomingProducts: ProductItem[] = 
        (Array.isArray(detail?.products) ? detail.products : detail?.catalog?.products) || [];
      const incomingProfiles: Record<string, UserProfile> = detail?.profiles || {};

      if (Object.keys(incomingProfiles).length > 0) {
        setProfilesMap(prev => {
          const merged = { ...prev, ...incomingProfiles };
          const seen = new Set<string>();
          const freshOpen: UserProfile[] = [];
          (Object.values(merged) as UserProfile[]).forEach(s => {
            if (s && s.uid && !seen.has(s.uid) && !s.suspended && !checkIsStoreClosed(s) && s.isClosed !== true) {
              if (s.displayName || s.username) {
                seen.add(s.uid);
                freshOpen.push(s);
              }
            }
          });
          freshOpen.sort((a, b) => (b.photoURL ? 1 : 0) - (a.photoURL ? 1 : 0));
          openRestaurantsRef.current = freshOpen;
          setOpenRestaurants(freshOpen);
          setLoadedLogos(freshOpen);
          return merged;
        });
      }

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

        setHasMore(true);
      }
    };

    const handleStoreStatusChange = (e: any) => {
      const { uid, isClosed } = e.detail || {};
      if (uid) {
        setProfilesMap(prev => {
          const s = prev[uid];
          if (!s) return prev;
          const updated = { ...s, isClosed };
          if (isClosed) {
            setOpenRestaurants(old => old.filter(st => st.uid !== uid));
            setLoadedLogos(old => old.filter(st => st.uid !== uid));
          } else {
            setOpenRestaurants(old => {
              if (old.some(st => st.uid === uid)) return old;
              return [updated, ...old];
            });
            setLoadedLogos(old => {
              if (old.some(st => st.uid === uid)) return old;
              return [updated, ...old];
            });
          }
          return { ...prev, [uid]: updated };
        });
      }
    };

    window.addEventListener('linnk:catalog_updated', handleCatalogUpdate);
    window.addEventListener('linnk:store_status_changed', handleStoreStatusChange);
    return () => {
      window.removeEventListener('linnk:catalog_updated', handleCatalogUpdate);
      window.removeEventListener('linnk:store_status_changed', handleStoreStatusChange);
    };
  }, []);

  // Ensure loaded logos and open restaurants stay strictly synchronized with profilesMap
  useEffect(() => {
    if (Object.keys(profilesMap).length > 0) {
      const seen = new Set<string>();
      const currentOpen: UserProfile[] = [];
      (Object.values(profilesMap) as UserProfile[]).forEach(s => {
        if (s && s.uid && !seen.has(s.uid) && !s.suspended && !checkIsStoreClosed(s) && s.isClosed !== true) {
          if (s.displayName || s.username) {
            seen.add(s.uid);
            currentOpen.push(s);
          }
        }
      });
      currentOpen.sort((a, b) => (b.photoURL ? 1 : 0) - (a.photoURL ? 1 : 0));
      openRestaurantsRef.current = currentOpen;
      setOpenRestaurants(currentOpen);
      setLoadedLogos(currentOpen);
      preloadStoreLogos(currentOpen);
    }
  }, [profilesMap]);

  // Real-time Firestore listener: instantly removes closed stores and instantly displays newly opened stores
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'profiles'), (snapshot) => {
      const incomingProfiles: Record<string, UserProfile> = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as UserProfile;
        const uid = data.uid || docSnap.id;
        const isSuspended = data.suspended === true || data.subscriptionStatus === 'suspended' || data.subscriptionStatus === 'expired';
        const isClosedNow = isSuspended || data.isClosed === true || checkIsStoreClosed({ ...data, isClosed: data.isClosed, suspended: isSuspended });
        const prof: UserProfile = {
          ...data,
          uid,
          suspended: isSuspended,
          isClosed: isClosedNow
        };
        incomingProfiles[uid] = prof;
        if (prof.username) {
          incomingProfiles[prof.username.toLowerCase()] = prof;
        }
      });

      setProfilesMap(prev => {
        const merged = { ...prev, ...incomingProfiles };
        const seen = new Set<string>();
        const freshOpen: UserProfile[] = [];
        (Object.values(merged) as UserProfile[]).forEach(s => {
          if (s && s.uid && !seen.has(s.uid) && !s.suspended && !checkIsStoreClosed(s) && s.isClosed !== true) {
            if (s.displayName || s.username) {
              seen.add(s.uid);
              freshOpen.push(s);
            }
          }
        });
        freshOpen.sort((a, b) => (b.photoURL ? 1 : 0) - (a.photoURL ? 1 : 0));
        openRestaurantsRef.current = freshOpen;
        setOpenRestaurants(freshOpen);
        setLoadedLogos(freshOpen);
        preloadStoreLogos(freshOpen);
        setFirstStore(freshOpen[0] || null);
        return merged;
      });
      setStage('idle');
    }, (err) => {
      console.warn("Real-time profiles listener notice in store loader:", err);
      setStage('idle');
    });

    // 15-second schedule timer to auto-refresh stores when their opening/closing time arrives
    const scheduleTimer = setInterval(() => {
      setProfilesMap(prev => {
        if (!prev || Object.keys(prev).length === 0) return prev;
        const seen = new Set<string>();
        const freshOpen: UserProfile[] = [];
        (Object.values(prev) as UserProfile[]).forEach(s => {
          if (s && s.uid && !seen.has(s.uid) && !s.suspended && !checkIsStoreClosed(s) && s.isClosed !== true) {
            if (s.displayName || s.username) {
              seen.add(s.uid);
              freshOpen.push(s);
            }
          }
        });
        freshOpen.sort((a, b) => (b.photoURL ? 1 : 0) - (a.photoURL ? 1 : 0));
        openRestaurantsRef.current = freshOpen;
        setOpenRestaurants(freshOpen);
        setLoadedLogos(freshOpen);
        preloadStoreLogos(freshOpen);
        return prev;
      });
    }, 15000);

    return () => {
      unsubscribe();
      clearInterval(scheduleTimer);
    };
  }, []);

  // Main Progressive Loading Orchestrator with Stale-While-Revalidate speed
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    async function runProgressivePipeline() {
      try {
        setStage('fetching_open_restaurants');

        // Parallel fetch for active products and stores
        const activeData = await fetchAllActiveProductsAndStores(false);
        const pMap = activeData.profiles || {};

        const seenUids = new Set<string>();
        const openStores: UserProfile[] = [];
        Object.values(pMap).forEach(s => {
          if (s && s.uid && !seenUids.has(s.uid) && !s.suspended && !checkIsStoreClosed(s) && s.isClosed !== true) {
            if (s.displayName || s.username) {
              seenUids.add(s.uid);
              openStores.push(s);
            }
          }
        });

        if (openStores.length > 0) {
          openStores.sort((a, b) => (b.photoURL ? 1 : 0) - (a.photoURL ? 1 : 0));
          openRestaurantsRef.current = openStores;
          setOpenRestaurants(openStores);
          setLoadedLogos(openStores);
          preloadStoreLogos(openStores);
          setFirstStore(openStores[0] || null);
        }

        setProfilesMap(prev => ({ ...prev, ...pMap }));

        if (activeData.products && activeData.products.length > 0) {
          const currentStores = openRestaurantsRef.current.length > 0 ? openRestaurantsRef.current : openStores;
          const openStoreUids = new Set(currentStores.map(s => s.uid));
          const openStoreUsernames = new Set(currentStores.map(s => s.username?.toLowerCase()).filter(Boolean));

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
          const initialSlice = finalInitialProducts.slice(0, 6);
          initialSlice.forEach(p => {
            if (p.id) loadedProductIdsRef.current.add(p.id);
          });

          setLoadedProducts(initialSlice);
          setHasMore(uniqueInitial.length > 6 || currentStores.length > 0);
        } else if (openRestaurantsRef.current.length > 0) {
          const initialBatch = await fetchBatch(6);
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
