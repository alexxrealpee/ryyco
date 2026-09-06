import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Share2, 
  Check, 
  Copy, 
  MessageCircle, 
  X, 
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { ProductItem } from '../types';

interface ProductShareButtonProps {
  product: ProductItem;
  storeUsername?: string;
  storeName?: string;
  currency?: string;
  variant?: 'card-overlay' | 'modal-button' | 'compact' | 'icon-only';
  className?: string;
}

export const ProductShareButton: React.FC<ProductShareButtonProps> = ({
  product,
  storeUsername = '',
  storeName = '',
  currency = '$',
  variant = 'card-overlay',
  className = ''
}) => {
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Clean username if passed with @
  const cleanUsername = (storeUsername || product.storeUsername || '').replace(/^@/, '').trim();
  const effectiveStoreName = storeName || product.storeName || (cleanUsername ? `@${cleanUsername}` : 'Ryyco');

  // Build high-compatibility URL with product deep-link query parameter
  const getProductShareUrl = () => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;

    if (cleanUsername) {
      return `${origin}/@${encodeURIComponent(cleanUsername)}?product=${encodeURIComponent(product.id)}`;
    }
    return `${origin}/tienda?product=${encodeURIComponent(product.id)}`;
  };

  // Build attractive message for WhatsApp and social platforms
  const getShareText = () => {
    const formattedPrice = `${currency}${Number(product.price || 0).toLocaleString()}`;
    const desc = product.description ? `\n"${product.description.slice(0, 120)}${product.description.length > 120 ? '...' : ''}"` : '';
    return `🍽️ ¡Mira este plato de ${effectiveStoreName} en Ryyco!\n\n✨ *${product.name}*\n💰 Precio: ${formattedPrice}${desc}\n\n👉 Pídelo aquí directamente:`;
  };

  const notifyCopied = () => {
    setCopied(true);
    setToastMessage('¡Enlace del producto copiado!');
    setTimeout(() => {
      setCopied(false);
      setToastMessage(null);
    }, 2600);
  };

  const copyToClipboard = async (url: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for older webviews
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      notifyCopied();
      return true;
    } catch (err) {
      console.error('Error copying product url to clipboard:', err);
      return false;
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const shareUrl = getProductShareUrl();
    const shareTitle = `${product.name} | ${effectiveStoreName}`;
    const shareText = getShareText();

    // 1. If mobile device supports Web Share API
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
        return;
      } catch (err: any) {
        // If user cancelled, don't show fallback modal
        if (err?.name === 'AbortError') {
          return;
        }
      }
    }

    // 2. Fallback: Copy URL directly and display custom share options modal
    await copyToClipboard(shareUrl);
    setShowShareModal(true);
  };

  const shareUrl = getProductShareUrl();
  const shareText = getShareText();
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

  // Share Options Modal
  const renderShareModal = () => {
    if (!showShareModal) return null;

    return (
      <AnimatePresence>
        <div 
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            e.stopPropagation();
            setShowShareModal(false);
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#111827] border border-[#232B3A] rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 text-left relative"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Compartir Producto</h3>
                  <p className="text-[11px] text-gray-400 font-mono truncate max-w-[200px]">{effectiveStoreName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product Card Preview */}
            <div className="flex items-center gap-3 p-3 bg-gray-900/80 border border-gray-800 rounded-xl">
              {product.imageURL ? (
                <img 
                  src={product.imageURL} 
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-700"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500 shrink-0">
                  🍽️
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate">{product.name}</h4>
                <p className="text-xs font-black text-amber-400 font-mono">
                  {currency}{Number(product.price || 0).toLocaleString()}
                </p>
                {product.category && (
                  <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">
                    {product.category}
                  </span>
                )}
              </div>
            </div>

            {/* Copied Success Banner */}
            {copied && (
              <motion.div 
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2"
              >
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>¡Enlace directo copiado al portapapeles!</span>
              </motion.div>
            )}

            {/* Direct Share Buttons */}
            <div className="space-y-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Compartir en WhatsApp</span>
              </a>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#1877F2]/20 hover:bg-[#1877F2]/30 text-[#1877F2] border border-[#1877F2]/40 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Facebook</span>
                </a>

                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#0088cc]/20 hover:bg-[#0088cc]/30 text-[#0088cc] border border-[#0088cc]/40 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Telegram</span>
                </a>
              </div>

              {/* Copy URL Input Box */}
              <div className="pt-2">
                <div className="flex items-center gap-1.5 bg-gray-950 border border-gray-800 rounded-xl p-1.5 pl-3">
                  <span className="text-[11px] text-gray-400 font-mono truncate flex-1 select-all">
                    {shareUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(shareUrl)}
                    className="py-1.5 px-3 bg-gray-800 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>
    );
  };

  // ----------------------------------------------------
  // VARIANT: CARD OVERLAY (Circle button beside Heart button in cards)
  // ----------------------------------------------------
  if (variant === 'card-overlay') {
    return (
      <div className={`relative inline-flex items-center ${className}`} onClick={(e) => e.stopPropagation()}>
        <motion.button
          type="button"
          id={`btn-share-product-${product.id}`}
          onClick={handleShare}
          whileTap={{ scale: 0.85 }}
          whileHover={{ scale: 1.1 }}
          className={`flex items-center justify-center w-7 h-7 rounded-full backdrop-blur-md shadow-md transition-all border cursor-pointer ${
            copied
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-600/30'
              : 'bg-black/60 hover:bg-black/80 text-white/90 border-white/15 hover:border-indigo-400/80 hover:text-indigo-300'
          }`}
          title={copied ? '¡Enlace copiado!' : 'Compartir este producto'}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
          ) : (
            <Share2 className="w-3.5 h-3.5 text-white/90 hover:text-indigo-300 transition-colors" />
          )}
        </motion.button>

        {/* Small floating tooltip when copied */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: -30, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="absolute left-1/2 -translate-x-1/2 -top-1 bg-emerald-600 text-white text-[9.5px] font-bold px-2 py-0.5 rounded-md shadow-lg whitespace-nowrap z-30 pointer-events-none"
            >
              ¡Copiado!
            </motion.div>
          )}
        </AnimatePresence>

        {renderShareModal()}
      </div>
    );
  }

  // ----------------------------------------------------
  // VARIANT: MODAL BUTTON (In detail modal)
  // ----------------------------------------------------
  if (variant === 'modal-button') {
    return (
      <div className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
        <motion.button
          type="button"
          id={`btn-share-modal-${product.id}`}
          onClick={handleShare}
          whileTap={{ scale: 0.95 }}
          className={`w-full py-2.5 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
            copied
              ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
              : 'bg-gray-900/80 hover:bg-gray-800 text-gray-200 hover:text-white border-gray-700/80 hover:border-indigo-500/40'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span>¡Enlace de Producto Copiado!</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 text-indigo-400" />
              <span>Compartir este Plato</span>
            </>
          )}
        </motion.button>

        {renderShareModal()}
      </div>
    );
  }

  // ----------------------------------------------------
  // VARIANT: COMPACT / ICON ONLY
  // ----------------------------------------------------
  return (
    <div className={`relative inline-flex items-center ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        id={`btn-share-compact-${product.id}`}
        onClick={handleShare}
        className={`p-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
          copied
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border-gray-700'
        }`}
        title="Compartir"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
        <span className="text-[10px]">Compartir</span>
      </button>

      {renderShareModal()}
    </div>
  );
};

export default ProductShareButton;
