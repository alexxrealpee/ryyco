import { useEffect, useState } from 'react';
import { collection, documentId, getDocsFromServer, limit, or, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { orderProductBatch } from '../lib/productUtils';
import type { ProductItem, UserProfile } from '../types';

const pageSize = 12;
const menuError = 'No pudimos cargar el menú del restaurante. Revisa tu conexión y reintenta.';

interface MenuPage {
  items: ProductItem[];
  cursor: string | null;
  hasMore: boolean;
}

interface StoreMenu {
  storeId: string;
  items: ProductItem[];
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
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!storeId) {
      setMenu(null);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    setMenu(previous => ({ storeId, items: previous?.storeId === storeId ? previous.items : [], loading: true, error: null }));

    async function loadMenu(uid: string) {
      const products = new Map<string, ProductItem>();
      let cursor: string | null = null;
      let useServerRoute = true;
      try {
        while (!signal.aborted) {
          let page: MenuPage | undefined;
          if (useServerRoute) {
            try {
              page = await readMenuPage(uid, username, cursor, signal);
            } catch {
              if (signal.aborted) return;
              useServerRoute = false;
            }
          }
          page ??= await readMenuPageFromFirestore(uid, username, cursor);
          if (signal.aborted) return;
          for (const product of page.items) {
            if (product?.id && product.active !== false) products.set(product.id, product);
          }
          setMenu({ storeId: uid, items: orderProductBatch([...products.values()]), loading: page.hasMore, error: null });
          if (!page.hasMore) return;
          cursor = page.cursor;
        }
      } catch {
        if (!signal.aborted) {
          setMenu(previous => previous?.storeId === uid ? { ...previous, loading: false, error: menuError } : previous);
        }
      }
    }

    void loadMenu(storeId);
    return () => controller.abort();
  }, [storeId, username, attempt]);

  const activeMenu = menu?.storeId === storeId ? menu : null;
  return {
    items: activeMenu?.items,
    loading: Boolean(storeId && (activeMenu?.loading ?? true)),
    error: activeMenu?.error ?? null,
    retry: () => setAttempt(value => value + 1)
  };
}
