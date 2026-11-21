/**
 * Pruebas del clasificador de categorías globales.  Ejecutar:  node functions/tests/productClassifier.test.cjs
 * Si cambias las reglas, agrega aquí el caso que motivó el cambio.
 */
const assert = require('assert');
const C = require('../productClassifier.cjs');

const cases = [
  // [nombre, descripción, categoría interna, categoría global esperada (null = para revisión)]
  ['Caldo de costilla', '', '', 'desayunos'],
  ['Bandeja paisa', '', '', 'almuerzos'],
  ['Hamburguesa doble', '', '', 'hamburguesas'],
  ['Salchipapa especial', '', '', 'comidas-rapidas'],
  ['Coca-Cola 400 ml', '', '', 'bebidas'],
  ['Jugo natural de mora', '', '', 'bebidas'],
  ['Torta de chocolate', '', '', 'postres'],
  ['Pizza hawaiana', '', '', 'pizzas'],
  ['Alitas BBQ', '', '', 'alitas'],
  ['Café con leche', '', '', 'bebidas'],
  ['DESAYUNO COLOMBIANO', 'Café, aromática o jugo del día, huevos al gusto, papas fritas y pan de maíz', '☕ Desayunos', 'desayunos'],
  ['PAN DE MAÍZ', 'Pan de maíz por unidad', '☕ Desayunos', 'panaderia'],
  ['Combo hamburguesa + gaseosa', 'Hamburguesa sencilla con papas y gaseosa 400ml', 'Combos', 'hamburguesas'],
  ['Calentado paisa', '', '', 'desayunos'],
  ['Chocolate caliente con queso', '', 'Bebidas calientes', 'bebidas'],
  ['Ensalada de frutas', 'con helado y queso', '', 'postres'],
  ['Arroz con pollo', '', '', 'almuerzos'],
  ['Ceviche de camarón', '', '', 'pescados-mariscos'],
  ['Hornado pastuso', 'con mote y papas', '', 'asados'],
  ['Lasaña de carne', '', '', 'pastas'],
  ['CHURASCO', 'Carne de primera calidad, papas a la francesa y ensalada', '🥩 Carnes', 'asados'],
  ['CONO MIXTO', '', '🍔 Hamburguesas', 'postres'],          // el nombre manda sobre la sección del restaurante
  ['PERRO TROPICAL', '', '🍔 Hamburguesas', 'comidas-rapidas'],
  ['PARRILLADAS', 'Acompañada de papa, ensalada y alitas', 'PARRILLADAS', 'asados'],
  ['Budweiser Six', '6 unidades', 'Licores', 'bebidas'],
  ['Combo Pareja', '2 Amburgesas Sencillas, 2 Porciones de Papa', 'Comida', 'hamburguesas'],
  ['Banderilla seoul + gaseosa', '', 'comida coreana callejera', 'comida-oriental'],
  // Ambiguos o que no son comida: no se publican en ninguna categoría
  ['Especial de la casa', 'Delicioso plato', 'General', null],
  ['Combo familiar', 'Para compartir', 'General', null],
  ['Samsung Galaxy A57 5G', 'Smartphone', 'Celulares', null],
  ['Salón de eventos', 'Restaurante', 'General', null],
];

let failed = 0;
for (const [name, description, category, expected] of cases) {
  const r = C.classifyWithRules({ name, description, category });
  const got = r.globalCategoryIds[0] || null;
  if (got !== expected) { failed++; console.log(`FALLA  ${name}: esperado ${expected}, obtuvo ${got} (${r.reason})`); }
}
// Combos con dos comidas entran en ambas categorías
assert.deepStrictEqual(new Set(C.classifyWithRules({ name: 'Combo pizza + alitas' }).globalCategoryIds), new Set(['pizzas', 'alitas']));
// La huella no cambia si solo cambia el precio o la foto
assert.equal(C.inputHash({ name: 'Pizza', price: 1 }), C.inputHash({ name: 'Pizza', price: 2, imageURL: 'x' }));
assert.notEqual(C.inputHash({ name: 'Pizza' }), C.inputHash({ name: 'Pizza familiar' }));
// La IA solo puede devolver categorías y etiquetas permitidas
assert.deepStrictEqual(C.sanitizeAiResult({ primaryCategoryId: 'pizzas', secondaryCategoryIds: ['otra'], mealTags: ['combo', 'x'], confidence: 0.9 }).globalCategoryIds, ['pizzas']);
assert.equal(C.sanitizeAiResult({ primaryCategoryId: 'inventada', confidence: 0.99 }).status, 'needs_review');
assert.equal(failed, 0, `${failed} casos fallaron`);
console.log(`OK: ${cases.length} casos del clasificador`);
