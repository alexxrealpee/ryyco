import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProductItem } from '../types';
import { Pizza, Search, Check, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import { getVariantPrice, parseSingleVariant } from '../lib/variantHelper';

interface PizzaFlavorSelectorProps {
  product: ProductItem;
  onVariantChange: (variantString: string, isValid: boolean, variantPrice?: number) => void;
  currency?: string;
  initialSizeVariant?: string;
}

export const PizzaFlavorSelector: React.FC<PizzaFlavorSelectorProps> = ({
  product,
  onVariantChange,
  currency = '$',
  initialSizeVariant
}) => {
  // Extract available flavors list
  const flavors = useMemo(() => {
    if (!product.flavorsText) return [];
    return product.flavorsText
      .split(',')
      .map(f => f.trim())
      .filter(Boolean);
  }, [product.flavorsText]);

  // Extract available sizes (from variantsText)
  const sizes = useMemo(() => {
    if (!product.variantsText) return [];
    return product.variantsText
      .split(',')
      .map(s => {
        const parsed = parseSingleVariant(s);
        return parsed.name || s.trim();
      })
      .filter(Boolean);
  }, [product.variantsText]);

  const allowsHalfAndHalf = product.allowsHalfAndHalf !== false;
  const allowSingle = product.allowSingleFlavor !== false;

  // Selected mode
  const [mode, setMode] = useState<'half_half' | 'single'>(
    allowsHalfAndHalf ? 'half_half' : 'single'
  );

  // Active half being picked: 1 or 2
  const [activeHalfTab, setActiveHalfTab] = useState<1 | 2>(1);

  // Selections
  const [selectedHalf1, setSelectedHalf1] = useState<string>(flavors[0] || '');
  const [selectedHalf2, setSelectedHalf2] = useState<string>(flavors[1] || flavors[0] || '');
  const [selectedSingleFlavor, setSelectedSingleFlavor] = useState<string>(flavors[0] || '');

  // Determine initial size safely from initialSizeVariant or first size
  const [selectedSize, setSelectedSize] = useState<string>(() => {
    if (initialSizeVariant) {
      const parsed = initialSizeVariant.split('|')[0].trim().toLowerCase();
      const match = sizes.find(s => s.trim().toLowerCase() === parsed);
      if (match) return match;
    }
    return sizes[0] || '';
  });

  // Stable ref for parent callback to avoid re-triggering effects
  const onVariantChangeRef = useRef(onVariantChange);
  useEffect(() => {
    onVariantChangeRef.current = onVariantChange;
  });

  // Sync state ONLY when product.id changes to a different product
  const prevProductIdRef = useRef(product.id);
  useEffect(() => {
    if (prevProductIdRef.current !== product.id) {
      prevProductIdRef.current = product.id;
      const parsed = (initialSizeVariant || '').split('|')[0].trim().toLowerCase();
      const match = sizes.find(s => s.trim().toLowerCase() === parsed);
      setSelectedSize(match || sizes[0] || '');
      setSelectedHalf1(flavors[0] || '');
      setSelectedHalf2(flavors[1] || flavors[0] || '');
      setSelectedSingleFlavor(flavors[0] || '');
      setActiveHalfTab(1);
    }
  }, [product.id, initialSizeVariant, sizes, flavors]);

  const isPizza = (product.name || '').toLowerCase().includes('pizza') || (product.name || '').toLowerCase().includes('piza') || (product.category || '').toLowerCase().includes('pizza');
  const isHelado = (product.name || '').toLowerCase().includes('helad') || (product.category || '').toLowerCase().includes('helad');
  const productEmoji = isPizza ? '🍕' : isHelado ? '🍨' : '✨';
  const headerTitle = 'Personaliza los Sabores';
  const portion1Label = isPizza ? 'Mitad 1' : 'Sabor 1';
  const portion2Label = isPizza ? 'Mitad 2' : 'Sabor 2';

  // Search filter for flavors
  const [searchQuery, setSearchQuery] = useState('');

  // Filter flavors by search
  const filteredFlavors = useMemo(() => {
    if (!searchQuery.trim()) return flavors;
    const q = searchQuery.toLowerCase().trim();
    return flavors.filter(f => f.toLowerCase().includes(q));
  }, [flavors, searchQuery]);

  // Compute validity and resulting string
  useEffect(() => {
    let isValid = true;
    let variantString = '';

    const sizePrefix = selectedSize ? `${selectedSize} | ` : '';

    if (mode === 'half_half') {
      if (!selectedHalf1 || !selectedHalf2) {
        isValid = false;
      }
      variantString = `${sizePrefix}${portion1Label}: ${selectedHalf1 || '...'} / ${portion2Label}: ${selectedHalf2 || '...'}`;
    } else {
      if (!selectedSingleFlavor) {
        isValid = false;
      }
      variantString = `${sizePrefix}Sabor: ${selectedSingleFlavor || '...'}`;
    }

    if (sizes.length > 0 && !selectedSize) {
      isValid = false;
    }

    const currentVariantPrice = selectedSize ? getVariantPrice(product, selectedSize) : (Number(product.price) || 0);
    onVariantChangeRef.current(variantString, isValid, currentVariantPrice);
  }, [mode, selectedHalf1, selectedHalf2, selectedSingleFlavor, selectedSize, sizes.length, portion1Label, portion2Label, product]);

  const handleSelectFlavor = (flavor: string) => {
    if (mode === 'single') {
      setSelectedSingleFlavor(flavor);
      return;
    }

    if (activeHalfTab === 1) {
      setSelectedHalf1(flavor);
      // Automatically switch to half 2 so the user smoothly chooses the second flavor
      setActiveHalfTab(2);
    } else {
      setSelectedHalf2(flavor);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 bg-[#0d121f] border border-[#232B3A] rounded-2xl p-3 sm:p-5 text-left w-full min-w-0 overflow-hidden">
      {/* Header Badge */}
      <div className="flex items-center justify-between gap-2 border-b border-[#232B3A] pb-2.5 sm:pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-sm sm:text-base shrink-0">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5 truncate">
              Personaliza los Sabores <Sparkles className="w-3 h-3 text-amber-400 shrink-0 hidden sm:inline" />
            </h4>
            <p className="text-[10px] text-gray-400 truncate sm:whitespace-normal">
              {allowsHalfAndHalf
                ? 'Combina 2 sabores o elige 1 solo sabor'
                : 'Selecciona tu sabor favorito'}
            </p>
          </div>
        </div>

        <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap shrink-0">
          {flavors.length} sabores
        </span>
      </div>

      {/* 1. Size / Presentation Selector if available */}
      {sizes.length > 0 && (
        <div className="space-y-1.5 w-full min-w-0">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#A9B2C3] block truncate">
            1. Elige el tamaño o presentación:
          </label>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {sizes.map((sz) => {
              const isSelected = selectedSize === sz;
              const szPrice = getVariantPrice(product, sz);
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => {
                    setSelectedSize(sz);
                    const sizePrefix = sz ? `${sz} | ` : '';
                    let variantString = '';
                    if (mode === 'half_half') {
                      variantString = `${sizePrefix}${portion1Label}: ${selectedHalf1 || '...'} / ${portion2Label}: ${selectedHalf2 || '...'}`;
                    } else {
                      variantString = `${sizePrefix}Sabor: ${selectedSingleFlavor || '...'}`;
                    }
                    onVariantChangeRef.current(variantString, true, szPrice);
                  }}
                  className={`py-1.5 sm:py-2 px-2.5 sm:px-3.5 rounded-xl text-[11px] sm:text-xs font-black transition cursor-pointer border flex items-center gap-1.5 min-w-0 ${
                    isSelected
                      ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                      : 'bg-[#151D2F] text-gray-300 border-[#232B3A] hover:bg-[#1E293B]'
                  }`}
                >
                  <span className="truncate">{sz}</span>
                  {szPrice > 0 && (
                    <span className={`text-[10px] sm:text-[11px] whitespace-nowrap shrink-0 ${isSelected ? 'text-black font-extrabold' : 'text-amber-400 font-bold'}`}>
                      • {currency}{szPrice.toLocaleString('es-CO')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Mode Selector: Mitad y Mitad / Combinar vs 1 Solo Sabor */}
      {allowsHalfAndHalf && allowSingle && (
        <div className="space-y-1.5 w-full min-w-0">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#A9B2C3] block truncate">
            {sizes.length > 0 ? '2. ' : '1. '}¿Cómo deseas prepararlo?
          </label>
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2 bg-[#090B12] p-1 sm:p-1.5 rounded-xl border border-[#232B3A] w-full min-w-0">
            <button
              type="button"
              onClick={() => setMode('half_half')}
              className={`py-2 sm:py-2.5 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-black transition cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-center leading-tight min-w-0 ${
                mode === 'half_half'
                  ? 'bg-gradient-to-r from-amber-500 to-red-500 text-white shadow-lg shadow-amber-500/20'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs sm:text-sm shrink-0">🌓</span>
                <span className="truncate font-bold">{isPizza ? 'Mitad y Mitad' : 'Combinar'}</span>
              </div>
              <span className="text-[9px] sm:text-[10px] font-medium opacity-85 shrink-0 whitespace-nowrap">(2 Sabores)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`py-2 sm:py-2.5 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-black transition cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-center leading-tight min-w-0 ${
                mode === 'single'
                  ? 'bg-gradient-to-r from-amber-500 to-red-500 text-white shadow-lg shadow-amber-500/20'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs sm:text-sm shrink-0">{productEmoji}</span>
                <span className="truncate font-bold">1 Solo Sabor</span>
              </div>
              <span className="text-[9px] sm:text-[10px] font-medium opacity-85 shrink-0 whitespace-nowrap">(Completo)</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Dual Flavor Interactive Selector */}
      {mode === 'half_half' && (
        <div className="space-y-2.5 sm:space-y-3 w-full min-w-0">
          {/* Flavor Choice Visual Tabs */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 w-full min-w-0">
            {/* Sabor 1 Card */}
            <div
              onClick={() => setActiveHalfTab(1)}
              className={`p-2.5 sm:p-3 rounded-xl border transition cursor-pointer relative min-w-0 overflow-hidden ${
                activeHalfTab === 1
                  ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                  : 'bg-[#151D2F]/70 border-[#232B3A] text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1 gap-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1 min-w-0 truncate">
                  <span className="shrink-0">{productEmoji}</span> <span className="truncate">{portion1Label}</span>
                </span>
                {activeHalfTab === 1 && (
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-amber-400 shrink-0 animate-pulse"></span>
                )}
              </div>
              <div className="font-extrabold text-xs text-white truncate" title={selectedHalf1}>
                {selectedHalf1 || 'Elegir sabor...'}
              </div>
              <span className="text-[9px] text-gray-400 block mt-0.5 truncate">
                {activeHalfTab === 1 ? '👉 Eligiendo' : 'Toca para cambiar'}
              </span>
            </div>

            {/* Sabor 2 Card */}
            <div
              onClick={() => setActiveHalfTab(2)}
              className={`p-2.5 sm:p-3 rounded-xl border transition cursor-pointer relative min-w-0 overflow-hidden ${
                activeHalfTab === 2
                  ? 'bg-red-500/15 border-red-500 text-white shadow-lg shadow-red-500/10'
                  : 'bg-[#151D2F]/70 border-[#232B3A] text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1 gap-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1 min-w-0 truncate">
                  <span className="shrink-0">{productEmoji}</span> <span className="truncate">{portion2Label}</span>
                </span>
                {activeHalfTab === 2 && (
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-400 shrink-0 animate-pulse"></span>
                )}
              </div>
              <div className="font-extrabold text-xs text-white truncate" title={selectedHalf2}>
                {selectedHalf2 || 'Elegir sabor...'}
              </div>
              <span className="text-[9px] text-gray-400 block mt-0.5 truncate">
                {activeHalfTab === 2 ? '👉 Eligiendo' : 'Toca para cambiar'}
              </span>
            </div>
          </div>

          {/* Quick Helper Switch */}
          <div className="flex items-center justify-between bg-[#111827] px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#232B3A] gap-2 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-bold text-gray-300 truncate">
              Eligiendo: <span className="text-amber-400 uppercase font-extrabold">{activeHalfTab === 1 ? portion1Label : portion2Label}</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveHalfTab(activeHalfTab === 1 ? 2 : 1)}
              className="text-[10px] font-extrabold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition shrink-0 whitespace-nowrap"
            >
              Pasar a {activeHalfTab === 1 ? portion2Label : portion1Label} <ArrowRight className="w-3 h-3 shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* 4. Flavor List & Fast Search Filter */}
      <div className="space-y-2 w-full min-w-0">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#A9B2C3] block truncate">
            {mode === 'half_half'
              ? `Sabores para ${activeHalfTab === 1 ? portion1Label : portion2Label}:`
              : 'Elige tu sabor favorito:'}
          </label>
        </div>

        {/* Search input if multiple flavors */}
        {flavors.length > 5 && (
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar sabor..."
              className="w-full h-8 pl-8 pr-14 bg-[#090B12] border border-[#232B3A] focus:border-amber-400 rounded-lg text-xs font-semibold text-white placeholder-gray-500 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-white"
              >
                Limpiar
              </button>
            )}
          </div>
        )}

        {/* Flavors Grid / Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 max-h-48 sm:max-h-56 md:max-h-64 overflow-y-auto pr-1 custom-scrollbar w-full min-w-0">
          {filteredFlavors.length === 0 ? (
            <div className="col-span-full py-4 text-center text-xs text-gray-500">
              No se encontró ningún sabor con "{searchQuery}"
            </div>
          ) : (
            filteredFlavors.map((flv) => {
              const isSelected =
                mode === 'single'
                  ? selectedSingleFlavor === flv
                  : activeHalfTab === 1
                  ? selectedHalf1 === flv
                  : selectedHalf2 === flv;

              const isSelectedOnOtherHalf =
                mode === 'half_half' &&
                (activeHalfTab === 1 ? selectedHalf2 === flv : selectedHalf1 === flv);

              return (
                <button
                  key={flv}
                  type="button"
                  onClick={() => handleSelectFlavor(flv)}
                  className={`p-2 sm:p-2.5 rounded-xl text-left text-xs font-bold transition cursor-pointer border flex items-center justify-between gap-1.5 min-w-0 ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm'
                      : 'bg-[#151D2F] border-[#232B3A] text-gray-300 hover:bg-[#1E293B] hover:text-white'
                  }`}
                >
                  <span className="truncate flex-1 min-w-0">{flv}</span>
                  {isSelected ? (
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : isSelectedOnOtherHalf ? (
                    <span className="text-[8px] font-bold text-gray-500 px-1 bg-gray-900 rounded shrink-0 whitespace-nowrap">
                      {activeHalfTab === 1 ? portion2Label : portion1Label}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 5. Summary Pill & Validation message */}
      <div className="pt-2 border-t border-[#232B3A] w-full min-w-0">
        {mode === 'half_half' ? (
          selectedHalf1 && selectedHalf2 ? (
            <div className="bg-emerald-950/30 border border-emerald-500/30 p-2 sm:p-2.5 rounded-xl flex items-center gap-2 text-emerald-400 text-xs font-bold min-w-0">
              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">
                Combinación: <span className="text-white">{portion1Label}: {selectedHalf1}</span> + <span className="text-white">{portion2Label}: {selectedHalf2}</span>
                {selectedSize ? ` (${selectedSize})` : ''}
              </span>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 p-2 sm:p-2.5 rounded-xl flex items-center gap-2 text-amber-300 text-xs font-bold min-w-0">
              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-amber-400" />
              <span className="truncate">
                {!selectedHalf1
                  ? `Por favor elige ${portion1Label}`
                  : `Por favor elige ${portion2Label}`}
              </span>
            </div>
          )
        ) : (
          selectedSingleFlavor && (
            <div className="bg-emerald-950/30 border border-emerald-500/30 p-2 sm:p-2.5 rounded-xl flex items-center gap-2 text-emerald-400 text-xs font-bold min-w-0">
              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">
                Sabor: <span className="text-white">{selectedSingleFlavor}</span>
                {selectedSize ? ` (${selectedSize})` : ''}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
};
