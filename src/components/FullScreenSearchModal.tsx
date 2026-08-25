import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  ArrowLeft, 
  X, 
  Flame, 
  Star, 
  Plus, 
  Store, 
  ShoppingBag, 
  Check, 
  Sparkles,
  UtensilsCrossed
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProductItem, UserProfile } from '../types';
import { findStoreForProduct, checkIsStoreClosed } from '../lib/firebase';
import { isFoodProduct } from './TiendaGeneral';

interface FullScreenSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  products: ProductItem[];
  profiles: Record<string, UserProfile>;
  onSelectProduct: (product: ProductItem) => void;
  onAddToCartDirect: (product: ProductItem, e?: React.MouseEvent) => void;
  onNavigateToStore: (username: string) => void;
  cartCount?: number;
  onOpenCart?: () => void;
}

const POPULAR_SEARCH_TAGS = [
  { label: 'Papas', icon: '🍟' },
  { label: 'Hamburguesas', icon: '🍔' },
  { label: 'Pollo', icon: '🍗' },
  { label: 'Salchipapas', icon: '🌭' },
  { label: 'Pizza', icon: '🍕' },
  { label: 'Carnes & Asados', icon: '🥩' },
  { label: 'Bebidas', icon: '🥤' },
  { label: 'Sushi', icon: '🍣' },
  { label: 'Postres', icon: '🍰' },
  { label: 'Licores', icon: '🍹' },
  { label: 'Desayunos', icon: '🍳' },
  { label: 'Ceviche', icon: '🦐' },
];

export default function FullScreenSearchModal({
  isOpen,
  onClose,
  searchTerm,
  setSearchTerm,
  products,
  profiles,
  onSelectProduct,
  onAddToCartDirect,
  onNavigateToStore,
  cartCount = 0,
  onOpenCart
}: FullScreenSearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);

  // Auto-focus the search input whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      // Small timeout ensures the DOM element is rendered and mobile keyboard is triggered
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Position cursor at end of input
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }, 80);

      // Prevent background scrolling while search modal is active
      document.body.style.overflow = 'hidden';

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Handle ESC key to close search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter products matching search term from available stores
  const searchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    
    // Filter active products from non-suspended, open stores
    const validProducts = products.filter(product => {
      const profile = findStoreForProduct(product, profiles);
      if (!profile || checkIsStoreClosed(profile) || profile.suspended) return false;
      return true;
    });

    if (!query) {
      // If query is empty, show top recommended food products
      return validProducts
        .sort((a, b) => {
          const foodA = isFoodProduct(a);
          const foodB = isFoodProduct(b);
          if (foodA && !foodB) return -1;
          if (!foodA && foodB) return 1;
          return (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        })
        .slice(0, 15);
    }

    return validProducts.filter(product => {
      const profile = findStoreForProduct(product, profiles);
      const name = (product.name || '').toLowerCase();
      const desc = (product.description || '').toLowerCase();
      const cat = (product.category || '').toLowerCase();
      const storeName = (profile?.displayName || '').toLowerCase();
      const storeUser = (profile?.username || '').toLowerCase();

      return (
        name.includes(query) ||
        desc.includes(query) ||
        cat.includes(query) ||
        storeName.includes(query) ||
        storeUser.includes(query)
      );
    }).sort((a, b) => {
      // 1. Exact name match first
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const aExact = aName.startsWith(query);
      const bExact = bName.startsWith(query);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // 2. Food items first
      const foodA = isFoodProduct(a);
      const foodB = isFoodProduct(b);
      if (foodA && !foodB) return -1;
      if (!foodA && foodB) return 1;

      return (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    });
  }, [products, profiles, searchTerm]);

  // Deterministic realistic rating generator based on product ID for consistent aesthetic
  const getProductRating = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const ratings = [4.5, 4.6, 4.7, 4.8, 4.9, 5.0];
    const index = Math.abs(hash) % ratings.length;
    return ratings[index].toFixed(1);
  };

  const handleAddClick = (product: ProductItem, e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToCartDirect(product, e);
    setAddedProductId(product.id);
    setTimeout(() => {
      setAddedProductId(null);
    }, 1200);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 bg-[#090B12] flex flex-col text-[#A9B2C3] font-sans selection:bg-[#E63946] selection:text-white"
        style={{ height: '100dvh', width: '100vw' }}
      >
        {/* Top Sticky Header: Back Button + Full-width Search Input */}
        <header className="sticky top-0 z-40 bg-[#090B12]/95 backdrop-blur-md border-b border-[#232B3A] px-3 sm:px-5 py-3 sm:py-3.5 flex items-center gap-2 sm:gap-3 shadow-xl">
          {/* Back / Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#111827] hover:bg-[#232B3A] border border-[#232B3A] flex items-center justify-center text-white hover:text-[#E63946] transition active:scale-95 cursor-pointer shrink-0 shadow-sm"
            title="Regresar"
            aria-label="Regresar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Search Input Bar (fills all available space) */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar restaurantes, platos o menús..."
              autoFocus
              className="w-full bg-white border-2 border-[#E63946] rounded-full py-2.5 sm:py-3 pl-10 sm:pl-11 pr-11 text-xs sm:text-sm font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#E63946] focus:ring-4 focus:ring-[#E63946]/20 shadow-md transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center hover:bg-gray-200 rounded-full text-gray-500 transition cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Search Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 space-y-5 max-w-4xl w-full mx-auto pb-24">
          
          {/* Popular search pills if query is short or empty */}
          {searchTerm.trim().length === 0 ? (
            <div className="space-y-4 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase text-[#F4B400] tracking-wider">
                <Sparkles className="w-4 h-4 text-[#F4B400]" />
                <span>Búsquedas Populares</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_SEARCH_TAGS.map((tag) => (
                  <button
                    key={tag.label}
                    onClick={() => {
                      setSearchTerm(tag.label);
                      inputRef.current?.focus();
                    }}
                    className="px-3.5 py-2 bg-[#111827] hover:bg-[#232B3A] border border-[#232B3A] hover:border-[#E63946] rounded-full text-xs font-bold text-white transition active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <span>{tag.icon}</span>
                    <span>{tag.label}</span>
                  </button>
                ))}
              </div>

              {/* Recommended dishes preview header */}
              <div className="pt-4 border-t border-[#232B3A] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-4.5 h-4.5 text-[#E63946]" />
                  <span className="font-extrabold text-sm text-white uppercase tracking-wide">
                    Platos Recomendados de Ipiales
                  </span>
                </div>
                <span className="text-[11px] text-[#A9B2C3] font-medium">
                  {searchResults.length} opciones
                </span>
              </div>
            </div>
          ) : (
            /* Results header when search query exists */
            <div className="space-y-1 pt-1">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-[#E63946] shrink-0 fill-[#E63946]/20" />
                <h2 className="text-sm sm:text-base font-black uppercase tracking-wide text-white">
                  RESULTADOS PARA <span className="text-[#E63946]">"{searchTerm.trim()}"</span>
                </h2>
              </div>
              <p className="text-xs text-[#A9B2C3] font-medium pl-7">
                {searchResults.length === 1 
                  ? 'Se encontró 1 plato / producto'
                  : `Se encontraron ${searchResults.length} platos`}
              </p>
            </div>
          )}

          {/* Results List or Empty State */}
          {searchResults.length === 0 ? (
            <div className="bg-[#111827] border border-[#232B3A] rounded-3xl py-14 px-4 text-center max-w-md mx-auto space-y-4 mt-6">
              <div className="w-14 h-14 rounded-2xl bg-[#090B12] border border-[#232B3A] flex items-center justify-center mx-auto text-[#A9B2C3]">
                <UtensilsCrossed className="w-7 h-7 text-[#E63946]" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-white text-base">Sin resultados</h3>
                <p className="text-xs text-[#A9B2C3]">
                  No encontramos platos o restaurantes para <span className="text-white font-bold">"{searchTerm}"</span>.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {POPULAR_SEARCH_TAGS.slice(0, 4).map((tag) => (
                  <button
                    key={tag.label}
                    onClick={() => {
                      setSearchTerm(tag.label);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 bg-[#090B12] hover:bg-[#232B3A] border border-[#232B3A] rounded-xl text-xs font-bold text-white transition cursor-pointer"
                  >
                    {tag.icon} {tag.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults.map((product) => {
                const profile = findStoreForProduct(product, profiles);
                const storeName = profile?.displayName || profile?.username || 'Restaurante';
                const rating = getProductRating(product.id);
                const isJustAdded = addedProductId === product.id;

                return (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => onSelectProduct(product)}
                    className="bg-[#111827] border border-[#232B3A] hover:border-[#E63946]/50 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 sm:gap-4 transition duration-200 cursor-pointer group shadow-md active:scale-[0.99] relative overflow-hidden"
                  >
                    {/* Left: Product Image */}
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 bg-[#090B12] border border-[#232B3A]">
                      {product.imageURL ? (
                        <img
                          src={product.imageURL}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/hero_combo.webp';
                          }}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-1">
                          <ShoppingBag className="w-6 h-6 opacity-40" />
                          <span className="text-[9px] font-mono opacity-40">Sin foto</span>
                        </div>
                      )}

                      {/* Store badge overlay on image */}
                      {profile?.photoURL && (
                        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full overflow-hidden border border-white/40 shadow-sm bg-black">
                          <img src={profile.photoURL} alt={storeName} className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>

                    {/* Middle: Name, Store, Description, Rating */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
                      <h3 className="font-extrabold text-sm sm:text-base text-white group-hover:text-[#E63946] transition truncate leading-snug">
                        {product.name}
                      </h3>

                      {/* Store name with quick jump */}
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (profile?.username) {
                            onClose();
                            onNavigateToStore(profile.username);
                          }
                        }}
                        className="text-xs text-gray-400 font-medium truncate flex items-center gap-1 hover:text-white transition w-fit"
                      >
                        <Store className="w-3 h-3 text-[#E63946] shrink-0" />
                        <span>{storeName}</span>
                      </div>

                      {/* Description */}
                      <p className="text-[11px] sm:text-xs text-[#A9B2C3] font-normal line-clamp-2 leading-tight">
                        {product.description || 'Delicioso plato preparado con los mejores ingredientes locales.'}
                      </p>

                      {/* Rating Badge */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-md border border-amber-400/20">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{rating}</span>
                        </div>
                        {product.category && (
                          <span className="text-[10px] font-bold uppercase text-gray-500 truncate hidden xs:inline">
                            • {product.category}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Price & Add Button */}
                    <div className="shrink-0 flex flex-col items-end justify-between self-stretch py-0.5 sm:py-1">
                      <span className="font-black text-sm sm:text-base text-[#E63946] font-mono">
                        ${Number(product.price).toLocaleString('es-CO')}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => handleAddClick(product, e)}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-black shadow-lg transition duration-150 cursor-pointer active:scale-90 ${
                          isJustAdded
                            ? 'bg-emerald-500 shadow-emerald-500/30'
                            : 'bg-[#E63946] hover:bg-[#D62839] shadow-[#E63946]/30 hover:scale-105'
                        }`}
                        title="Agregar directamente al pedido"
                        aria-label="Agregar al carrito"
                      >
                        {isJustAdded ? (
                          <Check className="w-5 h-5 stroke-[3] animate-bounce" />
                        ) : (
                          <Plus className="w-5 h-5 stroke-[2.5]" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Bottom Cart Bar if items exist */}
        {cartCount > 0 && onOpenCart && (
          <div className="sticky bottom-0 z-40 p-3 bg-gradient-to-t from-[#090B12] via-[#090B12]/95 to-transparent border-t border-[#232B3A]">
            <div className="max-w-4xl mx-auto">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCart();
                }}
                className="w-full bg-[#E63946] hover:bg-[#D62839] text-white font-extrabold py-3 px-4 rounded-2xl flex items-center justify-between shadow-xl shadow-[#E63946]/30 active:scale-95 transition cursor-pointer text-xs sm:text-sm uppercase tracking-wide"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">
                    {cartCount}
                  </div>
                  <span>Ver mi pedido</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span>Ir al Carrito</span>
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
