/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  fetchProfileByUsername, 
  trackPageView, 
  trackLinkClick, 
  submitContactLead,
  saveOrder,
  fetchSystemSettings,
  checkIsStoreClosed,
  saveCustomerProfile,
  fetchCustomerProfileByPhone
} from '../lib/firebase';
import { isFoodCategory, isFoodProduct } from './TiendaGeneral';
import CustomerPortalModal from './CustomerPortalModal';
import { 
  UserProfile, 
  LinkItem, 
  SocialLinks, 
  CustomTheme, 
  ProductItem, 
  OrderItem,
  LeadItem,
  BankAccount,
  CustomerProfile
} from '../types';
import { 
  Share2, 
  Copy, 
  Check, 
  MapPin, 
  Phone, 
  Mail, 
  QrCode, 
  Download, 
  ChevronRight, 
  ShoppingBag, 
  Send, 
  Globe, 
  Instagram, 
  Facebook, 
  Youtube, 
  Twitter, 
  Music, 
  MessageCircle, 
  ExternalLink,
  Plus,
  Minus,
  Trash2,
  Lock,
  Wallet,
  Landmark,
  Truck,
  ArrowRight,
  X,
  Heart,
  Search,
  User,
  Shirt,
  Cpu,
  Terminal,
  Flame,
  Utensils,
  Wine,
  ChefHat,
  Smartphone,
  AlertTriangle,
  Store,
  Crown,
  Trophy,
  Gift,
  Sparkles,
  Star,
  Ticket
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import StoreQRModal from './StoreQRModal';
import { getFontClass } from './ThemeStyles';

// Custom Tiktok Icon component to match lucide-react styling
const Tiktok = ({ className = "w-4 h-4", ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

export function cleanColombianPhone(rawInput: string): string {
  if (!rawInput) return '';
  // 1. Remove all non-digits (spaces, dashes, parentheses, dots, etc.)
  let digits = rawInput.replace(/\D/g, '');
  
  // 2. If it starts with '57' and has 12 or more digits, remove '57'
  if (digits.startsWith('57') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  
  // 3. Keep only up to 10 digits
  return digits.slice(0, 10);
}

export function formatColombianPhoneWith57(rawInput: string): string {
  if (!rawInput) return '';
  let digits = rawInput.replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length >= 12) {
    return '+57' + digits.slice(2, 12);
  }
  if (digits.length === 10) {
    return '+57' + digits;
  }
  if (digits.length > 0 && !digits.startsWith('57')) {
    return '+57' + digits.slice(0, 10);
  }
  if (digits.startsWith('57')) {
    return '+' + digits;
  }
  return digits ? '+57' + digits : '';
}

interface PublicProfileProps {
  username: string;
  onNavigateHome?: (claimUsername?: string) => void;
}

export default function PublicProfile({ username, onNavigateHome }: PublicProfileProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [theme, setTheme] = useState<CustomTheme | null>(null);
  
  // Custom Cart state
  const [cart, setCart] = useState<{
    id: string;
    product: ProductItem;
    selectedVariant: string;
    quantity: number;
  }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Cart customer form details
  const [systemDeliveryFee, setSystemDeliveryFee] = useState(7000);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custNotes, setCustNotes] = useState('');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [payMethod, setPayMethod] = useState<'whatsapp' | 'transfer' | 'cod'>('whatsapp');
  const [uploadedOrderProofBase64, setUploadedOrderProofBase64] = useState('');
  const [createAccountWithOrder, setCreateAccountWithOrder] = useState(true);

  // Customer Portal & Rewards State
  const [isCustomerPortalOpen, setIsCustomerPortalOpen] = useState(false);
  const [customerPortalTab, setCustomerPortalTab] = useState<'orders' | 'wheel' | 'rewards' | 'profile'>('orders');
  const [activeCustomer, setActiveCustomer] = useState<CustomerProfile | null>(null);
  const [appliedRewardCode, setAppliedRewardCode] = useState('');
  const [rewardDiscountAmount, setRewardDiscountAmount] = useState(0);

  // Auto-load customer profile from local storage if previously logged in
  useEffect(() => {
    const savedPhone = localStorage.getItem('ryyco_active_customer_phone');
    if (savedPhone) {
      fetchCustomerProfileByPhone(savedPhone).then(cust => {
        if (cust) {
          setActiveCustomer(cust);
          if (!custPhone) setCustPhone(cust.phone);
          if (!custName) setCustName(cust.name);
          if (!custAddress && cust.address) setCustAddress(cust.address);
          if (!custEmail && cust.email) setCustEmail(cust.email);
          if (!custNotes && cust.notes) setCustNotes(cust.notes);
        }
      }).catch(() => {});
    }
  }, []);

  // Bank details state
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);
  const [expandedQRUrl, setExpandedQRUrl] = useState<string | null>(null);

  const handleCopyAccountNumber = (num: string, id: string) => {
    navigator.clipboard.writeText(num);
    setCopiedAccountId(id);
    setTimeout(() => setCopiedAccountId(null), 2000);
  };

  // Checkout outcome modal state
  const [submittedOrder, setSubmittedOrder] = useState<OrderItem | null>(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const orderSubmittingRef = useRef(false);

  // Catalogue Active category tag
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);

  // Interactivity
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrFgColor, setQrFgColor] = useState('#000000');
  const [qrBgColor, setQrBgColor] = useState('#ffffff');
  const [includeLogo, setIncludeLogo] = useState(true);

  // Form Contact Lead states
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadMsg, setLeadMsg] = useState('');
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadSubmitting, setLeadSubmitting] = useState(false);

  // Product Selection overlay state
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [chosenVariant, setChosenVariant] = useState('');
  const [buyQuantity, setBuyQuantity] = useState(1);

  const qrRef = useRef<HTMLDivElement>(null);

  // Helper to normalize categories for robust matching
  const normalizeCat = (c?: string) => {
    if (!c) return '';
    return c.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim().toUpperCase();
  };

  const matchesCategoryFilter = (prodCat?: string, filterCat?: string) => {
    if (!filterCat || filterCat === 'Todos' || filterCat === 'all') return true;
    const p = (prodCat || 'General').trim();
    if (p.toUpperCase() === filterCat.trim().toUpperCase()) return true;
    const pClean = normalizeCat(p);
    const fClean = normalizeCat(filterCat);
    return pClean.length > 0 && pClean === fClean;
  };

  // Filter products by tag and search query (food categories and products prioritized)
  // Only categories that actually contain products are shown!
  const uniqueCategories: string[] = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    products.forEach(p => {
      const original = (p.category || 'General').trim();
      if (original) {
        const key = normalizeCat(original) || original.toUpperCase();
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { label: original, count: 1 });
        }
      }
    });

    const validCategories = Array.from(map.values())
      .filter(item => item.count > 0)
      .map(item => item.label);

    const foodList = validCategories.filter(c => isFoodCategory(c)).sort((a, b) => a.localeCompare(b));
    const nonFoodList = validCategories.filter(c => !isFoodCategory(c)).sort((a, b) => a.localeCompare(b));
    return ['Todos', ...foodList, ...nonFoodList];
  }, [products]);

  // Auto-reset category if no products match
  useEffect(() => {
    if (selectedCategory !== 'Todos') {
      const hasProducts = products.some(p => matchesCategoryFilter(p.category, selectedCategory));
      if (!hasProducts) {
        setSelectedCategory('Todos');
      }
    }
  }, [products, selectedCategory]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = matchesCategoryFilter(p.category, selectedCategory);
      const matchesSearch = !searchQuery.trim() || 
        (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    }).sort((a, b) => {
      const foodA = isFoodProduct(a);
      const foodB = isFoodProduct(b);
      if (foodA && !foodB) return -1;
      if (!foodA && foodB) return 1;
      return 0;
    });
  }, [products, selectedCategory, searchQuery]);

  const [visibleLimit, setVisibleLimit] = useState(8);

  // Reset limit when filter / search changes
  useEffect(() => {
    setVisibleLimit(8);
  }, [selectedCategory, searchQuery]);

  // Infinite Scroll scroll listener
  useEffect(() => {
    const handleScroll = () => {
      // Check if scrolled near the bottom of the window
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

  const totalCartCost = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  }, [cart]);

  const totalCartUnitsCount = useMemo(() => {
    return cart.reduce((uq, item) => uq + item.quantity, 0);
  }, [cart]);

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const isStoreClosedNow = useMemo(() => {
    return checkIsStoreClosed(profile);
  }, [profile, nowTick]);

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isSubscribed = true;
    async function loadData() {
      setLoading(true);
      const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      try {
        let res = await fetchProfileByUsername(username);
        
        // Auto-retry once after 1 second if profile wasn't found on cold initial load
        if (!res?.profile && isSubscribed) {
          await new Promise(r => setTimeout(r, 1000));
          if (isSubscribed) {
            res = await fetchProfileByUsername(username);
          }
        }

        if (!isSubscribed) return;

        // Formulate loaded values with multi-tier failover
        let finalProfile = res?.profile || null;
        let finalLinks = (res?.profile && res?.links) ? res.links.filter(l => l && l.active) : [];
        let finalProducts = (res?.profile && res?.products) ? res.products.filter(p => p && p.active) : [];
        let finalTheme = res?.profile ? res?.customTheme : null;

        // Fallback Tier 2: Check localized index registry
        if (!finalProfile) {
          try {
            const localProfiles = JSON.parse(localStorage.getItem('linnk_profiles') || '{}');
            if (localProfiles[clean]) {
              finalProfile = localProfiles[clean];
              const uid = finalProfile.uid;
              finalLinks = JSON.parse(localStorage.getItem(`linnk_links_${uid}`) || '[]').filter((l: any) => l && l.active);
              finalProducts = JSON.parse(localStorage.getItem(`linnk_products_${uid}`) || '[]').filter((p: any) => p && p.active);
              finalTheme = JSON.parse(localStorage.getItem(`linnk_theme_${uid}`) || 'null');
              console.log("Loaded public profile via local sandbox fallback registry", clean);
            }
          } catch (e) {
            console.warn("Registry fallback parse failed", e);
          }
        }

        if (finalProfile) {
          setProfile(finalProfile);
          setLinks(finalLinks);
          setProducts(finalProducts);
          setTheme(finalTheme);
          
          // Track the public Page View
          trackPageView(finalProfile.uid);
        } else {
          setProfile(null);
        }

        // Fetch system delivery fee setting
        try {
          const sysSettings = await fetchSystemSettings();
          if (sysSettings?.defaultDeliveryFee && isSubscribed) {
            setSystemDeliveryFee(sysSettings.defaultDeliveryFee);
          }
        } catch (e) {}
      } catch (err) {
        console.error("Error fetching public shop storefront", err);
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      isSubscribed = false;
    };
  }, [username, retryCount]);

  const copyUrl = () => {
    const u = `${window.location.origin}/${username}`;
    navigator.clipboard.writeText(u);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQrPng = () => {
    if (!qrRef.current) return;
    const canvas = qrRef.current.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `tienda_${username}_qr.png`;
      a.click();
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !leadName || !leadEmail) return;
    setLeadSubmitting(true);
    
    const lead: LeadItem = {
      id: `temp_${Date.now()}`,
      userId: profile.uid,
      name: leadName,
      email: leadEmail,
      message: leadMsg,
      createdAt: new Date().toISOString()
    };

    try {
      await submitContactLead(lead);
      setLeadSuccess(true);
      setLeadName('');
      setLeadEmail('');
      setLeadMsg('');
      setTimeout(() => setLeadSuccess(false), 5000);
    } catch(err) {
      console.error(err);
    } finally {
      setLeadSubmitting(false);
    }
  };

  const handleLinkClick = (linkId: string, title: string) => {
    if (!profile) return;
    trackLinkClick(profile.uid, linkId, title);
  };

  // Cart operations
  const handleOpenProductSelection = (prod: ProductItem) => {
    const variants = prod.variantsText ? prod.variantsText.split(',').map(s => s.trim()) : [];
    setSelectedProduct(prod);
    setChosenVariant(variants.length > 0 ? variants[0] : '');
    setBuyQuantity(1);
  };

  const handleAddProductToCart = () => {
    if (!selectedProduct) return;
    
    const cartItemId = `${selectedProduct.id}_${chosenVariant}`;
    setCart(prev => {
      const matchIdx = prev.findIndex(item => item.id === cartItemId);
      if (matchIdx > -1) {
        const updated = [...prev];
        updated[matchIdx].quantity += buyQuantity;
        return updated;
      }
      return [
        ...prev,
        {
          id: cartItemId,
          product: selectedProduct,
          selectedVariant: chosenVariant,
          quantity: buyQuantity
        }
      ];
    });

    setSelectedProduct(null);
    setIsCartOpen(true);
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

  // Complete Checkout Order placement
  const handlePlaceOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || cart.length === 0 || orderSubmittingRef.current) return;
    
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

    orderSubmittingRef.current = true;
    setOrderSubmitting(true);
    const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    const deliveryFee = deliveryType === 'pickup' ? 0 : systemDeliveryFee;
    const finalDiscount = Math.min(subtotal, rewardDiscountAmount);
    const totalSum = Math.max(0, subtotal + deliveryFee - finalDiscount);
    const rNo = Math.floor(1000 + Math.random() * 9000);

    const formattedPhone = formatColombianPhoneWith57(custPhone);
    const finalAddress = deliveryType === 'pickup' 
      ? (custAddress.trim() ? `Recoger en Restaurante / Local (Nota: ${custAddress.trim()})` : `Recoger en Restaurante / Local (${profile.displayName || profile.username})`)
      : custAddress.trim();

    let finalNotes = custNotes.trim();
    if (appliedRewardCode) {
      finalNotes = `[Cupón Aplicado: ${appliedRewardCode} - Descuento: $${finalDiscount.toLocaleString('es-CO')}] ${finalNotes}`.trim();
    }

    const newOrder: OrderItem = {
      id: `order_${Date.now()}`,
      storeOwnerId: profile.uid,
      storeName: profile.displayName || profile.username,
      storeAddress: profile.address || profile.location || 'Dirección de la Tienda',
      storePhone: profile.customerServiceWhatsapp || profile.whatsapp || profile.ownerWhatsapp || profile.phone,
      orderNumber: rNo,
      customerName: custName.trim(),
      customerPhone: formattedPhone,
      customerEmail: custEmail.trim() || undefined,
      customerAddress: finalAddress,
      items: cart.map(item => ({
        productId: item.product.id,
        name: item.product.name,
        price: item.product.price,
        quantity: item.quantity,
        selectedVariant: item.selectedVariant || undefined
      })),
      totalAmount: totalSum,
      deliveryFee: deliveryFee,
      orderType: deliveryType === 'pickup' ? 'pickup' : 'delivery',
      paymentMethod: payMethod,
      notes: finalNotes || undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
      proofImage: uploadedOrderProofBase64 || undefined
    };

    try {
      const savedOrder = await saveOrder(newOrder);
      setSubmittedOrder(savedOrder);

      // Save / update customer profile with details and address
      if (createAccountWithOrder || custPhone) {
        try {
          saveCustomerProfile({
            phone: cleanedPhone,
            name: custName.trim(),
            address: custAddress.trim(),
            email: custEmail.trim(),
            notes: custNotes.trim()
          }).then(updated => {
            setActiveCustomer(updated);
          }).catch(err => console.warn("Failed background customer profile creation:", err));
        } catch (e) {}
      }
      
      // Clear out customer cart local states
      setCart([]);
      setUploadedOrderProofBase64('');
      setAppliedRewardCode('');
      setRewardDiscountAmount(0);
      setIsCartOpen(false);
      setIsCheckoutOpen(false);

      // Auto-trigger WhatsApp message instantly to ensure delivery to the merchant
      try {
        triggerShopperWhatsAppMessage(savedOrder);
      } catch (e) {
        console.warn("Auto-redirect blocked by browser, manual fallback remains available", e);
      }
    } catch(err) {
      console.error(err);
      alert("Ocurrió un error al registrar el pedido. Intenta nuevamente.");
    } finally {
      orderSubmittingRef.current = false;
      setOrderSubmitting(false);
    }
  };

  // Launch WhatsApp pre-packaged checkout dispatch message
  const triggerShopperWhatsAppMessage = (order: OrderItem) => {
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
    if (order.customerEmail) msg += `✉️ Email: ${order.customerEmail}\n`;
    msg += `📍 ${isPickup ? 'Entrega' : 'Despacho'}: ${order.customerAddress}\n`;
    if (order.notes) msg += `✍️ Notas: ${order.notes}\n\n`;
    msg += `Método de pago: *${order.paymentMethod === 'whatsapp' ? 'WhatsApp Directo' : order.paymentMethod === 'transfer' ? 'Transferencia Bancaria' : 'Pago contra Entrega'}*\n`;
    if (order.proofImage) {
      msg += `📸 *Comprobante de compra:* Adjunto en linnkpro.store\n`;
    }
    msg += `¡Espero confirmación para continuar con el ${isPickup ? 'pedido para recoger' : 'pago/envío'}!`;

    const cleanMsg = encodeURIComponent(msg);
    let targetPhone = profile.customerServiceWhatsapp || profile.whatsapp || profile.ownerWhatsapp || profile.phone || '';
    let cleanedWhatsapp = targetPhone.replace(/[^0-9]/g, '');
    
    // Auto-fix: if it's a 10 digit Colombian celular (starts with 3), automatically prepend country code '57'
    if (cleanedWhatsapp.length === 10 && cleanedWhatsapp.startsWith('3')) {
      cleanedWhatsapp = '57' + cleanedWhatsapp;
    }
    
    window.open(`https://wa.me/${cleanedWhatsapp || '573000000000'}?text=${cleanMsg}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090B12] flex items-center justify-center flex-col gap-4 text-gray-100">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-[#E63946]/20 border-t-[#E63946] animate-spin" />
          <div className="w-6 h-6 rounded-full border-2 border-[#F4B400]/30 border-b-[#F4B400] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </div>
        <p className="text-gray-300 font-bold animate-pulse text-sm">Cargando tienda virtual...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#090b12] text-gray-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 bg-amber-400/10 border border-amber-500/20 rounded-3xl mb-6 text-amber-400 shrink-0">
          <QrCode className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-black mb-2">Tienda no encontrada</h2>
        <p className="text-gray-400 max-w-sm mb-6 text-sm">No pudimos encontrar la tienda &apos;{username}&apos;. Si acabas de actualizar la página o es un enlace directo, intenta recargar.</p>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <button 
            onClick={() => setRetryCount(prev => prev + 1)}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl px-5 py-3 text-sm transition-all shadow-lg shadow-emerald-500/20"
          >
            Reintentar Cargar
          </button>
          
          <button 
            onClick={() => onNavigateHome ? onNavigateHome() : window.location.href = '/tienda'}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl px-5 py-3 text-sm border border-slate-700 transition-all"
          >
            Ir a Tiendas Disponibles
          </button>
        </div>

        <button 
          onClick={() => onNavigateHome ? onNavigateHome(username) : undefined}
          className="mt-6 text-xs text-emerald-400 hover:underline font-medium"
        >
          ¿Es tu negocio? Reclamar @{username} Gratis
        </button>
      </div>
    );
  }

  if (profile.suspended || profile.subscriptionStatus === 'suspended') {
    const whatsappContact = "3219730865";
    const waClean = "573219730865";
    const waMsg = encodeURIComponent(`Hola, realizo la consulta sobre el pago para reactivar mi tienda @${profile.username} (${profile.displayName || 'Tienda'}).`);
    const waUrl = `https://wa.me/${waClean}?text=${waMsg}`;

    return (
      <div className="min-h-screen bg-[#090b12] text-gray-100 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        {/* Ambient Glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] bg-red-600/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[24rem] h-[24rem] bg-amber-500/15 rounded-full blur-[90px] pointer-events-none" />

        <div className="max-w-md w-full bg-gray-950/90 border border-red-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-2xl relative z-10 flex flex-col items-center">
          {/* Status Badge */}
          <div className="p-4 bg-gradient-to-tr from-red-500/20 to-amber-500/20 border border-red-500/30 rounded-2xl mb-5 text-red-400 shadow-xl animate-pulse">
            <AlertTriangle className="w-12 h-12 stroke-[2.2]" />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-[11px] font-black tracking-widest uppercase mb-3">
            <Store className="w-3.5 h-3.5" />
            <span>TIENDA SUSPENDIDA</span>
          </div>

          <h2 className="text-2xl font-black text-white mb-1 tracking-tight">
            {profile.displayName || `@${profile.username}`}
          </h2>
          <p className="text-xs text-gray-500 font-mono mb-4">@{profile.username}</p>

          <div className="w-12 h-1 bg-gradient-to-r from-red-500 via-amber-500 to-red-500 rounded-full my-1" />

          {/* Prompt required text */}
          <div className="my-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
            <h3 className="text-base sm:text-lg font-black text-amber-300 leading-snug">
              Realiza el pago de tu tienda para seguir vendiendo
            </h3>
            <p className="text-xs text-amber-200/80 mt-1.5 font-medium">
              Esta tienda se encuentra suspendida temporalmente por vencimiento de suscripción.
            </p>
          </div>

          {/* WhatsApp Contact Action Button */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-black text-sm rounded-2xl transition-all shadow-xl hover:shadow-emerald-500/20 flex items-center justify-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <MessageCircle className="w-5 h-5 fill-black stroke-none" />
            <span>Contactar WhatsApp: {whatsappContact}</span>
          </a>

          {onNavigateHome && (
            <button
              type="button"
              onClick={() => onNavigateHome()}
              className="mt-6 text-xs text-gray-500 hover:text-gray-300 font-semibold transition"
            >
              ← Volver al Inicio
            </button>
          )}
        </div>
      </div>
    );
  }

  // Fallback Theme values
  const activeTheme: CustomTheme = theme || {
    id: 'midnight',
    name: 'Midnight Elegance',
    bgType: 'flat',
    bgColor: '#090d16',
    textColor: '#ffffff',
    cardBg: '#111625',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    cardTextColor: '#ffffff',
    fontFamily: 'font-sans',
    buttonStyle: 'rounded',
  };

  const getStoreCurrency = () => profile.currency || '$';

  // Social handles
  const socialLinks: SocialLinks = {
    whatsapp: profile.whatsapp,
    instagram: profile.instagram,
    facebook: profile.facebook,
    tiktok: profile.tiktok,
    youtube: profile.youtube,
    twitter: profile.twitter,
  };

  const renderSocialIcon = (key: string) => {
    const cn = "w-4.5 h-4.5 transition-transform hover:scale-115";
    switch(key) {
      case 'instagram': return <Instagram className={cn} />;
      case 'facebook': return <Facebook className={cn} />;
      case 'youtube': return <Youtube className={cn} />;
      case 'twitter': return <Twitter className={cn} />;
      case 'tiktok': return <Tiktok className={cn} />;
      case 'whatsapp': return <MessageCircle className={cn} />;
      default: return <Globe className={cn} />;
    }
  };

  const renderHeroSocials = () => {
    const hasSocials = Object.entries(socialLinks).some(([key, value]) => value && String(value).trim().length > 0);
    if (!hasSocials) return null;

    return (
      <div className="flex flex-wrap items-center justify-center gap-3.5 mt-2 mb-7">
        {Object.entries(socialLinks).map(([key, value]) => {
          if (!value) return null;

          const valStr = String(value).trim();
          let url = valStr;
          if (key === 'whatsapp') {
            url = `https://wa.me/${valStr.replace(/[^0-9]/g, '')}`;
          } else if (key === 'instagram' && !valStr.includes('http')) {
            url = `https://instagram.com/${valStr}`;
          } else if (key === 'facebook' && !valStr.includes('http')) {
            url = `https://facebook.com/${valStr}`;
          } else if (key === 'tiktok' && !valStr.includes('http')) {
            url = `https://tiktok.com/@${valStr.replace(/^@/, '')}`;
          } else if (key === 'youtube' && !valStr.includes('http')) {
            url = `https://youtube.com/${valStr}`;
          } else if (key === 'twitter' && !valStr.includes('http')) {
            url = `https://x.com/${valStr}`;
          }

          let brandHoverBg = 'hover:bg-indigo-600 hover:border-indigo-500';
          if (key === 'whatsapp') brandHoverBg = 'hover:bg-emerald-600 hover:border-emerald-500';
          else if (key === 'instagram') brandHoverBg = 'hover:bg-pink-600 hover:border-pink-500';
          else if (key === 'facebook') brandHoverBg = 'hover:bg-blue-600 hover:border-blue-500';
          else if (key === 'tiktok') brandHoverBg = 'hover:bg-teal-600 hover:border-teal-500';
          else if (key === 'youtube') brandHoverBg = 'hover:bg-red-600 hover:border-red-500';

          return (
            <a 
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleLinkClick(`hero_social_${key}`, `Hero Social ${key}`)}
              className={`w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center transition-all duration-300 transform hover:scale-110 active:scale-95 text-white/95 shadow-md ${brandHoverBg}`}
              title={`Seguir en ${key}`}
            >
              {renderSocialIcon(key)}
            </a>
          );
        })}
      </div>
    );
  };

  const renderContactForm = () => {
    return (
      <div 
        className="w-full p-6 rounded-3xl border backdrop-blur-sm shadow-md"
        style={{ backgroundColor: activeTheme.cardBg, borderColor: activeTheme.cardBorder, color: activeTheme.cardTextColor }}
      >
        <h3 className="text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 opacity-80">
          <Mail className="w-4 h-4 text-emerald-400" /> Enviar Mensaje
        </h3>
        <p className="text-[11px] opacity-70 mb-4 font-semibold leading-relaxed">¿Tienes alguna duda o quieres coordinar un pedido especial? Envíame tus datos:</p>
        
        {leadSuccess ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl text-xs font-bold text-center animate-fade-in">
            ✓ ¡Mensaje recibido! Nos comunicaremos contigo muy pronto.
          </div>
        ) : (
          <form onSubmit={handleLeadSubmit} className="space-y-3">
            <input 
              type="text" 
              required
              placeholder="Tu nombre completo"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-emerald-500/30 text-white"
            />
            <input 
              type="email" 
              required
              placeholder="Tu correo electrónico"
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-emerald-500/30 text-white"
            />
            <textarea 
              placeholder="Escribe tu consulta detallada acá..."
              required
              rows={2}
              value={leadMsg}
              onChange={(e) => setLeadMsg(e.target.value)}
              className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-emerald-500/30 text-white resize-none"
            />
            <button 
              type="submit"
              disabled={leadSubmitting}
              className="w-full py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" /> 
              {leadSubmitting ? 'Enviando...' : 'Enviar Mensaje'}
            </button>
          </form>
        )}
      </div>
    );
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const getCategoryIcon = (catName: string) => {
    const name = catName.toLowerCase();
    if (name.includes('camis') || name.includes('t-shirt') || name.includes('remera') || name.includes('ropa') || name.includes('polo')) {
      return <Shirt className="w-5 h-5 text-inherit" />;
    }
    if (name.includes('chaq') || name.includes('jack') || name.includes('abrigo') || name.includes('outer') || name.includes('saco')) {
      return <ShoppingBag className="w-5 h-5 text-inherit" />;
    }
    if (name.includes('zap') || name.includes('tenis') || name.includes('shoe') || name.includes('calz') || name.includes('bota')) {
      return <Flame className="w-5 h-5 text-inherit" />;
    }
    if (name.includes('acc') || name.includes('gorra') || name.includes('bols') || name.includes('joy') || name.includes('cap') || name.includes('gaf')) {
      return <ShoppingBag className="w-5 h-5 text-inherit" />;
    }
    return <ShoppingBag className="w-5 h-5 text-inherit" />;
  };

  const storeLayout = profile?.layout || 'default';

  return (
    <div 
      className={`min-h-screen relative flex flex-col select-text overflow-x-hidden pb-0 ${getFontClass(activeTheme.fontFamily)}` }
      style={{
        backgroundImage: activeTheme.bgType === 'gradient' ? activeTheme.bgColor : undefined,
        backgroundColor: activeTheme.bgType === 'flat' ? activeTheme.bgColor : undefined,
        color: activeTheme.textColor
      }}
    >
      {/* Animated closed store banner */}
      {isStoreClosedNow && (
        <div className="relative w-full bg-red-600 text-white font-black text-xs uppercase tracking-[0.2em] py-3.5 px-4 overflow-hidden z-50 flex items-center justify-center gap-2 border-b border-red-700 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-red-500 to-red-600 opacity-75 animate-pulse"></div>
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
          </span>
          <span className="relative z-10 flex items-center gap-2 text-center leading-normal">
            <AlertTriangle className="w-4 h-4 animate-bounce shrink-0 text-white" />
            <span className="animate-pulse">
              {profile?.scheduleEnabled && profile?.openTime && profile?.closeTime && !profile?.isClosed
                ? `TIENDA CERRADA POR HORARIO (${profile.openTime} - ${profile.closeTime}) • NO SE RECIBEN PEDIDOS`
                : 'TIENDA CERRADA TEMPORALMENTE • NO SE ESTÁN RECIBIENDO PEDIDOS'}
            </span>
          </span>
        </div>
      )}
      
      {/* 1. STICKY CLIENT HEADER NAVBAR (DIRECT REFERENCE MATCH) */}
      <header 
        className="w-full h-20 border-b sticky top-0 z-40 transition-all backdrop-blur-md shadow-sm"
        style={{ 
          backgroundColor: `${activeTheme.cardBg}df`, 
          borderColor: activeTheme.cardBorder || 'rgba(255,255,255,0.08)',
          color: activeTheme.textColor 
        }}
      >
        <div className="max-w-7xl mx-auto h-full px-4 md:px-8 flex items-center justify-between">
          
          {/* Left: Dynamic Brand Logo branding */}
          <div 
            onClick={() => scrollToSection('store-hero')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className={`w-13 h-13 sm:w-14 sm:h-14 md:w-15 md:h-15 ${profile.photoURL ? 'rounded-full border-2 border-emerald-400/40 shadow-sm' : 'rounded-xl border-r-4 border-emerald-400'} bg-black text-white dark:bg-white dark:text-black font-extrabold flex items-center justify-center text-sm tracking-tighter group-hover:scale-105 transition-transform overflow-hidden shrink-0`}>
              {profile.photoURL ? (
                <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (profile.displayName || 'M')[0].toUpperCase()
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm md:text-[15px] font-black tracking-widest uppercase leading-none">
                {profile.displayName || 'MODA URBANA'}
              </span>
            </div>
          </div>

          {/* Center: Reference Navigation links */}
          <nav className="hidden md:flex items-center gap-8 text-[11px] font-bold tracking-widest text-inherit/90">
            <button 
              onClick={() => scrollToSection('store-hero')} 
              className="hover:text-emerald-400 transition cursor-pointer uppercase opacity-80 hover:opacity-100"
            >
              Inicio
            </button>
            <button 
              onClick={() => scrollToSection('store-category-row')} 
              className="hover:text-emerald-400 transition cursor-pointer uppercase opacity-80 hover:opacity-100"
            >
              Categorías
            </button>
            {products.length > 0 && (
              <button 
                onClick={() => { setSelectedCategory('Todos'); scrollToSection('store-catalog'); }} 
                className="hover:text-emerald-400 transition cursor-pointer uppercase opacity-80 hover:opacity-100"
              >
                Nuevos Llegados
              </button>
            )}
            <button 
              onClick={() => scrollToSection('store-contact')} 
              className="hover:text-emerald-400 transition cursor-pointer uppercase opacity-80 hover:opacity-100"
            >
              Contacto
            </button>
          </nav>

          {/* Right: Premium E-Commerce Utility Toolbar */}
          <div className="flex items-center gap-2 md:gap-3 text-inherit">

            {/* Search toggler */}
            <button 
              onClick={() => setIsSearchBarOpen(!isSearchBarOpen)}
              className={`p-2 rounded-full hover:bg-white/5 active:scale-95 transition relative cursor-pointer ${isSearchBarOpen ? 'text-emerald-400' : ''}`}
              title="Buscar"
            >
              <Search className="w-[19px] h-[19px]" />
            </button>

            {/* Quick Share Link Tools (QR Code popup modal) */}
            <button 
              onClick={() => setShowQrModal(true)}
              className="p-2 rounded-full hover:bg-white/5 active:scale-95 transition cursor-pointer text-inherit/80"
              title="Compartir Tienda QR"
            >
              <QrCode className="w-[19px] h-[19px]" />
            </button>

            {/* Favourited Heart Widget indicator */}
            <div className="relative group cursor-pointer p-2 hidden sm:block">
              <Heart className="w-[19px] h-[19px] group-hover:text-red-500 group-hover:fill-red-500 transition" />
              <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            </div>

            {/* Shoppable cart badge element */}
            <button 
              onClick={() => setIsCartOpen(true)}
              className="p-2 bg-emerald-400 hover:bg-emerald-300 text-black rounded-full flex items-center justify-center gap-1.5 transition shadow cursor-pointer"
              title="Ver Carrito de Pedido"
            >
              <ShoppingBag className="w-4 h-4 text-black stroke-[2.5]" />
              <span className="text-[10px] font-black px-1.5 py-0.5 bg-black text-emerald-400 rounded-full leading-none">
                {totalCartUnitsCount}
              </span>
            </button>

          </div>
        </div>

        {/* Slide-down search input header proxy */}
        <AnimatePresence>
          {isSearchBarOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="w-full border-b px-4 py-3 bg-black/40 backdrop-blur-lg flex justify-center z-30"
              style={{ borderColor: activeTheme.cardBorder }}
            >
              <div className="w-full max-w-lg relative">
                <input 
                  type="text"
                  placeholder="Escribe para buscar camisetas, chaquetas, accesorios o calzado..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 px-4 py-2.5 pl-10 pr-10 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <Search className="w-4 h-4 text-emerald-400 absolute left-3.5 top-3.5" />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')} 
                    className="absolute right-3.5 top-3 text-[10px] font-black uppercase text-gray-400 hover:text-white"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* 2. IMMERSIVE HERO AREA */}
      {storeLayout === 'liquor' ? (
        <section 
          id="store-hero" 
          className="w-full relative min-h-[440px] md:min-h-[520px] lg:min-h-[600px] flex items-center justify-center bg-[#0c0617] overflow-hidden text-center border-b border-purple-500/20"
        >
          <div className="absolute inset-0 z-0">
            {profile.coverURL ? (
              <img 
                src={profile.coverURL} 
                alt="Portada Licorera" 
                className="w-full h-full object-cover opacity-50 scale-102 filter contrast-125 saturate-120" 
                style={{ opacity: profile.coverOpacity !== undefined ? profile.coverOpacity / 100 : undefined }}
              />
            ) : (
              <img 
                src="https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1800&q=80" 
                alt="Licorera Express" 
                className="w-full h-full object-cover opacity-45 filter contrast-120" 
                style={{ opacity: profile.coverOpacity !== undefined ? profile.coverOpacity / 100 : undefined }}
              />
            )}
            <div className="absolute -left-1/4 -bottom-1/4 w-[150%] h-[150%] bg-gradient-to-tr from-purple-600/20 via-pink-500/10 to-transparent pointer-events-none" />
          </div>

          <div className="relative z-10 max-w-4xl px-4 py-16 flex flex-col items-center">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight tracking-tight mb-4 max-w-3xl drop-shadow-2xl uppercase">
              {profile.coverTitle ? profile.coverTitle : <>LICORES & COMBOS <br /><span className="bg-gradient-to-r from-amber-300 via-pink-400 to-purple-400 bg-clip-text text-transparent">EXPRESS</span></>}
            </h1>
            
            <p className="text-xs md:text-sm font-bold max-w-md text-gray-300 opacity-95 leading-relaxed max-w-xl mb-8 drop-shadow font-sans">
              {profile.bio || 'Tus licores, cervezas frías, licores importados, snacks y combos favoritos con domicilio express listo para llevar.'}
            </p>

            {renderHeroSocials()}

            <button 
              onClick={() => scrollToSection('store-category-row')}
              className="px-9 py-4 bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 text-white font-black text-xs tracking-widest uppercase rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl shadow-purple-600/30 cursor-pointer flex items-center gap-2"
            >
              VER LICORES <Wine className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </section>
      ) : storeLayout === 'shoes' ? (
        <section 
          id="store-hero" 
          className="w-full relative min-h-[440px] md:min-h-[520px] lg:min-h-[600px] flex items-center justify-center bg-zinc-950 overflow-hidden text-center"
        >
          <div className="absolute inset-0 z-0">
            {profile.coverURL ? (
              <img 
                src={profile.coverURL} 
                alt="Portada de Tienda" 
                className="w-full h-full object-cover opacity-50 scale-105 filter contrast-125 saturate-110" 
                style={{ opacity: profile.coverOpacity !== undefined ? profile.coverOpacity / 100 : undefined }}
              />
            ) : (
              <img 
                src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1800&q=80" 
                alt="Sporty Collection" 
                className="w-full h-full object-cover opacity-45 filter contrast-125" 
                style={{ opacity: profile.coverOpacity !== undefined ? profile.coverOpacity / 100 : undefined }}
              />
            )}
            <div className="absolute -left-1/4 -top-1/4 w-[150%] h-[150%] bg-gradient-to-tr from-orange-600/10 to-transparent rotate-12 pointer-events-none" />
          </div>

          <div className="relative z-10 max-w-4xl px-4 py-16 flex flex-col items-center">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white leading-tight tracking-tighter mb-4 max-w-3xl drop-shadow-xl uppercase italic">
              {profile.coverTitle ? profile.coverTitle : <>EQUÍPATE PARA <br />EL SIGUIENTE <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">NIVEL</span></>}
            </h1>
            
            <p className="text-xs md:text-sm font-bold max-w-md text-gray-300 opacity-95 leading-relaxed max-w-xl mb-8 drop-shadow font-sans">
              {profile.bio || 'La máxima expresión de calzado premium y moda de alto rendimiento. Directo a tu WhatsApp con despacho inmediato.'}
            </p>

            {renderHeroSocials()}

            <button 
              onClick={() => scrollToSection('store-category-row')}
              className="px-10 py-4 bg-amber-400 text-black font-black text-xs tracking-widest uppercase rounded-none skew-x-[-12deg] hover:bg-white hover:scale-105 active:scale-95 transition-all shadow-2xl hover:shadow-amber-500/20 cursor-pointer flex items-center gap-2"
            >
              <span className="inline-block skew-x-[12deg] flex items-center gap-2">VER EL CATÁLOGO <ArrowRight className="w-4 h-4 stroke-[2.5]" /></span>
            </button>
          </div>
        </section>
      ) : storeLayout === 'tech' ? (
        <section 
          id="store-hero" 
          className="w-full relative min-h-[440px] md:min-h-[520px] lg:min-h-[600px] flex items-center justify-center bg-black overflow-hidden text-center border-b border-indigo-500/10"
        >
          <div className="absolute inset-0 z-0 opacity-15" style={{ backgroundImage: 'radial-gradient(rgba(99, 102, 241, 0.15) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="absolute inset-0 z-0">
            {profile.coverURL ? (
              <img 
                src={profile.coverURL} 
                alt="Portada" 
                className="w-full h-full object-cover opacity-40 filter saturate-120" 
                style={{ opacity: profile.coverOpacity !== undefined ? profile.coverOpacity / 100 : undefined }}
              />
            ) : (
              <img 
                src="https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1800&q=80" 
                alt="Smartphones premium" 
                className="w-full h-full object-cover opacity-35 filter saturate-120" 
                style={{ opacity: profile.coverOpacity !== undefined ? profile.coverOpacity / 100 : undefined }}
              />
            )}
          </div>

          <div className="relative z-10 max-w-4xl px-4 py-16 flex flex-col items-center">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight mb-4 max-w-3xl uppercase">
              {profile.coverTitle ? profile.coverTitle : <>El Futuro <span className="text-indigo-400">en tus</span> Manos</>}
            </h1>
            
            <p className="text-xs md:text-sm font-semibold max-w-md text-gray-300 leading-relaxed max-w-lg mb-8">
              {profile.bio || 'Encuentra los mejores smartphones de última generación, celulares nuevos y accesorios tecnológicos con garantía oficial y envío inmediato.'}
            </p>

            {renderHeroSocials()}

            <button 
              onClick={() => scrollToSection('store-category-row')}
              className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[11px] tracking-widest uppercase rounded-lg border border-indigo-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.25)] hover:shadow-[0_0_25px_rgba(99,102,241,0.45)]"
            >
              Explorar Catálogo <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      ) : (
        /* Restaurante / Food (Default) */
        <section 
          id="store-hero" 
          className="w-full relative min-h-[440px] md:min-h-[520px] lg:min-h-[600px] flex items-center justify-center bg-stone-950 overflow-hidden text-center"
        >
          <div className="absolute inset-0 z-0">
            {profile.coverURL ? (
              <img 
                src={profile.coverURL} 
                alt="Portada Gastronómica" 
                className="w-full h-full object-cover opacity-55 scale-102 filter contrast-110 saturate-120" 
                style={{ opacity: profile.coverOpacity !== undefined ? profile.coverOpacity / 100 : undefined }}
              />
            ) : (
              <img 
                src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1800&q=80" 
                alt="Delicious Gourmet Food" 
                className="w-full h-full object-cover opacity-50 filter contrast-115" 
                style={{ opacity: profile.coverOpacity !== undefined ? profile.coverOpacity / 100 : undefined }}
              />
            )}
            <div className="absolute -right-1/4 -bottom-1/4 w-[150%] h-[150%] bg-gradient-to-bl from-amber-500/10 to-transparent pointer-events-none" />
          </div>

          <div className="relative z-10 max-w-4xl px-4 py-16 flex flex-col items-center">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight tracking-tight mb-4 max-w-3xl drop-shadow-2xl">
              {profile.coverTitle ? profile.coverTitle : <>SABORES QUE <br />CONECTAN CON TU <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-red-500 bg-clip-text text-transparent">ALMA</span></>}
            </h1>
            
            <p className="text-xs md:text-sm font-bold max-w-md text-gray-300 opacity-95 leading-relaxed max-w-xl mb-8 drop-shadow font-sans">
              {profile.bio || 'Ingredientes frescos de origen local, recetas artesanales preparadas con el máximo cuidado y listas para disfrutar directamente en tu mesa.'}
            </p>

            {renderHeroSocials()}

            <button 
              onClick={() => scrollToSection('store-category-row')}
              className="px-9 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs tracking-widest uppercase rounded-full hover:from-amber-400 hover:to-orange-400 hover:scale-105 active:scale-95 transition-all shadow-xl hover:shadow-orange-500/20 cursor-pointer flex items-center gap-2"
            >
              EXPLORAR MENÚ <Utensils className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </section>
      )}

      {/* 3. COHESIVE CATEGORIES BAR (VISUAL CHIPS WITH OUTLINE DESIGN) */}
      <section 
        id="store-category-row" 
        className="w-full max-w-7xl mx-auto px-4 md:px-8 mt-12 mb-4 scroll-mt-24"
      >
        <div className="border-b pb-6 mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4" style={{ borderColor: activeTheme.cardBorder }}>
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest opacity-60">Filtrar por Categoría</h2>
            <h3 className="text-xl md:text-2xl font-black mt-1">Explora las Categorías</h3>
          </div>
          <div className="text-[11px] font-bold text-gray-500">
            Mostrando {filteredProducts.length} de {products.length} productos
          </div>
        </div>

        {/* Visual Category Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {uniqueCategories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => { setSelectedCategory(cat); scrollToSection('store-catalog'); }}
                className="flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer hover:border-emerald-400/50 group text-left shadow-sm"
                style={{ 
                  backgroundColor: isSelected ? activeTheme.cardBg : 'rgba(255,255,255,0.02)', 
                  borderColor: isSelected ? '#10b981' : activeTheme.cardBorder,
                  color: isSelected ? activeTheme.textColor : undefined
                }}
              >
                <div 
                  className={`p-3 rounded-xl transition ${
                    isSelected 
                      ? 'bg-emerald-400 text-black' 
                      : 'bg-black/25 text-gray-400 group-hover:text-emerald-400'
                  }`}
                >
                  {getCategoryIcon(cat)}
                </div>
                <div className="flex-grow min-w-0">
                  <span className="text-[8px] font-black uppercase text-gray-500 tracking-wider block leading-none mb-1">Categoría</span>
                  <span className="text-xs font-black uppercase tracking-wider block truncate text-white">{cat}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. PRIMARY E-COMMERCE MAIN LAYOUT AREA */}
      <div 
        id="store-catalog" 
        className="w-full max-w-7xl mx-auto px-4 md:px-8 mt-6 flex flex-col flex-grow z-10 scroll-mt-24"
      >
        
        {/* Main Content (Catalog feed & supplementary useful resources) */}
        <div className="w-full space-y-6 flex flex-col">
          
          {/* Active Search indicators tag */}
          {searchQuery && (
            <div className="p-3 bg-white/5 border rounded-xl flex items-center justify-between text-xs" style={{ borderColor: activeTheme.cardBorder }}>
              <span className="font-semibold text-gray-300">
                Filtro de búsqueda: &ldquo;<strong className="text-emerald-400">{searchQuery}</strong>&rdquo;
              </span>
              <button 
                onClick={() => setSearchQuery('')}
                className="text-[10px] font-black uppercase text-pink-400 hover:text-pink-300 cursor-pointer"
              >
                Limpiar filtro
              </button>
            </div>
          )}

          {/* Shoppable catalog board */}
          {products.length === 0 ? (
            <div className="w-full text-center py-12 px-6 border border-dashed rounded-3xl opacity-50 text-xs">
              Esta tienda aún no ha publicado productos en venta.
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="w-full text-center py-12 px-6 border border-dashed rounded-3xl opacity-60 text-xs text-amber-400 bg-amber-500/5">
              Ningún artículo coincide con tu búsqueda actual para esta categoría.
            </div>
          ) : (
            <div className="w-full space-y-6">
              
              {/* Shoppable Products Feed grid (Responsive: 2 cols on mobile, 3 cols on PC, 4 cols on extra wide) */}
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 animate-fade-in">
                {displayedProducts.map((p) => {
                  const isDiscounted = p.compareAtPrice && p.compareAtPrice > p.price;
                  
                  if (storeLayout === 'shoes') {
                    // SHOES / SPORT ATHLETIC DESIGN
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleOpenProductSelection(p)}
                        className="group hover:border-amber-400 border-2 rounded-none overflow-hidden p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-1 duration-300 hover:shadow-[0_10px_20px_rgba(245,158,11,0.15)] relative bg-[#0c0f16]"
                        style={{ borderColor: activeTheme.cardBorder }}
                      >
                        {/* Off ribbon tag */}
                        {isDiscounted && (
                          <span className="absolute top-3 left-3 bg-gradient-to-r from-red-600 to-amber-500 text-white font-black text-[9px] px-3 py-1 uppercase tracking-wider z-10 skew-x-[-10deg]">
                            OFERTA ESPECIAL
                          </span>
                        )}

                        <div>
                          <div className="w-full aspect-square bg-gradient-to-b from-[#111625] to-[#1a233a] rounded-none mb-3.5 overflow-hidden flex items-center justify-center text-3xl font-bold relative border border-white/5">
                            {p.imageURL ? (
                              <img 
                                src={p.imageURL} 
                                alt={p.name} 
                                className="w-full h-full object-cover group-hover:scale-110 group-hover:rotate-2 transition-all duration-500" 
                                referrerPolicy="no-referrer"
                                loading="lazy"
                              />
                            ) : (
                              <span>👟</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest bg-amber-400/10 px-2 py-0.5 rounded">
                              {p.category || 'General'}
                            </span>
                            <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                              <Flame className="w-3 h-3 text-red-500 animate-pulse" /> FAST DESPATCH
                            </span>
                          </div>

                          <h4 className="text-xs font-black line-clamp-2 text-white leading-tight min-h-[2rem] uppercase italic tracking-tight">
                            {p.name}
                          </h4>
                        </div>

                        <div className="flex items-center justify-between gap-1 mt-4 pt-3.5 border-t border-gray-900">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-white italic">
                              {getStoreCurrency()}{Number(p.price || 0).toLocaleString()}
                            </span>
                            {p.compareAtPrice && (
                              <span className="text-[10px] text-gray-550 line-through font-bold">
                                {getStoreCurrency()}{Number(p.compareAtPrice || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                          
                          {/* Sporty bold add button */}
                          <div className="px-3 py-2 bg-amber-400 text-black font-extrabold text-[10px] uppercase tracking-wider skew-x-[-10deg] group-hover:bg-white transition duration-300">
                            <span className="inline-block skew-x-[10deg] flex items-center gap-1">
                              COMPRAR <Plus className="w-3 h-3 stroke-[3]" />
                            </span>
                          </div>
                        </div>

                      </div>
                    );
                  }

                  if (storeLayout === 'liquor') {
                    // LICORERA / BEVERAGES CARD DESIGN
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleOpenProductSelection(p)}
                        className="group hover:border-purple-400/80 border rounded-3xl overflow-hidden p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-1 duration-300 hover:shadow-[0_12px_25px_rgba(168,85,247,0.2)] relative bg-[#120a1f]/80 border-purple-900/40 backdrop-blur-sm"
                        style={{ borderColor: activeTheme.cardBorder }}
                      >
                        {isDiscounted && (
                          <span className="absolute top-3.5 left-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-[9px] px-2.5 py-1 rounded-full uppercase tracking-widest z-10 shadow-md">
                            OFERTA BOTELLA
                          </span>
                        )}

                        <div>
                          <div className="w-full aspect-square bg-[#0b0514] rounded-2xl mb-4 overflow-hidden flex items-center justify-center text-3xl font-bold relative border border-purple-900/30 p-2">
                            {p.imageURL ? (
                              <img 
                                src={p.imageURL} 
                                alt={p.name} 
                                className="w-full h-full object-cover rounded-2xl group-hover:scale-105 transition-all duration-500" 
                                referrerPolicy="no-referrer"
                                loading="lazy"
                              />
                            ) : (
                              <span>🍾</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block font-mono">
                              🍷 {p.category || 'LICORES'}
                            </span>
                            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-0.5">
                              • FRÍO & EXPRESS
                            </span>
                          </div>

                          <h4 className="text-xs font-extrabold line-clamp-2 text-white leading-tight min-h-[2.2rem] group-hover:text-purple-300 transition-colors">
                            {p.name}
                          </h4>
                          {p.description && (
                            <p className="text-[10px] text-gray-400 line-clamp-1 leading-normal mt-1 mb-2">
                              {p.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-1 mt-3 pt-3 border-t border-purple-900/40">
                          <div className="flex flex-col">
                            <span className="text-xs font-extrabold text-white">
                              {getStoreCurrency()}{Number(p.price || 0).toLocaleString()}
                            </span>
                            {p.compareAtPrice && (
                              <span className="text-[9px] text-gray-500 line-through">
                                {getStoreCurrency()}{Number(p.compareAtPrice || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                          
                          <div className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-extrabold text-[9px] rounded-full uppercase tracking-wider group-hover:from-purple-500 group-hover:to-pink-500 active:scale-[0.97] transition flex items-center gap-1 shadow-md shadow-purple-600/20">
                            PEDIR <Wine className="w-3 h-3 text-amber-300" />
                          </div>
                        </div>

                      </div>
                    );
                  }

                  if (storeLayout === 'food') {
                    // GASTRONOMY / RESTAURANT MENU CARD DESIGN
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleOpenProductSelection(p)}
                        className="group hover:border-amber-500 border rounded-3xl overflow-hidden p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-1 duration-300 hover:shadow-[0_12px_24px_rgba(245,158,11,0.12)] relative bg-stone-900/40 border-stone-800 backdrop-blur-sm"
                        style={{ borderColor: activeTheme.cardBorder }}
                      >
                        {/* Discount or promo tag */}
                        {isDiscounted && (
                          <span className="absolute top-3.5 left-3.5 bg-red-600 text-white font-black text-[9px] px-2.5 py-1 rounded-full uppercase tracking-widest z-10 shadow-md">
                            OFERTA MENÚ
                          </span>
                        )}

                        <div>
                          {/* Round circular gourmet plate container layout */}
                          <div className="w-full aspect-square bg-[#15120e] rounded-2xl mb-4 overflow-hidden flex items-center justify-center text-3xl font-bold relative border border-stone-800/40 p-2">
                            {p.imageURL ? (
                              <img 
                                src={p.imageURL} 
                                alt={p.name} 
                                className="w-full h-full object-cover rounded-2xl group-hover:scale-105 group-hover:rotate-1 transition-all duration-500" 
                                referrerPolicy="no-referrer"
                                loading="lazy"
                              />
                            ) : (
                              <span>🍔</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest block font-mono">
                              🍽️ {p.category || 'MENÚ'}
                            </span>
                            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-0.5">
                              • FRESCO AL INSTANTE
                            </span>
                          </div>

                          <h4 className="text-xs font-extrabold line-clamp-2 text-white leading-tight min-h-[2.2rem] group-hover:text-amber-400 transition-colors">
                            {p.name}
                          </h4>
                          {p.description && (
                            <p className="text-[10px] text-gray-400 line-clamp-1 leading-normal mt-1 mb-2">
                              {p.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-1 mt-3 pt-3 border-t border-stone-800/60">
                          <div className="flex flex-col">
                            <span className="text-xs font-extrabold text-white">
                              {getStoreCurrency()}{Number(p.price || 0).toLocaleString()}
                            </span>
                            {p.compareAtPrice && (
                              <span className="text-[9px] text-gray-500 line-through">
                                {getStoreCurrency()}{Number(p.compareAtPrice || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                          
                          {/* Round interactive pediment or restaurant order button */}
                          <div className="px-3 py-1.5 bg-amber-500 text-white font-extrabold text-[9px] rounded-full uppercase tracking-wider group-hover:bg-amber-400 active:scale-[0.97] transition flex items-center gap-1 shadow-md shadow-amber-500/10">
                            PEDIR <Utensils className="w-3 h-3 text-white" />
                          </div>
                        </div>

                      </div>
                    );
                  }

                  if (storeLayout === 'tech') {
                    // MINIMALIST TECH & SMARTPHONE DESIGN
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleOpenProductSelection(p)}
                        className="group hover:border-indigo-500/80 border rounded-2xl overflow-hidden p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 hover:shadow-[0_0_20px_rgba(99,102,241,0.25)] relative bg-black/60 backdrop-blur-sm"
                        style={{ borderColor: activeTheme.cardBorder }}
                      >
                        {/* High tech top marker */}
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[8px] text-gray-400 font-extrabold uppercase tracking-widest">Original</span>
                        </div>

                        {isDiscounted && p.compareAtPrice && p.compareAtPrice > (p.price || 0) && (
                          <span className="absolute top-4 left-4 bg-red-600 text-white font-extrabold text-[8px] px-2.5 py-0.5 rounded-md uppercase tracking-wider z-10 shadow-sm shadow-red-500/20">
                            -{Math.round((((p.compareAtPrice || 0) - (p.price || 0)) / (p.compareAtPrice || 1)) * 100)}% DTO
                          </span>
                        )}

                        <div>
                          <div className="w-full aspect-square bg-[#080b11] rounded-xl mb-3.5 overflow-hidden flex items-center justify-center text-3xl font-bold relative border border-white/5 p-1.5">
                            {p.imageURL ? (
                              <img 
                                src={p.imageURL} 
                                alt={p.name} 
                                className="w-full h-full object-cover rounded-xl filter saturate-110 group-hover:scale-105 transition-transform duration-500" 
                                referrerPolicy="no-referrer"
                                loading="lazy"
                              />
                            ) : (
                              <span className="opacity-80">📱</span>
                            )}
                          </div>

                          <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest block mb-1">
                            {p.category?.toUpperCase() || 'DISPOSITIVO'}
                          </span>
                          <h4 className="text-xs font-extrabold line-clamp-2 text-white leading-tight min-h-[2rem]">
                            {p.name}
                          </h4>
                        </div>

                        <div className="flex items-center justify-between gap-1 mt-4 pt-3 border-t border-indigo-950/40">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-white">
                              {getStoreCurrency()}{Number(p.price || 0).toLocaleString()}
                            </span>
                            {p.compareAtPrice && (
                              <span className="text-[10px] text-gray-500 line-through">
                                {getStoreCurrency()}{Number(p.compareAtPrice || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                          
                          {/* Modern interactive purchase button */}
                          <div className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wider group-hover:bg-indigo-500 active:scale-95 transition duration-300 flex items-center gap-1">
                            Pedir <Smartphone className="w-3 h-3 text-white" />
                          </div>
                        </div>

                      </div>
                    );
                  }

                  // DEFAULT / CLASSIC DESIGN
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleOpenProductSelection(p)}
                      className="group hover:border-emerald-500/50 border rounded-2xl overflow-hidden p-3.5 flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-1 duration-300 hover:shadow-lg relative"
                      style={{ backgroundColor: activeTheme.cardBg, borderColor: activeTheme.cardBorder }}
                    >
                      {/* Off ribbon tag helper */}
                      {p.compareAtPrice && p.compareAtPrice > p.price && (
                        <span className="absolute top-3 right-3 bg-pink-500 text-white font-extrabold text-[8px] px-2.5 py-0.5 rounded uppercase tracking-wider z-10 animate-pulse">
                          Oferta
                        </span>
                      )}

                      <div>
                        <div className="w-full aspect-square bg-[#0c101d] rounded-xl mb-3 overflow-hidden flex items-center justify-center text-3xl font-bold relative border border-white/5">
                          {p.imageURL ? (
                            <img 
                              src={p.imageURL} 
                              alt={p.name} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                          ) : (
                            <span>🎁</span>
                          )}
                        </div>

                        <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest block mb-0.5">{p.category || 'General'}</span>
                        <h4 className="text-xs font-black line-clamp-2 text-white leading-tight min-h-[2rem]" style={{ color: activeTheme.cardTextColor }}>{p.name}</h4>
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-emerald-400">
                            {getStoreCurrency()}{Number(p.price || 0).toLocaleString()}
                          </span>
                          {p.compareAtPrice && (
                            <span className="text-[9px] text-gray-500 line-through font-bold">
                              {getStoreCurrency()}{Number(p.compareAtPrice || 0).toLocaleString()}
                            </span>
                          )}
                        </div>
                        
                        {/* Interactive Add button element */}
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-400 group-hover:text-black text-emerald-400 transition duration-300">
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Infinite Scroll loading indicator */}
              {visibleLimit < filteredProducts.length && (
                <div className="w-full flex flex-col items-center justify-center py-10 gap-2.5 mt-4 border-t border-dashed border-gray-900">
                  <div className="w-6 h-6 border-2 border-[#E63946] border-t-transparent animate-spin rounded-full" />
                  <p className="text-[10px] text-gray-400 font-extrabold tracking-widest uppercase animate-pulse">Cargando más productos...</p>
                </div>
              )}

            </div>
          )}

          {/* Regular list of other useful web links (eg social support, external domains etc) */}
          {links.length > 0 && (
            <div className="w-full mt-6 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">Enlaces de Interés</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {links.map((link) => (
                  <a 
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick(link.id, link.title)}
                    className="w-full py-4 px-5 border flex items-center justify-between font-extrabold text-xs tracking-tight rounded-xl bg-black/25 border-white/5 hover:bg-white/5 hover:translate-x-[2px] active:scale-[0.99] transition-all"
                    style={{
                      backgroundColor: activeTheme.cardBg,
                      borderColor: activeTheme.cardBorder,
                      color: activeTheme.cardTextColor
                    }}
                  >
                    <span className="flex items-center gap-3.5">
                      <span className="text-lg">{link.icon || '🔗'}</span>
                      <span>{link.title}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 5. FULL-WIDTH COLLABORATIVE BRAND FOOTER */}
      <footer 
        id="store-contact"
        className="w-full mt-24 border-t py-12 relative overflow-hidden backdrop-blur-sm shadow-xl"
        style={{ 
          backgroundColor: activeTheme.cardBg, 
          borderColor: activeTheme.cardBorder, 
          color: activeTheme.textColor 
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-8">
          
          {/* Brand & Owner presentation detail */}
          <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
            <div className="w-14 h-14 rounded-full border-2 border-emerald-400 shadow bg-gray-950 flex items-center justify-center overflow-hidden font-black text-sm text-emerald-400 shrink-0">
              {profile.photoURL ? (
                <img src={profile.photoURL} alt={profile.displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                profile.displayName?.substring(0,2).toUpperCase() || "SH"
              )}
            </div>
            <div>
              <span className="text-[9px] font-black tracking-widest uppercase text-gray-500 block mb-1">PRO PIETARIO</span>
              <h3 className="text-base font-black" style={{ color: activeTheme.cardTextColor }}>{profile.displayName}</h3>
              <a 
                href={`https://linnkpro.store/${profile.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-emerald-400 hover:underline block"
              >
                linnkpro.store/{profile.username}
              </a>
            </div>
          </div>

          {/* Slogan / Biography excerpt */}
          {profile.bio && (
            <div className="max-w-md text-center md:text-left border-y md:border-y-0 md:border-x border-white/5 py-4 md:py-0 md:px-8 flex-grow">
              <p className="text-xs opacity-85 font-medium leading-relaxed">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Social connections & Contact metadata */}
          <div className="flex flex-col items-center md:items-end gap-3.5 min-w-[220px]">
            {(profile.location || profile.phone || profile.email) && (
              <div className="flex flex-col gap-1.5 text-xs font-semibold opacity-75 items-center md:items-end">
                {profile.location && <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {profile.location}</span>}
                {profile.phone && <span className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {profile.phone}</span>}
                {profile.email && <span className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {profile.email}</span>}
              </div>
            )}

            {/* Social channels connected */}
            <div className="flex flex-wrap gap-2 justify-center md:justify-end">
              {Object.entries(socialLinks).map(([key, value]) => {
                if (!value) return null;

                const valStr = String(value).trim();
                let url = valStr;
                if (key === 'whatsapp') {
                  url = `https://wa.me/${valStr.replace(/[^0-9]/g, '')}`;
                } else if (key === 'instagram' && !valStr.includes('http')) {
                  url = `https://instagram.com/${valStr}`;
                } else if (key === 'facebook' && !valStr.includes('http')) {
                  url = `https://facebook.com/${valStr}`;
                } else if (key === 'tiktok' && !valStr.includes('http')) {
                  url = `https://tiktok.com/@${valStr.replace(/^@/, '')}`;
                } else if (key === 'youtube' && !valStr.includes('http')) {
                  url = `https://youtube.com/${valStr}`;
                } else if (key === 'twitter' && !valStr.includes('http')) {
                  url = `https://x.com/${valStr}`;
                }

                return (
                  <a 
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick(`social_${key}`, `Social ${key}`)}
                    className="hover:scale-110 active:scale-95 transition p-2 bg-white/5 hover:bg-white/10 rounded-lg border flex items-center justify-center text-inherit"
                    style={{ borderColor: activeTheme.cardBorder }}
                    title={key}
                  >
                    {renderSocialIcon(key)}
                  </a>
                );
              })}
            </div>
          </div>

        </div>

        {/* Humble system credits footer */}
        <div className="text-center opacity-40 hover:opacity-100 transition-opacity z-10 mt-10 border-t border-white/5 pt-6">
          <a href={window.location.origin} className="text-[9px] font-black tracking-widest uppercase flex items-center justify-center gap-1 text-current">
            TIENDA PRO POR <span className="text-red-500">♥</span> linnkpro.store
          </a>
        </div>
      </footer>

      {/* Floating Shopping Cart Badge indicator button */}
      {totalCartUnitsCount > 0 && (
        <div className="fixed bottom-6 right-6 z-40 animate-bounce">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="p-4 bg-emerald-405 hover:bg-emerald-300 text-black font-black rounded-full flex items-center justify-center gap-2.5 shadow-2xl shadow-emerald-500/30 transition border-2 border-black"
            style={{ backgroundColor: '#10b981' }}
          >
            <ShoppingBag className="w-5 h-5 text-black stroke-[2.5]" />
            <span className="text-xs font-extrabold px-1.5 py-0.5 bg-black text-emerald-400 rounded-full">
              {totalCartUnitsCount}
            </span>
          </button>
        </div>
      )}

      {/* Floating WhatsApp contact button */}
      {(() => {
        const rawPhone = socialLinks?.whatsapp || profile?.phone || '';
        const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');
        if (!cleanPhone) return null;
        
        return (
          <div className="fixed bottom-6 left-6 z-40">
            <a
              href={`https://wa.me/${cleanPhone}?text=Hola!%20Vengo%20de%20tu%20tienda%20online%20${encodeURIComponent(profile.displayName || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3.5 bg-green-500 hover:bg-green-400 text-white font-bold rounded-full flex items-center justify-center gap-2 shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 border-2 border-white/20 group cursor-pointer"
              style={{ boxShadow: '0 8px 32px rgba(34, 197, 94, 0.4)' }}
              title="Chatear por WhatsApp"
            >
              <MessageCircle className="w-5 h-5 fill-white text-white" />
              <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out text-xs font-black uppercase tracking-wider block">
                WhatsApp
              </span>
            </a>
          </div>
        );
      })()}

      {/* 1. CODE QR MODAL */}
      <StoreQRModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        username={username || profile.username}
        storeName={profile.displayName || profile.storeName}
        storeLogo={profile.photoURL}
      />

      {/* 2. PRODUCT CUSTOMIZATION OVERLAY / ADDTOCART BAR */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-950 border border-gray-850 rounded-3xl max-w-sm md:max-w-3xl lg:max-w-4xl w-full text-gray-100 relative shadow-2.5xl animate-fade-in max-h-[92vh] flex flex-col overflow-hidden">
            <button 
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 text-white font-bold p-1.5 transition cursor-pointer z-30 hover:scale-110 active:scale-95 bg-red-600 hover:bg-red-500 rounded-full border border-red-700 shadow-md shadow-red-900/35"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
            
            {/* Scrollable Body containing image and text details */}
            <div className="flex-1 overflow-y-auto p-6 pb-2">
              <div className="flex flex-col md:flex-row gap-6 mt-2">
                {/* Product Image on Left (PC) / Top (Mobile) */}
                <div className="w-full md:w-[45%] aspect-[4/5] md:aspect-auto md:h-[420px] bg-gray-900 rounded-2xl overflow-hidden border border-gray-900/60 flex items-center justify-center text-4xl shrink-0 relative shadow-inner">
                  {selectedProduct.imageURL ? (
                    <>
                      {/* Ambient Glow Background for immersive experience */}
                      <img 
                        src={selectedProduct.imageURL} 
                        alt="" 
                        className="absolute inset-0 w-full h-full object-cover opacity-20 blur-xl scale-110 select-none pointer-events-none filter saturate-150" 
                        aria-hidden="true"
                        referrerPolicy="no-referrer"
                      />
                      {/* Main Image, fully visible without being cropped or cut off */}
                      <img 
                        src={selectedProduct.imageURL} 
                        alt={selectedProduct.name} 
                        className="relative z-10 max-w-full max-h-full object-contain p-2 hover:scale-[1.03] transition-transform duration-300" 
                        referrerPolicy="no-referrer" 
                      />
                    </>
                  ) : (
                    <span className="relative z-10">🎁</span>
                  )}
                </div>

                {/* Product Details on Right (PC) / Bottom (Mobile) */}
                <div className="flex-grow flex flex-col justify-start">
                  <span className="text-[9px] font-black uppercase text-indigo-405 tracking-wider mb-1 block">{selectedProduct.category || 'General'}</span>
                  <h3 className="text-lg font-black text-white leading-tight mb-1.5">{selectedProduct.name}</h3>
                  
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-extrabold text-emerald-400">{getStoreCurrency()}{Number(selectedProduct.price || 0).toLocaleString()}</span>
                    {selectedProduct.compareAtPrice && (
                      <span className="text-xs text-gray-500 line-through font-bold">{getStoreCurrency()}{Number(selectedProduct.compareAtPrice || 0).toLocaleString()}</span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 leading-relaxed font-semibold bg-gray-900/40 border border-gray-900 p-3.5 rounded-xl mb-4">
                    {selectedProduct.description || 'Detalles exclusivos de nuestro catálogo directo.'}
                  </p>

                  {/* If variants available, present choice */}
                  {selectedProduct.variantsText && (
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">Elegir Variante / Opción</label>
                      <select
                        value={chosenVariant}
                        onChange={(e) => setChosenVariant(e.target.value)}
                        className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-emerald-500 text-xs px-3 rounded-lg outline-none text-white font-semibold"
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

            {/* STICKY/FIXED FOOTER: This element remains fixed/sticky at the bottom of the modal container */}
            <div className="p-6 pt-3 border-t border-gray-900 bg-gray-950 shrink-0 z-20">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                {/* Quantity Controller */}
                <div className="flex justify-between items-center bg-gray-900 p-3 rounded-xl border border-gray-850 w-full sm:w-auto sm:min-w-[180px]">
                  <span className="text-xs font-bold text-gray-400">Cantidad:</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setBuyQuantity(q => q > 1 ? q - 1 : 1)}
                      className="p-1.5 bg-gray-950 border border-gray-800 rounded hover:bg-gray-800 transition text-gray-400 hover:text-white"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-black text-white font-mono w-4 text-center">{buyQuantity}</span>
                    <button
                      type="button"
                      onClick={() => setBuyQuantity(q => q + 1)}
                      className="p-1.5 bg-gray-950 border border-gray-800 rounded hover:bg-gray-800 transition text-gray-400 hover:text-white"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Add to Cart button */}
                <div className="w-full sm:flex-1">
                  {isStoreClosedNow ? (
                    <div className="bg-red-500/10 border border-red-500/35 p-4 rounded-xl flex flex-col items-center gap-1.5 text-center text-red-400">
                      <span className="font-extrabold text-xs flex items-center gap-2 uppercase animate-pulse">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        Tienda Cerrada
                      </span>
                      <p className="text-[10px] text-red-300/80 font-semibold">
                        {profile.scheduleEnabled && profile.openTime && profile.closeTime && !profile.isClosed
                          ? `Horario de atención: ${profile.openTime} - ${profile.closeTime}`
                          : 'No se pueden procesar pedidos en este momento.'}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddProductToCart}
                      className="w-full py-3.5 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <ShoppingBag className="w-4 h-4 text-black stroke-[3]" />
                      Añadir al Carrito ({getStoreCurrency()}{Number((selectedProduct.price || 0) * buyQuantity).toLocaleString()})
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3. CART SIDEBAR SLIDE MODAL */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-sm bg-gray-950 border-l border-gray-850 h-full flex flex-col justify-between p-6 shadow-3xl text-gray-100 animate-slide-in">
            
            {/* Cart Header */}
            <div>
              <div className="flex items-center justify-between border-b border-gray-900 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-extrabold text-sm uppercase">Mi Carrito de Compras</h3>
                </div>
                <button
                  type="button"
                  id="close-cart-btn"
                  onClick={() => setIsCartOpen(false)}
                  className="w-8 h-8 flex items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded-full transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Cart Items stack */}
              {cart.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center opacity-40">
                  <ShoppingBag className="w-12 h-12 mb-2 animate-bounce" />
                  <span className="text-xs font-semibold">El carrito se encuentra vacío</span>
                </div>
              ) : (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin">
                  {cart.map((item) => (
                    <div 
                      key={item.id} 
                      className="bg-[#0c101d] border border-gray-900 p-3 rounded-xl flex items-center gap-3 relative justify-between"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-11 h-11 rounded-lg bg-black shrink-0 overflow-hidden flex items-center justify-center font-bold text-sm">
                          {item.product.imageURL ? (
                            <img src={item.product.imageURL} alt={item.product.name} className="w-full h-full object-cover" />
                          ) : (
                            <span>🎁</span>
                          )}
                        </div>
                        <div className="overflow-hidden">
                          <h4 className="text-xs font-extrabold text-white truncate max-w-[150px]">{item.product.name}</h4>
                          {item.selectedVariant && (
                            <span className="text-[10px] text-indigo-400 font-extrabold block">Opción: {item.selectedVariant}</span>
                          )}
                          <span className="font-mono text-[11px] text-emerald-400 font-semibold">{getStoreCurrency()}{item.product.price.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-between self-stretch shrink-0">
                        {/* Remove trash */}
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.id)}
                          className="text-gray-550 hover:text-red-400 hover:scale-110 active:scale-95 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-2 bg-black py-0.5 px-1 rounded-md border border-gray-800">
                          <button
                            type="button"
                            onClick={() => handleSetItemQuantity(item.id, -1)}
                            className="p-0.5 text-gray-500 hover:text-white"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-[10.5px] font-mono font-black text-white w-3 text-center">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleSetItemQuantity(item.id, 1)}
                            className="p-0.5 text-gray-500 hover:text-white"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Footer Totalizer & checkout toggle */}
            {cart.length > 0 && (
              <div className="border-t border-gray-900 pt-4 space-y-2">
                <div className="flex items-center justify-between font-bold text-xs text-gray-400">
                  <span>Subtotal:</span>
                  <span className="font-mono">{getStoreCurrency()}{totalCartCost.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between font-bold text-xs text-gray-400">
                  <span>Costo de Domicilio {deliveryType === 'pickup' ? '(Recoger en Restaurante)' : ''}:</span>
                  {deliveryType === 'pickup' ? (
                    <span className="font-mono text-emerald-400 font-bold">GRATIS ($0)</span>
                  ) : (
                    <span className="font-mono text-amber-400">{getStoreCurrency()}{systemDeliveryFee.toLocaleString()}</span>
                  )}
                </div>
                <div className="flex items-center justify-between font-extrabold text-sm text-white pt-1 border-t border-dashed border-gray-900">
                  <span>Total estimado:</span>
                  <span className="text-emerald-400 text-base font-mono">
                    {getStoreCurrency()}{(totalCartCost + (deliveryType === 'pickup' ? 0 : systemDeliveryFee)).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  {isStoreClosedNow ? (
                    <div className="col-span-2 bg-red-500/10 border border-red-500/35 p-3.5 rounded-xl text-center text-red-400">
                      <span className="font-extrabold text-xs flex items-center justify-center gap-1.5 uppercase animate-pulse mb-1">
                        🔴 Tienda Cerrada
                      </span>
                      <p className="text-[10px] text-red-350 font-semibold">
                        {profile.scheduleEnabled && profile.openTime && profile.closeTime && !profile.isClosed
                          ? `Horario: ${profile.openTime} - ${profile.closeTime}`
                          : 'No se pueden recibir pedidos temporalmente.'}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setIsCartOpen(false); setIsCheckoutOpen(true); }}
                      className="col-span-2 py-4 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow"
                    >
                      <span>Proceder al Registro</span>
                      <ArrowRight className="w-4 h-4 stroke-[3.5]" />
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* 4. CHECKOUT REGISTERING FORM OVERLAY */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={handlePlaceOrderSubmit} 
            className="bg-gray-950 border border-gray-850 rounded-3xl w-full max-w-md p-6 text-gray-100 relative shadow-2.5xl max-h-[92vh] overflow-y-auto space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-900 pb-3">
              <h3 className="font-extrabold text-sm uppercase flex items-center gap-1.5 text-white">
                <MapPin className="w-4.5 h-4.5 text-indigo-400" />
                Hacer Mi Pedido
              </h3>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="text-white font-bold p-1.5 transition cursor-pointer hover:scale-110 active:scale-95 bg-red-600 hover:bg-red-500 rounded-full border border-red-700 shadow-md shadow-red-900/35"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">Completa los datos de envío. La orden se guardará e iniciará una comunicación con el vendedor por WhatsApp.</p>

            {/* Inputs */}
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">Nombre Completo *</label>
              <input 
                type="text" 
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Ej: Laura Bermúdez"
                className="w-full h-11 bg-white border border-gray-300 focus:border-indigo-500 rounded-xl px-3.5 text-xs font-semibold outline-none text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">WhatsApp de contacto *</label>
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
                  phoneError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500/20'
                } rounded-xl px-3.5 text-xs font-semibold outline-none text-gray-900 placeholder:text-gray-400 focus:ring-1`}
              />
              {phoneError && (
                <p className="text-[11px] font-bold text-red-500 mt-1 flex items-center gap-1">
                  <span>⚠️</span> {phoneError}
                </p>
              )}
            </div>

            {/* Delivery Type Option (Domicilio vs Recoger en Restaurante) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-gray-500 block">Tipo de entrega</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryType('delivery')}
                  className={`p-3 rounded-xl border flex flex-col items-start gap-1 cursor-pointer transition text-left ${
                    deliveryType === 'delivery'
                      ? 'bg-indigo-500/10 border-indigo-500 text-white'
                      : 'bg-gray-900/60 border-gray-850 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-gray-700 flex items-center justify-center shrink-0">
                      {deliveryType === 'delivery' && <div className="w-2 h-2 bg-indigo-500 rounded-full" />}
                    </div>
                    <span className="text-xs font-black text-white">🛵 Domicilio</span>
                  </div>
                  <span className="text-[10px] text-gray-400 pl-6">Envío a tu dirección</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeliveryType('pickup')}
                  className={`p-3 rounded-xl border flex flex-col items-start gap-1 cursor-pointer transition text-left ${
                    deliveryType === 'pickup'
                      ? 'bg-emerald-500/10 border-emerald-500 text-white'
                      : 'bg-gray-900/60 border-gray-850 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-gray-700 flex items-center justify-center shrink-0">
                      {deliveryType === 'pickup' && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}
                    </div>
                    <span className="text-xs font-black text-white">🛍️ Recoger en Restaurante</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold pl-6">¡Sin costo de envío! ($0)</span>
                </button>
              </div>
            </div>

            {/* Pickup Location Info Banner */}
            {deliveryType === 'pickup' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
                <p className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                  <span>🛍️</span> <span>Recogida en {profile?.displayName || 'el restaurante'}</span>
                </p>
                {profile?.address && (
                  <p className="text-[10px] text-gray-300 font-semibold flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Ubicación: {profile.address}</span>
                  </p>
                )}
                <p className="text-[10px] text-gray-400 leading-tight">
                  Podrás retirar tu pedido directamente sin pagar domicilio. Te avisarán por WhatsApp cuando tu orden esté lista.
                </p>
              </div>
            )}

            <div>
              <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">
                {deliveryType === 'pickup' ? 'Detalles o Nota de Recogida (Opcional)' : 'Dirección Completa de Despacho *'}
              </label>
              <input 
                type="text" 
                required={deliveryType === 'delivery'}
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder={deliveryType === 'pickup' ? 'Ej: Paso a las 2:00 PM o voy en carro placa XYZ' : 'Ej: Calle 45 #23-12, Apto 402, Bogotá'}
                className="w-full h-11 bg-white border border-gray-300 focus:border-indigo-500 rounded-xl px-3.5 text-xs font-semibold outline-none text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-gray-500 block mb-1">Instrucciones o Notas Especiales</label>
              <textarea 
                rows={2}
                value={custNotes}
                onChange={(e) => setCustNotes(e.target.value)}
                placeholder="Ej: Golpear fuerte el portón negro o dejar en portería."
                className="w-full bg-white border border-gray-300 focus:border-indigo-500 rounded-xl p-3.5 text-xs font-semibold outline-none text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-indigo-500/20 resize-none"
              />
            </div>

            {/* Payment Method choices */}
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500 block mb-2">Método de Coordinación de Pago</label>
              <div className="grid grid-cols-1 gap-2">
                <label className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer transition ${
                  payMethod === 'whatsapp' ? 'border-emerald-500 bg-emerald-500/5' : 'border-gray-900 hover:border-gray-800'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <MessageCircle className="w-5 h-5 text-emerald-400" />
                    <div className="text-left">
                      <h4 className="text-xs font-extrabold text-white">Pedir por WhatsApp</h4>
                      <p className="text-[9px] text-gray-500">Coordinar pago por chat</p>
                    </div>
                  </div>
                  <input type="radio" checked={payMethod === 'whatsapp'} onChange={() => setPayMethod('whatsapp')} className="w-4 h-4 accent-emerald-500 pointer-events-auto" />
                </label>

                {(!profile?.bankAccounts || profile.bankAccounts.length === 0) ? (
                  <div className="p-3 border border-gray-900 bg-gray-950/45 rounded-xl flex items-center justify-between opacity-50 cursor-not-allowed">
                    <div className="flex items-center gap-2.5 flex-1">
                      <Wallet className="w-5 h-5 text-gray-600" />
                      <div className="text-left">
                        <h4 className="text-xs font-bold text-gray-500">Transferencia Bancaria (No Disponible)</h4>
                        <p className="text-[9px] text-gray-650">El vendedor no ha configurado sus datos de pago</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer transition ${
                    payMethod === 'transfer' ? 'border-indigo-400 bg-indigo-500/5' : 'border-gray-900 hover:border-gray-800'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <Wallet className="w-5 h-5 text-indigo-400" />
                      <div className="text-left">
                        <h4 className="text-xs font-extrabold text-white">Transferencia Bancaria</h4>
                        <p className="text-[9px] text-gray-500">Paga por transferencia o billetera digital</p>
                      </div>
                    </div>
                    <input type="radio" checked={payMethod === 'transfer'} onChange={() => setPayMethod('transfer')} className="w-4 h-4 accent-indigo-400 pointer-events-auto" />
                  </label>
                )}

                <label className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer transition ${
                  payMethod === 'cod' ? 'border-amber-400 bg-amber-500/5' : 'border-gray-900 hover:border-gray-800'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-5 h-5 text-amber-405" />
                    <div className="text-left">
                      <h4 className="text-xs font-extrabold text-white">Efectivo / Contra Entrega</h4>
                      <p className="text-[9px] text-gray-500">Pagas al recibir los paquetes</p>
                    </div>
                  </div>
                  <input type="radio" checked={payMethod === 'cod'} onChange={() => setPayMethod('cod')} className="w-4 h-4 accent-amber-500 pointer-events-auto" />
                </label>
              </div>
            </div>

            {payMethod === 'transfer' && profile?.bankAccounts && profile.bankAccounts.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3 bg-[#0a0e1a] border border-gray-900 p-4 rounded-2xl"
              >
                <div className="flex items-center justify-between border-b border-gray-900 pb-2 mb-1">
                  <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5" /> Cuentas para Transferencia
                  </span>
                  <span className="text-[9px] text-gray-500 font-bold">Datos del Vendedor</span>
                </div>
                
                <div className="space-y-3">
                  {profile.bankAccounts.map((acc) => (
                    <div 
                      key={acc.id} 
                      className="bg-[#05080f] border border-gray-900 p-3.5 rounded-xl space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-xs font-black text-white uppercase tracking-tight">{acc.bankName}</h4>
                          <span className="text-[9px] text-indigo-400 font-bold uppercase">{acc.accountType}</span>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => handleCopyAccountNumber(acc.accountNumber, acc.id)}
                          className="py-1 px-2.5 bg-gray-900 border border-gray-850 hover:border-gray-700 text-gray-300 hover:text-white rounded-lg text-[10px] font-black transition flex items-center gap-1 shrink-0 font-mono"
                        >
                          {copiedAccountId === acc.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                              Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-gray-500" />
                              {acc.accountNumber}
                            </>
                          )}
                        </button>
                      </div>

                      {acc.instructions && (
                        <p className="text-[10px] text-gray-400 font-semibold bg-gray-900/35 border border-gray-900/50 p-2 rounded-lg leading-relaxed whitespace-pre-wrap text-left">
                          {acc.instructions}
                        </p>
                      )}

                      {acc.qrCodeURL && (
                        <div className="flex flex-col items-center justify-center p-2.5 border border-gray-900 bg-[#0c101d]/50 rounded-xl gap-2">
                          <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Escanear Código QR</span>
                          <img 
                            src={acc.qrCodeURL} 
                            alt="QR de Pago" 
                            onClick={() => setExpandedQRUrl(acc.qrCodeURL)}
                            className="w-32 h-32 object-contain bg-white rounded-lg p-1.5 border border-gray-800 cursor-pointer hover:scale-105 transition"
                            referrerPolicy="no-referrer"
                            title="Haz clic para ampliar"
                          />
                          <span className="text-[8px] text-gray-500 font-medium font-sans">Haz clic para ampliar QR</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Optional purchase image proof / receipt upload */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-500 block">
                Comprobante o Imagen de la Compra (Opcional)
              </label>
              
              <div className="relative border border-dashed border-gray-800 hover:border-indigo-500/50 rounded-2xl p-4 text-center transition bg-[#0c101d] flex flex-col items-center justify-center min-h-[90px]">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 2 * 1024 * 1024) {
                        alert("La imagen excede el límite de 2 MB. Por favor elige una menos pesada.");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setUploadedOrderProofBase64(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                
                {uploadedOrderProofBase64 ? (
                  <div className="relative z-25 w-full flex items-center justify-between gap-3 bg-indigo-950/20 p-2 rounded-xl border border-indigo-500/20">
                    <img 
                      src={uploadedOrderProofBase64} 
                      alt="Uploaded proof" 
                      className="w-12 h-12 object-cover rounded-lg border border-indigo-500/10" 
                    />
                    <div className="flex-grow text-left">
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block">¡Imagen Cargada!</span>
                      <span className="text-[9px] text-gray-400 font-semibold truncate block max-w-[150px]">Imagen lista para registrar</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setUploadedOrderProofBase64('');
                      }}
                      className="p-1 px-2 bg-gray-900 hover:bg-gray-805 text-gray-400 hover:text-white rounded-lg text-[9px] font-bold transition font-mono z-30"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1.5 text-gray-450 hover:text-white transition">
                    <Plus className="w-5 h-5 text-gray-500 animate-pulse" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-indigo-400 leading-none">Adjuntar comprobante / captura</span>
                    <span className="text-[8.5px] text-gray-500">Soporta fotos de recibo, transferencias bancarias, etc. (Máx 2MB)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Loyalty Points & Account Promo Card */}
            <div className="bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 border border-amber-500/30 p-3.5 rounded-2xl space-y-2 text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Gift className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-300">Club de Puntos & Platos Gratis</h4>
                    <p className="text-[10px] text-gray-400 font-semibold">Gana puntos y giros de ruleta con cada compra</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setCustomerPortalTab('wheel'); setIsCustomerPortalOpen(true); }}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-black text-[10px] font-black rounded-lg transition shrink-0 cursor-pointer"
                >
                  Ver Premios
                </button>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={createAccountWithOrder} 
                  onChange={(e) => setCreateAccountWithOrder(e.target.checked)}
                  className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                />
                <span className="text-[11px] font-bold text-gray-200">
                  Guardar mis datos y acumular puntos (+1 Giro de Ruleta Gratis)
                </span>
              </label>
            </div>

            {/* Optional Voucher / Reward Coupon Code */}
            <div className="bg-gray-900/60 border border-gray-800 p-3 rounded-2xl space-y-2 text-left">
              <label className="text-[10px] font-black uppercase text-gray-400 flex items-center justify-between">
                <span>¿Tienes un Cupón o Código de Premio?</span>
                <Ticket className="w-3.5 h-3.5 text-indigo-400" />
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={appliedRewardCode}
                  onChange={(e) => {
                    setAppliedRewardCode(e.target.value.toUpperCase());
                    if (!e.target.value.trim()) setRewardDiscountAmount(0);
                  }}
                  placeholder="Ej: RYY-7492 o CANJE-DESC"
                  className="flex-1 bg-black/60 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300 placeholder:text-gray-600 outline-none uppercase"
                />
                <button
                  type="button"
                  onClick={() => {
                    const code = appliedRewardCode.trim().toUpperCase();
                    if (!code) {
                      setRewardDiscountAmount(0);
                      return;
                    }
                    if (code.includes('DESC') || code.includes('5000') || code.startsWith('RYY-') || code.startsWith('CANJE-')) {
                      setRewardDiscountAmount(5000);
                      alert(`🎉 ¡Cupón ${code} validado! Se aplicó un descuento de $5.000 COP a tu pedido.`);
                    } else {
                      setRewardDiscountAmount(3000);
                      alert(`🎉 ¡Bono ${code} aplicado! Descuento de $3.000 COP registrado.`);
                    }
                  }}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
              {rewardDiscountAmount > 0 && (
                <p className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Descuento aplicado: -${rewardDiscountAmount.toLocaleString('es-CO')} COP
                </p>
              )}
            </div>

            {/* Total final */}
            <div className="border-t border-gray-900 pt-4 space-y-2">
              <div className="flex justify-between items-center text-xs text-gray-400 font-bold">
                <span>Subtotal productos:</span>
                <span className="font-mono">{getStoreCurrency()}{totalCartCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-400 font-bold">
                <span>Costo de Domicilio {deliveryType === 'pickup' ? '(Recoger en Restaurante)' : ''}:</span>
                {deliveryType === 'pickup' ? (
                  <span className="font-mono text-emerald-400 font-bold">GRATIS ($0)</span>
                ) : (
                  <span className="font-mono text-amber-400">{getStoreCurrency()}{systemDeliveryFee.toLocaleString()}</span>
                )}
              </div>
              {rewardDiscountAmount > 0 && (
                <div className="flex justify-between items-center text-xs text-emerald-400 font-bold">
                  <span>Descuento Premio / Cupón:</span>
                  <span className="font-mono">-{getStoreCurrency()}{Math.min(totalCartCost, rewardDiscountAmount).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm font-extrabold border-t border-dashed border-gray-900 pt-2 text-white">
                <span>Monto Total a Pagar:</span>
                <span className="text-emerald-400 text-base font-mono">
                  {getStoreCurrency()}{Math.max(0, totalCartCost + (deliveryType === 'pickup' ? 0 : systemDeliveryFee) - Math.min(totalCartCost, rewardDiscountAmount)).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1 py-3 bg-gray-900 hover:bg-gray-805 rounded-xl text-xs font-bold text-gray-400 transition"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={orderSubmitting}
                className="flex-1 py-3 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow cursor-pointer"
              >
                {orderSubmitting ? 'Procesando...' : 'Hacer Mi Pedido 🚀'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. SUCCESS OUTCOME ORDER RECEIVED SCREEN */}
      {submittedOrder && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gray-950 border border-emerald-500/20 rounded-3xl max-w-sm w-full p-6 text-gray-100 text-center relative shadow-2xl animate-fade-in space-y-4">
            
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 mb-2">
              <Check className="w-7 h-7 stroke-[3.5]" />
            </div>

            <h3 className="text-lg font-black text-white leading-tight">¡Pedido Recibido con Éxito!</h3>
            <p className="text-xs text-indigo-300">Tu número de guía interna es <strong className="font-mono text-white">#{submittedOrder.orderNumber}</strong></p>
            
            {/* Loyalty Bonus Banner */}
            <div className="bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-amber-500/15 border border-amber-500/40 p-3 rounded-2xl text-left space-y-1.5 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-300 font-extrabold text-xs">
                  <Crown className="w-4 h-4 text-amber-400 animate-bounce" />
                  <span>¡Ganaste +500 Puntos ($500 COP)!</span>
                </div>
                <span className="text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full">+1 Giro Gratis</span>
              </div>
              <p className="text-[10px] text-gray-300 font-semibold leading-relaxed">
                Por tu compra sumaste <strong>500 Puntos ($500 COP)</strong> acumulables para comprar en la tienda y desbloqueaste una tirada en la ruleta de platos gratis.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmittedOrder(null);
                  setCustomerPortalTab('wheel');
                  setIsCustomerPortalOpen(true);
                }}
                className="w-full py-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-black font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow cursor-pointer mt-1"
              >
                <Sparkles className="w-3.5 h-3.5 text-black" />
                ¡Girar Ruleta y Ver Mis Puntos Ahora!
              </button>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed font-semibold bg-gray-900 border border-gray-900 p-3 rounded-lg text-left">
              Para validar el despacho, te facilitamos un botón que redactará los artículos de tu carrito directamente hacia nuestro canal oficial de WhatsApp. Así podremos coordinar el envío de inmediato.
            </p>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => triggerShopperWhatsAppMessage(submittedOrder)}
                className="w-full py-4 bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs rounded-xl flex items-center justify-center gap-2 transition shadow shadow-emerald-500/10 active:scale-95 cursor-pointer"
              >
                <MessageCircle className="w-5 h-5 text-black stroke-[2.5]" />
                Enviar Pedido por WhatsApp
              </button>

              <button
                type="button"
                onClick={() => {
                  const phone = submittedOrder.customerPhone;
                  setSubmittedOrder(null);
                  if (phone) {
                    setCustPhone(cleanColombianPhone(phone));
                  }
                  setCustomerPortalTab('orders');
                  setIsCustomerPortalOpen(true);
                }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Truck className="w-4 h-4" />
                Rastrear Estado de mi Pedido en Vivo
              </button>

              <button
                type="button"
                onClick={() => { setSubmittedOrder(null); }}
                className="w-full py-2.5 bg-gray-900 hover:bg-gray-805 text-xs text-gray-400 font-bold rounded-xl transition cursor-pointer"
              >
                Volver a la Tienda
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CUSTOMER LOYALTY, ACCOUNT, ORDERS & LUCKY WHEEL PORTAL MODAL */}
      <CustomerPortalModal
        isOpen={isCustomerPortalOpen}
        onClose={() => setIsCustomerPortalOpen(false)}
        initialPhone={custPhone}
        initialTab={customerPortalTab}
        storeCurrency={getStoreCurrency()}
        onSelectRewardCode={(code, discount) => {
          setAppliedRewardCode(code);
          if (discount) setRewardDiscountAmount(discount);
        }}
      />

      {/* FULLSCREEN QR LIGHTBOX MODAL */}
      {expandedQRUrl && (
        <div 
          onClick={() => setExpandedQRUrl(null)}
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-fade-in cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="bg-white p-6 rounded-3xl max-w-sm w-full flex flex-col items-center justify-center gap-4 relative animate-scale-in"
          >
            <button 
              type="button"
              onClick={() => setExpandedQRUrl(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition p-1 bg-gray-100 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-2">Código QR para Pago</span>
            <img 
              src={expandedQRUrl} 
              alt="QR Ampliado" 
              className="w-64 h-64 object-contain"
              referrerPolicy="no-referrer"
            />
            <p className="text-[10px] text-gray-500 text-center font-bold">Escanea este código desde la app de tu banco o billetera digital para completar la transferencia.</p>
          </div>
        </div>
      )}

    </div>
  );
}
