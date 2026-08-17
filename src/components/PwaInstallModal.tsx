import React, { useState, useEffect } from 'react';
import { Store, Home, Zap, Star, Bell, Download, X, Share2, PlusSquare } from 'lucide-react';
import LinnkProIsotype from './LinnkProIsotype';

export default function PwaInstallModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already running as installed PWA standalone app
    const isAppStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes('android-app://');

    if (isAppStandalone) {
      setIsStandalone(true);
      return;
    }

    // Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Capture standard PWA beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Check if user previously dismissed recently (within 2 days)
      const dismissedTime = localStorage.getItem('pwa_modal_dismissed_time');
      if (!dismissedTime || Date.now() - parseInt(dismissedTime, 10) > 2 * 24 * 60 * 60 * 1000) {
        // Show modal after a pleasant short delay on initial load
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 2200);
        return () => clearTimeout(timer);
      }
    };

    // Global listener to manually open install modal from anywhere in the app
    const handleOpenModal = () => {
      setShowIosInstructions(false);
      setIsOpen(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('openPwaInstallModal', handleOpenModal);

    // On iOS or browsers where prompt isn't fired, auto show once if never dismissed
    const dismissedTime = localStorage.getItem('pwa_modal_dismissed_time');
    if (!dismissedTime) {
      const autoTimer = setTimeout(() => {
        setIsOpen(true);
      }, 3000);
      return () => {
        clearTimeout(autoTimer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('openPwaInstallModal', handleOpenModal);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('openPwaInstallModal', handleOpenModal);
    };
  }, []);

  const handleDismiss = (mode: 'ahora_no' | 'mas_tarde' | 'close') => {
    setIsOpen(false);
    setShowIosInstructions(false);
    // Store dismissal time
    localStorage.setItem('pwa_modal_dismissed_time', Date.now().toString());
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted PWA installation');
      }
      setDeferredPrompt(null);
      setIsOpen(false);
    } else if (isIos) {
      setShowIosInstructions(true);
    } else {
      // Fallback if browser doesn't support deferred prompt directly
      setShowIosInstructions(true);
    }
  };

  if (!isOpen || isStandalone) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-fade-in font-sans select-none">
      
      {/* Backdrop Click */}
      <div 
        className="absolute inset-0" 
        onClick={() => handleDismiss('close')} 
      />

      {/* Modal Bottom Sheet Card */}
      <div className="relative w-full max-w-md bg-white text-gray-900 rounded-t-[32px] sm:rounded-3xl shadow-2xl overflow-hidden z-10 transform transition-transform duration-300 ease-out border-t border-gray-100 sm:border-0 pb-6 pt-2 px-6">
        
        {/* Top Handle Bar for Bottom Sheet gesture look */}
        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto my-2.5 shrink-0" />

        {/* Close Button (top right) */}
        <button 
          onClick={() => handleDismiss('close')}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition cursor-pointer"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header: App Icon & Title */}
        <div className="flex items-start gap-3.5 mt-2 mb-4">
          <LinnkProIsotype size={60} roundedClassName="rounded-2xl" />

          <div className="flex flex-col pr-6">
            <h2 className="text-xl sm:text-22px font-black tracking-tight text-gray-900 leading-tight">
              Instala Ryyco<span className="text-[#E63946]"></span>
            </h2>
            <p className="text-xs sm:text-13px text-gray-500 font-medium leading-snug mt-1">
              Instala la aplicación para una experiencia más rápida y práctica.
            </p>
          </div>
        </div>

        {/* iOS Step-by-Step Instructions Overlay if requested */}
        {showIosInstructions ? (
          <div className="bg-[#FFF5F5] border border-[#E63946]/30 rounded-2xl p-4 my-4 space-y-3 animate-fade-in text-left">
            <div className="flex items-center gap-2 text-[#E63946] font-bold text-sm">
              <Share2 className="w-5 h-5 stroke-[2.5]" />
              <span>Instalación en Safari (iPhone / iPad)</span>
            </div>
            <ol className="text-xs text-gray-700 space-y-2 pl-1 list-decimal list-inside font-medium leading-relaxed">
              <li>Toca el botón <strong className="text-gray-900">Compartir</strong> <Share2 className="w-3.5 h-3.5 inline text-[#E63946]" /> en la barra inferior de Safari.</li>
              <li>Desliza hacia abajo y selecciona <strong className="text-gray-900">'Agregar a inicio'</strong> <PlusSquare className="w-3.5 h-3.5 inline text-[#E63946]" />.</li>
              <li>Confirma tocando <strong className="text-gray-900">'Agregar'</strong> en la esquina superior derecha.</li>
            </ol>
            <button
              onClick={() => setShowIosInstructions(false)}
              className="w-full text-center text-xs font-bold text-[#E63946] pt-1 hover:underline cursor-pointer"
            >
              ← Volver a los detalles
            </button>
          </div>
        ) : (
          /* Features List */
          <div className="space-y-0.5 my-3 divide-y divide-gray-100">
            
            {/* Feature 1 */}
            <div className="flex items-center gap-3.5 py-3">
              <div className="w-9 h-9 rounded-full bg-[#FFF0F2] text-[#E63946] flex items-center justify-center shrink-0">
                <Home className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-800 leading-snug">
                Acceso desde la pantalla de inicio
              </span>
            </div>

            {/* Feature 2 */}
            <div className="flex items-center gap-3.5 py-3">
              <div className="w-9 h-9 rounded-full bg-[#FFF0F2] text-[#E63946] flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-800 leading-snug">
                Carga más rápida
              </span>
            </div>

            {/* Feature 3 */}
            <div className="flex items-center gap-3.5 py-3">
              <div className="w-9 h-9 rounded-full bg-[#FFF0F2] text-[#E63946] flex items-center justify-center shrink-0">
                <Star className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-800 leading-snug">
                Mejor experiencia de uso
              </span>
            </div>

            {/* Feature 4 */}
            <div className="flex items-center gap-3.5 py-3">
              <div className="w-9 h-9 rounded-full bg-[#FFF0F2] text-[#E63946] flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-gray-800 leading-snug">
                Notificaciones de pedidos y ofertas
              </span>
            </div>

          </div>
        )}

        {/* Main Red Action Button */}
        <div className="mt-4 space-y-3">
          <button
            onClick={handleInstallClick}
            className="w-full bg-[#E63946] hover:bg-[#d62839] active:scale-[0.99] text-white font-extrabold text-base py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-[#E63946]/35 transition duration-150 cursor-pointer"
          >
            <Download className="w-5 h-5 stroke-[2.8]" />
            <span>Instalar</span>
          </button>

          {/* Sub-actions Footer Links */}
          <div className="flex items-center justify-between px-6 pt-1">
            <button
              onClick={() => handleDismiss('ahora_no')}
              className="text-xs sm:text-sm font-bold text-[#E63946] hover:text-[#B71C1C] transition cursor-pointer"
            >
              Ahora no
            </button>

            <button
              onClick={() => handleDismiss('mas_tarde')}
              className="text-xs sm:text-sm font-bold text-[#E63946] hover:text-[#B71C1C] transition cursor-pointer"
            >
              Más tarde
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
