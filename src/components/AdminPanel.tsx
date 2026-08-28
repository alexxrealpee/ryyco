/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  fetchAdminStats, 
  fetchAllSubscriptionPayments,
  db,
  fetchAllOrders,
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
  getSubscriptionAnchorDay,
  calculateNextExpirationDate,
  getSubscriptionDaysRemaining,
  isSubscriptionExpiredOrSuspended
} from '../lib/firebase';
import AdminDriversManager from './AdminDriversManager';
import AdminReferralsManager from './AdminReferralsManager';
import { checkIsTableOrder } from './Dashboard';
import { SubscriptionPayment, OrderItem, SystemSettings, UserProfile } from '../types';
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
  RefreshCw,
  Check,
  X,
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
  Share2,
  Mail,
  Plus,
  UserCheck,
  ShieldCheck
} from 'lucide-react';
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
  phone?: string;
  subscriptionPaidUntil?: string;
  subscriptionAnchorDay?: number;
  createdAt?: string;
  suspended?: boolean;
  isClosed?: boolean;
  openTime?: string;
  closeTime?: string;
  scheduleEnabled?: boolean;
}

export default function AdminPanel({ onBack }: AdminPanelProps) {
  const [stats, setStats] = useState({
    totalUsers: 142,
    totalProfiles: 142,
    subscribersPro: 31,
    subscribersBusiness: 11,
    monthlyRevenue: 639.46
  });
  
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [notif, setNotif] = useState('');
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'payments' | 'subscriptions' | 'orders' | 'drivers' | 'referrals' | 'general'>('subscriptions');
  const [allPayments, setAllPayments] = useState<SubscriptionPayment[]>([]);
  const [allOrders, setAllOrders] = useState<OrderItem[]>([]);
  const [viewingProofImg, setViewingProofImg] = useState<string | null>(null);

  // Comprehensive Store Profiles Directory for accurate Store Name resolution
  const [storesMap, setStoresMap] = useState<Record<string, UserProfile>>({});
  const [allStoresList, setAllStoresList] = useState<{ uid: string; name: string; username: string; phone?: string; address?: string }[]>([]);

  // System Settings State
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    defaultDeliveryFee: 7000,
    supportPhone: '3219730865',
    supportEmail: 'soporte@linnkpro.store',
    adminEmails: [PRIMARY_ADMIN_EMAIL]
  });
  const [deliveryFeeInput, setDeliveryFeeInput] = useState<string>('7000');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [newAdminEmailInput, setNewAdminEmailInput] = useState<string>('');
  const [addingAdminEmail, setAddingAdminEmail] = useState<boolean>(false);
  const [removingAdminEmail, setRemovingAdminEmail] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Filter specific store for historical payments ledger
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all');
  // Order specific filters and lazy loading / progressive pagination state
  const [selectedOrderStoreFilter, setSelectedOrderStoreFilter] = useState<string>('all');
  const [selectedOrderStatusFilter, setSelectedOrderStatusFilter] = useState<string>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');

  // Intelligent lazy loading state for orders (8 orders per batch)
  const [lastOrderDoc, setLastOrderDoc] = useState<any | null>(null);
  const [hasMoreOrders, setHasMoreOrders] = useState<boolean>(true);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState<boolean>(false);
  const ordersSentinelRef = useRef<HTMLDivElement | null>(null);

  // Intelligent lazy loading state for subscriptions (7 items per batch)
  const [lastSubDoc, setLastSubDoc] = useState<any | null>(null);
  const [hasMoreSubs, setHasMoreSubs] = useState<boolean>(true);
  const [loadingMoreSubs, setLoadingMoreSubs] = useState<boolean>(false);
  const subsSentinelRef = useRef<HTMLDivElement | null>(null);

  const handleLoadMoreOrders = async () => {
    if (loadingMoreOrders || !hasMoreOrders) return;
    setLoadingMoreOrders(true);
    try {
      const res = await fetchAdminOrdersBatch(8, lastOrderDoc, allOrders.length);
      if (res.orders.length > 0) {
        setAllOrders(prev => {
          const existingIds = new Set(prev.map(o => o.id));
          const newUnique = res.orders.filter(o => !existingIds.has(o.id));
          return [...prev, ...newUnique];
        });
        setLastOrderDoc(res.lastDoc);
      }
      setHasMoreOrders(res.hasMore);
    } catch (err) {
      console.error("Error al cargar los siguientes pedidos:", err);
    } finally {
      setLoadingMoreOrders(false);
    }
  };

  const handleLoadMoreSubscriptions = async () => {
    if (loadingMoreSubs || !hasMoreSubs) return;
    setLoadingMoreSubs(true);
    try {
      const res = await fetchAdminSubscriptionsBatch(7, lastSubDoc, users.length);
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
        (Object.values(stores) as UserProfile[]).forEach((p: UserProfile) => {
          if (p && p.uid && !storeMapUnique.has(p.uid)) {
            const sName = p.displayName || p.storeName || p.username || 'Tienda';
            storeMapUnique.set(p.uid, {
              uid: p.uid,
              name: sName,
              username: p.username || '',
              phone: p.whatsapp || p.phone || '',
              address: p.address || p.location || ''
            });
          }
        });
        setAllStoresList(Array.from(storeMapUnique.values()).sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error("Error al cargar directorio de tiendas:", err);
      }

      // 1. Load Stats
      const systemStats = await fetchAdminStats();
      setStats(systemStats);

      // 2. Load initial 7 subscription records (Lazy loading / Infinite scroll)
      try {
        const initialSubsBatch = await fetchAdminSubscriptionsBatch(7, null, 0);
        setUsers(initialSubsBatch.users as AdminUser[]);
        setLastSubDoc(initialSubsBatch.lastDoc);
        setHasMoreSubs(initialSubsBatch.hasMore);
      } catch (err) {
        console.error("Error al cargar lote inicial de suscripciones:", err);
      }

      // 3. Load subscription payments
      const fetchedPayments = await fetchAllSubscriptionPayments();
      setAllPayments(fetchedPayments);

      // 4. Load initial 8 orders (Lazy loading / progressive pagination)
      try {
        const initialBatch = await fetchAdminOrdersBatch(8, null, 0);
        setAllOrders(initialBatch.orders);
        setLastOrderDoc(initialBatch.lastDoc);
        setHasMoreOrders(initialBatch.hasMore);
      } catch (err) {
        console.error("Error al cargar lote inicial de pedidos en admin panel:", err);
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
        supportEmail: systemSettings.supportEmail || 'soporte@linnkpro.store'
      });
      setSystemSettings(prev => ({ ...prev, defaultDeliveryFee: numFee }));
      setNotif(`🟢 Costo general de domicilio actualizado a $${numFee.toLocaleString('es-CO')} COP correctamente.`);
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

  // Infinite scroll trigger when reaching bottom of orders table
  useEffect(() => {
    if (activeAdminTab !== 'orders') return;
    if (!hasMoreOrders || loadingMoreOrders) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting) {
          handleLoadMoreOrders();
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
  }, [activeAdminTab, hasMoreOrders, loadingMoreOrders, lastOrderDoc, allOrders.length]);

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
    const nextStatus = !user.suspended;
    try {
      // Write to Firebase
      await updateDoc(doc(db, 'users', user.uid), { suspended: nextStatus });
      await updateDoc(doc(db, 'profiles', user.uid), { suspended: nextStatus });
    } catch(e) {
      try {
        await setDoc(doc(db, 'profiles', user.uid), { suspended: nextStatus }, { merge: true });
        await setDoc(doc(db, 'users', user.uid), { suspended: nextStatus }, { merge: true });
      } catch (err) {
        console.error("Error toggling suspension:", err);
      }
    }

    // Update Local State
    setUsers(users.map(u => u.uid === user.uid ? { ...u, suspended: nextStatus } : u));
    setNotif(`La tienda de @${user.username || user.email} ha sido ${nextStatus ? '🔴 SUSPENDIDA' : '🟢 ACTIVADA'} correctamente.`);
    setTimeout(() => setNotif(''), 4000);
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
      const userRef = doc(db, 'profiles', userId);
      await updateDoc(userRef, {
        subscriptionStatus: newStatus
      });

      setUsers(prev => prev.map(u => u.uid === userId ? {
        ...u,
        subscriptionStatus: newStatus
      } : u));

      setNotif(`Estado de suscripción actualizado a: ${newStatus.toUpperCase()}`);
      setTimeout(() => setNotif(''), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleExtendSubscription = async (user: AdminUser) => {
    try {
      const { nextPaidUntil, anchorDay } = calculateNextExpirationDate(user, 1);
      const newPaidUntilStr = nextPaidUntil.toISOString();
      
      const userRef = doc(db, 'profiles', user.uid);
      await updateDoc(userRef, {
        subscriptionStatus: 'active',
        suspended: false,
        subscriptionPaidUntil: newPaidUntilStr,
        subscriptionAnchorDay: anchorDay
      });

      try {
        const legacyRef = doc(db, 'users', user.uid);
        await updateDoc(legacyRef, {
          subscriptionStatus: 'active',
          suspended: false,
          subscriptionPaidUntil: newPaidUntilStr,
          subscriptionAnchorDay: anchorDay
        });
      } catch (e) {}

      setUsers(prev => prev.map(u => u.uid === user.uid ? {
        ...u,
        subscriptionStatus: 'active',
        suspended: false,
        subscriptionPaidUntil: newPaidUntilStr,
        subscriptionAnchorDay: anchorDay
      } : u));

      setNotif(`Suscripción de @${user.username || 'tienda'} extendida hasta ${nextPaidUntil.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })} (Día de corte: ${anchorDay})`);
      setTimeout(() => setNotif(''), 4500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleStoreClosedStatus = async (user: AdminUser) => {
    const nextClosedState = !user.isClosed;
    try {
      await setDoc(doc(db, 'profiles', user.uid), { isClosed: nextClosedState }, { merge: true });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, isClosed: nextClosedState } : u));
      setNotif(`La tienda ${user.storeName || '@' + user.username} ahora se encuentra: ${nextClosedState ? '🔴 CERRADA' : '🟢 ABIERTA'}`);
      setTimeout(() => setNotif(''), 4000);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar el estado de apertura de la tienda.");
    }
  };

  const [confirmExtendModalUser, setConfirmExtendModalUser] = useState<AdminUser | null>(null);
  const [extendingSubscription, setExtendingSubscription] = useState<boolean>(false);

  const handleExecuteExtendSubscription = async () => {
    if (!confirmExtendModalUser) return;
    setExtendingSubscription(true);
    try {
      await handleExtendSubscription(confirmExtendModalUser);
      setConfirmExtendModalUser(null);
    } catch (err) {
      console.error("Error al extender suscripción:", err);
      setNotif(`❌ Error al extender: ${err instanceof Error ? err.message : 'Intente nuevamente'}`);
      setTimeout(() => setNotif(''), 4000);
    } finally {
      setExtendingSubscription(false);
    }
  };

  const [scheduleModalUser, setScheduleModalUser] = useState<AdminUser | null>(null);
  const [openTimeInput, setOpenTimeInput] = useState<string>('08:00');
  const [closeTimeInput, setCloseTimeInput] = useState<string>('22:00');
  const [scheduleEnabledInput, setScheduleEnabledInput] = useState<boolean>(true);
  const [savingSchedule, setSavingSchedule] = useState<boolean>(false);

  const handleOpenScheduleModal = (user: AdminUser) => {
    setScheduleModalUser(user);
    setOpenTimeInput(user.openTime || '08:00');
    setCloseTimeInput(user.closeTime || '22:00');
    setScheduleEnabledInput(user.scheduleEnabled ?? Boolean(user.openTime && user.closeTime));
  };

  const handleSaveSchedule = async () => {
    if (!scheduleModalUser) return;
    setSavingSchedule(true);
    try {
      const updatedData = {
        openTime: openTimeInput,
        closeTime: closeTimeInput,
        scheduleEnabled: scheduleEnabledInput
      };

      await setDoc(doc(db, 'profiles', scheduleModalUser.uid), updatedData, { merge: true });

      setUsers(prev => prev.map(u => u.uid === scheduleModalUser.uid ? { ...u, ...updatedData } : u));

      setNotif(`⏰ Horario guardado para ${scheduleModalUser.storeName || '@' + scheduleModalUser.username}: ${scheduleEnabledInput ? `${openTimeInput} - ${closeTimeInput}` : 'Desactivado'}`);
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
        subscriptionPaidUntil: newPaidUntilStr,
        subscriptionAnchorDay: anchorDay
      });

      const userRef = doc(db, 'users', payment.userId);
      try {
        await updateDoc(userRef, {
          subscriptionStatus: 'active',
          suspended: false,
          subscriptionPlan: payment.plan || 'basico',
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
        subscriptionPaidUntil: newPaidUntilStr,
        subscriptionAnchorDay: anchorDay
      } : u));

      setNotif(`¡Pago de @${payment.username} por $${payment.amount.toLocaleString()} COP APROBADO correctamente! Próximo vencimiento: ${nextPaidUntil.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })} (Día de corte: ${anchorDay}).`);
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
        subscriptionStatus: 'pending_payment'
      });

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
      await updateOrderStatus(orderId, storeOwnerId, newStatus);
      setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      setNotif(`¡Estado del pedido actualizado a ${newStatus.toUpperCase()} correctamente!`);
      setTimeout(() => setNotif(''), 4000);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar el estado del pedido.");
    }
  };

  const handleDeleteOrder = async (order: OrderItem) => {
    const confirmMsg = `¿Estás seguro de que deseas eliminar permanentemente el pedido #${order.orderNumber || 'S/N'} de ${order.customerName}? Esta acción no se puede deshacer.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteOrder(order.id, order.storeOwnerId);
      setAllOrders(prev => prev.filter(o => o.id !== order.id));
      setNotif(`Pedido #${order.orderNumber || 'S/N'} eliminado permanentemente.`);
      setTimeout(() => setNotif(''), 4000);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el pedido.");
    }
  };

  const filteredOrders = useMemo(() => {
    return allOrders.filter(order => {
      // 1. Store Filter
      if (selectedOrderStoreFilter !== 'all' && order.storeOwnerId !== selectedOrderStoreFilter) {
        return false;
      }
      // 2. Status Filter
      if (selectedOrderStatusFilter !== 'all' && order.status !== selectedOrderStatusFilter) {
        return false;
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
        const matchesStore = storeNameText.includes(query) || storeUsernameText.includes(query);
        return matchesName || matchesPhone || matchesEmail || matchesNumber || matchesNotes || matchesDriverName || matchesDriverPhone || matchesDriverVehicle || matchesStore;
      }
      return true;
    });
  }, [allOrders, selectedOrderStoreFilter, selectedOrderStatusFilter, orderSearchQuery, storesMap, users]);

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
    if (!selectedStoreFilter || selectedStoreFilter === 'all') {
      return sorted;
    }
    return sorted.filter(u => u.username === selectedStoreFilter || u.uid === selectedStoreFilter || (u.email && u.email === selectedStoreFilter));
  }, [users, selectedStoreFilter]);

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
                    onClick={() => setActiveAdminTab('subscriptions')}
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

                  <button
                    onClick={() => setActiveAdminTab('payments')}
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
                    onClick={() => setActiveAdminTab('orders')}
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
                    <span className="text-[10px] bg-gray-900 text-gray-300 font-mono font-bold px-2 py-0.5 rounded-md border border-gray-800 shrink-0">
                      {allOrders.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveAdminTab('drivers')}
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
                    onClick={() => setActiveAdminTab('referrals')}
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
                    onClick={() => setActiveAdminTab('users')}
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
                    onClick={() => setActiveAdminTab('general')}
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
                <p className="text-xs font-extrabold text-white">Linnk.Pro Admin</p>
                <p className="text-[9px] text-gray-500">© 2025 Todos los derechos reservados</p>
              </div>
            </div>

          </aside>

          {/* Fixed Mobile Bottom Navigation Bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#090b12]/95 backdrop-blur-xl border-t border-gray-800/80 px-3 py-2 flex items-center gap-2 overflow-x-auto scroll-smooth no-scrollbar shadow-2xl">
            <button
              onClick={() => setActiveAdminTab('subscriptions')}
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
              onClick={() => setActiveAdminTab('payments')}
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
              onClick={() => setActiveAdminTab('orders')}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl transition relative cursor-pointer min-w-[78px] shrink-0 ${
                activeAdminTab === 'orders'
                  ? 'text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <div className="relative">
                <ShoppingBag className="w-5 h-5" />
                {allOrders.length > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-emerald-500 text-black font-mono text-[8px] font-black px-1.5 py-0.2 rounded-full">
                    {allOrders.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">Pedidos</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('drivers')}
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
              onClick={() => setActiveAdminTab('referrals')}
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
              onClick={() => setActiveAdminTab('users')}
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
              onClick={() => setActiveAdminTab('general')}
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

            {/* Global Dashboard Metrics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0b101d] border border-gray-800/80 p-4 rounded-2xl shadow-lg">
                <div className="flex justify-between items-center text-gray-400 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">USUARIOS TOTALES</span>
                  <Users className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-2xl font-black text-white mb-1">{stats.totalUsers}</p>
                <span className="text-[10px] text-emerald-400 font-bold font-mono flex items-center gap-1">
                  <span>↑ 12%</span>
                  <span className="text-gray-500">esta semana</span>
                </span>
              </div>

              <div className="bg-[#0b101d] border border-gray-800/80 p-4 rounded-2xl shadow-lg">
                <div className="flex justify-between items-center text-gray-400 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">PERFILES ACTIVOS</span>
                  <Layers className="w-4 h-4 text-indigo-400" />
                </div>
                <p className="text-2xl font-black text-white mb-1">{stats.totalProfiles}</p>
                <span className="text-[10px] text-indigo-400 font-bold font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block animate-pulse"></span>
                  <span>100% en vivo</span>
                </span>
              </div>

              <div className="bg-[#0b101d] border border-gray-800/80 p-4 rounded-2xl shadow-lg">
                <div className="flex justify-between items-center text-gray-400 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">SUSCRITOS DE PAGO</span>
                  <ShieldAlert className="w-4 h-4 text-yellow-500" />
                </div>
                <p className="text-2xl font-black text-white mb-1">{stats.subscribersPro + stats.subscribersBusiness}</p>
                <span className="text-[10px] text-emerald-400 font-bold font-mono">
                  {Math.round(((stats.subscribersPro + stats.subscribersBusiness) / (stats.totalUsers || 1)) * 100)}% conversión
                </span>
              </div>

              <div className="bg-[#0b101d] border border-gray-800/80 p-4 rounded-2xl shadow-lg">
                <div className="flex justify-between items-center text-gray-400 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">INGRESO MENSUAL COP</span>
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-2xl font-black text-white mb-1">${stats.monthlyRevenue.toLocaleString()} COP</p>
                <span className="text-[10px] text-gray-500 font-bold font-mono flex items-center gap-1">
                  <FileText className="w-3 h-3 text-gray-400" />
                  <span>Facturación Estimada</span>
                </span>
              </div>
            </div>

        {activeAdminTab === 'referrals' ? (
          <div className="animate-fade-in">
            <AdminReferralsManager />
          </div>
        ) : activeAdminTab === 'drivers' ? (
          <div className="animate-fade-in">
            <AdminDriversManager />
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

                  <span className="text-xs text-gray-400 font-semibold font-mono ml-2">Filtrar:</span>
                  <select 
                    value={selectedStoreFilter}
                    onChange={(e) => setSelectedStoreFilter(e.target.value)}
                    className="bg-gray-950 border border-gray-800 text-white rounded-xl py-1.5 px-3 text-xs outline-none cursor-pointer"
                  >
                    <option value="all">Todas las Tiendas</option>
                    {allStoresList.length > 0 ? (
                      allStoresList.map(s => (
                        <option key={s.uid} value={s.username || s.uid}>
                          {s.name} {s.username ? `(@${s.username})` : ''}
                        </option>
                      ))
                    ) : (
                      users.filter(u => u.storeName || u.username).map(u => (
                        <option key={u.uid} value={u.username}>{(u.storeName || u.username)}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

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
                                isExpired || isSuspended
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : daysRemaining <= 3
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {isExpired || isSuspended ? '0 días (Suspendida)' : `${daysRemaining} días`}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-900/30">
                            <div>
                              <span className="text-[10px] font-bold text-gray-550 uppercase block mb-0.5">Próximo Vencimiento:</span>
                              <span className={`font-mono text-[11px] block ${isExpired || isSuspended ? 'text-red-400 font-black' : 'text-emerald-400 font-semibold'}`}>
                                {user.subscriptionPaidUntil ? formatSpanishDate(user.subscriptionPaidUntil) : 'No registrada'}
                              </span>
                              <span className="inline-block mt-1 px-1.5 py-0.2 bg-gray-900 text-gray-400 border border-gray-800 rounded text-[9px] font-mono">
                                Día de corte: {anchorDay}
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
                                value={isSuspended ? 'suspended' : effectiveStatus}
                                onChange={(e) => {
                                  if (e.target.value === 'suspended') {
                                    if (!user.suspended) handleToggleSuspension(user);
                                  } else {
                                    if (user.suspended) handleToggleSuspension(user);
                                    handleUpdateSubscriptionStatus(user.uid, e.target.value);
                                  }
                                }}
                                className={`w-full rounded-xl py-2 px-2 text-[10.5px] uppercase font-black border cursor-pointer outline-none text-center ${
                                  isSuspended || effectiveStatus === 'suspended'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-black'
                                    : effectiveStatus === 'active' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                    : effectiveStatus === 'expired' 
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}
                              >
                                <option value="active" className="bg-gray-950 text-white">🟢 ACTIVA</option>
                                <option value="suspended" className="bg-gray-950 text-amber-300">⚠️ SUSPENDIDA</option>
                                <option value="expired" className="bg-gray-950 text-white">🔴 EXPIRADA</option>
                                <option value="pending_payment" className="bg-gray-950 text-white">🟡 PENDIENTE</option>
                              </select>
                            </div>
                          </div>

                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleOpenScheduleModal(user)}
                              className="w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-xl text-[10.5px] font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Horario: {user.scheduleEnabled && user.openTime && user.closeTime ? `${user.openTime} - ${user.closeTime}` : 'Configurar Horario'}</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setConfirmExtendModalUser(user)}
                              title={`Extender 1 mes manteniendo el día de corte (${anchorDay})`}
                              className="w-full py-2.5 bg-indigo-500/15 hover:bg-indigo-500 text-indigo-400 hover:text-white font-black text-[10px] tracking-wider uppercase rounded-xl border border-indigo-500/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Calendar className="w-4 h-4" /> +1 Mes (Corte: {anchorDay})
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePage(user)}
                              disabled={deletingUserId === user.uid}
                              title="Eliminar esta página/tienda"
                              className="w-full py-2.5 bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white font-black text-[10px] tracking-wider uppercase rounded-xl border border-red-500/25 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {deletingUserId === user.uid ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
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
                                <div className={`font-mono text-xs ${isExpired || isSuspended ? 'text-red-400 font-black' : 'text-emerald-400 font-semibold'}`}>
                                  {user.subscriptionPaidUntil ? formatSpanishDate(user.subscriptionPaidUntil) : 'Sin pago activo'}
                                </div>
                                <div className="mt-1">
                                  <span className="px-2 py-0.5 bg-gray-900 text-gray-400 border border-gray-800 rounded text-[9.5px] font-mono font-bold">
                                    Día de corte: {anchorDay}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black font-mono ${
                                  isExpired || isSuspended
                                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                    : daysRemaining <= 3
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}>
                                  {isExpired || isSuspended ? '0 días (Suspendida)' : `${daysRemaining} días`}
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
                                    <span>{user.scheduleEnabled && user.openTime && user.closeTime ? `${user.openTime} - ${user.closeTime}` : 'Horario'}</span>
                                  </button>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                <select
                                  value={isSuspended ? 'suspended' : effectiveStatus}
                                  onChange={(e) => {
                                    if (e.target.value === 'suspended') {
                                      if (!user.suspended) handleToggleSuspension(user);
                                    } else {
                                      if (user.suspended) handleToggleSuspension(user);
                                      handleUpdateSubscriptionStatus(user.uid, e.target.value);
                                    }
                                  }}
                                  className={`rounded-lg py-1 px-2 text-[10px] uppercase font-black border cursor-pointer outline-none ${
                                    isSuspended || effectiveStatus === 'suspended'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-black'
                                      : effectiveStatus === 'active' 
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                      : effectiveStatus === 'expired' 
                                      ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  }`}
                                >
                                  <option value="active" className="bg-gray-950 text-white">🟢 ACTIVA</option>
                                  <option value="suspended" className="bg-gray-950 text-amber-300">⚠️ SUSPENDIDA</option>
                                  <option value="expired" className="bg-gray-950 text-white">🔴 EXPIRADA</option>
                                  <option value="pending_payment" className="bg-gray-950 text-white">🟡 PENDIENTE</option>
                                </select>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setConfirmExtendModalUser(user)}
                                    title={`Extender 1 mes conservando el día de corte ${anchorDay}`}
                                    className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white text-indigo-400 font-black text-[10px] tracking-wider uppercase rounded-lg border border-indigo-500/25 transition cursor-pointer flex items-center gap-1"
                                  >
                                    <Calendar className="w-3.5 h-3.5" /> +1 Mes (Corte)
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
                        </td>
                        <td className="py-4 px-4 font-semibold">
                          <span className="text-xs uppercase font-black text-indigo-400 block">{p.plan}</span>
                          <span className="text-[10px] text-gray-400 italic">Suscripción Mensual</span>
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
          <div className="bg-gray-900/30 border border-gray-800 rounded-3xl p-6 backdrop-blur-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-900 pb-4">
              <div>
                <h3 className="font-extrabold text-white text-base">Sincronización General de Pedidos de Tiendas</h3>
                <p className="text-[11px] text-gray-500 font-medium font-sans">
                  Monitorea de manera centralizada los pedidos, estados de entrega y datos de contacto de todos los clientes en la plataforma.
                </p>
              </div>
            </div>

            {/* Metrics cards inside orders */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-950/60 border border-gray-900 p-4 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Pedidos Cargados</span>
                <span className="text-xl font-black text-white">
                  {filteredOrders.length} <span className="text-xs text-gray-500 font-normal">/ {allOrders.length}</span>
                </span>
              </div>
              <div className="bg-gray-950/60 border border-gray-900 p-4 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Venta Total Estimada</span>
                <span className="text-xl font-black text-emerald-400">
                  ${filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toLocaleString()} COP
                </span>
              </div>
              <div className="bg-gray-950/60 border border-gray-900 p-4 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Pendientes</span>
                <span className="text-xl font-black text-amber-400">
                  {filteredOrders.filter(o => o.status === 'pending').length}
                </span>
              </div>
              <div className="bg-gray-950/60 border border-gray-900 p-4 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Entregados</span>
                <span className="text-xl font-black text-emerald-400">
                  {filteredOrders.filter(o => o.status === 'delivered').length}
                </span>
              </div>
            </div>

            {/* Filter controls */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
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

              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 bg-gray-950 border border-gray-850 rounded-xl px-3 py-1.5">
                  <span className="text-[10px] text-gray-450 uppercase font-bold font-mono">Tienda:</span>
                  <select
                    value={selectedOrderStoreFilter}
                    onChange={(e) => setSelectedOrderStoreFilter(e.target.value)}
                    className="bg-transparent border-none text-white text-xs outline-none cursor-pointer pr-4 font-bold"
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

                <div className="flex items-center gap-1.5 bg-gray-950 border border-gray-850 rounded-xl px-3 py-1.5">
                  <span className="text-[10px] text-gray-450 uppercase font-bold font-mono">Estado:</span>
                  <select
                    value={selectedOrderStatusFilter}
                    onChange={(e) => setSelectedOrderStatusFilter(e.target.value)}
                    className="bg-transparent border-none text-white text-xs outline-none cursor-pointer pr-4 font-bold"
                  >
                    <option value="all" className="bg-gray-950">Todos</option>
                    <option value="pending" className="bg-gray-950 text-amber-400 font-bold">🟡 Pendiente</option>
                    <option value="processing" className="bg-gray-950 text-sky-400 font-bold">🔵 En Proceso</option>
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
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[10px] text-gray-450 uppercase font-black tracking-widest bg-gray-900/15">
                      <th className="py-4 px-4">Pedido #</th>
                      <th className="py-2.5 px-4">Tienda de Origen</th>
                      <th className="py-2.5 px-4">Cliente / Contacto</th>
                      <th className="py-2.5 px-4">Artículos del Pedido</th>
                      <th className="py-2.5 px-4">Monto / Pago</th>
                      <th className="py-2.5 px-4 text-center">Estado del Pedido</th>
                      <th className="py-2.5 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850 text-xs">
                    {filteredOrders.map((order) => {
                      const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
                      return (
                        <tr key={order.id} className="hover:bg-gray-900/10 transition">
                          <td className="py-4 px-4">
                            <span className="font-extrabold text-white text-xs block">#{order.orderNumber || 'S/N'}</span>
                            <span className="text-[10px] text-gray-500 font-mono block">
                              {dateObj.toLocaleDateString('es-CO', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-start gap-2">
                              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                <Store className="w-3.5 h-3.5 text-indigo-400" />
                              </div>
                              <div className="min-w-0">
                                <span className="font-extrabold text-indigo-300 text-xs block truncate max-w-[170px]" title={getStoreNameForOrder(order)}>
                                  {getStoreNameForOrder(order)}
                                </span>
                                {getStoreUsernameForOrder(order) && (
                                  <span className="text-[10px] text-gray-400 font-mono block truncate max-w-[170px]">
                                    @{getStoreUsernameForOrder(order)}
                                  </span>
                                )}
                                <span className="text-[9px] text-gray-500 font-mono block">
                                  ID: {order.storeOwnerId.substring(0, 8)}...
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="font-bold text-white text-xs">{order.customerName}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{order.customerPhone}</div>
                            {order.customerEmail && (
                              <div className="text-[9px] text-gray-500">{order.customerEmail}</div>
                            )}
                            <div className="text-[10px] text-gray-400 mt-1 max-w-xs truncate" title={order.customerAddress}>
                              📍 {order.customerAddress}
                            </div>
                            {order.notes && (
                              <div className="text-[9px] text-amber-400/80 italic mt-0.5 max-w-xs truncate" title={order.notes}>
                                Nota: "{order.notes}"
                              </div>
                            )}

                            {order.deliveryDriverName && (
                              <div className="mt-2 p-2 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-[10.5px] space-y-0.5 text-emerald-300 max-w-xs">
                                <div className="font-bold flex items-center justify-between gap-1 text-emerald-400">
                                  <span className="flex items-center gap-1">
                                    <Bike className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    {order.deliveryDriverName}
                                  </span>
                                  <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-extrabold uppercase">
                                    {order.deliveryStep === 'delivered' ? '✓ Entregado' : '🛵 Domicilio'}
                                  </span>
                                </div>
                                {order.deliveryDriverPhone && (
                                  <div className="text-[9.5px] text-gray-300 font-mono">📱 {order.deliveryDriverPhone}</div>
                                )}
                                {order.deliveryVehicle && (
                                  <div className="text-[9.5px] text-gray-400">🚘 {order.deliveryVehicle} {order.deliveryVehiclePlate ? `(${order.deliveryVehiclePlate})` : ''}</div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <div className="space-y-1 max-w-xs">
                              {order.items?.map((item, idx) => (
                                <div key={idx} className="flex justify-between text-gray-300 gap-2">
                                  <span className="truncate text-[11px]">
                                    {item.name} {item.selectedVariant ? `(${item.selectedVariant})` : ''}
                                  </span>
                                  <span className="font-mono text-gray-500 shrink-0">x{item.quantity}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 px-4 font-mono">
                            <span className="font-extrabold text-white block">
                              ${order.totalAmount.toLocaleString()} COP
                            </span>
                            <span className="text-[9px] uppercase font-black tracking-wider text-gray-500 block">
                              {order.paymentMethod === 'whatsapp' 
                                ? 'Contraentrega (WA)' 
                                : order.paymentMethod === 'transfer' 
                                ? 'Transferencia' 
                                : order.paymentMethod === 'cod' 
                                ? 'Contra entrega' 
                                : 'Efectivo'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            {checkIsTableOrder(order) ? (
                              <select
                                value={order.status === 'shipped' ? 'processing' : order.status === 'cancelled' ? 'pending' : order.status}
                                onChange={(e) => handleUpdateOrderStatus(order.id, order.storeOwnerId, e.target.value as any)}
                                className="bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[10px] uppercase font-black rounded-lg py-1 px-2.5 cursor-pointer outline-none"
                              >
                                <option value="pending" className="bg-gray-950 text-white">🟡 Pendiente</option>
                                <option value="processing" className="bg-gray-950 text-white">🔵 En Proceso</option>
                                <option value="delivered" className="bg-gray-950 text-white">🟢 Entregado</option>
                              </select>
                            ) : (
                              <select
                                value={order.status || 'pending'}
                                onChange={(e) => handleUpdateOrderStatus(order.id, order.storeOwnerId, e.target.value as any)}
                                className={`rounded-lg py-1 px-2.5 text-[10px] uppercase font-black border cursor-pointer outline-none ${
                                  order.status === 'delivered'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : order.status === 'processing'
                                    ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                    : order.status === 'shipped'
                                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                    : order.status === 'cancelled'
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}
                              >
                                <option value="pending" className="bg-gray-950 text-white">🟡 Pendiente</option>
                                <option value="processing" className="bg-gray-950 text-white">🔵 En Proceso</option>
                                <option value="shipped" className="bg-gray-950 text-white">🟣 Enviado</option>
                                <option value="delivered" className="bg-gray-950 text-white">🟢 Entregado</option>
                                <option value="cancelled" className="bg-gray-950 text-white">🔴 Cancelado</option>
                              </select>
                            )}
                          </td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <a
                                href={`https://api.whatsapp.com/send?phone=${order.customerPhone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 hover:text-black text-emerald-400 font-bold text-[10px] rounded-lg border border-emerald-500/25 transition inline-flex items-center gap-1 cursor-pointer"
                                title="Contactar cliente por WhatsApp"
                              >
                                WhatsApp
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDeleteOrder(order)}
                                className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 font-bold text-[10px] rounded-lg border border-red-500/25 transition inline-flex items-center gap-1 cursor-pointer"
                                title="Eliminar pedido permanentemente"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Eliminar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Sentinel and Progressive Load Controls for Orders */}
                <div 
                  ref={ordersSentinelRef} 
                  className="py-6 flex flex-col items-center justify-center gap-2 border-t border-gray-850/60 mt-2"
                >
                  {loadingMoreOrders ? (
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs bg-indigo-500/10 px-5 py-2.5 rounded-xl border border-indigo-500/20 animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Cargando automáticamente los siguientes 8 pedidos...</span>
                    </div>
                  ) : hasMoreOrders ? (
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <span className="text-[11px] text-gray-400 font-medium">
                        Pedidos cargados en vista: <strong className="text-white font-mono">{allOrders.length}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={handleLoadMoreOrders}
                        className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 font-extrabold text-xs rounded-xl border border-indigo-500/30 transition duration-150 cursor-pointer flex items-center gap-2 shadow-sm hover:scale-[1.01] active:scale-98"
                      >
                        <Download className="w-4 h-4" />
                        <span>Cargar siguientes 8 pedidos</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] font-bold text-gray-400 bg-gray-950/80 px-4 py-2 rounded-xl border border-gray-850 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>✓ Carga progresiva completa ({allOrders.length} pedidos cargados)</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
                        </td>
                        <td className="py-4 px-4 font-semibold text-gray-300">{user.email}</td>
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
                              <span>{user.scheduleEnabled && user.openTime && user.closeTime ? `${user.openTime} - ${user.closeTime}` : 'Horario'}</span>
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
                        value={systemSettings.supportEmail || 'soporte@linnkpro.store'}
                        onChange={(e) => setSystemSettings(prev => ({ ...prev, supportEmail: e.target.value }))}
                        placeholder="Ej: soporte@linnkpro.store"
                        className="w-full bg-gray-950 border border-gray-800 focus:border-indigo-500 text-white font-bold text-xs rounded-xl p-3 outline-none transition font-mono"
                      />
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
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-gray-850 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">Horario de Apertura y Cierre</h3>
                    <p className="text-[11px] text-gray-400 font-mono">@{scheduleModalUser.username || scheduleModalUser.storeName || scheduleModalUser.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleModalUser(null)}
                  className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-850 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 pt-1">
                {/* Toggle Schedule */}
                <label className="flex items-center justify-between p-3.5 bg-gray-900/60 border border-gray-800/80 rounded-xl cursor-pointer hover:bg-gray-900 transition">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-extrabold text-white block">Activar Horario Programado</span>
                    <span className="text-[10.5px] text-gray-400 block leading-tight">La tienda responderá automáticamente según las horas establecidas</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={scheduleEnabledInput}
                    onChange={(e) => setScheduleEnabledInput(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                  />
                </label>

                {/* Time Inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-gray-300 block">Hora de Apertura:</label>
                    <input
                      type="time"
                      value={openTimeInput}
                      onChange={(e) => setOpenTimeInput(e.target.value)}
                      disabled={!scheduleEnabledInput}
                      className="w-full bg-gray-900 border border-gray-800 focus:border-indigo-500 text-white font-mono text-xs px-3 py-2.5 rounded-xl outline-none transition disabled:opacity-40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-gray-300 block">Hora de Cierre:</label>
                    <input
                      type="time"
                      value={closeTimeInput}
                      onChange={(e) => setCloseTimeInput(e.target.value)}
                      disabled={!scheduleEnabledInput}
                      className="w-full bg-gray-900 border border-gray-800 focus:border-indigo-500 text-white font-mono text-xs px-3 py-2.5 rounded-xl outline-none transition disabled:opacity-40"
                    />
                  </div>
                </div>

                {/* Quick presets */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-extrabold uppercase text-gray-500 tracking-wider block">Atajos de Horario:</span>
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
                        onClick={() => {
                          setOpenTimeInput(preset.open);
                          setCloseTimeInput(preset.close);
                          setScheduleEnabledInput(true);
                        }}
                        className="px-2.5 py-1 bg-gray-900 hover:bg-indigo-600/30 text-gray-300 hover:text-indigo-300 border border-gray-800 hover:border-indigo-500/40 rounded-lg text-[10px] font-mono transition cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-850">
                <button
                  type="button"
                  onClick={() => setScheduleModalUser(null)}
                  className="flex-1 py-2.5 bg-gray-900 hover:bg-gray-850 text-gray-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={savingSchedule}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingSchedule ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Guardar Horario</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal para Confirmar Extensión +1 Mes (Corte) */}
        {confirmExtendModalUser && (() => {
          const user = confirmExtendModalUser;
          const { nextPaidUntil, anchorDay } = calculateNextExpirationDate(user, 1);
          const formatSpanishDate = (dateStr?: string | null | Date) => {
            if (!dateStr) return 'Sin pago activo';
            const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
            if (isNaN(d.getTime())) return 'Sin pago activo';
            return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
          };

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
              <div className="bg-[#0f1422] border border-indigo-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
                {/* Encabezado */}
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 rounded-xl">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">Confirmar Extensión (+1 Mes)</h3>
                      <p className="text-[11px] text-gray-400">Renovación de suscripción con día de corte</p>
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

                  <div className="flex items-center justify-between bg-emerald-500/10 -mx-4 px-4 py-2.5 border-y border-emerald-500/20">
                    <span className="text-xs text-emerald-300 font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Nuevo Vencimiento (+1 Mes):
                    </span>
                    <span className="text-xs font-mono font-black text-emerald-400">
                      {formatSpanishDate(nextPaidUntil)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs text-gray-400 font-semibold">Día de Corte:</span>
                    <span className="px-2 py-0.5 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 rounded text-xs font-mono font-black">
                      Día {anchorDay}
                    </span>
                  </div>
                </div>

                <p className="text-[11.5px] text-gray-300 text-center leading-relaxed">
                  ¿Deseas confirmar la adición de <strong className="text-white font-black">+1 mes</strong> de servicio a esta tienda? El estado se activará automáticamente.
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
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40 disabled:opacity-50"
                  >
                    {extendingSubscription ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>Confirmar +1 Mes</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
