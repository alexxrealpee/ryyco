import React, { useState, useRef } from 'react';
import { 
  X, 
  Download, 
  Share2, 
  Copy, 
  Check, 
  MessageCircle, 
  ExternalLink,
  Sparkles,
  Palette
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

interface StoreQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  storeName?: string;
  storeLogo?: string;
}

export default function StoreQRModal({
  isOpen,
  onClose,
  username,
  storeName,
  storeLogo,
}: StoreQRModalProps) {
  const [qrFgColor, setQrFgColor] = useState('#0b0b0b');
  const [qrBgColor, setQrBgColor] = useState('#ffffff');
  const [logoChoice, setLogoChoice] = useState<'ryyco' | 'store' | 'none'>('ryyco');
  const [copied, setCopied] = useState(false);
  const [shareSuccessMsg, setShareSuccessMsg] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);

  const qrRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ryyco.com';
  const cleanUser = username ? username.replace(/^@/, '') : '';
  const storeUrl = `${origin}/${cleanUser}`;
  const displayName = storeName?.trim() || cleanUser || 'Mi Tienda';

  const copyUrl = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(storeUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = storeUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setShareSuccessMsg('¡Enlace copiado al portapapeles!');
      setTimeout(() => {
        setCopied(false);
        setShareSuccessMsg('');
      }, 2500);
    } catch (err) {
      console.error('Error copying URL:', err);
    }
  };

  const handleShare = async () => {
    const shareText = `🍽️ ¡Hola! Conoce el menú digital y pide directo en ${displayName} a través de Ryyco:\n👉 ${storeUrl}`;
    
    // Check for native Web Share API
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const canvas = qrRef.current?.querySelector('canvas');
        let files: File[] = [];

        if (canvas && typeof navigator.canShare === 'function') {
          try {
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (blob) {
              const file = new File([blob], `QR_${cleanUser}_Ryyco.png`, { type: 'image/png' });
              if (navigator.canShare({ files: [file] })) {
                files = [file];
              }
            }
          } catch (e) {
            console.warn('Canvas blob share not supported, falling back to text share:', e);
          }
        }

        const sharePayload: ShareData = {
          title: `${displayName} en Ryyco`,
          text: shareText,
          url: storeUrl,
          ...(files.length > 0 ? { files } : {})
        };

        await navigator.share(sharePayload);
        setShareSuccessMsg('¡Compartido con éxito!');
        setTimeout(() => setShareSuccessMsg(''), 2500);
        return;
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('Native share failed, falling back to copy:', err);
        } else {
          return;
        }
      }
    }

    // Fallback: Open WhatsApp directly or copy link
    shareOnWhatsApp();
  };

  const shareOnWhatsApp = () => {
    const message = `🍽️ ¡Hola! Visita nuestro menú digital y haz tu pedido en *${displayName}* a través de Ryyco:\n👉 ${storeUrl}\n\n¡Fácil, rápido y sin intermediarios!`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  const downloadQrPng = () => {
    if (!qrRef.current) return;
    const canvas = qrRef.current.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `QR_${cleanUser || 'tienda'}_Ryyco.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setShareSuccessMsg('¡Código QR descargado!');
      setTimeout(() => setShareSuccessMsg(''), 2500);
    }
  };

  const colorPresets = [
    { name: 'Negro', value: '#0b0b0b' },
    { name: 'Rojo Ryyco', value: '#fa1324' },
    { name: 'Esmeralda', value: '#059669' },
    { name: 'Azul', value: '#2563eb' },
    { name: 'Púrpura', value: '#7c3aed' },
  ];

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-gray-950 border border-gray-850 rounded-3xl max-w-sm w-full p-5 sm:p-6 text-gray-100 relative shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white bg-gray-900 hover:bg-gray-800 p-2 rounded-full transition cursor-pointer border border-gray-800"
          aria-label="Cerrar modal de QR"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-950/40 border border-red-800/40 rounded-full text-[10px] font-extrabold text-red-400 uppercase tracking-wider mb-2">
            <img src="/favicon.svg" alt="Ryyco" className="w-3.5 h-3.5 rounded-sm" />
            Código QR Oficial Ryyco
          </div>
          <h3 className="text-base font-black text-white">{displayName}</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Escanea con la cámara del celular para ver el menú y pedir</p>
        </div>

        {/* QR Code Card Display with Ryyco Branding */}
        <div className="flex flex-col items-center">
          <div 
            ref={qrRef} 
            className="p-5 bg-white rounded-3xl shadow-xl relative mb-3 border border-gray-200 flex flex-col items-center justify-center transition-transform hover:scale-[1.01]"
            style={{ backgroundColor: qrBgColor }}
          >
            {/* Store mini header on card */}
            <div className="text-center mb-2">
              <span className="text-[11px] font-black text-gray-900 line-clamp-1 max-w-[200px]">{displayName}</span>
              <span className="text-[9px] font-bold text-gray-500 block">@{cleanUser}</span>
            </div>

            {/* QR Canvas */}
            <div className="p-1 rounded-2xl bg-white">
              <QRCodeCanvas 
                value={storeUrl}
                size={180}
                fgColor={qrFgColor}
                bgColor={qrBgColor}
                level="H" 
                imageSettings={
                  logoChoice === 'ryyco' ? {
                    src: '/favicon.svg',
                    height: 38,
                    width: 38,
                    excavate: true,
                  } : (logoChoice === 'store' && storeLogo) ? {
                    src: storeLogo,
                    height: 38,
                    width: 38,
                    excavate: true,
                  } : undefined
                }
              />
            </div>

            {/* Powered by Ryyco Footer Badge on Card */}
            <div className="mt-3 pt-2 border-t border-gray-200/80 w-full flex items-center justify-center gap-1.5">
              <img src="/favicon.svg" alt="Ryyco" className="w-3.5 h-3.5 rounded-sm" />
              <span className="text-[10px] font-black text-gray-900 tracking-tight">
                Pide en <span className="text-[#fa1324]">Ryyco</span>
              </span>
            </div>
          </div>

          {/* Toast / Notification Banner */}
          {shareSuccessMsg && (
            <div className="w-full mb-3 py-1.5 px-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-center text-xs font-bold text-emerald-300 flex items-center justify-center gap-1.5 animate-bounce">
              <Check className="w-3.5 h-3.5" />
              {shareSuccessMsg}
            </div>
          )}

          {/* Logo Options Selector */}
          <div className="w-full bg-gray-900/90 p-3 rounded-2xl border border-gray-850 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Logo en el Centro del QR:
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {/* Option 1: Ryyco Logo */}
              <button
                type="button"
                onClick={() => setLogoChoice('ryyco')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                  logoChoice === 'ryyco' 
                    ? 'bg-red-950/60 border-red-500 text-red-300 shadow-sm' 
                    : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                <img src="/favicon.svg" alt="Ryyco" className="w-3.5 h-3.5 rounded-xs shrink-0" />
                <span>Ryyco</span>
              </button>

              {/* Option 2: Store Logo (if available) */}
              <button
                type="button"
                onClick={() => setLogoChoice('store')}
                disabled={!storeLogo}
                title={!storeLogo ? 'La tienda no tiene foto de perfil cargada' : 'Logo de la tienda'}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                  !storeLogo 
                    ? 'opacity-40 cursor-not-allowed bg-gray-950 border-gray-850 text-gray-600'
                    : logoChoice === 'store'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-sm'
                      : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {storeLogo ? (
                  <img src={storeLogo} alt="Tienda" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                ) : null}
                <span>Tienda</span>
              </button>

              {/* Option 3: None */}
              <button
                type="button"
                onClick={() => setLogoChoice('none')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer border ${
                  logoChoice === 'none' 
                    ? 'bg-gray-800 border-gray-600 text-white shadow-sm' 
                    : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>Sin Logo</span>
              </button>
            </div>
          </div>

          {/* QR Color Customizer Dropdown / Row */}
          <div className="w-full bg-gray-900/60 p-2.5 rounded-2xl border border-gray-850 mb-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px] font-bold text-gray-300">Color del QR</span>
            </div>
            
            <div className="flex items-center gap-1.5">
              {colorPresets.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setQrFgColor(c.value)}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                  className={`w-5 h-5 rounded-full transition-transform border cursor-pointer ${
                    qrFgColor === c.value ? 'scale-125 border-white shadow-md' : 'border-gray-700 hover:scale-110'
                  }`}
                />
              ))}
              <input 
                type="color"
                value={qrFgColor}
                onChange={(e) => setQrFgColor(e.target.value)}
                title="Color personalizado"
                className="w-6 h-6 bg-transparent rounded cursor-pointer border-0 ml-1"
              />
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="w-full space-y-2">
            {/* Primary Action Row: Share + WhatsApp */}
            <div className="grid grid-cols-2 gap-2">
              {/* Share Native / Fallback Button */}
              <button 
                type="button"
                onClick={handleShare}
                className="py-2.5 px-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow-lg shadow-red-950/40 cursor-pointer active:scale-98"
              >
                <Share2 className="w-4 h-4" />
                Compartir
              </button>

              {/* Direct WhatsApp Share Button */}
              <button 
                type="button"
                onClick={shareOnWhatsApp}
                className="py-2.5 px-3 bg-[#25D366] hover:bg-[#20bd5a] text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow-md cursor-pointer active:scale-98"
              >
                <MessageCircle className="w-4 h-4 text-black fill-black/10" />
                WhatsApp
              </button>
            </div>

            {/* Secondary Action Row: Download PNG + Copy URL */}
            <div className="grid grid-cols-2 gap-2">
              <button 
                type="button"
                onClick={downloadQrPng}
                className="py-2.5 px-3 bg-gray-900 hover:bg-gray-850 text-gray-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition border border-gray-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                Descargar QR
              </button>

              <button 
                type="button"
                onClick={copyUrl}
                className="py-2.5 px-3 bg-gray-900 hover:bg-gray-850 text-gray-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition border border-gray-800 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-indigo-400" />
                    Copiar URL
                  </>
                )}
              </button>
            </div>

            {/* Close Button */}
            <button 
              type="button"
              onClick={onClose}
              className="w-full py-2 bg-gray-950 hover:bg-gray-900 text-gray-400 hover:text-gray-200 font-bold text-xs rounded-xl transition border border-gray-850 cursor-pointer"
            >
              Cerrar
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
