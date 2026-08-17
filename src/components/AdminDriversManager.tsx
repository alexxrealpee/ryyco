/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Bike, 
  Car, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  Star, 
  Search, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  AlertTriangle, 
  UserCheck, 
  UserX, 
  Trash2, 
  RefreshCw,
  Power,
  ChevronRight,
  Copy,
  Share2,
  MessageSquare,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { fetchAllDrivers, updateDriverStatus, deleteDriverAccount } from '../lib/firebase';
import { DriverProfile, DriverStatus } from '../types';

export default function AdminDriversManager() {
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');

  // Registration link state
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const driverLink = "https://linnkpro.store/domiciliario";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(driverLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Rejection modal state
  const [rejectionTarget, setRejectionTarget] = useState<DriverProfile | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  useEffect(() => {
    loadDrivers();
  }, []);

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const data = await fetchAllDrivers();
      setDrivers(data);
    } catch (e) {
      console.error("Error loading drivers:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (driverId: string) => {
    setActionLoading(true);
    try {
      await updateDriverStatus(driverId, 'approved');
      await loadDrivers();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (driverId: string) => {
    setActionLoading(true);
    try {
      await updateDriverStatus(driverId, 'suspended');
      await loadDrivers();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmRejection = async () => {
    if (!rejectionTarget) return;
    setActionLoading(true);
    try {
      await updateDriverStatus(rejectionTarget.id, 'rejected', rejectionReason.trim());
      setRejectionTarget(null);
      setRejectionReason('');
      await loadDrivers();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (driverId: string) => {
    if (!window.confirm("¿Estás seguro de eliminar permanentemente este domiciliario?")) return;
    setActionLoading(true);
    try {
      await deleteDriverAccount(driverId);
      await loadDrivers();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredDrivers = drivers.filter(d => {
    const fullName = `${d.firstName || ''} ${d.lastName || ''}`.toLowerCase();
    const doc = (d.docNumber || '').toLowerCase();
    const email = (d.email || '').toLowerCase();
    const phone = (d.phone || '').toLowerCase();
    const search = searchTerm.toLowerCase();

    const matchesSearch = fullName.includes(search) || doc.includes(search) || email.includes(search) || phone.includes(search);
    const matchesFilter = statusFilter === 'all' || d.status === statusFilter;
    const matchesAvailability =
      availabilityFilter === 'all' ||
      (availabilityFilter === 'available' && !!d.isAvailable) ||
      (availabilityFilter === 'unavailable' && !d.isAvailable);

    return matchesSearch && matchesFilter && matchesAvailability;
  });

  const getStatusBadge = (status: DriverStatus) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Aprobado
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <Clock className="w-3 h-3" /> Pendiente
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Rechazado
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <ShieldAlert className="w-3 h-3" /> Suspendido
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-[#111827] border border-[#232B3A] p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <Bike className="w-5 h-5 text-[#E63946]" />
            <h2 className="text-lg font-black text-white">Gestión de Domiciliarios Independientes</h2>
          </div>
          <p className="text-xs text-[#A9B2C3] mt-1">
            Administra los repartidores independientes de la plataforma, aprueba registros y supervisa su actividad.
          </p>
        </div>

        <button
          onClick={loadDrivers}
          className="px-4 py-2 bg-[#090B12] hover:bg-[#232B3A] text-white font-bold text-xs rounded-xl border border-[#232B3A] transition flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar Lista</span>
        </button>
      </div>

      {/* Driver Registration Link Box */}
      <div className="bg-[#111827] border border-[#E63946]/30 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-[#E63946]/10 text-[#E63946] text-[10px] font-black uppercase tracking-wider border border-[#E63946]/20">
              Enlace de Registro para Domiciliarios
            </span>
            <Sparkles className="w-3.5 h-3.5 text-[#F4B400]" />
          </div>
          <h3 className="text-sm font-extrabold text-white">Comparte este enlace directo con nuevos repartidores</h3>
          <p className="text-xs text-[#A9B2C3]">
            Envía este enlace por WhatsApp o compártelo para que los domiciliarios puedan registrarse o iniciar sesión directamente.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto shrink-0">
          <div className="flex items-center gap-2 bg-[#090B12] px-3.5 py-2 rounded-xl border border-[#232B3A] text-xs text-white font-mono font-bold select-all overflow-x-auto">
            <Share2 className="w-3.5 h-3.5 text-[#E63946] shrink-0" />
            <span className="truncate">{driverLink}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="px-3.5 py-2 bg-[#E63946] hover:bg-[#D62839] text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer shrink-0"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Enlace</span>
                </>
              )}
            </button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent("¡Hola! Regístrate o ingresa como repartidor/domiciliario en LinnkPro en el siguiente enlace: " + driverLink)}`}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-[#F4B400]/10 hover:bg-[#F4B400]/20 text-[#F4B400] border border-[#F4B400]/30 font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#F4B400]" />
              <span>Enviar WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-[#0d1322] border border-gray-800 p-4 rounded-2xl">
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, doc, correo..."
            className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-10 pr-3.5 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Availability Filter Toggle */}
          <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800 shrink-0">
            <span className="text-[10px] font-bold uppercase text-gray-500 px-2">Disponibilidad:</span>
            <button
              onClick={() => setAvailabilityFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                availabilityFilter === 'all'
                  ? 'bg-emerald-500 text-gray-950 shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setAvailabilityFilter('available')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                availabilityFilter === 'available'
                  ? 'bg-emerald-500 text-gray-950 shadow'
                  : 'text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Disponibles ({drivers.filter(d => d.isAvailable).length})
            </button>
            <button
              onClick={() => setAvailabilityFilter('unavailable')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                availabilityFilter === 'unavailable'
                  ? 'bg-gray-800 text-white shadow'
                  : 'text-gray-400 hover:bg-gray-800/50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              No disponibles ({drivers.filter(d => !d.isAvailable).length})
            </button>
          </div>

          {/* Status Filter Toggle */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {['all', 'pending', 'approved', 'rejected', 'suspended'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-gray-950 text-gray-400 hover:bg-gray-900 border border-gray-800'
                }`}
              >
                {st === 'all'
                  ? 'Todos los Estados'
                  : st === 'pending'
                  ? 'Pendientes'
                  : st === 'approved'
                  ? 'Aprobados'
                  : st === 'rejected'
                  ? 'Rechazados'
                  : st === 'suspended'
                  ? 'Suspendidos'
                  : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drivers List Grid / Cards */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 text-xs">Cargando domiciliarios...</div>
      ) : filteredDrivers.length === 0 ? (
        <div className="bg-[#0d1322] border border-gray-850 rounded-2xl p-12 text-center text-gray-400 space-y-2">
          <Bike className="w-10 h-10 text-gray-700 mx-auto" />
          <p className="text-sm font-bold text-gray-300">No se encontraron domiciliarios</p>
          <p className="text-xs text-gray-500">Prueba ajustando los filtros de búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDrivers.map((dr) => (
            <div
              key={dr.id}
              className="bg-[#0d1322] border border-gray-800 hover:border-gray-700 rounded-2xl p-5 space-y-4 shadow-lg transition flex flex-col justify-between"
            >
              {/* Header Profile */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={dr.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(dr.firstName)}`}
                    alt="Foto Domiciliario"
                    className="w-12 h-12 rounded-xl object-cover border border-emerald-500/30 bg-gray-950"
                  />
                  <div>
                    <h3 className="text-sm font-bold text-white">{dr.firstName} {dr.lastName}</h3>
                    <span className="text-[11px] text-gray-400 block">{dr.docType}: {dr.docNumber}</span>
                    <div className="flex items-center gap-1 text-[11px] text-amber-400 mt-0.5 font-bold">
                      <Star className="w-3 h-3 fill-amber-400" />
                      <span>{dr.rating?.toFixed(1) || '5.0'} ({dr.completedDeliveriesCount || 0} entregas)</span>
                    </div>
                  </div>
                </div>

                {getStatusBadge(dr.status)}
              </div>

              {/* Details List */}
              <div className="bg-gray-950/60 border border-gray-850 p-3 rounded-xl space-y-1.5 text-xs text-gray-300">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{dr.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">{dr.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">{dr.address}, {dr.city}</span>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-gray-850 text-gray-400 text-[11px]">
                  <Bike className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    Vehículo: <strong className="text-white uppercase">{dr.vehicleType}</strong> ({dr.vehicleBrand || 'N/A'}) - Placa: <strong className="text-white">{dr.vehiclePlate || 'N/A'}</strong>
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-850/80 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 font-medium">Disponibilidad:</span>
                  {dr.isAvailable ? (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                      Disponible
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-gray-500 bg-gray-900 px-2.5 py-0.5 rounded-full border border-gray-800 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block" />
                      No disponible
                    </span>
                  )}
                </div>
              </div>

              {/* Rejection Reason display if rejected */}
              {dr.status === 'rejected' && dr.rejectionReason && (
                <div className="bg-rose-950/30 border border-rose-500/20 p-2.5 rounded-xl text-xs text-rose-300">
                  <strong>Motivo de rechazo:</strong> {dr.rejectionReason}
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-2 border-t border-gray-850 flex items-center justify-between gap-2">
                {dr.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleApprove(dr.id)}
                      disabled={actionLoading}
                      className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-black text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Aprobar</span>
                    </button>
                    <button
                      onClick={() => setRejectionTarget(dr)}
                      disabled={actionLoading}
                      className="flex-1 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-xs rounded-xl border border-rose-500/30 transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>Rechazar</span>
                    </button>
                  </>
                )}

                {dr.status === 'approved' && (
                  <button
                    onClick={() => handleSuspend(dr.id)}
                    disabled={actionLoading}
                    className="flex-1 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-bold text-xs rounded-xl border border-purple-500/30 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Suspender</span>
                  </button>
                )}

                {(dr.status === 'suspended' || dr.status === 'rejected') && (
                  <button
                    onClick={() => handleApprove(dr.id)}
                    disabled={actionLoading}
                    className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-black text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Reactivar Account</span>
                  </button>
                )}

                <button
                  onClick={() => handleDelete(dr.id)}
                  title="Eliminar domiciliario"
                  className="p-2 bg-gray-900 hover:bg-rose-950 text-gray-500 hover:text-rose-400 rounded-xl border border-gray-800 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rejection Modal */}
      {rejectionTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1322] border border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-white">Rechazar Registro de Domiciliario</h3>
            <p className="text-xs text-gray-400">
              Ingresa el motivo de rechazo para <strong>{rejectionTarget.firstName} {rejectionTarget.lastName}</strong>.
            </p>

            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ej. La foto del documento no es legible o falta la placa del vehículo."
              className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-rose-500"
            />

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setRejectionTarget(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmRejection}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl transition cursor-pointer shadow-md"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
