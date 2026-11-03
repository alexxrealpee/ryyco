import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Landmark, 
  UploadCloud, 
  X, 
  Check, 
  FileText,
  DollarSign,
  Percent,
  ShieldAlert
} from 'lucide-react';
import { BankAccount, UserProfile } from '../types';
import {
  normalizeBankAccount,
  isBankAccountFeeActive,
  calculateBankAccountFee
} from '../lib/paymentFeeUtils';

interface BankSettingsProps {
  profile: UserProfile;
  onSave: (updatedAccounts: BankAccount[]) => Promise<void>;
}

const compressImage = (base64Str: string, maxWidth = 600, maxHeight = 600): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedBase64);
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

const BANK_PRESETS = [
  'Nequi',
  'Bancolombia',
  'DaviPlata',
  'Davivienda',
  'Banco de Bogotá',
  'BBVA',
  'Lulo Bank'
];

export default function BankSettings({ profile, onSave }: BankSettingsProps) {
  const [accounts, setAccounts] = useState<BankAccount[]>(() =>
    (profile.bankAccounts || []).map(normalizeBankAccount)
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync when profile.bankAccounts updates from Firestore
  useEffect(() => {
    setAccounts((profile.bankAccounts || []).map(normalizeBankAccount));
  }, [profile.bankAccounts]);

  // Form states
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState<'Ahorros' | 'Corriente'>('Ahorros');
  const [accountNumber, setAccountNumber] = useState('');
  const [qrCodeURL, setQrCodeURL] = useState('');
  const [instructions, setInstructions] = useState('');
  const [additionalFeeEnabled, setAdditionalFeeEnabled] = useState(false);
  const [additionalFeeType, setAdditionalFeeType] = useState<'fixed' | 'percentage'>('fixed');
  const [additionalFeeValue, setAdditionalFeeValue] = useState<string>('0');
  const [error, setError] = useState('');

  // Drag and drop states
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setBankName('');
    setAccountType('Ahorros');
    setAccountNumber('');
    setQrCodeURL('');
    setInstructions('');
    setAdditionalFeeEnabled(false);
    setAdditionalFeeType('fixed');
    setAdditionalFeeValue('0');
    setEditingId(null);
    setError('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleOpenEdit = (acc: BankAccount) => {
    const normalized = normalizeBankAccount(acc);
    setEditingId(normalized.id);
    setBankName(normalized.bankName);
    setAccountType(normalized.accountType);
    setAccountNumber(normalized.accountNumber);
    setQrCodeURL(normalized.qrCodeURL || '');
    setInstructions(normalized.instructions || '');
    setAdditionalFeeEnabled(Boolean(normalized.additionalFeeEnabled));
    setAdditionalFeeType(normalized.additionalFeeType === 'percentage' ? 'percentage' : 'fixed');
    setAdditionalFeeValue(
      normalized.additionalFeeEnabled && normalized.additionalFeeValue && normalized.additionalFeeValue > 0
        ? String(normalized.additionalFeeValue)
        : '0'
    );
    setError('');
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este método de transferencia?')) {
      return;
    }
    const updated = accounts.filter(a => a.id !== id);
    setAccounts(updated);
    await onSave(updated);
  };

  // Image upload handling
  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecciona una imagen válida (JPG, PNG o WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result as string);
        setQrCodeURL(compressed);
        setError('');
      } catch (e) {
        console.error(e);
        setError('Error al procesar la imagen.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const parseFeeInputNumber = (raw: string, type: 'fixed' | 'percentage'): number => {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return 0;
    if (type === 'percentage') {
      const normalized = cleaned.replace(',', '.').replace(/[^0-9.]/g, '');
      const num = parseFloat(normalized);
      return isNaN(num) ? NaN : Math.round(num * 100) / 100;
    }
    const digitsOnly = cleaned.replace(/[^0-9]/g, '');
    const num = parseInt(digitsOnly, 10);
    return isNaN(num) ? 0 : num;
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim()) {
      setError('El nombre del banco es obligatorio.');
      return;
    }
    if (!accountNumber.trim()) {
      setError('El número de cuenta es obligatorio.');
      return;
    }

    let parsedFeeVal = 0;
    if (additionalFeeEnabled) {
      parsedFeeVal = parseFeeInputNumber(additionalFeeValue, additionalFeeType);
      if (isNaN(parsedFeeVal) || parsedFeeVal < 0) {
        setError('Ingresa un valor numérico válido para el costo adicional.');
        return;
      }
      if (additionalFeeType === 'percentage' && (parsedFeeVal <= 0 || parsedFeeVal > 100)) {
        setError('El porcentaje adicional debe estar entre 0.1% y 100%.');
        return;
      }
      if (additionalFeeType === 'fixed' && parsedFeeVal > 500000) {
        setError('El valor fijo adicional parece excesivo. Verifica el monto en pesos ($ COP).');
        return;
      }
    }

    const effectiveEnabled = Boolean(additionalFeeEnabled && parsedFeeVal > 0);
    const effectiveValue = effectiveEnabled ? parsedFeeVal : 0;

    setSaving(true);
    setError('');

    const accountData: BankAccount = {
      id: editingId || 'bank_' + Math.random().toString(36).substr(2, 9),
      bankName: bankName.trim(),
      accountType,
      accountNumber: accountNumber.trim(),
      ...(qrCodeURL.trim() ? { qrCodeURL: qrCodeURL.trim() } : {}),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      additionalFeeEnabled: effectiveEnabled,
      additionalFeeType: additionalFeeType,
      additionalFeeValue: effectiveValue
    };

    let updatedList: BankAccount[];
    if (editingId) {
      updatedList = accounts.map(a => a.id === editingId ? accountData : a);
    } else {
      updatedList = [...accounts, accountData];
    }

    try {
      await onSave(updatedList);
      setAccounts(updatedList);
      setIsEditing(false);
      resetForm();
    } catch (e) {
      console.error(e);
      setError('Ocurrió un error al guardar los datos.');
    } finally {
      setSaving(false);
    }
  };

  const previewNumericFee = parseFeeInputNumber(additionalFeeValue, additionalFeeType);
  const previewExampleBase = 42000; // Ejemplo: Productos $35.000 + Domicilio $7.000
  const previewCalculatedFee = calculateBankAccountFee(
    {
      additionalFeeEnabled,
      additionalFeeType,
      additionalFeeValue: isNaN(previewNumericFee) ? 0 : previewNumericFee
    },
    previewExampleBase
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-900 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Datos Bancarios para Transferencias</h2>
          <p className="text-xs text-gray-500 font-medium">
            Registra los datos de tus cuentas bancarias o billeteras digitales (Nequi, Daviplata, etc.) para que tus compradores realicen los pagos directamente mediante transferencia.
          </p>
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="py-2.5 px-4 bg-emerald-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-emerald-300 transition shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Agregar Cuenta
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-gray-950 border border-gray-900 p-6 rounded-3xl space-y-6 max-w-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider block">
                {editingId ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-gray-500 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs py-2.5 px-3 rounded-xl font-medium">
                  {error}
                </div>
              )}

              {/* Bank Name Preset selector */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Nombre del Banco o Entidad *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Bancolombia, Nequi, Daviplata"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-900 focus:border-emerald-500 outline-none rounded-xl py-3 px-4 text-xs font-semibold text-white transition focus:ring-1 focus:ring-emerald-500/10"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {BANK_PRESETS.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBankName(preset)}
                      className={`text-[10px] py-1 px-2.5 rounded-lg border font-bold transition cursor-pointer ${
                        bankName === preset 
                          ? 'bg-emerald-450/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-gray-900/50 text-gray-400 border-gray-850 hover:bg-gray-900 hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account type selection */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1.5">Tipo de Cuenta *</label>
                <div className="flex gap-2">
                  {(['Ahorros', 'Corriente'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAccountType(type)}
                      className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                        accountType === type 
                          ? 'bg-emerald-450/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-gray-900/50 text-gray-400 border-gray-850 hover:bg-gray-900'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${accountType === type ? 'bg-emerald-400' : 'bg-transparent'}`} />
                      Cuenta de {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Number */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Número de Cuenta o Celular *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. 123-456789-01 o tu celular en caso de Nequi"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-900 focus:border-emerald-500 outline-none rounded-xl py-3 px-4 text-xs font-semibold text-white transition focus:ring-1 focus:ring-emerald-500/10"
                />
              </div>

              {/* Costo adicional por pagar con este método */}
              <div className="bg-gray-900/35 border border-gray-900 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-emerald-400 tracking-wider block">
                      Costo adicional por pagar con este método
                    </label>
                    <p className="text-[11px] text-gray-400 font-medium leading-relaxed">
                      Este valor se sumará automáticamente al total del pedido cuando el cliente seleccione este método de pago
                    </p>
                  </div>

                  {/* Interruptor para activar o desactivar el cobro adicional */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={additionalFeeEnabled}
                    aria-label="Activar o desactivar costo adicional por pagar con este método"
                    onClick={() => {
                      const next = !additionalFeeEnabled;
                      setAdditionalFeeEnabled(next);
                      if (!next) {
                        setAdditionalFeeValue('0');
                      } else if (additionalFeeValue === '0' || !additionalFeeValue.trim()) {
                        setAdditionalFeeValue('1000');
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      additionalFeeEnabled ? 'bg-emerald-400' : 'bg-gray-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out ${
                        additionalFeeEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Controles de tipo de cobro y valor adicional */}
                <div className={`space-y-3 pt-2 border-t border-gray-900/80 transition-opacity ${
                  additionalFeeEnabled ? 'opacity-100' : 'opacity-60'
                }`}>
                  {/* Selector del tipo de cobro: Valor fijo ($ COP) o Porcentaje (%) */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1.5">
                      Tipo de Cobro Adicional
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAdditionalFeeType('fixed');
                          if (!additionalFeeEnabled) setAdditionalFeeEnabled(true);
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                          additionalFeeType === 'fixed'
                            ? 'bg-emerald-450/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-gray-950 text-gray-400 border-gray-850 hover:bg-gray-900'
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Valor fijo ($ COP)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdditionalFeeType('percentage');
                          if (!additionalFeeEnabled) setAdditionalFeeEnabled(true);
                          const curr = parseFeeInputNumber(additionalFeeValue, 'percentage');
                          if (curr > 100) setAdditionalFeeValue('2');
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                          additionalFeeType === 'percentage'
                            ? 'bg-emerald-450/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-gray-950 text-gray-400 border-gray-850 hover:bg-gray-900'
                        }`}
                      >
                        <Percent className="w-3.5 h-3.5" />
                        <span>Porcentaje (%)</span>
                      </button>
                    </div>
                  </div>

                  {/* Campo numérico para ingresar el valor adicional */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">
                      {additionalFeeType === 'percentage' ? 'Porcentaje Adicional (%)' : 'Valor Adicional ($ COP)'}
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 text-xs font-black text-emerald-400 select-none font-mono">
                        {additionalFeeType === 'percentage' ? '%' : '$'}
                      </span>
                      <input
                        type="number"
                        min="0"
                        max={additionalFeeType === 'percentage' ? '100' : '500000'}
                        step={additionalFeeType === 'percentage' ? '0.1' : '100'}
                        disabled={!additionalFeeEnabled}
                        placeholder={additionalFeeType === 'percentage' ? 'Ej. 2' : 'Ej. 1000'}
                        value={additionalFeeEnabled ? additionalFeeValue : '0'}
                        onChange={(e) => {
                          setAdditionalFeeValue(e.target.value);
                          if (error) setError('');
                        }}
                        className="w-full bg-gray-950 border border-gray-900 focus:border-emerald-500 outline-none rounded-xl py-2.5 pl-8 pr-16 text-xs font-mono font-bold text-white transition focus:ring-1 focus:ring-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="absolute right-3.5 text-[10px] font-black uppercase text-gray-500 select-none">
                        {additionalFeeType === 'percentage' ? '%' : 'COP'}
                      </span>
                    </div>

                    {/* Sugerencias rápidas cuando está activo */}
                    {additionalFeeEnabled && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-[9.5px] text-gray-500 font-bold mr-1">Valores rápidos:</span>
                        {(additionalFeeType === 'percentage'
                          ? ['1', '2', '3', '5']
                          : ['0', '500', '1000', '1500', '2000']
                        ).map(presetVal => (
                          <button
                            key={presetVal}
                            type="button"
                            onClick={() => {
                              if (presetVal === '0') {
                                setAdditionalFeeEnabled(false);
                                setAdditionalFeeValue('0');
                              } else {
                                setAdditionalFeeValue(presetVal);
                              }
                            }}
                            className={`text-[10px] py-0.5 px-2 rounded-lg border font-mono font-bold transition cursor-pointer ${
                              additionalFeeValue === presetVal
                                ? 'bg-emerald-450/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-gray-950 text-gray-400 border-gray-850 hover:text-white'
                            }`}
                          >
                            {presetVal === '0'
                              ? 'Sin costo ($0)'
                              : additionalFeeType === 'percentage'
                              ? `${presetVal}%`
                              : `$${Number(presetVal).toLocaleString('es-CO')}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Vista previa transparente de cómo lo verá el cliente */}
                  {additionalFeeEnabled && previewCalculatedFee > 0 ? (
                    <div className="bg-gray-950 border border-emerald-500/20 rounded-xl p-3 space-y-1 text-[11px]">
                      <span className="text-[9.5px] font-black uppercase text-emerald-400 tracking-wider block">
                        Vista previa en el resumen del pedido del cliente:
                      </span>
                      <div className="flex justify-between text-gray-400">
                        <span>Productos ($35.000) + Domicilio ($7.000):</span>
                        <span className="font-mono text-gray-300">$42.000</span>
                      </div>
                      <div className="flex justify-between text-amber-300 font-bold">
                        <span>Costo adicional por pagar con {bankName.trim() || 'este método'}:</span>
                        <span className="font-mono">+${previewCalculatedFee.toLocaleString('es-CO')}</span>
                      </div>
                      <div className="flex justify-between text-white font-extrabold border-t border-gray-900 pt-1">
                        <span>Total a pagar:</span>
                        <span className="font-mono text-emerald-400">
                          ${(previewExampleBase + previewCalculatedFee).toLocaleString('es-CO')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-950/60 border border-gray-900 rounded-xl px-3 py-2 flex items-center justify-between text-[11px] text-gray-400">
                      <span>Estado actual para {bankName.trim() || 'este método'}:</span>
                      <span className="font-mono font-bold text-emerald-400">Sin costo adicional ($0)</span>
                    </div>
                  )}

                  {/* Aviso normativo y condiciones del proveedor */}
                  <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 rounded-xl p-2.5 text-[10px] text-amber-200/80 leading-relaxed">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Verifica que el recargo esté permitido por la normativa colombiana y las condiciones del proveedor de pago antes de habilitar su cobro. El valor se informará de forma transparente al cliente antes de confirmar su pedido.
                    </span>
                  </div>
                </div>
              </div>

              {/* QR Code Upload with Drag and Drop */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Código QR de la Cuenta / Billetera (Opcional)</label>
                
                {qrCodeURL ? (
                  <div className="border border-gray-900 bg-gray-950 p-4 rounded-2xl flex flex-col items-center gap-3">
                    <img 
                      src={qrCodeURL} 
                      alt="Vista previa del QR" 
                      className="w-40 h-40 object-contain rounded-lg border border-gray-800 bg-white p-1"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="py-1.5 px-3 bg-gray-900 border border-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-extrabold transition flex items-center gap-1 cursor-pointer"
                      >
                        Reemplazar Imagen
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrCodeURL('')}
                        className="py-1.5 px-3 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-extrabold transition flex items-center gap-1 cursor-pointer"
                      >
                        Eliminar QR
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition ${
                      dragActive 
                        ? 'border-emerald-500 bg-emerald-500/5 text-white' 
                        : 'border-gray-850 hover:border-gray-700 text-gray-450 hover:text-gray-300'
                    }`}
                  >
                    <UploadCloud className="w-8 h-8 text-gray-500" />
                    <div className="text-center">
                      <span className="text-xs font-bold block text-white">Arrastra y suelta tu código QR aquí</span>
                      <span className="text-[10px] text-gray-550 block mt-1">O haz clic para seleccionar un archivo (JPG, PNG o WebP)</span>
                    </div>
                  </div>
                )}
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Custom Instructions */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider block mb-1">Instrucciones Adicionales (Opcional)</label>
                <textarea
                  placeholder="Ej. Titular: Juan Pérez, CC: 1234567. Una vez realizada la transferencia, envía el comprobante adjunto o por WhatsApp."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-950 border border-gray-900 focus:border-emerald-500 outline-none rounded-xl py-3 px-4 text-xs font-semibold text-white transition focus:ring-1 focus:ring-emerald-500/10 resize-none"
                />
              </div>

              {/* Form Actions */}
              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 px-4 bg-emerald-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-emerald-300 transition cursor-pointer"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  )}
                  Guardar Cuenta
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="py-3 px-4 bg-gray-900 border border-gray-850 text-gray-400 font-bold text-xs rounded-xl hover:text-white transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {accounts.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-gray-850 rounded-3xl bg-gray-950/20 max-w-xl">
                <Landmark className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">No tienes cuentas registradas</h3>
                <p className="text-xs text-gray-550 max-w-sm mx-auto mb-4 font-medium leading-relaxed">
                  Para habilitar la opción de pago por transferencia en tu tienda online, debes registrar al menos una cuenta bancaria.
                </p>
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="py-2 px-4 bg-emerald-400 text-black font-extrabold text-xs rounded-xl inline-flex items-center gap-1.5 hover:bg-emerald-300 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Primera Cuenta
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
                {accounts.map((acc) => {
                  const feeActive = isBankAccountFeeActive(acc);
                  return (
                    <div 
                      key={acc.id}
                      className="bg-gray-950 border border-gray-900 p-5 rounded-3xl space-y-4 flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-emerald-450/10 text-emerald-400 border border-emerald-500/10 rounded-xl shrink-0">
                              <Landmark className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-white uppercase">{acc.bankName}</h4>
                              <span className="text-[10px] text-indigo-400 font-bold uppercase">{acc.accountType}</span>
                            </div>
                          </div>

                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(acc)}
                              className="p-1.5 bg-gray-900 hover:bg-gray-850 text-gray-400 hover:text-white rounded-lg transition cursor-pointer"
                              title="Editar cuenta"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(acc.id)}
                              className="p-1.5 bg-red-500/5 hover:bg-red-500/15 text-red-400 rounded-lg transition cursor-pointer"
                              title="Eliminar cuenta"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="h-[1px] bg-gray-900/50" />

                        <div className="space-y-2.5">
                          <div>
                            <span className="text-[8px] font-black text-gray-550 uppercase block tracking-wider">Número de Cuenta</span>
                            <span className="font-mono text-sm font-extrabold text-white">{acc.accountNumber}</span>
                          </div>

                          {/* Costo adicional configurado para este método */}
                          <div className="flex items-center justify-between bg-gray-900/50 border border-gray-900 px-3 py-2 rounded-xl text-[10px]">
                            <span className="text-gray-400 font-bold">Costo adicional al cliente:</span>
                            {feeActive ? (
                              <span className="font-mono font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                                {acc.additionalFeeType === 'percentage'
                                  ? `+${acc.additionalFeeValue}% adicional`
                                  : `+$${Math.round(Number(acc.additionalFeeValue) || 0).toLocaleString('es-CO')} adicionales`}
                              </span>
                            ) : (
                              <span className="font-mono font-bold text-emerald-400">
                                Sin costo adicional ($0)
                              </span>
                            )}
                          </div>

                          {acc.instructions && (
                            <div className="bg-gray-900/40 border border-gray-900 p-2.5 rounded-xl text-[10px] text-gray-400 font-semibold leading-relaxed">
                              <span className="font-bold text-gray-300 block mb-0.5 flex items-center gap-1">
                                <FileText className="w-3 h-3 text-gray-500" /> Instrucciones:
                              </span>
                              {acc.instructions}
                            </div>
                          )}
                        </div>
                      </div>

                      {acc.qrCodeURL && (
                        <div className="border border-gray-900 bg-gray-900/20 p-2.5 rounded-2xl flex items-center gap-3">
                          <img 
                            src={acc.qrCodeURL} 
                            alt="QR" 
                            className="w-12 h-12 object-contain bg-white rounded-lg p-0.5 border border-gray-800"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-[10px]">
                            <span className="text-white font-extrabold block">Tiene Código QR</span>
                            <span className="text-gray-500 block font-medium">Se mostrará en la pasarela.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

