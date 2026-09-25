/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  MessageCircle, 
  ShoppingBag, 
  DollarSign, 
  Search, 
  Filter, 
  Download, 
  ChevronDown, 
  ChevronUp, 
  Phone, 
  Copy, 
  Check, 
  Calendar, 
  Store, 
  MapPin, 
  TrendingUp, 
  Award, 
  Sparkles, 
  ArrowUpDown, 
  ExternalLink,
  Crown,
  Medal,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Eye,
  Send,
  Gift,
  Coins,
  X,
  Plus
} from 'lucide-react';
import { OrderItem, UserProfile, CustomerProfile } from '../types';
import { subscribeToAllCustomerProfiles, adjustCustomerRyycosByAdmin } from '../lib/firebase';
import { getPersonalWhatsAppUrl, openPersonalWhatsApp } from '../lib/whatsappUtils';

interface AdminCustomersRankingProps {
  allOrders: OrderItem[];
  storesMap: Record<string, UserProfile>;
  allStores: { uid: string; name: string; username: string; phone?: string; address?: string }[];
  onGoToOrders?: (storeUid?: string) => void;
}

export interface CustomerAggregated {
  key: string;
  name: string;
  rawPhone: string;
  cleanPhone: string;
  formattedPhone: string;
  whatsappUrl: string;
  addresses: string[];
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  totalSpent: number;
  averageTicket: number;
  firstOrderDate: string;
  lastOrderDate: string;
  favoriteStoreName: string;
  favoriteStoreId?: string;
  storeBreakdown: { storeId: string; storeName: string; count: number; totalSpent: number }[];
  orders: OrderItem[];
  // RYYCOS Loyalty Data
  ryycos: number;
  spinsAvailable: number;
  isRegisteredProfile: boolean;
}

type SortOrderOption = 'orders_desc' | 'orders_asc' | 'spent_desc' | 'recent_desc' | 'ryycos_desc' | 'ryycos_asc';
type CustomerSegmentFilter = 'all' | 'vip' | 'frequent' | 'new' | 'has_whatsapp' | 'has_ryycos';
type TimeRangeFilter = 'all' | 'this_month' | 'last_30_days' | 'last_7_days';

// Helper to normalize phone numbers canonically (removes country code +57, leading zeros, non-digits)
export function getCanonicalPhone(phone?: string): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  // Remove leading zeros: 0057... -> 57... or 0310... -> 310...
  digits = digits.replace(/^0+/, '');
  // If Colombia mobile or landline with country code 57:
  // Mobile: 57 + 10 digits = 12 digits (starts with 573...)
  // Landline: 57 + 10 digits = 12 digits (starts with 5760...)
  if (digits.length === 12 && digits.startsWith('57')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('57')) {
    digits = digits.slice(2);
  } else if (digits.length > 10 && digits.startsWith('573')) {
    digits = digits.slice(2);
  }
  return digits;
}

function cleanPhoneNumber(phone?: string): string {
  return getCanonicalPhone(phone);
}

function normalizeCustomerName(name?: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlaceholderName(name?: string): boolean {
  if (!name) return true;
  const norm = normalizeCustomerName(name);
  return (
    !norm ||
    norm === 'cliente' ||
    norm === 'cliente sin nombre' ||
    norm === 'sin nombre' ||
    norm === 'usuario' ||
    norm === 'comensal' ||
    norm === 'anonimo' ||
    norm === 'cliente registrado' ||
    norm === 'consumidor final'
  );
}

function formatPhoneDisplay(phone?: string): string {
  if (!phone) return 'Sin teléfono';
  const canonical = getCanonicalPhone(phone);
  if (canonical.length === 10 && canonical.startsWith('3')) {
    // Standard Colombian mobile: +57 3XX XXX XXXX
    return `+57 ${canonical.slice(0, 3)} ${canonical.slice(3, 6)} ${canonical.slice(6)}`;
  }
  if (canonical.length === 10) {
    // Standard Colombian landline: +57 XXX XXX XXXX
    return `+57 ${canonical.slice(0, 3)} ${canonical.slice(3, 6)} ${canonical.slice(6)}`;
  }
  if (canonical.length >= 7) {
    return `+57 ${canonical}`;
  }
  return phone.trim();
}

function buildWhatsAppUrl(cleanPhone: string, customerName: string, orderCount: number, customMessage?: string, ryycos?: number): string {
  const canonical = getCanonicalPhone(cleanPhone);
  if (!canonical || canonical.length < 7) return '';
  let waNumber = canonical;
  // If 10 digits starting with 3 (Colombia mobile), prepend 57
  if (waNumber.length === 10) {
    waNumber = '57' + waNumber;
  }

  const cleanName = customerName && !isPlaceholderName(customerName) ? customerName.trim() : '';
  const greeting = cleanName ? `¡Hola ${cleanName}! 👋` : '¡Hola! 👋';
  const ryycosVal = Number(ryycos || 0);
  const ryycosFormatted = ryycosVal.toLocaleString('es-CO');

  const coinsHighlight = ryycosVal > 0
    ? `🪙 *¡Tienes ${ryycosFormatted} monedas RYYCOS disponibles ($${ryycosFormatted} COP)!*\nRecuerda que cada moneda RYYCO es dinero real para descontar en tus hamburguesas, pizzas, almuerzos y comidas favoritas.`
    : `🪙 *¡Pide hoy en RYYCO y gana monedas RYYCOS!*\nPor cada compra acumulas saldo en comida para ahorrar en tus próximos pedidos.`;

  const orderHighlight = orderCount > 0
    ? `🌟 Te agradecemos por tu preferencia: eres de nuestros clientes más especiales con *${orderCount} pedido${orderCount > 1 ? 's' : ''}* en la plataforma.`
    : `🌟 Te damos la bienvenida a la comunidad gastronómica de RYYCO.`;

  const defaultText = customMessage || (
    `${greeting} Te saludamos con mucho aprecio de *RYYCO.com* 🍔🍕\n\n` +
    `${orderHighlight}\n\n` +
    `${coinsHighlight}\n\n` +
    `🍽️ *Haz tu pedido hoy y usa tus RYYCOS aquí:*\n` +
    `👉 https://ryyco.com/\n\n` +
    `¡Estamos listos para atenderte con domicilios rápidos a tu puerta! 🚀`
  );

  return getPersonalWhatsAppUrl(waNumber, defaultText);
}

export default function AdminCustomersRanking({
  allOrders,
  storesMap,
  allStores,
  onGoToOrders
}: AdminCustomersRankingProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [segmentFilter, setSegmentFilter] = useState<CustomerSegmentFilter>('all');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOrderOption>('orders_desc');
  const [expandedCustomerKey, setExpandedCustomerKey] = useState<string | null>(null);
  const [copiedPhoneKey, setCopiedPhoneKey] = useState<string | null>(null);
  const [activeMessageTemplate, setActiveMessageTemplate] = useState<{ customerKey: string; type: 'vip' | 'discount' | 'checkup' } | null>(null);

  // Real-time customer profiles from Firestore
  const [customerProfiles, setCustomerProfiles] = useState<CustomerProfile[]>([]);
  const [adjustingRyycosCustomer, setAdjustingRyycosCustomer] = useState<CustomerAggregated | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState<string>('500');
  const [adjustmentMode, setAdjustmentMode] = useState<'add' | 'set'>('add');
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Bonificación de fidelidad RYYCO');
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState<boolean>(false);
  const [adjustmentSuccessMsg, setAdjustmentSuccessMsg] = useState<string | null>(null);

  // Subscribe to all customer profiles
  useEffect(() => {
    const unsub = subscribeToAllCustomerProfiles((profiles) => {
      setCustomerProfiles(profiles);
    });
    return () => unsub();
  }, []);

  // Map of customer profiles for fast lookup by phone, name, email or ID
  const customerProfilesMap = useMemo(() => {
    const map = new Map<string, CustomerProfile>();
    customerProfiles.forEach(p => {
      if (p.phone) {
        const canonical = getCanonicalPhone(p.phone);
        if (canonical) {
          map.set(canonical, p);
          map.set('57' + canonical, p);
        }
        map.set(p.phone, p);
      }
      if (p.id) {
        const cleanId = getCanonicalPhone(p.id);
        if (cleanId) map.set(cleanId, p);
        map.set(p.id, p);
      }
      if (p.name && !isPlaceholderName(p.name)) {
        map.set(normalizeCustomerName(p.name), p);
      }
      if (p.email) {
        map.set(p.email.toLowerCase().trim(), p);
      }
    });
    return map;
  }, [customerProfiles]);

  // Copy phone handler
  const handleCopyPhone = (customer: CustomerAggregated, e: React.MouseEvent) => {
    e.stopPropagation();
    const phoneToCopy = customer.cleanPhone && customer.cleanPhone.length === 10 && customer.cleanPhone.startsWith('3') 
      ? `+57${customer.cleanPhone}` 
      : customer.rawPhone || customer.cleanPhone;
    
    if (phoneToCopy && navigator.clipboard) {
      navigator.clipboard.writeText(phoneToCopy);
      setCopiedPhoneKey(customer.key);
      setTimeout(() => setCopiedPhoneKey(null), 2000);
    }
  };

  // Date filtering logic
  const filteredOrdersByTime = useMemo(() => {
    if (timeRange === 'all') return allOrders;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return allOrders.filter(order => {
      if (!order.createdAt) return false;
      const orderDate = new Date(order.createdAt);
      if (isNaN(orderDate.getTime())) return true;

      if (timeRange === 'last_7_days') {
        const diffDays = (now.getTime() - orderDate.getTime()) / (1000 * 3600 * 24);
        return diffDays <= 7;
      }
      if (timeRange === 'last_30_days') {
        const diffDays = (now.getTime() - orderDate.getTime()) / (1000 * 3600 * 24);
        return diffDays <= 30;
      }
      if (timeRange === 'this_month') {
        return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [allOrders, timeRange]);

  // Aggregate orders by customer (identified by normalized phone or name) without duplicates
  const aggregatedCustomers = useMemo(() => {
    const map = new Map<string, {
      name: string;
      rawPhone: string;
      cleanPhone: string;
      addresses: Set<string>;
      orders: OrderItem[];
      storeCounts: Map<string, { name: string; count: number; totalSpent: number }>;
      emails: Set<string>;
    }>();

    // Secondary lookup maps to guarantee all orders of the same customer map to ONE masterKey
    const phoneToKeyMap = new Map<string, string>();
    const nameToKeyMap = new Map<string, string>();
    const emailToKeyMap = new Map<string, string>();

    filteredOrdersByTime.forEach(order => {
      // If store filter is applied, only consider orders from that store
      if (selectedStore !== 'all' && order.storeOwnerId !== selectedStore) {
        return;
      }

      const rawPhone = (order.customerPhone || '').trim();
      const canonicalPhone = getCanonicalPhone(rawPhone);
      const rawName = (order.customerName || '').trim();
      const normName = normalizeCustomerName(rawName);
      const isPlaceholder = isPlaceholderName(rawName);
      const email = (order.customerEmail || '').toLowerCase().trim();

      // Find if we already have an existing masterKey for this customer:
      let masterKey: string | undefined = undefined;

      // 1. Match by canonical phone if 7+ digits
      if (canonicalPhone && canonicalPhone.length >= 7) {
        masterKey = phoneToKeyMap.get(canonicalPhone);
      }

      // 2. Match by email if valid
      if (!masterKey && email && email.includes('@')) {
        masterKey = emailToKeyMap.get(email);
      }

      // 3. Match by normalized name (if not a placeholder and already mapped)
      if (!masterKey && !isPlaceholder && normName) {
        masterKey = nameToKeyMap.get(normName);
      }

      // If no existing master key, generate one
      if (!masterKey) {
        if (canonicalPhone && canonicalPhone.length >= 7) {
          masterKey = `phone_${canonicalPhone}`;
        } else if (email && email.includes('@')) {
          masterKey = `email_${email}`;
        } else if (!isPlaceholder && normName) {
          masterKey = `name_${normName}`;
        } else {
          masterKey = `order_${order.id || Math.random().toString(36).substring(2, 7)}`;
        }
      }

      // Register cross-indexes for this customer
      if (canonicalPhone && canonicalPhone.length >= 7) {
        phoneToKeyMap.set(canonicalPhone, masterKey);
      }
      if (email && email.includes('@')) {
        emailToKeyMap.set(email, masterKey);
      }
      if (!isPlaceholder && normName) {
        nameToKeyMap.set(normName, masterKey);
      }

      if (!map.has(masterKey)) {
        map.set(masterKey, {
          name: isPlaceholder ? (rawName || 'Cliente') : rawName,
          rawPhone,
          cleanPhone: canonicalPhone,
          addresses: new Set<string>(),
          orders: [],
          storeCounts: new Map(),
          emails: new Set<string>()
        });
      }

      const record = map.get(masterKey)!;
      // Update with more descriptive name if current was placeholder or shorter
      if (isPlaceholderName(record.name) && !isPlaceholder) {
        record.name = rawName;
      } else if (!isPlaceholder && rawName.length > record.name.length) {
        record.name = rawName;
      }
      // Enrich phone if record lacked valid phone but order has it
      if ((!record.cleanPhone || record.cleanPhone.length < 7) && canonicalPhone && canonicalPhone.length >= 7) {
        record.cleanPhone = canonicalPhone;
        record.rawPhone = rawPhone;
      }

      if (email) record.emails.add(email);
      if (order.customerAddress && order.customerAddress.trim()) {
        record.addresses.add(order.customerAddress.trim());
      }
      record.orders.push(order);

      // Track store frequency
      const storeId = order.storeOwnerId || 'unknown';
      const storeName = order.storeName || (storesMap[storeId]?.storeName) || 'Tienda';
      if (!record.storeCounts.has(storeId)) {
        record.storeCounts.set(storeId, { name: storeName, count: 0, totalSpent: 0 });
      }
      const storeEntry = record.storeCounts.get(storeId)!;
      storeEntry.count += 1;
      if (order.status !== 'cancelled') {
        storeEntry.totalSpent += (Number(order.totalAmount) || 0);
      }
    });

    const list: CustomerAggregated[] = [];

    map.forEach((data, key) => {
      // Sort orders descending by date
      const sortedOrders = [...data.orders].sort((a, b) => {
        const da = new Date(a.createdAt || '').getTime();
        const db = new Date(b.createdAt || '').getTime();
        return db - da;
      });

      let totalSpent = 0;
      let completedOrders = 0;
      let cancelledOrders = 0;
      let activeOrders = 0;

      sortedOrders.forEach(o => {
        if (o.status === 'delivered') completedOrders++;
        else if (o.status === 'cancelled') cancelledOrders++;
        else activeOrders++;

        if (o.status !== 'cancelled') {
          totalSpent += Number(o.totalAmount) || 0;
        }
      });

      const totalOrders = sortedOrders.length;
      const validOrdersCount = totalOrders - cancelledOrders;
      const averageTicket = validOrdersCount > 0 ? Math.round(totalSpent / validOrdersCount) : 0;

      // Find favorite store
      let favoriteStoreName = 'Varias tiendas';
      let favoriteStoreId: string | undefined = undefined;
      let maxStoreCount = 0;
      const storeBreakdown: { storeId: string; storeName: string; count: number; totalSpent: number }[] = [];

      data.storeCounts.forEach((info, sId) => {
        storeBreakdown.push({
          storeId: sId,
          storeName: info.name,
          count: info.count,
          totalSpent: info.totalSpent
        });
        if (info.count > maxStoreCount) {
          maxStoreCount = info.count;
          favoriteStoreName = info.name;
          favoriteStoreId = sId;
        }
      });

      storeBreakdown.sort((a, b) => b.count - a.count);

      const firstOrderDate = sortedOrders[sortedOrders.length - 1]?.createdAt || '';
      const lastOrderDate = sortedOrders[0]?.createdAt || '';
      const formattedPhone = formatPhoneDisplay(data.cleanPhone || data.rawPhone);

      // Match with customer profiles for real-time RYYCOS points balance
      const foundProfile = 
        (data.cleanPhone ? customerProfilesMap.get(data.cleanPhone) : undefined) ||
        (data.rawPhone ? customerProfilesMap.get(getCanonicalPhone(data.rawPhone)) : undefined) ||
        (data.name && !isPlaceholderName(data.name) ? customerProfilesMap.get(normalizeCustomerName(data.name)) : undefined);

      let ryycos = 0;
      let spinsAvailable = 0;
      let isRegisteredProfile = false;

      if (foundProfile) {
        ryycos = foundProfile.points !== undefined 
          ? Number(foundProfile.points) 
          : (foundProfile.ryycos !== undefined ? Number(foundProfile.ryycos) : 0);
        spinsAvailable = Number(foundProfile.spinsAvailable) || 0;
        isRegisteredProfile = true;
      } else {
        // Fallback for customer orders: 1.000 de bienvenida + 500 por cada pedido no cancelado
        const validOrders = data.orders.filter(o => o.status !== 'cancelled').length;
        ryycos = 1000 + (validOrders * 500);
        spinsAvailable = Math.max(1, validOrders);
        isRegisteredProfile = false;
      }

      const whatsappUrl = buildWhatsAppUrl(data.cleanPhone || data.rawPhone, data.name, totalOrders, undefined, ryycos);

      list.push({
        key,
        name: data.name,
        rawPhone: data.rawPhone,
        cleanPhone: data.cleanPhone,
        formattedPhone,
        whatsappUrl,
        addresses: Array.from(data.addresses),
        totalOrders,
        completedOrders,
        cancelledOrders,
        activeOrders,
        totalSpent,
        averageTicket,
        firstOrderDate,
        lastOrderDate,
        favoriteStoreName,
        favoriteStoreId,
        storeBreakdown,
        orders: sortedOrders,
        ryycos,
        spinsAvailable,
        isRegisteredProfile
      });
    });

    // Also include registered customer profiles who don't have orders yet (if viewing all stores and all time)
    if (selectedStore === 'all' && timeRange === 'all') {
      const addedProfilePhones = new Set<string>();
      const addedProfileNames = new Set<string>();

      customerProfiles.forEach(p => {
        const rawPhone = p.phone || p.id || '';
        const canonical = getCanonicalPhone(rawPhone);
        const normName = normalizeCustomerName(p.name);
        const isPlaceholder = isPlaceholderName(p.name);

        // Check if this profile ALREADY matched an order-based customer
        if (canonical && canonical.length >= 7 && phoneToKeyMap.has(canonical)) {
          return;
        }
        if (!isPlaceholder && normName && nameToKeyMap.has(normName)) {
          return;
        }
        if (p.email && emailToKeyMap.has(p.email.toLowerCase().trim())) {
          return;
        }

        // Prevent adding duplicate profiles in this loop
        if (canonical && canonical.length >= 7) {
          if (addedProfilePhones.has(canonical)) return;
          addedProfilePhones.add(canonical);
        } else if (!isPlaceholder && normName) {
          if (addedProfileNames.has(normName)) return;
          addedProfileNames.add(normName);
        }

        const key = canonical && canonical.length >= 7 ? `phone_${canonical}` : `prof_${p.id || normName}`;
        const formattedPhone = formatPhoneDisplay(rawPhone || canonical);
        const ryycos = p.points !== undefined ? Number(p.points) : (p.ryycos !== undefined ? Number(p.ryycos) : 0);
        const spinsAvailable = Number(p.spinsAvailable) || 0;
        const whatsappUrl = buildWhatsAppUrl(canonical || rawPhone, p.name || 'Cliente', 0, undefined, ryycos);

        list.push({
          key,
          name: p.name || 'Cliente Registrado',
          rawPhone,
          cleanPhone: canonical,
          formattedPhone,
          whatsappUrl,
          addresses: p.address ? [p.address] : [],
          totalOrders: p.totalOrdersCount || 0,
          completedOrders: p.totalOrdersCount || 0,
          cancelledOrders: 0,
          activeOrders: 0,
          totalSpent: p.totalSpent || 0,
          averageTicket: 0,
          firstOrderDate: p.createdAt || '',
          lastOrderDate: p.updatedAt || p.createdAt || '',
          favoriteStoreName: 'Sin pedidos aún',
          favoriteStoreId: undefined,
          storeBreakdown: [],
          orders: [],
          ryycos,
          spinsAvailable,
          isRegisteredProfile: true
        });
      });
    }

    // Final foolproof deduplication pass:
    // If any two entries in list share the same valid canonical phone (>= 7 digits)
    // or the exact same normalized non-placeholder name, merge them together into one unified customer.
    const dedupedList: CustomerAggregated[] = [];
    const phoneIndex = new Map<string, number>(); // canonicalPhone -> index in dedupedList
    const nameIndex = new Map<string, number>();  // normalizedName -> index in dedupedList

    list.forEach(c => {
      const canonical = c.cleanPhone && c.cleanPhone.length >= 7 ? c.cleanPhone : '';
      const normName = !isPlaceholderName(c.name) ? normalizeCustomerName(c.name) : '';

      let targetIdx = -1;
      if (canonical && phoneIndex.has(canonical)) {
        targetIdx = phoneIndex.get(canonical)!;
      } else if (!canonical && normName && nameIndex.has(normName)) {
        targetIdx = nameIndex.get(normName)!;
      }

      if (targetIdx === -1) {
        // New unique customer
        const newIdx = dedupedList.length;
        dedupedList.push(c);
        if (canonical) phoneIndex.set(canonical, newIdx);
        if (normName) nameIndex.set(normName, newIdx);
      } else {
        // Merge with existing customer
        const existing = dedupedList[targetIdx];

        // Merge orders deduplicating by order ID
        const existingOrderIds = new Set(existing.orders.map(o => o.id));
        const newOrdersToAdd = c.orders.filter(o => !existingOrderIds.has(o.id));
        const mergedOrders = [...existing.orders, ...newOrdersToAdd].sort((a, b) => {
          const da = new Date(a.createdAt || '').getTime();
          const db = new Date(b.createdAt || '').getTime();
          return db - da;
        });

        // Recalculate stats
        let totalSpent = 0;
        let completedOrders = 0;
        let cancelledOrders = 0;
        let activeOrders = 0;
        mergedOrders.forEach(o => {
          if (o.status === 'delivered') completedOrders++;
          else if (o.status === 'cancelled') cancelledOrders++;
          else activeOrders++;
          if (o.status !== 'cancelled') {
            totalSpent += Number(o.totalAmount) || 0;
          }
        });
        const totalOrders = mergedOrders.length > 0 
          ? mergedOrders.length 
          : Math.max(existing.totalOrders, c.totalOrders);
        const validOrdersCount = totalOrders - cancelledOrders;
        const averageTicket = validOrdersCount > 0 ? Math.round(totalSpent / validOrdersCount) : 0;

        // Merge addresses
        const addressSet = new Set([...existing.addresses, ...c.addresses]);

        // Better name
        const bestName = (!isPlaceholderName(c.name) && c.name.length > existing.name.length) 
          ? c.name 
          : existing.name;

        // Better phone
        const bestCleanPhone = (existing.cleanPhone && existing.cleanPhone.length >= 7)
          ? existing.cleanPhone
          : c.cleanPhone;
        const bestRawPhone = (existing.rawPhone && existing.rawPhone.length >= 7)
          ? existing.rawPhone
          : c.rawPhone;

        // Better RYYCOS
        const bestRyycos = Math.max(existing.ryycos || 0, c.ryycos || 0);
        const bestSpins = Math.max(existing.spinsAvailable || 0, c.spinsAvailable || 0);

        // Dates
        const dates = [existing.lastOrderDate, c.lastOrderDate, existing.firstOrderDate, c.firstOrderDate]
          .filter(Boolean)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        const lastOrderDate = dates[0] || '';
        const firstOrderDate = dates[dates.length - 1] || '';

        // Store breakdown
        const storeMap = new Map<string, { storeId: string; storeName: string; count: number; totalSpent: number }>();
        [...existing.storeBreakdown, ...c.storeBreakdown].forEach(st => {
          if (!storeMap.has(st.storeId)) {
            storeMap.set(st.storeId, { ...st });
          } else {
            const cur = storeMap.get(st.storeId)!;
            cur.count += st.count;
            cur.totalSpent += st.totalSpent;
          }
        });
        const storeBreakdown = Array.from(storeMap.values()).sort((a, b) => b.count - a.count);
        const favoriteStoreName = storeBreakdown[0]?.storeName || existing.favoriteStoreName;
        const favoriteStoreId = storeBreakdown[0]?.storeId || existing.favoriteStoreId;

        const formattedPhone = formatPhoneDisplay(bestCleanPhone || bestRawPhone);
        const whatsappUrl = buildWhatsAppUrl(bestCleanPhone || bestRawPhone, bestName, totalOrders, undefined, bestRyycos);

        dedupedList[targetIdx] = {
          ...existing,
          name: bestName,
          rawPhone: bestRawPhone,
          cleanPhone: bestCleanPhone,
          formattedPhone,
          whatsappUrl,
          addresses: Array.from(addressSet),
          totalOrders,
          completedOrders,
          cancelledOrders,
          activeOrders,
          totalSpent,
          averageTicket,
          firstOrderDate,
          lastOrderDate,
          favoriteStoreName,
          favoriteStoreId,
          storeBreakdown,
          orders: mergedOrders,
          ryycos: bestRyycos,
          spinsAvailable: bestSpins,
          isRegisteredProfile: existing.isRegisteredProfile || c.isRegisteredProfile
        };

        if (bestCleanPhone && !phoneIndex.has(bestCleanPhone)) {
          phoneIndex.set(bestCleanPhone, targetIdx);
        }
      }
    });

    return dedupedList;
  }, [filteredOrdersByTime, selectedStore, storesMap, customerProfilesMap, customerProfiles, timeRange]);

  // Apply filters and sorting
  const processedCustomers = useMemo(() => {
    let result = [...aggregatedCustomers];

    // Filter by search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const qCanonical = getCanonicalPhone(q);
      result = result.filter(c => {
        const nameMatch = c.name.toLowerCase().includes(q);
        const phoneMatch = (qCanonical && c.cleanPhone.includes(qCanonical)) || 
                           c.cleanPhone.includes(q) || 
                           c.rawPhone.toLowerCase().includes(q);
        const addressMatch = c.addresses.some(a => a.toLowerCase().includes(q));
        const storeMatch = c.favoriteStoreName.toLowerCase().includes(q);
        return nameMatch || phoneMatch || addressMatch || storeMatch;
      });
    }

    // Filter by segment
    if (segmentFilter === 'vip') {
      result = result.filter(c => c.totalOrders >= 5);
    } else if (segmentFilter === 'frequent') {
      result = result.filter(c => c.totalOrders >= 2 && c.totalOrders < 5);
    } else if (segmentFilter === 'new') {
      result = result.filter(c => c.totalOrders === 1);
    } else if (segmentFilter === 'has_whatsapp') {
      result = result.filter(c => c.cleanPhone.length >= 7);
    } else if (segmentFilter === 'has_ryycos') {
      result = result.filter(c => c.ryycos > 0);
    }

    // Sort strictly as requested:
    // Default is 'orders_desc' (del que tiene más pedidos al que tiene menos pedidos)
    result.sort((a, b) => {
      if (sortBy === 'orders_desc') {
        if (b.totalOrders !== a.totalOrders) return b.totalOrders - a.totalOrders;
        return b.totalSpent - a.totalSpent;
      }
      if (sortBy === 'orders_asc') {
        if (a.totalOrders !== b.totalOrders) return a.totalOrders - b.totalOrders;
        return a.totalSpent - b.totalSpent;
      }
      if (sortBy === 'spent_desc') {
        if (b.totalSpent !== a.totalSpent) return b.totalSpent - a.totalSpent;
        return b.totalOrders - a.totalOrders;
      }
      if (sortBy === 'recent_desc') {
        const da = new Date(a.lastOrderDate).getTime() || 0;
        const db = new Date(b.lastOrderDate).getTime() || 0;
        return db - da;
      }
      if (sortBy === 'ryycos_desc') {
        if (b.ryycos !== a.ryycos) return b.ryycos - a.ryycos;
        return b.totalOrders - a.totalOrders;
      }
      if (sortBy === 'ryycos_asc') {
        if (a.ryycos !== b.ryycos) return a.ryycos - b.ryycos;
        return a.totalOrders - b.totalOrders;
      }
      return 0;
    });

    return result;
  }, [aggregatedCustomers, searchTerm, segmentFilter, sortBy]);

  // Overall KPIs
  const summaryStats = useMemo(() => {
    const totalCustomers = aggregatedCustomers.length;
    const withWhatsApp = aggregatedCustomers.filter(c => c.cleanPhone.length >= 7).length;
    const recurringCustomers = aggregatedCustomers.filter(c => c.totalOrders > 1).length;
    const totalPlatformSpent = aggregatedCustomers.reduce((acc, c) => acc + c.totalSpent, 0);
    const totalPlatformRyycos = aggregatedCustomers.reduce((acc, c) => acc + (c.ryycos || 0), 0);
    const topCustomer = aggregatedCustomers.length > 0
      ? [...aggregatedCustomers].sort((a, b) => b.totalOrders - a.totalOrders)[0]
      : null;
    const maxOrders = topCustomer ? topCustomer.totalOrders : 1;

    return {
      totalCustomers,
      withWhatsApp,
      recurringCustomers,
      retentionRate: totalCustomers > 0 ? Math.round((recurringCustomers / totalCustomers) * 100) : 0,
      totalPlatformSpent,
      totalPlatformRyycos,
      topCustomer,
      maxOrders
    };
  }, [aggregatedCustomers]);

  // Submit RYYCOS adjustment / bonus
  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingRyycosCustomer) return;
    const amountNum = parseFloat(adjustmentAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      alert("Por favor ingresa un monto válido de RYYCOS.");
      return;
    }

    setIsSubmittingAdjustment(true);
    setAdjustmentSuccessMsg(null);
    try {
      const updated = await adjustCustomerRyycosByAdmin(
        adjustingRyycosCustomer.cleanPhone || adjustingRyycosCustomer.rawPhone,
        amountNum,
        adjustmentMode,
        adjustmentReason.trim() || undefined
      );
      setAdjustmentSuccessMsg(`¡Saldo de ${adjustingRyycosCustomer.name} actualizado con éxito a ${updated.points.toLocaleString('es-CO')} RYYCOS!`);
      setTimeout(() => {
        setAdjustingRyycosCustomer(null);
        setAdjustmentSuccessMsg(null);
      }, 1600);
    } catch (err: any) {
      alert(`Error al ajustar RYYCOS: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (processedCustomers.length === 0) return;

    const headers = [
      'Posición',
      'Nombre Cliente',
      'WhatsApp / Teléfono',
      'Saldo RYYCOS',
      'Número de Pedidos',
      'Pedidos Entregados',
      'Pedidos Cancelados',
      'Total Gastado (COP)',
      'Ticket Promedio (COP)',
      'Tienda Favorita',
      'Último Pedido',
      'Dirección Principal'
    ];

    const rows = processedCustomers.map((c, idx) => [
      idx + 1,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.cleanPhone.length === 10 && c.cleanPhone.startsWith('3') ? '+57' + c.cleanPhone : c.rawPhone || c.cleanPhone}"`,
      c.ryycos,
      c.totalOrders,
      c.completedOrders,
      c.cancelledOrders,
      c.totalSpent,
      c.averageTicket,
      `"${c.favoriteStoreName.replace(/"/g, '""')}"`,
      c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('es-CO') : 'N/A',
      `"${(c.addresses[0] || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ranking_clientes_whatsapp_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-900 to-indigo-950/40 border border-gray-800/90 rounded-2xl p-5 sm:p-7 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Directorio & Fidelización de Clientes por WhatsApp</span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              Ranking de Clientes
              <span className="text-sm font-medium text-emerald-400 font-mono bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-800/50">
                Más a Menos Pedidos
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 max-w-2xl leading-relaxed">
              Monitorea los clientes más fieles de la plataforma, captura su número de WhatsApp en 1 clic y conéctate directamente para fidelizarlos, agradecerles o enviarles promociones especiales.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={handleExportCSV}
              disabled={processedCustomers.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold transition border border-gray-700 cursor-pointer shadow-sm hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              title="Descargar lista completa en formato CSV/Excel"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Exportar Directorio (CSV)</span>
            </button>
          </div>
        </div>

        {/* Global Summary KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mt-6 pt-6 border-t border-gray-800/80">
          <div className="bg-gray-900/80 border border-gray-800/90 rounded-xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Clientes Totales</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-white font-mono">
              {summaryStats.totalCustomers}
            </div>
            <div className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
              <MessageCircle className="w-3 h-3" />
              <span>{summaryStats.withWhatsApp} con WhatsApp</span>
            </div>
          </div>

          <div className="bg-gray-900/80 border border-gray-800/90 rounded-xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Cliente #1 Estrella</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Crown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-base sm:text-lg font-black text-amber-300 truncate font-sans">
              {summaryStats.topCustomer ? summaryStats.topCustomer.name : 'Sin pedidos'}
            </div>
            <div className="mt-1 text-[11px] text-gray-400 flex items-center gap-1 font-mono">
              <ShoppingBag className="w-3 h-3 text-amber-400" />
              <span>{summaryStats.topCustomer ? `${summaryStats.topCustomer.totalOrders} pedidos` : '0 pedidos'}</span>
            </div>
          </div>

          <div className="bg-gray-900/80 border border-gray-800/90 rounded-xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Tasa de Fidelidad</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-emerald-400 font-mono">
              {summaryStats.retentionRate}%
            </div>
            <div className="mt-1 text-[11px] text-gray-400 font-medium">
              {summaryStats.recurringCustomers} clientes recurrentes
            </div>
          </div>

          <div className="bg-gray-900/80 border border-gray-800/90 rounded-xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-300">Total RYYCOS Clientes</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Sparkles className="w-4 h-4 fill-amber-400/20" />
              </div>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-amber-400 font-mono truncate" title={`${summaryStats.totalPlatformRyycos.toLocaleString('es-CO')} RYYCOS`}>
              {summaryStats.totalPlatformRyycos.toLocaleString('es-CO')}
            </div>
            <div className="mt-1 text-[11px] text-amber-500/80 font-medium">
              🪙 ${summaryStats.totalPlatformRyycos.toLocaleString('es-CO')} COP en comida
            </div>
          </div>

          <div className="bg-gray-900/80 border border-gray-800/90 rounded-xl p-3.5 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Gasto Total Clientes</span>
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg sm:text-xl font-black text-cyan-400 font-mono truncate" title={`$${summaryStats.totalPlatformSpent.toLocaleString('es-CO')} COP`}>
              ${summaryStats.totalPlatformSpent.toLocaleString('es-CO')}
            </div>
            <div className="mt-1 text-[11px] text-gray-400 font-medium">
              Volumen acumulado COP
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Real-time search */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por WhatsApp (ej: 318...), nombre o dirección..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-950/80 border border-gray-800 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs px-1"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Store Filter */}
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-gray-400 shrink-0 hidden sm:block" />
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="py-2.5 px-3 rounded-xl bg-gray-950/80 border border-gray-800 text-xs font-semibold text-gray-200 focus:outline-none focus:border-emerald-500 cursor-pointer min-w-[170px]"
            >
              <option value="all">Todas las Tiendas</option>
              {allStores.map(st => (
                <option key={st.uid} value={st.uid}>
                  {st.name || st.username}
                </option>
              ))}
            </select>
          </div>

          {/* Time Range Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400 shrink-0 hidden sm:block" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRangeFilter)}
              className="py-2.5 px-3 rounded-xl bg-gray-950/80 border border-gray-800 text-xs font-semibold text-gray-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Todo el Historial</option>
              <option value="this_month">Este Mes</option>
              <option value="last_30_days">Últimos 30 días</option>
              <option value="last_7_days">Últimos 7 días</option>
            </select>
          </div>

          {/* Sort Order Selector */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-gray-400 shrink-0 hidden sm:block" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOrderOption)}
              className="py-2.5 px-3 rounded-xl bg-gray-950/80 border border-gray-800 text-xs font-semibold text-gray-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="orders_desc">⚡ Más pedidos primero (Mayor a Menor)</option>
              <option value="ryycos_desc">🪙 Mayor saldo RYYCOS primero</option>
              <option value="spent_desc">💰 Mayor dinero gastado ($ COP)</option>
              <option value="recent_desc">🕒 Compra más reciente primero</option>
              <option value="orders_asc">🌱 Menos pedidos primero (1 pedido)</option>
              <option value="ryycos_asc">🪙 Menor saldo RYYCOS primero</option>
            </select>
          </div>
        </div>

        {/* Customer Segment Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-800/60">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-gray-400" />
            Segmento:
          </span>

          <button
            onClick={() => setSegmentFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              segmentFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            Todos ({aggregatedCustomers.length})
          </button>

          <button
            onClick={() => setSegmentFilter('vip')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              segmentFilter === 'vip'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>VIP (5+ pedidos)</span>
            <span className="text-[10px] font-mono opacity-80">
              ({aggregatedCustomers.filter(c => c.totalOrders >= 5).length})
            </span>
          </button>

          <button
            onClick={() => setSegmentFilter('frequent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              segmentFilter === 'frequent'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Frecuentes (2-4 pedidos)</span>
            <span className="text-[10px] font-mono opacity-80">
              ({aggregatedCustomers.filter(c => c.totalOrders >= 2 && c.totalOrders < 5).length})
            </span>
          </button>

          <button
            onClick={() => setSegmentFilter('has_ryycos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              segmentFilter === 'has_ryycos'
                ? 'bg-amber-500 text-gray-950 shadow-md shadow-amber-500/30'
                : 'bg-gray-950 text-amber-400 hover:text-amber-200 border border-amber-900/50'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Con RYYCOS</span>
            <span className="text-[10px] font-mono font-bold opacity-80">
              ({aggregatedCustomers.filter(c => c.ryycos > 0).length})
            </span>
          </button>

          <button
            onClick={() => setSegmentFilter('new')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              segmentFilter === 'new'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            <span>Nuevos (1 pedido)</span>
            <span className="text-[10px] font-mono opacity-80">
              ({aggregatedCustomers.filter(c => c.totalOrders === 1).length})
            </span>
          </button>

          <button
            onClick={() => setSegmentFilter('has_whatsapp')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              segmentFilter === 'has_whatsapp'
                ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/30'
                : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Con WhatsApp Directo</span>
            <span className="text-[10px] font-mono opacity-80">
              ({summaryStats.withWhatsApp})
            </span>
          </button>
        </div>
      </div>

      {/* Main Ranking List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-400 px-1">
          <span>Mostrando <strong className="text-white font-mono">{processedCustomers.length}</strong> clientes ordenados</span>
          <span className="text-gray-500 font-mono">
            {sortBy === 'orders_desc' ? 'Orden: De más a menos pedidos' : 'Orden personalizado'}
          </span>
        </div>

        {processedCustomers.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center space-y-3">
            <Users className="w-12 h-12 text-gray-600 mx-auto" />
            <h3 className="text-base font-bold text-gray-300">No se encontraron clientes</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Intenta cambiar los filtros de fecha, tienda o el término de búsqueda para ver más resultados.
            </p>
          </div>
        ) : (
          processedCustomers.map((customer, index) => {
            const isTop1 = index === 0 && sortBy === 'orders_desc';
            const isTop2 = index === 1 && sortBy === 'orders_desc';
            const isTop3 = index === 2 && sortBy === 'orders_desc';
            const isExpanded = expandedCustomerKey === customer.key;
            const hasWhatsApp = customer.cleanPhone.length >= 7;
            const orderRatio = summaryStats.maxOrders > 0 
              ? Math.min(100, Math.round((customer.totalOrders / summaryStats.maxOrders) * 100))
              : 100;

            return (
              <div
                key={customer.key}
                className={`bg-gray-900/90 border rounded-2xl transition shadow-md overflow-hidden ${
                  isTop1 
                    ? 'border-amber-500/40 bg-gradient-to-r from-amber-950/20 via-gray-900 to-gray-900 shadow-amber-500/10' 
                    : isTop2
                    ? 'border-slate-400/40 bg-gradient-to-r from-slate-900/40 via-gray-900 to-gray-900'
                    : isTop3
                    ? 'border-amber-700/40 bg-gradient-to-r from-amber-950/15 via-gray-900 to-gray-900'
                    : 'border-gray-800/80 hover:border-gray-700'
                }`}
              >
                {/* Main Card Header / Summary Row */}
                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Position Badge & Customer Profile */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                    {/* Position Indicator */}
                    <div className="shrink-0 flex items-center justify-center">
                      {isTop1 ? (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black flex flex-col items-center justify-center font-black shadow-lg shadow-amber-500/30">
                          <Crown className="w-4 h-4 text-black" />
                          <span className="text-[10px] leading-none">#1</span>
                        </div>
                      ) : isTop2 ? (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-300 to-slate-400 text-black flex flex-col items-center justify-center font-black shadow-md shadow-slate-400/20">
                          <Medal className="w-4 h-4 text-slate-900" />
                          <span className="text-[10px] leading-none">#2</span>
                        </div>
                      ) : isTop3 ? (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-700 to-amber-800 text-white flex flex-col items-center justify-center font-black shadow-md shadow-amber-700/20">
                          <Medal className="w-4 h-4 text-amber-200" />
                          <span className="text-[10px] leading-none">#3</span>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gray-950 border border-gray-800 text-gray-400 flex items-center justify-center font-mono font-bold text-xs">
                          #{index + 1}
                        </div>
                      )}
                    </div>

                    {/* Customer Info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-white truncate hover:text-emerald-300 transition">
                          {customer.name}
                        </h2>

                        {/* RYYCOS Balance Pill in Customer Title Bar */}
                        <div 
                          className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] font-mono font-black flex items-center gap-1 shrink-0 shadow-sm"
                          title={`Saldo actual: ${customer.ryycos.toLocaleString('es-CO')} RYYCOS ($${customer.ryycos.toLocaleString('es-CO')} COP)`}
                        >
                          <Sparkles className="w-3 h-3 text-amber-400 fill-amber-400/30 shrink-0" />
                          <span>{customer.ryycos.toLocaleString('es-CO')} RYYCOS</span>
                        </div>

                        {customer.totalOrders >= 5 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center gap-1 shrink-0">
                            <Crown className="w-3 h-3 text-amber-400" />
                            VIP
                          </span>
                        )}

                        {customer.totalOrders >= 2 && customer.totalOrders < 5 && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-semibold shrink-0">
                            Frecuente
                          </span>
                        )}

                        {customer.totalOrders === 1 && (
                          <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400 text-[10px] font-medium shrink-0">
                            1er Pedido
                          </span>
                        )}
                      </div>

                      {/* WhatsApp Phone and Actions */}
                      <div className="flex flex-wrap items-center gap-2.5 text-xs">
                        {hasWhatsApp ? (
                          <div className="inline-flex items-center gap-1.5 font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-800/40">
                            <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="font-bold">{customer.formattedPhone}</span>
                            <button
                              onClick={(e) => handleCopyPhone(customer, e)}
                              className="p-1 hover:text-white transition cursor-pointer"
                              title="Copiar número de WhatsApp"
                            >
                              {copiedPhoneKey === customer.key ? (
                                <Check className="w-3 h-3 text-emerald-300" />
                              ) : (
                                <Copy className="w-3 h-3 text-emerald-500 hover:text-emerald-300" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-500 italic text-[11px] flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            Sin WhatsApp registrado
                          </span>
                        )}

                        {customer.favoriteStoreName && (
                          <span className="text-gray-400 flex items-center gap-1 text-[11px] truncate max-w-[200px]">
                            <Store className="w-3 h-3 text-gray-500 shrink-0" />
                            <span className="text-gray-500">Tienda habitual:</span>
                            <span className="text-gray-300 font-medium truncate">{customer.favoriteStoreName}</span>
                          </span>
                        )}

                        {customer.addresses[0] && (
                          <span className="text-gray-400 flex items-center gap-1 text-[11px] truncate max-w-[240px] hidden sm:flex">
                            <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
                            <span className="text-gray-300 truncate">{customer.addresses[0]}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Metrics and Order Bar */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 lg:gap-5 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-800/60">
                    {/* Orders count badge (HIGHLIGHTED) */}
                    <div className="text-right min-w-[90px]">
                      <div className="flex items-center justify-end gap-1.5">
                        <ShoppingBag className="w-4 h-4 text-emerald-400" />
                        <span className="text-xl sm:text-2xl font-black text-white font-mono leading-none">
                          {customer.totalOrders}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">
                          {customer.totalOrders === 1 ? 'pedido' : 'pedidos'}
                        </span>
                      </div>

                      {/* Visual Frequency Bar */}
                      <div className="w-24 sm:w-28 bg-gray-950 rounded-full h-1.5 mt-1.5 ml-auto overflow-hidden border border-gray-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTop1 
                              ? 'bg-gradient-to-r from-amber-400 to-amber-500' 
                              : isTop2 
                              ? 'bg-gradient-to-r from-slate-300 to-slate-400' 
                              : isTop3 
                              ? 'bg-gradient-to-r from-amber-600 to-amber-700' 
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${orderRatio}%` }}
                        ></div>
                      </div>

                      <div className="text-[10px] text-gray-500 mt-1 font-mono">
                        {customer.completedOrders} entregados • {customer.cancelledOrders} canc.
                      </div>
                    </div>

                    {/* RYYCOS Balance Column */}
                    <div className="text-right min-w-[95px] hidden sm:block">
                      <div className="flex items-center justify-end gap-1 text-base sm:text-lg font-black text-amber-400 font-mono">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30 shrink-0" />
                        <span>{customer.ryycos.toLocaleString('es-CO')}</span>
                      </div>
                      <div className="text-[10px] text-amber-500/80 font-bold uppercase tracking-wider mt-0.5">
                        RYYCOS
                      </div>
                      <button
                        onClick={() => {
                          setAdjustingRyycosCustomer(customer);
                          setAdjustmentAmount('500');
                          setAdjustmentMode('add');
                          setAdjustmentReason('Bonificación fidelidad RYYCO');
                        }}
                        className="text-[10.5px] text-gray-400 hover:text-amber-300 underline cursor-pointer mt-0.5 flex items-center justify-end gap-0.5 ml-auto"
                        title="Bonificar o ajustar RYYCOS a este cliente"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>Ajustar</span>
                      </button>
                    </div>

                    {/* Total spent and average ticket */}
                    <div className="text-right min-w-[100px] hidden sm:block">
                      <div className="text-sm font-bold text-cyan-400 font-mono">
                        ${customer.totalSpent.toLocaleString('es-CO')}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                        Prom: ${customer.averageTicket.toLocaleString('es-CO')}
                      </div>
                      {customer.lastOrderDate && (
                        <div className="text-[10px] text-gray-500 flex items-center justify-end gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5 text-gray-600" />
                          <span>{new Date(customer.lastOrderDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      )}
                    </div>

                    {/* WhatsApp Direct Action Button */}
                    <div className="flex items-center gap-2 shrink-0">
                      {hasWhatsApp ? (
                        <a
                          href={customer.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md shadow-emerald-600/30 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                          title="Abrir chat en WhatsApp Web o móvil"
                        >
                          <MessageCircle className="w-4 h-4 fill-current" />
                          <span className="hidden md:inline">WhatsApp</span>
                        </a>
                      ) : (
                        <button
                          disabled
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 text-gray-500 text-xs font-medium cursor-not-allowed opacity-60"
                          title="Sin número para WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span className="hidden md:inline">Sin WhatsApp</span>
                        </button>
                      )}

                      {/* Expand/Collapse details toggle */}
                      <button
                        onClick={() => setExpandedCustomerKey(isExpanded ? null : customer.key)}
                        className={`p-2 rounded-xl border transition cursor-pointer ${
                          isExpanded 
                            ? 'bg-gray-800 text-white border-gray-700' 
                            : 'bg-gray-950 text-gray-400 hover:text-white border-gray-800 hover:bg-gray-800'
                        }`}
                        title={isExpanded ? 'Ocultar historial de pedidos' : 'Ver todos los pedidos de este cliente'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mobile Spent & RYYCOS Info if on small screen */}
                <div className="px-4 pb-3 flex items-center justify-between text-xs text-gray-400 border-t border-gray-800/40 pt-2 sm:hidden">
                  <div className="flex items-center gap-1 font-mono text-amber-400 font-bold">
                    <Sparkles className="w-3 h-3" />
                    <span>{customer.ryycos.toLocaleString('es-CO')} RYYCOS</span>
                  </div>
                  <span>Gasto: <strong className="text-cyan-400 font-mono">${customer.totalSpent.toLocaleString('es-CO')}</strong></span>
                  <button
                    onClick={() => {
                      setAdjustingRyycosCustomer(customer);
                      setAdjustmentAmount('500');
                      setAdjustmentMode('add');
                    }}
                    className="text-[11px] text-amber-400 underline font-semibold cursor-pointer"
                  >
                    + Ajustar
                  </button>
                </div>

                {/* Expanded Section: Orders History & WhatsApp Message Tools */}
                {isExpanded && (
                  <div className="border-t border-gray-800 bg-gray-950/90 p-4 sm:p-6 space-y-5 animate-fade-in">
                    {/* RYYCOS Loyalty & Admin Adjustment Bar */}
                    <div className="bg-gradient-to-r from-amber-950/40 via-gray-900 to-amber-950/20 border border-amber-800/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                          <Coins className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-amber-300">
                              Fidelización RYYCOS de {customer.name}
                            </span>
                            {customer.isRegisteredProfile ? (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                                Perfil Registrado
                              </span>
                            ) : (
                              <span className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">
                                Acumulado por Pedidos
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Saldo disponible: <strong className="text-amber-400 font-mono text-sm">{customer.ryycos.toLocaleString('es-CO')} RYYCOS</strong>
                            {' '}(Equivalente a <span className="text-white font-mono font-bold">${customer.ryycos.toLocaleString('es-CO')} COP</span> para redimir)
                            {customer.spinsAvailable > 0 && ` • 🎡 ${customer.spinsAvailable} giros en ruleta`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setAdjustingRyycosCustomer(customer);
                            setAdjustmentAmount('1000');
                            setAdjustmentMode('add');
                            setAdjustmentReason('Bonificación especial por lealtad');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Bonificar / Ajustar Saldo</span>
                        </button>
                      </div>
                    </div>

                    {/* WhatsApp Quick Message Bar */}
                    {hasWhatsApp && (
                      <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <Send className="w-3.5 h-3.5" />
                            Mensajes Rápidos de WhatsApp para Fidelización
                          </span>
                          <span className="text-[11px] text-gray-400 font-mono">
                            Enviar a {customer.formattedPhone}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          <a
                            href={buildWhatsAppUrl(
                              customer.cleanPhone,
                              customer.name,
                              customer.totalOrders,
                              `¡Hola ${customer.name}! 👋 🪙 Te recordamos desde *RYYCO* que tienes un saldo de *${customer.ryycos.toLocaleString('es-CO')} RYYCOS ($${customer.ryycos.toLocaleString('es-CO')} COP)* listos para descontar en tus comidas favoritas.\n\n🍽️ *¡Haz tu pedido hoy y usa tus monedas RYYCOS aquí:*\n👉 https://ryyco.com/ 🍕🍔`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 border border-amber-800/50 text-left transition text-xs space-y-1 block hover:border-amber-500 cursor-pointer"
                          >
                            <div className="font-bold text-amber-300 flex items-center gap-1">
                              <Coins className="w-3 h-3 text-amber-400" />
                              Aviso Saldo RYYCOS
                            </div>
                            <div className="text-[11px] text-gray-400 line-clamp-2">
                              "Tienes {customer.ryycos.toLocaleString('es-CO')} RYYCOS para pedir en https://ryyco.com/..."
                            </div>
                          </a>

                          <a
                            href={buildWhatsAppUrl(
                              customer.cleanPhone,
                              customer.name,
                              customer.totalOrders,
                              `¡Hola ${customer.name}! 🌟 Te saludamos con mucho aprecio desde *RYYCO*. Queremos agradecerte por ser de nuestros clientes más especiales con *${customer.totalOrders} pedidos realizados*. ¡Tienes *${customer.ryycos.toLocaleString('es-CO')} RYYCOS* para disfrutar hoy!\n\n🍽️ *Pide tus platos preferidos aquí:* 👉 https://ryyco.com/ 🚀`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-lg bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-800/50 text-left transition text-xs space-y-1 block hover:border-emerald-500 cursor-pointer"
                          >
                            <div className="font-bold text-emerald-300 flex items-center gap-1">
                              <Crown className="w-3 h-3 text-amber-400" />
                              Agradecimiento VIP
                            </div>
                            <div className="text-[11px] text-gray-400 line-clamp-2">
                              "Agradecimiento por {customer.totalOrders} pedidos. Redime RYYCOS en https://ryyco.com/..."
                            </div>
                          </a>

                          <a
                            href={buildWhatsAppUrl(
                              customer.cleanPhone,
                              customer.name,
                              customer.totalOrders,
                              `¡Hola ${customer.name}! 🎁 Por ser un cliente destacado en *RYYCO* con ${customer.totalOrders} pedidos, tienes *${customer.ryycos.toLocaleString('es-CO')} RYYCOS* acumulados para ahorrar en tu próximo antojo.\n\n🍽️ *Ingresa a pedir con tus RYYCOS aquí:* 👉 https://ryyco.com/`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-lg bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-800/50 text-left transition text-xs space-y-1 block hover:border-indigo-500 cursor-pointer"
                          >
                            <div className="font-bold text-indigo-300 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-indigo-400" />
                              Cupón / Promoción
                            </div>
                            <div className="text-[11px] text-gray-400 line-clamp-2">
                              "Aprovecha tus RYYCOS para tu próximo antojo en https://ryyco.com/..."
                            </div>
                          </a>

                          <a
                            href={buildWhatsAppUrl(
                              customer.cleanPhone,
                              customer.name,
                              customer.totalOrders,
                              `¡Hola ${customer.name}! 👋 En *RYYCO* queremos consentirte. Tienes *${customer.ryycos.toLocaleString('es-CO')} RYYCOS* para tu próximo pedido. ¿Cómo ha sido tu experiencia con las entregas y la comida?\n\n🍽️ *Visítanos y pide de nuevo con tus RYYCOS en:* 👉 https://ryyco.com/`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-lg bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-800/50 text-left transition text-xs space-y-1 block hover:border-cyan-500 cursor-pointer"
                          >
                            <div className="font-bold text-cyan-300 flex items-center gap-1">
                              <MessageCircle className="w-3 h-3 text-cyan-400" />
                              Encuesta de Servicio
                            </div>
                            <div className="text-[11px] text-gray-400 line-clamp-2">
                              "Experiencia con tus pedidos. Pide de nuevo en https://ryyco.com/..."
                            </div>
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Breakdown of Stores where this customer purchases */}
                    {customer.storeBreakdown.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-gray-400" />
                          Tiendas donde suele pedir ({customer.storeBreakdown.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {customer.storeBreakdown.map(st => (
                            <div
                              key={st.storeId}
                              className="px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-800 text-xs flex items-center gap-2"
                            >
                              <span className="font-semibold text-gray-200">{st.storeName}</span>
                              <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/20">
                                {st.count} {st.count === 1 ? 'pedido' : 'pedidos'}
                              </span>
                              <span className="text-gray-400 font-mono text-[11px]">
                                ${st.totalSpent.toLocaleString('es-CO')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Known Delivery Addresses */}
                    {customer.addresses.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          Direcciones de entrega registradas ({customer.addresses.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {customer.addresses.map((addr, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 text-xs"
                            >
                              {addr}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Detailed Orders History Table */}
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
                          Historial Completo de Pedidos ({customer.orders.length})
                        </h4>
                        {onGoToOrders && customer.favoriteStoreId && (
                          <button
                            onClick={() => onGoToOrders(customer.favoriteStoreId)}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
                          >
                            <span>Ir a panel de pedidos</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="border border-gray-800/80 rounded-xl overflow-x-auto bg-gray-900/60">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-gray-800 text-gray-400 bg-gray-900/90 font-mono">
                              <th className="py-2.5 px-3">Pedido</th>
                              <th className="py-2.5 px-3">Fecha & Hora</th>
                              <th className="py-2.5 px-3">Tienda</th>
                              <th className="py-2.5 px-3">Platos / Productos</th>
                              <th className="py-2.5 px-3">Estado</th>
                              <th className="py-2.5 px-3 text-right">Monto Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800/50">
                            {customer.orders.map((ord) => {
                              const orderDate = ord.createdAt ? new Date(ord.createdAt) : null;
                              return (
                                <tr key={ord.id} className="hover:bg-gray-800/40 transition">
                                  <td className="py-2.5 px-3 font-mono font-bold text-white">
                                    #{ord.orderNumber || ord.id.slice(-5)}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap">
                                    {orderDate ? (
                                      <div>
                                        <div>{orderDate.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                        <div className="text-[10px] text-gray-500">{orderDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div>
                                      </div>
                                    ) : 'N/A'}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-300 font-medium">
                                    {ord.storeName || (storesMap[ord.storeOwnerId]?.storeName) || 'Tienda'}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-400 max-w-xs truncate">
                                    {ord.items && ord.items.length > 0 ? (
                                      ord.items.map(it => {
                                        const itemName = it?.name || (it as any)?.product?.name || (it as any)?.productName || 'Producto';
                                        const qty = it?.quantity ?? 1;
                                        return `${qty}x ${itemName}`;
                                      }).join(', ')
                                    ) : (
                                      <span className="italic text-gray-600">Sin items detallados</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {ord.status === 'delivered' ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Entregado
                                      </span>
                                    ) : ord.status === 'cancelled' ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
                                        <XCircle className="w-3 h-3" />
                                        Cancelado
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                                        <AlertCircle className="w-3 h-3" />
                                        {ord.status}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-cyan-400 whitespace-nowrap">
                                    ${(Number(ord.totalAmount) || 0).toLocaleString('es-CO')}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Admin RYYCOS Adjustment Modal */}
      {adjustingRyycosCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => {
                setAdjustingRyycosCustomer(null);
                setAdjustmentSuccessMsg(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Coins className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  Bonificar / Ajustar RYYCOS
                </h3>
                <p className="text-xs text-gray-400">
                  Cliente: <strong className="text-amber-300 font-semibold">{adjustingRyycosCustomer.name}</strong> ({adjustingRyycosCustomer.formattedPhone})
                </p>
              </div>
            </div>

            {/* Current Balance Card */}
            <div className="bg-gray-950/80 rounded-xl p-3.5 border border-gray-800 flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium">Saldo actual del cliente:</span>
              <div className="flex items-center gap-1.5 font-mono font-black text-amber-400 text-lg">
                <Sparkles className="w-4 h-4 fill-amber-400/20" />
                <span>{adjustingRyycosCustomer.ryycos.toLocaleString('es-CO')} RYYCOS</span>
              </div>
            </div>

            {adjustmentSuccessMsg ? (
              <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs text-center space-y-1 font-semibold animate-fade-in">
                <Check className="w-6 h-6 mx-auto text-emerald-400" />
                <div>{adjustmentSuccessMsg}</div>
              </div>
            ) : (
              <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
                {/* Mode Selector */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-950 rounded-xl border border-gray-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setAdjustmentMode('add')}
                    className={`py-2 rounded-lg transition cursor-pointer ${
                      adjustmentMode === 'add'
                        ? 'bg-amber-500 text-gray-950 font-black shadow'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    + Sumar Bonificación
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentMode('set')}
                    className={`py-2 rounded-lg transition cursor-pointer ${
                      adjustmentMode === 'set'
                        ? 'bg-amber-500 text-gray-950 font-black shadow'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Fijar Saldo Exacto
                  </button>
                </div>

                {/* Quick Add Buttons if in Add mode */}
                {adjustmentMode === 'add' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">Rápido:</span>
                    {['200', '500', '1000', '2000', '5000'].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAdjustmentAmount(amt)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition cursor-pointer ${
                          adjustmentAmount === amt
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        +{amt}
                      </button>
                    ))}
                  </div>
                )}

                {/* Amount Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                    <span>{adjustmentMode === 'add' ? 'Puntos RYYCOS a Bonificar' : 'Nuevo Saldo Total RYYCOS'}</span>
                    <span className="text-amber-400 font-mono text-[11px]">1 RYYCO = $1 COP</span>
                  </label>
                  <div className="relative">
                    <Coins className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(e.target.value)}
                      placeholder="Ej: 500"
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-950 border border-gray-800 text-white font-mono text-base font-bold focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    Motivo o concepto (visible internamente)
                  </label>
                  <input
                    type="text"
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    placeholder="Ej: Bonificación de bienvenida, compensación, etc."
                    className="w-full px-3.5 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Preview Calculation */}
                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/30 text-xs flex items-center justify-between text-gray-300">
                  <span>Nuevo saldo resultante:</span>
                  <strong className="text-amber-400 font-mono text-sm">
                    {adjustmentMode === 'add'
                      ? (adjustingRyycosCustomer.ryycos + (parseFloat(adjustmentAmount) || 0)).toLocaleString('es-CO')
                      : (parseFloat(adjustmentAmount) || 0).toLocaleString('es-CO')} RYYCOS
                  </strong>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setAdjustingRyycosCustomer(null)}
                    disabled={isSubmittingAdjustment}
                    className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAdjustment}
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-black transition shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingAdjustment ? (
                      <span>Guardando...</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Guardar Saldo</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
