/**
 * Categorías globales del inicio: revisión y corrección (administrador general).
 * Se muestra dentro de la pestaña "Imágenes" del panel, debajo del optimizador.
 *
 * - Lista los productos para revisión (el clasificador no estuvo seguro) y los de baja confianza.
 * - Permite corregir la categoría global (queda como corrección manual y nunca se sobrescribe),
 *   ocultar un producto del inicio, volver a la clasificación automática o reclasificar uno.
 * - Inicia, pausa y reanuda la clasificación por lotes de los productos existentes.
 * No cambia la categoría interna del restaurante ni ningún otro dato del producto.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, doc, getCountFromServer, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where,
} from 'firebase/firestore';
import { Tags, RefreshCw, Play, Pause, CheckCircle2, AlertCircle } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { GLOBAL_CATEGORIES, globalCategoryLabel } from '../lib/globalCategories';
import type { UserProfile } from '../types';

interface ClassificationDoc {
  productId: string;
  productName: string;
  internalCategory?: string;
  storeId?: string | null;
  status: 'classified' | 'needs_review';
  source: 'rules' | 'ai';
  confidence: number;
  globalCategoryIds: string[];
  suggestedCategoryIds?: string[];
  manual?: { globalCategoryIds: string[]; at?: string; by?: string } | null;
  updatedAt?: string;
}

interface RunDoc {
  id: string;
  mode: 'missing' | 'all';
  status: 'queued' | 'running' | 'paused' | 'done' | 'cancelled';
  processed?: number;
  classified?: number;
  review?: number;
  errors?: number;
  written?: number;
  createdAt?: string;
  lastErrors?: string[];
}

type View = 'review' | 'low';
const PAGE = 25;
const LOW_CONFIDENCE = 0.75;

export default function AdminProductClassification({ storesMap }: { storesMap: Record<string, UserProfile> }) {
  const [view, setView] = useState<View>('review');
  const [items, setItems] = useState<ClassificationDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ products: number; classified: number; review: number; manual: number } | null>(null);
  const [run, setRun] = useState<RunDoc | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const cls = collection(db, 'productClassifications');
      const [products, classified, review, manual] = await Promise.all([
        getCountFromServer(collection(db, 'products')),
        getCountFromServer(query(cls, where('status', '==', 'classified'))),
        getCountFromServer(query(cls, where('status', '==', 'needs_review'))),
        getCountFromServer(query(cls, where('manual', '!=', null))),
      ]);
      setCounts({ products: products.data().count, classified: classified.data().count,
        review: review.data().count, manual: manual.data().count });
    } catch (err) {
      console.warn('[Clasificación] conteos', err);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cls = collection(db, 'productClassifications');
      // Consultas de un solo campo: no requieren índices compuestos.
      const snapshot = view === 'review'
        ? await getDocs(query(cls, where('status', '==', 'needs_review'), limit(PAGE)))
        : await getDocs(query(cls, where('confidence', '<', LOW_CONFIDENCE), orderBy('confidence', 'asc'), limit(PAGE)));
      let docs = snapshot.docs.map(d => ({ ...(d.data() as ClassificationDoc), productId: d.id }));
      // Los ya corregidos a mano no se vuelven a pedir.
      docs = docs.filter(d => !d.manual && (view === 'review' || d.status === 'classified'));
      setItems(docs);
    } catch (err) {
      console.warn('[Clasificación] lista', err);
      setError('No se pudo cargar la lista. Revisa tu conexión.');
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { void loadCounts(); }, [loadCounts]);

  // Último proceso por lotes, con avance en vivo.
  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'classifierRuns'), orderBy('createdAt', 'desc'), limit(1)), snap => {
      const d = snap.docs[0];
      setRun(d ? ({ ...(d.data() as Omit<RunDoc, 'id'>), id: d.id }) : null);
    }, err => console.warn('[Clasificación] procesos', err));
    return unsubscribe;
  }, []);

  const runActive = run && (run.status === 'queued' || run.status === 'running');

  const flash = (message: string) => { setNotice(message); setTimeout(() => setNotice(null), 3500); };
  const byWho = () => auth.currentUser?.email || auth.currentUser?.uid || 'admin';

  const saveManual = async (item: ClassificationDoc, categoryIds: string[]) => {
    setSavingId(item.productId);
    try {
      await updateDoc(doc(db, 'productClassifications', item.productId), {
        manual: { globalCategoryIds: categoryIds, at: new Date().toISOString(), by: byWho() },
      });
      setItems(prev => prev.filter(i => i.productId !== item.productId));
      flash(categoryIds.length
        ? `«${item.productName}» quedó en ${globalCategoryLabel(categoryIds[0])} (corrección manual).`
        : `«${item.productName}» no se mostrará en las categorías del inicio.`);
      void loadCounts();
    } catch (err) {
      flash('No se pudo guardar la corrección.');
    } finally {
      setSavingId(null);
    }
  };

  const requestReclassify = async (item: ClassificationDoc) => {
    setSavingId(item.productId);
    try {
      await updateDoc(doc(db, 'productClassifications', item.productId), { reclassifyRequestedAt: new Date().toISOString() });
      flash(`Se pidió reclasificar «${item.productName}».`);
    } catch {
      flash('No se pudo pedir la reclasificación.');
    } finally {
      setSavingId(null);
    }
  };

  const startRun = async (mode: 'missing' | 'all') => {
    if (runActive) return;
    if (mode === 'all' && !window.confirm('Se reclasificarán todos los productos por lotes. Las correcciones manuales se conservan. ¿Continuar?')) return;
    try {
      await addDoc(collection(db, 'classifierRuns'), {
        mode, status: 'queued', createdAt: new Date().toISOString(), createdBy: byWho(), processed: 0, batch: 0, maxAiCalls: 200,
      });
    } catch {
      flash('No se pudo iniciar el proceso.');
    }
  };

  const setRunStatus = async (status: 'paused' | 'running') => {
    if (!run) return;
    try {
      await updateDoc(doc(db, 'classifierRuns', run.id), status === 'running'
        ? { status, resumeAt: new Date().toISOString(), leaseUntil: 0 } : { status });
    } catch {
      flash('No se pudo actualizar el proceso.');
    }
  };

  const storeName = (id?: string | null) => (id && (storesMap[id]?.displayName || storesMap[id]?.storeName)) || '';
  const runTotal = counts?.products || 0;
  const runPercent = run && runTotal ? Math.min(100, Math.round(((run.processed || 0) / runTotal) * 100)) : 0;

  const statusText = useMemo(() => {
    if (!run) return 'Aún no se ha ejecutado ninguna clasificación por lotes.';
    const map: Record<RunDoc['status'], string> = { queued: 'En cola', running: 'En curso', paused: 'Pausado', done: 'Terminado', cancelled: 'Cancelado' };
    return `${map[run.status]} · ${run.mode === 'all' ? 'Reclasificación completa' : 'Solo pendientes'} · ${run.processed || 0} revisados · ` +
      `${run.classified || 0} clasificados · ${run.review || 0} para revisión · ${run.errors || 0} errores`;
  }, [run]);

  return (
    <section className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Tags className="w-4 h-4 text-emerald-400" /> Categorías globales del inicio
          </h2>
          <p className="text-xs text-gray-400">
            Clasificación automática de productos para las categorías de la página de inicio. No cambia las categorías internas de los restaurantes.
          </p>
        </div>
        {counts && (
          <div className="text-[11px] text-gray-400 font-mono">
            {counts.products} productos · {counts.classified} clasificados · {counts.review} para revisión · {counts.manual} corregidos a mano
            {counts.products > counts.classified + counts.review && ` · ${counts.products - counts.classified - counts.review} sin procesar`}
          </div>
        )}
      </div>

      {/* Proceso por lotes */}
      <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <span className="text-xs text-gray-300">{statusText}</span>
          <div className="flex flex-wrap gap-2">
            {runActive ? (
              <button type="button" onClick={() => void setRunStatus('paused')}
                className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs font-bold text-gray-200 flex items-center gap-1.5 cursor-pointer">
                <Pause className="w-3.5 h-3.5" /> Pausar
              </button>
            ) : run && run.status === 'paused' ? (
              <button type="button" onClick={() => void setRunStatus('running')}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer">
                <Play className="w-3.5 h-3.5" /> Reanudar
              </button>
            ) : null}
            <button type="button" disabled={!!runActive} onClick={() => void startRun('missing')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-bold text-white disabled:opacity-40 cursor-pointer">
              Clasificar pendientes
            </button>
            <button type="button" disabled={!!runActive} onClick={() => void startRun('all')}
              className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs font-bold text-gray-200 disabled:opacity-40 cursor-pointer">
              Reclasificar todo
            </button>
          </div>
        </div>
        {run && run.status !== 'done' && runTotal > 0 && (
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${runPercent}%` }} />
          </div>
        )}
        {run?.lastErrors && run.lastErrors.length > 0 && (
          <details className="text-[11px] text-red-300">
            <summary className="cursor-pointer">Últimos errores ({run.lastErrors.length})</summary>
            <ul className="mt-1 space-y-0.5 font-mono">{run.lastErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </details>
        )}
      </div>

      {/* Lista para revisar */}
      <div className="flex items-center gap-2">
        {(['review', 'low'] as View[]).map(v => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${view === v
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-gray-950 border-gray-800 text-gray-400'}`}>
            {v === 'review' ? 'Para revisión' : 'Baja confianza'}
          </button>
        ))}
        <button type="button" onClick={() => { void loadList(); void loadCounts(); }} title="Actualizar"
          className="p-1.5 rounded-lg bg-gray-950 border border-gray-800 text-gray-400 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        {notice && <span className="text-[11px] text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{notice}</span>}
      </div>

      {error && <p role="alert" className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
      {loading ? (
        <p className="text-xs text-gray-500">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-500">{view === 'review' ? 'No hay productos pendientes de revisión.' : 'No hay clasificaciones de baja confianza.'}</p>
      ) : (
        <div className="divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
          {items.map(item => {
            const suggested = item.globalCategoryIds?.[0] || item.suggestedCategoryIds?.[0] || '';
            const selected = choice[item.productId] ?? suggested;
            return (
              <div key={item.productId} className="p-3 flex flex-col md:flex-row md:items-center gap-2 bg-gray-950/40">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{item.productName || item.productId}</div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {storeName(item.storeId)}{item.internalCategory ? ` · Categoría del restaurante: ${item.internalCategory}` : ''}
                    {` · ${item.source === 'ai' ? 'IA' : 'Reglas'} ${Math.round((item.confidence || 0) * 100)}%`}
                    {item.globalCategoryIds?.length ? ` · Actual: ${item.globalCategoryIds.map(globalCategoryLabel).join(', ')}` : ''}
                  </div>
                </div>
                <select value={selected} onChange={e => setChoice(prev => ({ ...prev, [item.productId]: e.target.value }))}
                  className="bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 px-2 py-1.5">
                  <option value="">— No mostrar en el inicio —</option>
                  {GLOBAL_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div className="flex gap-1.5">
                  <button type="button" disabled={savingId === item.productId}
                    onClick={() => void saveManual(item, selected ? [selected] : [])}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-bold text-white disabled:opacity-50 cursor-pointer">
                    Guardar
                  </button>
                  <button type="button" disabled={savingId === item.productId} onClick={() => void requestReclassify(item)}
                    title="Volver a clasificar automáticamente"
                    className="px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 disabled:opacity-50 cursor-pointer">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
