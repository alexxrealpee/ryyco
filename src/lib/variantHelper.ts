/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProductItem } from '../types';

export interface ParsedVariant {
  name: string;
  price: number;
}

/**
 * Extracts clean variant name and optional embedded price.
 * Handles patterns:
 *  - "Pequeña: 25000" or "Pequeña: $25.000"
 *  - "Pequeña ($25.000)" or "Pequeña ($25000)"
 *  - "Pequeña - $25.000"
 *  - "Pequeña"
 */
export function parseSingleVariant(raw: string, defaultPrice: number = 0): ParsedVariant {
  const trimmed = raw.trim();
  if (!trimmed) return { name: '', price: defaultPrice };

  // Match e.g. "Pequeña ($25.000)" or "Pequeña ($25000)"
  const parenMatch = trimmed.match(/^(.+?)\s*\(\s*\$?([\d.,]+)\s*\)$/);
  if (parenMatch) {
    const name = parenMatch[1].trim();
    const pStr = parenMatch[2].replace(/\./g, '').replace(/,/g, '');
    const num = parseFloat(pStr);
    return { name, price: !isNaN(num) && num > 0 ? num : defaultPrice };
  }

  // Match e.g. "Pequeña: 25000" or "Pequeña: $25.000" or "Pequeña - $25.000"
  const colonMatch = trimmed.match(/^([^:-]+)[:\-]\s*\$?([\d.,]+)$/);
  if (colonMatch) {
    const name = colonMatch[1].trim();
    const pStr = colonMatch[2].replace(/\./g, '').replace(/,/g, '');
    const num = parseFloat(pStr);
    return { name, price: !isNaN(num) && num > 0 ? num : defaultPrice };
  }

  return { name: trimmed, price: defaultPrice };
}

/**
 * Returns all parsed variants for a product with their individual prices
 */
export function getProductParsedVariants(
  variantsText?: string,
  variantPrices?: Record<string, number>,
  basePrice: number = 0
): ParsedVariant[] {
  if (!variantsText || !variantsText.trim()) return [];

  const rawList = variantsText.split(',').map(s => s.trim()).filter(Boolean);
  return rawList.map(raw => {
    const parsed = parseSingleVariant(raw, basePrice);
    // Check if variantPrices has an explicit price for this variant
    if (variantPrices) {
      if (typeof variantPrices[parsed.name] === 'number') {
        parsed.price = variantPrices[parsed.name];
      } else if (typeof variantPrices[raw] === 'number') {
        parsed.price = variantPrices[raw];
      }
    }
    return parsed;
  });
}

/**
 * Gets the price for a specific variant or size
 */
export function getVariantPrice(product: ProductItem, selectedVariant?: string): number {
  const basePrice = Number(product.price) || 0;
  if (!selectedVariant || !selectedVariant.trim()) {
    return basePrice;
  }

  // If selectedVariant is a compound string like "Pequeña | Mitad 1: ...", extract the size part
  const firstPart = selectedVariant.split('|')[0].trim();
  const parsedFirst = parseSingleVariant(firstPart, basePrice);
  const cleanName = firstPart.split(':')[0].trim();
  const targetNames = [
    cleanName.toLowerCase(),
    parsedFirst.name.toLowerCase(),
    firstPart.toLowerCase(),
    selectedVariant.trim().toLowerCase()
  ];

  // 1. Check explicit variantPrices (case-insensitive & handles numeric strings)
  if (product.variantPrices && typeof product.variantPrices === 'object') {
    for (const [k, v] of Object.entries(product.variantPrices)) {
      const kLower = k.trim().toLowerCase();
      if (targetNames.includes(kLower)) {
        const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
        if (!isNaN(num) && num > 0) {
          return num;
        }
      }
    }
  }

  // 2. Check embedded in variantsText
  const allParsed = getProductParsedVariants(product.variantsText, product.variantPrices, basePrice);
  const found = allParsed.find(v => 
    targetNames.includes(v.name.toLowerCase())
  );
  if (found && typeof found.price === 'number' && found.price > 0) {
    return found.price;
  }

  if (parsedFirst.price > 0 && parsedFirst.price !== basePrice) {
    return parsedFirst.price;
  }

  return basePrice;
}

/**
 * Calculates price range for display in catalog/cards
 * e.g., "Desde $25.000" or "$25.000"
 */
export function getProductPriceRange(product: ProductItem, currency: string = '$'): {
  minPrice: number;
  maxPrice: number;
  hasMultiplePrices: boolean;
  displayPrice: string;
} {
  const base = Number(product.price) || 0;
  const variants = getProductParsedVariants(product.variantsText, product.variantPrices, base);

  if (variants.length === 0) {
    return {
      minPrice: base,
      maxPrice: base,
      hasMultiplePrices: false,
      displayPrice: `${currency}${base.toLocaleString('es-CO')}`
    };
  }

  const prices = variants.map(v => v.price).filter(p => p > 0);
  if (prices.length === 0) {
    return {
      minPrice: base,
      maxPrice: base,
      hasMultiplePrices: false,
      displayPrice: `${currency}${base.toLocaleString('es-CO')}`
    };
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (min === max && min === base) {
    return {
      minPrice: base,
      maxPrice: base,
      hasMultiplePrices: false,
      displayPrice: `${currency}${base.toLocaleString('es-CO')}`
    };
  }

  if (min < max) {
    return {
      minPrice: min,
      maxPrice: max,
      hasMultiplePrices: true,
      displayPrice: `Desde ${currency}${min.toLocaleString('es-CO')}`
    };
  }

  return {
    minPrice: min,
    maxPrice: max,
    hasMultiplePrices: false,
    displayPrice: `${currency}${min.toLocaleString('es-CO')}`
  };
}
