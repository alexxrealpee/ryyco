/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Star, X, Check, ThumbsUp, MessageSquare, Sparkles, Bike } from 'lucide-react';
import { OrderItem } from '../types';
import { submitDriverRating } from '../lib/firebase';

interface RateDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderItem | null;
  onRatingSubmitted?: (orderId: string, stars: number) => void;
}

const QUICK_TAGS = [
  '⚡ Entrega súper rápida',
  '😊 Muy amable y respetuoso',
  '🎒 Pedido en perfecto estado',
  '📍 Encontró rápido la dirección',
  '🛵 Excelente presentación',
  '💬 Buena comunicación'
];

const STAR_LABELS: Record<number, { text: string; color: string }> = {
  1: { text: '😞 Mal servicio', color: 'text-rose-400' },
  2: { text: '😕 Regular', color: 'text-amber-400' },
  3: { text: '🙂 Buen servicio', color: 'text-amber-300' },
  4: { text: '😊 Muy buen servicio', color: 'text-amber-300' },
  5: { text: '🌟 ¡Excelente servicio y rapidez!', color: 'text-amber-300' },
};

export default function RateDriverModal({
  isOpen,
  onClose,
  order,
  onRatingSubmitted
}: RateDriverModalProps) {
  const [stars, setStars] = useState<number>(5);
  const [hoveredStars, setHoveredStars] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const driverName = order.deliveryDriverName || 'Domiciliario Ryyco';
  const driverId = order.deliveryDriverId || order.driverId || '';
  const vehicle = order.deliveryVehicle || 'moto';
  const isBike = vehicle.toLowerCase().includes('bici');

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const activeStarCount = hoveredStars || stars;
  const starInfo = STAR_LABELS[activeStarCount] || STAR_LABELS[5];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stars < 1) {
      setError('Por favor selecciona al menos 1 estrella.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const fullComment = [
        selectedTags.length > 0 ? selectedTags.join(' • ') : '',
        comment.trim()
      ].filter(Boolean).join('\n\n');

      await submitDriverRating({
        driverId: driverId,
        orderId: order.id,
        customerName: order.customerName || 'Cliente',
        storeName: order.storeName || 'Restaurante',
        stars: stars,
        comment: fullComment
      });

      setSubmitted(true);
      if (onRatingSubmitted) {
        onRatingSubmitted(order.id, stars);
      }

      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setComment('');
        setSelectedTags([]);
        setStars(5);
      }, 2200);
    } catch (err) {
      console.error('Error submitting driver rating:', err);
      setError('Hubo un problema enviando tu calificación. Inténtalo de nuevo.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-[#0F172A] border border-gray-800 rounded-3xl p-6 shadow-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow behind modal */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[#E63946]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
          title="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="py-8 text-center space-y-4 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/20">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-white">¡Gracias por tu Calificación!</h3>
              <p className="text-xs text-gray-300 max-w-xs mx-auto leading-relaxed">
                Tu opinión reconoce el gran esfuerzo de <strong className="text-white">{driverName}</strong> y nos ayuda a mantener entregas de 5 estrellas.
              </p>
            </div>

            {/* Stars summary display */}
            <div className="flex items-center justify-center gap-1.5 py-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-6 h-6 ${
                    s <= stars ? 'fill-[#F4B400] text-[#F4B400]' : 'text-gray-700'
                  }`}
                />
              ))}
            </div>

            <div className="pt-2">
              <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                ✓ Calificación registrada
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Header */}
            <div className="text-center space-y-1 pt-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-black uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Califica tu Entrega</span>
              </div>
              <h3 className="text-lg font-black text-white">
                ¿Cómo te atendió tu Domiciliario?
              </h3>
              <p className="text-xs text-gray-400">
                Tu calificación califica el servicio y la amabilidad del repartidor.
              </p>
            </div>

            {/* Courier Profile Info Card */}
            <div className="flex items-center gap-3.5 p-3.5 bg-gray-900/80 border border-gray-800 rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#E63946] to-amber-500 p-0.5 shrink-0 flex items-center justify-center shadow-md">
                <div className="w-full h-full bg-[#0B1120] rounded-[10px] flex items-center justify-center text-xl">
                  {isBike ? '🚲' : '🛵'}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-white truncate">{driverName}</h4>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                    Ryyco Driver
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                  Pedido #{order.orderNumber} • {order.storeName || 'Restaurante'}
                </p>
              </div>
            </div>

            {/* Interactive Stars Selector */}
            <div className="space-y-2 text-center py-1">
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((starIndex) => {
                  const isFilled = starIndex <= activeStarCount;
                  return (
                    <button
                      key={starIndex}
                      type="button"
                      onClick={() => setStars(starIndex)}
                      onMouseEnter={() => setHoveredStars(starIndex)}
                      onMouseLeave={() => setHoveredStars(0)}
                      className="p-1.5 rounded-xl hover:bg-white/5 active:scale-125 transition-all transform duration-150 cursor-pointer focus:outline-none"
                      title={`${starIndex} estrellas`}
                    >
                      <Star
                        className={`w-9 h-9 sm:w-10 sm:h-10 transition-colors duration-200 ${
                          isFilled
                            ? 'fill-[#F4B400] text-[#F4B400] drop-shadow-[0_2px_12px_rgba(244,180,0,0.45)]'
                            : 'text-gray-600 hover:text-gray-400'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Star descriptive state label */}
              <div className="h-5 flex items-center justify-center">
                <span className={`text-xs font-black tracking-wide ${starInfo.color} transition-all`}>
                  {starInfo.text}
                </span>
              </div>
            </div>

            {/* Quick Positive / Compliment Tags */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                ¿Qué destacarías de su servicio? (Opcional)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                        isSelected
                          ? 'bg-amber-400/20 text-amber-300 border-amber-400/60 shadow-sm shadow-amber-400/10'
                          : 'bg-gray-900/60 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-gray-200'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Comment Textarea */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                <span>Comentario o Mensaje</span>
                <span className="text-[10px] text-gray-500 lowercase">opcional</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={250}
                placeholder="Escribe un mensaje de agradecimiento o felicitación..."
                className="w-full bg-gray-900/90 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 transition resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5 text-center">
                {error}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Omitir
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-[2] py-3 bg-gradient-to-r from-amber-500 via-[#F4B400] to-amber-600 hover:opacity-95 text-gray-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Enviando...</span>
                ) : (
                  <>
                    <Star className="w-4 h-4 fill-gray-950" />
                    <span>Enviar Calificación</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
