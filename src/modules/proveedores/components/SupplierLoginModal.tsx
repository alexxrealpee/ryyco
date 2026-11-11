/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Store,
  Clock,
  AlertCircle,
  Copy,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { RyycoSupplier, SupplierApplication } from '../types/ryycoB2B';
import { auth } from '../firebase/config';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  diagnoseFirebaseAuthError,
  FirebaseAuthDiagnosis,
} from '../utils/firebaseAuthErrors';
import { saveSupplierInFirestore } from '../firebase/b2bRepository';

interface SupplierLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (supplier: RyycoSupplier) => void;
  onNavigateToLanding: () => void;
  suppliers: RyycoSupplier[];
  applications: SupplierApplication[];
}

export const SupplierLoginModal: React.FC<SupplierLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onNavigateToLanding,
  suppliers,
  applications,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<FirebaseAuthDiagnosis | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingNotice, setPendingNotice] = useState<{
    tradeName: string;
    id: string;
    whatsapp: string;
    email: string;
  } | null>(null);
  const [rejectedNotice, setRejectedNotice] = useState<{
    tradeName: string;
    reason?: string;
  } | null>(null);

  const handleCopyDomain = (domain: string) => {
    navigator.clipboard.writeText(domain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Escuchar tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setPendingNotice(null);
    setRejectedNotice(null);
    setDiagnosis(null);
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user) {
        throw new Error('No se recibió información de la cuenta de Google.');
      }

      const googleEmail = (user.email || '').toLowerCase().trim();
      const googleUid = user.uid;

      // 1. Buscar en proveedores aprobados por googleUid o email
      const matchedSupplier = suppliers.find((s) => {
        const matchUid = s.googleUid && s.googleUid === googleUid;
        const matchEmail = s.email && s.email.toLowerCase().trim() === googleEmail;
        const matchGoogleEmail = s.googleEmail && s.googleEmail.toLowerCase().trim() === googleEmail;
        return matchUid || matchEmail || matchGoogleEmail;
      });

      if (matchedSupplier) {
        if (matchedSupplier.status === 'suspended') {
          setErrorMsg(
            `La cuenta de "${matchedSupplier.tradeName}" se encuentra temporalmente suspendida por RYYCO Central.${
              matchedSupplier.statusReason ? ` Motivo: ${matchedSupplier.statusReason}` : ''
            }`
          );
          return;
        }
        if (matchedSupplier.status === 'inactive') {
          setErrorMsg(
            `La cuenta de "${matchedSupplier.tradeName}" se encuentra inactiva o pausada.${
              matchedSupplier.statusReason ? ` Criterio registrado: ${matchedSupplier.statusReason}` : ''
            }`
          );
          return;
        }
        if (!matchedSupplier.canUploadProducts || matchedSupplier.status === 'pending_verification') {
          setErrorMsg(
            `Tu empresa "${matchedSupplier.tradeName}" está registrada con el correo ${googleEmail}, pero la habilitación para venta aún está en revisión por RYYCO Central.`
          );
          return;
        }

        // Proveedor aprobado y activo
        localStorage.removeItem('ryyco_restaurant_session');

        // Si el proveedor fue dado de alta con correo pero aún no tenía googleUid vinculado, lo enlazamos de inmediato
        const sessionSupplier: RyycoSupplier = {
          ...matchedSupplier,
          googleUid: matchedSupplier.googleUid || googleUid,
          googleEmail: matchedSupplier.googleEmail || googleEmail,
        };

        if (!matchedSupplier.googleUid || !matchedSupplier.googleEmail) {
          saveSupplierInFirestore(sessionSupplier).catch((err) =>
            console.error('Error al sincronizar credenciales de Google:', err)
          );
        }

        onLoginSuccess(sessionSupplier);
        onClose();
        return;
      }

      // Si no existe proveedor pero es el demo o hay solicitud
      const matchedApp = applications.find((a) => {
        const matchUid = a.googleUid && a.googleUid === googleUid;
        const matchEmail = a.email && a.email.toLowerCase().trim() === googleEmail;
        const matchGoogleEmail = a.googleEmail && a.googleEmail.toLowerCase().trim() === googleEmail;
        return matchUid || matchEmail || matchGoogleEmail;
      });

      if (matchedApp) {
        if (matchedApp.status === 'pending' || matchedApp.status === 'reviewed') {
          setPendingNotice({
            tradeName: matchedApp.tradeName,
            id: matchedApp.id,
            whatsapp: matchedApp.contactWhatsapp,
            email: googleEmail,
          });
          return;
        }
        if (matchedApp.status === 'rejected') {
          setRejectedNotice({
            tradeName: matchedApp.tradeName,
            reason: matchedApp.adminNote || matchedApp.rejectionReason,
          });
          return;
        }
      }

      setErrorMsg(
        `No encontramos una empresa proveedora aprobada vinculada al correo "${googleEmail}". Si el administrador te registró directamente, asegúrate de ingresar con la cuenta de Google correspondiente a ese correo, o postula tu empresa.`
      );
    } catch (err: unknown) {
      console.error('Error al iniciar sesión con Google:', err);
      const diag = diagnoseFirebaseAuthError(err);
      setDiagnosis(diag);
      setErrorMsg(diag.description);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Fondo oscuro para cerrar */}
      <div className="fixed inset-0" onClick={onClose} aria-label="Cerrar modal" />

      {/* Contenedor Modal / Bottom Sheet en Celular */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col p-6 sm:p-8 border border-gray-100 max-h-[92vh] overflow-y-auto">
        
        {/* Barra de arrastre en móvil (mockup celular) */}
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 shrink-0" />

        {/* Botón de cerrar X */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer z-20"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo Chef RYYCO con destellos dorados */}
        <div className="flex flex-col items-center text-center space-y-3 pt-1">
          <div className="relative inline-flex items-center justify-center">
            {/* Sombrero de Chef Sonriente RYYCO */}
            <div className="w-14 h-14 flex items-center justify-center">
              <svg viewBox="0 0 100 85" className="w-12 h-10" fill="none">
                <path
                  d="M50 18C44 7 28 6 20 16C12 7 0 12 0 25C0 35 7 42 16 45L12 78C12 80 14 82 17 82H83C86 82 88 80 88 78L84 45C93 42 100 35 100 25C100 12 88 7 80 16C72 6 56 7 50 18Z"
                  fill="#E52243"
                />
                <circle cx="38" cy="56" r="3.5" fill="#FFFFFF" />
                <circle cx="62" cy="56" r="3.5" fill="#FFFFFF" />
                <path
                  d="M38 66C44 72 56 72 62 66"
                  stroke="#FFFFFF"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            {/* Destellos dorados decorativos */}
            <span className="absolute -top-1 -right-2 text-amber-400 font-bold text-lg select-none">✦</span>
            <span className="absolute bottom-1 -left-2 text-amber-400 font-bold text-sm select-none">✦</span>
          </div>

          {/* Badge Portal de Proveedores */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-[11px] font-black uppercase tracking-wider">
            <Store className="w-3.5 h-3.5" />
            <span>PORTAL DE PROVEEDORES</span>
          </div>

          {/* Títulos oficiales del mockup */}
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-[28px] font-extrabold text-gray-950 font-display tracking-tight leading-tight">
              Haz crecer tu negocio<br />con RYYCO
            </h2>
            <h3 className="text-sm font-extrabold text-gray-800">
              Ingresa a tu portal de proveedor
            </h3>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed max-w-sm">
            Usa la cuenta de Google vinculada durante tu postulación para gestionar insumos y pedidos de restaurantes.
          </p>
        </div>

        {/* Notificaciones de estado (pendientes, rechazadas, diagnósticos) */}
        <div className="my-5 space-y-3">
          {pendingNotice && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Solicitud en Proceso de Verificación</span>
              </div>
              <p className="text-gray-700 text-[11px] leading-relaxed">
                La postulación de <strong>{pendingNotice.tradeName}</strong> vinculada a tu cuenta de Google{' '}
                <span className="font-mono text-amber-800">{pendingNotice.email}</span> está siendo revisada por RYYCO Central.
              </p>
            </div>
          )}

          {rejectedNotice && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Solicitud No Aprobada</span>
              </div>
              <p className="text-gray-700 text-[11px]">
                La postulación de <strong>{rejectedNotice.tradeName}</strong> no fue habilitada.
              </p>
            </div>
          )}

          {diagnosis && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2.5 text-xs">
              <div className="flex items-start gap-2 text-amber-900 font-bold">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{diagnosis.title}</span>
              </div>
              <p className="text-gray-600 text-[11px] leading-relaxed">
                {diagnosis.description}
              </p>
              {diagnosis.isDomainError && diagnosis.domainToAuthorize && (
                <div className="pt-2 border-t border-amber-200/80 space-y-2">
                  <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-amber-200">
                    <span className="font-mono text-[11px] text-gray-800 truncate">
                      {diagnosis.domainToAuthorize}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyDomain(diagnosis.domainToAuthorize!)}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold rounded cursor-pointer"
                    >
                      {copied ? '¡Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  {diagnosis.consoleUrl && (
                    <a
                      href={diagnosis.consoleUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-[#E52243] font-bold underline"
                    >
                      <span>Abrir Firebase Console</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {errorMsg && !diagnosis && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-[11px] leading-relaxed">
                {errorMsg}
              </div>
            </div>
          )}

          {/* Botón 1: Continuar con Google */}
          <button
            type="button"
            disabled={isLoading}
            onClick={handleGoogleSignIn}
            className="w-full py-3.5 px-4 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-900 font-bold text-sm rounded-2xl border border-gray-300 shadow-xs flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            )}
            <span>{isLoading ? 'Verificando con Google...' : 'Continuar con Google'}</span>
          </button>
        </div>

        {/* Sección secundaria: Postular empresa */}
        <div className="space-y-3 pt-3 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-500">
            ¿Aún no has postulado tu empresa?
          </p>

          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateToLanding();
            }}
            className="w-full py-3 px-4 bg-white hover:bg-rose-50/50 text-[#E52243] border border-[#E52243] font-bold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Postular mi empresa con Google</span>
            <ArrowRight className="w-4 h-4 text-[#E52243]" />
          </button>

          <p className="text-[11px] text-gray-400 pt-1">
            Acceso para proveedores admitidos
          </p>
        </div>
      </div>
    </div>
  );
};
