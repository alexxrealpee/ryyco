/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
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
  Send
} from 'lucide-react';
import { OrderItem, UserProfile } from '../types';

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
}

type SortOrderOption = 'orders_desc' | 'orders_asc' | 'spent_desc' | 'recent_desc';
type CustomerSegmentFilter = 'all' | 'vip' | 'frequent' | 'new' | 'has_whatsapp';
type TimeRangeFilter = 'all' | 'this_month' | 'last_30_days' | 'last_7_days';

// Helper to normalize phone numbers
function cleanPhoneNumber(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

function formatPhoneDisplay(phone?: string): string {
  if (!phone) return 'Sin teléfono';
  const clean = cleanPhoneNumber(phone);
  if (clean.length === 10 && clean.startsWith('3')) {
    // Standard Colombian mobile: 3XX XXX XXXX
    return `+57 ${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  if (clean.startsWith('57') && clean.length === 12) {
    return `+57 ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  return phone.trim();
}

function buildWhatsAppUrl(cleanPhone: string, customerName: string, orderCount: number, customMessage?: string): string {
  if (!cleanPhone) return '';
  let waNumber = cleanPhone;
  // If 10 digits starting with 3 (Colombia mobile), prepend 57
  if (waNumber.length === 10 && waNumber.startsWith('3')) {
    waNumber = '57' + waNumber;
  }
  const defaultText = customMessage || `¡Hola ${customerName || ''}! Te saludamos de Linnk. 🌟 Eres uno de nuestros clientes destacados con ${orderCount} pedido${orderCount > 1 ? 's' : ''}. ¡Muchas gracias por tu preferencia! ¿En qué podemos ayudarte hoy?`;
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(defaultText)}`;
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

  // Copy phone handler
  const handleCopyPhone = (customer: CustomerAggregated, e: React.MouseEvent) => {
    e.stopPropagation();
    const phoneToCopy = customer.cleanPhone.length === 10 && customer.cleanPhone.startsWith('3') 
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

  // Aggregate orders by customer (identified by normalized phone or name)
  const aggregatedCustomers = useMemo(() => {
    const map = new Map<string, {
      name: string;
      rawPhone: string;
      cleanPhone: string;
      addresses: Set<string>;
      orders: OrderItem[];
      storeCounts: Map<string, { name: string; count: number; totalSpent: number }>;
    }>();

    filteredOrdersByTime.forEach(order => {
      // If store filter is applied, only consider orders from that store
      if (selectedStore !== 'all' && order.storeOwnerId !== selectedStore) {
        return;
      }

      const rawPhone = (order.customerPhone || '').trim();
      const cleanPhone = cleanPhoneNumber(rawPhone);
      const name = (order.customerName || 'Cliente sin nombre').trim();

      // Determine unique grouping key:
      // Prefer clean phone if 7+ digits; otherwise fallback to normalized name
      let key = '';
      if (cleanPhone.length >= 7) {
        key = `phone_${cleanPhone}`;
      } else if (name.length > 0 && name.toLowerCase() !== 'cliente' && name.toLowerCase() !== 'cliente sin nombre') {
        key = `name_${name.toLowerCase()}`;
      } else {
        key = `order_${order.id || Math.random().toString()}`;
      }

      if (!map.has(key)) {
        map.set(key, {
          name: name || 'Cliente',
          rawPhone,
          cleanPhone,
          addresses: new Set<string>(),
          orders: [],
          storeCounts: new Map()
        });
      }

      const record = map.get(key)!;
      // Update with more descriptive name if current was placeholder
      if ((record.name === 'Cliente' || record.name.length < name.length) && name) {
        record.name = name;
      }
      if (!record.rawPhone && rawPhone) {
        record.rawPhone = rawPhone;
        record.cleanPhone = cleanPhone;
      }

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
      const formattedPhone = formatPhoneDisplay(data.rawPhone || data.cleanPhone);
      const whatsappUrl = buildWhatsAppUrl(data.cleanPhone, data.name, totalOrders);

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
        orders: sortedOrders
      });
    });

    return list;
  }, [filteredOrdersByTime, selectedStore, storesMap]);

  // Apply filters and sorting
  const processedCustomers = useMemo(() => {
    let result = [...aggregatedCustomers];

    // Filter by search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const qClean = cleanPhoneNumber(q);
      result = result.filter(c => {
        const nameMatch = c.name.toLowerCase().includes(q);
        const phoneMatch = c.cleanPhone.includes(qClean) || c.rawPhone.toLowerCase().includes(q);
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
      topCustomer,
      maxOrders
    };
  }, [aggregatedCustomers]);

  // Export to CSV
  const handleExportCSV = () => {
    if (processedCustomers.length === 0) return;

    const headers = [
      'Posición',
      'Nombre Cliente',
      'WhatsApp / Teléfono',
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-gray-800/80">
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
              <span>{summaryStats.withWhatsApp} con WhatsApp activo</span>
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
              <span>{summaryStats.topCustomer ? `${summaryStats.topCustomer.totalOrders} pedidos realizados` : '0 pedidos'}</span>
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
              {summaryStats.recurringCustomers} clientes recurrentes (2+ pedidos)
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
              <option value="spent_desc">💰 Mayor dinero gastado ($ COP)</option>
              <option value="recent_desc">🕒 Compra más reciente primero</option>
              <option value="orders_asc">🌱 Menos pedidos primero (1 pedido)</option>
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
                  <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-800/60">
                    {/* Orders count badge (HIGHLIGHTED) */}
                    <div className="text-right min-w-[100px]">
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
                      <div className="w-28 sm:w-32 bg-gray-950 rounded-full h-1.5 mt-1.5 ml-auto overflow-hidden border border-gray-800">
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

                      <div className="text-[10.5px] text-gray-500 mt-1 font-mono">
                        {customer.completedOrders} entregados • {customer.cancelledOrders} canc.
                      </div>
                    </div>

                    {/* Total spent and average ticket */}
                    <div className="text-right min-w-[110px] hidden sm:block">
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

                {/* Mobile Spent Info if on small screen */}
                <div className="px-4 pb-3 flex items-center justify-between text-xs text-gray-400 border-t border-gray-800/40 pt-2 sm:hidden">
                  <span>Gasto total: <strong className="text-cyan-400 font-mono">${customer.totalSpent.toLocaleString('es-CO')}</strong></span>
                  <span>Último: {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString('es-CO') : 'N/A'}</span>
                </div>

                {/* Expanded Section: Orders History & WhatsApp Message Tools */}
                {isExpanded && (
                  <div className="border-t border-gray-800 bg-gray-950/90 p-4 sm:p-6 space-y-5 animate-fade-in">
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

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <a
                            href={buildWhatsAppUrl(
                              customer.cleanPhone,
                              customer.name,
                              customer.totalOrders,
                              `¡Hola ${customer.name}! 🌟 Te saludamos con mucho aprecio desde Linnk. Queremos agradecerte por ser uno de nuestros clientes más especiales con ${customer.totalOrders} pedidos realizados. ¡Tu lealtad hace grande a nuestra comunidad! ¿Hay algo nuevo que te gustaría ver en nuestra plataforma?`
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
                              "Queremos agradecerte por ser uno de nuestros clientes más especiales con {customer.totalOrders} pedidos..."
                            </div>
                          </a>

                          <a
                            href={buildWhatsAppUrl(
                              customer.cleanPhone,
                              customer.name,
                              customer.totalOrders,
                              `¡Hola ${customer.name}! 🎁 Por ser un cliente destacado en Linnk con ${customer.totalOrders} pedidos, tenemos un descuento especial para tu próximo antojo. ¡Escríbenos para aplicarlo en tu tienda favorita!`
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
                              "Por ser un cliente destacado en Linnk, tenemos un descuento especial para tu próximo antojo..."
                            </div>
                          </a>

                          <a
                            href={buildWhatsAppUrl(
                              customer.cleanPhone,
                              customer.name,
                              customer.totalOrders,
                              `¡Hola ${customer.name}! 👋 En Linnk queremos asegurarnos de que siempre recibas el mejor servicio. ¿Cómo ha sido tu experiencia con las entregas y la comida en tus últimos pedidos? Nos encantaría escucharte.`
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
                              "Queremos asegurarnos de que siempre recibas el mejor servicio. ¿Cómo ha sido tu experiencia?..."
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
                                      ord.items.map(it => `${it.quantity}x ${it.product.name}`).join(', ')
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
    </div>
  );
}
