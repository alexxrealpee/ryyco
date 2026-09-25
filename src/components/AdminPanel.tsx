/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  fetchAdminStats, 
  fetchAllSubscriptionPayments,
  db,
  auth,
  fetchAllOrders,
  subscribeToAllOrders,
  fetchAdminOrdersBatch,
  fetchAdminSubscriptionsBatch,
  fetchAllStoresMap,
  updateOrderStatus,
  deleteOrder,
  fetchSystemSettings,
  updateSystemSettings,
  addAdminEmail,
  removeAdminEmail,
  PRIMARY_ADMIN_EMAIL,
  checkIsAdminEmail,
  checkIsStoreClosed,
  getStoreOperatingScheduleInfo,
  getSubscriptionAnchorDay,
  calculateNextExpirationDate,
  getSubscriptionDaysRemaining,
  isSubscriptionExpiredOrSuspended
} from '../lib/firebase';
import AdminDriversManager from './AdminDriversManager';
import AdminReferralsManager from './AdminReferralsManager';
import AdminStoresManager from './AdminStoresManager';
import AdminSalesStats from './AdminSalesStats';
import AdminCustomersRanking from './AdminCustomersRanking';
import AdminWhatsAppDriversModal from './AdminWhatsAppDriversModal';
import AdminOrderTimesManager from './AdminOrderTimesManager';
import OrderTimeTimeline from './OrderTimeTimeline';
import { getActiveOrderElapsed, applyOrderTimeTransition } from '../lib/orderTimeTracking';
import { checkIsTableOrder, checkIsPickupOrder } from './Dashboard';
import { SubscriptionPayment, OrderItem, SystemSettings, UserProfile, WeeklySchedule, DaySchedule, DriverProfile } from '../types';
import { 
  subscribeToActiveDrivers, 
  notifyActiveDriversViaServer 
} from '../lib/whatsappDriverNotifications';
import { getPersonalWhatsAppUrl, openPersonalWhatsApp } from '../lib/whatsappUtils';
import { 
  Users, 
  Settings, 
  ShieldAlert, 
  Layers, 
  TrendingUp, 
  Lock, 
  Unlock, 
  Search, 
  ArrowLeft, 
  DollarSign, 
  AlertTriangle, 
  AlertCircle,
  RefreshCw, 
  Check, 
  X, 
  Eye, 
  Image as ImageIcon, 
  CreditCard, 
  Calendar, 
  History, 
  ShoppingBag, 
  Sparkles, 
  Store, 
  Download, 
  Bike, 
  Trash2, 
  FileText, 
  Phone, 
  Clock, 
  Timer,
  Share2, 
  Mail, 
  Plus, 
  Minus, 
  MinusCircle, 
  UserCheck, 
  ShieldCheck, 
  Headphones, 
  MessageCircle, 
  Bell, 
  Volume2, 
  VolumeX,
  Copy,
  BarChart3,
  Radio,
  Smartphone,
  Zap,
  CheckCircle2
} from 'lucide-react';
import {
  initializeFCM,
  requestAdminFCMPermission,
  triggerAdminOrderPush,
  getFCMStatus,
  playOrderAlertChime,
  speakOrderVoiceAlert,
  fetchSellerFCMTokens,
  deleteSellerFCMToken,
  sendAdminPushToSeller,
  connectFCMStream,
  SellerFCMTokenRecord,
  registerAdminFCMTokenWithServer,
  DEFAULT_FCM_VAPID_KEY
} from '../lib/fcmNotifications';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';

interface AdminPanelProps {
  onBack: () => void;
}

// Helpers to format and build WhatsApp links
const formatWhatsAppDisplay = (raw?: string | null) => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const cleanNumber = digits.startsWith('57') && digits.length >= 12 ? digits.slice(2) : digits;
  return cleanNumber;
};

const getWhatsAppUrl = (raw?: string | null) => {
  if (!raw) return '#';
  return getPersonalWhatsAppUrl(raw);
};

interface AdminUser {
  uid: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
  plan?: 'free' | 'pro' | 'business';
  subscriptionPlan?: 'basico' | 'medio' | 'pro';
  subscriptionStatus?: string;
  storeName?: string;
  whatsapp?: string;
  ownerWhatsapp?: string;
  customerServiceWhatsapp?: string;
  phone?: string;
  subscriptionPaidUntil?: string;
  subscriptionAnchorDay?: number;
  createdAt?: string;
  suspended?: boolean;
  isClosed?: boolean;
  openTime?: string;
  closeTime?: string;
  scheduleEnabled?: boolean;
  weeklySchedule?: WeeklySchedule;
  restaurantDaysOpen?: string[];
}

// Generates persuasive, professional WhatsApp messages to collect payment for expired/due subscriptions
export function generateSubscriptionCobroMessageByType(
  user: AdminUser, 
  templateType: 'standard' | 'urgent' | 'promo' | 'trial' = 'standard'
): string {
  const storeName = user.storeName || user.username || 'Tu tienda';
  const username = user.username ? `@${user.username}` : '';
  const planName = user.subscriptionPlan === 'pro' 
    ? 'Plan Avanzado / Pro' 
    : user.subscriptionPlan === 'medio' 
    ? 'Plan Medio' 
    : 'Plan Básico';
  const planPrice = user.subscriptionPlan === 'pro' ? 99000 : user.subscriptionPlan === 'medio' ? 79000 : 49000;
  const planPriceFormatted = `$${planPrice.toLocaleString('es-CO')} COP`;
  const anchorDay = getSubscriptionAnchorDay(user);
  const { effectiveStatus } = isSubscriptionExpiredOrSuspended(user);

  if (templateType === 'urgent') {
    return (
      `⚠️ *AVISO URGENTE DE COBRO - RYYCO.com* ⚠️\n\n` +
      `Hola *${storeName}* ${username ? `(${username})` : ''}, te saludamos de la administración de *RYYCO.com* 🍔🛵\n\n` +
      `Te informamos que la mensualidad de tu tienda se encuentra actualmente *EXPIRADA / VENCIDA* y tu catálogo ha sido pausado temporalmente para los clientes 🛑.\n\n` +
      `¡No detengas tus ventas! Con solo renovar tu plan activo tu tienda volverá a recibir pedidos al instante.\n\n` +
      `📋 *Datos de Renovación:*\n` +
      `• Tienda: *${storeName}*\n` +
      `• Plan: *${planName}*\n` +
      `• Monto a pagar: *${planPriceFormatted}*\n` +
      `• Día de corte: *Día ${anchorDay} de cada mes*\n\n` +
      `💳 *Medios de Pago Inmediatos:*\n` +
      `• *Nequi:* 3219730865\n` +
      `• *Bancolombia (Ahorros):* 3219730865\n` +
      `• *A nombre de:* RYYCO Administración\n\n` +
      `Envíanos la foto o captura del comprobante por este chat y reactivaremos tu catálogo en https://ryyco.com/ en menos de 2 minutos 🚀`
    );
  }

  if (templateType === 'promo') {
    return (
      `¡Hola equipo de *${storeName}*! 🌟\n\n` +
      `Te saludamos de *RYYCO.com*. Valoramos mucho tu presencia en nuestra plataforma y queremos que sigas vendiendo sin interrupciones 🍕🥗\n\n` +
      `Notamos que tu suscripción mensual venció (*${planName}* - *${planPriceFormatted}*). Tus clientes te buscan y queremos ayudarte a seguir facturando.\n\n` +
      `💳 *Revalida tu plan transfiriendo a:*\n` +
      `• *Nequi / Bancolombia:* 3219730865\n` +
      `• *Valor:* *${planPriceFormatted}*\n` +
      `• *A nombre de:* RYYCO Administración\n\n` +
      `📲 Envíanos tu soporte de pago por este WhatsApp y reactivaremos tu tienda de inmediato en https://ryyco.com/ ✨ ¡Quedamos muy atentos!`
    );
  }

  if (templateType === 'trial') {
    return (
      `¡Hola equipo de *${storeName}*! 🎉\n\n` +
      `Esperamos que hayan tenido una gran experiencia en sus 7 días de prueba gratuita en *RYYCO.com* 🍔.\n\n` +
      `Tu período de prueba ha culminado con éxito. Para mantener tus productos visibles, seguir recibiendo pedidos de clientes y disfrutando de todas las herramientas de la plataforma, por favor realiza el pago de tu primera mensualidad:\n\n` +
      `📋 *Detalles del Plan:*\n` +
      `• Plan: *${planName}*\n` +
      `• Valor: *${planPriceFormatted} / mes*\n` +
      `• Día de corte mensual: *Día ${anchorDay} de cada mes*\n\n` +
      `💳 *Cuentas Oficiales de Pago:*\n` +
      `• *Nequi:* 3219730865\n` +
      `• *Bancolombia (Ahorros):* 3219730865\n` +
      `• *A nombre de:* RYYCO Administración\n\n` +
      `Envíanos tu comprobante por este chat para dejar tu cuenta 100% activa en https://ryyco.com/ 🚀`
    );
  }

  // Standard template
  let statusBadge = '🔴 EXPIRADA / VENCIDA';
  let statusExplanation = 'Te informamos que la suscripción de tu tienda en la plataforma se encuentra actualmente *EXPIRADA / VENCIDA* ⚠️.\n\nAl estar vencida, tu catálogo y productos se ocultan para los clientes y tus pedidos no pueden procesarse con normalidad.';

  if (effectiveStatus === 'suspended') {
    statusBadge = '⚠️ SUSPENDIDA';
    statusExplanation = 'Te informamos que tu tienda se encuentra *SUSPENDIDA TEMPORALMENTE* por pago pendiente de mensualidad ⚠️.';
  } else if (effectiveStatus === 'trial') {
    statusBadge = '🆓 PERÍODO DE PRUEBA FINALIZADO';
    statusExplanation = 'Tu semana de prueba gratuita de 7 días ha concluido con éxito. Para que tus productos continúen visibles y actives tu tienda en RYYCO, requerimos la confirmación de pago de tu mensualidad.';
  } else if (effectiveStatus === 'pending_payment') {
    statusBadge = '🟡 PENDIENTE DE PAGO';
    statusExplanation = 'Te recordamos que tenemos pendiente la validación del pago mensual de tu suscripción en la plataforma.';
  } else if (effectiveStatus === 'active') {
    statusBadge = '🟢 RECORDATORIO DE CORTE';
    statusExplanation = `Te saludamos cordialmente para compartirte los datos de renovación de tu suscripción mensual (Día de corte: ${anchorDay}).`;
  }

  return (
    `¡Hola estimado equipo de *${storeName}*! 👋\n\n` +
    `Te saludamos desde la administración de *RYYCO.com* 🍔🍕\n\n` +
    `🔔 *Estado de tu cuenta:* ${statusBadge}\n\n` +
    `${statusExplanation}\n\n` +
    `📋 *Detalles de tu Plan:*\n` +
    `• Tienda: *${storeName}* ${username ? `(${username})` : ''}\n` +
    `• Plan: *${planName}*\n` +
    `• Valor a pagar: *${planPriceFormatted} / mes*\n` +
    `• Día de corte mensual: *Día ${anchorDay} de cada mes*\n\n` +
    `💳 *Medios de Pago para Reactivación Inmediata:*\n` +
    `• *Nequi:* 3219730865\n` +
    `• *Bancolombia (Ahorros):* 3219730865\n` +
    `• *A nombre de:* RYYCO Administración\n\n` +
    `📲 *¿Cómo reactivar tu tienda?*\n` +
    `1. Realiza tu transferencia por *${planPriceFormatted}*.\n` +
    `2. Envíanos la captura o foto del comprobante respondiendo a este chat.\n` +
    `3. Nuestro equipo reactivará tu catálogo y visibilidad al instante en https://ryyco.com/ 🚀\n\n` +
    `¡Muchas gracias por ser parte de RYYCO y quedamos atentos a tu comprobante! 🙏`
  );
}

const buildSubscriptionCobroMessage = (user: AdminUser, templateType: 'standard' | 'urgent' | 'promo' | 'trial' = 'standard'): string => {
  return generateSubscriptionCobroMessageByType(user, templateType);
};

const getSubscriptionCobroWhatsAppUrl = (user: AdminUser, templateType: 'standard' | 'urgent' | 'promo' | 'trial' = 'standard', customPhone?: string, customMessage?: string) => {
  const rawPhone = customPhone || user.ownerWhatsapp || user.whatsapp || user.phone;
  if (!rawPhone) return '#';
  const message = customMessage || buildSubscriptionCobroMessage(user, templateType);
  return getPersonalWhatsAppUrl(rawPhone, message);
};

const getInitialAdminTab = (): 'users' | 'payments' | 'subscriptions' | 'orders' | 'drivers' | 'sales_stats' | 'top_customers' | 'referrals' | 'general' | 'stores' | 'order_times' => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const queryTab = urlParams.get('tab')?.toLowerCase();
    const validTabs: Array<'users' | 'payments' | 'subscriptions' | 'orders' | 'drivers' | 'sales_stats' | 'top_customers' | 'referrals' | 'general' | 'stores' | 'order_times'> = [
      'users', 'payments', 'subscriptions', 'orders', 'drivers', 'sales_stats', 'top_customers', 'referrals', 'general', 'stores', 'order_times'
    ];
    if (queryTab === 'tiendas') return 'stores';
    if (queryTab === 'tiempos' || queryTab === 'tiempos_pedidos' || queryTab === 'tiempos-pedidos' || queryTab === 'order_times' || queryTab === 'times') return 'order_times';
    if (queryTab === 'ventas' || queryTab === 'estadisticas' || queryTab === 'stats' || queryTab === 'sales' || queryTab === 'sales_stats') return 'sales_stats';
    if (queryTab === 'clientes' || queryTab === 'customers' || queryTab === 'top_customers' || queryTab === 'whatsapp' || queryTab === 'clientes_whatsapp') return 'top_customers';
    if (queryTab && validTabs.includes(queryTab as any)) {
      return queryTab as any;
    }
    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    if (hash.startsWith('admin/')) {
      const hashTab = hash.split('/')[1];
      if (hashTab === 'tiendas') return 'stores';
      if (hashTab === 'tiempos' || hashTab === 'tiempos_pedidos' || hashTab === 'tiempos-pedidos' || hashTab === 'order_times' || hashTab === 'times') return 'order_times';
      if (hashTab === 'ventas' || hashTab === 'estadisticas' || hashTab === 'stats' || hashTab === 'sales' || hashTab === 'sales_stats') return 'sales_stats';
      if (hashTab === 'clientes' || hashTab === 'customers' || hashTab === 'top_customers' || hashTab === 'whatsapp' || hashTab === 'clientes_whatsapp') return 'top_customers';
      if (hashTab && validTabs.includes(hashTab as any)) {
        return hashTab as any;
      }
    }
    const storedTab = localStorage.getItem('ryyco_admin_active_tab');
    if (storedTab === 'tiendas') return 'stores';
    if (storedTab === 'tiempos' || storedTab === 'tiempos_pedidos' || storedTab === 'tiempos-pedidos' || storedTab === 'order_times' || storedTab === 'times') return 'order_times';
    if (storedTab === 'ventas' || storedTab === 'estadisticas' || storedTab === 'stats' || storedTab === 'sales' || storedTab === 'sales_stats') return 'sales_stats';
    if (storedTab === 'clientes' || storedTab === 'customers' || storedTab === 'top_customers' || storedTab === 'whatsapp' || storedTab === 'clientes_whatsapp') return 'top_customers';
    if (storedTab && validTabs.includes(storedTab as any)) {
      return storedTab as any;
    }
  } catch (e) {}
  return 'subscriptions';
};

export default function AdminPanel({ onBack }: AdminPanelProps) {
  const [stats, setStats] = useState({
    totalUsers: 29,
    totalProfiles: 8,
    activePaidStores: 8,
    activeStoresCount: 8,
    expiredStoresCount: 4,
    totalActiveAndExpired: 12,
    subscribersPro: 5,
    subscribersBusiness: 3,
    monthlyRevenue: 637000,
    activeRevenue: 637000,
    expectedRevenue: 833000,
    pendingRecovery: 196000
  });
  
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [notif, setNotif] = useState('');
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'payments' | 'subscriptions' | 'orders' | 'drivers' | 'sales_stats' | 'top_customers' | 'referrals' | 'general' | 'stores' | 'order_times'>(getInitialAdminTab());
  const [allPayments, setAllPayments] = useState<SubscriptionPayment[]>([]);
  const [allOrders, setAllOrders] = useState<OrderItem[]>([]);
  const [viewingProofImg, setViewingProofImg] = useState<string | null>(null);

  // Live timer tick for active order elapsed time calculation without page reload (every 15s)
  const [nowMs, setNowMs] = useState<number>(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Tab switching with instant URL query and storage synchronization
  const handleSwitchTab = (tab: 'users' | 'payments' | 'subscriptions' | 'orders' | 'drivers' | 'sales_stats' | 'top_customers' | 'referrals' | 'general' | 'stores' | 'order_times') => {
    setActiveAdminTab(tab);
    try {
      localStorage.setItem('ryyco_admin_active_tab', tab);
      const url = new URL(window.location.href);
      url.pathname = '/admin';
      url.searchParams.set('tab', tab);
      window.history.replaceState(null, '', url.pathname + url.search);
    } catch (e) {}
  };

  // Ensure URL reflection on initial component mount
  useEffect(() => {
    try {
      const currentTab = getInitialAdminTab();
      localStorage.setItem('ryyco_admin_active_tab', currentTab);
      const url = new URL(window.location.href);
      url.pathname = '/admin';
      url.searchParams.set('tab', currentTab);
      window.history.replaceState(null, '', url.pathname + url.search);
    } catch (e) {}
  }, []);

  // Comprehensive Store Profiles Directory for accurate Store Name resolution
  const [storesMap, setStoresMap] = useState<Record<string, UserProfile>>({});
  const [allStoresList, setAllStoresList] = useState<{ uid: string; name: string; username: string; phone?: string; address?: string }[]>([]);

  // System Settings State
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    defaultDeliveryFee: 7000,
    supportPhone: '3219730865',
    supportEmail: 'soporte@ryyco.com',
    adminEmails: [PRIMARY_ADMIN_EMAIL]
  });
  const [deliveryFeeInput, setDeliveryFeeInput] = useState<string>('7000');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [newAdminEmailInput, setNewAdminEmailInput] = useState<string>('');
  const [addingAdminEmail, setAddingAdminEmail] = useState<boolean>(false);
  const [removingAdminEmail, setRemovingAdminEmail] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Filter by subscription status for historical payments & subscriptions ledger
  const [selectedSubscriptionStatusFilter, setSelectedSubscriptionStatusFilter] = useState<string>('all');
  // Order specific filters and lazy loading / progressive pagination state
  const [selectedOrderStoreFilter, setSelectedOrderStoreFilter] = useState<string>('all');
  const [selectedOrderStatusFilter, setSelectedOrderStatusFilter] = useState<string>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [viewingOrder, setViewingOrder] = useState<OrderItem | null>(null);

  // Orders progressive display pagination state
  const [visibleOrdersCount, setVisibleOrdersCount] = useState<number>(20);
  const ordersSentinelRef = useRef<HTMLDivElement | null>(null);

  // Real-time Pending Orders Count - strictly pending/new orders without an assigned driver
  const pendingOrdersCount = useMemo(() => {
    return allOrders.filter(o => {
      const hasDriver = Boolean(o.deliveryDriverId && o.deliveryDriverId.trim() !== '') ||
                        Boolean(o.driverId && o.driverId.trim() !== '') ||
                        Boolean(o.deliveryStep);
      const isPickedUp = o.deliveryStep === 'picked_up' || o.deliveryStep === 'to_client' || o.deliveryStep === 'at_destination';
      return o.status === 'pending' && !hasDriver && !isPickedUp;
    }).length;
  }, [allOrders]);

  // Push Notification & Sound Alert States (FCM Powered)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [newIncomingOrderAlert, setNewIncomingOrderAlert] = useState<{
    id: string;
    orderNumber?: number;
    customerName: string;
    storeName: string;
    totalAmount: number;
    orderObj?: OrderItem;
  } | null>(null);

  // Active delivery drivers state for real-time WhatsApp order dispatch
  const [activeDrivers, setActiveDrivers] = useState<DriverProfile[]>([]);
  const [allApprovedDrivers, setAllApprovedDrivers] = useState<DriverProfile[]>([]);
  const [whatsAppDispatchOrder, setWhatsAppDispatchOrder] = useState<OrderItem | null>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isFCMReady, setIsFCMReady] = useState<boolean>(false);
  const [isRequestingFCM, setIsRequestingFCM] = useState<boolean>(false);
  const [showFCMDetails, setShowFCMDetails] = useState<boolean>(false);
  const [sellerTokens, setSellerTokens] = useState<SellerFCMTokenRecord[]>([]);
  const [isLoadingSellerTokens, setIsLoadingSellerTokens] = useState(false);
  const [fcmActiveTab, setFcmActiveTab] = useState<'admin' | 'sellers'>('admin');
  const [selectedSellerForPush, setSelectedSellerForPush] = useState<string>('all');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  // Fetch registered seller FCM devices from Firestore
  const loadSellerTokens = async () => {
    setIsLoadingSellerTokens(true);
    try {
      const tokens = await fetchSellerFCMTokens();
      setSellerTokens(tokens);
    } catch (e) {
      console.warn("Error cargando tokens de vendedores:", e);
    } finally {
      setIsLoadingSellerTokens(false);
    }
  };

  const handleSendPushToSeller = async (sellerUid: string, storeName?: string) => {
    const defaultMsg = `Hola ${storeName || 'Vendedor'}, tienes una nueva actualización de pedidos en RYYCO.`;
    const res = await sendAdminPushToSeller({
      storeOwnerId: sellerUid,
      storeName: storeName || 'Tienda',
      title: `🔔 RYYCO - Notificación a ${storeName || 'Vendedor'}`,
      message: defaultMsg
    });
    if (res.success) {
      setNotif(`✅ Alerta Push transmitida exitosamente a "${storeName || 'Vendedor'}"`);
    } else {
      setNotif(`⚠️ ${res.error || 'No se pudo enviar la alerta'}`);
    }
    setTimeout(() => setNotif(''), 5000);
  };

  const handleBroadcastToSellers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    setIsSendingBroadcast(true);
    try {
      const res = await sendAdminPushToSeller({
        storeOwnerId: selectedSellerForPush,
        storeName: selectedSellerForPush === 'all' ? 'Todos los Vendedores' : (sellerTokens.find(s => s.sellerUid === selectedSellerForPush)?.storeName || 'Vendedor'),
        title: broadcastTitle.trim() || '📢 Comunicado RYYCO a Vendedores',
        message: broadcastMessage.trim()
      });
      if (res.success) {
        setNotif(`✅ Notificación transmitida a vendedores (${selectedSellerForPush === 'all' ? 'Todos' : 'Seleccionado'})`);
        setBroadcastTitle('');
        setBroadcastMessage('');
      } else {
        setNotif(`⚠️ ${res.error || 'Error al transmitir la notificación'}`);
      }
    } catch (err: any) {
      setNotif("❌ Error al enviar transmisión.");
    } finally {
      setIsSendingBroadcast(false);
      setTimeout(() => setNotif(''), 5000);
    }
  };

  const handleDeleteSellerToken = async (tokenId: string) => {
    if (!confirm('¿Eliminar el registro de este token de vendedor?')) return;
    const ok = await deleteSellerFCMToken(tokenId);
    if (ok) {
      setSellerTokens(prev => prev.filter(t => t.id !== tokenId));
      setNotif("🗑️ Registro de token eliminado");
      setTimeout(() => setNotif(''), 3000);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const supported = await initializeFCM();
        if (isMounted) {
          setIsFCMReady(supported);
          const status = getFCMStatus();
          setPushPermission(status.permission);
          if (status.hasToken) {
            const token = localStorage.getItem('ryyco_admin_fcm_token');
            setFcmToken(token);
            if (token) {
              const currentAdmin = auth.currentUser;
              registerAdminFCMTokenWithServer(token, {
                uid: currentAdmin?.uid || 'admin_user',
                email: currentAdmin?.email || PRIMARY_ADMIN_EMAIL,
                name: currentAdmin?.displayName || 'Administración General RYYCO'
              }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn("FCM init error in AdminPanel:", err);
      }
    })();

    loadSellerTokens();

    // Listen to custom event for foreground FCM orders
    const handleFgOrder = (e: any) => {
      const { payload } = e.detail || {};
      if (payload) {
        const orderStatus = payload.data?.status;
        if (orderStatus && orderStatus !== 'pending') return;
        setNotif(`🚨 ¡Nuevo Pedido FCM detectado! #${payload.data?.orderNumber || ''}`);
        setTimeout(() => setNotif(''), 6000);
      }
    };
    window.addEventListener('ryyco:new-admin-order', handleFgOrder);

    // Connect to real-time SSE stream for Admin
    const cleanupSSE = connectFCMStream('admin', undefined, (data) => {
      if (data.type === 'ADMIN_ORDER_PUSH') {
        if (data.status && data.status !== 'pending') return;
        setNotif(`🚨 ¡Nuevo Pedido #${data.orderNumber || ''} en "${data.storeName || 'Tienda'}"!`);
        setTimeout(() => setNotif(''), 6000);
      }
    });

    return () => {
      isMounted = false;
      window.removeEventListener('ryyco:new-admin-order', handleFgOrder);
      cleanupSSE();
    };
  }, []);

  // Sound, voice synthesis, and vibration player for new incoming order
  const playOrderAlertSound = () => {
    // 1. Mobile Vibration (distinct attention pattern: buzz - pause - buzz - pause - long buzz)
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([350, 150, 350, 150, 500]);
      }
    } catch (e) {}

    // 2. High-clarity Web Audio 3-tone chime (E5 -> A5 -> C#6 bell sequence)
    playOrderAlertChime();

    // 3. Spoken voice announcement
    speakOrderVoiceAlert('¡Atención! Nuevo pedido recibido en administración general');
  };

  // Request push notification permission and register device FCM token
  const requestPushPermission = async () => {
    setIsRequestingFCM(true);
    try {
      const currentAdmin = auth.currentUser;
      const res = await requestAdminFCMPermission({
        uid: currentAdmin?.uid || 'admin_user',
        email: currentAdmin?.email || PRIMARY_ADMIN_EMAIL,
        name: currentAdmin?.displayName || 'Administración General RYYCO'
      });

      if (res.success) {
        setPushPermission('granted');
        setFcmToken(res.token || 'fcm_registered');
        setNotif("🔔 ¡Notificaciones PUSH FCM activadas y registradas para Administración General!");
        setTimeout(() => setNotif(''), 6000);
      } else {
        setNotif(`⚠️ ${res.error || 'No se pudo activar el servicio FCM'}`);
        setTimeout(() => setNotif(''), 5000);
      }
    } catch (err: any) {
      console.error("Error activando FCM:", err);
      setNotif("❌ Error al solicitar notificaciones FCM.");
      setTimeout(() => setNotif(''), 5000);
    } finally {
      setIsRequestingFCM(false);
    }
  };

  // Real-time listener for active delivery drivers across the platform
  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeToActiveDrivers((active, all) => {
        setActiveDrivers(active);
        setAllApprovedDrivers(all);
      });
    } catch (err) {
      console.warn("Error subscribing to active drivers:", err);
    }
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // References to volatile states so the orders listener never restarts unnecessarily
  const storesMapRef = useRef(storesMap);
  storesMapRef.current = storesMap;
  const allStoresListRef = useRef(allStoresList);
  allStoresListRef.current = allStoresList;
  const activeDriversRef = useRef(activeDrivers);
  activeDriversRef.current = activeDrivers;
  const systemSettingsRef = useRef(systemSettings);
  systemSettingsRef.current = systemSettings;

  // Fire sound, vibration and FCM push notification when a new order arrives from ANY restaurant
  const triggerNewOrderAlert = (order: OrderItem) => {
    // STRICT RULE: Only orders that are pending and unassigned trigger notifications!
    if (!order || order.status !== 'pending') {
      return;
    }

    const hasDriver = Boolean(order.deliveryDriverId && order.deliveryDriverId.trim() !== '') ||
                      Boolean(order.driverId && order.driverId.trim() !== '') ||
                      Boolean(order.deliveryStep);
    if (hasDriver) {
      return;
    }

    const currentStoresMap = storesMapRef.current;
    const currentAllStoresList = allStoresListRef.current;
    const currentActiveDrivers = activeDriversRef.current;
    const currentSystemSettings = systemSettingsRef.current;

    const store = currentStoresMap[order.storeOwnerId || ''] || currentAllStoresList.find(s => s.uid === order.storeOwnerId);
    const storeName = store?.name || order.storeName || 'Tienda en RYYCO';

    // Dispatch full FCM & Web Push notification with ServiceWorker, vibration, audio chime & backend broadcast
    triggerAdminOrderPush(order, storeName);

    // Notify backend and active delivery drivers via WhatsApp notification pipeline
    const isDeliveryOrder = order.orderType !== 'table' && order.orderType !== 'pickup' && !checkIsTableOrder(order) && !checkIsPickupOrder(order);
    if (isDeliveryOrder && currentActiveDrivers.length > 0) {
      notifyActiveDriversViaServer(order, currentActiveDrivers, storeName).catch(() => {});
    }

    setNewIncomingOrderAlert({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName || 'Cliente',
      storeName,
      totalAmount: order.totalAmount || 0,
      orderObj: order
    });

    // If auto-open is enabled in settings, open WhatsApp drivers dispatch modal right away
    if (currentSystemSettings?.autoNotifyActiveDriversWhatsApp && isDeliveryOrder) {
      setWhatsAppDispatchOrder(order);
    }
  };

  // Test push notification simulation with sound and vibration
  const handleTestFCMPush = () => {
    const testOrder: OrderItem = {
      id: 'test_order_' + Date.now(),
      orderNumber: 777,
      storeOwnerId: 'store_prueba',
      storeName: 'Restaurante Ejemplo RYYCO',
      customerName: 'Cliente Notificaciones Push',
      customerPhone: '3151234567',
      customerAddress: 'Calle 10 # 5-20, Centro',
      paymentMethod: 'delivery_cash',
      totalAmount: 36000,
      status: 'pending',
      items: [
        { productId: '1', name: 'Hamburguesa Especial Artesanal', price: 26000, quantity: 1 },
        { productId: '2', name: 'Papas Rústicas & Gaseosa', price: 10000, quantity: 1 }
      ],
      createdAt: new Date().toISOString()
    };
    triggerNewOrderAlert(testOrder);
    
    // Also trigger server broadcast endpoint to test backend SSE and FCM dispatch
    fetch('/api/fcm/test', { method: 'POST' }).catch(() => {});

    setNotif("📲 Notificación Push FCM de prueba emitida con sonido, voz y vibración");
    setTimeout(() => setNotif(''), 5000);
  };

  // Real-time listener across all store orders
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribeToAllOrders((updatedOrders, newIncoming) => {
        setAllOrders(updatedOrders);

        // Calculate strictly pending, unassigned orders across the entire platform
        const genuinelyPending = updatedOrders.filter(o => {
          const hasDriver = Boolean(o.deliveryDriverId && o.deliveryDriverId.trim() !== '') ||
                            Boolean(o.driverId && o.driverId.trim() !== '') ||
                            Boolean(o.deliveryStep);
          const isPickedUp = o.deliveryStep === 'picked_up' || o.deliveryStep === 'to_client' || o.deliveryStep === 'at_destination';
          return o.status === 'pending' && !hasDriver && !isPickedUp;
        });

        // 1. AUTO-CLEAR banner if there are NO pending orders anywhere in the system!
        if (genuinelyPending.length === 0) {
          setNewIncomingOrderAlert(null);
        } else {
          // If the banner was showing an order, make sure that order is still pending
          setNewIncomingOrderAlert(prev => {
            if (!prev) return null;
            const isStillPending = genuinelyPending.some(p => p.id === prev.id);
            return isStillPending ? prev : null;
          });
        }

        // 2. STRICT RULE: ONLY alert if there are incoming orders that are ACTUALLY PENDING!
        if (newIncoming && newIncoming.length > 0) {
          const pendingIncoming = newIncoming.filter(o => {
            const hasDriver = Boolean(o.deliveryDriverId && o.deliveryDriverId.trim() !== '') ||
                              Boolean(o.driverId && o.driverId.trim() !== '') ||
                              Boolean(o.deliveryStep);
            const isPickedUp = o.deliveryStep === 'picked_up' || o.deliveryStep === 'to_client' || o.deliveryStep === 'at_destination';
            return o.status === 'pending' && !hasDriver && !isPickedUp;
          });

          // NEVER notify if there are no pending orders!
          if (pendingIncoming.length > 0) {
            triggerNewOrderAlert(pendingIncoming[0]);
          }
        }
      });
    } catch (err) {
      console.warn("Error setting up real-time orders listener:", err);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Intelligent lazy loading state for subscriptions (7 items per batch)
  const [lastSubDoc, setLastSubDoc] = useState<any | null>(null);
  const [hasMoreSubs, setHasMoreSubs] = useState<boolean>(true);
  const [loadingMoreSubs, setLoadingMoreSubs] = useState<boolean>(false);
  const subsSentinelRef = useRef<HTMLDivElement | null>(null);

  const handleLoadMoreSubscriptions = async () => {
    if (loadingMoreSubs || !hasMoreSubs) return;
    setLoadingMoreSubs(true);
    try {
      const res = await fetchAdminSubscriptionsBatch(50, lastSubDoc, users.length);
      if (res.users.length > 0) {
        setUsers(prev => {
          const existingUids = new Set(prev.map(u => u.uid));
          const newUnique = (res.users as AdminUser[]).filter(u => !existingUids.has(u.uid));
          return [...prev, ...newUnique];
        });
        setLastSubDoc(res.lastDoc);
      }
      setHasMoreSubs(res.hasMore);
    } catch (err) {
      console.error("Error al cargar los siguientes registros de suscripciones:", err);
    } finally {
      setLoadingMoreSubs(false);
    }
  };

  const loadAdminData = async () => {
    setLoading(true);
    try {
      // 0. Load comprehensive store directory
      try {
        const stores = await fetchAllStoresMap();
        setStoresMap(stores);

        const storeMapUnique = new Map<string, { uid: string; name: string; username: string; phone?: string; address?: string }>();
        const seenUids = new Set<string>();
        const seenUsernames = new Set<string>();
        const seenEmails = new Set<string>();
        const seenPhones = new Set<string>();
        const seenNames = new Set<string>();

        const normalizePhone = (phone?: string): string => {
          if (!phone) return '';
          const d = phone.replace(/\D/g, '');
          return d.length >= 10 ? d.slice(-10) : (d.length >= 7 ? d : '');
        };

        const normalizeName = (name?: string): string => {
          if (!name) return '';
          return name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();
        };

        const GENERIC_NAMES = new Set(['tienda', 'mitienda', 'restaurante', 'mirestaurante', 'usuario', 'admin', 'store']);

        (Object.values(stores) as UserProfile[]).forEach((p: UserProfile) => {
          if (p) {
            const uid = (p.uid || (p as any).id || '').trim();
            const uname = (p.username || '').replace(/^@+/, '').trim().toLowerCase();
            const email = (p.email || '').trim().toLowerCase();
            const phone = normalizePhone(p.whatsapp || p.customerServiceWhatsapp || p.ownerWhatsapp || p.phone);
            const rawName = (p.displayName || p.storeName || '').trim();
            const normName = normalizeName(rawName);
            const isUsableName = normName.length >= 3 && !GENERIC_NAMES.has(normName);

            // Check if already registered under any alias
            const isDuplicate = 
              (uid && seenUids.has(uid)) ||
              (uname && seenUsernames.has(uname)) ||
              (uid && seenUsernames.has(uid)) ||
              (uname && seenUids.has(uname)) ||
              (email && email.includes('@') && seenEmails.has(email)) ||
              (phone && seenPhones.has(phone)) ||
              (isUsableName && seenNames.has(normName));

            if (isDuplicate) {
              return;
            }

            if (uid || uname || isUsableName) {
              const primaryKey = uid || (uname ? `store_${uname}` : `store_${normName}`);
              const sName = rawName || p.username || 'Tienda';
              storeMapUnique.set(primaryKey, {
                uid: primaryKey,
                name: sName,
                username: p.username || '',
                phone: p.whatsapp || p.customerServiceWhatsapp || p.ownerWhatsapp || p.phone || '',
                address: p.address || p.location || ''
              });

              if (uid) seenUids.add(uid);
              if (primaryKey) seenUids.add(primaryKey);
              if (uname) seenUsernames.add(uname);
              if (email && email.includes('@')) seenEmails.add(email);
              if (phone) seenPhones.add(phone);
              if (isUsableName) seenNames.add(normName);
            }
          }
        });
        setAllStoresList(Array.from(storeMapUnique.values()).sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error("Error al cargar directorio de tiendas:", err);
      }

      // 1. Load Stats
      const systemStats = await fetchAdminStats();
      setStats(systemStats);

      // 2. Load initial 50 subscription records (Lazy loading / Infinite scroll)
      try {
        const initialSubsBatch = await fetchAdminSubscriptionsBatch(50, null, 0);
        setUsers(initialSubsBatch.users as AdminUser[]);
        setLastSubDoc(initialSubsBatch.lastDoc);
        setHasMoreSubs(initialSubsBatch.hasMore);
      } catch (err) {
        console.error("Error al cargar lote inicial de suscripciones:", err);
      }

      // 3. Load subscription payments
      const fetchedPayments = await fetchAllSubscriptionPayments();
      setAllPayments(fetchedPayments);

      // 4. Load all orders from all stores (Global complete dataset for accurate metrics)
      try {
        const allFetchedOrders = await fetchAllOrders();
        setAllOrders(allFetchedOrders);
      } catch (err) {
        console.error("Error al cargar todos los pedidos en admin panel:", err);
      }

      // 5. Load system settings
      try {
        const settings = await fetchSystemSettings();
        setSystemSettings(settings);
        setDeliveryFeeInput((settings.defaultDeliveryFee || 7000).toString());
      } catch (err) {
        console.error("Error al cargar configuración del sistema:", err);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSaveSystemSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    const numFee = parseInt(deliveryFeeInput.replace(/[^0-9]/g, ''), 10) || 0;

    try {
      await updateSystemSettings({
        defaultDeliveryFee: numFee,
        supportPhone: systemSettings.supportPhone || '3219730865',
        supportEmail: systemSettings.supportEmail || 'soporte@ryyco.com',
        driversWhatsAppGroupUrl: systemSettings.driversWhatsAppGroupUrl || '',
        autoNotifyActiveDriversWhatsApp: Boolean(systemSettings.autoNotifyActiveDriversWhatsApp),
        whatsappDriverTemplate: systemSettings.whatsappDriverTemplate || ''
      });
      setSystemSettings(prev => ({ 
        ...prev, 
        defaultDeliveryFee: numFee,
        driversWhatsAppGroupUrl: prev.driversWhatsAppGroupUrl || '',
        autoNotifyActiveDriversWhatsApp: Boolean(prev.autoNotifyActiveDriversWhatsApp),
        whatsappDriverTemplate: prev.whatsappDriverTemplate || ''
      }));
      setNotif(`🟢 Configuración de sistema y WhatsApp de domiciliarios actualizada correctamente.`);
      setTimeout(() => setNotif(''), 5000);
    } catch (err) {
      console.error("Error guardando ajustes del sistema:", err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddAdminEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newAdminEmailInput.toLowerCase().trim();
    if (!clean || !clean.includes('@')) {
      setNotif("⚠️ Por favor ingresa un correo electrónico válido.");
      setTimeout(() => setNotif(''), 4000);
      return;
    }

    setAddingAdminEmail(true);
    try {
      const updatedList = await addAdminEmail(clean);
      setSystemSettings(prev => ({ ...prev, adminEmails: updatedList }));
      setNewAdminEmailInput('');
      setNotif(`👑 Correo ${clean} agregado exitosamente como administrador.`);
      setTimeout(() => setNotif(''), 5000);

      // Also update local users list if that user was already rendered
      setUsers(prev => prev.map(u => u.email.toLowerCase() === clean ? { ...u, role: 'admin' } : u));
    } catch (err) {
      console.error("Error al agregar administrador:", err);
      setNotif(`❌ Error: ${err instanceof Error ? err.message : 'No se pudo agregar el correo'}`);
      setTimeout(() => setNotif(''), 5000);
    } finally {
      setAddingAdminEmail(false);
    }
  };

  const handleRemoveAdminEmail = async (emailToRemove: string) => {
    const clean = emailToRemove.toLowerCase().trim();
    if (clean === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
      setNotif("⚠️ No se puede eliminar el administrador principal.");
      setTimeout(() => setNotif(''), 4000);
      return;
    }

    const confirmRemove = window.confirm(`¿Estás seguro de remover los permisos de administrador para ${clean}?`);
    if (!confirmRemove) return;

    setRemovingAdminEmail(clean);
    try {
      const updatedList = await removeAdminEmail(clean);
      setSystemSettings(prev => ({ ...prev, adminEmails: updatedList }));
      setNotif(`🗑️ Permisos de administrador revocados para ${clean}.`);
      setTimeout(() => setNotif(''), 4000);

      // Also update local users list if that user was rendered
      setUsers(prev => prev.map(u => u.email.toLowerCase() === clean ? { ...u, role: 'user' } : u));
    } catch (err) {
      console.error("Error al eliminar administrador:", err);
      setNotif(`❌ Error: ${err instanceof Error ? err.message : 'No se pudo remover el correo'}`);
      setTimeout(() => setNotif(''), 5000);
    } finally {
      setRemovingAdminEmail(null);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Infinite scroll trigger when reaching bottom of subscriptions table
  useEffect(() => {
    if (activeAdminTab !== 'subscriptions') return;
    if (!hasMoreSubs || loadingMoreSubs) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting) {
          handleLoadMoreSubscriptions();
        }
      },
      { threshold: 0.1, rootMargin: '150px' }
    );

    const el = subsSentinelRef.current;
    if (el) {
      observer.observe(el);
    }

    return () => {
      if (el) {
        observer.unobserve(el);
      }
    };
  }, [activeAdminTab, hasMoreSubs, loadingMoreSubs, lastSubDoc, users.length]);

  const handleDeletePage = async (user: AdminUser) => {
    const confirmDelete = window.confirm(
      `⚠️ ¿ESTÁS SEGURO DE QUE DESEAS ELIMINAR PERMANENTEMENTE LA PÁGINA Y TIENDA DE @${user.username || user.email}?\n\nEsta acción NO se puede deshacer. Se eliminarán la cuenta, perfil, tienda y todos sus productos registrados.`
    );
    if (!confirmDelete) return;

    setDeletingUserId(user.uid);
    try {
      await deleteDoc(doc(db, 'users', user.uid));
      await deleteDoc(doc(db, 'profiles', user.uid));

      const productsQuery = query(collection(db, 'products'), where('userId', '==', user.uid));
      const productsSnap = await getDocs(productsQuery);
      const deletePromises: Promise<void>[] = [];
      productsSnap.forEach((d) => {
        deletePromises.push(deleteDoc(d.ref));
      });

      const linksQuery = query(collection(db, 'links'), where('userId', '==', user.uid));
      const linksSnap = await getDocs(linksQuery);
      linksSnap.forEach((d) => {
        deletePromises.push(deleteDoc(d.ref));
      });

      await Promise.all(deletePromises);

      if (user.username) {
        localStorage.removeItem(`linnk_profile_${user.username.toLowerCase()}`);
      }
      localStorage.removeItem(`linnk_products_${user.uid}`);
      localStorage.removeItem(`linnk_session_${user.uid}`);

      setUsers(prev => prev.filter(u => u.uid !== user.uid));
      setNotif(`🗑️ La página de @${user.username || user.email} ha sido eliminada correctamente.`);
      setTimeout(() => setNotif(''), 5000);
    } catch (err) {
      console.error("Error al eliminar la página:", err);
      setNotif(`❌ Error al eliminar la página: ${err instanceof Error ? err.message : 'Intente nuevamente'}`);
      setTimeout(() => setNotif(''), 5000);
    } finally {
      setDeletingUserId(null);
    }
  };

  const [cleaningTestUsers, setCleaningTestUsers] = useState<boolean>(false);

  const handleCleanTestUsers = async () => {
    const isTestUser = (u: { username?: string; email?: string; storeName?: string; name?: string }) => {
      const un = (u.username || '').toLowerCase();
      const em = (u.email || '').toLowerCase();
      const st = (u.storeName || u.name || '').toLowerCase();
      return (
        un.startsWith('testuser_') ||
        un.includes('testuser') ||
        em.includes('test_') ||
        em.endsWith('@example.com') ||
        st === 'test user' ||
        st.includes('test user')
      );
    };

    setCleaningTestUsers(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const testUids: string[] = [];
      const testNames: string[] = [];

      usersSnap.forEach(d => {
        const data = d.data();
        if (isTestUser({ username: data.username, email: data.email, storeName: data.storeName, name: data.name })) {
          testUids.push(d.id);
          testNames.push(`@${data.username || data.email || d.id}`);
        }
      });

      if (testUids.length === 0) {
        setNotif("ℹ️ No se encontraron usuarios de prueba en la base de datos.");
        setTimeout(() => setNotif(''), 4000);
        return;
      }

      const confirmDelete = window.confirm(
        `⚠️ ¿Confirmas eliminar ${testUids.length} usuarios de prueba detectados?\n\nCuentas: ${testNames.slice(0, 10).join(', ')}${testNames.length > 10 ? '...' : ''}\n\nEsta acción eliminará permanentemente sus documentos, tiendas y productos.`
      );
      if (!confirmDelete) return;

      const deletePromises: Promise<void>[] = [];

      for (const uid of testUids) {
        deletePromises.push(deleteDoc(doc(db, 'users', uid)));
        deletePromises.push(deleteDoc(doc(db, 'profiles', uid)));

        const productsQuery = query(collection(db, 'products'), where('userId', '==', uid));
        const productsSnap = await getDocs(productsQuery);
        productsSnap.forEach(p => deletePromises.push(deleteDoc(p.ref)));

        const linksQuery = query(collection(db, 'links'), where('userId', '==', uid));
        const linksSnap = await getDocs(linksQuery);
        linksSnap.forEach(l => deletePromises.push(deleteDoc(l.ref)));
      }

      await Promise.all(deletePromises);

      setUsers(prev => prev.filter(u => !testUids.includes(u.uid)));
      setNotif(`🧹 Se eliminaron con éxito ${testUids.length} usuario(s) de prueba de la base de datos.`);
      setTimeout(() => setNotif(''), 5000);
    } catch (err) {
      console.error("Error al limpiar usuarios de prueba:", err);
      setNotif(`❌ Error al limpiar usuarios test: ${err instanceof Error ? err.message : 'Error imprevisto'}`);
      setTimeout(() => setNotif(''), 5000);
    } finally {
      setCleaningTestUsers(false);
    }
  };

  const handleToggleSuspension = async (user: AdminUser) => {
    const nextSuspended = !user.suspended;
    try {
      const updates = {
        suspended: nextSuspended,
        isClosed: nextSuspended ? true : false,
        subscriptionStatus: nextSuspended ? 'suspended' : 'active'
      };

      // Write to Firebase
      await setDoc(doc(db, 'profiles', user.uid), updates, { merge: true });
      try {
        await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
      } catch (err) {}

      // Update Local State
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, ...updates } : u));
      setNotif(`La tienda de @${user.username || user.email} ha sido ${nextSuspended ? '🔴 CERRADA Y SUSPENDIDA (Productos Ocultos)' : '🟢 ACTIVADA Y ABIERTA'} correctamente.`);
      setTimeout(() => setNotif(''), 4500);
    } catch (e) {
      console.error("Error toggling suspension:", e);
      setNotif(`❌ Error al cambiar estado de suspensión: ${e instanceof Error ? e.message : 'Error imprevisto'}`);
      setTimeout(() => setNotif(''), 5000);
    }
  };

  const handlePlanUpgrade = async (user: AdminUser, newPlan: 'basico' | 'medio' | 'pro') => {
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { 
        subscriptionPlan: newPlan,
        subscriptionStatus: 'active'
      });
      // Backwards compatibility writes
      await updateDoc(doc(db, 'users', user.uid), { 
        subscriptionPlan: newPlan,
        subscriptionStatus: 'active',
        plan: newPlan === 'basico' ? 'free' : newPlan === 'medio' ? 'pro' : 'business'
      });
    } catch(e) {}

    setUsers(users.map(u => u.uid === user.uid ? { ...u, subscriptionPlan: newPlan } : u));
    const planLabels = {
      basico: 'Plan Básico (5 productos)',
      medio: 'Plan Medio (12 productos)',
      pro: 'Plan Avanzado (24 productos)'
    };
    setNotif(`La suscripción de @${user.username} ha sido actualizada a: ${planLabels[newPlan].toUpperCase()}.`);
    setTimeout(() => setNotif(''), 4500);
  };

  const handleUpdateSubscriptionStatus = async (userId: string, newStatus: string) => {
    try {
      const isSuspended = newStatus === 'suspended';
      const isExpired = newStatus === 'expired';
      const updates: Record<string, any> = {
        subscriptionStatus: newStatus,
        suspended: isSuspended
      };

      if (isSuspended) {
        updates.isClosed = true;
      } else if (isExpired) {
        updates.isClosed = true;
        updates.suspended = false;
      } else if (newStatus === 'trial') {
        updates.isClosed = false;
        updates.suspended = false;
        updates.subscriptionTrialExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (newStatus === 'active') {
        updates.isClosed = false;
        updates.suspended = false;
      } else if (newStatus === 'under_review') {
        updates.isClosed = false;
        updates.suspended = false;
      } else if (newStatus === 'pending_payment') {
        updates.isClosed = false;
        updates.suspended = false;
      }

      const userRef = doc(db, 'profiles', userId);
      await setDoc(userRef, updates, { merge: true });
      try {
        await setDoc(doc(db, 'users', userId), updates, { merge: true });
      } catch (err) {}

      setUsers(prev => prev.map(u => u.uid === userId ? {
        ...u,
        ...updates
      } : u));

      // Synchronize active and expired stores count in real-time
      setStats(prev => {
        const target = users.find(u => u.uid === userId);
        const prevStatus = target ? isSubscriptionExpiredOrSuspended(target).effectiveStatus : 'unknown';
        const nextStatus = newStatus;
        
        let activeDiff = 0;
        if (prevStatus === 'active' && nextStatus !== 'active') activeDiff = -1;
        if (prevStatus !== 'active' && nextStatus === 'active') activeDiff = 1;

        let expiredDiff = 0;
        if (prevStatus === 'expired' && nextStatus !== 'expired') expiredDiff = -1;
        if (prevStatus !== 'expired' && nextStatus === 'expired') expiredDiff = 1;

        const currentActive = (prev as any).activeStoresCount ?? prev.activePaidStores ?? 0;
        const currentExpired = (prev as any).expiredStoresCount ?? 0;
        const updatedActive = Math.max(0, currentActive + activeDiff);
        const updatedExpired = Math.max(0, currentExpired + expiredDiff);
        const updatedTotal = updatedActive + updatedExpired;

        return {
          ...prev,
          totalProfiles: updatedActive,
          activePaidStores: updatedActive,
          activeStoresCount: updatedActive,
          expiredStoresCount: updatedExpired,
          totalActiveAndExpired: updatedTotal
        };
      });

      let statusDescription = '';
      if (newStatus === 'trial') {
        statusDescription = '🆓 ESTADO GRATUITO (7 Días de Prueba)';
      } else if (newStatus === 'suspended') {
        statusDescription = '⚠️ ESTADO SUSPENDIDO (Bloqueada por Administración - Tienda Cerrada)';
      } else if (newStatus === 'expired') {
        statusDescription = '🔴 ESTADO EXPIRADO (Suscripción Vencida - Tienda Cerrada)';
      } else if (newStatus === 'active') {
        statusDescription = '🟢 ESTADO ACTIVO (Tienda Abierta y Operativa)';
      } else if (newStatus === 'under_review') {
        statusDescription = '🟡 EN REVISIÓN (Comprobante pendiente de validación)';
      } else {
        statusDescription = '🟡 PENDIENTE DE PAGO';
      }

      setNotif(`Suscripción actualizada a: ${statusDescription}`);
      setTimeout(() => setNotif(''), 4500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleModifySubscriptionMonths = async (user: AdminUser, monthsDelta: number = 1) => {
    try {
      const { nextPaidUntil, anchorDay } = calculateNextExpirationDate(user, monthsDelta);
      const newPaidUntilStr = nextPaidUntil.toISOString();
      const isNowActive = nextPaidUntil.getTime() > Date.now();
      
      const updates: any = {
        subscriptionStatus: isNowActive ? 'active' : 'expired',
        suspended: false,
        subscriptionPaidUntil: newPaidUntilStr,
        subscriptionAnchorDay: anchorDay
      };
      if (isNowActive) {
        updates.isClosed = false;
      }

      const userRef = doc(db, 'profiles', user.uid);
      await setDoc(userRef, updates, { merge: true });

      try {
        const legacyRef = doc(db, 'users', user.uid);
        await setDoc(legacyRef, updates, { merge: true });
      } catch (e) {}

      setUsers(prev => prev.map(u => u.uid === user.uid ? {
        ...u,
        ...updates
      } : u));

      // Synchronize stats in real-time
      setStats(prev => {
        const prevStatus = isSubscriptionExpiredOrSuspended(user).effectiveStatus;
        const newStatus = isNowActive ? 'active' : 'expired';
        const activeDiff = (newStatus === 'active' ? 1 : 0) - (prevStatus === 'active' ? 1 : 0);
        const expiredDiff = (newStatus === 'expired' ? 1 : 0) - (prevStatus === 'expired' ? 1 : 0);

        const currentActive = (prev as any).activeStoresCount ?? prev.activePaidStores ?? 0;
        const currentExpired = (prev as any).expiredStoresCount ?? 0;
        const updatedActive = Math.max(0, currentActive + activeDiff);
        const updatedExpired = Math.max(0, currentExpired + expiredDiff);
        const planPrice = user.subscriptionPlan === 'pro' ? 99000 : user.subscriptionPlan === 'medio' ? 79000 : 49000;
        const revDiff = activeDiff * planPrice;
        const updatedActiveRev = Math.max(0, ((prev as any).activeRevenue ?? prev.monthlyRevenue ?? 0) + revDiff);
        const expectedRev = (prev as any).expectedRevenue ?? updatedActiveRev;
        const updatedPending = Math.max(0, expectedRev - updatedActiveRev);

        return {
          ...prev,
          totalProfiles: prev.totalProfiles,
          activePaidStores: updatedActive,
          activeStoresCount: updatedActive,
          expiredStoresCount: updatedExpired,
          totalActiveAndExpired: prev.totalProfiles || (updatedActive + updatedExpired),
          activeRevenue: updatedActiveRev,
          monthlyRevenue: updatedActiveRev,
          pendingRecovery: updatedPending
        };
      });

      const formattedDate = nextPaidUntil.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
      if (monthsDelta > 0) {
        setNotif(`✅ Suscripción de @${user.username || 'tienda'} extendida (+1 mes) hasta ${formattedDate} (Día de corte: ${anchorDay}) y tienda ACTIVA.`);
      } else {
        setNotif(`🗓️ Suscripción de @${user.username || 'tienda'} reducida (-1 mes) hasta ${formattedDate} (Día de corte: ${anchorDay}). Estado: ${isNowActive ? 'ACTIVA' : 'EXPIRADA'}.`);
      }
      setTimeout(() => setNotif(''), 4500);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleExtendSubscription = async (user: AdminUser) => {
    return handleModifySubscriptionMonths(user, 1);
  };

  const handleToggleStoreClosedStatus = async (user: AdminUser) => {
    const nextClosedState = !user.isClosed;
    try {
      const updates: Record<string, any> = { isClosed: nextClosedState };
      if (!nextClosedState && user.scheduleEnabled) {
        updates.scheduleEnabled = false;
      }
      await setDoc(doc(db, 'profiles', user.uid), updates, { merge: true });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, ...updates } : u));
      try {
        localStorage.removeItem('linnk_all_active_data_cache');
        window.dispatchEvent(new CustomEvent('linnk:store_status_changed', { detail: { uid: user.uid, isClosed: nextClosedState } }));
        fetch('/api/catalog/refresh', { method: 'POST' }).catch(() => {});
      } catch (e) {}
      setNotif(`La tienda ${user.storeName || '@' + user.username} ahora se encuentra: ${nextClosedState ? '🔴 CERRADA' : '🟢 ABIERTA'}`);
      setTimeout(() => setNotif(''), 4000);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar el estado de apertura de la tienda.");
    }
  };

  const [confirmExtendModalUser, setConfirmExtendModalUser] = useState<AdminUser | null>(null);
  const [extendModalMonths, setExtendModalMonths] = useState<number>(1);
  const [extendingSubscription, setExtendingSubscription] = useState<boolean>(false);

  const handleExecuteExtendSubscription = async () => {
    if (!confirmExtendModalUser) return;
    setExtendingSubscription(true);
    try {
      await handleModifySubscriptionMonths(confirmExtendModalUser, extendModalMonths);
      setConfirmExtendModalUser(null);
    } catch (err) {
      console.error("Error al modificar suscripción:", err);
      setNotif(`❌ Error al modificar: ${err instanceof Error ? err.message : 'Intente nuevamente'}`);
      setTimeout(() => setNotif(''), 4000);
    } finally {
      setExtendingSubscription(false);
    }
  };

  // State & Handlers for Cobro de Suscripción WhatsApp Modal
  const [cobroModalUser, setCobroModalUser] = useState<AdminUser | null>(null);
  const [cobroCustomPhone, setCobroCustomPhone] = useState<string>('');
  const [cobroCustomMessage, setCobroCustomMessage] = useState<string>('');
  const [cobroTemplateType, setCobroTemplateType] = useState<'standard' | 'urgent' | 'promo' | 'trial'>('standard');
  const [copiedCobroText, setCopiedCobroText] = useState<boolean>(false);
  const [copiedCobroPhone, setCopiedCobroPhone] = useState<boolean>(false);

  const handleOpenCobroModal = (user: AdminUser, template: 'standard' | 'urgent' | 'promo' | 'trial' = 'standard') => {
    const rawPhone = user.ownerWhatsapp || user.whatsapp || user.phone || '';
    const digits = rawPhone.replace(/\D/g, '').replace(/^0+/, '');
    const cleanNumber = digits.startsWith('57') && digits.length >= 12 ? digits.slice(2) : digits;

    const { effectiveStatus } = isSubscriptionExpiredOrSuspended(user);
    const chosenTemplate: 'standard' | 'urgent' | 'promo' | 'trial' = effectiveStatus === 'trial' ? 'trial' : template;

    setCobroModalUser(user);
    setCobroCustomPhone(cleanNumber);
    setCobroTemplateType(chosenTemplate);
    setCopiedCobroText(false);
    setCopiedCobroPhone(false);

    const initialMsg = generateSubscriptionCobroMessageByType(user, chosenTemplate);
    setCobroCustomMessage(initialMsg);
  };

  const handleSelectCobroTemplate = (template: 'standard' | 'urgent' | 'promo' | 'trial') => {
    if (!cobroModalUser) return;
    setCobroTemplateType(template);
    const msg = generateSubscriptionCobroMessageByType(cobroModalUser, template);
    setCobroCustomMessage(msg);
    setCopiedCobroText(false);
  };

  const handleCopyCobroMessage = () => {
    if (!cobroCustomMessage) return;
    navigator.clipboard.writeText(cobroCustomMessage);
    setCopiedCobroText(true);
    setTimeout(() => setCopiedCobroText(false), 3000);
  };

  const handleCopyCobroPhone = () => {
    if (!cobroCustomPhone) return;
    navigator.clipboard.writeText(cobroCustomPhone);
    setCopiedCobroPhone(true);
    setTimeout(() => setCopiedCobroPhone(false), 2500);
  };

  const DAYS_OF_WEEK_LIST: Array<{ id: string; label: string; shortLabel: string }> = [
    { id: 'lunes', label: 'Lunes', shortLabel: 'Lun' },
    { id: 'martes', label: 'Martes', shortLabel: 'Mar' },
    { id: 'miercoles', label: 'Miércoles', shortLabel: 'Mié' },
    { id: 'jueves', label: 'Jueves', shortLabel: 'Jue' },
    { id: 'viernes', label: 'Viernes', shortLabel: 'Vie' },
    { id: 'sabado', label: 'Sábado', shortLabel: 'Sáb' },
    { id: 'domingo', label: 'Domingo', shortLabel: 'Dom' }
  ];

  const [scheduleModalUser, setScheduleModalUser] = useState<AdminUser | null>(null);
  const [scheduleEnabledInput, setScheduleEnabledInput] = useState<boolean>(true);
  const [weeklyScheduleInput, setWeeklyScheduleInput] = useState<WeeklySchedule>({});
  const [copyFeedbackDay, setCopyFeedbackDay] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState<boolean>(false);

  const handleOpenScheduleModal = (user: AdminUser) => {
    setScheduleModalUser(user);
    setScheduleEnabledInput(user.scheduleEnabled ?? Boolean(user.openTime && user.closeTime));

    const base: WeeklySchedule = {};
    const legacyDays = user.restaurantDaysOpen && user.restaurantDaysOpen.length > 0
      ? user.restaurantDaysOpen
      : ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const defOpen = user.openTime || '08:00';
    const defClose = user.closeTime || '22:00';

    DAYS_OF_WEEK_LIST.forEach(day => {
      if (user.weeklySchedule && user.weeklySchedule[day.id]) {
        base[day.id] = {
          isOpen: user.weeklySchedule[day.id].isOpen ?? true,
          openTime: user.weeklySchedule[day.id].openTime || defOpen,
          closeTime: user.weeklySchedule[day.id].closeTime || defClose
        };
      } else {
        base[day.id] = {
          isOpen: legacyDays.includes(day.id),
          openTime: defOpen,
          closeTime: defClose
        };
      }
    });

    setWeeklyScheduleInput(base);
    setCopyFeedbackDay(null);
  };

  const toggleDayStatus = (dayId: string) => {
    setWeeklyScheduleInput(prev => ({
      ...prev,
      [dayId]: {
        isOpen: !prev[dayId]?.isOpen,
        openTime: prev[dayId]?.openTime || '08:00',
        closeTime: prev[dayId]?.closeTime || '22:00'
      }
    }));
  };

  const updateDayTime = (dayId: string, field: 'openTime' | 'closeTime', val: string) => {
    setWeeklyScheduleInput(prev => ({
      ...prev,
      [dayId]: {
        isOpen: prev[dayId]?.isOpen ?? true,
        openTime: prev[dayId]?.openTime || '08:00',
        closeTime: prev[dayId]?.closeTime || '22:00',
        [field]: val
      }
    }));
  };

  const copyDayScheduleToAll = (sourceDayId: string) => {
    const source = weeklyScheduleInput[sourceDayId];
    if (!source) return;
    setWeeklyScheduleInput(prev => {
      const next = { ...prev };
      DAYS_OF_WEEK_LIST.forEach(d => {
        next[d.id] = {
          isOpen: prev[d.id]?.isOpen ?? true,
          openTime: source.openTime,
          closeTime: source.closeTime
        };
      });
      return next;
    });
    setCopyFeedbackDay(sourceDayId);
    setTimeout(() => setCopyFeedbackDay(null), 2500);
  };

  const applyQuickPreset = (preset: 'all_open' | 'weekdays_only' | 'weekend_only' | 'all_closed') => {
    setWeeklyScheduleInput(prev => {
      const next = { ...prev };
      DAYS_OF_WEEK_LIST.forEach(d => {
        let isOpen = true;
        if (preset === 'all_closed') isOpen = false;
        if (preset === 'weekdays_only') {
          isOpen = d.id !== 'sabado' && d.id !== 'domingo';
        }
        if (preset === 'weekend_only') {
          isOpen = d.id === 'sabado' || d.id === 'domingo';
        }
        next[d.id] = {
          isOpen,
          openTime: prev[d.id]?.openTime || '08:00',
          closeTime: prev[d.id]?.closeTime || '22:00'
        };
      });
      return next;
    });
  };

  const applyTimePresetToAll = (open: string, close: string) => {
    setWeeklyScheduleInput(prev => {
      const next = { ...prev };
      DAYS_OF_WEEK_LIST.forEach(d => {
        next[d.id] = {
          isOpen: prev[d.id]?.isOpen ?? true,
          openTime: open,
          closeTime: close
        };
      });
      return next;
    });
  };

  const handleSaveSchedule = async () => {
    if (!scheduleModalUser) return;
    setSavingSchedule(true);
    try {
      const activeDaysList = (Object.entries(weeklyScheduleInput) as [string, DaySchedule][])
        .filter(([_, s]) => s.isOpen)
        .map(([dayId]) => dayId);

      const firstActive = (Object.values(weeklyScheduleInput) as DaySchedule[]).find(s => s.isOpen);
      const fallbackOpen = firstActive?.openTime || scheduleModalUser.openTime || '08:00';
      const fallbackClose = firstActive?.closeTime || scheduleModalUser.closeTime || '22:00';

      const updatedData = {
        weeklySchedule: weeklyScheduleInput,
        restaurantDaysOpen: activeDaysList,
        openTime: fallbackOpen,
        closeTime: fallbackClose,
        scheduleEnabled: scheduleEnabledInput
      };

      await setDoc(doc(db, 'profiles', scheduleModalUser.uid), updatedData, { merge: true });

      setUsers(prev => prev.map(u => u.uid === scheduleModalUser.uid ? { ...u, ...updatedData } : u));

      setNotif(`⏰ Horario guardado para ${scheduleModalUser.storeName || '@' + scheduleModalUser.username}: ${scheduleEnabledInput ? `${activeDaysList.length} días configurados` : 'Desactivado'}`);
      setTimeout(() => setNotif(''), 4000);
      setScheduleModalUser(null);
    } catch (err) {
      console.error("Error al guardar horario:", err);
      setNotif(`❌ Error al guardar horario: ${err instanceof Error ? err.message : 'Intente nuevamente'}`);
      setTimeout(() => setNotif(''), 4000);
    } finally {
      setSavingSchedule(false);
    }
  };

  const getAdminUserScheduleSummary = (user: AdminUser) => {
    if (!user.scheduleEnabled) {
      return 'Inactivo';
    }
    if (user.weeklySchedule && Object.keys(user.weeklySchedule).length > 0) {
      const activeCount = (Object.values(user.weeklySchedule) as DaySchedule[]).filter(d => d.isOpen).length;
      if (activeCount === 0) return '0 días (Cerrado)';
      return `${activeCount} días`;
    }
    if (user.restaurantDaysOpen && user.restaurantDaysOpen.length > 0) {
      return `${user.restaurantDaysOpen.length} días`;
    }
    if (user.openTime && user.closeTime) {
      return `${user.openTime} - ${user.closeTime}`;
    }
    return 'Configurar';
  };

  const handleApprovePayment = async (payment: SubscriptionPayment) => {
    try {
      const paymentRef = doc(db, 'subscription_payments', payment.id);
      await updateDoc(paymentRef, { 
        status: 'approved',
        updatedAt: new Date().toISOString()
      });

      const targetUser = users.find(u => u.uid === payment.userId);
      const { nextPaidUntil, anchorDay } = calculateNextExpirationDate(targetUser || { createdAt: new Date().toISOString() }, 1);
      const newPaidUntilStr = nextPaidUntil.toISOString();

      const profileRef = doc(db, 'profiles', payment.userId);
      await updateDoc(profileRef, {
        subscriptionStatus: 'active',
        suspended: false,
        subscriptionPlan: payment.plan || 'basico',
        requestedPlan: null,
        subscriptionPaidUntil: newPaidUntilStr,
        subscriptionAnchorDay: anchorDay
      });

      const userRef = doc(db, 'users', payment.userId);
      try {
        await updateDoc(userRef, {
          subscriptionStatus: 'active',
          suspended: false,
          subscriptionPlan: payment.plan || 'basico',
          requestedPlan: null,
          subscriptionPaidUntil: newPaidUntilStr,
          subscriptionAnchorDay: anchorDay
        });
      } catch (err) {}

      // Update local payments and users states
      setAllPayments(prev => prev.map(p => p.id === payment.id ? { ...p, status: 'approved' } : p));
      setUsers(prev => prev.map(u => u.uid === payment.userId ? {
        ...u,
        subscriptionStatus: 'active',
        suspended: false,
        subscriptionPlan: payment.plan || u.subscriptionPlan,
        requestedPlan: undefined,
        subscriptionPaidUntil: newPaidUntilStr,
        subscriptionAnchorDay: anchorDay
      } : u));

      const planName = payment.plan === 'medio' ? 'Plan Medio' : payment.plan === 'pro' ? 'Plan Avanzado' : 'Plan Básico';
      setNotif(`¡Pago de @${payment.username} para el ${planName} APROBADO correctamente! El nuevo plan y cupo ya están activos. Próximo vencimiento: ${nextPaidUntil.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })} (Día de corte: ${anchorDay}).`);
      setTimeout(() => setNotif(''), 5000);
    } catch (e) {
      console.error(e);
      alert("Error al aprobar pago.");
    }
  };

  const handleRejectPayment = async (payment: SubscriptionPayment) => {
    try {
      const paymentRef = doc(db, 'subscription_payments', payment.id);
      await updateDoc(paymentRef, { 
        status: 'rejected',
        updatedAt: new Date().toISOString()
      });

      const profileRef = doc(db, 'profiles', payment.userId);
      await updateDoc(profileRef, {
        subscriptionStatus: 'pending_payment',
        requestedPlan: null
      });

      const userRef = doc(db, 'users', payment.userId);
      try {
        await updateDoc(userRef, {
          subscriptionStatus: 'pending_payment',
          requestedPlan: null
        });
      } catch (err) {}

      setAllPayments(prev => prev.map(p => p.id === payment.id ? { ...p, status: 'rejected' } : p));
      setNotif(`Pago de @${payment.username} marcado como RECHAZADO.`);
      setTimeout(() => setNotif(''), 5000);
    } catch (e) {
      console.error(e);
      alert("Error al rechazar pago.");
    }
  };

  const getStoreNameForOrder = (order: OrderItem): string => {
    if (order.storeName && order.storeName.trim() !== '' && order.storeName !== 'Tienda Linnk' && order.storeName !== 'Tienda en la plataforma') {
      return order.storeName;
    }
    const storeProfile = storesMap[order.storeOwnerId];
    if (storeProfile) {
      return storeProfile.displayName || storeProfile.storeName || storeProfile.username || 'Tienda';
    }
    const userMatch = users.find(u => u.uid === order.storeOwnerId);
    if (userMatch) {
      return userMatch.storeName || userMatch.username || `@${userMatch.username}`;
    }
    return order.storeName || 'Tienda';
  };

  const getStoreUsernameForOrder = (order: OrderItem): string => {
    const storeProfile = storesMap[order.storeOwnerId];
    if (storeProfile && storeProfile.username) {
      return storeProfile.username;
    }
    const userMatch = users.find(u => u.uid === order.storeOwnerId);
    if (userMatch && userMatch.username) {
      return userMatch.username;
    }
    return '';
  };

  const getStoreWhatsappForOrder = (order: OrderItem): string => {
    // 1. Direct store phone on order object
    if (order.storePhone && order.storePhone.trim() !== '') {
      return order.storePhone.trim();
    }
    // 2. Lookup in storesMap by storeOwnerId
    if (order.storeOwnerId && storesMap[order.storeOwnerId]) {
      const p = storesMap[order.storeOwnerId];
      const num = p.whatsapp || p.customerServiceWhatsapp || p.ownerWhatsapp || p.phone;
      if (num && num.trim() !== '') return num.trim();
    }
    // 3. Lookup in allStoresList
    const storeInList = allStoresList.find(s => s.uid === order.storeOwnerId);
    if (storeInList?.phone && storeInList.phone.trim() !== '') {
      return storeInList.phone.trim();
    }
    // 4. Lookup in users list
    const userMatch = users.find(u => u.uid === order.storeOwnerId);
    if (userMatch) {
      const num = userMatch.whatsapp || userMatch.customerServiceWhatsapp || userMatch.ownerWhatsapp || userMatch.phone;
      if (num && num.trim() !== '') return num.trim();
    }
    // 5. Fallback scan in Object.values of storesMap
    const storeFromValues = (Object.values(storesMap) as UserProfile[]).find(
      p => p && (p.uid === order.storeOwnerId || (p.username && order.storeName && p.displayName === order.storeName))
    );
    if (storeFromValues) {
      const num = storeFromValues.whatsapp || storeFromValues.customerServiceWhatsapp || storeFromValues.ownerWhatsapp || storeFromValues.phone;
      if (num && num.trim() !== '') return num.trim();
    }
    return '';
  };

  const getCleanWhatsappNumber = (phoneStr: string): string => {
    let clean = (phoneStr || '').replace(/[^0-9]/g, '');
    if (clean.length === 10 && clean.startsWith('3')) {
      clean = '57' + clean;
    }
    return clean;
  };

  const getStoreAdminWhatsAppMessage = (order: OrderItem): string => {
    const storeName = getStoreNameForOrder(order);
    const orderNumber = order.orderNumber || 'S/N';
    const customerName = order.customerName || 'Cliente';

    let productsText = 'Productos del pedido';
    if (order.items && order.items.length > 0) {
      productsText = order.items.map(it => {
        const qty = it.quantity && it.quantity > 1 ? ` (x${it.quantity})` : '';
        const variant = it.selectedVariant ? ` [${it.selectedVariant}]` : '';
        return `${it.name}${variant}${qty}`;
      }).join(', ');
    } else if (order.notes) {
      productsText = order.notes;
    }

    const orderValue = (order.totalAmount || 0).toLocaleString('es-CO');

    const isPickup = order.orderType === 'pickup' || order.deliveryFee === 0;
    const isTable = order.isTableOrder || order.orderType === 'table';
    let deliverySuffix = '';
    if (!isPickup && !isTable) {
      deliverySuffix = ' valor de domicilio';
    }

    let customerPhone = order.customerPhone || 'No registrado';
    if (customerPhone !== 'No registrado') {
      const cleanDigits = customerPhone.replace(/[^0-9]/g, '');
      if (cleanDigits.length === 10 && cleanDigits.startsWith('3')) {
        customerPhone = `+57${cleanDigits}`;
      } else if (cleanDigits.length === 12 && cleanDigits.startsWith('57')) {
        customerPhone = `+${cleanDigits}`;
      } else if (!customerPhone.startsWith('+')) {
        customerPhone = `+${cleanDigits}`;
      }
    }

    return `Hola, *${storeName}* 👋\n\n` +
      `Le contactamos desde *Administración General de RYYCO* con relación al *pedido #${orderNumber}*, realizado por *${customerName}*.\n\n` +
      `🍗 *Pedido:* ${productsText}\n` +
      `💰 *Valor de pedido :* $${orderValue}${deliverySuffix}\n` +
      `📱 *WhatsApp del cliente:* ${customerPhone}\n\n` +
      `Por favor, *comuníquese directamente con el cliente vía WhatsApp* para confirmar los detalles del pedido.\n\n` +
      `Gracias por hacer parte de *RYYCO*. 🛵`;
  };

  const storeNamesMap = useMemo(() => {
    const map: Record<string, string> = {};
    (Object.values(storesMap) as UserProfile[]).forEach((p: UserProfile) => {
      if (p && p.uid) {
        map[p.uid] = p.displayName || p.storeName || p.username || `@${p.username}`;
      }
    });
    users.forEach(u => {
      if (!map[u.uid]) {
        map[u.uid] = u.storeName || u.username || `@${u.username}`;
      }
    });
    return map;
  }, [users, storesMap]);

  const handleUpdateOrderStatus = async (orderId: string, storeOwnerId: string, newStatus: OrderItem['status']) => {
    try {
      let cancellationReason: string | undefined = undefined;
      if (newStatus === 'cancelled') {
        const inputReason = window.prompt("Ingrese el motivo de cancelación del pedido (opcional):", "Cancelado por administración");
        cancellationReason = inputReason?.trim() || "Cancelado por administración";
      }

      await updateOrderStatus(orderId, storeOwnerId, newStatus, {
        updatedBy: 'admin',
        cancelledBy: 'admin',
        cancellationReason,
        allowAdminOverride: true,
        note: newStatus === 'cancelled' 
          ? (cancellationReason || 'Cancelado por administración') 
          : `Estado actualizado por administración a ${newStatus}`
      });

      const currentOrder = allOrders.find(o => o.id === orderId);
      if (currentOrder) {
        const timeUpdates = applyOrderTimeTransition(currentOrder, newStatus, {
          userRole: 'admin',
          cancelledBy: 'admin',
          reason: cancellationReason,
          restaurantId: storeOwnerId,
          note: newStatus === 'cancelled' 
            ? (cancellationReason || 'Cancelado por administración') 
            : `Estado actualizado por administración a ${newStatus}`
        });

        const mergedOrder: OrderItem = {
          ...currentOrder,
          status: newStatus,
          ...timeUpdates,
          ...(newStatus === 'cancelled' ? {
            cancelledBy: 'admin',
            cancellationReason: cancellationReason || 'Cancelado por administración',
            cancelledAt: new Date().toISOString()
          } : {})
        };

        setAllOrders(prev => prev.map(o => o.id === orderId ? mergedOrder : o));
        setViewingOrder(prev => prev && prev.id === orderId ? mergedOrder : prev);
      } else {
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        setViewingOrder(prev => prev && prev.id === orderId ? { ...prev, status: newStatus } : prev);
      }

      setNotif(`¡Estado del pedido actualizado a ${newStatus.toUpperCase()} correctamente!`);
      setTimeout(() => setNotif(''), 4000);
    } catch (err: any) {
      console.warn("Could not update order status:", err);
      alert(err?.message || "Error al actualizar el estado del pedido.");
    }
  };

  const handleDeleteOrder = async (order: OrderItem) => {
    const confirmMsg = `¿Estás seguro de que deseas eliminar permanentemente el pedido #${order.orderNumber || 'S/N'} de ${order.customerName}? Esta acción no se puede deshacer.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteOrder(order.id, order.storeOwnerId);
      setAllOrders(prev => prev.filter(o => o.id !== order.id));
      if (viewingOrder?.id === order.id) {
        setViewingOrder(null);
      }
      setNotif(`Pedido #${order.orderNumber || 'S/N'} eliminado permanentemente.`);
      setTimeout(() => setNotif(''), 4000);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el pedido.");
    }
  };

  const triggerWhatsAppMessage = (order: OrderItem) => {
    const statusLang: Record<string, string> = {
      'pending': 'Pendiente ⏳',
      'processing': 'En Procesamiento 📦',
      'shipped': 'Enviado 🚚',
      'delivered': 'Entregado ✅',
      'cancelled': 'Cancelado 🚫'
    };
    
    const storeName = getStoreNameForOrder(order);
    const intro = `Hola *${order.customerName}*, te contactamos de *${storeName}* respecto a tu compra #${order.orderNumber || 'S/N'}.\n\n`;
    const statusMsg = `El estado actual de tu pedido es: *${statusLang[order.status] || order.status}*.\n\n`;
    const total = `Total: *$${(order.totalAmount || 0).toLocaleString('es-CO')} COP*\n\n`;
    const out = `¡Muchas gracias por tu preferencia! Cualquier consulta nos puedes escribir por aquí.\n`;
    
    let rawPhone = (order.customerPhone || '').replace(/[^0-9]/g, '');
    if (rawPhone.length === 10 && rawPhone.startsWith('3')) {
      rawPhone = '57' + rawPhone;
    }
    const fullText = encodeURIComponent(`${intro}${statusMsg}${total}${out}`);
    if (rawPhone) {
      window.open(`https://wa.me/${rawPhone}?text=${fullText}`, '_blank');
    } else {
      alert("El pedido no tiene un número telefónico válido registrado.");
    }
  };

  const filteredOrders = useMemo(() => {
    return allOrders.filter(order => {
      // 1. Store Filter
      if (selectedOrderStoreFilter !== 'all' && order.storeOwnerId !== selectedOrderStoreFilter) {
        return false;
      }
      // 2. Status Filter
      if (selectedOrderStatusFilter !== 'all') {
        const hasDriver = Boolean(order.deliveryDriverId && order.deliveryDriverId.trim() !== '') ||
                          Boolean(order.driverId && order.driverId.trim() !== '') ||
                          Boolean(order.deliveryStep);
        const isDeliveredOrCancelled = order.status === 'delivered' || order.status === 'cancelled';
        const isPickedUpAtStore = !isDeliveredOrCancelled && (
          order.status === 'shipped' ||
          order.status === 'delivering' ||
          order.status === 'picked_up' ||
          order.deliveryStep === 'picked_up' ||
          order.deliveryStep === 'to_client' ||
          order.deliveryStep === 'at_destination'
        );
        const effStatus = isDeliveredOrCancelled
          ? order.status
          : isPickedUpAtStore
          ? 'shipped'
          : (hasDriver && (order.status === 'pending' || order.status === 'confirmed'))
          ? 'processing'
          : (order.status === 'confirmed' ? 'processing' : order.status || 'pending');
        if (effStatus !== selectedOrderStatusFilter) {
          return false;
        }
      }
      // 3. Search text (name, phone, email, notes, order number, driver info, or store name/username)
      if (orderSearchQuery.trim()) {
        const query = orderSearchQuery.toLowerCase();
        const matchesName = order.customerName.toLowerCase().includes(query);
        const matchesPhone = order.customerPhone.toLowerCase().includes(query);
        const matchesEmail = order.customerEmail?.toLowerCase().includes(query) || false;
        const matchesNumber = order.orderNumber.toString().includes(query);
        const matchesNotes = order.notes?.toLowerCase().includes(query) || false;
        const matchesDriverName = order.deliveryDriverName?.toLowerCase().includes(query) || false;
        const matchesDriverPhone = order.deliveryDriverPhone?.toLowerCase().includes(query) || false;
        const matchesDriverVehicle = order.deliveryVehicle?.toLowerCase().includes(query) || false;
        const storeNameText = getStoreNameForOrder(order).toLowerCase();
        const storeUsernameText = getStoreUsernameForOrder(order).toLowerCase();
        const storeWhatsappText = getStoreWhatsappForOrder(order).toLowerCase();
        const matchesStore = storeNameText.includes(query) || storeUsernameText.includes(query) || storeWhatsappText.includes(query);
        return matchesName || matchesPhone || matchesEmail || matchesNumber || matchesNotes || matchesDriverName || matchesDriverPhone || matchesDriverVehicle || matchesStore;
      }
      return true;
    });
  }, [allOrders, selectedOrderStoreFilter, selectedOrderStatusFilter, orderSearchQuery, storesMap, users]);

  // Progressive orders display (first 20, then loads more on scroll)
  const displayedOrders = useMemo(() => {
    return filteredOrders.slice(0, visibleOrdersCount);
  }, [filteredOrders, visibleOrdersCount]);

  useEffect(() => {
    setVisibleOrdersCount(20);
  }, [selectedOrderStoreFilter, selectedOrderStatusFilter, orderSearchQuery]);

  // Progressive display scroll trigger when reaching bottom of orders table
  useEffect(() => {
    if (activeAdminTab !== 'orders') return;
    if (visibleOrdersCount >= filteredOrders.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting) {
          setVisibleOrdersCount(prev => Math.min(prev + 20, filteredOrders.length));
        }
      },
      { threshold: 0.1, rootMargin: '120px' }
    );

    const el = ordersSentinelRef.current;
    if (el) {
      observer.observe(el);
    }

    return () => {
      if (el) {
        observer.unobserve(el);
      }
    };
  }, [activeAdminTab, visibleOrdersCount, filteredOrders.length]);

  // Helper to sort users with the most recently registered on top (el último registrado arriba)
  const sortUsersNewestFirst = (list: AdminUser[]): AdminUser[] => {
    return [...list].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  };

  const displayedSubscriptions = useMemo(() => {
    const sorted = sortUsersNewestFirst(users);
    if (!selectedSubscriptionStatusFilter || selectedSubscriptionStatusFilter === 'all') {
      return sorted;
    }
    return sorted.filter(u => {
      const { effectiveStatus, isExpired, isSuspended } = isSubscriptionExpiredOrSuspended(u);
      if (selectedSubscriptionStatusFilter === 'expired') {
        return effectiveStatus === 'expired' || isExpired;
      }
      if (selectedSubscriptionStatusFilter === 'suspended') {
        return effectiveStatus === 'suspended' || isSuspended;
      }
      if (selectedSubscriptionStatusFilter === 'active') {
        return !isExpired && !isSuspended && effectiveStatus === 'active';
      }
      if (selectedSubscriptionStatusFilter === 'trial') {
        return !isExpired && !isSuspended && effectiveStatus === 'trial';
      }
      return effectiveStatus === selectedSubscriptionStatusFilter;
    });
  }, [users, selectedSubscriptionStatusFilter]);

  const expiredSubscriptionsCount = useMemo(() => {
    return users.filter(u => {
      const { effectiveStatus, isExpired } = isSubscriptionExpiredOrSuspended(u);
      return effectiveStatus === 'expired' || isExpired;
    }).length;
  }, [users]);

  const suspendedSubscriptionsCount = useMemo(() => {
    return users.filter(u => {
      const { effectiveStatus, isSuspended } = isSubscriptionExpiredOrSuspended(u);
      return effectiveStatus === 'suspended' || isSuspended;
    }).length;
  }, [users]);

  const activeSubscriptionsCount = useMemo(() => {
    return users.filter(u => {
      const { effectiveStatus, isExpired, isSuspended } = isSubscriptionExpiredOrSuspended(u);
      return !isExpired && !isSuspended && effectiveStatus === 'active';
    }).length;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const sorted = sortUsersNewestFirst(users);
    if (!search.trim()) return sorted;
    const query = search.toLowerCase();
    return sorted.filter(u => 
      u.email.toLowerCase().includes(query) || 
      u.username.toLowerCase().includes(query) ||
      (u.storeName && u.storeName.toLowerCase().includes(query))
    );
  }, [users, search]);

  return (
    <div className="min-h-screen bg-[#090b12] text-gray-100 p-4 md:p-8 pb-28 lg:pb-8">
      <div className="max-w-[1600px] mx-auto">
        
        {/* Mobile Top Header */}
        <div className="lg:hidden mb-6 space-y-3 bg-[#0b101d] p-4 rounded-2xl border border-gray-800/60 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <button 
              onClick={onBack}
              className="flex items-center gap-2 text-xs font-bold text-gray-300 hover:text-white transition bg-gray-900/80 px-3 py-2 rounded-xl border border-gray-800/80"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-400" />
              <span>Volver a la Tienda</span>
            </button>

            <button 
              onClick={loadAdminData}
              title="Recargar"
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-900/80 border border-gray-800/80 rounded-xl text-xs font-bold font-mono text-gray-300 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">Panel Admin</h1>
              <p className="text-[10px] text-gray-400">Supervisa cuentas, planes y finanzas</p>
            </div>
            <span className="bg-red-500/10 text-red-400 text-[9px] font-bold uppercase px-2 py-0.5 rounded border border-red-500/20">
              STAFF ONLY
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          
          {/* Left Vertical Navigation Sidebar Column (Desktop) */}
          <aside className="hidden lg:flex lg:w-60 shrink-0 lg:sticky lg:top-6 flex-col justify-between min-h-[580px] py-2">
            
            <div className="space-y-5">
              {/* Top Back Action Button */}
              <button 
                onClick={onBack}
                className="w-full flex items-center gap-2.5 text-xs font-bold text-gray-300 hover:text-white transition bg-gray-900/60 hover:bg-gray-850 px-3.5 py-2.5 rounded-2xl border border-gray-800/60 cursor-pointer shadow-sm"
              >
                <ArrowLeft className="w-4 h-4 text-emerald-400" />
                <span>Volver a la Tienda</span>
              </button>

              {/* Sidebar Header Title & Badge */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-xl font-black text-white tracking-tight">
                    Panel Admin
                  </h1>
                  <span className="bg-red-500/10 text-red-400 text-[9px] font-bold uppercase px-2 py-0.5 rounded border border-red-500/20">
                    STAFF ONLY
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-tight">
                  Supervisa cuentas, planes y finanzas
                </p>
              </div>

              {/* Sync Button */}
              <div className="flex flex-col gap-2">
                <button 
                  onClick={loadAdminData}
                  title="Recargar"
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-900/60 hover:bg-gray-850 border border-gray-800/60 rounded-xl text-xs font-bold font-mono text-gray-300 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>Sincronizar Firebase</span>
                </button>

                <button
                  type="button"
                  onClick={handleCleanTestUsers}
                  disabled={cleaningTestUsers}
                  title="Eliminar automáticamente todas las cuentas de prueba (test_*@example.com / Test User)"
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 rounded-xl text-xs font-extrabold transition cursor-pointer disabled:opacity-50"
                >
                  {cleaningTestUsers ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Limpiar Usuarios Test</span>
                </button>
              </div>

              {/* Navigation Section */}
              <div className="pt-2">
                <div className="px-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2.5">
                  NAVEGACIÓN
                </div>
                
                <nav className="flex flex-col gap-2">
                  <button
                    onClick={() => handleSwitchTab('subscriptions')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'subscriptions' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                      <span className="truncate">Suscripciones Activas & Registro</span>
                    </div>
                  </button>

                  {/* Datos de las Tiendas (New tab placed where requested by user) */}
                  <button
                    onClick={() => handleSwitchTab('stores')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'stores' 
                        ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-pink-600/30 font-extrabold' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Store className="w-4 h-4 text-pink-400 shrink-0" />
                      <span className="truncate">Datos de las Tiendas</span>
                    </div>
                    {allStoresList.length > 0 && (
                      <span className="bg-pink-950/90 text-pink-300 border border-pink-700/60 font-mono text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                        {allStoresList.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => handleSwitchTab('payments')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'payments' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CreditCard className="w-4 h-4 shrink-0" />
                      <span className="truncate">Validar Transferencias</span>
                    </div>
                    {allPayments.filter(p => p.status === 'review').length > 0 && (
                      <span className="bg-red-500 text-white font-mono text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse shrink-0">
                        {allPayments.filter(p => p.status === 'review').length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => handleSwitchTab('orders')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'orders' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ShoppingBag className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">Pedidos de Tiendas</span>
                    </div>
                    {pendingOrdersCount > 0 ? (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono font-bold px-2 py-0.5 rounded-md border border-amber-500/40 shrink-0 animate-pulse shadow-sm">
                        {pendingOrdersCount}
                      </span>
                    ) : (
                      <span className="text-[10px] bg-gray-900 text-gray-500 font-mono font-bold px-2 py-0.5 rounded-md border border-gray-800 shrink-0">
                        0
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => handleSwitchTab('order_times')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'order_times' 
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Timer className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="truncate">Tiempos de Pedidos</span>
                    </div>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono font-bold px-1.5 py-0.5 rounded-md border border-amber-500/30 shrink-0">
                      KPI
                    </span>
                  </button>

                  <button
                    onClick={() => handleSwitchTab('drivers')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'drivers' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Bike className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">Domiciliarios</span>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSwitchTab('sales_stats')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'sales_stats' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BarChart3 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="truncate">Estadísticas de Ventas</span>
                    </div>
                    <span className="text-[10px] bg-cyan-500/15 text-cyan-300 font-mono font-bold px-1.5 py-0.5 rounded-md border border-cyan-500/30 shrink-0">
                      KPI
                    </span>
                  </button>

                  <button
                    onClick={() => handleSwitchTab('top_customers')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'top_customers' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">Clientes & WhatsApp</span>
                    </div>
                    <span className="text-[10px] bg-emerald-500/15 text-emerald-300 font-mono font-bold px-1.5 py-0.5 rounded-md border border-emerald-500/30 shrink-0">
                      Top
                    </span>
                  </button>

                  <button
                    onClick={() => handleSwitchTab('referrals')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'referrals' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Share2 className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="truncate">Referidos & Creadores</span>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSwitchTab('users')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'users' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Users className="w-4 h-4 shrink-0" />
                      <span className="truncate">Cuentas de Usuarios</span>
                    </div>
                    <span className="text-[10px] bg-gray-900 text-gray-300 font-mono font-bold px-2 py-0.5 rounded-md border border-gray-800 shrink-0">
                      {users.length}
                    </span>
                  </button>

                  <button
                    onClick={() => handleSwitchTab('general')}
                    className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-between text-left cursor-pointer ${
                      activeAdminTab === 'general' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Settings className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="truncate">Administración General</span>
                    </div>
                  </button>
                </nav>
              </div>
            </div>

            {/* Sidebar Footer Branding */}
            <div className="pt-6 mt-6 border-t border-gray-900 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-white">RYYCO Admin</p>
                <p className="text-[9px] text-gray-500">© 2025 Todos los derechos reservados</p>
              </div>
            </div>

          </aside>

          {/* Fixed Mobile Bottom Navigation Bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#090b12]/95 backdrop-blur-xl border-t border-gray-800/80 px-3 py-2 flex items-center gap-2 overflow-x-auto scroll-smooth no-scrollbar shadow-2xl">
            <button
              onClick={() => handleSwitchTab('subscriptions')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'subscriptions'
                  ? 'text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Sparkles className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Suscripciones</span>
            </button>

            <button
              onClick={() => handleSwitchTab('stores')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'stores'
                  ? 'text-pink-400 font-bold bg-pink-500/10 border border-pink-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Store className="w-5 h-5 text-pink-400" />
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Tiendas</span>
            </button>

            <button
              onClick={() => handleSwitchTab('payments')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'payments'
                  ? 'text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <div className="relative">
                <CreditCard className="w-5 h-5" />
                {allPayments.filter(p => p.status === 'review').length > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white font-mono text-[8px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                    {allPayments.filter(p => p.status === 'review').length}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Transferencias</span>
            </button>

            <button
              onClick={() => handleSwitchTab('orders')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'orders'
                  ? 'text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <div className="relative">
                <ShoppingBag className="w-5 h-5" />
                {pendingOrdersCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-amber-400 text-black font-mono text-[8.5px] font-black px-1.5 py-0.2 rounded-full animate-pulse shadow-md">
                    {pendingOrdersCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Pedidos</span>
            </button>

            <button
              onClick={() => handleSwitchTab('order_times')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'order_times'
                  ? 'text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Timer className="w-5 h-5 text-amber-400" />
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Tiempos</span>
            </button>

            <button
              onClick={() => handleSwitchTab('drivers')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'drivers'
                  ? 'text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Bike className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Domicilios</span>
            </button>

            <button
              onClick={() => handleSwitchTab('sales_stats')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'sales_stats'
                  ? 'text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Estadísticas</span>
            </button>

            <button
              onClick={() => handleSwitchTab('top_customers')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'top_customers'
                  ? 'text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <MessageCircle className="w-5 h-5 text-emerald-400" />
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Clientes WhatsApp</span>
            </button>

            <button
              onClick={() => handleSwitchTab('referrals')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'referrals'
                  ? 'text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Share2 className="w-5 h-5 text-indigo-400" />
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Referidos</span>
            </button>

            <button
              onClick={() => handleSwitchTab('users')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'users'
                  ? 'text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <div className="relative">
                <Users className="w-5 h-5" />
                {users.length > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-gray-700 text-gray-200 font-mono text-[8px] font-bold px-1.5 py-0.2 rounded-full">
                    {users.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Usuarios</span>
            </button>

            <button
              onClick={() => handleSwitchTab('general')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'general'
                  ? 'text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Settings className="w-5 h-5 text-amber-400" />
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Ajustes</span>
            </button>
          </div>

          {/* Right Main Area */}
          <main className="flex-1 w-full min-w-0 space-y-6">

            {notif && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs p-4 rounded-xl flex items-center gap-2 font-semibold">
                <TrendingUp className="w-4 h-4 shrink-0" />
                <span>{notif}</span>
              </div>
            )}

            {/* Global Dashboard Metrics Cards - Only visible in Suscripciones Activas & Registro */}
            {activeAdminTab === 'subscriptions' && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 animate-fade-in">
                <div 
                  onClick={() => handleSwitchTab('users')}
                  className="bg-[#0b101d] border border-gray-800/80 p-4 rounded-2xl shadow-lg hover:border-gray-700 transition cursor-pointer group"
                  title="Ver lista de usuarios registrados"
                >
                  <div className="flex justify-between items-center text-gray-400 mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 group-hover:text-emerald-400 transition">
                      USUARIOS TOTALES
                    </span>
                    <Users className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-black text-white mb-1">
                    {Math.max(stats.totalUsers, users.length)}
                  </p>
                  <span className="text-[10px] text-emerald-400 font-bold font-mono flex items-center gap-1">
                    <span>↑ Cuentas Registradas</span>
                    <span className="text-gray-500">• Clientes y Tiendas</span>
                  </span>
                </div>

                <div className="bg-[#0b101d] border border-gray-800/80 p-4 rounded-2xl shadow-lg flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center text-gray-400 mb-2">
                      <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                        TIENDAS ACTIVAS Y EXPIRADAS
                      </span>
                      <Layers className="w-4 h-4 text-emerald-400 shrink-0 ml-1" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 my-1 bg-gray-900/60 p-2 rounded-xl border border-gray-800/70">
                      <button
                        type="button"
                        onClick={() => setSelectedSubscriptionStatusFilter(selectedSubscriptionStatusFilter === 'active' ? 'all' : 'active')}
                        className={`flex flex-col text-left p-1.5 rounded-lg transition cursor-pointer ${
                          selectedSubscriptionStatusFilter === 'active' 
                            ? 'bg-emerald-950/40 ring-1 ring-emerald-500/50' 
                            : 'hover:bg-gray-800/50'
                        }`}
                        title="Filtrar tiendas activas"
                      >
                        <span className="text-[9.5px] sm:text-[10px] font-bold text-gray-400 flex items-center gap-1 uppercase tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                          Activas
                        </span>
                        <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono mt-0.5">
                          {users.length > 0 ? activeSubscriptionsCount : ((stats as any).activeStoresCount ?? stats.totalProfiles ?? 0)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedSubscriptionStatusFilter(selectedSubscriptionStatusFilter === 'expired' ? 'all' : 'expired')}
                        className={`flex flex-col text-left border-l border-gray-800/80 pl-2 p-1.5 rounded-lg transition cursor-pointer ${
                          selectedSubscriptionStatusFilter === 'expired' 
                            ? 'bg-red-950/40 ring-1 ring-red-500/50' 
                            : 'hover:bg-gray-800/50'
                        }`}
                        title="Filtrar tiendas expiradas para cobro"
                      >
                        <span className="text-[9.5px] sm:text-[10px] font-bold text-gray-400 flex items-center gap-1 uppercase tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                          Expiradas
                        </span>
                        <span className="text-lg sm:text-xl font-black text-red-400 font-mono mt-0.5">
                          {users.length > 0 ? expiredSubscriptionsCount : ((stats as any).expiredStoresCount ?? 0)}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 pt-1.5 border-t border-gray-800/80 flex items-center justify-between text-[10.5px] font-mono">
                    <span className="text-gray-400 font-bold">Total Tiendas:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSubscriptionStatusFilter('all')}
                      className={`text-white font-black px-2 py-0.5 rounded-md border text-[11px] transition cursor-pointer ${
                        selectedSubscriptionStatusFilter === 'all'
                          ? 'bg-indigo-600 border-indigo-400'
                          : 'bg-gray-900 hover:bg-gray-800 border-gray-800'
                      }`}
                      title="Ver todas las tiendas registradas"
                    >
                      {users.length > 0 ? users.length : Math.max(stats.totalProfiles, allStoresList.length)} tiendas
                    </button>
                  </div>
                </div>

                <div className="col-span-2 lg:col-span-1 bg-[#0b101d] border border-gray-800/80 p-4 rounded-2xl shadow-lg flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center text-gray-400 mb-2">
                      <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                        INGRESO MENSUAL COP
                      </span>
                      <DollarSign className="w-4 h-4 text-emerald-400 shrink-0 ml-1" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 my-1 bg-gray-900/60 p-2 rounded-xl border border-gray-800/70">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[9.5px] sm:text-[10px] font-bold text-gray-400 flex items-center gap-1 uppercase tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse shrink-0"></span>
                          <span className="truncate">Activos</span>
                        </span>
                        <span className="text-sm sm:text-base font-black text-emerald-400 font-mono mt-0.5 truncate" title={`$${((stats as any).activeRevenue ?? stats.monthlyRevenue ?? 0).toLocaleString('es-CO')} COP`}>
                          ${((stats as any).activeRevenue ?? stats.monthlyRevenue ?? 0).toLocaleString('es-CO')}
                        </span>
                      </div>

                      <div className="flex flex-col border-l border-gray-800/80 pl-2 min-w-0">
                        <span className="text-[9.5px] sm:text-[10px] font-bold text-gray-400 flex items-center gap-1 uppercase tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block shrink-0"></span>
                          <span className="truncate">Esperado</span>
                        </span>
                        <span className="text-sm sm:text-base font-black text-sky-400 font-mono mt-0.5 truncate" title={`$${((stats as any).expectedRevenue ?? ((stats as any).activeRevenue ? (stats as any).activeRevenue + ((stats as any).pendingRecovery || 0) : stats.monthlyRevenue)).toLocaleString('es-CO')} COP`}>
                          ${((stats as any).expectedRevenue ?? ((stats as any).activeRevenue ? (stats as any).activeRevenue + ((stats as any).pendingRecovery || 0) : stats.monthlyRevenue)).toLocaleString('es-CO')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-1.5 pt-1.5 border-t border-gray-800/80 flex items-center justify-between text-[10.5px] font-mono">
                    <span className="text-gray-400 font-bold">Por recuperar:</span>
                    <span className="text-amber-400 font-black bg-gray-900 px-2 py-0.5 rounded-md border border-gray-800 text-[10.5px]">
                      ${Math.max(0, (((stats as any).expectedRevenue ?? stats.monthlyRevenue) - ((stats as any).activeRevenue ?? stats.monthlyRevenue))).toLocaleString('es-CO')}
                    </span>
                  </div>
                </div>
              </div>
            )}

        {activeAdminTab === 'referrals' ? (
          <div className="animate-fade-in">
            <AdminReferralsManager />
          </div>
        ) : activeAdminTab === 'drivers' ? (
          <div className="animate-fade-in">
            <AdminDriversManager />
          </div>
        ) : activeAdminTab === 'sales_stats' ? (
          <div className="animate-fade-in">
            <AdminSalesStats
              allOrders={allOrders}
              storesMap={storesMap}
              allStores={allStoresList}
              onGoToOrders={(storeUid) => {
                if (storeUid) setSelectedOrderStoreFilter(storeUid);
                handleSwitchTab('orders');
              }}
            />
          </div>
        ) : activeAdminTab === 'top_customers' ? (
          <div className="animate-fade-in">
            <AdminCustomersRanking
              allOrders={allOrders}
              storesMap={storesMap}
              allStores={allStoresList}
              onGoToOrders={(storeUid) => {
                if (storeUid) setSelectedOrderStoreFilter(storeUid);
                handleSwitchTab('orders');
              }}
            />
          </div>
        ) : activeAdminTab === 'stores' ? (
          <div className="animate-fade-in">
            <AdminStoresManager
              storesMap={storesMap}
              allStores={allStoresList}
              users={users}
              allOrders={allOrders}
              onOpenScheduleModal={handleOpenScheduleModal}
              onSelectStoreOrders={(storeUid) => {
                setSelectedOrderStoreFilter(storeUid);
                handleSwitchTab('orders');
              }}
              onRefreshData={loadAdminData}
            />
          </div>
        ) : activeAdminTab === 'subscriptions' ? (
          <div className="space-y-6 animate-fade-in">
            {/* Summary statistics or info */}
            <div className="bg-gray-900/30 border border-gray-800 rounded-3xl p-6 backdrop-blur-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-900 pb-4">
                <div>
                  <h3 className="font-extrabold text-white text-base">Registro de Suscripciones & Control de Pagos</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Revisa las fechas, montos pagados, y administra de manera detallada las suscripciones activas de cada tienda en línea.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCleanTestUsers}
                    disabled={cleaningTestUsers}
                    title="Eliminar automáticamente todas las cuentas de prueba"
                    className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500 hover:text-white text-red-400 font-extrabold text-xs rounded-xl border border-red-500/30 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {cleaningTestUsers ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>Limpiar Usuarios Test</span>
                  </button>

                  <span className="text-xs text-gray-400 font-semibold font-mono ml-2">Filtrar por Estado:</span>
                  <select 
                    value={selectedSubscriptionStatusFilter}
                    onChange={(e) => setSelectedSubscriptionStatusFilter(e.target.value)}
                    className="bg-gray-950 border border-gray-800 text-white rounded-xl py-1.5 px-3 text-xs outline-none cursor-pointer focus:border-indigo-500 font-medium"
                  >
                    <option value="all">Todos los Estados</option>
                    <option value="active">🟢 Activas</option>
                    <option value="trial">🆓 Estado Gratuito (7 Días)</option>
                    <option value="expired">🔴 Expiradas</option>
                    <option value="suspended">⚠️ Suspendidas</option>
                    <option value="pending_payment">🟡 Pendiente de Pago</option>
                  </select>
                </div>
              </div>

              {/* Banner de alerta para tiendas con plan expirado / pendientes de cobro */}
              {expiredSubscriptionsCount > 0 && (
                <div className="bg-gradient-to-r from-red-950/40 via-red-900/25 to-amber-950/30 border border-red-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5 text-red-400 animate-bounce" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">
                          {expiredSubscriptionsCount} {expiredSubscriptionsCount === 1 ? 'Tienda con Plan Expirado' : 'Tiendas con Planes Expirados'}
                        </h4>
                        <span className="px-2 py-0.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded-full text-[10px] font-black font-mono">
                          Requieren Cobro
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Estas tiendas tienen su suscripción vencida. Envíales el mensaje de cobro por WhatsApp con los datos de Nequi / Bancolombia para reactivar su catálogo.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedSubscriptionStatusFilter('expired')}
                      className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 border shadow-sm ${
                        selectedSubscriptionStatusFilter === 'expired'
                          ? 'bg-red-600 text-white border-red-400 shadow-red-950/50'
                          : 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border-red-500/30'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Ver Solo Expiradas ({expiredSubscriptionsCount})</span>
                    </button>
                  </div>
                </div>
              )}

              {/* SECTION A: ACTIVE SUBSCRIPTIONS MONITOR */}
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" /> Estado de Suscripciones Activas
                </h4>
                
                {/* Mobile view: beautiful cards for cell phones */}
                <div className="block md:hidden space-y-4">
                  {displayedSubscriptions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 font-semibold">
                      {users.length === 0 ? 'Cargando tiendas...' : 'No se encontraron tiendas con el filtro seleccionado.'}
                    </div>
                  ) : (
                    displayedSubscriptions.map((user) => {
                      const anchorDay = getSubscriptionAnchorDay(user);
                      const daysRemaining = getSubscriptionDaysRemaining(user.subscriptionPaidUntil);
                      const { isExpired, isSuspended, effectiveStatus } = isSubscriptionExpiredOrSuspended(user);
                      const trialDaysRemaining = getSubscriptionDaysRemaining(user.subscriptionTrialExpires || (user.createdAt ? new Date(new Date(user.createdAt).getTime() + 7 * 86400000).toISOString() : null));
                      const planPrice = user.subscriptionPlan === 'pro' ? 99000 : user.subscriptionPlan === 'medio' ? 79000 : 49000;
                      const isClosedNow = checkIsStoreClosed(user);

                      const formatSpanishDate = (dateStr?: string | null) => {
                        if (!dateStr) return 'No registrada';
                        const d = new Date(dateStr);
                        if (isNaN(d.getTime())) return 'No registrada';
                        return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
                      };

                      return (
                        <div key={user.uid} className="bg-gray-950 border border-gray-900 p-4 rounded-2xl space-y-3.5 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-extrabold text-white text-[13px]">{user.storeName || user.username || 'Tienda sin Nombre'}</div>
                              <div className="text-[10px] text-gray-500 font-mono">@{user.username}</div>
                              <div className="text-[10px] text-gray-500 font-mono">{user.email}</div>
                              {/* WhatsApp Contact Badges */}
                              <div className="mt-2 space-y-1">
                                {(user.ownerWhatsapp || user.whatsapp || user.phone) ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCobroModal(user)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition shadow-sm active:scale-95 border cursor-pointer ${
                                      effectiveStatus === 'expired' || effectiveStatus === 'suspended'
                                        ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-400/40'
                                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25'
                                    }`}
                                    title="Abrir cobro / mensaje por WhatsApp al Propietario"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span>👑 Dueño: +57 {formatWhatsAppDisplay(user.ownerWhatsapp || user.whatsapp || user.phone)}</span>
                                    {(effectiveStatus === 'expired' || effectiveStatus === 'suspended') && (
                                      <span className="ml-1 px-1.5 py-0.2 bg-red-500/25 text-red-300 rounded text-[9px] font-black border border-red-500/40 uppercase">
                                        Cobrar
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCobroModal(user)}
                                    className="inline-block text-[9.5px] text-amber-500/80 hover:text-amber-400 font-mono italic cursor-pointer"
                                    title="Clic para ingresar teléfono y cobrar"
                                  >
                                    Sin WhatsApp (clic para cobrar)
                                  </button>
                                )}

                                {user.customerServiceWhatsapp && (
                                  <div>
                                    <a
                                      href={getWhatsAppUrl(user.customerServiceWhatsapp)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/25 rounded-lg text-[10px] font-bold transition shadow-sm active:scale-95"
                                      title="Contactar a Línea de Atención al Cliente"
                                    >
                                      <Headphones className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                      <span>💬 Clientes: +57 {formatWhatsAppDisplay(user.customerServiceWhatsapp)}</span>
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-black uppercase rounded-lg">
                              {user.subscriptionPlan || 'Básico'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-gray-900/50">
                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-0.5">Fecha Registro:</span>
                              <strong className="text-gray-300 font-mono text-[11px] block">{formatSpanishDate(user.createdAt)}</strong>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-0.5">Días Restantes:</span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black font-mono ${
                                effectiveStatus === 'suspended'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : effectiveStatus === 'expired'
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : effectiveStatus === 'trial'
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                  : daysRemaining <= 3
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {effectiveStatus === 'suspended'
                                  ? '0 días (Suspendida)'
                                  : effectiveStatus === 'expired'
                                  ? '0 días (Expirada)'
                                  : effectiveStatus === 'trial'
                                  ? `${trialDaysRemaining} días (Gratis)`
                                  : `${daysRemaining} días`}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-900/30">
                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-0.5">Próximo Vencimiento:</span>
                              <span className={`font-mono text-[11px] block ${
                                effectiveStatus === 'suspended'
                                  ? 'text-amber-400 font-bold'
                                  : effectiveStatus === 'expired' 
                                  ? 'text-red-400 font-black' 
                                  : effectiveStatus === 'trial'
                                  ? 'text-cyan-400 font-bold'
                                  : 'text-emerald-400 font-semibold'
                              }`}>
                                {effectiveStatus === 'suspended'
                                  ? '⚠️ Suspendida por Admin'
                                  : effectiveStatus === 'expired'
                                  ? '🔴 Expirada / Vencida'
                                  : effectiveStatus === 'trial'
                                  ? `Prueba 7 Días`
                                  : user.subscriptionPaidUntil ? formatSpanishDate(user.subscriptionPaidUntil) : 'Sin pago activo'}
                              </span>
                              <span className="inline-block mt-1 px-1.5 py-0.2 bg-gray-900 text-gray-400 border border-gray-800 rounded text-[9px] font-mono">
                                {effectiveStatus === 'trial' && user.subscriptionTrialExpires
                                  ? `Vence: ${formatSpanishDate(user.subscriptionTrialExpires)}`
                                  : `Día de corte: ${anchorDay}`}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-0.5">Costo Mensual:</span>
                              <strong className="text-white text-[12px] font-mono">${planPrice.toLocaleString()} COP</strong>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2">
                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-1">Apertura Tienda:</span>
                              <button
                                type="button"
                                onClick={() => handleToggleStoreClosedStatus(user)}
                                title={`Estado actual (${isClosedNow ? 'Cerrada' : 'Abierta'}). Clic para cambiar estado manual.`}
                                className={`w-full py-2 rounded-xl text-[10.5px] font-black uppercase transition duration-150 border cursor-pointer ${
                                  isClosedNow
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                }`}
                              >
                                {isClosedNow ? '🔴 Cerrada' : '🟢 Abierta'}
                              </button>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-1">Suscripción:</span>
                              <select
                                value={effectiveStatus}
                                onChange={(e) => handleUpdateSubscriptionStatus(user.uid, e.target.value)}
                                className={`w-full rounded-xl py-2 px-2 text-[10.5px] uppercase font-black border cursor-pointer outline-none text-center ${
                                  effectiveStatus === 'suspended'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-black'
                                    : effectiveStatus === 'expired' 
                                    ? 'bg-red-500/20 text-red-400 border-red-500/40 font-black'
                                    : effectiveStatus === 'active' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                    : effectiveStatus === 'trial'
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-black'
                                    : effectiveStatus === 'under_review'
                                    ? 'bg-amber-500/30 text-amber-300 border-amber-500/40 font-black'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}
                              >
                                <option value="active" className="bg-gray-950 text-emerald-400">🟢 ACTIVA</option>
                                <option value="under_review" className="bg-gray-950 text-amber-300 font-bold">🟡 EN REVISIÓN</option>
                                <option value="trial" className="bg-gray-950 text-cyan-300 font-bold">🆓 ESTADO GRATUITO</option>
                                <option value="suspended" className="bg-gray-950 text-amber-300">⚠️ SUSPENDIDA</option>
                                <option value="expired" className="bg-gray-950 text-red-400">🔴 EXPIRADA</option>
                                <option value="pending_payment" className="bg-gray-950 text-amber-400">🟡 PENDIENTE</option>
                              </select>
                            </div>
                          </div>

                          {/* Botón Destacado para Cobrar Plan por WhatsApp */}
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleOpenCobroModal(user)}
                              className={`w-full py-2.5 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] border shadow-md ${
                                effectiveStatus === 'expired' || effectiveStatus === 'suspended'
                                  ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-400/50 shadow-emerald-950/50 animate-pulse hover:animate-none'
                                  : effectiveStatus === 'trial'
                                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-cyan-400/50 shadow-cyan-950/40'
                                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                              }`}
                              title={`Abrir panel de cobro por WhatsApp a ${user.storeName || user.username} ($${planPrice.toLocaleString('es-CO')} COP)`}
                            >
                              <MessageCircle className="w-4 h-4 fill-current shrink-0" />
                              <span>
                                {effectiveStatus === 'expired'
                                  ? `Cobrar Plan Vencido ($${planPrice.toLocaleString('es-CO')} COP)`
                                  : effectiveStatus === 'suspended'
                                  ? `Cobrar Reactivación ($${planPrice.toLocaleString('es-CO')} COP)`
                                  : effectiveStatus === 'trial'
                                  ? `Cobrar Activación Plan ($${planPrice.toLocaleString('es-CO')} COP)`
                                  : `Cobrar Plan / Recordatorio ($${planPrice.toLocaleString('es-CO')} COP)`}
                              </span>
                              {(effectiveStatus === 'expired' || effectiveStatus === 'suspended') && (
                                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-ping ml-1" />
                              )}
                            </button>
                          </div>

                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleOpenScheduleModal(user)}
                              className="w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-xl text-[10.5px] font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Horario: {getAdminUserScheduleSummary(user)}</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setExtendModalMonths(1);
                                setConfirmExtendModalUser(user);
                              }}
                              title={`Ajustar mes (+1 / -1) manteniendo el día de corte (${anchorDay})`}
                              className="py-2.5 px-2 bg-indigo-500/15 hover:bg-indigo-500 text-indigo-400 hover:text-white font-black text-[10px] tracking-wider uppercase rounded-xl border border-indigo-500/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              <span>Ajustar Mes</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePage(user)}
                              disabled={deletingUserId === user.uid}
                              title="Eliminar esta página/tienda"
                              className="py-2.5 px-2 bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white font-black text-[10px] tracking-wider uppercase rounded-xl border border-red-500/25 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {deletingUserId === user.uid ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              <span>Eliminar</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Desktop table view */}
                <div className="hidden md:block overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 text-[10px] text-gray-450 uppercase font-black tracking-widest bg-gray-900/15">
                        <th className="py-3 px-4">Tienda / Vendedor</th>
                        <th className="py-3 px-4">Fecha Registro</th>
                        <th className="py-3 px-4">Próximo Vencimiento (Día Corte)</th>
                        <th className="py-3 px-4 text-center">Días Restantes</th>
                        <th className="py-3 px-4 text-center">Apertura Tienda</th>
                        <th className="py-3 px-4 text-center">Estado Suscripción</th>
                        <th className="py-3 px-4 text-right">Acciones de Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-850 text-xs">
                      {displayedSubscriptions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-gray-500 font-semibold">
                            {users.length === 0 ? 'Cargando tiendas...' : 'No se encontraron tiendas con el filtro seleccionado.'}
                          </td>
                        </tr>
                      ) : (
                        displayedSubscriptions.map((user) => {
                          const anchorDay = getSubscriptionAnchorDay(user);
                          const daysRemaining = getSubscriptionDaysRemaining(user.subscriptionPaidUntil);
                          const { isExpired, isSuspended, effectiveStatus } = isSubscriptionExpiredOrSuspended(user);
                          const trialDaysRemaining = getSubscriptionDaysRemaining(user.subscriptionTrialExpires || (user.createdAt ? new Date(new Date(user.createdAt).getTime() + 7 * 86400000).toISOString() : null));
                          const planPrice = user.subscriptionPlan === 'pro' ? 99000 : user.subscriptionPlan === 'medio' ? 79000 : 49000;
                          const isClosedNow = checkIsStoreClosed(user);

                          const formatSpanishDate = (dateStr?: string | null) => {
                            if (!dateStr) return 'No registrada';
                            const d = new Date(dateStr);
                            if (isNaN(d.getTime())) return 'No registrada';
                            return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
                          };
                          
                          return (
                            <tr key={user.uid} className="hover:bg-gray-900/10 transition duration-150">
                              <td className="py-3.5 px-4">
                                <div className="font-extrabold text-white text-xs">{user.storeName || user.username || 'Tienda sin Nombre'}</div>
                                <div className="text-[10px] text-gray-500 font-mono">@{user.username} • {user.email}</div>
                                {/* WhatsApp badges */}
                                <div className="mt-1.5 space-y-1">
                                  {(user.ownerWhatsapp || user.whatsapp || user.phone) ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenCobroModal(user)}
                                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9.5px] font-bold transition shadow-sm border cursor-pointer ${
                                        effectiveStatus === 'expired' || effectiveStatus === 'suspended'
                                          ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-400/40'
                                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25'
                                      }`}
                                      title="Abrir cobro / mensaje por WhatsApp al Propietario"
                                    >
                                      <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span>👑 Dueño: +57 {formatWhatsAppDisplay(user.ownerWhatsapp || user.whatsapp || user.phone)}</span>
                                      {(effectiveStatus === 'expired' || effectiveStatus === 'suspended') && (
                                        <span className="ml-1 px-1 py-0.2 bg-red-500/25 text-red-300 rounded text-[8.5px] font-black border border-red-500/40 uppercase">
                                          Cobrar
                                        </span>
                                      )}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenCobroModal(user)}
                                      className="text-[9.5px] text-amber-500/80 hover:text-amber-400 font-mono italic cursor-pointer block"
                                      title="Clic para ingresar teléfono y cobrar"
                                    >
                                      Sin WhatsApp (cobrar)
                                    </button>
                                  )}

                                  {user.customerServiceWhatsapp && (
                                    <div>
                                      <a
                                        href={getWhatsAppUrl(user.customerServiceWhatsapp)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/25 rounded-md text-[9.5px] font-bold transition shadow-sm"
                                        title="Contactar a Línea de Atención al Cliente"
                                      >
                                        <Headphones className="w-3 h-3 text-sky-400 shrink-0" />
                                        <span>💬 Clientes: +57 {formatWhatsAppDisplay(user.customerServiceWhatsapp)}</span>
                                      </a>
                                    </div>
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <span className="uppercase font-black font-mono text-indigo-400 text-[9px] bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                    {user.subscriptionPlan || 'Básico'}
                                  </span>
                                  <span className="font-mono text-gray-400 text-[10px]">
                                    ${planPrice.toLocaleString()} COP
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-gray-300 text-xs">
                                {formatSpanishDate(user.createdAt)}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-gray-300">
                                <div className={`font-mono text-xs ${
                                  effectiveStatus === 'suspended'
                                    ? 'text-amber-400 font-bold'
                                    : effectiveStatus === 'expired' 
                                    ? 'text-red-400 font-black' 
                                    : effectiveStatus === 'trial'
                                    ? 'text-cyan-400 font-bold'
                                    : 'text-emerald-400 font-semibold'
                                }`}>
                                  {effectiveStatus === 'suspended'
                                    ? '⚠️ Suspendida por Admin'
                                    : effectiveStatus === 'expired'
                                    ? '🔴 Expirada / Vencida'
                                    : effectiveStatus === 'trial'
                                    ? `Prueba 7 Días`
                                    : user.subscriptionPaidUntil ? formatSpanishDate(user.subscriptionPaidUntil) : 'Sin pago activo'}
                                </div>
                                <div className="mt-1">
                                  <span className="px-2 py-0.5 bg-gray-900 text-gray-400 border border-gray-800 rounded text-[9.5px] font-mono font-bold">
                                    {effectiveStatus === 'trial' && user.subscriptionTrialExpires
                                      ? `Vence: ${formatSpanishDate(user.subscriptionTrialExpires)}`
                                      : `Día de corte: ${anchorDay}`}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black font-mono ${
                                  effectiveStatus === 'suspended'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : effectiveStatus === 'expired'
                                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                    : effectiveStatus === 'trial'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : daysRemaining <= 3
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}>
                                  {effectiveStatus === 'suspended'
                                    ? '0 días (Suspendida)'
                                    : effectiveStatus === 'expired'
                                    ? '0 días (Expirada)'
                                    : effectiveStatus === 'trial'
                                    ? `${trialDaysRemaining} días (Gratis)`
                                    : `${daysRemaining} días`}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStoreClosedStatus(user)}
                                    title={`Estado actual (${isClosedNow ? 'Cerrada' : 'Abierta'}). Clic para cambiar estado manual.`}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition duration-150 border cursor-pointer inline-flex items-center gap-1.5 ${
                                      isClosedNow
                                        ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/30 shadow-sm'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/30 shadow-sm'
                                    }`}
                                  >
                                    <Store className="w-3 h-3" />
                                    <span>{isClosedNow ? '🔴 Cerrada' : '🟢 Abierta'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenScheduleModal(user)}
                                    title="Configurar horario de apertura y cierre de la tienda"
                                    className="px-2 py-0.5 rounded-lg text-[9.5px] font-extrabold text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition cursor-pointer flex items-center gap-1"
                                  >
                                    <Clock className="w-3 h-3 text-indigo-400" />
                                    <span>{getAdminUserScheduleSummary(user)}</span>
                                  </button>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <select
                                  value={effectiveStatus}
                                  onChange={(e) => handleUpdateSubscriptionStatus(user.uid, e.target.value)}
                                  className={`rounded-lg py-1 px-2 text-[10px] uppercase font-black border cursor-pointer outline-none ${
                                    effectiveStatus === 'suspended'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-black'
                                      : effectiveStatus === 'expired' 
                                      ? 'bg-red-500/20 text-red-400 border-red-500/40 font-black'
                                      : effectiveStatus === 'active' 
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                      : effectiveStatus === 'trial'
                                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-black'
                                      : effectiveStatus === 'under_review'
                                      ? 'bg-amber-500/30 text-amber-300 border-amber-500/40 font-black'
                                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  }`}
                                >
                                  <option value="active" className="bg-gray-950 text-emerald-400">🟢 ACTIVA</option>
                                  <option value="under_review" className="bg-gray-950 text-amber-300 font-bold">🟡 EN REVISIÓN</option>
                                  <option value="trial" className="bg-gray-950 text-cyan-300 font-bold">🆓 ESTADO GRATUITO</option>
                                  <option value="suspended" className="bg-gray-950 text-amber-300">⚠️ SUSPENDIDA</option>
                                  <option value="expired" className="bg-gray-950 text-red-400">🔴 EXPIRADA</option>
                                  <option value="pending_payment" className="bg-gray-950 text-amber-400">🟡 PENDIENTE</option>
                                </select>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCobroModal(user)}
                                    title={`Cobrar plan por WhatsApp a ${user.storeName || user.username} ($${planPrice.toLocaleString('es-CO')} COP)`}
                                    className={`px-2.5 py-1.5 font-black text-[10px] tracking-wider uppercase rounded-lg border transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 ${
                                      effectiveStatus === 'expired' || effectiveStatus === 'suspended'
                                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-400/50 shadow-emerald-950/40 animate-pulse hover:animate-none'
                                        : effectiveStatus === 'trial'
                                        ? 'bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border-cyan-500/30'
                                        : 'bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400 border-emerald-500/25'
                                    }`}
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 fill-current" />
                                    <span>Cobrar</span>
                                    {(effectiveStatus === 'expired' || effectiveStatus === 'suspended') && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExtendModalMonths(1);
                                      setConfirmExtendModalUser(user);
                                    }}
                                    title={`Ajustar mes (+1 / -1) conservando el día de corte ${anchorDay}`}
                                    className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white text-indigo-400 font-black text-[10px] tracking-wider uppercase rounded-lg border border-indigo-500/25 transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                                  >
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>Ajustar Mes</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePage(user)}
                                    disabled={deletingUserId === user.uid}
                                    title="Eliminar permanentemente esta página"
                                    className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 font-black text-[10px] tracking-wider uppercase rounded-lg border border-red-500/25 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                  >
                                    {deletingUserId === user.uid ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                    <span>Eliminar</span>
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

                {/* Lazy loading / Infinite scroll controls & sentinel for Subscriptions (7 items per batch) */}
                <div className="pt-2 pb-1 space-y-2">
                  <div ref={subsSentinelRef} className="h-4 w-full" />
                  
                  {loadingMoreSubs && (
                    <div className="flex items-center justify-center gap-2.5 py-3 text-xs font-bold text-amber-400 bg-amber-500/10 rounded-2xl border border-amber-500/20 animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      <span>Cargando los siguientes 7 registros desde la base de datos...</span>
                    </div>
                  )}

                  {!loadingMoreSubs && hasMoreSubs && users.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-950/80 p-3 rounded-2xl border border-gray-900 text-xs">
                      <span className="text-gray-400 font-mono text-[11px]">
                        Mostrando <strong className="text-amber-400 font-bold">{users.length}</strong> registros iniciales. Desplázate hacia abajo para autocargar los siguientes 7.
                      </span>
                      <button
                        type="button"
                        onClick={handleLoadMoreSubscriptions}
                        className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-xs rounded-xl border border-amber-500/30 transition cursor-pointer flex items-center gap-2 shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Cargar siguientes 7</span>
                      </button>
                    </div>
                  )}

                  {!hasMoreSubs && users.length > 0 && (
                    <div className="text-center py-2.5 text-[11px] text-gray-500 font-mono bg-gray-950/40 rounded-xl border border-gray-900/60">
                      ✓ Todos los {users.length} registros de suscripciones disponibles han sido cargados.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : activeAdminTab === 'payments' ? (
          <div className="bg-gray-900/30 border border-gray-800 rounded-3xl p-6 backdrop-blur-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-900 pb-4">
              <div>
                <h3 className="font-extrabold text-white text-base">Validación de Transferencias Bancarias</h3>
                <p className="text-[11px] text-gray-500 font-medium font-sans">Revisa las capturas de transferencias reportadas por los vendedores, confirma su validez en tu cuenta de Nequi / Banco y aprueba para activar su plan correspondiente.</p>
              </div>
            </div>

            {allPayments.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-xs font-semibold">
                No se han cargado comprobantes de transferencias bancarias en la plataforma aún.
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[10px] text-gray-450 uppercase font-black tracking-widest bg-gray-900/15">
                      <th className="py-4 px-4">Vendedor / Tienda</th>
                      <th className="py-2.5 px-4">Detalle Plan</th>
                      <th className="py-2.5 px-4">Monto Reportado</th>
                      <th className="py-2.5 px-4 text-center">Fianza Capture</th>
                      <th className="py-2.5 px-4">Fecha</th>
                      <th className="py-2.5 px-4 text-right">Acciones de Verificación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850 text-sm">
                    {allPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-900/10 transition">
                        <td className="py-4 px-4">
                          <div className="font-bold text-white">@{p.username}</div>
                          <div className="text-[10px] text-gray-500 font-semibold">{p.storeName}</div>
                          <div className="text-[9px] text-gray-550 font-mono">{p.userEmail}</div>
                          {(() => {
                            const ownerNumber = p.ownerWhatsapp || p.storeWhatsapp || p.storePhone || storesMap[p.userId]?.ownerWhatsapp || storesMap[p.userId]?.whatsapp || storesMap[p.userId]?.phone || users.find(u => u.uid === p.userId)?.ownerWhatsapp || users.find(u => u.uid === p.userId)?.whatsapp || users.find(u => u.uid === p.userId)?.phone;
                            const customerNumber = p.customerServiceWhatsapp || storesMap[p.userId]?.customerServiceWhatsapp || users.find(u => u.uid === p.userId)?.customerServiceWhatsapp;

                            return (
                              <div className="mt-1.5 space-y-1">
                                {ownerNumber ? (
                                  <a
                                    href={getWhatsAppUrl(ownerNumber)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-[9.5px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/25 transition cursor-pointer"
                                    title="Contactar al dueño para verificar comprobante"
                                  >
                                    <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <span>👑 Dueño: +57 {formatWhatsAppDisplay(ownerNumber)}</span>
                                  </a>
                                ) : (
                                  <div className="text-[9.5px] text-gray-600 italic">Sin WhatsApp del dueño</div>
                                )}

                                {customerNumber && (
                                  <div>
                                    <a
                                      href={getWhatsAppUrl(customerNumber)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-[9.5px] font-bold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 px-2 py-0.5 rounded-md border border-sky-500/25 transition cursor-pointer"
                                      title="Línea de Atención al Cliente de la tienda"
                                    >
                                      <Headphones className="w-3 h-3 text-sky-400 shrink-0" />
                                      <span>💬 Clientes: +57 {formatWhatsAppDisplay(customerNumber)}</span>
                                    </a>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-4 px-4 font-semibold">
                          <span className={`text-xs uppercase font-black block ${
                            p.plan === 'medio' ? 'text-indigo-400' : p.plan === 'pro' || p.plan === 'avanzado' ? 'text-purple-400' : 'text-emerald-400'
                          }`}>
                            {p.plan === 'medio' ? 'Plan Medio (12 prod.)' : p.plan === 'pro' || p.plan === 'avanzado' ? 'Plan Avanzado (24 prod.)' : 'Plan Básico (5 prod.)'}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium">Solicitud de Activación</span>
                        </td>
                        <td className="py-4 px-4 font-mono font-bold text-white">
                          ${p.amount.toLocaleString()} COP
                        </td>
                        <td className="py-4 px-4 text-center">
                          {p.proofImage ? (
                            <button
                              type="button"
                              onClick={() => setViewingProofImg(p.proofImage)}
                              className="px-2.5 py-1.5 bg-gray-950 hover:bg-gray-900 border border-gray-800 rounded-lg text-[10.5px] font-black text-gray-450 hover:text-white transition flex items-center gap-1.5 mx-auto"
                            >
                              <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                              Ver capture
                            </button>
                          ) : (
                            <span className="text-gray-600 text-xs italic">Sin imagen</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-gray-500 text-[10.5px] font-medium font-mono">
                          {new Date(p.createdAt).toLocaleString()}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {p.status === 'review' ? (
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => handleApprovePayment(p)}
                                className="px-3 h-8 bg-emerald-555 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl flex items-center gap-1 transition shadow-md bg-emerald-450"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                Aprobar Pago
                              </button>
                              <button
                                onClick={() => handleRejectPayment(p)}
                                className="px-3 h-8 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold rounded-xl flex items-center gap-1 transition"
                              >
                                <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded ${
                              p.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                              {p.status === 'approved' ? 'APROBADO' : 'RECHAZADO'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeAdminTab === 'orders' ? (
          <div className="bg-gray-900/30 border border-gray-800 rounded-3xl p-3.5 sm:p-6 backdrop-blur-sm space-y-5 max-w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-900 pb-4">
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <h3 className="font-extrabold text-white text-base">Sincronización General de Pedidos de Tiendas</h3>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    En tiempo real
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 font-medium font-sans">
                  Monitorea de manera centralizada los pedidos, estados de entrega y datos de contacto de todos los clientes en la plataforma.
                </p>
              </div>

              {/* Notification, Sound and FCM Vibration Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {pushPermission !== 'granted' ? (
                  <button
                    type="button"
                    onClick={requestPushPermission}
                    disabled={isRequestingFCM}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                    title="Activar notificaciones PUSH con Firebase Cloud Messaging (FCM) para pedidos generales"
                  >
                    <Bell className={`w-3.5 h-3.5 text-amber-400 ${isRequestingFCM ? 'animate-spin' : 'animate-pulse'}`} />
                    <span>{isRequestingFCM ? 'Activando FCM...' : 'Activar PUSH (FCM)'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-xl text-xs font-bold font-mono">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span>FCM Push Activo</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowFCMDetails(!showFCMDetails)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-900/90 hover:bg-gray-800 text-gray-300 border border-gray-700/60 rounded-xl text-[11px] font-medium transition cursor-pointer"
                      title="Ver estado de la conexión FCM y token registrado"
                    >
                      <Smartphone className="w-3 h-3 text-cyan-400" />
                      <span>{fcmToken ? 'Token OK' : 'FCM Config'}</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleTestFCMPush}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                  title="Simular un pedido entrante con notificación PUSH de Firebase, sonido y vibración"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Probar Push FCM</span>
                </button>

                <button
                  type="button"
                  onClick={playOrderAlertSound}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition cursor-pointer"
                  title="Probar sonido de campana y voz sintetizada"
                >
                  <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Sonido</span>
                </button>
              </div>
            </div>

            {/* FCM Connection Details Drawer */}
            {showFCMDetails && (
              <div className="bg-gray-950/95 border border-cyan-500/30 rounded-2xl p-4 text-xs space-y-3 text-gray-300 shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <span className="font-bold text-white text-sm">Firebase Cloud Messaging (FCM) & Push</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Switch tabs: Admin vs Sellers */}
                    <div className="flex bg-gray-900 rounded-xl p-0.5 border border-gray-800">
                      <button
                        type="button"
                        onClick={() => setFcmActiveTab('admin')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          fcmActiveTab === 'admin'
                            ? 'bg-cyan-500 text-black shadow'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Admin General
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFcmActiveTab('sellers');
                          loadSellerTokens();
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          fcmActiveTab === 'sellers'
                            ? 'bg-emerald-500 text-black shadow'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        <span>Vendedores</span>
                        <span className="bg-black/30 text-current px-1.5 py-0.2 rounded-full text-[10px]">
                          {sellerTokens.length}
                        </span>
                      </button>
                    </div>

                    <button 
                      type="button" 
                      onClick={() => setShowFCMDetails(false)}
                      className="text-gray-500 hover:text-white p-1 ml-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {fcmActiveTab === 'admin' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      <div className="p-2.5 bg-gray-900/80 rounded-xl border border-gray-800">
                        <p className="text-[10px] text-gray-500 font-mono uppercase">Recepción de Pedidos</p>
                        <p className="text-white font-semibold flex items-center gap-1 mt-0.5 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Todas las tiendas en vivo (Firestore + SSE)</span>
                        </p>
                      </div>
                      <div className="p-2.5 bg-gray-900/80 rounded-xl border border-gray-800">
                        <p className="text-[10px] text-gray-500 font-mono uppercase">Permiso Notificaciones</p>
                        <p className="text-white font-semibold flex items-center gap-1 mt-0.5 text-xs">
                          <span className={`w-2 h-2 rounded-full ${pushPermission === 'granted' ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                          <span className="capitalize">{pushPermission}</span>
                        </p>
                      </div>
                      <div className="p-2.5 bg-gray-900/80 rounded-xl border border-gray-800">
                        <p className="text-[10px] text-gray-500 font-mono uppercase">Clave VAPID Web Push</p>
                        <p className="text-white font-semibold flex items-center gap-1 mt-0.5 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="font-mono text-[11px] truncate" title={DEFAULT_FCM_VAPID_KEY}>Configurada ({DEFAULT_FCM_VAPID_KEY.slice(0, 10)}...{DEFAULT_FCM_VAPID_KEY.slice(-6)})</span>
                        </p>
                      </div>
                    </div>

                    {fcmToken && (
                      <div className="p-2.5 bg-gray-900/80 rounded-xl border border-gray-800 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-500 font-mono">TOKEN FCM REGISTRADO DEL DISPOSITIVO ADMIN:</p>
                          <p className="text-[10px] text-cyan-300 font-mono truncate">{fcmToken}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              const currentAdmin = auth.currentUser;
                              const ok = await registerAdminFCMTokenWithServer(fcmToken, {
                                uid: currentAdmin?.uid || 'admin_user',
                                email: currentAdmin?.email || PRIMARY_ADMIN_EMAIL,
                                name: currentAdmin?.displayName || 'Administración General RYYCO'
                              });
                              setNotif(ok ? "✅ Token sincronizado exitosamente con el servidor FCM" : "⚠️ Error sincronizando token con servidor");
                              setTimeout(() => setNotif(''), 3500);
                            }}
                            className="px-2.5 py-1 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 border border-cyan-800/60 rounded-lg text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                            title="Re-sincronizar token en la memoria del servidor Node.js"
                          >
                            <RefreshCw className="w-3 h-3 text-cyan-400" />
                            <span>Sincronizar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (navigator.clipboard) {
                                navigator.clipboard.writeText(fcmToken);
                                setNotif("📋 Token FCM copiado al portapapeles");
                                setTimeout(() => setNotif(''), 3000);
                              }
                            }}
                            className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copiar</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* SELLERS FCM MANAGEMENT TAB */
                  <div className="space-y-3">
                    {/* Top summary banner */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-emerald-950/20 border border-emerald-500/20 p-3 rounded-xl">
                      <div>
                        <p className="text-white font-bold flex items-center gap-1.5">
                          <Smartphone className="w-4 h-4 text-emerald-400" />
                          <span>Dispositivos de Vendedores Registrados en FCM ({sellerTokens.length})</span>
                        </p>
                        <p className="text-[11px] text-emerald-300/80 mt-0.5">
                          Alertas push nativas directas con sonido de campana y voz sintetizada cuando llega un pedido a cada tienda.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadSellerTokens}
                        disabled={isLoadingSellerTokens}
                        className="px-2.5 py-1.5 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-lg border border-gray-700 flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSellerTokens ? 'animate-spin' : ''}`} />
                        <span>Actualizar</span>
                      </button>
                    </div>

                    {/* Broadcast custom push notification to sellers */}
                    <form onSubmit={handleBroadcastToSellers} className="p-3 bg-gray-900/80 rounded-xl border border-gray-800 space-y-2">
                      <p className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Transmitir Notificación Push a Vendedores</span>
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-400 font-mono">Destinatario:</label>
                          <select
                            value={selectedSellerForPush}
                            onChange={(e) => setSelectedSellerForPush(e.target.value)}
                            className="w-full mt-0.5 bg-black/60 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                          >
                            <option value="all">📢 Todos los Vendedores ({sellerTokens.length})</option>
                            {sellerTokens.map((t) => (
                              <option key={t.id} value={t.sellerUid}>
                                🏪 {t.storeName || 'Tienda'} ({t.sellerEmail || t.sellerUid.slice(0, 6)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 font-mono">Título:</label>
                          <input
                            type="text"
                            placeholder="Ej: Alta demanda de pedidos"
                            value={broadcastTitle}
                            onChange={(e) => setBroadcastTitle(e.target.value)}
                            className="w-full mt-0.5 bg-black/60 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 font-mono">Mensaje:</label>
                          <input
                            type="text"
                            required
                            placeholder="Ej: Revisa tus pedidos pendientes"
                            value={broadcastMessage}
                            onChange={(e) => setBroadcastMessage(e.target.value)}
                            className="w-full mt-0.5 bg-black/60 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          disabled={isSendingBroadcast || !broadcastMessage.trim()}
                          className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
                        >
                          <Zap className="w-3.5 h-3.5 fill-black" />
                          <span>{isSendingBroadcast ? 'Transmitiendo...' : 'Transmitir Alerta Push'}</span>
                        </button>
                      </div>
                    </form>

                    {/* Table / List of Registered Sellers */}
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                      {sellerTokens.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 bg-gray-900/40 rounded-xl border border-gray-800">
                          <p>No hay dispositivos de vendedores registrados aún en <span className="font-mono text-cyan-400">seller_fcm_tokens</span>.</p>
                          <p className="text-[11px] mt-1 text-gray-600">
                            Cuando un vendedor entra a su panel y presiona "Activar Notificaciones Push", su token aparecerá aquí automáticamente.
                          </p>
                        </div>
                      ) : (
                        sellerTokens.map((st) => (
                          <div
                            key={st.id}
                            className="p-2.5 bg-gray-900/90 hover:bg-gray-850 rounded-xl border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                <p className="font-bold text-white text-xs truncate">
                                  {st.storeName || 'Tienda Sin Nombre'}
                                </p>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {st.sellerEmail || st.sellerUid.slice(0, 8)}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5">
                                Dispositivo: {st.device || 'Navegador Web'} • Actualizado: {st.updatedAt ? new Date(st.updatedAt).toLocaleDateString('es-CO') : 'Reciente'}
                              </p>
                              <p className="text-[9px] text-cyan-400/80 font-mono truncate">
                                Token: {st.token ? (st.token.length > 30 ? `${st.token.slice(0, 20)}...${st.token.slice(-10)}` : st.token) : 'Token local'}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleSendPushToSeller(st.sellerUid, st.storeName)}
                                className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                title="Enviar alerta push de prueba a esta tienda"
                              >
                                <Zap className="w-3 h-3 text-emerald-400" />
                                <span>Enviar Prueba</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSellerToken(st.id)}
                                className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg cursor-pointer"
                                title="Eliminar registro"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* New Incoming Order Floating Banner - Strictly only rendered when there are pending orders */}
            {newIncomingOrderAlert && pendingOrdersCount > 0 && (
              <div className="bg-gradient-to-r from-emerald-950/95 via-emerald-900/85 to-emerald-950/95 border-2 border-emerald-500/60 p-3.5 sm:p-4 rounded-2xl shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 animate-pulse">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="p-2 sm:p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400 border border-emerald-500/40 shrink-0 mt-0.5">
                    <Bell className="w-5 h-5 animate-bounce" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5 flex-wrap">
                        <span>🚨 ¡NUEVO PEDIDO RECIBIDO!</span>
                        <span className="text-amber-400 font-mono">#{newIncomingOrderAlert.orderNumber || ''}</span>
                      </h4>
                      {/* Mobile close button */}
                      <button
                        type="button"
                        onClick={() => setNewIncomingOrderAlert(null)}
                        className="md:hidden p-1 text-gray-400 hover:text-white rounded-lg transition cursor-pointer shrink-0 -mr-1 -mt-1"
                        title="Cerrar alerta"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-200 mt-1 leading-relaxed break-words">
                      Tienda: <span className="text-emerald-300 font-bold">{newIncomingOrderAlert.storeName}</span> • Cliente: <span className="text-white font-bold">{newIncomingOrderAlert.customerName}</span> • Total: <span className="text-emerald-400 font-bold">${newIncomingOrderAlert.totalAmount.toLocaleString('es-CO')} COP</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto shrink-0 pt-1 md:pt-0 border-t border-emerald-800/40 md:border-t-0">
                  <button
                    type="button"
                    onClick={() => {
                      const targetOrder = allOrders.find(o => o.id === newIncomingOrderAlert.id) || newIncomingOrderAlert.orderObj;
                      if (targetOrder) setWhatsAppDispatchOrder(targetOrder);
                    }}
                    className="flex-1 md:flex-initial px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-1.5 border border-emerald-400/40 text-center"
                    title={`Avisar por WhatsApp a ${activeDrivers.length} domiciliarios activos`}
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
                    <span>Avisar Domiciliarios ({activeDrivers.length} activos)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetOrder = allOrders.find(o => o.id === newIncomingOrderAlert.id) || newIncomingOrderAlert.orderObj;
                      if (targetOrder) setViewingOrder(targetOrder);
                      setNewIncomingOrderAlert(null);
                    }}
                    className="px-3.5 py-2.5 bg-gray-800 hover:bg-gray-700 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-lg transition cursor-pointer shrink-0 text-center"
                  >
                    Ver Pedido
                  </button>
                  {/* Desktop close button */}
                  <button
                    type="button"
                    onClick={() => setNewIncomingOrderAlert(null)}
                    className="hidden md:inline-flex p-2 text-gray-400 hover:text-white rounded-lg transition cursor-pointer shrink-0"
                    title="Cerrar alerta"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Metrics cards inside orders - calculated from ALL orders */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-gray-950/60 border border-gray-900 p-4 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Pedidos</span>
                <span className="text-xl font-black text-white">
                  {allOrders.length}
                  {filteredOrders.length !== allOrders.length && (
                    <span className="text-xs text-gray-500 font-normal"> ({filteredOrders.length} en vista)</span>
                  )}
                </span>
              </div>
              <div className="bg-gray-950/60 border border-gray-900 p-4 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Venta Total Estimada</span>
                <span className="text-xl font-black text-emerald-400">
                  ${allOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toLocaleString('es-CO')} COP
                </span>
              </div>
              <div className="bg-gray-950/60 border border-gray-900 p-4 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Pendientes</span>
                <span className="text-xl font-black text-amber-400">
                  {pendingOrdersCount}
                </span>
              </div>
              <div className="bg-gray-950/60 border border-gray-900 p-4 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Entregados</span>
                <span className="text-xl font-black text-emerald-400">
                  {allOrders.filter(o => o.status === 'delivered').length}
                </span>
              </div>
            </div>

            {/* Filter controls */}
            <div className="flex flex-col md:flex-row gap-3 max-w-full">
              <div className="relative flex-1 min-w-0">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-550">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar por cliente, teléfono, email, número de pedido..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500 py-2.5 pl-10 pr-4 rounded-xl text-xs font-semibold outline-none transition text-gray-200"
                />
              </div>

              <div className="flex flex-col sm:flex-row md:items-center gap-2 w-full md:w-auto min-w-0">
                {/* Store selector with min-w-0 and truncate to prevent mobile overflow */}
                <div className="flex items-center gap-2 bg-gray-950 border border-gray-850 rounded-xl px-3 py-2 w-full sm:w-auto sm:max-w-xs md:max-w-sm min-w-0">
                  <span className="text-[10px] text-gray-400 uppercase font-bold font-mono shrink-0">Tienda:</span>
                  <select
                    value={selectedOrderStoreFilter}
                    onChange={(e) => setSelectedOrderStoreFilter(e.target.value)}
                    className="bg-transparent border-none text-white text-xs outline-none cursor-pointer font-bold flex-1 min-w-0 w-full truncate pr-1"
                  >
                    <option value="all" className="bg-gray-950">Todas ({allStoresList.length > 0 ? allStoresList.length : users.length})</option>
                    {allStoresList.length > 0 ? (
                      allStoresList.map(s => (
                        <option key={s.uid} value={s.uid} className="bg-gray-950">
                          {s.name} {s.username ? `(@${s.username})` : ''}
                        </option>
                      ))
                    ) : (
                      users.map(u => (
                        <option key={u.uid} value={u.uid} className="bg-gray-950">
                          {u.storeName || u.username}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Status selector */}
                <div className="flex items-center gap-2 bg-gray-950 border border-gray-850 rounded-xl px-3 py-2 w-full sm:w-auto min-w-0">
                  <span className="text-[10px] text-gray-400 uppercase font-bold font-mono shrink-0">Estado:</span>
                  <select
                    value={selectedOrderStatusFilter}
                    onChange={(e) => setSelectedOrderStatusFilter(e.target.value)}
                    className="bg-transparent border-none text-white text-xs outline-none cursor-pointer font-bold flex-1 min-w-0 w-full truncate pr-1"
                  >
                    <option value="all" className="bg-gray-950">Todos</option>
                    <option value="pending" className="bg-gray-950 text-amber-400 font-bold">🟡 Pendiente</option>
                    <option value="processing" className="bg-gray-950 text-sky-400 font-bold">🔵 Procesando</option>
                    <option value="shipped" className="bg-gray-950 text-purple-400 font-bold">🟣 Enviado</option>
                    <option value="delivered" className="bg-gray-950 text-emerald-400 font-bold">🟢 Entregado</option>
                    <option value="cancelled" className="bg-gray-950 text-red-400 font-bold">🔴 Cancelado</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 text-gray-500 font-semibold text-xs border border-dashed border-gray-800 rounded-2xl">
                No se encontraron pedidos correspondientes a los filtros actuales.
              </div>
            ) : (
              <div className="w-full space-y-4">
                {/* Mobile View: Cards matching exact phone design from screenshot (md:hidden) */}
                <div className="md:hidden space-y-3.5">
                  {displayedOrders.map((order) => {
                    const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
                    const dateFormatted = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
                    const timeFormatted = dateObj.toLocaleTimeString('es-CO', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    }).replace(/\./g, '').toUpperCase();
                    const storeName = getStoreNameForOrder(order);
                    const storeUsername = getStoreUsernameForOrder(order);
                    const storeWhatsapp = getStoreWhatsappForOrder(order);
                    const isTable = checkIsTableOrder(order);
                    const isPickup = checkIsPickupOrder(order);

                    const hasDriver = Boolean(order.deliveryDriverId && order.deliveryDriverId.trim() !== '') ||
                                      Boolean(order.driverId && order.driverId.trim() !== '') ||
                                      Boolean(order.deliveryStep);
                    const isDeliveredOrCancelled = order.status === 'delivered' || order.status === 'cancelled';
                    const isPickedUpAtStore = !isDeliveredOrCancelled && (
                      order.status === 'shipped' ||
                      order.status === 'delivering' ||
                      order.status === 'picked_up' ||
                      order.deliveryStep === 'picked_up' ||
                      order.deliveryStep === 'to_client' ||
                      order.deliveryStep === 'at_destination'
                    );
                    const effectiveStatus = isDeliveredOrCancelled
                      ? order.status
                      : isPickedUpAtStore
                      ? 'shipped'
                      : (hasDriver && (order.status === 'pending' || order.status === 'confirmed'))
                      ? 'processing'
                      : (order.status === 'confirmed' ? 'processing' : order.status || 'pending');

                    const activeElapsed = !isDeliveredOrCancelled ? getActiveOrderElapsed(order, nowMs) : null;

                    const statusBadge = {
                      delivered: { bg: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60', label: 'ENTREGADO' },
                      pending: { bg: 'bg-amber-950/80 text-amber-400 border-amber-800/60', label: 'PENDIENTE' },
                      processing: { bg: 'bg-sky-950/80 text-sky-400 border-sky-800/60', label: 'PROCESANDO' },
                      confirmed: { bg: 'bg-sky-950/80 text-sky-400 border-sky-800/60', label: 'PROCESANDO' },
                      shipped: { bg: 'bg-purple-950/80 text-purple-400 border-purple-800/60', label: 'ENVIADO' },
                      cancelled: { bg: 'bg-red-950/80 text-red-400 border-red-800/60', label: 'CANCELADO' }
                    }[effectiveStatus] || { bg: 'bg-amber-950/80 text-amber-400 border-amber-800/60', label: 'PENDIENTE' };

                    const statusTextColor = 
                      effectiveStatus === 'delivered' ? 'text-emerald-400' :
                      effectiveStatus === 'processing' ? 'text-sky-400' :
                      effectiveStatus === 'shipped' ? 'text-purple-400' :
                      effectiveStatus === 'cancelled' ? 'text-red-400' :
                      'text-amber-400';

                    return (
                      <div 
                        key={order.id} 
                        className="bg-gray-950/90 border border-gray-850/90 rounded-2xl p-4 sm:p-5 space-y-3 shadow-lg"
                      >
                        {/* Top Header: Order Number and Status Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white font-extrabold text-base tracking-tight font-mono">
                            #{order.orderNumber || 'S/N'}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {activeElapsed && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-black text-amber-300 font-mono shadow-sm">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400"></span>
                                </span>
                                <span>{activeElapsed.elapsedFormatted}</span>
                              </span>
                            )}
                            <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${statusBadge.bg}`}>
                              {statusBadge.label}
                            </span>
                          </div>
                        </div>

                        {/* Customer & Location Info */}
                        <div className="space-y-1 pt-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-white font-extrabold text-sm">{order.customerName}</span>
                            {isTable && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-950/80 text-amber-400 border border-amber-800/60 rounded text-[9px] font-black uppercase tracking-wider">
                                🍽️ MESA
                              </span>
                            )}
                            {isPickup && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 rounded text-[9px] font-black uppercase tracking-wider">
                                🛍️ RECOGER
                              </span>
                            )}
                            {order.proofImage && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 rounded text-[9px] font-black uppercase tracking-wider">
                                📸 RECIBO
                              </span>
                            )}
                          </div>

                          {/* Store badge & WhatsApp del Restaurante */}
                          <div className="py-2 px-2.5 bg-indigo-950/25 border border-indigo-900/40 rounded-xl space-y-1.5">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-1.5 text-[11px] text-indigo-300 font-bold min-w-0">
                                <Store className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                                <span className="truncate">{storeName} {storeUsername ? `(@${storeUsername})` : ''}</span>
                              </div>
                              <span className="text-[9px] text-indigo-400/80 font-mono font-semibold shrink-0 uppercase tracking-wider">
                                Tienda
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-xs flex-wrap pt-1 border-t border-indigo-900/30">
                              <span className="text-[10px] text-gray-400 font-semibold flex items-center gap-1">
                                WhatsApp Restaurante:
                              </span>
                              {storeWhatsapp ? (
                                <a
                                  href={`https://wa.me/${getCleanWhatsappNumber(storeWhatsapp)}?text=${encodeURIComponent(getStoreAdminWhatsAppMessage(order))}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/70 font-mono font-bold text-[11px] transition shadow-sm"
                                  title={`Chatear por WhatsApp con el restaurante (${storeName})`}
                                >
                                  <MessageCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                                  <span>{storeWhatsapp}</span>
                                </a>
                              ) : (
                                <span className="text-[10px] text-gray-500 font-mono italic">
                                  No registrado
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-xs text-gray-400 leading-normal font-medium">
                            {order.customerAddress || 'Retiro local / Sin dirección'}
                          </div>

                          <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5 flex-wrap">
                            <span>Fecha: &nbsp;{dateFormatted}</span>
                            <span className="text-gray-600">•</span>
                            <span>Hora: &nbsp;<strong className="text-gray-200 font-semibold">{timeFormatted}</strong></span>
                          </div>

                          {order.deliveryDriverName && (
                            <div className="mt-1 flex items-center gap-1.5 px-2 py-1 bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 rounded-lg text-[10px] font-semibold">
                              <Bike className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>Domiciliario: <strong>{order.deliveryDriverName}</strong> ({order.deliveryDriverPhone})</span>
                            </div>
                          )}
                        </div>

                        {/* Total Row */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-900/60">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            TOTAL DEL PEDIDO:
                          </span>
                          <span className="text-lg font-black text-emerald-400">
                            ${(order.totalAmount || 0).toLocaleString('es-CO')}
                          </span>
                        </div>

                        {/* State selector box */}
                        <div className="flex items-center justify-between gap-2 bg-gray-900/80 px-3.5 py-2 rounded-xl border border-gray-800">
                          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                            ESTADO:
                          </span>
                          {isTable ? (
                            <select
                              value={effectiveStatus === 'shipped' ? 'processing' : effectiveStatus}
                              onChange={(e) => handleUpdateOrderStatus(order.id, order.storeOwnerId, e.target.value as any)}
                              className={`bg-transparent text-xs font-extrabold outline-none cursor-pointer text-right ${statusTextColor}`}
                            >
                              <option value="pending" className="bg-gray-950 text-amber-400 font-bold">Pendiente</option>
                              <option value="processing" className="bg-gray-950 text-sky-400 font-bold">Procesando</option>
                              <option value="delivered" className="bg-gray-950 text-emerald-400 font-bold">Entregado</option>
                              <option value="cancelled" className="bg-gray-950 text-red-400 font-bold">Cancelado</option>
                            </select>
                          ) : (
                            <select
                              value={effectiveStatus}
                              onChange={(e) => handleUpdateOrderStatus(order.id, order.storeOwnerId, e.target.value as any)}
                              className={`bg-transparent text-xs font-extrabold outline-none cursor-pointer text-right ${statusTextColor}`}
                            >
                              <option value="pending" className="bg-gray-950 text-amber-400 font-bold">Pendiente</option>
                              <option value="processing" className="bg-gray-950 text-sky-400 font-bold">Procesando</option>
                              <option value="shipped" className="bg-gray-950 text-purple-400 font-bold">Enviado</option>
                              <option value="delivered" className="bg-gray-950 text-emerald-400 font-bold">Entregado</option>
                              <option value="cancelled" className="bg-gray-950 text-red-400 font-bold">Cancelado</option>
                            </select>
                          )}
                        </div>

                        {/* Actions buttons matching screenshot */}
                        <div className="grid grid-cols-2 gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setViewingOrder(order)}
                            className="py-2.5 px-3 bg-gray-900/90 hover:bg-gray-850 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-gray-800 transition active:scale-98 shadow-sm cursor-pointer"
                          >
                            <Eye className="w-4 h-4 text-indigo-400" />
                            <span>Ver Detalles</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerWhatsAppMessage(order)}
                            className="py-2.5 px-3 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-emerald-800/60 transition active:scale-98 shadow-sm cursor-pointer"
                          >
                            <MessageCircle className="w-4 h-4 text-emerald-400" />
                            <span>WhatsApp Cliente</span>
                          </button>
                          {!checkIsTableOrder(order) && !checkIsPickupOrder(order) && effectiveStatus === 'pending' && (
                            <button
                              type="button"
                              onClick={() => setWhatsAppDispatchOrder(order)}
                              className="col-span-2 py-2 px-3 bg-gradient-to-r from-emerald-950/90 to-emerald-900/90 hover:from-emerald-900 hover:to-emerald-800 text-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-emerald-500/40 transition active:scale-98 shadow-sm cursor-pointer"
                              title="Avisar por WhatsApp a los domiciliarios activos"
                            >
                              <Bike className="w-4 h-4 text-emerald-400" />
                              <span>Avisar Domiciliarios por WhatsApp ({activeDrivers.length} activos)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View: Full Responsive Table (hidden md:block) */}
                <div className="hidden md:block w-full overflow-x-auto rounded-2xl border border-gray-800/80 bg-gray-950/40 shadow-inner [scrollbar-width:thin] [scrollbar-color:rgba(99,102,241,0.35)_rgba(15,23,42,0.6)]">
                  <table className="w-full text-left border-collapse table-fixed min-w-[960px]">
                    <colgroup><col className="w-[80px]" /><col className="w-[165px]" /><col className="w-[220px]" /><col className="w-[190px]" /><col className="w-[125px]" /><col className="w-[125px]" /><col className="w-[85px]" /></colgroup>
                    <thead>
                      <tr className="border-b border-gray-800 text-[10px] text-gray-400 uppercase font-black tracking-widest bg-gray-900/50">
                        <th className="py-3 px-3 w-[80px]">Pedido #</th>
                        <th className="py-3 px-3">Tienda de Origen</th>
                        <th className="py-3 px-3">Cliente / Contacto</th>
                        <th className="py-3 px-3">Artículos del Pedido</th>
                        <th className="py-3 px-3">Monto / Pago</th>
                        <th className="py-3 px-3 text-center">Estado</th>
                        <th className="py-3 px-3 text-right sticky right-0 bg-[#0d111d] z-20 border-l border-gray-800/80 shadow-[-4px_0_8px_rgba(0,0,0,0.35)]">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-850/80 text-xs">
                      {displayedOrders.map((order) => {
                        const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
                        const timeFormatted = dateObj.toLocaleTimeString('es-CO', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }).replace(/\./g, '').toUpperCase();
                        const hasDriver = Boolean(order.deliveryDriverId && order.deliveryDriverId.trim() !== '') ||
                                          Boolean(order.driverId && order.driverId.trim() !== '') ||
                                          Boolean(order.deliveryStep);
                        const isDeliveredOrCancelled = order.status === 'delivered' || order.status === 'cancelled';
                        const isPickedUpAtStore = !isDeliveredOrCancelled && (
                          order.status === 'shipped' ||
                          order.status === 'delivering' ||
                          order.status === 'picked_up' ||
                          order.deliveryStep === 'picked_up' ||
                          order.deliveryStep === 'to_client' ||
                          order.deliveryStep === 'at_destination'
                        );
                        const effectiveStatus = isDeliveredOrCancelled
                          ? order.status
                          : isPickedUpAtStore
                          ? 'shipped'
                          : (hasDriver && (order.status === 'pending' || order.status === 'confirmed'))
                          ? 'processing'
                          : (order.status === 'confirmed' ? 'processing' : order.status || 'pending');
                        const isPending = effectiveStatus === 'pending';
                        return (
                          <tr key={order.id} className="hover:bg-gray-900/30 group transition-colors">
                            <td className="py-3.5 px-3 align-top w-[80px]">
                              <span className="font-extrabold text-white text-xs block font-mono">#{order.orderNumber || 'S/N'}</span>
                              <span className="text-[10px] text-gray-400 font-mono block mt-0.5">
                                {dateObj.getDate()}/{dateObj.getMonth() + 1}/{dateObj.getFullYear()}
                              </span>
                              <span className="text-[10px] text-indigo-300 font-mono font-bold block">
                                {timeFormatted}
                              </span>
                              {checkIsTableOrder(order) && (
                                <span className="inline-block mt-1 px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-black text-[9px] uppercase tracking-wider">
                                  🍽️ Mesa
                                </span>
                              )}
                              {checkIsPickupOrder(order) && (
                                <span className="inline-block mt-1 px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-black text-[9px] uppercase tracking-wider">
                                  🛍️ Recoger
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-3 align-top">
                              <div className="flex items-start gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                  <Store className="w-3 h-3 text-indigo-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="font-extrabold text-indigo-300 text-xs block truncate" title={getStoreNameForOrder(order)}>
                                    {getStoreNameForOrder(order)}
                                  </span>
                                  {getStoreUsernameForOrder(order) && (
                                    <span className="text-[10px] text-gray-400 font-mono block truncate">
                                      @{getStoreUsernameForOrder(order)}
                                    </span>
                                  )}
                                  {getStoreWhatsappForOrder(order) ? (
                                    <a
                                      href={`https://wa.me/${getCleanWhatsappNumber(getStoreWhatsappForOrder(order))}?text=${encodeURIComponent(getStoreAdminWhatsAppMessage(order))}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 font-mono font-bold mt-0.5 truncate max-w-full"
                                      title={`WhatsApp del Restaurante (${getStoreNameForOrder(order)})`}
                                    >
                                      <MessageCircle className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                      <span className="truncate">WA: {getStoreWhatsappForOrder(order)}</span>
                                    </a>
                                  ) : (
                                    <span className="text-[9px] text-gray-500 font-mono block mt-0.5">
                                      WA: No registrado
                                    </span>
                                  )}
                                  <span className="text-[9px] text-gray-500 font-mono block">
                                    ID: {order.storeOwnerId ? order.storeOwnerId.substring(0, 8) : '---'}...
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-3 align-top">
                              <div className="font-bold text-white text-xs truncate" title={order.customerName}>
                                {order.customerName}
                              </div>
                              <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1 mt-0.5">
                                <span>{order.customerPhone}</span>
                              </div>
                              {order.customerEmail && (
                                <div className="text-[9px] text-gray-500 truncate" title={order.customerEmail}>
                                  {order.customerEmail}
                                </div>
                              )}
                              <div className="text-[10px] text-gray-300 mt-1 line-clamp-2 leading-tight" title={order.customerAddress}>
                                📍 {order.customerAddress || 'Retiro local / Sin dirección'}
                              </div>
                              {order.notes && (
                                <div className="text-[9px] text-amber-400/90 italic mt-1 line-clamp-1" title={order.notes}>
                                  Nota: "{order.notes}"
                                </div>
                              )}

                              {order.deliveryDriverName && (
                                <div className="mt-1.5 p-1.5 bg-emerald-950/40 border border-emerald-800/40 rounded-lg text-[9.5px] text-emerald-300 space-y-0.5">
                                  <div className="font-bold flex items-center justify-between gap-1 text-emerald-400">
                                    <span className="flex items-center gap-1 truncate">
                                      <Bike className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span className="truncate">{order.deliveryDriverName}</span>
                                    </span>
                                    <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-extrabold uppercase shrink-0">
                                      {order.deliveryStep === 'delivered' ? '✓ Entregado' : '🛵 Moto'}
                                    </span>
                                  </div>
                                  {order.deliveryDriverPhone && (
                                    <div className="text-[9px] text-gray-300 font-mono truncate">📱 {order.deliveryDriverPhone}</div>
                                  )}
                                  {order.deliveryVehicle && (
                                    <div className="text-[8.5px] text-gray-400 truncate">🚘 {order.deliveryVehicle} {order.deliveryVehiclePlate ? `(${order.deliveryVehiclePlate})` : ''}</div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-3 align-top">
                              <div className="space-y-1.5 max-w-full">
                                {order.items?.map((item, idx) => (
                                  <div key={idx} className="flex items-start justify-between text-gray-300 gap-1.5 text-[11px] leading-tight">
                                    <span className="truncate flex-1 font-medium text-gray-200" title={`${item.name} ${item.selectedVariant ? `(${item.selectedVariant})` : ''}`}>
                                      {item.name} {item.selectedVariant ? `(${item.selectedVariant})` : ''}
                                    </span>
                                    <span className="font-mono text-gray-400 font-bold shrink-0 bg-gray-900/80 px-1 py-0.5 rounded text-[10px]">
                                      x{item.quantity}
                                    </span>
                                  </div>
                                ))}
                                {(!order.items || order.items.length === 0) && (
                                  <span className="text-[10px] text-gray-500 italic">Sin artículos detallados</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-3 align-top font-mono">
                              <span className="font-black text-emerald-400 text-xs block">
                                ${(order.totalAmount || 0).toLocaleString('es-CO')}
                              </span>
                              <span className="text-[9px] text-gray-400 font-bold uppercase block mt-0.5">
                                COP
                              </span>
                              <span className="inline-block mt-1 text-[8.5px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800 text-gray-300 truncate max-w-full">
                                {order.paymentMethod === 'whatsapp' 
                                  ? 'Contraentrega (WA)' 
                                  : order.paymentMethod === 'transfer' 
                                  ? 'Transferencia' 
                                  : order.paymentMethod === 'cod' 
                                  ? 'Contra entrega' 
                                  : 'Efectivo'}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 align-top text-center">
                              {(() => {
                                const hasDriver = Boolean(order.deliveryDriverId && order.deliveryDriverId.trim() !== '') ||
                                                  Boolean(order.driverId && order.driverId.trim() !== '') ||
                                                  Boolean(order.deliveryStep);
                                const isDeliveredOrCancelled = order.status === 'delivered' || order.status === 'cancelled';
                                const isPickedUpAtStore = !isDeliveredOrCancelled && (
                                  order.status === 'shipped' ||
                                  order.status === 'delivering' ||
                                  order.status === 'picked_up' ||
                                  order.deliveryStep === 'picked_up' ||
                                  order.deliveryStep === 'to_client' ||
                                  order.deliveryStep === 'at_destination'
                                );
                                const effectiveStatus = isDeliveredOrCancelled
                                  ? order.status
                                  : isPickedUpAtStore
                                  ? 'shipped'
                                  : (hasDriver && (order.status === 'pending' || order.status === 'confirmed'))
                                  ? 'processing'
                                  : (order.status === 'confirmed' ? 'processing' : order.status || 'pending');

                                const activeElapsed = !isDeliveredOrCancelled ? getActiveOrderElapsed(order, nowMs) : null;

                                return (
                                  <div className="flex flex-col items-center gap-1">
                                    {checkIsTableOrder(order) ? (
                                      <select
                                        value={effectiveStatus === 'shipped' ? 'processing' : effectiveStatus}
                                        onChange={(e) => handleUpdateOrderStatus(order.id, order.storeOwnerId, e.target.value as any)}
                                        className="bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[10px] uppercase font-black rounded-lg py-1 px-2 cursor-pointer outline-none w-full max-w-[120px]"
                                      >
                                        <option value="pending" className="bg-gray-950 text-white">🟡 Pendiente</option>
                                        <option value="processing" className="bg-gray-950 text-white">🔵 Procesando</option>
                                        <option value="delivered" className="bg-gray-950 text-white">🟢 Entregado</option>
                                        <option value="cancelled" className="bg-gray-950 text-white">🔴 Cancelado</option>
                                      </select>
                                    ) : (
                                      <select
                                        value={effectiveStatus}
                                        onChange={(e) => handleUpdateOrderStatus(order.id, order.storeOwnerId, e.target.value as any)}
                                        className={`rounded-lg py-1 px-2 text-[10px] uppercase font-black border cursor-pointer outline-none w-full max-w-[120px] ${
                                          effectiveStatus === 'delivered'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : effectiveStatus === 'processing'
                                            ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                            : effectiveStatus === 'shipped'
                                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                            : effectiveStatus === 'cancelled'
                                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                        }`}
                                      >
                                        <option value="pending" className="bg-gray-950 text-white">🟡 Pendiente</option>
                                        <option value="processing" className="bg-gray-950 text-white">🔵 Procesando</option>
                                        <option value="shipped" className="bg-gray-950 text-white">🟣 Enviado</option>
                                        <option value="delivered" className="bg-gray-950 text-white">🟢 Entregado</option>
                                        <option value="cancelled" className="bg-gray-950 text-white">🔴 Cancelado</option>
                                      </select>
                                    )}
                                    {activeElapsed && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-bold font-mono text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded px-1.5 py-0.5">
                                        <span className="relative flex h-1 w-1">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-1 w-1 bg-amber-400"></span>
                                        </span>
                                        <span>{activeElapsed.elapsedFormatted}</span>
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3.5 px-3 align-top text-right sticky right-0 bg-[#090b14] group-hover:bg-[#0f1424] z-10 border-l border-gray-800/80 shadow-[-4px_0_8px_rgba(0,0,0,0.35)] transition-colors">
                              <div className="flex items-center justify-end gap-1.5">
                                {!checkIsTableOrder(order) && !checkIsPickupOrder(order) && isPending && (
                                  <button
                                    type="button"
                                    onClick={() => setWhatsAppDispatchOrder(order)}
                                    className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg border border-emerald-500/30 transition inline-flex items-center justify-center cursor-pointer active:scale-95"
                                    title={`Avisar a ${activeDrivers.length} domiciliarios activos por WhatsApp`}
                                  >
                                    <Bike className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setViewingOrder(order)}
                                  className="p-1.5 bg-indigo-600/15 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg border border-indigo-500/30 transition inline-flex items-center justify-center cursor-pointer active:scale-95"
                                  title="Ver detalles del pedido"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOrder(order)}
                                  className="p-1.5 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 rounded-lg border border-red-500/25 transition inline-flex items-center justify-center cursor-pointer active:scale-95"
                                  title="Eliminar pedido permanentemente"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Sentinel and Progressive Load Controls for Orders */}
                <div 
                  ref={ordersSentinelRef} 
                  className="py-6 flex flex-col items-center justify-center gap-2 border-t border-gray-850/60 mt-2"
                >
                  {displayedOrders.length < filteredOrders.length ? (
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <span className="text-[11px] text-gray-400 font-medium">
                        Mostrando <strong className="text-white font-mono">{displayedOrders.length}</strong> de <strong className="text-white font-mono">{filteredOrders.length}</strong> pedidos
                      </span>
                      <button
                        type="button"
                        onClick={() => setVisibleOrdersCount(prev => Math.min(prev + 20, filteredOrders.length))}
                        className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 font-extrabold text-xs rounded-xl border border-indigo-500/30 transition duration-150 cursor-pointer flex items-center gap-2 shadow-sm hover:scale-[1.01] active:scale-98"
                      >
                        <Download className="w-4 h-4" />
                        <span>Cargar siguientes 20 pedidos</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] font-bold text-gray-400 bg-gray-950/80 px-4 py-2 rounded-xl border border-gray-850 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>✓ Todos los pedidos sincronizados ({filteredOrders.length} pedidos)</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : activeAdminTab === 'order_times' ? (
          <AdminOrderTimesManager
            orders={allOrders}
            storesMap={storesMap}
            allStoresList={allStoresList}
            onViewOrder={(order) => setViewingOrder(order)}
            onRefreshOrders={loadAdminData}
          />
        ) : activeAdminTab === 'users' ? (
          <div className="bg-gray-900/30 border border-gray-800 rounded-3xl p-6 backdrop-blur-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-extrabold text-white text-base">Cuentas de Usuarios Registrados</h3>
                <p className="text-[11px] text-gray-500 font-semibold">Consulte la base de datos de usuarios para suspender cuentas o actualizar planes.</p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleCleanTestUsers}
                  disabled={cleaningTestUsers}
                  title="Eliminar automáticamente todas las cuentas de prueba"
                  className="px-3.5 py-2.5 bg-red-500/15 hover:bg-red-500 hover:text-white text-red-400 font-extrabold text-xs rounded-xl border border-red-500/30 transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  {cleaningTestUsers ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Limpiar Usuarios Test</span>
                </button>

                {/* Search filter input */}
                <div className="relative w-full md:w-64">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-550">
                    <Search className="w-4 h-4" />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Filtrar por @usuario o email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 py-2.5 pl-10 pr-4 rounded-xl text-xs font-semibold outline-none transition"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-[10px] text-gray-450 uppercase font-black tracking-widest bg-gray-900/15">
                    <th className="py-4 px-4">Usuario</th>
                    <th className="py-4 px-4">Correo</th>
                    <th className="py-4 px-4">Plan Actual</th>
                    <th className="py-4 px-4 text-center">Apertura Tienda</th>
                    <th className="py-4 px-4 text-center">Estado Cuenta</th>
                    <th className="py-4 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-850 text-sm">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-gray-500">
                        No se encontraron usuarios coincidentes.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.uid} className="hover:bg-gray-900/20 transition-colors">
                        <td className="py-4 px-4 font-bold text-emerald-300">
                          @{user.username}
                          {(user.role === 'admin' || checkIsAdminEmail(user.email, systemSettings.adminEmails)) && (
                            <span className="ml-2 bg-indigo-500/10 text-indigo-400 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-indigo-500/15">Admin</span>
                          )}
                          {user.storeName && (
                            <div className="text-[10.5px] text-gray-400 font-normal mt-0.5">{user.storeName}</div>
                          )}
                        </td>
                        <td className="py-4 px-4 font-semibold text-gray-300">
                          <div>{user.email}</div>
                          <div className="mt-1.5 space-y-1">
                            {(user.ownerWhatsapp || user.whatsapp || user.phone) ? (
                              <a
                                href={getWhatsAppUrl(user.ownerWhatsapp || user.whatsapp || user.phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 rounded-md text-[9.5px] font-bold transition cursor-pointer"
                                title="Abrir WhatsApp del Propietario / Administrador"
                              >
                                <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span>👑 Dueño: +57 {formatWhatsAppDisplay(user.ownerWhatsapp || user.whatsapp || user.phone)}</span>
                              </a>
                            ) : (
                              <span className="text-[9.5px] text-gray-600 italic block">Sin WhatsApp</span>
                            )}

                            {user.customerServiceWhatsapp && (
                              <div>
                                <a
                                  href={getWhatsAppUrl(user.customerServiceWhatsapp)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/25 rounded-md text-[9.5px] font-bold transition cursor-pointer"
                                  title="Abrir WhatsApp de Atención al Cliente"
                                >
                                  <Headphones className="w-3 h-3 text-sky-400 shrink-0" />
                                  <span>💬 Clientes: +57 {formatWhatsAppDisplay(user.customerServiceWhatsapp)}</span>
                                </a>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <select 
                            value={user.subscriptionPlan || 'basico'}
                            onChange={(e) => handlePlanUpgrade(user, e.target.value as any)}
                            className="bg-gray-950 border border-gray-850 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer text-gray-300 animate-none"
                          >
                            <option value="basico">Básico ($49.000) / 5 prod.</option>
                            <option value="medio">Medio ($79.000) / 12 prod.</option>
                            <option value="pro">Avanzado ($99.000) / 24 prod.</option>
                          </select>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleToggleStoreClosedStatus(user)}
                              title={`Estado actual (${checkIsStoreClosed(user) ? 'Cerrada' : 'Abierta'}). Clic para cambiar estado manual.`}
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition duration-150 border cursor-pointer inline-flex items-center gap-1.5 ${
                                checkIsStoreClosed(user)
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/30'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/30'
                              }`}
                            >
                              <Store className="w-3.5 h-3.5" />
                              <span>{checkIsStoreClosed(user) ? '🔴 Cerrada' : '🟢 Abierta'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenScheduleModal(user)}
                              title="Configurar horario de apertura y cierre de la tienda"
                              className="px-2 py-0.5 rounded-lg text-[9.5px] font-extrabold text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition cursor-pointer flex items-center gap-1"
                            >
                              <Clock className="w-3 h-3 text-indigo-400" />
                              <span>{getAdminUserScheduleSummary(user)}</span>
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          {user.suspended ? (
                            <span className="bg-red-500/10 text-red-500 inline-flex items-center gap-1 text-[10px] uppercase font-black px-2 py-0.5 rounded border border-red-500/15">
                              <AlertTriangle className="w-3 h-3" /> Suspendido
                            </span>
                          ) : (
                            <span className="bg-emerald-500/10 text-emerald-400 inline-flex items-center gap-1 text-[10px] uppercase font-black px-2 py-0.5 rounded border border-emerald-500/15">
                              Activo
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleToggleSuspension(user)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                user.suspended 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20' 
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20'
                              }`}
                            >
                              {user.suspended ? (
                                <>
                                  <Unlock className="w-3 h-3" /> Reactivar
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3" /> Suspender
                                </>
                              )}
                            </button>

                            <button 
                              onClick={() => handleDeletePage(user)}
                              disabled={deletingUserId === user.uid}
                              title="Eliminar permanentemente esta página y tienda"
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              {deletingUserId === user.uid ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                              <span>Eliminar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeAdminTab === 'general' ? (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-gray-900/30 border border-gray-800 rounded-3xl p-6 backdrop-blur-sm space-y-6">
              
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
                <div>
                  <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                    <Settings className="w-5 h-5 text-amber-400" />
                    <span>Administración General & Configuración Global</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 font-medium mt-1">
                    Gestione las variables del sistema, costo predeterminado de domicilio/envío y opciones globales de soporte.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveSystemSettings} className="space-y-6 max-w-2xl">
                
                {/* Costo de Domicilio Card */}
                <div className="bg-[#0b101d] border border-gray-800 p-5 rounded-2xl space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                        <Bike className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">Costo de Domicilio General</h4>
                        <p className="text-[10px] text-gray-400">Tarifa predeterminada para envíos en la plataforma</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-black uppercase tracking-wider font-mono">
                      VALOR VIGENTE
                    </span>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-gray-300 block">
                      Valor Predeterminado por Domicilio (COP $) *
                    </label>
                    
                    <div className="relative max-w-md">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-emerald-400 font-black text-sm">
                        $
                      </span>
                      <input 
                        type="text"
                        required
                        value={deliveryFeeInput}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^0-9]/g, '');
                          setDeliveryFeeInput(cleaned);
                        }}
                        placeholder="Ej: 5000"
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white font-extrabold text-base rounded-xl py-3 pl-9 pr-16 outline-none transition font-mono"
                      />
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-500 font-bold text-xs uppercase font-mono">
                        COP
                      </span>
                    </div>

                    {/* Preset Buttons for Quick Selection */}
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                        Selección Rápida de Valores
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setDeliveryFeeInput(preset.toString())}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition border cursor-pointer ${
                              parseInt(deliveryFeeInput || '0', 10) === preset
                                ? 'bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/20'
                                : 'bg-gray-950 text-gray-300 border-gray-800 hover:border-gray-700 hover:text-white'
                            }`}
                          >
                            ${preset.toLocaleString('es-CO')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Real-time formatted preview */}
                    <div className="p-3.5 bg-gray-950/80 border border-gray-850 rounded-xl flex items-center justify-between text-xs">
                      <span className="text-gray-400 font-medium">Vista Previa Formateada:</span>
                      <span className="font-black text-emerald-400 font-mono text-sm">
                        ${(parseInt(deliveryFeeInput || '0', 10)).toLocaleString('es-CO')} COP
                      </span>
                    </div>
                  </div>
                </div>

                {/* Support Contact Settings Card */}
                <div className="bg-[#0b101d] border border-gray-800 p-5 rounded-2xl space-y-4 shadow-xl">
                  <div className="flex items-center gap-2.5 border-b border-gray-800/80 pb-3">
                    <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-tight">Soporte & Atención General</h4>
                      <p className="text-[10px] text-gray-400">Línea de WhatsApp oficial para tiendas y cobros</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-300 block mb-1.5">
                        Número WhatsApp Soporte *
                      </label>
                      <input 
                        type="text"
                        value={systemSettings.supportPhone || '3219730865'}
                        onChange={(e) => setSystemSettings(prev => ({ ...prev, supportPhone: e.target.value }))}
                        placeholder="Ej: 3219730865"
                        className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500 text-white font-bold text-xs rounded-xl p-3 outline-none transition font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-300 block mb-1.5">
                        Correo Electrónico Soporte
                      </label>
                      <input 
                        type="email"
                        value={systemSettings.supportEmail || 'soporte@ryyco.com'}
                        onChange={(e) => setSystemSettings(prev => ({ ...prev, supportEmail: e.target.value }))}
                        placeholder="Ej: soporte@ryyco.com"
                        className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500 text-white font-bold text-xs rounded-xl p-3 outline-none transition font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* WhatsApp Driver Notifications Settings Card */}
                <div className="bg-[#0b101d] border border-emerald-500/25 p-5 rounded-2xl space-y-4 shadow-xl">
                  <div className="flex items-center gap-2.5 border-b border-gray-800/80 pb-3">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-tight">Avisos por WhatsApp a Domiciliarios</h4>
                      <p className="text-[10px] text-gray-400">Automatización y avisos a domiciliarios que estén activos al ingresar pedidos</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Auto-open toggle */}
                    <div className="flex items-center justify-between p-3.5 bg-gray-950/80 border border-gray-800 rounded-xl">
                      <div className="space-y-0.5 pr-3">
                        <span className="text-xs font-bold text-white block">Abrir panel de WhatsApp automáticamente al ingresar un pedido</span>
                        <span className="text-[11px] text-gray-400 block">
                          Al entrar un nuevo pedido de entrega a la administración general, se desplegará de inmediato la opción de enviar la alerta por WhatsApp a los domiciliarios que estén activos en ese momento.
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input 
                          type="checkbox"
                          checked={Boolean(systemSettings.autoNotifyActiveDriversWhatsApp)}
                          onChange={(e) => setSystemSettings(prev => ({ ...prev, autoNotifyActiveDriversWhatsApp: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>

                    {/* WhatsApp group link */}
                    <div>
                      <label className="text-xs font-bold text-gray-300 block mb-1.5">
                        Enlace de Grupo Oficial de WhatsApp de Domiciliarios (Opcional)
                      </label>
                      <input 
                        type="url"
                        value={systemSettings.driversWhatsAppGroupUrl || ''}
                        onChange={(e) => setSystemSettings(prev => ({ ...prev, driversWhatsAppGroupUrl: e.target.value }))}
                        placeholder="https://chat.whatsapp.com/..."
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white font-medium text-xs rounded-xl p-3 outline-none transition font-mono"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Si tienes un grupo de WhatsApp con todos tus repartidores, pega el link aquí para abrirlo con 1 clic al recibir pedidos.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Save button for General Contact and Delivery Settings */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-black text-xs uppercase tracking-wider rounded-xl transition shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {savingSettings ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-black" />
                        <span>Guardando Cambios...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>Guardar Configuración de Tarifas y Contacto</span>
                      </>
                    )}
                  </button>
                </div>

              </form>

              {/* Multi-Admin Management Section (Agregar otro correo que pueda administrar) */}
              <div className="bg-[#0b101d] border border-indigo-900/30 p-5 sm:p-6 rounded-2xl space-y-5 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800/80 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20 shadow-inner">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">Administradores del Sistema</h4>
                        <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full text-[10px] font-black font-mono">
                          {Array.from(new Set([PRIMARY_ADMIN_EMAIL.toLowerCase(), ...(systemSettings.adminEmails || []).map(e => e.toLowerCase().trim())])).length} AUTORIZADOS
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400">
                        Agrega otros correos electrónicos para que puedan ingresar al Panel de Administración con todos los permisos.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Form to Add New Admin Email */}
                <form onSubmit={handleAddAdminEmail} className="space-y-3">
                  <label className="text-xs font-bold text-gray-300 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <span>Agregar Nuevo Correo Administrador</span>
                  </label>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-500">
                        <Mail className="w-4 h-4" />
                      </span>
                      <input 
                        type="email"
                        required
                        value={newAdminEmailInput}
                        onChange={(e) => setNewAdminEmailInput(e.target.value)}
                        placeholder="ejemplo.admin@gmail.com"
                        className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500 text-white font-medium text-xs rounded-xl py-3 pl-10 pr-4 outline-none transition placeholder:text-gray-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={addingAdminEmail || !newAdminEmailInput.trim()}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {addingAdminEmail ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Agregando...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 stroke-[3]" />
                          <span>Habilitar Administrador</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    Al ingresar con este correo, el usuario tendrá acceso total al Panel Administrador, gestión de suscripciones, domiciliarios, pagos y configuración.
                  </p>
                </form>

                {/* Authorized Admins List */}
                <div className="space-y-2.5 pt-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block font-mono">
                    Correos con Acceso Administrativo Activo
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {Array.from(new Set([PRIMARY_ADMIN_EMAIL.toLowerCase(), ...(systemSettings.adminEmails || []).map(e => e.toLowerCase().trim())])).map((adminEmail) => {
                      const isPrimary = adminEmail === PRIMARY_ADMIN_EMAIL.toLowerCase();
                      const isRemoving = removingAdminEmail === adminEmail;

                      return (
                        <div 
                          key={adminEmail}
                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                            isPrimary 
                              ? 'bg-indigo-950/20 border-indigo-500/30' 
                              : 'bg-gray-950/60 border-gray-800 hover:border-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-2 rounded-lg shrink-0 ${isPrimary ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-900 text-gray-400'}`}>
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-white truncate block">
                                  {adminEmail}
                                </span>
                                {isPrimary && (
                                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 font-mono">
                                    PRINCIPAL
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-emerald-400 font-medium block">
                                ● Rol Administrador Activo
                              </span>
                            </div>
                          </div>

                          {!isPrimary && (
                            <button
                              type="button"
                              disabled={isRemoving}
                              onClick={() => handleRemoveAdminEmail(adminEmail)}
                              title="Remover permisos de administrador"
                              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition border border-transparent hover:border-red-500/20 cursor-pointer disabled:opacity-50 shrink-0"
                            >
                              {isRemoving ? (
                                <RefreshCw className="w-4 h-4 animate-spin text-red-400" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : null}
          </main>
        </div>

        {/* High resolution Proof Image Modal Overlay */}
        {viewingOrder && (() => {
          const viewingOrderHasDriver = Boolean(viewingOrder.deliveryDriverId && viewingOrder.deliveryDriverId.trim() !== '') ||
                                        Boolean(viewingOrder.driverId && viewingOrder.driverId.trim() !== '') ||
                                        Boolean(viewingOrder.deliveryStep);
          const viewingOrderIsDeliveredOrCancelled = viewingOrder.status === 'delivered' || viewingOrder.status === 'cancelled';
          const viewingOrderIsPickedUpAtStore = !viewingOrderIsDeliveredOrCancelled && (
            viewingOrder.status === 'shipped' ||
            viewingOrder.status === 'delivering' ||
            viewingOrder.status === 'picked_up' ||
            viewingOrder.deliveryStep === 'picked_up' ||
            viewingOrder.deliveryStep === 'to_client' ||
            viewingOrder.deliveryStep === 'at_destination'
          );
          const viewingOrderEffectiveStatus = viewingOrderIsDeliveredOrCancelled
            ? viewingOrder.status
            : viewingOrderIsPickedUpAtStore
            ? 'shipped'
            : (viewingOrderHasDriver && (viewingOrder.status === 'pending' || viewingOrder.status === 'confirmed'))
            ? 'processing'
            : (viewingOrder.status === 'confirmed' ? 'processing' : viewingOrder.status || 'pending');
          const isViewingOrderPending = viewingOrderEffectiveStatus === 'pending';

          return (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in">
            <div className="relative max-w-xl w-full bg-gray-950 border border-gray-800 rounded-3xl p-5 sm:p-6 flex flex-col max-h-[92vh] shadow-2xl space-y-4 text-left">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-850 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                      <span>Pedido #{viewingOrder.orderNumber || 'S/N'}</span>
                      {checkIsTableOrder(viewingOrder) && (
                        <span className="px-2 py-0.5 bg-amber-950/80 text-amber-400 border border-amber-800/60 rounded text-[9.5px] font-black uppercase tracking-wider">
                          🍽️ MESA
                        </span>
                      )}
                      {checkIsPickupOrder(viewingOrder) && (
                        <span className="px-2 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 rounded text-[9.5px] font-black uppercase tracking-wider">
                          🛍️ RECOGER
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-gray-400">
                      {viewingOrder.createdAt ? (
                        <>
                          <span>Fecha: {new Date(viewingOrder.createdAt).toLocaleDateString('es-CO')}</span>
                          <span className="mx-1.5 text-gray-600">•</span>
                          <span>Hora: <strong className="text-gray-200 font-semibold">{new Date(viewingOrder.createdAt).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\./g, '').toUpperCase()}</strong></span>
                        </>
                      ) : 'Reciente'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingOrder(null)}
                  className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-850 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="overflow-y-auto space-y-4 pr-1 text-xs">
                {/* Store of Origin */}
                <div className="p-3.5 bg-indigo-950/30 border border-indigo-850/60 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
                      <Store className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-black tracking-wider text-indigo-400 block">Tienda / Restaurante de Origen</span>
                      <p className="font-extrabold text-white truncate text-xs sm:text-sm">
                        {getStoreNameForOrder(viewingOrder)}
                      </p>
                      {getStoreUsernameForOrder(viewingOrder) && (
                        <p className="text-[10.5px] text-gray-400 font-mono">
                          @{getStoreUsernameForOrder(viewingOrder)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {getStoreWhatsappForOrder(viewingOrder) ? (
                      <a
                        href={`https://wa.me/${getCleanWhatsappNumber(getStoreWhatsappForOrder(viewingOrder))}?text=${encodeURIComponent(getStoreAdminWhatsAppMessage(viewingOrder))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 text-[11px] font-mono font-bold transition shadow-sm"
                        title="Chatear por WhatsApp con el restaurante"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>WA Restaurante: {getStoreWhatsappForOrder(viewingOrder)}</span>
                      </a>
                    ) : (
                      <span className="text-[10px] text-gray-500 font-mono italic">
                        WhatsApp: No registrado
                      </span>
                    )}
                    <span className="text-[9.5px] text-gray-500 font-mono">
                      ID: {viewingOrder.storeOwnerId.substring(0, 8)}...
                    </span>
                  </div>
                </div>

                {/* Customer Information */}
                <div className="p-4 bg-gray-900/60 border border-gray-850 rounded-2xl space-y-2">
                  <span className="text-[10px] uppercase font-black tracking-wider text-gray-400 block">
                    Datos del Cliente / Destinatario
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400 text-[11px] block">Nombre:</span>
                      <span className="font-bold text-white text-sm">{viewingOrder.customerName}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[11px] block">Teléfono / WhatsApp:</span>
                      <span className="font-mono font-bold text-indigo-300">{viewingOrder.customerPhone}</span>
                    </div>
                    {viewingOrder.customerEmail && (
                      <div className="sm:col-span-2">
                        <span className="text-gray-400 text-[11px] block">Correo:</span>
                        <span className="font-mono text-gray-300">{viewingOrder.customerEmail}</span>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <span className="text-gray-400 text-[11px] block">Dirección de Entrega:</span>
                      <span className="text-gray-200 font-medium">{viewingOrder.customerAddress || 'Retiro local / Sin dirección'}</span>
                    </div>
                    {viewingOrder.notes && (
                      <div className="sm:col-span-2 p-2.5 bg-amber-950/30 border border-amber-800/40 rounded-xl text-amber-300">
                        <span className="font-bold text-[10.5px] block">Instrucciones o Notas:</span>
                        <p className="italic text-[11px] mt-0.5">{viewingOrder.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delivery Driver Info */}
                {viewingOrder.deliveryDriverName && (
                  <div className="p-3.5 bg-emerald-950/30 border border-emerald-800/40 rounded-2xl space-y-1 text-emerald-300">
                    <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 block">
                      Repartidor Asignado
                    </span>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="font-extrabold text-sm flex items-center gap-1.5 text-white">
                        <Bike className="w-4 h-4 text-emerald-400" />
                        {viewingOrder.deliveryDriverName}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold uppercase">
                        {viewingOrder.deliveryStep === 'delivered' ? '✓ Entregado' : '🛵 En Camino'}
                      </span>
                    </div>
                    {viewingOrder.deliveryDriverPhone && (
                      <div className="text-xs text-gray-300 font-mono">📱 Teléfono: {viewingOrder.deliveryDriverPhone}</div>
                    )}
                    {viewingOrder.deliveryVehicle && (
                      <div className="text-xs text-gray-300">🚘 Vehículo: {viewingOrder.deliveryVehicle} {viewingOrder.deliveryVehiclePlate ? `(${viewingOrder.deliveryVehiclePlate})` : ''}</div>
                    )}
                  </div>
                )}

                {/* Proof Image */}
                {viewingOrder.proofImage && (
                  <div className="p-3.5 bg-gray-900/60 border border-gray-850 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-black tracking-wider text-indigo-400">
                        Comprobante de Pago Adjunto
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewingProofImg(viewingOrder.proofImage!)}
                        className="text-[11px] text-indigo-300 hover:text-white underline cursor-pointer"
                      >
                        Ver en pantalla completa
                      </button>
                    </div>
                    <div 
                      onClick={() => setViewingProofImg(viewingOrder.proofImage!)}
                      className="max-h-48 overflow-hidden rounded-xl border border-gray-800 bg-black cursor-pointer hover:opacity-90 transition flex items-center justify-center"
                    >
                      <img 
                        src={viewingOrder.proofImage} 
                        alt="Comprobante" 
                        referrerPolicy="no-referrer"
                        className="max-h-48 object-contain" 
                      />
                    </div>
                  </div>
                )}

                {/* RYYCO Official Order Times & Lifecycle Timeline */}
                <OrderTimeTimeline order={viewingOrder} />

                {/* Items List */}
                <div className="p-4 bg-gray-900/60 border border-gray-850 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-wider text-gray-400">
                      Productos del Pedido ({viewingOrder.items?.length || 0})
                    </span>
                    <span className="text-[10px] uppercase font-black tracking-wider text-gray-400">
                      Subtotal
                    </span>
                  </div>
                  <div className="divide-y divide-gray-850">
                    {viewingOrder.items?.map((item, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-extrabold text-white">
                            {item.name}
                          </p>
                          {item.selectedVariant && (
                            <p className="text-[11px] text-indigo-300 font-medium">
                              Variante: {item.selectedVariant}
                            </p>
                          )}
                          <p className="text-[10.5px] text-gray-400 font-mono">
                            ${(item.price || 0).toLocaleString('es-CO')} × {item.quantity}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-white shrink-0">
                          ${((item.price || 0) * (item.quantity || 1)).toLocaleString('es-CO')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Summary row */}
                  <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-black text-gray-400 block">Método de Pago</span>
                      <span className="text-xs font-bold text-white">
                        {viewingOrder.paymentMethod === 'whatsapp' 
                          ? 'Contraentrega (WA)' 
                          : viewingOrder.paymentMethod === 'transfer' 
                          ? 'Transferencia Bancaria' 
                          : viewingOrder.paymentMethod === 'cod' 
                          ? 'Contra entrega' 
                          : 'Efectivo'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-black text-gray-400 block">Total Final</span>
                      <span className="text-base font-black text-emerald-400">
                        ${(viewingOrder.totalAmount || 0).toLocaleString('es-CO')} COP
                      </span>
                    </div>
                  </div>
                </div>

                {/* State selector row */}
                <div className="flex items-center justify-between gap-2 p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-[10.5px] font-black uppercase text-gray-400 tracking-wider">
                    Actualizar Estado:
                  </span>
                  {(() => {
                    const hasDriver = Boolean(viewingOrder.deliveryDriverId && viewingOrder.deliveryDriverId.trim() !== '') ||
                                      Boolean(viewingOrder.driverId && viewingOrder.driverId.trim() !== '') ||
                                      Boolean(viewingOrder.deliveryStep);
                    const isDeliveredOrCancelled = viewingOrder.status === 'delivered' || viewingOrder.status === 'cancelled';
                    const isPickedUpAtStore = !isDeliveredOrCancelled && (
                      viewingOrder.status === 'shipped' ||
                      viewingOrder.status === 'delivering' ||
                      viewingOrder.status === 'picked_up' ||
                      viewingOrder.deliveryStep === 'picked_up' ||
                      viewingOrder.deliveryStep === 'to_client' ||
                      viewingOrder.deliveryStep === 'at_destination'
                    );
                    const effectiveStatus = isDeliveredOrCancelled
                      ? viewingOrder.status
                      : isPickedUpAtStore
                      ? 'shipped'
                      : (hasDriver && (viewingOrder.status === 'pending' || viewingOrder.status === 'confirmed'))
                      ? 'processing'
                      : (viewingOrder.status === 'confirmed' ? 'processing' : viewingOrder.status || 'pending');

                    return (
                      <select
                        value={checkIsTableOrder(viewingOrder) && effectiveStatus === 'shipped' ? 'processing' : effectiveStatus}
                        onChange={(e) => handleUpdateOrderStatus(viewingOrder.id, viewingOrder.storeOwnerId, e.target.value as any)}
                        className="bg-gray-950 border border-gray-700 text-white rounded-lg py-1.5 px-3 text-xs font-bold outline-none cursor-pointer"
                      >
                        <option value="pending">🟡 Pendiente</option>
                        <option value="processing">🔵 Procesando</option>
                        {!checkIsTableOrder(viewingOrder) && (
                          <option value="shipped">🟣 Enviado</option>
                        )}
                        <option value="delivered">🟢 Entregado</option>
                        <option value="cancelled">🔴 Cancelado</option>
                      </select>
                    );
                  })()}
                </div>
              </div>

              {/* Modal Actions Footer */}
              <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-gray-850">
                <button
                  type="button"
                  onClick={() => handleDeleteOrder(viewingOrder)}
                  className="py-2.5 px-3 bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-red-500/25 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar Pedido</span>
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  {!checkIsTableOrder(viewingOrder) && !checkIsPickupOrder(viewingOrder) && isViewingOrderPending && (
                    <button
                      type="button"
                      onClick={() => setWhatsAppDispatchOrder(viewingOrder)}
                      className="py-2.5 px-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 transition cursor-pointer"
                      title="Avisar a todos los domiciliarios activos por WhatsApp"
                    >
                      <Bike className="w-4 h-4" />
                      <span>Avisar Domiciliarios ({activeDrivers.length} activos)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => triggerWhatsAppMessage(viewingOrder)}
                    className="py-2.5 px-3.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-emerald-800/60 transition cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingOrder(null)}
                    className="py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* High resolution Proof Image Modal Overlay */}
        {viewingProofImg && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in text-center">
            <div className="relative max-w-2xl w-full bg-gray-950 border border-gray-850 p-4 rounded-3xl flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2">
                <span className="text-xs font-black uppercase text-indigo-400 tracking-wider">Comprobante de Transferencia Reportado</span>
                <button
                  type="button"
                  onClick={() => setViewingProofImg(null)}
                  className="p-1 px-2.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg text-xs font-bold transition font-mono"
                >
                  ESC • Cerrar
                </button>
              </div>
              <div className="max-h-[75vh] min-h-[40vh] overflow-auto flex items-center justify-center bg-[#090b12] rounded-xl border border-gray-900">
                <img 
                  src={viewingProofImg} 
                  alt="Proof Document"
                  referrerPolicy="no-referrer"
                  className="max-h-[70vh] object-contain mx-auto" 
                />
              </div>
            </div>
          </div>
        )}

        {/* Schedule Modal for Store Opening and Closing Hours */}
        {scheduleModalUser && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
            <div className="bg-gray-950 border border-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-850 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-lg shadow-indigo-500/10">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-white">Horario de Cocina y Servicio Semanal</h3>
                    <p className="text-xs text-gray-400 font-mono">
                      {scheduleModalUser.storeName || `@${scheduleModalUser.username}`} • <span className="text-indigo-400 font-bold">Administración de Tienda</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleModalUser(null)}
                  className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-gray-900 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Scrollable Body */}
              <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* Toggle Schedule */}
                <label className="flex items-center justify-between p-4 bg-gray-900/60 border border-gray-800/80 rounded-2xl cursor-pointer hover:bg-gray-900 transition">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs sm:text-sm font-extrabold text-white block">Activar Horario Programado Semanal</span>
                    <span className="text-[11px] text-gray-400 block leading-relaxed">
                      La tienda abrirá y cerrará automáticamente según los horarios configurados de forma independiente para cada día.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={scheduleEnabledInput}
                    onChange={(e) => setScheduleEnabledInput(e.target.checked)}
                    className="w-5 h-5 accent-indigo-500 rounded cursor-pointer shrink-0"
                  />
                </label>

                {scheduleEnabledInput && (
                  <>
                    {/* Quick Presets */}
                    <div className="p-3.5 bg-gray-900/40 border border-gray-850 rounded-2xl space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold uppercase text-gray-400 tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Atajos de Días:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => applyQuickPreset('all_open')}
                            className="px-2.5 py-1 bg-gray-900 hover:bg-indigo-600/30 text-gray-300 hover:text-indigo-200 border border-gray-800 hover:border-indigo-500/40 rounded-lg text-[10.5px] font-bold transition cursor-pointer"
                          >
                            Todos Abiertos
                          </button>
                          <button
                            type="button"
                            onClick={() => applyQuickPreset('weekdays_only')}
                            className="px-2.5 py-1 bg-gray-900 hover:bg-indigo-600/30 text-gray-300 hover:text-indigo-200 border border-gray-800 hover:border-indigo-500/40 rounded-lg text-[10.5px] font-bold transition cursor-pointer"
                          >
                            Lun a Vie
                          </button>
                          <button
                            type="button"
                            onClick={() => applyQuickPreset('weekend_only')}
                            className="px-2.5 py-1 bg-gray-900 hover:bg-indigo-600/30 text-gray-300 hover:text-indigo-200 border border-gray-800 hover:border-indigo-500/40 rounded-lg text-[10.5px] font-bold transition cursor-pointer"
                          >
                            Solo Fin de Semana
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-850/60">
                        <span className="text-[11px] font-extrabold uppercase text-gray-400 tracking-wider flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-400" /> Horario a todos:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: '08:00 - 20:00', open: '08:00', close: '20:00' },
                            { label: '09:00 - 22:00', open: '09:00', close: '22:00' },
                            { label: '11:00 - 23:00', open: '11:00', close: '23:00' },
                            { label: '12:00 - 00:00', open: '12:00', close: '00:00' }
                          ].map(preset => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => applyTimePresetToAll(preset.open, preset.close)}
                              className="px-2.5 py-1 bg-gray-900 hover:bg-indigo-600/30 text-gray-300 hover:text-indigo-200 border border-gray-800 hover:border-indigo-500/40 rounded-lg text-[10.5px] font-mono transition cursor-pointer"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Independent Day Schedule List */}
                    <div className="space-y-2">
                      {DAYS_OF_WEEK_LIST.map((day) => {
                        const schedule = weeklyScheduleInput[day.id] || { isOpen: true, openTime: '08:00', closeTime: '22:00' };
                        const isOpen = schedule.isOpen ?? true;
                        const isCopied = copyFeedbackDay === day.id;

                        return (
                          <div
                            key={day.id}
                            className={`p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isOpen
                                ? 'bg-gray-900/60 border-gray-800 hover:border-indigo-500/40'
                                : 'bg-gray-950/40 border-gray-850/60 opacity-60'
                            }`}
                          >
                            {/* Day Name & Status Toggle */}
                            <div className="flex items-center justify-between sm:justify-start gap-3 min-w-[140px]">
                              <span className="text-xs sm:text-sm font-extrabold text-white tracking-wide">
                                {day.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleDayStatus(day.id)}
                                className={`px-2.5 py-1 rounded-full text-[10.5px] font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                                  isOpen
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                                }`}
                              >
                                <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                                {isOpen ? 'Abierto' : 'Cerrado'}
                              </button>
                            </div>

                            {/* Hours or Closed notice */}
                            {isOpen ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-gray-950/80 px-2.5 py-1.5 rounded-xl border border-gray-800">
                                  <span className="text-[10px] uppercase font-bold text-gray-400">Abre:</span>
                                  <input
                                    type="time"
                                    value={schedule.openTime || '08:00'}
                                    onChange={(e) => updateDayTime(day.id, 'openTime', e.target.value)}
                                    className="bg-transparent text-white font-mono text-xs outline-none cursor-pointer"
                                  />
                                </div>

                                <span className="text-gray-500 font-bold text-xs">-</span>

                                <div className="flex items-center gap-1.5 bg-gray-950/80 px-2.5 py-1.5 rounded-xl border border-gray-800">
                                  <span className="text-[10px] uppercase font-bold text-gray-400">Cierra:</span>
                                  <input
                                    type="time"
                                    value={schedule.closeTime || '22:00'}
                                    onChange={(e) => updateDayTime(day.id, 'closeTime', e.target.value)}
                                    className="bg-transparent text-white font-mono text-xs outline-none cursor-pointer"
                                  />
                                </div>

                                {/* Copy to all button */}
                                <button
                                  type="button"
                                  onClick={() => copyDayScheduleToAll(day.id)}
                                  title="Copiar estas horas a los demás días"
                                  className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold border transition cursor-pointer flex items-center gap-1 shrink-0 ${
                                    isCopied
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : 'bg-gray-900 hover:bg-indigo-600/20 text-gray-400 hover:text-indigo-300 border-gray-800 hover:border-indigo-500/30'
                                  }`}
                                >
                                  {isCopied ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>¡Copiado!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span className="hidden sm:inline">Copiar a todos</span>
                                      <span className="sm:hidden">Copiar</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-gray-500 py-1">
                                <span>Sin servicio programado</span>
                                <button
                                  type="button"
                                  onClick={() => toggleDayStatus(day.id)}
                                  className="text-xs text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
                                >
                                  Habilitar día
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary Footer in content */}
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-400 pt-1 px-1">
                      <span>
                        Días activos configurados:{' '}
                        <strong className="text-white font-bold">
                          {(Object.values(weeklyScheduleInput) as DaySchedule[]).filter((s) => s.isOpen).length} de 7 días
                        </strong>
                      </span>
                      <span className="text-gray-500">
                        Zona horaria de referencia: Colombia (UTC-5)
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons Footer */}
              <div className="flex items-center gap-3 p-4 sm:p-5 border-t border-gray-850 bg-gray-950/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setScheduleModalUser(null)}
                  className="flex-1 py-3 bg-gray-900 hover:bg-gray-850 text-gray-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={savingSchedule}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  {savingSchedule ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Guardar Horario Semanal</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal para Ajustar Meses de Suscripción (+1 Mes o -1 Mes) con Día de Corte */}
        {confirmExtendModalUser && (() => {
          const user = confirmExtendModalUser;
          const isAdding = extendModalMonths > 0;
          const { nextPaidUntil, anchorDay } = calculateNextExpirationDate(user, extendModalMonths);
          const formatSpanishDate = (dateStr?: string | null | Date) => {
            if (!dateStr) return 'Sin pago activo';
            const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
            if (isNaN(d.getTime())) return 'Sin pago activo';
            return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
          };
          const isNextActive = nextPaidUntil.getTime() > Date.now();

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
              <div className={`bg-[#0f1422] border ${isAdding ? 'border-indigo-500/40 shadow-indigo-950/50' : 'border-rose-500/40 shadow-rose-950/50'} rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 transition-all`}>
                {/* Encabezado */}
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 ${isAdding ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400' : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'} rounded-xl`}>
                      {isAdding ? <Calendar className="w-5 h-5" /> : <MinusCircle className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">
                        {isAdding ? 'Confirmar Extensión (+1 Mes)' : 'Confirmar Reducción (-1 Mes)'}
                      </h3>
                      <p className="text-[11px] text-gray-400">
                        {isAdding ? 'Renovación de suscripción con día de corte' : 'Ajuste de suscripción con día de corte'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmExtendModalUser(null)}
                    className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Selector rápido: +1 Mes o -1 Mes */}
                <div className="grid grid-cols-2 gap-1.5 bg-gray-950 p-1 rounded-xl border border-gray-800">
                  <button
                    type="button"
                    onClick={() => setExtendModalMonths(1)}
                    className={`py-2 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      isAdding
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'text-gray-400 hover:text-white hover:bg-gray-900'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar 1 Mes (+1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtendModalMonths(-1)}
                    className={`py-2 text-xs font-black rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      !isAdding
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                        : 'text-gray-400 hover:text-white hover:bg-gray-900'
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5" /> Quitar 1 Mes (-1)
                  </button>
                </div>

                {/* Tarjeta con detalles */}
                <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-800/70 pb-2.5">
                    <span className="text-xs text-gray-400 font-semibold">Tienda:</span>
                    <div className="text-right">
                      <span className="text-xs font-extrabold text-white block">
                        {user.storeName || user.username}
                      </span>
                      <span className="text-gray-500 font-mono text-[10.5px]">@{user.username}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-b border-gray-800/70 pb-2.5">
                    <span className="text-xs text-gray-400 font-semibold">Vencimiento Actual:</span>
                    <span className="text-xs font-mono font-bold text-gray-300">
                      {formatSpanishDate(user.subscriptionPaidUntil)}
                    </span>
                  </div>

                  {isAdding ? (
                    <div className="flex items-center justify-between bg-emerald-500/10 -mx-4 px-4 py-2.5 border-y border-emerald-500/20">
                      <span className="text-xs text-emerald-300 font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Nuevo Vencimiento (+1 Mes):
                      </span>
                      <span className="text-xs font-mono font-black text-emerald-400">
                        {formatSpanishDate(nextPaidUntil)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-rose-500/10 -mx-4 px-4 py-2.5 border-y border-rose-500/20">
                      <span className="text-xs text-rose-300 font-bold flex items-center gap-1.5">
                        <MinusCircle className="w-3.5 h-3.5 text-rose-400" />
                        Nuevo Vencimiento (-1 Mes):
                      </span>
                      <span className="text-xs font-mono font-black text-rose-400">
                        {formatSpanishDate(nextPaidUntil)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs text-gray-400 font-semibold">Día de Corte:</span>
                    <span className="px-2 py-0.5 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 rounded text-xs font-mono font-black">
                      Día {anchorDay}
                    </span>
                  </div>

                  {!isAdding && !isNextActive && (
                    <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-lg text-[10.5px] text-amber-300 font-semibold text-center">
                      ⚠️ La nueva fecha queda en el pasado. El estado de la tienda pasará a <strong>EXPIRADO</strong>.
                    </div>
                  )}
                </div>

                <p className="text-[11.5px] text-gray-300 text-center leading-relaxed">
                  {isAdding ? (
                    <>¿Deseas confirmar la adición de <strong className="text-white font-black">+1 mes</strong> de servicio a esta tienda? El estado se activará automáticamente.</>
                  ) : (
                    <>¿Deseas confirmar la reducción de <strong className="text-white font-black">-1 mes</strong> de servicio a esta tienda? El día de corte ({anchorDay}) se mantendrá.</>
                  )}
                </p>

                {/* Botones de acción */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-850">
                  <button
                    type="button"
                    onClick={() => setConfirmExtendModalUser(null)}
                    disabled={extendingSubscription}
                    className="flex-1 py-2.5 bg-gray-900 hover:bg-gray-850 text-gray-300 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteExtendSubscription}
                    disabled={extendingSubscription}
                    className={`flex-1 py-2.5 ${
                      isAdding 
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40' 
                        : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40'
                    } font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50`}
                  >
                    {extendingSubscription ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : isAdding ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Minus className="w-4 h-4" />
                    )}
                    <span>{isAdding ? 'Confirmar +1 Mes' : 'Confirmar -1 Mes'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal de Cobro de Suscripción por WhatsApp para Tiendas Expiradas */}
        {cobroModalUser && (() => {
          const user = cobroModalUser;
          const { effectiveStatus } = isSubscriptionExpiredOrSuspended(user);
          const planPrice = user.subscriptionPlan === 'pro' ? 99000 : user.subscriptionPlan === 'medio' ? 79000 : 49000;
          const planPriceFormatted = `$${planPrice.toLocaleString('es-CO')} COP`;
          const planName = user.subscriptionPlan === 'pro' 
            ? 'Plan Avanzado / Pro' 
            : user.subscriptionPlan === 'medio' 
            ? 'Plan Medio' 
            : 'Plan Básico';
          const anchorDay = getSubscriptionAnchorDay(user);
          
          const rawDigits = cobroCustomPhone.replace(/\D/g, '').replace(/^0+/, '');
          const cleanPhone = rawDigits.startsWith('57') && rawDigits.length >= 12 ? rawDigits.slice(2) : rawDigits;
          const fullDestinationNumber = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
          const personalWhatsAppUrl = cleanPhone ? getPersonalWhatsAppUrl(fullDestinationNumber, cobroCustomMessage) : '#';
          const webWhatsAppUrl = cleanPhone ? `https://wa.me/${fullDestinationNumber}?text=${encodeURIComponent(cobroCustomMessage)}` : '#';

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
              <div className="bg-[#0f1422] border border-emerald-500/40 rounded-3xl w-full max-w-xl p-5 sm:p-6 shadow-2xl shadow-emerald-950/40 space-y-4 max-h-[92vh] overflow-y-auto">
                {/* Encabezado */}
                <div className="flex items-center justify-between border-b border-gray-800 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <MessageCircle className="w-5 h-5 fill-current" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white flex items-center gap-2">
                        <span>Cobro de Suscripción WhatsApp</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase font-mono border ${
                          effectiveStatus === 'expired'
                            ? 'bg-red-500/20 text-red-300 border-red-500/30'
                            : effectiveStatus === 'suspended'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : effectiveStatus === 'trial'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {effectiveStatus === 'expired' ? '🔴 Expirada' : effectiveStatus === 'suspended' ? '⚠️ Suspendida' : effectiveStatus === 'trial' ? '🆓 Prueba' : '🟢 Activa'}
                        </span>
                      </h3>
                      <p className="text-[11px] text-gray-400">
                        Enviar mensaje personalizado de cobro al propietario para reactivar su tienda
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCobroModalUser(null)}
                    className="p-1.5 hover:bg-gray-800 rounded-xl text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Tarjeta Resumen de la Tienda */}
                <div className="bg-gray-950/80 border border-gray-800/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-extrabold text-white text-sm block">
                        {user.storeName || user.username || 'Tienda sin nombre'}
                      </span>
                      <span className="text-[10.5px] text-gray-500 font-mono">@{user.username} • {user.email}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-400 font-mono block">
                        {planPriceFormatted}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">{planName}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-900 text-[11px]">
                    <div>
                      <span className="text-gray-500 font-mono block text-[10px]">Día de Corte Mensual:</span>
                      <span className="text-gray-300 font-bold font-mono">Día {anchorDay} de cada mes</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-mono block text-[10px]">Cuentas de Pago:</span>
                      <span className="text-emerald-400 font-bold font-mono">Nequi: 3219730865</span>
                    </div>
                  </div>
                </div>

                {/* Campo Teléfono WhatsApp */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Número de WhatsApp del Dueño:</span>
                    </label>
                    {cleanPhone && (
                      <button
                        type="button"
                        onClick={handleCopyCobroPhone}
                        className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedCobroPhone ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCobroPhone ? '¡Copiado!' : 'Copiar número'}</span>
                      </button>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-2 bg-gray-950 border border-gray-800 rounded-xl text-gray-400 font-mono text-xs font-bold shrink-0">
                      🇨🇴 +57
                    </span>
                    <input
                      type="text"
                      value={cobroCustomPhone}
                      onChange={(e) => setCobroCustomPhone(e.target.value)}
                      placeholder="Ej: 3176926116"
                      className="flex-1 bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white text-xs font-mono rounded-xl px-3 py-2 outline-none"
                    />
                  </div>

                  {!cleanPhone && (
                    <p className="text-[10.5px] text-amber-400 flex items-center gap-1 font-medium pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Esta tienda no tiene número registrado. Escribe el número arriba para enviar el mensaje por WhatsApp.</span>
                    </p>
                  )}
                </div>

                {/* Selector de Plantillas Rápidas */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">
                    Seleccionar Plantilla de Cobro:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-gray-950 p-1 rounded-xl border border-gray-800">
                    <button
                      type="button"
                      onClick={() => handleSelectCobroTemplate('standard')}
                      className={`py-2 px-2 rounded-lg text-[10px] font-black transition cursor-pointer flex flex-col items-center gap-0.5 ${
                        cobroTemplateType === 'standard'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                          : 'text-gray-400 hover:text-white hover:bg-gray-900'
                      }`}
                    >
                      <span>🔴 Vencido</span>
                      <span className="text-[8.5px] font-normal opacity-80">Estándar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCobroTemplate('urgent')}
                      className={`py-2 px-2 rounded-lg text-[10px] font-black transition cursor-pointer flex flex-col items-center gap-0.5 ${
                        cobroTemplateType === 'urgent'
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
                          : 'text-gray-400 hover:text-white hover:bg-gray-900'
                      }`}
                    >
                      <span>⚡ Urgente</span>
                      <span className="text-[8.5px] font-normal opacity-80">Catálogo Pausado</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCobroTemplate('promo')}
                      className={`py-2 px-2 rounded-lg text-[10px] font-black transition cursor-pointer flex flex-col items-center gap-0.5 ${
                        cobroTemplateType === 'promo'
                          ? 'bg-amber-600 text-white shadow-md shadow-amber-900/40'
                          : 'text-gray-400 hover:text-white hover:bg-gray-900'
                      }`}
                    >
                      <span>🌟 Reactivar</span>
                      <span className="text-[8.5px] font-normal opacity-80">Clientes Frecuentes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCobroTemplate('trial')}
                      className={`py-2 px-2 rounded-lg text-[10px] font-black transition cursor-pointer flex flex-col items-center gap-0.5 ${
                        cobroTemplateType === 'trial'
                          ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40'
                          : 'text-gray-400 hover:text-white hover:bg-gray-900'
                      }`}
                    >
                      <span>🆓 Fin Prueba</span>
                      <span className="text-[8.5px] font-normal opacity-80">7 Días Gratis</span>
                    </button>
                  </div>
                </div>

                {/* Textarea editable del mensaje */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                      Contenido del Mensaje (Editable):
                    </label>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {cobroCustomMessage.length} caracteres
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={cobroCustomMessage}
                    onChange={(e) => setCobroCustomMessage(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 rounded-xl p-3 text-xs text-gray-200 font-mono leading-relaxed outline-none resize-none shadow-inner"
                    placeholder="Escribe el mensaje de cobro..."
                  />
                  <p className="text-[10px] text-gray-500 italic">
                    💡 El mensaje incluye formato para WhatsApp (*negrita*), cuentas de Nequi / Bancolombia y enlace a https://ryyco.com/.
                  </p>
                </div>

                {/* Botones de Acción */}
                <div className="space-y-2 pt-2 border-t border-gray-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {cleanPhone ? (
                      <div className="flex flex-col gap-1.5 w-full">
                        <button
                          type="button"
                          onClick={() => openPersonalWhatsApp(fullDestinationNumber, cobroCustomMessage)}
                          className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 active:scale-[0.98]"
                          title="Abrir directamente en WhatsApp Messenger Personal (no Business)"
                        >
                          <MessageCircle className="w-4 h-4 fill-current shrink-0" />
                          <span>Abrir WhatsApp Personal</span>
                        </button>
                        <a
                          href={webWhatsAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-gray-400 hover:text-white underline text-center transition"
                          title="Abrir en WhatsApp Web en el navegador"
                        >
                          🌐 O abrir en WhatsApp Web (Navegador)
                        </a>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="py-3 px-4 bg-gray-800 text-gray-500 text-xs font-black uppercase tracking-wider rounded-xl cursor-not-allowed flex items-center justify-center gap-2 opacity-60"
                      >
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <span>Escribe un Teléfono</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleCopyCobroMessage}
                      className={`py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-2 border shadow-sm ${
                        copiedCobroText
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          : 'bg-gray-900 hover:bg-gray-800 text-gray-200 border-gray-750'
                      }`}
                    >
                      {copiedCobroText ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span>¡Mensaje Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-gray-400" />
                          <span>Copiar Mensaje</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        const target = cobroModalUser;
                        setCobroModalUser(null);
                        setExtendModalMonths(1);
                        setConfirmExtendModalUser(target);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>¿El cliente ya pagó? Ajustar Mes (+1)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCobroModalUser(null)}
                      className="text-gray-500 hover:text-gray-300 transition cursor-pointer font-medium"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal de envío de alerta de pedido por WhatsApp a Domiciliarios Activos */}
        {whatsAppDispatchOrder && (
          <AdminWhatsAppDriversModal
            order={whatsAppDispatchOrder}
            activeDrivers={activeDrivers}
            allDrivers={allApprovedDrivers}
            systemSettings={systemSettings}
            storeNameFallback={getStoreNameForOrder(whatsAppDispatchOrder)}
            onClose={() => setWhatsAppDispatchOrder(null)}
          />
        )}

      </div>
    </div>
  );
}
