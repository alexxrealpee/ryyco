import React, { useState, useEffect, useMemo } from 'react';
import { ProductItem } from '../types';
import { Pizza, Search, Check, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';

interface PizzaFlavorSelectorProps {
  product: ProductItem;
  onVariantChange: (variantString: string, isValid: boolean) => void;
  currency?: string;
  initialSizeVariant?: string;
}

export const PizzaFlavorSelector: React.FC<PizzaFlavorSelectorProps> = ({
  product,
  onVariantChange,
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
      .map(s => s.trim())
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
  const [selectedSize, setSelectedSize] = useState<string>(initialSizeVariant || sizes[0] || '');

  // Search filter for pizza flavors
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
      variantString = `${sizePrefix}Mitad ${selectedHalf1 || '...'} / Mitad ${selectedHalf2 || '...'}`;
    } else {
      if (!selectedSingleFlavor) {
        isValid = false;
      }
      variantString = `${sizePrefix}Sabor: ${selectedSingleFlavor || '...'}`;
    }

    if (sizes.length > 0 && !selectedSize) {
      isValid = false;
    }

    onVariantChange(variantString, isValid);
  }, [mode, selectedHalf1, selectedHalf2, selectedSingleFlavor, selectedSize, sizes.length, onVariantChange]);

  const handleSelectFlavor = (flavor: string) => {
    if (mode === 'single') {
      setSelectedSingleFlavor(flavor);
      return;
    }

    if (activeHalfTab === 1) {
      setSelectedHalf1(flavor);
      // If half 2 is not yet chosen or same as old default, give prompt/switch to half 2
      if (!selectedHalf2) {
        setActiveHalfTab(2);
      }
    } else {
      setSelectedHalf2(flavor);
    }
  };

  return (
    <div className="space-y-4 bg-[#0d121f] border border-[#232B3A] rounded-2xl p-4 sm:p-5 text-left">
      {/* Header Badge */}
      <div className="flex items-center justify-between gap-2 border-b border-[#232B3A] pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Pizza className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
              Personaliza tu Pizza <Sparkles className="w-3 h-3 text-amber-400" />
            </h4>
            <p className="text-[10px] text-gray-400">
              {allowsHalfAndHalf
                ? 'Puedes pedirla mitad y mitad (2 sabores) o completa de 1 solo sabor'
                : 'Selecciona tu sabor favorito'}
            </p>
          </div>
        </div>

        <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full whitespace-nowrap">
          {flavors.length} sabores
        </span>
      </div>

      {/* 1. Size / Presentation Selector if available */}
      {sizes.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#A9B2C3] block">
            1. Elige el tamaño:
          </label>
          <div className="flex flex-wrap gap-2">
            {sizes.map((sz) => {
              const isSelected = selectedSize === sz;
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setSelectedSize(sz)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                    isSelected
                      ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                      : 'bg-[#151D2F] text-gray-300 border-[#232B3A] hover:bg-[#1E293B]'
                  }`}
                >
                  {sz}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Mode Selector: Mitad y Mitad vs 1 Solo Sabor */}
      {allowsHalfAndHalf && allowSingle && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#A9B2C3] block">
            {sizes.length > 0 ? '2. ' : '1. '}¿Cómo deseas prepararla?
          </label>
          <div className="grid grid-cols-2 gap-2 bg-[#090B12] p-1.5 rounded-xl border border-[#232B3A]">
            <button
              type="button"
              onClick={() => setMode('half_half')}
              className={`py-2.5 px-3 rounded-lg text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'half_half'
                  ? 'bg-gradient-to-r from-amber-500 to-red-500 text-white shadow-lg shadow-amber-500/20'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>🌓</span> Mitad y Mitad (2 Sabores)
            </button>
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`py-2.5 px-3 rounded-lg text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'single'
                  ? 'bg-gradient-to-r from-amber-500 to-red-500 text-white shadow-lg shadow-amber-500/20'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>🍕</span> Completa (1 Sabor)
            </button>
          </div>
        </div>
      )}

      {/* 3. Mitad y Mitad Interactive Dual Selector */}
      {mode === 'half_half' && (
        <div className="space-y-3">
          {/* Half Choice Visual Tabs */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Mitad 1 Card */}
            <div
              onClick={() => setActiveHalfTab(1)}
              className={`p-3 rounded-xl border transition cursor-pointer relative ${
                activeHalfTab === 1
                  ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                  : 'bg-[#151D2F]/70 border-[#232B3A] text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <span>🍕</span> Mitad 1
                </span>
                {activeHalfTab === 1 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                )}
              </div>
              <div className="font-extrabold text-xs text-white truncate">
                {selectedHalf1 || 'Selecciona sabor...'}
              </div>
              <span className="text-[9px] text-gray-400 block mt-0.5">
                {activeHalfTab === 1 ? '👉 Eligiendo ahora' : 'Toca para cambiar'}
              </span>
            </div>

            {/* Mitad 2 Card */}
            <div
              onClick={() => setActiveHalfTab(2)}
              className={`p-3 rounded-xl border transition cursor-pointer relative ${
                activeHalfTab === 2
                  ? 'bg-red-500/15 border-red-500 text-white shadow-lg shadow-red-500/10'
                  : 'bg-[#151D2F]/70 border-[#232B3A] text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1">
                  <span>🍕</span> Mitad 2
                </span>
                {activeHalfTab === 2 && (
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                )}
              </div>
              <div className="font-extrabold text-xs text-white truncate">
                {selectedHalf2 || 'Selecciona sabor...'}
              </div>
              <span className="text-[9px] text-gray-400 block mt-0.5">
                {activeHalfTab === 2 ? '👉 Eligiendo ahora' : 'Toca para cambiar'}
              </span>
            </div>
          </div>

          {/* Quick Helper Switch */}
          <div className="flex items-center justify-between bg-[#111827] px-3 py-1.5 rounded-lg border border-[#232B3A]">
            <span className="text-[11px] font-bold text-gray-300">
              Eligiendo sabor para: <span className="text-amber-400 uppercase font-extrabold">Mitad {activeHalfTab}</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveHalfTab(activeHalfTab === 1 ? 2 : 1)}
              className="text-[10px] font-extrabold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
            >
              Pasar a Mitad {activeHalfTab === 1 ? 2 : 1} <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 4. Flavor List & Fast Search Filter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#A9B2C3] block">
            {mode === 'half_half'
              ? `Sabores para la Mitad ${activeHalfTab}:`
              : 'Elige el sabor de tu pizza:'}
          </label>
        </div>

        {/* Search input if multiple flavors */}
        {flavors.length > 5 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar sabor (ej: Hawaiana, Pepperoni, Pollo...)"
              className="w-full h-8 pl-8 pr-3 bg-[#090B12] border border-[#232B3A] focus:border-amber-400 rounded-lg text-xs font-semibold text-white placeholder-gray-500 outline-none"
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
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
                  className={`p-2.5 rounded-xl text-left text-xs font-bold transition cursor-pointer border flex items-center justify-between gap-1.5 ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm'
                      : 'bg-[#151D2F] border-[#232B3A] text-gray-300 hover:bg-[#1E293B] hover:text-white'
                  }`}
                >
                  <span className="truncate">{flv}</span>
                  {isSelected ? (
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : isSelectedOnOtherHalf ? (
                    <span className="text-[8px] font-bold text-gray-500 px-1 bg-gray-900 rounded shrink-0">
                      Mitad {activeHalfTab === 1 ? '2' : '1'}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 5. Summary Pill & Validation message */}
      <div className="pt-2 border-t border-[#232B3A]">
        {mode === 'half_half' ? (
          selectedHalf1 && selectedHalf2 ? (
            <div className="bg-emerald-950/30 border border-emerald-500/30 p-2.5 rounded-xl flex items-center gap-2 text-emerald-400 text-xs font-bold">
              <Check className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Combinación: <span className="text-white">Mitad {selectedHalf1}</span> + <span className="text-white">Mitad {selectedHalf2}</span>
                {selectedSize ? ` (${selectedSize})` : ''}
              </span>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl flex items-center gap-2 text-amber-300 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                {!selectedHalf1
                  ? 'Por favor elige el sabor para la Mitad 1'
                  : 'Por favor elige el sabor para la Mitad 2'}
              </span>
            </div>
          )
        ) : (
          selectedSingleFlavor && (
            <div className="bg-emerald-950/30 border border-emerald-500/30 p-2.5 rounded-xl flex items-center gap-2 text-emerald-400 text-xs font-bold">
              <Check className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Sabor completo: <span className="text-white">{selectedSingleFlavor}</span>
                {selectedSize ? ` (${selectedSize})` : ''}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
};
