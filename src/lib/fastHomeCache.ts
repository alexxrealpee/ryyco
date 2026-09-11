import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, checkIsStoreClosed } from './firebase';
import { ProductItem, UserProfile } from '../types';
import { safeGetItem, safeSetItem } from './safeStorage';
import fastHomePreload from '../data/fastHomePreload.json';

const FAST_HOME_CACHE_KEY = 'linnk_fast_home_v3';

export interface FastHomeData {
  products: ProductItem[];
  profiles: Record<string, UserProfile>;
  hasCache: boolean;
}

// In-memory runtime cache for instantaneous tab switching and navigation
let _memoryFastCache: { products: ProductItem[]; profiles: Record<string, UserProfile>; timestamp: number } | null = null;

/**
 * Synchronously retrieves cached stores and initial 4 products
 * for 0-millisecond instant initial paint.
 */
export function getFastHomeInitialData(): FastHomeData {
  try {
    // 1. Check in-memory runtime cache first
    if (_memoryFastCache && _memoryFastCache.products.length > 0) {
      return {
        products: _memoryFastCache.products,
        profiles: _memoryFastCache.profiles,
        hasCache: true
      };
    }

    // 2. Check localStorage via safeStorage
    const raw = safeGetItem(FAST_HOME_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
        _memoryFastCache = {
          products: parsed.products,
          profiles: parsed.profiles || {},
          timestamp: parsed.timestamp || Date.now()
        };
        return {
          products: parsed.products as ProductItem[],
          profiles: (parsed.profiles || {}) as Record<string, UserProfile>,
          hasCache: true
        };
      }
    }

    // 3. Fallback to pre-seeded instant snapshot (0 ms paint on first-ever visit)
    if (fastHomePreload && Array.isArray(fastHomePreload.products) && fastHomePreload.products.length > 0) {
      return {
        products: fastHomePreload.products as unknown as ProductItem[],
        profiles: (fastHomePreload.profiles || {}) as unknown as Record<string, UserProfile>,
        hasCache: true
      };
    }
  } catch (e) {
    console.warn("Could not read fast home cache:", e);
  }

  return {
    products: [],
    profiles: {},
    hasCache: false
  };
}

/**
 * Saves a lightweight cache of active store profiles and the first 4-6 products.
 * This stays under 1 MB and will never exceed browser localStorage limits.
 */
export function saveFastHomeCache(
  profiles: Record<string, UserProfile>,
  products: ProductItem[]
): void {
  try {
    const cleanProfiles: Record<string, UserProfile> = {};

    // Only preserve active, non-suspended store profiles with essential display fields
    Object.values(profiles).forEach(p => {
      if (p && p.uid && !checkIsStoreClosed(p) && !p.suspended) {
        cleanProfiles[p.uid] = {
          uid: p.uid,
          username: p.username || '',
          storeName: p.storeName || p.displayName || '',
          displayName: p.displayName || p.storeName || '',
          photoURL: p.photoURL || '',
          isClosed: false,
          suspended: false,
          phone: p.phone || '',
          whatsapp: p.whatsapp || p.phone || ''
        } as UserProfile;

        if (p.username) {
          cleanProfiles[p.username.toLowerCase()] = cleanProfiles[p.uid];
        }
      }
    });

    // Only keep the first 4 products for instant initial paint
    const cleanProducts: ProductItem[] = products.slice(0, 4).map(p => ({
      id: p.id,
      name: p.name || 'Producto',
      price: typeof p.price === 'number' ? p.price : parseFloat(p.price as any) || 0,
      category: p.category || '',
      imageURL: p.imageURL || '',
      userId: p.userId || '',
      storeUsername: p.storeUsername || '',
      stock: typeof p.stock === 'number' ? p.stock : 99,
      active: true,
      description: p.description || '',
      createdAt: p.createdAt || ''
    }));

    _memoryFastCache = {
      products: cleanProducts,
      profiles: cleanProfiles,
      timestamp: Date.now()
    };

    safeSetItem(
      FAST_HOME_CACHE_KEY,
      JSON.stringify({
        products: cleanProducts,
        profiles: cleanProfiles,
        timestamp: Date.now()
      })
    );
  } catch (err) {
    console.warn("Could not write fast home cache:", err);
  }
}

/**
 * Phase 1: High-priority fast fetch from Firestore.
 * Concurrently queries all profiles (to get store logos and statuses) and the latest
 * products (limit 20), resolving in ~1s instead of loading the entire 17MB catalog.
 */
export async function fetchFastInitialHomeData(): Promise<{
  products: ProductItem[];
  profiles: Record<string, UserProfile>;
}> {
  try {
    const profilesMap: Record<string, UserProfile> = {};

    // Parallel fetch: profiles + top 20 latest products
    const [profilesSnap, prodsSnap] = await Promise.all([
      getDocs(collection(db, 'profiles')),
      getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(20))).catch(
        () => getDocs(query(collection(db, 'products'), limit(20)))
      )
    ]);

    // 1. Process profiles map
    if (profilesSnap && !profilesSnap.empty) {
      profilesSnap.forEach(docSnap => {
        const data = docSnap.data() as UserProfile;
        const isClosed = checkIsStoreClosed(data);
        const profileObj: UserProfile = {
          ...data,
          uid: data.uid || docSnap.id,
          suspended:
            data.suspended === true ||
            data.subscriptionStatus === 'suspended' ||
            data.subscriptionStatus === 'expired',
          isClosed: isClosed
        };

        profilesMap[docSnap.id] = profileObj;
        if (profileObj.uid) profilesMap[profileObj.uid] = profileObj;
        if (profileObj.username) profilesMap[profileObj.username.toLowerCase()] = profileObj;
      });
    }

    // 2. Filter products from active, open, non-suspended stores
    const fastProducts: ProductItem[] = [];
    if (prodsSnap && !prodsSnap.empty) {
      prodsSnap.forEach(docSnap => {
        const p = docSnap.data() as ProductItem;
        const cleanId = docSnap.id;
        const storeProf =
          profilesMap[p.userId || ''] ||
          (p.storeUsername && profilesMap[p.storeUsername.toLowerCase()]);

        if (
          storeProf &&
          !checkIsStoreClosed(storeProf) &&
          !storeProf.suspended &&
          p.active !== false
        ) {
          fastProducts.push({
            ...p,
            id: cleanId,
            name: p.name || 'Producto',
            price:
              typeof p.price === 'number' && !isNaN(p.price)
                ? p.price
                : parseFloat(p.price as any) || 0,
            stock:
              typeof p.stock === 'number' && !isNaN(p.stock)
                ? p.stock
                : parseInt(p.stock as any) || 99,
            active: true
          });
        }
      });
    }

    // Take the top 4 products
    const initial4Products = fastProducts.slice(0, 4);

    // Save lightweight cache for future 0ms instant loads
    if (initial4Products.length > 0 || Object.keys(profilesMap).length > 0) {
      saveFastHomeCache(profilesMap, initial4Products);
    }

    return {
      products: initial4Products,
      profiles: profilesMap
    };
  } catch (err) {
    console.error('Error in fetchFastInitialHomeData:', err);
    // Return cache fallback if remote call failed
    const cached = getFastHomeInitialData();
    return {
      products: cached.products,
      profiles: cached.profiles
    };
  }
}
