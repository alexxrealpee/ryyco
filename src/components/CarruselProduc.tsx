/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Store, 
  ShoppingBag,
  ShoppingCart, 
  ChevronUp, 
  ChevronDown, 
  ArrowLeft, 
  Pause, 
  Play, 
  Share2,
  Utensils,
  Heart,
  CheckCircle2,
  Tag,
  Flame,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  X,
  Check
} from 'lucide-react';
import ReelSkeleton from './ReelSkeleton';
import { fetchAllActiveProductsAndStores, checkIsStoreClosed, findStoreForProduct, fetchSystemSettings } from '../lib/firebase';
import { ProductItem, UserProfile } from '../types';
import { isFoodProduct } from './TiendaGeneral';
import { 
  addProductToCart, 
  getStoredCart, 
  updateCartQuantity, 
  removeProductFromCart, 
  calculateCartSummary, 
  registerProductImages,
  getProductImage,
  GeneralCartItem, 
  CART_UPDATED_EVENT 
} from '../lib/cartHelper';

interface CarruselProducProps {
  initialReelId?: string | null;
  onNavigateHome: () => void;
  onNavigateToStore: (username: string) => void;
  onNavigateToTienda?: () => void;
}

interface LikeState {
  count: number;
  isLiked: boolean;
}

export default function CarruselProduc({ initialReelId, onNavigateHome, onNavigateToStore, onNavigateToTienda }: CarruselProducProps) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showPauseIndicator, setShowPauseIndicator] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedDesc, setExpandedDesc] = useState(false);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<{ show: boolean; product?: ProductItem }>({ show: false });
  
  // Cart state & in-reel cart drawer
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [cartItems, setCartItems] = useState<GeneralCartItem[]>(() => {
    try {
      return getStoredCart();
    } catch {
      return [];
    }
  });
  const [cartCount, setCartCount] = useState<number>(() => {
    try {
      const stored = getStoredCart();
      return stored.reduce((sum, item) => sum + item.quantity, 0);
    } catch {
      return 0;
    }
  });

  // Variant selector bottom sheet
  const [variantSheetProduct, setVariantSheetProduct] = useState<ProductItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [sheetQuantity, setSheetQuantity] = useState<number>(1);

  // Delivery fee loaded from system settings (aligned with TiendaGeneral)
  const [systemDeliveryFee, setSystemDeliveryFee] = useState<number>(5000);

  // Sync cart count & cart items with storage updates
  useEffect(() => {
    const handleCartSync = () => {
      try {
        const stored = getStoredCart();
        setCartItems(stored);
        setCartCount(stored.reduce((sum, item) => sum + item.quantity, 0));
      } catch (e) {}
    };
    window.addEventListener(CART_UPDATED_EVENT, handleCartSync);
    window.addEventListener('storage', handleCartSync);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleCartSync);
      window.removeEventListener('storage', handleCartSync);
    };
  }, []);
  
  // Likes storage & state
  const [likesMap, setLikesMap] = useState<Record<string, LikeState>>({});
  
  // Double tap heart burst animations
  const [heartBursts, setHeartBursts] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const lastTapRef = useRef<number>(0);
  const singleTapTimeoutRef = useRef<any>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const initialScrolledRef = useRef(false);

  // 1. Fetch active products and profiles
  useEffect(() => {
    let isMounted = true;
    async function loadProducts() {
      try {
        const [{ products: fetchedProducts, profiles: fetchedProfiles }, sysSettings] = await Promise.all([
          fetchAllActiveProductsAndStores(),
          fetchSystemSettings().catch(() => null)
        ]);
        if (!isMounted) return;

        if (sysSettings?.defaultDeliveryFee && typeof sysSettings.defaultDeliveryFee === 'number') {
          setSystemDeliveryFee(sysSettings.defaultDeliveryFee);
        }

        // Register all product images into persistent cache
        registerProductImages(fetchedProducts);

        // Rehydrate cart items in state if any was missing an image URL
        setCartItems(prev => {
          let changed = false;
          const updated = prev.map(item => {
            if (!item.product.imageURL) {
              const found = fetchedProducts.find(p => p.id === item.product.id);
              const img = found?.imageURL || getProductImage(item.product.id);
              if (img) {
                changed = true;
                return {
                  ...item,
                  product: {
                    ...item.product,
                    imageURL: img
                  }
                };
              }
            }
            return item;
          });
          return changed ? updated : prev;
        });

        const normalizedProfiles: Record<string, UserProfile> = { ...fetchedProfiles };
        Object.values(fetchedProfiles).forEach(p => {
          if (p && p.uid) normalizedProfiles[p.uid] = p;
          if (p && p.username) {
            normalizedProfiles[p.username] = p;
            normalizedProfiles[p.username.toLowerCase()] = p;
          }
        });

        // Filter, enrich and sort products (Food / Restaurant products first for maximum engagement)
        const activeList = fetchedProducts
          .filter(p => {
            if (p.active === false) return false;
            const prof = findStoreForProduct(p, normalizedProfiles);
            return prof && !prof.suspended && !checkIsStoreClosed(prof);
          })
          .map(p => {
            const prof = findStoreForProduct(p, normalizedProfiles);
            return {
              ...p,
              userId: prof?.uid || p.userId || '',
              storeName: prof?.displayName || p.storeName || (prof?.username ? `@${prof.username}` : 'Restaurante'),
              storeUsername: prof?.username || p.storeUsername || ''
            };
          });

        const sorted = activeList.sort((a, b) => {
          const foodA = isFoodProduct(a);
          const foodB = isFoodProduct(b);
          if (foodA && !foodB) return -1;
          if (!foodA && foodB) return 1;
          return 0;
        });

        // Initialize likes state from localStorage
        const savedLikes: Record<string, boolean> = {};
        try {
          const raw = localStorage.getItem('ryyco_reels_likes');
          if (raw) Object.assign(savedLikes, JSON.parse(raw));
        } catch (e) {}

        const initialLikesMap: Record<string, LikeState> = {};
        sorted.forEach((p) => {
          // Generate realistic initial like count based on product ID seed
          const seed = (p.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 850) + 120;
          const isLiked = Boolean(savedLikes[p.id]);
          initialLikesMap[p.id] = {
            count: seed + (isLiked ? 1 : 0),
            isLiked
          };
        });

        // Determine if there is a target initial product ID from prop or search params
        const targetId = initialReelId || 
          new URLSearchParams(window.location.search).get('id') || 
          new URLSearchParams(window.location.search).get('reel') || 
          new URLSearchParams(window.location.search).get('p');

        let initialIdx = 0;
        if (targetId) {
          const matchIdx = sorted.findIndex(
            p => p.id === targetId || p.id.toLowerCase() === targetId.toLowerCase()
          );
          if (matchIdx !== -1) {
            initialIdx = matchIdx;
          }
        }

        setLikesMap(initialLikesMap);
        setProfiles(normalizedProfiles);
        setProducts(sorted);
        setCurrentIndex(initialIdx);
      } catch (err) {
        console.error('Error cargando reels de productos:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProducts();
    return () => {
      isMounted = false;
    };
  }, [initialReelId]);

  // Initial scroll to target reel on first mount
  useEffect(() => {
    if (!loading && products.length > 0 && !initialScrolledRef.current) {
      initialScrolledRef.current = true;
      if (currentIndex > 0 && containerRef.current) {
        const container = containerRef.current;
        const targetTop = currentIndex * container.clientHeight;
        container.scrollTo({
          top: targetTop,
          behavior: 'instant'
        });
      }
    }
  }, [loading, products, currentIndex]);

  // Keep browser address bar in sync with current reel ID
  useEffect(() => {
    if (products[currentIndex]) {
      const activeId = products[currentIndex].id;
      const targetUrl = `/reels?id=${encodeURIComponent(activeId)}`;
      if (window.location.pathname + window.location.search !== targetUrl) {
        try {
          window.history.replaceState(null, '', targetUrl);
        } catch (e) {}
      }
    }
  }, [currentIndex, products]);

  const total = products.length;

  // 2. Vertical scroll helper with seamless infinite looping
  const scrollToReel = (index: number) => {
    if (!containerRef.current || total === 0) return;
    const targetIdx = (index + total) % total;
    const container = containerRef.current;
    const targetTop = targetIdx * container.clientHeight;
    isProgrammaticScroll.current = true;
    container.scrollTo({
      top: targetTop,
      behavior: 'smooth'
    });
    setCurrentIndex(targetIdx);
    setExpandedDesc(false);
    setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 450);
  };

  // 3. Auto-play story timer: Advance automatically every 3 seconds and return to beginning when finished
  useEffect(() => {
    if (isPaused || total <= 1) return;

    const timer = setInterval(() => {
      scrollToReel(currentIndex + 1);
    }, 3000);

    return () => clearInterval(timer);
  }, [currentIndex, isPaused, total]);

  // 4. Scroll listener to detect active slide when user scrolls naturally
  const handleScroll = () => {
    if (isProgrammaticScroll.current || !containerRef.current) return;
    const container = containerRef.current;
    const height = container.clientHeight;
    if (height === 0) return;
    const calculatedIndex = Math.round(container.scrollTop / height);
    if (calculatedIndex !== currentIndex && calculatedIndex >= 0 && calculatedIndex < total) {
      setCurrentIndex(calculatedIndex);
      setExpandedDesc(false);
    }
  };

  // 5. Keyboard navigation (Arrow Up, Arrow Down, Space for pause, L for like)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        scrollToReel(currentIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        scrollToReel(currentIndex - 1);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPaused(p => {
          const next = !p;
          setShowPauseIndicator(true);
          setTimeout(() => setShowPauseIndicator(false), 900);
          return next;
        });
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        const activeProd = products[currentIndex];
        if (activeProd) toggleLike(activeProd.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, total, products]);

  // 6. Toggle like function
  const toggleLike = (productId: string) => {
    setLikesMap(prev => {
      const current = prev[productId] || { count: 150, isLiked: false };
      const nextLiked = !current.isLiked;
      const nextCount = nextLiked ? current.count + 1 : Math.max(0, current.count - 1);
      const nextMap = {
        ...prev,
        [productId]: {
          count: nextCount,
          isLiked: nextLiked
        }
      };
      try {
        const savedLikes: Record<string, boolean> = {};
        Object.keys(nextMap).forEach(k => {
          if (nextMap[k].isLiked) savedLikes[k] = true;
        });
        localStorage.setItem('ryyco_reels_likes', JSON.stringify(savedLikes));
      } catch (e) {}
      return nextMap;
    });
  };

  // 7. Double-tap to like / Single tap to pause/resume
  const handleMediaTouchOrClick = (e: React.MouseEvent | React.TouchEvent, productId: string) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 280;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected -> Cancel single tap timeout
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      let clientX = rect.width / 2;
      let clientY = rect.height / 2;

      if ('clientX' in e) {
        clientX = e.clientX - rect.left;
        clientY = e.clientY - rect.top;
      } else if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX - rect.left;
        clientY = e.touches[0].clientY - rect.top;
      }

      // Trigger heart burst
      const burstId = Date.now() + Math.random();
      setHeartBursts(prev => [...prev, { id: burstId, x: clientX, y: clientY }]);
      setTimeout(() => {
        setHeartBursts(prev => prev.filter(b => b.id !== burstId));
      }, 900);

      // Force like to true
      setLikesMap(prev => {
        const current = prev[productId] || { count: 150, isLiked: false };
        if (!current.isLiked) {
          const nextMap = {
            ...prev,
            [productId]: {
              count: current.count + 1,
              isLiked: true
            }
          };
          try {
            const savedLikes: Record<string, boolean> = {};
            Object.keys(nextMap).forEach(k => {
              if (nextMap[k].isLiked) savedLikes[k] = true;
            });
            localStorage.setItem('ryyco_reels_likes', JSON.stringify(savedLikes));
          } catch (err) {}
          return nextMap;
        }
        return prev;
      });
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      // Schedule single tap (toggle play/pause)
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = setTimeout(() => {
        setIsPaused(p => {
          const next = !p;
          setShowPauseIndicator(true);
          setTimeout(() => setShowPauseIndicator(false), 900);
          return next;
        });
        singleTapTimeoutRef.current = null;
      }, DOUBLE_TAP_DELAY);
    }
  };

  // 8. Share Reel directly with deep-link to the exact dish/reel
  const handleShare = async (product: ProductItem, profile?: UserProfile | null) => {
    const url = `${window.location.origin}/reels?id=${encodeURIComponent(product.id)}`;
    const text = `🔥 Mira este reel gastronómico en Ryyco: ${product.name} de ${profile?.displayName || 'Ryyco'}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text, url });
      } catch (err: any) {
        // Fallback to clipboard if share cancelled or unavailable
        if (err?.name !== 'AbortError') {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch (e) {}
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {}
    }
  };

  // 9. Cart handlers inside Reels
  const handleUpdateItemQuantity = (cartItemId: string, change: number) => {
    const item = cartItems.find(i => i.id === cartItemId);
    if (!item) return;
    const newQty = item.quantity + change;
    const updated = updateCartQuantity(cartItemId, newQty);
    setCartItems(updated);
    setCartCount(updated.reduce((sum, i) => sum + i.quantity, 0));
  };

  const handleRemoveItem = (cartItemId: string) => {
    const updated = removeProductFromCart(cartItemId);
    setCartItems(updated);
    setCartCount(updated.reduce((sum, i) => sum + i.quantity, 0));
  };

  const handleBuyClick = (product: ProductItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // If product has multiple variants, open bottom sheet selector
    if (product.variantsText && product.variantsText.includes(',')) {
      const firstVariant = product.variantsText.split(',')[0].trim();
      setSelectedVariant(firstVariant);
      setSheetQuantity(1);
      setVariantSheetProduct(product);
      return;
    }

    // Single variant or no variant
    const firstVariant = product.variantsText ? product.variantsText.split(',')[0].trim() : undefined;
    handleAddToCart(product, 1, firstVariant);
  };

  const handleAddToCart = (product: ProductItem, quantity: number = 1, variant?: string) => {
    const prof = findStoreForProduct(product, profiles);
    const prodImg = product.imageURL || getProductImage(product.id);
    const enrichedProduct: ProductItem = {
      ...product,
      imageURL: prodImg,
      userId: prof?.uid || product.userId || '',
      storeName: prof?.displayName || product.storeName || (prof?.username ? `@${prof.username}` : 'Restaurante'),
      storeUsername: prof?.username || product.storeUsername || ''
    };

    const updated = addProductToCart(enrichedProduct, quantity, variant);
    setCartItems(updated);
    const totalCount = updated.reduce((sum, item) => sum + item.quantity, 0);
    setCartCount(totalCount);
    setAddedProductId(product.id);
    setToastNotification({ show: true, product: enrichedProduct });

    setTimeout(() => {
      setAddedProductId(prev => prev === product.id ? null : prev);
    }, 2500);

    setTimeout(() => {
      setToastNotification(prev => ({ ...prev, show: false }));
    }, 3500);
  };

  // 10. Dedicated navigation to Tienda General / Cart
  const handleGoToTienda = () => {
    if (onNavigateToTienda) {
      onNavigateToTienda();
    } else if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.href = '/tienda';
    }
  };

  const handleProceedToCheckout = () => {
    try {
      localStorage.setItem('linnkpro_open_checkout', 'true');
      sessionStorage.setItem('linnkpro_open_checkout', 'true');
    } catch {}
    setIsCartDrawerOpen(false);
    handleGoToTienda();
  };

  const handleViewFullCartInTienda = () => {
    try {
      localStorage.setItem('linnkpro_open_cart', 'true');
      sessionStorage.setItem('linnkpro_open_cart', 'true');
    } catch {}
    setIsCartDrawerOpen(false);
    handleGoToTienda();
  };

  if (loading) {
    return <ReelSkeleton />;
  }

  if (total === 0) {
    return (
      <div className="fixed inset-0 bg-[#090B12] flex flex-col items-center justify-center text-white p-6 text-center z-50">
        <div className="w-20 h-20 bg-gradient-to-tr from-[#E63946] to-[#F4B400] rounded-3xl flex items-center justify-center text-white mb-5 shadow-xl shadow-[#E63946]/20">
          <Utensils className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">No hay Reels disponibles</h2>
        <p className="text-sm text-gray-400 max-w-sm mb-6 leading-relaxed">
          En este momento no hay productos activos en formato Reel. Explora los menús y restaurantes en la Tienda General.
        </p>
        <button
          onClick={handleGoToTienda}
          className="px-8 py-3.5 bg-gradient-to-r from-[#E63946] to-[#D62839] hover:opacity-90 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl transition shadow-xl shadow-[#E63946]/30 cursor-pointer active:scale-95"
        >
          Volver a la Tienda
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center select-none">
      
      {/* Desktop Frame Container (Full Screen on Mobile, Framed on Desktop like TikTok Web) */}
      <div className="w-full h-full max-w-[480px] md:max-w-[440px] lg:max-w-[460px] mx-auto h-[100dvh] relative bg-black shadow-2xl flex flex-col overflow-hidden">

        {/* Top Header Floating Navigation (TikTok Style Bar) */}
        <header className="absolute top-0 left-0 right-0 z-40 px-4 pt-4 pb-3 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-auto">
          {/* Back Button */}
          <button
            onClick={handleGoToTienda}
            className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-black/80 transition active:scale-90 cursor-pointer shadow-md"
            title="Volver a la Tienda"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Reel Category / Channel Tabs */}
          <div className="flex items-center gap-4 text-sm font-black">
            <button 
              onClick={handleGoToTienda}
              className="text-gray-400 hover:text-white transition cursor-pointer text-xs"
            >
              Menú
            </button>
            <div className="h-3 w-[1px] bg-white/20" />
            <div className="relative cursor-pointer text-white flex items-center gap-1">
              <span className="text-sm tracking-tight font-black">Para Ti</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#E63946] animate-pulse ml-0.5" />
              <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#E63946] rounded-full" />
            </div>
          </div>

          {/* Right Action Controls: Cart & Play/Pause */}
          <div className="flex items-center gap-2">
            {/* Cart Button with Counter Badge */}
            <button
              onClick={() => setIsCartDrawerOpen(true)}
              className="relative w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-black/80 transition active:scale-90 cursor-pointer shadow-md"
              title="Ver Carrito de Compras"
            >
              <ShoppingCart className="w-4 h-4" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#E63946] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-black shadow">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </button>

            {/* Play / Pause Toggle Button */}
            <button
              onClick={() => {
                setIsPaused(!isPaused);
                setShowPauseIndicator(true);
                setTimeout(() => setShowPauseIndicator(false), 900);
              }}
              className={`w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition active:scale-90 cursor-pointer shadow-md ${
                isPaused 
                  ? 'bg-[#F4B400]/20 text-[#F4B400] border-[#F4B400]/40' 
                  : 'bg-black/40 text-white border-white/15 hover:bg-black/80'
              }`}
              title={isPaused ? "Reanudar auto-reproducción (3s)" : "Pausar auto-reproducción"}
            >
              {isPaused ? <Play className="w-4 h-4 fill-[#F4B400]" /> : <Pause className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Floating Notification Toast when adding to cart */}
        {toastNotification.show && toastNotification.product && (
          <div className="absolute top-16 left-4 right-4 z-50 bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between border border-white/20 animate-fade-in backdrop-blur-md">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <ShoppingCart className="w-4 h-4 text-white" />
              </div>
              <div className="truncate text-xs">
                <p className="font-bold truncate">¡{toastNotification.product.name} añadido!</p>
                <p className="text-[10px] text-emerald-100">Listo en tu carrito de compras</p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCartDrawerOpen(true);
              }}
              className="px-3 py-1.5 bg-white text-emerald-800 text-[11px] font-black uppercase tracking-wider rounded-xl shadow shrink-0 active:scale-95 transition hover:bg-emerald-50 cursor-pointer"
            >
              Ver Carrito
            </button>
          </div>
        )}

        {/* Vertical Feed Container (Scroll Snap Vertical) */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="w-full h-full flex-1 overflow-y-scroll snap-y snap-mandatory scroll-smooth relative hide-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {products.map((product, idx) => {
            const profile = findStoreForProduct(product, profiles);
            const isFood = isFoodProduct(product);
            const likeInfo = likesMap[product.id] || { count: 120, isLiked: false };

            return (
              <div
                key={product.id}
                className="w-full h-[100dvh] snap-start snap-always relative flex items-center justify-center bg-black overflow-hidden"
              >
                {/* 1. Immersive Blurred Ambient Colorful Glow Background */}
                {product.imageURL ? (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Underlying warm tint */}
                    <div className="absolute inset-0 bg-[#0d111a]" />
                    {/* High-saturation, wide-spread blurred image bringing vibrant natural food colors */}
                    <div 
                      className="absolute -inset-12 bg-cover bg-center filter blur-3xl opacity-80 scale-150 transition-all duration-700 ease-out saturate-150"
                      style={{ backgroundImage: `url(${product.imageURL})` }}
                    />
                    {/* Radial warm lighting layer */}
                    <div className="absolute inset-0 bg-radial from-transparent via-black/20 to-black/60" />
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-[#E63946]/40 via-[#1E293B] to-[#0F172A]" />
                )}

                {/* 2. Top & Bottom Soft Vignettes for readability while keeping vibrant colors */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent via-45% to-black/85 pointer-events-none z-10" />

                {/* 3. Main Center Stage Media */}
                <div 
                  onClick={(e) => handleMediaTouchOrClick(e, product.id)}
                  className="relative z-20 w-full h-full flex items-center justify-center cursor-pointer select-none p-2"
                >
                  {product.imageURL ? (
                    <img
                      src={product.imageURL}
                      alt={product.name}
                      className="w-full h-full object-contain drop-shadow-[0_15px_35px_rgba(0,0,0,0.65)] transition-transform duration-700"
                      loading={idx <= 1 ? "eager" : "lazy"}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500 p-8">
                      <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                        <ShoppingBag className="w-12 h-12 text-gray-400 stroke-1" />
                      </div>
                      <span className="text-xs uppercase font-extrabold tracking-widest text-gray-400">Sin Imagen</span>
                    </div>
                  )}

                  {/* Food / Fast Delivery Badge */}
                  {isFood && (
                    <div className="absolute top-16 left-4 z-20 bg-gradient-to-r from-[#E63946] to-[#D62839] text-white px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xl border border-white/20">
                      <Flame className="w-3.5 h-3.5 fill-white text-white animate-bounce" />
                      <span>Menú / Plato Especial</span>
                    </div>
                  )}

                  {/* Category Tag */}
                  {product.category && !isFood && (
                    <div className="absolute top-16 left-4 z-20 bg-black/60 backdrop-blur-md text-[#F4B400] border border-[#F4B400]/40 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xl">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{product.category}</span>
                    </div>
                  )}

                  {/* Discount percentage badge */}
                  {product.compareAtPrice && product.compareAtPrice > product.price && (
                    <div className="absolute top-16 right-4 z-20 bg-[#E63946] text-white px-2.5 py-1 rounded-full text-xs font-black shadow-xl animate-pulse">
                      -{Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}% OFF
                    </div>
                  )}

                  {/* Play / Pause Brief Center Indicator */}
                  {showPauseIndicator && idx === currentIndex && (
                    <div className="absolute z-40 w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white pointer-events-none animate-scale-up shadow-2xl">
                      {isPaused ? <Pause className="w-8 h-8 fill-white" /> : <Play className="w-8 h-8 fill-white ml-1" />}
                    </div>
                  )}

                  {/* Floating Double Tap Heart Bursts */}
                  {heartBursts.map((burst) => (
                    <div
                      key={burst.id}
                      className="absolute pointer-events-none z-50 animate-ping duration-700 flex items-center justify-center text-red-500"
                      style={{ left: burst.x - 40, top: burst.y - 40 }}
                    >
                      <Heart className="w-24 h-24 fill-red-500 text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]" />
                    </div>
                  ))}
                </div>

                {/* 4. Right Action Sidebar (TikTok Signature Floating Column) */}
                <aside className="absolute right-3 bottom-24 z-30 flex flex-col items-center gap-4.5 pointer-events-auto">
                  
                  {/* Store Avatar with Follow Plus (+) */}
                  {profile && (
                    <div className="relative flex flex-col items-center mb-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToStore(profile.username);
                        }}
                        className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-[#E63946] via-[#F4B400] to-[#E63946] shadow-xl hover:scale-110 active:scale-95 transition cursor-pointer relative"
                        title={`Visitar tienda @${profile.username}`}
                      >
                        {profile.photoURL ? (
                          <img
                            src={profile.photoURL}
                            alt={profile.displayName}
                            className="w-full h-full rounded-full object-cover border-2 border-black"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-[#1E293B] border-2 border-black flex items-center justify-center text-white">
                            <Store className="w-5 h-5 text-[#F4B400]" />
                          </div>
                        )}
                      </button>

                      {/* Store Plus Badge */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToStore(profile.username);
                        }}
                        className="absolute -bottom-2 w-5 h-5 bg-[#E63946] hover:bg-[#d62839] text-white rounded-full flex items-center justify-center shadow-lg border border-black transition hover:scale-125 cursor-pointer"
                        title="Ver Tienda"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                    </div>
                  )}

                  {/* Like / Heart Button */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLike(product.id);
                      }}
                      className={`w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center shadow-xl transition active:scale-125 cursor-pointer ${
                        likeInfo.isLiked 
                          ? 'bg-red-500/20 text-red-500 border border-red-500/40' 
                          : 'bg-black/50 text-white hover:text-red-400 border border-white/15'
                      }`}
                      title={likeInfo.isLiked ? "Ya no me gusta" : "Me gusta"}
                    >
                      <Heart className={`w-6 h-6 transition-transform ${likeInfo.isLiked ? 'fill-red-500 text-red-500 scale-110' : ''}`} />
                    </button>
                    <span className="text-[11px] font-black text-white mt-1 drop-shadow-md">
                      {likeInfo.count.toLocaleString()}
                    </span>
                  </div>

                  {/* Ver Menú Button (Takes user to home / general store catalog) */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGoToTienda();
                      }}
                      className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-[#F4B400] hover:text-amber-300 flex items-center justify-center shadow-xl transition hover:scale-110 active:scale-95 cursor-pointer"
                      title="Ver Menú / Inicio"
                    >
                      <Utensils className="w-5 h-5" />
                    </button>
                    <span className="text-[10px] font-black text-gray-200 mt-1 drop-shadow-md">
                      Menú
                    </span>
                  </div>

                  {/* Share Button */}
                  <div className="flex flex-col items-center relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare(product, profile);
                      }}
                      className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:text-[#F4B400] flex items-center justify-center shadow-xl transition hover:scale-110 active:scale-95 cursor-pointer"
                      title="Compartir Reel"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                    <span className="text-[10px] font-black text-gray-200 mt-1 drop-shadow-md">
                      Compartir
                    </span>
                    {copied && (
                      <div className="absolute -left-20 top-2 bg-[#F4B400] text-black font-black text-[10px] px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap animate-fade-in">
                        ¡Copiado!
                      </div>
                    )}
                  </div>

                </aside>

                {/* 5. Bottom Left Overlay Info & Direct CTA (TikTok Description Bar) */}
                <div className="absolute left-0 right-16 bottom-0 z-30 p-4 pb-6 flex flex-col justify-end bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-auto">
                  
                  {/* Store info & Verified Badge */}
                  {profile && (
                    <div 
                      onClick={() => onNavigateToStore(profile.username)}
                      className="flex items-center gap-2 mb-1.5 cursor-pointer group w-fit"
                    >
                      <span className="font-extrabold text-white text-sm sm:text-base group-hover:text-[#F4B400] transition flex items-center gap-1 drop-shadow-md">
                        @{profile.username}
                        <CheckCircle2 className="w-4 h-4 text-[#F4B400] fill-[#F4B400]/20 inline-block" />
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToStore(profile.username);
                        }}
                        className="px-2.5 py-0.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-[10px] font-bold text-white transition active:scale-95"
                      >
                        Visitar
                      </button>
                    </div>
                  )}

                  {/* Product Title & Prominent Price */}
                  <div className="flex flex-wrap items-baseline gap-2 mb-1">
                    <h2 className="text-base sm:text-lg font-black text-white leading-tight drop-shadow-md">
                      {product.name}
                    </h2>
                    <div className="inline-flex items-center gap-1.5 bg-[#F4B400] text-black px-2.5 py-0.5 rounded-lg font-black text-xs sm:text-sm shadow-md">
                      <span>${product.price?.toLocaleString('es-CO')}</span>
                      <span className="text-[9px] uppercase tracking-tighter opacity-80">COP</span>
                    </div>
                    {product.compareAtPrice && product.compareAtPrice > product.price && (
                      <span className="text-xs text-gray-400 line-through">
                        ${product.compareAtPrice?.toLocaleString('es-CO')}
                      </span>
                    )}
                  </div>

                  {/* Product Description with Truncation */}
                  {product.description && (
                    <div className="text-xs text-gray-200 leading-relaxed drop-shadow mb-3 pr-2">
                      <p className={expandedDesc ? '' : 'line-clamp-2'}>
                        {product.description}
                      </p>
                      {product.description.length > 90 && (
                        <button
                          onClick={() => setExpandedDesc(!expandedDesc)}
                          className="text-[#F4B400] font-bold text-[11px] mt-0.5 hover:underline"
                        >
                          {expandedDesc ? 'Ver menos' : '...ver más'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Direct Purchase / Add to Cart Action Button */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={(e) => handleBuyClick(product, e)}
                      className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer font-black text-sm uppercase tracking-wider ${
                        addedProductId === product.id
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-600/40 animate-pulse'
                          : 'bg-gradient-to-r from-[#E63946] to-[#D62839] hover:opacity-90 text-white shadow-[#E63946]/30'
                      }`}
                    >
                      {addedProductId === product.id ? (
                        <>
                          <Check className="w-5 h-5 text-white" />
                          <span>¡Añadido al Carrito!</span>
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-5 h-5" />
                          <span>Pedir</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>

              </div>
            );
          })}
        </div>

        {/* In-Reel Full Cart Drawer */}
        {isCartDrawerOpen && (
          <div 
            className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-end animate-fade-in"
            onClick={() => setIsCartDrawerOpen(false)}
          >
            <div 
              className="w-full max-h-[85vh] bg-[#0d121f] border-t border-[#232B3A] rounded-t-3xl shadow-2xl flex flex-col overflow-hidden text-white animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="p-4 border-b border-[#232B3A] flex items-center justify-between bg-[#111827]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#E63946]/10 text-[#E63946] flex items-center justify-center border border-[#E63946]/20">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-white">Mi Carrito de Compras</h3>
                    <p className="text-[11px] text-[#A9B2C3]">
                      {cartItems.length} {cartItems.length === 1 ? 'producto' : 'productos'} seleccionado{cartItems.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  title="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[50vh]">
                {cartItems.length === 0 ? (
                  <div className="py-12 text-center flex flex-col items-center justify-center space-y-3 text-[#A9B2C3]">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-gray-500">
                      <ShoppingBag className="w-7 h-7" />
                    </div>
                    <p className="font-bold text-sm text-white">Tu carrito está vacío</p>
                    <p className="text-xs max-w-[240px]">Agrega platos o productos desde los Reels haciendo clic en "Pedir".</p>
                    <button
                      onClick={() => setIsCartDrawerOpen(false)}
                      className="mt-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                    >
                      Continuar viendo Reels
                    </button>
                  </div>
                ) : (
                  cartItems.map((item) => {
                    const prof = profiles[item.product.userId] || findStoreForProduct(item.product, profiles);
                    const storeDisplay = prof?.displayName || item.product.storeName || (prof?.username ? `@${prof.username}` : 'Restaurante');
                    const itemTotal = (item.product.price || 0) * (item.quantity || 1);

                    return (
                      <div 
                        key={item.id}
                        className="bg-[#151D2F] border border-[#232B3A] p-3 rounded-2xl flex gap-3 relative items-center"
                      >
                        {/* Image */}
                        <div className="w-14 h-14 rounded-xl bg-[#090B12] overflow-hidden shrink-0 border border-[#232B3A] flex items-center justify-center">
                          {(() => {
                            const displayImage = item.product.imageURL || getProductImage(item.product.id) || products.find(p => p.id === item.product.id)?.imageURL;
                            return displayImage ? (
                              <img 
                                src={displayImage} 
                                alt={item.product.name} 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <Utensils className="w-6 h-6 text-gray-600" />
                            );
                          })()}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0 pr-6 space-y-0.5">
                          <span className="text-[9px] font-black uppercase text-[#E63946] tracking-wider truncate block">
                            {storeDisplay}
                          </span>
                          <h4 className="font-bold text-xs text-white truncate">
                            {item.product.name}
                          </h4>
                          {item.selectedVariant && (
                            <span className="text-[10px] font-semibold text-[#A9B2C3] bg-[#090B12] px-1.5 py-0.5 rounded border border-[#232B3A] inline-block">
                              {item.selectedVariant}
                            </span>
                          )}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs font-black text-white">
                              ${itemTotal.toLocaleString('es-CO')} COP
                            </span>

                            {/* Quantity Controls */}
                            <div className="flex items-center gap-1.5 bg-[#090B12] border border-[#232B3A] rounded-lg p-0.5">
                              <button
                                onClick={() => handleUpdateItemQuantity(item.id, -1)}
                                className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="font-black text-xs px-1.5 text-white min-w-[20px] text-center">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => handleUpdateItemQuantity(item.id, 1)}
                                className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="absolute top-2.5 right-2.5 p-1 text-gray-500 hover:text-[#E63946] transition cursor-pointer rounded-lg hover:bg-white/5"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Drawer Footer Summary & Checkout */}
              {cartItems.length > 0 && (() => {
                const summary = calculateCartSummary(cartItems, systemDeliveryFee);
                return (
                  <div className="p-4 border-t border-[#232B3A] bg-[#111827] space-y-3">
                    <div className="space-y-1.5 text-xs text-[#A9B2C3]">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span className="font-bold text-white">${summary.subtotal.toLocaleString('es-CO')} COP</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Domicilio estimado ({summary.storeCount} local{summary.storeCount === 1 ? '' : 'es'}):</span>
                        <span className="font-bold text-white">${summary.deliveryFee.toLocaleString('es-CO')} COP</span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-white pt-1 border-t border-white/10">
                        <span>Total:</span>
                        <span className="text-[#F4B400] text-base font-black">${summary.grandTotal.toLocaleString('es-CO')} COP</span>
                      </div>
                    </div>

                    {/* Finalize Button */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setIsCartDrawerOpen(false)}
                        className="flex-1 py-3 px-3 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                      >
                        Seguir viendo
                      </button>
                      <button
                        onClick={handleProceedToCheckout}
                        className="flex-2 py-3 px-4 bg-gradient-to-r from-[#E63946] to-[#D62839] hover:opacity-95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-[#E63946]/30 flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
                      >
                        <span>Finalizar Pedido</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={handleViewFullCartInTienda}
                      className="w-full text-center text-[11px] text-gray-400 hover:text-white transition underline cursor-pointer"
                    >
                      Abrir Carrito en Vitrina General
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Variant Selection Bottom Sheet */}
        {variantSheetProduct && (
          <div 
            className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-end animate-fade-in"
            onClick={() => setVariantSheetProduct(null)}
          >
            <div 
              className="w-full bg-[#0d121f] border-t border-[#232B3A] rounded-t-3xl shadow-2xl p-5 flex flex-col gap-4 text-white animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#232B3A] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#090B12] overflow-hidden border border-[#232B3A] shrink-0">
                    {variantSheetProduct.imageURL ? (
                      <img 
                        src={variantSheetProduct.imageURL} 
                        alt={variantSheetProduct.name} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <Utensils className="w-6 h-6 text-gray-600 m-auto mt-3" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-white line-clamp-1">{variantSheetProduct.name}</h4>
                    <p className="text-xs font-bold text-[#E63946]">${(variantSheetProduct.price || 0).toLocaleString('es-CO')} COP</p>
                  </div>
                </div>
                <button
                  onClick={() => setVariantSheetProduct(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Variant Selector */}
              <div>
                <label className="block text-xs font-bold text-[#A9B2C3] uppercase tracking-wider mb-2">
                  Elige una opción / tamaño:
                </label>
                <div className="flex flex-wrap gap-2">
                  {(variantSheetProduct.variantsText || '')
                    .split(',')
                    .map(v => v.trim())
                    .filter(Boolean)
                    .map((variantName) => {
                      const isSelected = selectedVariant === variantName;
                      return (
                        <button
                          key={variantName}
                          type="button"
                          onClick={() => setSelectedVariant(variantName)}
                          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                            isSelected
                              ? 'bg-gradient-to-r from-[#E63946] to-[#D62839] text-white border-transparent shadow-md shadow-[#E63946]/30'
                              : 'bg-[#151D2F] text-gray-300 border-[#232B3A] hover:bg-[#1E293B]'
                          }`}
                        >
                          {variantName}
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="flex items-center justify-between py-2 border-y border-[#232B3A]">
                <span className="text-xs font-bold text-[#A9B2C3]">Cantidad:</span>
                <div className="flex items-center gap-3 bg-[#151D2F] border border-[#232B3A] rounded-xl px-2 py-1">
                  <button
                    onClick={() => setSheetQuantity(q => Math.max(1, q - 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-black text-sm text-white px-2">
                    {sheetQuantity}
                  </span>
                  <button
                    onClick={() => setSheetQuantity(q => q + 1)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Total & Add Button */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Total:</span>
                  <span className="text-base font-black text-[#F4B400]">
                    ${((variantSheetProduct.price || 0) * sheetQuantity).toLocaleString('es-CO')} COP
                  </span>
                </div>
                <button
                  onClick={() => {
                    handleAddToCart(variantSheetProduct, sheetQuantity, selectedVariant);
                    setVariantSheetProduct(null);
                  }}
                  className="py-3 px-6 bg-gradient-to-r from-[#E63946] to-[#D62839] hover:opacity-90 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-[#E63946]/30 flex items-center gap-2 active:scale-95 transition cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Agregar al Carrito</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Up / Down Floating Navigation Arrows (Side controls for convenient mouse navigation) */}
        <div className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-40 flex-col gap-2 pointer-events-auto">
          <button
            onClick={() => scrollToReel(currentIndex - 1)}
            className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black/90 transition shadow-xl cursor-pointer"
            title="Reel anterior (Flecha Arriba)"
          >
            <ChevronUp className="w-6 h-6" />
          </button>
          <button
            onClick={() => scrollToReel(currentIndex + 1)}
            className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black/90 transition shadow-xl cursor-pointer"
            title="Siguiente Reel (Flecha Abajo)"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>

      </div>

    </div>
  );
}
