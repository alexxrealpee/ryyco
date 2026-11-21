/**
 * Clasificador de productos para las CATEGORÍAS GLOBALES de RYYCO (página de inicio).
 *
 * No toca la categoría interna del restaurante (`category`). Analiza nombre,
 * categoría interna y descripción con reglas (palabras y frases normalizadas,
 * sinónimos, contexto y exclusiones). Si la confianza no alcanza, el resultado
 * queda "needs_review" y NO se publica en ninguna categoría global.
 *
 * Código puro (sin Firebase) para poder probarlo y reutilizarlo en el trigger,
 * en el proceso por lotes y en el script de línea de comandos.
 */

const CLASSIFIER_VERSION = 1;
/** Por debajo de esto el resultado no se publica: va a IA (si existe) o a revisión. */
const AUTO_CONFIDENCE = 0.6;

/** Categorías globales (mantener sincronizado con src/lib/globalCategories.ts). */
const GLOBAL_CATEGORIES = [
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
];

/** Etiquetas adicionales (momento de consumo y contexto). */
const MEAL_TAGS = [
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
];

const CATEGORY_IDS = new Set(GLOBAL_CATEGORIES.map(c => c.id));
const TAG_IDS = new Set(MEAL_TAGS.map(t => t.id));

/** Minúsculas, sin tildes ni signos, espacios simples. "Café-con LECHE!" -> "cafe con leche". */
function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Categorías internas que no dicen nada del producto. */
const GENERIC_INTERNAL = new Set(['', 'general', 'otros', 'otro', 'varios', 'productos', 'menu', 'carta', 'especiales',
  'especial', 'promociones', 'promocion', 'destacados', 'nuevo', 'nuevos', 'sin categoria', 'todos', 'platos', 'comida']);

/**
 * Reglas por categoría. Cada término es una frase normalizada que debe aparecer como
 * palabras completas. `w` = peso del término; `unless` = no cuenta si aparece alguna
 * de esas frases en el mismo texto (contexto).
 */
const T = (phrase, w = 1, unless = []) => ({ phrase, w, unless });
const DESSERT_CONTEXT = ['torta', 'brownie', 'helado', 'postre', 'pastel', 'galleta', 'cheesecake', 'mousse', 'fresas', 'pie', 'flan', 'waffle', 'crepe', 'cupcake', 'trufa'];

const RULES = {
  desayunos: [
    T('desayuno', 1.2), T('desayunos', 1.2), T('caldo', 1), T('caldo de costilla', 1.3), T('caldo de pollo', 1.3),
    T('caldo de huevo', 1.3), T('caldo de pajarilla', 1.3), T('changua', 1.2), T('calentado', 1.2), T('tamal', 1),
    T('huevos pericos', 1.2), T('huevos revueltos', 1.2), T('huevos rancheros', 1.2), T('huevos al gusto', 1),
    T('huevo frito', 0.8), T('omelette', 1), T('tortilla de huevo', 1), T('arepa con huevo', 1.2), T('pancakes', 1),
    T('tostadas francesas', 1), T('granola', 0.8), T('parfait', 0.8), T('mute', 0.6), T('huevos', 0.8),
  ],
  almuerzos: [
    T('almuerzo', 1.2), T('almuerzos', 1.2), T('bandeja paisa', 1.4), T('bandeja', 0.9), T('corrientazo', 1.2), T('ejecutivo', 1),
    T('menu del dia', 1.2), T('plato del dia', 1.2), T('sancocho', 1.2), T('ajiaco', 1.2), T('sopa', 0.8),
    T('seco de', 1), T('arroz con pollo', 1.2), T('arroz atollado', 1.2), T('sudado', 1), T('fritanga', 1),
    T('lentejas', 0.9), T('frijolada', 1), T('frijoles', 0.8), T('mondongo', 1.2), T('cazuela de frijoles', 1.2),
    T('principio', 1.3), T('consome', 0.9), T('arroces', 1), T('arroz valenciana', 1.3), T('arroz paisa', 1.3),
    T('arroz ranchero', 1.2), T('arroz mixto', 1.1), T('arroz especial', 1), T('plato tipico', 1), T('platos fuertes', 1),
  ],
  hamburguesas: [T('hamburguesa', 1.4), T('hamburguesas', 1.4), T('amburguesa', 1.4), T('amburguesas', 1.4),
    T('amburgesa', 1.4), T('amburgesas', 1.4), T('hamburgesa', 1.4), T('hamburgesas', 1.4), T('burger', 1.3), T('burgers', 1.3), T('smash', 0.8)],
  pizzas: [T('pizza', 1.4), T('pizzas', 1.4), T('calzone', 1.2), T('pizzeta', 1.2), T('panzerotti', 1)],
  'comidas-rapidas': [
    T('salchipapa', 1.4), T('salchipapas', 1.4), T('perro caliente', 1.4), T('perros calientes', 1.4), T('hot dog', 1.4),
    T('perro', 0.9, ['pollo']), T('sandwich', 1.2), T('sanduche', 1.2), T('sandwiches', 1.2), T('empanada', 1.1),
    T('empanadas', 1.1), T('papas fritas', 0.9), T('papas a la francesa', 0.9), T('choripapa', 1.3), T('chorizo', 0.7),
    T('mazorcada', 1.3), T('patacon con todo', 1.3), T('arepa rellena', 1.1), T('arepa de choclo', 1), T('pepito', 1),
    T('wrap', 0.9), T('nuggets', 1), T('comidas rapidas', 1.2), T('comida rapida', 1.2), T('fast food', 1.2),
    T('picada', 0.6), T('papa rellena', 1), T('papas', 1.1), T('papitas', 1), T('papa', 0.6), T('dedos de queso', 1), T('deditos', 0.9), T('aborrajado', 1),
  ],
  alitas: [T('alitas', 1.5), T('alas de pollo', 1.4), T('wings', 1.4), T('alita', 1.4), T('ala', 1.1), T('alas', 1.2)],
  pollo: [
    T('pollo asado', 1.4), T('pollo broaster', 1.4), T('broaster', 1.3), T('pollo apanado', 1.2), T('pollo frito', 1.2),
    T('pollo a la brasa', 1.4), T('1 4 de pollo', 1.3), T('1 8 de pollo', 1.3), T('1 8 pollo', 1.3), T('1 4 pollo', 1.3),
    T('1 2 pollo', 1.3), T('presa', 0.8), T('presas', 0.8), T('medio pollo', 1.3), T('pollo entero', 1.3), T('pechuga', 0.9),
    T('pollo', 0.75, ['arroz con pollo', 'caldo de pollo', 'alas de pollo', 'pizza', 'hamburguesa', 'pasta', 'ensalada', 'sandwich', 'wrap', 'crepe', 'empanada']),
  ],
  asados: [
    T('carne asada', 1.3), T('churrasco', 1.3), T('punta de anca', 1.3), T('lomo', 0.9), T('baby beef', 1.3), T('costillas', 1),
    T('costilla bbq', 1.2), T('parrilla', 1.1), T('parrillada', 1.3), T('asado', 1), T('asados', 1), T('chuleta', 1), T('cerdo', 0.8),
    T('hornado', 1.3), T('cuy', 1.3), T('cuy asado', 1.4), T('chicharron', 1), T('lechona', 1.2), T('carne', 0.6, ['carne molida', 'hamburguesa', 'empanada']),
    T('bbq', 0.4), T('picada', 0.9), T('picadas', 1.2), T('carnes', 1.2), T('a la plancha', 1), T('al barril', 1.1),
    T('costilla', 1), T('chunchullo', 1.3), T('cuero', 0.6), T('tabla', 0.6), T('maduro con queso', 0.5),
  ],
  'pescados-mariscos': [
    T('pescado', 1.3), T('trucha', 1.4), T('mojarra', 1.4), T('tilapia', 1.4), T('salmon', 1.2), T('robalo', 1.4), T('bagre', 1.3),
    T('camaron', 1.2), T('camarones', 1.2), T('ceviche', 1.4), T('mariscos', 1.4), T('cazuela de mariscos', 1.5),
    T('arroz marinero', 1.4), T('pulpo', 1.2), T('calamar', 1.2), T('langostinos', 1.3), T('pargo', 1.3), T('cevicheria', 1.3),
  ],
  pastas: [
    T('pasta', 1.3), T('pastas', 1.3), T('spaghetti', 1.4), T('espagueti', 1.4), T('espaguetis', 1.4), T('lasagna', 1.4),
    T('lasana', 1.4), T('fettuccine', 1.4), T('fetuccini', 1.4), T('ravioli', 1.4), T('macarrones', 1.3), T('carbonara', 1.2),
    T('bolognesa', 1.1), T('penne', 1.3), T('canelones', 1.3), T('alfredo', 0.8),
  ],
  'comida-oriental': [
    T('sushi', 1.5), T('ramen', 1.5), T('arroz chino', 1.4), T('arroz oriental', 1.3), T('chow mein', 1.4), T('wok', 1.2),
    T('teriyaki', 1.2), T('makis', 1.4), T('rollos', 0.6), T('kimchi', 1.2), T('chop suey', 1.4), T('lumpias', 1.3), T('poke', 1.1),
  ],
  'comida-mexicana': [
    T('tacos', 1.4), T('taco', 1.3), T('burrito', 1.4), T('burritos', 1.4), T('quesadilla', 1.3), T('quesadillas', 1.3),
    T('nachos', 1.2), T('fajitas', 1.3), T('enchiladas', 1.4), T('mexicana', 0.9), T('mexicano', 0.9), T('guacamole', 0.7),
  ],
  saludable: [
    T('ensalada', 1.2, ['ensalada de frutas']), T('ensaladas', 1.2, ['ensalada de frutas']), T('bowl', 1), T('vegano', 1.1),
    T('vegana', 1.1), T('vegetariano', 0.9), T('fit', 0.8), T('saludable', 1.2), T('light', 0.6), T('integral', 0.5),
  ],
  panaderia: [
    T('pan', 1.1), T('pan de maiz', 1.3), T('panes', 1.1), T('croissant', 1.3), T('pandebono', 1.4), T('almojabana', 1.4),
    T('pan de yuca', 1.4), T('bunuelo', 1.3), T('bunuelos', 1.3), T('rosca', 1), T('mogolla', 1.3), T('roscon', 1.2),
    T('panaderia', 1.3), T('tostada', 0.6), T('achira', 1.2), T('quesadilla de queso', 0.9), T('pastel de pollo', 0.9),
    T('empanada de pipian', 0.4),
  ],
  postres: [
    T('postre', 1.3), T('postres', 1.3), T('torta', 1.2), T('pastel', 1, ['pastel de pollo', 'pastel de carne']),
    T('cheesecake', 1.4), T('brownie', 1.4), T('helado', 1.3), T('helados', 1.3), T('cono', 0.8), T('fresas con crema', 1.5),
    T('ensalada de frutas', 1.5), T('obleas', 1.4), T('oblea', 1.4), T('gelatina', 1.2), T('flan', 1.3), T('tres leches', 1.4),
    T('waffle', 1.2), T('wafle', 1.2), T('waffles', 1.2), T('crepe', 0.8), T('crepes', 0.9), T('yogurt', 1), T('yogur', 1), T('arroz con leche', 1.4), T('mousse', 1.3), T('cupcake', 1.3), T('galletas', 1),
    T('cholado', 1.3), T('salpicon', 0.8, ['salpicon de mariscos']), T('tiramisu', 1.4), T('pie de', 1.1), T('merengon', 1.3),
    T('postre de natas', 1.4), T('trufas', 1.2), T('donas', 1.2), T('dona', 1.2), T('banana split', 1.4),
  ],
  bebidas: [
    T('bebida', 1.2), T('bebidas', 1.2), T('gaseosa', 1.4), T('gaseosas', 1.4), T('coca cola', 1.5), T('cocacola', 1.5),
    T('pepsi', 1.5), T('postobon', 1.5), T('sprite', 1.5), T('quatro', 1.4), T('colombiana', 1.1, ['comida colombiana', 'bandeja colombiana', 'desayuno colombiano']),
    T('pony malta', 1.5), T('malta', 1), T('jugo', 1.3), T('jugos', 1.3), T('limonada', 1.4), T('agua', 1.1, ['agua de panela con queso']),
    T('agua mineral', 1.5), T('agua con gas', 1.5), T('te', 0.8), T('aromatica', 1.2), T('cafe', 1.2), T('tinto', 1.1, ['vino tinto']),
    T('capuchino', 1.4), T('cappuccino', 1.4), T('latte', 1.3), T('americano', 1), T('espresso', 1.4), T('mocca', 1.2),
    T('chocolate', 1, DESSERT_CONTEXT), T('chocolate caliente', 1.3), T('agua de panela', 1.3), T('aguapanela', 1.3),
    T('cerveza', 1.4), T('cervezas', 1.4), T('aguardiente', 1.5), T('ron', 1.2), T('whisky', 1.5), T('vodka', 1.5),
    T('tequila', 1.4), T('vino', 1.3), T('coctel', 1.4), T('cocteles', 1.4), T('michelada', 1.5), T('mojito', 1.5),
    T('malteada', 1.3), T('malteadas', 1.3), T('smoothie', 1.4), T('batido', 1.3), T('frappe', 1.4), T('kumis', 1.3),
    T('avena', 0.9, ['galleta', 'pan']), T('champus', 1.3), T('lulada', 1.4), T('hervido', 1.2), T('canelazo', 1.4),
    T('hit', 1.1), T('red bull', 1.5), T('granizado', 1.4), T('granizados', 1.4), T('licor', 1.4), T('licores', 1.4),
    T('vinos', 1.4), T('micheladas', 1.5), T('champagne', 1.4), T('sangria', 1.4), T('botella', 1), T('hervidos', 1.3),
    T('sodas', 1.3), T('budweiser', 1.5), T('corona', 1.2, ['corona de']), T('aguila', 1.3), T('poker', 1.3), T('club colombia', 1.5),
    T('heineken', 1.5), T('stella artois', 1.5), T('costena', 1.4), T('andina', 1.2), T('jarra', 0.8), T('margarita', 0.8, ['pizza']), T('energizante', 1.4), T('refresco', 1.3), T('soda', 1.2), T('jarra', 0.8), T('ml', 0.5), T('litro', 0.6),
  ],
};

/** Peso de cada campo: el nombre manda; la descripción solo da contexto. */
const FIELD_WEIGHT = { name: 3, category: 2, description: 1.5 };
/** Mínimo de evidencia para publicar (una coincidencia razonable en el nombre o en la descripción). */
const MIN_SCORE = 1.8;

/**
 * Acompañamientos: en la DESCRIPCIÓN ("con papa a la francesa y ensalada") no definen el producto
 * si la descripción menciona además otra cosa. Se quitan antes de puntuar en ese caso.
 */
const SIDE_PHRASES = ['papas fritas', 'papa frita', 'papas a la francesa', 'papa a la francesa', 'papas a la frances', 'papa a la frances',
  'papa francesa', 'papa al vapor', 'papa salada', 'ensalada', 'arroz', 'pan artesanal', 'pan', 'jugo', 'gaseosa', 'bebida', 'cafe',
  'aromatica', 'te', 'guacamole', 'aji', 'maduro', 'patacon', 'patacones', 'yuca', 'tostadas', 'papas', 'papa'];

/** Categorías que son comida (si el NOMBRE es comida, una bebida en la descripción no cambia nada). */
const FOOD_CATEGORIES = new Set([...CATEGORY_IDS].filter(id => id !== 'bebidas'));

function hasPhrase(text, phrase) {
  if (!text) return false;
  return (' ' + text + ' ').includes(' ' + phrase + ' ');
}

/** Puntaje de cada categoría en un texto: el término de mayor peso (no la suma, para no premiar listas). */
function scoreText(text) {
  const scores = {};
  if (!text) return scores;
  for (const [category, terms] of Object.entries(RULES)) {
    let best = 0;
    for (const term of terms) {
      if (term.w <= best || !hasPhrase(text, term.phrase)) continue;
      if (term.unless.some(ctx => hasPhrase(text, ctx))) continue;
      best = term.w;
    }
    if (best > 0) scores[category] = best;
  }
  return scores;
}

const TAG_RULES = {
  'comida-tipica': ['calentado', 'tamal', 'hornado', 'cuy', 'sancocho', 'ajiaco', 'bandeja paisa', 'empanada de pipian', 'lechona',
    'champus', 'hervido', 'mote', 'fritanga', 'pan de maiz', 'quimbolito', 'humita', 'changua', 'mondongo', 'tipico', 'tipica', 'tradicional'],
  'para-compartir': ['para compartir', 'familiar', 'picada', 'parrillada', 'para 2', 'para dos', 'para 4', 'gigante', 'mega'],
  combo: ['combo', 'combos', 'promo', 'promocion'],
  vegetariano: ['vegetariano', 'vegetariana', 'vegano', 'vegana', 'veggie'],
  'bebida-caliente': ['cafe', 'tinto', 'capuchino', 'cappuccino', 'latte', 'aromatica', 'chocolate caliente', 'agua de panela', 'hervido', 'canelazo', 'te'],
  'bebida-alcoholica': ['cerveza', 'cervezas', 'aguardiente', 'ron', 'whisky', 'vodka', 'tequila', 'vino', 'coctel', 'michelada', 'mojito', 'canelazo', 'hervido'],
  cena: ['cena', 'nocturno'],
  onces: ['onces', 'merienda', 'media tarde'],
};

const CATEGORY_DEFAULT_TAGS = { desayunos: ['desayuno'], almuerzos: ['almuerzo'], panaderia: ['onces'], postres: ['onces'] };

function inputOf(product) {
  const internal = normalize(product.category);
  return {
    name: normalize(product.name),
    category: GENERIC_INTERNAL.has(internal) ? '' : internal,
    description: normalize(product.description).slice(0, 400),
  };
}

/** Huella del texto que se clasifica: si no cambia, no se vuelve a clasificar. */
function inputHash(product) {
  const input = inputOf(product);
  const text = `${input.name}|${input.category}|${input.description}`;
  // FNV-1a 32 bits (suficiente para detectar cambios; no es seguridad).
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * Clasifica un producto con reglas.
 * Devuelve { status, globalCategoryIds, globalMealTags, confidence, suggestedCategoryIds, reason }.
 */
function classifyWithRules(product) {
  const input = inputOf(product);
  let description = scoreText(input.description);
  const stripped = SIDE_PHRASES.reduce((text, phrase) => (' ' + text + ' ').split(' ' + phrase + ' ').join(' ').trim(), input.description);
  const withoutSides = scoreText(stripped);
  if (Object.keys(withoutSides).length > 0) description = withoutSides;
  const perField = {
    name: scoreText(input.name),
    category: scoreText(input.category),
    description,
  };
  const totals = {};
  for (const [field, scores] of Object.entries(perField)) {
    for (const [category, value] of Object.entries(scores)) {
      totals[category] = (totals[category] || 0) + value * FIELD_WEIGHT[field];
    }
  }
  // Contexto: si el NOMBRE es comida, las bebidas de la descripción ("incluye jugo") no cuentan,
  // y una bebida solo en la categoría interna pesa la mitad.
  const nameHasFood = Object.keys(perField.name).some(c => FOOD_CATEGORIES.has(c));
  if (nameHasFood && totals.bebidas) {
    totals.bebidas -= (perField.description.bebidas || 0) * FIELD_WEIGHT.description;
    if (!perField.name.bebidas) totals.bebidas *= 0.5;
    if (totals.bebidas <= 0.01) delete totals.bebidas;
  }
  // Un nombre que es claramente bebida ("Jugo natural de mora") no se vuelve postre por la fruta o el chocolate.
  if (perField.name.bebidas && !nameHasFood) {
    for (const c of Object.keys(totals)) if (c !== 'bebidas' && !perField.name[c]) totals[c] *= 0.5;
  }

  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const [top] = ranked;
  const s1 = top ? top[1] : 0;
  // Categorías secundarias: otras que el NOMBRE también menciona con fuerza (ej. "Combo pizza + alitas").
  const secondary = ranked.slice(1)
    .filter(([c, s]) => perField.name[c] && s >= 0.6 * s1 && !(c === 'bebidas' && nameHasFood))
    .map(([c]) => c).slice(0, 2);
  const categoryIds = top ? [top[0], ...secondary] : [];
  // La confianza baja solo por categorías que compiten y NO quedaron incluidas.
  const competitor = ranked.find(([c]) => !categoryIds.includes(c));
  // Si el que compite solo viene de la categoría interna (ej. un sándwich en la sección
  // "Hamburguesas" del restaurante) y el nombre dice otra cosa, compite a medias.
  let s2 = competitor ? competitor[1] : 0;
  if (competitor && perField.name[top[0]] && !perField.name[competitor[0]] && !perField.description[competitor[0]]) s2 *= 0.5;
  const confidence = s1 > 0 ? Math.min(0.99, 0.5 * (1 - s2 / s1) + 0.5 * Math.min(1, s1 / 3)) : 0;

  const allText = `${input.name} ${input.category} ${input.description}`;
  const nameAndCategory = `${input.name} ${input.category}`;
  const tags = new Set();
  categoryIds.forEach(c => (CATEGORY_DEFAULT_TAGS[c] || []).forEach(t => tags.add(t)));
  for (const [tag, phrases] of Object.entries(TAG_RULES)) {
    // Bebidas calientes/alcohol: solo si el producto ES la bebida (no "desayuno con café").
    const source = tag.startsWith('bebida-') ? (categoryIds[0] === 'bebidas' ? nameAndCategory : '') : allText;
    if (phrases.some(p => hasPhrase(source, p))) tags.add(tag);
  }

  const confident = s1 >= MIN_SCORE && confidence >= AUTO_CONFIDENCE;
  return {
    status: confident ? 'classified' : 'needs_review',
    globalCategoryIds: confident ? categoryIds : [],
    globalMealTags: confident ? [...tags] : [],
    confidence: Math.round(confidence * 100) / 100,
    suggestedCategoryIds: categoryIds,
    reason: ranked.slice(0, 3).map(([c, s]) => `${c}:${Math.round(s * 10) / 10}`).join(' '),
  };
}

/** Valida y limpia una respuesta de IA: solo categorías y etiquetas permitidas. */
function sanitizeAiResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const primary = String(raw.primaryCategoryId || '');
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  if (!CATEGORY_IDS.has(primary) || confidence < AUTO_CONFIDENCE) {
    return { status: 'needs_review', globalCategoryIds: [], globalMealTags: [], confidence,
      suggestedCategoryIds: CATEGORY_IDS.has(primary) ? [primary] : [], reason: 'ia:baja-confianza' };
  }
  const secondary = (Array.isArray(raw.secondaryCategoryIds) ? raw.secondaryCategoryIds : [])
    .map(String).filter(id => CATEGORY_IDS.has(id) && id !== primary).slice(0, 2);
  const tags = (Array.isArray(raw.mealTags) ? raw.mealTags : []).map(String).filter(t => TAG_IDS.has(t));
  return { status: 'classified', globalCategoryIds: [primary, ...secondary], globalMealTags: [...new Set(tags)],
    confidence: Math.round(confidence * 100) / 100, suggestedCategoryIds: [primary, ...secondary], reason: 'ia' };
}

module.exports = {
  CLASSIFIER_VERSION, AUTO_CONFIDENCE, GLOBAL_CATEGORIES, MEAL_TAGS, CATEGORY_IDS, TAG_IDS,
  normalize, inputOf, inputHash, classifyWithRules, sanitizeAiResult,
};
