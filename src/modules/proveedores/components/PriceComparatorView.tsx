/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  SupplierProduct,
  RyycoSupplier,
} from '../types/ryycoB2B';
import {
  formatCop,
  getEffectiveUnitPrice,
  getNormalizedUnitCost,
} from '../utils/ryycoFormatters';
import {
  Scale,
  Truck,
  CreditCard,
  CheckCircle2,
  Info,
  ArrowRight,
  Check,
  Store,
} from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import { RyycoHeroGroceryGraphic } from './RyycoHeroGroceryGraphic';

interface PriceComparatorViewProps {
  products: SupplierProduct[];
  suppliers: RyycoSupplier[];
  onAddToCart: (product: SupplierProduct, qty: number) => void;
}

const QUANTITY_OPTIONS = [2, 5, 6, 10, 12];

export const PriceComparatorView: React.FC<PriceComparatorViewProps> = ({
  products,
  suppliers,
  onAddToCart,
}) => {
// Productos garantizados sin duplicados directamente desde Cloud Firestore
  const effectiveProducts: SupplierProduct[] = React.useMemo(() => {
    const seenIds = new Set<string>();
    return products.filter((p) => {
      const key = p.id || `${p.supplierId || p.supplierTradeName}-${p.sku || p.name}`;
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });
  }, [products]);

  // Grupos de productos equivalentes
  const groups = Array.from(
    new Map(
      effectiveProducts
        .filter((p) => p.active)
        .map((p) => [p.equivalentGroupKey, (p.equivalentGroupName || p.name).toUpperCase()])
    ).entries()
  );

  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('');

  React.useEffect(() => {
    if (groups.length > 0 && (!selectedGroupKey || !groups.some(([k]) => k === selectedGroupKey))) {
      setSelectedGroupKey(groups[0][0]);
    }
  }, [groups, selectedGroupKey]);

  const [simulatedUnits, setSimulatedUnits] = useState<number>(6);
  const [addedId, setAddedId] = useState<string | null>(null);

  // Ofertas que coinciden con el insumo seleccionado (estrictamente sin duplicados)
  const matchingProducts = React.useMemo(() => {
    const seenOfferIds = new Set<string>();
    return effectiveProducts
      .filter((p) => {
        if (!p.active) return false;
        const matchesGroup =
          p.equivalentGroupKey === selectedGroupKey ||
          p.name.toLowerCase().includes(selectedGroupKey.toLowerCase().replace('grp-', ''));
        if (!matchesGroup) return false;
        if (seenOfferIds.has(p.id)) return false;
        seenOfferIds.add(p.id);
        return true;
      })
      .map((p) => {
        const supplier = suppliers.find((s) => s.id === p.supplierId) || {
          id: p.supplierId,
          tradeName: p.supplierTradeName,
          verifiedByRyyco: true,
          baseShippingFeeCop: 9000,
          freeShippingThresholdCop: 580000,
          acceptsCredit15Days: true,
          leadTimeHours: 4,
        };

      const effectivePresentationPrice = getEffectiveUnitPrice(p, simulatedUnits);
      const normalizedCost = getNormalizedUnitCost(p, simulatedUnits);
      const totalOrderAmount = effectivePresentationPrice * simulatedUnits;
      const shipping =
        totalOrderAmount >= (supplier.freeShippingThresholdCop || 580000)
          ? 0
          : supplier.baseShippingFeeCop ?? 9000;
      const grandTotal = totalOrderAmount + shipping;

      return {
        product: p,
        supplier,
        effectivePresentationPrice,
        normalizedCost,
        totalOrderAmount,
        shipping,
        grandTotal,
      };
    })
    .sort((a, b) => a.normalizedCost - b.normalizedCost);
  }, [effectiveProducts, selectedGroupKey, simulatedUnits, suppliers]);

  const handleChooseOffer = (product: SupplierProduct) => {
    onAddToCart(product, simulatedUnits);
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1800);
  };

  return (
    <div className="space-y-6">
      {/* 1. HERO BANNER OFICIAL (MOCKUP COMPARADOR) */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#FFF5EE] via-[#FFF8F3] to-[#FEF3EC] border border-[#FDE5D6] p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row items-center justify-between gap-8">
        <div className="relative z-10 max-w-xl space-y-3">
          <div className="text-[11px] font-black tracking-wider text-[#D97706] uppercase">
            COMPARADOR NORMALIZADO DE INSUMOS CORPORATIVOS
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-[#111827] font-display leading-[1.15]">
            Compara el costo real
          </h1>

          <p className="text-sm text-gray-600 leading-relaxed max-w-lg">
            Por kilo, litro o unidad. Considera presentación, volumen y transporte.
          </p>
        </div>

        {/* Gráfico de la bolsa de mercado con hortalizas */}
        <div className="shrink-0 w-full lg:w-auto flex justify-center">
          <RyycoHeroGroceryGraphic className="w-full max-w-[280px] sm:max-w-[340px] lg:w-[380px]" />
        </div>
      </section>

      {effectiveProducts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center space-y-3 shadow-xs">
          <Store className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="text-base font-bold text-gray-900">Aún no hay insumos registrados para comparar</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Cuando los proveedores homologados publiquen sus productos y presentaciones en la base de datos, podrás comparar cotizaciones y costos por unidad aquí.
          </p>
        </div>
      ) : (
        <>
          {/* 2. PRESENTACIONES A COTIZAR (PÍLDORAS DE VOLUMEN) */}
          <div className="space-y-2">
        <h3 className="text-xs font-extrabold text-gray-900">
          Presentaciones a cotizar
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          {QUANTITY_OPTIONS.map((qty) => {
            const isSelected = simulatedUnits === qty;
            return (
              <button
                key={qty}
                type="button"
                onClick={() => setSimulatedUnits(qty)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#E52243] text-white shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {qty} uds
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. PESTAÑAS DE PRODUCTO EQUIVALENTE (PAPA PRUEBA / CEBOLLA) */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {groups.map(([key, name]) => {
          const isSelected = selectedGroupKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedGroupKey(key)}
              className={`px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#FDF2F4] text-[#E52243] border-2 border-[#E52243] shadow-xs'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* 4. TABLA COMPARATIVA (PC) / TARJETA COMPARATIVA (CELULAR) */}
      <div className="space-y-4">
        {/* VISTA PC (TABLA OFICIAL) */}
        <div className="hidden lg:block bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-white text-gray-500 text-[11px] font-bold">
                  <th className="py-4 px-6 font-semibold">Proveedor y Presentación</th>
                  <th className="py-4 px-4 font-semibold">Entrega y Crédito</th>
                  <th className="py-4 px-4 font-semibold text-center">Precio por presentación</th>
                  <th className="py-4 px-4 font-semibold text-center">Precio por kg</th>
                  <th className="py-4 px-4 font-semibold text-center">Productos ({simulatedUnits} presentaciones)</th>
                  <th className="py-4 px-4 font-semibold text-center">Transporte</th>
                  <th className="py-4 px-4 font-semibold text-center">Total</th>
                  <th className="py-4 px-6 font-semibold text-center">Acción</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 text-xs">
                {matchingProducts.map((item) => (
                  <tr key={item.product.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* Proveedor y presentación */}
                    <td className="py-5 px-6">
                      <div className="flex items-center gap-3.5">
                        <div className="w-16 h-14 rounded-2xl bg-[#FAFBFD] border border-gray-100 overflow-hidden flex items-center justify-center p-1 shrink-0">
                          <ResilientImage
                            src={item.product.photoUrl}
                            alt={item.product.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm text-gray-950">
                              {item.supplier?.tradeName || item.product.supplierTradeName}
                            </span>
                            <CheckCircle2 className="w-3.5 h-3.5 fill-[#0D7A57] text-white" />
                          </div>
                          <span className="text-[11px] text-[#0D7A57] font-bold block">
                            Proveedor Verificado RYYCO
                          </span>
                          <h4 className="font-black text-gray-900 text-sm">
                            {item.product.name}
                          </h4>
                          <p className="text-[11px] text-gray-500 font-medium">
                            {item.product.presentationLabel} · SKU {item.product.sku}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Entrega y crédito */}
                    <td className="py-5 px-4">
                      <div className="space-y-1.5 text-xs text-gray-700 font-medium">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-gray-500 shrink-0" />
                          <span>Entrega en <strong>4 horas</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-gray-500 shrink-0" />
                          <span>Crédito corporativo <strong>15 días</strong></span>
                        </div>
                      </div>
                    </td>

                    {/* Precio por presentación */}
                    <td className="py-5 px-4 text-center font-extrabold text-sm text-gray-950">
                      {formatCop(item.effectivePresentationPrice)}
                    </td>

                    {/* Precio por base (kg / litro / unidad) */}
                    <td className="py-5 px-4 text-center">
                      <div className="font-extrabold text-sm text-gray-950">
                        {formatCop(item.normalizedCost)}
                      </div>
                      <span className="text-[10px] text-gray-500 font-medium">
                        por 1 {item.product.baseUnit}
                      </span>
                    </td>

                    {/* Total productos */}
                    <td className="py-5 px-4 text-center font-extrabold text-sm text-gray-950">
                      {formatCop(item.totalOrderAmount)}
                    </td>

                    {/* Transporte */}
                    <td className="py-5 px-4 text-center font-extrabold text-sm text-gray-950">
                      {formatCop(item.shipping)}
                    </td>

                    {/* Gran total */}
                    <td className="py-5 px-4 text-center font-black text-base text-gray-950 font-display">
                      {formatCop(item.grandTotal)}
                    </td>

                    {/* Botón de acción */}
                    <td className="py-5 px-6 text-center">
                      <button
                        type="button"
                        onClick={() => handleChooseOffer(item.product)}
                        className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        {addedId === item.product.id ? (
                          <>
                            <Check className="w-4 h-4 text-white" />
                            <span>¡Agregado!</span>
                          </>
                        ) : (
                          <>
                            <span>Elegir oferta</span>
                            <ArrowRight className="w-3.5 h-3.5 text-white" />
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* VISTA CELULAR (TARJETA VERTICAL OFICIAL MOCKUP) */}
        <div className="lg:hidden space-y-4">
          {matchingProducts.map((item) => (
            <div
              key={item.product.id}
              className="bg-white rounded-3xl border border-gray-200 p-5 shadow-xs space-y-4"
            >
              {/* Encabezado: Foto + Proveedor + Insumo */}
              <div className="flex items-center gap-3.5">
                <div className="w-20 h-20 rounded-2xl bg-[#FAFBFD] border border-gray-100 overflow-hidden flex items-center justify-center p-1 shrink-0">
                  <ResilientImage
                    src={item.product.photoUrl}
                    alt={item.product.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-base text-gray-950">
                      {item.supplier?.tradeName || item.product.supplierTradeName}
                    </span>
                    <CheckCircle2 className="w-4 h-4 fill-[#0D7A57] text-white" />
                  </div>
                  <span className="text-[11px] text-[#0D7A57] font-bold block">
                    Proveedor Verificado RYYCO
                  </span>
                  <h4 className="font-extrabold text-sm text-gray-900">
                    {item.product.name}
                  </h4>
                  <p className="text-xs text-gray-500 font-medium">
                    {item.product.presentationLabel} · SKU {item.product.sku}
                  </p>
                </div>
              </div>

              {/* Condiciones de entrega y crédito */}
              <div className="p-3 bg-gray-50 rounded-2xl space-y-1.5 text-xs text-gray-700">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-gray-500 shrink-0" />
                  <span>Entrega en <strong>4 horas</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-gray-500 shrink-0" />
                  <span>Crédito corporativo <strong>15 días</strong></span>
                </div>
              </div>

              {/* Desglose de precios */}
              <div className="space-y-2 text-xs divide-y divide-gray-100">
                <div className="pt-2 flex items-center justify-between text-gray-600">
                  <span>Precio por presentación</span>
                  <span className="font-extrabold text-gray-950 text-sm">
                    {formatCop(item.effectivePresentationPrice)}
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-between text-gray-600">
                  <span>Precio por {item.product.baseUnit}</span>
                  <div className="text-right">
                    <span className="font-extrabold text-gray-950 text-sm">
                      {formatCop(item.normalizedCost)}
                    </span>
                    <span className="text-[10px] text-gray-400 block font-medium">
                      por 1 {item.product.baseUnit}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-gray-600">
                  <span>Productos ({simulatedUnits} presentaciones)</span>
                  <span className="font-extrabold text-gray-950">
                    {formatCop(item.totalOrderAmount)}
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-between text-gray-600">
                  <span>Transporte</span>
                  <span className="font-extrabold text-gray-950">
                    {formatCop(item.shipping)}
                  </span>
                </div>

                <div className="pt-3 flex items-center justify-between">
                  <span className="font-black text-gray-950 text-sm">Total</span>
                  <span className="font-black text-xl text-gray-950 font-display">
                    {formatCop(item.grandTotal)}
                  </span>
                </div>
              </div>

              {/* Botón de acción */}
              <button
                type="button"
                onClick={() => handleChooseOffer(item.product)}
                className="w-full py-3.5 px-4 rounded-2xl bg-[#E52243] hover:bg-[#C91836] text-white text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {addedId === item.product.id ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>¡Agregado a tu bolsa!</span>
                  </>
                ) : (
                  <>
                    <span>Elegir oferta</span>
                    <ArrowRight className="w-4 h-4 text-white" />
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
        </>
      )}

      {/* 5. AVISO INFORMATIVO INFERIOR (MOCKUP) */}
      <div className="p-4 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] flex items-center gap-3 text-xs text-amber-900 font-bold">
        <div className="w-6 h-6 rounded-full bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
          <Info className="w-4 h-4" />
        </div>
        <span>Compara el costo por unidad base y revisa el total con transporte.</span>
      </div>
    </div>
  );
};
