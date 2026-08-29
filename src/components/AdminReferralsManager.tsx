/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  CreatorReferral, 
  ReferralCommission 
} from '../types';
import { 
  fetchAllCreators, 
  saveCreator, 
  deleteCreator, 
  fetchAllReferralCommissions, 
  markCommissionAsPaid, 
  markAllCreatorCommissionsAsPaid 
} from '../lib/firebase';
import { 
  Users, 
  Link, 
  Copy, 
  Check, 
  DollarSign, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Edit, 
  Search, 
  RefreshCw, 
  Share2, 
  AlertCircle,
  ExternalLink,
  Percent,
  CheckCircle2,
  Clock,
  X,
  Instagram
} from 'lucide-react';

export default function AdminReferralsManager() {
  const [creators, setCreators] = useState<CreatorReferral[]>([]);
  const [commissions, setCommissions] = useState<ReferralCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modal State for New/Edit Creator
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCreator, setEditingCreator] = useState<CreatorReferral | null>(null);
  
  // Form fields
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formSocial, setFormSocial] = useState('');
  const [formType, setFormType] = useState<'percentage' | 'fixed'>('percentage');
  const [formValue, setFormValue] = useState<number>(5);
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Tab inside Referrals Admin: 'creators' or 'commissions'
  const [viewTab, setViewTab] = useState<'creators' | 'commissions'>('creators');
  const [commissionStatusFilter, setCommissionStatusFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedCreators, fetchedCommissions] = await Promise.all([
        fetchAllCreators(),
        fetchAllReferralCommissions()
      ]);
      setCreators(fetchedCreators);
      setCommissions(fetchedCommissions);
    } catch (err) {
      console.error("Error loading referrals data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (creator?: CreatorReferral) => {
    setFormError('');
    if (creator) {
      setEditingCreator(creator);
      setFormName(creator.name);
      setFormCode(creator.code);
      setFormEmail(creator.email || '');
      setFormPhone(creator.phone || '');
      setFormSocial(creator.socialMedia || '');
      setFormType(creator.commissionType);
      setFormValue(creator.commissionValue);
      setFormActive(creator.active);
    } else {
      setEditingCreator(null);
      setFormName('');
      setFormCode('');
      setFormEmail('');
      setFormPhone('');
      setFormSocial('');
      setFormType('percentage');
      setFormValue(5);
      setFormActive(true);
    }
    setIsModalOpen(true);
  };

  const handleSaveCreator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Ingresa el nombre del creador.');
      return;
    }
    const cleanCode = formCode.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanCode) {
      setFormError('Ingresa un código único de referido.');
      return;
    }

    // Check duplicate code if new
    if (!editingCreator) {
      const exists = creators.some(c => c.code.toLowerCase() === cleanCode);
      if (exists) {
        setFormError('Este código de referido ya existe. Por favor elige otro.');
        return;
      }
    }

    setSaving(true);
    try {
      await saveCreator({
        id: editingCreator ? editingCreator.id : cleanCode,
        code: cleanCode,
        name: formName.trim(),
        email: formEmail.trim(),
        phone: formPhone.trim(),
        socialMedia: formSocial.trim(),
        commissionType: formType,
        commissionValue: Number(formValue) || 0,
        active: formActive,
        totalClicks: editingCreator ? editingCreator.totalClicks : 0,
        totalOrdersCount: editingCreator ? editingCreator.totalOrdersCount : 0,
        totalSalesAmount: editingCreator ? editingCreator.totalSalesAmount : 0,
        totalEarnings: editingCreator ? editingCreator.totalEarnings : 0,
        totalPaid: editingCreator ? editingCreator.totalPaid : 0,
        createdAt: editingCreator ? editingCreator.createdAt : new Date().toISOString()
      });

      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      console.error("Error saving creator:", err);
      setFormError('Error al guardar el creador. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCreator = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de eliminar al creador "${name}"?`)) {
      await deleteCreator(id);
      await loadData();
    }
  };

  const handleCopyLink = (code: string) => {
    const origin = window.location.origin;
    const url = `${origin}/?ref=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handlePaySingleCommission = async (comm: ReferralCommission) => {
    if (window.confirm(`¿Marcar comisión de $${comm.commissionAmount.toLocaleString()} COP como PAGADA a ${comm.creatorName}?`)) {
      await markCommissionAsPaid(comm.id, comm.creatorId, comm.commissionAmount);
      await loadData();
    }
  };

  const handlePayAllCreatorCommissions = async (creator: CreatorReferral, pendingAmount: number) => {
    if (window.confirm(`¿Marcar TODAS las comisiones pendientes ($${pendingAmount.toLocaleString()} COP) como PAGADAS a ${creator.name}?`)) {
      await markAllCreatorCommissionsAsPaid(creator.id);
      await loadData();
    }
  };

  // Calculate Aggregates
  const totalActiveCreators = creators.filter(c => c.active).length;
  const totalClicksAll = creators.reduce((sum, c) => sum + (c.totalClicks || 0), 0);
  const totalOrdersReferred = creators.reduce((sum, c) => sum + (c.totalOrdersCount || 0), 0);
  const totalSalesGenerated = creators.reduce((sum, c) => sum + (c.totalSalesAmount || 0), 0);
  
  // Calculate commissions from commissions ledger
  const totalCommissionsGenerated = commissions
    .filter(c => c.status !== 'cancelled')
    .reduce((sum, c) => sum + c.commissionAmount, 0);

  const totalCommissionsPaid = commissions
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + c.commissionAmount, 0);

  const totalCommissionsPending = commissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + c.commissionAmount, 0);

  // Filter creators
  const filteredCreators = creators.filter(c => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.socialMedia && c.socialMedia.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  // Filter commissions
  const filteredCommissions = commissions.filter(c => {
    const matchesStatus = commissionStatusFilter === 'all' || c.status === commissionStatusFilter;
    const q = search.toLowerCase();
    const matchesSearch = 
      c.creatorName.toLowerCase().includes(q) ||
      c.creatorCode.toLowerCase().includes(q) ||
      (c.storeName && c.storeName.toLowerCase().includes(q)) ||
      (c.orderNumber && c.orderNumber.toString().includes(q));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#111827] p-5 rounded-2xl border border-[#1F2937] shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">Sistema de Referidos y Creadores</h2>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Gestiona enlaces únicos para influencers y comisiones automáticas por ventas generadas.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={loadData}
            className="p-2.5 text-gray-400 hover:text-white bg-[#0D1117] hover:bg-[#1F2937] rounded-xl transition border border-[#1F2937]"
            title="Recargar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-red-600/20 text-xs sm:text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Creador</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#111827] p-4 rounded-2xl border border-[#1F2937] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs font-medium mb-1">
            <span>Creadores</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-white">{totalActiveCreators}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Activos en plataforma</div>
        </div>

        <div className="bg-[#111827] p-4 rounded-2xl border border-[#1F2937] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs font-medium mb-1">
            <span>Clics en Enlaces</span>
            <Link className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-white">{totalClicksAll}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Visitas redirigidas</div>
        </div>

        <div className="bg-[#111827] p-4 rounded-2xl border border-[#1F2937] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs font-medium mb-1">
            <span>Pedidos Generados</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white">{totalOrdersReferred}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Ventas atribuídas</div>
        </div>

        <div className="bg-[#111827] p-4 rounded-2xl border border-[#1F2937] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs font-medium mb-1">
            <span>Ventas Totales</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-white">${totalSalesGenerated.toLocaleString()}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">COP en pedidos</div>
        </div>

        <div className="bg-amber-950/30 p-4 rounded-2xl border border-amber-500/30 shadow-lg">
          <div className="flex items-center justify-between text-amber-400 text-xs font-medium mb-1">
            <span>Por Pagar</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-amber-300">${totalCommissionsPending.toLocaleString()}</div>
          <div className="text-[11px] text-amber-400/70 mt-0.5">Comisiones pendientes</div>
        </div>

        <div className="bg-emerald-950/30 p-4 rounded-2xl border border-emerald-500/30 shadow-lg">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-medium mb-1">
            <span>Pagado</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-300">${totalCommissionsPaid.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-400/70 mt-0.5">Liquidado a creadores</div>
        </div>
      </div>

      {/* Tabs & Search Navigation */}
      <div className="bg-[#111827] p-4 rounded-2xl border border-[#1F2937] shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#1F2937]">
          <div className="flex items-center gap-1 bg-[#0D1117] p-1 rounded-xl border border-[#1F2937]">
            <button
              onClick={() => setViewTab('creators')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
                viewTab === 'creators'
                  ? 'bg-[#1F2937] text-white shadow-sm border border-gray-700'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Creadores & Enlaces ({creators.length})
            </button>
            <button
              onClick={() => setViewTab('commissions')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
                viewTab === 'commissions'
                  ? 'bg-[#1F2937] text-white shadow-sm border border-gray-700'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Historial de Comisiones ({commissions.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder={viewTab === 'creators' ? "Buscar creador o código..." : "Buscar por creador u orden..."}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#0D1117] border border-[#1F2937] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>

            {viewTab === 'commissions' && (
              <select
                value={commissionStatusFilter}
                onChange={e => setCommissionStatusFilter(e.target.value as any)}
                className="px-3 py-2 text-xs bg-[#0D1117] border border-[#1F2937] rounded-xl text-gray-300 focus:outline-none focus:border-red-500"
              >
                <option value="all">Todos los Estados</option>
                <option value="pending">Pendientes de Pago</option>
                <option value="paid">Pagadas</option>
                <option value="cancelled">Canceladas</option>
              </select>
            )}
          </div>
        </div>

        {/* VIEW 1: CREATORS LIST */}
        {viewTab === 'creators' && (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                Cargando creadores...
              </div>
            ) : filteredCreators.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                No se encontraron creadores de contenido.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCreators.map(creator => {
                  // Calculate creator's pending commissions
                  const creatorComms = commissions.filter(c => c.creatorId === creator.id);
                  const pendingComms = creatorComms.filter(c => c.status === 'pending');
                  const pendingAmount = pendingComms.reduce((sum, c) => sum + c.commissionAmount, 0);

                  return (
                    <div 
                      key={creator.id}
                      className="bg-[#0D1117] rounded-2xl border border-[#1F2937] p-4 shadow-lg hover:border-gray-700 transition space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2.5">
                        {/* Status & Name */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-bold text-white text-base">{creator.name}</h3>
                              {creator.active ? (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" title="Activo" />
                              ) : (
                                <span className="w-2 h-2 rounded-full bg-gray-600" title="Inactivo" />
                              )}
                            </div>
                            {creator.socialMedia && (
                              <div className="flex items-center gap-1 text-xs text-indigo-400 mt-0.5 font-medium">
                                <Instagram className="w-3 h-3" />
                                <span>{creator.socialMedia}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenModal(creator)}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-[#1F2937] rounded-lg transition"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCreator(creator.id, creator.name)}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Referral Link Pill */}
                        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Código de Referido</div>
                            <div className="text-xs font-mono font-bold text-amber-400 truncate">
                              ?ref={creator.code}
                            </div>
                          </div>
                          <button
                            onClick={() => handleCopyLink(creator.code)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 shrink-0 ${
                              copiedCode === creator.code
                                ? 'bg-emerald-600 text-white'
                                : 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
                            }`}
                          >
                            {copiedCode === creator.code ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>¡Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copiar Enlace</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Commission Rule */}
                        <div className="flex items-center justify-between text-xs py-1.5 px-2.5 bg-indigo-950/30 rounded-xl border border-indigo-500/20">
                          <span className="text-indigo-300 font-medium">Comisión:</span>
                          <span className="font-bold text-indigo-200">
                            {creator.commissionType === 'percentage' 
                              ? `${creator.commissionValue}% por venta`
                              : `$${creator.commissionValue.toLocaleString()} COP por pedido`
                            }
                          </span>
                        </div>

                        {/* Metrics Summary */}
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1F2937] text-center">
                          <div className="bg-[#111827] p-1.5 rounded-xl border border-[#1F2937]">
                            <div className="text-[10px] text-gray-400">Clics</div>
                            <div className="text-xs font-bold text-white">{creator.totalClicks || 0}</div>
                          </div>
                          <div className="bg-[#111827] p-1.5 rounded-xl border border-[#1F2937]">
                            <div className="text-[10px] text-gray-400">Pedidos</div>
                            <div className="text-xs font-bold text-emerald-400">{creator.totalOrdersCount || 0}</div>
                          </div>
                          <div className="bg-[#111827] p-1.5 rounded-xl border border-[#1F2937]">
                            <div className="text-[10px] text-gray-400">Ventas</div>
                            <div className="text-xs font-bold text-white">${(creator.totalSalesAmount || 0).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>

                      {/* Pay Pending Action */}
                      <div className="pt-2.5 border-t border-[#1F2937] flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] text-gray-400">Pendiente de Pago</div>
                          <div className={`text-sm font-bold ${pendingAmount > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
                            ${pendingAmount.toLocaleString()} COP
                          </div>
                        </div>

                        {pendingAmount > 0 ? (
                          <button
                            onClick={() => handlePayAllCreatorCommissions(creator, pendingAmount)}
                            className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition shadow-md shadow-amber-600/20 flex items-center gap-1"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>Liquidar</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-medium text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                            Al día
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: COMMISSIONS HISTORY TABLE */}
        {viewTab === 'commissions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0D1117] text-gray-400 font-semibold uppercase text-[10px] tracking-wider border-b border-[#1F2937]">
                <tr>
                  <th className="py-3 px-3">Fecha</th>
                  <th className="py-3 px-3">Creador</th>
                  <th className="py-3 px-3">Tienda / Negocio</th>
                  <th className="py-3 px-3 text-right">Total Pedido</th>
                  <th className="py-3 px-3 text-right">Comisión</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500">
                      Cargando historial de comisiones...
                    </td>
                  </tr>
                ) : filteredCommissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500">
                      No hay comisiones registradas.
                    </td>
                  </tr>
                ) : (
                  filteredCommissions.map(comm => (
                    <tr key={comm.id} className="hover:bg-[#131927] transition">
                      <td className="py-3 px-3 font-mono text-gray-400 whitespace-nowrap">
                        {new Date(comm.createdAt).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-3 font-medium text-white">
                        <div>{comm.creatorName}</div>
                        <div className="text-[10px] text-indigo-400 font-mono">?ref={comm.creatorCode}</div>
                      </td>
                      <td className="py-3 px-3 text-gray-300 font-medium">
                        {comm.storeName || 'LinnkPro Store'}
                        {comm.orderNumber ? <span className="text-[10px] text-gray-500 ml-1">#{comm.orderNumber}</span> : null}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-white">
                        ${comm.orderTotal.toLocaleString()} COP
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-amber-400">
                        ${comm.commissionAmount.toLocaleString()} COP
                      </td>
                      <td className="py-3 px-3 text-center">
                        {comm.status === 'paid' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                            <Check className="w-3 h-3" /> Pagada
                          </span>
                        )}
                        {comm.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-500/40">
                            <Clock className="w-3 h-3" /> Pendiente
                          </span>
                        )}
                        {comm.status === 'cancelled' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-950/60 px-2.5 py-0.5 rounded-full border border-red-500/40">
                            <X className="w-3 h-3" /> Cancelada
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {comm.status === 'pending' ? (
                          <button
                            onClick={() => handlePaySingleCommission(comm)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg transition shadow-sm"
                          >
                            Marcar Pagada
                          </button>
                        ) : comm.paidAt ? (
                          <span className="text-[10px] text-gray-500">
                            {new Date(comm.paidAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: NUEVO / EDITAR CREADOR */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#111827] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#1F2937] space-y-5 relative text-white">
            <div className="flex items-center justify-between pb-3 border-b border-[#1F2937]">
              <h3 className="text-lg font-bold text-white">
                {editingCreator ? 'Editar Creador de Contenido' : 'Nuevo Creador de Contenido'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCreator} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-300 font-semibold mb-1">Nombre del Creador *</label>
                <input
                  type="text"
                  placeholder="ej. Juan Diego - Foodie Ipiales"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0D1117] border border-[#1F2937] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Código Único de Referido *</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-mono text-xs">ryyco.com/?ref=</span>
                  <input
                    type="text"
                    placeholder="juandiego"
                    value={formCode}
                    onChange={e => setFormCode(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                    className="flex-1 px-3 py-2 font-mono font-bold text-amber-400 bg-[#0D1117] border border-[#1F2937] rounded-xl focus:outline-none focus:border-red-500"
                    disabled={!!editingCreator}
                    required
                  />
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Este código se usará en el enlace que el creador compartirá.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Red Social / Username</label>
                  <input
                    type="text"
                    placeholder="@juandiego_ipiales"
                    value={formSocial}
                    onChange={e => setFormSocial(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0D1117] border border-[#1F2937] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1">Teléfono / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="3210000000"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0D1117] border border-[#1F2937] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1">Email (Opcional)</label>
                <input
                  type="email"
                  placeholder="creador@ejemplo.com"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0D1117] border border-[#1F2937] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Commission Type and Value */}
              <div className="p-3 bg-[#0D1117] border border-[#1F2937] rounded-2xl space-y-3">
                <label className="block text-gray-200 font-bold">Esquema de Comisión</label>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setFormType('percentage'); setFormValue(5); }}
                    className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      formType === 'percentage'
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                        : 'bg-[#111827] text-gray-400 border border-[#1F2937]'
                    }`}
                  >
                    <Percent className="w-3.5 h-3.5" />
                    <span>Porcentaje (%)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setFormType('fixed'); setFormValue(2000); }}
                    className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      formType === 'fixed'
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                        : 'bg-[#111827] text-gray-400 border border-[#1F2937]'
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Monto Fijo ($)</span>
                  </button>
                </div>

                <div>
                  <label className="block text-gray-400 font-medium mb-1">
                    {formType === 'percentage' ? 'Porcentaje sobre el total de la venta (%)' : 'Monto Fijo por pedido ($ COP)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={formType === 'percentage' ? "0.5" : "100"}
                    value={formValue}
                    onChange={e => setFormValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 font-bold bg-[#111827] border border-[#1F2937] text-white rounded-xl focus:outline-none focus:border-red-500"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={e => setFormActive(e.target.checked)}
                    className="w-4 h-4 text-red-600 rounded bg-[#0D1117] border-[#1F2937] focus:ring-red-500"
                  />
                  <span className="font-semibold text-gray-300">Creador Activo</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-gray-400 hover:text-white rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-xl transition shadow-lg shadow-red-600/20 disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Guardar Creador'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
