/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  DollarSign,
  Truck,
  Scale,
  Sparkles,
  Layers,
  AlertCircle,
  Save,
  Image as ImageIcon,
  Check,
  Upload,
  Trash2,
} from 'lucide-react';
import { SupplierProduct, SupplierCategory, ProductAvailability } from '../types/ryycoB2B';
import { formatCop } from '../utils/ryycoFormatters';

interface SupplierEditProductModalProps {
  isOpen: boolean;
  product: SupplierProduct | null;
  onClose: () => void;
  onSave: (productId: string, updated: Partial<SupplierProduct>) => Promise<void>;
}

const CATEGORIES: SupplierCategory[] = [
  'Frutas y Verduras',
  'Cárnicos y Embutidos',
  'Aceites y Abarrotes',
  'Lácteos y Quesos',
  'Empaques Biodegradables',
  'Bebidas y Licores',
];

const QUICK_IMAGE_PRESETS: { label: string; url: string }[] = [
  { label: 'Papa / Tubérculos', url: '/assets/prod-papa.webp' },
  { label: 'Cebolla / Hortalizas', url: '/assets/prod-cebolla.webp' },
  { label: 'Cárnicos / Embutidos', url: '/assets/cat-carnicos.webp' },
  { label: 'Aceites / Abarrotes', url: '/assets/cat-aceites.webp' },
  { label: 'Lácteos / Quesos', url: '/assets/cat-lacteos.webp' },
  { label: 'Empaques Kraft', url: '/assets/aistudio/ryyco_empaques_opt.webp' },
];

export const SupplierEditProductModal: React.FC<SupplierEditProductModalProps> = ({
  isOpen,
  product,
  onClose,
  onSave,
}) => {
  if (!isOpen || !product) return null;

  const [name, setName] = useState(product.name || '');
  const [sku, setSku] = useState(product.sku || '');
  const [description, setDescription] = useState(product.description || '');
  const [category, setCategory] = useState<SupplierCategory>(product.category || 'Frutas y Verduras');
  const [presentationLabel, setPresentationLabel] = useState(product.presentationLabel || '');
  const [baseUnit, setBaseUnit] = useState(product.baseUnit || 'kg');
  const [baseUnitQuantity, setBaseUnitQuantity] = useState<number>(product.baseUnitQuantity || 1);
  const [priceCop, setPriceCop] = useState<number>(product.priceCop || 0);
  const [stock, setStock] = useState<number>(product.stock || 50);
  const [availability, setAvailability] = useState<ProductAvailability>(product.availability || 'disponible');
  const [isVariableWeight, setIsVariableWeight] = useState<boolean>(Boolean(product.isVariableWeight));
  const [storageCondition, setStorageCondition] = useState<'ambiente' | 'refrigerado' | 'congelado'>(
    product.storageCondition || 'ambiente'
  );
  const [photoUrl, setPhotoUrl] = useState<string>(product.photoUrl || '');

  // Escala por volumen
  const existingTier = product.volumeTiers && product.volumeTiers[0];
  const [hasTier, setHasTier] = useState<boolean>(Boolean(existingTier));
  const [tierQty, setTierQty] = useState<number>(existingTier?.minQty || 5);
  const [tierPriceCop, setTierPriceCop] = useState<number>(existingTier?.unitPriceCop || Math.round(product.priceCop * 0.9));

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
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
          setPhotoUrl(compressedDataUrl);
          setErrorMessage(null);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setSku(product.sku || '');
      setDescription(product.description || '');
      setCategory(product.category || 'Frutas y Verduras');
      setPresentationLabel(product.presentationLabel || '');
      setBaseUnit(product.baseUnit || 'kg');
      setBaseUnitQuantity(product.baseUnitQuantity || 1);
      setPriceCop(product.priceCop || 0);
      setStock(product.stock || 50);
      setAvailability(product.availability || 'disponible');
      setIsVariableWeight(Boolean(product.isVariableWeight));
      setStorageCondition(product.storageCondition || 'ambiente');
      setPhotoUrl(product.photoUrl || '');

      const t = product.volumeTiers && product.volumeTiers[0];
      setHasTier(Boolean(t));
      setTierQty(t?.minQty || 5);
      setTierPriceCop(t?.unitPriceCop || Math.round(product.priceCop * 0.9));
    }
  }, [product]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Por favor ingresa el nombre del insumo.');
      return;
    }
    if (priceCop <= 0) {
      setErrorMessage('El precio mayorista debe ser mayor a 0 COP.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const volumeTiers =
        hasTier && tierPriceCop > 0 && tierPriceCop < priceCop
          ? [
              {
                minQty: Math.max(2, Number(tierQty) || 5),
                unitPriceCop: Number(tierPriceCop),
                label: `${tierQty}+ uds (${formatCop(tierPriceCop / (baseUnitQuantity || 1))}/${baseUnit})`,
              },
            ]
          : [];

      await onSave(product.id, {
        name: name.trim(),
        sku: sku.trim() || product.sku,
        description: description.trim(),
        category,
        presentationLabel: presentationLabel.trim() || 'Unidad de venta mayorista',
        baseUnit,
        baseUnitQuantity: Math.max(0.1, Number(baseUnitQuantity) || 1),
        priceCop: Number(priceCop),
        volumeTiers,
        stock: Math.max(0, Number(stock) || 0),
        availability,
        isVariableWeight: Boolean(isVariableWeight),
        storageCondition,
        photoUrl: photoUrl.trim() || product.photoUrl,
        leadTimePrepHours: availability === 'bajo_pedido' ? 24 : 0,
      });

      onClose();
    } catch (err: unknown) {
      console.error('Error actualizando insumo:', err);
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la actualización del insumo.';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} aria-label="Cerrar modal" />

      <div className="relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh] border border-gray-100">
        {/* Barra de arrastre móvil */}
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto my-3 shrink-0" />

        {/* Cabecera del modal */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-50 text-[#E52243] flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-950 font-display">
                Editar insumo completo
              </h3>
              <p className="text-xs text-gray-500">
                Modifica especificaciones, precios y disponibilidad de <strong className="text-gray-800">{product.name}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* SECCIÓN 1: DATOS BÁSICOS */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-black text-gray-950 uppercase tracking-wider">
              <Package className="w-4 h-4 text-[#F59E0B]" />
              <span>Identificación del insumo</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-extrabold text-gray-800 block">
                Nombre oficial del insumo <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Papa Criolla Seleccionada Bulto"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-xs font-bold text-gray-900 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-gray-800 block">
                  Código SKU / Referencia
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-xs font-bold text-gray-900 outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-extrabold text-gray-800 block">
                  Categoría Mayorista <span className="text-rose-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SupplierCategory)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] focus:ring-1 focus:ring-[#E52243] text-xs font-bold text-gray-900 outline-none bg-white cursor-pointer"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-extrabold text-gray-800 block">
                Descripción comercial para restaurantes
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalla calibre, origen, frescura o especificaciones de entrega..."
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 focus:border-[#E52243] text-xs text-gray-900 outline-none resize-none"
              />
            </div>
          </div>

          {/* SECCIÓN 2: PRESENTACIÓN Y PRECIO */}
          <div className="space-y-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs font-black text-gray-950 uppercase tracking-wider">
              <DollarSign className="w-4 h-4 text-[#F59E0B]" />
              <span>Presentación y Precios</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-gray-800 block">
                  Presentación de Venta <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={presentationLabel}
                  onChange={(e) => setPresentationLabel(e.target.value)}
                  placeholder="Ej. Bulto 50 kg, Caja master x 10 uds..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-[#E52243] text-xs font-bold text-gray-900 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-extrabold text-gray-800 block">
                  Precio Mayorista Base (COP) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={100}
                  value={priceCop}
                  onChange={(e) => setPriceCop(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-red-200 focus:border-[#E52243] text-sm font-black text-gray-950 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-gray-800 block">
                  Contenido & Unidad Base
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0.1}
                    step="any"
                    value={baseUnitQuantity}
                    onChange={(e) => setBaseUnitQuantity(Number(e.target.value))}
                    className="w-24 px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none"
                  />
                  <select
                    value={baseUnit}
                    onChange={(e) => setBaseUnit(e.target.value as any)}
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none bg-white cursor-pointer"
                  >
                    <option value="kg">Kilogramos (kg)</option>
                    <option value="litro">Litros (L)</option>
                    <option value="unidad">Unidades (ud)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-extrabold text-gray-800 block">
                  Stock / Unidades Disponibles
                </label>
                <input
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(e) => setStock(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none"
                />
              </div>
            </div>

            {/* Escala por volumen opcional */}
            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="editHasTier"
                    checked={hasTier}
                    onChange={(e) => setHasTier(e.target.checked)}
                    className="w-4 h-4 text-[#E52243] rounded border-gray-300 cursor-pointer"
                  />
                  <label htmlFor="editHasTier" className="text-xs font-bold text-gray-900 cursor-pointer">
                    Habilitar descuento por volumen (escala mayorista)
                  </label>
                </div>
              </div>

              {hasTier && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-200/60">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-700 block">
                      A partir de cuántas unidades:
                    </label>
                    <input
                      type="number"
                      min={2}
                      value={tierQty}
                      onChange={(e) => setTierQty(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-900 bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-700 block">
                      Precio especial por unidad (COP):
                    </label>
                    <input
                      type="number"
                      min={100}
                      value={tierPriceCop}
                      onChange={(e) => setTierPriceCop(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-[#E52243] bg-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN 3: LOGÍSTICA Y FOTO */}
          <div className="space-y-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs font-black text-gray-950 uppercase tracking-wider">
              <Truck className="w-4 h-4 text-[#F59E0B]" />
              <span>Disponibilidad e Imagen</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-gray-800 block">
                  Disponibilidad
                </label>
                <select
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value as ProductAvailability)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 bg-white cursor-pointer"
                >
                  <option value="disponible">Disponible inmediato</option>
                  <option value="bajo_pedido">Bajo pedido (24h)</option>
                  <option value="agotado">Agotado temporalmente</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-extrabold text-gray-800 block">
                  Almacenamiento
                </label>
                <select
                  value={storageCondition}
                  onChange={(e) => setStorageCondition(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 bg-white cursor-pointer"
                >
                  <option value="ambiente">Ambiente</option>
                  <option value="refrigerado">Refrigerado</option>
                  <option value="congelado">Congelado</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-extrabold text-gray-800 block">
                  Tipo de pesaje
                </label>
                <div className="flex items-center h-9 gap-2">
                  <input
                    type="checkbox"
                    id="editVarWeight"
                    checked={isVariableWeight}
                    onChange={(e) => setIsVariableWeight(e.target.checked)}
                    className="w-4 h-4 text-[#E52243] rounded border-gray-300 cursor-pointer"
                  />
                  <label htmlFor="editVarWeight" className="text-xs text-gray-700 cursor-pointer select-none">
                    Peso variable
                  </label>
                </div>
              </div>
            </div>

            {/* Foto del Insumo con botón de carga y previsualización */}
            <div className="space-y-3">
              <label className="text-xs font-black text-gray-900 uppercase tracking-wider block">
                Foto del insumo
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-gray-50/80 rounded-2xl border border-gray-200">
                {/* Previsualización de la foto */}
                <div className="relative group shrink-0">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-gray-200 bg-white shadow-xs flex items-center justify-center">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={name || 'Insumo'}
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400 p-2 text-center">
                        <ImageIcon className="w-8 h-8 stroke-[1.5]" />
                        <span className="text-[10px] font-bold mt-1">Sin imagen</span>
                      </div>
                    )}
                  </div>

                  {photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      className="absolute -top-2 -right-2 p-1.5 bg-rose-600 text-white rounded-full shadow-md hover:bg-rose-700 transition-colors cursor-pointer"
                      title="Quitar foto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Botón para agregar o cambiar la imagen */}
                <div className="flex-1 space-y-2.5 w-full text-center sm:text-left">
                  <div>
                    <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-xs active:scale-95">
                      <Upload className="w-4 h-4" />
                      <span>{photoUrl ? 'Cambiar imagen del insumo' : 'Agregar imagen del insumo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoFileUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      Sube una foto desde tu equipo o dispositivo móvil (JPG, PNG o WEBP).
                    </p>
                  </div>

                  {/* Selector rápido de fotos sugeridas */}
                  <div className="pt-2 border-t border-gray-200/60">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                      O selecciona una foto sugerida:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 justify-center sm:justify-start">
                      {QUICK_IMAGE_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setPhotoUrl(preset.url)}
                          className={`px-2.5 py-1 text-[11px] rounded-lg border font-bold transition-all cursor-pointer ${
                            photoUrl === preset.url
                              ? 'bg-red-50 border-[#E52243] text-[#E52243]'
                              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer text-center"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Guardando insumo...' : 'Guardar cambios completos'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
