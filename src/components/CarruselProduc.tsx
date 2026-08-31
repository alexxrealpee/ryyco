/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Store, 
  ShoppingBag, 
  ChevronUp, 
  ChevronDown, 
  ArrowLeft, 
  Pause, 
  Play, 
  Share2,
  Utensils,
  Heart,
  Music,
  CheckCircle2,
  Tag,
  Flame,
  Volume2,
  VolumeX,
  Sparkles,
  ExternalLink,
  Plus
} from 'lucide-react';
import PwaLoadingScreen from './PwaLoadingScreen';
import { fetchAllActiveProductsAndStores, checkIsStoreClosed, findStoreForProduct } from '../lib/firebase';
import { ProductItem, UserProfile } from '../types';
import { isFoodProduct } from './TiendaGeneral';

interface CarruselProducProps {
  onNavigateHome: () => void;
  onNavigateToStore: (username: string) => void;
  onNavigateToTienda?: () => void;
}

interface LikeState {
  count: number;
  isLiked: boolean;
}

export default function CarruselProduc({ onNavigateHome, onNavigateToStore, onNavigateToTienda }: CarruselProducProps) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showPauseIndicator, setShowPauseIndicator] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [expandedDesc, setExpandedDesc] = useState(false);
  
  // Likes storage & state
  const [likesMap, setLikesMap] = useState<Record<string, LikeState>>({});
  
  // Double tap heart burst animations
  const [heartBursts, setHeartBursts] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const lastTapRef = useRef<number>(0);
  const singleTapTimeoutRef = useRef<any>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);

  // 1. Fetch active products and profiles
  useEffect(() => {
    let isMounted = true;
    async function loadProducts() {
      try {
        const { products: fetchedProducts, profiles: fetchedProfiles } = await fetchAllActiveProductsAndStores();
        if (!isMounted) return;

        // Filter and sort products (Food / Restaurant products first for maximum engagement)
        const activeList = fetchedProducts.filter(p => {
          if (p.active === false) return false;
          const prof = findStoreForProduct(p, fetchedProfiles);
          return prof && !prof.suspended && !checkIsStoreClosed(prof);
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

        setLikesMap(initialLikesMap);
        setProfiles(fetchedProfiles);
        setProducts(sorted);
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
  }, []);

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

  // 3. Auto-play story timer: Advance automatically every 3 seconds (3000 ms)
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

  // 8. Share Reel
  const handleShare = async (product: ProductItem, profile?: UserProfile | null) => {
    const url = window.location.origin + (profile?.username ? `/${profile.username}` : '/tienda');
    const text = `🔥 Mira este reel gastronómico en Ryyco: ${product.name} de ${profile?.displayName || 'Ryyco'}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text, url });
      } catch (err) {
        // Fallback to clipboard
      }
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 9. Dedicated navigation to Tienda General
  const handleGoToTienda = () => {
    if (onNavigateToTienda) {
      onNavigateToTienda();
    } else if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.href = '/tienda';
    }
  };

  if (loading) {
    return <PwaLoadingScreen message="Cargando Reels de comida en Ipiales..." />;
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
              Tienda
            </button>
            <div className="h-3 w-[1px] bg-white/20" />
            <div className="relative cursor-pointer text-white flex items-center gap-1">
              <span className="text-sm tracking-tight font-black">Para Ti</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#E63946] animate-pulse ml-0.5" />
              <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#E63946] rounded-full" />
            </div>
          </div>

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
        </header>

        {/* Vertical Feed Container (Scroll Snap Vertical) */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="w-full h-full flex-1 overflow-y-scroll snap-y snap-mandatory scroll-smooth relative hide-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {products.map((product, idx) => {
            const profile = profiles[product.userId];
            const isFood = isFoodProduct(product);
            const likeInfo = likesMap[product.id] || { count: 120, isLiked: false };

            return (
              <div
                key={product.id}
                className="w-full h-[100dvh] snap-start snap-always relative flex items-center justify-center bg-black overflow-hidden"
              >
                {/* 1. Immersive Blurred Ambient Background */}
                {product.imageURL ? (
                  <div 
                    className="absolute inset-0 bg-cover bg-center filter blur-2xl opacity-40 scale-125 transition-transform duration-1000 ease-out"
                    style={{ backgroundImage: `url(${product.imageURL})` }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-[#1E293B] via-[#0F172A] to-black" />
                )}

                {/* 2. Top & Bottom Cinematic Vignette Gradients */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent via-50% to-black/95 pointer-events-none z-10" />

                {/* 3. Main Center Stage Media */}
                <div 
                  onClick={(e) => handleMediaTouchOrClick(e, product.id)}
                  className="relative z-20 w-full h-full flex items-center justify-center cursor-pointer select-none"
                >
                  {product.imageURL ? (
                    <img
                      src={product.imageURL}
                      alt={product.name}
                      className="w-full h-full object-cover sm:object-contain drop-shadow-2xl transition-transform duration-700 hover:scale-105"
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

                  {/* Ver en Tienda Button */}
                  {profile && (
                    <div className="flex flex-col items-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToStore(profile.username);
                        }}
                        className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-[#F4B400] hover:text-amber-300 flex items-center justify-center shadow-xl transition hover:scale-110 active:scale-95 cursor-pointer"
                        title="Ver Tienda"
                      >
                        <Store className="w-5 h-5" />
                      </button>
                      <span className="text-[10px] font-black text-gray-200 mt-1 drop-shadow-md">
                        Tienda
                      </span>
                    </div>
                  )}

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

                  {/* TikTok Rotating Vinyl Disc Audio Icon */}
                  <div className="relative mt-2">
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (profile) onNavigateToStore(profile.username);
                      }}
                      className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-900 via-black to-gray-800 border-2 border-white/30 p-1 flex items-center justify-center animate-[spin_4s_linear_infinite] shadow-xl cursor-pointer"
                      title="Audio original"
                    >
                      {profile?.photoURL ? (
                        <img 
                          src={profile.photoURL} 
                          alt="disc" 
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <Music className="w-4 h-4 text-[#F4B400]" />
                      )}
                    </div>
                    {/* Floating mini music notes */}
                    <div className="absolute -top-3 -left-2 text-[#F4B400] animate-bounce text-[10px] pointer-events-none">
                      🎵
                    </div>
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

                  {/* TikTok Scrolling Music / Audio Ticker */}
                  <div className="flex items-center gap-2 text-xs text-gray-300 mb-3 opacity-90">
                    <Music className="w-3.5 h-3.5 text-[#F4B400] animate-pulse shrink-0" />
                    <div className="overflow-hidden whitespace-nowrap text-[11px] font-medium text-gray-200">
                      <span>🎵 Menú & Platos de Ipiales • @{profile?.username || 'ryyco'}</span>
                    </div>
                  </div>

                  {/* Direct Store Action Button (Without WhatsApp in Reel) */}
                  <div className="flex items-center gap-2 pt-1">
                    {profile ? (
                      <button
                        onClick={() => onNavigateToStore(profile.username)}
                        className="flex-1 py-2.5 px-4 bg-gradient-to-r from-[#E63946] to-[#D62839] hover:opacity-90 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#E63946]/30 transition active:scale-95 cursor-pointer"
                      >
                        <Store className="w-4 h-4" />
                        <span>Ver en la Tienda</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleGoToTienda}
                        className="flex-1 py-2.5 px-4 bg-gradient-to-r from-[#E63946] to-[#D62839] hover:opacity-90 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#E63946]/30 transition active:scale-95 cursor-pointer"
                      >
                        <ShoppingBag className="w-4 h-4" />
                        <span>Explorar Tienda</span>
                      </button>
                    )}
                  </div>

                </div>

              </div>
            );
          })}
        </div>

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
