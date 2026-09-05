/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Eye, 
  Settings, 
  BarChart3, 
  Palette, 
  ShoppingBag, 
  Check, 
  Save,
  Copy, 
  LogOut, 
  Sparkles, 
  Smartphone, 
  TrendingUp, 
  Package, 
  MessageCircle, 
  FolderPlus, 
  CreditCard, 
  Users, 
  Building, 
  Landmark,
  Coins, 
  X, 
  Volume2,
  Bell,
  BellRing,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  Cpu,
  Utensils,
  Wine,
  ChefHat,
  Clock,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Music,
  MoreHorizontal,
  Home,
  MapPin,
  Bike,
  AlertTriangle,
  Sliders,
  Paintbrush,
  Coffee,
  Flame,
  Moon,
  Sun,
  Layers,
  Type,
  ChevronDown,
  ChevronUp,
  QrCode,
  Share2,
  Download,
  ShieldCheck,
  Headphones,
  Phone,
  Zap
} from 'lucide-react';
import StoreQRModal from './StoreQRModal';
import { MapLocationPickerModal } from './MapLocationPickerModal';
import { 
  saveProfile, 
  PREDEFINED_THEMES, 
  saveCustomTheme,
  fetchAnalyticsReports,
  saveProduct,
  deleteProductItem,
  fetchProductsAllState,
  subscribeProducts,
  deduplicateProducts,
  fetchOrders,
  saveOrder,
  deduplicateOrders,
  subscribeOrders,
  updateOrderStatus,
  isUsernameAvailable,
  fetchMySubscriptionPayments,
  saveSubscriptionPayment,
  checkIsStoreClosed,
  getPlanProductLimit,
  checkIsAdminEmail,
  fetchSystemSettings,
  listenToSystemSettings,
  auth
} from '../lib/firebase';
import { 
  UserProfile, 
  CustomTheme, 
  ProductItem, 
  OrderItem,
  PageViewAnalytic,
  SubscriptionPayment,
  BankAccount,
  SystemSettings
} from '../types';
import BankSettings from './BankSettings';
import LinnkAdminVoiceAssistant from './LinnkAdminVoiceAssistant';
import LinnkProIsotype from './LinnkProIsotype';
import { formatColombianPhoneWith57 } from './PublicProfile';
import { BasicPlanTrialModal } from './BasicPlanTrialModal';
import { DashboardTrialBanner } from './DashboardTrialBanner';

export const RESTAURANT_CATEGORIES = [
  '🍔 Hamburguesas',
  '🍕 Pizzas',
  '🌮 Comida mexicana',
  '🍗 Pollo',
  '🌭 Perros calientes',
  '🍟 Combos y acompañamientos',
  '🥗 Ensaladas',
  '🍝 Pastas',
  '🍚 Arroces',
  '🥤 Bebidas',
  '🍰 Postres',
  '☕ Desayunos',
  '🥩 Carnes',
  '🐟 Pescados y mariscos',
  '🌱 Vegetariano / saludable',
];

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

const compressImage = (base64Str: string, maxWidth = 1200, maxHeight = 800, quality = 0.85): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        // High fidelity compression
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

export function checkIsTableOrder(order?: Partial<OrderItem> | null): boolean {
  if (!order) return false;
  if (order.orderType === 'table' || order.isTableOrder) return true;
  if (order.customerName?.toLowerCase().startsWith('mesa ') || order.customerAddress?.toLowerCase().includes('mesa')) return true;
  return false;
}

export function checkIsPickupOrder(order?: Partial<OrderItem> | null): boolean {
  if (!order) return false;
  if (order.orderType === 'pickup') return true;
  if (order.customerAddress?.toLowerCase().includes('recoger')) return true;
  return false;
}

interface DashboardProps {
  userProfile: UserProfile;
  onLogout: () => void;
  onNavigateAdmin: () => void;
}

export default function Dashboard({ userProfile, onLogout, onNavigateAdmin }: DashboardProps) {
  const [profile, setProfile] = useState<UserProfile>({
    ...userProfile,
    currency: userProfile.currency || '$'
  });
  const [usernameField, setUsernameField] = useState(userProfile.username || '');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'design' | 'analytics' | 'subscription' | 'bank'>('overview');
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isAdminVoiceAssistantOpen, setIsAdminVoiceAssistantOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // System settings and real-time administrator synchronization
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(() => {
    try {
      const cached = localStorage.getItem('linnk_system_settings');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return { adminEmails: ['alexxrealpee@gmail.com', 'margaritavall1720@gmail.com'] };
  });

  useEffect(() => {
    const unsubscribe = listenToSystemSettings((st) => {
      if (st) setSystemSettings(st);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const activeAuthEmail = auth?.currentUser?.email || profile.email || '';
  const isUserAdmin = Boolean(
    profile.role === 'admin' ||
    checkIsAdminEmail(profile.email, systemSettings?.adminEmails) ||
    checkIsAdminEmail(activeAuthEmail, systemSettings?.adminEmails) ||
    (systemSettings?.adminEmails && Array.isArray(systemSettings.adminEmails) && activeAuthEmail && systemSettings.adminEmails.some(e => typeof e === 'string' && e.toLowerCase().trim() === activeAuthEmail.toLowerCase().trim()))
  );

  // WhatsApp requirement modal states
  const [isWhatsAppRequiredModalOpen, setIsWhatsAppRequiredModalOpen] = useState(false);
  const [quickOwnerWhatsAppInput, setQuickOwnerWhatsAppInput] = useState('');
  const [quickCustomerServiceWhatsAppInput, setQuickCustomerServiceWhatsAppInput] = useState('');
  const [isSavingQuickWhatsApp, setIsSavingQuickWhatsApp] = useState(false);
  const [quickWhatsAppError, setQuickWhatsAppError] = useState('');

  const handleSaveBankAccounts = async (updatedAccounts: BankAccount[]) => {
    const updatedProfile = {
      ...profile,
      bankAccounts: updatedAccounts
    };
    await saveProfile(updatedProfile);
    setProfile(updatedProfile);
  };
  
  // Data states
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [productStatusFilter, setProductStatusFilter] = useState('all'); // 'all', 'public', 'hidden'
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [analyticsViews, setAnalyticsViews] = useState<PageViewAnalytic[]>([]);
  const [newOrderAlert, setNewOrderAlert] = useState<string | null>(null);

  // Browser Push Notification Permission state
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    } else {
      setPushPermission('unsupported');
    }
  }, []);

  const requestPushPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        if (permission === 'granted') {
          playNewOrderNotification();
        }
      } catch (e) {
        console.warn("Could not request notification permission:", e);
      }
    }
  };

  // Ref to track known order IDs for real-time notification
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  // Function to trigger voice "¡Llegó un pedido!", push notification, sound chime and vibration
  const playNewOrderNotification = async (order?: OrderItem) => {
    // 1. Play Web Audio Chime (pleasant bell double-tone)
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        gain1.gain.setValueAtTime(0.4, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.15); // A5
        gain2.gain.setValueAtTime(0.5, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.7);
      }
    } catch (err) {
      console.warn("Web Audio API chime error:", err);
    }

    // 2. Play Voice "¡Llegó un pedido!"
    try {
      if (notificationAudioRef.current) {
        notificationAudioRef.current.pause();
        notificationAudioRef.current = null;
      }

      // Try OpenAI TTS endpoint for high-quality natural Colombian voice
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '¡Llegó un pedido!', voice: 'alloy' })
      });

      if (res.ok) {
        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        notificationAudioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
        };
        await audio.play();
      } else {
        throw new Error("TTS endpoint returned non-ok");
      }
    } catch (err) {
      // Fallback to browser speech synthesis
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance('¡Llegó un pedido!');
          utterance.lang = 'es-CO';
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
        } catch (speechErr) {
          console.warn("Speech synthesis fallback error:", speechErr);
        }
      }
    }

    // 3. Browser Push Notification
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          const title = '¡Llegó un pedido!';
          const body = order 
            ? `Pedido #${order.orderNumber || ''} de ${order.customerName || 'Cliente'} - Total: $${(order.totalAmount || 0).toLocaleString('es-CO')} pesos`
            : 'Tienes un nuevo pedido pendiente para preparar y despachar.';

          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
              registration.showNotification(title, {
                body,
                icon: '/favicon.svg',
                badge: '/favicon.svg',
                tag: 'new-order-' + (order?.id || Date.now()),
                renotify: true
              } as any);
            }).catch(() => {
              new Notification(title, { body, icon: '/favicon.svg' });
            });
          } else {
            new Notification(title, { body, icon: '/favicon.svg' });
          }
        }
      }
    } catch (pushErr) {
      console.warn("Push notification error:", pushErr);
    }

    // 4. Mobile Haptic Vibration
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    } catch (vibErr) {
      // ignore
    }
  };

  const handleSyncOrders = async () => {
    if (!profile.uid) return;
    setIsSyncingOrders(true);
    try {
      const ords = await fetchOrders(profile.uid);
      if (knownOrderIdsRef.current !== null) {
        const newOrders = ords.filter(o => !knownOrderIdsRef.current!.has(o.id));
        if (newOrders.length > 0) {
          const newestOrder = newOrders[0];
          playNewOrderNotification(newestOrder);
          setNewOrderAlert(newestOrder.customerName ? `¡Llegó un pedido de ${newestOrder.customerName}!` : "¡Llegó un pedido!");
          setTimeout(() => setNewOrderAlert(null), 6000);
        }
      }
      knownOrderIdsRef.current = new Set(ords.map(o => o.id));
      setOrders(ords);
    } catch (err) {
      console.warn("Manual orders sync failed", err);
    } finally {
      setIsSyncingOrders(false);
    }
  };
  
  // Subscription and Payments states
  const [myPayments, setMyPayments] = useState<SubscriptionPayment[]>([]);
  const [receiptNotes, setReceiptNotes] = useState('');
  const [uploadedReceiptBase64, setUploadedReceiptBase64] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);
  const [selectedSubPlan, setSelectedSubPlan] = useState<'basico' | 'medio' | 'pro'>('basico');

  // Custom Themes
  const [customTheme, setCustomTheme] = useState<CustomTheme>({
    id: 'fuego-burger',
    name: 'Fuego Grill & Burger',
    category: 'food',
    bgType: 'flat',
    bgColor: '#0c0d12',
    textColor: '#ffffff',
    cardBg: '#151722',
    cardBorder: 'rgba(249, 115, 22, 0.35)',
    cardTextColor: '#ffffff',
    fontFamily: 'font-display',
    buttonStyle: 'rounded',
    accentColor: '#f97316'
  });
  const [themeCategoryFilter, setThemeCategoryFilter] = useState<string>('all');
  const [themeSearchQuery, setThemeSearchQuery] = useState<string>('');
  const [isCustomThemeOpen, setIsCustomThemeOpen] = useState<boolean>(false);
  const [isSavingTheme, setIsSavingTheme] = useState<boolean>(false);
  const [themeSavedSuccess, setThemeSavedSuccess] = useState<boolean>(false);
  const [bannerSavedSuccess, setBannerSavedSuccess] = useState<boolean>(false);

  // UI Utilities states
  const [copiedLink, setCopiedLink] = useState(false);
  const [loadingResources, setLoadingResources] = useState(true);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  
  // Form Product states
  const [isAddingProd, setIsAddingProd] = useState(false);
  const [editingProd, setEditingProd] = useState<ProductItem | null>(null);
  
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodComparePrice, setProdComparePrice] = useState('');
  const [prodImage, setProdImage] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodStock, setProdStock] = useState('10');
  const [prodVariants, setProdVariants] = useState(''); // Comma separated e.g. "S, M, L"
  const [prodActive, setProdActive] = useState(true);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [isCompressingLogo, setIsCompressingLogo] = useState(false);
  const [isCompressingBanner, setIsCompressingBanner] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [showBasicTrialModal, setShowBasicTrialModal] = useState(false);
  
  // Detail Order overlay state
  const [viewingOrder, setViewingOrder] = useState<OrderItem | null>(null);

  // Manual Create Order form states
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [isTableOrder, setIsTableOrder] = useState(false);
  const [newOrderTableNum, setNewOrderTableNum] = useState('1');
  const [newOrderCustName, setNewOrderCustName] = useState('');
  const [newOrderCustPhone, setNewOrderCustPhone] = useState('');
  const [newOrderCustEmail, setNewOrderCustEmail] = useState('');
  const [newOrderCustAddress, setNewOrderCustAddress] = useState('');
  const [newOrderPaymentMethod, setNewOrderPaymentMethod] = useState<'whatsapp' | 'transfer' | 'delivery_cash' | 'cod'>('whatsapp');
  const [newOrderStatus, setNewOrderStatus] = useState<'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'>('pending');
  const [newOrderItems, setNewOrderItems] = useState<{ productId: string; quantity: number; selectedVariant?: string }[]>([]);
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [newOrderProofImage, setNewOrderProofImage] = useState('');
  const [isSavingManualOrder, setIsSavingManualOrder] = useState(false);
  const isSavingManualOrderRef = useRef(false);

  // Load Dashboard Data
  const loadDashboardData = async () => {
    setLoadingResources(true);
    try {
      // Load products from Firestore
      const prods = await fetchProductsAllState(profile.uid);
      setProducts(prods);

      // Auto-sync locally-cached links to Firestore if any are missing
      try {
        const localLinksKey = `linnk_links_${profile.uid}`;
        const cachedLinksStr = localStorage.getItem(localLinksKey);
        if (cachedLinksStr) {
          const cachedLinks = JSON.parse(cachedLinksStr);
          if (Array.isArray(cachedLinks) && cachedLinks.length > 0) {
            const { fetchProfileByUsername } = await import('../lib/firebase');
            const details = await fetchProfileByUsername(profile.username);
            const missingLinks = cachedLinks.filter(cl => !details.links.some(dl => dl.id === cl.id));
            if (missingLinks.length > 0) {
              console.log("Detecting offline/missing links in Firestore. Migrating...", missingLinks);
              const { saveLinks } = await import('../lib/firebase');
              const mergedLinks = [...details.links, ...missingLinks];
              await saveLinks(profile.uid, mergedLinks);
            }
          }
        }
      } catch (syncErr) {
        console.error("Auto links migration failed", syncErr);
      }

      // Load orders
      const ords = await fetchOrders(profile.uid);
      setOrders(ords);
      if (knownOrderIdsRef.current === null) {
        knownOrderIdsRef.current = new Set(ords.map(o => o.id));
      }

      // Load subscription payments
      const payments = await fetchMySubscriptionPayments(profile.uid);
      setMyPayments(payments);

      // Load theme and profile configuration
      const { fetchProfileByUsername } = await import('../lib/firebase');
      const details = await fetchProfileByUsername(profile.username);
      if (details.profile) {
        setProfile({
          ...details.profile,
          currency: details.profile.currency || '$'
        });
        setUsernameField(details.profile.username || '');
        if (details.profile.subscriptionPlan) {
          setSelectedSubPlan(details.profile.subscriptionPlan);
        }
      }
      if (details.customTheme) {
        setCustomTheme(details.customTheme);
      }
      
      // Load visitor analytics
      const report = await fetchAnalyticsReports(profile.uid);
      if (report && report.views) {
        setAnalyticsViews(report.views);
      }
    } catch (e) {
      console.error("Error loading merchant resources", e);
    } finally {
      setLoadingResources(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [profile.uid]);

  // Real-time background subscriptions (orders and products)
  useEffect(() => {
    if (!profile.uid) return;

    const unsubOrders = subscribeOrders(profile.uid, (ords) => {
      if (knownOrderIdsRef.current === null) {
        // Initial load: populate known IDs without alerting
        knownOrderIdsRef.current = new Set(ords.map(o => o.id));
      } else {
        // Check if there are new order IDs
        const newOrders = ords.filter(o => !knownOrderIdsRef.current!.has(o.id));
        if (newOrders.length > 0) {
          const newestOrder = newOrders[0];
          playNewOrderNotification(newestOrder);
          setNewOrderAlert(newestOrder.customerName ? `¡Llegó un pedido de ${newestOrder.customerName}!` : "¡Llegó un pedido!");
          setTimeout(() => setNewOrderAlert(null), 6000);
        }
        knownOrderIdsRef.current = new Set(ords.map(o => o.id));
      }
      setOrders(ords);
    });

    const unsubProducts = subscribeProducts(profile.uid, (prods) => {
      setProducts(prods);
    });

    return () => {
      unsubOrders();
      unsubProducts();
    };
  }, [profile.uid]);

  // Handle Tab Switch
  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalyticsReports(profile.uid).then(report => {
        if (report && report.views) {
          setAnalyticsViews(report.views);
        }
      });
    }
    if (activeTab === 'orders') {
      fetchOrders(profile.uid).then(ords => {
        setOrders(ords);
      });
    }
  }, [activeTab]);

  // Copy Profile URL
  const copyLinnkUrl = () => {
    const u = `${window.location.origin}/${profile.username}`;
    navigator.clipboard.writeText(u);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Submit Profile update (Design Tab)
  const handleUpdateStoreProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError('');
    try {
      const cleanUsername = usernameField.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (cleanUsername.length < 3) {
        setUsernameError('El nombre de usuario debe tener al menos 3 caracteres.');
        return;
      }
      
      if (cleanUsername !== profile.username) {
        setCheckingUsername(true);
        const available = await isUsernameAvailable(cleanUsername);
        setCheckingUsername(false);
        if (!available) {
          setUsernameError('Este enlace de la tienda ya está ocupado por otro usuario.');
          return;
        }
      }

      const updatedProfile = {
        ...profile,
        username: cleanUsername
      };

      await saveProfile(updatedProfile);
      setProfile(updatedProfile);
      alert("¡Perfil de la tienda guardado con éxito!");
    } catch (err) {
      console.error(err);
      alert("Ocurrió un error al guardar los cambios.");
    }
  };

  // Toggle store opened / closed status
  const toggleStoreStatus = async () => {
    if (updatingStatus) return;
    if (profile.suspended || profile.subscriptionStatus === 'suspended') {
      alert("⚠️ Tu tienda se encuentra suspendida. Realiza el pago o ponte en contacto con soporte para reactivar tu cuenta y abrir tu tienda.");
      return;
    }
    setUpdatingStatus(true);
    try {
      const isCurrentlyClosed = checkIsStoreClosed(profile);
      const nextClosedState = !isCurrentlyClosed;
      const updatedProfile = {
        ...profile,
        isClosed: nextClosedState,
        ...(nextClosedState === false && profile.scheduleEnabled ? { scheduleEnabled: false } : {})
      };
      await saveProfile(updatedProfile);
      setProfile(updatedProfile);
    } catch (err) {
      console.error(err);
      alert("Ocurrió un error al cambiar el estado de la tienda.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Select Preset Theme
  const handleSelectTheme = async (theme: CustomTheme) => {
    setCustomTheme(theme);
    setProfile(prev => ({ ...prev, customTheme: theme }));
    setIsSavingTheme(true);
    try {
      await saveCustomTheme(profile.uid, theme);
      setThemeSavedSuccess(true);
      setTimeout(() => setThemeSavedSuccess(false), 3000);
    } catch (e) {
      console.error("Error saving theme:", e);
    } finally {
      setIsSavingTheme(false);
    }
  };

  // Save Custom Theme edits
  const handleSaveCustomTheme = async () => {
    setIsSavingTheme(true);
    try {
      const themeToSave: CustomTheme = {
        ...customTheme,
        id: customTheme.id === 'custom' ? 'custom' : `custom-${Date.now()}`
      };
      setCustomTheme(themeToSave);
      setProfile(prev => ({ ...prev, customTheme: themeToSave }));
      await saveCustomTheme(profile.uid, themeToSave);
      setThemeSavedSuccess(true);
      setTimeout(() => setThemeSavedSuccess(false), 3000);
    } catch (e) {
      console.error("Error saving custom theme:", e);
      alert("Error al guardar la personalización de tema.");
    } finally {
      setIsSavingTheme(false);
    }
  };

  // Select Layout style
  const handleSelectLayout = async (layout: 'food' | 'liquor' | 'default' | 'shoes' | 'tech') => {
    try {
      const updatedProfile = {
        ...profile,
        layout
      };
      setProfile(updatedProfile);
      await saveProfile(updatedProfile);
      setThemeSavedSuccess(true);
      setTimeout(() => setThemeSavedSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar la plantilla.");
    }
  };

  // Delete product item
  const handleDeleteProduct = async (prodId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este producto?")) return;
    try {
      await deleteProductItem(prodId, profile.uid);
      setProducts(prev => prev.filter(p => p.id !== prodId));
    } catch (e) {
      console.error(e);
    }
  };

  // Helper to save WhatsApp numbers quickly when attempting to create a product
  const handleSaveQuickWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    let cleanOwner = quickOwnerWhatsAppInput.replace(/\D/g, '');
    if (cleanOwner.startsWith('57') && cleanOwner.length >= 12) cleanOwner = cleanOwner.slice(2);
    cleanOwner = cleanOwner.slice(0, 10);

    if (cleanOwner.length < 7) {
      setQuickWhatsAppError('Por favor ingresa un número de WhatsApp del propietario válido (mínimo 7 a 10 dígitos, ej: 3106502043).');
      return;
    }

    let cleanCustomer = quickCustomerServiceWhatsAppInput.replace(/\D/g, '');
    if (cleanCustomer.startsWith('57') && cleanCustomer.length >= 12) cleanCustomer = cleanCustomer.slice(2);
    cleanCustomer = cleanCustomer.slice(0, 10);

    setIsSavingQuickWhatsApp(true);
    setQuickWhatsAppError('');
    try {
      const isFirstProduct = !editingProd && products.length === 0;
      const updatedProfile: UserProfile = {
        ...profile,
        ownerWhatsapp: cleanOwner,
        customerServiceWhatsapp: cleanCustomer || undefined,
        whatsapp: cleanCustomer || cleanOwner,
        phone: cleanOwner
      };

      const isBasic = (profile.subscriptionPlan || profile.plan || 'basico') === 'basico';
      if ((products.length >= 1 || isFirstProduct) && isBasic && profile.subscriptionStatus !== 'active') {
        if (!updatedProfile.subscriptionTrialExpires) {
          updatedProfile.subscriptionTrialExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          updatedProfile.subscriptionStatus = 'trial';
        }
      }

      await saveProfile(updatedProfile);
      setProfile(updatedProfile);
      setIsWhatsAppRequiredModalOpen(false);
      
      if (products.length >= 1 && isBasic && profile.subscriptionStatus !== 'active') {
        setShowBasicTrialModal(true);
      } else {
        // Immediately open product creation modal!
        triggerAddProductForm(updatedProfile);
      }
    } catch (err) {
      console.error("Error guardando WhatsApp:", err);
      setQuickWhatsAppError("No se pudo guardar el número de WhatsApp. Inténtalo de nuevo.");
    } finally {
      setIsSavingQuickWhatsApp(false);
    }
  };

  // Open Add Form
  const triggerAddProductForm = (overrideProfile?: UserProfile) => {
    const currentProf = overrideProfile || profile;
    const currentWhatsApp = (currentProf.ownerWhatsapp || currentProf.whatsapp || currentProf.phone || '').replace(/\D/g, '');
    
    // Condition: Seller cannot create products until Owner WhatsApp is configured
    if (!currentWhatsApp || currentWhatsApp.length < 7) {
      setQuickOwnerWhatsAppInput(currentProf.ownerWhatsapp || currentProf.whatsapp || currentProf.phone || '');
      setQuickCustomerServiceWhatsAppInput(currentProf.customerServiceWhatsapp || '');
      setQuickWhatsAppError('');
      setIsWhatsAppRequiredModalOpen(true);
      return;
    }

    const userPlan = currentProf.subscriptionPlan || currentProf.plan || 'basico';
    const limit = getPlanProductLimit(userPlan);
    if (products.length >= limit) {
      if (currentProf.subscriptionStatus === 'under_review' && currentProf.requestedPlan) {
        const reqPlanName = currentProf.requestedPlan === 'medio' ? 'Plan Medio (12 productos)' : 'Plan Avanzado (24 productos)';
        alert(`¡Límite de productos alcanzado!\n\nTu plan actual activo sigue siendo Plan Básico (${limit} productos).\n\nTu comprobante para ascender a ${reqPlanName} ya fue enviado y está en cola de revisión por el Administrador.\n\nTan pronto el Administrador apruebe tu pago, se activará tu nuevo cupo de productos.`);
      } else {
        alert(`¡Límite de productos alcanzado!\n\nTu plan actual (${userPlan === 'medio' ? 'Plan Medio' : userPlan === 'pro' || userPlan === 'avanzado' ? 'Plan Avanzado' : 'Plan Básico'}) te permite subir hasta ${limit} productos.\n\nPara pasar al Plan Medio (hasta 12 productos), ingresa a "Suscripción y Pagos", realiza la transferencia y envía tu comprobante de pago para que el Administrador lo apruebe.`);
      }
      setActiveTab('subscription');
      return;
    }

    setEditingProd(null);
    setProdName('');
    setProdDesc('');
    setProdPrice('');
    setProdComparePrice('');
    setProdImage('');
    setProdCategory('🍔 Hamburguesas');
    setProdStock('15');
    setProdVariants('');
    setProdActive(true);
    setIsAddingProd(true);
  };

  // Open Edit Form
  const triggerEditProductForm = (prod: ProductItem) => {
    setEditingProd(prod);
    setProdName(prod.name || '');
    setProdDesc(prod.description || '');
    setProdPrice(prod.price !== undefined && prod.price !== null ? prod.price.toString() : '');
    setProdComparePrice(prod.compareAtPrice !== undefined && prod.compareAtPrice !== null ? prod.compareAtPrice.toString() : '');
    setProdImage(prod.imageURL || '');
    setProdCategory(prod.category || 'General');
    setProdStock(prod.stock !== undefined && prod.stock !== null ? prod.stock.toString() : '10');
    setProdVariants(prod.variantsText || '');
    setProdActive(prod.active !== false);
    setIsAddingProd(true);
  };

  // Price parser helper for COP and international amounts
  const parsePriceInput = (val: string): number => {
    if (!val) return NaN;
    const clean = val.toString().replace(/[^0-9.,]/g, '').trim();
    if (!clean) return NaN;

    if (clean.includes('.') && clean.includes(',')) {
      const lastDot = clean.lastIndexOf('.');
      const lastComma = clean.lastIndexOf(',');
      if (lastDot > lastComma) {
        return parseFloat(clean.replace(/,/g, ''));
      } else {
        return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
      }
    }

    if (clean.includes('.') && !clean.includes(',')) {
      const parts = clean.split('.');
      if (parts.length > 2) {
        return parseFloat(clean.replace(/\./g, ''));
      }
      if (parts.length === 2) {
        if (parts[1].length === 3) {
          return parseFloat(clean.replace(/\./g, ''));
        }
        return parseFloat(clean);
      }
    }

    if (clean.includes(',') && !clean.includes('.')) {
      const parts = clean.split(',');
      if (parts.length > 2) {
        return parseFloat(clean.replace(/,/g, ''));
      }
      if (parts.length === 2) {
        if (parts[1].length === 3) {
          return parseFloat(clean.replace(/,/g, ''));
        }
        return parseFloat(clean.replace(',', '.'));
      }
    }

    return parseFloat(clean);
  };

  // Save product form handler
  const handleSaveProductForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProduct) return;

    // Condition: WhatsApp is strictly required to publish and save products
    const currentOwnerWhatsApp = (profile.ownerWhatsapp || profile.whatsapp || profile.phone || '').replace(/\D/g, '');
    if (!currentOwnerWhatsApp || currentOwnerWhatsApp.length < 7) {
      alert("⚠️ Requisito indispensable: Para publicar productos debes agregar primero el número de WhatsApp del propietario de tu tienda.");
      setIsAddingProd(false);
      setQuickOwnerWhatsAppInput(profile.ownerWhatsapp || profile.whatsapp || profile.phone || '');
      setQuickCustomerServiceWhatsAppInput(profile.customerServiceWhatsapp || '');
      setQuickWhatsAppError('');
      setIsWhatsAppRequiredModalOpen(true);
      return;
    }

    const userPlan = profile.subscriptionPlan || profile.plan || 'basico';
    const limit = getPlanProductLimit(userPlan);

    if (!editingProd) {
      if (products.length >= limit) {
        if (profile.subscriptionStatus === 'under_review' && profile.requestedPlan) {
          const reqPlanName = profile.requestedPlan === 'medio' ? 'Plan Medio (12 productos)' : 'Plan Avanzado (24 productos)';
          alert(`¡Límite de productos alcanzado!\n\nTu plan actual activo sigue siendo Plan Básico (${limit} productos).\n\nTu comprobante para ascender a ${reqPlanName} ya fue enviado y está en cola de revisión por el Administrador.\n\nTan pronto el Administrador apruebe tu pago, se activará tu nuevo cupo.`);
        } else {
          alert(`¡Límite de productos alcanzado!\n\nTu plan actual (${userPlan === 'medio' ? 'Plan Medio' : userPlan === 'pro' || userPlan === 'avanzado' ? 'Plan Avanzado' : 'Plan Básico'}) te permite subir hasta ${limit} productos.\n\nPara pasar al Plan Medio (hasta 12 productos), ingresa a "Suscripción y Pagos", realiza la transferencia y envía tu comprobante de pago para que el Administrador lo apruebe.`);
        }
        setActiveTab('subscription');
        setIsAddingProd(false);
        return;
      }
    }

    if (!prodName || !prodName.trim()) {
      alert("Por favor, introduce el nombre del producto.");
      return;
    }

    const cleanPrice = parsePriceInput(prodPrice);
    if (isNaN(cleanPrice) || cleanPrice < 0) {
      alert("Por favor, introduce un precio de venta válido.");
      return;
    }

    let cleanComparePrice: number | undefined = undefined;
    if (prodComparePrice && prodComparePrice.trim() !== '') {
      const parsedComp = parsePriceInput(prodComparePrice);
      if (!isNaN(parsedComp) && parsedComp >= 0) {
        cleanComparePrice = parsedComp;
      }
    }

    const payload: ProductItem = {
      id: editingProd ? editingProd.id : `temp_${Date.now()}`,
      userId: profile.uid,
      name: prodName.trim(),
      description: prodDesc ? prodDesc.trim() : '',
      price: cleanPrice,
      compareAtPrice: cleanComparePrice,
      imageURL: prodImage || undefined,
      category: prodCategory ? prodCategory.trim() : 'General',
      stock: isNaN(parseInt(prodStock)) ? 10 : parseInt(prodStock),
      variantsText: prodVariants ? prodVariants.trim() : '',
      active: prodActive
    };

    try {
      setIsSavingProduct(true);
      const isFirstProductCreation = !editingProd && products.length === 0;
      const saved = await saveProduct(payload);
      if (editingProd) {
        setProducts(prev => {
          const updated = prev.map(p => (p.id === editingProd.id || p.id === saved.id) ? saved : p);
          return deduplicateProducts(updated);
        });
      } else {
        setProducts(prev => {
          const exists = prev.some(p => p.id === saved.id || (p.name.trim().toLowerCase() === saved.name.trim().toLowerCase() && p.id.startsWith('temp_')));
          if (exists) {
            return deduplicateProducts(prev.map(p => (p.id === saved.id || (p.name.trim().toLowerCase() === saved.name.trim().toLowerCase() && p.id.startsWith('temp_'))) ? saved : p));
          }
          return deduplicateProducts([...prev, saved]);
        });
      }
      setIsAddingProd(false);
      setEditingProd(null);

      // Check if this is a product creation in Basic Plan -> Launch 7-Day Reverse Clock Trial Modal
      const isBasicPlan = (profile.subscriptionPlan || profile.plan || 'basico') === 'basico';
      const isTrialOrUnpaid = profile.subscriptionStatus !== 'active';

      if (!editingProd && isBasicPlan && isTrialOrUnpaid) {
        const trialExpires = profile.subscriptionTrialExpires || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const updatedProf: UserProfile = {
          ...profile,
          subscriptionPlan: 'basico',
          subscriptionStatus: profile.subscriptionStatus === 'under_review' ? 'under_review' : 'trial',
          subscriptionTrialExpires: trialExpires
        };
        setProfile(updatedProf);
        saveProfile(updatedProf).catch(console.error);
        setShowBasicTrialModal(true);
      }
    } catch (e) {
      console.error("Error saving product:", e);
      alert("Ocurrió un error al intentar guardar el producto. Por favor intenta de nuevo.");
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Modify Order Status
  const handleUpdateStatus = async (orderId: string, status: OrderItem['status']) => {
    try {
      await updateOrderStatus(orderId, profile.uid, status);
      // Update local state
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      if (viewingOrder && viewingOrder.id === orderId) {
        setViewingOrder(prev => prev ? { ...prev, status } : null);
      }
    } catch(e) {
      console.error(e);
    }
  };

  // Format Price Values
  const formatPrice = (val: number) => {
    return `${profile.currency || '$'}${val.toLocaleString()}`;
  };

  // Manual Create Order methods
  const calculateNewOrderTotal = () => {
    return newOrderItems.reduce((sum, item) => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return sum;
      return sum + (prod.price * item.quantity);
    }, 0);
  };

  const handleAddOrderItem = (productId: string, variant?: string) => {
    setNewOrderItems(prev => {
      const existing = prev.find(item => item.productId === productId && item.selectedVariant === variant);
      if (existing) {
        return prev.map(item => 
          (item.productId === productId && item.selectedVariant === variant) 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [...prev, { productId, quantity: 1, selectedVariant: variant }];
      }
    });
  };

  const handleRemoveOrderItem = (productId: string, variant?: string) => {
    setNewOrderItems(prev => {
      const existing = prev.find(item => item.productId === productId && item.selectedVariant === variant);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter(item => !(item.productId === productId && item.selectedVariant === variant));
      } else {
        return prev.map(item => 
          (item.productId === productId && item.selectedVariant === variant) 
            ? { ...item, quantity: item.quantity - 1 }
            : item
        );
      }
    });
  };

  const handleUpdateItemVariant = (productId: string, oldVariant: string | undefined, newVariant: string) => {
    setNewOrderItems(prev => {
      const itemToUpdate = prev.find(item => item.productId === productId && item.selectedVariant === oldVariant);
      if (!itemToUpdate) return prev;

      const existingNewVariant = prev.find(item => item.productId === productId && item.selectedVariant === newVariant);
      if (existingNewVariant) {
        return prev
          .filter(item => !(item.productId === productId && (item.selectedVariant === oldVariant || item.selectedVariant === newVariant)))
          .concat({ productId, quantity: itemToUpdate.quantity + existingNewVariant.quantity, selectedVariant: newVariant });
      } else {
        return prev.map(item => 
          (item.productId === productId && item.selectedVariant === oldVariant)
            ? { ...item, selectedVariant: newVariant }
            : item
        );
      }
    });
  };

  const handleSaveManualOrder = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();

    if (isSavingManualOrderRef.current) return;

    let finalCustName = newOrderCustName.trim();
    let finalCustPhone = newOrderCustPhone.trim();
    let finalCustAddress = newOrderCustAddress.trim();

    if (isTableOrder) {
      const tableStr = newOrderTableNum.trim() || '1';
      finalCustName = `Mesa ${tableStr}`;
      finalCustPhone = profile.phone ? profile.phone.replace(/\D/g, '') : '3000000000';
      if (!finalCustPhone || finalCustPhone.length < 7) {
        finalCustPhone = '3000000000';
      }
      finalCustAddress = `Atención en Mesa ${tableStr} (Local)`;
    } else {
      if (!finalCustName) {
        alert("Por favor ingresa el nombre del cliente.");
        return;
      }
      if (!finalCustPhone) {
        alert("Por favor ingresa el teléfono del cliente.");
        return;
      }
      if (!finalCustAddress) {
        alert("Por favor ingresa la dirección de entrega o retiro.");
        return;
      }
    }

    if (newOrderItems.length === 0) {
      alert("Por favor selecciona al menos un producto.");
      return;
    }

    isSavingManualOrderRef.current = true;
    setIsSavingManualOrder(true);
    try {
      const selectedItems = newOrderItems.map(item => {
        const prod = products.find(p => p.id === item.productId)!;
        return {
          productId: item.productId,
          name: prod.name,
          price: prod.price,
          quantity: item.quantity,
          selectedVariant: item.selectedVariant || undefined,
          imageURL: prod.imageURL || undefined
        };
      });

      const nextOrderNumber = orders.length > 0
        ? Math.max(...orders.map(o => o.orderNumber || 0)) + 1
        : Math.floor(1000 + Math.random() * 9000);

      const formattedPhone = formatColombianPhoneWith57(finalCustPhone);

      const newOrder: OrderItem = {
        id: `order_${Date.now()}`,
        storeOwnerId: profile.uid,
        storeName: profile.displayName || profile.username,
        storeAddress: profile.address || profile.location || '',
        storePhone: profile.whatsapp || profile.phone || '',
        orderNumber: nextOrderNumber,
        orderType: isTableOrder ? 'table' : 'delivery',
        isTableOrder: isTableOrder,
        customerName: finalCustName,
        customerPhone: formattedPhone,
        customerEmail: isTableOrder ? undefined : (newOrderCustEmail.trim() || undefined),
        customerAddress: finalCustAddress,
        paymentMethod: newOrderPaymentMethod,
        status: newOrderStatus,
        items: selectedItems,
        totalAmount: calculateNewOrderTotal(),
        notes: newOrderNotes.trim() || (isTableOrder ? `Pedido en Mesa ${newOrderTableNum.trim() || '1'}` : undefined),
        proofImage: isTableOrder ? undefined : (newOrderProofImage || undefined),
        createdAt: new Date().toISOString()
      };

      const saved = await saveOrder(newOrder);
      setOrders(prev => deduplicateOrders([saved, ...prev]));

      // Reset form states
      setIsAddingOrder(false);
      setIsTableOrder(false);
      setNewOrderTableNum('1');
      setNewOrderCustName('');
      setNewOrderCustPhone('');
      setNewOrderCustEmail('');
      setNewOrderCustAddress('');
      setNewOrderPaymentMethod('whatsapp');
      setNewOrderStatus('pending');
      setNewOrderItems([]);
      setNewOrderNotes('');
      setNewOrderProofImage('');
      
      alert("¡Pedido creado exitosamente!");
    } catch (err) {
      console.error("Error creating manual order:", err);
      alert("Error al guardar el pedido. Intenta de nuevo.");
    } finally {
      isSavingManualOrderRef.current = false;
      setIsSavingManualOrder(false);
    }
  };

  // Generate WhatsApp Notification message
  const triggerWhatsAppMessage = (order: OrderItem) => {
    const statusLang: Record<string, string> = {
      'pending': 'Pendiente ⏳',
      'processing': 'En Procesamiento 📦',
      'shipped': 'Enviado 🚚',
      'delivered': 'Entregado ✅',
      'cancelled': 'Cancelado 🚫'
    };
    
    const baseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://ryyco.com';
    const storeRatingUrl = profile.username ? `${baseUrl}/${profile.username}` : `${baseUrl}/tienda`;

    const intro = `Hola *${order.customerName}*, te contactamos de *${profile.displayName || 'la tienda'}* respecto a tu compra #${order.orderNumber}.\n\n`;
    const statusMsg = `El estado actual de tu pedido es: *${statusLang[order.status] || order.status}*.\n\n`;
    const total = `Total: *${formatPrice(order.totalAmount)}*\n\n`;
    const out = `¡Muchas gracias por tu preferencia! Cualquier consulta nos puedes escribir por aquí.\n\n`;
    const footerLinks = `-----------------------------\n` +
      `💬 *Comunicarse con soporte:* https://wa.me/573106502043\n` +
      `⭐ *Calificar tu experiencia:* ${storeRatingUrl}`;
    
    let rawPhone = order.customerPhone.replace(/[^0-9]/g, '');
    if (rawPhone.length === 10 && rawPhone.startsWith('3')) {
      rawPhone = '57' + rawPhone;
    }
    const fullText = encodeURIComponent(`${intro}${statusMsg}${total}${out}${footerLinks}`);
    window.open(`https://wa.me/${rawPhone}?text=${fullText}`, '_blank');
  };

  // Key stats computations
  const totalIncomingRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const completedRevenue = orders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const pendingOrdersCount = orders.filter(o => o.status === 'pending' || o.status === 'processing').length;
  const filteredOrders = orders.filter(o => {
    if (orderStatusFilter === 'all') return true;
    return o.status === orderStatusFilter;
  });
  const currentConversionRate = analyticsViews.length > 0 
    ? ((orders.length / analyticsViews.length) * 100).toFixed(1)
    : '5.2';

  return (
    <div className="min-h-screen bg-[#090b12] flex flex-col font-sans select-text w-full max-w-full overflow-x-hidden">
      
      {/* Top Navbar */}
      <nav className="border-b border-[#232B3A] bg-[#090b12]/95 px-6 py-4 flex flex-col md:flex-row gap-4 items-center justify-between sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center justify-between w-full md:w-auto gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border border-[#232B3A] shrink-0 bg-[#090B12] shadow-sm flex items-center justify-center p-0.5">
              <img 
                src="/favicon.svg" 
                alt="Ryyco" 
                className="w-full h-full object-contain rounded-xl"
              />
            </div>
            <div>
              <h1 className="font-extrabold text-sm text-white tracking-tight flex items-center gap-1.5 flex-wrap">
                {profile.displayName}
                {(profile.suspended || profile.subscriptionStatus === 'suspended') && (
                  <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full font-black tracking-widest uppercase shrink-0 animate-pulse">
                    SUSPENDIDA
                  </span>
                )}
              </h1>
              <p className="text-[11px] text-emerald-400 font-sans font-semibold">
                Administración de Tienda
              </p>
            </div>
          </div>

          {/* Log out ONLY ON MOBILE en la primera fila */}
          <button
            type="button"
            onClick={onLogout}
            className="md:hidden px-3.5 py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 text-red-400 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4 whitespace-nowrap" />
            Salir
          </button>
        </div>

        {/* Toolbar links */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-center md:justify-end">
          {/* View live shop */}
          <a
            href={`/${profile.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-gray-900 hover:bg-gray-850 hover:text-white rounded-xl text-xs font-bold text-gray-300 flex items-center gap-1.5 border border-gray-800 transition"
          >
            <Eye className="w-4 h-4 text-emerald-400" />
            Ver Mi Tienda
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>

          {/* QR Code Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="px-3.5 py-2 bg-gray-900 hover:bg-gray-850 hover:text-white rounded-xl text-xs font-bold text-gray-300 flex items-center gap-1.5 border border-gray-800 transition cursor-pointer"
            title="Ver y compartir Código QR de la tienda"
          >
            <QrCode className="w-4 h-4 text-red-500" />
            Código QR
          </button>

          {/* Copy shop Url */}
          <button
            type="button"
            onClick={copyLinnkUrl}
            className="px-3.5 py-2 bg-gray-900 hover:bg-gray-850 rounded-xl text-xs font-bold text-gray-300 flex items-center gap-1.5 border border-gray-800 transition"
          >
            <Copy className="w-4 h-4 text-indigo-400" />
            {copiedLink ? '¡Enlace Copiado!' : 'Copiar URL'}
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={loadDashboardData}
            title="Refrescar datos"
            className="hidden md:block p-2 bg-gray-900 hover:bg-gray-855 rounded-xl border border-gray-800 transition text-gray-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Log out (DESKTOP ONLY) */}
          <button
            type="button"
            onClick={onLogout}
            className="hidden md:flex px-3.5 py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 text-red-400 rounded-xl text-xs font-bold transition items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4 whitespace-nowrap" />
            Salir
          </button>
        </div>
      </nav>

      {/* Suspended store notification banner */}
      {(profile.suspended || profile.subscriptionStatus === 'suspended') && (
        <div className="bg-gradient-to-r from-red-950 via-amber-950 to-red-950 border-b border-red-500/40 px-6 py-3.5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 sticky top-[73px] z-30">
          <div className="flex items-center gap-3.5 text-left">
            <div className="p-2.5 bg-red-500/20 text-red-400 rounded-xl shrink-0 animate-pulse border border-red-500/30">
              <ShoppingBag className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-2">
                <span>⚠️ Tienda Suspendida</span>
                <span className="text-[9px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full border border-red-500/30 font-bold uppercase tracking-wider">
                  Pago Requerido
                </span>
              </h3>
              <p className="text-xs text-amber-200 font-medium mt-0.5">
                Realiza el pago de tu tienda para seguir vendiendo
              </p>
            </div>
          </div>
          <a
            href={`https://wa.me/573219730865?text=${encodeURIComponent(`Hola, realizo la consulta sobre el pago para reactivar mi tienda @${profile.username}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full md:w-auto px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <MessageCircle className="w-4 h-4 fill-black stroke-none" />
            <span>Pagar por WhatsApp: 3219730865</span>
          </a>
        </div>
      )}

      <div className="flex-grow flex flex-col md:flex-row w-full min-w-0 max-w-full overflow-x-hidden">
        {/* Left Side Navigation Panel */}
        <aside className="hidden md:flex md:w-64 border-r border-[#232B3A] bg-[#090b12] p-6 flex-col gap-1 shrink-0">
          
          <span className="hidden md:block text-[10px] font-black tracking-wider text-gray-500 uppercase px-3 mb-3 shrink-0">
            Navegación
          </span>

          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`w-auto md:w-full text-start py-1.5 md:py-3 px-2 md:px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition ${
              activeTab === 'overview' 
                ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-900 border border-transparent'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Resumen del Negocio
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`w-auto md:w-full text-start py-1.5 md:py-3 px-2 md:px-3.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2.5 shrink-0 transition ${
              activeTab === 'products' 
                ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-900 border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Gestor de Productos
            </span>
            <span className="text-[10px] bg-gray-900 text-gray-400 px-1.5 py-0.5 rounded-full font-bold shrink-0">
              {products.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`w-auto md:w-full text-start py-1.5 md:py-3 px-2 md:px-3.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2.5 shrink-0 transition ${
              activeTab === 'orders' 
                ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-900 border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Pedidos / Ordenes
            </span>
            {pendingOrdersCount > 0 && (
              <span className="text-[10px] bg-amber-450/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                {pendingOrdersCount} nuevos
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('design')}
            className={`w-auto md:w-full text-start py-1.5 md:py-3 px-2 md:px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition ${
              activeTab === 'design' 
                ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-900 border border-transparent'
            }`}
          >
            <Palette className="w-4 h-4" />
            Diseñador de Tienda
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`w-auto md:w-full text-start py-1.5 md:py-3 px-2 md:px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition ${
              activeTab === 'analytics' 
                ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-900 border border-transparent'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Estadísticas / Visitas
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subscription')}
            className={`w-auto md:w-full text-start py-1.5 md:py-3 px-2 md:px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition ${
              activeTab === 'subscription' 
                ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-900 border border-transparent'
            }`}
          >
            <CreditCard className="w-4 h-4 text-indigo-400" />
            Suscripción y Pagos
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bank')}
            className={`w-auto md:w-full text-start py-1.5 md:py-3 px-2 md:px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition ${
              activeTab === 'bank' 
                ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-500/10' 
                : 'text-gray-400 hover:text-white hover:bg-gray-900 border border-transparent'
            }`}
          >
            <Landmark className="w-4 h-4 text-emerald-400" />
            Datos Bancarios
          </button>

          {isUserAdmin && (
            <button
              type="button"
              onClick={onNavigateAdmin}
              className="w-auto md:w-full text-start py-1.5 md:py-3 px-2 md:px-3.5 mt-0 md:mt-2 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-500/20 shrink-0 transition"
            >
              <Users className="w-4 h-4 text-indigo-300 animate-pulse" />
              Panel Administrador
            </button>
          )}

          <div className="mt-auto pt-6 border-t border-gray-900 flex flex-col gap-2 text-[11px] text-gray-550 font-medium leading-relaxed">
            <span className="text-[9px] font-black text-gray-650 uppercase tracking-widest block font-mono">Mi Suscripción</span>
            <div 
              onClick={() => setActiveTab('subscription')}
              className="bg-gradient-to-tr from-indigo-550/10 to-emerald-555/10 border border-gray-850 p-3 rounded-xl cursor-pointer hover:border-gray-700 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-extrabold text-white">
                  {(profile.subscriptionPlan || profile.plan) === 'medio' ? 'Plan Medio' : (profile.subscriptionPlan || profile.plan) === 'pro' || (profile.subscriptionPlan || profile.plan) === 'avanzado' ? 'Plan Avanzado' : 'Plan Básico'}
                </span>
                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                  profile.subscriptionStatus === 'trial' ? 'bg-amber-400 text-black' :
                  profile.subscriptionStatus === 'active' ? 'bg-indigo-500 text-white' :
                  profile.subscriptionStatus === 'under_review' ? 'bg-amber-500 text-black' : 'bg-red-500 text-white'
                }`}>
                  {profile.subscriptionStatus === 'trial' ? '7 DÍAS GRATIS' :
                   profile.subscriptionStatus === 'active' ? 'ACTIVO' :
                   profile.subscriptionStatus === 'under_review' ? 'REVISIÓN' : 'VENCIDO'}
                </span>
              </div>
              <p className="text-gray-500 text-[10px]">
                Límite: {products.length} / {getPlanProductLimit(profile.subscriptionPlan || profile.plan)} productos.
              </p>
              <div className="w-full bg-gray-900 h-1.5 rounded-full mt-2 overflow-hidden border border-gray-850">
                <div 
                  className={`h-full ${products.length >= getPlanProductLimit(profile.subscriptionPlan || profile.plan) ? 'bg-red-500' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(100, (products.length / getPlanProductLimit(profile.subscriptionPlan || profile.plan)) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Workspace */}
        <main className="flex-1 w-full min-w-0 max-w-full p-3 sm:p-4 md:p-8 pb-36 md:pb-8 bg-[#090b12] overflow-y-auto overflow-x-hidden">
          {loadingResources ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-500 font-semibold tracking-wider">Cargando panel de control...</span>
            </div>
          ) : (
            <>
              {/* Sticky 7-Day Trial Reverse Clock Banner */}
              <DashboardTrialBanner 
                profile={profile}
                productsCount={products.length}
                onGoToPayment={() => {
                  setActiveTab('subscription');
                  setSelectedSubPlan('basico');
                  setTimeout(() => {
                    const el = document.getElementById('report-payment-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 100);
                }}
                onOpenModal={() => setShowBasicTrialModal(true)}
              />

              <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                
                {/* 1. OVERVIEW VIEW */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Control de Apertura/Cierre de Tienda */}
                    {(() => {
                      const isSuspended = profile.suspended || profile.subscriptionStatus === 'suspended';
                      const isClosedNow = checkIsStoreClosed(profile);
                      return (
                        <div className={`p-6 rounded-3xl border transition-all duration-300 ${
                          isSuspended
                            ? 'bg-amber-950/20 border-amber-500/30 shadow-amber-500/5 shadow-xl'
                            : isClosedNow 
                            ? 'bg-red-950/20 border-red-500/20 shadow-red-550/5 shadow-xl' 
                            : 'bg-emerald-950/10 border-emerald-500/10 shadow-emerald-550/5 shadow-xl'
                        }`}>
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${
                                  isSuspended ? 'bg-amber-500 animate-ping' : isClosedNow ? 'bg-red-500 animate-ping' : 'bg-emerald-500 animate-pulse'
                                }`} />
                                <h3 className="text-base font-extrabold text-white tracking-tight">
                                  Tu tienda se encuentra: {isSuspended ? '🔴 CERRADA (SUSPENDIDA)' : isClosedNow ? '🔴 CERRADA' : '🟢 ABIERTA'}
                                </h3>
                                {profile.scheduleEnabled && profile.openTime && profile.closeTime && !isSuspended && (
                                  <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1 ml-2">
                                    <Clock className="w-3 h-3 text-indigo-400" />
                                    Horario: {profile.openTime} - {profile.closeTime}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 max-w-2xl font-semibold leading-relaxed">
                                {isSuspended
                                  ? 'Tu tienda está suspendida y tus productos se encuentran ocultos en la plataforma. Realiza el pago para reactivarla y reanudar tus ventas.'
                                  : profile.isClosed 
                                  ? 'Tienda cerrada manualmente. Tus clientes verán un letrero animado de "Tienda Cerrada".'
                                  : isClosedNow
                                  ? `Tienda cerrada automáticamente según el horario asignado (${profile.openTime} - ${profile.closeTime}). Se abrirá automáticamente dentro del horario.`
                                  : 'Tus clientes pueden navegar por tu tienda, añadir productos al carrito y enviarte sus pedidos directo a tu WhatsApp.'
                                }
                              </p>
                            </div>
                            
                            {isSuspended ? (
                              <a
                                href={`https://wa.me/573219730865?text=${encodeURIComponent(`Hola, realizo la consulta sobre el pago para reactivar mi tienda @${profile.username}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/25 ring-2 ring-amber-400/30 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 active:scale-95 shrink-0"
                              >
                                Reactivar Tienda
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={toggleStoreStatus}
                                disabled={updatingStatus}
                                className={`px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 active:scale-95 shrink-0 ${
                                  isClosedNow 
                                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/25 ring-2 ring-emerald-400/30' 
                                    : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/25 ring-2 ring-red-500/30'
                                } disabled:opacity-50`}
                              >
                                {updatingStatus ? (
                                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : isClosedNow ? (
                                  'Abrir Tienda'
                                ) : (
                                  'Cerrar Tienda'
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* WhatsApp Status in Overview */}
                    {(!profile.whatsapp || !profile.whatsapp.trim()) ? (
                      <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                            ⚠️ WhatsApp de Pedidos no configurado (Muy Importante)
                          </h4>
                          <p className="text-xs text-amber-300/80 leading-relaxed max-w-2xl font-semibold">
                            Para recibir las notificaciones y los pedidos de tus clientes de manera directa en tu celular, debes configurar tu número de WhatsApp en los ajustes de tu tienda.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setQuickOwnerWhatsAppInput(profile.ownerWhatsapp || profile.whatsapp || profile.phone || '');
                            setQuickCustomerServiceWhatsAppInput(profile.customerServiceWhatsapp || '');
                            setQuickWhatsAppError('');
                            setIsWhatsAppRequiredModalOpen(true);
                          }}
                          className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs rounded-xl uppercase tracking-wider transition shrink-0 cursor-pointer flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
                        >
                          <MessageCircle className="w-4 h-4 text-black fill-black/20" />
                          <span>Configurar WhatsApp</span>
                        </button>
                      </div>
                    ) : (
                      <div className="bg-emerald-950/20 border border-emerald-500/30 p-3.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                            <MessageCircle className="w-5 h-5 fill-emerald-500/20" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-white">WhatsApp de Pedidos Activo:</span>
                              <span className="text-xs font-bold text-emerald-400 font-mono">+57 {profile.whatsapp}</span>
                            </div>
                            <p className="text-[10px] text-gray-400">Los clientes te contactarán y enviarán sus pedidos directamente a este número.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={`https://wa.me/57${profile.whatsapp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1"
                          >
                            <span>Probar</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            onClick={() => setActiveTab('design')}
                            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-700 rounded-xl text-xs font-semibold transition"
                          >
                            Cambiar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Metrics Dashboard Row */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                      
                      <div className="bg-gray-950 border border-gray-900 p-5 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Ingresos Estimados</span>
                        <div className="mt-2 text-xl md:text-2xl font-black text-white">{formatPrice(totalIncomingRevenue)}</div>
                        <span className="text-[9px] text-emerald-400 font-semibold mt-1">Todos los pedidosactivos</span>
                      </div>

                      <div className="bg-gray-950 border border-gray-900 p-5 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Ventas Clientes</span>
                        <div className="mt-2 text-xl md:text-2xl font-black text-emerald-400">{formatPrice(completedRevenue)}</div>
                        <span className="text-[9px] text-gray-550 font-semibold mt-1">Entregados y validados</span>
                      </div>

                      <div className="bg-gray-950 border border-gray-900 p-5 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Total Pedidos</span>
                        <div className="mt-2 text-xl md:text-2xl font-black text-white">{orders.length}</div>
                        <span className="text-[9px] text-gray-550 font-semibold mt-1">Recibidos históricamente</span>
                      </div>

                      <div className="bg-gray-950 border border-gray-900 p-5 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Visitas a Tienda</span>
                        <div className="mt-2 text-xl md:text-2xl font-black text-white">{analyticsViews.length || 312}</div>
                        <span className="text-[9px] text-gray-550 font-semibold mt-1">Visitas capturadas</span>
                      </div>

                      <div className="bg-gray-950 border border-gray-900 p-5 rounded-2xl flex flex-col col-span-2 lg:col-span-1 justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Tasa de Conversión</span>
                        <div className="mt-2 text-xl md:text-2xl font-black text-indigo-400">{currentConversionRate}%</div>
                        <span className="text-[9px] text-indigo-300/60 font-semibold mt-1">Conversión visitas a pedidos</span>
                      </div>

                    </div>

                    {/* Quick overview of latest orders */}
                    <div className="bg-gray-950 border border-gray-900 rounded-3xl p-6">
                      <div className="flex items-center justify-between mb-4 border-b border-gray-900 pb-3">
                        <div>
                          <h3 className="font-extrabold text-white text-sm md:text-base">Pedidos Recientes</h3>
                          <p className="text-[11px] text-gray-500 font-medium">Historial rápido de tus últimas interacciones con clientes externos.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('orders')}
                          className="px-3.5 py-1.5 bg-gray-900 hover:bg-gray-850 hover:text-white rounded-lg text-[10px] font-bold text-gray-400 border border-gray-850 transition"
                        >
                          Ver Todos los Pedidos
                        </button>
                      </div>

                      {orders.length === 0 ? (
                        <div className="py-12 flex flex-col items-center text-center text-gray-500">
                          <ShoppingBag className="w-10 h-10 mb-2.5 opacity-30" />
                          <h4 className="text-xs font-bold text-gray-400 mb-1">Aún no hay pedidos recibidos</h4>
                          <p className="text-[10px] max-w-xs leading-relaxed">Comparte el enlace de tu tienda en redes sociales para comenzar a recibir órdenes de compra.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-gray-900 text-gray-500 text-[10px] font-bold uppercase">
                                <th className="py-3 px-2">Pedido</th>
                                <th className="py-3 px-2">Cliente</th>
                                <th className="py-3 px-2">Método</th>
                                <th className="py-3 px-4 text-center">Estado</th>
                                <th className="py-3 px-2">Total</th>
                                <th className="py-3 px-2 text-right">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-900">
                              {orders.slice(0, 5).map((order) => {
                                const badges: Record<string, { bg: string, text: string, name: string }> = {
                                  'pending': { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20', text: 'text-amber-400', name: 'Pendiente' },
                                  'processing': { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20', text: 'text-blue-400', name: 'Procesando' },
                                  'shipped': { bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', text: 'text-indigo-400', name: 'Enviado' },
                                  'delivered': { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', text: 'text-emerald-400', name: 'Entregado' },
                                  'cancelled': { bg: 'bg-red-500/10 text-red-400 border-red-500/20', text: 'text-red-400', name: 'Cancelado' },
                                };
                                const state = badges[order.status] || badges.pending;

                                return (
                                  <tr key={order.id} className="hover:bg-gray-900/40 text-gray-300 font-medium">
                                    <td className="py-3.5 px-2 font-mono text-[11px] text-white">#{order.orderNumber}</td>
                                    <td className="py-3.5 px-2">
                                      <div className="font-extrabold text-white text-[11.5px] flex items-center gap-1.5 flex-wrap">
                                        <span>{order.customerName}</span>
                                        {order.proofImage && (
                                          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[8.5px] font-black uppercase tracking-wider scale-90" title="Contiene imagen de comprobante adjunta">
                                            📸 Recibo
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-gray-550">{order.customerPhone}</div>
                                    </td>
                                    <td className="py-3.5 px-2 text-[10px] uppercase font-bold text-gray-500 text-ellipsis max-w-[120px] truncate">
                                      {order.paymentMethod === 'whatsapp' ? '🟢 WhatsApp' : order.paymentMethod === 'transfer' ? '🏦 Transf.' : '🚚 Pago Entrega'}
                                    </td>
                                    <td className="py-3.5 px-4 text-center">
                                      <span className={`px-2 py-1 text-[9px] font-black uppercase rounded-lg border ${state.bg}`}>
                                        {state.name}
                                      </span>
                                    </td>
                                    <td className="py-3.5 px-2 font-bold text-white text-[11.5px]">{formatPrice(order.totalAmount)}</td>
                                    <td className="py-3.5 px-2 text-right">
                                      <div className="flex justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setViewingOrder(order)}
                                          className="p-1.5 bg-gray-900 hover:bg-gray-805 rounded text-gray-350 hover:text-white transition"
                                          title="Detalles"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => triggerWhatsAppMessage(order)}
                                          className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 rounded text-emerald-400 transition"
                                          title="Mensaje de WhatsApp"
                                        >
                                          <MessageCircle className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. PRODUCT CATALOG MANAGER TAB */}
                {activeTab === 'products' && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-900 pb-4">
                      <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                          Catálogo de Productos
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-900 text-gray-400 border border-gray-800">
                            {products.length} / {getPlanProductLimit(profile.subscriptionPlan || profile.plan)}
                          </span>
                        </h2>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                          Agrega, edita o elimina mercancías de tu tienda en tiempo real.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => triggerAddProductForm()}
                        className="bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs py-2.5 px-4.5 rounded-xl flex items-center gap-1.5 self-start transition active:scale-[0.98] shadow-lg shadow-emerald-500/10 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-black stroke-[3]" />
                        Nuevo Producto
                      </button>
                    </div>

                    {/* Banner WhatsApp Requirement Warning (Seller cannot create products without WhatsApp) */}
                    {(!profile.whatsapp || profile.whatsapp.replace(/\D/g, '').length < 7) && (
                      <div className="bg-gradient-to-r from-emerald-950/80 via-gray-900 to-emerald-950/60 border-2 border-emerald-500/60 p-4.5 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xl shadow-emerald-950/50 animate-fade-in relative overflow-hidden">
                        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                        <div className="flex items-start gap-3.5 relative z-10">
                          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0 shadow-inner">
                            <MessageCircle className="w-6 h-6 fill-emerald-500/20" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-extrabold text-white tracking-tight">
                                WhatsApp Obligatorio para Crear Productos
                              </h4>
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md text-[9px] font-black uppercase tracking-wider">
                                Requerido
                              </span>
                            </div>
                            <p className="text-xs text-gray-300 leading-relaxed font-medium max-w-2xl">
                              Para publicar productos y habilitar las compras en tu tienda, debes registrar tu número de WhatsApp. Los clientes recibirán sus confirmaciones y te enviarán sus pedidos directamente a ese chat.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setQuickOwnerWhatsAppInput(profile.ownerWhatsapp || profile.whatsapp || profile.phone || '');
                            setQuickCustomerServiceWhatsAppInput(profile.customerServiceWhatsapp || '');
                            setQuickWhatsAppError('');
                            setIsWhatsAppRequiredModalOpen(true);
                          }}
                          className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-emerald-500/25 shrink-0 flex items-center gap-2 cursor-pointer relative z-10"
                        >
                          <MessageCircle className="w-4 h-4 text-black fill-black/20" />
                          <span>Agregar WhatsApp</span>
                        </button>
                      </div>
                    )}

                    {/* Banner Limit Reached Warning */}
                    {products.length >= getPlanProductLimit(profile.subscriptionPlan || profile.plan) && (
                      <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200 animate-fade-in">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                          <div>
                            <strong className="text-amber-300 font-bold block">
                              Has alcanzado el límite de {getPlanProductLimit(profile.subscriptionPlan || profile.plan)} productos
                            </strong>
                            <span className="text-gray-300 text-[11px]">
                              Tu plan actual ({(profile.subscriptionPlan || profile.plan) === 'medio' ? 'Plan Medio' : (profile.subscriptionPlan || profile.plan) === 'pro' || (profile.subscriptionPlan || profile.plan) === 'avanzado' ? 'Plan Avanzado' : 'Plan Básico'}) no te permite publicar más de {getPlanProductLimit(profile.subscriptionPlan || profile.plan)} productos. Actualiza tu plan para ampliar tu catálogo.
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('subscription')}
                          className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold px-4 py-2 rounded-xl transition shadow-md shrink-0 text-xs"
                        >
                          ⚡ Actualizar Plan
                        </button>
                      </div>
                    )}

                    {isAddingProd && (
                      <div 
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in"
                        onClick={() => setIsAddingProd(false)}
                      >
                        <form 
                          onSubmit={handleSaveProductForm} 
                          onClick={(e) => e.stopPropagation()}
                          className="relative w-full max-w-2xl bg-gray-950 border border-gray-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 my-auto max-h-[90vh] overflow-y-auto"
                        >
                          <div className="flex items-center justify-between border-b border-gray-900 pb-4">
                            <div>
                              <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                                {editingProd ? '📝 Editar Producto' : '📦 Añadir Nuevo Producto'}
                              </h3>
                              <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                                {editingProd ? 'Modifica los datos y detalles del producto.' : 'Llena la información de tu nuevo artículo para publicarlo.'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsAddingProd(false)}
                              className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-900 transition cursor-pointer"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Nombre del artículo</label>
                              <input
                                type="text"
                                required
                                value={prodName}
                                onChange={(e) => setProdName(e.target.value)}
                                placeholder="Ej: Hamburguesa Artesanal Doble Carne"
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Categoría del Producto</label>
                              <div className="relative">
                                <select
                                  value={RESTAURANT_CATEGORIES.includes(prodCategory) ? prodCategory : 'CUSTOM'}
                                  onChange={(e) => {
                                    if (e.target.value === 'CUSTOM') {
                                      if (RESTAURANT_CATEGORIES.includes(prodCategory)) {
                                        setProdCategory('');
                                      }
                                    } else {
                                      setProdCategory(e.target.value);
                                    }
                                  }}
                                  className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 pr-8 rounded-xl text-xs font-bold outline-none text-emerald-400 focus:ring-1 focus:ring-emerald-500/20 cursor-pointer appearance-none"
                                >
                                  {RESTAURANT_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat} className="bg-gray-950 text-white font-semibold">
                                      {cat}
                                    </option>
                                  ))}
                                  <option value="CUSTOM" className="bg-gray-950 text-amber-400 font-bold">
                                    ✏️ Otra categoría (Escribir personalizada...)
                                  </option>
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                                  </svg>
                                </div>
                              </div>

                              {(!RESTAURANT_CATEGORIES.includes(prodCategory) || prodCategory === '') && (
                                <input
                                  type="text"
                                  value={prodCategory}
                                  onChange={(e) => setProdCategory(e.target.value)}
                                  placeholder="Escribe la categoría personalizada..."
                                  className="w-full h-10 bg-gray-900/90 border border-amber-500/40 focus:border-amber-400 px-3.5 mt-2 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-amber-500/20"
                                />
                              )}
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Descripción del Producto</label>
                            <textarea
                              rows={3}
                              value={prodDesc}
                              onChange={(e) => setProdDesc(e.target.value)}
                              placeholder="Escribe la descripción, ingredientes, acompañamientos o porción..."
                              className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 p-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20 resize-none"
                            />
                          </div>

                          <div className="grid sm:grid-cols-3 gap-4">
                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Precio de Venta ({profile.currency || '$'})</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                required
                                value={prodPrice}
                                onChange={(e) => setProdPrice(e.target.value)}
                                placeholder="Ej: 35000 o 35.000"
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Precio Promoción ({profile.currency || '$'})</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={prodComparePrice}
                                onChange={(e) => setProdComparePrice(e.target.value)}
                                placeholder="Opcional. Ej: 50000 o 50.000"
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Cantidad en Stock</label>
                              <input
                                type="number"
                                required
                                min="0"
                                value={prodStock}
                                onChange={(e) => setProdStock(e.target.value)}
                                placeholder="Ej: 15"
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                              />
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">
                                Imagen del Producto (Subir y Comprimir)
                              </label>
                              
                              <div className="relative border border-dashed border-gray-800 hover:border-emerald-500/50 rounded-xl p-3 text-center transition bg-[#0c101d] flex flex-col items-center justify-center min-h-[96px]">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      setIsCompressingImage(true);
                                      const reader = new FileReader();
                                      reader.onloadend = async () => {
                                        try {
                                          const base64 = reader.result as string;
                                          // Compress the image before setting state
                                          const compressed = await compressImage(base64, 800, 800);
                                          setProdImage(compressed);
                                        } catch (err) {
                                          console.error("Error compressing image:", err);
                                          alert("Error al comprimir la imagen. Intenta con otra.");
                                        } finally {
                                          setIsCompressingImage(false);
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                
                                {isCompressingImage ? (
                                  <div className="flex flex-col items-center justify-center gap-1.5 py-2">
                                    <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Comprimiendo imagen...</span>
                                    <span className="text-[8px] text-gray-550">Optimizando peso de la imagen</span>
                                  </div>
                                ) : prodImage ? (
                                  <div className="relative z-20 w-full flex items-center justify-between gap-3 bg-emerald-950/20 p-2 rounded-xl border border-emerald-500/20">
                                    <img 
                                      src={prodImage} 
                                      alt="Vista previa del producto" 
                                      className="w-12 h-12 object-cover rounded-lg border border-emerald-500/10" 
                                    />
                                    <div className="flex-grow text-left">
                                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest block">¡Optimizado!</span>
                                      <span className="text-[8px] text-gray-400 font-semibold truncate block max-w-[120px]">Cargado desde el celular</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setProdImage('');
                                      }}
                                      className="p-1 px-2.5 bg-gray-900 hover:bg-gray-805 text-gray-400 hover:text-white rounded-lg text-[9px] font-bold transition font-mono z-30 animate-none cursor-pointer"
                                    >
                                      Quitar
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center gap-1 text-gray-450 hover:text-white transition">
                                    <Plus className="w-4 h-4 text-gray-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 leading-none">Cargar foto del dispositivo</span>
                                    <span className="text-[8px] text-gray-550">Haz clic para subir (Compresión automática)</span>
                                  </div>
                                )}
                              </div>
                              <p className="text-[9px] text-gray-550 mt-1 font-semibold">Deja vacío para usar el marcador por defecto de la categoría.</p>
                            </div>


                          </div>

                          <div className="flex items-center gap-2 pt-2">
                            <input
                              type="checkbox"
                              id="prod-active-toggle"
                              checked={prodActive}
                              onChange={(e) => setProdActive(e.target.checked)}
                              className="w-4.5 h-4.5 rounded bg-gray-900 focus:ring-0 text-emerald-500 pointer-events-auto border-gray-800 cursor-pointer"
                            />
                            <label htmlFor="prod-active-toggle" className="text-xs font-bold text-gray-300 select-none cursor-pointer">
                              Producto Activo (Visible en tienda pública)
                            </label>
                          </div>

                          <div className="flex justify-end gap-2.5 border-t border-gray-900 pt-4">
                            <button
                              type="button"
                              onClick={() => setIsAddingProd(false)}
                              className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 rounded-xl text-xs font-bold text-gray-300 border border-gray-800 transition cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={isSavingProduct || isCompressingImage}
                              className="px-6 py-2.5 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/10 transition active:scale-[0.98] cursor-pointer flex items-center gap-2"
                            >
                              {isSavingProduct ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                                  Guardando...
                                </>
                              ) : isCompressingImage ? (
                                'Comprimiendo Imagen...'
                              ) : editingProd ? (
                                'Actualizar Producto'
                              ) : (
                                'Guardar Producto'
                              )}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Products Grid list */}
                    {products.length === 0 ? (
                      <div className="bg-gray-950 border border-gray-900 rounded-3xl p-10 sm:p-12 text-center text-gray-500 space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mx-auto text-emerald-400">
                          <Package className="w-8 h-8 opacity-60" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-white text-base mb-1">Tu escaparate está listo para tus productos</h3>
                          <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                            {(!profile.whatsapp || profile.whatsapp.replace(/\D/g, '').length < 7) 
                              ? 'Para poder crear y publicar artículos, primero debes agregar tu número de WhatsApp de atención al cliente.'
                              : 'Sube tus primeros productos con sus respectivos precios, fotos y categorías para habilitar las compras en línea.'}
                          </p>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => triggerAddProductForm()}
                            className="bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs py-3 px-6 rounded-xl shadow-lg shadow-emerald-500/15 transition active:scale-[0.98] cursor-pointer inline-flex items-center gap-2"
                          >
                            {(!profile.whatsapp || profile.whatsapp.replace(/\D/g, '').length < 7) ? (
                              <>
                                <MessageCircle className="w-4 h-4 text-black fill-black/20" />
                                <span>Configurar WhatsApp y Crear Producto</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4 text-black stroke-[3]" />
                                <span>Crear mi Primer Producto</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {/* Filters and Search toolbar for Seller */}
                        <div className="flex flex-col md:flex-row gap-3.5 items-center justify-between bg-gray-950 border border-gray-900/60 p-4 rounded-2xl">
                          {/* Search box */}
                          <div className="relative w-full md:max-w-md">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-500">
                              <Search className="w-4 h-4" />
                            </span>
                            <input
                              type="text"
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              placeholder="Buscar producto por nombre, categoría o descripción..."
                              className="w-full h-10 bg-gray-900 border border-gray-800 focus:border-emerald-500 pl-10 pr-10 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                            />
                            {productSearch && (
                              <button
                                type="button"
                                onClick={() => setProductSearch('')}
                                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-white transition"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Filter Selects */}
                          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                            {/* Category Filter dropdown */}
                            <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 px-3.5 py-2 rounded-xl text-xs text-gray-300 w-full md:w-auto">
                              <Filter className="w-3.5 h-3.5 text-gray-400" />
                              <select
                                value={productCategoryFilter}
                                onChange={(e) => setProductCategoryFilter(e.target.value)}
                                className="bg-transparent border-none outline-none text-white cursor-pointer font-bold text-xs pr-1"
                              >
                                <option value="all" className="bg-gray-950 text-white">Todas las Categorías</option>
                                {Array.from(new Set(products.map(p => p.category?.trim()).filter(Boolean))).map(cat => (
                                  <option key={cat} value={cat} className="bg-gray-950 text-white">{cat}</option>
                                ))}
                              </select>
                            </div>

                            {/* Status Filter dropdown */}
                            <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 px-3.5 py-2 rounded-xl text-xs text-gray-300 w-full md:w-auto">
                              <span className={`w-2 h-2 rounded-full ${productStatusFilter === 'public' ? 'bg-emerald-400' : productStatusFilter === 'hidden' ? 'bg-gray-600' : 'bg-indigo-400'}`} />
                              <select
                                value={productStatusFilter}
                                onChange={(e) => setProductStatusFilter(e.target.value)}
                                className="bg-transparent border-none outline-none text-white cursor-pointer font-bold text-xs pr-1"
                              >
                                <option value="all" className="bg-gray-950 text-white">Todos los Estados</option>
                                <option value="public" className="bg-gray-950 text-white">Públicos (Visibles)</option>
                                <option value="hidden" className="bg-gray-950 text-white">Ocultos (Borrador)</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Rendering list */}
                        {(() => {
                          const filtered = products.filter(prod => {
                            const matchesSearch = prod.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                              (prod.description && prod.description.toLowerCase().includes(productSearch.toLowerCase())) ||
                              (prod.category && prod.category.toLowerCase().includes(productSearch.toLowerCase()));
                            
                            const matchesCategory = productCategoryFilter === 'all' || 
                              (prod.category && prod.category.trim().toLowerCase() === productCategoryFilter.toLowerCase());
                            
                            const matchesStatus = productStatusFilter === 'all' ||
                              (productStatusFilter === 'public' && prod.active) ||
                              (productStatusFilter === 'hidden' && !prod.active);
                            
                            return matchesSearch && matchesCategory && matchesStatus;
                          });

                          const dedupedFiltered = deduplicateProducts(filtered);

                          if (dedupedFiltered.length === 0) {
                            return (
                              <div className="bg-gray-950 border border-gray-900 rounded-3xl p-12 text-center text-gray-500">
                                <Search className="w-12 h-12 mb-3 mx-auto opacity-30 text-emerald-400 animate-pulse" />
                                <h3 className="font-extrabold text-white text-sm mb-1">Sin resultados</h3>
                                <p className="text-xs text-gray-500 max-w-sm mx-auto mb-5 leading-relaxed">No se encontraron productos que coincidan con la búsqueda o filtros aplicados.</p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProductSearch('');
                                    setProductCategoryFilter('all');
                                    setProductStatusFilter('all');
                                  }}
                                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-bold text-xs py-2 px-4 rounded-xl transition"
                                >
                                  Limpiar Filtros
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {dedupedFiltered.map((prod) => (
                                <div 
                                  key={prod.id} 
                                  style={{ opacity: prod.active ? 1 : 0.45 }}
                                  className="bg-gray-950 border border-gray-900 hover:border-gray-850 rounded-2xl overflow-hidden p-4 flex flex-col justify-between transition-all"
                                >
                                  
                                  {/* Product Header details */}
                                  <div>
                                    <div className="flex items-start justify-between gap-2.5 mb-3.5">
                                      <span className="bg-gray-900 border border-gray-800 text-gray-400 font-extrabold tracking-wide uppercase text-[8px] px-2 py-0.5 rounded-full mb-1 inline-block">
                                        {prod.category || 'General'}
                                      </span>
                                      <div className="flex gap-1.5">
                                        <span className={`w-2 h-2 rounded-full display-block mt-1 ${prod.active ? 'bg-emerald-400' : 'bg-gray-600'}`} title={prod.active ? 'Activo' : 'Inactivo'} />
                                        <span className="text-[10px] text-gray-500 font-bold">{prod.active ? 'Público' : 'Oculto'}</span>
                                      </div>
                                    </div>

                                    <div className="flex gap-3 mb-3">
                                      <div className="w-16 h-16 rounded-xl bg-gray-900 border border-gray-850 shrink-0 flex items-center justify-center text-xl font-bold overflow-hidden">
                                        {prod.imageURL ? (
                                          <img src={prod.imageURL} alt={prod.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        ) : (
                                          <span>📦</span>
                                        )}
                                      </div>
                                      <div className="overflow-hidden">
                                        <h4 className="font-extrabold text-white text-xs md:text-sm truncate" title={prod.name}>{prod.name}</h4>
                                        <p className="text-[10.5px] text-gray-550 leading-relaxed font-semibold line-clamp-2 h-8 mt-0.5">{prod.description || 'Sin descripción'}</p>
                                      </div>
                                    </div>

                                    {/* Price tagging */}
                                    <div className="flex items-center gap-2 border-t border-gray-900 pt-3.5 mb-2.5">
                                      <span className="text-sm font-extrabold text-emerald-400">{formatPrice(prod.price)}</span>
                                      {prod.compareAtPrice && (
                                        <span className="text-[10px] text-gray-500 line-through font-bold">{formatPrice(prod.compareAtPrice)}</span>
                                      )}
                                    </div>

                                    {/* Static meta info tags */}
                                    <div className="space-y-1 mb-3 text-[10px] font-semibold text-gray-500 bg-gray-900/40 p-2 rounded-lg border border-gray-900">
                                      <div className="flex justify-between">
                                        <span>Inventario disponible:</span>
                                        <span className="text-white font-mono">{prod.stock} unids</span>
                                      </div>
                                      {prod.variantsText && (
                                        <div className="flex justify-between">
                                          <span>Variantes:</span>
                                          <span className="text-indigo-400 truncate max-w-[120px]">{prod.variantsText}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Options action drawer */}
                                  <div className="flex gap-1.5 border-t border-gray-900 pt-3.5">
                                    <button
                                      type="button"
                                      onClick={() => triggerEditProductForm(prod)}
                                      className="flex-1 py-1 px-2.5 bg-gray-900 hover:bg-gray-850 rounded-lg text-[10px] font-black uppercase text-gray-400 hover:text-white transition"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProduct(prod.id)}
                                      className="p-1 px-2 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 text-red-400 rounded-lg text-[10px] transition"
                                      title="Eliminar"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. ORDER CONTROL HUB TAB */}
                {activeTab === 'orders' && (
                  <div className="space-y-6">
                    <div className="border-b border-gray-900 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                          Pedidos Recibidos ({orders.length})
                        </h2>
                        <p className="text-xs text-gray-500 font-medium">Administra compras completas, despacha mercaderías y asiste a tus compradores.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
                        {/* Push Notification Toggle Button */}
                        {pushPermission === 'granted' ? (
                          <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Bell className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Push & Voz Activos</span>
                          </div>
                        ) : pushPermission === 'denied' ? (
                          <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-500 bg-gray-900/50 rounded-xl border border-gray-800" title="Las notificaciones están bloqueadas en la configuración de tu navegador">
                            <BellRing className="w-3.5 h-3.5 text-gray-500" />
                            <span>Notif. Bloqueadas</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={requestPushPermission}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 active:scale-95 transition cursor-pointer"
                            title="Haz clic para permitir notificaciones push cuando llegue un nuevo pedido"
                          >
                            <BellRing className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                            <span>Activar Push</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => playNewOrderNotification()}
                          title="Probar voz '¡Llegó un pedido!' y sonido de alerta"
                          className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl bg-purple-600/20 hover:bg-purple-600/30 active:scale-95 transition text-purple-300 border border-purple-500/30 cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4 text-purple-400" />
                          <span className="hidden sm:inline">Probar Voz</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAddingOrder(true)}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-black stroke-[3]" />
                          <span>Nuevo Pedido</span>
                        </button>
                      </div>
                    </div>

                    {orders.length === 0 ? (
                      <div className="bg-gray-950 border border-gray-900 rounded-3xl p-12 text-center text-gray-550 flex flex-col items-center justify-center">
                        <ShoppingBag className="w-12 h-12 mb-3 opacity-35 animate-bounce text-indigo-400" />
                        <h3 className="font-extrabold text-white text-sm mb-1">Aún no registras ventas</h3>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">Coloca enlaces a tus redes, comparte tu subdominio de ryyco.com, ¡y tus clientes comenzarán a enviar órdenes!</p>
                        <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-center">
                          <button
                            type="button"
                            onClick={() => setIsAddingOrder(true)}
                            className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-black stroke-[3]" />
                            <span>Crear Pedido Manual</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleSyncOrders}
                            disabled={isSyncingOrders}
                            className="flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl bg-indigo-600 hover:bg-indigo-505 active:scale-95 transition text-white disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOrders ? 'animate-spin' : ''}`} />
                            {isSyncingOrders ? 'Buscando...' : 'Buscar Nuevos Pedidos'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-950 border border-gray-900 rounded-3xl overflow-hidden p-6 space-y-4">
                        <div className="flex flex-col xl:flex-row gap-4 xl:items-center justify-between border-b border-gray-900 pb-3">
                          <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5 shrink-0">
                            <Filter className="w-3.5 h-3.5 text-indigo-400" />
                            Cola total de ordenes
                          </span>
                          
                          {/* Horizontal scrollable Filter Pills */}
                          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 shrink-0 -mx-6 px-6 xl:mx-0 xl:px-0">
                            {[
                              { id: 'all', name: 'Todos', color: 'text-white border-gray-850 bg-gray-900/40 hover:bg-gray-900', activeColor: 'bg-indigo-600/10 text-indigo-450 border-indigo-500/30' },
                              { id: 'pending', name: 'Pendiente', color: 'text-amber-400/85 border-amber-500/10 bg-amber-500/5 hover:bg-amber-500/10', activeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/45 font-extrabold' },
                              { id: 'processing', name: 'Procesando', color: 'text-blue-400/85 border-blue-500/10 bg-blue-500/5 hover:bg-blue-500/10', activeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/45 font-extrabold' },
                              { id: 'shipped', name: 'Enviado', color: 'text-indigo-400/85 border-indigo-500/10 bg-indigo-500/5 hover:bg-indigo-500/10', activeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/45 font-extrabold' },
                              { id: 'delivered', name: 'Entregado', color: 'text-emerald-400/85 border-emerald-500/10 bg-emerald-500/5 hover:bg-emerald-500/10', activeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/45 font-extrabold' },
                              { id: 'cancelled', name: 'Cancelado', color: 'text-red-400/85 border-red-500/10 bg-red-500/5 hover:bg-red-500/10', activeColor: 'bg-red-500/20 text-red-300 border-red-500/45 font-extrabold' },
                            ].map((tab) => {
                              const count = tab.id === 'all' 
                                ? orders.length 
                                : orders.filter(o => o.status === tab.id).length;
                              const isActive = orderStatusFilter === tab.id;

                              return (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => setOrderStatusFilter(tab.id)}
                                  className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition shrink-0 cursor-pointer ${
                                    isActive ? tab.activeColor : tab.color
                                  }`}
                                >
                                  <span>{tab.name}</span>
                                  <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono ${
                                    isActive ? 'bg-black/30' : 'bg-gray-900/60'
                                  }`}>
                                    {count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Desktop and Tablet Order View */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-gray-900 text-gray-500 text-[10px] font-bold uppercase">
                                <th className="py-3 px-2">ID</th>
                                <th className="py-3 px-2">Cliente / Dirección</th>
                                <th className="py-3 px-2">Fecha</th>
                                <th className="py-3 px-4 text-center">Estado del Pedido</th>
                                <th className="py-3 px-2">Total Compra</th>
                                <th className="py-3 px-2 text-right">Controles</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-900">
                              {filteredOrders.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="py-8 text-center text-gray-500 font-semibold">
                                    No hay pedidos con el estado seleccionado.
                                  </td>
                                </tr>
                              ) : (
                                filteredOrders.map((order) => {
                                const badges: Record<string, { bg: string, text: string, name: string }> = {
                                  'pending': { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20', text: 'text-amber-400', name: 'Pendiente' },
                                  'processing': { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20', text: 'text-blue-400', name: 'Procesando' },
                                  'shipped': { bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', text: 'text-indigo-400', name: 'Enviado' },
                                  'delivered': { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', text: 'text-emerald-400', name: 'Entregado' },
                                  'cancelled': { bg: 'bg-red-500/10 text-red-400 border-red-500/20', text: 'text-red-400', name: 'Cancelado' },
                                };
                                const state = badges[order.status] || badges.pending;

                                return (
                                  <tr key={order.id} className="hover:bg-gray-900/30 text-gray-300 font-medium">
                                    <td className="py-3.5 px-2 font-mono text-[11px] text-white">#{order.orderNumber}</td>
                                    <td className="py-3.5 px-2 max-w-[200px] truncate">
                                      <div className="font-extrabold text-white text-[11.5px] flex items-center gap-1.5 flex-wrap">
                                        <span>{order.customerName}</span>
                                        {checkIsPickupOrder(order) && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded text-[8.5px] font-black uppercase tracking-wider">
                                            🛍️ Recoger
                                          </span>
                                        )}
                                        {checkIsTableOrder(order) && (
                                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded text-[8.5px] font-black uppercase tracking-wider">
                                            🍽️ En Mesa
                                          </span>
                                        )}
                                        {order.proofImage && (
                                          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[8.5px] font-black uppercase tracking-wider scale-90" title="Contiene imagen de comprobante adjunta">
                                            📸 Recibo
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-gray-500 truncate">{order.customerAddress || 'Retiro local'}</div>
                                      {order.deliveryDriverName && (
                                        <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-bold" title={`Domiciliario: ${order.deliveryDriverName} (${order.deliveryDriverPhone})`}>
                                          <Bike className="w-3 h-3 text-emerald-400 shrink-0" />
                                          <span className="truncate max-w-[120px]">{order.deliveryDriverName}</span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-3.5 px-2 text-gray-500 font-mono text-[10px]">
                                      {new Date(order.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="py-3.5 px-4 text-center">
                                      <span className={`px-2 py-1 text-[9px] font-black uppercase rounded-lg border ${state.bg}`}>
                                        {state.name}
                                      </span>
                                    </td>
                                    <td className="py-3.5 px-2 font-bold text-white text-[11.5px]">{formatPrice(order.totalAmount)}</td>
                                    <td className="py-3.5 px-2 text-right">
                                      <div className="flex justify-end gap-1.5">
                                        
                                        {/* Status dropdown controller */}
                                        {checkIsTableOrder(order) ? (
                                          <select
                                            value={order.status === 'shipped' ? 'processing' : order.status === 'cancelled' ? 'pending' : order.status}
                                            onChange={(e) => handleUpdateStatus(order.id, e.target.value as OrderItem['status'])}
                                            className="text-[9px] bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-300 font-extrabold px-1.5 py-1 rounded cursor-pointer"
                                          >
                                            <option value="pending" className="bg-gray-950 text-amber-400 font-bold">Pendiente</option>
                                            <option value="processing" className="bg-gray-950 text-sky-400 font-bold">Procesando</option>
                                            <option value="delivered" className="bg-gray-950 text-emerald-400 font-bold">Entregado</option>
                                          </select>
                                        ) : (
                                          <select
                                            value={order.status}
                                            onChange={(e) => handleUpdateStatus(order.id, e.target.value as OrderItem['status'])}
                                            className="text-[9px] bg-gray-900 hover:bg-gray-850 border border-gray-800 text-gray-300 px-1 py-1 rounded"
                                          >
                                            <option value="pending">Marcar Pendiente</option>
                                            <option value="processing">En Proceso</option>
                                            <option value="shipped">Despachado</option>
                                            <option value="delivered">Entregado</option>
                                            <option value="cancelled">Cancelar</option>
                                          </select>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => setViewingOrder(order)}
                                          className="p-1.5 bg-gray-920 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition"
                                          title="Detalle completo"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => triggerWhatsAppMessage(order)}
                                          className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 rounded text-emerald-400 transition"
                                          title="Asistente WhatsApp"
                                        >
                                          <MessageCircle className="w-3.5 h-3.5" />
                                        </button>

                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Order Cards View (Stops cell and button overflows on cell phones) */}
                        <div className="block md:hidden space-y-4">
                          {filteredOrders.length === 0 ? (
                            <div className="py-8 text-center text-gray-500 font-semibold text-xs bg-gray-900/10 rounded-2xl border border-gray-900">
                              No hay pedidos con el estado seleccionado.
                            </div>
                          ) : (
                            filteredOrders.map((order) => {
                              const badges: Record<string, { bg: string, text: string, name: string }> = {
                              'pending': { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20', text: 'text-amber-400', name: 'Pendiente' },
                              'processing': { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20', text: 'text-blue-400', name: 'Procesando' },
                              'shipped': { bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', text: 'text-indigo-400', name: 'Enviado' },
                              'delivered': { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', text: 'text-emerald-400', name: 'Entregado' },
                              'cancelled': { bg: 'bg-red-500/10 text-red-400 border-red-500/20', text: 'text-red-400', name: 'Cancelado' },
                            };
                            const state = badges[order.status] || badges.pending;

                            return (
                              <div key={order.id} className="bg-gray-900/30 border border-gray-900 rounded-2xl p-4 space-y-3 text-xs font-semibold text-gray-300">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-white font-extrabold text-[13px]">#{order.orderNumber}</span>
                                  <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-lg border ${state.bg}`}>
                                    {state.name}
                                  </span>
                                </div>

                                <div className="space-y-1 border-t border-gray-900/50 pt-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-white font-extrabold text-[12.5px]">{order.customerName}</span>
                                    {checkIsPickupOrder(order) && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded text-[8px] font-black uppercase tracking-wider">
                                        🛍️ Recoger
                                      </span>
                                    )}
                                    {checkIsTableOrder(order) && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded text-[8px] font-black uppercase tracking-wider">
                                        🍽️ Mesa
                                      </span>
                                    )}
                                    {order.proofImage && (
                                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[8px] font-black uppercase tracking-wider" title="Tiene comprobante">
                                        📸 Recibo
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10.5px] text-gray-500 leading-normal">{order.customerAddress || 'Retiro local'}</div>
                                  <div className="text-[9.5px] text-gray-500 font-mono">Fecha: {new Date(order.createdAt).toLocaleDateString()}</div>
                                  {order.deliveryDriverName && (
                                    <div className="mt-1 flex items-center gap-1.5 px-2 py-1 bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 rounded-lg text-[10px] font-semibold">
                                      <Bike className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                      <span>Domiciliario: <strong>{order.deliveryDriverName}</strong> ({order.deliveryDriverPhone})</span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-1">
                                  <span className="text-gray-500 text-[10px] font-bold uppercase">Total del Pedido:</span>
                                  <span className="text-sm font-extrabold text-emerald-400">{formatPrice(order.totalAmount)}</span>
                                </div>

                                <div className="flex flex-col gap-2 pt-2.5 border-t border-gray-900/50">
                                  <div className="flex items-center gap-2 bg-gray-950 px-3 py-1.5 rounded-xl border border-gray-850">
                                    <span className="text-[9px] font-black uppercase text-gray-500 whitespace-nowrap">Estado:</span>
                                    {checkIsTableOrder(order) ? (
                                      <select
                                        value={order.status === 'shipped' ? 'processing' : order.status === 'cancelled' ? 'pending' : order.status}
                                        onChange={(e) => handleUpdateStatus(order.id, e.target.value as OrderItem['status'])}
                                        className="text-xs bg-transparent text-amber-300 font-extrabold outline-none flex-grow cursor-pointer"
                                      >
                                        <option value="pending" className="bg-gray-950 text-amber-400 font-bold">Pendiente</option>
                                        <option value="processing" className="bg-gray-950 text-sky-400 font-bold">Procesando</option>
                                        <option value="delivered" className="bg-gray-950 text-emerald-400 font-bold">Entregado</option>
                                      </select>
                                    ) : (
                                      <select
                                        value={order.status}
                                        onChange={(e) => handleUpdateStatus(order.id, e.target.value as OrderItem['status'])}
                                        className="text-xs bg-transparent text-white font-extrabold outline-none flex-grow cursor-pointer"
                                      >
                                        <option value="pending">Pendiente</option>
                                        <option value="processing">Procesando</option>
                                        <option value="shipped">Despachado</option>
                                        <option value="delivered">Entregado</option>
                                        <option value="cancelled">Cancelado</option>
                                      </select>
                                    )}
                                  </div>

                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setViewingOrder(order)}
                                      className="flex-1 py-2.5 px-3 bg-gray-900 hover:bg-gray-850 text-gray-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-gray-850 transition"
                                    >
                                      <Eye className="w-4 h-4 text-indigo-400" />
                                      Ver Detalles
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => triggerWhatsAppMessage(order)}
                                      className="flex-1 py-2.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-emerald-500/20 transition"
                                    >
                                      <MessageCircle className="w-4 h-4 text-emerald-400" />
                                      WhatsApp
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. CUSTOM STORE DESIGNER TAB */}
                {activeTab === 'design' && (
                  <div className="space-y-6 w-full min-w-0 max-w-full">
                    <div className="border-b border-gray-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full min-w-0">
                      <div className="min-w-0">
                        <h2 className="text-lg sm:text-xl font-bold text-white truncate">Diseño de Tienda & Preferencias</h2>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">Reconfigura logotipos, elige divisas, decora colores tipográficos, temas y slogans.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full min-w-0 max-w-full">
                      
                      {/* Configuration values form */}
                      <form id="store-profile-form" onSubmit={handleUpdateStoreProfile} className="lg:col-span-7 bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-5 w-full min-w-0 max-w-full">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block">Datos del escaparate</span>
                        
                        <div className="w-full min-w-0">
                          <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">Enlace / Nombre de Usuario de tu Tienda</label>
                          <div className="flex rounded-xl overflow-hidden bg-gray-900 border border-gray-800 focus-within:border-emerald-500 w-full min-w-0">
                            <span className="bg-gray-950 text-gray-400 px-2.5 sm:px-3 py-2 flex items-center text-xs font-bold border-r border-gray-850 select-none shrink-0">ryyco.com/</span>
                            <input
                              type="text"
                              required
                              value={usernameField}
                              onChange={(e) => {
                                setUsernameField(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                                setUsernameError('');
                              }}
                              className="flex-1 min-w-0 w-full h-11 bg-transparent px-3 text-xs font-semibold outline-none text-white focus:ring-0 placeholder:text-gray-700"
                              placeholder="mi-tienda"
                            />
                          </div>
                          {checkingUsername && <p className="text-[10px] text-indigo-400 mt-1">Verificando disponibilidad...</p>}
                          {usernameError && <p className="text-[10px] text-red-105 mt-1 font-semibold">{usernameError}</p>}
                          <p className="text-[9px] text-gray-500 mt-1 font-semibold">Este enlace define la URL pública de tu negocio (ej. ryyco.com/compratuuco).</p>
                        </div>

                        <div className="w-full min-w-0">
                          <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">Nombre de la tienda</label>
                          <input
                            type="text"
                            required
                            value={profile.displayName}
                            onChange={(e) => setProfile(p => ({ ...p, displayName: e.target.value }))}
                            className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                          />
                        </div>

                        {/* 1. WHATSAPP DEL PROPIETARIO / ADMINISTRADOR - OBLIGATORIO */}
                        <div className="p-3.5 sm:p-4 bg-emerald-950/25 border-2 border-emerald-500/50 rounded-2xl space-y-2.5 shadow-lg shadow-emerald-950/30 w-full min-w-0">
                          <div className="flex items-center justify-between flex-wrap gap-1.5">
                            <label className="text-[11px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5 min-w-0">
                              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="truncate">WhatsApp Propietario / Admin</span>
                            </label>
                            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[9px] font-black uppercase tracking-wider rounded-md border border-emerald-500/30 shrink-0">
                              ⭐ Obligatorio
                            </span>
                          </div>

                          <div className="flex rounded-xl overflow-hidden bg-gray-900 border border-gray-800 focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400/30 w-full min-w-0">
                            <div className="bg-gray-950 text-emerald-400 px-2.5 sm:px-3 py-2.5 flex items-center gap-1 text-xs font-black border-r border-gray-850 select-none shrink-0">
                              <span>🇨🇴 +57</span>
                            </div>
                            <input
                              type="tel"
                              required
                              value={profile.ownerWhatsapp || profile.whatsapp || profile.phone || ''}
                              placeholder="Ej: 3106502043"
                              onChange={(e) => {
                                let val = e.target.value.replace(/\D/g, '');
                                if (val.startsWith('57') && val.length >= 12) val = val.slice(2);
                                val = val.slice(0, 10);
                                setProfile(p => ({ 
                                  ...p, 
                                  ownerWhatsapp: val,
                                  phone: val,
                                  whatsapp: p.customerServiceWhatsapp || val 
                                }));
                              }}
                              className="flex-1 min-w-0 w-full h-11 bg-transparent px-2.5 sm:px-3 text-xs font-bold outline-none text-white focus:ring-0 placeholder:text-gray-600"
                            />
                            {(profile.ownerWhatsapp || profile.whatsapp || profile.phone) && (profile.ownerWhatsapp || profile.whatsapp || profile.phone)!.length >= 10 && (
                              <a
                                href={`https://wa.me/57${(profile.ownerWhatsapp || profile.whatsapp || profile.phone)!.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 sm:px-3.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 flex items-center gap-1 text-[11px] font-bold border-l border-emerald-500/30 transition-all whitespace-nowrap shrink-0"
                                title="Verificar chat de WhatsApp del propietario"
                              >
                                <span className="hidden sm:inline">Probar Chat</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>

                          <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                            Número privado del dueño o administrador. Utilizado para la seguridad de tu cuenta, comprobantes de pago de suscripción y soporte directo de la plataforma.
                          </p>
                        </div>

                        {/* 2. WHATSAPP DE ATENCIÓN AL CLIENTE - OPCIONAL */}
                        <div className="p-3.5 sm:p-4 bg-slate-900/50 border border-slate-700/60 rounded-2xl space-y-2.5 w-full min-w-0">
                          <div className="flex items-center justify-between flex-wrap gap-1.5">
                            <label className="text-[11px] font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5 min-w-0">
                              <Headphones className="w-4 h-4 text-sky-400 shrink-0" />
                              <span className="truncate">WhatsApp Atención / Pedidos</span>
                            </label>
                            <span className="px-2 py-0.5 bg-slate-800 text-gray-400 text-[9px] font-black uppercase tracking-wider rounded-md border border-slate-700 shrink-0">
                              💬 Opcional
                            </span>
                          </div>

                          <div className="flex rounded-xl overflow-hidden bg-gray-900 border border-gray-800 focus-within:border-sky-400 focus-within:ring-1 focus-within:ring-sky-400/30 w-full min-w-0">
                            <div className="bg-gray-950 text-gray-400 px-2.5 sm:px-3 py-2.5 flex items-center gap-1 text-xs font-black border-r border-gray-850 select-none shrink-0">
                              <span>🇨🇴 +57</span>
                            </div>
                            <input
                              type="tel"
                              value={profile.customerServiceWhatsapp || ''}
                              placeholder="Ej: 3101234567 (Opcional)"
                              onChange={(e) => {
                                let val = e.target.value.replace(/\D/g, '');
                                if (val.startsWith('57') && val.length >= 12) val = val.slice(2);
                                val = val.slice(0, 10);
                                setProfile(p => ({ 
                                  ...p, 
                                  customerServiceWhatsapp: val,
                                  whatsapp: val || p.ownerWhatsapp || p.phone || ''
                                }));
                              }}
                              className="flex-1 min-w-0 w-full h-11 bg-transparent px-2.5 sm:px-3 text-xs font-bold outline-none text-white focus:ring-0 placeholder:text-gray-600"
                            />
                            {profile.customerServiceWhatsapp && profile.customerServiceWhatsapp.length >= 10 && (
                              <a
                                href={`https://wa.me/57${profile.customerServiceWhatsapp}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 sm:px-3.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 flex items-center gap-1 text-[11px] font-bold border-l border-sky-500/30 transition-all whitespace-nowrap shrink-0"
                                title="Verificar chat de atención al cliente"
                              >
                                <span className="hidden sm:inline">Probar Chat</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>

                          <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                            Línea pública donde tus clientes enviarán sus <strong className="text-gray-300">pedidos y consultas</strong> desde la tienda online. Si lo dejas vacío, se usará automáticamente el WhatsApp del propietario.
                          </p>
                        </div>

                        <div className="w-full min-w-0">
                          <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">Descripción corta o Slogan comercial</label>
                          <textarea
                            rows={2}
                            value={profile.bio}
                            onChange={(e) => setProfile(p => ({ ...p, bio: e.target.value }))}
                            className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 p-3 sm:p-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20 resize-none"
                          />
                        </div>

                        <div className="w-full min-w-0">
                          <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">Título de Portada o Banner de tu Tienda</label>
                          <input
                            type="text"
                            value={profile.coverTitle || ''}
                            onChange={(e) => setProfile(p => ({ ...p, coverTitle: e.target.value }))}
                            placeholder="Ej: El Futuro en tus Manos, Define tu estilo, etc."
                            className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                          />
                          <p className="text-[9px] text-gray-500 mt-1 font-semibold">Si se deja vacío, se mostrará el título predeterminado de la plantilla de diseño seleccionada.</p>
                        </div>

                        <div className="w-full min-w-0">
                          <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                            Dirección del Negocio / Punto de Recogida
                          </label>
                          <div className="flex gap-2 w-full min-w-0">
                            <input
                              type="text"
                              value={profile.address || profile.location || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setProfile(p => ({ ...p, address: val, location: val }));
                              }}
                              placeholder="Ej: Carrera 6 # 14-25, Ipiales"
                              className="flex-1 min-w-0 w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3 sm:px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                            />
                            <button
                              type="button"
                              onClick={() => setIsMapPickerOpen(true)}
                              className="h-11 px-2.5 sm:px-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-[0.98] shrink-0"
                              title="Colocar o mover el puntero en el mapa"
                            >
                              <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="hidden sm:inline">Fijar en Mapa</span>
                              <span className="sm:hidden">Mapa</span>
                            </button>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mt-1 text-[9px] text-gray-500 font-semibold">
                            <span>Fija el puntero en el mapa para la dirección exacta donde los domiciliarios recogerán.</span>
                            {(profile.mapUrl || (profile.lat && profile.lng)) && (
                              <a
                                href={profile.mapUrl || `https://www.google.com/maps?q=${profile.lat},${profile.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-400 hover:underline flex items-center gap-1 font-bold text-[10px] shrink-0"
                              >
                                <ExternalLink className="w-3 h-3" /> Ver en Google Maps
                              </a>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Símbolo de Moneda</label>
                          <div className="relative">
                            <select
                              value={profile.currency || '$'}
                              onChange={(e) => setProfile(p => ({ ...p, currency: e.target.value }))}
                              className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 pr-8 rounded-xl text-xs font-extrabold outline-none text-emerald-400 focus:ring-1 focus:ring-emerald-500/20 cursor-pointer appearance-none transition-all"
                            >
                              <option value="$" className="bg-gray-900 text-white">$ - Pesos / Dólar ($)</option>
                              <option value="COP" className="bg-gray-900 text-white">COP - Peso Colombiano (COP)</option>
                              <option value="USD" className="bg-gray-900 text-white">USD - Dólar Estadounidense (USD $)</option>
                              <option value="€" className="bg-gray-900 text-white">€ - Euro (€)</option>
                              <option value="MXN" className="bg-gray-900 text-white">MXN - Peso Mexicano (MXN $)</option>
                              <option value="S/" className="bg-gray-900 text-white">S/ - Sol Peruano (S/)</option>
                              <option value="CLP" className="bg-gray-900 text-white">CLP - Peso Chileno (CLP $)</option>
                              <option value="ARS" className="bg-gray-900 text-white">ARS - Peso Argentino (ARS $)</option>
                              <option value="Bs." className="bg-gray-900 text-white">Bs. - Boliviano (Bs.)</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                              </svg>
                            </div>
                          </div>
                          <p className="text-[9px] text-gray-500 mt-1 font-semibold">Selecciona la moneda principal que verán tus clientes.</p>
                        </div>

                        {/* HORARIO DE ATENCIÓN DE LA TIENDA */}
                        <div className="border-t border-gray-800/60 pt-5 space-y-4 w-full min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 pr-1">
                              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> <span className="truncate">Horario de Atención Automático</span>
                              </h3>
                              <p className="text-[10px] text-gray-400 mt-0.5 font-semibold">
                                La tienda se abrirá y cerrará automáticamente todos los días según el horario asignado.
                              </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                              <input
                                type="checkbox"
                                checked={profile.scheduleEnabled ?? Boolean(profile.openTime && profile.closeTime)}
                                onChange={(e) => setProfile(p => ({ ...p, scheduleEnabled: e.target.checked }))}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                            </label>
                          </div>

                          {(profile.scheduleEnabled ?? Boolean(profile.openTime && profile.closeTime)) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-gray-900/60 p-3 sm:p-3.5 rounded-2xl border border-gray-850 w-full min-w-0">
                              <div className="w-full min-w-0">
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                                  Hora de Apertura
                                </label>
                                <input
                                  type="time"
                                  value={profile.openTime || '08:00'}
                                  onChange={(e) => setProfile(p => ({ ...p, openTime: e.target.value }))}
                                  className="w-full h-10 bg-gray-950 border border-gray-800 focus:border-indigo-500 px-3 rounded-xl text-xs font-bold outline-none text-white font-mono"
                                />
                              </div>

                              <div className="w-full min-w-0">
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                                  Hora de Cierre
                                </label>
                                <input
                                  type="time"
                                  value={profile.closeTime || '22:00'}
                                  onChange={(e) => setProfile(p => ({ ...p, closeTime: e.target.value }))}
                                  className="w-full h-10 bg-gray-950 border border-gray-800 focus:border-indigo-500 px-3 rounded-xl text-xs font-bold outline-none text-white font-mono"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* REDES SOCIALES */}
                        <div className="border-t border-gray-800/60 pt-6 space-y-4">
                          <div>
                            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Redes Sociales de la Tienda
                            </h3>
                            <p className="text-[10px] text-gray-500 mt-1 font-semibold">
                              Ingresa tu usuario o enlace de tus redes sociales para que tus clientes puedan seguirte y contactarte.
                            </p>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-550 tracking-wider flex items-center gap-1.5 block mb-1">
                                <Instagram className="w-3 h-3 text-pink-500" /> Instagram
                              </label>
                              <input
                                type="text"
                                value={profile.instagram || ''}
                                placeholder="Ej: mitienda.oficial o link"
                                onChange={(e) => setProfile(p => ({ ...p, instagram: e.target.value }))}
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-550 tracking-wider flex items-center gap-1.5 block mb-1">
                                <Facebook className="w-3 h-3 text-blue-500" /> Facebook
                              </label>
                              <input
                                type="text"
                                value={profile.facebook || ''}
                                placeholder="Ej: facebook.com/mitienda"
                                onChange={(e) => setProfile(p => ({ ...p, facebook: e.target.value }))}
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-550 tracking-wider flex items-center gap-1.5 block mb-1">
                                <Tiktok className="w-3 h-3 text-teal-400" /> TikTok
                              </label>
                              <input
                                type="text"
                                value={profile.tiktok || ''}
                                placeholder="Ej: @mitienda o link"
                                onChange={(e) => setProfile(p => ({ ...p, tiktok: e.target.value }))}
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-550 tracking-wider flex items-center gap-1.5 block mb-1">
                                <Youtube className="w-3 h-3 text-red-500" /> YouTube
                              </label>
                              <input
                                type="text"
                                value={profile.youtube || ''}
                                placeholder="Ej: canal o link completo"
                                onChange={(e) => setProfile(p => ({ ...p, youtube: e.target.value }))}
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-550 tracking-wider flex items-center gap-1.5 block mb-1">
                                <Twitter className="w-3 h-3 text-gray-400" /> Twitter / X
                              </label>
                              <input
                                type="text"
                                value={profile.twitter || ''}
                                placeholder="Ej: mitienda"
                                onChange={(e) => setProfile(p => ({ ...p, twitter: e.target.value }))}
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-6 pt-2">
                          {/* LOGO UPLOAD */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                              Logo de la Tienda
                            </label>
                            
                            <div className="relative border border-dashed border-gray-850 hover:border-emerald-500/50 rounded-2xl p-4 text-center transition bg-[#0c101d] flex flex-col items-center justify-center min-h-[140px] overflow-hidden group">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setIsCompressingLogo(true);
                                    const reader = new FileReader();
                                    reader.onloadend = async () => {
                                      try {
                                        const base64 = reader.result as string;
                                        // Compress logo to 400x400 max
                                        const compressed = await compressImage(base64, 400, 400);
                                        setProfile(p => ({ ...p, photoURL: compressed }));
                                      } catch (err) {
                                        console.error("Error compressing logo:", err);
                                        alert("Error al procesar el logo. Intenta con otra imagen.");
                                      } finally {
                                        setIsCompressingLogo(false);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                              />

                              {isCompressingLogo ? (
                                <div className="flex flex-col items-center gap-2">
                                  <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent animate-spin rounded-full" />
                                  <span className="text-[10px] font-bold text-gray-400">Procesando...</span>
                                </div>
                              ) : profile.photoURL ? (
                                <div className="space-y-3 z-20 flex flex-col items-center">
                                  <img 
                                    src={profile.photoURL} 
                                    alt="Logo de Tienda" 
                                    className="w-16 h-16 rounded-full object-cover border border-emerald-500/35 shadow-md shadow-emerald-400/5"
                                  />
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setProfile(p => ({ ...p, photoURL: '' }));
                                    }}
                                    className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white text-[9px] font-black uppercase tracking-wider rounded-lg border border-rose-500/20 transition cursor-pointer"
                                  >
                                    Eliminar Logo
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center gap-2 text-gray-500 group-hover:text-gray-300 transition">
                                  <div className="w-10 h-10 rounded-full bg-gray-950 flex items-center justify-center border border-gray-850">
                                    <Plus className="w-5 h-5 text-gray-400" />
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-xs font-black text-gray-300 block">Subir Logo</span>
                                    <span className="text-[9px] text-gray-500 block font-medium">Soporta imágenes PNG, JPG</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <details className="group/details">
                              <summary className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 cursor-pointer list-none select-none flex items-center gap-1">
                                <span>O pegar dirección web (URL) del logo...</span>
                              </summary>
                              <div className="mt-2">
                                <input
                                  type="url"
                                  value={profile.photoURL || ''}
                                  placeholder="https://ejemplo.com/mologo.jpg"
                                  onChange={(e) => setProfile(p => ({ ...p, photoURL: e.target.value }))}
                                  className="w-full h-11 bg-gray-900 border border-gray-850 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                                />
                              </div>
                            </details>
                          </div>

                          {/* BANNER UPLOAD */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                                Banner o Portada de la Tienda
                              </label>
                              {profile.coverURL && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    try {
                                      await saveProfile(profile);
                                      setBannerSavedSuccess(true);
                                      setTimeout(() => setBannerSavedSuccess(false), 3000);
                                    } catch (err) {
                                      console.error("Error saving banner:", err);
                                      alert("Error al guardar el banner.");
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 rounded-lg text-[9px] font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1"
                                >
                                  <Save className="w-3 h-3" />
                                  <span>Guardar Banner</span>
                                </button>
                              )}
                            </div>

                            {bannerSavedSuccess && (
                              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                                <Check className="w-3.5 h-3.5" />
                                <span>¡Banner guardado y publicado en tu tienda con éxito!</span>
                              </div>
                            )}
                            
                            <div className="relative border border-dashed border-gray-850 hover:border-emerald-500/50 rounded-2xl p-4 text-center transition bg-[#0c101d] flex flex-col items-center justify-center min-h-[140px] overflow-hidden group">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setIsCompressingBanner(true);
                                    const reader = new FileReader();
                                    reader.onloadend = async () => {
                                      try {
                                        const base64 = reader.result as string;
                                        // Compress banner/cover with high resolution
                                        const compressed = await compressImage(base64, 1400, 700, 0.85);
                                        const updated = { ...profile, coverURL: compressed };
                                        setProfile(updated);
                                        // Auto-persist banner directly to profile in Firestore
                                        await saveProfile(updated);
                                        setBannerSavedSuccess(true);
                                        setTimeout(() => setBannerSavedSuccess(false), 3000);
                                      } catch (err) {
                                        console.error("Error compressing banner:", err);
                                        alert("Error al procesar el banner. Intenta con otra imagen.");
                                      } finally {
                                        setIsCompressingBanner(false);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                              />

                              {isCompressingBanner ? (
                                <div className="flex flex-col items-center gap-2">
                                  <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent animate-spin rounded-full" />
                                  <span className="text-[10px] font-bold text-gray-400">Procesando y guardando banner...</span>
                                </div>
                              ) : profile.coverURL ? (
                                <div className="space-y-3 z-20 flex flex-col items-center w-full">
                                  <div className="w-full h-20 rounded-xl overflow-hidden border border-emerald-500/20 relative shadow-inner">
                                    <img 
                                      src={profile.coverURL} 
                                      alt="Banner de Tienda" 
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition backdrop-blur-[1px]">
                                      <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-1 rounded-md">
                                        Clic para cambiar banner
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const updated = { ...profile, coverURL: '' };
                                        setProfile(updated);
                                        try {
                                          await saveProfile(updated);
                                          setBannerSavedSuccess(true);
                                          setTimeout(() => setBannerSavedSuccess(false), 3000);
                                        } catch (err) {
                                          console.error("Error removing banner:", err);
                                        }
                                      }}
                                      className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white text-[9px] font-black uppercase tracking-wider rounded-lg border border-rose-500/20 transition cursor-pointer"
                                    >
                                      Eliminar Banner
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center gap-2 text-gray-500 group-hover:text-gray-300 transition">
                                  <div className="w-10 h-10 rounded-full bg-gray-950 flex items-center justify-center border border-gray-850">
                                    <Plus className="w-5 h-5 text-gray-400" />
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-xs font-black text-gray-300 block">Subir Banner</span>
                                    <span className="text-[9px] text-gray-500 block font-medium">Recomendado panorámico (PNG, JPG)</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <details className="group/details">
                              <summary className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 cursor-pointer list-none select-none flex items-center gap-1">
                                <span>O pegar dirección web (URL) del banner...</span>
                              </summary>
                              <div className="mt-2">
                                <input
                                  type="url"
                                  value={profile.coverURL || ''}
                                  placeholder="https://ejemplo.com/cubierta.jpg"
                                  onChange={(e) => setProfile(p => ({ ...p, coverURL: e.target.value }))}
                                  className="w-full h-11 bg-gray-900 border border-gray-855 focus:border-emerald-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white focus:ring-1 focus:ring-emerald-500/20"
                                />
                              </div>
                            </details>

                            {/* Slider for Banner Overlay Opacity */}
                            <div className="pt-3.5 border-t border-gray-900/50 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                                  Opacidad de la Portada
                                </span>
                                <span className="text-xs font-mono font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                                  {profile.coverOpacity !== undefined ? profile.coverOpacity : 50}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={profile.coverOpacity !== undefined ? profile.coverOpacity : 50}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  setProfile(p => ({ ...p, coverOpacity: val }));
                                }}
                                className="w-full h-1.5 bg-gray-950 rounded-lg appearance-none cursor-pointer accent-emerald-400 border border-gray-900"
                              />
                              <p className="text-[9px] text-gray-500 font-semibold leading-relaxed">
                                Ajusta la opacidad de la imagen de portada. Un valor más bajo oscurece el fondo para que el título y los enlaces sociales de tu tienda sean mucho más legibles.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2">
                          <button
                            type="submit"
                            className="px-5 py-3 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs rounded-xl shadow transition cursor-pointer flex items-center gap-2"
                          >
                            <Save className="w-4 h-4" /> Guardar Cambios de Tienda
                          </button>
                        </div>
                      </form>

                      {/* Presets Theme Board & Color Studio */}
                      <div className="lg:col-span-5 space-y-5 w-full min-w-0 max-w-full">
                        {/* Status notification */}
                        {themeSavedSuccess && (
                          <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-2xl flex items-center justify-between gap-2.5 text-emerald-400 text-xs font-bold animate-fadeIn w-full min-w-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                <Check className="w-4 h-4 text-emerald-400" />
                              </div>
                              <span className="truncate">¡Diseño y colores actualizados y aplicados en tu tienda!</span>
                            </div>
                            {profile.username && (
                              <a
                                href={`/${profile.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-emerald-500 text-black font-black text-[10px] rounded-lg hover:bg-emerald-400 transition shrink-0 flex items-center gap-1 cursor-pointer shadow-sm"
                              >
                                <span>Ver Tienda</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Store Layout Selector */}
                        <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4 w-full min-w-0 max-w-full">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block mb-1">Diseño de la Interfaz (Plantillas)</span>
                            <p className="text-[11px] text-gray-400 font-medium">Elige la plantilla que mejor se adapte a tu tipo de negocio y productos.</p>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full min-w-0">
                            {/* Option 1: Restaurante */}
                            <button
                              type="button"
                              onClick={() => handleSelectLayout('food')}
                              className={`p-3.5 sm:p-4 rounded-xl border text-left flex items-start justify-between transition cursor-pointer w-full min-w-0 ${
                                (profile.layout || 'food') === 'food'
                                  ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                                  : 'border-gray-900 bg-gray-920 hover:border-gray-800'
                              }`}
                            >
                              <div className="flex gap-2.5 sm:gap-3 min-w-0">
                                <div className="p-2 sm:p-2.5 rounded-lg bg-gray-900 border border-gray-800 text-amber-500 mt-0.5 shrink-0">
                                  <Utensils className="w-4 h-4 text-amber-500" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h4 className="text-xs font-extrabold text-white">Restaurante & Menú</h4>
                                    {(profile.layout || 'food') === 'food' && (
                                      <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded shrink-0">Activo</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-400 leading-normal mt-0.5">Menú gastronómico gourmet, platos, fotos de comida y botón directo de pedido.</p>
                                </div>
                              </div>
                              {(profile.layout || 'food') === 'food' && (
                                <Check className="w-4.5 h-4.5 text-emerald-400 shrink-0 ml-2" />
                              )}
                            </button>

                            {/* Option 2: Licorera */}
                            <button
                              type="button"
                              onClick={() => handleSelectLayout('liquor')}
                              className={`p-3.5 sm:p-4 rounded-xl border text-left flex items-start justify-between transition cursor-pointer w-full min-w-0 ${
                                profile.layout === 'liquor'
                                  ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                                  : 'border-gray-900 bg-gray-920 hover:border-gray-800'
                              }`}
                            >
                              <div className="flex gap-2.5 sm:gap-3 min-w-0">
                                <div className="p-2 sm:p-2.5 rounded-lg bg-gray-900 border border-gray-800 text-purple-400 mt-0.5 shrink-0">
                                  <Wine className="w-4 h-4 text-purple-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h4 className="text-xs font-extrabold text-white">Licorera & Bar</h4>
                                    {profile.layout === 'liquor' && (
                                      <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded shrink-0">Activo</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-400 leading-normal mt-0.5">Diseño nocturno para licores, coctelería, cervezas frías y combos express.</p>
                                </div>
                              </div>
                              {profile.layout === 'liquor' && (
                                <Check className="w-4.5 h-4.5 text-emerald-400 shrink-0 ml-2" />
                              )}
                            </button>

                            {/* Option 3: Calzado & Deportes */}
                            <button
                              type="button"
                              onClick={() => handleSelectLayout('shoes')}
                              className={`p-3.5 sm:p-4 rounded-xl border text-left flex items-start justify-between transition cursor-pointer w-full min-w-0 ${
                                profile.layout === 'shoes'
                                  ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                                  : 'border-gray-900 bg-gray-920 hover:border-gray-800'
                              }`}
                            >
                              <div className="flex gap-2.5 sm:gap-3 min-w-0">
                                <div className="p-2 sm:p-2.5 rounded-lg bg-gray-900 border border-gray-800 text-amber-400 mt-0.5 shrink-0">
                                  <Flame className="w-4 h-4 text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h4 className="text-xs font-extrabold text-white">Calzado & Moda Deportiva</h4>
                                    {profile.layout === 'shoes' && (
                                      <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded shrink-0">Activo</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-400 leading-normal mt-0.5">Estilo atlético urbano, tarjetas con ofertas en ángulo, zapatillas y moda streetwear.</p>
                                </div>
                              </div>
                              {profile.layout === 'shoes' && (
                                <Check className="w-4.5 h-4.5 text-emerald-400 shrink-0 ml-2" />
                              )}
                            </button>

                            {/* Option 4: Tecnología */}
                            <button
                              type="button"
                              onClick={() => handleSelectLayout('tech')}
                              className={`p-3.5 sm:p-4 rounded-xl border text-left flex items-start justify-between transition cursor-pointer w-full min-w-0 ${
                                profile.layout === 'tech'
                                  ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                                  : 'border-gray-900 bg-gray-920 hover:border-gray-800'
                              }`}
                            >
                              <div className="flex gap-2.5 sm:gap-3 min-w-0">
                                <div className="p-2 sm:p-2.5 rounded-lg bg-gray-900 border border-gray-800 text-indigo-400 mt-0.5 shrink-0">
                                  <Smartphone className="w-4 h-4 text-indigo-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h4 className="text-xs font-extrabold text-white">Tecnología & Dispositivos</h4>
                                    {profile.layout === 'tech' && (
                                      <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded shrink-0">Activo</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-400 leading-normal mt-0.5">Minimalismo de alta gama con sellos de original, celulares, audio y gadgets.</p>
                                </div>
                              </div>
                              {profile.layout === 'tech' && (
                                <Check className="w-4.5 h-4.5 text-emerald-400 shrink-0 ml-2" />
                              )}
                            </button>

                            {/* Option 5: Tienda General */}
                            <button
                              type="button"
                              onClick={() => handleSelectLayout('default')}
                              className={`p-3.5 sm:p-4 rounded-xl border text-left flex items-start justify-between transition cursor-pointer md:col-span-2 w-full min-w-0 ${
                                profile.layout === 'default'
                                  ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                                  : 'border-gray-900 bg-gray-920 hover:border-gray-800'
                              }`}
                            >
                              <div className="flex gap-2.5 sm:gap-3 min-w-0">
                                <div className="p-2 sm:p-2.5 rounded-lg bg-gray-900 border border-gray-800 text-emerald-400 mt-0.5 shrink-0">
                                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h4 className="text-xs font-extrabold text-white">Tienda General & Catálogo Universal</h4>
                                    {profile.layout === 'default' && (
                                      <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded shrink-0">Activo</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-400 leading-normal mt-0.5">Diseño versátil para farmacias, supermercados, ferreterías, regalos o tiendas con inventarios mixtos.</p>
                                </div>
                              </div>
                              {profile.layout === 'default' && (
                                <Check className="w-4.5 h-4.5 text-emerald-400 shrink-0 ml-2" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Themes & Colors Presets */}
                        <div className="bg-gray-950 border border-gray-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-5 w-full min-w-0 max-w-full">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full min-w-0">
                            <div className="min-w-0">
                              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block mb-0.5">
                                Paletas y Temas de Diseño
                              </span>
                              <p className="text-[11px] text-gray-400 font-medium">
                                Elige entre {PREDEFINED_THEMES.length} temas optimizados por categoría o personaliza colores a tu gusto.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsCustomThemeOpen(!isCustomThemeOpen)}
                              className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 ${
                                isCustomThemeOpen 
                                  ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' 
                                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                              }`}
                            >
                              <Paintbrush className="w-3 h-3" />
                              <span>{isCustomThemeOpen ? 'Cerrar Estudio' : 'Personalizar Colores'}</span>
                              {isCustomThemeOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>

                          {/* Category Filter Tabs */}
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                            {[
                              { id: 'all', label: '🌟 Todos', count: PREDEFINED_THEMES.length },
                              { id: 'food', label: '🍔 Comidas', count: PREDEFINED_THEMES.filter(t => t.category === 'food').length },
                              { id: 'dessert', label: '🍰 Café & Dulces', count: PREDEFINED_THEMES.filter(t => t.category === 'dessert').length },
                              { id: 'nightlife', label: '🍸 Licores & Bares', count: PREDEFINED_THEMES.filter(t => t.category === 'nightlife').length },
                              { id: 'dark', label: '🖤 Oscuros & Lujo', count: PREDEFINED_THEMES.filter(t => t.category === 'dark').length },
                              { id: 'light', label: '⚪ Claros & Frescos', count: PREDEFINED_THEMES.filter(t => t.category === 'light').length },
                            ].map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setThemeCategoryFilter(cat.id)}
                                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                                  themeCategoryFilter === cat.id
                                    ? 'bg-emerald-500 text-black shadow-sm'
                                    : 'bg-gray-900/80 text-gray-400 hover:text-white hover:bg-gray-850 border border-gray-850'
                                }`}
                              >
                                <span>{cat.label}</span>
                                <span className={`text-[9px] px-1 py-0.2 rounded-full ${
                                  themeCategoryFilter === cat.id ? 'bg-black/20 text-black' : 'bg-gray-800 text-gray-400'
                                }`}>
                                  {cat.count}
                                </span>
                              </button>
                            ))}
                          </div>

                          {/* Theme Search */}
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={themeSearchQuery}
                              onChange={(e) => setThemeSearchQuery(e.target.value)}
                              placeholder="Buscar por color o estilo (ej: Fuego, Dorado, Cacao, Ruby...)"
                              className="w-full h-9 bg-gray-900/90 border border-gray-850 focus:border-indigo-500 pl-8.5 pr-3 rounded-xl text-xs font-semibold outline-none text-white placeholder-gray-500"
                            />
                            {themeSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setThemeSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          
                          {/* Theme Grid */}
                          <div className="grid grid-cols-1 gap-3 max-h-[460px] overflow-y-auto pr-1">
                            {PREDEFINED_THEMES
                              .filter((th) => {
                                if (themeCategoryFilter !== 'all' && th.category !== themeCategoryFilter) return false;
                                if (themeSearchQuery.trim()) {
                                  const q = themeSearchQuery.toLowerCase();
                                  return th.name.toLowerCase().includes(q) || (th.description && th.description.toLowerCase().includes(q));
                                }
                                return true;
                              })
                              .map((th) => {
                                const isSelected = customTheme.id === th.id;
                                return (
                                  <button
                                    key={th.id}
                                    type="button"
                                    onClick={() => handleSelectTheme(th)}
                                    className={`p-3.5 rounded-2xl border text-left transition relative group cursor-pointer ${
                                      isSelected 
                                        ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/30' 
                                        : 'border-gray-850 bg-gray-900/60 hover:bg-gray-900 hover:border-gray-750'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-start gap-3 min-w-0">
                                        {/* Theme Visual Palette Swatch */}
                                        <div 
                                          className="w-11 h-11 rounded-xl border border-white/15 shrink-0 flex flex-col p-1 justify-between shadow-inner"
                                          style={th.bgType === 'gradient' ? { backgroundImage: th.bgColor } : { backgroundColor: th.bgColor }}
                                        >
                                          {/* Mini card indicator inside swatch */}
                                          <div 
                                            className="w-full h-4 rounded-md border flex items-center justify-end px-1"
                                            style={{ backgroundColor: th.cardBg, borderColor: th.cardBorder }}
                                          >
                                            <div 
                                              className="w-2 h-2 rounded-full" 
                                              style={{ backgroundColor: th.accentColor || '#10b981' }}
                                            />
                                          </div>
                                          <div className="flex items-center gap-0.5 justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: th.textColor }} />
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: th.accentColor || '#10b981' }} />
                                          </div>
                                        </div>

                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="text-xs font-black text-white truncate">{th.name}</h4>
                                            {th.category && (
                                              <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-400">
                                                {th.category === 'food' && 'Comida'}
                                                {th.category === 'dessert' && 'Café/Dulce'}
                                                {th.category === 'nightlife' && 'Bar/Noche'}
                                                {th.category === 'dark' && 'Oscuro'}
                                                {th.category === 'light' && 'Claro'}
                                              </span>
                                            )}
                                          </div>
                                          
                                          {th.description && (
                                            <p className="text-[10px] text-gray-400 font-medium leading-tight mt-1 line-clamp-2">
                                              {th.description}
                                            </p>
                                          )}

                                          {/* Visual Color Dots */}
                                          <div className="flex items-center gap-2 mt-2">
                                            <div className="flex items-center gap-1">
                                              <span className="text-[8px] text-gray-500 font-bold uppercase">Fondo:</span>
                                              <div 
                                                className="w-3 h-3 rounded-full border border-white/20" 
                                                style={th.bgType === 'gradient' ? { backgroundImage: th.bgColor } : { backgroundColor: th.bgColor }}
                                                title="Color de Fondo"
                                              />
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[8px] text-gray-500 font-bold uppercase">Acento:</span>
                                              <div 
                                                className="w-3 h-3 rounded-full border border-white/20" 
                                                style={{ backgroundColor: th.accentColor || '#10b981' }}
                                                title="Color de Acento / Botones"
                                              />
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[8px] text-gray-500 font-bold uppercase">Tarjetas:</span>
                                              <div 
                                                className="w-3 h-3 rounded-full border border-white/20" 
                                                style={{ backgroundColor: th.cardBg }}
                                                title="Fondo de Tarjetas"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="shrink-0 flex flex-col items-end gap-1">
                                        {isSelected ? (
                                          <span className="w-6 h-6 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-md">
                                            <Check className="w-4 h-4 stroke-[3]" />
                                          </span>
                                        ) : (
                                          <span className="w-6 h-6 rounded-full border border-gray-700 text-gray-600 flex items-center justify-center group-hover:border-gray-500 group-hover:text-gray-400">
                                            <Check className="w-3.5 h-3.5" />
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                          </div>
                        </div>

                        {/* Interactive Color Studio (Custom Color Palette) */}
                        {isCustomThemeOpen && (
                          <div className="bg-gray-950 border border-indigo-500/30 p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-5 sm:space-y-6 shadow-xl animate-fadeIn w-full min-w-0 max-w-full">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-900 pb-4 w-full min-w-0">
                              <div className="min-w-0">
                                <h3 className="text-xs font-extrabold text-white flex items-center gap-2 uppercase tracking-wider">
                                  <Paintbrush className="w-4 h-4 text-indigo-400 shrink-0" />
                                  <span>Personalizador de Colores y Estilos</span>
                                </h3>
                                <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                  Ajusta los colores exactos, fondo, bordes, tipografía y botones de tu tienda en tiempo real.
                                </p>
                              </div>
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 self-start sm:self-auto shrink-0">
                                Modo Libre
                              </span>
                            </div>

                            {/* 1. Color de Acento (Botones & Precios) */}
                            <div className="space-y-2.5 w-full min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-300">
                                  Color de Acento Principal (Botones, Precios y Destacados)
                                </label>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    type="color"
                                    value={customTheme.accentColor || '#10b981'}
                                    onChange={(e) => setCustomTheme({ ...customTheme, accentColor: e.target.value })}
                                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                                  />
                                  <span className="text-[10px] font-mono font-bold text-gray-400">
                                    {customTheme.accentColor || '#10b981'}
                                  </span>
                                </div>
                              </div>

                              {/* Quick Accent Swatches */}
                              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 w-full min-w-0">
                                {[
                                  { name: 'Esmeralda', hex: '#10b981' },
                                  { name: 'Naranja Fuego', hex: '#f97316' },
                                  { name: 'Rojo Rubí', hex: '#ef4444' },
                                  { name: 'Oro Dorado', hex: '#eab308' },
                                  { name: 'Azul Real', hex: '#2563eb' },
                                  { name: 'Cian Eléctrico', hex: '#06b6d4' },
                                  { name: 'Violeta Neón', hex: '#a855f7' },
                                  { name: 'Rosa Fresa', hex: '#ec4899' },
                                  { name: 'Verde Matcha', hex: '#84cc16' },
                                  { name: 'Ámbar Malta', hex: '#f59e0b' },
                                  { name: 'Púrpura', hex: '#7c3aed' },
                                  { name: 'Carmesí Vino', hex: '#be123c' },
                                  { name: 'Cobre Cálido', hex: '#ea580c' },
                                  { name: 'Blanco Puro', hex: '#ffffff' },
                                ].map((sw) => (
                                  <button
                                    key={sw.hex}
                                    type="button"
                                    onClick={() => setCustomTheme({ ...customTheme, accentColor: sw.hex })}
                                    title={sw.name}
                                    className={`h-7 rounded-xl border flex items-center justify-center transition cursor-pointer ${
                                      customTheme.accentColor?.toLowerCase() === sw.hex.toLowerCase()
                                        ? 'ring-2 ring-white scale-105 border-white'
                                        : 'border-white/10 hover:scale-105'
                                    }`}
                                    style={{ backgroundColor: sw.hex }}
                                  >
                                    {customTheme.accentColor?.toLowerCase() === sw.hex.toLowerCase() && (
                                      <Check className={`w-3.5 h-3.5 ${sw.hex === '#ffffff' ? 'text-black' : 'text-white'}`} />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* 2. Fondo de la Tienda */}
                            <div className="space-y-2.5 pt-2 border-t border-gray-900 w-full min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-300">
                                  Fondo General de la Tienda
                                </label>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setCustomTheme({ ...customTheme, bgType: 'flat' })}
                                    className={`px-2 py-0.5 text-[9px] font-bold rounded-md ${
                                      customTheme.bgType === 'flat' ? 'bg-indigo-500 text-white' : 'bg-gray-900 text-gray-400'
                                    }`}
                                  >
                                    Sólido
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCustomTheme({ ...customTheme, bgType: 'gradient' })}
                                    className={`px-2 py-0.5 text-[9px] font-bold rounded-md ${
                                      customTheme.bgType === 'gradient' ? 'bg-indigo-500 text-white' : 'bg-gray-900 text-gray-400'
                                    }`}
                                  >
                                    Degradado
                                  </button>
                                </div>
                              </div>

                              {customTheme.bgType === 'flat' ? (
                                <div className="space-y-2 w-full min-w-0">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={customTheme.bgColor.startsWith('#') ? customTheme.bgColor : '#0c0d12'}
                                      onChange={(e) => setCustomTheme({ ...customTheme, bgColor: e.target.value })}
                                      className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 shrink-0"
                                    />
                                    <input
                                      type="text"
                                      value={customTheme.bgColor}
                                      onChange={(e) => setCustomTheme({ ...customTheme, bgColor: e.target.value })}
                                      placeholder="#0c0d12"
                                      className="w-full h-8 bg-gray-900 border border-gray-850 focus:border-indigo-500 px-3 rounded-lg text-xs font-mono text-white min-w-0"
                                    />
                                  </div>

                                  {/* Quick Solid Backgrounds */}
                                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 w-full min-w-0">
                                    {[
                                      { name: 'Obsidian Negro', hex: '#08080a' },
                                      { name: 'Carbón Grill', hex: '#0c0d12' },
                                      { name: 'Azul Medianoche', hex: '#0b111e' },
                                      { name: 'Cacao Ahumado', hex: '#140c08' },
                                      { name: 'Vino Borgoña', hex: '#14070e' },
                                      { name: 'Blanco Mineral', hex: '#f8fafc' },
                                      { name: 'Lino Arena', hex: '#fdfbf7' },
                                      { name: 'Menta Suave', hex: '#f2f9f6' },
                                      { name: 'Lavanda Dulce', hex: '#f7f4fc' },
                                      { name: 'Abismo Marino', hex: '#050f1d' },
                                      { name: 'Bosque Esmeralda', hex: '#08130d' },
                                      { name: 'Gris Grafito', hex: '#18181b' },
                                    ].map((bg) => (
                                      <button
                                        key={bg.hex}
                                        type="button"
                                        onClick={() => {
                                          const isLight = ['#f8fafc', '#fdfbf7', '#f2f9f6', '#f7f4fc'].includes(bg.hex);
                                          setCustomTheme({
                                            ...customTheme,
                                            bgColor: bg.hex,
                                            textColor: isLight ? '#0f172a' : '#ffffff',
                                            cardBg: isLight ? '#ffffff' : '#151722',
                                            cardBorder: isLight ? 'rgba(203, 213, 225, 0.9)' : 'rgba(255, 255, 255, 0.1)',
                                            cardTextColor: isLight ? '#0f172a' : '#ffffff'
                                          });
                                        }}
                                        title={bg.name}
                                        className={`h-6 rounded-lg border text-[8px] font-bold flex items-center justify-center transition cursor-pointer ${
                                          customTheme.bgColor.toLowerCase() === bg.hex.toLowerCase()
                                            ? 'ring-2 ring-emerald-400 border-white'
                                            : 'border-white/10'
                                        }`}
                                        style={{ backgroundColor: bg.hex }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2 w-full min-w-0">
                                  <input
                                    type="text"
                                    value={customTheme.bgColor}
                                    onChange={(e) => setCustomTheme({ ...customTheme, bgColor: e.target.value })}
                                    placeholder="linear-gradient(135deg, #090b14 0%, #2a0b38 100%)"
                                    className="w-full h-8 bg-gray-900 border border-gray-850 focus:border-indigo-500 px-3 rounded-lg text-xs font-mono text-white min-w-0"
                                  />
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full min-w-0">
                                    {[
                                      { name: 'Aurora Púrpura', grad: 'linear-gradient(135deg, #090b14 0%, #150d2a 50%, #2a0b38 100%)' },
                                      { name: 'Zafiro Real', grad: 'linear-gradient(135deg, #0f1c3f 0%, #3b0764 100%)' },
                                      { name: 'Fuego Tropical', grad: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 100%)' },
                                      { name: 'Atardecer Coral', grad: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)' },
                                    ].map((g) => (
                                      <button
                                        key={g.name}
                                        type="button"
                                        onClick={() => setCustomTheme({ ...customTheme, bgColor: g.grad })}
                                        className="h-8 rounded-lg border border-white/20 text-[9px] font-bold text-white shadow-sm flex items-center justify-center px-2 text-center"
                                        style={{ backgroundImage: g.grad }}
                                      >
                                        {g.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* 3. Tarjetas de Productos & Textos */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-900 w-full min-w-0">
                              <div className="w-full min-w-0">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-300 block mb-1.5">
                                  Fondo de Tarjetas de Producto
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={customTheme.cardBg.startsWith('#') ? customTheme.cardBg : '#151722'}
                                    onChange={(e) => setCustomTheme({ ...customTheme, cardBg: e.target.value })}
                                    className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 shrink-0"
                                  />
                                  <input
                                    type="text"
                                    value={customTheme.cardBg}
                                    onChange={(e) => setCustomTheme({ ...customTheme, cardBg: e.target.value })}
                                    placeholder="#151722"
                                    className="w-full h-8 bg-gray-900 border border-gray-850 px-2.5 rounded-lg text-xs font-mono text-white min-w-0"
                                  />
                                </div>
                              </div>

                              <div className="w-full min-w-0">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-300 block mb-1.5">
                                  Borde de Tarjetas
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={customTheme.cardBorder.startsWith('#') ? customTheme.cardBorder : '#f97316'}
                                    onChange={(e) => setCustomTheme({ ...customTheme, cardBorder: e.target.value })}
                                    className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 shrink-0"
                                  />
                                  <input
                                    type="text"
                                    value={customTheme.cardBorder}
                                    onChange={(e) => setCustomTheme({ ...customTheme, cardBorder: e.target.value })}
                                    placeholder="rgba(249,115,22,0.3)"
                                    className="w-full h-8 bg-gray-900 border border-gray-850 px-2.5 rounded-lg text-xs font-mono text-white min-w-0"
                                  />
                                </div>
                              </div>

                              <div className="w-full min-w-0">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-300 block mb-1.5">
                                  Texto de Tarjetas y Título
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={customTheme.cardTextColor.startsWith('#') ? customTheme.cardTextColor : '#ffffff'}
                                    onChange={(e) => setCustomTheme({ ...customTheme, cardTextColor: e.target.value })}
                                    className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 shrink-0"
                                  />
                                  <input
                                    type="text"
                                    value={customTheme.cardTextColor}
                                    onChange={(e) => setCustomTheme({ ...customTheme, cardTextColor: e.target.value })}
                                    placeholder="#ffffff"
                                    className="w-full h-8 bg-gray-900 border border-gray-850 px-2.5 rounded-lg text-xs font-mono text-white min-w-0"
                                  />
                                </div>
                              </div>

                              <div className="w-full min-w-0">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-300 block mb-1.5">
                                  Texto Principal de la Tienda
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={customTheme.textColor.startsWith('#') ? customTheme.textColor : '#ffffff'}
                                    onChange={(e) => setCustomTheme({ ...customTheme, textColor: e.target.value })}
                                    className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 shrink-0"
                                  />
                                  <input
                                    type="text"
                                    value={customTheme.textColor}
                                    onChange={(e) => setCustomTheme({ ...customTheme, textColor: e.target.value })}
                                    placeholder="#ffffff"
                                    className="w-full h-8 bg-gray-900 border border-gray-850 px-2.5 rounded-lg text-xs font-mono text-white min-w-0"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* 4. Tipografía y Estilo de Botón */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-900 w-full min-w-0">
                              <div className="w-full min-w-0">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-300 block mb-1.5">
                                  Tipografía
                                </label>
                                <select
                                  value={customTheme.fontFamily}
                                  onChange={(e) => setCustomTheme({ ...customTheme, fontFamily: e.target.value as any })}
                                  className="w-full h-9 bg-gray-900 border border-gray-850 focus:border-indigo-500 px-3 rounded-xl text-xs font-bold text-white outline-none cursor-pointer"
                                >
                                  <option value="font-sans">Sans-serif Moderna (Limpia)</option>
                                  <option value="font-serif">Serif Elegante (Artesanal/Café)</option>
                                  <option value="font-mono">Monospace Tech (Digital/Cyber)</option>
                                  <option value="font-display">Display Negrita (Impacto/Grill)</option>
                                </select>
                              </div>

                              <div className="w-full min-w-0">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-300 block mb-1.5">
                                  Estilo de Botones
                                </label>
                                <select
                                  value={customTheme.buttonStyle}
                                  onChange={(e) => setCustomTheme({ ...customTheme, buttonStyle: e.target.value as any })}
                                  className="w-full h-9 bg-gray-900 border border-gray-850 focus:border-indigo-500 px-3 rounded-xl text-xs font-bold text-white outline-none cursor-pointer"
                                >
                                  <option value="rounded">Redondeado Moderno (Rounded)</option>
                                  <option value="pill">Píldora Redonda (Pill)</option>
                                  <option value="square">Cuadrado Minimal (Square)</option>
                                  <option value="shadow">Con Sombra Sólida (Shadow)</option>
                                  <option value="bordered">Con Borde Resaltado (Bordered)</option>
                                </select>
                              </div>
                            </div>

                            {/* Live Interactive Preview Card */}
                            <div className="p-3 sm:p-4 rounded-2xl border border-gray-800 space-y-2 w-full min-w-0">
                              <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">
                                Vista Previa de Producto en tu Tienda:
                              </span>
                              
                              <div 
                                className="p-3 sm:p-4 rounded-xl border transition-all w-full min-w-0 overflow-hidden"
                                style={customTheme.bgType === 'gradient' ? { backgroundImage: customTheme.bgColor } : { backgroundColor: customTheme.bgColor }}
                              >
                                <div 
                                  className={`p-3 sm:p-3.5 border transition-all w-full min-w-0 ${
                                    customTheme.buttonStyle === 'square' ? 'rounded-none' : 'rounded-2xl'
                                  }`}
                                  style={{
                                    backgroundColor: customTheme.cardBg,
                                    borderColor: customTheme.cardBorder,
                                    color: customTheme.cardTextColor
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2.5 sm:gap-3">
                                    <div className="min-w-0">
                                      <span 
                                        className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full inline-block mb-1 truncate"
                                        style={{ backgroundColor: `${customTheme.accentColor || '#10b981'}25`, color: customTheme.accentColor || '#10b981' }}
                                      >
                                        Especialidad
                                      </span>
                                      <h4 className="text-xs font-black truncate" style={{ color: customTheme.cardTextColor }}>
                                        Hamburguesa Artesanal Doble
                                      </h4>
                                      <span className="text-xs font-extrabold mt-1 block" style={{ color: customTheme.accentColor || '#10b981' }}>
                                        $24.500
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      className={`px-3 py-2 text-xs font-black transition cursor-pointer shrink-0 ${
                                        customTheme.buttonStyle === 'pill' ? 'rounded-full' : customTheme.buttonStyle === 'square' ? 'rounded-none' : 'rounded-xl'
                                      }`}
                                      style={{
                                        backgroundColor: customTheme.accentColor || '#10b981',
                                        color: customTheme.accentColor === '#ffffff' ? '#000000' : '#ffffff'
                                      }}
                                    >
                                      Pedir
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Save Custom Theme Button */}
                            <div className="pt-2 w-full min-w-0">
                              <button
                                type="button"
                                disabled={isSavingTheme}
                                onClick={handleSaveCustomTheme}
                                className="w-full py-3 px-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-extrabold text-xs rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
                              >
                                {isSavingTheme ? (
                                  <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin rounded-full" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                                <span className="truncate">Guardar y Aplicar Colores Personalizados</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}

                {/* 5. VISITOR ANALYTICS TAB */}
                {activeTab === 'analytics' && (
                  <div className="space-y-6">
                    <div className="border-b border-gray-900 pb-4">
                      <h2 className="text-xl font-bold text-white">Reportes de Tránsito de la Tienda</h2>
                      <p className="text-xs text-gray-500 font-medium">Analiza demografías de procedencia, plataformas referidoras, canales y clics.</p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                      
                      {/* Referrers */}
                      <div className="bg-gray-950 border border-gray-900 p-6 rounded-3xl space-y-4">
                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block border-b border-gray-900 pb-2">Plataformas Referidoras</span>
                        <div className="space-y-3">
                          {[
                            { name: 'Instagram Bio', count: '45%' },
                            { name: 'TikTok Links', count: '30%' },
                            { name: 'WhatsApp', count: '15%' },
                            { name: 'Google Search', count: '10%' }
                          ].map((ref, i) => (
                            <div key={i} className="flex justify-between items-center text-xs text-gray-400">
                              <span className="font-semibold text-white">{ref.name}</span>
                              <span className="font-mono text-indigo-400">{ref.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Devices */}
                      <div className="bg-gray-950 border border-gray-900 p-6 rounded-3xl space-y-4">
                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block border-b border-gray-900 pb-2">Dispositivos Utilizados</span>
                        <div className="space-y-3">
                          {[
                            { name: 'Móvil / Celulares', count: '85%' },
                            { name: 'Ordenador / Computador', count: '12%' },
                            { name: 'Tabletas', count: '3%' }
                          ].map((dev, i) => (
                            <div key={i} className="flex justify-between items-center text-xs text-gray-400">
                              <span className="font-semibold text-white">{dev.name}</span>
                              <span className="font-mono text-emerald-400">{dev.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Countries */}
                      <div className="bg-gray-950 border border-gray-900 p-6 rounded-3xl space-y-4 col-span-1 md:col-span-2 lg:col-span-1">
                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block border-b border-gray-900 pb-2">Países de Audiencia</span>
                        <div className="space-y-3">
                          {[
                            { name: 'Colombia 🇨🇴', count: '520 visitas' },
                            { name: 'España 🇪🇸', count: '280 visitas' },
                            { name: 'México 🇲🇽', count: '190 visitas' },
                            { name: 'Argentina 🇦🇷', count: '90 visitas' }
                          ].map((cnt, i) => (
                            <div key={i} className="flex justify-between items-center text-xs text-gray-400">
                              <span className="font-semibold text-white">{cnt.name}</span>
                              <span className="font-mono text-white/80">{cnt.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* 5. SUSCRIPCIÓN Y COBROS TAB (COP CURRENCY) */}
                {activeTab === 'subscription' && (
                  <div className="space-y-6">
                    <div className="border-b border-gray-900 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold text-white">Suscripción y Pagos de la Plataforma</h2>
                        <p className="text-xs text-gray-500 font-medium">Gestiona tu plan de facturación mensual en pesos colombianos (COP), revisa tus consumos de productos y sube comprobantes de transferencias bancarias directas.</p>
                      </div>
                      <a
                        id="subscription-tab-whatsapp-help-btn"
                        href="https://wa.me/573106502043?text=Hola%2C%20necesito%20ayuda%20con%20mi%20suscripci%C3%B3n%20y%20pago%20en%20la%20plataforma"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-black text-xs rounded-xl transition shrink-0 cursor-pointer shadow-sm shadow-emerald-950/20"
                        title="Contactar soporte administrativo por WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
                        <span>Ayuda por WhatsApp 3106502043</span>
                      </a>
                    </div>

                    {/* Progress limits meter */}
                    <div className="grid md:grid-cols-12 gap-6 items-start">
                      
                      {/* Subscription Status cards */}
                      <div className="md:col-span-4 bg-gray-950 border border-gray-900 p-6 rounded-3xl space-y-4">
                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block border-b border-gray-900 pb-2">Estado de Cuenta</span>
                        
                        <div>
                          <p className="text-[10px] text-gray-550 font-bold uppercase font-mono">Plan Activo</p>
                          <h3 className="text-base font-extrabold text-white uppercase mt-0.5">
                            {(profile.subscriptionPlan || profile.plan) === 'medio' ? 'Plan Medio' : 
                             (profile.subscriptionPlan || profile.plan) === 'pro' || (profile.subscriptionPlan || profile.plan) === 'avanzado' ? 'Plan Avanzado' : 'Plan Básico'}
                          </h3>
                        </div>

                        <div>
                          <p className="text-[10px] text-gray-550 font-bold uppercase font-mono">Estado de Suscripción</p>
                          <div className="mt-1">
                            {profile.subscriptionStatus === 'trial' || !profile.subscriptionStatus ? (
                              <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Primer Mes Gratis (Básico)
                              </span>
                            ) : profile.subscriptionStatus === 'active' ? (
                              <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                Activo • Pagado
                              </span>
                            ) : profile.subscriptionStatus === 'under_review' ? (
                              <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                Comprobante en Revisión
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-red-500/10 text-red-400 border border-red-500/20">
                                Pago Pendiente
                              </span>
                            )}
                          </div>
                        </div>

                        {profile.subscriptionStatus === 'under_review' && profile.requestedPlan && (
                          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl space-y-1">
                            <p className="text-[10px] font-black text-amber-300 uppercase tracking-wider">Solicitud de Ascenso</p>
                            <p className="text-xs font-bold text-white">
                              {profile.requestedPlan === 'medio' ? 'Plan Medio ($79.000 COP)' : profile.requestedPlan === 'pro' ? 'Plan Avanzado ($99.000 COP)' : 'Plan Básico ($49.000 COP)'}
                            </p>
                            <p className="text-[10px] text-amber-200/80 leading-snug">
                              Pendiente de verificación y aprobación por el Administrador. Tu tienda continúa operando en Plan Básico.
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="text-[10px] text-gray-550 font-bold uppercase font-mono">Cupo de Productos</p>
                          <p className="text-xs text-white font-semibold mt-1">
                            {products.length} / {getPlanProductLimit(profile.subscriptionPlan || profile.plan)} productos subidos
                          </p>
                          <div className="w-full bg-gray-900 h-1.5 rounded-full mt-2 overflow-hidden border border-gray-850">
                            <div 
                              className={`h-full ${products.length >= getPlanProductLimit(profile.subscriptionPlan || profile.plan) ? 'bg-red-500' : 'bg-emerald-400'}`}
                              style={{ width: `${Math.min(100, (products.length / getPlanProductLimit(profile.subscriptionPlan || profile.plan)) * 100)}%` }}
                            />
                          </div>
                        </div>

                        {(profile.subscriptionStatus === 'trial' || !profile.subscriptionStatus) && (
                          <div className="bg-amber-500/5 border border-amber-500/15 p-3 rounded-xl text-[10px] text-amber-200 font-semibold leading-relaxed">
                            🎁 Tu período inicial es de <strong>1 semana (7 días) de prueba gratis</strong> en Plan Básico (hasta 5 productos). Al concluir los 7 días, los productos se ocultarán a los clientes si no se ha validado tu comprobante de pago ($49.000 COP/mes).
                          </div>
                        )}
                        {profile.subscriptionStatus === 'under_review' && (
                          <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl text-[10px] text-amber-300 font-semibold leading-relaxed">
                            ⏱️ Tu comprobante de transferencia bancaria está en cola de verificación. En cuanto el Administrador apruebe el pago, tu nuevo plan y cupo de productos se activarán automáticamente.
                          </div>
                        )}
                      </div>

                      {/* Plan picker & Payment Proof actions */}
                      <div className="md:col-span-8 space-y-6">
                        
                        {/* 1. SELECT / CHANGE PLAN GRID */}
                        <div className="bg-gray-950 border border-gray-900 p-6 rounded-3xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block">Planes Disponibles</span>
                              <p className="text-[11px] text-gray-500 font-sans mt-0.5">Selecciona el plan al que deseas ascender o renovar. Para activarlo se requiere comprobante de pago y aprobación del Administrador.</p>
                            </div>
                          </div>
                          
                          <div className="grid sm:grid-cols-3 gap-4">
                            {[
                              { id: 'basico', name: 'Plan Básico', price: 49000, limit: 5, desc: 'Hasta 5 productos para el inicio de tu negocio.' },
                              { id: 'medio', name: 'Plan Medio', price: 79000, limit: 12, desc: 'Hasta 12 productos para tiendas en crecimiento.' },
                              { id: 'pro', name: 'Plan Avanzado', price: 99000, limit: 24, desc: 'Hasta 24 productos para marcas de alto calibre.' }
                            ].map((pl) => {
                              const isCurrentActive = (profile.subscriptionPlan === pl.id) || (!profile.subscriptionPlan && pl.id === 'basico');
                              const isPendingReview = profile.subscriptionStatus === 'under_review' && profile.requestedPlan === pl.id;
                              const isSelectedForPayment = selectedSubPlan === pl.id;

                              return (
                                <div 
                                  key={pl.id}
                                  className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3.5 transition ${
                                    isCurrentActive 
                                      ? 'border-emerald-500/70 bg-emerald-500/5 shadow-md shadow-emerald-500/5' 
                                      : isPendingReview
                                      ? 'border-amber-500/60 bg-amber-500/5'
                                      : isSelectedForPayment
                                      ? 'border-indigo-500/70 bg-indigo-500/5'
                                      : 'border-gray-900 bg-gray-920 hover:border-gray-800'
                                  }`}
                                >
                                  <div>
                                    <div className="flex justify-between items-start">
                                      <h4 className="text-xs font-black text-white">{pl.name}</h4>
                                      {isCurrentActive ? (
                                        <span className="text-[8px] bg-emerald-450 text-black font-extrabold uppercase px-1.5 py-0.5 rounded">Activo</span>
                                      ) : isPendingReview ? (
                                        <span className="text-[8px] bg-amber-400 text-black font-extrabold uppercase px-1.5 py-0.5 rounded">En Revisión</span>
                                      ) : isSelectedForPayment ? (
                                        <span className="text-[8px] bg-indigo-500 text-white font-extrabold uppercase px-1.5 py-0.5 rounded">Seleccionado</span>
                                      ) : null}
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed font-semibold">{pl.desc}</p>
                                  </div>
                                  <div className="pt-2">
                                    <div className="text-lg font-mono font-extrabold text-white">${pl.price.toLocaleString()} <span className="text-[10px] text-gray-500 italic">COP/mes</span></div>
                                    <div className="text-[9px] text-indigo-400 font-bold mt-1 uppercase tracking-wider">{pl.limit} Productos Máx.</div>
                                    
                                    {isCurrentActive ? (
                                      <div className="w-full mt-3 h-8 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold text-[10px] rounded-xl flex items-center justify-center gap-1 uppercase tracking-wider">
                                        <Check className="w-3 h-3 stroke-[3]" /> Plan Actual
                                      </div>
                                    ) : isPendingReview ? (
                                      <div className="w-full mt-3 h-8 bg-amber-500/10 border border-amber-500/20 text-amber-300 font-extrabold text-[9.5px] rounded-xl flex items-center justify-center gap-1 uppercase tracking-wider">
                                        <Clock className="w-3 h-3 animate-pulse" /> En Revisión Admin
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedSubPlan(pl.id as any);
                                          const el = document.getElementById('report-payment-section');
                                          if (el) {
                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }
                                        }}
                                        className={`w-full mt-3 h-8 font-extrabold text-[10px] rounded-xl transition flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer ${
                                          isSelectedForPayment 
                                            ? 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-md shadow-indigo-500/20' 
                                            : 'bg-gray-900 hover:bg-gray-850 text-gray-300 border border-gray-800 hover:border-gray-700'
                                        }`}
                                      >
                                        <Zap className="w-3 h-3 text-amber-400" />
                                        {isSelectedForPayment ? 'Plan Seleccionado' : `Solicitar ${pl.name}`}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 2. BANK TRANSFER AND RECEIPT LOADER CARD */}
                        <div id="report-payment-section" className="bg-gray-950 border border-gray-900 p-6 rounded-3xl space-y-5 animate-fade-in scroll-mt-20">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-900 pb-3">
                            <div>
                              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block">Reportar Transferencia Bancaria Directa</span>
                              <p className="text-[11px] text-gray-500 font-medium">Adjunta el capture de tu pago para que el Administrador apruebe la activación de tu plan.</p>
                            </div>
                            <span className="text-xs font-black text-white px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl self-start">
                              Plan: {selectedSubPlan === 'medio' ? 'Plan Medio (12 prod.)' : selectedSubPlan === 'pro' ? 'Plan Avanzado (24 prod.)' : 'Plan Básico (5 prod.)'}
                            </span>
                          </div>

                          {/* Upgrade instruction banner */}
                          <div className="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-2xl flex items-start gap-3 text-xs text-indigo-200">
                            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <strong className="text-white font-bold block">
                                Requisito de Activación para {selectedSubPlan === 'medio' ? 'Plan Medio ($79.000 COP)' : selectedSubPlan === 'pro' ? 'Plan Avanzado ($99.000 COP)' : 'Plan Básico ($49.000 COP)'}:
                              </strong>
                              <p className="text-[11px] text-indigo-200/90 leading-relaxed font-normal">
                                Para pasar a un plan superior desde el Plan Básico, es necesario transferir el valor correspondiente a los canales autorizados y adjuntar el comprobante abajo. El cambio de plan y la ampliación de cupo <strong className="text-amber-300 underline underline-offset-2">se activarán automáticamente en cuanto el Administrador valide y apruebe tu comprobante</strong> en el sistema central.
                              </p>
                            </div>
                          </div>
                          
                          <div className="bg-gray-905 border border-gray-900 p-4.5 rounded-2xl grid sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5 text-xs text-gray-400">
                              <span className="text-[9px] font-bold uppercase text-gray-550 block">Canales de pago autorizados</span>
                              <div className="flex justify-between"><span>Plataforma / Banco:</span> <strong className="text-pink-400 font-extrabold">Nequi</strong></div>
                              <div className="flex justify-between"><span>Número Nequi:</span> <strong className="text-white font-mono text-sm">3219730865</strong></div>
                              <div className="flex justify-between"><span>Titular:</span> <strong className="text-white">Linnk.Pro SAS</strong></div>
                            </div>
                            <div className="text-xs text-gray-400 space-y-1.5 bg-gray-950 p-3.5 rounded-xl border border-gray-900">
                              <span className="text-[9px] font-bold uppercase text-gray-550 block">Monto Exacto a Transferir</span>
                              <div className="text-xl font-black text-emerald-400 font-mono">
                                ${(selectedSubPlan === 'medio' ? 79000 : selectedSubPlan === 'pro' ? 99000 : 49000).toLocaleString()} COP
                              </div>
                              <p className="text-[9px] text-gray-500 mt-1 leading-normal font-semibold">Transfiere el valor exacto desde tu app Nequi/Bancolombia y adjunta la captura a continuación.</p>
                            </div>
                          </div>

                          {/* Image photo upload receipt form */}
                          <div className="space-y-4">
                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-550 tracking-wider block mb-1.5">Comprobante de Pago (Captura obligatoria)</label>
                              
                              <div className="grid sm:grid-cols-12 gap-3.5 items-center">
                                <div className="sm:col-span-8">
                                  <div className="relative border-2 border-dashed border-gray-850 hover:border-indigo-500/50 rounded-2xl p-5 text-center transition bg-gray-900/40">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      id="checkout-proof-upload"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          if (file.size > 2 * 1024 * 1024) {
                                            alert("La imagen es un poco pesada. Elige una de menos de 2 MB.");
                                            return;
                                          }
                                          const rdr = new FileReader();
                                          rdr.onloadend = () => {
                                            setUploadedReceiptBase64(rdr.result as string);
                                          };
                                          rdr.readAsDataURL(file);
                                        }
                                      }}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="flex flex-col items-center justify-center gap-1 text-gray-450 hover:text-white transition">
                                      <Plus className="w-5 h-5 text-gray-500" />
                                      <span className="text-xs font-bold">Subir Recibo de Pago</span>
                                      <span className="text-[9px] text-gray-550">Soporta PNG, JPG, capturas de pantalla de Nequi/Banco</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="sm:col-span-4 flex justify-center">
                                  {uploadedReceiptBase64 ? (
                                    <div className="relative w-28 h-24 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-md">
                                      <img 
                                        src={uploadedReceiptBase64} 
                                        alt="Preview" 
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover" 
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setUploadedReceiptBase64('')}
                                        className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-black rounded-full text-red-400 transition"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="w-28 h-24 bg-gray-900 border border-gray-850 rounded-xl flex items-center justify-center text-[10px] text-gray-650 font-semibold text-center p-3 leading-normal border-dashed">
                                      Comprobante no cargado
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase text-gray-550 tracking-wider block mb-1">Comentario o notas adicionales (Opcional)</label>
                              <input
                                type="text"
                                value={receiptNotes}
                                onChange={(e) => setReceiptNotes(e.target.value)}
                                placeholder="Ej: Pago de Plan Medio realizado por Nequi desde número #312xxxx..."
                                className="w-full h-11 bg-gray-900 border border-gray-800 focus:border-indigo-500 px-3.5 rounded-xl text-xs font-semibold outline-none text-white placeholder:text-gray-700"
                              />
                            </div>

                            <button
                              type="button"
                              disabled={submittingProof || !uploadedReceiptBase64}
                              onClick={async () => {
                                if (!uploadedReceiptBase64) {
                                  alert("Por favor, selecciona y sube la captura de tu comprobante de pago primero.");
                                  return;
                                }
                                setSubmittingProof(true);
                                try {
                                  const paymentId = `pay_${Date.now()}`;
                                  const chosenPlan = selectedSubPlan;
                                  const amountToPay = chosenPlan === 'medio' ? 79000 : chosenPlan === 'pro' ? 99000 : 49000;
                                  const planDisplayName = chosenPlan === 'medio' ? 'Plan Medio' : chosenPlan === 'pro' ? 'Plan Avanzado' : 'Plan Básico';
                                  
                                  const payload: SubscriptionPayment = {
                                    id: paymentId,
                                    userId: profile.uid,
                                    userEmail: profile.email,
                                    username: profile.username,
                                    storeName: profile.displayName || profile.username,
                                    storeWhatsapp: profile.ownerWhatsapp || profile.whatsapp || profile.phone || '',
                                    storePhone: profile.phone || profile.ownerWhatsapp || profile.whatsapp || '',
                                    ownerWhatsapp: profile.ownerWhatsapp || profile.whatsapp || profile.phone || '',
                                    customerServiceWhatsapp: profile.customerServiceWhatsapp || '',
                                    plan: chosenPlan,
                                    amount: amountToPay,
                                    status: 'review',
                                    proofImage: uploadedReceiptBase64,
                                    notes: receiptNotes || `Comprobante de pago para solicitud de ${planDisplayName}.`,
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString(),
                                    periodLabel: `Suscripción Mensual (${planDisplayName}) - ${new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}`
                                  };

                                  await saveSubscriptionPayment(payload);

                                  // Update merchant profile status: Keep active plan intact until admin approval
                                  const updatedProfile: UserProfile = {
                                    ...profile,
                                    subscriptionPlan: profile.subscriptionPlan || 'basico',
                                    requestedPlan: chosenPlan,
                                    subscriptionStatus: 'under_review'
                                  };
                                  await saveProfile(updatedProfile);
                                  setProfile(updatedProfile);

                                  setReceiptNotes('');
                                  setUploadedReceiptBase64('');
                                  
                                  // Refresh local payment list
                                  const payments = await fetchMySubscriptionPayments(profile.uid);
                                  setMyPayments(payments);

                                  alert(`✅ ¡Comprobante de pago enviado con éxito!\n\nTu solicitud para el ${planDisplayName} ha sido registrada y está en cola de revisión.\n\n🔒 El cambio de plan y el nuevo cupo de productos se activarán automáticamente una vez que el Administrador verifique y apruebe tu pago.`);
                                } catch (e) {
                                  console.error(e);
                                  alert("Ocurrió un error al enviar el comprobante.");
                                } finally {
                                  setSubmittingProof(false);
                                }
                              }}
                              className={`w-full h-11 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition shadow-lg cursor-pointer ${
                                !uploadedReceiptBase64 
                                  ? 'bg-gray-900 border border-gray-850 text-gray-500 cursor-not-allowed' 
                                  : 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/10'
                              }`}
                            >
                              {submittingProof ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 stroke-[2.5]" />
                              )}
                              Enviar Comprobante de Pago para Aprobación
                            </button>
                          </div>
                        </div>

                        {/* 3. HISTORIC TRANSACTION LOGS */}
                        <div className="bg-gray-950 border border-gray-900 p-6 rounded-3xl space-y-4">
                          <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block">Historial de Pagos</span>
                          
                          {myPayments.length === 0 ? (
                            <div className="text-center py-6 text-gray-500 text-xs">
                              Aún no has registrado transacciones de pago.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead>
                                  <tr className="border-b border-gray-900 text-gray-550 font-bold uppercase text-[9px]">
                                    <th className="py-2.5">Periodo</th>
                                    <th className="py-2.5">Plan</th>
                                    <th className="py-2.5">Monto</th>
                                    <th className="py-2.5">Fecha</th>
                                    <th className="py-2.5 text-right">Estado</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-900">
                                  {myPayments.map((p) => (
                                    <tr key={p.id} className="text-gray-300">
                                      <td className="py-3 font-extrabold text-white text-[11px]">{p.periodLabel || 'Suscripción Mensual'}</td>
                                      <td className="py-3 uppercase text-[10px] font-black text-indigo-400">{p.plan}</td>
                                      <td className="py-3 font-mono font-bold text-white">${p.amount.toLocaleString()} COP</td>
                                      <td className="py-3 text-gray-550 text-[10px]">{new Date(p.createdAt).toLocaleDateString()}</td>
                                      <td className="py-3 text-right">
                                        <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded border ${
                                          p.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                          p.status === 'review' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                          p.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                          'bg-gray-500/10 text-gray-400'
                                        }`}>
                                          {p.status === 'approved' ? 'APROBADO' :
                                           p.status === 'review' ? 'REVISIÓN' :
                                           p.status === 'rejected' ? 'RECHAZADO' : 'PENDIENTE'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'bank' && (
                  <BankSettings profile={profile} onSave={handleSaveBankAccounts} />
                )}

              </motion.div>
            </AnimatePresence>
            </>
          )}
        </main>
      </div>

      {/* 6. ORDER DETAIL MODAL OVERLAY */}
      {viewingOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-gray-950 border border-gray-850 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col p-6 space-y-5">
            
            <div className="flex items-center justify-between border-b border-gray-900 pb-3">
              <div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Detalles del Pedido</span>
                <h4 className="text-sm font-extrabold text-white">Orden #{viewingOrder.orderNumber}</h4>
              </div>
              <button
                type="button"
                onClick={() => setViewingOrder(null)}
                className="text-gray-500 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Buyer specifics */}
            <div className="space-y-2 text-xs text-gray-400 bg-gray-900/40 p-4 rounded-xl border border-gray-900/80">
              <span className="text-[9px] font-bold uppercase text-indigo-450 tracking-wider block">Procedencia de compra</span>
              <div className="flex justify-between"><span className="text-gray-550">Comprador:</span> <strong className="text-white">{viewingOrder.customerName}</strong></div>
              <div className="flex justify-between"><span className="text-gray-550">Celular:</span> <span className="text-white font-mono">{viewingOrder.customerPhone}</span></div>
              {viewingOrder.customerEmail && (
                <div className="flex justify-between"><span className="text-gray-550">Email:</span> <span className="text-white">{viewingOrder.customerEmail}</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray-550">Dirección:</span> <span className="text-white">{viewingOrder.customerAddress}</span></div>
              {viewingOrder.notes && (
                <div className="pt-2 border-t border-gray-900/80 mt-1"><span className="text-gray-550 italic">Notas: {viewingOrder.notes}</span></div>
              )}
            </div>

            {/* Delivery Driver specifics */}
            {viewingOrder.deliveryDriverName ? (
              <div className="space-y-2 text-xs text-emerald-300 bg-emerald-950/30 p-4 rounded-xl border border-emerald-800/40">
                <div className="flex items-center justify-between border-b border-emerald-800/30 pb-2">
                  <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                    <Bike className="w-4 h-4 text-emerald-400" />
                    Domiciliario Asignado
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-extrabold uppercase border border-emerald-500/30">
                    {viewingOrder.deliveryStep === 'delivered' ? '✓ Entregado' :
                     viewingOrder.deliveryStep === 'picked_up' || viewingOrder.deliveryStep === 'to_client' ? '🛵 En camino' :
                     '🛵 Aceptado'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1"><span className="text-gray-400">Nombre:</span> <strong className="text-white font-extrabold">{viewingOrder.deliveryDriverName}</strong></div>
                {viewingOrder.deliveryDriverPhone && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Teléfono / WhatsApp:</span> 
                    <a 
                      href={`https://wa.me/${viewingOrder.deliveryDriverPhone.replace(/[^0-9]/g, '').startsWith('57') ? viewingOrder.deliveryDriverPhone.replace(/[^0-9]/g, '') : '57' + viewingOrder.deliveryDriverPhone.replace(/[^0-9]/g, '')}`} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-emerald-400 hover:underline font-mono font-bold flex items-center gap-1"
                    >
                      {viewingOrder.deliveryDriverPhone} 💬
                    </a>
                  </div>
                )}
                {viewingOrder.deliveryVehicle && (
                  <div className="flex justify-between items-center"><span className="text-gray-400">Vehículo:</span> <span className="text-white font-semibold">{viewingOrder.deliveryVehicle} {viewingOrder.deliveryVehiclePlate ? `(Placa: ${viewingOrder.deliveryVehiclePlate})` : ''}</span></div>
                )}
              </div>
            ) : checkIsPickupOrder(viewingOrder) ? (
              <div className="p-3 bg-emerald-950/30 rounded-xl border border-emerald-800/40 text-[11px] text-emerald-300 flex items-center gap-2">
                <span className="text-base">🛍️</span>
                <span className="font-semibold">Pedido para Recoger en Restaurante / Local (El cliente retira personalmente, sin costo de domicilio)</span>
              </div>
            ) : checkIsTableOrder(viewingOrder) ? (
              <div className="p-3 bg-amber-950/30 rounded-xl border border-amber-800/40 text-[11px] text-amber-300 flex items-center gap-2">
                <span className="text-base">🍽️</span>
                <span className="font-semibold">Pedido en Mesa (Atención en salón / restaurante)</span>
              </div>
            ) : (
              <div className="p-3 bg-gray-900/40 rounded-xl border border-gray-900 text-[11px] text-gray-500 flex items-center gap-2">
                <Bike className="w-4 h-4 text-gray-600 shrink-0" />
                <span>Domiciliario: Sin asignar aún (Esperando aceptación de un repartidor)</span>
              </div>
            )}

            {/* Optional proof image uploaded related to purchase/order */}
            {viewingOrder.proofImage && (
              <div className="space-y-2">
                <span className="text-[9px] font-bold uppercase text-indigo-450 tracking-wider block">Comprobante de Pago o Imagen Adjunta</span>
                <div className="bg-gray-900/40 p-3 rounded-xl border border-gray-900 flex flex-col items-center justify-center">
                  <img 
                    src={viewingOrder.proofImage} 
                    alt="Comprobante de compra" 
                    className="max-h-[140px] max-w-full rounded-lg object-contain border border-gray-800 cursor-zoom-in hover:scale-[1.02] transition-transform duration-200"
                    onClick={() => {
                      const w = window.open();
                      if (w && viewingOrder.proofImage) {
                        w.document.write(`<img src="${viewingOrder.proofImage}" style="max-width:100%; max-height:100%; margin:auto; display:block;" />`);
                      }
                    }} 
                    title="Clic para ampliar"
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      const w = window.open();
                      if (w && viewingOrder.proofImage) {
                        w.document.write(`<img src="${viewingOrder.proofImage}" style="max-width:100%; max-height:100%; margin:auto; display:block;" />`);
                      }
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold mt-2 hover:underline transition"
                  >
                    Abrir en pantalla completa
                  </button>
                </div>
              </div>
            )}

            {/* Product items inside cart */}
            <div className="space-y-2">
              <span className="text-[9px] font-bold uppercase text-emerald-450 tracking-wider block">Artículos en Carrito ({viewingOrder.items.length})</span>
              <div className="divide-y divide-gray-900 text-xs max-h-40 overflow-y-auto">
                {viewingOrder.items.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex justify-between items-center bg-transparent text-gray-350">
                    <div>
                      <div className="font-extrabold text-white">{item.name}</div>
                      {item.selectedVariant && (
                        <div className="text-[10px] text-indigo-400 font-bold">Variante: {item.selectedVariant}</div>
                      )}
                    </div>
                    <div className="font-mono text-right shrink-0">
                      {item.quantity} x {formatPrice(item.price)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Accumulator total */}
            <div className="flex items-center justify-between border-t border-gray-900 pt-3 text-sm font-extrabold text-white">
              <span>Monto Total a Recibir:</span>
              <span className="text-emerald-400 text-base">{formatPrice(viewingOrder.totalAmount)}</span>
            </div>

            {/* Order state changer controls inside modal */}
            <div className="pt-4 border-t border-gray-900 flex flex-col sm:flex-row gap-2">
              <div className="flex-grow flex items-center gap-1.5">
                <span className="text-[10.5px] font-bold text-gray-500 uppercase">Cambiar estado:</span>
                {checkIsTableOrder(viewingOrder) ? (
                  <select
                    value={viewingOrder.status === 'shipped' ? 'processing' : viewingOrder.status === 'cancelled' ? 'pending' : viewingOrder.status}
                    onChange={(e) => handleUpdateStatus(viewingOrder.id, e.target.value as OrderItem['status'])}
                    className="text-xs bg-amber-950/90 border border-amber-500/40 text-amber-300 rounded p-1.5 flex-grow font-extrabold focus:outline-none cursor-pointer"
                  >
                    <option value="pending" className="bg-gray-950 text-amber-400 font-bold">Pendiente</option>
                    <option value="processing" className="bg-gray-950 text-sky-400 font-bold">Procesando</option>
                    <option value="delivered" className="bg-gray-950 text-emerald-400 font-bold">Entregado</option>
                  </select>
                ) : (
                  <select
                    value={viewingOrder.status}
                    onChange={(e) => handleUpdateStatus(viewingOrder.id, e.target.value as OrderItem['status'])}
                    className="text-xs bg-gray-900 border border-gray-800 text-white rounded p-1.5 flex-grow font-semibold focus:outline-none"
                  >
                    <option value="pending">Pendiente</option>
                    <option value="processing">Procesando</option>
                    <option value="shipped">Enviado</option>
                    <option value="delivered">Entregado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                )}
              </div>

              <button
                type="button"
                onClick={() => triggerWhatsAppMessage(viewingOrder)}
                className="py-2 px-4 bg-emerald-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-emerald-300 transition shrink-0"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp Aviso
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 6.5 MANUAL CREATE ORDER MODAL OVERLAY */}
      {isAddingOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-gray-950 border border-gray-850 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-900 px-6 py-4">
              <div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Administración de Ventas</span>
                <h4 className="text-base font-extrabold text-white flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  Registrar Nuevo Pedido (Manual)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddingOrder(false);
                  setIsTableOrder(false);
                  setNewOrderTableNum('1');
                  setNewOrderCustName('');
                  setNewOrderCustPhone('');
                  setNewOrderCustEmail('');
                  setNewOrderCustAddress('');
                  setNewOrderPaymentMethod('whatsapp');
                  setNewOrderStatus('pending');
                  setNewOrderItems([]);
                  setNewOrderNotes('');
                  setNewOrderProofImage('');
                }}
                className="text-gray-500 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveManualOrder} className="flex-grow overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Left Column: Buyer Details or Table Selection */}
              <div className="space-y-4">

                {/* Mode Selector Toggle: Domicilio vs Mesa */}
                <div className="bg-gray-900/90 p-1.5 rounded-2xl border border-gray-850 flex items-center gap-1.5 shadow-inner">
                  <button
                    type="button"
                    onClick={() => {
                      setIsTableOrder(false);
                    }}
                    className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                      !isTableOrder
                        ? 'bg-emerald-500 text-gray-950 shadow-md scale-[1.02]'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Domicilio / Cliente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTableOrder(true);
                      if (!newOrderTableNum) setNewOrderTableNum('1');
                    }}
                    className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                      isTableOrder
                        ? 'bg-amber-500 text-gray-950 shadow-md scale-[1.02]'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
                    }`}
                  >
                    <Utensils className="w-3.5 h-3.5" />
                    Pedido en Mesa
                  </button>
                </div>

                {isTableOrder ? (
                  /* ---------------- PEDIDO EN MESA UI ---------------- */
                  <div className="space-y-4 bg-amber-950/20 border border-amber-500/25 p-4 rounded-2xl">
                    <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Utensils className="w-4 h-4 text-amber-400" />
                        Selección de Mesa (Servicio en Local)
                      </span>
                      <span className="text-[10px] text-amber-300/80 font-bold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        Atención Directa
                      </span>
                    </div>

                    {/* Quick Mesa Selection Grid */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block">
                        Selecciona el Número de Mesa *
                      </label>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setNewOrderTableNum(m)}
                            className={`py-2 px-1 text-xs font-black rounded-xl border transition text-center ${
                              newOrderTableNum === m
                                ? 'bg-amber-500 text-gray-950 border-amber-400 shadow-lg scale-105'
                                : 'bg-gray-900 text-gray-300 border-gray-800 hover:border-amber-500/50 hover:text-white'
                            }`}
                          >
                            Mesa {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Mesa text/number input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        O escribe el número / identificador de mesa o ubicación:
                      </label>
                      <input
                        type="text"
                        required
                        value={newOrderTableNum}
                        onChange={(e) => setNewOrderTableNum(e.target.value)}
                        placeholder="Ej. 1, 5, Barra 2, Terraza 3"
                        className="w-full bg-gray-900 border border-amber-500/40 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold focus:outline-none transition"
                      />
                    </div>

                    {/* Payment and initial status for Table order */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Método de Pago</label>
                        <select
                          value={newOrderPaymentMethod}
                          onChange={(e) => setNewOrderPaymentMethod(e.target.value as any)}
                          className="w-full bg-gray-900 border border-gray-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition font-bold"
                        >
                          <option value="cod">Efectivo en Mesa / Caja</option>
                          <option value="transfer">Transferencia Bancaria / Nequi</option>
                          <option value="delivery_cash">Pago al entregar en mesa</option>
                          <option value="whatsapp">Acordar por WhatsApp</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estado Inicial</label>
                        <select
                          value={newOrderStatus}
                          onChange={(e) => setNewOrderStatus(e.target.value as any)}
                          className="w-full bg-gray-900 border border-gray-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition font-bold"
                        >
                          <option value="pending">Pendiente ⏳</option>
                          <option value="processing">En Cocina / Preparando 📦</option>
                          <option value="delivered">Entregado en Mesa ✅</option>
                        </select>
                      </div>
                    </div>

                    {/* Table Order Kitchen Notes */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Notas / Instrucciones para Cocina</label>
                      <textarea
                        rows={2}
                        value={newOrderNotes}
                        onChange={(e) => setNewOrderNotes(e.target.value)}
                        placeholder="Ej. Sin cebolla, término medio, salsa aparte..."
                        className="w-full bg-gray-900 border border-gray-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  /* ---------------- PEDIDO ESTÁNDAR / DOMICILIO UI ---------------- */
                  <>
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block border-b border-gray-900 pb-1">
                      Datos del Cliente
                    </span>

                    {/* Name */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nombre Completo *</label>
                      <input
                        type="text"
                        required
                        value={newOrderCustName}
                        onChange={(e) => setNewOrderCustName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                      />
                    </div>

                    {/* Grid for Phone and Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Teléfono / WhatsApp *</label>
                        <input
                          type="tel"
                          required
                          value={newOrderCustPhone}
                          onChange={(e) => setNewOrderCustPhone(e.target.value)}
                          placeholder="Ej. +573001234567"
                          className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Email (Opcional)</label>
                        <input
                          type="email"
                          value={newOrderCustEmail}
                          onChange={(e) => setNewOrderCustEmail(e.target.value)}
                          placeholder="Ej. cliente@correo.com"
                          className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                        />
                      </div>
                    </div>

                    {/* Delivery/Store Address */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dirección de Entrega / Retiro *</label>
                      <input
                        type="text"
                        required
                        value={newOrderCustAddress}
                        onChange={(e) => setNewOrderCustAddress(e.target.value)}
                        placeholder="Ej. Calle 10 # 45-20, Medellín (o 'Retiro en local')"
                        className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                      />
                    </div>

                    {/* Grid for Payment Method and Order Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Método de Pago</label>
                        <select
                          value={newOrderPaymentMethod}
                          onChange={(e) => setNewOrderPaymentMethod(e.target.value as any)}
                          className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition font-bold"
                        >
                          <option value="whatsapp">Acordar por WhatsApp</option>
                          <option value="transfer">Transferencia Bancaria</option>
                          <option value="delivery_cash">Pago contra entrega (Efectivo)</option>
                          <option value="cod">Efectivo al retirar</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estado Inicial</label>
                        <select
                          value={newOrderStatus}
                          onChange={(e) => setNewOrderStatus(e.target.value as any)}
                          className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition font-bold"
                        >
                          <option value="pending">Pendiente ⏳</option>
                          <option value="processing">Procesando 📦</option>
                          <option value="shipped">Despachado 🚚</option>
                          <option value="delivered">Entregado ✅</option>
                          <option value="cancelled">Cancelado 🚫</option>
                        </select>
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Notas del Pedido</label>
                      <textarea
                        rows={2}
                        value={newOrderNotes}
                        onChange={(e) => setNewOrderNotes(e.target.value)}
                        placeholder="Instrucciones especiales de entrega, notas de embalaje, etc."
                        className="w-full bg-gray-900 border border-gray-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition resize-none"
                      />
                    </div>

                    {/* Upload proof image receipt */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Comprobante o Foto Adjunta (Opcional)</label>
                      <div className="flex items-center gap-4 bg-gray-900/40 p-3 rounded-xl border border-gray-900">
                        <div className="relative h-12 w-12 bg-gray-950 border border-gray-800 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                          {newOrderProofImage ? (
                            <img src={newOrderProofImage} alt="Comprobante" className="h-full w-full object-cover" />
                          ) : (
                            <Plus className="w-5 h-5 text-gray-500" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = async () => {
                                  try {
                                    const base64 = reader.result as string;
                                    const compressed = await compressImage(base64, 800, 800);
                                    setNewOrderProofImage(compressed);
                                  } catch (err) {
                                    console.error("Error compressing receipt:", err);
                                    alert("Error al procesar el comprobante.");
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                        </div>
                        <div className="flex-grow">
                          <span className="text-[11px] font-bold text-gray-300 block">Subir captura de pago</span>
                          <span className="text-[9.5px] text-gray-500 block">Arrastra o selecciona la imagen del recibo</span>
                        </div>
                        {newOrderProofImage && (
                          <button
                            type="button"
                            onClick={() => setNewOrderProofImage('')}
                            className="text-[10px] text-red-400 hover:text-red-300 font-bold transition"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}

              </div>

              {/* Right Column: Products Selector */}
              <div className="space-y-4 flex flex-col max-h-[500px]">
                <div className="flex items-center justify-between border-b border-gray-900 pb-1 shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block">
                    Selección de Productos
                  </span>
                  <span className="text-[9px] font-mono font-bold text-emerald-450 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    {newOrderItems.length} ítems agregados
                  </span>
                </div>

                {/* Compact Product List scroll container */}
                <div className="flex-grow overflow-y-auto space-y-2 pr-1 divide-y divide-gray-900">
                  {products.filter(p => p.active).length === 0 ? (
                    <div className="text-center py-12 text-gray-550 text-xs">
                      No tienes productos activos en tu catálogo. Crea uno primero.
                    </div>
                  ) : (
                    products.filter(p => p.active).map((prod) => {
                      // Get variants
                      const variants = prod.variantsText ? prod.variantsText.split(',').map(v => v.trim()).filter(Boolean) : [];
                      
                      // For each variant (or 'default' if no variants), we can render the selection row
                      if (variants.length > 0) {
                        return (
                          <div key={prod.id} className="pt-2.5 space-y-1.5">
                            <div className="flex items-center gap-2.5">
                              {prod.imageURL ? (
                                <img src={prod.imageURL} alt={prod.name} className="w-8 h-8 rounded-lg object-cover border border-gray-900" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-xs text-gray-500 font-bold">📦</div>
                              )}
                              <div className="flex-grow">
                                <h5 className="text-[11px] font-extrabold text-white leading-tight">{prod.name}</h5>
                                <span className="text-[10px] text-emerald-400 font-bold">{formatPrice(prod.price)}</span>
                              </div>
                            </div>

                            {/* List each variant as a selectable row item */}
                            <div className="bg-gray-900/20 border border-gray-900/50 rounded-lg p-1.5 space-y-1 pl-3.5">
                              {variants.map((v, vidx) => {
                                const currentItem = newOrderItems.find(item => item.productId === prod.id && item.selectedVariant === v);
                                const qty = currentItem ? currentItem.quantity : 0;

                                return (
                                  <div key={vidx} className="flex items-center justify-between text-[10.5px] py-1">
                                    <span className="text-gray-400 font-medium">Variante: <strong className="text-indigo-400">{v}</strong></span>
                                    
                                    {/* Quantities modifier */}
                                    <div className="flex items-center gap-2">
                                      {qty > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveOrderItem(prod.id, v)}
                                          className="w-5 h-5 bg-gray-900 hover:bg-gray-850 rounded flex items-center justify-center text-red-400 text-xs font-black transition cursor-pointer"
                                        >
                                          -
                                        </button>
                                      )}
                                      <span className={`w-5 text-center font-mono font-bold ${qty > 0 ? 'text-white' : 'text-gray-600'}`}>
                                        {qty}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleAddOrderItem(prod.id, v)}
                                        className="w-5 h-5 bg-gray-900 hover:bg-emerald-500/20 hover:text-emerald-400 rounded flex items-center justify-center text-gray-400 text-xs font-black transition cursor-pointer"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      } else {
                        // Standard product without variants
                        const currentItem = newOrderItems.find(item => item.productId === prod.id && !item.selectedVariant);
                        const qty = currentItem ? currentItem.quantity : 0;

                        return (
                          <div key={prod.id} className="py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              {prod.imageURL ? (
                                <img src={prod.imageURL} alt={prod.name} className="w-9 h-9 rounded-lg object-cover border border-gray-900" />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-xs text-gray-500 font-bold">📦</div>
                              )}
                              <div>
                                <h5 className="text-[11px] font-extrabold text-white leading-tight">{prod.name}</h5>
                                <span className="text-[10px] text-emerald-400 font-bold">{formatPrice(prod.price)}</span>
                              </div>
                            </div>

                            {/* Quantities modifier */}
                            <div className="flex items-center gap-2">
                              {qty > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOrderItem(prod.id)}
                                  className="w-5 h-5 bg-gray-900 hover:bg-gray-850 rounded flex items-center justify-center text-red-400 text-xs font-black transition cursor-pointer"
                                >
                                  -
                                </button>
                              )}
                              <span className={`w-5 text-center font-mono font-bold ${qty > 0 ? 'text-white' : 'text-gray-600'}`}>
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddOrderItem(prod.id)}
                                className="w-5 h-5 bg-gray-900 hover:bg-emerald-500/20 hover:text-emerald-400 rounded flex items-center justify-center text-gray-400 text-xs font-black transition cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      }
                    })
                  )}
                </div>

                {/* Selected summary */}
                <div className="bg-[#0b101c] p-4 rounded-2xl border border-gray-900 space-y-2 shrink-0">
                  <span className="text-[9.5px] font-black uppercase text-gray-500 tracking-wider block">Resumen del Pedido</span>
                  
                  {/* List of current items selected */}
                  <div className="max-h-24 overflow-y-auto space-y-1.5 text-xs text-gray-300 divide-y divide-gray-950/40 pr-1">
                    {newOrderItems.length === 0 ? (
                      <span className="text-[10.5px] text-gray-550 italic block py-2 text-center">Ningún producto seleccionado aún.</span>
                    ) : (
                      newOrderItems.map((item, index) => {
                        const prod = products.find(p => p.id === item.productId);
                        if (!prod) return null;
                        return (
                          <div key={index} className="flex justify-between items-center py-1.5 text-[11px]">
                            <div className="truncate pr-4">
                              <span className="font-extrabold text-white">{prod.name}</span>
                              {item.selectedVariant && (
                                <span className="text-[9.5px] text-indigo-400 font-bold ml-1.5 bg-indigo-500/5 px-1 py-0.5 rounded border border-indigo-500/10">
                                  {item.selectedVariant}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-gray-450 shrink-0">
                              {item.quantity} x {formatPrice(prod.price)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-950 pt-2.5 text-xs font-black text-white">
                    <span>Monto Total:</span>
                    <span className="text-emerald-400 text-sm font-mono">{formatPrice(calculateNewOrderTotal())}</span>
                  </div>
                </div>

              </div>

            </form>

            {/* Form actions Footer */}
            <div className="border-t border-gray-900 px-6 py-4 flex items-center justify-end gap-3 bg-[#0a0f1d] shrink-0">
              <button
                type="button"
                disabled={isSavingManualOrder}
                onClick={() => {
                  setIsAddingOrder(false);
                  setNewOrderCustName('');
                  setNewOrderCustPhone('');
                  setNewOrderCustEmail('');
                  setNewOrderCustAddress('');
                  setNewOrderPaymentMethod('whatsapp');
                  setNewOrderStatus('pending');
                  setNewOrderItems([]);
                  setNewOrderNotes('');
                  setNewOrderProofImage('');
                }}
                className="py-2.5 px-4 bg-gray-900 hover:bg-gray-850 text-gray-400 hover:text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={(e) => handleSaveManualOrder(e)}
                disabled={isSavingManualOrder || newOrderItems.length === 0}
                className="py-2.5 px-5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-900 disabled:text-gray-650 text-black font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                {isSavingManualOrder ? 'Guardando...' : 'Crear Pedido'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FLOATING SAVE BUTTON FOR MOBILE (STORE DESIGN TAB) */}
      {activeTab === 'design' && (
        <div className="md:hidden fixed bottom-[72px] left-3 right-3 z-40 bg-[#090b12]/95 backdrop-blur-xl border border-emerald-500/40 p-2.5 rounded-2xl shadow-[0_10px_25px_rgba(16,185,129,0.3)] flex items-center justify-between gap-3 animate-fade-in">
          <button
            type="submit"
            form="store-profile-form"
            className="w-full py-3 bg-gradient-to-r from-emerald-400 via-emerald-450 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
          >
            <Save className="w-4 h-4 stroke-[2.5]" /> Guardar Cambios de Tienda
          </button>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION MENU */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#090b12]/90 backdrop-blur-lg border-t border-[#232B3A] px-3 py-2 flex items-center gap-1.5 overflow-x-auto scroll-smooth no-scrollbar h-16 shadow-2xl">
        {/* Tab 1: Inicio */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('overview');
            setIsMobileMoreOpen(false);
          }}
          className={`flex flex-col items-center justify-center min-w-[72px] shrink-0 py-1 cursor-pointer transition-all duration-150 ${
            activeTab === 'overview' && !isMobileMoreOpen ? 'text-emerald-450 scale-105' : 'text-gray-400'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[9.5px] font-black uppercase tracking-wider whitespace-nowrap">Inicio</span>
        </button>

        {/* Tab 2: Productos */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('products');
            setIsMobileMoreOpen(false);
          }}
          className={`flex flex-col items-center justify-center min-w-[72px] shrink-0 py-1 cursor-pointer transition-all duration-150 ${
            activeTab === 'products' && !isMobileMoreOpen ? 'text-emerald-450 scale-105' : 'text-gray-400'
          }`}
        >
          <div className="relative">
            <Package className="w-5 h-5 mb-0.5" />
            <span className="absolute -top-1.5 -right-2 bg-gray-900 text-gray-400 border border-gray-800 text-[8px] font-bold px-1 rounded-full scale-90">
              {products.length}
            </span>
          </div>
          <span className="text-[9.5px] font-black uppercase tracking-wider whitespace-nowrap">Productos</span>
        </button>

        {/* Tab 3: Pedidos */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('orders');
            setIsMobileMoreOpen(false);
          }}
          className={`flex flex-col items-center justify-center min-w-[72px] shrink-0 py-1 cursor-pointer transition-all duration-150 ${
            activeTab === 'orders' && !isMobileMoreOpen ? 'text-emerald-450 scale-105' : 'text-gray-400'
          }`}
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5 mb-0.5" />
            {pendingOrdersCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-amber-500 text-black text-[8px] font-black px-1 rounded-full animate-pulse scale-90">
                {pendingOrdersCount}
              </span>
            )}
          </div>
          <span className="text-[9.5px] font-black uppercase tracking-wider whitespace-nowrap">Pedidos</span>
        </button>

        {/* Tab 4: Estadísticas */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('analytics');
            setIsMobileMoreOpen(false);
          }}
          className={`flex flex-col items-center justify-center min-w-[72px] shrink-0 py-1 cursor-pointer transition-all duration-150 ${
            activeTab === 'analytics' && !isMobileMoreOpen ? 'text-emerald-450 scale-105' : 'text-gray-400'
          }`}
        >
          <BarChart3 className="w-5 h-5 mb-0.5" />
          <span className="text-[9.5px] font-black uppercase tracking-wider whitespace-nowrap">Estadísticas</span>
        </button>

        {/* Tab 5: Más */}
        <button
          type="button"
          onClick={() => setIsMobileMoreOpen(!isMobileMoreOpen)}
          className={`flex flex-col items-center justify-center min-w-[72px] shrink-0 py-1 cursor-pointer transition-all duration-150 ${
            isMobileMoreOpen ? 'text-indigo-400 scale-105' : 'text-gray-400'
          }`}
        >
          <MoreHorizontal className="w-5 h-5 mb-0.5" />
          <span className="text-[9.5px] font-black uppercase tracking-wider whitespace-nowrap">Más</span>
        </button>
      </div>

      {/* MOBILE MORE OVERLAY DRAWER */}
      <AnimatePresence>
        {isMobileMoreOpen && (
          <>
            {/* Dark backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMoreOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
            />

            {/* Floating Menu Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="fixed bottom-20 left-4 right-4 bg-[#0a0f1d] border border-gray-900 rounded-2xl p-4 z-50 shadow-2xl space-y-1.5 md:hidden"
            >
              <div className="flex items-center justify-between px-2 pb-2 border-b border-gray-900">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 font-mono">Menu Vendedor</span>
                <button 
                  type="button" 
                  onClick={() => setIsMobileMoreOpen(false)}
                  className="p-1 hover:bg-gray-900 text-gray-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1 pt-1.5">
                {/* Diseñador de Tienda */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('design');
                    setIsMobileMoreOpen(false);
                  }}
                  className={`w-full py-3 px-3 rounded-xl text-left text-xs font-bold flex items-center gap-3 transition ${
                    activeTab === 'design' ? 'bg-emerald-450/10 text-emerald-400 border border-emerald-500/10' : 'text-gray-300 hover:bg-gray-900 border border-transparent'
                  }`}
                >
                  <Palette className="w-4 h-4 text-emerald-400" />
                  <span>Diseñador de Tienda</span>
                </button>

                {/* Suscripción y Pagos */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('subscription');
                    setIsMobileMoreOpen(false);
                  }}
                  className={`w-full py-3 px-3 rounded-xl text-left text-xs font-bold flex items-center gap-3 transition ${
                    activeTab === 'subscription' ? 'bg-emerald-450/10 text-emerald-400 border border-emerald-500/10' : 'text-gray-300 hover:bg-gray-900 border border-transparent'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  <span>Suscripción y Pagos</span>
                </button>

                {/* Datos Bancarios */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('bank');
                    setIsMobileMoreOpen(false);
                  }}
                  className={`w-full py-3 px-3 rounded-xl text-left text-xs font-bold flex items-center gap-3 transition ${
                    activeTab === 'bank' ? 'bg-emerald-450/10 text-emerald-400 border border-emerald-500/10' : 'text-gray-300 hover:bg-gray-900 border border-transparent'
                  }`}
                >
                  <Landmark className="w-4 h-4 text-emerald-400" />
                  <span>Datos Bancarios</span>
                </button>

                {/* Panel Administrador */}
                {isUserAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateAdmin();
                      setIsMobileMoreOpen(false);
                    }}
                    className="w-full py-3 px-3 rounded-xl text-left text-xs font-bold flex items-center gap-3 text-indigo-300 bg-indigo-500/5 border border-indigo-500/10 hover:bg-indigo-500/10 transition"
                  >
                    <Users className="w-4 h-4 text-indigo-300 animate-pulse" />
                    <span>Panel Administrador</span>
                  </button>
                )}

                <div className="h-[1px] bg-gray-900 my-1" />

                {/* Ver Mi Tienda */}
                <a
                  href={`/${profile.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-3 rounded-xl text-left text-xs font-bold flex items-center gap-3 text-gray-300 hover:bg-gray-900 transition"
                >
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span className="flex-grow">Ver Mi Tienda</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-65" />
                </a>

                {/* Copiar URL */}
                <button
                  type="button"
                  onClick={() => {
                    copyLinnkUrl();
                    setIsMobileMoreOpen(false);
                  }}
                  className="w-full py-3 px-3 rounded-xl text-left text-xs font-bold flex items-center gap-3 text-gray-300 hover:bg-gray-900 transition"
                >
                  <Copy className="w-4 h-4 text-indigo-400" />
                  <span>{copiedLink ? '¡Enlace Copiado!' : 'Copiar URL de Tienda'}</span>
                </button>

                {/* Refrescar Datos */}
                <button
                  type="button"
                  onClick={() => {
                    loadDashboardData();
                    setIsMobileMoreOpen(false);
                  }}
                  className="w-full py-3 px-3 rounded-xl text-left text-xs font-bold flex items-center gap-3 text-gray-300 hover:bg-gray-900 transition"
                >
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                  <span>Actualizar Panel</span>
                </button>

                <div className="h-[1px] bg-gray-900 my-1" />

                {/* Salir */}
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full py-3 px-3 rounded-xl text-left text-xs font-black flex items-center gap-3 text-red-400 hover:bg-red-950/20 transition"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Animated New Order Toast */}
      <AnimatePresence>
        {newOrderAlert && (
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-5 right-5 z-50 bg-gradient-to-r from-emerald-600 via-indigo-600 to-purple-600 text-white px-5 py-4 rounded-2xl shadow-2xl border border-emerald-400/40 flex items-center gap-3.5"
          >
            <div className="p-2 bg-white/10 rounded-xl animate-bounce">
              <Volume2 className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-black text-amber-300 tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>¡Nuevo Pedido en Tiempo Real!</span>
              </p>
              <p className="text-sm font-black text-white">{newOrderAlert}</p>
            </div>
            <button
              type="button"
              onClick={() => setNewOrderAlert(null)}
              className="ml-3 p-1 hover:bg-white/20 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4 text-gray-300" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Location Picker Modal */}
      <MapLocationPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        initialLat={profile.lat}
        initialLng={profile.lng}
        initialAddress={profile.address || profile.location || ''}
        onConfirm={(data) => {
          setProfile(p => ({
            ...p,
            address: data.address || p.address,
            location: data.address || p.location,
            lat: data.lat,
            lng: data.lng,
            mapUrl: data.mapUrl
          }));
        }}
      />

      {/* Floating Fixed IA Administrador Button (Bottom Left) */}
      <motion.button
        type="button"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsAdminVoiceAssistantOpen(true)}
        className="fixed bottom-20 left-4 md:bottom-6 md:left-6 z-40 w-11 h-11 bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-500 hover:from-indigo-500 hover:to-purple-400 text-white rounded-full font-black text-sm flex items-center justify-center shadow-xl shadow-indigo-900/60 border border-indigo-400/40 cursor-pointer backdrop-blur-md transition tracking-wider"
        title="Abrir IA Administrador"
      >
        IA
      </motion.button>

      {/* LinnkAdminVoiceAssistant Modal (Specialized AI for Store & Restaurant Managers) */}
      <LinnkAdminVoiceAssistant
        isOpen={isAdminVoiceAssistantOpen}
        onClose={() => setIsAdminVoiceAssistantOpen(false)}
        profile={profile}
        products={products}
        orders={orders}
        onNavigateTab={(tab) => setActiveTab(tab as any)}
      />

      {/* Store QR Modal with Ryyco Logo and Sharing functionality */}
      <StoreQRModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        username={profile.username}
        storeName={profile.displayName || profile.storeName}
        storeLogo={profile.photoURL}
      />

      {/* WhatsApp Required Modal (Mandatory condition before creating products) */}
      <AnimatePresence>
        {isWhatsAppRequiredModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-gray-950 border border-emerald-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-emerald-950/60 overflow-hidden"
            >
              {/* Background gradient decorative element */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-gray-900 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <MessageCircle className="w-5 h-5 fill-emerald-500/20" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-sm uppercase tracking-tight">
                      Configura los Números de WhatsApp
                    </h3>
                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                      Requisito para tu catálogo y gestión de cuenta
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWhatsAppRequiredModalOpen(false)}
                  className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-900 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-emerald-950/20 border border-emerald-500/20 p-3.5 rounded-2xl">
                  <p className="text-xs text-gray-300 leading-relaxed font-medium">
                    Para comenzar a vender y gestionar tu tienda, por favor ingresa el WhatsApp del propietario (obligatorio) y opcionalmente el de atención al cliente.
                  </p>
                </div>

                <form onSubmit={handleSaveQuickWhatsApp} className="space-y-4">
                  {/* 1. Owner WhatsApp */}
                  <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        WhatsApp del Propietario / Administrador
                      </label>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[8.5px] font-black uppercase rounded">
                        Obligatorio
                      </span>
                    </div>

                    <div className="flex rounded-xl overflow-hidden bg-gray-900 border border-gray-800 focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400/30">
                      <div className="bg-gray-950 text-emerald-400 px-3 py-2 flex items-center gap-1 text-xs font-black border-r border-gray-850 select-none">
                        <span>🇨🇴 +57</span>
                      </div>
                      <input
                        type="tel"
                        required
                        autoFocus
                        value={quickOwnerWhatsAppInput}
                        placeholder="Ej: 3106502043"
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.startsWith('57') && val.length >= 12) val = val.slice(2);
                          val = val.slice(0, 10);
                          setQuickOwnerWhatsAppInput(val);
                          if (quickWhatsAppError) setQuickWhatsAppError('');
                        }}
                        className="w-full h-10 bg-transparent px-3 text-xs font-bold outline-none text-white focus:ring-0 placeholder:text-gray-600"
                      />
                    </div>
                    <p className="text-[9.5px] text-gray-400">
                      Línea principal para control de pagos, seguridad y avisos administrativos.
                    </p>
                  </div>

                  {/* 2. Customer Service WhatsApp */}
                  <div className="p-3.5 bg-slate-900/60 border border-slate-700/60 rounded-2xl space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-black uppercase text-gray-300 tracking-wider flex items-center gap-1.5">
                        <Headphones className="w-3.5 h-3.5 text-gray-300" />
                        WhatsApp para Atención al Cliente
                      </label>
                      <span className="px-2 py-0.5 bg-gray-800 text-gray-400 text-[8.5px] font-black uppercase rounded">
                        Opcional
                      </span>
                    </div>

                    <div className="flex rounded-xl overflow-hidden bg-gray-900 border border-gray-800 focus-within:border-gray-500">
                      <div className="bg-gray-950 text-gray-400 px-3 py-2 flex items-center gap-1 text-xs font-black border-r border-gray-850 select-none">
                        <span>🇨🇴 +57</span>
                      </div>
                      <input
                        type="tel"
                        value={quickCustomerServiceWhatsAppInput}
                        placeholder="Ej: 3101234567 (Opcional)"
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.startsWith('57') && val.length >= 12) val = val.slice(2);
                          val = val.slice(0, 10);
                          setQuickCustomerServiceWhatsAppInput(val);
                        }}
                        className="w-full h-10 bg-transparent px-3 text-xs font-bold outline-none text-white focus:ring-0 placeholder:text-gray-600"
                      />
                    </div>
                    <p className="text-[9.5px] text-gray-400">
                      Línea donde tus clientes enviarán pedidos. Si lo dejas vacío, se usará el WhatsApp del propietario.
                    </p>
                  </div>

                  {quickWhatsAppError && (
                    <p className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
                      <span>⚠️</span>
                      <span>{quickWhatsAppError}</span>
                    </p>
                  )}

                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isSavingQuickWhatsApp || !quickOwnerWhatsAppInput.trim()}
                      className="w-full py-3 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isSavingQuickWhatsApp ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-black" />
                          <span>Guardando Números...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 text-black stroke-[3]" />
                          <span>Guardar y Continuar</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsWhatsAppRequiredModalOpen(false);
                        setActiveTab('design');
                      }}
                      className="w-full py-2 text-gray-400 hover:text-gray-200 text-xs font-bold transition text-center cursor-pointer"
                    >
                      Ir a Configuración Completa de Tienda
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7-Day Reverse Clock Trial Modal */}
      <BasicPlanTrialModal
        isOpen={showBasicTrialModal}
        onClose={() => setShowBasicTrialModal(false)}
        profile={profile}
        onPaymentSubmitted={(payment) => {
          setMyPayments(prev => [payment, ...prev]);
          setProfile(prev => ({
            ...prev,
            subscriptionPlan: 'basico',
            requestedPlan: 'basico',
            subscriptionStatus: 'under_review'
          }));
        }}
        onGoToPayment={() => {
          setShowBasicTrialModal(false);
          setActiveTab('subscription');
          setSelectedSubPlan('basico');
          setTimeout(() => {
            const el = document.getElementById('report-payment-section');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 150);
        }}
      />

    </div>
  );
}
