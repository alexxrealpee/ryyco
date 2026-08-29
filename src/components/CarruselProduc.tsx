/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Store, 
  ShoppingBag, 
  MessageCircle, 
  ChevronLeft, 
  ChevronRight, 
  ArrowLeft, 
  Pause, 
  Play, 
  ExternalLink,
  Sparkles,
  Tag,
  Share2,
  Utensils
} from 'lucide-react';
import PwaLoadingScreen from './PwaLoadingScreen';
import { fetchAllActiveProductsAndStores, checkIsStoreClosed, findStoreForProduct } from '../lib/firebase';
import { ProductItem, UserProfile } from '../types';
import { isFoodProduct, isFoodCategory } from './TiendaGeneral';

interface CarruselProducProps {
  onNavigateHome: () => void;
  onNavigateToStore: (username: string) => void;
  onNavigateToTienda?: () => void;
}

export default function CarruselProduc({ onNavigateHome, onNavigateToStore, onNavigateToTienda }: CarruselProducProps) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);

  // 1. Fetch active products and profiles
  useEffect(() => {
    let isMounted = true;
    async function loadProducts() {
      try {
        const { products: fetchedProducts, profiles: fetchedProfiles } = await fetchAllActiveProductsAndStores();
        if (!isMounted) return;

        // Filter and sort products (Food products first)
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

        setProfiles(fetchedProfiles);
        setProducts(sorted);
      } catch (err) {
        console.error('Error cargando carrusel de productos:', err);
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

  // 2. Auto-play story timer: Advance every 3 seconds (3000 ms)
  useEffect(() => {
    if (loading || total === 0 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex(prev => {
        const next = (prev + 1) % total;
        scrollToIndex(next);
        return next;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [loading, total, isPaused]);

  // Smooth scroll helper
  const scrollToIndex = (index: number) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const targetLeft = index * container.clientWidth;
    isProgrammaticScroll.current = true;
    container.scrollTo({
      left: targetLeft,
      behavior: 'smooth'
    });
    setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 400);
  };

  // Sync scroll position manually if user swipes / drags
  const handleScroll = () => {
    if (isProgrammaticScroll.current || !containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    if (width === 0) return;
    const calculatedIndex = Math.round(container.scrollLeft / width);
    if (calculatedIndex !== currentIndex && calculatedIndex >= 0 && calculatedIndex < total) {
      setCurrentIndex(calculatedIndex);
    }
  };

  // Previous and Next Manual Controls
  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (total === 0) return;
    const nextIndex = (currentIndex + 1) % total;
    setCurrentIndex(nextIndex);
    scrollToIndex(nextIndex);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (total === 0) return;
    const prevIndex = (currentIndex - 1 + total) % total;
    setCurrentIndex(prevIndex);
    scrollToIndex(prevIndex);
  };

  // Share story
  const handleShare = async () => {
    const currentProduct = products[currentIndex];
    const profile = currentProduct ? profiles[currentProduct.userId] : null;
    const url = window.location.href;
    const text = currentProduct 
      ? `Mira este producto en ryyco.com: ${currentProduct.name} - ${profile?.displayName || 'Ryyco'}`
      : 'Mira el carrusel de productos en ryyco.com';

    if (navigator.share) {
      try {
        await navigator.share({ title: currentProduct?.name || 'Carrusel Ryyco', text, url });
      } catch (err) {
        // Fallback to copy
      }
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Dedicated navigation to Tienda General (ryyco.com/tienda)
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
    return <PwaLoadingScreen message="Cargando directorio gastronómico de Ipiales..." />;
  }

  if (total === 0) {
    return (
      <div className="fixed inset-0 bg-[#090B12] flex flex-col items-center justify-center text-white p-6 text-center">
        <div className="w-16 h-16 bg-[#E63946]/10 border border-[#E63946]/30 rounded-2xl flex items-center justify-center text-[#E63946] mb-4">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-white mb-2">No hay productos disponibles</h2>
        <p className="text-sm text-gray-400 max-w-sm mb-6">
          En este momento no hay productos en el carrusel. Vuelve más tarde o explora las tiendas públicas.
        </p>
        <button
          onClick={handleGoToTienda}
          className="px-6 py-3 bg-[#E63946] hover:bg-[#d62839] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-[#E63946]/20 cursor-pointer"
        >
          Volver a la Tienda
        </button>
      </div>
    );
  }

  const activeProduct = products[currentIndex];
  const activeProfile = activeProduct ? profiles[activeProduct.userId] : null;

  // Format phone number for WhatsApp
  const rawPhone = activeProfile?.whatsapp || activeProfile?.phone || '';
  const cleanPhone = rawPhone.replace(/\D/g, '');
  const waPhone = cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone;
  const waMessage = activeProduct 
    ? encodeURIComponent(`¡Hola! Vi el producto *${activeProduct.name}* ($${activeProduct.price?.toLocaleString('es-CO')}) en el carrusel de ryyco.com y me gustaría realizar un pedido.`)
    : '';

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex flex-col select-none" style={{ touchAction: 'pan-x pan-y' }}>
      
      {/* Top Header Stories Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent">
        
        {/* Story Progress Indicators */}
        <div className="flex gap-1.5 w-full mb-3 max-w-2xl mx-auto px-1">
          {products.slice(0, 30).map((p, idx) => {
            const isActive = idx === currentIndex;
            const isPassed = idx < currentIndex;
            return (
              <div 
                key={p.id + idx} 
                onClick={() => {
                  setCurrentIndex(idx);
                  scrollToIndex(idx);
                }}
                className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden cursor-pointer relative"
              >
                <div 
                  className={`h-full bg-[#E63946] rounded-full transition-all ${
                    isPassed ? 'w-full' : isActive ? (isPaused ? 'w-full opacity-70' : 'w-full duration-[3000ms] ease-linear') : 'w-0'
                  }`}
                  style={{
                    transitionProperty: isActive ? 'width' : 'none'
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Store Profile Header & Action Buttons */}
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {/* Store Info */}
          <div className="flex items-center gap-2.5">
            <button 
              onClick={handleGoToTienda}
              className="p-2 bg-black/40 hover:bg-black/80 backdrop-blur-md rounded-full text-white/90 border border-white/10 transition mr-1 cursor-pointer"
              title="Volver a la tienda"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {activeProfile && (
              <div 
                onClick={() => onNavigateToStore(activeProfile.username)}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                {activeProfile.photoURL ? (
                  <img 
                    src={activeProfile.photoURL} 
                    alt={activeProfile.displayName} 
                    className="w-9 h-9 rounded-full object-cover border border-[#E63946] shadow-md group-hover:scale-105 transition"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#E63946]/20 border border-[#E63946]/80 flex items-center justify-center text-[#E63946] font-bold text-xs">
                    <Store className="w-4 h-4" />
                  </div>
                )}
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-bold text-xs sm:text-sm line-clamp-1 group-hover:text-[#F4B400] transition">
                      {activeProfile.displayName}
                    </span>
                    <span className="text-[10px] bg-[#F4B400]/20 text-[#F4B400] px-1.5 py-0.5 rounded font-mono border border-[#F4B400]/40 font-bold">
                      Pro
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-300 font-mono block">
                    @{activeProfile.username}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right Header Options */}
          <div className="flex items-center gap-2">
            {/* Pause / Play indicator */}
            <button 
              onClick={() => setIsPaused(!isPaused)}
              className="p-2 bg-black/40 backdrop-blur-md hover:bg-black/70 text-white rounded-full border border-white/10 transition"
              title={isPaused ? "Reanudar" : "Pausar"}
            >
              {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4 fill-white" />}
            </button>

            {/* Share button */}
            <button 
              onClick={handleShare}
              className="p-2 bg-black/40 backdrop-blur-md hover:bg-black/70 text-white rounded-full border border-white/10 transition relative"
              title="Compartir"
            >
              <Share2 className="w-4 h-4" />
              {copied && (
                <span className="absolute -bottom-8 right-0 bg-[#F4B400] text-black font-bold text-[10px] px-2 py-0.5 rounded shadow">
                  ¡Copiado!
                </span>
              )}
            </button>

            {/* Store Link */}
            {activeProfile && (
              <button
                onClick={() => onNavigateToStore(activeProfile.username)}
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-[#E63946]/20 hover:bg-[#E63946]/35 text-white border border-[#E63946]/50 rounded-full text-xs font-bold transition"
              >
                <span>Visitar Tienda</span>
                <ExternalLink className="w-3 h-3 text-[#F4B400]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Snap Horizontal Scroll Container */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
        className="flex-1 w-full h-full flex overflow-x-auto snap-x snap-mandatory scroll-smooth hide-scrollbar relative"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {products.map((product, idx) => {
          const profile = profiles[product.userId];
          const isFood = isFoodProduct(product);

          return (
            <div 
              key={product.id + idx}
              className="w-screen h-screen flex-shrink-0 snap-center snap-always relative flex items-center justify-center bg-gray-950"
            >
              {/* Blurred Background Image */}
              {product.imageURL ? (
                <div 
                  className="absolute inset-0 bg-cover bg-center filter blur-xl opacity-30 scale-110"
                  style={{ backgroundImage: `url(${product.imageURL})` }}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-950 to-black" />
              )}

              {/* Main Center Media Container */}
              <div className="relative z-10 w-full h-full max-w-md mx-auto flex flex-col justify-between pt-20 pb-28 px-4 sm:px-6">
                
                {/* Product Image Stage */}
                <div className="flex-1 flex items-center justify-center relative overflow-hidden my-auto rounded-3xl bg-black/40 border border-white/10 shadow-2xl backdrop-blur-sm">
                  {product.imageURL ? (
                    <img 
                      src={product.imageURL} 
                      alt={product.name} 
                      className="max-h-full max-w-full object-contain drop-shadow-2xl transition-all duration-300"
                      loading={idx === 0 ? "eager" : "lazy"}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                      <ShoppingBag className="w-20 h-20 mb-3 opacity-30 stroke-1" />
                      <span className="text-xs uppercase font-bold tracking-widest text-gray-400">Sin Imagen</span>
                    </div>
                  )}

                  {/* Food Badge */}
                  {isFood && (
                    <div className="absolute top-4 left-4 bg-[#E63946] text-white px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                      <Utensils className="w-3.5 h-3.5" />
                      <span>Comida / Menú</span>
                    </div>
                  )}

                  {/* Category Tag */}
                  {product.category && !isFood && (
                    <div className="absolute top-4 left-4 bg-[#F4B400]/20 backdrop-blur-md border border-[#F4B400]/40 text-[#F4B400] px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{product.category}</span>
                    </div>
                  )}

                  {/* Discount Badge if compareAtPrice is present */}
                  {product.compareAtPrice && product.compareAtPrice > product.price && (
                    <div className="absolute top-4 right-4 bg-[#E63946] text-white px-2.5 py-1 rounded-full text-xs font-black shadow-lg">
                      -{Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}%
                    </div>
                  )}
                </div>

                {/* Tap Zones for Stories (Left 35% prev, Right 35% next) */}
                <div 
                  onClick={handlePrev} 
                  className="absolute left-0 top-20 bottom-32 w-[30%] z-20 cursor-pointer flex items-center justify-start pl-2 opacity-0 hover:opacity-100 transition"
                  title="Anterior"
                >
                  <div className="p-3 bg-black/60 rounded-full text-white backdrop-blur-md">
                    <ChevronLeft className="w-6 h-6" />
                  </div>
                </div>

                <div 
                  onClick={handleNext} 
                  className="absolute right-0 top-20 bottom-32 w-[30%] z-20 cursor-pointer flex items-center justify-end pr-2 opacity-0 hover:opacity-100 transition"
                  title="Siguiente"
                >
                  <div className="p-3 bg-black/60 rounded-full text-white backdrop-blur-md">
                    <ChevronRight className="w-6 h-6" />
                  </div>
                </div>

                {/* Bottom Card Content Info */}
                <div className="mt-4 bg-[#0F172A]/90 border border-white/10 rounded-2xl p-4 sm:p-5 backdrop-blur-xl shadow-2xl">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h2 className="text-lg sm:text-xl font-black text-white leading-snug line-clamp-2">
                        {product.name}
                      </h2>
                      {profile && (
                        <p className="text-xs text-[#F4B400] font-medium mt-0.5 flex items-center gap-1">
                          <Store className="w-3.5 h-3.5" />
                          <span>{profile.displayName}</span>
                        </p>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-xl sm:text-2xl font-black text-[#F4B400] block tracking-tight">
                        ${product.price?.toLocaleString('es-CO')}
                      </span>
                      {product.compareAtPrice && product.compareAtPrice > product.price && (
                        <span className="text-xs text-gray-400 line-through block">
                          ${product.compareAtPrice?.toLocaleString('es-CO')}
                        </span>
                      )}
                    </div>
                  </div>

                  {product.description && (
                    <p className="text-xs text-gray-300 line-clamp-2 mb-3 leading-relaxed">
                      {product.description}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (profile) onNavigateToStore(profile.username);
                      }}
                      className="w-full py-3 px-4 bg-[#E63946] hover:bg-[#d62839] text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-[#E63946]/25 active:scale-95 cursor-pointer"
                    >
                      <Store className="w-4 h-4" />
                      <span>Ver en Tienda</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* Fixed Bottom Navigation Footer */}
      <div className="absolute bottom-0 left-0 right-0 z-30 p-3 bg-gradient-to-t from-black via-black/90 to-transparent flex items-center justify-between max-w-2xl mx-auto px-4">
        <button
          onClick={handleGoToTienda}
          className="text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Inicio</span>
        </button>

        <div className="flex items-center gap-1 text-[11px] font-mono text-gray-400 bg-gray-900/80 px-3 py-1 rounded-full border border-white/10">
          <span className="text-[#F4B400] font-bold">{currentIndex + 1}</span>
          <span>/</span>
          <span>{total}</span>
        </div>

        {onNavigateToTienda ? (
          <button
            onClick={onNavigateToTienda}
            className="text-xs font-bold text-[#F4B400] hover:text-amber-300 flex items-center gap-1 transition cursor-pointer"
          >
            <span>Ver Vitrina</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleGoToTienda}
            className="text-xs font-bold text-[#F4B400] hover:text-amber-300 flex items-center gap-1 transition cursor-pointer"
          >
            <span>LinnkPro Tienda</span>
          </button>
        )}
      </div>

    </div>
  );
}
