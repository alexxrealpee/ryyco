/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  setDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ProductItem, UserProfile } from '../types';
import { 
  formatBytes, 
  compressImageUrl, 
  getImageWeightAndDimensions, 
  ImageInfoResult,
  estimateDataUrlBytes
} from '../lib/imageCompressor';
import { generateRyycoImageName } from '../lib/seoImageRenamer';
import { 
  Image as ImageIcon,
  Sparkles, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowUpDown, 
  Grid, 
  List, 
  Store, 
  ExternalLink, 
  Layers, 
  Zap, 
  X, 
  ChevronRight,
  TrendingDown,
  Info,
  Sliders,
  Check,
  Upload
} from 'lucide-react';

interface ExtendedProductItem extends ProductItem {
  storeDisplayName?: string;
  storeHandle?: string;
  storeLogo?: string;
}

interface AdminProductImagesOptimizerProps {
  storesMap?: Record<string, UserProfile> | Map<string, UserProfile>;
  allStores?: UserProfile[];
}

export default function AdminProductImagesOptimizer({
  storesMap,
  allStores = []
}: AdminProductImagesOptimizerProps) {
  const [products, setProducts] = useState<ExtendedProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notif, setNotif] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Image weight and dimension analysis cache: productId -> ImageInfoResult
  const [imageMetrics, setImageMetrics] = useState<Record<string, ImageInfoResult>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all');
  const [selectedWeightFilter, setSelectedWeightFilter] = useState<string>('all'); // 'all' | 'heavy' (>500KB) | 'critical' (>1MB) | 'moderate' (150-500KB) | 'optimized' (<150KB) | 'no_image'
  const [sortBy, setSortBy] = useState<'heaviest' | 'lightest' | 'name_asc' | 'store_asc'>('heaviest');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Single Product Comparison Modal
  const [comparingProduct, setComparingProduct] = useState<ExtendedProductItem | null>(null);
  const [optimizedPreview, setOptimizedPreview] = useState<{
    dataUrl: string;
    originalSize: number;
    compressedSize: number;
    savedPercent: number;
    width: number;
    height: number;
    format: string;
  } | null>(null);
  const [isOptimizingSingle, setIsOptimizingSingle] = useState(false);

  // Batch Optimization State
  const [isBatchOptimizing, setIsBatchOptimizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, savedBytes: 0 });
  const cancelBatchRef = useRef(false);

  // File replacement input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replacingProductId, setReplacingProductId] = useState<string | null>(null);

  // 1. Fetch all products across all stores
  const loadAllProducts = async () => {
    try {
      setRefreshing(true);
      const fetchedProducts: ExtendedProductItem[] = [];

      // A. Query Firestore products collection
      try {
        const snap = await getDocs(collection(db, 'products'));
        snap.forEach(docSnap => {
          const data = docSnap.data() as ProductItem;
          if (data && data.active !== false) {
            const cleanId = (data.id && String(data.id).trim() && String(data.id).trim() !== 'undefined')
              ? String(data.id).trim()
              : docSnap.id;

            // Resolve store information
            const store = (storesMap instanceof Map ? storesMap.get(data.userId) : storesMap?.[data.userId]) || allStores.find(s => s.uid === data.userId);
            fetchedProducts.push({
              ...data,
              id: cleanId,
              storeDisplayName: store?.displayName || store?.storeName || data.storeName || 'Tienda RYYCO',
              storeHandle: store?.username || data.storeUsername || '',
              storeLogo: store?.photoURL || ''
            });
          }
        });
      } catch (err) {
        console.warn("Error fetching remote products for image optimizer:", err);
      }

      // B. Merge locally stored products
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('linnk_products_')) {
            const userId = key.replace('linnk_products_', '');
            const raw = localStorage.getItem(key);
            if (raw) {
              const localList = JSON.parse(raw);
              if (Array.isArray(localList)) {
                localList.forEach((lp: ProductItem) => {
                  if (lp && lp.id && !fetchedProducts.some(p => p.id === lp.id)) {
                    const store = (storesMap instanceof Map ? storesMap.get(userId) : storesMap?.[userId]) || allStores.find(s => s.uid === userId);
                    fetchedProducts.push({
                      ...lp,
                      storeDisplayName: store?.displayName || store?.storeName || lp.storeName || 'Tienda RYYCO',
                      storeHandle: store?.username || lp.storeUsername || '',
                      storeLogo: store?.photoURL || ''
                    });
                  }
                });
              }
            }
          }
        }
      } catch (e) {}

      setProducts(fetchedProducts);
      setLoading(false);
      setRefreshing(false);

      // Trigger automatic image analysis
      analyzeProductsImages(fetchedProducts);
    } catch (e) {
      console.error("Error in loadAllProducts:", e);
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllProducts();
  }, [allStores, storesMap]);

  // 2. Analyze weights and dimensions of all product images
  const analyzeProductsImages = async (prods: ExtendedProductItem[]) => {
    const productsWithImages = prods.filter(p => !!p.imageURL);
    if (productsWithImages.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: productsWithImages.length });

    const newMetrics: Record<string, ImageInfoResult> = { ...imageMetrics };
    let processed = 0;

    // Process in batches of 4 for smooth performance without blocking UI
    const batchSize = 4;
    for (let i = 0; i < productsWithImages.length; i += batchSize) {
      const slice = productsWithImages.slice(i, i + batchSize);
      await Promise.all(
        slice.map(async (prod) => {
          if (!newMetrics[prod.id]) {
            try {
              const info = await getImageWeightAndDimensions(prod.imageURL!);
              newMetrics[prod.id] = info;
            } catch (err) {
              const est = estimateDataUrlBytes(prod.imageURL!);
              newMetrics[prod.id] = {
                sizeBytes: est,
                width: 0,
                height: 0,
                format: prod.imageURL!.includes('webp') ? 'webp' : 'jpeg',
                isWebP: prod.imageURL!.includes('webp'),
                isOptimized: est > 0 && est < 200 * 1024
              };
            }
          }
          processed++;
        })
      );
      setAnalysisProgress({ current: processed, total: productsWithImages.length });
    }

    setImageMetrics(newMetrics);
    setIsAnalyzing(false);
  };

  // 3. Global KPI Calculations
  const kpis = useMemo(() => {
    let totalPhotos = 0;
    let totalBytes = 0;
    let criticalCount = 0; // > 1 MB
    let heavyCount = 0;    // 500 KB - 1 MB
    let moderateCount = 0; // 150 KB - 500 KB
    let optimizedCount = 0;// < 150 KB
    let unoptimizedCount = 0;

    products.forEach(p => {
      if (p.imageURL) {
        totalPhotos++;
        const metric = imageMetrics[p.id];
        const bytes = metric?.sizeBytes || estimateDataUrlBytes(p.imageURL);
        totalBytes += bytes;

        if (bytes >= 1024 * 1024) {
          criticalCount++;
          unoptimizedCount++;
        } else if (bytes >= 500 * 1024) {
          heavyCount++;
          unoptimizedCount++;
        } else if (bytes >= 150 * 1024) {
          moderateCount++;
          if (!metric?.isWebP) unoptimizedCount++;
        } else {
          optimizedCount++;
        }
      }
    });

    const estimatedPotentialSavingsBytes = Math.round(totalBytes * 0.75);

    return {
      totalProducts: products.length,
      totalPhotos,
      totalBytes,
      totalBytesFormatted: formatBytes(totalBytes),
      criticalCount,
      heavyCount,
      moderateCount,
      optimizedCount,
      unoptimizedCount,
      estimatedSavingsFormatted: formatBytes(estimatedPotentialSavingsBytes)
    };
  }, [products, imageMetrics]);

  // 4. Filtering and Sorting
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = (product.name || '').toLowerCase().includes(term);
        const matchCat = (product.category || '').toLowerCase().includes(term);
        const matchStore = (product.storeDisplayName || '').toLowerCase().includes(term) || (product.storeHandle || '').toLowerCase().includes(term);
        if (!matchName && !matchCat && !matchStore) return false;
      }

      // Store filter
      if (selectedStoreFilter !== 'all' && product.userId !== selectedStoreFilter) {
        return false;
      }

      // Weight / Status filter
      if (selectedWeightFilter !== 'all') {
        const metric = imageMetrics[product.id];
        const bytes = metric?.sizeBytes || (product.imageURL ? estimateDataUrlBytes(product.imageURL) : 0);

        if (selectedWeightFilter === 'no_image') {
          return !product.imageURL;
        }
        if (!product.imageURL) return false;

        if (selectedWeightFilter === 'critical') return bytes >= 1024 * 1024;
        if (selectedWeightFilter === 'heavy') return bytes >= 500 * 1024 && bytes < 1024 * 1024;
        if (selectedWeightFilter === 'moderate') return bytes >= 150 * 1024 && bytes < 500 * 1024;
        if (selectedWeightFilter === 'optimized') return bytes < 150 * 1024 || metric?.isOptimized;
        if (selectedWeightFilter === 'pending') return bytes >= 150 * 1024 || !metric?.isWebP;
      }

      return true;
    }).sort((a, b) => {
      const bytesA = imageMetrics[a.id]?.sizeBytes || (a.imageURL ? estimateDataUrlBytes(a.imageURL) : 0);
      const bytesB = imageMetrics[b.id]?.sizeBytes || (b.imageURL ? estimateDataUrlBytes(b.imageURL) : 0);

      if (sortBy === 'heaviest') return bytesB - bytesA;
      if (sortBy === 'lightest') return bytesA - bytesB;
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'store_asc') return (a.storeDisplayName || '').localeCompare(b.storeDisplayName || '');
      return 0;
    });
  }, [products, imageMetrics, searchTerm, selectedStoreFilter, selectedWeightFilter, sortBy]);

  // Unique stores for the filter dropdown
  const uniqueStores = useMemo(() => {
    const map = new Map<string, { uid: string; name: string; count: number }>();
    products.forEach(p => {
      if (p.userId) {
        const existing = map.get(p.userId);
        if (existing) {
          existing.count++;
        } else {
          map.set(p.userId, {
            uid: p.userId,
            name: p.storeDisplayName || 'Tienda',
            count: 1
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  // 5. Optimize Single Product Image
  const handleOpenSingleOptimizer = async (product: ExtendedProductItem) => {
    if (!product.imageURL) return;
    setComparingProduct(product);
    setOptimizedPreview(null);
    setIsOptimizingSingle(true);

    try {
      const result = await compressImageUrl(product.imageURL, {
        maxWidth: 900,
        maxHeight: 900,
        quality: 0.82
      });

      setOptimizedPreview({
        dataUrl: result.dataUrl,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        savedPercent: result.savedPercent,
        width: result.width,
        height: result.height,
        format: result.format
      });
    } catch (err: any) {
      setNotif({
        type: 'error',
        message: err.message || 'Error al procesar la optimización de la imagen.'
      });
    } finally {
      setIsOptimizingSingle(false);
    }
  };

  // 6. Save Optimized Image to Firestore & Local Storage
  const handleApplySingleOptimization = async (product: ExtendedProductItem, optimizedDataUrl: string) => {
    try {
      const newSeoFileName = generateRyycoImageName({
        productName: product.name,
        category: product.category,
        storeName: product.storeDisplayName,
        intent: 'domicilio'
      });

      // Update Firestore document
      const docRef = doc(db, 'products', product.id);
      await setDoc(docRef, {
        imageURL: optimizedDataUrl,
        imageFileName: newSeoFileName,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Update local storage for that store
      try {
        const key = `linnk_products_${product.userId}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw);
          const idx = list.findIndex((p: any) => p.id === product.id);
          if (idx > -1) {
            list[idx].imageURL = optimizedDataUrl;
            list[idx].imageFileName = newSeoFileName;
            localStorage.setItem(key, JSON.stringify(list));
          }
        }
      } catch (e) {}

      // Update component state
      const compBytes = estimateDataUrlBytes(optimizedDataUrl);
      setImageMetrics(prev => ({
        ...prev,
        [product.id]: {
          sizeBytes: compBytes,
          width: optimizedPreview?.width || 800,
          height: optimizedPreview?.height || 800,
          format: 'webp',
          isWebP: true,
          isOptimized: true
        }
      }));

      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, imageURL: optimizedDataUrl, imageFileName: newSeoFileName } : p));

      setNotif({
        type: 'success',
        message: `✅ ¡Imagen de "${product.name}" optimizada a WebP y guardada con éxito! (${formatBytes(compBytes)})`
      });

      setComparingProduct(null);
      setOptimizedPreview(null);
    } catch (err: any) {
      console.error("Error saving optimized product image:", err);
      setNotif({
        type: 'error',
        message: 'No se pudo guardar la imagen optimizada en la base de datos: ' + (err.message || String(err))
      });
    }
  };

  // 7. Batch Optimization of all unoptimized images
  const handleStartBatchOptimization = async () => {
    const toOptimize = filteredProducts.filter(p => {
      if (!p.imageURL) return false;
      const metric = imageMetrics[p.id];
      const bytes = metric?.sizeBytes || estimateDataUrlBytes(p.imageURL);
      return bytes >= 140 * 1024 || !metric?.isWebP;
    });

    if (toOptimize.length === 0) {
      setNotif({
        type: 'info',
        message: 'Todas las imágenes visibles ya se encuentran optimizadas en formato WebP liviano.'
      });
      return;
    }

    if (!window.confirm(`¿Deseas optimizar automáticamente ${toOptimize.length} fotos de productos a WebP (resolución máxima 900px, calidad ultra-ligera)?`)) {
      return;
    }

    setIsBatchOptimizing(true);
    cancelBatchRef.current = false;
    setBatchProgress({ current: 0, total: toOptimize.length, savedBytes: 0 });

    let totalSaved = 0;
    let completedCount = 0;

    for (let i = 0; i < toOptimize.length; i++) {
      if (cancelBatchRef.current) break;

      const product = toOptimize[i];
      try {
        const res = await compressImageUrl(product.imageURL!, {
          maxWidth: 900,
          maxHeight: 900,
          quality: 0.82
        });

        const newSeoFileName = generateRyycoImageName({
          productName: product.name,
          category: product.category,
          storeName: product.storeDisplayName,
          intent: 'domicilio'
        });

        // Save to Firestore
        await setDoc(doc(db, 'products', product.id), {
          imageURL: res.dataUrl,
          imageFileName: newSeoFileName,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Update local storage
        try {
          const key = `linnk_products_${product.userId}`;
          const raw = localStorage.getItem(key);
          if (raw) {
            const list = JSON.parse(raw);
            const idx = list.findIndex((p: any) => p.id === product.id);
            if (idx > -1) {
              list[idx].imageURL = res.dataUrl;
              list[idx].imageFileName = newSeoFileName;
              localStorage.setItem(key, JSON.stringify(list));
            }
          }
        } catch (e) {}

        const savedForThis = Math.max(0, res.originalSize - res.compressedSize);
        totalSaved += savedForThis;

        // Update metrics state
        setImageMetrics(prev => ({
          ...prev,
          [product.id]: {
            sizeBytes: res.compressedSize,
            width: res.width,
            height: res.height,
            format: 'webp',
            isWebP: true,
            isOptimized: true
          }
        }));

        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, imageURL: res.dataUrl, imageFileName: newSeoFileName } : p));
      } catch (err) {
        console.warn(`Error batch optimizing ${product.name}:`, err);
      }

      completedCount++;
      setBatchProgress({
        current: completedCount,
        total: toOptimize.length,
        savedBytes: totalSaved
      });
    }

    setIsBatchOptimizing(false);
    setNotif({
      type: 'success',
      message: `🎉 ¡Lote completado! Se optimizaron ${completedCount} imágenes, logrando un ahorro de ${formatBytes(totalSaved)}.`
    });
  };

  // 8. Download Optimized WebP Image
  const handleDownloadImage = (dataUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName.endsWith('.webp') ? fileName : `${fileName}.webp`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for badge colors based on weight
  const getWeightBadge = (bytes: number, isWebP: boolean) => {
    if (bytes <= 0) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700">
          Sin Foto
        </span>
      );
    }
    if (bytes >= 1024 * 1024) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1 animate-pulse">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span>{formatBytes(bytes)} (Crítica)</span>
        </span>
      );
    }
    if (bytes >= 500 * 1024) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span>{formatBytes(bytes)} (Pesada)</span>
        </span>
      );
    }
    if (bytes >= 150 * 1024) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
          {formatBytes(bytes)} (Moderada)
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        <span>{formatBytes(bytes)} ({isWebP ? 'WebP' : 'Ligera'})</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Toast Notification */}
      {notif && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 shadow-2xl transition animate-fade-in ${
          notif.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300' 
            : notif.type === 'error'
            ? 'bg-red-950/90 border-red-500/40 text-red-300'
            : 'bg-indigo-950/90 border-indigo-500/40 text-indigo-300'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {notif.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {notif.type === 'error' && <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />}
            {notif.type === 'info' && <Info className="w-5 h-5 text-indigo-400 shrink-0" />}
            <span className="truncate">{notif.message}</span>
          </div>
          <button
            onClick={() => setNotif(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-gray-900/90 via-[#0d1322] to-gray-950/90 border border-gray-800 rounded-3xl p-5 sm:p-6 backdrop-blur-sm relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shadow-inner">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-white text-lg sm:text-xl flex items-center gap-2 tracking-tight">
                  <span>Optimización de Imágenes de Productos</span>
                  <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-black font-mono">
                    {kpis.totalPhotos} FOTOS
                  </span>
                </h3>
                <p className="text-xs text-gray-400 font-medium">
                  Monitorea el peso exacto (KB/MB) de los platos y productos de todas las tiendas. Conviértelas a WebP de alta fidelidad para acelerar al máximo la velocidad de carga.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleStartBatchOptimization}
              disabled={isBatchOptimizing || kpis.unoptimizedCount === 0}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition cursor-pointer flex items-center gap-2 disabled:opacity-50 active:scale-95"
              title="Optimizar todas las imágenes pesadas de una sola vez"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Optimizar Todo en Lote ({kpis.unoptimizedCount} pendientes)</span>
            </button>

            <button
              type="button"
              onClick={loadAllProducts}
              disabled={refreshing}
              className="px-3.5 py-2.5 bg-gray-950 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              title="Recargar catálogo y métricas"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Actualizando...' : 'Recargar'}</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-gray-950 border border-gray-800 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition cursor-pointer ${
                  viewMode === 'grid' 
                    ? 'bg-emerald-500 text-white shadow-md' 
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Vista Cuadrícula / Tarjetas"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-lg transition cursor-pointer ${
                  viewMode === 'table' 
                    ? 'bg-emerald-500 text-white shadow-md' 
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Vista Tabla Resumen"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Key Metrics / Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5">
          <div className="bg-[#0b101d] border border-gray-850 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Peso Total del Catálogo
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-white font-mono">{kpis.totalBytesFormatted}</span>
              <span className="text-[10px] text-gray-500 font-medium">({kpis.totalPhotos} fotos)</span>
            </div>
          </div>

          <div className="bg-[#0b101d] border border-gray-850 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              Fotos Críticas / Pesadas
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-red-400 font-mono">
                {kpis.criticalCount + kpis.heavyCount}
              </span>
              <span className="text-[10px] text-gray-500 font-medium">
                ({kpis.criticalCount} &gt;1MB)
              </span>
            </div>
          </div>

          <div className="bg-[#0b101d] border border-gray-850 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Fotos Optimizadas (WebP)
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-emerald-400 font-mono">{kpis.optimizedCount}</span>
              <span className="text-[10px] text-gray-500 font-medium">ultra-ligeras</span>
            </div>
          </div>

          <div className="bg-[#0b101d] border border-gray-850 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-teal-400" />
              Ahorro Estimado al Optimizar
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-teal-300 font-mono">~{kpis.estimatedSavingsFormatted}</span>
              <span className="text-[10px] text-teal-500/80 font-bold">(~75% menos datos)</span>
            </div>
          </div>
        </div>

        {/* Progress indicator when analyzing image weights asynchronously */}
        {isAnalyzing && (
          <div className="mt-4 pt-3 border-t border-gray-800/60 flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>Calculando peso y dimensiones de imágenes en segundo plano ({analysisProgress.current} de {analysisProgress.total})...</span>
            </div>
            <span className="font-mono text-[10px] font-bold text-emerald-400">
              {Math.round((analysisProgress.current / Math.max(1, analysisProgress.total)) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0b101d] border border-gray-850 rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Main Search Input */}
          <div className="md:col-span-4 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por producto, categoría o tienda..."
              className="w-full pl-9 pr-4 py-2 bg-gray-950 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 transition font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter by Store */}
          <div className="md:col-span-3">
            <select
              value={selectedStoreFilter}
              onChange={(e) => setSelectedStoreFilter(e.target.value)}
              className="w-full py-2 px-3 bg-gray-950 border border-gray-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50 cursor-pointer font-medium"
            >
              <option value="all">Todas las Tiendas ({uniqueStores.length})</option>
              {uniqueStores.map(store => (
                <option key={store.uid} value={store.uid}>
                  {store.name} ({store.count} prods)
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Weight / Category */}
          <div className="md:col-span-3">
            <select
              value={selectedWeightFilter}
              onChange={(e) => setSelectedWeightFilter(e.target.value)}
              className="w-full py-2 px-3 bg-gray-950 border border-gray-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50 cursor-pointer font-medium"
            >
              <option value="all">Todos los Pesos ({products.length})</option>
              <option value="critical">🚨 Críticas (&gt; 1 MB) ({kpis.criticalCount})</option>
              <option value="heavy">🔴 Pesadas (500 KB - 1 MB) ({kpis.heavyCount})</option>
              <option value="moderate">🟡 Moderadas (150 KB - 500 KB) ({kpis.moderateCount})</option>
              <option value="optimized">🟢 Optimizadas / Ligeras (&lt; 150 KB) ({kpis.optimizedCount})</option>
              <option value="pending">⚡ Pendientes de Optimizar ({kpis.unoptimizedCount})</option>
              <option value="no_image">⚠️ Sin Foto</option>
            </select>
          </div>

          {/* Sort order */}
          <div className="md:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full py-2 px-3 bg-gray-950 border border-gray-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50 cursor-pointer font-medium"
            >
              <option value="heaviest">Mayor Peso Primero ⬇</option>
              <option value="lightest">Menor Peso Primero ⬆</option>
              <option value="name_asc">Nombre (A-Z)</option>
              <option value="store_asc">Tienda (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
          <span className="text-gray-500 font-bold mr-1">Filtros rápidos:</span>
          
          <button
            type="button"
            onClick={() => setSelectedWeightFilter('critical')}
            className={`px-2.5 py-1 rounded-lg border font-bold transition cursor-pointer flex items-center gap-1.5 ${
              selectedWeightFilter === 'critical'
                ? 'bg-red-500 text-white border-red-400'
                : 'bg-red-950/30 text-red-300 border-red-500/30 hover:bg-red-950/60'
            }`}
          >
            <span>🚨 &gt; 1 MB</span>
            <span className="bg-black/40 px-1.5 py-0.2 rounded text-[10px]">{kpis.criticalCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedWeightFilter('heavy')}
            className={`px-2.5 py-1 rounded-lg border font-bold transition cursor-pointer flex items-center gap-1.5 ${
              selectedWeightFilter === 'heavy'
                ? 'bg-amber-500 text-black border-amber-400'
                : 'bg-amber-950/30 text-amber-300 border-amber-500/30 hover:bg-amber-950/60'
            }`}
          >
            <span>🔴 500 KB - 1 MB</span>
            <span className="bg-black/40 px-1.5 py-0.2 rounded text-[10px]">{kpis.heavyCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedWeightFilter('pending')}
            className={`px-2.5 py-1 rounded-lg border font-bold transition cursor-pointer flex items-center gap-1.5 ${
              selectedWeightFilter === 'pending'
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-indigo-950/30 text-indigo-300 border-indigo-500/30 hover:bg-indigo-950/60'
            }`}
          >
            <span>⚡ Por Optimizar</span>
            <span className="bg-black/40 px-1.5 py-0.2 rounded text-[10px]">{kpis.unoptimizedCount}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedWeightFilter('optimized')}
            className={`px-2.5 py-1 rounded-lg border font-bold transition cursor-pointer flex items-center gap-1.5 ${
              selectedWeightFilter === 'optimized'
                ? 'bg-emerald-600 text-white border-emerald-400'
                : 'bg-emerald-950/30 text-emerald-300 border-emerald-500/30 hover:bg-emerald-950/60'
            }`}
          >
            <span>🟢 WebP Livianas</span>
            <span className="bg-black/40 px-1.5 py-0.2 rounded text-[10px]">{kpis.optimizedCount}</span>
          </button>

          {(selectedWeightFilter !== 'all' || selectedStoreFilter !== 'all' || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setSelectedWeightFilter('all');
                setSelectedStoreFilter('all');
                setSearchTerm('');
              }}
              className="px-2.5 py-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition cursor-pointer ml-auto"
            >
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Products List / Cards */}
      {loading ? (
        <div className="py-20 text-center space-y-3 bg-[#0b101d] rounded-2xl border border-gray-850">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
          <p className="text-gray-400 text-sm font-semibold">Cargando catálogo completo de productos...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="py-16 text-center space-y-3 bg-[#0b101d] rounded-2xl border border-gray-850">
          <ImageIcon className="w-10 h-10 text-gray-600 mx-auto" />
          <p className="text-white text-base font-bold">No se encontraron productos con los filtros seleccionados</p>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Prueba cambiando los filtros de peso o buscando con otro nombre de plato o tienda.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map(product => {
            const metric = imageMetrics[product.id];
            const sizeBytes = metric?.sizeBytes || (product.imageURL ? estimateDataUrlBytes(product.imageURL) : 0);
            const isWebP = metric?.isWebP || (product.imageURL ? product.imageURL.includes('webp') : false);
            const isHeavy = sizeBytes >= 350 * 1024;

            return (
              <div
                key={product.id}
                className="bg-[#0b101d] border border-gray-850 hover:border-gray-700 rounded-2xl overflow-hidden transition-all duration-200 flex flex-col justify-between shadow-lg group"
              >
                {/* Image Box */}
                <div className="relative aspect-video w-full bg-gray-950 overflow-hidden flex items-center justify-center border-b border-gray-850">
                  {product.imageURL ? (
                    <img
                      src={product.imageURL}
                      alt={product.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-gray-600 p-4">
                      <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
                      <span className="text-[10px] font-bold">Sin foto asignada</span>
                    </div>
                  )}

                  {/* Top Overlay Badges */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 pointer-events-none">
                    <span className="text-[10px] font-mono bg-black/80 backdrop-blur-md text-white font-bold px-2 py-0.5 rounded-lg border border-white/10 truncate max-w-[130px]">
                      {product.storeDisplayName}
                    </span>
                    <div className="pointer-events-auto">
                      {getWeightBadge(sizeBytes, isWebP)}
                    </div>
                  </div>

                  {/* Bottom Resolution Bar */}
                  {metric && metric.width > 0 && (
                    <div className="absolute bottom-1.5 right-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[9px] font-mono text-gray-300 font-bold border border-white/10 pointer-events-none">
                      {metric.width} × {metric.height} px
                    </div>
                  )}
                </div>

                {/* Body Details */}
                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-extrabold text-white text-xs sm:text-sm line-clamp-1 group-hover:text-emerald-300 transition">
                        {product.name}
                      </h4>
                      <span className="text-xs font-mono font-black text-emerald-400 shrink-0">
                        ${(product.price || 0).toLocaleString('es-CO')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                      <span className="px-1.5 py-0.2 bg-gray-900 rounded border border-gray-800 text-[10px] font-medium text-gray-400">
                        {product.category || 'General'}
                      </span>
                      {product.imageFileName && (
                        <span className="font-mono text-[9px] text-gray-500 truncate" title={product.imageFileName}>
                          {product.imageFileName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-gray-850/80 flex items-center justify-between gap-1.5">
                    {product.imageURL ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenSingleOptimizer(product)}
                          className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                            isHeavy
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold'
                              : 'bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800'
                          }`}
                          title="Inspeccionar y optimizar a WebP"
                        >
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isHeavy ? 'Optimizar' : 'Re-optimizar'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadImage(product.imageURL!, product.imageFileName || `${product.name}-opt`)}
                          className="p-1.5 bg-gray-950 hover:bg-gray-850 text-gray-400 hover:text-white border border-gray-800 rounded-xl transition cursor-pointer"
                          title="Descargar foto"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-500 italic">No tiene imagen para optimizar</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-[#0b101d] border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-850 bg-gray-950/80 text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono">
                  <th className="py-3 px-3.5 w-16">Foto</th>
                  <th className="py-3 px-3.5">Producto & Tienda</th>
                  <th className="py-3 px-3.5">Categoría</th>
                  <th className="py-3 px-3.5">Dimensiones</th>
                  <th className="py-3 px-3.5">Formato</th>
                  <th className="py-3 px-3.5">Peso Archivo</th>
                  <th className="py-3 px-3.5">Estado</th>
                  <th className="py-3 px-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850/60">
                {filteredProducts.map(product => {
                  const metric = imageMetrics[product.id];
                  const sizeBytes = metric?.sizeBytes || (product.imageURL ? estimateDataUrlBytes(product.imageURL) : 0);
                  const isWebP = metric?.isWebP || (product.imageURL ? product.imageURL.includes('webp') : false);

                  return (
                    <tr key={product.id} className="hover:bg-gray-900/40 transition">
                      {/* Photo Thumbnail */}
                      <td className="py-2.5 px-3.5">
                        <div className="w-12 h-12 rounded-xl bg-gray-950 border border-gray-800 overflow-hidden flex items-center justify-center shrink-0">
                          {product.imageURL ? (
                            <img src={product.imageURL} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-gray-600" />
                          )}
                        </div>
                      </td>

                      {/* Product Name & Store */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-bold text-white text-xs">{product.name}</div>
                        <div className="text-[10px] text-emerald-400 font-medium">{product.storeDisplayName}</div>
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-3.5 text-gray-400">
                        {product.category || 'General'}
                      </td>

                      {/* Dimensions */}
                      <td className="py-2.5 px-3.5 font-mono text-[11px] text-gray-300">
                        {metric && metric.width > 0 ? `${metric.width} × ${metric.height} px` : '—'}
                      </td>

                      {/* Format */}
                      <td className="py-2.5 px-3.5 font-mono text-[10px] uppercase">
                        <span className={`px-2 py-0.5 rounded font-bold ${isWebP ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-800 text-gray-300'}`}>
                          {metric?.format || (isWebP ? 'webp' : 'jpeg')}
                        </span>
                      </td>

                      {/* File Weight */}
                      <td className="py-2.5 px-3.5 font-mono font-bold text-xs">
                        {formatBytes(sizeBytes)}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3.5">
                        {getWeightBadge(sizeBytes, isWebP)}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3.5 text-right">
                        {product.imageURL ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenSingleOptimizer(product)}
                              className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              title="Optimizar imagen a WebP"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>Optimizar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadImage(product.imageURL!, product.imageFileName || `${product.name}-opt`)}
                              className="p-1.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-800 rounded-xl transition cursor-pointer"
                              title="Descargar foto"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-[10px]">Sin imagen</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SINGLE PRODUCT OPTIMIZER & COMPARISON MODAL */}
      {comparingProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b101d] border border-gray-800 rounded-3xl max-w-3xl w-full p-5 sm:p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 pb-3">
              <div>
                <h3 className="font-extrabold text-white text-base sm:text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <span>Optimizar Foto: {comparingProduct.name}</span>
                </h3>
                <p className="text-xs text-gray-400">
                  Tienda: <strong className="text-emerald-300">{comparingProduct.storeDisplayName}</strong> • Conversión a formato WebP optimizado
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setComparingProduct(null);
                  setOptimizedPreview(null);
                }}
                className="p-1.5 bg-gray-900 hover:bg-gray-800 rounded-xl text-gray-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isOptimizingSingle ? (
              <div className="py-16 text-center space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
                <p className="text-white text-sm font-bold">Procesando y comprimiendo imagen a WebP...</p>
                <p className="text-xs text-gray-400">Redimensionando pixeles y optimizando compresión sin pérdida perceptible.</p>
              </div>
            ) : optimizedPreview ? (
              <div className="space-y-5">
                {/* Side-by-Side Comparison Box */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Original Image Card */}
                  <div className="bg-gray-950 border border-gray-850 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Original</span>
                      <span className="text-xs font-mono font-bold text-red-400">
                        {formatBytes(optimizedPreview.originalSize)}
                      </span>
                    </div>
                    <div className="aspect-square rounded-xl overflow-hidden bg-black flex items-center justify-center border border-gray-900">
                      <img src={comparingProduct.imageURL} alt="Original" className="w-full h-full object-contain" />
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono text-center">
                      Formato actual o base64
                    </div>
                  </div>

                  {/* Optimized WebP Card */}
                  <div className="bg-emerald-950/20 border-2 border-emerald-500/40 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Optimizado (WebP)
                      </span>
                      <span className="text-xs font-mono font-black text-emerald-400">
                        {formatBytes(optimizedPreview.compressedSize)}
                      </span>
                    </div>
                    <div className="aspect-square rounded-xl overflow-hidden bg-black flex items-center justify-center border border-emerald-500/30">
                      <img src={optimizedPreview.dataUrl} alt="Optimizado" className="w-full h-full object-contain" />
                    </div>
                    <div className="text-[10px] text-emerald-300 font-mono text-center">
                      {optimizedPreview.width} × {optimizedPreview.height} px • WebP 82%
                    </div>
                  </div>
                </div>

                {/* Savings Summary Banner */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-teal-950/60 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <TrendingDown className="w-4 h-4 text-emerald-400" />
                      <span>Ahorro de Peso: {optimizedPreview.savedPercent}% menos datos</span>
                    </span>
                    <p className="text-[11px] text-gray-400">
                      De {formatBytes(optimizedPreview.originalSize)} a solo {formatBytes(optimizedPreview.compressedSize)} (Ahorras {formatBytes(Math.max(0, optimizedPreview.originalSize - optimizedPreview.compressedSize))}).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadImage(optimizedPreview.dataUrl, comparingProduct.imageFileName || `${comparingProduct.name}-optimizado`)}
                    className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-xl text-xs font-bold border border-gray-700 flex items-center gap-1.5 cursor-pointer shrink-0"
                    title="Descargar archivo WebP"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar WebP</span>
                  </button>
                </div>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setComparingProduct(null);
                      setOptimizedPreview(null);
                    }}
                    className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplySingleOptimization(comparingProduct, optimizedPreview.dataUrl)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition cursor-pointer flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Guardar y Aplicar en Tienda</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* BATCH OPTIMIZATION PROGRESS MODAL */}
      {isBatchOptimizing && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b101d] border border-emerald-500/40 rounded-3xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
              <Zap className="w-7 h-7 animate-bounce" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">Optimizando Lote de Imágenes</h3>
              <p className="text-xs text-gray-400">
                Procesando imagen <strong className="text-emerald-300 font-mono">{batchProgress.current}</strong> de <strong className="text-white font-mono">{batchProgress.total}</strong>
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-gray-950 h-3 rounded-full overflow-hidden border border-gray-800">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono font-bold">
                <span>{Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100)}% Completado</span>
                <span className="text-emerald-400">Ahorro acumulado: {formatBytes(batchProgress.savedBytes)}</span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 leading-snug">
              Cada imagen se escala a max 900px y se convierte a WebP de alta fidelidad, guardándose de inmediato en Firestore y en los perfiles de tienda.
            </p>

            <button
              type="button"
              onClick={() => {
                cancelBatchRef.current = true;
                setIsBatchOptimizing(false);
              }}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Detener Proceso
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
