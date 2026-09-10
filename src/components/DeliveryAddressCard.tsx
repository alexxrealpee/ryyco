import React from 'react';
import { MapPin, Map, LocateFixed, CheckCircle2, ExternalLink, Plus, Minus } from 'lucide-react';

interface DeliveryAddressCardProps {
  address: string;
  onChangeAddress: (value: string) => void;
  coordinates?: { lat: number; lng: number; mapUrl?: string } | null;
  onOpenMapPicker: () => void;
  required?: boolean;
}

export const DeliveryAddressCard: React.FC<DeliveryAddressCardProps> = ({
  address,
  onChangeAddress,
  coordinates,
  onOpenMapPicker,
  required = true,
}) => {
  return (
    <div className="w-full rounded-2xl bg-[#090E17] border border-[#1A2333] p-3.5 sm:p-5 shadow-2xl transition-all">
      {/* 1. Header: Title & Google Maps Badge */}
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 shadow-sm shadow-red-500/10">
            <MapPin className="w-4 h-4 text-[#E63946] fill-[#E63946]" />
          </div>
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-white">
            DIRECCIÓN PARA RECIBIR TU PEDIDO {required && <span className="text-[#E63946]">*</span>}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-500/40 bg-blue-950/40 text-white shadow-sm shrink-0">
          <Map className="w-3.5 h-3.5 text-[#E63946]" />
          <span className="text-[11px] sm:text-xs font-bold text-gray-100">Google Maps</span>
        </div>
      </div>

      {/* 2. Main Input Row: Address Input + "Seleccionar en mapa" Button */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full">
        {/* Address Input Box */}
        <div className="flex-1 min-w-0 h-12 sm:h-13 bg-white rounded-2xl px-3.5 sm:px-4 flex items-center gap-2.5 sm:gap-3 shadow-inner border border-gray-200 focus-within:ring-2 focus-within:ring-[#E63946]/30 transition-all">
          <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            type="text"
            required={required}
            value={address}
            onChange={(e) => onChangeAddress(e.target.value)}
            placeholder="Ej: Calle 45 #23-12, Apto 402, Bogotá"
            className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 font-semibold text-xs sm:text-sm outline-none"
          />
        </div>

        {/* "Seleccionar en mapa" Action Button */}
        <button
          type="button"
          onClick={onOpenMapPicker}
          className="h-12 sm:h-13 px-4 sm:px-5 rounded-2xl border-2 border-[#E63946] bg-[#0E1524] hover:bg-[#162036] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-white font-bold text-xs sm:text-sm shrink-0 shadow-lg shadow-red-500/10 cursor-pointer group"
          title="Abrir mapa de Google Maps para seleccionar ubicación exacta"
        >
          <Map className="w-4 h-4 sm:w-5 sm:h-5 text-[#E63946] shrink-0 group-hover:scale-110 transition-transform" />
          <span className="whitespace-nowrap">Seleccionar en mapa</span>
        </button>
      </div>

      {/* 3. Interactive Map Preview Banner */}
      <div
        onClick={onOpenMapPicker}
        className="relative w-full h-36 sm:h-44 rounded-2xl overflow-hidden border border-[#1E283D] mt-3 cursor-pointer group select-none transition-all hover:border-[#E63946]/50 shadow-inner"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenMapPicker();
          }
        }}
        title="Haz clic para seleccionar el punto exacto en el mapa interactivo"
      >
        {/* Stylized Vector Dark Map Graphic */}
        <svg
          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-80"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 800 320"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Base Dark Map Background */}
          <rect width="800" height="320" fill="#0C1322" />

          {/* Urban Building Blocks */}
          <g fill="#141E33" opacity="0.6">
            <polygon points="40,20 160,50 140,110 20,80" />
            <polygon points="180,55 310,90 290,150 160,115" />
            <polygon points="330,95 460,130 440,190 310,155" />
            <polygon points="480,135 610,170 590,230 460,195" />
            <polygon points="630,175 760,210 740,270 610,235" />

            <polygon points="60,130 180,165 160,225 40,190" />
            <polygon points="200,170 330,205 310,265 180,230" />
            <polygon points="350,210 480,245 460,305 330,270" />

            <polygon points="220,10 350,45 330,85 200,50" />
            <polygon points="370,50 500,85 480,125 350,90" />
            <polygon points="520,90 650,125 630,165 500,130" />

            {/* Green Urban Parks */}
            <polygon points="170,120 280,150 265,195 155,165" fill="#142E28" opacity="0.9" />
            <polygon points="530,200 640,230 625,275 515,245" fill="#142E28" opacity="0.9" />
          </g>

          {/* Secondary Street Grid (Cyan-Slate) */}
          <g stroke="#263550" strokeWidth="6" strokeLinecap="round" opacity="0.85">
            <line x1="0" y1="40" x2="800" y2="250" />
            <line x1="0" y1="110" x2="800" y2="320" />
            <line x1="0" y1="180" x2="550" y2="320" />

            <line x1="160" y1="0" x2="0" y2="240" />
            <line x1="320" y1="0" x2="160" y2="320" />
            <line x1="480" y1="0" x2="320" y2="320" />
            <line x1="640" y1="0" x2="480" y2="320" />
            <line x1="800" y1="20" x2="640" y2="320" />
          </g>

          {/* Primary Avenue Highlight (Warm Amber Avenue cutting across grid) */}
          <line
            x1="310"
            y1="0"
            x2="220"
            y2="320"
            stroke="#F4B400"
            strokeWidth="10"
            strokeOpacity="0.85"
            strokeLinecap="round"
          />
          <line
            x1="310"
            y1="0"
            x2="220"
            y2="320"
            stroke="#FFE699"
            strokeWidth="2"
            strokeDasharray="8 8"
            strokeOpacity="0.9"
          />

          {/* Vignette Gradients */}
          <rect width="800" height="320" fill="url(#mapVignette)" />
          <defs>
            <radialGradient id="mapVignette" cx="50%" cy="50%" r="70%">
              <stop offset="40%" stopColor="#0B101D" stopOpacity="0" />
              <stop offset="100%" stopColor="#080C16" stopOpacity="0.75" />
            </radialGradient>
          </defs>
        </svg>

        {/* Zoom Controls Overlay (Left) */}
        <div className="absolute left-3 bottom-3 z-10 flex flex-col rounded-lg bg-[#0B0F19]/90 border border-white/10 overflow-hidden shadow-lg backdrop-blur-sm pointer-events-none">
          <div className="w-6 sm:w-7 h-6 sm:h-7 flex items-center justify-center text-white/80 font-bold text-xs border-b border-white/10">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <div className="w-6 sm:w-7 h-6 sm:h-7 flex items-center justify-center text-white/80 font-bold text-xs">
            <Minus className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Center Location Pin with Radial Glowing Pulse */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center pointer-events-none">
          {/* Outer Pulsing Radar Rings */}
          <div className="w-20 sm:w-24 h-20 sm:h-24 rounded-full bg-red-500/15 border border-red-500/30 absolute animate-ping opacity-75" />
          <div className="w-14 sm:w-16 h-14 sm:h-16 rounded-full bg-red-500/25 border border-red-500/40 absolute animate-pulse" />

          {/* Realistic Teardrop Red Pin with White Dot */}
          <div className="relative z-10 flex flex-col items-center drop-shadow-[0_8px_18px_rgba(230,57,70,0.8)] transform group-hover:scale-110 transition-transform duration-200">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#E63946] flex items-center justify-center shadow-lg border-2 border-white">
              <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" />
            </div>
            <div className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[9px] border-t-[#E63946] -mt-1" />
          </div>
        </div>

        {/* Floating Instruction Card (Right side) */}
        <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-10 max-w-[190px] sm:max-w-[260px] bg-[#0A0F1D]/90 backdrop-blur-md border border-white/10 p-2.5 sm:p-3 rounded-2xl shadow-2xl flex items-center gap-2.5 group-hover:border-[#E63946]/40 transition-all">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400 shadow-sm">
            <LocateFixed className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <p className="text-white text-[11px] sm:text-xs font-black leading-tight">
              Selecciona el punto exacto de tu ubicación
            </p>
            <p className="text-gray-400 text-[9px] sm:text-[10px] leading-tight mt-0.5 sm:mt-1">
              Así el domiciliario llegará sin inconvenientes.
            </p>
          </div>
        </div>

        {/* Interactive hover banner hint */}
        <div className="absolute inset-x-0 bottom-0 py-1 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] font-bold text-white/90 bg-black/60 px-3 py-0.5 rounded-full backdrop-blur-sm border border-white/10">
            Toca para abrir el mapa interactivo
          </span>
        </div>
      </div>

      {/* 4. Bottom Green Status Banner */}
      <div className="w-full rounded-xl sm:rounded-full bg-[#081F14] border border-emerald-500/30 px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 mt-3 shadow-inner">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 fill-emerald-500/20" />
          <span className="text-[10px] sm:text-xs text-emerald-300 font-medium truncate">
            {coordinates
              ? `Ubicación GPS fijada (${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}).`
              : 'Tu dirección quedará guardada con las coordenadas exactas de Google Maps.'}
          </span>
        </div>

        {(coordinates?.mapUrl || address) && (
          <a
            href={
              coordinates?.mapUrl ||
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
            }
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-emerald-400 hover:text-emerald-300 hover:underline font-bold text-[10px] sm:text-[11px] flex items-center gap-1 shrink-0 ml-1"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Ver enlace</span>
          </a>
        )}
      </div>
    </div>
  );
};
