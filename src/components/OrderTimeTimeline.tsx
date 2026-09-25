/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OrderTimeTimeline Component
 * Visual step-by-step timeline of an order with exact timestamps, stage durations,
 * active status live elapsed tickers, and cancellation metrics.
 */

import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  PackageCheck, 
  Bike, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Calendar, 
  Timer,
  User,
  Store,
  Info
} from 'lucide-react';
import { OrderItem } from '../types';
import { 
  getOrderTimeline, 
  getActiveOrderElapsed, 
  STATUS_METADATA,
  OfficialOrderStatus 
} from '../lib/orderTimeTracking';

interface OrderTimeTimelineProps {
  order: OrderItem;
  className?: string;
}

export default function OrderTimeTimeline({ order, className = '' }: OrderTimeTimelineProps) {
  // Live ticker for active order elapsed time calculation
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    // Only tick if order is active (not delivered and not cancelled)
    const isFinished = order.status === 'delivered' || order.status === 'cancelled';
    if (isFinished) return;

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 15000); // Update every 15s

    return () => clearInterval(interval);
  }, [order.status]);

  const timeline = getOrderTimeline(order);
  const activeElapsed = getActiveOrderElapsed(order, nowMs);

  const getStepIcon = (status: OfficialOrderStatus, isCurrent: boolean, isCompleted: boolean) => {
    switch (status) {
      case 'pending':
        return <Clock className={`w-4 h-4 ${isCurrent ? 'animate-pulse text-amber-400' : isCompleted ? 'text-amber-300' : 'text-gray-500'}`} />;
      case 'processing':
        return <PackageCheck className={`w-4 h-4 ${isCurrent ? 'animate-bounce text-sky-400' : isCompleted ? 'text-sky-300' : 'text-gray-500'}`} />;
      case 'shipped':
        return <Bike className={`w-4 h-4 ${isCurrent ? 'animate-pulse text-purple-400' : isCompleted ? 'text-purple-300' : 'text-gray-500'}`} />;
      case 'delivered':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'restaurant': return 'Restaurante';
      case 'driver': return 'Domiciliario';
      case 'customer': return 'Cliente';
      case 'admin': return 'Administrador';
      case 'system': return 'Sistema';
      default: return role || 'Sistema';
    }
  };

  return (
    <div className={`p-4 bg-gray-900/70 border border-gray-800 rounded-2xl space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-white">
              Medición de Tiempos y Estados
            </h4>
            <p className="text-[10px] text-gray-400">
              Historial cronológico de cambios de estado del pedido
            </p>
          </div>
        </div>

        {/* Active live ticker badge */}
        {activeElapsed && (
          <div className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 border shadow-sm ${
            activeElapsed.urgencyLevel === 'critical'
              ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
              : activeElapsed.urgencyLevel === 'warning'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
            </span>
            <span>{activeElapsed.elapsedFormatted}</span>
          </div>
        )}
      </div>

      {/* Visual Timeline Stepper */}
      <div className="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-800">
        {timeline.steps.map((step, idx) => {
          const isLast = idx === timeline.steps.length - 1;
          const meta = STATUS_METADATA[step.status];

          return (
            <div key={idx} className="relative group">
              {/* Bullet Node */}
              <div className={`absolute -left-[24px] top-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                step.status === 'cancelled'
                  ? 'bg-red-950 border-red-500 text-red-400 shadow-md shadow-red-950/50'
                  : step.isCurrent
                  ? `${meta.badgeBg} border-emerald-400 text-white shadow-lg ring-4 ring-emerald-500/20`
                  : step.isCompleted
                  ? 'bg-gray-900 border-gray-700 text-gray-300'
                  : 'bg-gray-950 border-gray-800 text-gray-600'
              }`}>
                {getStepIcon(step.status, step.isCurrent, step.isCompleted)}
              </div>

              {/* Step Content */}
              <div className="bg-gray-950/60 hover:bg-gray-950 border border-gray-850/80 rounded-xl p-3 transition space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-amber-300">
                      {step.timeFormatted}
                    </span>
                    <span className="text-gray-500">•</span>
                    <span className={`text-xs font-black uppercase tracking-wider ${
                      step.status === 'cancelled'
                        ? 'text-red-400'
                        : step.status === 'delivered'
                        ? 'text-emerald-400'
                        : step.status === 'processing'
                        ? 'text-sky-400'
                        : step.status === 'shipped'
                        ? 'text-purple-400'
                        : 'text-amber-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>

                  {/* Stage Duration Tag (e.g. "6 minutos en Pendiente") */}
                  {step.stageDurationFormatted && (
                    <span className="px-2 py-0.5 rounded-lg bg-gray-900 border border-gray-800 text-[10.5px] font-bold text-gray-300 font-mono">
                      ⏱️ {step.stageDurationFormatted}
                    </span>
                  )}
                </div>

                {/* Additional Note or Reason */}
                {step.note && (
                  <p className="text-[11px] text-gray-400 italic">
                    {step.note}
                  </p>
                )}

                {/* Audit Author */}
                {step.updatedByRole && (
                  <p className="text-[10px] text-gray-500 font-mono">
                    Registrado por: <strong className="text-gray-400">{getRoleLabel(step.updatedByRole)}</strong>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Box: Total Delivery Time or Time Until Cancellation */}
      {timeline.isCancelled ? (
        <div className="bg-gradient-to-r from-red-950/40 via-red-900/20 to-red-950/40 border border-red-500/30 rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-500/20 rounded-xl text-red-400">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-red-400 block">
                TIEMPO HASTA CANCELACIÓN
              </span>
              <p className="text-xs text-gray-300">
                Cancelado por: <strong className="text-white">{getRoleLabel(timeline.cancelledBy)}</strong>
                {timeline.cancellationReason && ` • Motivo: "${timeline.cancellationReason}"`}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-lg font-black font-mono text-red-400">
              {timeline.cancellationDurationFormatted}
            </span>
          </div>
        </div>
      ) : timeline.totalDurationSeconds !== undefined ? (
        <div className="bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 block">
                TIEMPO TOTAL DE ENTREGA
              </span>
              <p className="text-xs text-gray-300">
                Desde Pendiente hasta Entregado al cliente
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-lg font-black font-mono text-emerald-400">
              {timeline.totalDurationFormatted}
            </span>
          </div>
        </div>
      ) : activeElapsed ? (
        <div className="bg-gradient-to-r from-gray-900 via-indigo-950/30 to-gray-900 border border-indigo-500/30 rounded-xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400 animate-pulse">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-indigo-300 block">
                PEDIDO EN CURSO ({activeElapsed.statusLabel.toUpperCase()})
              </span>
              <p className="text-xs text-gray-300">
                Tiempo acumulado en su estado actual
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-base font-black font-mono text-amber-300">
              {activeElapsed.elapsedFormatted}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
