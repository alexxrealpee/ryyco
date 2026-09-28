import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Share2, 
  Download, 
  Copy, 
  Check, 
  Sparkles, 
  MessageCircle, 
  ExternalLink, 
  Image as ImageIcon, 
  Flame, 
  CheckCircle2, 
  HelpCircle,
  Smartphone,
  ChevronDown
} from 'lucide-react';
import { ProductItem, UserProfile } from '../types';

interface ReelShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductItem | null;
  profile?: UserProfile | null;
}

export const ReelShareModal: React.FC<ReelShareModalProps> = ({
  isOpen,
  onClose,
  product,
  profile,
}) => {
  const [copied, setCopied] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [isDownloadingRaw, setIsDownloadingRaw] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!isOpen || !product) return null;

  const dishImage = product.imageURL || '';
  const reelUrl = `${window.location.origin}/reels?id=${encodeURIComponent(product.id)}`;
  const storeHandle = profile?.username ? `@${profile.username}` : (product.storeUsername ? `@${product.storeUsername}` : '@ryyco');
  const storeName = profile?.displayName || product.storeName || 'Ryyco';
  const priceFormatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(product.price) || 0);

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Helper to load image through proxy to prevent CORS issues on Canvas
  const loadSafeImage = async (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        // Fallback to proxy
        const proxyImg = new Image();
        proxyImg.crossOrigin = 'anonymous';
        proxyImg.onload = () => resolve(proxyImg);
        proxyImg.onerror = reject;
        proxyImg.src = `/api/proxy-image?url=${encodeURIComponent(src)}`;
      };
      // Try direct if already same origin or data url, else proxy
      if (src.startsWith('data:') || src.startsWith('/') || src.includes(window.location.host)) {
        img.src = src;
      } else {
        img.src = `/api/proxy-image?url=${encodeURIComponent(src)}`;
      }
    });
  };

  // 1. Generate 9:16 Story Card Blob for Instagram / WhatsApp Stories
  const generateStoryCardBlob = async (): Promise<Blob | null> => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. Background gradient (Deep Dark Slate with ambient warmth)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
      bgGrad.addColorStop(0, '#090D16');
      bgGrad.addColorStop(0.3, '#131A29');
      bgGrad.addColorStop(0.7, '#111827');
      bgGrad.addColorStop(1, '#05070B');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1080, 1920);

      // 2. Ambient Food Glow behind dish
      const radialGlow = ctx.createRadialGradient(540, 920, 50, 540, 920, 600);
      radialGlow.addColorStop(0, 'rgba(230, 57, 70, 0.45)');
      radialGlow.addColorStop(0.4, 'rgba(244, 180, 0, 0.25)');
      radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 300, 1080, 1200);

      // 3. Top Header: Store Info & Ryyco Branding
      ctx.save();
      // Ryyco Header Badge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(140, 140, 800, 100, 50);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 38px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🔥 REEL GASTRONÓMICO • ${storeHandle}`, 540, 190);
      ctx.restore();

      // 4. Hero Dish Image (Centered, with rounded corners & shadow)
      if (dishImage) {
        try {
          const img = await loadSafeImage(dishImage);
          const imgSize = 880;
          const imgX = (1080 - imgSize) / 2;
          const imgY = 360;

          // Shadow
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = 60;
          ctx.shadowOffsetY = 25;

          // Clip rounded rectangle for dish image
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 56);
          ctx.fillStyle = '#1E293B';
          ctx.fill();
          ctx.restore();

          // Draw Image clipped
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 56);
          ctx.clip();

          // Calculate aspect ratio fit (cover)
          const scale = Math.max(imgSize / img.width, imgSize / img.height);
          const scaledW = img.width * scale;
          const scaledH = img.height * scale;
          const offsetX = imgX + (imgSize - scaledW) / 2;
          const offsetY = imgY + (imgSize - scaledH) / 2;
          ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);
          ctx.restore();

          // Border for the dish container
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 56);
          ctx.stroke();
          ctx.restore();
        } catch (imgErr) {
          console.warn('Could not render image onto canvas:', imgErr);
        }
      }

      // 5. Dish Details Card (Bottom Section)
      const cardY = 1320;
      ctx.save();
      // Glassmorphism background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(100, cardY, 880, 440, 48);
      ctx.fill();
      ctx.stroke();

      // Store title & verification
      ctx.fillStyle = '#F4B400';
      ctx.font = '700 32px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${storeName.toUpperCase()}`, 150, cardY + 70);

      // Dish Title (with truncation if long)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 52px system-ui, -apple-system, sans-serif';
      const maxTitleW = 780;
      let displayTitle = product.name;
      if (ctx.measureText(displayTitle).width > maxTitleW) {
        while (ctx.measureText(displayTitle + '...').width > maxTitleW && displayTitle.length > 5) {
          displayTitle = displayTitle.slice(0, -1);
        }
        displayTitle += '...';
      }
      ctx.fillText(displayTitle, 150, cardY + 145);

      // Price Tag Pill
      ctx.fillStyle = '#E63946';
      ctx.beginPath();
      ctx.roundRect(150, cardY + 195, 340, 75, 24);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 40px system-ui, -apple-system, sans-serif';
      ctx.fillText(priceFormatted, 180, cardY + 248);

      // Link Sticker Call To Action
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.roundRect(150, cardY + 310, 780, 85, 28);
      ctx.fill();

      ctx.fillStyle = '#F8FAFC';
      ctx.font = '800 34px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔗 Toca el sticker de enlace para pedir en Ryyco', 540, cardY + 364);

      ctx.restore();

      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
      });
    } catch (e) {
      console.error('Error generating story card canvas:', e);
      return null;
    }
  };

  // 2. Share directly to Instagram / WhatsApp Stories using Web Share API with image file
  const handleShareToStories = async () => {
    setIsGeneratingStory(true);
    try {
      // Always copy link to clipboard first so they have it ready for Instagram's Link Sticker
      try {
        await navigator.clipboard.writeText(reelUrl);
        setCopied(true);
      } catch (e) {}

      const blob = await generateStoryCardBlob();
      const fileName = `reel-${product.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-historia.jpg`;

      if (blob && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        const shareData = {
          title: `${product.name} • ${storeName}`,
          text: `🔥 Mira este plato en Ryyco: ${reelUrl}`,
          files: [file],
        };

        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          showFeedback('¡Listo! Enlace copiado al portapapeles para tu sticker.');
          return;
        }
      }

      // If Web Share API with files is not supported (e.g. desktop), fallback to direct download + copy link
      if (blob) {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        showFeedback('¡Tarjeta de historia descargada y enlace copiado para tu sticker!');
      } else {
        showFeedback('¡Enlace copiado al portapapeles!');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        showFeedback('Enlace copiado para tu historia.');
      }
    } finally {
      setIsGeneratingStory(false);
    }
  };

  // 3. Download the 9:16 Story Card
  const handleDownloadStoryCard = async () => {
    setIsGeneratingStory(true);
    try {
      const blob = await generateStoryCardBlob();
      if (!blob) throw new Error('No se pudo generar la imagen');

      const fileName = `historia-${product.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      // Also copy link for convenience
      try {
        await navigator.clipboard.writeText(reelUrl);
        setCopied(true);
      } catch (e) {}

      showFeedback('¡Historia 9:16 descargada! Pega el enlace en el sticker de Instagram.');
    } catch (e) {
      showFeedback('Error descargando la historia.');
    } finally {
      setIsGeneratingStory(false);
    }
  };

  // 4. Download Raw Original Dish Photo
  const handleDownloadRawImage = async () => {
    if (!dishImage) {
      showFeedback('Este plato no cuenta con foto disponible.');
      return;
    }
    setIsDownloadingRaw(true);
    try {
      const response = await fetch(
        dishImage.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(dishImage)}` : dishImage
      );
      const blob = await response.blob();
      const fileName = `plato-${product.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      showFeedback('¡Foto del plato descargada en alta resolución!');
    } catch (e) {
      // Fallback: open image in new tab
      window.open(dishImage, '_blank');
      showFeedback('Abriendo foto original...');
    } finally {
      setIsDownloadingRaw(false);
    }
  };

  // 5. Copy Link to clipboard
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(reelUrl);
      setCopied(true);
      showFeedback('¡Enlace del reel copiado! Pégalo en el sticker de tu historia.');
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      showFeedback('No se pudo copiar el enlace.');
    }
  };

  // 6. Share on WhatsApp
  const handleWhatsAppShare = () => {
    const text = `🔥 Mira este delicioso plato de *${storeName}* en Ryyco:\n*${product.name}* (${priceFormatted})\n👉 Pide aquí: ${reelUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#111827] border border-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/80 bg-gray-900/60">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#E63946] to-[#F4B400] flex items-center justify-center text-white shadow-md shadow-red-500/20">
                <Sparkles className="w-5 h-5 fill-white text-white" />
              </div>
              <div>
                <h3 className="text-base font-black text-white tracking-tight flex items-center gap-1.5">
                  Compartir en Historias
                </h3>
                <p className="text-[11px] text-gray-400 font-medium">
                  Extrae la imagen del plato para Instagram y WhatsApp
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-400 hover:text-white transition active:scale-90"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Feedback banner */}
          {feedbackMsg && (
            <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2 flex items-center gap-2 text-emerald-300 text-xs font-bold animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          {/* Scrollable Content */}
          <div className="overflow-y-auto px-5 py-4 space-y-4 max-h-[calc(92vh-140px)]">
            
            {/* Extracted Product Dish Preview */}
            <div className="bg-gradient-to-br from-gray-900 via-gray-900/90 to-black border border-white/10 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-xl relative overflow-hidden group">
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-[#E63946]/10 rounded-full blur-2xl pointer-events-none" />
              
              {dishImage ? (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-white/15 bg-black">
                  <img
                    src={dishImage}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-md rounded-md px-1 py-0.5 text-[8px] font-black text-emerald-400 flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>Extraído</span>
                  </div>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-500 shrink-0 text-2xl">
                  🍽️
                </div>
              )}

              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-black tracking-wider text-[#F4B400] flex items-center gap-1">
                  {storeHandle}
                  <CheckCircle2 className="w-3 h-3 text-[#F4B400] inline-block" />
                </span>
                <h4 className="text-sm font-black text-white truncate mt-0.5">
                  {product.name}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-lg bg-[#E63946]/20 border border-[#E63946]/40 text-[#E63946] text-xs font-black">
                    {priceFormatted}
                  </span>
                  <span className="text-[10px] font-bold text-gray-400">
                    Reel Gastronómico
                  </span>
                </div>
              </div>
            </div>

            {/* Primary Action: Direct Share to Stories */}
            <button
              onClick={handleShareToStories}
              disabled={isGeneratingStory}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-[#E63946] via-[#D62839] to-[#F4B400] hover:brightness-110 active:scale-[0.98] text-white rounded-2xl font-black text-sm shadow-lg shadow-red-500/25 flex items-center justify-center gap-2 transition duration-200 cursor-pointer disabled:opacity-50"
            >
              <Smartphone className="w-5 h-5" />
              <span>
                {isGeneratingStory ? 'Extrayendo y preparando...' : 'Compartir a Historias (Instagram / WhatsApp)'}
              </span>
            </button>

            {/* Extraction & Download Options */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Option A: Download 9:16 Story Card */}
              <button
                onClick={handleDownloadStoryCard}
                disabled={isGeneratingStory}
                className="flex flex-col items-center justify-center text-center p-3 bg-gray-900/90 hover:bg-gray-800/90 border border-gray-700/80 hover:border-white/30 rounded-2xl text-white transition active:scale-95 group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2 group-hover:scale-110 transition">
                  <Download className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-white">
                  Tarjeta 9:16 HD
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  Lista para Historias
                </span>
              </button>

              {/* Option B: Download Raw Dish Photo */}
              <button
                onClick={handleDownloadRawImage}
                disabled={isDownloadingRaw}
                className="flex flex-col items-center justify-center text-center p-3 bg-gray-900/90 hover:bg-gray-800/90 border border-gray-700/80 hover:border-white/30 rounded-2xl text-white transition active:scale-95 group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-[#F4B400] mb-2 group-hover:scale-110 transition">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <span className="text-xs font-black text-white">
                  Foto del Plato
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  Imagen limpia original
                </span>
              </button>
            </div>

            {/* Quick Share: WhatsApp & Copy Link */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleWhatsAppShare}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white text-xs font-extrabold rounded-xl transition shadow-md shadow-emerald-950 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>Compartir en Estados o Chat de WhatsApp</span>
              </button>

              {/* Copy URL with Sticker hint */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 pl-1">
                  <span className="text-[9px] uppercase font-bold text-gray-500 block">
                    Enlace para el sticker de tu historia
                  </span>
                  <p className="text-[11px] font-mono text-gray-300 truncate select-all">
                    {reelUrl}
                  </p>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="py-1.5 px-3 bg-gray-800 hover:bg-[#E63946] active:scale-95 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Step-by-Step Guide for Instagram Stories */}
            <div className="border border-gray-800 rounded-2xl overflow-hidden bg-gray-900/40">
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-extrabold text-gray-300 hover:text-white transition"
              >
                <span className="flex items-center gap-2 text-gray-300">
                  <HelpCircle className="w-4 h-4 text-[#F4B400]" />
                  ¿Cómo poner el enlace en tu historia de Instagram?
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showGuide ? 'rotate-180' : ''}`} />
              </button>

              {showGuide && (
                <div className="px-4 pb-3.5 pt-1 text-[11px] text-gray-400 space-y-2 border-t border-gray-800/60 animate-in fade-in">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-white font-black flex items-center justify-center shrink-0 text-[10px]">
                      1
                    </span>
                    <span>
                      Toca <strong className="text-white">Compartir a Historias</strong> o descarga la tarjeta/foto del plato.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-white font-black flex items-center justify-center shrink-0 text-[10px]">
                      2
                    </span>
                    <span>
                      En Instagram Stories, toca el icono de stickers 🏷️ arriba y selecciona el sticker <strong className="text-[#F4B400]">🔗 ENLACE</strong>.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-white font-black flex items-center justify-center shrink-0 text-[10px]">
                      3
                    </span>
                    <span>
                      Pega el enlace del reel copiado. ¡Tus seguidores podrán ver el reel y pedir este plato con 1 toque!
                    </span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ReelShareModal;
