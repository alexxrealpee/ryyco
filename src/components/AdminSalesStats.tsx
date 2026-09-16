/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  Calendar, 
  ArrowUpRight, 
  BarChart3, 
  Store, 
  Download, 
  Filter, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Search, 
  Bike, 
  Utensils, 
  PieChart, 
  CreditCard,
  Layers,
  Award,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { OrderItem, UserProfile } from '../types';

interface AdminSalesStatsProps {
  allOrders: OrderItem[];
  storesMap: Record<string, UserProfile>;
  allStores: { uid: string; name: string; username: string; phone?: string; address?: string }[];
  onGoToOrders?: (storeUid?: string) => void;
}

type TimeRangeFilter = 'today' | '7days' | '30days' | 'this_month' | 'all' | 'custom';
type StatusFilter = 'all' | 'delivered' | 'non_cancelled' | 'pending' | 'cancelled';

export default function AdminSalesStats({
  allOrders,
  storesMap,
  allStores,
  onGoToOrders
}: AdminSalesStatsProps) {
  // Filters state
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('30days');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedStoreUid, setSelectedStoreUid] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('non_cancelled');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Helper to format currency in Colombian Pesos
  const formatCOP = (val: number) => {
    return `$${Math.round(val).toLocaleString('es-CO')} COP`;
  };

  // Resolve Store Display Name
  const getStoreName = (storeOwnerId: string, orderStoreName?: string) => {
    if (storesMap[storeOwnerId]?.displayName) return storesMap[storeOwnerId].displayName;
    if (orderStoreName) return orderStoreName;
    const found = allStores.find(s => s.uid === storeOwnerId);
    if (found?.name) return found.name;
    return 'Tienda desconocida';
  };

  // Date boundaries calculation
  const dateBounds = useMemo(() => {
    const now = new Date();
    let start = new Date(0);
    let end = new Date();

    if (timeRange === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (timeRange === '7days') {
      start = new Date();
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (timeRange === '30days') {
      start = new Date();
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else if (timeRange === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else if (timeRange === 'custom') {
      if (customStartDate) {
        start = new Date(`${customStartDate}T00:00:00`);
      }
      if (customEndDate) {
        end = new Date(`${customEndDate}T23:59:59`);
      }
    }

    return { start, end };
  }, [timeRange, customStartDate, customEndDate]);

  // Filtered orders based on all user parameters
  const filteredOrders = useMemo(() => {
    return allOrders.filter(order => {
      // 1. Date Filter
      const orderDate = order.createdAt ? new Date(order.createdAt) : new Date(0);
      if (orderDate < dateBounds.start || orderDate > dateBounds.end) {
        return false;
      }

      // 2. Store Filter
      if (selectedStoreUid !== 'all' && order.storeOwnerId !== selectedStoreUid) {
        return false;
      }

      // 3. Status Filter
      if (selectedStatus === 'delivered' && order.status !== 'delivered') {
        return false;
      }
      if (selectedStatus === 'non_cancelled' && order.status === 'cancelled') {
        return false;
      }
      if (selectedStatus === 'pending' && order.status !== 'pending') {
        return false;
      }
      if (selectedStatus === 'cancelled' && order.status !== 'cancelled') {
        return false;
      }

      // 4. Payment Method Filter
      if (selectedPaymentMethod !== 'all' && order.paymentMethod !== selectedPaymentMethod) {
        return false;
      }

      // 5. Search Text Filter
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase().trim();
        const storeName = getStoreName(order.storeOwnerId, order.storeName).toLowerCase();
        const customer = (order.customerName || '').toLowerCase();
        const orderNum = `#${order.orderNumber}`.toLowerCase();
        const itemsNames = (order.items || []).map(i => (i?.name || (i as any)?.product?.name || (i as any)?.productName || '').toLowerCase()).join(' ');

        if (
          !storeName.includes(query) && 
          !customer.includes(query) && 
          !orderNum.includes(query) && 
          !itemsNames.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allOrders, dateBounds, selectedStoreUid, selectedStatus, selectedPaymentMethod, searchFilter, storesMap, allStores]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let totalSales = 0;
    let totalDeliveryFees = 0;
    let deliveredCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    let processingCount = 0;
    let shippedCount = 0;

    filteredOrders.forEach(o => {
      const amount = Number(o.totalAmount) || 0;
      const fee = Number(o.deliveryFee) || 0;

      totalSales += amount;
      totalDeliveryFees += fee;

      if (o.status === 'delivered') deliveredCount++;
      else if (o.status === 'pending') pendingCount++;
      else if (o.status === 'cancelled') cancelledCount++;
      else if (o.status === 'processing') processingCount++;
      else if (o.status === 'shipped') shippedCount++;
    });

    const totalOrdersCount = filteredOrders.length;
    const averageTicket = totalOrdersCount > 0 ? totalSales / totalOrdersCount : 0;
    const completionRate = totalOrdersCount > 0 ? Math.round((deliveredCount / totalOrdersCount) * 100) : 0;

    return {
      totalSales,
      totalDeliveryFees,
      totalOrdersCount,
      deliveredCount,
      pendingCount,
      cancelledCount,
      processingCount,
      shippedCount,
      averageTicket,
      completionRate
    };
  }, [filteredOrders]);

  // Daily Timeline Chart Data (grouped by day)
  const dailyTimeline = useMemo(() => {
    const map: Record<string, { dateStr: string; label: string; total: number; count: number }> = {};

    filteredOrders.forEach(o => {
      if (!o.createdAt) return;
      const d = new Date(o.createdAt);
      if (isNaN(d.getTime())) return;

      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = `${d.getDate()}/${d.getMonth() + 1}`;

      if (!map[dateKey]) {
        map[dateKey] = {
          dateStr: dateKey,
          label,
          total: 0,
          count: 0
        };
      }

      map[dateKey].total += Number(o.totalAmount) || 0;
      map[dateKey].count += 1;
    });

    const sortedDays = Object.values(map).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    const maxVal = Math.max(...sortedDays.map(d => d.total), 1);

    return {
      days: sortedDays,
      maxVal
    };
  }, [filteredOrders]);

  // Top Products Sold
  const topProducts = useMemo(() => {
    const prodMap: Record<string, { name: string; storeName: string; quantity: number; revenue: number }> = {};

    filteredOrders.forEach(o => {
      const storeName = getStoreName(o.storeOwnerId, o.storeName);
      (o.items || []).forEach(item => {
        const itemName = item?.name || (item as any)?.product?.name || (item as any)?.productName || 'Producto';
        const key = `${item?.id || itemName}___${o.storeOwnerId}`;
        const qty = Number(item?.quantity) || 1;
        const price = Number(item?.price) || 0;

        if (!prodMap[key]) {
          prodMap[key] = {
            name: itemName,
            storeName,
            quantity: 0,
            revenue: 0
          };
        }

        prodMap[key].quantity += qty;
        prodMap[key].revenue += (price * qty);
      });
    });

    const sorted = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue);
    const maxRevenue = sorted[0]?.revenue || 1;

    return {
      list: sorted.slice(0, 10),
      maxRevenue
    };
  }, [filteredOrders]);

  // Stores Sales Leaderboard
  const storeLeaderboard = useMemo(() => {
    const sMap: Record<string, { uid: string; name: string; totalSales: number; ordersCount: number; avgTicket: number }> = {};

    filteredOrders.forEach(o => {
      const storeId = o.storeOwnerId || 'unknown';
      const storeName = getStoreName(storeId, o.storeName);
      const amount = Number(o.totalAmount) || 0;

      if (!sMap[storeId]) {
        sMap[storeId] = {
          uid: storeId,
          name: storeName,
          totalSales: 0,
          ordersCount: 0,
          avgTicket: 0
        };
      }

      sMap[storeId].totalSales += amount;
      sMap[storeId].ordersCount += 1;
    });

    const list = Object.values(sMap)
      .map(s => ({
        ...s,
        avgTicket: s.ordersCount > 0 ? s.totalSales / s.ordersCount : 0
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    const maxSales = list[0]?.totalSales || 1;

    return {
      list,
      maxSales
    };
  }, [filteredOrders]);

  // Payment Methods Distribution
  const paymentMethodsDistribution = useMemo(() => {
    const pMap: Record<string, { label: string; count: number; total: number }> = {
      cod: { label: 'Contra Entrega (Efectivo)', count: 0, total: 0 },
      delivery_cash: { label: 'Efectivo al Recibir', count: 0, total: 0 },
      transfer: { label: 'Transferencia Bancaria', count: 0, total: 0 },
      whatsapp: { label: 'Coordinado WhatsApp', count: 0, total: 0 }
    };

    filteredOrders.forEach(o => {
      const method = o.paymentMethod || 'whatsapp';
      const amt = Number(o.totalAmount) || 0;
      if (!pMap[method]) {
        pMap[method] = { label: method, count: 0, total: 0 };
      }
      pMap[method].count += 1;
      pMap[method].total += amt;
    });

    return Object.entries(pMap).filter(([_, val]) => val.count > 0);
  }, [filteredOrders]);

  // Order Types Distribution (Delivery vs Table vs Pickup)
  const orderTypesDistribution = useMemo(() => {
    let deliveryCount = 0;
    let tableCount = 0;
    let pickupCount = 0;

    filteredOrders.forEach(o => {
      if (o.orderType === 'table' || o.isTableOrder) {
        tableCount++;
      } else if (o.orderType === 'pickup') {
        pickupCount++;
      } else {
        deliveryCount++;
      }
    });

    const total = filteredOrders.length || 1;
    return {
      delivery: { count: deliveryCount, pct: Math.round((deliveryCount / total) * 100) },
      table: { count: tableCount, pct: Math.round((tableCount / total) * 100) },
      pickup: { count: pickupCount, pct: Math.round((pickupCount / total) * 100) }
    };
  }, [filteredOrders]);

  // Export to CSV Function
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      alert('No hay pedidos en el período seleccionado para exportar.');
      return;
    }

    const headers = [
      'Pedido #',
      'Fecha',
      'Tienda',
      'Cliente',
      'Telefono',
      'Direccion',
      'Metodo de Pago',
      'Estado',
      'Tipo de Pedido',
      'Subtotal Productos',
      'Costo Domicilio',
      'Total COP'
    ];

    const rows = filteredOrders.map(o => {
      const storeName = getStoreName(o.storeOwnerId, o.storeName).replace(/,/g, ' ');
      const customer = (o.customerName || '').replace(/,/g, ' ');
      const address = (o.customerAddress || '').replace(/,/g, ' ');
      const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleString('es-CO') : '';
      const orderTypeStr = o.isTableOrder || o.orderType === 'table' ? 'Mesa' : o.orderType === 'pickup' ? 'Recoger' : 'Domicilio';

      return [
        `#${o.orderNumber || ''}`,
        `"${dateStr}"`,
        `"${storeName}"`,
        `"${customer}"`,
        `"${o.customerPhone || ''}"`,
        `"${address}"`,
        `"${o.paymentMethod || ''}"`,
        `"${o.status || ''}"`,
        `"${orderTypeStr}"`,
        (o.totalAmount - (o.deliveryFee || 0)),
        (o.deliveryFee || 0),
        o.totalAmount
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_ventas_admin_${timeRange}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in text-gray-200">
      
      {/* 1. Header Banner */}
      <div className="bg-[#0b101d] border border-gray-800/80 rounded-3xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-cyan-400 shadow-md">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Estadísticas de Ventas</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Panel Global
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-medium">
                  Análisis financiero de ingresos, pedidos completados, tiendas con mayor volumen y productos líderes en la plataforma.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Reporte (CSV)</span>
            </button>
            {onGoToOrders && (
              <button
                onClick={() => onGoToOrders()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Ver Lista de Pedidos</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters Controls Panel */}
        <div className="mt-6 pt-5 border-t border-gray-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          
          {/* Time Range Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>Período de Tiempo</span>
            </label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRangeFilter)}
              className="w-full bg-[#111726] border border-gray-700/80 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="today">Hoy (24 Horas)</option>
              <option value="7days">Últimos 7 días</option>
              <option value="30days">Últimos 30 días</option>
              <option value="this_month">Este Mes</option>
              <option value="all">Todo el Histórico</option>
              <option value="custom">Rango Personalizado</option>
            </select>
          </div>

          {/* Store Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-pink-400" />
              <span>Filtrar por Tienda</span>
            </label>
            <select
              value={selectedStoreUid}
              onChange={(e) => setSelectedStoreUid(e.target.value)}
              className="w-full bg-[#111726] border border-gray-700/80 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-pink-500 focus:outline-none"
            >
              <option value="all">Todas las tiendas ({allStores.length})</option>
              {allStores.map(s => (
                <option key={s.uid} value={s.uid}>
                  {s.name} (@{s.username})
                </option>
              ))}
            </select>
          </div>

          {/* Order Status Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-emerald-400" />
              <span>Estado del Pedido</span>
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as StatusFilter)}
              className="w-full bg-[#111726] border border-gray-700/80 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="non_cancelled">Ventas Válidas (No cancelados)</option>
              <option value="delivered">Solo Entregados / Concretados</option>
              <option value="pending">Solo Pendientes</option>
              <option value="cancelled">Solo Cancelados</option>
              <option value="all">Todos los Estados</option>
            </select>
          </div>

          {/* Payment Method Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-amber-400" />
              <span>Método de Pago</span>
            </label>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="w-full bg-[#111726] border border-gray-700/80 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="all">Todos los Métodos</option>
              <option value="cod">Contra Entrega (Efectivo)</option>
              <option value="transfer">Transferencia Bancaria</option>
              <option value="whatsapp">WhatsApp / Acordar</option>
            </select>
          </div>

        </div>

        {/* Optional Custom Date Inputs */}
        {timeRange === 'custom' && (
          <div className="mt-4 pt-3 border-t border-gray-800/60 flex flex-wrap items-center gap-4 bg-[#111726]/60 p-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-bold">Desde:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-bold">Hasta:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Key Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Sales */}
        <div className="bg-[#0b101d] border border-cyan-500/20 p-5 rounded-2xl shadow-xl relative overflow-hidden group hover:border-cyan-500/40 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition" />
          <div className="flex items-center justify-between text-xs font-bold text-cyan-400 mb-2">
            <span className="uppercase tracking-wider">Venta Total Facturada</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight font-mono">
            {formatCOP(kpis.totalSales)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="text-cyan-400 font-bold">{kpis.totalOrdersCount} pedidos</span>
            <span>en este período</span>
          </div>
        </div>

        {/* Average Ticket */}
        <div className="bg-[#0b101d] border border-indigo-500/20 p-5 rounded-2xl shadow-xl relative overflow-hidden group hover:border-indigo-500/40 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition" />
          <div className="flex items-center justify-between text-xs font-bold text-indigo-400 mb-2">
            <span className="uppercase tracking-wider">Ticket Promedio</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight font-mono">
            {formatCOP(kpis.averageTicket)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
            <span>Promedio por orden generada</span>
          </div>
        </div>

        {/* Delivered / Completed Orders */}
        <div className="bg-[#0b101d] border border-emerald-500/20 p-5 rounded-2xl shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition" />
          <div className="flex items-center justify-between text-xs font-bold text-emerald-400 mb-2">
            <span className="uppercase tracking-wider">Pedidos Entregados</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">{kpis.deliveredCount}</span>
            <span className="text-xs text-gray-400 font-bold">({kpis.completionRate}% efectividad)</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
            <span className="text-amber-400 font-bold">{kpis.pendingCount} pendientes</span>
            <span>•</span>
            <span className="text-red-400 font-bold">{kpis.cancelledCount} cancelados</span>
          </div>
        </div>

        {/* Total Delivery Fees */}
        <div className="bg-[#0b101d] border border-amber-500/20 p-5 rounded-2xl shadow-xl relative overflow-hidden group hover:border-amber-500/40 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition" />
          <div className="flex items-center justify-between text-xs font-bold text-amber-400 mb-2">
            <span className="uppercase tracking-wider">Tarifas de Domicilio</span>
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Bike className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight font-mono">
            {formatCOP(kpis.totalDeliveryFees)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
            <span>Generado en fletes de envío</span>
          </div>
        </div>

      </div>

      {/* 3. Sales Timeline Interactive Chart */}
      <div className="bg-[#0b101d] border border-gray-800/80 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800/80 pb-4">
          <div>
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <span>Evolución de Ventas en el Tiempo</span>
            </h3>
            <p className="text-xs text-gray-400">
              Distribución de ingresos día a día según el rango de fecha seleccionado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-lg">
              {dailyTimeline.days.length} días con actividad
            </span>
          </div>
        </div>

        {dailyTimeline.days.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs font-medium space-y-2">
            <Clock className="w-8 h-8 mx-auto opacity-40 text-cyan-400" />
            <p>No se registraron ventas en las fechas seleccionadas.</p>
          </div>
        ) : (
          <div className="pt-4 space-y-4">
            {/* Timeline Bars Container */}
            <div className="h-56 flex items-end gap-2 sm:gap-3 overflow-x-auto pb-4 pt-6 px-2 no-scrollbar">
              {dailyTimeline.days.map((day) => {
                const heightPct = Math.max(Math.round((day.total / dailyTimeline.maxVal) * 100), 6);
                return (
                  <div 
                    key={day.dateStr} 
                    className="flex flex-col items-center gap-2 h-full justify-end group min-w-[36px] sm:min-w-[48px] flex-1 relative"
                  >
                    {/* Hover Floating Tooltip */}
                    <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-gray-900 border border-cyan-500/40 text-white px-2.5 py-1.5 rounded-xl shadow-2xl text-[10px] whitespace-nowrap pointer-events-none">
                      <span className="font-black text-cyan-400">{formatCOP(day.total)}</span>
                      <span className="text-gray-400">{day.count} {day.count === 1 ? 'pedido' : 'pedidos'} ({day.dateStr})</span>
                    </div>

                    {/* Bar */}
                    <div 
                      className="w-full rounded-t-xl bg-gradient-to-t from-cyan-600/50 via-cyan-500 to-indigo-500 group-hover:from-cyan-400 group-hover:to-indigo-400 transition-all duration-300 shadow-lg shadow-cyan-500/10 cursor-pointer"
                      style={{ height: `${heightPct}%` }}
                    />

                    {/* Date label */}
                    <span className="text-[10px] font-mono text-gray-400 group-hover:text-white transition">
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
            
            <div className="flex items-center justify-between text-[11px] text-gray-500 px-2 pt-2 border-t border-gray-800/40 font-mono">
              <span>Inicio: {dailyTimeline.days[0]?.dateStr}</span>
              <span>Pico máximo: {formatCOP(dailyTimeline.maxVal)}</span>
              <span>Fin: {dailyTimeline.days[dailyTimeline.days.length - 1]?.dateStr}</span>
            </div>
          </div>
        )}
      </div>

      {/* 4. Two-Column Analytics: Top Stores and Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top Stores by Sales */}
        <div className="bg-[#0b101d] border border-gray-800/80 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800/80 pb-4">
            <div>
              <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span>Tiendas Líderes en Ventas</span>
              </h3>
              <p className="text-xs text-gray-400">
                Ranking de tiendas por volumen de dinero generado.
              </p>
            </div>
            <span className="text-xs text-amber-400 font-mono font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
              Top {storeLeaderboard.list.length}
            </span>
          </div>

          {storeLeaderboard.list.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-xs">No hay datos de tiendas en este filtro.</div>
          ) : (
            <div className="space-y-3.5">
              {storeLeaderboard.list.slice(0, 7).map((store, index) => {
                const widthPct = Math.max(Math.round((store.totalSales / storeLeaderboard.maxSales) * 100), 5);
                const isTop1 = index === 0;
                const isTop2 = index === 1;
                const isTop3 = index === 2;

                return (
                  <div key={store.uid} className="space-y-1.5 bg-[#111726]/50 p-3 rounded-2xl border border-gray-800/60">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-black text-[10px] shrink-0 ${
                          isTop1 ? 'bg-amber-400 text-black shadow-md shadow-amber-400/20' :
                          isTop2 ? 'bg-slate-300 text-black' :
                          isTop3 ? 'bg-amber-700 text-white' : 'bg-gray-800 text-gray-400'
                        }`}>
                          {index + 1}
                        </span>
                        <span className="font-bold text-white truncate max-w-[160px] sm:max-w-[220px]">
                          {store.name}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] text-gray-400 font-mono">
                          {store.ordersCount} {store.ordersCount === 1 ? 'pedido' : 'pedidos'}
                        </span>
                        <span className="font-mono font-black text-cyan-400 text-xs">
                          {formatCOP(store.totalSales)}
                        </span>
                        {onGoToOrders && (
                          <button
                            onClick={() => onGoToOrders(store.uid)}
                            title="Ver pedidos de esta tienda"
                            className="p-1 hover:bg-indigo-600/30 text-indigo-400 rounded-lg transition"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-amber-500 to-cyan-400 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Products Sold */}
        <div className="bg-[#0b101d] border border-gray-800/80 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800/80 pb-4">
            <div>
              <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                <Utensils className="w-5 h-5 text-pink-400" />
                <span>Productos Más Vendidos</span>
              </h3>
              <p className="text-xs text-gray-400">
                Platos y artículos con mayor demanda de los clientes.
              </p>
            </div>
            <span className="text-xs text-pink-400 font-mono font-bold bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 rounded-lg">
              Top 10
            </span>
          </div>

          {topProducts.list.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-xs">No hay productos vendidos en este filtro.</div>
          ) : (
            <div className="space-y-3.5">
              {topProducts.list.map((prod, index) => {
                const widthPct = Math.max(Math.round((prod.revenue / topProducts.maxRevenue) * 100), 5);
                return (
                  <div key={`${prod?.name || 'prod'}-${index}`} className="space-y-1.5 bg-[#111726]/50 p-3 rounded-2xl border border-gray-800/60">
                    <div className="flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-white truncate max-w-[200px] sm:max-w-[240px]">
                          {prod?.name || 'Producto'}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {prod.storeName}
                        </p>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <div className="font-mono font-black text-emerald-400 text-xs">
                          {formatCOP(prod.revenue)}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono">
                          {prod.quantity} {prod.quantity === 1 ? 'unidad' : 'unidades'}
                        </div>
                      </div>
                    </div>

                    {/* Bar */}
                    <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-pink-500 to-indigo-500 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* 5. Distribution Breakdown (Payment Methods & Order Types) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Payment Methods */}
        <div className="bg-[#0b101d] border border-gray-800/80 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="border-b border-gray-800/80 pb-3">
            <h4 className="font-extrabold text-white text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" />
              <span>Distribución por Método de Pago</span>
            </h4>
          </div>

          <div className="space-y-3">
            {paymentMethodsDistribution.map(([method, info]) => {
              const pct = kpis.totalSales > 0 ? Math.round((info.total / kpis.totalSales) * 100) : 0;
              return (
                <div key={method} className="bg-[#111726]/40 p-3 rounded-xl border border-gray-800/60 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-300">{info.label}</span>
                    <span className="font-mono font-black text-white">{formatCOP(info.total)} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {info.count} {info.count === 1 ? 'pedido' : 'pedidos'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Types */}
        <div className="bg-[#0b101d] border border-gray-800/80 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="border-b border-gray-800/80 pb-3">
            <h4 className="font-extrabold text-white text-sm flex items-center gap-2">
              <Bike className="w-4 h-4 text-emerald-400" />
              <span>Modalidad de Entrega</span>
            </h4>
          </div>

          <div className="grid grid-cols-3 gap-3">
            
            {/* Delivery */}
            <div className="bg-[#111726]/60 border border-emerald-500/20 p-4 rounded-2xl text-center space-y-1">
              <Bike className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
              <div className="text-xl font-black text-white font-mono">{orderTypesDistribution.delivery.count}</div>
              <div className="text-[11px] font-bold text-emerald-400">Domicilio</div>
              <div className="text-[10px] text-gray-400 font-mono">{orderTypesDistribution.delivery.pct}%</div>
            </div>

            {/* Table */}
            <div className="bg-[#111726]/60 border border-indigo-500/20 p-4 rounded-2xl text-center space-y-1">
              <Utensils className="w-6 h-6 text-indigo-400 mx-auto mb-1" />
              <div className="text-xl font-black text-white font-mono">{orderTypesDistribution.table.count}</div>
              <div className="text-[11px] font-bold text-indigo-400">En Mesa</div>
              <div className="text-[10px] text-gray-400 font-mono">{orderTypesDistribution.table.pct}%</div>
            </div>

            {/* Pickup */}
            <div className="bg-[#111726]/60 border border-cyan-500/20 p-4 rounded-2xl text-center space-y-1">
              <ShoppingBag className="w-6 h-6 text-cyan-400 mx-auto mb-1" />
              <div className="text-xl font-black text-white font-mono">{orderTypesDistribution.pickup.count}</div>
              <div className="text-[11px] font-bold text-cyan-400">Para Llevar</div>
              <div className="text-[10px] text-gray-400 font-mono">{orderTypesDistribution.pickup.pct}%</div>
            </div>

          </div>
        </div>

      </div>

      {/* 6. Recent Orders in Filtered Period */}
      <div className="bg-[#0b101d] border border-gray-800/80 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800/80 pb-4">
          <div>
            <h3 className="font-extrabold text-white text-base flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-indigo-400" />
              <span>Transacciones y Pedidos del Período ({filteredOrders.length})</span>
            </h3>
            <p className="text-xs text-gray-400">
              Detalle individual de cada orden incluida en los cálculos estadísticos.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente, orden, plato..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-[#111726] border border-gray-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs">
            No se encontraron pedidos con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-3 px-3">Pedido #</th>
                  <th className="py-3 px-3">Fecha</th>
                  <th className="py-3 px-3">Tienda</th>
                  <th className="py-3 px-3">Cliente</th>
                  <th className="py-3 px-3">Modalidad</th>
                  <th className="py-3 px-3">Estado</th>
                  <th className="py-3 px-3 text-right">Total COP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {filteredOrders.slice(0, 15).map(o => {
                  const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                  const storeName = getStoreName(o.storeOwnerId, o.storeName);

                  return (
                    <tr key={o.id} className="hover:bg-gray-900/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-cyan-400">
                        #{o.orderNumber}
                      </td>
                      <td className="py-3 px-3 text-gray-400 font-mono text-[11px]">
                        {dateStr}
                      </td>
                      <td className="py-3 px-3 font-bold text-white max-w-[150px] truncate">
                        {storeName}
                      </td>
                      <td className="py-3 px-3 text-gray-300 max-w-[140px] truncate">
                        {o.customerName || 'Cliente'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 font-medium">
                          {o.isTableOrder || o.orderType === 'table' ? 'Mesa' : o.orderType === 'pickup' ? 'Recoger' : 'Domicilio'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          o.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          o.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {o.status === 'delivered' ? 'Entregado' : o.status === 'cancelled' ? 'Cancelado' : 'Pendiente/En ruta'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-white">
                        {formatCOP(o.totalAmount || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredOrders.length > 15 && (
              <div className="pt-4 text-center border-t border-gray-800/60">
                <span className="text-xs text-gray-500">
                  Mostrando las 15 transacciones más recientes de {filteredOrders.length} filtradas.
                </span>
                {onGoToOrders && (
                  <button
                    onClick={() => onGoToOrders()}
                    className="ml-3 text-xs text-indigo-400 font-bold hover:underline"
                  >
                    Ver todas en Pedidos &rarr;
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
