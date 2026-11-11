/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Store,
  Building2,
  X,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  ExternalLink,
  LogOut,
  ClipboardList,
  Repeat,
  BarChart2,
  CheckCircle2,
  UserCheck,
} from 'lucide-react';
import { RyycoRestaurantProfile, RyycoSupplier } from '../types/ryycoB2B';
import { AdminUserSession } from './AdminLoginGate';
import { auth } from '../firebase/config';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  diagnoseFirebaseAuthError,
  FirebaseAuthDiagnosis,
} from '../utils/firebaseAuthErrors';

interface RestaurantLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (restaurant: RyycoRestaurantProfile) => void;
  availableRestaurants?: RyycoRestaurantProfile[];
  onOpenSupplierLogin?: () => void;
  onOpenAdminLogin?: () => void;
  currentRestaurantSession?: RyycoRestaurantProfile | null;
  currentSupplierSession?: RyycoSupplier | null;
  currentAdminSession?: AdminUserSession | null;
  onLogoutRestaurant?: () => void;
  onLogoutSupplier?: () => void;
  onLogoutAdmin?: () => void;
  onNavigateSection?: (section: any) => void;
}

export const RestaurantLoginModal: React.FC<RestaurantLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  availableRestaurants = [],
  onOpenSupplierLogin,
  onOpenAdminLogin,
  currentRestaurantSession,
  currentSupplierSession,
  currentAdminSession,
  onLogoutRestaurant,
  onLogoutSupplier,
  onLogoutAdmin,
  onNavigateSection,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<FirebaseAuthDiagnosis | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);

  // Escuchar tecla Escape y resetear vista al abrir
  useEffect(() => {
    if (!isOpen) return;
    setShowRoleSelector(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyDomain = (domain: string) => {
    navigator.clipboard.writeText(domain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Inicio de sesión con Google Oficial
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setDiagnosis(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const existing = availableRestaurants.find(
        (r) =>
          r.email.toLowerCase() === (user.email || '').toLowerCase() ||
          r.uid === user.uid
      );

      let restaurantProfile: RyycoRestaurantProfile;
      if (existing) {
        restaurantProfile = existing;
      } else {
        restaurantProfile = {
          uid: user.uid,
          email: user.email || 'restaurante@ryyco.co',
          role: 'store',
          displayName: user.displayName || 'Mi Restaurante',
          username: (user.displayName || 'restaurante')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-'),
          whatsapp: '573152183282',
          ownerWhatsapp: '573152183282',
          address: 'Carrera 6A #21-21, Ipiales, Nariño',
          city: 'Ipiales',
          neighborhood: 'Centro Histórico',
          lat: 0.8307672,
          lng: -77.6494671,
          layout: 'food',
          subscriptionPlan: 'pro',
          subscriptionStatus: 'active',
          isClosed: false,
          monthlyProcurementBudgetCop: 14500000,
          bankAccounts: [],
        };
      }

      localStorage.removeItem('ryyco_supplier_session');
      localStorage.setItem('ryyco_restaurant_session', JSON.stringify(restaurantProfile));
      onLoginSuccess(restaurantProfile);
      onClose();
    } catch (err: unknown) {
      console.error('Error al iniciar sesión con Google:', err);
      const diag = diagnoseFirebaseAuthError(err);
      setDiagnosis(diag);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRestaurant = (res: RyycoRestaurantProfile) => {
    localStorage.removeItem('ryyco_supplier_session');
    localStorage.setItem('ryyco_restaurant_session', JSON.stringify(res));
    onLoginSuccess(res);
    onClose();
  };

  const hasActiveSession = Boolean(
    currentRestaurantSession || currentSupplierSession || currentAdminSession
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Fondo clicable para cerrar */}
      <div className="fixed inset-0" onClick={onClose} aria-label="Cerrar modal" />

      {/* Modal / Bottom Sheet */}
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl z-10 flex flex-col p-6 sm:p-8 max-h-[95vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 border border-gray-100">
        {/* Barra superior de arrastre en móvil */}
        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto -mt-2 mb-2 sm:hidden shrink-0" />

        {/* Botón de cierre superior derecho */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ============================================================== */}
        {/* CASO A: USUARIO YA ESTÁ LOGUEADO (VERIFICACIÓN DE SESIÓN)      */}
        {/* ============================================================== */}
        {hasActiveSession && !showRoleSelector ? (
          <div className="space-y-5 pt-1">
            {/* Header de verificación de sesión activa */}
            <div className="text-center">
              <div className="flex justify-center mb-2.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>SESIÓN INICIADA Y VERIFICADA</span>
                </span>
              </div>

              {/* Avatar e icono de rol */}
              <div className="relative inline-flex items-center justify-center mx-auto my-1">
                <div className="w-16 h-16 rounded-2xl bg-rose-50 border-2 border-rose-200 flex items-center justify-center text-[#E52243] shadow-xs overflow-hidden">
                  {currentRestaurantSession ? (
                    currentRestaurantSession.photoUrl ? (
                      <img
                        src={currentRestaurantSession.photoUrl}
                        alt={currentRestaurantSession.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Store className="w-8 h-8 text-[#E52243]" />
                    )
                  ) : currentSupplierSession ? (
                    <Building2 className="w-8 h-8 text-amber-600" />
                  ) : (
                    <ShieldCheck className="w-8 h-8 text-emerald-600" />
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs border-2 border-white">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Nombre de cuenta */}
              <h2 className="text-2xl font-black text-gray-950 font-display tracking-tight leading-tight mt-2">
                {currentRestaurantSession?.displayName ||
                  currentSupplierSession?.tradeName ||
                  currentAdminSession?.displayName ||
                  'Usuario RYYCO'}
              </h2>

              {/* Rol y datos */}
              <div className="mt-1 flex items-center justify-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  {currentRestaurantSession
                    ? `@${currentRestaurantSession.username}`
                    : currentSupplierSession
                    ? 'Proveedor Homologado'
                    : 'Administrador Central'}
                </span>
                <span className="text-xs text-gray-500">
                  {currentRestaurantSession?.city ||
                    currentSupplierSession?.city ||
                    'Ipiales, Nariño'}
                </span>
              </div>

              {currentRestaurantSession?.address && (
                <p className="text-xs text-gray-600 font-medium mt-1 truncate max-w-xs mx-auto">
                  {currentRestaurantSession.address}
                </p>
              )}

              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs mx-auto">
                {currentRestaurantSession?.email ||
                  currentSupplierSession?.googleEmail ||
                  currentAdminSession?.email ||
                  ''}
              </p>
            </div>

            {/* Accesos rápidos de navegación según el rol autenticado */}
            <div className="p-3 bg-gray-50/80 border border-gray-200 rounded-2xl space-y-2 text-xs">
              <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider block px-1">
                Accesos directos de tu cuenta
              </span>

              {currentRestaurantSession && (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateSection?.('orders');
                      onClose();
                    }}
                    className="w-full p-2.5 bg-white hover:bg-rose-50 border border-gray-200 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-left font-bold text-gray-900 group"
                  >
                    <div className="flex items-center gap-2.5">
                      <ClipboardList className="w-4 h-4 text-[#E52243]" />
                      <span>Mis Pedidos Mayoristas</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#E52243] group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onNavigateSection?.('automation');
                      onClose();
                    }}
                    className="w-full p-2.5 bg-white hover:bg-rose-50 border border-gray-200 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-left font-bold text-gray-900 group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Repeat className="w-4 h-4 text-[#E52243]" />
                      <span>Compras Recurrentes</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#E52243] group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onNavigateSection?.('comparator');
                      onClose();
                    }}
                    className="w-full p-2.5 bg-white hover:bg-rose-50 border border-gray-200 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-left font-bold text-gray-900 group"
                  >
                    <div className="flex items-center gap-2.5">
                      <BarChart2 className="w-4 h-4 text-[#E52243]" />
                      <span>Comparador de Precios</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#E52243] group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              )}

              {currentSupplierSession && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigateSection?.('supplier_workspace');
                    onClose();
                  }}
                  className="w-full p-2.5 bg-white hover:bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-left font-bold text-gray-900 group"
                >
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-4 h-4 text-amber-700" />
                    <span>Ir a Mi Portal de Proveedor</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}

              {currentAdminSession && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigateSection?.('admin_central');
                    onClose();
                  }}
                  className="w-full p-2.5 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-left font-bold text-gray-900 group"
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Mesa Central SuperAdmin</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </div>

            {/* Accesos adicionales: Portal Proveedor y Administración (ocultos si hay restaurante logueado) */}
            {!currentRestaurantSession && (
              <div className="pt-2 space-y-2">
                {onOpenSupplierLogin && !currentSupplierSession && (
                  <button
                    type="button"
                    onClick={onOpenSupplierLogin}
                    className="w-full py-3 px-4 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl text-gray-800 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
                  >
                    <Building2 className="w-4 h-4 text-amber-600" />
                    <span>Ingreso para Proveedores Mayoristas</span>
                  </button>
                )}

                {onOpenAdminLogin && !currentAdminSession && (
                  <button
                    type="button"
                    onClick={onOpenAdminLogin}
                    className="w-full py-2.5 px-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Administración Central B2B</span>
                  </button>
                )}

                {(currentSupplierSession || currentAdminSession) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (currentSupplierSession) onLogoutSupplier?.();
                      if (currentAdminSession) onLogoutAdmin?.();
                      onClose();
                    }}
                    className="w-full py-3 px-4 bg-rose-50 hover:bg-rose-100 text-[#E52243] border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4 text-[#E52243]" />
                    <span>Cerrar sesión de {currentSupplierSession ? 'Proveedor' : 'Administrador'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ============================================================== */
          /* CASO B: NO HAY USUARIO LOGUEADO O ELIGIÓ CAMBIAR DE CUENTA    */
          /* ============================================================== */
          <div>
            {/* Si venía de una sesión activa, permitir regresar */}
            {hasActiveSession && showRoleSelector && (
              <button
                type="button"
                onClick={() => setShowRoleSelector(false)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 font-bold mb-3 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a mi sesión activa</span>
              </button>
            )}

            {/* Zona Central: Ilustración del chef sonriente con destellos */}
            <div className="text-center pt-2 pb-1">
              <div className="relative inline-flex items-center justify-center mx-auto mb-3">
                {/* Sombrero de chef RYYCO sonriente */}
                <div className="relative">
                  <svg className="w-16 h-16 text-[#E52243]" viewBox="0 0 64 64" fill="none">
                    <path
                      d="M20 25C17.5 25 15 22.5 15 19.5C15 15.5 18 13 22 13C23.5 13 24.5 13.5 25.5 14.5C27 10 31 8 36 8C41 8 45.5 11 46.5 15C47.5 14 49 13.5 50.5 13.5C54.5 13.5 57.5 16.5 57.5 20.5C57.5 23.5 55 25.5 52.5 26L50 44C49.5 47 47 49 44 49H27C24 49 21.5 47 21 44L18.5 26C19 25.5 19.5 25 20 25Z"
                      fill="#E52243"
                      stroke="#E52243"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M27 28C28 26.5 30 26.5 31 28"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M40 28C41 26.5 43 26.5 44 28"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M31 32C33.5 35 37.5 35 40 32"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Destellos amarillos oficiales */}
                  <div className="absolute -top-1 -right-2 text-amber-400">
                    <svg className="w-5 h-5 fill-amber-400" viewBox="0 0 24 24">
                      <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" />
                    </svg>
                  </div>
                  <div className="absolute top-5 -right-3 text-amber-400">
                    <svg className="w-4 h-4 fill-amber-400" viewBox="0 0 24 24">
                      <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Badge: PORTAL DE ACCESOS RYYCO */}
              <div className="flex justify-center mb-3">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#FEF3C7] text-[#92400E] text-xs font-black tracking-wider uppercase">
                  <Store className="w-4 h-4 text-[#92400E]" />
                  <span>PORTAL DE ACCESOS RYYCO</span>
                </span>
              </div>

              {/* Título Principal */}
              <h2 className="text-3xl sm:text-[34px] font-black text-gray-950 font-display tracking-tight leading-tight">
                Inicia sesión<br />en RYYCO
              </h2>

              {/* Subtítulo descriptivo */}
              <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto mt-2">
                Selecciona tu perfil para ingresar a la plataforma de abastecimiento.
              </p>
            </div>

            {/* Diagnóstico en caso de requerir autorizar dominio en Firebase */}
            {diagnosis && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-2.5 text-left">
                <div className="flex items-start gap-2 text-amber-900 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{diagnosis.title}</span>
                </div>
                <p className="text-amber-800 text-[11px] leading-relaxed">
                  {diagnosis.description}
                </p>
                {diagnosis.isDomainError && diagnosis.domainToAuthorize && (
                  <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-amber-200">
                    <span className="font-mono text-[11px] text-gray-800 truncate">
                      {diagnosis.domainToAuthorize}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyDomain(diagnosis.domainToAuthorize!)}
                      className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold rounded-lg cursor-pointer"
                    >
                      {copied ? '¡Copiado!' : 'Copiar'}
                    </button>
                  </div>
                )}
                {diagnosis.consoleUrl && (
                  <a
                    href={diagnosis.consoleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[#E52243] hover:underline font-bold"
                  >
                    <span>Abrir Firebase Console</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}

            {/* Botones de Inicio de Sesión por Rol */}
            <div className="space-y-3 mt-6">
              {/* 1. Inicio de sesión de Restaurante (Google Auth) */}
              <div className="p-3.5 rounded-2xl border-2 border-rose-100 bg-rose-50/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#E52243] uppercase tracking-wide">
                    <Store className="w-3.5 h-3.5" />
                    <span>Restaurante / Negocio</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full">
                    Abastecimiento
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleGoogleSignIn}
                  className="w-full py-3.5 px-4 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl shadow-xs flex items-center justify-center gap-3 transition-all cursor-pointer font-bold text-gray-900 text-sm sm:text-base active:scale-[0.99] disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                      <span>Conectando con Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                      <span>Iniciar sesión como Restaurante</span>
                    </>
                  )}
                </button>

                {/* Link de acceso para restaurantes registrados */}
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (availableRestaurants.length > 0) {
                        handleSelectRestaurant(availableRestaurants[0]);
                      }
                    }}
                    className="text-xs text-gray-500 hover:text-[#E52243] hover:underline font-medium transition-colors cursor-pointer"
                  >
                    Acceso para restaurantes registrados
                  </button>
                </div>
              </div>

              {/* 2. Inicio de sesión de Proveedor */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSupplierLogin?.();
                }}
                className="w-full p-4 bg-white hover:bg-amber-50/70 border-2 border-amber-300 hover:border-amber-400 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer shadow-xs active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Building2 className="w-5 h-5 text-amber-800" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-gray-950 text-sm sm:text-base leading-tight">
                        Iniciar sesión de Proveedor
                      </h4>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-amber-100 text-amber-900 rounded-full">
                        Portal
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                      Publica insumos, gestiona pedidos y despachos
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-amber-600 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              {/* 3. Inicio de sesión de Admin RYYCO Central */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdminLogin?.();
                }}
                className="w-full p-4 bg-white hover:bg-emerald-50/70 border-2 border-emerald-300 hover:border-emerald-400 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer shadow-xs active:scale-[0.99] group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <ShieldCheck className="w-5 h-5 text-emerald-800" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-gray-950 text-sm sm:text-base leading-tight">
                        Iniciar sesión de Admin RYYCO Central
                      </h4>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded-full">
                        Master
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                      Auditoría, aprobación de proveedores y comisiones
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-emerald-600 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              {/* Tarjeta de Seguridad y Confianza (Conexión segura con Google) */}
              <div className="bg-[#F8FAFC] border border-gray-100 rounded-2xl p-3.5 flex items-center gap-3 mt-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-gray-900 text-xs sm:text-sm">
                    Conexión segura y encriptada
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                    Tu información comercial, pedidos y catálogo están protegidos en RYYCO.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
