/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProductItem } from '../types';

export interface GeneralCartItem {
  id: string; // Composite ID: `${productId}_${variant || 'none'}`
  product: ProductItem;
  selectedVariant?: string;
  quantity: number;
}

const CART_STORAGE_KEY = 'linnkpro_general_cart';
export const CART_UPDATED_EVENT = 'linnkpro_cart_updated';

// Get current cart from localStorage
export function getStoredCart(): GeneralCartItem[] {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Error reading cart from localStorage:", e);
    return [];
  }
}

// Save cart and notify all listeners in the app
export function saveStoredCart(cart: GeneralCartItem[]): void {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: { cart } }));
  } catch (e) {
    console.error("Error saving cart to localStorage:", e);
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
export function calculateCartSummary(cart: GeneralCartItem[], deliveryFeePerStore: number = 4000) {
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
