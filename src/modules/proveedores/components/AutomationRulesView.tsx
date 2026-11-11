/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  B2BRecurringSchedule,
  SupplierProduct,
  RyycoRestaurantProfile,
  ScheduleFrequency,
} from '../types/ryycoB2B';
import { formatCop } from '../utils/ryycoFormatters';
import {
  Repeat,
  Plus,
  Play,
  Pause,
  SkipForward,
  Trash2,
  Calendar,
  AlertCircle,
  Package,
  CheckCircle2,
  ShoppingCart,
  FileCheck2,
  ChevronRight,
  ChevronDown,
  X,
  Minus,
  Sparkles,
} from 'lucide-react';

interface AutomationRulesViewProps {
  schedules: B2BRecurringSchedule[];
  products: SupplierProduct[];
  activeRestaurant: RyycoRestaurantProfile;
  onToggleStatus: (scheduleId: string, nextStatus: 'activo' | 'pausado' | 'cancelado') => void;
  onSkipNextDelivery: (scheduleId: string) => void;
  onCreateSchedule: (newSch: Omit<B2BRecurringSchedule, 'id' | 'createdAt'>) => void;
  onGenerateOrderNow: (scheduleId: string) => void;
}

export const AutomationRulesView: React.FC<AutomationRulesViewProps> = ({
  schedules,
  products,
  activeRestaurant,
  onToggleStatus,
  onSkipNextDelivery,
  onCreateSchedule,
  onGenerateOrderNow,
}) => {
  // Insumos disponibles exclusivamente desde Cloud Firestore
  const effectiveProducts: SupplierProduct[] = React.useMemo(() => {
    const seen = new Set<string>();
    return products.filter((p) => {
      const key = p.id || `${p.supplierId}-${p.sku || p.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [products]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(
    effectiveProducts[0]?.id || ''
  );
  const [quantity, setQuantity] = useState(2);
  const [frequency, setFrequency] = useState<ScheduleFrequency>('semanal');
  const [firstDate, setFirstDate] = useState('2026-11-03');
  const [deliveryMode, setDeliveryMode] = useState<'entrega_proveedor' | 'recogida_restaurante'>('entrega_proveedor');
  const [deliveryAddress, setDeliveryAddress] = useState(activeRestaurant.address || 'Dirección Comercial, Ipiales');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const selectedProduct = effectiveProducts.find((p) => p.id === selectedProductId) || effectiveProducts[0];
  const unitPrice = selectedProduct?.priceCop || 25000;
  const estimatedSubtotal = unitPrice * quantity;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    onCreateSchedule({
      restaurantUid: activeRestaurant.uid,
      restaurantName: activeRestaurant.displayName,
      supplierId: selectedProduct.supplierId,
      supplierTradeName: selectedProduct.supplierTradeName,
      frequency,
      firstDeliveryDate: firstDate,
      nextDeliveryDate: firstDate,
      deliveryAddress: deliveryAddress.trim() || activeRestaurant.address,
      deliveryMode,
      status: 'activo',
      skipNextDelivery: false,
      items: [
        {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          productSku: selectedProduct.sku,
          productPhotoUrl: selectedProduct.photoUrl,
          supplierId: selectedProduct.supplierId,
          supplierTradeName: selectedProduct.supplierTradeName,
          presentationLabel: selectedProduct.presentationLabel,
          salesUnit: selectedProduct.salesUnit,
          baseUnit: selectedProduct.baseUnit,
          baseUnitQuantity: selectedProduct.baseUnitQuantity,
          unitPriceCop: unitPrice,
          quantity,
          subtotalCop: estimatedSubtotal,
          equivalentGroupKey: selectedProduct.equivalentGroupKey,
        },
      ],
      estimatedTotalCop: estimatedSubtotal,
    });

    setShowCreateModal(false);
    setActionSuccessMsg('Programación de compra recurrente creada con éxito.');
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  const handleRunOrderNow = (sch: B2BRecurringSchedule) => {
    onGenerateOrderNow(sch.id);
    setActionSuccessMsg(`Se generó un nuevo pedido pendiente para "${sch.supplierTradeName}" sujeto a confirmación.`);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Oficial Compras Recurrentes */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-950 font-display tracking-tight">
            Compras recurrentes
          </h1>
          <p className="text-base font-semibold text-gray-800 mt-1">
            Organiza el abastecimiento de tu restaurante.
          </p>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Programa entregas semanales, quincenales o mensuales.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#E52243] hover:bg-[#d01c3b] active:scale-[0.99] text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Programar compra</span>
        </button>
      </div>

      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-sm shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{actionSuccessMsg}</span>
        </div>
      )}

      {/* 2. Banner de Advertencia Amarillo Oficial */}
      <div className="bg-[#FEF9EE] border border-[#FDE68A] rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-xs">
        <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
          <AlertCircle className="w-4 h-4" />
        </div>
        <div className="space-y-0.5">
          <h4 className="font-bold text-gray-900 text-sm">
            Cada entrega requiere confirmación
          </h4>
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            Programar no reserva inventario ni congela precios. Antes de cada entrega, el proveedor confirma disponibilidad y tú aceptas el valor final.
          </p>
        </div>
      </div>

      {/* 3. Área Principal: Estado Vacío o Lista de Programaciones */}
      {schedules.length === 0 ? (
        <div className="bg-white border border-gray-200/90 rounded-3xl p-8 sm:p-14 text-center space-y-6 shadow-xs">
          {/* Gráfico Ilustrado de Calendario con Sincronización Roja y Destellos */}
          <div className="relative inline-flex items-center justify-center mx-auto my-2">
            <div className="relative">
              {/* Calendario 3D SVG Vectorial */}
              <div className="w-36 h-32 sm:w-44 sm:h-36 bg-gradient-to-b from-gray-50 to-gray-100 border border-gray-200/90 rounded-2xl shadow-lg relative p-3 flex flex-col justify-between">
                {/* Cabecera roja del calendario */}
                <div className="absolute -top-3 left-3 right-3 h-6 bg-[#E52243] rounded-t-xl flex items-center justify-around px-4">
                  <div className="w-2.5 h-4 bg-gray-200 rounded-full border border-gray-300 -mt-2"></div>
                  <div className="w-2.5 h-4 bg-gray-200 rounded-full border border-gray-300 -mt-2"></div>
                </div>

                {/* Cuadrícula de días */}
                <div className="pt-4 grid grid-cols-4 gap-2">
                  <div className="h-4 bg-gray-200/80 rounded-md"></div>
                  <div className="h-4 bg-gray-200/80 rounded-md"></div>
                  <div className="h-4 bg-[#E52243] rounded-md"></div>
                  <div className="h-4 bg-gray-200/80 rounded-md"></div>
                  <div className="h-4 bg-gray-200/80 rounded-md"></div>
                  <div className="h-4 bg-gray-200/80 rounded-md"></div>
                  <div className="h-4 bg-gray-200/80 rounded-md"></div>
                  <div className="h-4 bg-gray-200/80 rounded-md"></div>
                </div>

                {/* Badge flotante circular con icono de sincronización */}
                <div className="absolute -bottom-3 -right-3 w-14 h-14 bg-[#E52243] rounded-full shadow-md flex items-center justify-center text-white border-2 border-white">
                  <Repeat className="w-7 h-7" />
                </div>
              </div>

              {/* Destellos dorados / amarillos del mockup */}
              <div className="absolute -top-2 -right-6 text-amber-400">
                <Sparkles className="w-6 h-6 fill-amber-400" />
              </div>
              <div className="absolute bottom-4 -left-6 text-amber-400">
                <Sparkles className="w-5 h-5 fill-amber-400" />
              </div>
            </div>
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-950 font-display tracking-tight">
              Aún no tienes compras programadas
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              Organiza la reposición de tus insumos habituales desde un solo lugar.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#E52243] hover:bg-[#d01c3b] active:scale-[0.99] text-white text-sm font-bold rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Programar mi primera compra</span>
            </button>
          </div>
        </div>
      ) : (
        /* Tarjetas de Programaciones Existentes */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {schedules.map((sch) => {
            const firstItem = sch.items[0];
            return (
              <div
                key={sch.id}
                className="bg-white border border-gray-200/90 rounded-2xl sm:rounded-3xl p-5 sm:p-6 space-y-5 shadow-xs hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {firstItem?.productPhotoUrl ? (
                      <img
                        src={firstItem.productPhotoUrl}
                        alt={firstItem.productName}
                        className="w-14 h-14 rounded-xl object-cover border border-gray-100"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400">
                        <Package className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-50 text-[#E52243] border border-red-200 mb-1">
                        {sch.frequency}
                      </span>
                      <h4 className="font-bold text-gray-900 text-base leading-snug">
                        {firstItem?.productName || 'Insumo recurrente'}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {sch.supplierTradeName} · {firstItem?.presentationLabel}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                      sch.status === 'activo'
                        ? 'bg-[#E8F8F0] text-[#0D7A57] border-[#A7E8C7]'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {sch.status === 'activo' ? 'Activo' : 'Pausado'}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-xl p-3.5 space-y-1.5 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span>Cantidad por ciclo:</span>
                    <strong className="text-gray-900">{firstItem?.quantity || 1} unidades</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Próxima entrega estimada:</span>
                    <strong className="text-gray-900">{sch.nextDeliveryDate}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Modalidad de despacho:</span>
                    <strong className="text-gray-900 capitalize">{sch.deliveryMode.replace('_', ' ')}</strong>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-gray-200">
                    <span className="font-bold text-gray-900">Total estimado:</span>
                    <strong className="text-[#D97706] font-bold text-sm">
                      {formatCop(sch.estimatedTotalCop)}
                    </strong>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleRunOrderNow(sch)}
                    className="flex-1 py-2 px-3 bg-[#E52243] hover:bg-[#d01c3b] text-white text-xs font-bold rounded-xl transition-colors text-center cursor-pointer"
                  >
                    Generar pedido ahora
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleStatus(sch.id, sch.status === 'activo' ? 'pausado' : 'activo')}
                    className="py-2 px-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    title={sch.status === 'activo' ? 'Pausar programación' : 'Reanudar programación'}
                  >
                    {sch.status === 'activo' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSkipNextDelivery(sch.id)}
                    className="py-2 px-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    title="Saltar próxima entrega"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleStatus(sch.id, 'cancelado')}
                    className="py-2 px-3 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    title="Eliminar programación"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Footer Educativo de 3 Pasos Oficial */}
      <div className="pt-4 border-t border-gray-200/80">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Paso 1 */}
          <div className="flex items-start gap-3.5">
            <div className="w-7 h-7 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-[#E52243] font-bold text-xs shrink-0 mt-0.5">
              1
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#E52243]" />
                <h4 className="font-bold text-gray-900 text-sm">
                  Elige insumo y frecuencia
                </h4>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Selecciona los productos que necesitas y programa entregas semanales, quincenales o mensuales.
              </p>
            </div>
          </div>

          {/* Paso 2 */}
          <div className="flex items-start gap-3.5">
            <div className="w-7 h-7 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-[#E52243] font-bold text-xs shrink-0 mt-0.5">
              2
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#E52243]" />
                <h4 className="font-bold text-gray-900 text-sm">
                  El proveedor confirma
                </h4>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Antes de cada entrega, el proveedor confirma la disponibilidad y te indica el valor final.
              </p>
            </div>
          </div>

          {/* Paso 3 */}
          <div className="flex items-start gap-3.5">
            <div className="w-7 h-7 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-[#E52243] font-bold text-xs shrink-0 mt-0.5">
              3
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#E52243]" />
                <h4 className="font-bold text-gray-900 text-sm">
                  Aceptas el valor final
                </h4>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Revisas el valor confirmado y aceptas para que se genere la orden de entrega.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Modal Oficial "Programar compra" (mockup-programar-compra-pc-celular_e2604078.png) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            {/* Cabecera del modal */}
            <div className="flex items-start justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-[#E52243]">
                  <Repeat className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-950 text-lg sm:text-xl font-display">
                    Programar compra
                  </h3>
                  <p className="text-xs text-gray-500">
                    Define qué necesitas y cuándo recibirlo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              {/* Selector de Insumo */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-800">
                  Insumo <span className="text-[#E52243]">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full appearance-none p-3 pr-10 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-[#E52243] shadow-2xs"
                  >
                    {effectiveProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.presentationLabel} · {p.supplierTradeName} ({formatCop(p.priceCop)})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Fila: Cantidad por ciclo y Frecuencia */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-gray-800">Cantidad por ciclo</label>
                  <div className="flex items-center justify-between border border-gray-200 rounded-xl p-1 bg-white shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-base text-gray-900 px-3">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-gray-800">Frecuencia</label>
                  <div className="relative">
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
                      className="w-full appearance-none p-2.5 pr-10 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-[#E52243] shadow-2xs"
                    >
                      <option value="semanal">Semanal</option>
                      <option value="quincenal">Quincenal</option>
                      <option value="mensual">Mensual</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Fila: Primera entrega y Modalidad de entrega */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-gray-800">Primera entrega</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={firstDate}
                      onChange={(e) => setFirstDate(e.target.value)}
                      className="w-full p-2.5 pr-10 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-[#E52243] shadow-2xs"
                    />
                    <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-gray-800">Modalidad de entrega</label>
                  <div className="relative">
                    <select
                      value={deliveryMode}
                      onChange={(e) => setDeliveryMode(e.target.value as any)}
                      className="w-full appearance-none p-2.5 pr-10 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-[#E52243] shadow-2xs"
                    >
                      <option value="entrega_proveedor">Entrega del proveedor</option>
                      <option value="recogida_restaurante">Recogida en bodega</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Dirección de entrega */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-800">Dirección de entrega</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Dirección Comercial, Ipiales"
                  className="w-full p-3 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium focus:outline-none focus:border-[#E52243] shadow-2xs"
                />
              </div>

              {/* Caja de Estimación de Costo Oficial */}
              <div className="bg-[#FFFDF7] border border-[#FDE68A] rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900 text-xs sm:text-sm">
                    Productos estimados por ciclo:
                  </span>
                  <span className="font-black text-amber-500 font-display text-lg sm:text-xl">
                    {formatCop(estimatedSubtotal)}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  {quantity} × {formatCop(unitPrice)} · Transporte por confirmar.
                </p>
              </div>

              {/* Aviso inferior del modal */}
              <div className="bg-[#FEF9EE] border border-[#FDE68A] rounded-xl p-3 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  No reserva inventario ni congela precios. Cada entrega requiere confirmar disponibilidad y aceptar el valor final.
                </p>
              </div>

              {/* Botones de acción del modal */}
              <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="w-full sm:w-auto py-2.5 px-5 text-gray-600 hover:text-gray-900 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto py-3 px-6 bg-[#E52243] hover:bg-[#d01c3b] active:scale-[0.99] text-white font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  Guardar programación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
