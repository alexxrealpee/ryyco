/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Admin WhatsApp Drivers Dispatch Modal
 * Allows Administrator General to notify all active delivery drivers via WhatsApp
 * with rich order details, sequential sending, individual one-click links, and group broadcast.
 */

import React, { useState } from 'react';
import { 
  X, 
  MessageCircle, 
  Bike, 
  Send, 
  Copy, 
  Check, 
  ExternalLink, 
  Users, 
  AlertCircle, 
  Sparkles, 
  Clock, 
  DollarSign, 
  MapPin, 
  Store,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { DriverProfile, OrderItem, SystemSettings } from '../types';
import { 
  buildDriverOrderWhatsAppMessage, 
  buildDriverWhatsAppUrl, 
  formatPhoneDisplay,
  notifyActiveDriversViaServer
} from '../lib/whatsappDriverNotifications';

interface AdminWhatsAppDriversModalProps {
  order: OrderItem;
  activeDrivers: DriverProfile[];
  allDrivers?: DriverProfile[];
  systemSettings?: SystemSettings | null;
  onClose: () => void;
  storeNameFallback?: string;
}

export default function AdminWhatsAppDriversModal({
  order,
  activeDrivers,
  allDrivers = [],
  systemSettings,
  onClose,
  storeNameFallback
}: AdminWhatsAppDriversModalProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [showAllRegistered, setShowAllRegistered] = useState<boolean>(false);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [showMessagePreview, setShowMessagePreview] = useState<boolean>(false);
  const [notifiedDriversMap, setNotifiedDriversMap] = useState<Record<string, boolean>>({});
  const [isDispatchingAll, setIsDispatchingAll] = useState<boolean>(false);
  const [dispatchProgress, setDispatchProgress] = useState<{ current: number; total: number } | null>(null);

  const storeName = order.storeName || storeNameFallback || 'Restaurante / Tienda en RYYCO';
  const fee = order.deliveryCost || order.deliveryFee || 3000;
  const feeFormatted = `$${Number(fee).toLocaleString('es-CO')} COP`;

  // Display list: either active online drivers or all approved drivers
  const displayedDrivers = showAllRegistered 
    ? allDrivers.filter(d => d.status === 'approved') 
    : activeDrivers;

  const defaultMsg = buildDriverOrderWhatsAppMessage(
    order, 
    null, 
    storeName, 
    systemSettings?.whatsappDriverTemplate
  ) + (customNotes ? `\n\n📌 *Nota especial admin:* ${customNotes}` : '');

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(defaultMsg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendSingleDriver = (driver: DriverProfile) => {
    const personalizedMsg = buildDriverOrderWhatsAppMessage(
      order, 
      driver, 
      storeName, 
      systemSettings?.whatsappDriverTemplate
    ) + (customNotes ? `\n\n📌 *Nota especial admin:* ${customNotes}` : '');
    
    const url = buildDriverWhatsAppUrl(driver.phone, personalizedMsg);
    window.open(url, '_blank');
    
    setNotifiedDriversMap(prev => ({ ...prev, [driver.id]: true }));
    notifyActiveDriversViaServer(order, [driver], storeName);
  };

  const handleSendAllSequential = async () => {
    if (displayedDrivers.length === 0) return;
    setIsDispatchingAll(true);
    setDispatchProgress({ current: 0, total: displayedDrivers.length });

    // Notify backend
    notifyActiveDriversViaServer(order, displayedDrivers, storeName);

    for (let i = 0; i < displayedDrivers.length; i++) {
      const driver = displayedDrivers[i];
      setDispatchProgress({ current: i + 1, total: displayedDrivers.length });

      const personalizedMsg = buildDriverOrderWhatsAppMessage(
        order, 
        driver, 
        storeName, 
        systemSettings?.whatsappDriverTemplate
      ) + (customNotes ? `\n\n📌 *Nota especial admin:* ${customNotes}` : '');

      const url = buildDriverWhatsAppUrl(driver.phone, personalizedMsg);
      window.open(url, '_blank');
      setNotifiedDriversMap(prev => ({ ...prev, [driver.id]: true }));

      // Wait 1.2 seconds between tab openings to prevent browser popup suppression
      if (i < displayedDrivers.length - 1) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    setIsDispatchingAll(false);
  };

  const groupUrl = systemSettings?.driversWhatsAppGroupUrl || '';

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in text-left">
      <div className="relative max-w-xl w-full bg-gray-950 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 flex flex-col max-h-[92vh] shadow-2xl space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/10">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-white">
                  Avisar a Domiciliarios por WhatsApp
                </h3>
                <span className="px-2 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 rounded-full text-[10px] font-extrabold font-mono">
                  Pedido #{order.orderNumber || 'S/N'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Envía la alerta de entrega a los repartidores que están activos en este momento.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-gray-850 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="overflow-y-auto space-y-3.5 pr-1 text-xs">
          
          {/* Order Snapshot Card */}
          <div className="p-3.5 bg-gray-900/80 border border-gray-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-gray-400 text-[11px]">
              <span className="font-bold flex items-center gap-1.5 text-gray-300">
                <Store className="w-3.5 h-3.5 text-indigo-400" />
                {storeName}
              </span>
              <span className="font-mono text-emerald-400 font-extrabold text-xs">
                Ganancia Domicilio: {feeFormatted}
              </span>
            </div>
            <div className="flex items-start gap-1.5 text-gray-300 text-xs">
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span className="font-medium text-white">
                {order.customerAddress || 'Ipiales (Sin dirección registrada)'}
                {order.customerReference ? ` (${order.customerReference})` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-gray-800/80 text-[11px] text-gray-400">
              <span>Cliente: <strong className="text-white">{order.customerName}</strong></span>
              <span>Total Pedido: <strong className="text-white">${Number(order.totalAmount || 0).toLocaleString('es-CO')} COP</strong></span>
            </div>
          </div>

          {/* Active Drivers Status Banner */}
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 flex-wrap ${
            activeDrivers.length > 0 
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
              : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
          }`}>
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                {activeDrivers.length > 0 && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${activeDrivers.length > 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
              <div>
                <p className="font-black text-xs text-white">
                  {activeDrivers.length > 0 
                    ? `🟢 ${activeDrivers.length} Domiciliario${activeDrivers.length > 1 ? 's' : ''} Activo${activeDrivers.length > 1 ? 's' : ''} en línea`
                    : '⚠️ 0 Domiciliarios con disponibilidad activa en este momento'}
                </p>
                <p className="text-[11px] text-gray-400">
                  {activeDrivers.length > 0
                    ? 'Tienen la app abierta con el interruptor "Disponible" activado.'
                    : 'Puedes enviar la alerta al Grupo de WhatsApp o avisar a los registrados.'}
                </p>
              </div>
            </div>

            {/* Toggle show all option if no active or want to reach all */}
            {allDrivers.length > activeDrivers.length && (
              <button
                type="button"
                onClick={() => setShowAllRegistered(!showAllRegistered)}
                className="text-[11px] font-bold text-gray-300 hover:text-white underline cursor-pointer"
              >
                {showAllRegistered ? 'Ver solo activos online' : `Ver todos (${allDrivers.filter(d => d.status === 'approved').length})`}
              </button>
            )}
          </div>

          {/* Quick Actions Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Button 1: Sequential dispatch to all */}
            <button
              type="button"
              disabled={displayedDrivers.length === 0 || isDispatchingAll}
              onClick={handleSendAllSequential}
              className={`py-3 px-4 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer ${
                displayedDrivers.length > 0 && !isDispatchingAll
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-900/30'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>
                {isDispatchingAll && dispatchProgress 
                  ? `Abriendo ${dispatchProgress.current}/${dispatchProgress.total}...` 
                  : `Enviar a Todos los Activos (${displayedDrivers.length})`}
              </span>
            </button>

            {/* Button 2: Copy formatted text */}
            <button
              type="button"
              onClick={handleCopyMessage}
              className="py-3 px-4 bg-gray-900 hover:bg-gray-850 border border-gray-750 text-white rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">¡Mensaje Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-gray-300" />
                  <span>Copiar Mensaje para Difusión</span>
                </>
              )}
            </button>
          </div>

          {/* Group WhatsApp Link if configured */}
          {groupUrl && (
            <a
              href={groupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-2 text-indigo-300 hover:bg-indigo-950/60 transition"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-xs text-white">Abrir Grupo Oficial de Domiciliarios en WhatsApp</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            </a>
          )}

          {/* Optional Admin Note */}
          <div className="space-y-1">
            <label className="text-[10.5px] uppercase font-black tracking-wider text-gray-400">
              Nota o Instrucción adicional (Opcional):
            </label>
            <input
              type="text"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="Ej: Pago exacto en efectivo, llevar cambio de 50mil..."
              className="w-full bg-gray-900/90 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-emerald-500"
            />
          </div>

          {/* Message Preview Accordion */}
          <div className="border border-gray-850 rounded-2xl overflow-hidden bg-gray-900/40">
            <button
              type="button"
              onClick={() => setShowMessagePreview(!showMessagePreview)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-left text-gray-400 hover:text-white transition cursor-pointer"
            >
              <span className="text-[11px] font-bold flex items-center gap-1.5 text-gray-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Ver plantilla del mensaje de WhatsApp que se enviará
              </span>
              {showMessagePreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showMessagePreview && (
              <div className="p-3 bg-gray-950/80 border-t border-gray-850">
                <pre className="text-[10.5px] text-gray-300 font-mono whitespace-pre-wrap leading-relaxed select-all">
                  {defaultMsg}
                </pre>
              </div>
            )}
          </div>

          {/* List of Drivers with individual send buttons */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] uppercase font-black tracking-wider text-gray-400">
                {showAllRegistered ? 'Todos los Domiciliarios Registrados' : 'Domiciliarios Activos y Disponibles'} ({displayedDrivers.length})
              </span>
              <span className="text-[10px] text-gray-500">
                Click en cada botón para abrir su chat directo
              </span>
            </div>

            {displayedDrivers.length === 0 ? (
              <div className="p-6 bg-gray-900/40 border border-gray-850 rounded-2xl text-center space-y-2">
                <Bike className="w-8 h-8 text-gray-600 mx-auto" />
                <p className="text-xs text-gray-300 font-bold">No hay domiciliarios en esta lista</p>
                <p className="text-[11px] text-gray-500">
                  {showAllRegistered
                    ? 'Aún no hay repartidores aprobados en la plataforma.'
                    : 'Ningún repartidor tiene la app abierta en modo "Disponible".'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {displayedDrivers.map((driver) => {
                  const wasNotified = Boolean(notifiedDriversMap[driver.id]);
                  return (
                    <div 
                      key={driver.id}
                      className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                        wasNotified 
                          ? 'bg-emerald-950/20 border-emerald-600/40' 
                          : 'bg-gray-900/70 border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          {driver.photoURL ? (
                            <img 
                              src={driver.photoURL} 
                              alt={driver.firstName} 
                              className="w-9 h-9 rounded-xl object-cover border border-gray-700" 
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center font-bold text-white text-xs">
                              {driver.firstName?.[0] || 'D'}
                            </div>
                          )}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-950 ${driver.isAvailable ? 'bg-emerald-400' : 'bg-gray-500'}`}></span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-extrabold text-white text-xs truncate">
                              {driver.firstName} {driver.lastName}
                            </h4>
                            {driver.vehicleType && (
                              <span className="px-1.5 py-0.2 bg-gray-800 text-gray-300 rounded text-[9.5px] font-mono uppercase">
                                {driver.vehicleType} {driver.vehiclePlate ? `• ${driver.vehiclePlate}` : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 font-mono">
                            📱 {formatPhoneDisplay(driver.phone)}
                            {driver.rating ? ` • ★ ${driver.rating.toFixed(1)}` : ''}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSendSingleDriver(driver)}
                        className={`py-1.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-sm ${
                          wasNotified
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {wasNotified ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Enviado</span>
                          </>
                        ) : (
                          <>
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Enviar WA</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-800">
          <p className="text-[10.5px] text-gray-500">
            {activeDrivers.length} domiciliario{activeDrivers.length !== 1 ? 's' : ''} activo{activeDrivers.length !== 1 ? 's' : ''} en línea
          </p>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 bg-gray-850 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Listo / Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
