/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProductItem } from '../types';

export const isFoodCategory = (cat?: string): boolean => {
  if (!cat || cat === 'all' || cat === 'Todos') return false;
  const c = cat.toLowerCase().trim();
  return (
    c.includes('comida') ||
    c.includes('caldo') ||
    c.includes('plato') ||
    c.includes('menu') ||
    c.includes('menú') ||
    c.includes('restaurante') ||
    c.includes('alimento') ||
    c.includes('gastronom') ||
    c.includes('postre') ||
    c.includes('reposter') ||
    c.includes('panader') ||
    c.includes('asado') ||
    c.includes('fast food') ||
    c.includes('snack') ||
    c.includes('hamburguesa') ||
    c.includes('pizza') ||
    c.includes('picada') ||
    c.includes('comidas') ||
    c.includes('pollo') ||
    c.includes('perro') ||
    c.includes('combo') ||
    c.includes('ensalada') ||
    c.includes('pasta') ||
    c.includes('arroz') ||
    c.includes('bebida') ||
    c.includes('desayuno') ||
    c.includes('carne') ||
    c.includes('pescado') ||
    c.includes('marisco') ||
    c.includes('vegetariano') ||
    c.includes('mexicana') ||
    c.includes('licor') ||
    c.includes('cerveza') ||
    c.includes('vino') ||
    c.includes('trago')
  );
};

export const isFoodProduct = (product: { name?: string; description?: string; category?: string }): boolean => {
  if (product.category && isFoodCategory(product.category)) return true;
  const text = `${product.name || ''} ${product.description || ''} ${product.category || ''}`.toLowerCase();
  
  const matchesFoodKeyword = (
    text.includes('comida') ||
    text.includes('plato') ||
    text.includes('menu') ||
    text.includes('menú') ||
    text.includes('caldo') ||
    text.includes('sopa') ||
    text.includes('picada') ||
    text.includes('hornado') ||
    text.includes('pollo') ||
    text.includes('carne') ||
    text.includes('hamburguesa') ||
    text.includes('pizza') ||
    text.includes('combo') ||
    text.includes('asado') ||
    text.includes('almuerzo') ||
    text.includes('desayuno') ||
    text.includes('cena') ||
    text.includes('salchipapa') ||
    text.includes('perro') ||
    text.includes('arepa') ||
    text.includes('empana') ||
    text.includes('postre') ||
    text.includes('pan ') ||
    text.includes('sandwich') ||
    text.includes('sándwich')
  );

  const isPureAlcohol = (
    (text.includes('aguardiente') || text.includes('ron ') || text.includes('cerveza') || text.includes('whisky') || text.includes('tequila') || text.includes('vodka') || text.includes('licor') || text.includes('budweiser') || text.includes('corona')) &&
    !text.includes('combo') && !text.includes('picada') && !text.includes('comida') && !text.includes('plato')
  );

  return matchesFoodKeyword && !isPureAlcohol;
};

/**
 * Orders a single batch of products internally (food first, then newest first),
 * ensuring individual batches are tidy before being appended to the screen.
 */
export function orderProductBatch(batch: ProductItem[]): ProductItem[] {
  return [...batch].sort((a, b) => {
    const foodA = isFoodProduct(a);
    const foodB = isFoodProduct(b);
    if (foodA && !foodB) return -1;
    if (!foodA && foodB) return 1;

    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
}
