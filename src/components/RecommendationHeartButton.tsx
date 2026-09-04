import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Sparkles, LogIn, Phone, X, Check, ShieldCheck } from 'lucide-react';
import { CustomerProfile, StoreRecommendationStats } from '../types';
import { 
  fetchStoreRecommendations, 
  toggleStoreRecommendation, 
  subscribeStoreRecommendations,
  auth, 
  googleProvider, 
  fetchCustomerProfileByEmail, 
  fetchCustomerProfileByPhone, 
  saveCustomerProfile, 
  sanitizeCustomerPhone 
} from '../lib/firebase';
import { signInWithPopup } from 'firebase/auth';

interface RecommendationHeartButtonProps {
  storeId: string;
  storeName: string;
  storeUsername?: string;
  activeCustomer?: CustomerProfile | null;
  onCustomerUpdate?: (customer: CustomerProfile) => void;
  onOpenCustomerPortal?: () => void;
  variant?: 'hero' | 'header' | 'badge' | 'compact';
  className?: string;
}

export const RecommendationHeartButton: React.FC<RecommendationHeartButtonProps> = ({
  storeId,
  storeName,
  storeUsername,
  activeCustomer,
  onCustomerUpdate,
  onOpenCustomerPortal,
  variant = 'hero',
  className = ''
}) => {
  const [stats, setStats] = useState<StoreRecommendationStats>({
    storeId,
    count: 0,
    percentage: 0,
    totalEvaluated: 0,
    userHasRecommended: false,
    recommendations: []
  });

  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFeedbackToast, setShowFeedbackToast] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [selectedTag, setSelectedTag] = useState('Sabor increíble');

  // Determine current user identifier (Auth UID or phone)
  const currentUserId = auth.currentUser?.uid || activeCustomer?.phone || (activeCustomer?.email ? activeCustomer.email.replace(/[^a-zA-Z0-9]/g, '_') : null);
  const currentUserName = auth.currentUser?.displayName || activeCustomer?.name || 'Cliente Ryyco';
  const currentUserPhone = activeCustomer?.phone || '';
  const currentUserEmail = auth.currentUser?.email || activeCustomer?.email || '';

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!storeId) return;

    fetchStoreRecommendations(storeId, currentUserId).then(initialStats => {
      setStats(initialStats);
    }).catch(err => {
      console.warn("Could not fetch recommendations:", err);
    });

    const unsubscribe = subscribeStoreRecommendations(storeId, currentUserId, (updatedStats) => {
      setStats(prev => ({
        ...updatedStats,
        // Preserve user state if calculated locally
        userHasRecommended: currentUserId 
          ? updatedStats.recommendations.some(r => r.userId === currentUserId && r.recommended !== false)
          : false
      }));
    });

    return () => unsubscribe();
  }, [storeId, currentUserId]);

  // Handle recommendation action
  const handleHeartClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

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
      const res = await toggleStoreRecommendation({
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
        setShowFeedbackToast(`¡Recomendaste a ${storeName || 'este restaurante'}! ❤️`);
      } else {
        setShowFeedbackToast(`Has retirado tu recomendación.`);
      }
      setTimeout(() => setShowFeedbackToast(null), 3500);
      setShowWithdrawConfirm(false);
    } catch (err: any) {
      console.error("Error toggling recommendation:", err);
      setShowFeedbackToast("No se pudo registrar la recomendación. Inténtalo de nuevo.");
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
        // Create quick customer record
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
      await toggleStoreRecommendation({
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

      setShowFeedbackToast(`¡Bienvenido ${gName}! Recomendaste a ${storeName} ❤️`);
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

  // Switch to standard customer portal
  const handleOpenPhoneRegister = () => {
    setShowAuthModal(false);
    if (onOpenCustomerPortal) {
      onOpenCustomerPortal();
    }
  };

  // Render text format: "❤️ 96% lo recomienda + número de recomendaciones"
  const percentageDisplay = stats.percentage > 0 ? `${stats.percentage}%` : (stats.count > 0 ? '100%' : null);
  const countDisplay = stats.count > 0 
    ? `(${stats.count} ${stats.count === 1 ? 'recomendación' : 'recomendaciones'})`
    : '';

  // ----------------------------------------------------
  // VARIANT: HEADER NAVBAR (Compact, sleek pill)
  // ----------------------------------------------------
  if (variant === 'header') {
    return (
      <>
        <motion.button
          id="btn-header-recommendation"
          onClick={handleHeartClick}
          whileTap={{ scale: 0.92 }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors shadow-sm ${
            stats.userHasRecommended
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
              : 'bg-white/80 dark:bg-stone-900/80 backdrop-blur-md text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:border-rose-300 hover:text-rose-600'
          } ${className}`}
          title={stats.userHasRecommended ? 'Haz recomendado este restaurante (Click para retirar)' : 'Recomendar restaurante con ❤️'}
        >
          <motion.span
            animate={stats.userHasRecommended ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <Heart 
              className={`w-3.5 h-3.5 transition-transform ${
                stats.userHasRecommended 
                  ? 'fill-rose-500 text-rose-500' 
                  : 'text-rose-500 hover:scale-110'
              }`} 
            />
          </motion.span>
          <span className="font-semibold whitespace-nowrap">
            {percentageDisplay ? `${percentageDisplay}` : (stats.count > 0 ? `${stats.count}` : 'Recomendar')}
          </span>
          {stats.count > 0 && (
            <span className="hidden sm:inline text-[10px] text-stone-500 dark:text-stone-400 font-normal">
              ({stats.count})
            </span>
          )}
        </motion.button>

        {/* Modal and Toasts */}
        {renderModalsAndToasts()}
      </>
    );
  }

  // ----------------------------------------------------
  // VARIANT: BADGE (Store cards or list view)
  // ----------------------------------------------------
  if (variant === 'badge' || variant === 'compact') {
    return (
      <>
        <div 
          id={`badge-recommendation-${storeId}`}
          onClick={handleHeartClick}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer select-none transition-all ${
            stats.userHasRecommended
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
              : 'bg-stone-100 dark:bg-stone-800/70 text-stone-700 dark:text-stone-300 border border-stone-200/80 dark:border-stone-700 hover:border-rose-300'
          } ${className}`}
          title={stats.userHasRecommended ? 'Recomendado por ti' : 'Toca para recomendar'}
        >
          <Heart 
            className={`w-3.5 h-3.5 ${
              stats.userHasRecommended 
                ? 'fill-rose-500 text-rose-500' 
                : 'text-rose-500'
            }`} 
          />
          <span className="font-semibold whitespace-nowrap">
            {percentageDisplay ? `${percentageDisplay} lo recomienda` : (stats.count > 0 ? `${stats.count} recomendaciones` : 'Sé el primero en recomendar')}
          </span>
          {stats.count > 0 && percentageDisplay && (
            <span className="text-stone-400 dark:text-stone-500 font-normal">
              • {stats.count}
            </span>
          )}
        </div>

        {renderModalsAndToasts()}
      </>
    );
  }

  // ----------------------------------------------------
  // VARIANT: HERO (Main Store Profile & Restaurant View)
  // Full prominent display adhering to RYYCO design
  // ----------------------------------------------------
  return (
    <div className={`w-full ${className}`}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 shadow-sm">
        {/* Left info: Icon, Percentage and count */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center shrink-0 border border-rose-100 dark:border-rose-900/50">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">
                {percentageDisplay ? (
                  <>
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold">{percentageDisplay}</span> lo recomienda
                  </>
                ) : (
                  <span>Aún sin recomendaciones</span>
                )}
              </span>
              {stats.count > 0 && (
                <span className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                  {countDisplay}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 inline" />
              Basado en clientes verificados y opiniones de Ryyco
            </p>
          </div>
        </div>

        {/* Right CTA Button: Heart Action */}
        <motion.button
          id="btn-hero-recommend-action"
          onClick={handleHeartClick}
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm ${
            stats.userHasRecommended
              ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
              : 'bg-stone-900 hover:bg-stone-800 dark:bg-white dark:hover:bg-stone-100 text-white dark:text-stone-900'
          }`}
        >
          <motion.span
            animate={stats.userHasRecommended ? { scale: [1, 1.25, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <Heart 
              className={`w-4 h-4 ${
                stats.userHasRecommended 
                  ? 'fill-rose-500 text-rose-500' 
                  : 'text-rose-400 dark:text-rose-600'
              }`} 
            />
          </motion.span>
          <span className="whitespace-nowrap">
            {stats.userHasRecommended ? 'Recomendado ❤️' : 'Recomendar con ❤️'}
          </span>
        </motion.button>
      </div>

      {renderModalsAndToasts()}
    </div>
  );

  // ----------------------------------------------------
  // Helper: Modals and Feedback Toasts
  // ----------------------------------------------------
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
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 bg-stone-900/95 text-white dark:bg-white dark:text-stone-900 rounded-2xl shadow-xl backdrop-blur-md text-sm font-medium border border-stone-800 dark:border-stone-200"
            >
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500 shrink-0" />
              <span>{showFeedbackToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal: Must be logged in to recommend */}
        <AnimatePresence>
          {showAuthModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-md bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-7 shadow-2xl border border-stone-200 dark:border-stone-800 relative overflow-hidden"
              >
                {/* Close button */}
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="absolute top-4 right-4 p-2 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Header icon */}
                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-900/50 flex items-center justify-center mb-5 mx-auto">
                  <Heart className="w-7 h-7 text-rose-500 fill-rose-500 animate-pulse" />
                </div>

                <div className="text-center">
                  <h3 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                    ¿Te gustó {storeName || 'este restaurante'}?
                  </h3>
                  <p className="text-sm text-stone-600 dark:text-stone-400 mt-2 leading-relaxed">
                    Para recomendar este restaurante con un corazón <span className="text-rose-500 font-bold">❤️</span> e inspirar a la comunidad de Ryyco, debes estar registrado e iniciar sesión.
                  </p>
                </div>

                {/* Value prop chips */}
                <div className="my-5 p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/70 dark:border-stone-700/60 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-stone-700 dark:text-stone-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Cada cliente puede recomendar 1 sola vez</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-stone-700 dark:text-stone-300">
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>¡Gana 1.000 Puntos ($1.000 COP) y 1 tiro en la ruleta al registrarte!</span>
                  </div>
                </div>

                {/* Login Options */}
                <div className="space-y-2.5">
                  <button
                    id="btn-auth-google-recommend"
                    onClick={handleGoogleLogin}
                    disabled={isGoogleLoading}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-750 text-stone-800 dark:text-stone-100 font-medium text-sm border border-stone-300 dark:border-stone-700 shadow-sm transition-all"
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
                    id="btn-auth-phone-recommend"
                    onClick={handleOpenPhoneRegister}
                    className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 font-medium text-sm transition-all shadow-sm"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Ingresar con Celular / WhatsApp</span>
                  </button>
                </div>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setShowAuthModal(false)}
                    className="text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 font-medium"
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 text-center"
              >
                <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-6 h-6 text-stone-400" />
                </div>
                <h4 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  ¿Retirar recomendación?
                </h4>
                <p className="text-xs text-stone-600 dark:text-stone-400 mt-2 leading-relaxed">
                  Ya has recomendado a {storeName}. ¿Deseas retirar tu corazón ❤️ de este restaurante?
                </p>

                <div className="grid grid-cols-2 gap-2.5 mt-6">
                  <button
                    onClick={() => setShowWithdrawConfirm(false)}
                    className="py-2.5 px-4 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                  >
                    Mantener ❤️
                  </button>
                  <button
                    id="btn-confirm-withdraw-recommendation"
                    onClick={() => executeToggle(true)}
                    disabled={loading}
                    className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition-colors shadow-sm"
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
