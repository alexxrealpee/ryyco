/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProductItem, ProductAddon } from '../types';
import { safeGetItem, safeSetItem } from './safeStorage';
import { getVariantPrice, extractProductVariants } from './variantHelper';
export { extractProductVariants };

export interface GeneralCartItem {
  id: string; // Composite ID: `${productId}_${variant || 'none'}_addons`
  product: ProductItem;
  selectedVariant?: string;
  selectedAddons?: ProductAddon[];
  quantity: number;
}

const CART_STORAGE_KEY = 'linnkpro_general_cart';
export const CART_UPDATED_EVENT = 'linnkpro_cart_updated';
const CART_IMAGES_STORAGE_KEY = 'linnkpro_cart_images_cache';

// In-memory cache for product images to guarantee instant availability across components
const cartImageMemoryCache = new Map<string, string>();

function getStoredImageCache(): Record<string, string> {
  try {
    const raw = safeGetItem(CART_IMAGES_STORAGE_KEY) || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CART_IMAGES_STORAGE_KEY) : null);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function persistImageToCache(productId: string, imageUrl: string): void {
  registerImageEntries([[productId, imageUrl]]);
}

function registerImageEntries(entries: [string, string][]): void {
  const changed = entries.filter(([id, url]) => id && url && cartImageMemoryCache.get(id) !== url);
  if (!changed.length) return;
  changed.forEach(([id, url]) => cartImageMemoryCache.set(id, url));
  try {
    const current = getStoredImageCache();
    let needsWrite = false;
    changed.forEach(([id, url]) => {
      if (current[id] !== url) { current[id] = url; needsWrite = true; }
    });
    if (needsWrite) {
      // safeSetItem already mirrors to sessionStorage. Persist once per batch.
      safeSetItem(CART_IMAGES_STORAGE_KEY, JSON.stringify(current));
    }
  } catch {}
}

export function getProductImage(productId: string): string | undefined {
  if (!productId) return undefined;
  if (cartImageMemoryCache.has(productId)) {
    return cartImageMemoryCache.get(productId);
  }
  const cached = getStoredImageCache();
  if (cached[productId]) {
    cartImageMemoryCache.set(productId, cached[productId]);
    return cached[productId];
  }
  return undefined;
}

export function registerProductImages(products: ProductItem[]): void {
  if (!Array.isArray(products)) return;
  registerImageEntries(products.filter(p => p?.id && p.imageURL).map(p => [p.id, p.imageURL]));
}

export function rehydrateCartItem(item: GeneralCartItem): GeneralCartItem {
  if (!item) {
    return {
      id: `item_${Date.now()}`,
      quantity: 1,
      product: {
        id: `prod_${Date.now()}`,
        name: 'Producto',
        price: 0,
        userId: '',
        active: true,
        stock: 99
      } as ProductItem
    };
  }

  // Handle flat or legacy cart item structure where item lacks product object
  const p: any = item.product || {
    id: (item as any).productId || item.id || `prod_${Date.now()}`,
    userId: (item as any).userId || (item as any).storeOwnerId || '',
    name: (item as any).name || (item as any).productName || 'Producto',
    description: (item as any).description || '',
    price: typeof (item as any).price === 'number' ? (item as any).price : parseFloat((item as any).price) || 0,
    imageURL: (item as any).imageURL,
    category: (item as any).category,
    storeName: (item as any).storeName,
    storeUsername: (item as any).storeUsername,
    active: true,
    stock: 99
  };

  const safeProdId = p.id ? String(p.id).trim() : (p.name ? `prod_${String(p.userId || 'store').trim()}_${encodeURIComponent(p.name.trim().toLowerCase().replace(/\s+/g, '_'))}` : `prod_${Date.now()}`);
  let img = p.imageURL;
  if (!img) {
    img = getProductImage(safeProdId);
  }

  const safeProduct: ProductItem = {
    id: safeProdId,
    userId: String(p.userId || ''),
    name: String(p.name || (item as any).name || 'Producto'),
    description: String(p.description || ''),
    price: typeof p.price === 'number' && !isNaN(p.price) ? p.price : (parseFloat(p.price as any) || 0),
    compareAtPrice: p.compareAtPrice,
    packagingCost: typeof p.packagingCost === 'number' && !isNaN(p.packagingCost) ? p.packagingCost : (p.packagingCost !== undefined && p.packagingCost !== null ? parseFloat(p.packagingCost as any) : undefined),
    imageURL: img,
    category: p.category,
    variantsText: p.variantsText,
    variantPrices: p.variantPrices,
    allowsHalfAndHalf: p.allowsHalfAndHalf,
    flavorsText: p.flavorsText,
    allowSingleFlavor: p.allowSingleFlavor,
    active: p.active !== false,
    stock: typeof p.stock === 'number' && !isNaN(p.stock) ? p.stock : 99,
    storeName: p.storeName,
    storeUsername: p.storeUsername,
    addons: Array.isArray(p.addons) ? p.addons : undefined
  };

  return {
    id: item.id || getCartItemId(safeProdId, item.selectedVariant, item.selectedAddons),
    selectedVariant: item.selectedVariant?.trim() || undefined,
    selectedAddons: Array.isArray(item.selectedAddons) ? item.selectedAddons : undefined,
    quantity: Math.max(1, Number(item.quantity) || 1),
    product: safeProduct
  };
}

// Compaction to prevent quota exceeded errors while safely retaining valid product images
function compactCartItem(item: GeneralCartItem): GeneralCartItem {
  if (!item) return item;
  const p = item.product || (item as any);

  let safeProdId = p.id ? String(p.id).trim() : '';
  if (!safeProdId || safeProdId === 'undefined' || safeProdId === 'null') {
    safeProdId = p.name ? `prod_${String(p.userId || 'store').trim()}_${encodeURIComponent(String(p.name).trim().toLowerCase().replace(/\s+/g, '_'))}` : `prod_${Date.now()}`;
  }
  
  // Make sure image is cached in memory and session storage before any processing
  if (safeProdId && p.imageURL) {
    persistImageToCache(safeProdId, p.imageURL);
  }

  // Preserve image: keep valid URLs and reasonable base64 data URLs (< 500KB)
  let cleanImage = p.imageURL;
  if (!cleanImage) {
    cleanImage = getProductImage(safeProdId);
  }
  // Only omit raw payloads if they are extraordinarily huge uncompressed strings
  if (cleanImage && cleanImage.startsWith('data:') && cleanImage.length > 500000) {
    cleanImage = undefined;
  }

  const cleanPrice = typeof p.price === 'number' && !isNaN(p.price) ? p.price : parseFloat(p.price as any) || 0;
  const cleanCompareAt = p.compareAtPrice !== undefined ? (typeof p.compareAtPrice === 'number' ? p.compareAtPrice : parseFloat(p.compareAtPrice as any) || undefined) : undefined;
  const cleanQuantity = Math.max(1, Number(item.quantity) || 1);

  return {
    id: item.id || getCartItemId(safeProdId, item.selectedVariant, item.selectedAddons),
    selectedVariant: item.selectedVariant?.trim() || undefined,
    selectedAddons: Array.isArray(item.selectedAddons) ? item.selectedAddons : undefined,
    quantity: cleanQuantity,
    product: {
      id: safeProdId,
      userId: String(p.userId || ''),
      name: String(p.name || (item as any).name || 'Producto'),
      price: cleanPrice,
      compareAtPrice: cleanCompareAt,
      packagingCost: typeof p.packagingCost === 'number' && !isNaN(p.packagingCost) ? p.packagingCost : (p.packagingCost !== undefined && p.packagingCost !== null ? parseFloat(p.packagingCost as any) : undefined),
      imageURL: cleanImage,
      category: p.category,
      variantsText: p.variantsText,
      variantPrices: p.variantPrices,
      allowsHalfAndHalf: p.allowsHalfAndHalf,
      flavorsText: p.flavorsText,
      allowSingleFlavor: p.allowSingleFlavor,
      addons: Array.isArray(p.addons) ? p.addons : undefined,
      active: p.active !== false,
      stock: typeof p.stock === 'number' && !isNaN(p.stock) ? p.stock : 99,
      storeName: p.storeName,
      storeUsername: p.storeUsername
    } as ProductItem
  };
}

// Get current cart safely with automatic image rehydration
export function getStoredCart(): GeneralCartItem[] {
  try {
    const stored = safeGetItem(CART_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(rehydrateCartItem);
  } catch (e) {
    return [];
  }
}

// Save cart safely and notify all listeners in the app
export function saveStoredCart(cart: GeneralCartItem[], source?: string): void {
  try {
    // Preserve images of all items in cache first
    (cart || []).forEach(item => {
      if (item?.product?.id && item.product.imageURL) {
        persistImageToCache(item.product.id, item.product.imageURL);
      }
    });

    const compacted = (cart || []).map(compactCartItem);
    safeSetItem(CART_STORAGE_KEY, JSON.stringify(compacted));

    // Rehydrate so live listeners in UI receive full product images instantly
    const rehydrated = compacted.map(rehydrateCartItem);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: { cart: rehydrated, source } }));
    }
  } catch (e) {
    // Gracefully handled by safeSetItem fallback
  }
}

export function getCartItemId(productId: string | number | undefined, variant?: string, addons?: ProductAddon[]): string {
  let cleanId = productId ? String(productId).trim() : '';
  if (!cleanId || cleanId === 'undefined' || cleanId === 'null') {
    cleanId = 'item';
  }
  const cleanVar = variant?.trim();
  const sortedAddonsKey = (addons && addons.length > 0)
    ? addons.map(a => `${a.id || a.name}:${a.price}`).sort().join(';')
    : '';
  const addonPart = sortedAddonsKey ? `_addons_${encodeURIComponent(sortedAddonsKey)}` : '';
  return `${cleanId}_${cleanVar && cleanVar !== 'none' ? cleanVar : 'none'}${addonPart}`;
}

export function getCartItemUnitPrice(item: GeneralCartItem): number {
  if (!item || !item.product) return 0;
  const basePrice = getVariantPrice(item.product, item.selectedVariant);
  const unitBase = basePrice > 0 ? basePrice : (Number(item.product.price) || 0);
  const addonsTotal = (item.selectedAddons || []).reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  return unitBase + addonsTotal;
}

// Add item to cart with image preservation and optional add-ons support
export function addProductToCart(
  product: ProductItem, 
  quantity: number = 1, 
  variant?: string,
  selectedAddons?: ProductAddon[]
): GeneralCartItem[] {
  if (!product) return getStoredCart();

  // 1. Ensure robust, unique, non-empty product ID
  let validId = product.id ? String(product.id).trim() : '';
  if (!validId || validId === 'undefined' || validId === 'null') {
    if (product.name && String(product.name).trim()) {
      validId = `prod_${String(product.userId || 'store').trim()}_${encodeURIComponent(product.name.trim().toLowerCase().replace(/\s+/g, '_'))}`;
    } else {
      validId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
  }
  product.id = validId;

  // 2. Cache product image
  const img = product.imageURL || getProductImage(validId);
  if (img) {
    product.imageURL = img;
    persistImageToCache(validId, img);
  }

  // 3. Retrieve current cart
  const currentCart = getStoredCart();
  const actualQty = Math.max(1, Number(quantity) || 1);
  const actualVariant = variant?.trim() || (product.variantsText ? product.variantsText.split(',')[0].trim() : undefined);
  const safeAddons = Array.isArray(selectedAddons) && selectedAddons.length > 0 ? selectedAddons : undefined;
  const cartItemId = getCartItemId(validId, actualVariant, safeAddons);
  const variantSpecificPrice = getVariantPrice(product, actualVariant);
  
  // 4. Match existing item ONLY when IDs strictly match AND variants match AND addons match
  const existingIndex = currentCart.findIndex(item => {
    const itemProdId = item?.product?.id ? String(item.product.id).trim() : '';
    if (!itemProdId || !validId || itemProdId === 'undefined' || validId === 'undefined') {
      return false;
    }

    // 4.1 Exact cart item ID match (which incorporates variant and addons)
    if (item.id && cartItemId && item.id === cartItemId) {
      return true;
    }

    const itemVar = (item.selectedVariant || '').trim() || 'none';
    const newVar = (actualVariant || '').trim() || 'none';

    const itemAddonKey = (item.selectedAddons || []).map(a => `${a.id || a.name}:${a.price}`).sort().join(';');
    const newAddonKey = (safeAddons || []).map(a => `${a.id || a.name}:${a.price}`).sort().join(';');

    return itemProdId === validId && itemVar === newVar && itemAddonKey === newAddonKey;
  });

  let newCart: GeneralCartItem[];
  if (existingIndex >= 0) {
    // Increment existing product quantity
    newCart = currentCart.map((item, idx) => {
      if (idx === existingIndex) {
        const bestImage = item.product.imageURL || product.imageURL || getProductImage(validId);
        return {
          ...item,
          id: cartItemId,
          selectedVariant: actualVariant || item.selectedVariant,
          selectedAddons: safeAddons || item.selectedAddons,
          quantity: item.quantity + actualQty,
          product: {
            ...item.product,
            ...product,
            price: variantSpecificPrice > 0 ? variantSpecificPrice : item.product.price,
            id: validId,
            storeName: product.storeName || item.product.storeName,
            storeUsername: product.storeUsername || item.product.storeUsername,
            userId: product.userId || item.product.userId,
            imageURL: bestImage
          }
        };
      }
      return item;
    });
  } else {
    // Append new product to the cart without touching previous items
    newCart = [
      ...currentCart,
      {
        id: cartItemId,
        product: {
          ...product,
          price: variantSpecificPrice > 0 ? variantSpecificPrice : product.price,
          id: validId
        },
        selectedVariant: actualVariant,
        selectedAddons: safeAddons,
        quantity: actualQty
      }
    ];
  }

  saveStoredCart(newCart);
  return newCart.map(rehydrateCartItem);
}


// Update item quantity
export function updateCartQuantity(cartItemId: string, quantity: number): GeneralCartItem[] {
  const currentCart = getStoredCart();
  let newCart: GeneralCartItem[];

  if (quantity <= 0) {
    const hasExact = currentCart.some(i => i.id === cartItemId);
    newCart = currentCart.filter(item => hasExact ? item.id !== cartItemId : (item.id !== cartItemId && item.product.id !== cartItemId));
  } else {
    const hasExact = currentCart.some(i => i.id === cartItemId);
    newCart = currentCart.map(item => {
      const isTarget = hasExact ? item.id === cartItemId : (item.id === cartItemId || item.product.id === cartItemId);
      if (isTarget) {
        return { ...item, quantity: Math.max(1, Number(quantity) || 1) };
      }
      return item;
    });
  }

  saveStoredCart(newCart);
  return newCart;
}

// Remove item from cart
export function removeProductFromCart(cartItemIdOrProductId: string): GeneralCartItem[] {
  const currentCart = getStoredCart();
  const hasExact = currentCart.some(i => i.id === cartItemIdOrProductId);
  const newCart = currentCart.filter(item => 
    hasExact 
      ? item.id !== cartItemIdOrProductId 
      : (item.id !== cartItemIdOrProductId && item.product.id !== cartItemIdOrProductId)
  );
  saveStoredCart(newCart);
  return newCart;
}

// Clear cart completely
export function clearAllCart(): GeneralCartItem[] {
  saveStoredCart([]);
  return [];
}

// Calculate cart totals
export function calculateCartSummary(cart: GeneralCartItem[], deliveryFeePerStore: number = 7000) {
  const totalItems = cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const subtotal = cart.reduce((sum, item) => {
    const p = getCartItemUnitPrice(item);
    const q = Number(item.quantity) || 1;
    return sum + (p * q);
  }, 0);
  const packagingFee = cart.reduce((sum, item) => {
    const p = item.product || (item as any);
    const cost = typeof p.packagingCost === 'number' ? p.packagingCost : (parseFloat(p.packagingCost) || 0);
    const q = Number(item.quantity) || 1;
    return sum + (cost * q);
  }, 0);
  
  // Group by store identifier
  const storesSet = new Set<string>();
  cart.forEach(item => {
    const storeKey = item.product.userId || item.product.storeUsername || item.product.storeName || 'store_default';
    storesSet.add(storeKey);
  });

  const storeCount = cart.length > 0 ? Math.max(1, storesSet.size) : 0;
  const totalDeliveryFee = storeCount * deliveryFeePerStore;
  const grandTotal = subtotal + packagingFee + totalDeliveryFee;

  return {
    totalItems,
    subtotal,
    packagingFee,
    storeCount,
    deliveryFee: totalDeliveryFee,
    grandTotal
  };
}
