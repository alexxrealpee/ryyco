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

// Compaction to prevent quota exceeded errors from heavy base64 strings or unnecessary fields
function compactCartItem(item: GeneralCartItem): GeneralCartItem {
  if (!item || !item.product) return item;
  const p = item.product;
  
  // If imageURL is a multi-megabyte base64 string, don't store raw large base64 payload into localStorage
  let cleanImage = p.imageURL;
  if (cleanImage && cleanImage.startsWith('data:') && cleanImage.length > 20000) {
    cleanImage = undefined;
  }

  return {
    id: item.id,
    selectedVariant: item.selectedVariant,
    quantity: item.quantity,
    product: {
      id: p.id,
      userId: p.userId,
      name: p.name,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      imageURL: cleanImage,
      category: p.category,
      variantsText: p.variantsText,
      active: p.active,
      stock: p.stock,
      storeName: p.storeName,
      storeUsername: p.storeUsername
    } as ProductItem
  };
}

// Get current cart safely
export function getStoredCart(): GeneralCartItem[] {
  try {
    const stored = safeGetItem(CART_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Save cart safely and notify all listeners in the app
export function saveStoredCart(cart: GeneralCartItem[], source?: string): void {
  try {
    const compacted = (cart || []).map(compactCartItem);
    safeSetItem(CART_STORAGE_KEY, JSON.stringify(compacted));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: { cart, source } }));
    }
  } catch (e) {
    // Gracefully handled by safeSetItem fallback
  }
}

// Add item to cart
export function addProductToCart(product: ProductItem, quantity: number = 1, variant?: string): GeneralCartItem[] {
  const currentCart = getStoredCart();
  const cartItemId = `${product.id}_${variant || 'none'}`;
  const existingIndex = currentCart.findIndex(item => item.id === cartItemId);

  let newCart: GeneralCartItem[];
  if (existingIndex >= 0) {
    newCart = currentCart.map((item, idx) => {
      if (idx === existingIndex) {
        return { ...item, quantity: item.quantity + quantity };
      }
      return item;
    });
  } else {
    newCart = [
      ...currentCart,
      {
        id: cartItemId,
        product,
        selectedVariant: variant,
        quantity: Math.max(1, quantity)
      }
    ];
  }

  saveStoredCart(newCart);
  return newCart;
}

// Update item quantity
export function updateCartQuantity(cartItemId: string, quantity: number): GeneralCartItem[] {
  const currentCart = getStoredCart();
  let newCart: GeneralCartItem[];

  if (quantity <= 0) {
    newCart = currentCart.filter(item => item.id !== cartItemId);
  } else {
    newCart = currentCart.map(item => {
      if (item.id === cartItemId || item.product.id === cartItemId) {
        return { ...item, quantity };
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
  const newCart = currentCart.filter(item => 
    item.id !== cartItemIdOrProductId && item.product.id !== cartItemIdOrProductId
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
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  
  // Group by store
  const storesSet = new Set<string>();
  cart.forEach(item => {
    if (item.product.userId) {
      storesSet.add(item.product.userId);
    }
  });

  const totalDeliveryFee = storesSet.size * deliveryFeePerStore;
  const grandTotal = subtotal + totalDeliveryFee;

  return {
    totalItems,
    subtotal,
    storeCount: storesSet.size,
    deliveryFee: totalDeliveryFee,
    grandTotal
  };
}
