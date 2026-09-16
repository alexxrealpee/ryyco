/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Bike, 
  Car, 
  ShieldCheck, 
  User, 
  Mail, 
  Lock, 
  Phone, 
  MapPin, 
  Calendar, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft,
  Sparkles,
  CreditCard,
  Building2,
  FileText,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  ZoomIn,
  X
} from 'lucide-react';
import { registerDriverProfile } from '../lib/firebase';
import { VehicleType, DriverProfile } from '../types';
import { saveDriverSessionToStorage } from './DriverPortal';
import { compressImageFile, formatBytes, CompressionResult } from '../lib/imageCompressor';

interface DriverRegisterProps {
  onNavigateLogin: () => void;
  onNavigateHome: () => void;
  onSuccessRegistered?: (driver: DriverProfile) => void;
}

export default function DriverRegister({ onNavigateLogin, onNavigateHome, onSuccessRegistered }: DriverRegisterProps) {
  // Form fields
  const [photoURL, setPhotoURL] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [docType, setDocType] = useState<'CC' | 'CE' | 'PASAPORTE' | 'NIT'>('CC');
  const [docNumber, setDocNumber] = useState<string>('');
  const [birthDate, setBirthDate] = useState<string>('');
  const [gender, setGender] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [city, setCity] = useState<string>('Bogotá');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // Vehicle
  const [vehicleType, setVehicleType] = useState<VehicleType>('moto');
  const [vehicleBrand, setVehicleBrand] = useState<string>('');
  const [vehiclePlate, setVehiclePlate] = useState<string>('');
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState<string>('');
  const [vehicleOwnershipCardUrl, setVehicleOwnershipCardUrl] = useState<string>('');
  const [driverLicenseUrl, setDriverLicenseUrl] = useState<string>('');

  // Image Compression & Processing States
  const [compressing, setCompressing] = useState<{
    photo?: boolean;
    vehicle?: boolean;
    ownership?: boolean;
    license?: boolean;
  }>({});

  const [compressionStats, setCompressionStats] = useState<{
    photo?: CompressionResult;
    vehicle?: CompressionResult;
    ownership?: CompressionResult;
    license?: CompressionResult;
  }>({});

  // Image preview modal (to inspect uploaded documents)
  const [previewModal, setPreviewModal] = useState<{ url: string; title: string } | null>(null);

  // Terms & UI State
  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [registeredDriver, setRegisteredDriver] = useState<DriverProfile | null>(null);

  // Unified image compression helper
  const processImageCompression = async (
    file: File | undefined,
    field: 'photo' | 'vehicle' | 'ownership' | 'license',
    options: { maxWidth: number; maxHeight: number; quality: number; maxSizeBytes: number },
    onSuccess: (dataUrl: string) => void
  ) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP).');
      return;
    }

    // Accepts phone photos up to 25MB without rejecting, compressing them automatically
    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('La imagen seleccionada supera los 25MB. Por favor selecciona una foto de menor tamaño.');
      return;
    }

    setErrorMsg('');
    setCompressing(prev => ({ ...prev, [field]: true }));

    try {
      const result = await compressImageFile(file, options);
      onSuccess(result.dataUrl);
      setCompressionStats(prev => ({ ...prev, [field]: result }));
    } catch (err: any) {
      console.error(`Error al comprimir ${field}:`, err);
      setErrorMsg(err.message || 'Error al procesar y comprimir la imagen. Intenta con otra foto.');
    } finally {
      setCompressing(prev => ({ ...prev, [field]: false }));
    }
  };

  // Handlers with automatic compression
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processImageCompression(
      file,
      'photo',
      { maxWidth: 600, maxHeight: 600, quality: 0.78, maxSizeBytes: 80 * 1024 },
      (url) => setPhotoURL(url)
    );
    e.target.value = '';
  };

  const handleVehiclePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processImageCompression(
      file,
      'vehicle',
      { maxWidth: 1000, maxHeight: 1000, quality: 0.75, maxSizeBytes: 100 * 1024 },
      (url) => setVehiclePhotoUrl(url)
    );
    e.target.value = '';
  };

  const handleOwnershipCardUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processImageCompression(
      file,
      'ownership',
      { maxWidth: 1200, maxHeight: 1200, quality: 0.78, maxSizeBytes: 120 * 1024 },
      (url) => setVehicleOwnershipCardUrl(url)
    );
    e.target.value = '';
  };

  const handleLicenseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processImageCompression(
      file,
      'license',
      { maxWidth: 1200, maxHeight: 1200, quality: 0.78, maxSizeBytes: 120 * 1024 },
      (url) => setDriverLicenseUrl(url)
    );
    e.target.value = '';
  };

  // Remove handlers
  const removePhoto = () => {
    setPhotoURL('');
    setCompressionStats(prev => {
      const next = { ...prev };
      delete next.photo;
      return next;
    });
  };

  const removeVehiclePhoto = () => {
    setVehiclePhotoUrl('');
    setCompressionStats(prev => {
      const next = { ...prev };
      delete next.vehicle;
      return next;
    });
  };

  const removeOwnershipCard = () => {
    setVehicleOwnershipCardUrl('');
    setCompressionStats(prev => {
      const next = { ...prev };
      delete next.ownership;
      return next;
    });
  };

  const removeLicense = () => {
    setDriverLicenseUrl('');
    setCompressionStats(prev => {
      const next = { ...prev };
      delete next.license;
      return next;
    });
  };

  const isAnyCompressing = Object.values(compressing).some(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg('Por favor ingresa tu nombre y apellido completos.');
      return;
    }
    if (!docNumber.trim()) {
      setErrorMsg('Por favor ingresa tu número de documento.');
      return;
    }
    if (!birthDate) {
      setErrorMsg('Por favor ingresa tu fecha de nacimiento.');
      return;
    }
    if (!phone.trim()) {
      setErrorMsg('Por favor ingresa tu número de teléfono celular.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Por favor ingresa un correo electrónico válido.');
      return;
    }
    if (!address.trim() || !city.trim()) {
      setErrorMsg('Por favor completa la información de dirección y ciudad.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if ((vehicleType === 'moto' || vehicleType === 'carro') && !vehiclePlate.trim()) {
      setErrorMsg('Para motos y carros es obligatorio ingresar la placa del vehículo.');
      return;
    }
    if ((vehicleType === 'moto' || vehicleType === 'carro') && (!vehiclePhotoUrl || !vehicleOwnershipCardUrl || !driverLicenseUrl)) {
      setErrorMsg('Para motos y carros es obligatorio adjuntar foto del vehículo, tarjeta de propiedad y licencia de conducción.');
      return;
    }
    if (vehicleType === 'bicicleta' && !vehiclePhotoUrl) {
      setErrorMsg('Por favor adjunta una foto clara de tu bicicleta para continuar.');
      return;
    }
    if (!acceptedTerms) {
      setErrorMsg('Debes aceptar los términos y condiciones para continuar.');
      return;
    }

    setLoading(true);

    try {
      // Clean UID based on email/doc
      const driverUid = `driver_${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      const created = await registerDriverProfile({
        id: driverUid,
        uid: driverUid,
        email: email.trim().toLowerCase(),
        photoURL: photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(firstName)}`,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        docType,
        docNumber: docNumber.trim(),
        birthDate,
        gender: gender || 'No especificado',
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        password: password.trim(),
        vehicleType,
        vehicleBrand: vehicleBrand.trim(),
        vehiclePlate: vehiclePlate.trim().toUpperCase(),
        vehiclePhotoUrl: vehiclePhotoUrl || '',
        vehicleOwnershipCardUrl: vehicleOwnershipCardUrl || '',
        driverLicenseUrl: driverLicenseUrl || '',
        status: 'pending',
        isAvailable: false,
        isOnline: false
      });

      setRegisteredDriver(created);
      setIsSuccess(true);
      saveDriverSessionToStorage(created);
      if (onSuccessRegistered) {
        onSuccessRegistered(created);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error al procesar el registro de domiciliario. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090B12] text-gray-100 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      {/* Header Bar */}
      <div className="max-w-3xl mx-auto w-full mb-6 flex items-center justify-between">
        <button
          onClick={onNavigateHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#A9B2C3] hover:text-white transition duration-150 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al inicio</span>
        </button>
        <div className="flex items-center gap-2 text-xs font-bold text-[#E63946] bg-[#E63946]/10 border border-[#E63946]/20 px-3 py-1.5 rounded-full">
          <Bike className="w-4 h-4 animate-bounce" />
          <span>Red Independiente de Repartidores</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full bg-[#111827] border border-[#232B3A] rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-10">
        {/* Registration Success Confirmation */}
        {isSuccess ? (
          <div className="text-center py-8 px-4 animate-fadeIn">
            <div className="w-20 h-20 bg-[#F4B400]/10 border-2 border-[#F4B400]/30 text-[#F4B400] rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#F4B400]/10">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-3">
              ¡Solicitud Enviada Exitosamente!
            </h2>

            {/* Mandatory Message from requirement 2 */}
            <div className="bg-[#090B12] border border-[#F4B400]/30 rounded-2xl p-6 text-left max-w-xl mx-auto my-6 shadow-inner">
              <p className="text-sm sm:text-base text-[#F4B400] leading-relaxed font-medium">
                "Su solicitud fue enviada correctamente. Nuestro equipo revisará la información registrada. Una vez sea aprobada, recibirá una notificación y podrá comenzar a recibir pedidos."
              </p>
            </div>

            <div className="bg-[#090B12] border border-[#232B3A] rounded-xl p-4 max-w-xl mx-auto text-xs text-[#A9B2C3] text-left space-y-2 mb-8">
              <div className="flex justify-between border-b border-[#232B3A] pb-2">
                <span>Estado de la Cuenta:</span>
                <span className="font-bold text-[#F4B400] bg-[#F4B400]/10 px-2.5 py-0.5 rounded-md border border-[#F4B400]/20">
                  Pendiente de aprobación
                </span>
              </div>
              <div className="flex justify-between border-b border-[#232B3A] pb-2">
                <span>Domiciliario:</span>
                <span className="text-white font-semibold">{firstName} {lastName}</span>
              </div>
              <div className="flex justify-between border-b border-[#232B3A] pb-2">
                <span>Vehículo registrado:</span>
                <span className="text-white font-semibold">{vehicleType.toUpperCase()} {vehicleBrand} ({vehiclePlate || 'N/A'})</span>
              </div>
              <div className="flex justify-between">
                <span>Correo de contacto:</span>
                <span className="text-[#E63946] font-mono">{email}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={onNavigateLogin}
                className="px-6 py-3 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-sm rounded-xl transition duration-150 cursor-pointer shadow-lg shadow-[#E63946]/20 flex items-center justify-center gap-2"
              >
                <User className="w-4 h-4" />
                <span>Ingresar al Portal de Domiciliarios</span>
              </button>
              <button
                onClick={onNavigateHome}
                className="px-6 py-3 bg-[#090B12] hover:bg-[#232B3A] text-white font-bold text-sm rounded-xl border border-[#232B3A] transition duration-150 cursor-pointer"
              >
                Volver a la Página Principal
              </button>
            </div>
          </div>
        ) : (
          /* Form View */
          <div>
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-3">
                <span>Registrarse como Domiciliario</span>
                <Sparkles className="w-6 h-6 text-[#F4B400]" />
              </h1>
              <p className="text-sm text-[#A9B2C3] mt-2 max-w-lg mx-auto">
                Únete a la red independiente de repartidores. Realiza entregas para todas las tiendas registradas en la plataforma con total autonomía.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-6 p-4 bg-[#E63946]/10 border border-[#E63946]/20 text-[#E63946] text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-3 animate-shake">
                <AlertCircle className="w-5 h-5 text-[#E63946] shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Smart Image Compression Notice */}
            <div className="mb-6 p-3.5 bg-[#10B981]/10 border border-[#10B981]/25 text-emerald-400 rounded-xl flex items-center gap-3 text-xs">
              <div className="w-8 h-8 rounded-lg bg-[#10B981]/20 flex items-center justify-center shrink-0 text-[#10B981]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-white block">Compresión inteligente de imágenes activada</span>
                <span className="text-[#A9B2C3]">
                  Tus fotos y documentos se comprimen automáticamente en tu dispositivo para que puedas subirlas directamente desde tu teléfono móvil sin bloqueos ni errores por peso de archivo.
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Profile Photo Section */}
              <div className="bg-[#090B12] border border-[#232B3A] p-6 rounded-2xl flex flex-col sm:flex-row items-center gap-6">
                <div className="relative group shrink-0">
                  <img
                    src={photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(firstName || 'driver')}`}
                    alt="Foto de perfil"
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-[#E63946]/40 bg-[#111827] shadow-md"
                  />
                  {compressing.photo ? (
                    <div className="absolute inset-0 bg-black/80 rounded-2xl flex flex-col items-center justify-center text-white text-[10px] font-bold">
                      <Loader2 className="w-6 h-6 mb-1 text-[#E63946] animate-spin" />
                      <span>Comprimiendo...</span>
                    </div>
                  ) : (
                    <label className="absolute inset-0 bg-black/60 rounded-2xl flex flex-col items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition cursor-pointer">
                      <Upload className="w-5 h-5 mb-1 text-[#E63946]" />
                      <span>Subir Foto</span>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  )}
                </div>
                <div className="text-center sm:text-left flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1 justify-center sm:justify-start">
                    <h3 className="text-sm font-bold text-white">Foto de Perfil del Domiciliario</h3>
                    {compressionStats.photo && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Comprimida a {formatBytes(compressionStats.photo.compressedSize)} (-{compressionStats.photo.savedPercent}%)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#A9B2C3] mb-3">
                    Sube una foto legible de tu rostro. Esta foto será visible para los clientes y administradores de las tiendas al realizar entregas.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                    <label className="px-3.5 py-1.5 bg-[#111827] hover:bg-[#232B3A] text-[#E63946] font-bold text-xs rounded-xl border border-[#232B3A] cursor-pointer inline-flex items-center gap-2 transition disabled:opacity-50">
                      {compressing.photo ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Comprimiendo...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>{photoURL ? 'Cambiar Foto' : 'Seleccionar Foto'}</span>
                        </>
                      )}
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={compressing.photo} className="hidden" />
                    </label>

                    {photoURL && (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewModal({ url: photoURL, title: 'Foto de Perfil' })}
                          className="px-3 py-1.5 bg-[#111827] hover:bg-[#232B3A] text-gray-300 font-medium text-xs rounded-xl border border-[#232B3A] cursor-pointer inline-flex items-center gap-1.5 transition"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>Ver</span>
                        </button>
                        <button
                          type="button"
                          onClick={removePhoto}
                          className="px-3 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 font-medium text-xs rounded-xl border border-red-800/30 cursor-pointer inline-flex items-center gap-1.5 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Quitar</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Information Group */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-[#E63946] tracking-wider flex items-center gap-2 border-b border-[#232B3A] pb-2">
                  <User className="w-4 h-4" />
                  <span>1. Información Personal</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Nombres *</label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Ej. Carlos Andrés"
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Apellidos *</label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Ej. Rodríguez Pérez"
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Tipo de Documento *</label>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as any)}
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#E63946] transition"
                    >
                      <option value="CC">Cédula de Ciudadanía (CC)</option>
                      <option value="CE">Cédula de Extranjería (CE)</option>
                      <option value="PASAPORTE">Pasaporte</option>
                      <option value="NIT">NIT</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Número de Documento *</label>
                    <input
                      type="text"
                      required
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      placeholder="Ej. 1020304050"
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Fecha de Nacimiento *</label>
                    <input
                      type="date"
                      required
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#E63946] transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Número de Celular *</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-[#A9B2C3] absolute left-3.5 top-3" />
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Ej. +57 300 123 4567"
                        className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Género (Opcional)</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#E63946] transition"
                    >
                      <option value="">Seleccionar Género</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                      <option value="Otro">Otro / Prefiero no decir</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Correo Electrónico *</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#A9B2C3] absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu.correo@ejemplo.com"
                        className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Contraseña de Acceso *</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#A9B2C3] absolute left-3.5 top-3" />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-[#A9B2C3] hover:text-white transition focus:outline-none cursor-pointer"
                        title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Dirección de Residencia *</label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-[#A9B2C3] absolute left-3.5 top-3" />
                      <input
                        type="text"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Ej. Calle 123 # 45 - 67, Apto 301"
                        className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Ciudad *</label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej. Bogotá, Medellín, Cali"
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                    />
                  </div>
                </div>
              </div>

              {/* Vehicle Information Group */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-black uppercase text-[#E63946] tracking-wider flex items-center gap-2 border-b border-[#232B3A] pb-2">
                  <Bike className="w-4 h-4" />
                  <span>2. Información del Vehículo</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Tipo de Vehículo *</label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#E63946] transition"
                    >
                      <option value="moto">Motocicleta 🏍️</option>
                      <option value="carro">Automóvil 🚗</option>
                      <option value="bicicleta">Bicicleta / Patineta 🚲</option>
                      <option value="otro">A pie / Otro 🚶</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">Marca del Vehículo</label>
                    <input
                      type="text"
                      value={vehicleBrand}
                      onChange={(e) => setVehicleBrand(e.target.value)}
                      placeholder="Ej. Yamaha, AKT, Chevrolet, GW"
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#A9B2C3] mb-1.5">
                      Placa {vehicleType === 'moto' || vehicleType === 'carro' ? '*' : '(Si aplica)'}
                    </label>
                    <input
                      type="text"
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value)}
                      placeholder="Ej. ABC-123"
                      className="w-full bg-[#090B12] border border-[#232B3A] rounded-xl px-3.5 py-2.5 text-sm text-white uppercase placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition"
                    />
                  </div>
                </div>

                {/* Documentación del Vehículo y Conductor */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  {/* Foto del Vehículo */}
                  <div className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl flex flex-col justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="relative group shrink-0">
                        {vehiclePhotoUrl ? (
                          <img
                            src={vehiclePhotoUrl}
                            alt="Foto del vehículo"
                            className="w-16 h-16 rounded-xl object-cover border border-[#10B981]/40 bg-[#111827] cursor-pointer"
                            onClick={() => setPreviewModal({ url: vehiclePhotoUrl, title: 'Foto del Vehículo' })}
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl border border-dashed border-[#232B3A] bg-[#111827] flex flex-col items-center justify-center text-[#A9B2C3]">
                            {vehicleType === 'carro' ? (
                              <Car className="w-6 h-6 text-[#10B981]" />
                            ) : (
                              <Bike className="w-6 h-6 text-[#10B981]" />
                            )}
                          </div>
                        )}
                        {compressing.vehicle ? (
                          <div className="absolute inset-0 bg-black/80 rounded-xl flex flex-col items-center justify-center text-white text-[9px] font-bold">
                            <Loader2 className="w-4 h-4 mb-0.5 text-[#10B981] animate-spin" />
                            <span>Comprimiendo...</span>
                          </div>
                        ) : (
                          <label className="absolute inset-0 bg-black/60 rounded-xl flex flex-col items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition cursor-pointer">
                            <Upload className="w-4 h-4 mb-0.5 text-[#10B981]" />
                            <span>Subir</span>
                            <input type="file" accept="image/*" onChange={handleVehiclePhotoUpload} className="hidden" />
                          </label>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-white leading-tight">
                            Foto del Vehículo {(vehicleType === 'moto' || vehicleType === 'carro' || vehicleType === 'bicicleta') ? '*' : '(Opcional)'}
                          </h4>
                        </div>
                        <p className="text-[11px] text-[#A9B2C3] mt-1 leading-tight">
                          Foto visible de tu {vehicleType === 'moto' ? 'motocicleta' : vehicleType === 'carro' ? 'automóvil' : vehicleType === 'bicicleta' ? 'bicicleta' : 'vehículo'}.
                        </p>
                        {compressionStats.vehicle && (
                          <div className="mt-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                              <CheckCircle2 className="w-3 h-3" />
                              {formatBytes(compressionStats.vehicle.compressedSize)} (-{compressionStats.vehicle.savedPercent}%)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-[#232B3A]/60">
                      <label className="px-3 py-1.5 bg-[#111827] hover:bg-[#232B3A] text-[#10B981] font-bold text-xs rounded-lg border border-[#232B3A] cursor-pointer inline-flex items-center gap-1.5 transition disabled:opacity-50">
                        {compressing.vehicle ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Comprimiendo...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3 h-3" />
                            <span>{vehiclePhotoUrl ? 'Cambiar' : 'Seleccionar'}</span>
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={handleVehiclePhotoUpload} disabled={compressing.vehicle} className="hidden" />
                      </label>
                      {vehiclePhotoUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewModal({ url: vehiclePhotoUrl, title: 'Foto del Vehículo' })}
                            className="px-2.5 py-1.5 bg-[#111827] hover:bg-[#232B3A] text-gray-300 font-medium text-xs rounded-lg border border-[#232B3A] cursor-pointer inline-flex items-center gap-1 transition"
                          >
                            <ZoomIn className="w-3 h-3" />
                            <span>Ver</span>
                          </button>
                          <button
                            type="button"
                            onClick={removeVehiclePhoto}
                            className="p-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg border border-red-800/30 cursor-pointer transition"
                            title="Quitar foto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Foto Tarjeta de Propiedad */}
                  <div className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl flex flex-col justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="relative group shrink-0">
                        {vehicleOwnershipCardUrl ? (
                          <img
                            src={vehicleOwnershipCardUrl}
                            alt="Tarjeta de propiedad"
                            className="w-16 h-16 rounded-xl object-cover border border-[#E63946]/40 bg-[#111827] cursor-pointer"
                            onClick={() => setPreviewModal({ url: vehicleOwnershipCardUrl, title: 'Tarjeta de Propiedad' })}
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl border border-dashed border-[#232B3A] bg-[#111827] flex flex-col items-center justify-center text-[#A9B2C3]">
                            <FileText className="w-6 h-6 text-[#E63946]" />
                          </div>
                        )}
                        {compressing.ownership ? (
                          <div className="absolute inset-0 bg-black/80 rounded-xl flex flex-col items-center justify-center text-white text-[9px] font-bold">
                            <Loader2 className="w-4 h-4 mb-0.5 text-[#E63946] animate-spin" />
                            <span>Comprimiendo...</span>
                          </div>
                        ) : (
                          <label className="absolute inset-0 bg-black/60 rounded-xl flex flex-col items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition cursor-pointer">
                            <Upload className="w-4 h-4 mb-0.5 text-[#E63946]" />
                            <span>Subir</span>
                            <input type="file" accept="image/*" onChange={handleOwnershipCardUpload} className="hidden" />
                          </label>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-white leading-tight">
                          Tarjeta de Propiedad {(vehicleType === 'moto' || vehicleType === 'carro') ? '*' : '(Opcional)'}
                        </h4>
                        <p className="text-[11px] text-[#A9B2C3] mt-1 leading-tight">
                          Foto clara y legible del documento del vehículo.
                        </p>
                        {compressionStats.ownership && (
                          <div className="mt-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                              <CheckCircle2 className="w-3 h-3" />
                              {formatBytes(compressionStats.ownership.compressedSize)} (-{compressionStats.ownership.savedPercent}%)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-[#232B3A]/60">
                      <label className="px-3 py-1.5 bg-[#111827] hover:bg-[#232B3A] text-[#E63946] font-bold text-xs rounded-lg border border-[#232B3A] cursor-pointer inline-flex items-center gap-1.5 transition disabled:opacity-50">
                        {compressing.ownership ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Comprimiendo...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3 h-3" />
                            <span>{vehicleOwnershipCardUrl ? 'Cambiar' : 'Seleccionar'}</span>
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={handleOwnershipCardUpload} disabled={compressing.ownership} className="hidden" />
                      </label>
                      {vehicleOwnershipCardUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewModal({ url: vehicleOwnershipCardUrl, title: 'Tarjeta de Propiedad' })}
                            className="px-2.5 py-1.5 bg-[#111827] hover:bg-[#232B3A] text-gray-300 font-medium text-xs rounded-lg border border-[#232B3A] cursor-pointer inline-flex items-center gap-1 transition"
                          >
                            <ZoomIn className="w-3 h-3" />
                            <span>Ver</span>
                          </button>
                          <button
                            type="button"
                            onClick={removeOwnershipCard}
                            className="p-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg border border-red-800/30 cursor-pointer transition"
                            title="Quitar documento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Foto Licencia de Conducción */}
                  <div className="bg-[#090B12] border border-[#232B3A] p-4 rounded-xl flex flex-col justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="relative group shrink-0">
                        {driverLicenseUrl ? (
                          <img
                            src={driverLicenseUrl}
                            alt="Licencia de conducción"
                            className="w-16 h-16 rounded-xl object-cover border border-[#E63946]/40 bg-[#111827] cursor-pointer"
                            onClick={() => setPreviewModal({ url: driverLicenseUrl, title: 'Licencia de Conducción' })}
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl border border-dashed border-[#232B3A] bg-[#111827] flex flex-col items-center justify-center text-[#A9B2C3]">
                            <CreditCard className="w-6 h-6 text-[#F4B400]" />
                          </div>
                        )}
                        {compressing.license ? (
                          <div className="absolute inset-0 bg-black/80 rounded-xl flex flex-col items-center justify-center text-white text-[9px] font-bold">
                            <Loader2 className="w-4 h-4 mb-0.5 text-[#F4B400] animate-spin" />
                            <span>Comprimiendo...</span>
                          </div>
                        ) : (
                          <label className="absolute inset-0 bg-black/60 rounded-xl flex flex-col items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition cursor-pointer">
                            <Upload className="w-4 h-4 mb-0.5 text-[#E63946]" />
                            <span>Subir</span>
                            <input type="file" accept="image/*" onChange={handleLicenseUpload} className="hidden" />
                          </label>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-white leading-tight">
                          Licencia de Conducción {(vehicleType === 'moto' || vehicleType === 'carro') ? '*' : '(Opcional)'}
                        </h4>
                        <p className="text-[11px] text-[#A9B2C3] mt-1 leading-tight">
                          Foto legible de tu licencia de conducción vigente.
                        </p>
                        {compressionStats.license && (
                          <div className="mt-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                              <CheckCircle2 className="w-3 h-3" />
                              {formatBytes(compressionStats.license.compressedSize)} (-{compressionStats.license.savedPercent}%)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-[#232B3A]/60">
                      <label className="px-3 py-1.5 bg-[#111827] hover:bg-[#232B3A] text-[#F4B400] font-bold text-xs rounded-lg border border-[#232B3A] cursor-pointer inline-flex items-center gap-1.5 transition disabled:opacity-50">
                        {compressing.license ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Comprimiendo...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3 h-3" />
                            <span>{driverLicenseUrl ? 'Cambiar' : 'Seleccionar'}</span>
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={handleLicenseUpload} disabled={compressing.license} className="hidden" />
                      </label>
                      {driverLicenseUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewModal({ url: driverLicenseUrl, title: 'Licencia de Conducción' })}
                            className="px-2.5 py-1.5 bg-[#111827] hover:bg-[#232B3A] text-gray-300 font-medium text-xs rounded-lg border border-[#232B3A] cursor-pointer inline-flex items-center gap-1 transition"
                          >
                            <ZoomIn className="w-3 h-3" />
                            <span>Ver</span>
                          </button>
                          <button
                            type="button"
                            onClick={removeLicense}
                            className="p-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg border border-red-800/30 cursor-pointer transition"
                            title="Quitar documento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Terms and Submission */}
              <div className="pt-4 border-t border-[#232B3A] space-y-4">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-[#232B3A] bg-[#090B12] text-[#E63946] focus:ring-[#E63946] focus:ring-offset-[#090B12] cursor-pointer"
                  />
                  <span className="text-xs text-[#A9B2C3] group-hover:text-white leading-relaxed">
                    Acepto los <strong className="text-white">Términos y Condiciones de Servicio</strong> para domiciliarios independientes, políticas de privacidad y autorizo el tratamiento de mis datos personales para la gestión de entregas en la plataforma.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading || isAnyCompressing}
                  className="w-full py-3.5 px-6 bg-[#E63946] hover:bg-[#D62839] text-white font-black text-sm rounded-xl transition duration-150 cursor-pointer shadow-xl shadow-[#E63946]/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                      <span>Registrando Domiciliario...</span>
                    </>
                  ) : isAnyCompressing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Comprimiendo imágenes seleccionadas...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      <span>Completar Registro y Solicitar Aprobación</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <span className="text-xs text-[#A9B2C3]">¿Ya tienes una cuenta de domiciliario? </span>
                  <button
                    type="button"
                    onClick={onNavigateLogin}
                    className="text-xs font-bold text-[#E63946] hover:underline cursor-pointer"
                  >
                    Ingresar al Portal de Domiciliarios
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Image Inspection / Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#111827] border border-[#232B3A] rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-[#232B3A] flex items-center justify-between">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#E63946]" />
                <span>{previewModal.title}</span>
              </h4>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#232B3A] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-[#090B12]">
              <img
                src={previewModal.url}
                alt={previewModal.title}
                className="max-h-[65vh] max-w-full object-contain rounded-lg border border-[#232B3A]"
              />
            </div>
            <div className="p-3 border-t border-[#232B3A] bg-[#111827] flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="px-4 py-2 bg-[#232B3A] hover:bg-[#2E384D] text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cerrar Vista Previa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
