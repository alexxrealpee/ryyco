import React, { useState, useRef } from 'react';
import { 
  X, 
  Download, 
  Share2, 
  Copy, 
  Check, 
  MessageCircle
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
  const [copied, setCopied] = useState(false);
  const [shareSuccessMsg, setShareSuccessMsg] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const qrRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ryyco.com';
  const cleanUser = username ? username.replace(/^@/, '') : '';
  const storeUrl = `${origin}/${cleanUser}`;
  const displayName = storeName?.trim() || cleanUser || 'Mi Tienda';
  const activeLogo = storeLogo || '/favicon.svg';

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

  const generateFullCardCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!qrRef.current) return null;
    const qrCanvas = qrRef.current.querySelector('canvas');
    if (!qrCanvas) return null;

    const width = 800;
    const height = 1060;
    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = width;
    cardCanvas.height = height;
    const ctx = cardCanvas.getContext('2d');
    if (!ctx) return null;

    // 1. Draw rounded card background (white with smooth corners)
    const radius = 54;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.quadraticCurveTo(width, 0, width, radius);
    ctx.lineTo(width, height - radius);
    ctx.quadraticCurveTo(width, height, width - radius, height);
    ctx.lineTo(radius, height);
    ctx.quadraticCurveTo(0, height, 0, height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Subtle outer card border
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 2. Draw Store Title and Username
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Store Name
    ctx.font = '900 40px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#111827';
    let displayTitle = displayName.toUpperCase();
    if (displayTitle.length > 26) {
      displayTitle = displayTitle.slice(0, 25) + '...';
    }
    ctx.fillText(displayTitle, width / 2, 85);

    // @username
    ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`@${cleanUser}`, width / 2, 135);

    // 3. Draw QR Code centered
    const qrSize = 580;
    const qrX = (width - qrSize) / 2;
    const qrY = 185;
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    // 4. Draw Divider Line
    ctx.beginPath();
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 2.5;
    ctx.moveTo(70, 830);
    ctx.lineTo(width - 70, 830);
    ctx.stroke();

    // 5. Draw Footer ("Pide en Ryyco" with icon)
    const footerY = 920;
    try {
      const iconImg = new Image();
      iconImg.crossOrigin = 'anonymous';
      await new Promise((resolve) => {
        iconImg.onload = resolve;
        iconImg.onerror = resolve;
        iconImg.src = '/favicon.svg';
      });

      if (iconImg.complete && iconImg.naturalWidth > 0) {
        const iconSize = 48;
        // Calculate text metrics to center everything
        ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const pideEnWidth = ctx.measureText('Pide en ').width;
        const ryycoWidth = ctx.measureText('Ryyco').width;
        const totalContentWidth = iconSize + 16 + pideEnWidth + ryycoWidth;
        const startX = (width - totalContentWidth) / 2;

        // Draw icon
        ctx.drawImage(iconImg, startX, footerY - iconSize / 2, iconSize, iconSize);

        // Text "Pide en "
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#111827';
        ctx.fillText('Pide en ', startX + iconSize + 16, footerY);

        // Text "Ryyco"
        ctx.fillStyle = '#fa1324';
        ctx.fillText('Ryyco', startX + iconSize + 16 + pideEnWidth, footerY);
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#111827';
        ctx.fillText('Pide en Ryyco', width / 2, footerY);
      }
    } catch {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#111827';
      ctx.fillText('Pide en Ryyco', width / 2, footerY);
    }

    return cardCanvas;
  };

  const handleShare = async () => {
    const shareText = `🍽️ ¡Hola! Conoce el menú digital y pide directo en ${displayName} a través de Ryyco:\n👉 ${storeUrl}`;
    
    // Check for native Web Share API
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const fullCard = await generateFullCardCanvas();
        let files: File[] = [];

        if (fullCard && typeof navigator.canShare === 'function') {
          try {
            const blob = await new Promise<Blob | null>((resolve) => fullCard.toBlob(resolve, 'image/png'));
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

  const downloadQrPng = async () => {
    try {
      setIsDownloading(true);
      const cardCanvas = await generateFullCardCanvas();
      if (cardCanvas) {
        const url = cardCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR_${cleanUser || 'tienda'}_Ryyco.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setShareSuccessMsg('¡Imagen QR completa descargada con éxito!');
        setTimeout(() => setShareSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Error downloading full QR card:', err);
    } finally {
      setIsDownloading(false);
    }
  };

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
        <div className="text-center mb-3">
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
            className="p-5 bg-white rounded-3xl shadow-xl relative mb-3 border border-gray-200 flex flex-col items-center justify-center transition-transform hover:scale-[1.01] w-full max-w-[280px]"
          >
            {/* Store title and username on top of card */}
            <div className="text-center mb-2.5">
              <span className="text-xs font-black text-gray-900 line-clamp-1 uppercase tracking-tight block">{displayName}</span>
              <span className="text-[10px] font-bold text-gray-500 block">@{cleanUser}</span>
            </div>

            {/* QR Canvas with store logo in center */}
            <div className="p-1 rounded-2xl bg-white">
              <QRCodeCanvas 
                value={storeUrl}
                size={200}
                fgColor="#0b0b0b"
                bgColor="#ffffff"
                level="H" 
                imageSettings={{
                  src: activeLogo,
                  height: 42,
                  width: 42,
                  excavate: true,
                }}
              />
            </div>

            {/* Powered by Ryyco Footer Badge on Card */}
            <div className="mt-3.5 pt-2.5 border-t border-gray-100 w-full flex items-center justify-center gap-2">
              <img src="/favicon.svg" alt="Ryyco" className="w-4 h-4 rounded-xs" />
              <span className="text-xs font-black text-gray-900 tracking-tight">
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

            {/* Secondary Action Row: Download Full Card PNG + Copy URL */}
            <div className="grid grid-cols-2 gap-2">
              <button 
                type="button"
                onClick={downloadQrPng}
                disabled={isDownloading}
                className="py-2.5 px-3 bg-gray-900 hover:bg-gray-850 text-gray-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition border border-gray-800 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                {isDownloading ? 'Generando...' : 'Descargar QR'}
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
