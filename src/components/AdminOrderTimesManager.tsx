/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AdminOrderTimesManager Component
 * Central section for measuring RYYCO order times, lifecycle stages and delivery performance.
 * Official states: Pendiente -> Procesando -> Enviado -> Entregado / Cancelado
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Clock, 
  Timer, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  PackageCheck, 
  Bike, 
  Store, 
  Filter, 
  Calendar, 
  RefreshCw, 
  Search, 
  Eye, 
  ChevronRight, 
  AlertTriangle,
  ArrowUpDown,
  Sparkles,
  BarChart2
} from 'lucide-react';
import { OrderItem, UserProfile } from '../types';
import { 
  calculateOrderTimeStatistics, 
  OrderDateFilterType, 
  OfficialOrderStatus, 
  STATUS_METADATA,
  formatDurationHuman,
  getActiveOrderElapsed
} from '../lib/orderTimeTracking';

interface AdminOrderTimesManagerProps {
  orders: OrderItem[];
  storesMap: Record<string, UserProfile>;
  allStoresList: { uid: string; name: string; username: string; phone?: string; address?: string }[];
  onViewOrder: (order: OrderItem) => void;
  onRefreshOrders?: () => void;
}

export default function AdminOrderTimesManager({
  orders,
  storesMap,
  allStoresList,
  onViewOrder,
  onRefreshOrders
}: AdminOrderTimesManagerProps) {
  // Filters
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<OrderDateFilterType>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [activeTabSubView, setActiveTabSubView] = useState<'overview' | 'stores' | 'active_orders'>('overview');
  const [storeSearchQuery, setStoreSearchQuery] = useState<string>('');

  // Live timer tick for active order elapsed calculation
  const [nowMs, setNowMs] = useState<number>(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 15000); // 15 seconds refresh for live counters
    return () => clearInterval(interval);
  }, []);

  // Store names map
  const storeNamesMap = useMemo(() => {
    const map: Record<string, string> = {};
    allStoresList.forEach(s => {
      map[s.uid] = s.name;
    });
    Object.values(storesMap).forEach(p => {
      if (p && p.uid) {
        map[p.uid] = p.displayName || p.storeName || p.username || 'Tienda';
      }
    });
    return map;
  }, [allStoresList, storesMap]);

  // Compute stats based on current filters
  const stats = useMemo(() => {
    return calculateOrderTimeStatistics(
      orders,
      {
        storeId: selectedStoreId,
        dateFilter: selectedDateFilter,
        customStartDate,
        customEndDate
      },
      storeNamesMap,
      nowMs
    );
  }, [orders, selectedStoreId, selectedDateFilter, customStartDate, customEndDate, storeNamesMap, nowMs]);

  // Currently selected store object if filtering by specific store
  const selectedStoreProfile = useMemo(() => {
    if (!selectedStoreId || selectedStoreId === 'all') return null;
    return stats.storesBreakdown.find(s => s.storeId === selectedStoreId) || null;
  }, [selectedStoreId, stats.storesBreakdown]);

  // Filtered stores table list
  const filteredStoresList = useMemo(() => {
    if (!storeSearchQuery.trim()) return stats.storesBreakdown;
    const q = storeSearchQuery.toLowerCase();
    return stats.storesBreakdown.filter(s => s.storeName.toLowerCase().includes(q));
  }, [stats.storesBreakdown, storeSearchQuery]);

  return (
    <div className="space-y-6 animate-fade-in text-gray-100">
      
      {/* Section Header */}
      <div className="bg-gradient-to-r from-[#0d1322] via-[#0f172a] to-[#0d1322] border border-gray-800/80 p-5 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-500/10">
            <Timer className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-white tracking-tight">
                Tiempos de Pedidos y Estados RYYCO
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase font-mono tracking-wider">
                ● En Tiempo Real
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Medición automatizada en segundos de cada etapa: Pendiente → Procesando → Enviado → Entregado
            </p>
          </div>
        </div>

        {onRefreshOrders && (
          <button
            type="button"
            onClick={onRefreshOrders}
            className="self-start md:self-auto px-3.5 py-2 bg-gray-900/80 hover:bg-gray-850 border border-gray-800 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Actualizar Métricas</span>
          </button>
        )}
      </div>

      {/* Filter Toolbar (Stores & Date Ranges) */}
      <div className="bg-gray-950/80 border border-gray-850 p-4 rounded-2xl shadow-lg space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          {/* Store Selector */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-gray-900 text-gray-400 shrink-0 border border-gray-800">
              <Store className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0 flex-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                Filtrar por Restaurante:
              </label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl py-2 px-3 text-xs font-bold outline-none cursor-pointer focus:border-indigo-500"
              >
                <option value="all">🏢 Todos los restaurantes ({allStoresList.length} registrados)</option>
                {allStoresList.map(st => (
                  <option key={st.uid} value={st.uid}>
                    {st.name} {st.username ? `(@${st.username})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-gray-900 text-gray-400 shrink-0 border border-gray-800">
              <Calendar className="w-4 h-4 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                Período de Tiempo:
              </label>
              <select
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value as OrderDateFilterType)}
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl py-2 px-3 text-xs font-bold outline-none cursor-pointer focus:border-amber-500"
              >
                <option value="all">📅 Todo el historial</option>
                <option value="today">☀️ Hoy</option>
                <option value="yesterday">🌙 Ayer</option>
                <option value="7days">⚡ Últimos 7 días</option>
                <option value="30days">🗓️ Últimos 30 días</option>
                <option value="this_month">📊 Este mes</option>
                <option value="last_month">📁 Mes anterior</option>
                <option value="custom">🎯 Rango personalizado</option>
              </select>
            </div>
          </div>
        </div>

        {/* Custom Date Inputs (when custom filter selected) */}
        {selectedDateFilter === 'custom' && (
          <div className="pt-2 border-t border-gray-850 flex flex-col sm:flex-row items-center gap-3">
            <div className="flex-1 w-full flex items-center gap-2">
              <span className="text-xs text-gray-400 shrink-0">Desde:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl py-1.5 px-3 text-xs font-mono outline-none"
              />
            </div>
            <div className="flex-1 w-full flex items-center gap-2">
              <span className="text-xs text-gray-400 shrink-0">Hasta:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl py-1.5 px-3 text-xs font-mono outline-none"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
              >
                Limpiar fechas
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global Average Metrics / KPI Cards (Requirement 6) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        
        {/* KPI 1: Pedidos Entregados */}
        <div className="bg-gradient-to-b from-emerald-950/40 to-gray-950 border border-emerald-500/30 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
              Entregados
            </span>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          </div>
          <div className="text-2xl font-black font-mono text-white mt-1">
            {stats.deliveredCount}
          </div>
          <p className="text-[10px] text-emerald-400/80 font-mono mt-0.5">
            {stats.deliveredRate}% tasa de entrega
          </p>
        </div>

        {/* KPI 2: Pedidos Cancelados */}
        <div className="bg-gradient-to-b from-red-950/40 to-gray-950 border border-red-500/30 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-red-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-red-300">
              Cancelados
            </span>
            <XCircle className="w-4 h-4 shrink-0" />
          </div>
          <div className="text-2xl font-black font-mono text-white mt-1">
            {stats.cancelledCount}
          </div>
          <p className="text-[10px] text-red-400/80 font-mono mt-0.5">
            {stats.cancelledRate}% tasa cancelación
          </p>
        </div>

        {/* KPI 3: Tiempo Promedio Total */}
        <div className="bg-gradient-to-b from-indigo-950/40 to-gray-950 border border-indigo-500/40 p-4 rounded-2xl shadow-lg relative overflow-hidden col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-indigo-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
              Promedio Total
            </span>
            <Timer className="w-4 h-4 shrink-0 text-indigo-400" />
          </div>
          <div className="text-2xl font-black font-mono text-indigo-300 mt-1">
            {stats.avgTotalFormatted}
          </div>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            Pendiente → Entregado
          </p>
        </div>

        {/* KPI 4: Tiempo Promedio en Pendiente */}
        <div className="bg-gradient-to-b from-amber-950/40 to-gray-950 border border-amber-500/30 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
              Prom. Pendiente
            </span>
            <Clock className="w-4 h-4 shrink-0 text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-300 mt-1">
            {stats.avgPendingFormatted}
          </div>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            Antes de procesar
          </p>
        </div>

        {/* KPI 5: Tiempo Promedio en Procesando */}
        <div className="bg-gradient-to-b from-sky-950/40 to-gray-950 border border-sky-500/30 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-sky-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-sky-300">
              Prom. Procesando
            </span>
            <PackageCheck className="w-4 h-4 shrink-0 text-sky-400" />
          </div>
          <div className="text-2xl font-black font-mono text-sky-300 mt-1">
            {stats.avgProcessingFormatted}
          </div>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            Cocina / empaque
          </p>
        </div>

        {/* KPI 6: Tiempo Promedio en Enviado */}
        <div className="bg-gradient-to-b from-purple-950/40 to-gray-950 border border-purple-500/30 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-purple-400 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-300">
              Prom. Enviado
            </span>
            <Bike className="w-4 h-4 shrink-0 text-purple-400" />
          </div>
          <div className="text-2xl font-black font-mono text-purple-300 mt-1">
            {stats.avgShippingFormatted}
          </div>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            Ruta del repartidor
          </p>
        </div>

      </div>

      {/* Selected Store Banner (Requirement 8) */}
      {selectedStoreProfile && (
        <div className="bg-gradient-to-r from-indigo-950/80 via-gray-900 to-indigo-950/80 border-2 border-indigo-500/50 p-5 rounded-3xl shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block">
                ESTADÍSTICAS DEL RESTAURANTE
              </span>
              <h3 className="text-lg font-black text-white truncate">
                {selectedStoreProfile.storeName}
              </h3>
              <p className="text-xs text-gray-300">
                Pedidos recibidos: <strong className="text-white font-mono">{selectedStoreProfile.totalOrders}</strong> • 
                Entregados: <strong className="text-emerald-400 font-mono">{selectedStoreProfile.deliveredOrders}</strong> • 
                Cancelados: <strong className="text-red-400 font-mono">{selectedStoreProfile.cancelledOrders}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <div className="bg-gray-950/90 border border-gray-800 px-3 py-2 rounded-xl text-center">
              <span className="text-[9px] uppercase font-bold text-amber-400 block">Prom. Pendiente</span>
              <span className="text-xs font-black font-mono text-white">{selectedStoreProfile.avgPendingFormatted}</span>
            </div>
            <div className="bg-gray-950/90 border border-gray-800 px-3 py-2 rounded-xl text-center">
              <span className="text-[9px] uppercase font-bold text-sky-400 block">Prom. Procesando</span>
              <span className="text-xs font-black font-mono text-white">{selectedStoreProfile.avgProcessingFormatted}</span>
            </div>
            <div className="bg-gray-950/90 border border-gray-800 px-3 py-2 rounded-xl text-center">
              <span className="text-[9px] uppercase font-bold text-purple-400 block">Prom. Enviado</span>
              <span className="text-xs font-black font-mono text-white">{selectedStoreProfile.avgShippingFormatted}</span>
            </div>
            <div className="bg-indigo-900/60 border border-indigo-500/40 px-3.5 py-2 rounded-xl text-center">
              <span className="text-[9px] uppercase font-black text-indigo-300 block">Total Entrega</span>
              <span className="text-sm font-black font-mono text-emerald-400">{selectedStoreProfile.avgTotalFormatted}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStoreId('all')}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-900 hover:bg-gray-800 transition cursor-pointer"
            >
              ✕ Quitar filtro
            </button>
          </div>
        </div>
      )}

      {/* Sub-Tabs: Overview vs Stores Comparison vs Active Live Orders */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 bg-gray-900/90 p-1 rounded-2xl border border-gray-800">
          <button
            type="button"
            onClick={() => setActiveTabSubView('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
              activeTabSubView === 'overview'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Resumen y Comparativa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabSubView('stores')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
              activeTabSubView === 'stores'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Por Restaurante ({stats.storesBreakdown.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTabSubView('active_orders')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
              activeTabSubView === 'active_orders'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pedidos en Curso en Vivo</span>
            {stats.activeOrdersList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/40 text-amber-300">
                {stats.activeOrdersList.length}
              </span>
            )}
          </button>
        </div>

        <span className="text-xs text-gray-500 font-mono">
          {stats.totalOrdersCount} pedidos evaluados
        </span>
      </div>

      {/* Sub-View 1 & 2: Stores Comparison Table (Requirement 8) */}
      {(activeTabSubView === 'overview' || activeTabSubView === 'stores') && (
        <div className="bg-gray-950/80 border border-gray-850 rounded-3xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>Ranking y Tiempos Promedio por Restaurante</span>
                <span className="text-[10px] font-mono font-bold text-gray-400">({filteredStoresList.length} tiendas)</span>
              </h3>
              <p className="text-xs text-gray-400">
                Haz clic en cualquier restaurante para filtrar las métricas o ver sus pedidos
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar restaurante..."
                value={storeSearchQuery}
                onChange={(e) => setStoreSearchQuery(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl pl-9 pr-3 py-1.5 text-xs outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-850">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-900/80 text-[10px] font-black uppercase text-gray-400 tracking-wider border-b border-gray-800">
                  <th className="py-3 px-4">Restaurante</th>
                  <th className="py-3 px-3 text-center">Recibidos</th>
                  <th className="py-3 px-3 text-center">Entregados</th>
                  <th className="py-3 px-3 text-center">Cancelados</th>
                  <th className="py-3 px-3 text-center text-amber-400">Prom. Pendiente</th>
                  <th className="py-3 px-3 text-center text-sky-400">Prom. Procesando</th>
                  <th className="py-3 px-3 text-center text-purple-400">Prom. Enviado</th>
                  <th className="py-3 px-4 text-center text-emerald-400">Tiempo Total</th>
                  <th className="py-3 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850">
                {filteredStoresList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      No se registraron pedidos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredStoresList.map((st) => {
                    const isSelected = selectedStoreId === st.storeId;
                    return (
                      <tr 
                        key={st.storeId} 
                        className={`hover:bg-gray-900/50 transition cursor-pointer ${
                          isSelected ? 'bg-indigo-950/40 border-l-4 border-indigo-500' : ''
                        }`}
                        onClick={() => setSelectedStoreId(st.storeId)}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-extrabold text-white text-xs flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span>{st.storeName}</span>
                          </div>
                          {st.activeOrders > 0 && (
                            <span className="text-[10px] text-amber-400 font-mono">
                              ● {st.activeOrders} en curso
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-white">
                          {st.totalOrders}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-emerald-400">
                          {st.deliveredOrders}
                          <span className="block text-[9px] text-gray-500 font-normal">({st.deliveredRate}%)</span>
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-red-400">
                          {st.cancelledOrders}
                          <span className="block text-[9px] text-gray-500 font-normal">({st.cancelledRate}%)</span>
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-amber-300">
                          {st.avgPendingFormatted}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-sky-300">
                          {st.avgProcessingFormatted}
                        </td>
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-purple-300">
                          {st.avgShippingFormatted}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-black text-emerald-400">
                          {st.avgTotalFormatted}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStoreId(st.storeId);
                            }}
                            className="p-1 px-2.5 bg-gray-900 hover:bg-indigo-600 text-gray-300 hover:text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1"
                          >
                            <span>Filtrar</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-View 3: Active Orders Live Elapsed Board (Requirement 5) */}
      {(activeTabSubView === 'overview' || activeTabSubView === 'active_orders') && (
        <div className="bg-gray-950/80 border border-gray-850 rounded-3xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Pedidos en Curso • Monitoreo de Tiempos en Vivo ({stats.activeOrdersList.length})
              </h3>
            </div>
            <p className="text-xs text-gray-400">
              Muestra exactamente cuánto tiempo lleva cada pedido en su estado actual sin recargar
            </p>
          </div>

          {stats.activeOrdersList.length === 0 ? (
            <div className="p-8 text-center bg-gray-900/40 rounded-2xl border border-gray-850 text-gray-400">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
              <p className="font-bold text-white text-xs">¡No hay pedidos activos demorados en este momento!</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Todos los pedidos se encuentran entregados o no hay órdenes en curso.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.activeOrdersList.map(({ order, elapsed }) => {
                const sName = storeNamesMap[order.storeOwnerId] || order.storeName || 'Tienda';
                const dateObj = new Date(order.createdAt);
                const timeStr = !isNaN(dateObj.getTime())
                  ? dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
                  : '--:--';

                return (
                  <div 
                    key={order.id} 
                    className={`p-4 rounded-2xl border transition shadow-lg space-y-3 bg-gray-900/90 ${
                      elapsed.urgencyLevel === 'critical'
                        ? 'border-red-500/60 shadow-red-950/30'
                        : elapsed.urgencyLevel === 'warning'
                        ? 'border-amber-500/50 shadow-amber-950/30'
                        : 'border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    {/* Header: Order # and Live Elapsed Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-black text-white">
                          #{order.orderNumber || 'S/N'}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          • {timeStr}
                        </span>
                      </div>

                      <span className={`px-2.5 py-1 rounded-xl text-xs font-black font-mono border ${
                        elapsed.urgencyLevel === 'critical'
                          ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                          : elapsed.urgencyLevel === 'warning'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : `${elapsed.badgeBg} ${elapsed.badgeText} ${elapsed.badgeBorder}`
                      }`}>
                        ⏳ {elapsed.elapsedFormatted}
                      </span>
                    </div>

                    {/* Status Box */}
                    <div className="flex items-center justify-between gap-2 p-2 bg-black/40 rounded-xl border border-gray-800/80">
                      <span className="text-[10px] uppercase font-bold text-gray-400">
                        Estado Actual:
                      </span>
                      <span className={`text-xs font-black uppercase tracking-wider ${elapsed.badgeText}`}>
                        ● {elapsed.statusLabel}
                      </span>
                    </div>

                    {/* Details: Store, Client, Total */}
                    <div className="text-xs space-y-1 text-gray-300">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-400 text-[11px] truncate flex items-center gap-1">
                          <Store className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span>{sName}</span>
                        </span>
                        <span className="font-bold text-emerald-400 font-mono shrink-0">
                          ${(order.totalAmount || 0).toLocaleString('es-CO')}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-300 truncate">
                        Cliente: <strong className="text-white">{order.customerName}</strong>
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">
                        📍 {order.customerAddress || 'Retiro local'}
                      </p>
                    </div>

                    {/* Action Button */}
                    <button
                      type="button"
                      onClick={() => onViewOrder(order)}
                      className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border border-indigo-500/30"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Línea de Tiempo del Pedido</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
