import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Share2, 
  Check, 
  Copy, 
  MessageCircle, 
  Sparkles,
  Smartphone
} from 'lucide-react';
import { ProductItem, UserProfile } from '../types';
import { ReelShareModal } from './ReelShareModal';

interface ProductShareButtonProps {
  product: ProductItem;
  storeUsername?: string;
  storeName?: string;
  currency?: string;
  variant?: 'card-overlay' | 'modal-button' | 'compact' | 'icon-only';
  className?: string;
  profile?: UserProfile | null;
}

export const ProductShareButton: React.FC<ProductShareButtonProps> = ({
  product,
  storeUsername = '',
  storeName = '',
  currency = '$',
  variant = 'card-overlay',
  className = '',
  profile = null
}) => {
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Clean username if passed with @
  const cleanUsername = (storeUsername || product.storeUsername || '').replace(/^@/, '').trim();
  const effectiveStoreName = storeName || product.storeName || (cleanUsername ? `@${cleanUsername}` : 'Ryyco');

  const effectiveProfile = profile || ({
    id: product.userId || '',
    username: cleanUsername,
    displayName: effectiveStoreName,
    storeName: effectiveStoreName,
  } as unknown as UserProfile);

  // Build high-compatibility URL with product deep-link query parameter
  const getProductShareUrl = () => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;

    if (cleanUsername) {
      return `${origin}/@${encodeURIComponent(cleanUsername)}?product=${encodeURIComponent(product.id)}`;
    }
    return `${origin}/?product=${encodeURIComponent(product.id)}`;
  };

  const notifyCopied = () => {
    setCopied(true);
    setToastMessage('¡Enlace copiado!');
    setTimeout(() => {
      setCopied(false);
      setToastMessage(null);
    }, 2400);
  };

  const copyToClipboard = async (url: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
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

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const shareUrl = getProductShareUrl();
    copyToClipboard(shareUrl);
    setShowShareModal(true);
  };

  const shareUrl = getProductShareUrl();

  // Render Story & Social Share Modal with 9:16 Design
  const renderShareModal = () => {
    if (!showShareModal) return null;

    return (
      <ReelShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        product={product}
        profile={effectiveProfile}
        customShareUrl={shareUrl}
        source="product"
      />
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
