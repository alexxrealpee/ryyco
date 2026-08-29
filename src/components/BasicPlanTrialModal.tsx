import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  X, 
  ShieldCheck, 
  Sparkles,
  Store,
  UploadCloud,
  CreditCard,
  FileCheck,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import { UserProfile, SubscriptionPayment } from '../types';
import { saveSubscriptionPayment, saveProfile } from '../lib/firebase';

interface BasicPlanTrialModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onGoToPayment: () => void;
  onPaymentSubmitted?: (payment: SubscriptionPayment) => void;
}

export const BasicPlanTrialModal: React.FC<BasicPlanTrialModalProps> = ({
  isOpen,
  onClose,
  profile,
  onGoToPayment,
  onPaymentSubmitted
}) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
    totalPercent: number;
  }>({
    days: 7,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
    totalPercent: 100
  });

  // Direct upload states inside modal
  const [showDirectUpload, setShowDirectUpload] = useState(false);
  const [receiptFileBase64, setReceiptFileBase64] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');
  const [receiptNotes, setReceiptNotes] = useState<string>('');
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [isSuccessSubmitted, setIsSuccessSubmitted] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowDirectUpload(false);
      setReceiptFileBase64('');
      setReceiptFileName('');
      setReceiptNotes('');
      setIsSuccessSubmitted(false);
      return;
    }

    const calculateTime = () => {
      const expiresAt = profile.subscriptionTrialExpires 
        ? new Date(profile.subscriptionTrialExpires).getTime()
        : Date.now() + 7 * 24 * 60 * 60 * 1000;

      const now = Date.now();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true,
          totalPercent: 0
        });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      // Total 7 days in ms
      const totalTrialMs = 7 * 24 * 60 * 60 * 1000;
      const percent = Math.min(100, Math.max(0, (diff / totalTrialMs) * 100));

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        isExpired: false,
        totalPercent: percent
      });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [isOpen, profile.subscriptionTrialExpires]);

  const handleCopyAccount = () => {
    navigator.clipboard.writeText('3219730865');
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setReceiptFileBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDirectSubmitPayment = async () => {
    if (!receiptFileBase64) {
      alert('Por favor selecciona la imagen o captura de tu comprobante de pago.');
      return;
    }

    setIsSubmittingProof(true);
    try {
      const paymentId = `pay_${Date.now()}`;
      const payload: SubscriptionPayment = {
        id: paymentId,
        userId: profile.uid,
        userEmail: profile.email,
        username: profile.username,
        storeName: profile.displayName || profile.username,
        storeWhatsapp: profile.ownerWhatsapp || profile.whatsapp || profile.phone || '',
        storePhone: profile.phone || profile.ownerWhatsapp || profile.whatsapp || '',
        ownerWhatsapp: profile.ownerWhatsapp || profile.whatsapp || profile.phone || '',
        customerServiceWhatsapp: profile.customerServiceWhatsapp || '',
        plan: 'basico',
        amount: 49000,
        status: 'review',
        proofImage: receiptFileBase64,
        notes: receiptNotes || 'Comprobante de pago Plan Básico ($49.000 COP) subido tras creación de primer producto.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        periodLabel: `Suscripción Mensual (Plan Básico) - ${new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}`
      };

      await saveSubscriptionPayment(payload);

      const updatedProfile: UserProfile = {
        ...profile,
        subscriptionPlan: 'basico',
        requestedPlan: 'basico',
        subscriptionStatus: 'under_review'
      };
      await saveProfile(updatedProfile);

      if (onPaymentSubmitted) {
        onPaymentSubmitted(payload);
      }

      setIsSuccessSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err) {
      console.error(err);
      alert('Ocurrió un error al enviar el comprobante. Por favor intenta de nuevo.');
    } finally {
      setIsSubmittingProof(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        id="basic-trial-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-[#0c0e17] border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-950/40 text-white my-auto overflow-hidden"
        >
          {/* Ambient Glows */}
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            id="close-basic-trial-modal-btn"
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-850 transition cursor-pointer"
            aria-label="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>

          {isSuccessSubmitted ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-500/20 animate-pulse">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">¡Comprobante Recibido!</h3>
              <p className="text-xs text-gray-300 max-w-sm mx-auto leading-relaxed">
                Tu comprobante de pago para el <strong className="text-amber-300">Plan Básico ($49.000 COP)</strong> ha sido enviado al equipo de administración para su verificación.
              </p>
              <span className="inline-block text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/40">
                Tu tienda continuará activa sin interrupciones.
              </span>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="text-center space-y-2 relative z-10">
                <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-amber-500/30 rounded-2xl text-amber-400 shadow-inner mb-1">
                  <Clock className="w-8 h-8 animate-pulse stroke-[2.2]" />
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-300 text-[10px] font-black uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  <span>Semana Gratuita de Prueba Activada</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                  Realiza tu Pago de Plan Básico y Sube Comprobante de Pago
                </h2>

                <p className="text-xs text-gray-300 font-medium max-w-md mx-auto leading-relaxed">
                  Has publicado tu producto con éxito. Tu tienda virtual cuenta con <strong className="text-amber-300">1 semana (7 días) de tiempo gratuito</strong>.
                </p>
              </div>

              {/* Countdown Clock Section */}
              <div className="my-5 bg-gray-950/80 border border-gray-850 rounded-2xl p-4 sm:p-5 relative z-10 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Reloj en Reversa — Tiempo Gratuito de Prueba
                  </span>
                  <span className="text-[10px] font-mono font-bold text-amber-400">
                    {timeLeft.isExpired ? 'EXPIRADO' : '1 SEMANA (7 DÍAS)'}
                  </span>
                </div>

                {/* Digital Clock Grid */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 sm:p-3">
                    <span className="block text-xl sm:text-2xl font-black font-mono text-amber-300">
                      {String(timeLeft.days).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider">Días</span>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 sm:p-3">
                    <span className="block text-xl sm:text-2xl font-black font-mono text-white">
                      {String(timeLeft.hours).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider">Horas</span>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 sm:p-3">
                    <span className="block text-xl sm:text-2xl font-black font-mono text-white">
                      {String(timeLeft.minutes).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider">Min</span>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 sm:p-3">
                    <span className="block text-xl sm:text-2xl font-black font-mono text-emerald-400 animate-pulse">
                      {String(timeLeft.seconds).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider">Seg</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-900 h-1.5 rounded-full mt-3.5 overflow-hidden border border-gray-800">
                  <div 
                    className={`h-full transition-all duration-1000 ${
                      timeLeft.totalPercent < 20 ? 'bg-red-500' : timeLeft.totalPercent < 50 ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${timeLeft.totalPercent}%` }}
                  />
                </div>
              </div>

              {/* Explicit Warning Card */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2 relative z-10 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="text-amber-300 font-bold block text-[13px]">
                      Los productos no se mostrarán a los clientes al vencer los 7 días
                    </strong>
                    <p className="text-[11px] text-gray-300 leading-relaxed">
                      El tiempo gratuito es de <strong className="text-white">una semana (7 días)</strong>. Al finalizar este plazo, los productos no se mostrarán a los clientes hasta que realices el pago del <strong className="text-white">Plan Básico ($49.000 COP)</strong> y subas tu comprobante de pago.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bank Details Summary */}
              <div className="mt-3.5 bg-gray-950 border border-gray-900 rounded-2xl p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Canal de Pago:</span>
                  <span className="font-bold text-white">Nequi / Bancolombia</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Número de Cuenta:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-400 text-sm">3219730865</span>
                    <button
                      type="button"
                      onClick={handleCopyAccount}
                      className="p-1 text-gray-400 hover:text-white bg-gray-900 rounded-md transition cursor-pointer"
                      title="Copiar número"
                    >
                      {copiedAccount ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Titular:</span>
                  <span className="font-bold text-white">Linnk.Pro SAS</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-gray-900">
                  <span className="text-gray-400">Monto Plan Básico:</span>
                  <span className="font-mono font-black text-amber-300 text-sm">$49.000 COP / mes</span>
                </div>
              </div>

              {/* Direct Upload Section (Accordion / Toggle) */}
              {showDirectUpload ? (
                <div className="mt-4 p-4 bg-gray-950 border border-amber-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <UploadCloud className="w-4 h-4" />
                      Adjuntar Comprobante de Pago
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDirectUpload(false)}
                      className="text-[10px] text-gray-400 hover:text-gray-200 underline cursor-pointer"
                    >
                      Ocultar
                    </button>
                  </div>

                  <label className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-gray-800 hover:border-amber-500/50 rounded-xl cursor-pointer bg-gray-900/50 transition">
                    <UploadCloud className="w-6 h-6 text-amber-400 mb-1" />
                    <span className="text-[11px] font-bold text-gray-200">
                      {receiptFileName ? receiptFileName : 'Seleccionar imagen o captura de pago'}
                    </span>
                    <span className="text-[9px] text-gray-500 mt-0.5">JPG, PNG o PDF</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange} 
                      className="hidden" 
                    />
                  </label>

                  {receiptFileBase64 && (
                    <div className="flex items-center gap-2 p-2 bg-gray-900 rounded-lg border border-gray-800">
                      <img 
                        src={receiptFileBase64} 
                        alt="Comprobante" 
                        className="w-10 h-10 object-cover rounded" 
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] text-white font-medium truncate block">{receiptFileName}</span>
                        <span className="text-[9px] text-emerald-400 font-bold">✓ Archivo listo para enviar</span>
                      </div>
                    </div>
                  )}

                  <input
                    type="text"
                    value={receiptNotes}
                    onChange={(e) => setReceiptNotes(e.target.value)}
                    placeholder="Nota adicional o N° de comprobante (opcional)"
                    className="w-full bg-gray-900 border border-gray-800 text-white placeholder-gray-600 px-3 py-2 text-xs rounded-xl outline-none focus:border-amber-500"
                  />

                  <button
                    type="button"
                    disabled={isSubmittingProof || !receiptFileBase64}
                    onClick={handleDirectSubmitPayment}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-xl uppercase tracking-wider transition disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmittingProof ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-black" />
                        <span>Enviando Comprobante...</span>
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-4 h-4 stroke-[2.5]" />
                        <span>Enviar Comprobante Ahora</span>
                      </>
                    )}
                  </button>
                </div>
              ) : null}

              {/* Modal Action Buttons */}
              <div className="mt-5 space-y-2.5 relative z-10">
                {!showDirectUpload && (
                  <button
                    id="upload-receipt-now-btn"
                    type="button"
                    onClick={() => setShowDirectUpload(true)}
                    className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-black font-black text-xs py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-[0.98] flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                    <span>Realizar Pago y Subir Comprobante</span>
                  </button>
                )}

                <button
                  id="go-to-subscription-tab-btn"
                  type="button"
                  onClick={() => {
                    onGoToPayment();
                    onClose();
                  }}
                  className="w-full bg-gray-900 hover:bg-gray-850 text-amber-300 font-bold text-xs py-2.5 px-4 rounded-xl border border-gray-800 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Ir a Panel de Pagos y Suscripción</span>
                </button>

                <button
                  id="continue-free-trial-btn"
                  type="button"
                  onClick={onClose}
                  className="w-full bg-transparent hover:bg-gray-900/60 text-gray-400 hover:text-gray-200 font-bold text-xs py-2 px-4 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Continuar con mi Semana de Prueba (7 Días)</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
