import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, X, Check, Loader2 } from 'lucide-react';

interface FirstVisitAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmAddress?: (address: string, coordinates?: { lat: number; lng: number; mapUrl?: string }) => void;
}

export const FirstVisitAddressModal: React.FC<FirstVisitAddressModalProps> = ({
  isOpen,
  onClose,
  onConfirmAddress
}) => {
  const [address, setAddress] = useState<string>(() => {
    return typeof window !== 'undefined' 
      ? localStorage.getItem('ryyco_customer_delivery_address') || '' 
      : '';
  });
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number; mapUrl?: string } | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('ryyco_customer_coordinates');
        if (raw) return JSON.parse(raw);
      } catch (e) {}
    }
    return null;
  });
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus input when opened
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Browser Geolocation for Ipiales
  const handleUseCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationError('Tu navegador no admite geolocalización.');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const coords = {
          lat,
          lng,
          mapUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        };
        setCoordinates(coords);

        // Reverse geocode with server proxy
        try {
          const res = await fetch(`/api/maps/geocode?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            const data = await res.json();
            if (data.formattedAddress) {
              setAddress(data.formattedAddress);
              setIsLocating(false);
              return;
            }
          }
        } catch (e) {
          console.warn('[FirstVisitAddressModal] Reverse geocode server fetch failed, trying nominatim fallback', e);
        }

        // Fallback nominatim reverse geocode
        try {
          const nomRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
          if (nomRes.ok) {
            const data = await nomRes.json();
            const road = data.address?.road || data.address?.pedestrian || data.address?.suburb || 'Dirección detectada';
            const houseNo = data.address?.house_number ? ` #${data.address.house_number}` : '';
            const detected = `${road}${houseNo}, Ipiales`;
            setAddress(detected);
            setIsLocating(false);
            return;
          }
        } catch (e) {}

        // Default to coordinates if reverse geocode fails
        setAddress(`Ubicación GPS (${lat.toFixed(4)}, ${lng.toFixed(4)}), Ipiales`);
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError('Permiso de ubicación denegado. Por favor escribe tu dirección.');
        } else {
          setLocationError('No fue posible obtener tu ubicación exacta. Por favor escríbela.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  };

  const handleConfirm = () => {
    if (!address.trim()) {
      setLocationError('Por favor ingresa o selecciona una dirección.');
      inputRef.current?.focus();
      return;
    }

    setIsSaving(true);
    const cleaned = address.trim();
    const formatted = cleaned.toLowerCase().includes('ipiales')
      ? cleaned
      : `${cleaned}, Ipiales`;

    // Persist in localStorage
    localStorage.setItem('ryyco_customer_delivery_address', formatted);
    localStorage.setItem('ryyco_first_address_completed', 'true');
    if (coordinates) {
      localStorage.setItem('ryyco_customer_coordinates', JSON.stringify(coordinates));
    }

    // Dispatch global event for all views to react
    window.dispatchEvent(new CustomEvent('ryyco:address-updated', {
      detail: {
        address: formatted,
        coordinates: coordinates || {
          lat: 0.8295,
          lng: -77.6444,
          mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatted)}`
        }
      }
    }));

    if (onConfirmAddress) {
      onConfirmAddress(formatted, coordinates || undefined);
    }

    setTimeout(() => {
      setIsSaving(false);
      onClose();
    }, 200);
  };

  const handleSkip = () => {
    localStorage.setItem('ryyco_first_address_completed', 'true');
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-visit-address-title"
    >
      <div 
        className="bg-[#111827] text-white rounded-[32px] sm:rounded-[36px] shadow-2xl p-6 sm:p-8 max-w-[440px] w-full relative text-center border border-[#232B3A] overflow-hidden animate-in zoom-in-95 duration-200 shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-full text-[#A9B2C3] hover:text-white hover:bg-[#232B3A] transition cursor-pointer"
          title="Omitir por ahora"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 3D Isometric House with Red Map Pin Illustration */}
        <div className="flex justify-center mb-1 pt-4 sm:pt-5">
          <style>{`
            @keyframes ryycoPinFloat {
              0%, 100% {
                transform: translateY(-14px);
              }
              50% {
                transform: translateY(-38px);
              }
            }
            @keyframes ryycoShadowPulse {
              0%, 100% {
                transform: scale(1);
                opacity: 0.35;
              }
              50% {
                transform: scale(0.65);
                opacity: 0.14;
              }
            }
            .animate-ryyco-pin {
              animation: ryycoPinFloat 2.6s ease-in-out infinite;
            }
            .animate-ryyco-shadow {
              transform-origin: 108px 74px;
              animation: ryycoShadowPulse 2.6s ease-in-out infinite;
            }
          `}</style>
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center">
            {/* Subtle glow behind house */}
            <div className="absolute inset-0 bg-[#E63946]/15 rounded-full blur-2xl pointer-events-none" />
            <svg 
              viewBox="0 -60 200 260" 
              className="w-full h-full drop-shadow-md select-none relative z-10 overflow-visible" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Pin drop shadow on roof - stays grounded on roof with subtle pulse */}
              <ellipse cx="108" cy="74" rx="9" ry="3" fill="#000000" className="animate-ryyco-shadow" />

              {/* Floating Red Pin with Smooth Safe Motion (no clipping) */}
              <g className="animate-ryyco-pin">
                {/* Map Pin Base Dot */}
                <circle cx="108" cy="62" r="3.5" fill="#E63946" />

                {/* Main Red Location Pin Body */}
                <path 
                  d="M108 18 C94 18 84 28 84 41 C84 56 104 70 108 72 C112 70 132 56 132 41 C132 28 122 18 108 18 Z" 
                  fill="url(#redPinGradient)" 
                  stroke="#B71C1C" 
                  strokeWidth="1.5"
                />

                {/* Pin White Inner Circle */}
                <circle cx="108" cy="39" r="8" fill="#FFFFFF" />

                {/* Subtle highlight sheen on pin */}
                <ellipse cx="102" cy="30" rx="3.5" ry="6" fill="#FF8A80" opacity="0.65" transform="rotate(-25 102 30)" />
              </g>

              {/* Isometric Green Grass Lawn Tile */}
              <path 
                d="M100 135 L165 102 L100 68 L35 102 Z" 
                fill="#8BC34A" 
              />
              <path 
                d="M35 102 L100 135 L100 148 L35 115 Z" 
                fill="#689F38" 
              />
              <path 
                d="M100 135 L165 102 L165 115 L100 148 Z" 
                fill="#558B2F" 
              />

              {/* Isometric House Body: Left Lit Wall (White/Off-white) */}
              <path 
                d="M62 108 L98 126 L98 84 L62 66 Z" 
                fill="#FFFFFF" 
              />

              {/* Isometric House Body: Right Shaded Wall */}
              <path 
                d="M98 126 L138 106 L138 64 L98 84 Z" 
                fill="#ECEFF1" 
              />

              {/* Front Wooden Door on Left Wall */}
              <path 
                d="M72 113 L86 120 L86 96 L72 89 Z" 
                fill="#8D6E63" 
              />
              <path 
                d="M74 112 L84 117 L84 98 L74 93 Z" 
                fill="#6D4C41" 
              />
              {/* Door handle */}
              <circle cx="82" cy="108" r="1" fill="#FFD54F" />

              {/* Window on Right Wall */}
              <path 
                d="M110 93 L126 85 L126 73 L110 81 Z" 
                fill="#80DEEA" 
                stroke="#B0BEC5" 
                strokeWidth="1"
              />
              <line x1="118" y1="89" x2="118" y2="77" stroke="#FFFFFF" strokeWidth="1" />
              <line x1="110" y1="87" x2="126" y2="79" stroke="#FFFFFF" strokeWidth="1" />

              {/* Isometric Pitched Roof: Left Slope (Medium Slate-Blue) */}
              <path 
                d="M54 70 L98 92 L108 48 L64 26 Z" 
                fill="#455A64" 
              />
              {/* Isometric Pitched Roof: Right Slope (Dark Slate-Blue) */}
              <path 
                d="M98 92 L146 68 L156 24 L108 48 Z" 
                fill="#37474F" 
              />
              {/* Roof Ridge Peak Line */}
              <line x1="64" y1="26" x2="108" y2="48" stroke="#78909C" strokeWidth="2" strokeLinecap="round" />
              <line x1="108" y1="48" x2="156" y2="24" stroke="#546E7A" strokeWidth="1.5" strokeLinecap="round" />

              {/* Gradients */}
              <defs>
                <linearGradient id="redPinGradient" x1="84" y1="18" x2="132" y2="72" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FF4D5E" />
                  <stop offset="0.5" stopColor="#E63946" />
                  <stop offset="1" stopColor="#B71C1C" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 
          id="first-visit-address-title"
          className="text-[22px] sm:text-[25px] font-black text-white tracking-tight leading-tight mt-3 mb-2"
        >
          Ingresa tu dirección en Ipiales:
        </h2>

        {/* Subtitle */}
        <p className="text-[#A9B2C3] text-sm sm:text-base font-normal leading-relaxed mb-5 max-w-xs sm:max-w-sm mx-auto">
          Mejor servicio, entregas más rápidas y los precios más convenientes!
        </p>

        {/* Input Box with Clickable MapPin Icon */}
        <div className="relative mb-3 text-left">
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="absolute left-3 p-1.5 rounded-xl text-[#E63946] hover:text-[#ff4d5e] hover:bg-[#E63946]/15 active:scale-90 transition cursor-pointer z-10 flex items-center justify-center disabled:opacity-50"
              title="Obtener mi ubicación actual"
              aria-label="Usar mi ubicación actual"
            >
              {isLocating ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#E63946]" />
              ) : (
                <MapPin className="w-5 h-5 fill-[#E63946]/20 hover:fill-[#E63946]/40 transition" />
              )}
            </button>
            <input
              ref={inputRef}
              type="text"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setLocationError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder="Escribe la dirección de entrega"
              className="w-full bg-[#090B12] hover:bg-[#0d101a] focus:bg-[#090B12] text-white font-semibold text-sm sm:text-base rounded-2xl pl-12 pr-10 py-3.5 sm:py-4 border border-[#232B3A] focus:border-[#E63946] focus:ring-4 focus:ring-[#E63946]/20 outline-none transition-all placeholder:text-[#6B7280] shadow-inner"
            />
            {address && (
              <button
                type="button"
                onClick={() => {
                  setAddress('');
                  setCoordinates(null);
                  inputRef.current?.focus();
                }}
                className="absolute right-3.5 p-1 rounded-full text-[#A9B2C3] hover:text-white hover:bg-[#232B3A] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Location Error Display */}
        {locationError && (
          <p className="text-xs text-[#E63946] font-semibold mb-3 text-center bg-[#E63946]/10 border border-[#E63946]/20 rounded-xl py-2 px-3">
            {locationError}
          </p>
        )}

        {/* Use My Current Location Action Button */}
        <div className="flex justify-center mb-4">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="inline-flex items-center justify-center gap-2 text-[#E63946] hover:text-[#ff5c6b] font-bold text-sm sm:text-base py-2.5 px-4 rounded-xl hover:bg-[#E63946]/10 active:scale-95 transition cursor-pointer disabled:opacity-50"
          >
            {isLocating ? (
              <Loader2 className="w-4 h-4 text-[#E63946] animate-spin" />
            ) : (
              <Navigation className="w-4 h-4 fill-[#E63946] rotate-45" />
            )}
            <span>{isLocating ? 'Detectando ubicación en Ipiales...' : 'Usar mi ubicación actual'}</span>
          </button>
        </div>

        {/* Confirm and Continue Button */}
        {address.trim().length > 0 && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving}
            className="w-full bg-[#E63946] hover:bg-[#d62839] active:bg-[#b71c1c] text-white font-extrabold text-sm sm:text-base py-3.5 px-6 rounded-2xl shadow-lg shadow-[#E63946]/30 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 mb-2 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Guardando dirección...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Confirmar y Continuar</span>
              </>
            )}
          </button>
        )}

        {/* Subtle Skip link */}
        <button
          type="button"
          onClick={handleSkip}
          className="text-xs text-[#A9B2C3] hover:text-white font-medium transition cursor-pointer py-1.5 hover:underline"
        >
          Explorar restaurantes sin dirección por ahora
        </button>
      </div>
    </div>
  );
};

export default FirstVisitAddressModal;
