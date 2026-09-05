/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProductItem } from '../types';
import { safeGetItem, safeSetItem } from './safeStorage';

export interface GeneralCartItem {
  id: string; // Composite ID: `${productId}_${variant || 'none'}`
  product: ProductItem;
  selectedVariant?: string;
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
  if (!productId || !imageUrl) return;
  cartImageMemoryCache.set(productId, imageUrl);
  try {
    const current = getStoredImageCache();
    if (current[productId] !== imageUrl) {
      current[productId] = imageUrl;
      const serialized = JSON.stringify(current);
      safeSetItem(CART_IMAGES_STORAGE_KEY, serialized);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(CART_IMAGES_STORAGE_KEY, serialized);
      }
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
  products.forEach(p => {
    if (p && p.id && p.imageURL) {
      persistImageToCache(p.id, p.imageURL);
    }
  });
}

export function rehydrateCartItem(item: GeneralCartItem): GeneralCartItem {
  if (!item || !item.product) return item;
  let img = item.product.imageURL;
  if (!img) {
    img = getProductImage(item.product.id);
  }
  if (img && !item.product.imageURL) {
    return {
      ...item,
      product: {
        ...item.product,
        imageURL: img
      }
    };
  }
  return item;
}

// Compaction to prevent quota exceeded errors while safely retaining valid product images
function compactCartItem(item: GeneralCartItem): GeneralCartItem {
  if (!item || !item.product) return item;
  const p = item.product;

  let safeProdId = p.id ? String(p.id).trim() : '';
  if (!safeProdId || safeProdId === 'undefined' || safeProdId === 'null') {
    safeProdId = p.name ? `prod_${String(p.userId || 'store').trim()}_${encodeURIComponent(p.name.trim().toLowerCase().replace(/\s+/g, '_'))}` : `prod_${Date.now()}`;
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
    id: item.id || getCartItemId(safeProdId, item.selectedVariant),
    selectedVariant: item.selectedVariant?.trim() || undefined,
    quantity: cleanQuantity,
    product: {
      id: safeProdId,
      userId: String(p.userId || ''),
      name: String(p.name || 'Producto'),
      price: cleanPrice,
      compareAtPrice: cleanCompareAt,
      imageURL: cleanImage,
      category: p.category,
      variantsText: p.variantsText,
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

export function getCartItemId(productId: string | number | undefined, variant?: string): string {
  let cleanId = productId ? String(productId).trim() : '';
  if (!cleanId || cleanId === 'undefined' || cleanId === 'null') {
    cleanId = 'item';
  }
  const cleanVar = variant?.trim();
  return `${cleanId}_${cleanVar && cleanVar !== 'none' ? cleanVar : 'none'}`;
}

// Add item to cart with image preservation
export function addProductToCart(product: ProductItem, quantity: number = 1, variant?: string): GeneralCartItem[] {
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
  const cartItemId = getCartItemId(validId, actualVariant);
  
  // 4. Match existing item ONLY when IDs strictly match AND variants match
  const existingIndex = currentCart.findIndex(item => {
    const itemProdId = item?.product?.id ? String(item.product.id).trim() : '';
    if (!itemProdId || !validId || itemProdId === 'undefined' || validId === 'undefined') {
      return false;
    }

    const itemVar = (item.selectedVariant || '').trim() || 'none';
    const newVar = (actualVariant || '').trim() || 'none';

    // 4.1 Exact cart item ID match
    if (item.id && cartItemId && item.id === cartItemId) {
      return true;
    }

    // 4.2 Exact product ID match AND variant match
    return itemProdId === validId && itemVar === newVar;
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
          quantity: item.quantity + actualQty,
          product: {
            ...item.product,
            ...product,
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
          id: validId
        },
        selectedVariant: actualVariant,
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
    const p = typeof item.product.price === 'number' && !isNaN(item.product.price) ? item.product.price : parseFloat(item.product.price as any) || 0;
    const q = Number(item.quantity) || 1;
    return sum + (p * q);
  }, 0);
  
  // Group by store identifier
  const storesSet = new Set<string>();
  cart.forEach(item => {
    const storeKey = item.product.userId || item.product.storeUsername || item.product.storeName || 'store_default';
    storesSet.add(storeKey);
  });

  const storeCount = cart.length > 0 ? Math.max(1, storesSet.size) : 0;
  const totalDeliveryFee = storeCount * deliveryFeePerStore;
  const grandTotal = subtotal + totalDeliveryFee;

  return {
    totalItems,
    subtotal,
    storeCount,
    deliveryFee: totalDeliveryFee,
    grandTotal
  };
}
