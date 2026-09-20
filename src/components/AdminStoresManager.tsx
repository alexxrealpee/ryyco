/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Store, 
  Search, 
  MapPin, 
  Phone, 
  Mail, 
  ExternalLink, 
  Clock, 
  Calendar, 
  DollarSign, 
  ShoppingBag, 
  Layers, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Copy, 
  Check, 
  Lock, 
  Unlock, 
  KeyRound, 
  Share2, 
  Sparkles, 
  RefreshCw, 
  Eye, 
  Utensils, 
  Bike, 
  Building2, 
  Globe, 
  MessageCircle, 
  Info, 
  List, 
  Grid, 
  CreditCard,
  Wifi,
  Smartphone,
  Send,
  X,
  Edit3,
  Save,
  Navigation,
  Compass,
  Crosshair
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db, getStoreOperatingScheduleInfo, fetchAllActiveProductsAndStores } from '../lib/firebase';
import { UserProfile, OrderItem, WeeklySchedule } from '../types';
import { 
  extractCoordinates, 
  isValidCoordinate, 
  buildGoogleNavigationUrl, 
  buildWazeNavigationUrl, 
  buildNormalizedMapUrl 
} from '../lib/coordinateUtils';
import { MapLocationPickerModal } from './MapLocationPickerModal';

function formatWhatsAppDisplay(raw?: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length === 12) {
    return digits.slice(2);
  }
  return digits;
}

function getWhatsAppUrl(phone?: string, text?: string): string {
  if (!phone) return '#';
  const clean = phone.replace(/\D/g, '');
  const finalNumber = clean.startsWith('57') ? clean : `57${clean}`;
  return `https://wa.me/${finalNumber}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

interface AdminStoresManagerProps {
  storesMap: Record<string, UserProfile>;
  allStores: { uid: string; name: string; username: string; phone?: string; address?: string }[];
  users?: any[];
  allOrders: OrderItem[];
  onOpenScheduleModal: (user: any) => void;
  onSelectStoreOrders: (storeUid: string) => void;
  onRefreshData?: () => void;
}

export default function AdminStoresManager({
  storesMap,
  allStores,
  users = [],
  allOrders,
  onOpenScheduleModal,
  onSelectStoreOrders,
  onRefreshData
}: AdminStoresManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'open' | 'closed' | 'suspended'>('all');
  const [selectedPlan, setSelectedPlan] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  // Detailed modal target
  const [detailStore, setDetailStore] = useState<UserProfile | null>(null);
  
  // Edit Location Modal state
  const [locationModalStore, setLocationModalStore] = useState<UserProfile | null>(null);
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editMapUrl, setEditMapUrl] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [detectingGps, setDetectingGps] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  
  // Feedback states
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const [sendingResetFor, setSendingResetFor] = useState<string | null>(null);
  const [actionNotif, setActionNotif] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [updatingStoreId, setUpdatingStoreId] = useState<string | null>(null);

  // Products count per store
  const [storeProductCounts, setStoreProductCounts] = useState<Record<string, number>>({});
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Load product counts
  useEffect(() => {
    let isMounted = true;
    async function loadProductsCount() {
      try {
        setLoadingProducts(true);
        const { products } = await fetchAllActiveProductsAndStores();
        if (!isMounted) return;
        
        const counts: Record<string, number> = {};
        products.forEach(p => {
          if (p.userId) {
            counts[p.userId] = (counts[p.userId] || 0) + 1;
          }
        });
        setStoreProductCounts(counts);
      } catch (e) {
        console.error("Error loading products count for stores:", e);
      } finally {
        if (isMounted) setLoadingProducts(false);
      }
    }
    loadProductsCount();
    return () => { isMounted = false; };
  }, []);

  // Show temporary feedback toast
  const showNotif = (msg: string, type: 'success' | 'error' = 'success') => {
    setActionNotif({ msg, type });
    setTimeout(() => {
      setActionNotif(null);
    }, 4500);
  };

  // Convert storesMap to an enriched, strictly deduplicated array of unique stores
  const storeList: UserProfile[] = useMemo(() => {
    const storeMap = new Map<string, UserProfile>();
    const keyByUid = new Map<string, string>();
    const keyByUsername = new Map<string, string>();
    const keyByEmail = new Map<string, string>();
    const keyByPhone = new Map<string, string>();
    const keyByName = new Map<string, string>();

    const normalizeText = (text?: string): string => {
      if (!text) return '';
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
    };

    const normalizePhone = (phone?: string): string => {
      if (!phone) return '';
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10) {
        return digits.slice(-10);
      }
      return digits.length >= 7 ? digits : '';
    };

    const GENERIC_NAMES = new Set(['tienda', 'mitienda', 'restaurante', 'mirestaurante', 'usuario', 'admin', 'administrador', 'general', 'store']);

    const upsertStore = (item: Partial<UserProfile> & { uid?: string; id?: string }) => {
      if (!item) return;
      const rawUid = (item.uid || item.id || '').trim();
      const rawUsername = (item.username || '').replace(/^@+/, '').trim().toLowerCase();
      const rawEmail = (item.email || '').trim().toLowerCase();
      const rawPhone = normalizePhone(item.phone || item.whatsapp || (item as any).ownerWhatsapp);
      
      const displayNameCandidate = (item.displayName || item.storeName || '').trim();
      const cleanName = normalizeText(displayNameCandidate);
      const isNameUsable = cleanName.length >= 3 && !GENERIC_NAMES.has(cleanName);

      // Skip invalid items with zero identifying attributes
      if (!rawUid && !rawUsername && !rawEmail && !rawPhone && !isNameUsable) return;

      // Locate target store key by any matched identity token in order of specificity
      let targetKey: string | null = null;
      if (rawUid && keyByUid.has(rawUid)) {
        targetKey = keyByUid.get(rawUid)!;
      } else if (rawUsername && keyByUsername.has(rawUsername)) {
        targetKey = keyByUsername.get(rawUsername)!;
      } else if (rawUid && keyByUsername.has(rawUid)) {
        // UID happened to be a username
        targetKey = keyByUsername.get(rawUid)!;
      } else if (rawUsername && keyByUid.has(rawUsername)) {
        targetKey = keyByUid.get(rawUsername)!;
      } else if (rawEmail && rawEmail.includes('@') && keyByEmail.has(rawEmail)) {
        targetKey = keyByEmail.get(rawEmail)!;
      } else if (rawPhone && keyByPhone.has(rawPhone)) {
        targetKey = keyByPhone.get(rawPhone)!;
      } else if (isNameUsable && keyByName.has(cleanName)) {
        targetKey = keyByName.get(cleanName)!;
      }

      if (targetKey && storeMap.has(targetKey)) {
        // Merge into existing record
        const current = storeMap.get(targetKey)!;

        // Choose best canonical UID: prefer auth UIDs (typically ~28 chars) over username keys
        let bestUid = current.uid || rawUid || targetKey;
        if (rawUid && rawUid.length > 20 && (!current.uid || current.uid.length < 20)) {
          bestUid = rawUid;
        }

        const merged: UserProfile = {
          ...current,
          ...item,
          uid: bestUid,
          displayName: current.displayName || item.displayName || item.storeName || current.storeName || current.username || 'Tienda',
          username: current.username || item.username || '',
          email: current.email || item.email || '',
          phone: current.phone || item.phone || current.whatsapp || item.whatsapp || '',
          whatsapp: current.whatsapp || item.whatsapp || current.phone || item.phone || '',
          ownerWhatsapp: current.ownerWhatsapp || item.ownerWhatsapp || current.whatsapp || item.whatsapp || '',
          customerServiceWhatsapp: current.customerServiceWhatsapp || item.customerServiceWhatsapp || '',
          address: current.address || item.address || current.restaurantAddress || item.restaurantAddress || '',
          restaurantCity: current.restaurantCity || item.restaurantCity || current.location || item.location || '',
          location: current.location || item.location || current.restaurantCity || item.restaurantCity || '',
          restaurantAddress: current.restaurantAddress || item.restaurantAddress || current.address || item.address || '',
          restaurantReference: current.restaurantReference || item.restaurantReference || '',
          restaurantCuisine: current.restaurantCuisine || item.restaurantCuisine || current.category || item.category || '',
          category: current.category || item.category || current.restaurantCuisine || item.restaurantCuisine || '',
          lat: current.lat ?? item.lat,
          lng: current.lng ?? item.lng,
          mapUrl: current.mapUrl || item.mapUrl || (item as any).restaurantMapUrl,
          photoURL: current.photoURL || item.photoURL,
          coverURL: current.coverURL || item.coverURL,
          bio: current.bio || item.bio || '',
          role: current.role || item.role || 'user',
          plan: (item.plan as any) || current.plan || 'free',
          subscriptionPlan: (item.subscriptionPlan as any) || (current.subscriptionPlan as any) || undefined,
          isClosed: current.isClosed === true || item.isClosed === true,
          suspended: current.suspended === true || item.suspended === true
        };

        storeMap.set(targetKey, merged);

        // Index all aliases to this target key
        if (rawUid) keyByUid.set(rawUid, targetKey);
        if (bestUid) keyByUid.set(bestUid, targetKey);
        if (merged.username) {
          const u = merged.username.replace(/^@+/, '').trim().toLowerCase();
          keyByUsername.set(u, targetKey);
        }
        if (merged.email && merged.email.includes('@')) {
          keyByEmail.set(merged.email.trim().toLowerCase(), targetKey);
        }
        const mPhone = normalizePhone(merged.phone || merged.whatsapp || merged.ownerWhatsapp);
        if (mPhone) keyByPhone.set(mPhone, targetKey);
        const mName = normalizeText(merged.displayName || merged.storeName);
        if (mName.length >= 3 && !GENERIC_NAMES.has(mName)) {
          keyByName.set(mName, targetKey);
        }
      } else {
        const primaryKey = rawUid || (rawUsername ? `user_${rawUsername}` : `store_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
        const newStore: UserProfile = {
          uid: primaryKey,
          email: item.email || '',
          username: rawUsername || item.username || '',
          displayName: item.displayName || item.storeName || item.username || 'Tienda',
          bio: item.bio || '',
          role: item.role || 'user',
          plan: (item.plan as any) || 'free',
          subscriptionPlan: (item.subscriptionPlan as any) || undefined,
          subscriptionStatus: item.subscriptionStatus,
          subscriptionTrialExpires: item.subscriptionTrialExpires || (item as any).subscriptionExpiresAt,
          subscriptionPaidUntil: item.subscriptionPaidUntil || (item as any).subscriptionPaidUntil,
          createdAt: item.createdAt || new Date().toISOString(),
          phone: item.phone || item.whatsapp || '',
          whatsapp: item.whatsapp || item.phone || '',
          ownerWhatsapp: item.ownerWhatsapp || item.whatsapp || item.phone || '',
          customerServiceWhatsapp: item.customerServiceWhatsapp || '',
          address: item.address || item.restaurantAddress || '',
          location: item.location || item.restaurantCity || '',
          restaurantCity: item.restaurantCity || item.location || '',
          restaurantAddress: item.restaurantAddress || item.address || '',
          restaurantReference: item.restaurantReference || '',
          restaurantCuisine: item.restaurantCuisine || '',
          category: item.category || item.restaurantCuisine || '',
          lat: item.lat,
          lng: item.lng,
          mapUrl: item.mapUrl || (item as any).restaurantMapUrl,
          photoURL: item.photoURL || '',
          coverURL: item.coverURL || '',
          isClosed: item.isClosed === true,
          suspended: item.suspended === true,
          openTime: item.openTime,
          closeTime: item.closeTime,
          weeklySchedule: item.weeklySchedule,
          scheduleEnabled: item.scheduleEnabled,
          ...item
        };

        storeMap.set(primaryKey, newStore);

        // Register in fast index maps
        if (rawUid) keyByUid.set(rawUid, primaryKey);
        keyByUid.set(primaryKey, primaryKey);
        if (rawUsername) keyByUsername.set(rawUsername, primaryKey);
        if (newStore.username) {
          const u = newStore.username.replace(/^@+/, '').trim().toLowerCase();
          keyByUsername.set(u, primaryKey);
        }
        if (newStore.email && newStore.email.includes('@')) {
          keyByEmail.set(newStore.email.trim().toLowerCase(), primaryKey);
        }
        if (rawPhone) keyByPhone.set(rawPhone, primaryKey);
        if (isNameUsable) keyByName.set(cleanName, primaryKey);
      }
    };

    // 1. Process from storesMap (Note: storesMap maps doc.id, uid and username to profile)
    if (storesMap && typeof storesMap === 'object') {
      Object.values(storesMap).forEach((store) => {
        if (store) upsertStore(store);
      });
    }

    // 2. Process users prop (contains full AdminUser profiles)
    if (Array.isArray(users)) {
      users.forEach((u) => {
        if (u) upsertStore(u);
      });
    }

    // 3. Process allStores prop
    if (Array.isArray(allStores)) {
      allStores.forEach((s) => {
        if (s) {
          upsertStore({
            uid: s.uid,
            displayName: s.name,
            username: s.username,
            phone: s.phone,
            address: s.address
          });
        }
      });
    }

    // Return strictly unique stores list sorted alphabetically
    return Array.from(storeMap.values()).sort((a, b) => {
      const nameA = (a.displayName || a.storeName || a.username || '').toLowerCase();
      const nameB = (b.displayName || b.storeName || b.username || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [storesMap, allStores, users]);

  // Unique cities list
  const uniqueCities = useMemo(() => {
    const set = new Set<string>();
    storeList.forEach(s => {
      const c = (s.restaurantCity || s.location || '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [storeList]);

  // Unique categories list
  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    storeList.forEach(s => {
      const c = (s.category || s.restaurantCuisine || s.layout || '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [storeList]);

  // Aggregate stats per store from allOrders
  const storeOrderStats = useMemo(() => {
    const stats: Record<string, { orderCount: number; totalSales: number; pendingCount: number }> = {};
    allOrders.forEach(o => {
      const storeId = o.storeOwnerId;
      if (!storeId) return;
      if (!stats[storeId]) {
        stats[storeId] = { orderCount: 0, totalSales: 0, pendingCount: 0 };
      }
      stats[storeId].orderCount += 1;
      stats[storeId].totalSales += (o.totalAmount || 0);
      if (o.status === 'pending') {
        stats[storeId].pendingCount += 1;
      }
    });
    return stats;
  }, [allOrders]);

  // Helper to test if store is currently open
  const checkStoreIsOpen = (store: UserProfile) => {
    if (store.suspended) return false;
    if (store.isClosed) return false;
    const sched = getStoreOperatingScheduleInfo(store);
    if (sched.scheduleActive) {
      return !sched.isClosedBySchedule;
    }
    return true; // Default open if no schedule restriction
  };

  // Filtered stores
  const filteredStores = useMemo(() => {
    return storeList.filter(s => {
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = (s.displayName || s.storeName || '').toLowerCase().includes(q);
        const matchesUser = (s.username || '').toLowerCase().includes(q);
        const matchesEmail = (s.email || '').toLowerCase().includes(q);
        const matchesPhone = (s.phone || s.whatsapp || s.ownerWhatsapp || s.customerServiceWhatsapp || '').toLowerCase().includes(q);
        const matchesCity = (s.restaurantCity || s.location || '').toLowerCase().includes(q);
        const matchesAddress = (s.address || s.restaurantAddress || s.restaurantReference || '').toLowerCase().includes(q);
        const matchesBio = (s.bio || '').toLowerCase().includes(q);
        if (!matchesName && !matchesUser && !matchesEmail && !matchesPhone && !matchesCity && !matchesAddress && !matchesBio) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus === 'suspended') {
        if (!s.suspended) return false;
      } else if (selectedStatus === 'open') {
        if (!checkStoreIsOpen(s)) return false;
      } else if (selectedStatus === 'closed') {
        if (checkStoreIsOpen(s)) return false;
      }

      // Category filter
      if (selectedCategory !== 'all') {
        const cat = (s.category || s.restaurantCuisine || s.layout || '').toLowerCase();
        if (!cat.includes(selectedCategory.toLowerCase())) {
          return false;
        }
      }

      // Plan filter
      if (selectedPlan !== 'all') {
        const p = (s.subscriptionPlan || s.plan || 'free').toLowerCase();
        if (selectedPlan === 'trial') {
          if (s.subscriptionStatus !== 'trial') return false;
        } else if (p !== selectedPlan.toLowerCase()) {
          return false;
        }
      }

      // City filter
      if (selectedCity !== 'all') {
        const city = (s.restaurantCity || s.location || '').toLowerCase();
        if (city !== selectedCity.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [storeList, searchTerm, selectedStatus, selectedCategory, selectedPlan, selectedCity]);

  // Global KPIs
  const globalKpis = useMemo(() => {
    const total = storeList.length;
    let openCount = 0;
    let suspendedCount = 0;
    let withProductsCount = 0;
    let totalSalesPlatform = 0;

    storeList.forEach(s => {
      if (s.suspended) suspendedCount++;
      else if (checkStoreIsOpen(s)) openCount++;

      if ((storeProductCounts[s.uid] || 0) > 0) withProductsCount++;

      const stats = storeOrderStats[s.uid];
      if (stats) totalSalesPlatform += stats.totalSales;
    });

    return {
      total,
      openCount,
      suspendedCount,
      withProductsCount,
      totalSalesPlatform,
      citiesCount: uniqueCities.length
    };
  }, [storeList, storeProductCounts, storeOrderStats, uniqueCities]);

  // Copy Store Link
  const handleCopyStoreLink = (username: string, uid: string) => {
    const origin = window.location.origin;
    const url = `${origin}/${username || ''}`;
    navigator.clipboard.writeText(url);
    setCopiedUid(uid);
    showNotif(`¡Enlace copiado al portapapeles! (${url})`);
    setTimeout(() => setCopiedUid(null), 2500);
  };

  // Send Password Reset Email directly to store owner email
  const handleSendPasswordReset = async (email: string, storeName: string, uid: string) => {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) {
      showNotif(`Esta tienda no tiene un correo electrónico registrado.`, 'error');
      return;
    }

    setSendingResetFor(uid);
    try {
      await sendPasswordResetEmail(auth, clean);
      showNotif(`✓ Enlace de restablecimiento de contraseña enviado exitosamente a: ${clean} (${storeName}).`);
    } catch (err: any) {
      console.error("Error enviando restablecimiento de contraseña:", err);
      let errMsg = 'Error al enviar correo de restablecimiento.';
      if (err.code === 'auth/user-not-found') {
        errMsg = `No se encontró usuario con el correo ${clean}. Pudo haberse registrado con Google.`;
      } else if (err.code === 'auth/too-many-requests') {
        errMsg = 'Demasiadas solicitudes recientes. Espera unos minutos.';
      } else if (err.message) {
        errMsg = err.message;
      }
      showNotif(errMsg, 'error');
    } finally {
      setSendingResetFor(null);
    }
  };

  // Toggle Store Suspension
  const handleToggleSuspension = async (store: UserProfile) => {
    const newStatus = !store.suspended;
    const confirmMsg = newStatus 
      ? `¿Estás seguro de SUSPENDER la tienda "${store.displayName || store.username}"? Sus clientes no podrán realizar compras.`
      : `¿Reactivar la tienda "${store.displayName || store.username}"?`;
    
    if (!window.confirm(confirmMsg)) return;

    setUpdatingStoreId(store.uid);
    try {
      const userRef = doc(db, 'profiles', store.uid);
      await updateDoc(userRef, {
        suspended: newStatus,
        updatedAt: new Date().toISOString()
      });
      store.suspended = newStatus;
      showNotif(`Tienda ${newStatus ? 'suspendida' : 'reactivada'} con éxito.`);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error("Error toggling suspension:", err);
      showNotif("Error al actualizar estado de la tienda.", "error");
    } finally {
      setUpdatingStoreId(null);
    }
  };

  // Toggle store manual open/closed
  const handleToggleStoreOpen = async (store: UserProfile) => {
    const newIsClosed = !Boolean(store.isClosed);
    setUpdatingStoreId(store.uid);
    try {
      const userRef = doc(db, 'profiles', store.uid);
      await updateDoc(userRef, {
        isClosed: newIsClosed,
        updatedAt: new Date().toISOString()
      });
      store.isClosed = newIsClosed;
      try {
        localStorage.removeItem('linnk_all_active_data_cache');
        window.dispatchEvent(new CustomEvent('linnk:store_status_changed', { detail: { uid: store.uid, isClosed: newIsClosed } }));
        fetch('/api/catalog/refresh', { method: 'POST' }).catch(() => {});
      } catch (e) {}
      showNotif(`Tienda marcada como ${newIsClosed ? 'Cerrada Temporalmente' : 'Abierta al Público'}.`);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error("Error toggling open/close:", err);
      showNotif("Error al modificar horario de la tienda.", "error");
    } finally {
      setUpdatingStoreId(null);
    }
  };

  // Open Edit Location Modal
  const handleOpenLocationModal = (store: UserProfile) => {
    setLocationModalStore(store);
    const currAddr = store.restaurantAddress || store.address || '';
    const currCity = store.restaurantCity || (store.location && store.location !== currAddr ? store.location : '');
    setEditAddress(currAddr);
    setEditCity(currCity);
    setEditReference(store.restaurantReference || '');
    const existingMapUrl = (store as any).mapUrl || '';
    setEditMapUrl(existingMapUrl);

    let initialLat = typeof store.lat === 'number' && !isNaN(store.lat) ? store.lat.toString() : '';
    let initialLng = typeof store.lng === 'number' && !isNaN(store.lng) ? store.lng.toString() : '';

    if (!initialLat || !initialLng) {
      const coords = extractCoordinates(existingMapUrl);
      if (coords) {
        initialLat = coords.lat.toString();
        initialLng = coords.lng.toString();
      }
    }

    setEditLat(initialLat);
    setEditLng(initialLng);
  };

  // Synchronize Google Maps URL input with coordinate detection
  const handleMapUrlInput = (val: string) => {
    setEditMapUrl(val);
    const coords = extractCoordinates(val);
    if (coords) {
      setEditLat(coords.lat.toString());
      setEditLng(coords.lng.toString());
    }
  };

  // Get current device GPS location for the store premises
  const handleGetCurrentGps = () => {
    if (!navigator.geolocation) {
      showNotif("Tu navegador no soporta geolocalización GPS.", "error");
      return;
    }
    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetectingGps(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setEditLat(lat.toString());
        setEditLng(lng.toString());
        const normUrl = buildNormalizedMapUrl(lat, lng);
        setEditMapUrl(normUrl);
        showNotif(`✓ Coordenadas GPS fijadas con éxito: ${lat}, ${lng}`);
      },
      (err) => {
        setDetectingGps(false);
        showNotif(`No se pudo obtener el GPS: ${err.message}`, "error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Handle location confirmation from interactive Google Map picker
  const handleMapPickerConfirm = (data: { address: string; lat: number; lng: number; mapUrl: string }) => {
    const latFormatted = data.lat.toFixed(6);
    const lngFormatted = data.lng.toFixed(6);
    setEditLat(latFormatted);
    setEditLng(lngFormatted);

    const generatedMapUrl = data.mapUrl || buildNormalizedMapUrl(data.lat, data.lng);
    setEditMapUrl(generatedMapUrl);

    // If an address was pinpointed and we don't have one yet, or want to complement it
    if (data.address && data.address.trim()) {
      if (!editAddress.trim() || editAddress.trim().toLowerCase().includes('sin dirección')) {
        setEditAddress(data.address.trim());
      }
      if (!editCity.trim()) {
        const lower = data.address.toLowerCase();
        if (lower.includes('ipiales')) setEditCity('Ipiales');
        else if (lower.includes('pasto')) setEditCity('Pasto');
        else if (lower.includes('cali')) setEditCity('Cali');
        else if (lower.includes('bogot')) setEditCity('Bogotá');
      }
    }

    setIsMapPickerOpen(false);
    showNotif(`✓ Ubicación seleccionada en el mapa: ${latFormatted}, ${lngFormatted}`);
  };

  // Save Store Location
  const handleSaveLocation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!locationModalStore) return;

    const trimmedAddress = editAddress.trim();
    const trimmedCity = editCity.trim();
    const trimmedRef = editReference.trim();
    let trimmedMapUrl = editMapUrl.trim();

    if (!trimmedAddress && !trimmedCity) {
      showNotif("Por favor ingresa al menos la dirección o la ciudad de la tienda.", "error");
      return;
    }

    // Process coordinates
    let latNum = parseFloat(editLat.trim());
    let lngNum = parseFloat(editLng.trim());
    let hasCoords = isValidCoordinate(latNum, lngNum);

    if (!hasCoords && trimmedMapUrl) {
      const parsed = extractCoordinates(trimmedMapUrl);
      if (parsed) {
        latNum = parsed.lat;
        lngNum = parsed.lng;
        hasCoords = true;
      }
    }

    if (hasCoords && !trimmedMapUrl) {
      trimmedMapUrl = buildNormalizedMapUrl(latNum, lngNum);
    }

    setSavingLocation(true);
    try {
      const updatePayload: any = {
        address: trimmedAddress,
        restaurantAddress: trimmedAddress,
        restaurantCity: trimmedCity,
        restaurantReference: trimmedRef,
        storeReference: trimmedRef,
        location: trimmedCity || trimmedAddress,
        updatedAt: new Date().toISOString()
      };

      if (trimmedMapUrl) {
        updatePayload.mapUrl = trimmedMapUrl;
      }

      if (hasCoords) {
        updatePayload.lat = latNum;
        updatePayload.lng = lngNum;
      }

      // 1. Update in profiles collection
      try {
        const profileRef = doc(db, 'profiles', locationModalStore.uid);
        await updateDoc(profileRef, updatePayload);
      } catch (profErr) {
        console.warn("No se pudo actualizar profiles directamente, intentando users:", profErr);
      }

      // 2. Update in users collection for consistency
      try {
        const userRef = doc(db, 'users', locationModalStore.uid);
        await updateDoc(userRef, updatePayload);
      } catch (uErr) {
        // ignore
      }

      // 3. Mutate local store object directly for instant UI update
      locationModalStore.address = trimmedAddress;
      locationModalStore.restaurantAddress = trimmedAddress;
      locationModalStore.restaurantCity = trimmedCity;
      locationModalStore.restaurantReference = trimmedRef;
      locationModalStore.location = trimmedCity || trimmedAddress;
      (locationModalStore as any).mapUrl = trimmedMapUrl;
      if (hasCoords) {
        locationModalStore.lat = latNum;
        locationModalStore.lng = lngNum;
      }

      if (storesMap && storesMap[locationModalStore.uid]) {
        Object.assign(storesMap[locationModalStore.uid], updatePayload);
      }

      showNotif(`✓ Ubicación y coordenadas GPS de "${locationModalStore.displayName || locationModalStore.username}" guardadas correctamente.`);
      setLocationModalStore(null);
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      console.error("Error al guardar la ubicación:", err);
      showNotif(err?.message || "Error al actualizar la ubicación de la tienda.", "error");
    } finally {
      setSavingLocation(false);
    }
  };

  // Format category badge
  const getCategoryLabel = (store: UserProfile) => {
    if (store.category) return store.category;
    if (store.restaurantCuisine) return `Restaurante (${store.restaurantCuisine})`;
    if (store.layout === 'food') return 'Restaurante / Comidas';
    if (store.layout === 'liquor') return 'Licores & Bebidas';
    if (store.layout === 'shoes') return 'Calzado & Moda';
    if (store.layout === 'tech') return 'Tecnología';
    return 'Comercio General';
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Toast Notification */}
      {actionNotif && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 shadow-2xl transition animate-fade-in ${
          actionNotif.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300' 
            : 'bg-red-950/90 border-red-500/40 text-red-300'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {actionNotif.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span className="truncate">{actionNotif.msg}</span>
          </div>
          <button
            onClick={() => setActionNotif(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-gray-900/90 via-gray-900/60 to-gray-950/90 border border-gray-800 rounded-3xl p-5 sm:p-6 backdrop-blur-sm relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-pink-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-pink-500/10 text-pink-400 rounded-2xl border border-pink-500/20 shadow-inner">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-white text-lg sm:text-xl flex items-center gap-2 tracking-tight">
                  <span>Directorio & Datos de Tiendas</span>
                  <span className="px-2.5 py-0.5 bg-pink-500/15 text-pink-300 border border-pink-500/30 rounded-full text-xs font-black font-mono">
                    {globalKpis.total} REGISTRADAS
                  </span>
                </h3>
                <p className="text-xs text-gray-400 font-medium">
                  Consulta de forma centralizada información de contacto, teléfonos, WhatsApp, ubicación física, horarios y modalidades de servicio.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefreshData && (
              <button
                type="button"
                onClick={onRefreshData}
                className="px-3.5 py-2 bg-gray-950 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm"
                title="Recargar datos de tiendas"
              >
                <RefreshCw className="w-3.5 h-3.5 text-pink-400" />
                <span>Actualizar</span>
              </button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center bg-gray-950 border border-gray-800 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'grid' 
                    ? 'bg-pink-500 text-white shadow-md' 
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Vista Cuadrícula / Tarjetas"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'table' 
                    ? 'bg-pink-500 text-white shadow-md' 
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Vista Tabla Resumen"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Key Metrics / Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5">
          <div className="bg-[#0b101d] border border-gray-850 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Abiertas Ahora
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-emerald-400 font-mono">{globalKpis.openCount}</span>
              <span className="text-[10px] text-gray-500 font-medium">de {globalKpis.total}</span>
            </div>
          </div>

          <div className="bg-[#0b101d] border border-gray-850 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-indigo-400" />
              Con Catálogo Activo
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-indigo-300 font-mono">{globalKpis.withProductsCount}</span>
              <span className="text-[10px] text-gray-500 font-medium">con productos</span>
            </div>
          </div>

          <div className="bg-[#0b101d] border border-gray-850 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              Cobertura de Ciudades
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-amber-300 font-mono">{globalKpis.citiesCount || 1}</span>
              <span className="text-[10px] text-gray-500 font-medium">municipios</span>
            </div>
          </div>

          <div className="bg-[#0b101d] border border-gray-850 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              Ventas Totales Plataforma
            </span>
            <div className="mt-1">
              <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono truncate block">
                ${globalKpis.totalSalesPlatform.toLocaleString('es-CO')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0b101d] border border-gray-850 rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Main Search Input */}
          <div className="relative flex-1 min-w-0">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-500">
              <Search className="w-4 h-4" />
            </span>
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por tienda, @usuario, WhatsApp, teléfono, correo, ciudad o dirección..."
              className="w-full bg-gray-950 border border-gray-800 focus:border-pink-500 text-white font-medium text-xs rounded-xl py-3 pl-10 pr-9 outline-none transition placeholder:text-gray-600"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Filter Selectors */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Operational Status */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl px-2.5 py-1.5 flex flex-col">
              <span className="text-[9px] font-black text-gray-400 uppercase font-mono">Estado:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as any)}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer pt-0.5 truncate"
              >
                <option value="all" className="bg-gray-950">Todos los estados</option>
                <option value="open" className="bg-gray-950 text-emerald-400">🟢 Abiertas ahora</option>
                <option value="closed" className="bg-gray-950 text-amber-400">🔴 Cerradas</option>
                <option value="suspended" className="bg-gray-950 text-red-400">⚠️ Suspendidas</option>
              </select>
            </div>

            {/* Plan filter */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl px-2.5 py-1.5 flex flex-col">
              <span className="text-[9px] font-black text-gray-400 uppercase font-mono">Plan:</span>
              <select
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer pt-0.5 truncate"
              >
                <option value="all" className="bg-gray-950">Todos los planes</option>
                <option value="basico" className="bg-gray-950 text-indigo-300">Básico ($49k)</option>
                <option value="medio" className="bg-gray-950 text-purple-300">Medio ($98k)</option>
                <option value="pro" className="bg-gray-950 text-amber-300">Pro ($147k)</option>
                <option value="trial" className="bg-gray-950 text-cyan-300">🆓 Prueba (Trial)</option>
              </select>
            </div>

            {/* City filter */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl px-2.5 py-1.5 flex flex-col">
              <span className="text-[9px] font-black text-gray-400 uppercase font-mono">Ciudad:</span>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer pt-0.5 truncate"
              >
                <option value="all" className="bg-gray-950">Todas ({uniqueCities.length})</option>
                {uniqueCities.map(c => (
                  <option key={c} value={c} className="bg-gray-950">{c}</option>
                ))}
              </select>
            </div>

            {/* Category / Layout filter */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl px-2.5 py-1.5 flex flex-col">
              <span className="text-[9px] font-black text-gray-400 uppercase font-mono">Categoría:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer pt-0.5 truncate"
              >
                <option value="all" className="bg-gray-950">Todas</option>
                <option value="food" className="bg-gray-950">🍽️ Restaurantes / Comidas</option>
                <option value="liquor" className="bg-gray-950">🍾 Licores & Bebidas</option>
                <option value="shoes" className="bg-gray-950">👟 Calzado & Moda</option>
                <option value="tech" className="bg-gray-950">📱 Tecnología</option>
                {uniqueCategories.filter(c => !['food','liquor','shoes','tech','default'].includes(c.toLowerCase())).map(c => (
                  <option key={c} value={c} className="bg-gray-950">{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Active Filters count */}
        <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono pt-1">
          <span>
            Mostrando <strong className="text-white font-bold">{filteredStores.length}</strong> de <strong className="text-white font-bold">{storeList.length}</strong> tiendas
          </span>
          {(searchTerm || selectedStatus !== 'all' || selectedPlan !== 'all' || selectedCity !== 'all' || selectedCategory !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedStatus('all');
                setSelectedPlan('all');
                setSelectedCity('all');
                setSelectedCategory('all');
              }}
              className="text-pink-400 hover:text-pink-300 font-bold underline cursor-pointer"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Stores List Content */}
      {filteredStores.length === 0 ? (
        <div className="text-center py-16 bg-[#0b101d] border border-dashed border-gray-800 rounded-3xl p-6 space-y-3">
          <Store className="w-10 h-10 text-gray-600 mx-auto" />
          <h4 className="text-white font-black text-sm">No se encontraron tiendas</h4>
          <p className="text-gray-400 text-xs max-w-sm mx-auto">
            Ninguna tienda coincide con el criterio de búsqueda o los filtros seleccionados.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW: Rich Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {filteredStores.map(store => {
            const isOpen = checkStoreIsOpen(store);
            const scheduleInfo = getStoreOperatingScheduleInfo(store);
            const productCount = storeProductCounts[store.uid] || 0;
            const orderStats = storeOrderStats[store.uid] || { orderCount: 0, totalSales: 0, pendingCount: 0 };
            
            const ownerPhoneClean = formatWhatsAppDisplay(store.ownerWhatsapp || store.whatsapp || store.phone);
            const customerServiceClean = formatWhatsAppDisplay(store.customerServiceWhatsapp);
            const addressDisplay = store.restaurantAddress || store.address || '';
            const cityDisplay = store.restaurantCity || (store.location && store.location !== addressDisplay ? store.location : '');
            const finalAddress = addressDisplay || (store.location && store.location !== cityDisplay ? store.location : '');

            return (
              <div 
                key={store.uid}
                className={`bg-[#0b101d] border rounded-3xl overflow-hidden shadow-xl flex flex-col transition duration-200 hover:border-gray-700 ${
                  store.suspended 
                    ? 'border-red-900/40 opacity-90' 
                    : isOpen 
                    ? 'border-gray-850 hover:border-pink-500/40' 
                    : 'border-gray-850'
                }`}
              >
                {/* Store Header Banner */}
                <div className="relative h-28 w-full bg-gradient-to-r from-gray-900 via-gray-850 to-gray-900 overflow-hidden">
                  {store.coverURL ? (
                    <img 
                      src={store.coverURL} 
                      alt={store.displayName || store.username}
                      className="w-full h-full object-cover opacity-60"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-950/30 via-purple-950/20 to-gray-950">
                      <Store className="w-10 h-10 text-pink-500/20" />
                    </div>
                  )}

                  {/* Operational Status Pill Top-Right */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {store.suspended ? (
                      <span className="px-2.5 py-1 bg-red-950/90 text-red-300 border border-red-700/60 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg backdrop-blur-md">
                        <AlertTriangle className="w-3 h-3" /> Suspendida
                      </span>
                    ) : isOpen ? (
                      <span className="px-2.5 py-1 bg-emerald-950/90 text-emerald-300 border border-emerald-600/60 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg backdrop-blur-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Abierto
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-950/90 text-amber-300 border border-amber-700/60 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg backdrop-blur-md">
                        <Clock className="w-3 h-3" /> Cerrado
                      </span>
                    )}
                  </div>

                  {/* Category Pill Top-Left */}
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 bg-black/70 text-gray-200 border border-white/10 rounded-full text-[9.5px] font-bold backdrop-blur-md">
                      {getCategoryLabel(store)}
                    </span>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
                  {/* Identity Row */}
                  <div className="flex items-start gap-3.5 -mt-10 relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-gray-900 border-2 border-gray-800 shadow-xl overflow-hidden flex items-center justify-center shrink-0 bg-black">
                      {store.photoURL ? (
                        <img 
                          src={store.photoURL} 
                          alt={store.displayName || store.username}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-xl font-black text-pink-400 uppercase">
                          {(store.displayName || store.username || 'T').charAt(0)}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pt-7">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-black text-white truncate">
                          {store.displayName || store.storeName || store.username}
                        </h4>
                        <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-[9px] font-mono font-black uppercase shrink-0">
                          {store.subscriptionPlan || store.plan || 'Básico'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-pink-400 font-mono font-bold truncate">
                          @{store.username || 'sin-usuario'}
                        </span>
                        {store.username && (
                          <button
                            type="button"
                            onClick={() => handleCopyStoreLink(store.username, store.uid)}
                            title="Copiar link de la tienda"
                            className="text-gray-500 hover:text-white transition cursor-pointer"
                          >
                            {copiedUid === store.uid ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Slogan / Bio */}
                  {store.bio && (
                    <p className="text-[11px] text-gray-400 line-clamp-2 italic leading-snug">
                      "{store.bio}"
                    </p>
                  )}

                  {/* Contact Information & Channels */}
                  <div className="space-y-2 bg-gray-950/60 p-3 rounded-2xl border border-gray-850/80 text-xs">
                    {/* Owner WhatsApp */}
                    {ownerPhoneClean ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          Dueño WhatsApp:
                        </span>
                        <a
                          href={getWhatsAppUrl(store.ownerWhatsapp || store.whatsapp || store.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 text-[11px] transition"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>+57 {ownerPhoneClean}</span>
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-gray-500 text-[11px]">
                        <span>Dueño WhatsApp:</span>
                        <span className="italic font-mono">No configurado</span>
                      </div>
                    )}

                    {/* Customer Service WhatsApp (if present) */}
                    {customerServiceClean && customerServiceClean !== ownerPhoneClean && (
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-900">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <MessageCircle className="w-3.5 h-3.5 text-sky-400" />
                          Atención Clientes:
                        </span>
                        <a
                          href={getWhatsAppUrl(store.customerServiceWhatsapp)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20 text-[11px] transition"
                        >
                          <span>+57 {customerServiceClean}</span>
                        </a>
                      </div>
                    )}

                    {/* Email */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-900">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-indigo-400" />
                        Correo:
                      </span>
                      <span className="font-mono text-gray-300 text-[11px] truncate max-w-[160px]" title={store.email}>
                        {store.email || 'Sin correo'}
                      </span>
                    </div>

                    {/* Physical Address & City */}
                    <div className="flex items-start justify-between gap-2 pt-1.5 border-t border-gray-900 group">
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          Ubicación:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenLocationModal(store)}
                          className="p-1 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 rounded-md transition cursor-pointer"
                          title="Editar dirección y ciudad"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-right text-[11px] text-gray-300 truncate max-w-[170px]">
                        {finalAddress || cityDisplay ? (
                          <>
                            {finalAddress && (
                              <span className="font-medium block truncate text-white" title={finalAddress}>
                                {finalAddress}
                              </span>
                            )}
                            {cityDisplay && cityDisplay !== finalAddress && (
                              <span className="text-[10px] text-amber-300 font-bold block truncate" title={cityDisplay}>
                                {cityDisplay}
                              </span>
                            )}
                            {store.restaurantReference && (
                              <span className="text-[9px] text-gray-400 block truncate" title={store.restaurantReference}>
                                Ref: {store.restaurantReference}
                              </span>
                            )}
                            {((store.lat && store.lng) || (store as any).mapUrl) && (
                              <div className="flex items-center justify-end gap-1.5 mt-1">
                                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-mono font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  GPS Exacto
                                </span>
                                <a
                                  href={buildGoogleNavigationUrl({
                                    lat: store.lat,
                                    lng: store.lng,
                                    mapUrl: (store as any).mapUrl,
                                    address: finalAddress || cityDisplay,
                                    storeName: store.displayName || store.storeName
                                  })}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[9px] text-emerald-400 hover:text-emerald-300 underline font-bold"
                                  title="Probar cómo llegar en Google Maps"
                                >
                                  Probar
                                </a>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-gray-500 italic">No registrada</span>
                            <button
                              type="button"
                              onClick={() => handleOpenLocationModal(store)}
                              className="text-[10px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                            >
                              Agregar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Schedule & Operational Details */}
                  <div className="bg-gray-950/40 p-2.5 rounded-xl border border-gray-900 flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="w-4 h-4 text-purple-400 shrink-0" />
                      <div className="truncate">
                        <span className="text-[9.5px] font-bold text-gray-500 uppercase block">Horario Hoy:</span>
                        <span className="text-[11px] font-bold text-gray-200 block truncate">
                          {scheduleInfo.todayScheduleText || (store.openTime && store.closeTime ? `${store.openTime} - ${store.closeTime}` : 'Sin restricción')}
                        </span>
                      </div>
                    </div>

                    {/* Fast Action Buttons: Location & Schedule */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenLocationModal(store)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1 border ${
                          (store.lat && store.lng) || (store as any).mapUrl
                            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/25'
                        }`}
                        title="Editar ubicación y coordenadas GPS del restaurante"
                      >
                        <MapPin className={`w-3 h-3 ${((store.lat && store.lng) || (store as any).mapUrl) ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <span>{((store.lat && store.lng) || (store as any).mapUrl) ? 'Ubicación ✓' : 'Ubicación'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenScheduleModal(store as any)}
                        className="px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/25 rounded-lg text-[10px] font-bold transition cursor-pointer shrink-0"
                      >
                        Horario
                      </button>
                    </div>
                  </div>

                  {/* Store Performance Metrics (Products, Orders, Sales) */}
                  <div className="grid grid-cols-3 gap-2 py-1 text-center font-mono">
                    <div className="bg-gray-950 p-2 rounded-xl border border-gray-850">
                      <span className="text-[9px] font-bold text-gray-500 uppercase block font-sans">Productos</span>
                      <span className="text-sm font-black text-indigo-300">{productCount}</span>
                    </div>
                    <div className="bg-gray-950 p-2 rounded-xl border border-gray-850">
                      <span className="text-[9px] font-bold text-gray-500 uppercase block font-sans">Pedidos</span>
                      <span className="text-sm font-black text-amber-300">{orderStats.orderCount}</span>
                    </div>
                    <div className="bg-gray-950 p-2 rounded-xl border border-gray-850">
                      <span className="text-[9px] font-bold text-gray-500 uppercase block font-sans">Ventas COP</span>
                      <span className="text-xs font-black text-emerald-400 truncate block">
                        ${orderStats.totalSales.toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="space-y-2 pt-2 border-t border-gray-900">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Visit Online Store */}
                      <a
                        href={store.username ? `/${store.username}` : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2.5 px-3 bg-pink-500/10 hover:bg-pink-500 hover:text-white text-pink-400 border border-pink-500/25 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Ver Tienda</span>
                      </a>

                      {/* View Store Orders */}
                      <button
                        type="button"
                        onClick={() => onSelectStoreOrders(store.uid)}
                        className="py-2.5 px-3 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white text-indigo-400 border border-indigo-500/25 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Ver Pedidos ({orderStats.orderCount})</span>
                      </button>
                    </div>

                    {/* Secondary Utilities Row */}
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      {/* Detailed Store Info Modal */}
                      <button
                        type="button"
                        onClick={() => setDetailStore(store)}
                        className="px-2.5 py-1.5 bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 rounded-xl text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Ver ficha técnica completa y redes"
                      >
                        <Info className="w-3.5 h-3.5 text-blue-400" />
                        <span>Ficha Técnica</span>
                      </button>

                      {/* Send Password Reset Email directly to store owner */}
                      <button
                        type="button"
                        disabled={sendingResetFor === store.uid || !store.email}
                        onClick={() => handleSendPasswordReset(store.email, store.displayName || store.username, store.uid)}
                        className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 rounded-xl text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                        title="Enviar correo de restablecimiento de contraseña al dueño de esta tienda"
                      >
                        {sendingResetFor === store.uid ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        ) : (
                          <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>Restablecer Clave</span>
                      </button>

                      {/* Suspend / Reactivate */}
                      <button
                        type="button"
                        disabled={updatingStoreId === store.uid}
                        onClick={() => handleToggleSuspension(store)}
                        className={`p-1.5 rounded-xl border text-[10.5px] font-bold transition cursor-pointer disabled:opacity-50 ${
                          store.suspended 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                            : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                        }`}
                        title={store.suspended ? 'Reactivar tienda' : 'Suspender tienda'}
                      >
                        {store.suspended ? (
                          <Unlock className="w-3.5 h-3.5" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW: Compact rows with all key data */
        <div className="bg-[#0b101d] border border-gray-850 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800/80 bg-gray-950/80 text-[10px] text-gray-400 uppercase font-black tracking-wider font-mono">
                  <th className="py-4 px-4">Tienda & Usuario</th>
                  <th className="py-4 px-4">Contacto & WhatsApp</th>
                  <th className="py-4 px-4">Ubicación</th>
                  <th className="py-4 px-4">Horario & Estado</th>
                  <th className="py-4 px-4 text-center">Catálogo & Pedidos</th>
                  <th className="py-4 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850/60">
                {filteredStores.map(store => {
                  const isOpen = checkStoreIsOpen(store);
                  const productCount = storeProductCounts[store.uid] || 0;
                  const orderStats = storeOrderStats[store.uid] || { orderCount: 0, totalSales: 0, pendingCount: 0 };
                  const ownerPhoneClean = formatWhatsAppDisplay(store.ownerWhatsapp || store.whatsapp || store.phone);

                  return (
                    <tr key={store.uid} className="hover:bg-gray-900/30 transition">
                      {/* Identity */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                            {store.photoURL ? (
                              <img src={store.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="font-black text-pink-400 text-sm uppercase">
                                {(store.displayName || store.username || 'T').charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-white text-xs truncate max-w-[150px]">
                                {store.displayName || store.storeName || store.username}
                              </span>
                              <span className="px-1.5 py-0.2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[9px] font-black uppercase font-mono">
                                {store.subscriptionPlan || 'Básico'}
                              </span>
                            </div>
                            <span className="text-[11px] text-pink-400 font-mono font-bold block truncate">
                              @{store.username}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {ownerPhoneClean ? (
                            <a
                              href={getWhatsAppUrl(store.ownerWhatsapp || store.whatsapp || store.phone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 font-mono font-bold flex items-center gap-1 text-[11px]"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>+57 {ownerPhoneClean}</span>
                            </a>
                          ) : (
                            <span className="text-gray-500 text-[10px] italic">Sin WhatsApp</span>
                          )}
                          <span className="text-gray-400 text-[11px] font-mono block truncate max-w-[140px]" title={store.email}>
                            {store.email || 'Sin correo'}
                          </span>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-between gap-1.5 max-w-[180px]">
                          <div className="text-[11px] text-gray-300 truncate">
                            <span className="truncate block font-medium text-white">
                              {store.restaurantAddress || store.address || 'Sin dirección'}
                            </span>
                            {store.restaurantCity && (
                              <span className="text-[10px] text-amber-300 font-bold block truncate">
                                {store.restaurantCity}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenLocationModal(store)}
                            className="p-1 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 rounded-lg transition cursor-pointer shrink-0"
                            title="Editar ubicación de la tienda"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Schedule & Operational Status */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {store.suspended ? (
                            <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[9.5px] font-black uppercase inline-block">
                              Suspendida
                            </span>
                          ) : isOpen ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9.5px] font-black uppercase inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              Abierto
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[9.5px] font-black uppercase inline-block">
                              Cerrado
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 block font-mono">
                            {store.openTime && store.closeTime ? `${store.openTime} - ${store.closeTime}` : 'Sin restricción'}
                          </span>
                        </div>
                      </td>

                      {/* Catalog & Orders */}
                      <td className="py-3.5 px-4 text-center font-mono">
                        <div className="space-y-0.5">
                          <span className="text-indigo-300 font-bold block text-xs">
                            {productCount} prods.
                          </span>
                          <span className="text-gray-400 text-[10px] block">
                            {orderStats.orderCount} pedidos (${orderStats.totalSales.toLocaleString('es-CO')})
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={store.username ? `/${store.username}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-pink-500/10 hover:bg-pink-500 hover:text-white text-pink-400 rounded-xl border border-pink-500/25 transition cursor-pointer"
                            title="Ver tienda en vivo"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          <button
                            type="button"
                            onClick={() => onSelectStoreOrders(store.uid)}
                            className="p-2 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white text-indigo-400 rounded-xl border border-indigo-500/25 transition cursor-pointer"
                            title="Ver pedidos de esta tienda"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDetailStore(store)}
                            className="p-2 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-xl border border-gray-800 transition cursor-pointer"
                            title="Ver ficha técnica completa"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={sendingResetFor === store.uid || !store.email}
                            onClick={() => handleSendPasswordReset(store.email, store.displayName || store.username, store.uid)}
                            className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/25 transition cursor-pointer disabled:opacity-30"
                            title="Enviar correo de restablecimiento de clave"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleSuspension(store)}
                            className={`p-2 rounded-xl border transition cursor-pointer ${
                              store.suspended 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}
                            title={store.suspended ? 'Reactivar tienda' : 'Suspender tienda'}
                          >
                            {store.suspended ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comprehensive Store Details Modal */}
      {detailStore && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in">
          <div className="relative max-w-2xl w-full bg-gray-950 border border-gray-800 rounded-3xl p-5 sm:p-6 flex flex-col max-h-[90vh] shadow-2xl space-y-4 text-left overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-850 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                  {detailStore.photoURL ? (
                    <img src={detailStore.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Store className="w-6 h-6 text-pink-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    {detailStore.displayName || detailStore.storeName || detailStore.username}
                  </h3>
                  <p className="text-xs text-pink-400 font-mono font-bold">
                    @{detailStore.username} • UID: <span className="text-gray-500 font-mono text-[10px]">{detailStore.uid}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailStore(null)}
                className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-gray-900 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Technical & Commercial Details Grid */}
            <div className="space-y-4 text-xs">
              {/* Identity & Basic Info */}
              <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-850 space-y-2.5">
                <h4 className="text-[11px] font-black uppercase text-pink-400 tracking-wider font-mono">
                  Identidad Comercial
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-300">
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Nombre Tienda:</span>
                    <strong className="text-white">{detailStore.displayName || detailStore.storeName || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Plan de Suscripción:</span>
                    <strong className="text-indigo-400 uppercase font-mono">{detailStore.subscriptionPlan || 'Básico'}</strong>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Eslogan / Bio:</span>
                    <p className="text-gray-200 italic">{detailStore.bio || 'Sin descripción'}</p>
                  </div>
                </div>
              </div>

              {/* Contact & Support */}
              <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-850 space-y-2.5">
                <h4 className="text-[11px] font-black uppercase text-emerald-400 tracking-wider font-mono">
                  Líneas de Contacto & WhatsApp
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-gray-300">
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">WhatsApp Propietario:</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <strong className="text-emerald-400 font-mono">
                        {detailStore.ownerWhatsapp || detailStore.whatsapp || detailStore.phone || 'No registrado'}
                      </strong>
                      {(detailStore.ownerWhatsapp || detailStore.whatsapp || detailStore.phone) && (
                        <a 
                          href={getWhatsAppUrl(detailStore.ownerWhatsapp || detailStore.whatsapp || detailStore.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-bold"
                        >
                          Abrir Chat
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">WhatsApp Atención Clientes:</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <strong className="text-sky-400 font-mono">
                        {detailStore.customerServiceWhatsapp || 'Igual al de propietario'}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Correo de la Cuenta:</span>
                    <strong className="text-white font-mono">{detailStore.email || 'No registrado'}</strong>
                  </div>

                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Teléfono Secundario:</span>
                    <strong className="text-white font-mono">{detailStore.phone || detailStore.restaurantPhone || 'N/A'}</strong>
                  </div>
                </div>
              </div>

              {/* Location & Physical Premises */}
              <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-850 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black uppercase text-amber-400 tracking-wider font-mono flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    Ubicación & Punto de Venta Físico
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const s = detailStore;
                      setDetailStore(null);
                      handleOpenLocationModal(s);
                    }}
                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Editar Ubicación</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-gray-300">
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Dirección:</span>
                    <strong className="text-white">{detailStore.restaurantAddress || detailStore.address || 'No registrada'}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Ciudad / Municipio:</span>
                    <strong className="text-amber-300 font-bold">{detailStore.restaurantCity || detailStore.location || 'No especificada'}</strong>
                  </div>
                  {detailStore.restaurantReference && (
                    <div className="sm:col-span-2">
                      <span className="text-gray-500 block text-[10px] uppercase font-bold">Barrio / Punto de Referencia:</span>
                      <strong className="text-gray-200">{detailStore.restaurantReference}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Service Modalities (Delivery, Takeaway, Tables, Wifi) */}
              <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-850 space-y-2.5">
                <h4 className="text-[11px] font-black uppercase text-purple-400 tracking-wider font-mono">
                  Modalidades de Servicio & Capacidades
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-800 text-center">
                    <span className="text-gray-500 text-[9.5px] uppercase font-bold block">Domicilios</span>
                    <span className={`font-black text-xs ${detailStore.restaurantAcceptsDelivery !== false ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {detailStore.restaurantAcceptsDelivery !== false ? '✓ Habilitado' : '✗ Inactivo'}
                    </span>
                  </div>

                  <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-800 text-center">
                    <span className="text-gray-500 text-[9.5px] uppercase font-bold block">Para Llevar</span>
                    <span className={`font-black text-xs ${detailStore.restaurantAcceptsTakeaway !== false ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {detailStore.restaurantAcceptsTakeaway !== false ? '✓ Habilitado' : '✗ Inactivo'}
                    </span>
                  </div>

                  <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-800 text-center">
                    <span className="text-gray-500 text-[9.5px] uppercase font-bold block">Pedidos en Mesa</span>
                    <span className={`font-black text-xs ${detailStore.restaurantAcceptsTableOrders ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {detailStore.restaurantAcceptsTableOrders ? `✓ Sí (${detailStore.restaurantTableCount || 10} mesas)` : '✗ No'}
                    </span>
                  </div>

                  <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-800 text-center">
                    <span className="text-gray-500 text-[9.5px] uppercase font-bold block">Tiempo Entrega</span>
                    <span className="font-black text-xs text-white">
                      {detailStore.restaurantDeliveryTime || '30-45 min'}
                    </span>
                  </div>
                </div>

                {/* Additional perks */}
                <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                  {detailStore.restaurantWifiPass && (
                    <span className="px-2.5 py-1 bg-gray-950 border border-gray-800 rounded-lg text-gray-300 flex items-center gap-1.5">
                      <Wifi className="w-3 h-3 text-sky-400" />
                      <span>Wi-Fi Clientes: <strong className="text-white font-mono">{detailStore.restaurantWifiPass}</strong></span>
                    </span>
                  )}
                  {detailStore.restaurantChefNote && (
                    <span className="px-2.5 py-1 bg-gray-950 border border-gray-800 rounded-lg text-gray-300 block w-full">
                      <strong className="text-amber-300">Nota del Chef / Bienvenida:</strong> {detailStore.restaurantChefNote}
                    </span>
                  )}
                </div>
              </div>

              {/* Social Networks & Bank Accounts */}
              {(detailStore.instagram || detailStore.facebook || detailStore.tiktok || (detailStore.bankAccounts && detailStore.bankAccounts.length > 0)) && (
                <div className="bg-gray-900/60 p-4 rounded-2xl border border-gray-850 space-y-2.5">
                  <h4 className="text-[11px] font-black uppercase text-blue-400 tracking-wider font-mono">
                    Redes Sociales & Cuentas Bancarias
                  </h4>

                  <div className="flex flex-wrap gap-2">
                    {detailStore.instagram && (
                      <a 
                        href={`https://instagram.com/${detailStore.instagram.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 bg-pink-500/10 text-pink-300 border border-pink-500/20 rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        Instagram: @{detailStore.instagram.replace('@', '')}
                      </a>
                    )}
                    {detailStore.facebook && (
                      <span className="px-2.5 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-lg text-xs font-bold">
                        Facebook: {detailStore.facebook}
                      </span>
                    )}
                    {detailStore.tiktok && (
                      <span className="px-2.5 py-1 bg-gray-950 text-white border border-gray-800 rounded-lg text-xs font-bold">
                        TikTok: {detailStore.tiktok}
                      </span>
                    )}
                  </div>

                  {detailStore.bankAccounts && detailStore.bankAccounts.length > 0 && (
                    <div className="pt-2 border-t border-gray-850 space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase font-mono block">Cuentas Registradas para Pagos:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {detailStore.bankAccounts.map((b, idx) => (
                          <div key={idx} className="bg-gray-950 p-2 rounded-xl border border-gray-800 text-[11px]">
                            <span className="text-white font-bold block">{b.bankName} ({b.accountType})</span>
                            <span className="text-emerald-400 font-mono">{b.accountNumber}</span>
                            {b.holderName && <span className="text-gray-400 block text-[10px]">{b.holderName}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-850">
              <button
                type="button"
                onClick={() => setDetailStore(null)}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cerrar Ficha
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={sendingResetFor === detailStore.uid || !detailStore.email}
                  onClick={() => handleSendPasswordReset(detailStore.email, detailStore.displayName || detailStore.username, detailStore.uid)}
                  className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>Enviar Correo de Reinicio de Clave</span>
                </button>

                <a
                  href={detailStore.username ? `/${detailStore.username}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-pink-500 hover:bg-pink-400 text-white font-black rounded-xl text-xs transition flex items-center gap-1.5 shadow-lg shadow-pink-500/20"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Visitar Tienda</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Restaurant / Store Location Modal */}
      {locationModalStore && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in text-left">
          <div className="relative max-w-lg w-full bg-[#0b101d] border border-gray-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-gray-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-gray-850 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">
                    Editar Ubicación del Restaurante
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">
                    {locationModalStore.displayName || locationModalStore.username}
                    {locationModalStore.username && (
                      <span className="text-pink-400 font-bold ml-1">@{locationModalStore.username}</span>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setLocationModalStore(null)}
                className="p-1.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="space-y-3.5">
              {/* Field 1: Physical Address */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  Dirección Comercial / Local:
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Ej: Calle 29 Progreso # 12-34 ó Carrera 5 # 10-20"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition"
                  autoFocus
                />
                <span className="text-[10px] text-gray-500 block">
                  Dirección exacta para envíos de domicilios y ubicación del local.
                </span>
              </div>

              {/* Field 2: City / Municipality */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Globe className="w-3.5 h-3.5 text-sky-400" />
                  Ciudad / Municipio:
                </label>
                <input
                  type="text"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  placeholder="Ej: Ipiales, Pasto, Cali, Bogotá..."
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-sky-500 transition"
                />

                {/* Quick Selection Chips for Cities */}
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <span className="text-[10px] text-gray-500 font-bold mr-1">Sugerencias:</span>
                  {['Ipiales', 'Pasto', 'Túquerres', 'Pupiales', 'Cumbal', 'Cali', 'Bogotá', 'Medellín'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditCity(c)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                        editCity.toLowerCase() === c.toLowerCase()
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 font-bold'
                          : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white hover:border-gray-700'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Field 3: Reference / Neighborhood for Drivers */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                  Punto de Referencia para Domiciliarios:
                </label>
                <input
                  type="text"
                  value={editReference}
                  onChange={(e) => setEditReference(e.target.value)}
                  placeholder="Ej: Barrio El Progreso, frente al parque San Felipe o al lado de la droguería"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition"
                />
                <span className="text-[10px] text-gray-500 block">
                  Indicación o punto de referencia clave para que el domiciliario ubique el local de inmediato al recoger el pedido.
                </span>
              </div>

              {/* Field 4: Exact GPS Coordinates & Google Maps Link */}
              <div className="space-y-2 bg-gray-950/60 p-3.5 rounded-2xl border border-gray-800">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Navigation className="w-3.5 h-3.5 text-amber-400" />
                    Ubicación Exacta para Domiciliarios (GPS):
                  </label>
                  <button
                    type="button"
                    onClick={handleGetCurrentGps}
                    disabled={detectingGps}
                    className="text-[10px] px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    title="Obtener coordenadas de la ubicación actual del dispositivo"
                  >
                    <Crosshair className={`w-3 h-3 ${detectingGps ? 'animate-spin' : ''}`} />
                    <span>{detectingGps ? 'Localizando...' : 'Usar GPS actual'}</span>
                  </button>
                </div>

                <span className="text-[10.5px] text-gray-400 block leading-tight">
                  Pega el enlace de Google Maps con las coordenadas o ingresa latitud y longitud. Los domiciliarios recibirán la ruta exacta turn-by-turn hasta la puerta de la tienda.
                </span>

                {/* Botón Seleccionar ubicación en el mapa */}
                <button
                  type="button"
                  onClick={() => setIsMapPickerOpen(true)}
                  className="w-full py-2.5 px-3.5 bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-sky-500/20 hover:from-emerald-500/30 hover:to-sky-500/30 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 hover:text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                  title="Abrir mapa interactivo para seleccionar la ubicación exacta del restaurante"
                >
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Seleccionar ubicación en el mapa</span>
                </button>

                {/* Google Maps link input */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400 font-mono">Enlace de Google Maps / Coordenadas:</span>
                    {editMapUrl && (
                      <a
                        href={buildGoogleNavigationUrl({
                          lat: parseFloat(editLat),
                          lng: parseFloat(editLng),
                          mapUrl: editMapUrl,
                          address: `${editAddress} ${editCity}`.trim(),
                          storeName: locationModalStore?.displayName || locationModalStore?.storeName
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition"
                        title="Probar ruta de cómo llegar para el domiciliario"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Probar ¿Cómo Llegar?</span>
                      </a>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editMapUrl}
                    onChange={(e) => handleMapUrlInput(e.target.value)}
                    placeholder="Ej: https://www.google.com/maps?q=0.827429,-77.659088"
                    className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition font-mono"
                  />
                </div>

                {/* Direct Latitude and Longitude fields */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <span className="text-[9.5px] font-bold text-gray-400 font-mono">Latitud:</span>
                    <input
                      type="text"
                      value={editLat}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditLat(val);
                        const latNum = parseFloat(val);
                        const lngNum = parseFloat(editLng);
                        if (isValidCoordinate(latNum, lngNum)) {
                          setEditMapUrl(buildNormalizedMapUrl(latNum, lngNum));
                        }
                      }}
                      placeholder="Ej: 0.827429"
                      className="w-full bg-black border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9.5px] font-bold text-gray-400 font-mono">Longitud:</span>
                    <input
                      type="text"
                      value={editLng}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditLng(val);
                        const latNum = parseFloat(editLat);
                        const lngNum = parseFloat(val);
                        if (isValidCoordinate(latNum, lngNum)) {
                          setEditMapUrl(buildNormalizedMapUrl(latNum, lngNum));
                        }
                      }}
                      placeholder="Ej: -77.659088"
                      className="w-full bg-black border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition font-mono"
                    />
                  </div>
                </div>

                {/* Real-time coordinates validation banner */}
                {isValidCoordinate(parseFloat(editLat), parseFloat(editLng)) ? (
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-emerald-300 text-[10.5px]">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Coordenadas exactas vinculadas ({parseFloat(editLat).toFixed(6)}, {parseFloat(editLng).toFixed(6)})</span>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${parseFloat(editLat)},${parseFloat(editLng)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-emerald-200 hover:text-white font-bold text-[10px]"
                    >
                      Ver punto
                    </a>
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-500 italic">
                    💡 Si tienes el link de Google Maps de la tienda, pégalo arriba y las coordenadas se extraerán automáticamente.
                  </div>
                )}
              </div>

              {/* Live Preview Box */}
              <div className="bg-gray-950/80 p-3 rounded-2xl border border-gray-850 space-y-1">
                <span className="text-[9.5px] font-mono uppercase font-bold text-gray-500 tracking-wider block">
                  Vista Previa en Tarjeta y Catálogo:
                </span>
                <div className="flex items-start gap-2 text-xs">
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">
                      {editAddress.trim() || <span className="text-gray-600 italic">Sin dirección especificada</span>}
                    </div>
                    {editCity.trim() && (
                      <div className="text-[11px] text-amber-300 font-bold truncate">
                        {editCity.trim()}
                      </div>
                    )}
                    {editReference.trim() && (
                      <div className="text-[10px] text-gray-400 truncate">
                        Ref: {editReference.trim()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-850">
                <button
                  type="button"
                  onClick={() => setLocationModalStore(null)}
                  disabled={savingLocation}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-gray-300 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingLocation}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50 active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingLocation ? 'Guardando...' : 'Guardar Ubicación'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Map Location Picker Modal */}
      {isMapPickerOpen && (
        <MapLocationPickerModal
          isOpen={isMapPickerOpen}
          onClose={() => setIsMapPickerOpen(false)}
          initialLat={parseFloat(editLat) || (locationModalStore?.lat && !isNaN(locationModalStore.lat) ? locationModalStore.lat : 0.825701)}
          initialLng={parseFloat(editLng) || (locationModalStore?.lng && !isNaN(locationModalStore.lng) ? locationModalStore.lng : -77.650182)}
          initialAddress={editAddress || editCity || locationModalStore?.restaurantAddress || locationModalStore?.address || ''}
          onConfirm={handleMapPickerConfirm}
        />
      )}
    </div>
  );
}
