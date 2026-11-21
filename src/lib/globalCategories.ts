/**
 * Categorías GLOBALES de RYYCO (página de inicio). Son independientes de las
 * categorías internas que cada restaurante usa en su menú (`category`).
 * Las asigna el clasificador del servidor (functions/productClassifier.cjs);
 * mantener esta lista sincronizada con GLOBAL_CATEGORIES de ese archivo.
 */
export const GLOBAL_CATEGORIES = [
  { id: 'desayunos', label: '☕ Desayunos' },
  { id: 'almuerzos', label: '🍛 Almuerzos' },
  { id: 'hamburguesas', label: '🍔 Hamburguesas' },
  { id: 'pizzas', label: '🍕 Pizzas' },
  { id: 'comidas-rapidas', label: '🌭 Comidas rápidas' },
  { id: 'alitas', label: '🍗 Alitas' },
  { id: 'pollo', label: '🐔 Pollo' },
  { id: 'asados', label: '🥩 Asados y parrilla' },
  { id: 'pescados-mariscos', label: '🐟 Pescados y mariscos' },
  { id: 'pastas', label: '🍝 Pastas' },
  { id: 'comida-oriental', label: '🍣 Comida oriental' },
  { id: 'comida-mexicana', label: '🌮 Comida mexicana' },
  { id: 'saludable', label: '🥗 Saludable' },
  { id: 'panaderia', label: '🥐 Panadería' },
  { id: 'postres', label: '🍰 Postres' },
  { id: 'bebidas', label: '🥤 Bebidas' },
] as const;

export type GlobalCategoryId = typeof GLOBAL_CATEGORIES[number]['id'];

export const GLOBAL_MEAL_TAGS = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'cena', label: 'Cena' },
  { id: 'onces', label: 'Onces' },
  { id: 'comida-tipica', label: 'Comida típica' },
  { id: 'para-compartir', label: 'Para compartir' },
  { id: 'combo', label: 'Combo' },
  { id: 'vegetariano', label: 'Vegetariano' },
  { id: 'bebida-caliente', label: 'Bebida caliente' },
  { id: 'bebida-alcoholica', label: 'Bebida alcohólica' },
] as const;

const LABELS: Record<string, string> = Object.fromEntries(GLOBAL_CATEGORIES.map(c => [c.id, c.label]));

export function isGlobalCategoryId(id: string): id is GlobalCategoryId {
  return id in LABELS;
}

export function globalCategoryLabel(id: string): string {
  return LABELS[id] || id;
}
