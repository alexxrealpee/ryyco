/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Store,
  MapPin,
  CreditCard,
  Building2,
  Camera,
  Upload,
  Check,
  Save,
  Clock,
  Truck,
  Phone,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { RyycoSupplier, SupplierCategory, BankAccount } from '../types/ryycoB2B';
import { formatCop, sanitizeRyycoPhone } from '../utils/ryycoFormatters';
import { WarehouseLocationPickerMap } from './WarehouseLocationPickerMap';

interface SupplierProfileSettingsSectionProps {
  supplier: RyycoSupplier;
  onSaveProfile: (updatedData: Partial<RyycoSupplier>) => Promise<void>;
}

const CATEGORIES: SupplierCategory[] = [
  'Frutas y Verduras',
  'Cárnicos y Embutidos',
  'Aceites y Abarrotes',
  'Lácteos y Quesos',
  'Empaques Biodegradables',
  'Bebidas y Licores',
];

const PRESET_LOGOS: { label: string; url: string }[] = [
  { label: 'Cárnicos', url: '/assets/cat-carnicos.webp' },
  { label: 'Frutas / Verduras', url: '/assets/prod-papa.webp' },
  { label: 'Empaques Kraft', url: '/assets/aistudio/ryyco_empaques_opt.webp' },
  { label: 'Aceites / Abarrotes', url: '/assets/cat-aceites.webp' },
  { label: 'Lácteos / Quesos', url: '/assets/cat-lacteos.webp' },
];

const COMMON_PAYMENT_METHODS = [
  'Transferencia Bancolombia / Nequi',
  'Transferencia Daviplata / Davivienda',
  'Contraentrega Efectivo',
  'Pago Anticipado',
  'Crédito comercial 15 días',
  'Crédito comercial 30 días',
];

export const SupplierProfileSettingsSection: React.FC<SupplierProfileSettingsSectionProps> = ({
  supplier,
  onSaveProfile,
}) => {
  // 1. Datos de perfil y foto
  const [logoUrl, setLogoUrl] = useState(supplier.logoUrl || '');
  const [tradeName, setTradeName] = useState(supplier.tradeName || '');
  const [businessName, setBusinessName] = useState(supplier.businessName || '');
  const [nit, setNit] = useState(supplier.nit || '');
  const [category, setCategory] = useState<SupplierCategory>(supplier.category || 'Frutas y Verduras');
  const [salesWhatsapp, setSalesWhatsapp] = useState(supplier.salesWhatsapp || '');
  const [email] = useState(supplier.email || '');
  const [supportChannel, setSupportChannel] = useState<'whatsapp' | 'plataforma' | 'ambos'>(
    supplier.supportChannel || 'ambos'
  );

  // 2. Bodega y Mapa
  const [city, setCity] = useState(supplier.city || 'Ipiales');
  const [address, setAddress] = useState(supplier.address || 'Zona Industrial Ipiales, Nariño');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: Number(supplier.lat) || 0.8305,
    lng: Number(supplier.lng) || -77.6462,
  });

  // 3. Métodos de pago
  const [paymentMethods, setPaymentMethods] = useState<string[]>(
    supplier.paymentMethodsAccepted && supplier.paymentMethodsAccepted.length > 0
      ? supplier.paymentMethodsAccepted
      : ['Transferencia Bancolombia / Nequi', 'Contraentrega Efectivo']
  );
  const [paymentTiming, setPaymentTiming] = useState<'anticipado' | 'contraentrega' | 'ambos'>(
    supplier.paymentTiming || 'ambos'
  );
  const [acceptsCredit15, setAcceptsCredit15] = useState(Boolean(supplier.acceptsCredit15Days));
  const [acceptsCredit30, setAcceptsCredit30] = useState(Boolean(supplier.acceptsCredit30Days));

  // Cuenta bancaria principal
  const initialBank: BankAccount = (supplier.bankAccounts && supplier.bankAccounts[0]) || {
    bankName: 'Bancolombia',
    accountType: 'ahorros',
    accountNumber: '',
    titularName: supplier.tradeName || '',
    titularDocument: supplier.nit || '',
  };
  const [bankName, setBankName] = useState(initialBank.bankName);
  const [accountType, setAccountType] = useState<'ahorros' | 'corriente'>(initialBank.accountType);
  const [accountNumber, setAccountNumber] = useState(initialBank.accountNumber);
  const [titularName, setTitularName] = useState(initialBank.titularName);
  const [titularDocument, setTitularDocument] = useState(initialBank.titularDocument);

  // 4. Parámetros de compra y despacho
  const [minOrderCop, setMinOrderCop] = useState(Number(supplier.minOrderCop) || 150000);
  const [baseShippingFeeCop, setBaseShippingFeeCop] = useState(Number(supplier.baseShippingFeeCop) || 10000);
  const [freeShippingThresholdCop, setFreeShippingThresholdCop] = useState(
    Number(supplier.freeShippingThresholdCop) || 400000
  );
  const [orderCutoffHour, setOrderCutoffHour] = useState(supplier.orderCutoffHour || '14:00');
  const [leadTimeHours, setLeadTimeHours] = useState(Number(supplier.leadTimeHours) || 4);

  // Estados de feedback
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Carga de archivo de foto desde el dispositivo (comprime a base64 limpio)
  const handlePhotoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Por favor selecciona un archivo de imagen válido (PNG, JPG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setLogoUrl(compressedDataUrl);
          setErrorMessage(null);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Alternar método de pago
  const togglePaymentMethod = (method: string) => {
    setPaymentMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  // Guardar todos los cambios del perfil del proveedor
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeName.trim()) {
      setErrorMessage('El nombre comercial del proveedor es obligatorio.');
      return;
    }
    if (!nit.trim()) {
      setErrorMessage('El NIT o identificación tributaria es obligatorio.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const bankAccounts: BankAccount[] = accountNumber.trim()
        ? [
            {
              bankName: bankName.trim(),
              accountType,
              accountNumber: accountNumber.trim(),
              titularName: titularName.trim() || tradeName.trim(),
              titularDocument: titularDocument.trim() || nit.trim(),
            },
          ]
        : supplier.bankAccounts || [];

      await onSaveProfile({
        logoUrl: logoUrl.trim() || undefined,
        tradeName: tradeName.trim(),
        businessName: businessName.trim() || `${tradeName.trim()} S.A.S.`,
        nit: nit.trim(),
        category,
        categories: [category],
        salesWhatsapp: sanitizeRyycoPhone(salesWhatsapp || '3158009900'),
        supportChannel,
        city: city.trim() || 'Ipiales',
        address: address.trim(),
        lat: coords.lat,
        lng: coords.lng,
        paymentMethodsAccepted: paymentMethods,
        paymentTiming,
        acceptsCredit15Days: acceptsCredit15,
        acceptsCredit30Days: acceptsCredit30,
        bankAccounts,
        minOrderCop: Number(minOrderCop) || 0,
        baseShippingFeeCop: Number(baseShippingFeeCop) || 0,
        freeShippingThresholdCop: Number(freeShippingThresholdCop) || 0,
        orderCutoffHour: orderCutoffHour.trim() || '14:00',
        leadTimeHours: Number(leadTimeHours) || 4,
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: unknown) {
      console.error('Error al guardar perfil de proveedor:', err);
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la configuración del perfil.';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-in fade-in duration-200">
      {/* Banner de retroalimentación de guardado */}
      {savedSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-emerald-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs sm:text-sm font-bold">
              ¡Perfil de proveedor, bodega y métodos de pago guardados exitosamente!
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-lg">
            Sincronizado
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-900 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="text-xs sm:text-sm font-bold">{errorMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECCIÓN 1: FOTO DE PERFIL Y DATOS COMERCIALES            */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-gray-950 font-display flex items-center gap-2">
              <Store className="w-5 h-5 text-[#E52243]" />
              <span>Perfil comercial & Foto del proveedor</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Personaliza cómo ven los restaurantes tu empresa y tu identidad de marca en RYYCO.
            </p>
          </div>
          <span className="self-start sm:self-auto px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold rounded-full">
            {supplier.verifiedByRyyco ? '✓ Verificado por RYYCO' : 'En validación'}
          </span>
        </div>

        {/* Carga de Foto de Perfil */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-gray-50/70 rounded-2xl border border-gray-100">
          {/* Avatar con previsualización */}
          <div className="relative group shrink-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden border-2 border-gray-200 bg-white shadow-md flex items-center justify-center">
              {logoUrl ? (
                <img src={logoUrl} alt={tradeName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-amber-50 text-[#E52243]">
                  <Store className="w-10 h-10 stroke-[1.5]" />
                  <span className="text-[10px] font-black uppercase tracking-wider mt-1">Sin foto</span>
                </div>
              )}
            </div>

            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl('')}
                className="absolute -top-2 -right-2 p-1.5 bg-rose-600 text-white rounded-full shadow-md hover:bg-rose-700 transition-colors cursor-pointer"
                title="Quitar foto"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Opciones de carga de foto */}
          <div className="flex-1 space-y-3 w-full">
            <div>
              <label className="text-xs font-black text-gray-900 block mb-1">
                Foto de perfil / Logotipo del proveedor
              </label>
              <p className="text-xs text-gray-500">
                Sube el logo de tu empresa o una foto de tu punto de venta/bodega. Formatos recomendados: JPG, PNG o WEBP.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-2xs">
                <Upload className="w-4 h-4" />
                <span>Subir foto desde dispositivo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoFileUpload}
                  className="hidden"
                />
              </label>

              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="O pega aquí una URL de imagen..."
                className="flex-1 min-w-[200px] px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 outline-none focus:border-[#E52243]"
              />
            </div>

            {/* Presets rápidos de fotos */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-gray-500 font-medium">Logos sugeridos:</span>
              {PRESET_LOGOS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setLogoUrl(p.url)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border font-bold transition-all cursor-pointer ${
                    logoUrl === p.url
                      ? 'bg-red-50 border-[#E52243] text-[#E52243]'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Campos de texto de identificación */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Nombre comercial oficial <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="Ej. Frigorífico Los Andes"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-sm font-bold text-gray-900 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              NIT / Identificación tributaria <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              placeholder="Ej. 901.882.104-5"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-sm font-bold text-gray-900 outline-none font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Razón social legal
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Ej. Frigorífico Los Andes del Sur S.A.S."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] text-sm text-gray-900 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Categoría principal de insumos <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupplierCategory)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] text-sm font-semibold text-gray-900 outline-none bg-white cursor-pointer"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              WhatsApp comercial de pedidos <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={salesWhatsapp}
              onChange={(e) => setSalesWhatsapp(e.target.value)}
              placeholder="Ej. 317 440 9182"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] text-sm font-bold text-gray-900 outline-none font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Correo autorizado para ingresar (Google Login)
            </label>
            <input
              type="text"
              disabled
              value={email}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-mono text-gray-500 cursor-not-allowed outline-none"
            />
            <p className="text-[11px] text-gray-400">
              Asignado en la homologación por RYYCO Central.
            </p>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECCIÓN 2: MAPA INTERACTIVO Y UBICACIÓN DE LA BODEGA     */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="pb-4 border-b border-gray-100">
          <h3 className="text-lg sm:text-xl font-black text-gray-950 font-display flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#E52243]" />
            <span>Ubicación de la bodega en el mapa</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Fija el punto geográfico exacto de despacho para calcular distancias, rutas y optimizar entregas a restaurantes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Ciudad de despacho <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ipiales, Pasto, etc."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] text-sm font-bold text-gray-900 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Dirección física de bodega o punto de despacho <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ej. Km 3 Vía al Sur, Bodega 9, Ipiales"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] text-sm text-gray-900 outline-none font-medium"
            />
          </div>
        </div>

        {/* Componente de Mapa Leaflet */}
        <WarehouseLocationPickerMap
          lat={coords.lat}
          lng={coords.lng}
          address={address}
          city={city}
          tradeName={tradeName}
          onChange={(newCoords) => {
            setCoords({ lat: newCoords.lat, lng: newCoords.lng });
            if (newCoords.address) {
              setAddress(newCoords.address);
            }
            if (newCoords.city) {
              setCity(newCoords.city);
            }
          }}
        />
      </div>

      {/* ======================================================== */}
      {/* SECCIÓN 3: MÉTODOS DE PAGO Y CUENTA BANCARIA             */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="pb-4 border-b border-gray-100">
          <h3 className="text-lg sm:text-xl font-black text-gray-950 font-display flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#E52243]" />
            <span>Métodos de pago aceptados & Cuentas de recaudo</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Configura cómo te pagarán los restaurantes al recibir o encargar sus pedidos.
          </p>
        </div>

        {/* Métodos de Pago Disponibles */}
        <div className="space-y-3">
          <label className="text-xs font-black text-gray-900 uppercase tracking-wider block">
            Selecciona los medios de pago que aceptas:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {COMMON_PAYMENT_METHODS.map((method) => {
              const isChecked = paymentMethods.includes(method);
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => togglePaymentMethod(method)}
                  className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-red-50/70 border-[#E52243] text-gray-950 shadow-2xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-lg border mt-0.5 flex items-center justify-center shrink-0 ${
                      isChecked
                        ? 'bg-[#E52243] border-[#E52243] text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                  <span className="text-xs font-bold leading-snug">{method}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Momento del pago */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Momento de liquidación
            </label>
            <select
              value={paymentTiming}
              onChange={(e) => setPaymentTiming(e.target.value as any)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-bold text-gray-900 bg-white cursor-pointer"
            >
              <option value="ambos">Ambos (Anticipado o Contraentrega)</option>
              <option value="anticipado">Solo pago anticipado</option>
              <option value="contraentrega">Solo contraentrega</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Crédito a 15 días
            </label>
            <div className="flex items-center h-10 gap-2">
              <input
                type="checkbox"
                id="credit15"
                checked={acceptsCredit15}
                onChange={(e) => setAcceptsCredit15(e.target.checked)}
                className="w-4 h-4 text-[#E52243] rounded border-gray-300 cursor-pointer"
              />
              <label htmlFor="credit15" className="text-xs text-gray-700 font-bold cursor-pointer">
                Habilitar crédito 15 días
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Crédito a 30 días
            </label>
            <div className="flex items-center h-10 gap-2">
              <input
                type="checkbox"
                id="credit30"
                checked={acceptsCredit30}
                onChange={(e) => setAcceptsCredit30(e.target.checked)}
                className="w-4 h-4 text-[#E52243] rounded border-gray-300 cursor-pointer"
              />
              <label htmlFor="credit30" className="text-xs text-gray-700 font-bold cursor-pointer">
                Habilitar crédito 30 días
              </label>
            </div>
          </div>
        </div>

        {/* Cuenta Bancaria de Recaudo */}
        <div className="bg-gray-50/80 border border-gray-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#D97706]" />
            <span className="text-xs font-black text-gray-900 uppercase tracking-wider">
              Datos de Cuenta Bancaria / Transferencias
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                Entidad bancaria o billetera:
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Bancolombia, Nequi, Daviplata..."
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                Tipo de cuenta:
              </label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none cursor-pointer"
              >
                <option value="ahorros">Cuenta de Ahorros</option>
                <option value="corriente">Cuenta Corriente</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                Número de cuenta o celular Nequi:
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Ej. 123456789 o 315800..."
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold font-mono text-gray-900 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                Nombre del titular:
              </label>
              <input
                type="text"
                value={titularName}
                onChange={(e) => setTitularName(e.target.value)}
                placeholder="Titular de la cuenta"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 block">
                Documento / NIT del titular:
              </label>
              <input
                type="text"
                value={titularDocument}
                onChange={(e) => setTitularDocument(e.target.value)}
                placeholder="NIT o C.C."
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-mono text-gray-900 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECCIÓN 4: POLÍTICAS DE FLETE Y DESPACHO                 */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="pb-4 border-b border-gray-100">
          <h3 className="text-lg sm:text-xl font-black text-gray-950 font-display flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#E52243]" />
            <span>Condiciones de pedido y flete</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Define montos mínimos, flete y tiempo estimado de entrega.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Pedido mínimo (COP)
            </label>
            <input
              type="number"
              step={10000}
              value={minOrderCop}
              onChange={(e) => setMinOrderCop(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-900 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Costo base de flete (COP)
            </label>
            <input
              type="number"
              step={1000}
              value={baseShippingFeeCop}
              onChange={(e) => setBaseShippingFeeCop(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-900 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Envío gratis desde (COP)
            </label>
            <input
              type="number"
              step={10000}
              value={freeShippingThresholdCop}
              onChange={(e) => setFreeShippingThresholdCop(Number(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-900 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-gray-800 block">
              Hora de corte diario
            </label>
            <input
              type="text"
              value={orderCutoffHour}
              onChange={(e) => setOrderCutoffHour(e.target.value)}
              placeholder="14:00"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-900 outline-none"
            />
          </div>
        </div>
      </div>

      {/* BOTÓN FLOTANTE O FIJO DE GUARDAR PERFIL */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-[#E52243] hover:bg-[#C91836] text-white text-sm font-black rounded-2xl shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          <span>{isSaving ? 'Guardando cambios del perfil...' : 'Guardar perfil completo'}</span>
        </button>
      </div>
    </form>
  );
};
