import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Landmark, 
  UploadCloud, 
  X, 
  Check, 
  Copy, 
  FileText
} from 'lucide-react';
import { BankAccount, UserProfile } from '../types';

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
  const [accounts, setAccounts] = useState<BankAccount[]>(profile.bankAccounts || []);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState<'Ahorros' | 'Corriente'>('Ahorros');
  const [accountNumber, setAccountNumber] = useState('');
  const [qrCodeURL, setQrCodeURL] = useState('');
  const [instructions, setInstructions] = useState('');
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
    setEditingId(null);
    setError('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleOpenEdit = (acc: BankAccount) => {
    setEditingId(acc.id);
    setBankName(acc.bankName);
    setAccountType(acc.accountType);
    setAccountNumber(acc.accountNumber);
    setQrCodeURL(acc.qrCodeURL || '');
    setInstructions(acc.instructions || '');
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

    setSaving(true);
    setError('');

    const accountData: BankAccount = {
      id: editingId || 'bank_' + Math.random().toString(36).substr(2, 9),
      bankName: bankName.trim(),
      accountType,
      accountNumber: accountNumber.trim(),
      ...(qrCodeURL.trim() ? { qrCodeURL: qrCodeURL.trim() } : {}),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {})
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
            className="py-2.5 px-4 bg-emerald-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-emerald-300 transition shrink-0"
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
                className="text-gray-500 hover:text-white transition"
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
                      className={`text-[10px] py-1 px-2.5 rounded-lg border font-bold transition ${
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
                      className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
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
                        className="py-1.5 px-3 bg-gray-900 border border-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-extrabold transition flex items-center gap-1"
                      >
                        Reemplazar Imagen
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrCodeURL('')}
                        className="py-1.5 px-3 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-extrabold transition flex items-center gap-1"
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
                  className="flex-1 py-3 px-4 bg-emerald-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-emerald-300 transition"
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
                  className="py-3 px-4 bg-gray-900 border border-gray-850 text-gray-400 font-bold text-xs rounded-xl hover:text-white transition"
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
                  className="py-2 px-4 bg-emerald-400 text-black font-extrabold text-xs rounded-xl inline-flex items-center gap-1.5 hover:bg-emerald-300 transition"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Primera Cuenta
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
                {accounts.map((acc) => (
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
                            className="p-1.5 bg-gray-900 hover:bg-gray-850 text-gray-400 hover:text-white rounded-lg transition"
                            title="Editar cuenta"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(acc.id)}
                            className="p-1.5 bg-red-500/5 hover:bg-red-500/15 text-red-400 rounded-lg transition"
                            title="Eliminar cuenta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="h-[1px] bg-gray-900/50" />

                      <div className="space-y-2">
                        <div>
                          <span className="text-[8px] font-black text-gray-550 uppercase block tracking-wider">Número de Cuenta</span>
                          <span className="font-mono text-sm font-extrabold text-white">{acc.accountNumber}</span>
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
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
