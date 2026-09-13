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
      </div>

      {/* 2. Main Input: Address Input Box (Opens Map Picker) */}
      <div
        onClick={onOpenMapPicker}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenMapPicker();
          }
        }}
        className="w-full h-[44px] min-h-[44px] bg-white rounded-xl px-3.5 sm:px-4 flex items-center gap-2.5 shadow-inner border border-gray-200 hover:border-[#E63946]/40 focus-within:ring-2 focus-within:ring-[#E63946]/30 transition-all cursor-pointer group"
      >
        <MapPin className="w-5 h-5 text-gray-400 group-hover:text-[#E63946] shrink-0 transition-colors" />
        <input
          type="text"
          required={required}
          readOnly
          value={displayAddress}
          onClick={onOpenMapPicker}
          onChange={(e) => onChangeAddress(e.target.value)}
          placeholder={placeholder}
          className="w-full h-full bg-transparent text-gray-900 placeholder:text-gray-500 font-semibold text-xs sm:text-sm outline-none cursor-pointer select-none"
        />
      </div>
    </div>
  );
};
