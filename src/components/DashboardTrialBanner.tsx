import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, ArrowRight, UploadCloud, Sparkles, MessageCircle } from 'lucide-react';
import { UserProfile } from '../types';

interface DashboardTrialBannerProps {
  profile: UserProfile;
  productsCount: number;
  onGoToPayment: () => void;
  onOpenModal: () => void;
}

export const DashboardTrialBanner: React.FC<DashboardTrialBannerProps> = ({
  profile,
  productsCount,
  onGoToPayment,
  onOpenModal
}) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({
    days: 7,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false
  });

  const isBasicTrial = (profile.subscriptionPlan === 'basico' || !profile.subscriptionPlan) && 
    (profile.subscriptionStatus === 'trial' || !profile.subscriptionStatus) &&
    productsCount > 0;

  useEffect(() => {
    if (!profile.subscriptionTrialExpires) return;

    const updateTimer = () => {
      const target = new Date(profile.subscriptionTrialExpires!).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true
        });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        isExpired: false
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [profile.subscriptionTrialExpires]);

  if (!isBasicTrial || !profile.subscriptionTrialExpires) return null;

  return (
    <div 
      id="dashboard-trial-countdown-banner"
      className={`mb-6 p-4 sm:p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
        timeLeft.isExpired
          ? 'bg-red-950/40 border-red-500/50 text-red-200'
          : 'bg-gradient-to-r from-amber-950/50 via-gray-950 to-amber-950/40 border-amber-500/40 text-amber-100 shadow-lg shadow-amber-950/30'
      }`}
    >
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className={`p-2.5 sm:p-3 rounded-xl border shrink-0 ${
            timeLeft.isExpired 
              ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-bounce' 
              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
          }`}>
            <Clock className="w-5 h-5 stroke-[2.5]" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                timeLeft.isExpired 
                  ? 'bg-red-500 text-white' 
                  : 'bg-amber-400 text-black'
              }`}>
                {timeLeft.isExpired ? 'Prueba Vencida' : 'Semana Gratuita (7 Días)'}
              </span>
              <h4 className="text-xs sm:text-sm font-black text-white tracking-tight">
                {timeLeft.isExpired 
                  ? '¡Período gratuito de 7 días finalizado!' 
                  : 'Realiza tu pago de Plan Básico y sube tu comprobante'}
              </h4>
            </div>

            <p className="text-[11px] text-gray-300 max-w-2xl leading-relaxed">
              {timeLeft.isExpired ? (
                <span className="text-red-300 font-bold">
                  Tus productos están ocultos para tus clientes. Realiza tu pago de $49.000 COP y sube el comprobante para reactivar la visualización de tu catálogo.
                </span>
              ) : (
                <span>
                  El tiempo gratuito es de <strong className="text-amber-300 font-bold">1 semana (7 días)</strong>. Al terminar el reloj en reversa, tus productos no se mostrarán a los clientes a menos que subas tu comprobante de pago del Plan Básico ($49.000 COP/mes).
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Digital Countdown Timer & CTA */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
          {!timeLeft.isExpired && (
            <div 
              onClick={onOpenModal}
              className="flex items-center justify-center gap-1.5 bg-gray-900/90 border border-gray-800 px-3.5 py-2 rounded-xl text-center cursor-pointer hover:border-amber-500/50 transition"
              title="Ver detalles de la semana gratis"
            >
              <div className="text-center min-w-[28px]">
                <span className="block text-xs font-black font-mono text-amber-300">
                  {String(timeLeft.days).padStart(2, '0')}
                </span>
                <span className="text-[8px] font-bold uppercase text-gray-500">días</span>
              </div>
              <span className="text-xs font-mono font-bold text-gray-600">:</span>
              <div className="text-center min-w-[28px]">
                <span className="block text-xs font-black font-mono text-white">
                  {String(timeLeft.hours).padStart(2, '0')}
                </span>
                <span className="text-[8px] font-bold uppercase text-gray-500">hrs</span>
              </div>
              <span className="text-xs font-mono font-bold text-gray-600">:</span>
              <div className="text-center min-w-[28px]">
                <span className="block text-xs font-black font-mono text-white">
                  {String(timeLeft.minutes).padStart(2, '0')}
                </span>
                <span className="text-[8px] font-bold uppercase text-gray-500">min</span>
              </div>
              <span className="text-xs font-mono font-bold text-gray-600">:</span>
              <div className="text-center min-w-[28px]">
                <span className="block text-xs font-black font-mono text-emerald-400 animate-pulse">
                  {String(timeLeft.seconds).padStart(2, '0')}
                </span>
                <span className="text-[8px] font-bold uppercase text-gray-500">seg</span>
              </div>
            </div>
          )}

          <a
            id="banner-whatsapp-support-btn"
            href="https://wa.me/573106502043?text=Hola%2C%20necesito%20ayuda%20con%20mi%20tienda%20y%20el%20pago%20de%20mi%20Plan%20B%C3%A1sico"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs py-2.5 px-3.5 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="Contactar soporte por WhatsApp"
          >
            <MessageCircle className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
            <span>Ayuda por WhatsApp 3106502043</span>
          </a>

          <button
            id="banner-upload-proof-btn"
            type="button"
            onClick={onGoToPayment}
            className="bg-amber-400 hover:bg-amber-300 text-black font-black text-xs py-2.5 px-4 rounded-xl shadow-md shadow-amber-500/10 transition active:scale-[0.98] flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 stroke-[2.5]" />
            <span>Subir Comprobante</span>
          </button>
        </div>
      </div>
    </div>
  );
};
