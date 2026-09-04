import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Sparkles, Phone, X, Check, ShieldCheck, Award } from 'lucide-react';
import { CustomerProfile, ProductRecommendationStats } from '../types';
import { 
  fetchProductRecommendations, 
  toggleProductRecommendation, 
  subscribeProductRecommendations,
  auth, 
  googleProvider, 
  fetchCustomerProfileByEmail, 
  saveCustomerProfile 
} from '../lib/firebase';
import { signInWithPopup } from 'firebase/auth';

interface ProductRecommendationHeartButtonProps {
  productId: string;
  productName: string;
  storeId?: string;
  storeUsername?: string;
  activeCustomer?: CustomerProfile | null;
  onCustomerUpdate?: (customer: CustomerProfile) => void;
  onOpenCustomerPortal?: () => void;
  variant?: 'card-overlay' | 'card-badge' | 'modal-banner' | 'compact';
  initialCount?: number;
  initialPercentage?: number;
  initialRecommended?: boolean;
  className?: string;
}

const PRODUCT_FEEDBACK_TAGS = [
  '¡Sabor exquisito!',
  '¡Porción generosa!',
  '¡Ingredientes frescos!',
  '¡Excelente presentación!',
  '¡100% recomendado!'
];

export const ProductRecommendationHeartButton: React.FC<ProductRecommendationHeartButtonProps> = ({
  productId,
  productName,
  storeId = '',
  storeUsername = '',
  activeCustomer,
  onCustomerUpdate,
  onOpenCustomerPortal,
  variant = 'card-overlay',
  initialCount = 0,
  initialPercentage = 0,
  initialRecommended = false,
  className = ''
}) => {
  const [stats, setStats] = useState<ProductRecommendationStats>({
    productId,
    count: initialCount,
    percentage: initialPercentage,
    totalEvaluated: initialCount,
    userHasRecommended: initialRecommended,
    recommendations: []
  });

  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFeedbackToast, setShowFeedbackToast] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [selectedTag, setSelectedTag] = useState(PRODUCT_FEEDBACK_TAGS[0]);

  // Determine current user identifier (Auth UID or phone)
  const currentUserId = auth.currentUser?.uid || activeCustomer?.phone || (activeCustomer?.email ? activeCustomer.email.replace(/[^a-zA-Z0-9]/g, '_') : null);
  const currentUserName = auth.currentUser?.displayName || activeCustomer?.name || 'Cliente Ryyco';
  const currentUserPhone = activeCustomer?.phone || '';
  const currentUserEmail = auth.currentUser?.email || activeCustomer?.email || '';

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!productId) return;

    fetchProductRecommendations(productId, currentUserId).then(initialStats => {
      setStats(initialStats);
    }).catch(err => {
      console.warn("Could not fetch product recommendations:", err);
    });

    const unsubscribe = subscribeProductRecommendations(productId, currentUserId, (updatedStats) => {
      setStats(prev => ({
        ...updatedStats,
        userHasRecommended: currentUserId 
          ? updatedStats.recommendations.some(r => r.userId === currentUserId && r.recommended !== false)
          : false
      }));
    });

    return () => unsubscribe();
  }, [productId, currentUserId]);

  // Handle recommendation action
  const handleHeartClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // 1. Check if user is logged in
    const isLoggedIn = Boolean(auth.currentUser || activeCustomer);
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    // 2. If already recommended, prompt confirmation to withdraw
    if (stats.userHasRecommended) {
      setShowWithdrawConfirm(true);
      return;
    }

    // 3. Register recommendation
    await executeToggle(false);
  };

  const executeToggle = async (isCurrentlyRecommended: boolean) => {
    if (!currentUserId) {
      setShowAuthModal(true);
      return;
    }

    setLoading(true);
    try {
      const res = await toggleProductRecommendation({
        productId,
        productName,
        storeId,
        storeUsername,
        userId: currentUserId,
        userName: currentUserName,
        userEmail: currentUserEmail,
        userPhone: currentUserPhone,
        feedbackTag: isCurrentlyRecommended ? '' : selectedTag,
        isCurrentlyRecommended
      });

      // Update local state smoothly
      const nextCount = isCurrentlyRecommended ? Math.max(0, stats.count - 1) : stats.count + 1;
      const nextTotal = Math.max(nextCount, isCurrentlyRecommended ? Math.max(0, stats.totalEvaluated - 1) : stats.totalEvaluated + 1);
      const nextPercentage = nextTotal > 0 ? Math.min(100, Math.max(1, Math.round((nextCount / nextTotal) * 100))) : 0;

      setStats(prev => ({
        ...prev,
        count: nextCount,
        percentage: nextCount > 0 ? (nextPercentage || 100) : 0,
        userHasRecommended: res.userHasRecommended
      }));

      if (!isCurrentlyRecommended) {
        setShowFeedbackToast(`¡Recomendaste "${productName}"! ❤️`);
      } else {
        setShowFeedbackToast(`Has retirado tu recomendación.`);
      }
      setTimeout(() => setShowFeedbackToast(null), 3500);
      setShowWithdrawConfirm(false);
    } catch (err: any) {
      console.error("Error toggling product recommendation:", err);
      setShowFeedbackToast("No se pudo guardar la recomendación. Inténtalo de nuevo.");
      setTimeout(() => setShowFeedbackToast(null), 3500);
    } finally {
      setLoading(false);
    }
  };

  // Google 1-Click Login from Auth Modal
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const gEmail = user.email || '';
      const gName = user.displayName || 'Cliente';
      const gAvatar = user.photoURL || '';

      // Sync customer profile
      let existingProfile: CustomerProfile | null = null;
      if (gEmail) {
        existingProfile = await fetchCustomerProfileByEmail(gEmail);
      }

      let finalCustomer: CustomerProfile;
      if (existingProfile && existingProfile.phone) {
        finalCustomer = await saveCustomerProfile({
          ...existingProfile,
          email: existingProfile.email || gEmail,
          avatarUrl: existingProfile.avatarUrl || gAvatar,
          authUid: user.uid,
          name: existingProfile.name || gName
        });
        localStorage.setItem('ryyco_active_customer_phone', finalCustomer.phone);
      } else {
        const tempPhone = 'g_' + user.uid.substring(0, 10);
        finalCustomer = await saveCustomerProfile({
          id: tempPhone,
          phone: tempPhone,
          name: gName,
          email: gEmail,
          avatarUrl: gAvatar,
          authUid: user.uid,
          points: 1000,
          totalOrdersCount: 0,
          totalSpent: 0,
          spinsAvailable: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        localStorage.setItem('ryyco_active_customer_phone', tempPhone);
      }

      if (onCustomerUpdate) {
        onCustomerUpdate(finalCustomer);
      }

      setShowAuthModal(false);

      // Automatically register recommendation immediately after sign in
      const effectiveUserId = user.uid || finalCustomer.phone;
      await toggleProductRecommendation({
        productId,
        productName,
        storeId,
        storeUsername,
        userId: effectiveUserId,
        userName: gName,
        userEmail: gEmail,
        userPhone: finalCustomer.phone || '',
        feedbackTag: selectedTag,
        isCurrentlyRecommended: false
      });

      setStats(prev => ({
        ...prev,
        count: prev.count + 1,
        percentage: prev.percentage > 0 ? prev.percentage : 100,
        userHasRecommended: true
      }));

      setShowFeedbackToast(`¡Bienvenido ${gName}! Recomendaste "${productName}" ❤️`);
      setTimeout(() => setShowFeedbackToast(null), 3500);
    } catch (err: any) {
      console.warn("Google login error:", err);
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setShowFeedbackToast("Error al iniciar sesión con Google.");
        setTimeout(() => setShowFeedbackToast(null), 3500);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleOpenPhoneRegister = () => {
    setShowAuthModal(false);
    if (onOpenCustomerPortal) {
      onOpenCustomerPortal();
    }
  };

  const percentageDisplay = stats.percentage > 0 ? `${stats.percentage}%` : (stats.count > 0 ? '100%' : null);

  // ----------------------------------------------------
  // VARIANT: CARD OVERLAY (Floating heart on image corner)
  // ----------------------------------------------------
  if (variant === 'card-overlay') {
    return (
      <div className={`relative z-20 ${className}`} onClick={(e) => e.stopPropagation()}>
        <motion.button
          id={`btn-product-heart-${productId}`}
          onClick={handleHeartClick}
          whileTap={{ scale: 0.85 }}
          whileHover={{ scale: 1.1 }}
          className={`flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md shadow-md transition-all border ${
            stats.userHasRecommended
              ? 'bg-rose-600/90 text-white border-rose-400 shadow-rose-600/30'
              : 'bg-black/60 hover:bg-black/80 text-white/90 border-white/15 hover:border-rose-400/80 hover:text-rose-400'
          }`}
          title={stats.userHasRecommended ? 'Haz recomendado este producto (Click para retirar)' : 'Recomendar este producto con ❤️'}
        >
          <Heart 
            className={`w-3.5 h-3.5 transition-transform ${
              stats.userHasRecommended 
                ? 'fill-white text-white' 
                : 'text-rose-400 group-hover:scale-110'
            }`} 
          />
          {stats.count > 0 && (
            <span className="text-[10px] font-black tracking-tight font-mono">
              {percentageDisplay || stats.count}
            </span>
          )}
        </motion.button>

        {renderModalsAndToasts()}
      </div>
    );
  }

  // ----------------------------------------------------
  // VARIANT: CARD BADGE (Compact inline badge with stats)
  // ----------------------------------------------------
  if (variant === 'card-badge' || variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`} onClick={(e) => e.stopPropagation()}>
        <button
          id={`badge-product-rec-${productId}`}
          onClick={handleHeartClick}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
            stats.userHasRecommended
              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25'
              : 'bg-stone-800/80 hover:bg-stone-700/80 text-stone-300 border-stone-700 hover:border-rose-500/40'
          }`}
          title={stats.userHasRecommended ? 'Has recomendado este plato' : 'Recomendar con ❤️'}
        >
          <Heart 
            className={`w-3 h-3 ${
              stats.userHasRecommended 
                ? 'fill-rose-500 text-rose-500' 
                : 'text-rose-400'
            }`} 
          />
          <span>
            {percentageDisplay ? `${percentageDisplay} lo recomienda` : (stats.count > 0 ? `${stats.count} recomiendan` : 'Recomendar')}
          </span>
          {stats.count > 0 && (
            <span className="text-stone-400 font-normal">
              ({stats.count})
            </span>
          )}
        </button>

        {renderModalsAndToasts()}
      </div>
    );
  }

  // ----------------------------------------------------
  // VARIANT: MODAL BANNER (Full interactive section inside product modal)
  // ----------------------------------------------------
  return (
    <div className={`w-full ${className}`} onClick={(e) => e.stopPropagation()}>
      <div className="p-3.5 sm:p-4 rounded-2xl bg-[#161B26] border border-[#263042] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-inner">
        {/* Left: Stats & Badges */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black text-white">
                {percentageDisplay ? (
                  <>
                    <span className="text-rose-400">{percentageDisplay}</span> lo recomienda
                  </>
                ) : (
                  <span>Sé el primero en recomendar</span>
                )}
              </span>
              {stats.count > 0 && (
                <span className="text-xs text-stone-400 font-mono">
                  ({stats.count} {stats.count === 1 ? 'opinión' : 'opiniones'})
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
              Recomendado por comensales y clientes verificados
            </p>
          </div>
        </div>

        {/* Right: Toggle Button */}
        <motion.button
          id={`btn-modal-product-rec-${productId}`}
          onClick={handleHeartClick}
          disabled={loading}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md shrink-0 ${
            stats.userHasRecommended
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 hover:bg-rose-500/30'
              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
          }`}
        >
          <motion.span
            animate={stats.userHasRecommended ? { scale: [1, 1.25, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <Heart 
              className={`w-4 h-4 ${
                stats.userHasRecommended 
                  ? 'fill-rose-400 text-rose-400' 
                  : 'text-white fill-white/20'
              }`} 
            />
          </motion.span>
          <span>
            {stats.userHasRecommended ? 'Recomendado ❤️' : 'Recomendar con ❤️'}
          </span>
        </motion.button>
      </div>

      {/* Optional feedback tags pills when recommended */}
      {!stats.userHasRecommended && (
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar text-[10px]">
          <span className="text-stone-400 text-[10px] whitespace-nowrap mr-1 flex items-center gap-1">
            <Award className="w-3 h-3 text-amber-400" /> Etiqueta:
          </span>
          {PRODUCT_FEEDBACK_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
                selectedTag === tag
                  ? 'bg-rose-500/20 border-rose-500/60 text-rose-300 font-bold'
                  : 'bg-stone-900/60 border-stone-700/60 text-stone-400 hover:text-stone-200'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {renderModalsAndToasts()}
    </div>
  );

  function renderModalsAndToasts() {
    return (
      <>
        {/* Floating Notification Toast */}
        <AnimatePresence>
          {showFeedbackToast && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-4 py-3 bg-stone-900 text-white rounded-2xl shadow-2xl backdrop-blur-md text-xs sm:text-sm font-bold border border-stone-700"
            >
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500 shrink-0" />
              <span>{showFeedbackToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal: Must be logged in to recommend */}
        <AnimatePresence>
          {showAuthModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-md bg-[#111622] rounded-3xl p-6 sm:p-7 shadow-2xl border border-stone-800 text-white relative overflow-hidden"
              >
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="absolute top-4 right-4 p-2 rounded-full text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-5 mx-auto">
                  <Heart className="w-7 h-7 text-rose-500 fill-rose-500 animate-pulse" />
                </div>

                <div className="text-center">
                  <h3 className="text-xl font-bold text-white">
                    ¿Te encantó {productName}?
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-400 mt-2 leading-relaxed">
                    Para calificar y recomendar este producto con un corazón <span className="text-rose-500 font-bold">❤️</span> en Ryyco, ingresa a tu cuenta.
                  </p>
                </div>

                {/* Value prop chips */}
                <div className="my-5 p-3 rounded-2xl bg-stone-900/80 border border-stone-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-stone-300">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Recomendación auténtica (1 voto verificado por cliente)</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-stone-300">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>¡Gana 1.000 Puntos ($1.000 COP) y giros en la ruleta al registrarte!</span>
                  </div>
                </div>

                {/* Login Options */}
                <div className="space-y-2.5">
                  <button
                    id="btn-auth-google-product-recommend"
                    onClick={handleGoogleLogin}
                    disabled={isGoogleLoading}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-stone-100 text-stone-900 font-bold text-sm shadow-sm transition-all"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>{isGoogleLoading ? 'Iniciando sesión...' : 'Continuar con Google'}</span>
                  </button>

                  <button
                    id="btn-auth-phone-product-recommend"
                    onClick={handleOpenPhoneRegister}
                    className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-bold text-sm transition-all border border-stone-700"
                  >
                    <Phone className="w-4 h-4 text-emerald-400" />
                    <span>Ingresar con Celular / WhatsApp</span>
                  </button>
                </div>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setShowAuthModal(false)}
                    className="text-xs text-stone-500 hover:text-stone-300 font-medium"
                  >
                    Quizás más tarde
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal: Confirm Withdraw Recommendation */}
        <AnimatePresence>
          {showWithdrawConfirm && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-sm bg-[#111622] rounded-3xl p-6 shadow-2xl border border-stone-800 text-center text-white"
              >
                <div className="w-12 h-12 rounded-2xl bg-stone-800 flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-6 h-6 text-stone-400" />
                </div>
                <h4 className="text-lg font-bold">
                  ¿Retirar recomendación?
                </h4>
                <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                  Ya has recomendado este producto. ¿Deseas retirar tu corazón ❤️ de "{productName}"?
                </p>

                <div className="grid grid-cols-2 gap-2.5 mt-6">
                  <button
                    onClick={() => setShowWithdrawConfirm(false)}
                    className="py-2.5 px-4 rounded-xl border border-stone-700 text-stone-300 text-xs font-bold hover:bg-stone-800 transition-colors"
                  >
                    Mantener ❤️
                  </button>
                  <button
                    id="btn-confirm-withdraw-product-rec"
                    onClick={() => executeToggle(true)}
                    disabled={loading}
                    className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-sm"
                  >
                    {loading ? 'Retirando...' : 'Retirar'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </>
    );
  }
};
