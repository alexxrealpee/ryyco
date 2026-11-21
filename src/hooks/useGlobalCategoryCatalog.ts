import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { orderProductBatch } from '../lib/productUtils';
import type { ProductItem } from '../types';

const PAGE = 12;

/**
 * Categorías globales del inicio.
 * - availability: qué categorías tienen productos y de qué restaurantes (una consulta
 *   liviana al servidor, sin productos completos). null si no está disponible: el inicio
 *   usa entonces los productos ya cargados.
 * - Productos de la categoría elegida: consulta filtrada en el servidor
 *   (globalCategoryIds array-contains), de 12 en 12. No se descarga todo el catálogo.
 */
export function useGlobalCategoryCatalog(categoryId: string | null) {
  const [availability, setAvailability] = useState<Record<string, string[]> | null>(null);
  const [items, setItems] = useState<ProductItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursor = useRef<string | null>(null);
  const pending = useRef(false);
  const more = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // La primera respuesta la pidió index.html en paralelo con la app.
    let bootstrap = (window as any).__RYYCO_CATEGORIES__ as Promise<any> | undefined;
    (window as any).__RYYCO_CATEGORIES__ = null;
    const load = () => (bootstrap || fetch('/api/catalog-page.php?kind=categories', { cache: 'no-store', signal: AbortSignal.timeout(12000) })
      .then(r => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null)))
      .then(data => {
        bootstrap = undefined;
        if (!cancelled && data?.source === 'firestore-server' && data.kind === 'categories' && data.categories) setAvailability(data.categories);
      })
      .catch(() => { bootstrap = undefined; });
    void load();
    const timer = setInterval(load, 120000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const loadMore = useCallback(async (): Promise<ProductItem[]> => {
    if (!categoryId || pending.current || !more.current) return [];
    const gen = generation.current;
    pending.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const after = cursor.current;
      let page: { items: ProductItem[]; cursor: string | null; hasMore: boolean } | null = null;
      try {
        const url = `/api/catalog-page.php?kind=products&limit=${PAGE}&category=${encodeURIComponent(categoryId)}` +
          (after ? `&after=${encodeURIComponent(after)}` : '');
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        const data = response.ok ? await response.json() : null;
        if (data?.source === 'firestore-server' && data.category === categoryId && Array.isArray(data.items)) {
          page = { items: data.items, cursor: data.cursor, hasMore: !!data.hasMore };
        }
      } catch { /* se intenta con Firebase */ }
      if (!page) {
        const snapshot = await getDocsFromServer(query(collection(db, 'products'),
          where('globalCategoryIds', 'array-contains', categoryId), orderBy(documentId()),
          ...(after ? [startAfter(after)] : []), limit(PAGE)));
        page = { items: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProductItem)),
          cursor: snapshot.docs.at(-1)?.id || null, hasMore: snapshot.size === PAGE };
      }
      if (gen !== generation.current) return [];
      const fresh = orderProductBatch(page.items.filter(p => p?.id && p.active !== false));
      setItems(previous => Array.from(new Map([...previous, ...fresh].map(p => [p.id, p])).values()));
      cursor.current = page.cursor;
      more.current = page.hasMore && !!page.cursor;
      setHasMore(more.current);
      return fresh;
    } catch (err) {
      if (gen === generation.current) setError('No pudimos cargar esta categoría. Revisa tu conexión y reintenta.');
      return [];
    } finally {
      if (gen === generation.current) { pending.current = false; setIsLoading(false); }
    }
  }, [categoryId]);

  // Al cambiar de categoría se empieza de cero y se piden los primeros 12.
  useEffect(() => {
    generation.current += 1;
    cursor.current = null;
    pending.current = false;
    more.current = !!categoryId;
    setItems([]);
    setError(null);
    setHasMore(!!categoryId);
    setIsLoading(false);
    if (categoryId) void loadMore();
  }, [categoryId, loadMore]);

  return { availability, items, hasMore, isLoading, error, loadMore };
}
