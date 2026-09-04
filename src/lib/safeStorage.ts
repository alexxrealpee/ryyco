/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// In-memory fallback map if both localStorage and sessionStorage are unavailable or full
const memoryStorage = new Map<string, string>();

/**
 * Patterns of non-critical cache keys that can be safely evicted
 * when localStorage quota is exceeded. These are client-side read-through
 * caches that will simply be re-fetched from Firestore or defaults if missing.
 */
const DISPOSABLE_KEY_PREFIXES = [
  'linnk_analytics_views_',
  'linnk_analytics_clicks_',
  'linnk_views_',
  'linnk_clicks_',
  'linnk_leads_',
  'linnk_profile_',
  'linnk_products_',
  'linnk_orders_',
  'linnk_payments_',
  'linnk_links_'
];

/**
 * Safely evicts disposable caches from localStorage to free up space.
 */
export function evictDisposableStorageCache(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const keysToRemove: string[] = [];
    const len = window.localStorage.length;

    for (let i = 0; i < len; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;

      // Check if it matches any disposable prefix or key
      const isDisposable = DISPOSABLE_KEY_PREFIXES.some(prefix => key.startsWith(prefix)) ||
        key === 'linnk_profiles' ||
        key.includes('_analytics_');

      if (isDisposable) {
        keysToRemove.push(key);
      }
    }

    // Remove identified disposable keys
    for (const key of keysToRemove) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  } catch (e) {
    // In case localStorage.key() or length throws
  }
}

/**
 * Safely sets an item in localStorage with quota-exceeded mitigation
 * and graceful fallback to sessionStorage and in-memory storage.
 */
export function safeSetItem(key: string, value: string): boolean {
  // Always update in-memory cache as immediate fallback
  memoryStorage.set(key, value);

  if (typeof window === 'undefined') return false;

  // 1. Try setting in localStorage directly
  try {
    if (window.localStorage) {
      window.localStorage.setItem(key, value);
      return true;
    }
  } catch (err: any) {
    const isQuotaError = 
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      (typeof err?.message === 'string' && err.message.toLowerCase().includes('quota'));

    if (isQuotaError) {
      // 2. Try evicting disposable non-essential caches
      evictDisposableStorageCache();

      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        // Still full after eviction, continue to fallback
      }
    }
  }

  // 3. Fallback to sessionStorage
  try {
    if (window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
      return true;
    }
  } catch {
    // sessionStorage also full or inaccessible
  }

  // 4. Stored in memoryStorage map already
  return true;
}

/**
 * Safely gets an item from localStorage, sessionStorage, or in-memory fallback.
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') {
    return memoryStorage.get(key) || null;
  }

  try {
    if (window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {
    // ignore
  }

  try {
    if (window.sessionStorage) {
      const val = window.sessionStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {
    // ignore
  }

  return memoryStorage.get(key) || null;
}

/**
 * Safely removes an item from all storage layers.
 */
export function safeRemoveItem(key: string): void {
  memoryStorage.delete(key);

  if (typeof window === 'undefined') return;

  try {
    if (window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }

  try {
    if (window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
