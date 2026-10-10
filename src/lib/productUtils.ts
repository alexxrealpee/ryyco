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
 * Checks if a product or category is a drink/beverage
 */
export const isDrinkProduct = (product: { name?: string; description?: string; category?: string }): boolean => {
  const cat = (product.category || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const text = `${name} ${cat} ${desc}`;

  return (
    cat.includes('bebida') ||
    cat.includes('gaseosa') ||
    cat.includes('jugo') ||
    cat.includes('cerveza') ||
    cat.includes('licor') ||
    cat.includes('agua') ||
    cat.includes('refresco') ||
    cat.includes('café') ||
    cat.includes('cafe') ||
    cat.includes('malteada') ||
    cat.includes('smoothie') ||
    cat.includes('coctel') ||
    cat.includes('cóctel') ||
    cat.includes('trago') ||
    cat.includes('energizante') ||
    name.includes('coca-cola') ||
    name.includes('coca cola') ||
    name.includes('postobon') ||
    name.includes('postobón') ||
    name.includes('pepsi') ||
    name.includes('sprite') ||
    name.includes('quatro') ||
    name.includes('colombiana') ||
    name.includes('manzana postobon') ||
    name.includes('jugo ') ||
    name.includes('jugos ') ||
    name.includes('cerveza') ||
    name.includes('gaseosa') ||
    name.includes('bebida') ||
    name.includes('agua mineral') ||
    name.includes('agua con gas') ||
    name.includes('agua cristal') ||
    name.includes('limonada') ||
    name.includes('hit ') ||
    name.includes('mora ') ||
    name.includes('maracuyá') ||
    name.includes('lulo') ||
    name.includes('mango') ||
    name.includes('monster') ||
    name.includes('red bull') ||
    name.includes('gatorade') ||
    name.includes('cerveza ') ||
    name.includes('aguardiente') ||
    name.includes('ron ') ||
    name.includes('whisky')
  );
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

export interface DrinkPreset {
  name: string;
  description: string;
  price: number;
  category: string;
  variantsText?: string;
  imageURL: string;
  icon: string;
  type?: 'gaseosa' | 'jugo' | 'cerveza' | 'agua' | 'caliente';
}

export const DEFAULT_DRINK_PRESETS: DrinkPreset[] = [
  {
    name: 'Coca-Cola 400ml',
    description: 'Bebida gaseosa personal servida bien fría.',
    price: 4500,
    category: '🥤 Bebidas',
    variantsText: 'Fría',
    imageURL: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=80',
    icon: '🥤',
    type: 'gaseosa'
  },
  {
    name: 'Postobón Manzana 400ml',
    description: 'Refrescante gaseosa tradicional colombiana sabor a manzana.',
    price: 4000,
    category: '🥤 Bebidas',
    variantsText: 'Fría',
    imageURL: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=500&auto=format&fit=crop&q=80',
    icon: '🍎',
    type: 'gaseosa'
  },
  {
    name: 'Jugo Natural en Agua',
    description: 'Jugo preparado al instante con fruta fresca natural.',
    price: 6000,
    category: '🥤 Bebidas',
    variantsText: 'Mora, Maracuyá, Mango, Lulo',
    imageURL: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500&auto=format&fit=crop&q=80',
    icon: '🧃',
    type: 'jugo'
  },
  {
    name: 'Agua Cristal 600ml',
    description: 'Agua pura sin gas servida bien fría.',
    price: 3500,
    category: '🥤 Bebidas',
    variantsText: 'Fría, Al clima',
    imageURL: 'https://images.unsplash.com/photo-1559839914-ba2ac5cd5880?w=500&auto=format&fit=crop&q=80',
    icon: '💧',
    type: 'agua'
  }
];

