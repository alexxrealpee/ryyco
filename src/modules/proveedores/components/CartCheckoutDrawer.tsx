/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  B2BCartItem,
  RyycoRestaurantProfile,
  RyycoSupplier,
  DeliveryMode,
} from '../types/ryycoB2B';
import { formatCop } from '../utils/ryycoFormatters';
import {
  X,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Store,
  Clock,
  Building2,
} from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import { RyycoCartBagIllustration } from './RyycoCartBagIllustration';

interface CartCheckoutDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: B2BCartItem[];
  suppliers: RyycoSupplier[];
  activeRestaurant: RyycoRestaurantProfile;
  isRestaurantLoggedIn?: boolean;
  onPromptLogin?: () => void;
  onUpdateQty: (productId: string, newQty: number) => void;
  onRemoveItem: (productId: string) => void;
  onPlaceCorporateOrder: (orderData: {
    supplierId: string;
    items: B2BCartItem[];
    deliveryMode: DeliveryMode;
    deliveryAddress: string;
    deliveryDate: string;
    deliveryTimeWindow: string;
    paymentMethod: string;
    subtotalCop: number;
    shippingFeeCop: number;
    totalAmountCop: number;
  }) => void;
}

export const CartCheckoutDrawer: React.FC<CartCheckoutDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  suppliers,
  activeRestaurant,
  isRestaurantLoggedIn = true,
  onPromptLogin,
  onUpdateQty,
  onRemoveItem,
  onPlaceCorporateOrder,
}) => {
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('entrega_proveedor');
  const [deliveryAddress, setDeliveryAddress] = useState(activeRestaurant.address);
  const [paymentMethod, setPaymentMethod] = useState('Transferencia Bancolombia / Nequi');
  const [confirmedSupplierId, setConfirmedSupplierId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Cada pedido corresponde a un proveedor
  const groupedBySupplier: Record<string, B2BCartItem[]> = cartItems.reduce(
    (acc: Record<string, B2BCartItem[]>, item) => {
      if (!acc[item.supplierId]) acc[item.supplierId] = [];
      acc[item.supplierId].push(item);
      return acc;
    },
    {} as Record<string, B2BCartItem[]>
  );

  const supplierEntries = Object.entries(groupedBySupplier);

  const handleCheckoutSupplier = (supId: string, items: B2BCartItem[]) => {
    const sup = suppliers.find((s) => s.id === supId);
    const subtotal = items.reduce((s, it) => s + it.subtotalCop, 0);
    const shipping =
      deliveryMode === 'recogida_restaurante'
        ? 0
        : sup && subtotal >= sup.freeShippingThresholdCop
        ? 0
        : sup?.baseShippingFeeCop ?? 10000;
    const total = subtotal + shipping;

    onPlaceCorporateOrder({
      supplierId: supId,
      items,
      deliveryMode,
      deliveryAddress:
        deliveryMode === 'entrega_proveedor'
          ? deliveryAddress
          : sup?.address || 'Bodega CEDI Proveedor',
      deliveryDate: 'Al término de la distancia',
      deliveryTimeWindow: sup?.deliveryTimeWindow || 'Al término de la distancia',
      paymentMethod,
      subtotalCop: subtotal,
      shippingFeeCop: shipping,
      totalAmountCop: total,
    });

    setConfirmedSupplierId(supId);
    setTimeout(() => {
      setConfirmedSupplierId(null);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      {/* Fondo clicable para cerrar */}
      <div className="fixed inset-0" onClick={onClose} aria-label="Cerrar modal" />

      {/* Drawer Container con diseño claro corporativo */}
      <div className="relative w-full max-w-xl bg-white text-gray-900 flex flex-col h-full shadow-2xl border-l border-gray-200 z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="space-y-1">
            <h3 className="text-xl sm:text-2xl font-black font-display text-gray-950 tracking-tight">
              Bolsa Corporativa de Compras
            </h3>
            <p className="text-xs text-gray-500 leading-snug">
              <span className="font-bold text-gray-800">{activeRestaurant.displayName}</span> · Cada pedido se despacha individualmente por proveedor
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#FAFBFD]">
          {supplierEntries.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center space-y-4">
              <RyycoCartBagIllustration className="w-36 h-36 mx-auto" />
              <div className="space-y-1.5">
                <h4 className="font-black text-base text-gray-950">Todo empieza con un buen insumo</h4>
                <p className="text-gray-500 text-xs max-w-xs mx-auto leading-relaxed">
                  Agrega productos desde el catálogo para armar tu pedido mayorista.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-black rounded-xl transition-all shadow-xs cursor-pointer active:scale-95"
              >
                Explorar catálogo
              </button>
            </div>
          ) : (
            supplierEntries.map(([supId, items]) => {
              const sup = suppliers.find((s) => s.id === supId);
              const subtotal = items.reduce((s, it) => s + it.subtotalCop, 0);
              const belowMin = sup ? subtotal < sup.minOrderCop : false;
              const shipping =
                deliveryMode === 'recogida_restaurante'
                  ? 0
                  : sup && subtotal >= sup.freeShippingThresholdCop
                  ? 0
                  : sup?.baseShippingFeeCop ?? 10000;
              const total = subtotal + shipping;
              const isConfirmed = confirmedSupplierId === supId;

              return (
                <div
                  key={supId}
                  className="bg-white border border-gray-200 rounded-2xl p-5 space-y-5 shadow-xs"
                >
                  {/* Cabecera del proveedor */}
                  <div className="flex items-start justify-between pb-4 border-b border-gray-100 gap-3">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                        <Building2 className="w-3 h-3 text-amber-700" />
                        <span>ORDEN SEPARADA POR PROVEEDOR</span>
                      </div>
                      <h4 className="text-lg font-black text-gray-950 tracking-tight">
                        {sup?.tradeName || 'Proveedor Mayorista'}
                      </h4>
                      <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                        <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>
                          Cierre pedidos: <strong className="text-gray-900 font-bold">{sup?.orderCutoffHour || '14:00'}</strong> · Ventana: {sup?.deliveryTimeWindow || '08:00 - 12:00'}
                        </span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-bold text-gray-400 block uppercase tracking-wider">Subtotal</span>
                      <span className="text-lg font-black text-gray-950 tabular-nums">
                        {formatCop(subtotal)}
                      </span>
                    </div>
                  </div>

                  {/* Items list */}
                  <div className="space-y-3 divide-y divide-gray-100 text-xs">
                    {items.map((it) => (
                      <div key={it.productId} className="pt-3 first:pt-0 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {it.productPhotoUrl && (
                            <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center p-1">
                              <ResilientImage
                                src={it.productPhotoUrl}
                                alt={it.productName}
                                className="w-full h-full object-contain pointer-events-none"
                              />
                            </div>
                          )}
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <p className="font-extrabold text-gray-950 truncate text-sm">{it.productName}</p>
                            <p className="text-gray-500 text-xs">
                              {it.presentationLabel} · ({formatCop(it.unitPriceCop)}/{it.salesUnit})
                            </p>
                            {it.isVariableWeight && (
                              <span className="text-amber-700 text-[11px] font-semibold flex items-center gap-1 mt-0.5">
                                * Valor estimado (peso variable)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Contador de unidades */}
                          <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 p-0.5 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => onUpdateQty(it.productId, it.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-950 hover:bg-white rounded-lg transition-colors cursor-pointer"
                              title="Disminuir cantidad"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center font-black text-gray-950 text-xs font-mono">
                              {it.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQty(it.productId, it.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-950 hover:bg-white rounded-lg transition-colors cursor-pointer"
                              title="Aumentar cantidad"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <span className="font-black text-gray-950 tabular-nums w-20 text-right text-sm">
                            {formatCop(it.subtotalCop)}
                          </span>

                          <button
                            type="button"
                            onClick={() => onRemoveItem(it.productId)}
                            className="p-1.5 text-gray-400 hover:text-[#E52243] hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar de la orden"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Validación de mínimo de pedido */}
                  {belowMin && sup && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        El pedido mínimo de este proveedor es de <strong className="font-black">{formatCop(sup.minOrderCop)}</strong>. Faltan <strong className="font-black text-[#E52243]">{formatCop(sup.minOrderCop - subtotal)}</strong> para alcanzar el mínimo.
                      </span>
                    </div>
                  )}

                  {/* Configuración de entrega de esta orden */}
                  <div className="bg-[#FAFBFD] border border-gray-200 rounded-2xl p-4 space-y-3.5 text-xs">
                    <div>
                      <label className="block text-gray-700 font-bold mb-1.5">
                        Modalidad de Entrega
                      </label>
                      <select
                        value={deliveryMode}
                        onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-xl font-medium focus:ring-2 focus:ring-[#E52243] focus:border-[#E52243] shadow-2xs text-xs cursor-pointer"
                      >
                        <option value="entrega_proveedor">Entrega del Proveedor</option>
                        <option value="recogida_restaurante">Recogida por Restaurante</option>
                      </select>
                    </div>

                    {deliveryMode === 'entrega_proveedor' && (
                      <div>
                        <label className="block text-gray-700 font-bold mb-1.5">
                          Dirección de Entrega en Cocina
                        </label>
                        <input
                          type="text"
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-xl font-medium focus:ring-2 focus:ring-[#E52243] focus:border-[#E52243] shadow-2xs text-xs"
                        />
                        {sup && (
                          <p className="text-[11px] text-gray-500 mt-1.5">
                            Zonas atendidas: <span className="font-semibold text-gray-700">{sup.servedZones.join(', ')}</span>
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-gray-700 font-bold mb-1.5">
                        Medio de Pago Aceptado
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-xl font-medium focus:ring-2 focus:ring-[#E52243] focus:border-[#E52243] shadow-2xs text-xs cursor-pointer"
                      >
                        {sup?.paymentMethodsAccepted.map((m) => (
                          <option key={m} value={m}>
                            {m} ({sup.paymentTiming})
                          </option>
                        )) || <option>Transferencia Bancolombia / Contraentrega</option>}
                      </select>
                    </div>

                    {/* Desglose total */}
                    <div className="pt-3 border-t border-gray-200 space-y-1.5 font-sans">
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>Productos:</span>
                        <span className="font-bold text-gray-800">{formatCop(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>Transporte:</span>
                        <span className="font-bold text-gray-800">
                          {shipping === 0 ? <span className="text-emerald-700 font-bold">Gratis</span> : formatCop(shipping)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline text-gray-950 font-black text-sm pt-2 border-t border-gray-200">
                        <span>Total de la Orden:</span>
                        <span className="text-[#E52243] font-black text-xl">{formatCop(total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Botón enviar pedido */}
                  {isConfirmed ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-center text-xs font-black flex items-center justify-center gap-2 shadow-2xs">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>¡Pedido enviado con éxito! Estado: Pendiente de confirmación.</span>
                    </div>
                  ) : !isRestaurantLoggedIn ? (
                    <button
                      type="button"
                      onClick={onPromptLogin}
                      className="w-full py-3.5 px-4 text-xs sm:text-sm font-black rounded-2xl transition-all shadow-xs bg-[#FACC15] hover:bg-amber-400 text-gray-950 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                    >
                      <Store className="w-4 h-4" />
                      <span>Inicia Sesión como Restaurante para Enviar</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={belowMin}
                      onClick={() => handleCheckoutSupplier(supId, items)}
                      className={`w-full py-3.5 px-4 text-sm font-black rounded-2xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99] ${
                        belowMin
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-[#E52243] hover:bg-[#C91836] text-white shadow-rose-200'
                      }`}
                    >
                      <span>Enviar Pedido a {sup?.tradeName} (Pendiente de Confirmación)</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
