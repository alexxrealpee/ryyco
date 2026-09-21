import React from 'react';
import { MapPin } from 'lucide-react';

interface DeliveryAddressCardProps {
  address: string;
  onChangeAddress: (value: string) => void;
  coordinates?: { lat: number; lng: number; mapUrl?: string } | null;
  onSelectCoordinates?: (coords: { lat: number; lng: number; mapUrl: string }) => void;
  onOpenMapPicker: () => void;
  required?: boolean;
  placeholder?: string;
}

export const isPickupOrInvalidAddress = (addr?: string | null): boolean => {
  if (!addr) return true;
  const lower = addr.toLowerCase().trim();
  return (
    lower === '' ||
    lower.includes('recoger en') ||
    lower.includes('para llevar') ||
    lower.includes('en mesa') ||
    lower.startsWith('mesa ') ||
    lower.includes('sin costo de envío') ||
    lower.includes('restaurante / local')
  );
};

export const DeliveryAddressCard: React.FC<DeliveryAddressCardProps> = ({
  address,
  onChangeAddress,
  coordinates,
  onSelectCoordinates,
  onOpenMapPicker,
  required = true,
  placeholder = "¿A donde entregamos su pedido?",
}) => {
  const isInvalid = isPickupOrInvalidAddress(address);
  const displayAddress = isInvalid ? '' : address;

  // If previous pickup or table label was stored in address, clean it immediately
  React.useEffect(() => {
    if (address && isPickupOrInvalidAddress(address)) {
      onChangeAddress('');
    }
  }, [address, onChangeAddress]);

  return (
    <div className="w-full space-y-2">
      {/* 1. Header: Title */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-white">
            DIRECCIÓN PARA RECIBIR TU PEDIDO {required && <span className="text-[#E63946]">*</span>}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenMapPicker}
          className="text-[11px] font-bold text-[#E63946] hover:text-[#D62839] flex items-center gap-1 transition cursor-pointer"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Abrir Mapa GPS</span>
        </button>
      </div>

      {/* 2. Main Input: Directly Editable Address Input + Map Button */}
      <div className="w-full min-h-[44px] bg-white rounded-xl px-3.5 sm:px-4 py-1 flex items-center gap-2.5 shadow-inner border border-gray-200 focus-within:border-[#E63946] focus-within:ring-2 focus-within:ring-[#E63946]/20 transition-all">
        <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
        <input
          type="text"
          required={required}
          value={displayAddress}
          onChange={(e) => onChangeAddress(e.target.value)}
          placeholder={placeholder}
          className="w-full h-9 bg-transparent text-gray-900 placeholder:text-gray-400 font-semibold text-xs sm:text-sm outline-none"
        />
        <button
          type="button"
          onClick={onOpenMapPicker}
          title="Seleccionar en Google Maps"
          className="shrink-0 px-2.5 py-1.5 bg-gray-100 hover:bg-[#E63946] text-gray-700 hover:text-white rounded-lg text-[11px] font-black transition flex items-center gap-1 cursor-pointer border border-gray-200 hover:border-[#E63946]"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Mapa</span>
        </button>
      </div>
    </div>
  );
};
