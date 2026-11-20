import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, documentId, getDocsFromServer, limit, or, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { orderProductBatch } from '../lib/productUtils';
import type { ProductItem, UserProfile } from '../types';

const pageSize = 12;
const menuCacheDuration = 20_000;
const maxCachedMenus = 8;
const maxCachedProducts = 48;
const menuError = 'No pudimos cargar el menú del restaurante. Revisa tu conexión y reintenta.';

interface MenuPage {
  items: ProductItem[];
  cursor: string | null;
  hasMore: boolean;
}

interface StoreMenu {
  storeId: string;
  items: ProductItem[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

async function readMenuPage(storeId: string, username: string, cursor: string | null, signal: AbortSignal): Promise<MenuPage> {
  const params = new URLSearchParams({ kind: 'products', storeId, limit: String(pageSize) });
  if (username) params.set('storeUsername', username);
  if (cursor) params.set('after', cursor);

  const response = await fetch(`/api/catalog-page.php?${params}`, {
    cache: 'no-store', priority: 'high', signal: AbortSignal.any([signal, AbortSignal.timeout(6000)])
  });
  if (!response.ok) throw new Error('store-menu-unavailable');
  const page = await response.json();
  if (page?.source !== 'firestore-server' || page.kind !== 'products' || page.storeId !== storeId ||
      !Array.isArray(page.items) || typeof page.hasMore !== 'boolean' ||
      (page.hasMore && (typeof page.cursor !== 'string' || !page.cursor || page.cursor === cursor))) {
    throw new Error('unconfirmed-store-menu');
  }
  return page;
}

async function readMenuPageFromFirestore(storeId: string, username: string, cursor: string | null): Promise<MenuPage> {
  const matches = [where('userId', '==', storeId)];
  for (const alias of new Set([username, username.trim().toLowerCase()])) {
    if (!alias) continue;
    if (alias !== storeId) matches.push(where('userId', '==', alias));
    matches.push(where('storeUsername', '==', alias));
  }
  const products = collection(db, 'products');
  const scoped = matches.length === 1 ? query(products, matches[0]) : query(products, or(...matches));
  const request = query(scoped, orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshot = await Promise.race([getDocsFromServer(request), new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('store-menu-timeout')), 9000);
    })]);
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) throw new Error('unconfirmed-store-menu');
    return {
      items: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProductItem)),
      cursor: snapshot.docs.at(-1)?.id ?? null,
      hasMore: snapshot.docs.length === pageSize
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function useSelectedStoreMenu(store?: UserProfile) {
  const storeId = store?.uid;
  const username = store?.username ?? '';
  const [menu, setMenu] = useState<StoreMenu | null>(null);
  const cache = useRef(new Map<string, MenuPage & { expiresAt: number }>());
  const nextPage = useRef<(retry?: boolean) => Promise<number | undefined>>(undefined);
  const loadMore = useCallback(() => nextPage.current?.(), []);
  const retry = useCallback(() => nextPage.current?.(true), []);

  useEffect(() => {
    if (!storeId) {
      setMenu(null);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    const key = JSON.stringify([storeId, username]);
    const entry = cache.current.get(key);
    const cached = entry && entry.expiresAt > Date.now() ? entry : undefined;
    if (entry && !cached) cache.current.delete(key);
    const products = new Map<string, ProductItem>(cached?.items.map(product => [product.id, product]));
    let cursor = cached?.cursor ?? null;
    let hasMore = cached?.hasMore ?? true;
    let expiresAt = cached?.expiresAt ?? 0;
    let useServerRoute = true;
    let cacheable = true;
    let loading = false;
    let failed = false;
    setMenu({ storeId, items: cached?.items ?? [], hasMore, loading: !cached, error: null });

    async function loadPage(uid: string, retryRequest = false) {
      if (signal.aborted || loading || !hasMore || (failed && !retryRequest)) return;
      loading = true;
      if (retryRequest) useServerRoute = true;
      setMenu(previous => previous?.storeId === uid ? { ...previous, loading: true, error: null } : previous);
      try {
        let page: MenuPage | undefined;
        if (useServerRoute) {
          try {
            page = await readMenuPage(uid, username, cursor, signal);
          } catch {
            if (signal.aborted) return;
            useServerRoute = false;
            cacheable = false;
          }
        }
        page ??= await readMenuPageFromFirestore(uid, username, cursor);
        if (signal.aborted) return;
        const previousCount = products.size;
        for (const product of page.items) {
          if (product?.id && product.active !== false) products.set(product.id, product);
        }
        failed = false;
        if (!cursor) expiresAt = Date.now() + menuCacheDuration;
        cursor = page.cursor;
        hasMore = page.hasMore;
        const items = orderProductBatch([...products.values()]);
        if (cacheable && items.length <= maxCachedProducts && expiresAt > Date.now()) {
          cache.current.delete(key);
          cache.current.set(key, { items, cursor, hasMore, expiresAt });
          if (cache.current.size > maxCachedMenus) {
            const oldest = cache.current.keys().next().value;
            if (oldest !== undefined) cache.current.delete(oldest);
          }
        }
        setMenu({ storeId: uid, items, hasMore, loading: false, error: null });
        return items.length - previousCount;
      } catch {
        failed = true;
        if (!signal.aborted) {
          setMenu(previous => previous?.storeId === uid ? { ...previous, loading: false, error: menuError } : previous);
        }
      } finally {
        loading = false;
      }
    }

    nextPage.current = retryRequest => loadPage(storeId, retryRequest);
    if (!cached) void nextPage.current();
    return () => {
      nextPage.current = undefined;
      controller.abort();
    };
  }, [storeId, username]);

  const activeMenu = menu?.storeId === storeId ? menu : null;
  return {
    items: activeMenu?.items,
    hasMore: Boolean(storeId && (activeMenu?.hasMore ?? true)),
    loading: Boolean(storeId && (activeMenu?.loading ?? true)),
    error: activeMenu?.error ?? null,
    loadMore,
    retry
  };
}
