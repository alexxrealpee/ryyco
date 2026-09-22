/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle,
  CheckCircle2,
  ShieldCheck,
  ShoppingBag,
  LogIn,
  UserPlus,
  AlertCircle,
  MessageCircle,
  HelpCircle,
  Phone,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import {
  auth,
  googleProvider,
  saveCustomerProfile,
  fetchCustomerProfileByPhone,
  fetchCustomerProfileByEmail,
  fetchCustomerProfileByUid,
  setActiveCustomerSession,
  sanitizeCustomerPhone
} from '../lib/firebase';
import { CustomerProfile } from '../types';
import BuyerTermsModal from './BuyerTermsModal';

export interface CustomerOrderAuthPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
  customerName: string;
  customerAddress: string;
  customerNotes?: string;
  cartSummary: {
    itemsCount: number;
    totalFormatted: string;
  };
  isExistingCustomer: boolean;
  existingProfile: CustomerProfile | null;
  onAuthenticated: (customer: CustomerProfile) => void;
  onChangePhoneRequest?: () => void;
}

const GoogleIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

export default function CustomerOrderAuthPromptModal({
  isOpen,
  onClose,
  phone,
  customerName,
  customerAddress,
  customerNotes,
  cartSummary,
  isExistingCustomer,
  existingProfile,
  onAuthenticated,
  onChangePhoneRequest
}: CustomerOrderAuthPromptModalProps) {
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleAuthStage, setGoogleAuthStage] = useState<'idle' | 'popup' | 'loading_profile' | 'profile_ready'>('idle');
  const [googleUserDetails, setGoogleUserDetails] = useState<{
    name: string;
    email: string;
    avatarUrl: string;
  } | null>(null);
  const [loadingProfileStatusText, setLoadingProfileStatusText] = useState('Verificando cuenta...');
  const [authError, setAuthError] = useState('');
  const [acceptedBuyerTerms, setAcceptedBuyerTerms] = useState(true);
  const [isBuyerTermsModalOpen, setIsBuyerTermsModalOpen] = useState(false);
  const [showForgotNotice, setShowForgotNotice] = useState(false);

  if (!isOpen) return null;

  const cleanedPhone = sanitizeCustomerPhone(phone);
  const displayName = existingProfile?.name || customerName;

  // 1. Password submit (Login or Registration)
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim() || passwordInput.trim().length < 4) {
      setAuthError("Por favor ingresa una contraseña de al menos 4 caracteres.");
      return;
    }

    if (!isExistingCustomer && !acceptedBuyerTerms) {
      setAuthError("Debes aceptar los Términos y Condiciones para registrarte.");
      return;
    }

    setIsSubmitting(true);
    setAuthError('');

    try {
      if (isExistingCustomer && existingProfile) {
        // Verify password if configured on profile
        if (existingProfile.password && existingProfile.password.trim().length > 0) {
          if (existingProfile.password !== passwordInput.trim()) {
            setAuthError("Contraseña incorrecta. Por favor verifica tu clave o ingresa con Google.");
            setIsSubmitting(false);
            return;
          }
        } else {
          // If customer existed without a set password, assign this password for their security
          await saveCustomerProfile({
            ...existingProfile,
            password: passwordInput.trim()
          });
        }

        const updatedProfile: CustomerProfile = {
          ...existingProfile,
          name: customerName.trim() || existingProfile.name,
          address: customerAddress.trim() || existingProfile.address,
          notes: customerNotes?.trim() || existingProfile.notes
        };

        const saved = await saveCustomerProfile(updatedProfile);
        setActiveCustomerSession(saved);
        onAuthenticated(saved);
      } else {
        // Register new customer profile!
        const newProfile = await saveCustomerProfile({
          phone: cleanedPhone,
          name: customerName.trim(),
          password: passwordInput.trim(),
          address: customerAddress.trim(),
          notes: customerNotes?.trim() || '',
          points: 1000, // 1.000 RYYCOS ($1.000 COP) welcome bonus!
          spinsAvailable: 1
        });

        setActiveCustomerSession(newProfile);
        onAuthenticated(newProfile);
      }
    } catch (err: any) {
      console.error("Auth error in checkout prompt:", err);
      setAuthError(err.message || "Ocurrió un error al verificar tu cuenta. Intenta de nuevo.");
      setIsSubmitting(false);
    }
  };

  // 2. Google OAuth 1-click submit with profile loading state
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setGoogleAuthStage('popup');
    setLoadingProfileStatusText('Abriendo ventana segura de Google...');
    setAuthError('');
    try {
      localStorage.setItem('ryyco_auth_mode', 'customer');
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const gEmail = user.email || '';
      const gName = user.displayName || customerName;
      const gAvatar = user.photoURL || '';

      // Set user details and switch immediately to 'loading_profile' view with animated loader
      setGoogleUserDetails({
        name: gName,
        email: gEmail,
        avatarUrl: gAvatar
      });
      setGoogleAuthStage('loading_profile');
      setLoadingProfileStatusText('Cargando y sincronizando tu perfil...');

      // Check if profile exists by uid, phone, or email
      let profile: CustomerProfile | null = null;
      if (user.uid) {
        profile = await fetchCustomerProfileByUid(user.uid);
      }
      if (!profile) {
        profile = await fetchCustomerProfileByPhone(cleanedPhone);
      }
      if (!profile && gEmail) {
        profile = await fetchCustomerProfileByEmail(gEmail);
      }

      setLoadingProfileStatusText(
        profile
          ? 'Cargando saldo de RYYCOS y datos guardados...'
          : 'Creando tu perfil de cliente y activando bono de 1.000 RYYCOS...'
      );

      const saved = await saveCustomerProfile({
        ...(profile || {}),
        phone: cleanedPhone,
        name: profile?.name || customerName || gName,
        email: gEmail,
        avatarUrl: gAvatar || profile?.avatarUrl || '',
        authUid: user.uid,
        address: customerAddress.trim() || profile?.address || '',
        notes: customerNotes?.trim() || profile?.notes || '',
        points: profile ? (profile.points || 0) : 1000,
        spinsAvailable: profile ? (profile.spinsAvailable || 1) : 1
      });

      setActiveCustomerSession(saved);

      // Transition to 'profile_ready'
      setGoogleAuthStage('profile_ready');
      setLoadingProfileStatusText('¡Perfil cargado con éxito! Confirmando tu pedido...');

      // Brief delay to let the user see the confirmation before finishing
      await new Promise(res => setTimeout(res, 900));

      onAuthenticated(saved);
    } catch (err: any) {
      console.warn("Google sign in error in order auth prompt:", err);
      setGoogleAuthStage('idle');
      setGoogleUserDetails(null);
      if (err.code === 'auth/popup-blocked') {
        setAuthError("Tu navegador bloqueó la ventana de Google. Ingresa con tu contraseña abajo o habilita las ventanas emergentes.");
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setAuthError(err.message || "Error al autenticar con Google");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const isProfileLoadingActive = googleAuthStage === 'loading_profile' || googleAuthStage === 'profile_ready';

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-[#111827] border border-[#232B3A] rounded-3xl w-full max-w-md relative overflow-hidden shadow-2xl flex flex-col my-auto text-left"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#232B3A] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {googleAuthStage === 'loading_profile' ? (
              <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : googleAuthStage === 'profile_ready' ? (
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            ) : isExistingCustomer ? (
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <LogIn className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Sparkles className="w-4 h-4" />
              </div>
            )}
            <div>
              <span className="font-black text-xs sm:text-sm text-white uppercase tracking-tight block">
                {googleAuthStage === 'loading_profile'
                  ? 'Cargando Perfil...'
                  : googleAuthStage === 'profile_ready'
                  ? '¡Perfil Listo!'
                  : isExistingCustomer
                  ? 'Inicia Sesión para Confirmar'
                  : 'Crea tu Cuenta en 1 Paso'}
              </span>
              <span className="text-[10px] text-[#A9B2C3] font-semibold block">
                {isProfileLoadingActive
                  ? 'Sincronizando tus datos con tu pedido'
                  : isExistingCustomer
                  ? 'Tu pedido está listo y se asociará a tu cuenta'
                  : 'Tu pedido y todos tus datos están guardados'}
              </span>
            </div>
          </div>

          {!isProfileLoadingActive ? (
            <button
              type="button"
              onClick={onClose}
              disabled={isGoogleLoading || isSubmitting}
              className="text-white font-bold p-1.5 transition cursor-pointer hover:scale-110 active:scale-95 bg-[#E63946] hover:bg-[#D62839] rounded-full border border-red-700 shadow-md shadow-red-900/35 disabled:opacity-40"
              title="Volver a los datos de entrega"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-800/80 flex items-center justify-center text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            </div>
          )}
        </div>

        {/* Modal Content */}
        {isProfileLoadingActive ? (
          /* Profile Loading & Synchronization View */
          <div className="p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-6 animate-fade-in my-auto">
            {/* Ambient Background Glow & Avatar */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-full bg-gradient-to-tr from-blue-500/20 via-emerald-500/20 to-amber-500/20 blur-lg animate-pulse" />
              
              <div className="relative w-20 h-20 rounded-full bg-[#1A2234] border-2 border-emerald-500/40 p-1 flex items-center justify-center shadow-xl">
                {googleUserDetails?.avatarUrl ? (
                  <img
                    src={googleUserDetails.avatarUrl}
                    alt={googleUserDetails.name || 'Usuario'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-2xl">
                    {(googleUserDetails?.name || displayName || 'U').charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Status mini badge */}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#111827] border-2 border-[#1A2234] flex items-center justify-center shadow">
                  {googleAuthStage === 'profile_ready' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
                  ) : (
                    <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              </div>
            </div>

            {/* Title & User Greeting */}
            <div className="space-y-1.5 max-w-sm">
              <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                {googleAuthStage === 'profile_ready' 
                  ? '¡Perfil Listo! Confirmando Pedido...' 
                  : (isExistingCustomer ? 'Cargando tu Perfil de Cliente...' : 'Creando y Configurando tu Perfil...')}
              </h3>
              <p className="text-xs text-emerald-400 font-bold">
                ¡Hola, {googleUserDetails?.name || displayName}!
              </p>
              {googleUserDetails?.email && (
                <p className="text-[11px] text-gray-400 font-mono">
                  {googleUserDetails.email}
                </p>
              )}
            </div>

            {/* Dynamic Status / Checklist Box */}
            <div className="w-full bg-[#0A0E18] border border-[#232B3A] rounded-2xl p-4 text-left space-y-3">
              <div className="flex items-center gap-2.5 text-xs text-gray-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">Cuenta de Google autenticada</span>
              </div>

              <div className="flex items-center gap-2.5 text-xs text-gray-200">
                {googleAuthStage === 'profile_ready' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                <span className="font-semibold text-gray-300">
                  {googleAuthStage === 'profile_ready'
                    ? 'Perfil sincronizado y puntos RYYCOS listos'
                    : loadingProfileStatusText}
                </span>
              </div>

              <div className="flex items-center gap-2.5 text-xs text-gray-400">
                {googleAuthStage === 'profile_ready' ? (
                  <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-gray-700 shrink-0" />
                )}
                <span>Asociando pedido de {cartSummary.totalFormatted} a tu cuenta...</span>
              </div>
            </div>

            {/* Animated Progress Bar */}
            <div className="w-full bg-[#1A2234] rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${
                  googleAuthStage === 'profile_ready'
                    ? 'w-full bg-emerald-500'
                    : 'w-3/4 bg-gradient-to-r from-blue-500 via-amber-400 to-emerald-400 animate-pulse'
                }`} 
              />
            </div>

            <p className="text-[11px] text-gray-500 italic">
              Por favor espera un momento, tu pedido se confirmará automáticamente.
            </p>
          </div>
        ) : (
          /* Normal Authentication Form */
          <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Order Summary Preserved Banner */}
            <div className="bg-[#0A0E18] border border-[#232B3A] p-3 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#E63946]/15 border border-[#E63946]/30 flex items-center justify-center text-[#E63946] shrink-0 mt-0.5">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-black uppercase text-gray-400">Pedido en curso</span>
                  <span className="text-xs font-black text-emerald-400 font-mono">{cartSummary.totalFormatted}</span>
                </div>
                <p className="text-[11px] text-white font-bold truncate mt-0.5">
                  {cartSummary.itemsCount} {cartSummary.itemsCount === 1 ? 'producto' : 'productos'} para {displayName || 'Cliente'}
                </p>
                {customerAddress && (
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">
                    📍 {customerAddress}
                  </p>
                )}
              </div>
            </div>

            {/* Account status note / benefit banner */}
            {isExistingCustomer ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3 text-emerald-300 space-y-1">
                <div className="flex items-center gap-1.5 font-black text-[11px]">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>¡Hola {displayName}! Tu cuenta ya está registrada</span>
                </div>
                <p className="text-[10px] text-emerald-200/90 font-medium leading-relaxed">
                  Ingresa tu contraseña para confirmar tu pedido automáticamente y tener acceso a su rastreo en tiempo real.
                </p>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border border-amber-500/40 rounded-2xl p-3 text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-black text-[11px]">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-bounce" />
                  <span>¡Gana 1.000 RYYCOS ($1.000 COP) y 1 Giro Gratis! 🎁</span>
                </div>
                <p className="text-[10px] text-amber-200/90 font-medium leading-relaxed">
                  Crea tu clave en 1 segundo. Tu pedido continuará automáticamente y podrás rastrear su estado en vivo.
                </p>
              </div>
            )}

            {/* Error Message */}
            {authError && (
              <div className="bg-red-500/15 border border-red-500/40 p-3 rounded-2xl flex items-start gap-2 text-red-300 text-xs font-semibold animate-fade-in">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-[11px] leading-relaxed">{authError}</div>
              </div>
            )}

            {/* Quick Google 1-Click Button */}
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isSubmitting}
                className="w-full h-11 bg-white hover:bg-gray-100 text-gray-900 font-bold text-xs rounded-xl flex items-center justify-center gap-2.5 transition active:scale-[0.98] shadow-md cursor-pointer disabled:opacity-60"
              >
                {isGoogleLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>Conectando con Google...</span>
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    <span>
                      {isExistingCustomer ? 'Entrar con Google y Enviar Pedido' : 'Registrarme con Google y Enviar Pedido'}
                    </span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px bg-[#232B3A] flex-1" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">O con tu contraseña</span>
              <div className="h-px bg-[#232B3A] flex-1" />
            </div>

            {/* Phone Badge with Change Option */}
            <div className="bg-[#0D121F] border border-[#232B3A] rounded-xl px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-300 text-xs font-semibold">
                <Phone className="w-3.5 h-3.5 text-[#E63946]" />
                <span>WhatsApp: <strong className="text-white font-mono">{cleanedPhone}</strong></span>
              </div>
              {onChangePhoneRequest && (
                <button
                  type="button"
                  onClick={onChangePhoneRequest}
                  className="text-[10px] text-[#E63946] hover:underline font-bold cursor-pointer"
                >
                  Cambiar
                </button>
              )}
            </div>

            {/* Password Form */}
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black uppercase text-[#A9B2C3] block">
                    {isExistingCustomer ? 'Contraseña de Acceso *' : 'Crea tu Contraseña *'}
                  </label>
                  {isExistingCustomer && (
                    <button
                      type="button"
                      onClick={() => setShowForgotNotice(!showForgotNotice)}
                      className="text-[10px] text-[#E63946] hover:underline font-bold cursor-pointer"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                    <Lock className="w-4 h-4 text-[#E63946]" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder={isExistingCustomer ? 'Ingresa tu contraseña' : 'Mínimo 4 caracteres (ej: 1234)'}
                    className="w-full h-11 bg-white border border-[#232B3A] focus:border-[#E63946] rounded-xl pl-10 pr-10 text-xs font-semibold outline-none text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-[#E63946]/20 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-700 cursor-pointer"
                    title={showPassword ? "Ocultar" : "Ver"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Forgot password quick guidance */}
                {showForgotNotice && (
                  <div className="mt-2 bg-[#090D16] border border-[#232E42] p-2.5 rounded-xl text-[10px] text-gray-300 space-y-1.5 animate-fade-in">
                    <p className="font-semibold">
                      Puedes ingresar en 1 clic usando el botón de <strong>Google</strong> arriba con tu correo, o comunicarte con nuestro soporte:
                    </p>
                    <a
                      href={`https://wa.me/573106502043?text=${encodeURIComponent(`Hola soporte Ryyco, necesito ayuda para ingresar a mi cuenta de cliente con el número ${cleanedPhone}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#25D366] hover:underline font-bold text-[11px]"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Contactar soporte por WhatsApp
                    </a>
                  </div>
                )}
              </div>

              {/* Buyer terms for registration */}
              {!isExistingCustomer && (
                <div className="flex items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="order-auth-terms"
                    checked={acceptedBuyerTerms}
                    onChange={(e) => setAcceptedBuyerTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#E63946] rounded cursor-pointer"
                  />
                  <label htmlFor="order-auth-terms" className="text-[10px] text-gray-300 leading-snug cursor-pointer select-none">
                    Acepto los{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsBuyerTermsModalOpen(true);
                      }}
                      className="text-[#E63946] underline font-bold hover:text-red-400"
                    >
                      Términos y Condiciones para Usuarios y Compradores
                    </button>
                  </label>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isGoogleLoading}
                className="w-full py-3 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-[#E63946]/30 cursor-pointer disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Procesando y Confirmando Pedido...</span>
                  </>
                ) : isExistingCustomer ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Iniciar Sesión y Confirmar Pedido 🚀</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Crear Cuenta y Confirmar Pedido 🚀</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </motion.div>

      {/* Buyer Terms Modal */}
      <BuyerTermsModal
        isOpen={isBuyerTermsModalOpen}
        onClose={() => setIsBuyerTermsModalOpen(false)}
        onAccept={() => {
          setAcceptedBuyerTerms(true);
          setIsBuyerTermsModalOpen(false);
        }}
      />
    </div>
  );
}
