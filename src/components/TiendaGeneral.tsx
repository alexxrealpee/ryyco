/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Store, 
  ShoppingBag, 
  Search, 
  Sparkles, 
  ArrowLeft, 
  ExternalLink, 
  MessageCircle, 
  Filter, 
  Tag, 
  SlidersHorizontal,
  X,
  MapPin,
  HelpCircle,
  Clock,
  Minus,
  Plus,
  Crown,
  Gift,
  Trophy,
  Ticket,
  MoreVertical,
  Layers,
  Flame,
  User,
  LogOut,
  Bike,
  Utensils,
  ChevronLeft,
  ChevronRight,
  Film,
  Play
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { ProductItem, UserProfile, OrderItem, CustomerProfile } from '../types';
import { getVariantPrice, getProductPriceRange } from '../lib/variantHelper';
import { 
  db,
  fetchAllActiveProductsAndStores, 
  saveOrder, 
  fetchSystemSettings, 
  checkIsStoreClosed, 
  findStoreForProduct, 
  fetchCustomerProfileByPhone, 
  listenToCustomerProfile, 
  fetchProductsForStoreOnDemand, 
  logoutCustomerSession,
  sanitizeCustomerPhone,
  setActiveCustomerSession
} from '../lib/firebase';
import { cleanColombianPhone, formatColombianPhoneWith57 } from './PublicProfile';
import LinnkProLogo from './LinnkProLogo';
import CustomerPortalModal from './CustomerPortalModal';
import CustomerOrderAuthPromptModal from './CustomerOrderAuthPromptModal';
import FullScreenSearchModal from './FullScreenSearchModal';
import { MapLocationPickerModal } from './MapLocationPickerModal';
import { DeliveryAddressCard, isPickupOrInvalidAddress } from './DeliveryAddressCard';
import { RecommendationHeartButton } from './RecommendationHeartButton';
import { ProductRecommendationHeartButton } from './ProductRecommendationHeartButton';
import { ProductShareButton } from './ProductShareButton';
import { PizzaFlavorSelector } from './PizzaFlavorSelector';
import { useProgressiveStoreLoader } from '../hooks/useProgressiveStoreLoader';
import { 
  getStoredCart, 
  saveStoredCart, 
  addProductToCart, 
  updateCartQuantity, 
  removeProductFromCart, 
  clearAllCart, 
  registerProductImages, 
  getProductImage, 
  GeneralCartItem, 
  CART_UPDATED_EVENT 
} from '../lib/cartHelper';
import { isFoodCategory, isFoodProduct, orderProductBatch } from '../lib/productUtils';
export { isFoodCategory, isFoodProduct, orderProductBatch };

// --- Skeleton Screen Components (Delivery App Pattern with Subdued Shimmer & Zero CLS) ---
const ProductCardSkeleton: React.FC<{ index?: number }> = ({ index }) => {
  return (
    <div 
      aria-hidden="true"
      className="bg-[#111827] border border-[#232B3A] rounded-2xl overflow-hidden flex flex-col relative shadow-sm"
    >
      {/* Top Store Badge Skeleton */}
      <div className="absolute top-3 left-3 z-20">
        <div className="h-5 w-20 bg-[#090B12]/80 border border-[#232B3A] rounded-full overflow-hidden relative animate-shimmer" />
      </div>

      {/* Product Image Skeleton */}
      <div className="relative aspect-square w-full bg-[#090B12] overflow-hidden shrink-0 flex items-center justify-center animate-shimmer">
        <div className="w-10 h-10 rounded-2xl bg-[#111827]/80 flex items-center justify-center border border-white/5 opacity-40">
          <Utensils className="w-5 h-5 text-gray-600/50" />
        </div>
      </div>

      {/* Card Information Skeleton */}
      <div className="p-3 sm:p-4.5 flex flex-col flex-grow justify-between space-y-3 sm:space-y-4">
        <div className="space-y-2">
          {/* Category Pill Line & Action space */}
          <div className="flex items-center justify-between gap-2 min-h-[24px]">
            <div className="h-2.5 w-16 bg-[#F4B400]/20 rounded-full overflow-hidden relative animate-shimmer" />
            <div className="w-6 h-6 rounded-full bg-[#1A2234] opacity-40 shrink-0" />
          </div>
          {/* Title Line (Product Name) */}
          <div 
            className="h-4 bg-[#232B3A] rounded-md overflow-hidden relative animate-shimmer" 
            style={{ width: (index ?? 0) % 2 === 0 ? '84%' : '72%' }}
          />
          {/* Description Lines */}
          <div className="space-y-1.5 pt-0.5">
            <div className="h-2.5 w-full bg-[#1A2234] rounded overflow-hidden relative animate-shimmer" />
            <div 
              className="h-2.5 bg-[#1A2234] rounded overflow-hidden relative animate-shimmer" 
              style={{ width: (index ?? 0) % 2 === 0 ? '62%' : '76%' }}
            />
          </div>
        </div>

        {/* Price & Action Button Bar */}
        <div className="pt-2 border-t border-[#232B3A] flex items-center justify-between">
          <div className="h-4 w-16 bg-[#232B3A] rounded overflow-hidden relative animate-shimmer" />
          <div className="h-7 w-16 bg-[#E63946]/30 rounded-lg border border-[#E63946]/20 overflow-hidden relative animate-shimmer" />
        </div>
      </div>
    </div>
  );
}

function StoresSkeleton() {
  return (
    <div className="space-y-2 border-t border-[#232B3A] pt-4" aria-busy="true" aria-label="Cargando restaurantes">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-[#E63946]" />
          <span className="text-xs font-black uppercase text-white tracking-wider">Restaurantes Abiertos</span>
        </div>
      </div>
      <div 
        className="-mx-5 px-2 sm:px-3 flex items-center gap-3.5 sm:gap-5 overflow-x-auto pb-1 pt-1 hide-scrollbar select-none" 
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0" aria-hidden="true">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#111827] border-2 border-[#232B3A] p-0.5 relative overflow-hidden animate-shimmer">
              <div className="w-full h-full rounded-full bg-[#1A2234]" />
            </div>
            <div className="h-2.5 w-12 sm:w-14 bg-[#1F2937] rounded-full overflow-hidden relative animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="border-t border-[#232B3A] pt-3 space-y-2" aria-busy="true" aria-label="Cargando categorías">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-[#A9B2C3] tracking-wider px-0.5">
        <Filter className="w-3.5 h-3.5 text-[#A9B2C3]" />
        <span>Categorías:</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {[76, 110, 92, 88, 116, 96].map((w, idx) => (
          <div 
            key={idx} 
            className="h-8 rounded-xl bg-[#111827] border border-[#232B3A] shrink-0 overflow-hidden relative animate-shimmer" 
            style={{ width: `${w}px` }} 
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

interface TiendaGeneralProps {
  onNavigateHome: () => void;
  onNavigateToStore: (username: string) => void;
}

// Fast synchronous local cache retrieval for instant initial render
const getInitialGeneralData = () => {
  try {
    const rawLocal = localStorage.getItem('linnk_all_active_data_cache');
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      if (parsed && Array.isArray(parsed.products) && parsed.products.length > 0) {
        return {
          products: parsed.products as ProductItem[],
          profiles: (parsed.profiles || {}) as Record<string, UserProfile>,
          hasCache: true
        };
      }
    }

    if (typeof window !== 'undefined' && (window as any).__INITIAL_CATALOG_DATA__?.catalog) {
      const apiCatalog = (window as any).__INITIAL_CATALOG_DATA__.catalog;
      const apiStores = apiCatalog.stores || [];
      const apiProducts = apiCatalog.products || [];
      if (apiProducts.length > 0) {
        const profilesMap: Record<string, UserProfile> = {};
        apiStores.forEach((s: any) => {
          const isSuspended = s.suspended === true || s.subscriptionStatus === 'suspended' || s.subscriptionStatus === 'expired';
          const prof: UserProfile = {
            ...s,
            uid: s.uid,
            username: s.username,
            displayName: s.displayName || s.storeName || s.username || 'Restaurante',
            suspended: isSuspended,
            isClosed: isSuspended ? true : s.isClosed === true
          };
          if (prof.uid) profilesMap[prof.uid] = prof;
          if (prof.username) profilesMap[prof.username.toLowerCase()] = prof;
        });

        const formatted = apiProducts.map((p: any) => ({
          ...p,
          id: String(p.id).trim(),
          name: p.name || 'Producto',
          price: typeof p.price === 'number' && !isNaN(p.price) ? p.price : parseFloat(p.price) || 0,
          stock: typeof p.stock === 'number' ? p.stock : 99,
          active: p.active !== false
        }));

        return {
          products: formatted,
          profiles: profilesMap,
          hasCache: true
        };
      }
    }
  } catch (e) {}
  return { products: [] as ProductItem[], profiles: {} as Record<string, UserProfile>, hasCache: false };
};

export default function TiendaGeneral({ onNavigateHome, onNavigateToStore }: TiendaGeneralProps) {
  // Sistema de Carga Progresiva en React (Firebase)
  const {
    openRestaurants,
    loadedLogos,
    loadedProducts,
    profilesMap,
    stage: progressiveStage,
    firstStore,
    isLoadingMore: isProgressiveLoadingMore,
    hasMore: hasMoreProgressive,
    totalOpenCount,
    loadNextFourProducts,
    statusMessage: progressiveStatusMessage,
    isLoadingRestaurants,
    isLoadingProducts
  } = useProgressiveStoreLoader();

  // Non-blocking initial delivery brand loader indicator (400-700ms max)
  const [isInitialBrandLoader, setIsInitialBrandLoader] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialBrandLoader(false);
    }, 550);
    return () => clearTimeout(timer);
  }, []);

  const [cachedInitial] = useState(() => getInitialGeneralData());
  // Inicializar inmediatamente con productos cacheados si existen para renderizado instantáneo
  const [products, setProducts] = useState<ProductItem[]>(() => cachedInitial.products);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>(() => cachedInitial.profiles);
  const [loading, setLoading] = useState(false);
  const [loadingStoreProducts, setLoadingStoreProducts] = useState(false);
  const [loadingStoreId, setLoadingStoreId] = useState<string | null>(null);

  // Sync progressive products and store profiles as they arrive sequentially
  useEffect(() => {
    if (loadedProducts.length > 0) {
      const seen = new Set<string>();
      const deduped = loadedProducts.filter(p => {
        if (!p || !p.id || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      setProducts(deduped);
      registerProductImages(deduped);
    }
  }, [loadedProducts]);

  useEffect(() => {
    if (Object.keys(profilesMap).length > 0) {
      setProfiles(prev => ({ ...prev, ...profilesMap }));
    }
  }, [profilesMap]);

  // Direct listener for background full catalog completion
  useEffect(() => {
    const handleCatalogUpdate = (e: any) => {
      const detail = e.detail;
      const incomingProducts: ProductItem[] = 
        (Array.isArray(detail?.products) ? detail.products : detail?.catalog?.products) || [];
      if (incomingProducts.length > 0) {
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = incomingProducts.filter(p => p && p.id && !existingIds.has(p.id));
          if (newOnes.length === 0) return prev;
          const merged = [...prev, ...newOnes];
          registerProductImages(merged);
          return merged;
        });
      }
      const incomingProfiles = detail?.profiles;
      if (incomingProfiles && Object.keys(incomingProfiles).length > 0) {
        setProfiles(prev => ({ ...prev, ...incomingProfiles }));
      }
    };

    const handleStoreStatusChange = (e: any) => {
      const { uid, isClosed } = e.detail || {};
      if (uid) {
        setProfiles(prev => {
          const current = prev[uid];
          if (!current) return prev;
          return {
            ...prev,
            [uid]: { ...current, isClosed },
            ...(current.username ? { [current.username.toLowerCase()]: { ...current, isClosed } } : {})
          };
        });
      }
    };

    const handleProfileUpdate = (e: any) => {
      const updatedProfile = e.detail?.profile;
      if (updatedProfile && updatedProfile.uid) {
        setProfiles(prev => ({
          ...prev,
          [updatedProfile.uid]: updatedProfile,
          ...(updatedProfile.username ? { [updatedProfile.username.toLowerCase()]: updatedProfile } : {})
        }));
      }
    };

    window.addEventListener('linnk:catalog_updated', handleCatalogUpdate);
    window.addEventListener('linnk:store_status_changed', handleStoreStatusChange);
    window.addEventListener('ryyco_profile_updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('linnk:catalog_updated', handleCatalogUpdate);
      window.removeEventListener('linnk:store_status_changed', handleStoreStatusChange);
      window.removeEventListener('ryyco_profile_updated', handleProfileUpdate);
    };
  }, []);

  // Real-time Firestore listener for all store profiles so admin changes take effect immediately
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'profiles'), (snapshot) => {
      const updatedMap: Record<string, UserProfile> = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as UserProfile;
        const uid = data.uid || docSnap.id;
        const isSuspended = data.suspended === true || data.subscriptionStatus === 'suspended' || data.subscriptionStatus === 'expired';
        const prof: UserProfile = {
          ...data,
          uid,
          suspended: isSuspended,
          isClosed: isSuspended ? true : data.isClosed === true
        };
        updatedMap[uid] = prof;
        if (prof.username) {
          updatedMap[prof.username.toLowerCase()] = prof;
        }
      });
      setProfiles(prev => ({ ...prev, ...updatedMap }));
    }, (error) => {
      console.warn("Real-time profiles listener notice:", error);
    });

    return () => unsubscribe();
  }, []);
  
  // Filtering & search states
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullScreenSearchOpen, setIsFullScreenSearchOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStore, setSelectedStore] = useState('all');
  const [sortBy, setSortBy] = useState<'latest' | 'price_asc' | 'price_desc'>('latest');

  // Lazy Load on Demand: Cargar productos de Firebase SOLAMENTE al hacer clic en el logo del restaurante
  const handleSelectStore = useCallback(async (store: UserProfile) => {
    if (!store || !store.uid) return;

    if (selectedStore === store.uid) {
      setSelectedStore('all');
      setSelectedCategory('all');
      return;
    }

    setSelectedStore(store.uid);
    setSelectedCategory('all');
    setSearchTerm('');
    setVisibleLimit(30);

    // Asegurar que el perfil del restaurante esté registrado
    setProfiles(prev => ({
      ...prev,
      [store.uid]: store,
      ...(store.username ? { [store.username.toLowerCase()]: store } : {})
    }));

    // 1. Mostrar inmediatamente el esqueleto de los 5 primeros productos
    setLoadingStoreProducts(true);
    setLoadingStoreId(store.uid);

    try {
      // 2. Leer a Firebase solamente cuando le dé clic en el restaurante
      const freshProducts = await fetchProductsForStoreOnDemand(store, 40);

      setProducts(prev => {
        const withoutStore = prev.filter(p => p.userId !== store.uid && (!store.username || p.storeUsername !== store.username));
        const updated = [...withoutStore, ...freshProducts];
        registerProductImages(freshProducts);
        return updated;
      });
    } catch (err) {
      console.warn("Error fetching store products on demand from Firebase:", err);
    } finally {
      setLoadingStoreProducts(false);
      setLoadingStoreId(null);
    }
  }, [selectedStore]);
  
  // Quick View Modal state
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [modalImageFit, setModalImageFit] = useState<'cover' | 'contain'>('cover');

  // Cart & Order states - fully unified with Reels and LinnkPro Voice Assistant
  const [cart, setCart] = useState<GeneralCartItem[]>(() => {
    return getStoredCart();
  });

  // Real-time synchronization when cart is modified in Reels, another tab, or voice assistant
  useEffect(() => {
    const handleSync = (e?: any) => {
      try {
        const stored = e?.detail?.cart || getStoredCart();
        setCart(stored);
      } catch (err) {}
    };

    window.addEventListener(CART_UPDATED_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const [isCartOpen, setIsCartOpen] = useState(() => {
    try {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      return search.includes('cart=open') ||
        localStorage.getItem('linnkpro_open_cart') === 'true' ||
        sessionStorage.getItem('linnkpro_open_cart') === 'true';
    } catch {
      return false;
    }
  });
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(() => {
    try {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      return search.includes('cart=checkout') ||
        localStorage.getItem('linnkpro_open_checkout') === 'true' ||
        sessionStorage.getItem('linnkpro_open_checkout') === 'true';
    } catch {
      return false;
    }
  });

  // Re-check navigation flags on mount / focus to guarantee opening drawer or checkout when coming from Reels
  useEffect(() => {
    const checkNavigationFlags = () => {
      try {
        if (localStorage.getItem('linnkpro_open_cart') === 'true' || sessionStorage.getItem('linnkpro_open_cart') === 'true') {
          setIsCartOpen(true);
          localStorage.removeItem('linnkpro_open_cart');
          sessionStorage.removeItem('linnkpro_open_cart');
        }
        if (localStorage.getItem('linnkpro_open_checkout') === 'true' || sessionStorage.getItem('linnkpro_open_checkout') === 'true') {
          setIsCheckoutOpen(true);
          localStorage.removeItem('linnkpro_open_checkout');
          sessionStorage.removeItem('linnkpro_open_checkout');
        }
        if (typeof window !== 'undefined' && window.location.search.includes('cart=')) {
          const url = new URL(window.location.href);
          url.searchParams.delete('cart');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        }
      } catch {}
    };

    checkNavigationFlags();
    window.addEventListener('focus', checkNavigationFlags);
    return () => {
      window.removeEventListener('focus', checkNavigationFlags);
    };
  }, []);

  // Form fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [custAddress, setCustAddress] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ryyco_customer_delivery_address') || '';
    }
    return '';
  });
  const [pickupNotes, setPickupNotes] = useState('');
  const [custCoordinates, setCustCoordinates] = useState<{ lat: number; lng: number; mapUrl: string } | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('ryyco_customer_coordinates');
        if (raw) return JSON.parse(raw);
      } catch (e) {}
    }
    return null;
  });
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [custNotes, setCustNotes] = useState('');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [payMethod, setPayMethod] = useState<'whatsapp' | 'transfer' | 'delivery_cash'>('whatsapp');

  // Customer Loyalty & Account Modal
  const [isCustomerPortalOpen, setIsCustomerPortalOpen] = useState(false);
  const [customerPortalTab, setCustomerPortalTab] = useState<'orders' | 'wheel' | 'rewards' | 'profile'>('orders');
  const [activeCustomer, setActiveCustomer] = useState<CustomerProfile | null>(null);

  // Customer Checkout Verification Prompt State
  const [orderAuthPromptData, setOrderAuthPromptData] = useState<{
    isOpen: boolean;
    phone: string;
    isExisting: boolean;
    existingProfile: CustomerProfile | null;
  }>({
    isOpen: false,
    phone: '',
    isExisting: false,
    existingProfile: null
  });

  // Synchronize delivery address across views
  useEffect(() => {
    const handleAddressUpdate = (e: any) => {
      if (e.detail?.address) {
        setCustAddress(e.detail.address);
        if (e.detail.coordinates) {
          setCustCoordinates(e.detail.coordinates);
        }
      }
    };
    window.addEventListener('ryyco:address-updated', handleAddressUpdate);
    return () => window.removeEventListener('ryyco:address-updated', handleAddressUpdate);
  }, []);

  // Auto-load customer profile from local storage and keep synchronized in real time
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const initCustomer = (phone: string) => {
      if (unsubProfile) unsubProfile();
      unsubProfile = listenToCustomerProfile(phone, (cust) => {
        const active = localStorage.getItem('ryyco_active_customer_phone');
        if (!active || sanitizeCustomerPhone(active) !== sanitizeCustomerPhone(phone)) {
          return;
        }
        if (cust) {
          setActiveCustomer(cust);
          if (!custPhone) setCustPhone(cust.phone);
          if (!custName) setCustName(cust.name);
          if (!custAddress && cust.address && !isPickupOrInvalidAddress(cust.address)) {
            setCustAddress(cust.address);
          }
        }
      });
    };

    const savedPhone = localStorage.getItem('ryyco_active_customer_phone');
    if (savedPhone) {
      initCustomer(savedPhone);
    }

    const handleProfileUpdated = (e: any) => {
      if (e.detail === null) {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        setActiveCustomer(null);
        setCustPhone('');
        setCustName('');
        setCustAddress('');
        return;
      }
      if (e.detail) {
        setActiveCustomer(e.detail);
        if (e.detail.phone) {
          initCustomer(e.detail.phone);
        }
      }
    };
    window.addEventListener('ryyco:customer-profile-updated', handleProfileUpdated);

    // Auto-open customer portal if accessing customer routes directly
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (
        searchParams.get('portal') === 'cliente' || 
        searchParams.get('portal') === 'customer' ||
        searchParams.get('tab') === 'rewards' ||
        searchParams.get('tab') === 'orders' ||
        path.includes('mis-pedidos') ||
        path.includes('cliente') ||
        path.includes('club') ||
        hash.includes('mis-pedidos') ||
        hash.includes('cliente')
      ) {
        if (searchParams.get('tab') === 'rewards' || path.includes('club')) {
          setCustomerPortalTab('rewards');
        } else {
          setCustomerPortalTab('orders');
        }
        setIsCustomerPortalOpen(true);
      }
    } catch (e) {}

    return () => {
      if (unsubProfile) unsubProfile();
      window.removeEventListener('ryyco:customer-profile-updated', handleProfileUpdated);
    };
  }, []);
  
  // Mobile 3-Dots Menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const isMobileMenuOpenRef = useRef(isMobileMenuOpen);
  isMobileMenuOpenRef.current = isMobileMenuOpen;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (!isMobileMenuOpenRef.current) return;
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);
  
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [submittedOrders, setSubmittedOrders] = useState<OrderItem[]>([]);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [systemDeliveryFee, setSystemDeliveryFee] = useState(7000);

  const [buyQuantity, setBuyQuantity] = useState(1);
  const [chosenVariant, setChosenVariant] = useState('');
  const [chosenVariantPrice, setChosenVariantPrice] = useState<number>(0);
  const [isVariantValid, setIsVariantValid] = useState(true);

  const currentModalUnitPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    if (chosenVariantPrice > 0) return chosenVariantPrice;
    return getVariantPrice(selectedProduct, chosenVariant);
  }, [selectedProduct, chosenVariant, chosenVariantPrice]);

  // Whenever selectedProduct changes, reset chosenVariant, chosenVariantPrice and buyQuantity
  useEffect(() => {
    if (selectedProduct) {
      setBuyQuantity(1);
      setIsVariantValid(true);
      if (selectedProduct.allowsHalfAndHalf && selectedProduct.flavorsText) {
        const variants = selectedProduct.variantsText ? selectedProduct.variantsText.split(',').map(s => s.trim()) : [];
        const firstVar = variants.length > 0 ? variants[0] : '';
        setChosenVariant(firstVar);
        const initialPrice = firstVar ? getVariantPrice(selectedProduct, firstVar) : (Number(selectedProduct.price) || 0);
        setChosenVariantPrice(initialPrice);
      } else if (selectedProduct.variantsText) {
        const firstVar = selectedProduct.variantsText.split(',')[0].trim();
        setChosenVariant(firstVar);
        const initialPrice = firstVar ? getVariantPrice(selectedProduct, firstVar) : (Number(selectedProduct.price) || 0);
        setChosenVariantPrice(initialPrice);
      } else {
        setChosenVariant('');
        setChosenVariantPrice(Number(selectedProduct.price) || 0);
      }
    }
  }, [selectedProduct]);

  useEffect(() => {
    async function loadData() {
      try {
        const sysSettings = await fetchSystemSettings();
        if (sysSettings?.defaultDeliveryFee) {
          setSystemDeliveryFee(sysSettings.defaultDeliveryFee);
        }
      } catch (err) {
        console.error("Error loading system settings:", err);
      }
    }
    loadData();
  }, []);

  // Helper to normalize categories for robust matching (removes emojis and trims)
  const normalizeCat = (c?: string) => {
    if (!c) return '';
    return c.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim().toUpperCase();
  };

  const matchesCategoryFilter = (prodCat?: string, filterCat?: string) => {
    if (!filterCat || filterCat === 'all' || filterCat === 'Todos') return true;
    if (!prodCat) return false;
    const pNorm = prodCat.trim().toUpperCase();
    const fNorm = filterCat.trim().toUpperCase();
    if (pNorm === fNorm) return true;
    const pClean = normalizeCat(prodCat);
    const fClean = normalizeCat(filterCat);
    return pClean.length > 0 && pClean === fClean;
  };

  // Base list of currently active products from open, non-suspended stores (and matching selectedStore if filtered)
  const availableBaseProducts = useMemo(() => {
    return products.filter(product => {
      const profile = findStoreForProduct(product, profiles);
      if (!profile || checkIsStoreClosed(profile) || profile.suspended) return false;
      // Check if trial has expired and store subscription is not active
      if (profile.subscriptionTrialExpires && new Date(profile.subscriptionTrialExpires).getTime() < Date.now() && profile.subscriptionStatus !== 'active') {
        return false;
      }
      if (selectedStore !== 'all' && product.userId !== selectedStore && profile.uid !== selectedStore) {
        return false;
      }
      return true;
    });
  }, [products, profiles, selectedStore]);

  // Get list of unique categories ONLY from products that actually exist and are available (food categories first)
  // If a category has no available products, it will NOT be displayed!
  const categories = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();

    availableBaseProducts.forEach(p => {
      if (p.category && p.category.trim()) {
        const original = p.category.trim();
        const key = normalizeCat(original) || original.toUpperCase();
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { label: original, count: 1 });
        }
      }
    });

    // Only keep categories that have at least 1 product
    const validCategories = Array.from(map.values())
      .filter(item => item.count > 0)
      .map(item => item.label);

    const foodList = validCategories.filter(c => isFoodCategory(c)).sort((a, b) => a.localeCompare(b));
    const nonFoodList = validCategories.filter(c => !isFoodCategory(c)).sort((a, b) => a.localeCompare(b));

    return ['all', ...foodList, ...nonFoodList];
  }, [availableBaseProducts]);

  // Auto-reset category filter if currently selected category has no products in the active view
  useEffect(() => {
    if (selectedCategory !== 'all') {
      const hasProducts = availableBaseProducts.some(p => matchesCategoryFilter(p.category, selectedCategory));
      if (!hasProducts) {
        setSelectedCategory('all');
      }
    }
  }, [availableBaseProducts]);

  // Get list of unique store profiles with active products (memoized)
  // STRICT REQUIREMENT: Only stores that are currently OPEN (isClosed !== true, !suspended, !checkIsStoreClosed) are displayed.
  const uniqueStores = useMemo(() => {
    const storeMap = new Map<string, UserProfile>();

    // 1. Prioritize loadedLogos in order, but ALWAYS check latest status from profiles state
    loadedLogos.forEach(s => {
      if (!s) return;
      const uid = s.uid;
      const uname = s.username?.toLowerCase();
      const key = uid || uname;
      if (!key || storeMap.has(key)) return;

      // Always resolve latest state from profiles state
      const current = (uid && profiles[uid]) || (uname && profiles[uname]) || s;

      // Strict open/closed validation: MUST NOT be closed and MUST NOT be suspended
      if (!checkIsStoreClosed(current) && !current.suspended && current.isClosed !== true) {
        storeMap.set(key, current);
      }
    });

    // 2. Complement with any other open stores from profiles
    (Object.values(profiles) as UserProfile[]).forEach(profile => {
      if (!profile) return;
      const uid = profile.uid;
      const uname = profile.username?.toLowerCase();
      const key = uid || uname;
      if (!key || storeMap.has(key)) return;

      if (!checkIsStoreClosed(profile) && !profile.suspended && profile.isClosed !== true) {
        // If products are loaded, verify the store has matching active products (or show open store)
        const hasProducts = products.length === 0 || products.some(p => (uid && p.userId === uid) || (uname && p.storeUsername?.toLowerCase() === uname));
        if (hasProducts) {
          storeMap.set(key, profile);
        }
      }
    });

    return Array.from(storeMap.values());
  }, [profiles, products, loadedLogos]);

  // Real-time loading states tied strictly to actual Firebase data presence (no fake delays)
  const isRestaurantsLoading = uniqueStores.length === 0 && (isLoadingRestaurants || progressiveStage === 'fetching_open_restaurants');
  const isProductsLoading = products.length === 0 && (isLoadingProducts || progressiveStage !== 'idle');
  const isCategoriesLoading = isProductsLoading && categories.length <= 1;

  // Pre-load top restaurant logos and the first 6 products into browser cache for instant rendering
  useEffect(() => {
    if (uniqueStores.length === 0 && products.length === 0) return;

    // Preload top store logos
    uniqueStores.slice(0, 10).forEach(s => {
      if (s.photoURL) {
        const img = new Image();
        img.decoding = "async";
        img.src = s.photoURL;
      }
    });

    // Preload the first 6 products
    products.slice(0, 6).forEach(p => {
      if (p.imageURL) {
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        img.decoding = "async";
        img.src = p.imageURL;
      }
    });
  }, [uniqueStores, products]);

  // Auto-scroll store carousel smoothly across both PC and mobile (oscillates automatically right and left)
  const storesScrollRef = useRef<HTMLDivElement>(null);
  const isStoresUserInteractingRef = useRef<boolean>(false);
  const storesResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDraggingStoresRef = useRef<boolean>(false);
  const hasMovedStoresRef = useRef<boolean>(false);
  const startXStoresRef = useRef<number>(0);
  const startScrollLeftStoresRef = useRef<number>(0);
  const isHoveringStoresRef = useRef<boolean>(false);
  const scrollDirectionRef = useRef<1 | -1>(1); // 1 = moving to the right, -1 = moving to the left
  const nextDirectionSwitchTimeRef = useRef<number>(0);
  const turnPauseUntilRef = useRef<number>(0);

  // Manual scroll handler for PC navigation buttons (< and >)
  const scrollStores = (direction: 'left' | 'right') => {
    const container = storesScrollRef.current;
    if (!container) return;
    const offset = direction === 'left' ? -280 : 280;
    container.scrollBy({ left: offset, behavior: 'smooth' });

    // Align automatic scroll direction with the clicked button
    scrollDirectionRef.current = direction === 'left' ? -1 : 1;
    nextDirectionSwitchTimeRef.current = performance.now() + 12000;

    isStoresUserInteractingRef.current = true;
    if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
    storesResumeTimeoutRef.current = setTimeout(() => {
      isStoresUserInteractingRef.current = false;
    }, 2200);
  };

  useEffect(() => {
    const container = storesScrollRef.current;
    if (!container || uniqueStores.length === 0) return;

    let animationFrameId: number;
    let lastTime = performance.now();
    nextDirectionSwitchTimeRef.current = performance.now() + 10000; // First switch in 10 seconds

    const scrollLoop = (currentTime: number) => {
      const delta = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;

      const isInteracting = isStoresUserInteractingRef.current || isDraggingStoresRef.current;
      const isPausedForTurn = currentTime < turnPauseUntilRef.current;
      const maxScroll = container.scrollWidth - container.clientWidth;

      if (!isInteracting && maxScroll > 8) {
        // Automatic periodic direction switch (both to the right and to the left)
        if (currentTime >= nextDirectionSwitchTimeRef.current && !isPausedForTurn) {
          scrollDirectionRef.current = scrollDirectionRef.current === 1 ? -1 : 1;
          turnPauseUntilRef.current = currentTime + 1200; // Gentle 1.2s pause at turning points
          nextDirectionSwitchTimeRef.current = currentTime + 12000; // Next turn in 12s
        }

        // Boundary turning points
        if (container.scrollLeft >= maxScroll - 4 && scrollDirectionRef.current === 1) {
          scrollDirectionRef.current = -1;
          turnPauseUntilRef.current = currentTime + 1200;
          nextDirectionSwitchTimeRef.current = currentTime + 12000;
        } else if (container.scrollLeft <= 4 && scrollDirectionRef.current === -1) {
          scrollDirectionRef.current = 1;
          turnPauseUntilRef.current = currentTime + 1200;
          nextDirectionSwitchTimeRef.current = currentTime + 12000;
        }

        // Apply smooth motion if not paused for turn
        if (currentTime >= turnPauseUntilRef.current) {
          // Smooth auto-scroll speed (~26px/s, gently slowed to ~6px/s on PC hover for easy clicking)
          const speedMultiplier = isHoveringStoresRef.current ? 0.22 : 1.0;
          const scrollIncrement = 0.026 * delta * speedMultiplier * scrollDirectionRef.current;
          container.scrollLeft += scrollIncrement;
        }
      }

      animationFrameId = requestAnimationFrame(scrollLoop);
    };

    animationFrameId = requestAnimationFrame(scrollLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (storesResumeTimeoutRef.current) {
        clearTimeout(storesResumeTimeoutRef.current);
      }
    };
  }, [uniqueStores]);

  // Filter & sort logic (food products prioritized first)
  const filteredProducts = useMemo(() => {
    const matched = availableBaseProducts.filter(product => {
      const profile = findStoreForProduct(product, profiles);

      const matchesSearch = 
        !searchTerm.trim() ||
        (product.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (profile?.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (profile?.username || '').toLowerCase().includes(searchTerm.toLowerCase());
        
      const matchesCategory = matchesCategoryFilter(product.category, selectedCategory);

      return matchesSearch && matchesCategory;
    });

    if (sortBy === 'price_asc') {
      return [...matched].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      return [...matched].sort((a, b) => b.price - a.price);
    }

    // Default 'latest': Preserve the exact sequential arrival order of the 4-by-4 batches!
    // Each batch was already ordered when retrieved. Preserving this sequence ensures products
    // already rendered on screen NEVER jump, shift, or get desorganized when new products load.
    return matched;
  }, [availableBaseProducts, profiles, searchTerm, selectedCategory, sortBy]);

  // Smart progressive loading visibleLimit (12 productos iniciales para cubrir la cuadrícula en móviles y PC)
  const [visibleLimit, setVisibleLimit] = useState(12);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isFetchingNextBatchRef = useRef(false);

  // Reset limit when filter/search/sort changes (show full store products when store is selected)
  useEffect(() => {
    setVisibleLimit(selectedStore !== 'all' ? 30 : 12);
  }, [searchTerm, selectedCategory, selectedStore, sortBy]);

  // Unified function to load the next batch of 4 products in order
  const loadNextBatchOfFour = useCallback(async () => {
    if (isFetchingNextBatchRef.current || isProgressiveLoadingMore) return;

    // 1. If we already have loaded products in memory beyond visibleLimit, reveal next 4
    if (visibleLimit < filteredProducts.length) {
      setVisibleLimit(prev => Math.min(prev + 4, filteredProducts.length));
      // If reaching near the end of buffered products, prefetch the next batch
      if (hasMoreProgressive && visibleLimit + 6 >= filteredProducts.length) {
        loadNextFourProducts();
      }
      return;
    }

    // 2. Otherwise, fetch the next 4 products (from memory cache, API or Firebase)
    if (hasMoreProgressive) {
      isFetchingNextBatchRef.current = true;
      setIsLoadingMore(true);
      try {
        const fresh = await loadNextFourProducts();
        if (fresh && fresh.length > 0) {
          setVisibleLimit(prev => prev + fresh.length);
        }
      } catch (err) {
        console.warn("Error loading next batch of 4:", err);
      } finally {
        setIsLoadingMore(false);
        isFetchingNextBatchRef.current = false;
      }
    }
  }, [visibleLimit, filteredProducts.length, hasMoreProgressive, isProgressiveLoadingMore, loadNextFourProducts]);

  // Coordinated scroll listener: loads next 4 products when scrolling near bottom
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      window.requestAnimationFrame(() => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const windowHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const docHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        );

        // Trigger when within 650px of page bottom for seamless smooth continuous scrolling
        if (scrollTop + windowHeight >= docHeight - 650) {
          if (!isFetchingNextBatchRef.current && !isProgressiveLoadingMore) {
            loadNextBatchOfFour();
          }
        }
        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadNextBatchOfFour, isProgressiveLoadingMore]);

  const handleLoadMoreFour = () => {
    loadNextBatchOfFour();
  };

  const displayedProducts = useMemo(() => {
    const sliced = filteredProducts.slice(0, visibleLimit);
    const seen = new Set<string>();
    return sliced.filter(p => {
      if (!p || !p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [filteredProducts, visibleLimit]);

  const handleAddToCart = () => {
    if (!selectedProduct) return;
    if (selectedProduct.allowsHalfAndHalf && selectedProduct.flavorsText && !isVariantValid) {
      alert("Por favor completa la selección de sabores para tu pedido antes de continuar.");
      return;
    }

    const prof = findStoreForProduct(selectedProduct, profiles);
    const img = selectedProduct.imageURL || getProductImage(selectedProduct.id);
    const validProdId = (selectedProduct.id && String(selectedProduct.id).trim() && String(selectedProduct.id).trim() !== 'undefined')
      ? String(selectedProduct.id).trim()
      : `prod_${String(prof?.uid || selectedProduct.userId || 'store')}_${encodeURIComponent((selectedProduct.name || 'dish').trim().toLowerCase().replace(/\s+/g, '_'))}`;

    const effectiveUnitPrice = (currentModalUnitPrice && currentModalUnitPrice > 0)
      ? currentModalUnitPrice
      : getVariantPrice(selectedProduct, chosenVariant);

    const prodToSave: ProductItem = {
      ...selectedProduct,
      price: effectiveUnitPrice > 0 ? effectiveUnitPrice : (Number(selectedProduct.price) || 0),
      id: validProdId,
      imageURL: img,
      userId: prof?.uid || selectedProduct.userId || '',
      storeName: prof?.displayName || selectedProduct.storeName || (prof?.username ? `@${prof.username}` : 'Restaurante'),
      storeUsername: prof?.username || selectedProduct.storeUsername || ''
    };

    if (img) registerProductImages([prodToSave]);

    const updated = addProductToCart(prodToSave, buyQuantity, chosenVariant || undefined);
    setCart(updated);
    setSelectedProduct(null);
    setIsCartOpen(true);
  };

  const handleAddToCartDirect = (product: ProductItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // If the product allows half-and-half or has multiple variants, open detail modal to customize!
    if ((product.allowsHalfAndHalf && product.flavorsText) || (product.variantsText && product.variantsText.includes(','))) {
      setSelectedProduct(product);
      return;
    }
    const prof = findStoreForProduct(product, profiles);
    const img = product.imageURL || getProductImage(product.id);
    const validProdId = (product.id && String(product.id).trim() && String(product.id).trim() !== 'undefined')
      ? String(product.id).trim()
      : `prod_${String(prof?.uid || product.userId || 'store')}_${encodeURIComponent((product.name || 'dish').trim().toLowerCase().replace(/\s+/g, '_'))}`;

    const firstVariant = product.variantsText ? product.variantsText.split(',')[0].trim() : undefined;
    const unitPrice = firstVariant ? getVariantPrice(product, firstVariant) : (Number(product.price) || 0);

    const prodToSave: ProductItem = {
      ...product,
      price: unitPrice > 0 ? unitPrice : (Number(product.price) || 0),
      id: validProdId,
      imageURL: img,
      userId: prof?.uid || product.userId || '',
      storeName: prof?.displayName || product.storeName || (prof?.username ? `@${prof.username}` : 'Restaurante'),
      storeUsername: prof?.username || product.storeUsername || ''
    };

    if (img) registerProductImages([prodToSave]);

    const updated = addProductToCart(prodToSave, 1, firstVariant);
    setCart(updated);
  };

  const handleSetItemQuantity = (cartItemId: string, change: number) => {
    const item = cart.find(i => i.id === cartItemId || i.product.id === cartItemId);
    if (!item) return;
    const nextVal = item.quantity + change;
    const updated = updateCartQuantity(cartItemId, nextVal);
    setCart(updated);
  };

  const handleRemoveFromCart = (cartItemId: string) => {
    const updated = removeProductFromCart(cartItemId);
    setCart(updated);
  };

  const executePlaceOrder = async (customer: CustomerProfile) => {
    setOrderSubmitting(true);

    // Group cart items by merchant userId
    const itemsBySeller: Record<string, typeof cart> = {};
    cart.forEach(item => {
      const sellerProfile = profiles[item.product.userId] || findStoreForProduct(item.product, profiles);
      const sellerId = sellerProfile?.uid || item.product.userId || 'default_seller';
      if (!itemsBySeller[sellerId]) {
        itemsBySeller[sellerId] = [];
      }
      itemsBySeller[sellerId].push(item);
    });

    const created: OrderItem[] = [];

    try {
      for (const [sellerId, sellerCart] of Object.entries(itemsBySeller)) {
        const subtotal = sellerCart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        const deliveryFee = deliveryType === 'pickup' ? 0 : systemDeliveryFee;
        const totalSum = subtotal + deliveryFee;
        const rNo = Math.floor(1000 + Math.random() * 9000);

        const sellerProfile = profiles[sellerId] || findStoreForProduct(sellerCart[0]?.product, profiles);
        const sellerStoreName = sellerProfile?.displayName || sellerCart[0]?.product.storeName || sellerProfile?.username || 'Tienda en la plataforma';
        const sellerAddress = sellerProfile?.address || sellerProfile?.location || 'Dirección de la Tienda';
        const sellerPhone = sellerProfile?.whatsapp || sellerProfile?.phone;
        const formattedPhone = formatColombianPhoneWith57(customer.phone || custPhone);
        const finalAddress = deliveryType === 'pickup' 
          ? (pickupNotes.trim() ? `Recoger en Restaurante / Local (Nota: ${pickupNotes.trim()})` : 'Recoger en Restaurante / Local')
          : custAddress.trim();

        const newOrder: OrderItem = {
          id: `order_${Date.now()}_${sellerId}`,
          storeOwnerId: sellerProfile?.uid || sellerId,
          storeName: sellerStoreName,
          storeAddress: sellerAddress,
          storePhone: sellerPhone,
          orderNumber: rNo,
          customerName: customer.name || custName.trim(),
          customerPhone: formattedPhone,
          customerAddress: finalAddress,
          customerMapUrl: custCoordinates?.mapUrl || (custAddress.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(custAddress.trim())}` : undefined),
          customerLat: custCoordinates?.lat,
          customerLng: custCoordinates?.lng,
          items: sellerCart.map(item => {
            const prod = item?.product || (item as any) || {};
            return {
              productId: prod.id || (item as any)?.productId || item.id || '',
              name: prod.name || (item as any)?.name || 'Producto',
              price: typeof prod.price === 'number' ? prod.price : (parseFloat((prod as any).price) || 0),
              quantity: item.quantity || 1,
              selectedVariant: item.selectedVariant || undefined
            };
          }),
          totalAmount: totalSum,
          deliveryFee: deliveryFee,
          orderType: deliveryType === 'pickup' ? 'pickup' : 'delivery',
          paymentMethod: payMethod === 'whatsapp' ? 'whatsapp' : payMethod === 'transfer' ? 'transfer' : 'delivery_cash',
          notes: custNotes.trim() || undefined,
          status: 'pending',
          createdAt: new Date().toISOString()
        };

        const saved = await saveOrder(newOrder);
        created.push(saved);
      }

      setSubmittedOrders(created);
      clearAllCart();
      setCart([]);
      setIsCartOpen(false);
      setIsCheckoutOpen(false);
      setOrderAuthPromptData(prev => ({ ...prev, isOpen: false }));
      setIsSuccessOpen(true);
    } catch (err) {
      console.error(err);
      alert("Ocurrió un error al registrar el pedido. Intenta nuevamente.");
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleAuthPromptSuccess = async (authenticatedCustomer: CustomerProfile) => {
    setActiveCustomer(authenticatedCustomer);
    setActiveCustomerSession(authenticatedCustomer);
    setCustName(authenticatedCustomer.name);
    setCustPhone(authenticatedCustomer.phone);
    if (authenticatedCustomer.address && !isPickupOrInvalidAddress(authenticatedCustomer.address) && !custAddress) {
      setCustAddress(authenticatedCustomer.address);
    }
    setOrderAuthPromptData(prev => ({ ...prev, isOpen: false }));
    // Automatically continue and execute the order without requiring the user to repeat or re-enter anything
    await executePlaceOrder(authenticatedCustomer);
  };

  const handlePlaceOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    
    const cleanedPhone = cleanColombianPhone(custPhone);
    if (!custName.trim() || (deliveryType === 'delivery' && !custAddress.trim())) {
      alert("Por favor, completa todos los campos requeridos (*)");
      return;
    }

    if (cleanedPhone.length !== 10) {
      setPhoneError("Ingrese un número de celular colombiano válido.");
      return;
    }
    setPhoneError("");

    // Check if the user is already authenticated with a verified session matching this phone
    const isCustomerVerified = activeCustomer && sanitizeCustomerPhone(activeCustomer.phone) === sanitizeCustomerPhone(cleanedPhone);

    if (!isCustomerVerified) {
      setOrderSubmitting(true);
      try {
        const existing = await fetchCustomerProfileByPhone(cleanedPhone);
        setOrderAuthPromptData({
          isOpen: true,
          phone: cleanedPhone,
          isExisting: !!existing,
          existingProfile: existing
        });
      } catch (err) {
        console.warn("Could not check customer profile:", err);
        setOrderAuthPromptData({
          isOpen: true,
          phone: cleanedPhone,
          isExisting: false,
          existingProfile: null
        });
      } finally {
        setOrderSubmitting(false);
      }
      return;
    }

    // Customer is already logged in, proceed directly with placing the order
    await executePlaceOrder(activeCustomer);
  };

  const triggerShopperWhatsAppMessage = (order: OrderItem) => {
    const profile = profiles[order.storeOwnerId];
    if (!profile) return;

    const isPickup = order.orderType === 'pickup' || order.deliveryFee === 0;

    let msg = `🛍️ *PEDIDO NUEVO #${order.orderNumber}* de *${order.customerName}*\n`;
    msg += `-----------------------------\n`;
    order.items.forEach(item => {
      const vText = item.selectedVariant ? ` (${item.selectedVariant})` : '';
      msg += `• ${item.quantity} x ${item.name}${vText} - ${profile.currency || '$'}${item.price.toLocaleString()}\n`;
    });
    msg += `-----------------------------\n`;
    const subtotalVal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const feeVal = order.deliveryFee ?? (isPickup ? 0 : systemDeliveryFee);
    msg += `Subtotal: ${profile.currency || '$'}${subtotalVal.toLocaleString()}\n`;
    msg += `Tipo de Entrega: *${isPickup ? '🛍️ Recoger en Restaurante / Local (Sin costo de envío)' : '🛵 Envío a Domicilio'}*\n`;
    if (!isPickup) {
      msg += `Domicilio: ${profile.currency || '$'}${feeVal.toLocaleString('es-CO')}\n`;
    } else {
      msg += `Domicilio: *$0 (Recoger en Restaurante)*\n`;
    }
    msg += `Total: *${profile.currency || '$'}${order.totalAmount.toLocaleString()}*\n\n`;
    msg += `📞 Contacto: ${order.customerPhone}\n`;
    msg += `📍 ${isPickup ? 'Entrega' : 'Despacho'}: ${order.customerAddress}\n`;
    if (!isPickup && order.customerMapUrl) {
      msg += `🗺️ Google Maps: ${order.customerMapUrl}\n`;
    }
    if (order.notes) msg += `✍️ Notas: ${order.notes}\n\n`;
    msg += `Método de pago: *${order.paymentMethod === 'whatsapp' ? 'WhatsApp Directo' : order.paymentMethod === 'transfer' ? 'Transferencia Bancaria' : 'Pago contra Entrega'}*\n\n`;
    msg += `¡Espero confirmación para continuar con el ${isPickup ? 'pedido para recoger' : 'pago/envío'}!\n\n`;

    const baseUrl = typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('run.app')
      ? window.location.origin
      : 'https://ryyco.com';
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const storeRatingUrl = profile.username ? `${cleanBaseUrl}/${profile.username.replace(/^\//, '')}` : `${cleanBaseUrl}/tienda`;
    const ryycoHomeUrl = `${cleanBaseUrl}/`;
    const storeDisplayName = (profile.displayName || profile.storeName || (profile.username ? `@${profile.username}` : 'el restaurante')).trim();

    msg += `-----------------------------\n`;
    msg += `🍔 *¿NECESITA AYUDA?*\n`;
    msg += `💬 Soporte RYYCO: https://wa.me/573106502043\n\n`;
    msg += `⭐ *Califique su experiencia en ${storeDisplayName}:*\n`;
    msg += `${storeRatingUrl}\n\n`;
    msg += `🍽️ *¡Siga disfrutando RYYCO!*\n\n`;
    msg += `Regrese a nuestra plataforma\n`;
    msg += `${ryycoHomeUrl}\n\n`;
    msg += `¡Gracias por pedir con RYYCO! ❤️💛`;

    const cleanMsg = encodeURIComponent(msg);
    const targetPhone = profile.customerServiceWhatsapp || profile.whatsapp || profile.ownerWhatsapp || profile.phone || '';
    let cleanedWhatsapp = targetPhone.replace(/[^0-9]/g, '');

    if (cleanedWhatsapp.length === 10 && cleanedWhatsapp.startsWith('3')) {
      cleanedWhatsapp = '57' + cleanedWhatsapp;
    }

    window.open(`https://wa.me/${cleanedWhatsapp || '573000000000'}?text=${cleanMsg}`, '_blank');
  };

  return (
    <div className="bg-[#090B12] min-h-screen font-sans text-[#A9B2C3] flex flex-col selection:bg-[#E63946] selection:text-white">
      
      {/* 1. Navbar */}
      <header className="border-b border-[#232B3A] backdrop-blur-md sticky top-0 z-40 bg-[#090B12]/95 relative">
        {/* Subtle initial delivery brand loader hairline (400-700ms max, non-blocking) */}
        {isInitialBrandLoader && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#111827] overflow-hidden pointer-events-none z-50" aria-hidden="true">
            <div className="h-full bg-gradient-to-r from-transparent via-[#E63946] to-[#F4B400] w-full animate-shimmer" />
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-3 sm:py-3.5 flex items-center justify-between min-h-[64px] gap-2">
          {/* Left: 3-Dots Menu Dropdown Button */}
          <div className="flex-1 flex items-center justify-start z-30 min-w-0">
            <div className="relative" ref={mobileMenuRef}>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className={`p-2.5 bg-[#111827] hover:bg-[#232B3A] border transition rounded-xl flex items-center justify-center cursor-pointer ${
                  isMobileMenuOpen ? 'border-amber-400 text-amber-400 bg-[#232B3A]' : 'border-[#232B3A] text-white hover:border-gray-600'
                }`}
                title="Menú de Opciones"
                aria-label="Menú de opciones"
              >
                <MoreVertical className="w-4.5 h-4.5" />
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {isMobileMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-2 w-72 bg-[#111827] border border-[#232B3A] rounded-2xl shadow-2xl overflow-hidden z-50 p-2 space-y-1.5"
                  >
                    {/* Customer Session Card (Mobile) */}
                    {activeCustomer ? (
                      <div className="p-2.5 mb-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                              <User className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-white truncate">{activeCustomer.name}</p>
                              <p className="text-[10px] text-gray-400 font-mono">{activeCustomer.phone}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-mono">
                            {(activeCustomer.points || 0).toLocaleString('es-CO')} R
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsMobileMenuOpen(false);
                              setCustomerPortalTab('profile');
                              setIsCustomerPortalOpen(true);
                            }}
                            className="py-1.5 px-2 bg-slate-700/60 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold text-center transition"
                          >
                            Mi Cuenta
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setIsMobileMenuOpen(false);
                              await logoutCustomerSession();
                            }}
                            className="py-1.5 px-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-lg text-[10px] font-bold text-center flex items-center justify-center gap-1 transition"
                          >
                            <LogOut className="w-3 h-3 text-red-400" />
                            Cerrar Sesión
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          setCustomerPortalTab('orders');
                          setIsCustomerPortalOpen(true);
                        }}
                        className="w-full text-left p-2.5 mb-1 rounded-xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/40 hover:border-emerald-400 transition cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <User className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div>
                            <span className="text-xs font-black text-white group-hover:text-emerald-300 transition block">
                              Ingresar como Cliente
                            </span>
                            <span className="text-[10px] text-emerald-400 font-bold block">
                              +1.000 RYYCOS ($1.000 COP) Gratis
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-black">
                          Entrar
                        </span>
                      </button>
                    )}

                    {/* Item 1: Mis Pedidos */}
                    <button
                      id="drawer-my-orders-btn"
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setCustomerPortalTab('orders');
                        setIsCustomerPortalOpen(true);
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-[#1A2234] border border-transparent hover:border-[#232B3A] transition cursor-pointer flex items-center gap-3 text-white group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-[#E63946]/15 border border-[#E63946]/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <ShoppingBag className="w-4 h-4 text-[#E63946]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white block group-hover:text-[#E63946] transition">
                          Mis Pedidos
                        </span>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Rastreo y estado de tus compras en vivo
                        </p>
                      </div>
                    </button>

                    {/* Item 2: Mis RYYCOS & Ruleta */}
                    <button
                      id="drawer-my-points-btn"
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setCustomerPortalTab('rewards');
                        setIsCustomerPortalOpen(true);
                      }}
                      className="w-full text-left p-2.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 hover:from-amber-500/25 hover:to-orange-500/20 border border-amber-500/30 transition cursor-pointer flex items-center gap-3 text-white group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <Crown className="w-4 h-4 text-amber-400 animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-amber-300 text-xs block">
                            Mis RYYCOS
                          </span>
                          <span className="text-[9px] font-black uppercase bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-md">
                            Billetera
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-300 font-medium leading-tight">
                          Billetera $ COP, transferencias y canjes
                        </p>
                      </div>
                    </button>

                    {/* Ruleta de Premios */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setCustomerPortalTab('wheel');
                        setIsCustomerPortalOpen(true);
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-[#1A2234] transition cursor-pointer flex items-center gap-3 text-white group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-[#E63946]/15 border border-[#E63946]/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <Gift className="w-4 h-4 text-[#E63946]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white block group-hover:text-[#E63946] transition">
                          Ruleta de Premios
                        </span>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Gira y gana platos gratis con tus compras
                        </p>
                      </div>
                    </button>

                    {/* Reels / Historias */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        window.history.pushState({}, '', '/carruselproduc');
                        window.dispatchEvent(new Event('popstate'));
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-[#1A2234] transition cursor-pointer flex items-center gap-3 text-white group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#E63946] to-[#F4B400] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-md">
                        <Flame className="w-4 h-4 text-white fill-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white block group-hover:text-[#F4B400] transition">
                          Reels de Comida
                        </span>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Ver platos y menús en formato video / reels
                        </p>
                      </div>
                    </button>

                    {/* Ingresar Mi Restaurante */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        window.history.pushState({}, '', '/landing');
                        window.dispatchEvent(new Event('popstate'));
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-[#1A2234] transition cursor-pointer flex items-center gap-3 text-white group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <Store className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white block group-hover:text-emerald-300 transition">
                          Ingresar Mi Restaurante
                        </span>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Publica tus productos y vende online
                        </p>
                      </div>
                    </button>

                    {/* Acceso Vendedores / Iniciar Sesión */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        localStorage.setItem('ryyco_auth_mode', 'seller');
                        window.history.pushState({}, '', '/login');
                        window.dispatchEvent(new Event('popstate'));
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-[#1A2234] transition cursor-pointer flex items-center gap-3 text-white group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <User className="w-4 h-4 text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white block group-hover:text-indigo-300 transition">
                          Acceso Vendedores (Login)
                        </span>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Ingresar a la administración de tu tienda
                        </p>
                      </div>
                    </button>

                    {/* Acceso Domiciliario (Login) */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        localStorage.setItem('ryyco_auth_mode', 'driver');
                        window.history.pushState({}, '', '/domiciliario');
                        window.dispatchEvent(new Event('popstate'));
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-[#1A2234] transition cursor-pointer flex items-center gap-3 text-white group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <Bike className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white block group-hover:text-amber-300 transition">
                          Acceso Domiciliario (Login)
                        </span>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Ingreso y portal para repartidores
                        </p>
                      </div>
                    </button>

                    {/* Centro de Ayuda */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onNavigateHome();
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-[#1A2234] transition cursor-pointer flex items-center gap-3 text-white group border-t border-[#232B3A] pt-2 mt-1"
                    >
                      <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <HelpCircle className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white block group-hover:text-blue-300 transition">
                          Centro de Ayuda / Soporte
                        </span>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Atención y soporte por WhatsApp
                        </p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Center: Centered Logo with Dedicated Protected Clearance */}
          <div className={`flex items-center justify-center shrink-0 px-2 z-20 transition-transform duration-500 ${isInitialBrandLoader ? 'scale-[1.03]' : 'scale-100'}`}>
            <LinnkProLogo 
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('all');
                setSelectedStore('all');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                onNavigateHome();
              }} 
              height={40}
              imgClassName="h-7 sm:h-[38px] md:h-[42px]"
            />
          </div>

          {/* Right: Action Buttons */}
          <div className="flex-1 flex items-center justify-end gap-1.5 sm:gap-2.5 z-10 min-w-0">
            {/* Customer Session Status (Desktop) */}
            {activeCustomer ? (
              <div className="hidden lg:flex items-center gap-1.5 bg-[#111827] border border-slate-700/80 rounded-xl p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => { setCustomerPortalTab('profile'); setIsCustomerPortalOpen(true); }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-800 text-xs font-bold text-white transition cursor-pointer"
                  title="Mi cuenta de cliente"
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">
                    {activeCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="max-w-[90px] truncate">{activeCustomer.name.split(' ')[0]}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await logoutCustomerSession();
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                  title="Cerrar sesión de cliente"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setCustomerPortalTab('orders'); setIsCustomerPortalOpen(true); }}
                className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111827] hover:bg-[#1A2234] border border-[#232B3A] text-gray-200 hover:text-white font-extrabold text-xs transition cursor-pointer shrink-0"
                title="Ingresar como cliente"
              >
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Ingresar</span>
              </button>
            )}

            {/* Mis Pedidos Button (Desktop & Tablet) */}
            <button 
              id="navbar-my-orders-btn"
              onClick={() => { setCustomerPortalTab('orders'); setIsCustomerPortalOpen(true); }}
              className="hidden md:flex px-3 py-2 rounded-xl bg-[#111827] hover:bg-[#1A2234] border border-[#232B3A] hover:border-gray-600 text-gray-200 hover:text-white font-extrabold text-xs items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              title="Ver y rastrear el estado de mis pedidos en tiempo real"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#E63946]" />
              <span>Mis Pedidos</span>
            </button>

            {/* Mis RYYCOS Button (Desktop & Tablet) */}
            <button 
              id="navbar-my-points-btn"
              onClick={() => { setCustomerPortalTab('rewards'); setIsCustomerPortalOpen(true); }}
              className="hidden sm:flex px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 text-amber-300 font-extrabold text-xs items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              title="Mis RYYCOS acumulados, Billetera y Transferencias"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>Mis RYYCOS</span>
            </button>

            {/* Dynamic Cart Button in Navbar */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 bg-[#111827] hover:bg-[#232B3A] border border-[#232B3A] rounded-xl text-white hover:border-[#E63946] transition cursor-pointer flex items-center gap-1.5 shrink-0"
              title="Ver mi carrito de compras"
            >
              <ShoppingBag className="w-4.5 h-4.5 stroke-[2] text-white" />
              {cart.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#E63946] text-white font-black text-[9px] w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>

            {/* Ingresar Mi Restaurante Button */}
            <button 
              onClick={() => {
                window.history.pushState({}, '', '/landing');
                window.dispatchEvent(new Event('popstate'));
              }}
              className="hidden xl:inline-flex items-center bg-[#E63946] hover:bg-[#D62839] text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition duration-150 uppercase tracking-wider cursor-pointer shadow-md whitespace-nowrap shrink-0"
            >
              Ingresar Mi Restaurante
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section removed as requested */}

      {/* 3. Filtering & Dashboard Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 md:px-8 pt-2 pb-10 space-y-8">
        
        {/* Filter bar card */}
        <div className="bg-[#111827] border border-[#232B3A] p-5 rounded-3xl space-y-5 shadow-xl overflow-hidden">
          
          {/* Search Input - Clicking/tapping opens FullScreenSearchModal */}
          <div 
            onClick={() => setIsFullScreenSearchOpen(true)}
            className="relative w-full cursor-pointer"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              readOnly
              value={searchTerm}
              onClick={() => setIsFullScreenSearchOpen(true)}
              onFocus={() => setIsFullScreenSearchOpen(true)}
              placeholder="Buscar restaurantes, platos, comida a domicilio o menús..."
              className="w-full bg-white border-2 border-[#E63946] rounded-2xl py-3 pl-11 pr-10 text-xs sm:text-sm font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#E63946] focus:ring-4 focus:ring-[#E63946]/20 shadow-md transition cursor-pointer"
            />
            {searchTerm && (
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm('');
                }} 
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-lg text-gray-600 transition cursor-pointer"
                title="Limpiar filtro"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Horizontal Store Logos Carousel / Progressive Loading */}
          {isRestaurantsLoading ? (
            <StoresSkeleton />
          ) : uniqueStores.length > 0 ? (
            <div className="space-y-2 border-t border-[#232B3A] pt-4 transition-opacity duration-200">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-[#E63946]" />
                  <span className="text-xs font-black uppercase text-white tracking-wider">
                    Restaurantes Abiertos ({uniqueStores.length}{totalOpenCount > uniqueStores.length ? ` / ${totalOpenCount}` : ''})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedStore !== 'all' && (
                    <button
                      onClick={() => setSelectedStore('all')}
                      className="text-[11px] font-bold text-[#E63946] hover:underline flex items-center gap-1 cursor-pointer mr-1"
                    >
                      <span>Ver todos</span>
                    </button>
                  )}

                  {/* Navigation Arrows for PC and Mobile */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => scrollStores('left')}
                      className="p-1.5 rounded-full bg-[#1F2937] hover:bg-[#E63946] text-gray-300 hover:text-white transition cursor-pointer border border-[#232B3A] active:scale-95 shadow-sm"
                      title="Mover restaurantes a la izquierda"
                      aria-label="Mover restaurantes a la izquierda"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollStores('right')}
                      className="p-1.5 rounded-full bg-[#1F2937] hover:bg-[#E63946] text-gray-300 hover:text-white transition cursor-pointer border border-[#232B3A] active:scale-95 shadow-sm"
                      title="Mover restaurantes a la derecha"
                      aria-label="Mover restaurantes a la derecha"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div 
                ref={storesScrollRef}
                onMouseEnter={() => {
                  isHoveringStoresRef.current = true;
                }}
                onMouseLeave={() => {
                  isHoveringStoresRef.current = false;
                  if (isDraggingStoresRef.current) {
                    isDraggingStoresRef.current = false;
                    setTimeout(() => {
                      hasMovedStoresRef.current = false;
                      isStoresUserInteractingRef.current = false;
                    }, 500);
                  }
                }}
                onMouseDown={(e) => {
                  const container = storesScrollRef.current;
                  if (!container) return;
                  isDraggingStoresRef.current = true;
                  hasMovedStoresRef.current = false;
                  startXStoresRef.current = e.pageX - container.offsetLeft;
                  startScrollLeftStoresRef.current = container.scrollLeft;
                  isStoresUserInteractingRef.current = true;
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                }}
                onMouseMove={(e) => {
                  if (!isDraggingStoresRef.current) return;
                  const container = storesScrollRef.current;
                  if (!container) return;
                  e.preventDefault();
                  const x = e.pageX - container.offsetLeft;
                  const walk = (x - startXStoresRef.current);
                  if (Math.abs(walk) > 4) {
                    hasMovedStoresRef.current = true;
                  }
                  container.scrollLeft = startScrollLeftStoresRef.current - walk;
                }}
                onMouseUp={() => {
                  if (!isDraggingStoresRef.current) return;
                  isDraggingStoresRef.current = false;
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                  storesResumeTimeoutRef.current = setTimeout(() => {
                    hasMovedStoresRef.current = false;
                    isStoresUserInteractingRef.current = false;
                  }, 1200);
                }}
                onTouchStart={() => {
                  isStoresUserInteractingRef.current = true;
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                }}
                onTouchEnd={() => {
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                  storesResumeTimeoutRef.current = setTimeout(() => {
                    isStoresUserInteractingRef.current = false;
                  }, 2000);
                }}
                onWheel={(e) => {
                  const container = storesScrollRef.current;
                  if (!container) return;
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    container.scrollLeft += e.deltaY;
                  } else {
                    container.scrollLeft += e.deltaX;
                  }
                  isStoresUserInteractingRef.current = true;
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                  storesResumeTimeoutRef.current = setTimeout(() => {
                    isStoresUserInteractingRef.current = false;
                  }, 2000);
                }}
                className="-mx-5 px-2 sm:px-3 flex items-center gap-3.5 sm:gap-5 overflow-x-auto pb-1 pt-1 hide-scrollbar cursor-grab active:cursor-grabbing select-none" 
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-x pan-y' }}
              >
                {/* All Stores Pill Button */}
                <button
                  onClick={(e) => {
                    if (hasMovedStoresRef.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    setSelectedStore('all');
                  }}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group select-none"
                  title="Ver todas las tiendas y restaurantes"
                >
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
                    selectedStore === 'all'
                      ? 'bg-[#E63946] text-white font-black ring-4 ring-[#E63946]/40 shadow-lg shadow-[#E63946]/20 scale-105'
                      : 'bg-[#090B12] border-2 border-[#232B3A] group-hover:border-[#E63946]/50 text-[#A9B2C3] group-hover:text-[#E63946]'
                  }`}>
                    <Store className="w-6 h-6 sm:w-7 sm:h-7 pointer-events-none select-none" />
                  </div>
                  <span className={`text-[10px] sm:text-xs font-bold line-clamp-1 max-w-[70px] sm:max-w-[80px] text-center select-none ${
                    selectedStore === 'all' ? 'text-[#E63946] font-extrabold' : 'text-[#A9B2C3] group-hover:text-white'
                  }`}>
                    Todas
                  </span>
                </button>

                {/* Botón redondo: Recomendados (Lleva a los Reels) */}
                <button
                  type="button"
                  id="store-carousel-recomendados-reels-btn"
                  onClick={(e) => {
                    if (hasMovedStoresRef.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    window.history.pushState({}, '', '/carruselproduc');
                    window.dispatchEvent(new Event('popstate'));
                  }}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group select-none relative"
                  title="Ver Reels y videos recomendados"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-[#E63946] via-[#FF007A] to-[#F4B400] transition-all duration-200 group-hover:scale-105 shadow-md shadow-[#E63946]/25 ring-2 ring-transparent group-hover:ring-[#FF007A]/50 flex items-center justify-center">
                    <div className="w-full h-full rounded-full bg-[#0D121F] group-hover:bg-[#161C2E] flex items-center justify-center transition-colors relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-tr from-[#E63946]/20 via-transparent to-[#F4B400]/20 pointer-events-none" />
                      <div className="relative flex items-center justify-center">
                        <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-white text-white ml-0.5 group-hover:scale-110 transition-transform pointer-events-none drop-shadow-sm" />
                      </div>
                      <span className="absolute bottom-1 right-1 w-2 h-2 bg-[#E63946] rounded-full ring-1.5 ring-[#0D121F] animate-pulse" />
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold line-clamp-1 max-w-[76px] sm:max-w-[88px] text-center select-none text-[#A9B2C3] group-hover:text-[#FF007A] transition">
                    Recomendados
                  </span>
                </button>

                {/* Individual Store Items */}
                {uniqueStores.map((store, storeIdx) => {
                  const isSelected = selectedStore === store.uid;
                  return (
                    <button
                      key={store.uid}
                      onClick={(e) => {
                        if (hasMovedStoresRef.current) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        handleSelectStore(store);
                      }}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group relative select-none"
                      title={`Filtrar por ${store.displayName || `@${store.username}`}`}
                    >
                      <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full p-0.5 transition-all duration-200 ${
                        isSelected
                          ? 'bg-[#E63946] ring-4 ring-[#E63946]/50 shadow-lg shadow-[#E63946]/30 scale-105'
                          : 'bg-[#111827] hover:bg-[#E63946]/20 ring-2 ring-[#232B3A] hover:ring-[#E63946] group-hover:scale-105'
                      }`}>
                        {store.photoURL ? (
                          <img
                            src={store.photoURL}
                            alt={store.displayName || store.username}
                            draggable={false}
                            loading="eager"
                            fetchPriority={storeIdx < 8 ? "high" : "auto"}
                            decoding="async"
                            className="w-full h-full rounded-full object-cover bg-[#090B12] pointer-events-none select-none"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-[#E63946]/20 text-[#E63946] flex items-center justify-center font-black text-xs sm:text-sm uppercase pointer-events-none select-none">
                            {(store.displayName || store.username || 'T').substring(0, 2)}
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] sm:text-xs font-bold line-clamp-1 max-w-[72px] sm:max-w-[84px] text-center transition select-none ${
                        isSelected ? 'text-[#E63946] font-black' : 'text-[#A9B2C3] group-hover:text-white'
                      }`}>
                        {store.displayName || `@${store.username}`}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Filtered Store Recommendation Banner */}
              {selectedStore !== 'all' && (() => {
                const currentStore = uniqueStores.find(s => s.uid === selectedStore);
                if (!currentStore) return null;
                return (
                  <div className="mt-2.5 p-3 rounded-2xl bg-[#111827] border border-[#232B3A] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-[#E63946]/50 bg-[#090B12]">
                        {currentStore.photoURL ? (
                          <img src={currentStore.photoURL} alt={currentStore.displayName || currentStore.username} loading="eager" decoding="async" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full text-[#E63946] flex items-center justify-center font-black text-xs uppercase">
                            {(currentStore.displayName || currentStore.username || 'T').substring(0, 2)}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-black text-white flex items-center gap-2">
                          <span>{currentStore.displayName || `@${currentStore.username}`}</span>
                        </div>
                        <button
                          onClick={() => onNavigateToStore(currentStore.username)}
                          className="text-[11px] text-[#E63946] hover:underline font-bold"
                        >
                          Ver perfil completo del restaurante →
                        </button>
                      </div>
                    </div>

                    <RecommendationHeartButton
                      storeId={currentStore.uid}
                      storeName={currentStore.displayName || `@${currentStore.username}`}
                      storeUsername={currentStore.username}
                      variant="compact"
                    />
                  </div>
                );
              })()}
            </div>
          ) : null}

          {/* Quick Categories section */}
          {isCategoriesLoading ? (
            <CategoriesSkeleton />
          ) : (
            <div className="border-t border-[#232B3A] pt-3 space-y-2 transition-opacity duration-200">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-[#A9B2C3] tracking-wider px-0.5">
                <Filter className="w-3.5 h-3.5 text-[#A9B2C3]" />
                <span>Categorías:</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1.5 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-x pan-y' }}>
                {categories.map((cat) => {
                  const isAll = cat === 'all';
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition duration-150 uppercase tracking-wide cursor-pointer shrink-0 whitespace-nowrap ${
                        isAll && isSelected
                          ? 'bg-[#E63946] text-white shadow-md shadow-[#E63946]/20 font-black'
                          : isSelected
                          ? 'bg-[#F4B400] text-black shadow-md shadow-[#F4B400]/20 font-black'
                          : 'bg-transparent border border-[#232B3A] text-white hover:border-[#E63946]/60 hover:text-white'
                      }`}
                    >
                      {isAll ? 'VER TODO' : cat}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 4. Products Display */}
        {loadingStoreProducts ? (
          <div 
            className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6"
            aria-busy="true"
            aria-label="Cargando los 5 primeros productos del restaurante"
          >
            {[0, 1, 2, 3, 4].map((idx) => (
              <ProductCardSkeleton key={`store-skeleton-${idx}`} index={idx} />
            ))}
          </div>
        ) : isProductsLoading ? (
          <div 
            className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6"
            aria-busy="true"
            aria-label="Cargando productos"
          >
            {[0, 1, 2, 3, 4].map((idx) => (
              <ProductCardSkeleton key={`general-skeleton-${idx}`} index={idx} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          searchTerm.trim().length > 0 ? (
            <div className="bg-[#111827] border border-[#232B3A] rounded-3xl py-16 px-4 text-center max-w-md mx-auto space-y-4">
              <ShoppingBag className="w-12 h-12 text-[#A9B2C3] mx-auto opacity-40" />
              <div className="space-y-1">
                <h3 className="font-extrabold text-white text-base">Sin resultados</h3>
                <p className="text-xs text-[#A9B2C3]">No encontramos productos que coincidan con tu búsqueda.</p>
              </div>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('all');
                  setSelectedStore('all');
                }}
                className="px-4 py-2 bg-[#090B12] hover:bg-[#232B3A] border border-[#232B3A] rounded-xl text-xs font-bold text-white transition cursor-pointer"
              >
                Restablecer Filtros
              </button>
            </div>
          ) : selectedStore !== 'all' ? (
            <div className="bg-[#111827] border border-[#232B3A] rounded-3xl py-14 px-4 text-center max-w-md mx-auto space-y-4">
              <ShoppingBag className="w-12 h-12 text-[#E63946] mx-auto opacity-60" />
              <div className="space-y-1">
                <h3 className="font-extrabold text-white text-base">Este restaurante aún no tiene productos publicados</h3>
                <p className="text-xs text-[#A9B2C3]">El restaurante se encuentra abierto, pero aún no cuenta con productos activos en su menú.</p>
              </div>
              <button
                onClick={() => {
                  setSelectedStore('all');
                  setSelectedCategory('all');
                }}
                className="px-4 py-2 bg-[#090B12] hover:bg-[#232B3A] border border-[#232B3A] rounded-xl text-xs font-bold text-white transition cursor-pointer"
              >
                Ver otros restaurantes
              </button>
            </div>
          ) : null
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
              {displayedProducts.map((product, productIndex) => {
              const profile = profiles[product.userId];
              const currency = profile?.currency || '$';
              const isOnSale = product.compareAtPrice && product.compareAtPrice > product.price;
              const discountPercentage = isOnSale 
                ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100) 
                : 0;

              return (
                <motion.div
                  key={product.id || `prod-${productIndex}`}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setSelectedProduct(product)}
                  className="bg-[#111827] border border-[#232B3A] hover:border-[#E63946]/50 rounded-2xl overflow-hidden flex flex-col group transition duration-300 relative cursor-pointer"
                >
                  {/* Store source badge on top right */}
                  <div className="absolute top-3 left-3 z-20">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (profile?.username) {
                          onNavigateToStore(profile.username);
                        }
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-[#090B12]/85 hover:bg-[#090B12] border border-[#232B3A] rounded-full transition text-[10px] font-black tracking-wide text-white cursor-pointer backdrop-blur-md"
                    >
                      <Store className="w-3 h-3 text-[#E63946]" />
                      <span>{profile?.displayName || 'Tienda'}</span>
                    </button>
                  </div>

                  {/* Product photo image preview wrapper */}
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProduct(product);
                    }}
                    className="relative aspect-square w-full bg-[#090B12] overflow-hidden shrink-0 cursor-pointer"
                  >
                    {product.allowsHalfAndHalf && product.flavorsText && (
                      <div className="absolute top-3 right-3 z-20">
                        <span className="bg-gradient-to-r from-amber-500 to-red-500 text-white font-black text-[9px] uppercase px-2.5 py-0.5 rounded-full shadow-lg tracking-wider border border-white/20 flex items-center gap-1">
                          <span>{product.name?.toLowerCase().includes('pizza') || product.category?.toLowerCase().includes('pizza') ? '🍕 Mitad y Mitad' : '✨ Con Sabores'}</span>
                        </span>
                      </div>
                    )}
                    {/* Top right badges: Sale badge */}
                    {isOnSale && !product.allowsHalfAndHalf && (
                      <div className="absolute top-3 right-3 z-20">
                        <span className="bg-[#E63946] text-white font-black text-[9px] uppercase px-2 py-0.5 rounded shadow tracking-wider">
                          -{discountPercentage}%
                        </span>
                      </div>
                    )}

                    {product.imageURL ? (
                      <img 
                        src={product.imageURL} 
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        loading={productIndex < 4 ? "eager" : "lazy"}
                        fetchPriority={productIndex < 4 ? "high" : "auto"}
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-1.5">
                        <ShoppingBag className="w-8 h-8 opacity-45" />
                        <span className="text-[10px] font-mono opacity-40">Sin Imagen</span>
                      </div>
                    )}

                    {/* Quick overlay actions on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2 pointer-events-none sm:pointer-events-auto">
                      <span className="p-2.5 bg-[#E63946] hover:bg-[#D62839] text-white font-bold rounded-xl transition shadow hover:scale-110 active:scale-95 cursor-pointer text-xs uppercase tracking-wider flex items-center gap-1">
                        Ver Detalles
                      </span>
                    </div>
                  </div>

                  {/* Card Information */}
                  <div className="p-3 sm:p-4.5 flex flex-col flex-grow justify-between space-y-3 sm:space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 min-h-[26px]">
                        {product.category ? (
                          <span className="text-[9px] font-black uppercase text-[#F4B400] tracking-widest block font-mono truncate">
                            {product.category}
                          </span>
                        ) : (
                          <div />
                        )}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <ProductRecommendationHeartButton
                            productId={product.id}
                            productName={product.name}
                            storeId={product.userId}
                            storeUsername={profile?.username || ''}
                            activeCustomer={activeCustomer}
                            onCustomerUpdate={setActiveCustomer}
                            onOpenCustomerPortal={() => {
                              setCustomerPortalTab('rewards');
                              setIsCustomerPortalOpen(true);
                            }}
                            variant="card-overlay"
                            className="shrink-0"
                          />
                          <ProductShareButton
                            product={product}
                            storeUsername={profile?.username || ''}
                            storeName={profile?.storeName || profile?.displayName || ''}
                            currency={currency}
                            variant="card-overlay"
                          />
                        </div>
                      </div>
                      <h3 className="font-extrabold text-sm text-white group-hover:text-[#E63946] transition truncate leading-snug">
                        {product.name}
                      </h3>
                      <p className="text-[11px] text-[#A9B2C3] font-medium line-clamp-2">
                        {product.description || 'Sin descripción disponible.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#232B3A] flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-white font-mono">
                          {currency}{Number(product.price || 0).toLocaleString()}
                        </span>
                        {isOnSale && (
                          <span className="text-[9px] text-[#A9B2C3] line-through font-mono">
                            {currency}{Number(product.compareAtPrice || 0).toLocaleString()}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProduct(product);
                        }}
                        className="px-3 py-1.5 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-[10px] uppercase tracking-wider rounded-lg transition cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                        title="Ver detalles y agregar al carrito"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-white" /> Pedir
                      </button>
                    </div>
                  </div>

                </motion.div>
              );
            })}

          </div>

          {/* In-place 4-card skeleton placeholder when progressive loading next batch */}
          {isProgressiveLoadingMore && (
            <div 
              className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6 mt-3 sm:mt-6"
              aria-busy="true"
              aria-label="Cargando siguientes productos"
            >
              {[0, 1, 2, 3].map((idx) => (
                <ProductCardSkeleton key={`loading-more-${idx}`} index={idx} />
              ))}
            </div>
          )}

          {/* Smart 4-by-4 Progressive Loading indicator & control */}
          {(visibleLimit < filteredProducts.length || hasMoreProgressive) ? (
            <div className="w-full flex flex-col items-center justify-center py-8 gap-3 mt-6 border-t border-dashed border-[#232B3A]">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
                <span>Mostrando</span>
                <span className="text-[#F4B400] font-black">{Math.min(visibleLimit, filteredProducts.length)}</span>
                <span>de</span>
                <span className="text-white font-black">{filteredProducts.length}</span>
                <span>productos</span>
              </div>

              {/* Progress bar */}
              <div className="w-48 h-1.5 bg-[#1F2937] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#F4B400] to-[#E63946] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round((visibleLimit / Math.max(1, filteredProducts.length)) * 100))}%` }}
                />
              </div>

              <button
                onClick={handleLoadMoreFour}
                disabled={isLoadingMore || isProgressiveLoadingMore}
                className="px-6 py-2.5 bg-[#1F2937] hover:bg-[#374151] border border-white/10 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>Cargar 4 productos más</span>
                <span className="text-[10px] bg-[#E63946]/30 text-[#E63946] px-1.5 py-0.5 rounded font-black border border-[#E63946]/40">+4</span>
              </button>
              
              <p className="text-[10px] text-gray-500 tracking-wide">o desliza hacia abajo (scroll) para carga automática</p>
            </div>
          ) : filteredProducts.length > 4 ? (
            <div className="w-full text-center py-8 text-xs font-medium text-gray-500 border-t border-dashed border-[#232B3A] mt-6">
              ✨ Has llegado al final — Mostrando todos los {filteredProducts.length} productos
            </div>
          ) : null}
        </>
        )}
      </main>

      {/* 5. Quick View Product Modal popup */}
      <AnimatePresence>
        {selectedProduct && (() => {
          const profile = profiles[selectedProduct.userId];
          const currency = profile?.currency || '$';
          const isOnSale = selectedProduct.compareAtPrice && selectedProduct.compareAtPrice > selectedProduct.price;
          const discountPercentage = isOnSale 
            ? Math.round(((selectedProduct.compareAtPrice! - selectedProduct.price) / selectedProduct.compareAtPrice!) * 100) 
            : 0;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 overflow-hidden">
              
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedProduct(null)}
                className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              />

              {/* Modal Container - Spacious desktop layout & refined proportions */}
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 15 }}
                className="bg-[#111827] border border-[#232B3A] rounded-2xl sm:rounded-3xl w-full max-w-lg md:max-w-4xl lg:max-w-5xl relative overflow-hidden shadow-2xl flex flex-col z-10 max-h-[94vh] md:max-h-[88vh]"
              >
                {/* Close Button - RED BACKGROUND */}
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 z-30 text-white font-bold p-2 transition cursor-pointer hover:scale-110 active:scale-95 bg-[#E63946] hover:bg-[#D62839] rounded-full border border-red-700 shadow-lg shadow-red-950/40"
                  title="Cerrar"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>

                {/* Scrollable Body */}
                <div className="flex-grow overflow-y-auto p-3.5 sm:p-6 md:p-8 pb-3 custom-scrollbar overflow-x-hidden w-full">
                  <div className="flex flex-col md:flex-row gap-4 sm:gap-6 lg:gap-8 items-start w-full min-w-0">
                    
                    {/* Left: Product Media & Merchant Store Info */}
                    <div className="w-full md:w-[46%] lg:w-[44%] flex flex-col gap-3.5 shrink-0 md:sticky md:top-0">
                      <div className="w-full h-72 sm:h-88 md:h-[380px] lg:h-[420px] bg-[#090B12] flex items-center justify-center overflow-hidden border border-[#232B3A] rounded-2xl relative group shadow-xl">
                        {/* Ambient Glow */}
                        {selectedProduct.imageURL && (
                          <img 
                            src={selectedProduct.imageURL} 
                            alt="" 
                            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-2xl scale-125 select-none pointer-events-none filter saturate-150" 
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        {isOnSale && (
                          <span className="absolute top-3.5 left-3.5 z-20 bg-[#E63946] text-white font-black text-[10px] uppercase px-2.5 py-1 rounded-lg shadow-md tracking-wider">
                            -{discountPercentage}% OFF
                          </span>
                        )}
                        {selectedProduct.imageURL ? (
                          <>
                            <img 
                              src={selectedProduct.imageURL} 
                              alt={selectedProduct.name}
                              referrerPolicy="no-referrer"
                              onClick={() => setModalImageFit(f => f === 'cover' ? 'contain' : 'cover')}
                              className={`relative z-10 w-full h-full transition-all duration-300 cursor-pointer ${
                                modalImageFit === 'cover' ? 'object-cover' : 'object-contain p-2'
                              }`}
                            />
                            {/* Toggle fit mode button - solo lupa */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setModalImageFit(f => f === 'cover' ? 'contain' : 'cover');
                              }}
                              className="absolute bottom-3 right-3 z-20 bg-black/70 hover:bg-black/90 backdrop-blur-md text-white p-2 rounded-full border border-white/20 transition cursor-pointer flex items-center justify-center shadow-lg active:scale-95"
                              title={modalImageFit === 'cover' ? 'Ver imagen completa' : 'Llenar marco'}
                            >
                              <Search className="w-4 h-4 text-white stroke-[2.5]" />
                            </button>
                          </>
                        ) : (
                          <div className="text-gray-600 flex flex-col items-center gap-2 relative z-10">
                            <ShoppingBag className="w-12 h-12 opacity-45" />
                            <span className="text-xs font-mono opacity-40">Sin Imagen</span>
                          </div>
                        )}
                      </div>

                      {/* Merchant seller card integrated on the left column */}
                      {profile && (
                        <div className="bg-[#090B12] border border-[#232B3A] p-3 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-full border border-[#E63946]/40 bg-[#111827] flex items-center justify-center overflow-hidden font-black text-xs text-[#E63946] shrink-0">
                              {profile.photoURL ? (
                                <img src={profile.photoURL} alt={profile.displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                              ) : (
                                profile.displayName?.substring(0, 2).toUpperCase() || 'TI'
                              )}
                            </div>
                            <div className="min-w-0 text-left">
                              <span className="text-[8px] font-black uppercase text-[#A9B2C3] block leading-none">Restaurante</span>
                              <h4 className="text-xs font-extrabold text-white truncate leading-tight mt-0.5">{profile.displayName || 'Tienda'}</h4>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedProduct(null);
                              onNavigateToStore(profile.username);
                            }}
                            className="px-2.5 py-1.5 bg-[#E63946]/15 hover:bg-[#E63946] text-[#E63946] hover:text-white font-extrabold text-[9px] uppercase tracking-wide rounded-lg border border-[#E63946]/30 transition cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            Ver Tienda <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Right: Details, Flavors & Customization */}
                    <div className="w-full flex-1 min-w-0 flex flex-col justify-start space-y-3 sm:space-y-4 text-left">
                      
                      {/* Top Bar: Category badge + Recommendation Badge + Share Button */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {selectedProduct.category ? (
                          <span className="text-[10px] font-black uppercase text-[#F4B400] tracking-widest font-mono bg-[#F4B400]/10 border border-[#F4B400]/20 py-1 px-2.5 rounded-lg inline-block">
                            {selectedProduct.category}
                          </span>
                        ) : <span />}

                        <div className="flex items-center gap-2">
                          <ProductRecommendationHeartButton
                            productId={selectedProduct.id}
                            productName={selectedProduct.name}
                            storeId={selectedProduct.userId}
                            storeUsername={profile?.username || ''}
                            activeCustomer={activeCustomer}
                            onCustomerUpdate={setActiveCustomer}
                            onOpenCustomerPortal={() => {
                              setCustomerPortalTab('rewards');
                              setIsCustomerPortalOpen(true);
                            }}
                            variant="card-badge"
                          />
                          <ProductShareButton
                            product={selectedProduct}
                            storeUsername={profile?.username || ''}
                            storeName={profile?.storeName || profile?.displayName || ''}
                            currency={currency}
                            variant="compact"
                          />
                        </div>
                      </div>

                      {/* Title & Price */}
                      <div>
                        <h2 className="text-2xl md:text-3xl font-black text-white leading-tight tracking-tight">
                          {selectedProduct.name}
                        </h2>

                        <div className="flex items-baseline gap-3 mt-1.5">
                          <span className="text-2xl md:text-3xl font-black text-[#E63946] font-mono">
                            {currency}{Number(currentModalUnitPrice || selectedProduct.price || 0).toLocaleString()}
                          </span>
                          {isOnSale && (
                            <span className="text-base text-[#A9B2C3] line-through font-mono">
                              {currency}{Number(selectedProduct.compareAtPrice || 0).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      {selectedProduct.description && (
                        <div className="space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-wider text-[#A9B2C3] block">Descripción</span>
                          <p className="text-xs text-[#CBD5E1] leading-relaxed font-medium bg-[#090B12] border border-[#232B3A] p-3 rounded-xl">
                            {selectedProduct.description}
                          </p>
                        </div>
                      )}

                      {/* Variant / Pizza Flavor choice */}
                      {(selectedProduct.flavorsText && selectedProduct.flavorsText.trim().length > 0) || (selectedProduct.allowsHalfAndHalf && selectedProduct.flavorsText) ? (
                        <div className="pt-1 w-full min-w-0">
                          <PizzaFlavorSelector
                            key={selectedProduct.id}
                            product={selectedProduct}
                            currency={currency}
                            initialSizeVariant={chosenVariant}
                            onVariantChange={(variantString, isValid, variantPrice) => {
                              setChosenVariant(variantString);
                              setIsVariantValid(isValid);
                              if (typeof variantPrice === 'number' && variantPrice > 0) {
                                setChosenVariantPrice(variantPrice);
                              } else {
                                setChosenVariantPrice(getVariantPrice(selectedProduct, variantString));
                              }
                            }}
                          />
                        </div>
                      ) : selectedProduct.variantsText ? (
                        <div className="space-y-1.5 w-full min-w-0">
                          <label className="text-[10px] font-bold text-[#A9B2C3] uppercase tracking-widest block">Elegir Variante / Opción</label>
                          <select
                            value={chosenVariant}
                            onChange={(e) => {
                              const val = e.target.value;
                              setChosenVariant(val);
                              setChosenVariantPrice(getVariantPrice(selectedProduct, val));
                            }}
                            className="w-full h-10 bg-[#090B12] border border-[#232B3A] focus:border-[#E63946] text-xs px-3 rounded-lg outline-none text-white font-semibold"
                          >
                            {selectedProduct.variantsText.split(',').map((vari, vIdx) => {
                              const vName = vari.trim();
                              const vPrice = getVariantPrice(selectedProduct, vName);
                              return (
                                <option key={vIdx} value={vName}>
                                  {vName} {vPrice > 0 && vPrice !== selectedProduct.price ? `(${currency}${vPrice.toLocaleString()})` : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* STICKY/FIXED FOOTER inside the selectedProduct modal */}
                <div className="p-3.5 sm:p-5 border-t border-[#232B3A] bg-[#090B12] shrink-0 z-20 w-full">
                  <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4 items-center justify-between w-full">
                    {/* Quantity Controller */}
                    <div className="flex justify-between items-center bg-[#111827] px-3.5 py-2 sm:py-2.5 rounded-xl border border-[#232B3A] w-full sm:w-auto sm:min-w-[150px] shrink-0">
                      <span className="text-xs font-bold text-[#A9B2C3] mr-2">Cantidad:</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setBuyQuantity(q => q > 1 ? q - 1 : 1)}
                          className="p-1 sm:p-1.5 bg-[#090B12] border border-[#232B3A] rounded hover:bg-[#232B3A] transition text-[#A9B2C3] hover:text-white cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-black text-white font-mono w-5 text-center">{buyQuantity}</span>
                        <button
                          type="button"
                          onClick={() => setBuyQuantity(q => q + 1)}
                          className="p-1 sm:p-1.5 bg-[#090B12] border border-[#232B3A] rounded hover:bg-[#232B3A] transition text-[#A9B2C3] hover:text-white cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Add to Cart button */}
                    <div className="w-full sm:flex-1 min-w-0">
                      <button
                        onClick={handleAddToCart}
                        className="w-full py-3 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs sm:text-sm rounded-xl transition uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-lg shadow-[#E63946]/20"
                      >
                        <ShoppingBag className="w-4 h-4 text-white stroke-[2.5]" />
                        Añadir al Carrito ({currency}{Number((currentModalUnitPrice || selectedProduct.price || 0) * buyQuantity).toLocaleString()})
                      </button>
                    </div>
                  </div>
                </div>

              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* 5.1. Cart Drawer Overlay */}
      <AnimatePresence>
        {isCartOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            />

            {/* Cart Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-[#090B12] border-l border-[#232B3A] h-full shadow-2xl relative z-10 flex flex-col justify-between"
            >
              {/* Cart Header */}
              <div className="p-5 border-b border-[#232B3A] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#E63946]" />
                  <span className="font-black text-base text-white">Mi Carrito de Compras</span>
                </div>

                <button
                  id="close-cart-btn-general"
                  onClick={() => setIsCartOpen(false)}
                  className="w-8 h-8 flex items-center justify-center bg-[#E63946] hover:bg-[#D62839] text-white rounded-full transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Cart Items List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 text-[#A9B2C3]">
                    <ShoppingBag className="w-12 h-12 opacity-35" />
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-sm">Tu carrito está vacío</h4>
                      <p className="text-xs">Agrega artículos de la vitrina para iniciar tu pedido.</p>
                    </div>
                  </div>
                ) : (
                  cart.map((item) => {
                    const prod = item?.product || (item as any) || {};
                    const prodId = prod.id || (item as any)?.productId || item?.id || '';
                    const prodName = prod.name || (item as any)?.productName || 'Producto';
                    const prodPrice = typeof prod.price === 'number' ? prod.price : (parseFloat((prod as any).price) || 0);
                    const prodUserId = prod.userId || (item as any)?.userId || (item as any)?.storeOwnerId || '';
                    const profile = profiles[prodUserId] || findStoreForProduct(prod as any, profiles);
                    const currency = profile?.currency || '$';

                    return (
                      <div key={item.id} className="bg-[#111827] border border-[#232B3A] p-3.5 rounded-2xl flex gap-3.5 relative text-left">
                        {/* Remove item button */}
                        <button
                          onClick={() => handleRemoveFromCart(item.id)}
                          className="absolute top-3.5 right-3.5 p-1 bg-[#E63946]/10 hover:bg-[#E63946] text-[#E63946] hover:text-white rounded-lg transition"
                          title="Eliminar del carrito"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>

                        {/* Image */}
                        <div className="w-16 h-16 rounded-xl bg-[#090B12] overflow-hidden shrink-0 border border-[#232B3A] flex items-center justify-center">
                          {(() => {
                            const displayImg = prod.imageURL || (prodId ? getProductImage(prodId) : undefined) || (prodId ? products.find(p => p.id === prodId)?.imageURL : undefined);
                            return displayImg ? (
                              <img src={displayImg} alt={prodName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                            ) : (
                              <ShoppingBag className="w-6 h-6 text-gray-600" />
                            );
                          })()}
                        </div>

                        {/* Item Details */}
                        <div className="flex-1 min-w-0 pr-6 space-y-1">
                          <span className="text-[8px] font-black uppercase text-[#E63946] tracking-wider">
                            {profile?.displayName || 'Tienda'}
                          </span>
                          <h4 className="font-extrabold text-xs text-white truncate leading-none mb-1">
                            {prodName}
                          </h4>
                          {item.selectedVariant && (
                            <span className="text-[10px] font-bold text-[#A9B2C3] bg-[#090B12] border border-[#232B3A] px-2 py-0.5 rounded-md inline-block">
                              Var: {item.selectedVariant}
                            </span>
                          )}

                          <div className="flex items-center justify-between pt-1">
                            {/* Quantity buttons */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSetItemQuantity(item.id, -1)}
                                className="p-1 bg-[#090B12] border border-[#232B3A] hover:bg-[#232B3A] rounded text-[#A9B2C3] transition"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <span className="text-xs font-bold text-white font-mono w-4 text-center">{item.quantity}</span>
                              <button
                                onClick={() => handleSetItemQuantity(item.id, 1)}
                                className="p-1 bg-[#090B12] border border-[#232B3A] hover:bg-[#232B3A] rounded text-[#A9B2C3] transition"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            <span className="text-xs font-black text-white font-mono">
                              {currency}{(prodPrice * (item.quantity || 1)).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Cart Footer */}
              <div className="p-5 border-t border-[#232B3A] bg-[#111827]">
                {cart.length > 0 && (() => {
                  const subtotal = cart.reduce((sum, item) => {
                    const p = item?.product || (item as any) || {};
                    const price = typeof p.price === 'number' ? p.price : (parseFloat((p as any).price) || 0);
                    return sum + (price * (item.quantity || 1));
                  }, 0);
                  const uniqueSellersCount = Math.max(1, new Set(cart.map(item => item?.product?.userId || (item as any)?.userId || 'store')).size);
                  const totalDeliveryFee = uniqueSellersCount * systemDeliveryFee;
                  const total = subtotal + totalDeliveryFee;
                  const firstUserId = cart[0]?.product?.userId || (cart[0] as any)?.userId;
                  const curr = (firstUserId ? profiles[firstUserId]?.currency : undefined) || '$';

                  return (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs text-[#A9B2C3] font-bold">
                        <span>Subtotal:</span>
                        <span className="font-mono text-white">{curr}{subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-[#A9B2C3] font-bold">
                        <span>Domicilio ({uniqueSellersCount} {uniqueSellersCount === 1 ? 'restaurante' : 'restaurantes'}):</span>
                        <span className="font-mono text-[#F4B400]">{curr}{totalDeliveryFee.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-[#232B3A]">
                        <span className="text-xs font-extrabold text-white uppercase tracking-wider">Total:</span>
                        <span className="text-xl font-black text-[#E63946] font-mono">
                          {curr}{total.toLocaleString()}
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          setIsCartOpen(false);
                          setIsCheckoutOpen(true);
                        }}
                        className="w-full py-3 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs rounded-xl transition uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#E63946]/20 mt-2"
                      >
                        Continuar con el Pedido
                      </button>
                    </div>
                  );
                })()}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5.2. Checkout Form Modal */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCheckoutOpen(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#111827] border border-[#232B3A] rounded-3xl w-full max-w-lg relative overflow-hidden shadow-2xl flex flex-col z-10 max-h-[92vh]"
            >
              {/* Close button with RED BACKGROUND */}
              <div className="p-5 border-b border-[#232B3A] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#E63946]" />
                  <span className="font-black text-base text-white uppercase tracking-tight">Hacer Mi Pedido</span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="text-white font-bold p-1.5 transition cursor-pointer hover:scale-110 active:scale-95 bg-[#E63946] hover:bg-[#D62839] rounded-full border border-red-700 shadow-md shadow-red-900/35"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* Scrollable Form Body */}
              <form onSubmit={handlePlaceOrderSubmit} className="flex-grow overflow-y-auto p-5 space-y-4 text-left">
                <p className="text-[11px] text-[#A9B2C3] font-medium leading-relaxed">
                  Completa los datos de envío. La orden se enviará a los emprendedores por WhatsApp al finalizar.
                </p>

                {/* Name */}
                <div>
                  <label className="text-[10px] font-black uppercase text-[#A9B2C3] block mb-1">Nombre Completo *</label>
                  <input 
                    type="text" 
                    required
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Ej: Alex Realpe"
                    className="w-full h-11 bg-white border border-[#232B3A] focus:border-[#E63946] rounded-xl px-3.5 text-xs font-semibold outline-none text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-[#E63946]/20"
                  />
                </div>

                {/* WhatsApp Phone */}
                <div>
                  <label className="text-[10px] font-black uppercase text-[#A9B2C3] block mb-1">WhatsApp de contacto *</label>
                  <input 
                    type="tel" 
                    required
                    value={custPhone}
                    onChange={(e) => {
                      const cleaned = cleanColombianPhone(e.target.value);
                      setCustPhone(cleaned);
                      if (phoneError) {
                        if (cleaned.length === 10) {
                          setPhoneError('');
                        }
                      }
                    }}
                    onBlur={() => {
                      if (custPhone && cleanColombianPhone(custPhone).length !== 10) {
                        setPhoneError("Ingrese un número de celular colombiano válido.");
                      } else {
                        setPhoneError("");
                      }
                    }}
                    placeholder="Ej: 3106502043"
                    className={`w-full h-11 bg-white border ${
                      phoneError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-[#232B3A] focus:border-[#E63946] focus:ring-[#E63946]/20'
                    } rounded-xl px-3.5 text-xs font-semibold outline-none text-gray-900 placeholder:text-gray-400 focus:ring-1`}
                  />
                  {phoneError && (
                    <p className="text-[11px] font-bold text-red-500 mt-1 flex items-center gap-1">
                      <span>⚠️</span> {phoneError}
                    </p>
                  )}
                </div>

                {/* Delivery Type Option (Domicilio vs Recoger en Restaurante) */}
                <div className="space-y-2 pt-2 border-t border-[#232B3A]">
                  <span className="text-[10px] font-black uppercase text-[#A9B2C3] block">Tipo de entrega</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryType('delivery');
                        if (isPickupOrInvalidAddress(custAddress)) {
                          setCustAddress('');
                        }
                      }}
                      className={`p-3 rounded-xl border flex flex-col items-start gap-1 cursor-pointer transition text-left ${
                        deliveryType === 'delivery'
                          ? 'bg-[#E63946]/10 border-[#E63946] shadow-sm'
                          : 'bg-[#090B12] border-[#232B3A] hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-[#232B3A] flex items-center justify-center shrink-0">
                          {deliveryType === 'delivery' && <div className="w-2 h-2 bg-[#E63946] rounded-full" />}
                        </div>
                        <span className="text-xs font-black text-white">🛵 Domicilio</span>
                      </div>
                      <span className="text-[10px] text-[#A9B2C3] pl-6">Envío a tu dirección</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryType('pickup')}
                      className={`p-3 rounded-xl border flex flex-col items-start gap-1 cursor-pointer transition text-left ${
                        deliveryType === 'pickup'
                          ? 'bg-emerald-500/10 border-emerald-500 shadow-sm'
                          : 'bg-[#090B12] border-[#232B3A] hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-[#232B3A] flex items-center justify-center shrink-0">
                          {deliveryType === 'pickup' && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}
                        </div>
                        <span className="text-xs font-black text-white">🛍️ Recoger en Restaurante</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold pl-6">¡Sin costo de envío! ($0)</span>
                    </button>
                  </div>
                </div>

                {/* Pickup Info Banner if pickup selected */}
                {deliveryType === 'pickup' && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
                    <p className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                      <span>🛍️</span> <span>Recogida en restaurante / local del vendedor</span>
                    </p>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      Podrás pasar a retirar tu pedido sin pagar costo de domicilio. Te notificarán por WhatsApp cuando esté listo.
                    </p>
                  </div>
                )}

                {deliveryType === 'delivery' && (
                  <DeliveryAddressCard
                    address={custAddress}
                    onChangeAddress={setCustAddress}
                    coordinates={custCoordinates}
                    onSelectCoordinates={setCustCoordinates}
                    onOpenMapPicker={() => setIsMapPickerOpen(true)}
                    required={true}
                    placeholder="¿A donde entregamos su pedido?"
                  />
                )}

                {/* Special Notes */}
                <div>
                  <label className="text-[10px] font-black uppercase text-[#A9B2C3] block mb-1">Instrucciones o Notas Especiales</label>
                  <textarea 
                    value={custNotes}
                    onChange={(e) => setCustNotes(e.target.value)}
                    placeholder="Ej: Sin cebolla, salsas aparte o especificaciones de preparación."
                    rows={2}
                    className="w-full bg-white border border-[#232B3A] focus:border-[#E63946] rounded-xl p-3 text-xs font-semibold outline-none text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-[#E63946]/20 resize-none"
                  />
                </div>

                {/* Payment Method Option */}
                <div className="space-y-2 pt-2 border-t border-[#232B3A]">
                  <span className="text-[10px] font-black uppercase text-[#A9B2C3] block">Método de coordinación de pago</span>
                  
                  <div className="space-y-2">
                    {[
                      { id: 'whatsapp', title: 'Pedir por WhatsApp', desc: 'Coordinar pago por chat' },
                      { id: 'transfer', title: 'Transferencia Bancaria', desc: 'Soporte de transferencia bancaria' },
                      { id: 'delivery_cash', title: deliveryType === 'pickup' ? 'Pago en Restaurante' : 'Pago contra Entrega', desc: deliveryType === 'pickup' ? 'Paga en efectivo o tarjeta al recoger' : 'Paga en efectivo al recibir' }
                    ].map((opt) => (
                      <label 
                        key={opt.id}
                        onClick={() => setPayMethod(opt.id as any)}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                          payMethod === opt.id 
                            ? 'bg-[#E63946]/10 border-[#E63946] pt-3 pb-3' 
                            : 'bg-[#090B12] border-[#232B3A] hover:border-gray-700 pt-3 pb-3'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-4.5 h-4.5 rounded-full border border-[#232B3A] flex items-center justify-center">
                            {payMethod === opt.id && <div className="w-2.5 h-2.5 bg-[#E63946] rounded-full" />}
                          </div>
                          <div className="text-left">
                            <span className="text-xs font-extrabold text-white block leading-tight">{opt.title}</span>
                            <span className="text-[10px] text-[#A9B2C3] font-medium">{opt.desc}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Total Summary */}
                {cart.length > 0 && (() => {
                  const subtotal = cart.reduce((sum, item) => {
                    const p = item?.product || (item as any) || {};
                    const price = typeof p.price === 'number' ? p.price : (parseFloat((p as any).price) || 0);
                    return sum + (price * (item.quantity || 1));
                  }, 0);
                  const uniqueSellersCount = Math.max(1, new Set(cart.map(item => item?.product?.userId || (item as any)?.userId || 'store')).size);
                  const totalDeliveryFee = deliveryType === 'pickup' ? 0 : uniqueSellersCount * systemDeliveryFee;
                  const total = subtotal + totalDeliveryFee;
                  const firstUserId = cart[0]?.product?.userId || (cart[0] as any)?.userId;
                  const curr = (firstUserId ? profiles[firstUserId]?.currency : undefined) || '$';

                  return (
                    <div className="border-t border-[#232B3A] pt-4 space-y-2">
                      <div className="flex justify-between items-center text-xs text-[#A9B2C3] font-bold">
                        <span>Subtotal de productos:</span>
                        <span className="font-mono text-white">{curr}{subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-[#A9B2C3] font-bold">
                        <span>Costo de Domicilio {deliveryType === 'pickup' ? '(Recoger en Restaurante)' : `(${uniqueSellersCount} ${uniqueSellersCount === 1 ? 'envío' : 'envíos'})`}:</span>
                        {deliveryType === 'pickup' ? (
                          <span className="font-mono text-emerald-400 font-bold">GRATIS ($0)</span>
                        ) : (
                          <span className="font-mono text-[#F4B400]">{curr}{totalDeliveryFee.toLocaleString()}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm font-extrabold border-t border-dashed border-[#232B3A] pt-2 text-white">
                        <span>Monto Total a Pagar:</span>
                        <span className="text-[#E63946] text-base font-mono">{curr}{total.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Submit Action */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={orderSubmitting}
                    className="w-full py-3 bg-[#E63946] hover:bg-[#D62839] disabled:bg-[#232B3A] text-white font-black text-xs rounded-xl transition uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#E63946]/20"
                  >
                    {orderSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                        <span>Procesando...</span>
                      </>
                    ) : (
                      <span>Hacer Mi Pedido 🚀</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5.3. Order Success Modal */}
      <AnimatePresence>
        {isSuccessOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#111827] border border-[#232B3A] rounded-3xl w-full max-w-lg relative overflow-hidden shadow-2xl flex flex-col z-10 max-h-[92vh] p-6 text-center space-y-6"
            >
              <div className="w-14 h-14 bg-[#E63946]/10 border border-[#E63946]/20 text-[#E63946] rounded-full flex items-center justify-center text-2xl mx-auto animate-bounce shrink-0">
                🎉
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black text-white leading-tight">¡Pedido Registrado con Éxito!</h3>
                <p className="text-xs text-[#A9B2C3] max-w-sm mx-auto leading-relaxed">
                  Tus órdenes han sido almacenadas en el sistema. Ahora, por favor envía cada orden por WhatsApp para que los vendedores procesen tu envío:
                </p>
              </div>

              {/* Created Orders list with send WhatsApp buttons */}
              <div className="space-y-3 flex-grow overflow-y-auto max-h-[40vh] pr-1">
                {submittedOrders.map((order) => {
                  const profile = profiles[order.storeOwnerId];
                  const storeName = profile?.displayName || `@${profile?.username || 'tienda'}`;
                  const currency = profile?.currency || '$';

                  return (
                    <div key={order.id} className="bg-[#090B12] border border-[#232B3A] p-4 rounded-2xl flex flex-col items-stretch text-left space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[8px] font-black uppercase text-[#A9B2C3] block leading-none">TIENDA</span>
                          <h4 className="font-extrabold text-white text-sm">{storeName}</h4>
                          <span className="text-[10px] text-[#A9B2C3] font-semibold font-mono">Orden #{order.orderNumber}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[8px] font-black uppercase text-[#A9B2C3] block leading-none">TOTAL</span>
                          <span className="text-sm font-black text-[#E63946] font-mono">{currency}{order.totalAmount.toLocaleString()}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => triggerShopperWhatsAppMessage(order)}
                        className="w-full py-2.5 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-[11px] uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-[#E63946]/20"
                      >
                        <MessageCircle className="w-4 h-4 fill-white text-white" />
                        Enviar Orden por WhatsApp
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Close / Done action */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    setIsSuccessOpen(false);
                    setCustomerPortalTab('orders');
                    setIsCustomerPortalOpen(true);
                  }}
                  className="w-full py-3 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-[#E63946]/20 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-white" />
                  Ver y Rastrear Mis Pedidos en Tiempo Real 📦
                </button>
                <button
                  onClick={() => {
                    setIsSuccessOpen(false);
                    setCustomerPortalTab('wheel');
                    setIsCustomerPortalOpen(true);
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-black font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  <Crown className="w-4 h-4 text-black" />
                  ¡Girar Ruleta de Platos Gratis & Ver Mis RYYCOS! 🎁
                </button>
                <button
                  onClick={() => {
                    setIsSuccessOpen(false);
                    setSubmittedOrders([]);
                  }}
                  className="w-full py-2.5 bg-[#090B12] hover:bg-[#232B3A] border border-[#232B3A] text-gray-400 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cerrar y Volver a la Vitrina
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Checkout Customer Verification / Registration Modal */}
      <CustomerOrderAuthPromptModal
        isOpen={orderAuthPromptData.isOpen}
        onClose={() => setOrderAuthPromptData(prev => ({ ...prev, isOpen: false }))}
        phone={orderAuthPromptData.phone}
        customerName={custName}
        customerAddress={deliveryType === 'pickup' ? (pickupNotes.trim() ? `Recoger en Restaurante (${pickupNotes.trim()})` : 'Recoger en Restaurante') : custAddress}
        customerNotes={custNotes}
        cartSummary={{
          itemsCount: cart.reduce((sum, item) => sum + item.quantity, 0),
          totalFormatted: (() => {
            const sub = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
            const fee = deliveryType === 'pickup' ? 0 : systemDeliveryFee;
            return `$${(sub + fee).toLocaleString('es-CO')}`;
          })()
        }}
        isExistingCustomer={orderAuthPromptData.isExisting}
        existingProfile={orderAuthPromptData.existingProfile}
        onAuthenticated={handleAuthPromptSuccess}
        onChangePhoneRequest={() => {
          setOrderAuthPromptData(prev => ({ ...prev, isOpen: false }));
        }}
      />

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <button
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-[#E63946] text-white hover:bg-[#D62839] p-4 rounded-full shadow-2xl flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-transform cursor-pointer border border-[#E63946]/30"
        >
          <ShoppingBag className="w-5 h-5 stroke-[2.5]" />
          <span className="font-black text-xs">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} items
          </span>
        </button>
      )}

      {/* CUSTOMER LOYALTY, ACCOUNT, ORDERS & LUCKY WHEEL PORTAL MODAL */}
      <CustomerPortalModal
        isOpen={isCustomerPortalOpen}
        onClose={() => setIsCustomerPortalOpen(false)}
        initialPhone={custPhone}
        initialTab={customerPortalTab}
        onCustomerUpdate={setActiveCustomer}
      />

      {/* FULL SCREEN SEARCH MODAL VIEW */}
      <FullScreenSearchModal
        isOpen={isFullScreenSearchOpen}
        onClose={() => setIsFullScreenSearchOpen(false)}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        products={products}
        profiles={profiles}
        onSelectProduct={(product) => {
          setSelectedProduct(product);
          setIsFullScreenSearchOpen(false);
        }}
        onAddToCartDirect={(product, e) => handleAddToCartDirect(product, e)}
        onNavigateToStore={(username) => {
          setIsFullScreenSearchOpen(false);
          onNavigateToStore(username);
        }}
        cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
        onOpenCart={() => {
          setIsFullScreenSearchOpen(false);
          setIsCartOpen(true);
        }}
      />

      {/* GOOGLE MAPS LOCATION PICKER MODAL FOR DELIVERY ADDRESS */}
      <MapLocationPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        initialLat={custCoordinates?.lat}
        initialLng={custCoordinates?.lng}
        initialAddress={custAddress}
        onConfirm={(data) => {
          const newAddress = (data.address || '').trim();
          if (newAddress) {
            setCustAddress(newAddress);
            try {
              localStorage.setItem('ryyco_customer_delivery_address', newAddress);
            } catch (_) {}
          }
          const coords = {
            lat: data.lat,
            lng: data.lng,
            mapUrl: data.mapUrl
          };
          setCustCoordinates(coords);
          try {
            localStorage.setItem('ryyco_customer_coordinates', JSON.stringify(coords));
          } catch (_) {}
        }}
      />

      {/* 6. Footer */}
      <footer className="border-t border-[#232B3A] py-12 px-4 sm:px-6 md:px-8 bg-[#090B12] text-[#A9B2C3] text-center text-xs mt-12 space-y-3">
        <p className="font-extrabold text-white text-sm">Ryyco — Pide comida, descubre restaurantes y recibe recomendaciones</p>
        <p className="text-gray-400 max-w-2xl mx-auto text-[11px] leading-relaxed">
          Plataforma gastronómica inteligente para pedir comida online y a domicilio en Colombia. Explora platos, consulta menús y descubre qué quieres comer hoy.
        </p>
        <p className="text-gray-500 text-[10px] pt-2">© 2026 Ryyco (ryyco.com). Todos los derechos reservados.</p>
      </footer>

    </div>
  );
}
