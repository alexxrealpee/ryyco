/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  Tag,
  Truck,
  FileText,
  TrendingUp,
  ShieldCheck,
  Check,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Send,
  HelpCircle,
  Phone,
  Mail,
  Store,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  User,
  Copy,
  ExternalLink,
  Lock,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { auth } from '../firebase/config';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { SupplierCategory, SupplierApplication } from '../types/ryycoB2B';
import { sanitizeRyycoPhone } from '../utils/ryycoFormatters';
import {
  diagnoseFirebaseAuthError,
  FirebaseAuthDiagnosis,
} from '../utils/firebaseAuthErrors';
import { WarehouseLocationPickerMap } from './WarehouseLocationPickerMap';
import { RyycoLogo } from './RyycoLogo';

interface SupplierLandingViewProps {
  onSubmitApplication: (app: Omit<SupplierApplication, 'id' | 'status' | 'createdAt'>) => void;
  onNavigateMarketplace: () => void;
  onOpenSupplierLogin?: () => void;
}

const CATEGORIES: SupplierCategory[] = [
  'Frutas y Verduras',
  'Cárnicos y Embutidos',
  'Lácteos y Quesos',
  'Aceites y Abarrotes',
  'Empaques Biodegradables',
  'Bebidas y Licores',
];

export const SupplierLandingView: React.FC<SupplierLandingViewProps> = ({
  onSubmitApplication,
  onNavigateMarketplace,
  onOpenSupplierLogin,
}) => {
  const formRef = useRef<HTMLDivElement>(null);
  const beneficiosRef = useRef<HTMLDivElement>(null);
  const comoFuncionaRef = useRef<HTMLDivElement>(null);

  // Navegación móvil
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Google Integration State (Paso 1 del registro)
  const [googleUser, setGoogleUser] = useState<{
    uid: string;
    email: string;
    displayName: string | null;
    photoURL: string | null;
  } | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Form State
  const [tradeName, setTradeName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [nit, setNit] = useState('');
  const [category, setCategory] = useState<SupplierCategory>('Frutas y Verduras');
  const [city, setCity] = useState('Ipiales');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 0.8305, lng: -77.6462 });
  const [contactName, setContactName] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedApplication, setSubmittedApplication] = useState<{
    id: string;
    tradeName: string;
    contactWhatsapp: string;
  } | null>(null);

  // FAQ state (primer ítem abierto por defecto)
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const [diagnosis, setDiagnosis] = useState<FirebaseAuthDiagnosis | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualGoogleEmail, setManualGoogleEmail] = useState('');
  const [showManualEmailInput, setShowManualEmailInput] = useState(false);

  const handleCopyDomain = (domain: string) => {
    navigator.clipboard.writeText(domain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const scrollToSection = (section: 'postulacion' | 'beneficios' | 'como-funciona') => {
    setIsMobileNavOpen(false);
    if (section === 'postulacion') {
      formRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (section === 'beneficios') {
      beneficiosRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (section === 'como-funciona') {
      comoFuncionaRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSignInGoogle = async () => {
    setIsGoogleLoading(true);
    setGoogleError(null);
    setDiagnosis(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, provider);
      if (res.user && res.user.email) {
        setGoogleUser({
          uid: res.user.uid,
          email: res.user.email,
          displayName: res.user.displayName,
          photoURL: res.user.photoURL,
        });
        setEmail(res.user.email);
        if (!contactName.trim() && res.user.displayName) {
          setContactName(res.user.displayName);
        }
      }
    } catch (err: unknown) {
      console.error('Google Sign-in error for supplier registration:', err);
      const diag = diagnoseFirebaseAuthError(err);
      setDiagnosis(diag);
      setGoogleError(diag.description);
      setShowManualEmailInput(true);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleApplyManualEmail = () => {
    if (!manualGoogleEmail.trim() || !manualGoogleEmail.includes('@')) {
      setGoogleError('Por favor ingresa un correo electrónico corporativo válido.');
      return;
    }
    const cleanEmail = manualGoogleEmail.trim().toLowerCase();
    setGoogleUser({
      uid: `manual-google-${Date.now()}`,
      email: cleanEmail,
      displayName: cleanEmail.split('@')[0].toUpperCase(),
      photoURL: null,
    });
    setEmail(cleanEmail);
    if (!contactName.trim()) {
      setContactName(cleanEmail.split('@')[0]);
    }
    setGoogleError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!googleUser) {
      setGoogleError('Es indispensable vincular primero tu cuenta de Google en el Paso 1 antes de enviar la postulación.');
      formRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (!tradeName.trim() || !nit.trim() || !contactWhatsapp.trim()) return;

    setIsSubmitting(true);
    const cleanWhatsapp = sanitizeRyycoPhone(contactWhatsapp);

    setTimeout(() => {
      const generatedId = `app-sup-${Date.now().toString().slice(-6)}`;
      onSubmitApplication({
        googleUid: googleUser.uid,
        googleEmail: googleUser.email,
        googlePhotoUrl: googleUser.photoURL || undefined,
        tradeName: tradeName.trim(),
        businessName: businessName.trim() || `${tradeName.trim()} S.A.S.`,
        nit: nit.trim(),
        category,
        city: city.trim() || 'Ipiales',
        address: address.trim() || 'Zona Industrial, Ipiales',
        lat: coords.lat,
        lng: coords.lng,
        contactName: contactName.trim() || googleUser.displayName || 'Representante Comercial',
        contactWhatsapp: cleanWhatsapp,
        email: email.trim() || googleUser.email,
        estimatedSkuCount: 1,
        message:
          message.trim() ||
          `Postulación oficial como proveedor mayorista en ${category}. Capacidad de despacho inmediata.`,
      });

      setSubmittedApplication({
        id: generatedId,
        tradeName: tradeName.trim(),
        contactWhatsapp: cleanWhatsapp,
      });

      setIsSubmitting(false);
    }, 600);
  };

  const faqs = [
    {
      q: '¿Qué pasa después de enviar mi solicitud?',
      a: 'Nuestro equipo de operaciones en RYYCO Central valida tu NIT, datos de contacto y antecedentes comerciales. En un plazo máximo de 24 a 48 horas hábiles te notificamos y habilitamos el acceso a tu portal para que comiences a publicar insumos y recibir pedidos.',
    },
    {
      q: '¿Qué condiciones puedo definir?',
      a: 'Tienes control total sobre tus precios mayoristas, montos mínimos de compra, flete base, compras con envío gratuito, cobertura geográfica por zonas y días/horarios de entrega o recogida en bodega.',
    },
    {
      q: '¿Cómo funcionan los productos de peso variable?',
      a: 'Para cárnicos, quesos o verduras que se cobran según gramaje o pesaje final, el sistema muestra un precio de referencia al restaurante y te permite confirmar el peso y monto exacto antes del despacho final.',
    },
    {
      q: '¿Tiene costo registrarse como proveedor?',
      a: 'No. La postulación y verificación en RYYCO Central es 100% gratuita. Solo aplicamos la comisión acordada sobre ventas efectivas confirmadas por los restaurantes.',
    },
  ];

  const isFormValid =
    !!googleUser &&
    tradeName.trim().length > 0 &&
    nit.trim().length > 0 &&
    contactWhatsapp.trim().length > 0;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-red-100 selection:text-[#E52243]">
      {/* 1. HEADER / NAVBAR OFICIAL RYYCO */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Logo RYYCO */}
          <div
            onClick={onNavigateMarketplace}
            className="flex items-center gap-2 cursor-pointer transition-transform hover:scale-[1.02]"
            title="Ir al Catálogo Mayorista RYYCO"
          >
            <RyycoLogo variant="dark" className="h-8 sm:h-9" showSubtitle={false} />
          </div>

          {/* Menú Desktop Central */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-bold text-gray-700">
            <button
              type="button"
              onClick={() => scrollToSection('beneficios')}
              className="hover:text-[#E52243] transition-colors cursor-pointer"
            >
              Beneficios
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('como-funciona')}
              className="hover:text-[#E52243] transition-colors cursor-pointer"
            >
              Cómo funciona
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('postulacion')}
              className="hover:text-[#E52243] transition-colors cursor-pointer"
            >
              Postular empresa
            </button>
          </nav>

          {/* Botón Ingresar al Portal (Desktop) */}
          <div className="hidden md:flex items-center gap-3">
            {onOpenSupplierLogin && (
              <button
                type="button"
                onClick={onOpenSupplierLogin}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#E52243] text-[#E52243] hover:bg-red-50 text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              >
                <User className="w-4 h-4 text-[#E52243]" />
                <span>Ingresar al portal</span>
              </button>
            )}
          </div>

          {/* Botón Hamburguesa Móvil */}
          <div className="md:hidden flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
              className="p-2 text-gray-700 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Abrir menú"
            >
              {isMobileNavOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Drawer de Navegación Móvil */}
        {isMobileNavOpen && (
          <div className="md:hidden bg-white border-b border-gray-200 px-5 py-4 space-y-3 animate-in slide-in-from-top-2 duration-150">
            <button
              type="button"
              onClick={() => scrollToSection('beneficios')}
              className="block w-full text-left py-2 text-sm font-bold text-gray-800 hover:text-[#E52243]"
            >
              Beneficios
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('como-funciona')}
              className="block w-full text-left py-2 text-sm font-bold text-gray-800 hover:text-[#E52243]"
            >
              Cómo funciona
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('postulacion')}
              className="block w-full text-left py-2 text-sm font-bold text-gray-800 hover:text-[#E52243]"
            >
              Postular empresa
            </button>

            {onOpenSupplierLogin && (
              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileNavOpen(false);
                    onOpenSupplierLogin();
                  }}
                  className="w-full py-2.5 rounded-xl border border-[#E52243] text-[#E52243] font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-50"
                >
                  <User className="w-4 h-4" />
                  <span>Ingresar al portal de proveedores</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* 2. SUB-BARRA DE RETORNO AL CATÁLOGO */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-2">
        <button
          type="button"
          onClick={onNavigateMarketplace}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-[#E52243] transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Volver al catálogo</span>
        </button>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 space-y-20 sm:space-y-24">
        {/* 3. HERO SECTION */}
        <section className="pt-4 sm:pt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Columna Izquierda: Copy + CTAs */}
          <div className="lg:col-span-7 space-y-5">
            {/* Tag Ámbar */}
            <div>
              <span className="hidden sm:inline-block text-xs font-extrabold uppercase tracking-wider text-amber-600">
                CONVOCATORIA PARA PROVEEDORES
              </span>
              <span className="sm:hidden text-xs font-extrabold uppercase tracking-wider text-amber-600">
                PARA PROVEEDORES
              </span>
            </div>

            {/* Headline Principal */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-950 tracking-tight leading-[1.15]">
              Tu próximo cliente está en{' '}
              <span className="text-[#E52243]">RYYCO.</span>
            </h1>

            {/* Bajada */}
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-xl">
              Vende al por mayor a restaurantes y gestiona tus productos, precios y pedidos desde un solo lugar.
            </p>

            {/* Botones de Acción */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={() => scrollToSection('postulacion')}
                className="py-3 px-6 bg-[#E52243] hover:bg-[#D1132A] text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <span>Postular mi empresa</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {onOpenSupplierLogin && (
                <button
                  type="button"
                  onClick={onOpenSupplierLogin}
                  className="py-3 px-6 bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition-colors text-center cursor-pointer"
                >
                  Ya soy proveedor
                </button>
              )}
            </div>

            {/* Enlace secundario: Explorar catálogo de restaurantes */}
            <div className="pt-1">
              <button
                type="button"
                onClick={onNavigateMarketplace}
                className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-[#E52243] transition-colors cursor-pointer group"
              >
                <FileText className="w-4 h-4 text-gray-500 group-hover:text-[#E52243]" />
                <span>Explorar catálogo de restaurantes</span>
              </button>
            </div>
          </div>

          {/* Columna Derecha: Ilustración Bolsa RYYCO */}
          <div className="lg:col-span-5 flex justify-center items-center relative">
            <div className="relative w-full max-w-sm sm:max-w-md">
              {/* Resplandor circular de fondo suave */}
              <div className="absolute inset-0 m-auto w-64 h-64 sm:w-80 sm:h-80 bg-amber-100/50 rounded-full blur-3xl pointer-events-none" />

              <img
                src="/assets/bolsa-ryyco-hero.webp"
                alt="RYYCO Proveedores Mayoristas"
                className="relative z-10 w-full h-auto object-contain drop-shadow-xl"
                onError={(e) => {
                  // Fallback a imagen de bolsa alternativa si no carga
                  const target = e.currentTarget;
                  if (!target.src.includes('bolsa-carrito.png')) {
                    target.src = '/assets/bolsa-carrito.png';
                  }
                }}
              />
            </div>
          </div>
        </section>

        {/* 4. TRES HIGHLIGHTS DE VALOR */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 pt-2">
          {/* Card 1: Control de precios */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-shadow flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
              <Tag className="w-5 h-5 text-amber-500" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-snug">
                Control de tus precios
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Tú defines tus precios mayoristas.
              </p>
            </div>
          </div>

          {/* Card 2: Condiciones de entrega propias */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-shadow flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-snug">
                Condiciones de entrega propias
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Define mínimos, flete y horarios de despacho.
              </p>
            </div>
          </div>

          {/* Card 3: Pedidos directos */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-shadow flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-[#E52243]" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-snug">
                Pedidos directos
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Recibe pedidos de restaurantes de la red RYYCO.
              </p>
            </div>
          </div>
        </section>

        {/* 5. SECCIÓN BENEFICIOS */}
        <section ref={beneficiosRef} className="space-y-8 pt-4">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-600">
              BENEFICIOS
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-950 tracking-tight">
              Todo para abastecer más negocios
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              Únete a la red de abastecimiento de RYYCO y conecta con restaurantes de forma simple y segura.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Beneficio 1 */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-6 shadow-2xs hover:shadow-md transition-shadow space-y-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-[#E52243]">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-gray-900">
                Compras recurrentes
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Recibe solicitudes de reposición de los restaurantes.
              </p>
            </div>

            {/* Beneficio 2 */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-6 shadow-2xs hover:shadow-md transition-shadow space-y-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500">
                <Truck className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-gray-900">
                Tu logística, tus condiciones
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Define mínimos, flete y horarios de despacho.
              </p>
            </div>

            {/* Beneficio 3 */}
            <div className="bg-white rounded-2xl border border-gray-200/90 p-6 shadow-2xs hover:shadow-md transition-shadow space-y-3">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-gray-900">
                Proveedor homologado
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                La revisión de RYYCO ayuda a generar confianza.
              </p>
            </div>
          </div>
        </section>

        {/* 6. SECCIÓN CÓMO FUNCIONA */}
        <section ref={comoFuncionaRef} className="space-y-10 pt-4">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-600">
              CÓMO FUNCIONA
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-950 tracking-tight">
              Así te unes a la red
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              Un proceso simple para ser parte del abastecimiento de restaurantes.
            </p>
          </div>

          {/* Stepper Horizontal en PC */}
          <div className="hidden lg:grid lg:grid-cols-7 items-center gap-2 max-w-5xl mx-auto">
            {/* Paso 1 */}
            <div className="space-y-2 text-center">
              <div className="w-10 h-10 rounded-full bg-[#E52243] text-white font-extrabold text-sm flex items-center justify-center mx-auto shadow-xs">
                1
              </div>
              <h4 className="font-extrabold text-sm text-gray-900">
                Postula tu empresa
              </h4>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Completa el formulario con tus datos comerciales.
              </p>
            </div>

            {/* Chevron 1 -> 2 */}
            <div className="flex justify-center text-gray-300">
              <ChevronRight className="w-5 h-5" />
            </div>

            {/* Paso 2 */}
            <div className="space-y-2 text-center">
              <div className="w-10 h-10 rounded-full bg-amber-500 text-white font-extrabold text-sm flex items-center justify-center mx-auto shadow-xs">
                2
              </div>
              <h4 className="font-extrabold text-sm text-gray-900">
                Revisión RYYCO
              </h4>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Nuestro equipo valida tu información.
              </p>
            </div>

            {/* Chevron 2 -> 3 */}
            <div className="flex justify-center text-gray-300">
              <ChevronRight className="w-5 h-5" />
            </div>

            {/* Paso 3 */}
            <div className="space-y-2 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center mx-auto shadow-xs">
                3
              </div>
              <h4 className="font-extrabold text-sm text-gray-900">
                Aprobación y activación
              </h4>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Te notificaremos por correo cuando tu empresa sea habilitada.
              </p>
            </div>

            {/* Chevron 3 -> 4 */}
            <div className="flex justify-center text-gray-300">
              <ChevronRight className="w-5 h-5" />
            </div>

            {/* Paso 4 */}
            <div className="space-y-2 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-500 text-white font-extrabold text-sm flex items-center justify-center mx-auto shadow-xs">
                4
              </div>
              <h4 className="font-extrabold text-sm text-gray-900">
                Publica y despacha
              </h4>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Carga tus productos, define tus condiciones y comienza a recibir pedidos.
              </p>
            </div>
          </div>

          {/* Stepper Vertical en Móvil y Tablet */}
          <div className="lg:hidden space-y-6 max-w-md mx-auto pl-2">
            {/* Paso 1 */}
            <div className="flex items-start gap-4 relative">
              <div className="w-9 h-9 rounded-full bg-[#E52243] text-white font-extrabold text-sm flex items-center justify-center shrink-0 shadow-xs">
                1
              </div>
              <div className="space-y-0.5 pt-0.5">
                <h4 className="font-extrabold text-sm text-gray-900">
                  Postula tu empresa
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Completa el formulario con tus datos comerciales.
                </p>
              </div>
            </div>

            {/* Paso 2 */}
            <div className="flex items-start gap-4 relative">
              <div className="w-9 h-9 rounded-full bg-amber-500 text-white font-extrabold text-sm flex items-center justify-center shrink-0 shadow-xs">
                2
              </div>
              <div className="space-y-0.5 pt-0.5">
                <h4 className="font-extrabold text-sm text-gray-900">
                  Revisión RYYCO
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Nuestro equipo valida tu información.
                </p>
              </div>
            </div>

            {/* Paso 3 */}
            <div className="flex items-start gap-4 relative">
              <div className="w-9 h-9 rounded-full bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center shrink-0 shadow-xs">
                3
              </div>
              <div className="space-y-0.5 pt-0.5">
                <h4 className="font-extrabold text-sm text-gray-900">
                  Aprobación y activación
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Te notificaremos por correo cuando tu empresa sea habilitada.
                </p>
              </div>
            </div>

            {/* Paso 4 */}
            <div className="flex items-start gap-4 relative">
              <div className="w-9 h-9 rounded-full bg-blue-500 text-white font-extrabold text-sm flex items-center justify-center shrink-0 shadow-xs">
                4
              </div>
              <div className="space-y-0.5 pt-0.5">
                <h4 className="font-extrabold text-sm text-gray-900">
                  Publica y despacha
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Carga tus productos, define tus condiciones y comienza a recibir pedidos.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FORMULARIO DE POSTULACIÓN */}
        <section ref={formRef} id="postulacion" className="max-w-4xl mx-auto pt-4">
          <div className="bg-white rounded-3xl border border-gray-200/90 p-6 sm:p-10 shadow-xs space-y-8">
            {/* Header del Formulario */}
            <div className="space-y-1 pb-4 border-b border-gray-100">
              <h2 className="text-2xl sm:text-3xl font-black text-gray-950 tracking-tight">
                Postula tu empresa proveedora
              </h2>
              <p className="text-xs sm:text-sm text-gray-500">
                Completa tus datos para iniciar la revisión.
              </p>
            </div>

            {/* Banner de Éxito al Enviar Solicitud */}
            {submittedApplication && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 space-y-4 animate-in fade-in">
                <div className="flex items-center gap-3 text-emerald-800">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                  <div>
                    <h3 className="font-extrabold text-base">
                      ¡Postulación enviada exitosamente!
                    </h3>
                    <p className="text-xs text-emerald-700">
                      Radicado: <span className="font-mono font-bold">{submittedApplication.id}</span> · Empresa: <span className="font-bold">{submittedApplication.tradeName}</span>
                    </p>
                  </div>
                </div>

                <p className="text-xs text-emerald-800 leading-relaxed">
                  Tu solicitud ya se encuentra registrada en <strong>RYYCO Central</strong>. Nuestro equipo validará el NIT y te contactará por WhatsApp para la activación.
                </p>

                <div className="pt-2 flex flex-wrap gap-3">
                  <a
                    href={`https://wa.me/573164167447?text=${encodeURIComponent(
                      `Hola RYYCO Central, acabo de postular mi empresa proveedora "${submittedApplication.tradeName}" con radicado ${submittedApplication.id}. Quisiera agilizar la revisión.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Contactar a RYYCO por WhatsApp</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setSubmittedApplication(null)}
                    className="px-4 py-2.5 bg-white border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl hover:bg-emerald-100/50 transition-colors"
                  >
                    Enviar otra postulación
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* PASO 1: VINCULAR CUENTA DE GOOGLE */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500 text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    1
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-gray-900 leading-snug">
                      Vincula tu cuenta de Google
                    </h3>
                    <p className="text-xs text-gray-500">
                      Será tu acceso al portal cuando tu empresa sea aprobada.
                    </p>
                  </div>
                </div>

                {/* Caja de Google Auth */}
                <div className="pl-10">
                  {!googleUser ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleSignInGoogle}
                        disabled={isGoogleLoading}
                        className="w-full sm:w-auto min-w-[260px] py-3 px-6 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl font-bold text-xs sm:text-sm text-gray-800 shadow-2xs transition-all flex items-center justify-center gap-3 cursor-pointer"
                      >
                        {/* Ícono Oficial Multicolor de Google */}
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
                        <span>{isGoogleLoading ? 'Conectando con Google...' : 'Continuar con Google'}</span>
                      </button>

                      {/* Enlace alternativo si popup bloqueado */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowManualEmailInput(!showManualEmailInput)}
                          className="text-[11px] text-[#E52243] hover:underline font-semibold cursor-pointer"
                        >
                          ¿No se abre la ventana? Ingresar directamente
                        </button>
                      </div>

                      {/* Fallback de Email Directo */}
                      {showManualEmailInput && (
                        <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 max-w-md animate-in fade-in">
                          <label className="block text-xs font-bold text-gray-700">
                            Correo corporativo de Google:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              value={manualGoogleEmail}
                              onChange={(e) => setManualGoogleEmail(e.target.value)}
                              placeholder="Ej. ventas@miempresa.com"
                              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-hidden focus:border-[#E52243]"
                            />
                            <button
                              type="button"
                              onClick={handleApplyManualEmail}
                              className="px-3 py-2 bg-[#E52243] hover:bg-[#D1132A] text-white font-bold text-xs rounded-lg transition-colors"
                            >
                              Vincular
                            </button>
                          </div>
                          {diagnosis && (
                            <p className="text-[11px] text-gray-500 leading-tight">
                              Nota: {diagnosis.description}
                            </p>
                          )}
                        </div>
                      )}

                      {googleError && !showManualEmailInput && (
                        <p className="text-xs text-red-600 font-medium">
                          {googleError}
                        </p>
                      )}
                    </div>
                  ) : (
                    /* Estado Vinculado */
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3 max-w-md">
                      <div className="flex items-center gap-3">
                        {googleUser.photoURL ? (
                          <img
                            src={googleUser.photoURL}
                            alt={googleUser.displayName || 'Google'}
                            className="w-9 h-9 rounded-full border border-emerald-300 object-cover"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                            {googleUser.email.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Cuenta vinculada</span>
                          </div>
                          <p className="text-xs text-emerald-800 font-mono">
                            {googleUser.email}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setGoogleUser(null);
                          setShowManualEmailInput(false);
                        }}
                        className="text-[11px] text-gray-500 hover:text-red-600 font-bold underline cursor-pointer"
                      >
                        Cambiar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* PASO 2: INFORMACIÓN DE TU EMPRESA */}
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500 text-white font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    2
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-gray-900 leading-snug">
                      Información de tu empresa
                    </h3>
                  </div>
                </div>

                <div className="pl-10 space-y-4">
                  {/* Fila 1: Nombre comercial y Razón social */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-800">
                        Nombre comercial *
                      </label>
                      <input
                        type="text"
                        required
                        value={tradeName}
                        onChange={(e) => setTradeName(e.target.value)}
                        placeholder="Ej. Frutas del Valle"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-800">
                        Razón social *
                      </label>
                      <input
                        type="text"
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Ej. Frutas del Valle S.A.S."
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243]"
                      />
                    </div>
                  </div>

                  {/* Fila 2: NIT y Categoría principal */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-800">
                        NIT / Identificación tributaria *
                      </label>
                      <input
                        type="text"
                        required
                        value={nit}
                        onChange={(e) => setNit(e.target.value)}
                        placeholder="Ej. 901234567"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-800">
                        Categoría principal *
                      </label>
                      <div className="relative">
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value as SupplierCategory)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] appearance-none cursor-pointer pr-10"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-3 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Fila 3: Ciudad/zonas y Dirección de bodega con Mapa Interactivo */}
                  <div className="space-y-3 pt-1 pb-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-800 flex items-center justify-between">
                          <span>Ciudad identificada *</span>
                          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            Detectada en mapa
                          </span>
                        </label>
                        <input
                          type="text"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Ej. Ipiales, Pasto, Nariño"
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-800 flex items-center justify-between">
                          <span>Dirección de bodega o punto de despacho</span>
                          <span className="text-[10px] text-gray-400 font-medium">Autocompletada</span>
                        </label>
                        <input
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Ej. Cra. 10 # 5-20, Ipiales"
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243]"
                        />
                      </div>
                    </div>

                    {/* Mapa interactivo para fijar bodega o punto de despacho */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-gray-900 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#E52243]" />
                          <span>Fijar ubicación de bodega o despacho en el mapa:</span>
                        </span>
                        <span className="text-[11px] text-gray-500 hidden sm:inline">
                          Haz clic o arrastra el pin para autocompletar la dirección y la ciudad
                        </span>
                      </div>

                      <WarehouseLocationPickerMap
                        lat={coords.lat}
                        lng={coords.lng}
                        address={address}
                        city={city}
                        tradeName={tradeName || 'Bodega del Proveedor'}
                        onChange={(data) => {
                          setCoords({ lat: data.lat, lng: data.lng });
                          if (data.address) {
                            setAddress(data.address);
                          }
                          if (data.city) {
                            setCity(data.city);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Fila 4: Contacto comercial y WhatsApp comercial */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-800">
                        Contacto comercial *
                      </label>
                      <input
                        type="text"
                        required
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-800">
                        WhatsApp comercial *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-emerald-600">
                          <Phone className="w-4 h-4" />
                        </span>
                        <input
                          type="tel"
                          required
                          value={contactWhatsapp}
                          onChange={(e) => setContactWhatsapp(e.target.value)}
                          placeholder="Ej. 321 456 7890"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fila 5: Correo de notificaciones */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-800">
                      Correo de notificaciones
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ej. ventas@miempresa.com"
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243]"
                    />
                  </div>

                  {/* Fila 6: Descripción de productos y capacidad de entrega */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-800">
                      Descripción de productos y capacidad de entrega
                    </label>
                    <textarea
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe los productos que ofreces, presentaciones, capacidad de producción o abastecimiento, cobertura de entregas, etc."
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] resize-none"
                    />
                  </div>

                  {/* Cuadros de Aviso del Mockup */}
                  <div className="space-y-2.5 pt-2">
                    {/* Aviso 1: Validación previa */}
                    <div className="bg-[#F9FAFB] border border-gray-200/80 rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-gray-600">
                      <ShieldCheck className="w-4 h-4 text-gray-500 shrink-0" />
                      <span>RYYCO revisará tus datos antes de habilitar el perfil de proveedor.</span>
                    </div>

                    {/* Aviso 2: Alerta si Google no está vinculado */}
                    {!googleUser && (
                      <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-amber-800 font-medium">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Vincula tu cuenta de Google para enviar la postulación.</span>
                      </div>
                    )}
                  </div>

                  {/* Botón de Envío */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={!isFormValid || isSubmitting}
                      className={`w-full py-3 px-6 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                        isFormValid && !isSubmitting
                          ? 'bg-[#E52243] hover:bg-[#D1132A] text-white shadow-xs hover:shadow-md cursor-pointer active:scale-[0.99]'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <Send className="w-4 h-4" />
                      <span>{isSubmitting ? 'Enviando postulación...' : 'Enviar solicitud'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* 8. SECCIÓN PREGUNTAS FRECUENTES */}
        <section className="space-y-8 max-w-4xl mx-auto pt-4">
          <div className="text-center space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-600">
              PREGUNTAS FRECUENTES
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-950 tracking-tight">
              Resolvemos tus dudas
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              Encuentra aquí las respuestas a las consultas más comunes.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-2xs transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-gray-900 hover:text-[#E52243] transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ${
                        isOpen ? 'rotate-180 text-[#E52243]' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 text-xs text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* 9. FOOTER OFICIAL RYYCO */}
      <footer className="border-t border-gray-200/80 bg-white py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
            <RyycoLogo variant="dark" className="h-7" showSubtitle={false} />
            <span className="hidden sm:inline text-gray-300">|</span>
            <span className="text-xs text-gray-500 font-medium">
              Red B2B de abastecimiento para restaurantes.
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs text-gray-500 font-medium">
            <button
              type="button"
              onClick={() => alert('RYYCO S.A.S. - Términos y condiciones del ecosistema mercantil B2B.')}
              className="hover:text-gray-900 transition-colors cursor-pointer"
            >
              Términos y condiciones
            </button>
            <button
              type="button"
              onClick={() => alert('Política de tratamiento de datos personales y confidencialidad comercial de RYYCO.')}
              className="hover:text-gray-900 transition-colors cursor-pointer"
            >
              Política de privacidad
            </button>
            <a
              href="https://wa.me/573164167447"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#E52243] transition-colors"
            >
              Contacto
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
