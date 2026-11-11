/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  B2BPurchaseOrder,
  B2BOrderStatus,
  PaymentStatus,
  ProblemReport,
} from '../types/ryycoB2B';
import { formatCop } from '../utils/ryycoFormatters';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  Calendar,
  CreditCard,
  Check,
  X,
  History,
  Repeat,
  ChevronDown,
  Truck,
  ShieldCheck,
} from 'lucide-react';

interface OrdersManagerViewProps {
  orders: B2BPurchaseOrder[];
  onUpdateStatus: (orderId: string, newStatus: B2BOrderStatus, note?: string) => void;
  onUpdatePaymentStatus: (orderId: string, newPaymentStatus: PaymentStatus) => void;
  onProposeChanges: (
    orderId: string,
    changes: {
      totalAmountCop: number;
      shippingFeeCop: number;
      deliveryDate: string;
      reason: string;
    }
  ) => void;
  onAcceptProposedChanges: (orderId: string) => void;
  onRejectOrder: (orderId: string, reason: string) => void;
  onReportProblem: (
    orderId: string,
    report: Omit<ProblemReport, 'id' | 'createdAt' | 'status'>
  ) => void;
  onScheduleRecurring: (order: B2BPurchaseOrder) => void;
}

const STATUS_CONFIG: Record<
  B2BOrderStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  pendiente_confirmacion: {
    label: 'Pendiente de confirmación',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  propuesta_cambios: {
    label: 'Pendiente aceptación',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  confirmado: {
    label: 'Confirmado',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  en_preparacion: {
    label: 'En preparación en bodega',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
  },
  en_camino: {
    label: 'En camino',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
  },
  listo_recoger: {
    label: 'Listo para recoger',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
  },
  entregado: {
    label: 'Entregado',
    bg: 'bg-[#E8F8F0]',
    text: 'text-[#0D7A57]',
    border: 'border-[#A7E8C7]',
  },
  cancelado: {
    label: 'Cancelado',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  sin_confirmar: {
    label: 'Sin confirmar',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
  },
};

export const OrdersManagerView: React.FC<OrdersManagerViewProps> = ({
  orders,
  onUpdateStatus,
  onUpdatePaymentStatus,
  onProposeChanges,
  onAcceptProposedChanges,
  onRejectOrder,
  onReportProblem,
  onScheduleRecurring,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrderForProblem, setSelectedOrderForProblem] = useState<B2BPurchaseOrder | null>(null);
  const [selectedOrderForPropose, setSelectedOrderForPropose] = useState<B2BPurchaseOrder | null>(null);
  const [selectedOrderForReject, setSelectedOrderForReject] = useState<B2BPurchaseOrder | null>(null);
  const [expandedHistoryOrderId, setExpandedHistoryOrderId] = useState<string | null>(null);

  // Estados formulario proponer cambios
  const [propNewTotal, setPropNewTotal] = useState<number>(0);
  const [propNewShipping, setPropNewShipping] = useState<number>(0);
  const [propNewDate, setPropNewDate] = useState<string>('');
  const [propReason, setPropReason] = useState<string>('');

  // Estados formulario rechazo
  const [rejectReason, setRejectReason] = useState<string>('');

  // Estados formulario reporte de problemas
  const [problemReason, setProblemReason] = useState<ProblemReport['reason']>('faltante');
  const [problemDescription, setProblemDescription] = useState<string>('');
  const [problemSolution, setProblemSolution] = useState<ProblemReport['solutionRequested']>('reposicion');

  // Órdenes de compra corporativas exclusivas de Cloud Firestore
  const effectiveOrders: B2BPurchaseOrder[] = orders;

  const filteredOrders = effectiveOrders.filter((o) =>
    statusFilter === 'all' ? true : o.status === statusFilter
  );

  const handleOpenPropose = (ord: B2BPurchaseOrder) => {
    setSelectedOrderForPropose(ord);
    setPropNewTotal(ord.totalAmountCop);
    setPropNewShipping(ord.shippingFeeCop);
    setPropNewDate(ord.deliveryDate);
    setPropReason('');
  };

  const handleConfirmPropose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForPropose || !propReason.trim()) return;
    onProposeChanges(selectedOrderForPropose.id, {
      totalAmountCop: Number(propNewTotal),
      shippingFeeCop: Number(propNewShipping),
      deliveryDate: propNewDate,
      reason: propReason.trim(),
    });
    setSelectedOrderForPropose(null);
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForReject || !rejectReason.trim()) return;
    onRejectOrder(selectedOrderForReject.id, rejectReason.trim());
    setSelectedOrderForReject(null);
  };

  const handleConfirmProblem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForProblem || !problemDescription.trim()) return;
    onReportProblem(selectedOrderForProblem.id, {
      orderId: selectedOrderForProblem.id,
      reason: problemReason,
      description: problemDescription.trim(),
      solutionRequested: problemSolution,
    });
    setSelectedOrderForProblem(null);
    setProblemDescription('');
  };

  return (
    <div className="space-y-6">
      {/* Header oficial del mockup */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-950 font-display tracking-tight">
            Mis pedidos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Consulta entregas, pagos y el historial de tus compras.
          </p>
        </div>

        {/* Filtros por estado */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto appearance-none bg-[#111827] text-white text-xs font-semibold px-4 py-2.5 pr-9 rounded-xl focus:outline-none cursor-pointer shadow-xs"
          >
            <option value="all">Todos los estados ({effectiveOrders.length})</option>
            <option value="pendiente_confirmacion">Pendiente de confirmación</option>
            <option value="propuesta_cambios">Propuesta de cambios</option>
            <option value="confirmado">Confirmado</option>
            <option value="en_camino">En camino</option>
            <option value="listo_recoger">Listo para recoger</option>
            <option value="entregado">Entregado</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <ChevronDown className="w-4 h-4 text-gray-300 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Lista de órdenes */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
          <Package className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="text-base font-bold text-gray-900">No hay órdenes en este estado</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Explora el Catálogo Mayorista para cotizar y comprar insumos al por mayor.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredOrders.map((ord) => {
            const stCfg = STATUS_CONFIG[ord.status] || STATUS_CONFIG.pendiente_confirmacion;
            const isHistoryExpanded = expandedHistoryOrderId === ord.id;
            const orderCodeFormatted = ord.code.startsWith('B2B-') || ord.code.startsWith('Pedido ') 
              ? ord.code 
              : `Pedido ${ord.code}`;

            return (
              <div
                key={ord.id}
                className="bg-white border border-gray-200/90 rounded-2xl sm:rounded-3xl p-5 sm:p-7 space-y-6 shadow-xs transition-shadow hover:shadow-md"
              >
                {/* Cabecera superior de la orden */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-xl sm:text-2xl font-black text-gray-950 tracking-tight font-display">
                        {orderCodeFormatted}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${stCfg.bg} ${stCfg.text} ${stCfg.border}`}
                      >
                        {stCfg.label}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                          ord.paymentStatus === 'pagado'
                            ? 'bg-[#E8F8F0] text-[#0D7A57] border-[#A7E8C7]'
                            : 'bg-[#FEF6E6] text-[#B45309] border-[#FDE68A]'
                        }`}
                      >
                        {ord.paymentStatus === 'pagado' ? 'Pagado' : 'Pago pendiente'}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-gray-500 font-medium flex flex-wrap items-center gap-2">
                      <span>Proveedor: <strong className="text-gray-800">{ord.supplierTradeName}</strong></span>
                      <span>
                        Plazo de entrega:{' '}
                        {ord.deliveryDate?.toLowerCase().includes('término') || ord.deliveryDate?.toLowerCase().includes('termino') ? (
                          <strong className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            ⚡ Al término de la distancia
                          </strong>
                        ) : (
                          <strong className="text-gray-800">{ord.deliveryDate} · {ord.deliveryTimeWindow}</strong>
                        )}
                      </span>
                    </p>
                  </div>

                  {/* Resumen Total + PIN de entrega */}
                  <div className="flex items-center justify-between sm:justify-end gap-5">
                    <div className="text-left sm:text-right">
                      <span className="text-xs text-gray-400 block font-medium">Total con transporte</span>
                      <span className="text-2xl font-black text-gray-950 font-display tabular-nums tracking-tight">
                        {formatCop(ord.totalAmountCop)}
                      </span>
                    </div>

                    {/* PIN de Entrega en contenedor amarillo oficial */}
                    <div className="bg-[#FFFBEB] border border-amber-200/90 rounded-2xl px-4 py-2.5 text-center min-w-[95px]">
                      <span className="text-[10px] text-gray-500 uppercase font-semibold block tracking-wider">
                        PIN de entrega
                      </span>
                      <span className="font-mono text-xl font-black text-amber-500 tracking-wider">
                        {ord.deliveryCode || '8644'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Banner de propuesta de cambios si existe */}
                {ord.status === 'propuesta_cambios' && ord.proposedChanges && (
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-bold text-purple-900">
                        <AlertTriangle className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>El proveedor propuso cambios para esta orden:</span>
                      </div>
                      <p className="text-purple-800 leading-relaxed">
                        Motivo: <strong className="text-purple-950 font-semibold">"{ord.proposedChanges.reason}"</strong>
                      </p>
                      <p className="text-purple-700 font-medium">
                        Nuevo valor total: <strong>{formatCop(ord.proposedChanges.totalAmountCop ?? ord.totalAmountCop)}</strong> · Fecha propuesta: <strong>{ord.proposedChanges.deliveryDate}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onAcceptProposedChanges(ord.id)}
                        className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Aceptar Cambios</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(ord.id, 'cancelado', 'Restaurante no aceptó la propuesta de cambios.')}
                        className="px-3 py-2 text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Rechazar y Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Banner de reporte de problema si existe */}
                {ord.problemReport && (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-4 text-xs">
                    <div className="space-y-0.5">
                      <span className="font-bold text-rose-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>Incidencia en revisión ({ord.problemReport.reason.replace('_', ' ')}):</span>
                      </span>
                      <p className="text-rose-800">
                        "{ord.problemReport.description}" — Solución: <strong className="capitalize">{ord.problemReport.solutionRequested}</strong>
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      {ord.problemReport.status}
                    </span>
                  </div>
                )}

                {/* Cuerpo de la orden en 2 Columnas oficiales */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                  {/* Columna Izquierda: Insumos y cantidades solicitadas */}
                  <div className="border border-gray-200/90 rounded-2xl p-5 space-y-4 bg-white">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
                        <Package className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-gray-950 text-sm">
                        Insumos y cantidades solicitadas ({ord.itemsCount || ord.items.reduce((acc, i) => acc + i.quantity, 0)})
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {ord.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 p-1">
                          <div className="flex items-center gap-3">
                            {item.productPhotoUrl ? (
                              <img
                                src={item.productPhotoUrl}
                                alt={item.productName}
                                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-gray-100 shrink-0"
                              />
                            ) : (
                              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                                <Package className="w-6 h-6" />
                              </div>
                            )}
                            <div>
                              <h4 className="font-bold text-gray-900 text-sm sm:text-base leading-tight">
                                {item.productName}
                              </h4>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {item.presentationLabel || 'Bulto'} · SKU: {item.productSku || 'N/A'}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs sm:text-sm font-semibold text-gray-700 block tabular-nums">
                              {item.quantity} × {formatCop(item.unitPriceCop)}
                            </span>
                            <span className="text-sm sm:text-base font-extrabold text-[#D97706] block tabular-nums mt-0.5">
                              {formatCop(item.subtotalCop)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desglose de la orden */}
                    <div className="border-t border-gray-100 pt-3.5 space-y-1.5 text-xs sm:text-sm">
                      <p className="font-medium text-gray-500 mb-1">Desglose de la orden:</p>
                      <div className="flex justify-between items-center text-gray-700">
                        <span>Productos:</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {formatCop(ord.subtotalCop)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-gray-700">
                        <span>Transporte:</span>
                        <span className="font-semibold text-gray-900 tabular-nums">
                          {ord.shippingFeeCop === 0 ? 'Gratis' : formatCop(ord.shippingFeeCop)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                        <span className="font-bold text-gray-900">Total:</span>
                        <span className="text-base sm:text-lg font-black text-[#D97706] font-display tabular-nums">
                          {formatCop(ord.totalAmountCop)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Columna Derecha: Entrega del proveedor y Botones de acción */}
                  <div className="border border-gray-200/90 rounded-2xl p-5 space-y-5 bg-white">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-gray-950 text-sm">
                        Entrega del proveedor
                      </h3>
                    </div>

                    <div className="space-y-2 text-xs sm:text-sm text-gray-700">
                      <p>
                        <span className="text-gray-500">Modalidad:</span>{' '}
                        <span className="font-semibold text-gray-900">
                          {ord.deliveryMode === 'entrega_proveedor' ? 'Entrega del proveedor' : 'Recogida en bodega'}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-500">Responsable:</span>{' '}
                        <span className="font-semibold text-gray-900">
                          {ord.transportResponsible || 'proveedor'}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-500">Dirección:</span>{' '}
                        <span className="font-medium text-gray-800">
                          {ord.deliveryAddress || 'Carrera 6A #21-21, Ipiales, Nariño'}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-500">Medio de pago:</span>{' '}
                        <span className="font-semibold text-gray-900">
                          {ord.paymentMethod || 'Transferencia Bancolombia / Nequi'} ({ord.paymentTiming || 'contraentrega'})
                        </span>
                      </p>
                    </div>

                    {/* Botones de Acción oficiales */}
                    <div className="space-y-2.5 pt-1">
                      {/* Botón 1: Marcar pago como pagado (Rojo oficial #E52243) */}
                      <button
                        type="button"
                        onClick={() =>
                          onUpdatePaymentStatus(
                            ord.id,
                            ord.paymentStatus === 'pagado' ? 'pendiente' : 'pagado'
                          )
                        }
                        className="w-full py-3 px-4 bg-[#E52243] hover:bg-[#d01c3b] active:scale-[0.99] text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>
                          {ord.paymentStatus === 'pagado'
                            ? 'Marcar pago como pendiente'
                            : 'Marcar pago como pagado'}
                        </span>
                      </button>

                      {/* Botón 2: Programar compra (Blanco con borde) */}
                      <button
                        type="button"
                        onClick={() => onScheduleRecurring(ord)}
                        className="w-full py-2.5 px-4 bg-white hover:bg-gray-50 border border-gray-200 text-gray-900 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                      >
                        <Repeat className="w-4 h-4 text-gray-700" />
                        <span>Programar compra</span>
                      </button>

                      {/* Botón 3: Reportar (Fondo rosado suave con borde e icono alerta) */}
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForProblem(ord)}
                        className="w-full py-2 px-4 bg-[#FEF2F2] hover:bg-rose-100 border border-[#FECACA] text-[#DC2626] text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
                        <span>Reportar</span>
                      </button>

                      {/* Enlace: Ver bitácora de auditoría */}
                      <button
                        type="button"
                        onClick={() => setExpandedHistoryOrderId(isHistoryExpanded ? null : ord.id)}
                        className="w-full py-1 text-center text-xs font-semibold text-gray-500 hover:text-gray-900 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        <span>
                          {isHistoryExpanded ? 'Ocultar bitácora' : 'Ver bitácora de auditoría'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Despliegue de Historial de cambios y aceptaciones */}
                {isHistoryExpanded && (
                  <div className="p-5 bg-gray-50 border border-gray-200 rounded-2xl text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900 flex items-center gap-1.5">
                        <History className="w-4 h-4 text-amber-500" />
                        <span>Bitácora de Auditoría del Pedido</span>
                      </span>
                      <span className="font-mono text-[11px] text-gray-400 font-semibold">
                        ID: #{ord.id}
                      </span>
                    </div>

                    <div className="space-y-2.5 divide-y divide-gray-200/80">
                      {ord.history.map((h, i) => (
                        <div key={i} className="pt-2.5 flex items-start gap-3">
                          <span className="font-mono text-[11px] text-gray-400 shrink-0 font-medium">
                            {new Date(h.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <div>
                            <p className="font-bold text-gray-900">
                              {h.action}{' '}
                              <span className="capitalize text-gray-500 font-normal">
                                · por {h.actor}
                              </span>
                            </p>
                            <p className="text-gray-600 text-[11px] mt-0.5">{h.details}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Proponer Cambios (para proveedores si acceden a esta vista) */}
      {selectedOrderForPropose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg">
                Proponer Cambios al Pedido
              </h3>
              <button
                type="button"
                onClick={() => setSelectedOrderForPropose(null)}
                className="text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPropose} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-gray-700">Motivo del ajuste *</label>
                <textarea
                  value={propReason}
                  onChange={(e) => setPropReason(e.target.value)}
                  placeholder="Ej: Ajuste por pesaje real en báscula (-2kg en bulto de papa)..."
                  rows={3}
                  required
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#E52243]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-gray-700">Nuevo total (COP)</label>
                  <input
                    type="number"
                    value={propNewTotal}
                    onChange={(e) => setPropNewTotal(Number(e.target.value))}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#E52243]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-gray-700">Flete / Transporte (COP)</label>
                  <input
                    type="number"
                    value={propNewShipping}
                    onChange={(e) => setPropNewShipping(Number(e.target.value))}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#E52243]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForPropose(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-[#E52243] hover:bg-[#d01c3b] text-white rounded-xl shadow-xs"
                >
                  Enviar Propuesta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reportar Incidencia / Problema */}
      {selectedOrderForProblem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <span>Reportar Novedad o Problema</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedOrderForProblem(null)}
                className="text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmProblem} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-gray-700">Tipo de Novedad *</label>
                <select
                  value={problemReason}
                  onChange={(e) => setProblemReason(e.target.value as any)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#E52243]"
                >
                  <option value="faltante">Faltante de producto en entrega</option>
                  <option value="diferencia_peso">Diferencia de peso con respecto al remito</option>
                  <option value="calidad">Calidad no conforme con lo acordado</option>
                  <option value="retraso">Retraso excesivo en la entrega</option>
                  <option value="otro">Otro problema logístico</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-gray-700">Descripción detallada *</label>
                <textarea
                  value={problemDescription}
                  onChange={(e) => setProblemDescription(e.target.value)}
                  placeholder="Describe exactamente qué ocurrió para que el equipo central y el proveedor resuelvan la incidencia..."
                  rows={3}
                  required
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#E52243]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-gray-700">Solución requerida *</label>
                <select
                  value={problemSolution}
                  onChange={(e) => setProblemSolution(e.target.value as any)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-[#E52243]"
                >
                  <option value="reposicion">Reposición urgente del producto faltante/dañado</option>
                  <option value="nota_credito">Nota de crédito / descuento en próxima factura</option>
                  <option value="reembolso">Reembolso del valor pagado</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForProblem(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold bg-[#E52243] hover:bg-[#d01c3b] text-white rounded-xl shadow-xs cursor-pointer"
                >
                  Radicar Reporte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
