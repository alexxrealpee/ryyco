/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ArrowUpDown, 
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
  User
} from 'lucide-react';
import { ProductItem, UserProfile, OrderItem } from '../types';
import { fetchAllActiveProductsAndStores, saveOrder, fetchSystemSettings, checkIsStoreClosed, findStoreForProduct } from '../lib/firebase';
import { cleanColombianPhone, formatColombianPhoneWith57 } from './PublicProfile';
import PwaLoadingScreen from './PwaLoadingScreen';
import LinnkProLogo from './LinnkProLogo';
import CustomerPortalModal from './CustomerPortalModal';
import FullScreenSearchModal from './FullScreenSearchModal';

export const isFoodCategory = (cat?: string): boolean => {
  if (!cat || cat === 'all' || cat === 'Todos') return false;
  const c = cat.toLowerCase().trim();
  return (
    c.includes('comida') ||
    c.includes('caldo') ||
    c.includes('plato') ||
    c.includes('menu') ||
    c.includes('menú') ||
    c.includes('restaurante') ||
    c.includes('alimento') ||
    c.includes('gastronom') ||
    c.includes('postre') ||
    c.includes('reposter') ||
    c.includes('panader') ||
    c.includes('asado') ||
    c.includes('fast food') ||
    c.includes('snack') ||
    c.includes('hamburguesa') ||
    c.includes('pizza') ||
    c.includes('picada') ||
    c.includes('comidas') ||
    c.includes('pollo') ||
    c.includes('perro') ||
    c.includes('combo') ||
    c.includes('ensalada') ||
    c.includes('pasta') ||
    c.includes('arroz') ||
    c.includes('bebida') ||
    c.includes('desayuno') ||
    c.includes('carne') ||
    c.includes('pescado') ||
    c.includes('marisco') ||
    c.includes('vegetariano') ||
    c.includes('mexicana') ||
    c.includes('licor') ||
    c.includes('cerveza') ||
    c.includes('vino') ||
    c.includes('trago')
  );
};

export const isFoodProduct = (product: { name?: string; description?: string; category?: string }): boolean => {
  if (product.category && isFoodCategory(product.category)) return true;
  const text = `${product.name || ''} ${product.description || ''} ${product.category || ''}`.toLowerCase();
  
  const matchesFoodKeyword = (
    text.includes('comida') ||
    text.includes('plato') ||
    text.includes('menu') ||
    text.includes('menú') ||
    text.includes('caldo') ||
    text.includes('sopa') ||
    text.includes('picada') ||
    text.includes('hornado') ||
    text.includes('pollo') ||
    text.includes('carne') ||
    text.includes('hamburguesa') ||
    text.includes('pizza') ||
    text.includes('combo') ||
    text.includes('asado') ||
    text.includes('almuerzo') ||
    text.includes('desayuno') ||
    text.includes('cena') ||
    text.includes('salchipapa') ||
    text.includes('perro') ||
    text.includes('arepa') ||
    text.includes('empana') ||
    text.includes('postre') ||
    text.includes('pan ') ||
    text.includes('sandwich') ||
    text.includes('sándwich')
  );

  const isPureAlcohol = (
    (text.includes('aguardiente') || text.includes('ron ') || text.includes('cerveza') || text.includes('whisky') || text.includes('tequila') || text.includes('vodka') || text.includes('licor') || text.includes('budweiser') || text.includes('corona')) &&
    !text.includes('combo') && !text.includes('picada') && !text.includes('comida') && !text.includes('plato')
  );

  return matchesFoodKeyword && !isPureAlcohol;
};

interface TiendaGeneralProps {
  onNavigateHome: () => void;
  onNavigateToStore: (username: string) => void;
}

export default function TiendaGeneral({ onNavigateHome, onNavigateToStore }: TiendaGeneralProps) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  
  // Filtering & search states
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullScreenSearchOpen, setIsFullScreenSearchOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStore, setSelectedStore] = useState('all');
  const [sortBy, setSortBy] = useState<'latest' | 'price_asc' | 'price_desc'>('latest');
  
  // Quick View Modal state
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  // Cart & Order states
  const [cart, setCart] = useState<{ id: string; product: ProductItem; selectedVariant?: string; quantity: number }[]>(() => {
    try {
      const stored = localStorage.getItem('linnkpro_general_cart');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('linnkpro_general_cart', JSON.stringify(cart));
    } catch (err) {
      console.error("Error saving cart:", err);
    }
  }, [cart]);

  // Sync cart when modified externally (e.g. by LinnkPro AI Voice Assistant)
  useEffect(() => {
    const handleSync = () => {
      try {
        const stored = localStorage.getItem('linnkpro_general_cart');
        if (stored) {
          setCart(JSON.parse(stored));
        } else {
          setCart([]);
        }
      } catch (e) {}
    };

    window.addEventListener('linnkpro_cart_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('linnkpro_cart_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Form fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custNotes, setCustNotes] = useState('');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [payMethod, setPayMethod] = useState<'whatsapp' | 'transfer' | 'delivery_cash'>('whatsapp');

  // Customer Loyalty & Account Modal
  const [isCustomerPortalOpen, setIsCustomerPortalOpen] = useState(false);
  const [customerPortalTab, setCustomerPortalTab] = useState<'orders' | 'wheel' | 'rewards' | 'profile'>('orders');
  
  // Mobile 3-Dots Menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMobileMenuOpen]);
  
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [submittedOrders, setSubmittedOrders] = useState<OrderItem[]>([]);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [systemDeliveryFee, setSystemDeliveryFee] = useState(7000);

  const [buyQuantity, setBuyQuantity] = useState(1);
  const [chosenVariant, setChosenVariant] = useState('');

  // Whenever selectedProduct changes, reset chosenVariant and buyQuantity
  useEffect(() => {
    if (selectedProduct) {
      setBuyQuantity(1);
      if (selectedProduct.variantsText) {
        const firstVar = selectedProduct.variantsText.split(',')[0].trim();
        setChosenVariant(firstVar);
      } else {
        setChosenVariant('');
      }
    }
  }, [selectedProduct]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [res, sysSettings] = await Promise.all([
          fetchAllActiveProductsAndStores(),
          fetchSystemSettings()
        ]);
        setProducts(res.products);
        setProfiles(res.profiles);
        if (sysSettings?.defaultDeliveryFee) {
          setSystemDeliveryFee(sysSettings.defaultDeliveryFee);
        }
      } catch (err) {
        console.error("Error loading TiendaGeneral data:", err);
      } finally {
        setLoading(false);
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
  }, [availableBaseProducts, selectedCategory]);

  // Get list of unique store profiles with active products (memoized)
  const uniqueStores = useMemo(() => {
    const storeMap = new Map<string, UserProfile>();
    (Object.values(profiles) as UserProfile[]).forEach(profile => {
      if (profile && profile.uid && !storeMap.has(profile.uid)) {
        if (!checkIsStoreClosed(profile) && !profile.suspended && products.some(p => p.userId === profile.uid || p.storeUsername === profile.username)) {
          storeMap.set(profile.uid, profile);
        }
      }
    });
    return Array.from(storeMap.values());
  }, [profiles, products]);

  // Auto-scroll store carousel slowly towards the left
  const storesScrollRef = useRef<HTMLDivElement>(null);
  const isStoresUserInteractingRef = useRef<boolean>(false);
  const storesResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const container = storesScrollRef.current;
    if (!container || uniqueStores.length === 0) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const scrollLoop = (currentTime: number) => {
      const delta = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;

      if (!isStoresUserInteractingRef.current && container) {
        // Slow, elegant auto-scroll speed (~26px per second)
        const scrollIncrement = 0.028 * delta;
        const maxScroll = container.scrollWidth - container.clientWidth;

        if (maxScroll > 2) {
          if (container.scrollLeft >= maxScroll - 1) {
            container.scrollLeft = 0;
          } else {
            container.scrollLeft += scrollIncrement;
          }
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
    return availableBaseProducts.filter(product => {
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
    }).sort((a, b) => {
      // 1. Food items first
      const foodA = isFoodProduct(a);
      const foodB = isFoodProduct(b);
      if (foodA && !foodB) return -1;
      if (!foodA && foodB) return 1;

      // 2. Secondary sort according to user selection
      if (sortBy === 'price_asc') {
        return a.price - b.price;
      } else if (sortBy === 'price_desc') {
        return b.price - a.price;
      } else {
        // Latest (default)
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      }
    });
  }, [availableBaseProducts, profiles, searchTerm, selectedCategory, sortBy]);

  const [visibleLimit, setVisibleLimit] = useState(8);

  // Reset limit when filter/search/sort changes
  useEffect(() => {
    setVisibleLimit(8);
  }, [searchTerm, selectedCategory, selectedStore, sortBy]);

  // Infinite Scroll scroll listener
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300) {
        setVisibleLimit(prev => {
          if (prev < filteredProducts.length) {
            return prev + 8;
          }
          return prev;
        });
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filteredProducts.length]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleLimit);
  }, [filteredProducts, visibleLimit]);

  const handleAddToCart = () => {
    if (!selectedProduct) return;

    const cartItemId = `${selectedProduct.id}_${chosenVariant || 'none'}`;

    setCart(prev => {
      const existing = prev.find(item => item.id === cartItemId);
      if (existing) {
        return prev.map(item => 
          item.id === cartItemId 
            ? { ...item, quantity: item.quantity + buyQuantity }
            : item
        );
      }
      return [
        ...prev,
        {
          id: cartItemId,
          product: selectedProduct,
          selectedVariant: chosenVariant || undefined,
          quantity: buyQuantity
        }
      ];
    });

    setSelectedProduct(null);
    setIsCartOpen(true);
  };

  const handleAddToCartDirect = (product: ProductItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const firstVariant = product.variantsText ? product.variantsText.split(',')[0].trim() : undefined;
    const cartItemId = `${product.id}_${firstVariant || 'none'}`;

    setCart(prev => {
      const existing = prev.find(item => item.id === cartItemId);
      if (existing) {
        return prev.map(item => 
          item.id === cartItemId 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          id: cartItemId,
          product,
          selectedVariant: firstVariant,
          quantity: 1
        }
      ];
    });
  };

  const handleSetItemQuantity = (cartItemId: string, change: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === cartItemId) {
          const nextVal = item.quantity + change;
          return { ...item, quantity: nextVal > 0 ? nextVal : 1 };
        }
        return item;
      });
    });
  };

  const handleRemoveFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.id !== cartItemId));
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

    setOrderSubmitting(true);

    // Group cart items by merchant userId
    const itemsBySeller: Record<string, typeof cart> = {};
    cart.forEach(item => {
      const sellerId = item.product.userId;
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

        const sellerProfile = profiles[sellerId];
        const formattedPhone = formatColombianPhoneWith57(custPhone);
        const finalAddress = deliveryType === 'pickup' 
          ? (custAddress.trim() ? `Recoger en Restaurante / Local (Nota: ${custAddress.trim()})` : 'Recoger en Restaurante / Local')
          : custAddress.trim();

        const newOrder: OrderItem = {
          id: `order_${Date.now()}_${sellerId}`,
          storeOwnerId: sellerId,
          storeName: sellerProfile?.displayName || sellerProfile?.username || 'Tienda en la plataforma',
          storeAddress: sellerProfile?.address || sellerProfile?.location || 'Dirección de la Tienda',
          storePhone: sellerProfile?.whatsapp || sellerProfile?.phone,
          orderNumber: rNo,
          customerName: custName.trim(),
          customerPhone: formattedPhone,
          customerAddress: finalAddress,
          items: sellerCart.map(item => ({
            productId: item.product.id,
            name: item.product.name,
            price: item.product.price,
            quantity: item.quantity,
            selectedVariant: item.selectedVariant || undefined
          })),
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
      setCart([]);
      setIsCartOpen(false);
      setIsCheckoutOpen(false);
      setIsSuccessOpen(true);
    } catch (err) {
      console.error(err);
      alert("Ocurrió un error al registrar el pedido. Intenta nuevamente.");
    } finally {
      setOrderSubmitting(false);
    }
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
    if (order.notes) msg += `✍️ Notas: ${order.notes}\n\n`;
    msg += `Método de pago: *${order.paymentMethod === 'whatsapp' ? 'WhatsApp Directo' : order.paymentMethod === 'transfer' ? 'Transferencia Bancaria' : 'Pago contra Entrega'}*\n\n`;
    msg += `¡Espero confirmación para continuar con el ${isPickup ? 'pedido para recoger' : 'pago/envío'}!`;

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
      <header className="border-b border-[#232B3A] backdrop-blur-md sticky top-0 z-40 bg-[#090B12]/95">
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
                    {/* Header Item: Mis Puntos y Pedidos */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setCustomerPortalTab('orders');
                        setIsCustomerPortalOpen(true);
                      }}
                      className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-amber-500/20 hover:from-amber-500/30 hover:to-orange-500/25 border border-amber-500/40 transition cursor-pointer flex items-start gap-3 group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition">
                        <Crown className="w-4 h-4 text-amber-400 animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-amber-300 text-xs block">
                            Mis Puntos y Pedidos
                          </span>
                          <span className="text-[9px] font-black uppercase bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-md">
                            500 pts
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-300 font-medium leading-tight mt-0.5">
                          Billetera $ COP, ruleta de premios y rastreo en vivo
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

                    {/* Historias */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        window.history.pushState({}, '', '/carruselproduc');
                        window.dispatchEvent(new Event('popstate'));
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-[#1A2234] transition cursor-pointer flex items-center gap-3 text-white group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs text-white block group-hover:text-purple-300 transition">
                          Historias de Comida
                        </span>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Ver platos destacados y videos
                        </p>
                      </div>
                    </button>

                    {/* Crear Mi Tienda */}
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
                          Crear Mi Tienda
                        </span>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Publica tus productos y vende online
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
          <div className="flex items-center justify-center shrink-0 px-2 z-20">
            <LinnkProLogo 
              onClick={onNavigateHome} 
              height={40}
              imgClassName="h-7 sm:h-[38px] md:h-[42px]"
            />
          </div>

          {/* Right: Action Buttons */}
          <div className="flex-1 flex items-center justify-end gap-2 sm:gap-2.5 z-10 min-w-0">
            {/* Customer Loyalty & Roulette Modal Button (Desktop) */}
            <button 
              onClick={() => { setCustomerPortalTab('orders'); setIsCustomerPortalOpen(true); }}
              className="hidden lg:flex px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 text-amber-300 font-extrabold text-xs items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              title="Mi Cuenta, Puntos, Ruleta de Platos Gratis y Estado de Pedidos"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="hidden xl:inline">Mis Puntos & Pedidos</span>
              <span className="xl:hidden">Mis Puntos</span>
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

            {/* Crear Mi Tienda Button */}
            <button 
              onClick={() => {
                window.history.pushState({}, '', '/landing');
                window.dispatchEvent(new Event('popstate'));
              }}
              className="hidden xl:inline-flex items-center bg-[#E63946] hover:bg-[#D62839] text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition duration-150 uppercase tracking-wider cursor-pointer shadow-md whitespace-nowrap shrink-0"
            >
              Crear Mi Tienda
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden pt-6 pb-2 sm:pt-10 sm:pb-4 px-3 sm:px-6 md:px-8 bg-[#090B12]">
        <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[250px] sm:w-[350px] h-[250px] sm:h-[350px] bg-[#E63946]/10 blur-[80px] rounded-full -z-10" />
        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[200px] sm:w-[300px] h-[200px] sm:h-[300px] bg-[#F4B400]/10 blur-[80px] rounded-full -z-10" />

        <div className="max-w-6xl mx-auto grid grid-cols-12 items-center gap-2 sm:gap-6">
          {/* Left Column: Stories tag, Social media & Text */}
          <div className="col-span-7 sm:col-span-7 flex flex-col items-start text-left space-y-2 z-10">
            <div className="flex items-center flex-wrap gap-2 mb-0.5">
              <button
                onClick={() => {
                  window.history.pushState({}, '', '/carruselproduc');
                  window.dispatchEvent(new Event('popstate'));
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#E63946]/10 hover:bg-[#E63946]/20 border border-[#E63946] rounded-full text-[#E63946] transition cursor-pointer text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-md active:scale-95"
                title="Ver historias"
              >
                <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#E63946] animate-pulse" />
                <span>HISTORIAS</span>
              </button>

              {/* Social Media Links */}
              <div className="flex items-center gap-1.5">
                {/* Facebook */}
                <a
                  href="https://www.facebook.com/share/14mn3zTTmB7/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook Ryyco"
                  title="Síguenos en Facebook"
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900/90 border border-slate-700/80 hover:border-[#1877F2] hover:bg-[#1877F2]/20 flex items-center justify-center text-white transition duration-200 shadow-md active:scale-95"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>

                {/* Instagram */}
                <a
                  href="https://www.instagram.com/ryyco_ipiales?igsh=MWM2M214bWJseW9wZA=="
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram Ryyco"
                  title="Síguenos en Instagram"
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900/90 border border-slate-700/80 hover:border-[#E1306C] hover:bg-[#E1306C]/20 flex items-center justify-center text-white transition duration-200 shadow-md active:scale-95"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>

                {/* TikTok */}
                <a
                  href="https://www.tiktok.com/@ryyco_ipiales?_r=1&_t=ZS-98y9bx9EXKh"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok Ryyco"
                  title="Síguenos en TikTok"
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900/90 border border-slate-700/80 hover:border-[#25F4EE] hover:bg-[#25F4EE]/20 flex items-center justify-center text-white transition duration-200 shadow-md active:scale-95"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.52 4.84 4.84 0 0 1-1.04-1.04 4.88 4.88 0 0 1-.96-3z" />
                  </svg>
                </a>
              </div>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] font-sans">
              <span className="block text-white">¿Qué piensas</span>
              <span className="block text-[#E63946]">pedir</span>
              <span className="inline-flex items-center gap-1.5 text-[#F4B400] relative">
                hoy?
                {/* Decorative radiating lines accent */}
                <span className="inline-flex flex-col gap-0.5 ml-1 text-[#E63946] select-none">
                  <span className="w-2.5 h-0.5 bg-[#E63946] rounded-full transform rotate-45"></span>
                  <span className="w-3.5 h-0.5 bg-[#E63946] rounded-full"></span>
                  <span className="w-2.5 h-0.5 bg-[#E63946] rounded-full transform -rotate-45"></span>
                </span>
              </span>
            </h1>
          </div>

          {/* Right Column: Food Image with Red Circular Backdrop */}
          <div className="col-span-5 sm:col-span-5 relative flex items-center justify-center sm:justify-end">
            <div className="relative w-full max-w-[170px] sm:max-w-[270px] md:max-w-[340px] flex items-center justify-center py-2">
              
              {/* Red Circular Background Badge */}
              <div className="absolute right-0 sm:right-2 top-1/2 -translate-y-1/2 w-[110px] h-[110px] sm:w-[180px] sm:h-[180px] md:w-[220px] md:h-[220px] bg-gradient-to-tr from-[#E63946] via-[#D62839] to-[#E63946]/90 rounded-full opacity-90 shadow-2xl shadow-[#E63946]/60 -z-0" />
              
              {/* Top-Left Doodle Star */}
              <svg className="absolute -top-3 sm:-top-5 left-4 sm:left-10 w-5 h-5 sm:w-7 sm:h-7 text-[#E63946] z-20 animate-pulse pointer-events-none select-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15 8.5 22 9.5 17 14.5 18.5 21.5 12 18 5.5 21.5 7 14.5 2 9.5 9 8.5 12 2" />
              </svg>

              {/* Top-Right Doodle Star */}
              <svg className="absolute -top-1 sm:-top-3 right-0 sm:right-3 w-4 h-4 sm:w-5 sm:h-5 text-[#E63946] z-20 pointer-events-none select-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15 8.5 22 9.5 17 14.5 18.5 21.5 12 18 5.5 21.5 7 14.5 2 9.5 9 8.5 12 2" />
              </svg>

              {/* Left Side Curved Doodle Aroma Lines */}
              <svg className="absolute -left-3 sm:-left-6 top-1/2 -translate-y-1/2 w-4 sm:w-7 h-8 sm:h-12 text-[#E63946] z-20 pointer-events-none select-none" viewBox="0 0 24 36" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <path d="M 18 5 C 10 11, 10 25, 18 31" />
                <path d="M 10 10 C 4 14, 4 22, 10 26" />
              </svg>

              {/* Floating Transparent Food Combo Image */}
              <img 
                src="https://firebasestorage.googleapis.com/v0/b/studio-9002217802-13e05.firebasestorage.app/o/image-removebg-preview%20(1).png?alt=media" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/hero_combo.webp';
                }}
                alt="Delicioso combo de hamburguesa, papas y bebida" 
                className="relative z-10 w-full h-auto max-h-[170px] sm:max-h-[250px] md:max-h-[300px] object-contain drop-shadow-[0_15px_25px_rgba(0,0,0,0.65)] hover:scale-105 transition-transform duration-300 pointer-events-none select-none"
              />

            </div>
          </div>
        </div>
      </section>

      {/* 3. Filtering & Dashboard Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 md:px-8 pt-2 pb-10 space-y-8">
        
        {/* Filter bar card */}
        <div className="bg-[#111827] border border-[#232B3A] p-5 rounded-3xl space-y-5 shadow-xl">
          
          {/* Top Row: Prominent Search Input & Sorting Selector */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Search Input - Clicking/tapping opens FullScreenSearchModal */}
            <div 
              onClick={() => setIsFullScreenSearchOpen(true)}
              className="relative flex-grow cursor-pointer"
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

            {/* Sorting selector */}
            <div className="flex items-center gap-1.5 bg-[#090B12] border border-[#232B3A] rounded-2xl py-2 px-3 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#A9B2C3] shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs text-white font-bold outline-none cursor-pointer w-full"
              >
                <option value="latest" className="bg-[#090B12] text-white">Más Recientes</option>
                <option value="price_asc" className="bg-[#090B12] text-white">Precio: Menor a Mayor</option>
                <option value="price_desc" className="bg-[#090B12] text-white">Precio: Mayor a Menor</option>
              </select>
            </div>
          </div>

          {/* Horizontal Store Logos Carousel */}
          {uniqueStores.length > 0 && (
            <div className="space-y-2 border-t border-[#232B3A] pt-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-[#E63946]" />
                  <span className="text-xs font-black uppercase text-white tracking-wider">
                    Tiendas ({uniqueStores.length})
                  </span>
                </div>
                {selectedStore !== 'all' && (
                  <button
                    onClick={() => setSelectedStore('all')}
                    className="text-[11px] font-bold text-[#E63946] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Ver todas</span>
                  </button>
                )}
              </div>

              <div 
                ref={storesScrollRef}
                onMouseEnter={() => {
                  isStoresUserInteractingRef.current = true;
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                }}
                onMouseLeave={() => {
                  isStoresUserInteractingRef.current = false;
                }}
                onTouchStart={() => {
                  isStoresUserInteractingRef.current = true;
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                }}
                onTouchEnd={() => {
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                  storesResumeTimeoutRef.current = setTimeout(() => {
                    isStoresUserInteractingRef.current = false;
                  }, 2500);
                }}
                onPointerDown={() => {
                  isStoresUserInteractingRef.current = true;
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                }}
                onPointerUp={() => {
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                  storesResumeTimeoutRef.current = setTimeout(() => {
                    isStoresUserInteractingRef.current = false;
                  }, 2500);
                }}
                onWheel={() => {
                  isStoresUserInteractingRef.current = true;
                  if (storesResumeTimeoutRef.current) clearTimeout(storesResumeTimeoutRef.current);
                  storesResumeTimeoutRef.current = setTimeout(() => {
                    isStoresUserInteractingRef.current = false;
                  }, 2500);
                }}
                className="flex items-center gap-3.5 sm:gap-5 overflow-x-auto pb-1 pt-1 px-1 hide-scrollbar" 
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-x pan-y' }}
              >
                {/* All Stores Pill Button */}
                <button
                  onClick={() => setSelectedStore('all')}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group"
                >
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
                    selectedStore === 'all'
                      ? 'bg-[#E63946] text-white font-black ring-4 ring-[#E63946]/40 shadow-lg shadow-[#E63946]/20 scale-105'
                      : 'bg-[#090B12] border-2 border-[#232B3A] group-hover:border-[#E63946]/50 text-[#A9B2C3] group-hover:text-[#E63946]'
                  }`}>
                    <Store className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                  <span className={`text-[10px] sm:text-xs font-bold line-clamp-1 max-w-[70px] sm:max-w-[80px] text-center ${
                    selectedStore === 'all' ? 'text-[#E63946] font-extrabold' : 'text-[#A9B2C3] group-hover:text-white'
                  }`}>
                    Todas
                  </span>
                </button>

                {/* Individual Store Items */}
                {uniqueStores.map((store) => {
                  const isSelected = selectedStore === store.uid;
                  return (
                    <button
                      key={store.uid}
                      onClick={() => setSelectedStore(isSelected ? 'all' : store.uid)}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group relative"
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
                            className="w-full h-full rounded-full object-cover bg-[#090B12]"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-[#E63946]/20 text-[#E63946] flex items-center justify-center font-black text-xs sm:text-sm uppercase">
                            {(store.displayName || store.username || 'T').substring(0, 2)}
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] sm:text-xs font-bold line-clamp-1 max-w-[72px] sm:max-w-[84px] text-center transition ${
                        isSelected ? 'text-[#E63946] font-black' : 'text-[#A9B2C3] group-hover:text-white'
                      }`}>
                        {store.displayName || `@${store.username}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Categories section */}
          <div className="border-t border-[#232B3A] pt-3 space-y-2">
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
        </div>

        {/* 4. Products Display / Loading */}
        {loading ? (
          <div className="py-12 my-4 bg-[#090B12] rounded-3xl border border-[#232B3A] overflow-hidden">
            <PwaLoadingScreen 
              message="Cargando directorio gastronómico de Ipiales..." 
              subtext="Obteniendo los mejores restaurantes, promociones y platos locales"
            />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-[#111827] border border-[#232B3A] rounded-3xl py-16 px-4 text-center max-w-md mx-auto space-y-4">
            <ShoppingBag className="w-12 h-12 text-[#A9B2C3] mx-auto opacity-40" />
            <div className="space-y-1">
              <h3 className="font-extrabold text-white text-base">Sin resultados</h3>
              <p className="text-xs text-[#A9B2C3]">No encontramos productos que coincidan con tus filtros. Intenta cambiando el término de búsqueda.</p>
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
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
              {displayedProducts.map((product) => {
              const profile = profiles[product.userId];
              const currency = profile?.currency || '$';
              const isOnSale = product.compareAtPrice && product.compareAtPrice > product.price;
              const discountPercentage = isOnSale 
                ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100) 
                : 0;

              return (
                <motion.div
                  key={product.id}
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
                    {isOnSale && (
                      <span className="absolute top-3 right-3 z-10 bg-[#E63946] text-white font-black text-[9px] uppercase px-2 py-0.5 rounded shadow tracking-wider">
                        -{discountPercentage}% OFF
                      </span>
                    )}

                    {product.imageURL ? (
                      <img 
                        src={product.imageURL} 
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        loading="lazy"
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
                      {product.category && (
                        <span className="text-[9px] font-black uppercase text-[#F4B400] tracking-widest block font-mono">
                          {product.category}
                        </span>
                      )}
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

          {/* Infinite Scroll loading indicator */}
          {visibleLimit < filteredProducts.length && (
            <div className="w-full flex flex-col items-center justify-center py-10 gap-2.5 mt-6 border-t border-dashed border-gray-900">
              <div className="w-6 h-6 border-2 border-[#E63946] border-t-transparent animate-spin rounded-full" />
              <p className="text-[10px] text-gray-400 font-extrabold tracking-widest uppercase animate-pulse">Cargando más productos...</p>
            </div>
          )}
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedProduct(null)}
                className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              />

              {/* Modal Container */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-[#111827] border border-[#232B3A] rounded-3xl w-full max-w-3xl relative overflow-hidden shadow-2xl flex flex-col z-10 max-h-[92vh]"
              >
                {/* Close Button - RED BACKGROUND */}
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-4 right-4 z-30 text-white font-bold p-1.5 transition cursor-pointer hover:scale-110 active:scale-95 bg-[#E63946] hover:bg-[#D62839] rounded-full border border-red-700 shadow-md shadow-red-900/35"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>

                {/* Scrollable Body */}
                <div className="flex-grow overflow-y-auto p-6 md:p-8 pb-4">
                  <div className="flex flex-col md:flex-row gap-6">
                    
                    {/* Left: Product Media */}
                    <div className="w-full md:w-1/2 aspect-square bg-[#090B12] flex items-center justify-center overflow-hidden border border-[#232B3A] rounded-2xl relative min-h-[250px] shrink-0">
                      {isOnSale && (
                        <span className="absolute top-4 left-4 z-10 bg-[#E63946] text-white font-black text-[10px] uppercase px-2.5 py-1 rounded shadow tracking-wider">
                          -{discountPercentage}% OFF
                        </span>
                      )}
                      {selectedProduct.imageURL ? (
                        <img 
                          src={selectedProduct.imageURL} 
                          alt={selectedProduct.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-gray-600 flex flex-col items-center gap-2">
                          <ShoppingBag className="w-12 h-12 opacity-45" />
                          <span className="text-xs font-mono opacity-40">Sin Imagen</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Details */}
                    <div className="flex-grow flex flex-col justify-start space-y-4 text-left">
                      {/* Category */}
                      {selectedProduct.category && (
                        <span className="text-[10px] font-black uppercase text-[#F4B400] tracking-widest font-mono bg-[#F4B400]/10 border border-[#F4B400]/20 py-1 px-2.5 rounded-lg inline-block self-start">
                          {selectedProduct.category}
                        </span>
                      )}

                      {/* Title */}
                      <h2 className="text-xl md:text-2xl font-black text-white leading-tight">
                        {selectedProduct.name}
                      </h2>

                      {/* Prices */}
                      <div className="flex items-baseline gap-3">
                        <span className="text-xl font-black text-[#E63946] font-mono">
                          {currency}{Number(selectedProduct.price || 0).toLocaleString()}
                        </span>
                        {isOnSale && (
                          <span className="text-sm text-[#A9B2C3] line-through font-mono">
                            {currency}{Number(selectedProduct.compareAtPrice || 0).toLocaleString()}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase text-[#A9B2C3] block">Descripción</span>
                        <p className="text-xs text-[#A9B2C3] leading-relaxed font-medium bg-[#090B12] border border-[#232B3A] p-3.5 rounded-xl">
                          {selectedProduct.description || 'Este producto no cuenta con descripción detallada en este momento.'}
                        </p>
                      </div>

                      {/* Variant choice drop-down */}
                      {selectedProduct.variantsText && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#A9B2C3] uppercase tracking-widest block">Elegir Variante / Opción</label>
                          <select
                            value={chosenVariant}
                            onChange={(e) => setChosenVariant(e.target.value)}
                            className="w-full h-10 bg-[#090B12] border border-[#232B3A] focus:border-[#E63946] text-xs px-3 rounded-lg outline-none text-white font-semibold"
                          >
                            {selectedProduct.variantsText.split(',').map((vari, vIdx) => (
                              <option key={vIdx} value={vari.trim()}>{vari.trim()}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* STICKY/FIXED FOOTER inside the selectedProduct modal */}
                <div className="p-6 pt-3 border-t border-[#232B3A] bg-[#090B12] shrink-0 z-20">
                  
                  {/* Merchant seller banner badge info */}
                  {profile && (
                    <div className="bg-[#111827] border border-[#232B3A] p-2.5 rounded-xl flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full border border-[#E63946]/40 bg-[#090B12] flex items-center justify-center overflow-hidden font-black text-[10px] text-[#E63946] shrink-0">
                          {profile.photoURL ? (
                            <img src={profile.photoURL} alt={profile.displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          ) : (
                            profile.displayName?.substring(0,2).toUpperCase() || 'SH'
                          )}
                        </div>
                        <div className="min-w-0 text-left">
                          <span className="text-[8px] font-black uppercase text-[#A9B2C3] block leading-none">Vendedor</span>
                          <h4 className="text-xs font-extrabold text-white truncate leading-tight">{profile.displayName || 'Tienda'}</h4>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedProduct(null);
                          onNavigateToStore(profile.username);
                        }}
                        className="px-2.5 py-1 bg-[#E63946]/15 hover:bg-[#E63946] text-[#E63946] hover:text-white font-extrabold text-[9px] uppercase tracking-wide rounded-lg border border-[#E63946]/30 transition cursor-pointer flex items-center gap-1"
                      >
                        Ver Tienda <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    {/* Quantity Controller */}
                    <div className="flex justify-between items-center bg-[#111827] p-3 rounded-xl border border-[#232B3A] w-full sm:w-auto sm:min-w-[160px]">
                      <span className="text-xs font-bold text-[#A9B2C3] mr-2">Cantidad:</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setBuyQuantity(q => q > 1 ? q - 1 : 1)}
                          className="p-1.5 bg-[#090B12] border border-[#232B3A] rounded hover:bg-[#232B3A] transition text-[#A9B2C3] hover:text-white"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-black text-white font-mono w-4 text-center">{buyQuantity}</span>
                        <button
                          type="button"
                          onClick={() => setBuyQuantity(q => q + 1)}
                          className="p-1.5 bg-[#090B12] border border-[#232B3A] rounded hover:bg-[#232B3A] transition text-[#A9B2C3] hover:text-white"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Add to Cart button */}
                    <div className="w-full sm:flex-1">
                      <button
                        onClick={handleAddToCart}
                        className="w-full py-3 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs rounded-xl transition uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-lg shadow-[#E63946]/20"
                      >
                        <ShoppingBag className="w-4 h-4 text-white stroke-[2.5]" />
                        Añadir al Carrito ({currency}{Number((selectedProduct.price || 0) * buyQuantity).toLocaleString()})
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
                    const profile = profiles[item.product.userId];
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
                          {item.product.imageURL ? (
                            <img src={item.product.imageURL} alt={item.product.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          ) : (
                            <ShoppingBag className="w-6 h-6 text-gray-600" />
                          )}
                        </div>

                        {/* Item Details */}
                        <div className="flex-1 min-w-0 pr-6 space-y-1">
                          <span className="text-[8px] font-black uppercase text-[#E63946] tracking-wider">
                            {profile?.displayName || 'Tienda'}
                          </span>
                          <h4 className="font-extrabold text-xs text-white truncate leading-none mb-1">
                            {item.product.name}
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
                              {currency}{(item.product.price * item.quantity).toLocaleString()}
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
                  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
                  const uniqueSellersCount = new Set(cart.map(item => item.product.userId)).size;
                  const totalDeliveryFee = uniqueSellersCount * systemDeliveryFee;
                  const total = subtotal + totalDeliveryFee;
                  const curr = profiles[cart[0].product.userId]?.currency || '$';

                  return (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs text-[#A9B2C3] font-bold">
                        <span>Subtotal:</span>
                        <span className="font-mono text-white">{curr}{subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-[#A9B2C3] font-bold">
                        <span>Domicilio ({uniqueSellersCount} {uniqueSellersCount === 1 ? 'tienda' : 'tiendas'}):</span>
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
                    placeholder="Ej: Laura Bermúdez"
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
                    placeholder="Ej: 3157785706"
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
                      onClick={() => setDeliveryType('delivery')}
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

                {/* Dispatch Address */}
                <div>
                  <label className="text-[10px] font-black uppercase text-[#A9B2C3] block mb-1">
                    {deliveryType === 'pickup' ? 'Detalles o Nota de Recogida (Opcional)' : 'Dirección Completa de Despacho *'}
                  </label>
                  <input 
                    type="text" 
                    required={deliveryType === 'delivery'}
                    value={custAddress}
                    onChange={(e) => setCustAddress(e.target.value)}
                    placeholder={deliveryType === 'pickup' ? 'Ej: Paso a las 2:00 PM o voy en carro placa XYZ' : 'Ej: Calle 45 #23-12, Apto 402, Bogotá'}
                    className="w-full h-11 bg-white border border-[#232B3A] focus:border-[#E63946] rounded-xl px-3.5 text-xs font-semibold outline-none text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-[#E63946]/20"
                  />
                </div>

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
                  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
                  const uniqueSellersCount = new Set(cart.map(item => item.product.userId)).size;
                  const totalDeliveryFee = deliveryType === 'pickup' ? 0 : uniqueSellersCount * systemDeliveryFee;
                  const total = subtotal + totalDeliveryFee;
                  const curr = profiles[cart[0].product.userId]?.currency || '$';

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
                    setCustomerPortalTab('wheel');
                    setIsCustomerPortalOpen(true);
                  }}
                  className="w-full py-3 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-black font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  <Crown className="w-4 h-4 text-black" />
                  ¡Girar Ruleta de Platos Gratis & Rastrear Pedido!
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

      {/* 6. Footer */}
      <footer className="border-t border-[#232B3A] py-12 px-4 sm:px-6 md:px-8 bg-[#090B12] text-[#A9B2C3] text-center text-xs mt-12 space-y-3">
        <p className="font-extrabold text-white text-sm">Ryyco — Pide comida, descubre restaurantes y recibe recomendaciones</p>
        <p className="text-gray-400 max-w-2xl mx-auto text-[11px] leading-relaxed">
          Plataforma gastronómica inteligente para pedir comida online y a domicilio en Colombia. Explora platos, consulta menús y descubre qué quieres comer hoy.
        </p>
        <p className="text-gray-500 text-[10px] pt-2">© 2026 Ryyco (linnkpro.store). Todos los derechos reservados.</p>
      </footer>

    </div>
  );
}
