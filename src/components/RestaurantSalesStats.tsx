/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  ShoppingBag, 
  TrendingUp, 
  CheckCircle2, 
  Calendar, 
  Download, 
  Utensils, 
  CreditCard, 
  Bike, 
  ArrowUpRight, 
  Clock, 
  AlertCircle,
  ChevronRight,
  Flame,
  Award
} from 'lucide-react';
import { OrderItem, ProductItem } from '../types';

interface RestaurantSalesStatsProps {
  orders: OrderItem[];
  products: ProductItem[];
  storeName: string;
  formatPrice: (price: number) => string;
  onNavigateToOrders: () => void;
}

type TimeRangeFilter = 'today' | '7days' | '30days' | 'all';
type OrderStatusFilter = 'all' | 'completed' | 'non_cancelled';

export const RestaurantSalesStats: React.FC<RestaurantSalesStatsProps> = ({
  orders,
  products,
  storeName,
  formatPrice,
  onNavigateToOrders,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('30days');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('non_cancelled');

  // Calculate start/end dates
  const dateBounds = useMemo(() => {
    const now = new Date();
    let start = new Date(0);
    const end = new Date();

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
    }

    return { start, end };
  }, [timeRange]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Date filter
      const orderDate = o.createdAt ? new Date(o.createdAt) : new Date(0);
      if (orderDate < dateBounds.start || orderDate > dateBounds.end) {
        return false;
      }

      // Status filter
      if (statusFilter === 'completed') {
        return o.status === 'delivered';
      }
      if (statusFilter === 'non_cancelled') {
        return o.status !== 'cancelled';
      }

      return true;
    });
  }, [orders, dateBounds, statusFilter]);

  // Primary Metrics
  const metrics = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const completedOrders = filteredOrders.filter(o => o.status === 'delivered').length;
    const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled').length;
    const inProgressOrders = filteredOrders.filter(o => 
      ['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivering', 'processing', 'shipped'].includes(o.status)
    ).length;

    // Total sales revenue: delivered + in-progress (non cancelled)
    const totalRevenue = filteredOrders
      .filter(o => o.status !== 'cancelled')
      .reduce((acc, o) => acc + (o.totalAmount || 0), 0);

    const deliveredRevenue = filteredOrders
      .filter(o => o.status === 'delivered')
      .reduce((acc, o) => acc + (o.totalAmount || 0), 0);

    const averageTicket = completedOrders > 0 
      ? deliveredRevenue / completedOrders 
      : totalOrders > 0 
      ? totalRevenue / totalOrders 
      : 0;

    const completionRate = totalOrders > 0
      ? Math.round((completedOrders / totalOrders) * 100)
      : 100;

    return {
      totalOrders,
      completedOrders,
      cancelledOrders,
      inProgressOrders,
      totalRevenue,
      deliveredRevenue,
      averageTicket,
      completionRate
    };
  }, [filteredOrders]);

  // Top Selling Dishes & Products
  const topDishes = useMemo(() => {
    const dishMap: Record<string, { id: string; name: string; quantity: number; revenue: number; image?: string }> = {};

    filteredOrders
      .filter(o => o.status !== 'cancelled')
      .forEach(o => {
        if (Array.isArray(o.items)) {
          o.items.forEach(item => {
            const prodId = item.id || item.name;
            if (!dishMap[prodId]) {
              const matchedProd = products.find(p => p.id === item.id || p.name.toLowerCase() === item.name.toLowerCase());
              dishMap[prodId] = {
                id: prodId,
                name: item.name || 'Producto',
                quantity: 0,
                revenue: 0,
                image: matchedProd?.imageURL || item.image
              };
            }
            dishMap[prodId].quantity += (item.quantity || 1);
            dishMap[prodId].revenue += ((item.price || 0) * (item.quantity || 1));
          });
        }
      });

    return Object.values(dishMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);
  }, [filteredOrders, products]);

  // Sales by Payment Method
  const paymentMethodStats = useMemo(() => {
    const stats: Record<string, { label: string; count: number; total: number; color: string }> = {
      transfer: { label: 'Transferencia (Nequi / Bancolombia)', count: 0, total: 0, color: '#10B981' },
      delivery_cash: { label: 'Efectivo Contraentrega', count: 0, total: 0, color: '#3B82F6' },
      cod: { label: 'Pago Contraentrega', count: 0, total: 0, color: '#8B5CF6' },
      whatsapp: { label: 'Coordinado por WhatsApp', count: 0, total: 0, color: '#F59E0B' },
      other: { label: 'Otros Métodos', count: 0, total: 0, color: '#6B7280' }
    };

    filteredOrders
      .filter(o => o.status !== 'cancelled')
      .forEach(o => {
        const method = o.paymentMethod || 'whatsapp';
        const target = stats[method] || stats.other;
        target.count += 1;
        target.total += (o.totalAmount || 0);
      });

    return Object.entries(stats)
      .filter(([, data]) => data.count > 0)
      .sort((a, b) => b[1].total - a[1].total);
  }, [filteredOrders]);

  // Sales by Order Type (Delivery vs Mesa vs Pickup)
  const orderTypeStats = useMemo(() => {
    const stats = {
      delivery: { label: 'A Domicilio', count: 0, total: 0, icon: Bike, color: '#10B981' },
      table: { label: 'En Mesa (Restaurante)', count: 0, total: 0, icon: Utensils, color: '#F59E0B' },
      pickup: { label: 'Para Llevar (Pickup)', count: 0, total: 0, icon: ShoppingBag, color: '#6366F1' },
    };

    filteredOrders
      .filter(o => o.status !== 'cancelled')
      .forEach(o => {
        if (o.isTableOrder || o.orderType === 'table') {
          stats.table.count += 1;
          stats.table.total += (o.totalAmount || 0);
        } else if (o.orderType === 'pickup') {
          stats.pickup.count += 1;
          stats.pickup.total += (o.totalAmount || 0);
        } else {
          stats.delivery.count += 1;
          stats.delivery.total += (o.totalAmount || 0);
        }
      });

    return Object.entries(stats).filter(([, data]) => data.count > 0);
  }, [filteredOrders]);

  // Daily Sales grouping for bar chart
  const dailySalesData = useMemo(() => {
    const daysMap: Record<string, { label: string; date: string; amount: number; count: number }> = {};
    const daysToShow = timeRange === 'today' ? 1 : timeRange === '7days' ? 7 : 14;

    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
      daysMap[key] = { label, date: key, amount: 0, count: 0 };
    }

    filteredOrders
      .filter(o => o.status !== 'cancelled')
      .forEach(o => {
        if (!o.createdAt) return;
        const key = o.createdAt.split('T')[0];
        if (daysMap[key]) {
          daysMap[key].amount += (o.totalAmount || 0);
          daysMap[key].count += 1;
        }
      });

    return Object.values(daysMap);
  }, [filteredOrders, timeRange]);

  const maxDayAmount = useMemo(() => {
    const max = Math.max(...dailySalesData.map(d => d.amount), 1);
    return max;
  }, [dailySalesData]);

  // Export Sales Report to CSV
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) return;

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'NÚMERO PEDIDO',
      'FECHA Y HORA',
      'CLIENTE',
      'TELÉFONO',
      'DIRECCIÓN',
      'MÉTODO DE PAGO',
      'ESTADO',
      'TIPO DE PEDIDO',
      'PRODUCTOS / DETALLES',
      'VALOR DOMICILIO',
      'TOTAL FACTURADO (COP)'
    ];

    const rows = filteredOrders.map(o => {
      const itemsSummary = (o.items || [])
        .map(it => `${it.quantity}x ${it.name} (${formatPrice(it.price * it.quantity)})`)
        .join(' | ');

      const statusMap: Record<string, string> = {
        delivered: 'Entregado',
        pending: 'Pendiente',
        confirmed: 'Confirmado',
        preparing: 'En Preparación',
        ready: 'Listo para despacho',
        delivering: 'En Camino',
        cancelled: 'Cancelado'
      };

      const paymentMap: Record<string, string> = {
        transfer: 'Transferencia (Nequi / Bancolombia)',
        delivery_cash: 'Efectivo Contraentrega',
        cod: 'Contraentrega',
        whatsapp: 'WhatsApp'
      };

      return [
        escapeCSV(`#${o.orderNumber || o.id.slice(0, 6)}`),
        escapeCSV(o.createdAt ? new Date(o.createdAt).toLocaleString('es-CO') : ''),
        escapeCSV(o.customerName || 'Cliente'),
        escapeCSV(o.customerPhone || ''),
        escapeCSV(o.customerAddress || ''),
        escapeCSV(paymentMap[o.paymentMethod] || o.paymentMethod || 'WhatsApp'),
        escapeCSV(statusMap[o.status] || o.status),
        escapeCSV(o.isTableOrder ? 'En Mesa' : o.orderType === 'pickup' ? 'Para Llevar' : 'A Domicilio'),
        escapeCSV(itemsSummary),
        escapeCSV(o.deliveryFee || 0),
        escapeCSV(o.totalAmount || 0)
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reporte_ventas_${storeName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header section with title and quick filter bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-900 pb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <TrendingUp className="w-5 h-5" />
              </span>
              Estadísticas de Ventas
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 text-[10px] font-black uppercase font-mono tracking-wider">
              Finanzas & Rendimiento
            </span>
          </div>
          <p className="text-xs text-gray-400 font-medium mt-1">
            Monitorea los ingresos de tu restaurante, platos estrella más pedidos y balance de ventas en tiempo real.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time range buttons */}
          <div className="bg-gray-950 p-1 rounded-xl border border-gray-850 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTimeRange('today')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                timeRange === 'today'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('7days')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                timeRange === '7days'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              7 Días
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('30days')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                timeRange === '30days'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              30 Días
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                timeRange === 'all'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Todo
            </button>
          </div>

          {/* Export Report to CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredOrders.length === 0}
            className="px-3.5 py-2 bg-gray-900 hover:bg-gray-850 border border-gray-750 text-emerald-300 hover:text-white text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Descargar reporte completo en formato CSV / Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* 4 Main KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* KPI 1: Ventas Totales */}
        <div className="bg-gradient-to-br from-gray-950 via-[#0a121d] to-[#071018] border border-emerald-500/30 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-emerald-400">
              Ventas Totales
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight">
            {formatPrice(metrics.totalRevenue)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400 font-medium">
            <span>Solo Entregados:</span>
            <span className="text-emerald-400 font-bold font-mono">
              {formatPrice(metrics.deliveredRevenue)}
            </span>
          </div>
        </div>

        {/* KPI 2: Pedidos Totales */}
        <div className="bg-gray-950 border border-gray-850 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-indigo-400">
              Pedidos Realizados
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight font-mono">
            {metrics.totalOrders}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400 font-medium">
            <span className="text-emerald-400 font-bold">{metrics.completedOrders} completados</span>
            {metrics.inProgressOrders > 0 && (
              <span className="text-amber-400 font-bold">{metrics.inProgressOrders} en curso</span>
            )}
          </div>
        </div>

        {/* KPI 3: Ticket Promedio */}
        <div className="bg-gray-950 border border-gray-850 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-amber-400">
              Ticket Promedio
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight">
            {formatPrice(metrics.averageTicket)}
          </div>
          <div className="mt-2 text-[10px] text-gray-400 font-medium">
            Valor medio consumido por cliente
          </div>
        </div>

        {/* KPI 4: Efectividad de Entrega */}
        <div className="bg-gray-950 border border-gray-850 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-cyan-400">
              Efectividad
            </span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl md:text-3xl font-black text-cyan-400 tracking-tight font-mono">
            {metrics.completionRate}%
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400 font-medium">
            <span>Cancelados:</span>
            <span className={metrics.cancelledOrders > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}>
              {metrics.cancelledOrders} pedidos
            </span>
          </div>
        </div>
      </div>

      {/* Visual Evolution: Daily Sales Bars */}
      <div className="bg-gray-950 border border-gray-850 p-5 sm:p-6 rounded-3xl space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-900 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Evolución de Ventas por Fecha
            </h3>
            <p className="text-[11px] text-gray-400 font-medium">
              Ingresos diarios acumulados durante el período seleccionado
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>Ventas Facturadas</span>
          </div>
        </div>

        {dailySalesData.length > 0 && maxDayAmount > 0 ? (
          <div className="pt-4">
            <div className="h-44 flex items-end gap-2 sm:gap-3 overflow-x-auto pb-2 no-scrollbar">
              {dailySalesData.map((d, idx) => {
                const heightPercent = Math.max(8, Math.round((d.amount / maxDayAmount) * 100));
                return (
                  <div key={idx} className="flex-1 min-w-[36px] sm:min-w-[48px] flex flex-col items-center gap-2 group h-full justify-end">
                    <div className="text-[9px] sm:text-[10px] font-mono font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                      {d.amount > 0 ? formatPrice(d.amount) : '$0'}
                    </div>
                    <div 
                      className={`w-full rounded-t-xl transition-all duration-300 ${
                        d.amount > 0 
                          ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:from-emerald-500 group-hover:to-teal-300 shadow-lg shadow-emerald-500/20' 
                          : 'bg-gray-850'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                      title={`${d.label}: ${formatPrice(d.amount)} (${d.count} pedidos)`}
                    />
                    <span className="text-[9px] sm:text-[10px] font-semibold text-gray-400 group-hover:text-white transition truncate max-w-full text-center">
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-gray-500">
            No se registran ventas en este período.
          </div>
        )}
      </div>

      {/* Two Columns: Top Selling Dishes + Breakdown by Payment & Order Type */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Top Selling Dishes (7 cols) */}
        <div className="lg:col-span-7 bg-gray-950 border border-gray-850 p-5 sm:p-6 rounded-3xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-900 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <Flame className="w-4.5 h-4.5 text-amber-400 fill-amber-400/20" />
                Platos y Productos Más Vendidos
              </h3>
              <p className="text-[11px] text-gray-400 font-medium">
                Artículos con mayor demanda y facturación en tu menú
              </p>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase font-mono">
              Ranking
            </span>
          </div>

          {topDishes.length > 0 ? (
            <div className="space-y-2.5">
              {topDishes.map((dish, i) => {
                const totalUnits = topDishes.reduce((sum, d) => sum + d.quantity, 0);
                const percent = totalUnits > 0 ? Math.round((dish.quantity / totalUnits) * 100) : 0;

                return (
                  <div 
                    key={dish.id} 
                    className="p-3 bg-gray-900/60 hover:bg-gray-900 border border-gray-850 hover:border-gray-800 rounded-2xl transition flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Rank badge */}
                      <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                        i === 0 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                          : i === 1 
                          ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40'
                          : i === 2
                          ? 'bg-amber-700/20 text-amber-500 border border-amber-700/40'
                          : 'bg-gray-800 text-gray-400'
                      }`}>
                        #{i + 1}
                      </span>

                      {/* Image / Icon */}
                      {dish.image ? (
                        <img 
                          src={dish.image} 
                          alt={dish.name} 
                          className="w-10 h-10 rounded-xl object-cover shrink-0 border border-gray-800" 
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-gray-400 shrink-0">
                          <Utensils className="w-5 h-5 text-gray-500" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                          {dish.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                          <span className="font-semibold text-emerald-400">
                            {dish.quantity} {dish.quantity === 1 ? 'unidad vendida' : 'unidades vendidas'}
                          </span>
                          <span>•</span>
                          <span>{percent}% del volumen</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs sm:text-sm font-black text-white font-mono">
                        {formatPrice(dish.revenue)}
                      </div>
                      <span className="text-[10px] text-gray-500 font-medium">Facturado</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-gray-500">
              Aún no hay platos registrados con ventas en este período.
            </div>
          )}
        </div>

        {/* Right Column: Métodos de Pago & Tipo de Entrega (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Métodos de Pago */}
          <div className="bg-gray-950 border border-gray-850 p-5 sm:p-6 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-900 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  Métodos de Pago
                </h3>
                <p className="text-[11px] text-gray-400 font-medium">
                  Canales por donde pagan tus clientes
                </p>
              </div>
            </div>

            {paymentMethodStats.length > 0 ? (
              <div className="space-y-3">
                {paymentMethodStats.map(([key, data]) => {
                  const percent = metrics.totalRevenue > 0 
                    ? Math.round((data.total / metrics.totalRevenue) * 100) 
                    : 0;

                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-gray-300">{data.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">{formatPrice(data.total)}</span>
                          <span className="text-[10px] text-gray-500">({data.count})</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden border border-gray-850">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%`, backgroundColor: data.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-gray-500">
                Sin transacciones en este período.
              </div>
            )}
          </div>

          {/* Tipo de Pedidos (Domicilio vs Mesa vs Llevar) */}
          <div className="bg-gray-950 border border-gray-850 p-5 sm:p-6 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-900 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                  <Bike className="w-4 h-4 text-indigo-400" />
                  Modalidad de Pedido
                </h3>
                <p className="text-[11px] text-gray-400 font-medium">
                  Distribución entre domicilios y salón
                </p>
              </div>
            </div>

            {orderTypeStats.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {orderTypeStats.map(([key, data]) => {
                  const Icon = data.icon;
                  return (
                    <div key={key} className="p-3.5 bg-gray-900/60 border border-gray-850 rounded-2xl space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <Icon className="w-4 h-4" style={{ color: data.color }} />
                        <span>{data.label}</span>
                      </div>
                      <div className="text-base sm:text-lg font-black text-white font-mono">
                        {data.count} <span className="text-xs text-gray-400 font-sans font-normal">pedidos</span>
                      </div>
                      <div className="text-[11px] font-bold text-emerald-400 font-mono">
                        {formatPrice(data.total)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-gray-500">
                Sin pedidos en este período.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Sales Order Table & Link to Full Orders Manager */}
      <div className="bg-gray-950 border border-gray-850 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-900 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
              Últimas Ventas Registradas ({filteredOrders.length})
            </h3>
            <p className="text-[11px] text-gray-400 font-medium">
              Historial directo de órdenes facturadas para este restaurante
            </p>
          </div>

          <button
            type="button"
            onClick={onNavigateToOrders}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition cursor-pointer self-start sm:self-center"
          >
            <span>Ir al Gestor de Pedidos Completo</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {filteredOrders.length > 0 ? (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-850 text-gray-500 uppercase tracking-wider text-[10px] font-black">
                  <th className="py-2.5 px-3">Pedido</th>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Tipo / Pago</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Total Facturado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900">
                {filteredOrders.slice(0, 10).map((o) => {
                  const isDelivered = o.status === 'delivered';
                  const isCancelled = o.status === 'cancelled';

                  return (
                    <tr key={o.id} className="hover:bg-gray-900/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-white">
                        #{o.orderNumber || o.id.slice(0, 6)}
                      </td>
                      <td className="py-3 px-3 text-gray-400 font-mono text-[11px]">
                        {o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-white block">{o.customerName || 'Cliente'}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{o.customerPhone || ''}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[11px] text-gray-300 block">
                          {o.isTableOrder ? '🍽️ Mesa' : '🛵 Domicilio'}
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase font-mono">
                          {o.paymentMethod || 'WhatsApp'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isDelivered
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : isCancelled
                            ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}>
                          {isDelivered ? 'Entregado' : isCancelled ? 'Cancelado' : 'En Proceso'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-black font-mono text-emerald-400 text-sm">
                        {formatPrice(o.totalAmount || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-gray-500 space-y-1">
            <p>No se encontraron ventas para este período.</p>
            <p className="text-[11px] text-gray-600">Cuando los clientes realicen pedidos, aquí se registrará toda la información financiera y de facturación.</p>
          </div>
        )}
      </div>
    </div>
  );
};
