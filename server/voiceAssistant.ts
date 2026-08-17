/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, FunctionDeclaration, Modality } from '@google/genai';
import type OpenAI from 'openai';

export interface CatalogProduct {
  id: string;
  userId: string;
  name: string;
  description?: string;
  price: number;
  stock?: number;
  category?: string;
  imageURL?: string;
  storeName?: string;
  storeUsername?: string;
  active?: boolean;
}

export interface CatalogStore {
  uid: string;
  username: string;
  displayName: string;
  bio?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  isClosed?: boolean;
  suspended?: boolean;
}

export interface CartPayloadItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  selectedVariant?: string;
  imageURL?: string;
  storeName?: string;
  userId: string;
}

export interface VoiceAssistantContext {
  products: CatalogProduct[];
  stores: CatalogStore[];
  deliveryFee: number;
  cart: CartPayloadItem[];
  recentOrders?: Array<{
    id: string;
    orderNumber: number;
    storeName: string;
    totalAmount: number;
    status: string;
    createdAt: string;
    customerPhone?: string;
    customerName?: string;
    deliveryDriverName?: string;
    deliveryStep?: string;
  }>;
  userLocation?: string;
}

// Function declarations for Gemini Function Calling
const searchProductsFunction: FunctionDeclaration = {
  name: "search_products_and_stores",
  description: "Busca productos, platos, bebidas, comidas rápidas, postres o restaurantes en el catálogo de LinnkPro. Retorna únicamente productos reales.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "El término o producto a buscar, por ejemplo: 'hamburguesa', 'pizza', 'bebidas', 'pollo asado', 'café', 'almuerzo'."
      },
      category: {
        type: Type.STRING,
        description: "Filtro opcional por categoría (ej: 'Comidas Rápidas', 'Bebidas', 'Postres')."
      },
      storeName: {
        type: Type.STRING,
        description: "Filtro opcional por nombre de restaurante o tienda."
      }
    },
    required: ["query"]
  }
};

const getRestaurantMenuFunction: FunctionDeclaration = {
  name: "get_restaurant_menu",
  description: "Consulta el menú completo de platos y categorías de un restaurante o tienda específica.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      storeNameOrUsername: {
        type: Type.STRING,
        description: "El nombre comercial o username del restaurante."
      }
    },
    required: ["storeNameOrUsername"]
  }
};

const getProductDetailsFunction: FunctionDeclaration = {
  name: "get_product_details",
  description: "Obtiene información detallada de un producto (precio exacto en COP, disponibilidad/stock, descripción, restaurante).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      productIdOrName: {
        type: Type.STRING,
        description: "El ID o nombre aproximado del producto a consultar."
      }
    },
    required: ["productIdOrName"]
  }
};

const getCartFunction: FunctionDeclaration = {
  name: "get_cart",
  description: "Consulta el contenido actual del carrito de compras del usuario, cantidad de ítems, subtotal y total estimado.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const addToCartFunction: FunctionDeclaration = {
  name: "add_to_cart",
  description: "Agrega un producto real encontrado en el catálogo al carrito de compras.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      productId: {
        type: Type.STRING,
        description: "El ID del producto a agregar."
      },
      quantity: {
        type: Type.NUMBER,
        description: "La cantidad a agregar (por defecto 1)."
      },
      variant: {
        type: Type.STRING,
        description: "Variante, adición o sabor opcional."
      }
    },
    required: ["productId"]
  }
};

const updateCartQuantityFunction: FunctionDeclaration = {
  name: "update_cart_quantity",
  description: "Modifica la cantidad de un producto existente en el carrito.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      productId: {
        type: Type.STRING,
        description: "El ID del producto en el carrito."
      },
      quantity: {
        type: Type.NUMBER,
        description: "Nueva cantidad deseada (0 para eliminar)."
      }
    },
    required: ["productId", "quantity"]
  }
};

const removeFromCartFunction: FunctionDeclaration = {
  name: "remove_from_cart",
  description: "Elimina un producto del carrito de compras.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      productId: {
        type: Type.STRING,
        description: "El ID del producto a remover."
      }
    },
    required: ["productId"]
  }
};

const clearCartFunction: FunctionDeclaration = {
  name: "clear_cart",
  description: "Vacía completamente el carrito de compras.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const requestOrderConfirmationFunction: FunctionDeclaration = {
  name: "request_order_confirmation",
  description: "Prepara y presenta un resumen del pedido al usuario solicitando confirmación explícita antes de crearlo. Debe usarse cuando el usuario quiera pedir.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      customerName: {
        type: Type.STRING,
        description: "Nombre de la persona que recibe."
      },
      customerPhone: {
        type: Type.STRING,
        description: "Número de teléfono o celular de contacto."
      },
      customerAddress: {
        type: Type.STRING,
        description: "Dirección de entrega para el domicilio."
      },
      paymentMethod: {
        type: Type.STRING,
        description: "Método de pago: 'delivery_cash' (Efectivo contra entrega), 'transfer' (Transferencia / Nequi / Bancolombia), o 'whatsapp'."
      },
      notes: {
        type: Type.STRING,
        description: "Notas especiales o instrucciones de entrega."
      }
    },
    required: ["customerName", "customerPhone", "customerAddress"]
  }
};

const createOrderFunction: FunctionDeclaration = {
  name: "create_order",
  description: "Crea el pedido real en el sistema ÚNICAMENTE tras confirmación explícita del usuario (por ejemplo si el usuario dice 'Sí, confirma el pedido' o 'Ordenar ahora').",
  parameters: {
    type: Type.OBJECT,
    properties: {
      customerName: {
        type: Type.STRING,
        description: "Nombre del cliente."
      },
      customerPhone: {
        type: Type.STRING,
        description: "Teléfono del cliente."
      },
      customerAddress: {
        type: Type.STRING,
        description: "Dirección de entrega."
      },
      paymentMethod: {
        type: Type.STRING,
        description: "Método de pago elegido ('delivery_cash' | 'transfer' | 'whatsapp')."
      },
      notes: {
        type: Type.STRING,
        description: "Instrucciones de entrega o notas."
      },
      isConfirmed: {
        type: Type.BOOLEAN,
        description: "Debe ser true indicando que el usuario confirmó explícitamente la orden."
      }
    },
    required: ["customerName", "customerPhone", "customerAddress", "isConfirmed"]
  }
};

const getOrderStatusFunction: FunctionDeclaration = {
  name: "get_order_status",
  description: "Consulta el estado en tiempo real de un pedido por su número o teléfono del cliente.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      orderNumber: {
        type: Type.NUMBER,
        description: "Número del pedido (ej: 12, 105)."
      },
      customerPhone: {
        type: Type.STRING,
        description: "Número de celular asociado al pedido."
      }
    }
  }
};

const navigateToStoreFunction: FunctionDeclaration = {
  name: "navigate_to_store",
  description: "Navega la interfaz hacia la tienda o restaurante solicitado.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      storeUsername: {
        type: Type.STRING,
        description: "El slug/username del restaurante al cual navegar (ej: 'pollostop', 'donde_pepe')."
      }
    },
    required: ["storeUsername"]
  }
};

const listOpenRestaurantsFunction: FunctionDeclaration = {
  name: "list_open_restaurants",
  description: "Lista todos los restaurantes y tiendas abiertas en la plataforma LinnkPro con sus especialidades.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

export const assistantTools = [
  searchProductsFunction,
  listOpenRestaurantsFunction,
  getRestaurantMenuFunction,
  getProductDetailsFunction,
  getCartFunction,
  addToCartFunction,
  updateCartQuantityFunction,
  removeFromCartFunction,
  clearCartFunction,
  requestOrderConfirmationFunction,
  createOrderFunction,
  getOrderStatusFunction,
  navigateToStoreFunction
];

// OpenAI Chat Completions Tools schema definition
export const openAITools: any[] = [
  {
    type: "function",
    function: {
      name: "search_products_and_stores",
      description: "Busca productos, platos, bebidas, comidas rápidas, postres o restaurantes en el catálogo de LinnkPro. Retorna únicamente productos reales.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Término o producto a buscar (ej: 'hamburguesa', 'pizza', 'pollo')." },
          category: { type: "string", description: "Categoría opcional." },
          storeName: { type: "string", description: "Nombre de restaurante opcional." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_open_restaurants",
      description: "Lista todos los restaurantes y tiendas abiertas en la plataforma LinnkPro con sus especialidades.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_restaurant_menu",
      description: "Consulta el menú de un restaurante o tienda específica.",
      parameters: {
        type: "object",
        properties: {
          storeNameOrUsername: { type: "string", description: "Nombre o username de la tienda." }
        },
        required: ["storeNameOrUsername"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Obtiene información detallada de un plato o producto.",
      parameters: {
        type: "object",
        properties: {
          productIdOrName: { type: "string", description: "ID o nombre del producto." }
        },
        required: ["productIdOrName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cart",
      description: "Consulta los productos actuales en el carrito del cliente.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description: "Agrega un producto real al carrito.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string", description: "ID del producto." },
          productName: { type: "string", description: "Nombre del producto." },
          quantity: { type: "number", description: "Cantidad (default 1)." },
          variant: { type: "string", description: "Variante opcional." }
        },
        required: ["productId", "quantity"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_cart_quantity",
      description: "Actualiza la cantidad de un producto en el carrito.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "number" }
        },
        required: ["productId", "quantity"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "remove_from_cart",
      description: "Elimina un producto del carrito.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" }
        },
        required: ["productId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "clear_cart",
      description: "Vacía el carrito de compras.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_order_confirmation",
      description: "Presenta el resumen del pedido para revisión del cliente.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          customerPhone: { type: "string" },
          customerAddress: { type: "string" },
          paymentMethod: { type: "string" },
          notes: { type: "string" }
        },
        required: ["customerName", "customerPhone", "customerAddress"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_order",
      description: "Crea el pedido tras confirmación explícita del cliente.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          customerPhone: { type: "string" },
          customerAddress: { type: "string" },
          paymentMethod: { type: "string" },
          notes: { type: "string" },
          isConfirmed: { type: "boolean" }
        },
        required: ["customerName", "customerPhone", "customerAddress", "isConfirmed"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_order_status",
      description: "Consulta el estado de un pedido.",
      parameters: {
        type: "object",
        properties: {
          orderNumber: { type: "number" },
          customerPhone: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "navigate_to_store",
      description: "Navega a la tienda o restaurante especificado.",
      parameters: {
        type: "object",
        properties: {
          storeUsername: { type: "string" }
        },
        required: ["storeUsername"]
      }
    }
  }
];

// Unified Tool Execution Helper
export function executeAssistantToolCall(
  callName: string,
  args: any,
  context: {
    products: CatalogProduct[];
    stores: CatalogStore[];
    cart: CartPayloadItem[];
    deliveryFee: number;
    recentOrders?: any[];
  }
): { action: any; resultText?: string } {
  const { products, stores, cart, deliveryFee, recentOrders = [] } = context;

  if (callName === 'search_products_and_stores') {
    const queryTerm = (args.query || '').toLowerCase().trim();
    const storeTerm = (args.storeName || '').toLowerCase().trim();
    const categoryTerm = (args.category || '').toLowerCase().trim();

    const rawTokens = queryTerm.split(/\s+/).map((t: string) => t.replace(/[^a-záéíóúüñ0-9]/gi, '')).filter((t: string) => t.length >= 3);

    const matches = products.filter(p => {
      if (p.active === false) return false;
      const pName = (p.name || '').toLowerCase();
      const pDesc = (p.description || '').toLowerCase();
      const pCat = (p.category || '').toLowerCase();
      const pStore = (p.storeName || '').toLowerCase();

      const exactMatch = queryTerm ? (pName.includes(queryTerm) || pDesc.includes(queryTerm) || pCat.includes(queryTerm)) : true;
      const tokenMatch = rawTokens.some((tok: string) => {
        const singular = tok.endsWith('s') ? tok.slice(0, -1) : tok;
        return pName.includes(tok) || pName.includes(singular) ||
               pDesc.includes(tok) || pDesc.includes(singular) ||
               pCat.includes(tok) || pCat.includes(singular);
      });

      const matchCat = categoryTerm ? pCat.includes(categoryTerm) : true;
      const matchStore = storeTerm ? pStore.includes(storeTerm) : true;
      return (exactMatch || tokenMatch) && matchCat && matchStore;
    });

    const matchingStores = stores.filter(s => 
      !s.isClosed && (s.displayName.toLowerCase().includes(queryTerm) || s.username.toLowerCase().includes(queryTerm))
    );

    const action = {
      type: 'PRODUCTS_SEARCHED',
      query: args.query,
      results: (matches.length > 0 ? matches : products).slice(0, 10),
      stores: matchingStores.slice(0, 5)
    };

    let resultText = '';
    if (matches.length > 0) {
      const topNames = matches.slice(0, 3).map(m => `${m.name} por ${m.price.toLocaleString('es-CO')} pesos en ${m.storeName || 'la tienda'}`).join(', ');
      resultText = `Encontré ${matches.length} opción(es) para "${args.query}": ${topNames}.`;
    } else if (products.length > 0) {
      const topGeneral = products.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos en ${p.storeName || 'el restaurante'}`).join(', ');
      resultText = `Tenemos disponibles: ${topGeneral}.`;
    } else {
      resultText = `No encontré resultados para "${args.query}".`;
    }

    return { action, resultText };
  }

  if (callName === 'list_open_restaurants') {
    const action = {
      type: 'OPEN_STORES_LISTED',
      stores: stores.slice(0, 10)
    };
    const storeNames = stores.slice(0, 5).map(s => s.displayName).join(', ');
    const resultText = stores.length > 0
      ? `Tenemos abiertos y disponibles los siguientes restaurantes: ${storeNames}. ¿Qué te gustaría ordenar hoy?`
      : `Tenemos restaurantes disponibles en LinnkPro listos para tu pedido.`;
    return { action, resultText };
  }

  if (callName === 'get_product_details') {
    const term = (args.productIdOrName || '').toLowerCase();
    const found = products.find(p => p.id === args.productIdOrName || p.name.toLowerCase().includes(term));
    const action = {
      type: 'PRODUCT_DETAILS',
      product: found || null
    };
    const resultText = found
      ? `${found.name} cuesta ${found.price.toLocaleString('es-CO')} pesos en ${found.storeName || 'la tienda'}. ${found.description || ''}`
      : `No se encontraron detalles para ${args.productIdOrName}.`;
    return { action, resultText };
  }

  if (callName === 'get_restaurant_menu') {
    const term = (args.storeNameOrUsername || '').toLowerCase();
    const targetStore = stores.find(s => 
      s.displayName.toLowerCase().includes(term) || s.username.toLowerCase().includes(term) || s.uid === term
    );
    const storeProducts = targetStore 
      ? products.filter(p => p.userId === targetStore.uid && p.active !== false)
      : [];
    const action = {
      type: 'RESTAURANT_MENU',
      store: targetStore || null,
      products: storeProducts
    };
    const resultText = targetStore
      ? `El restaurante ${targetStore.displayName} tiene ${storeProducts.length} platos en su menú.`
      : `No se encontró el restaurante ${args.storeNameOrUsername}.`;
    return { action, resultText };
  }

  if (callName === 'get_cart') {
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const action = {
      type: 'CART_SUMMARY',
      cart,
      totalAmount,
      itemCount
    };
    const itemsList = cart.map(i => `${i.quantity}x ${i.name}`).join(', ');
    const resultText = itemCount === 0
      ? `El carrito está vacío.`
      : `Carrito: ${itemCount} plato(s) (${itemsList}), subtotal ${totalAmount.toLocaleString('es-CO')} pesos.`;
    return { action, resultText };
  }

  if (callName === 'add_to_cart') {
    const targetProduct = products.find(p => p.id === args.productId || p.name.toLowerCase().includes((args.productId || '').toLowerCase()));
    if (targetProduct) {
      const action = {
        type: 'ADD_TO_CART',
        product: targetProduct,
        quantity: args.quantity || 1,
        variant: args.variant
      };
      const resultText = `Agregado ${args.quantity || 1} ${targetProduct.name} al carrito por ${targetProduct.price.toLocaleString('es-CO')} pesos.`;
      return { action, resultText };
    }
    return { action: null, resultText: `No se pudo encontrar el producto para agregar.` };
  }

  if (callName === 'update_cart_quantity') {
    return {
      action: {
        type: 'UPDATE_CART_QUANTITY',
        productId: args.productId,
        quantity: args.quantity
      },
      resultText: `Cantidad actualizada en el carrito.`
    };
  }

  if (callName === 'remove_from_cart') {
    return {
      action: {
        type: 'REMOVE_FROM_CART',
        productId: args.productId
      },
      resultText: `Producto eliminado del carrito.`
    };
  }

  if (callName === 'clear_cart') {
    return {
      action: { type: 'CLEAR_CART' },
      resultText: `Carrito vaciado.`
    };
  }

  if (callName === 'request_order_confirmation') {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const storesSet = new Set(cart.map(i => i.userId));
    const totalDelivery = storesSet.size * deliveryFee;
    const grandTotal = subtotal + totalDelivery;

    const action = {
      type: 'ORDER_CONFIRMATION_REQUESTED',
      orderProposal: {
        customerName: args.customerName,
        customerPhone: args.customerPhone,
        customerAddress: args.customerAddress,
        paymentMethod: args.paymentMethod || 'delivery_cash',
        notes: args.notes || '',
        items: cart,
        subtotal,
        deliveryFee: totalDelivery,
        grandTotal,
        storesCount: storesSet.size
      }
    };
    const resultText = `Resumen preparado: total ${grandTotal.toLocaleString('es-CO')} pesos para entrega a ${args.customerName}.`;
    return { action, resultText };
  }

  if (callName === 'create_order') {
    if (args.isConfirmed) {
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const storesSet = new Set(cart.map(i => i.userId));
      const totalDelivery = storesSet.size * deliveryFee;
      const grandTotal = subtotal + totalDelivery;

      const action = {
        type: 'ORDER_CREATE_CONFIRMED',
        orderData: {
          customerName: args.customerName,
          customerPhone: args.customerPhone,
          customerAddress: args.customerAddress,
          paymentMethod: args.paymentMethod || 'delivery_cash',
          notes: args.notes || '',
          items: cart,
          subtotal,
          deliveryFee: totalDelivery,
          grandTotal
        }
      };
      return { action, resultText: `Pedido confirmado con éxito.` };
    }
    return { action: null, resultText: `Se requiere confirmación del cliente para crear el pedido.` };
  }

  if (callName === 'get_order_status') {
    let matchedOrder = null;
    if (args.orderNumber) {
      matchedOrder = recentOrders.find(o => o.orderNumber === args.orderNumber);
    }
    if (!matchedOrder && args.customerPhone) {
      matchedOrder = recentOrders.find(o => (o.customerPhone || '').includes(args.customerPhone));
    }
    if (!matchedOrder && recentOrders.length > 0) {
      matchedOrder = recentOrders[0];
    }
    const action = {
      type: 'ORDER_STATUS_RESULT',
      order: matchedOrder
    };
    const resultText = matchedOrder
      ? `Pedido #${matchedOrder.orderNumber}: Estado ${matchedOrder.status || 'En preparación'}. Total ${matchedOrder.totalAmount?.toLocaleString('es-CO')} pesos.`
      : `No se encontró un pedido reciente con esos datos.`;
    return { action, resultText };
  }

  if (callName === 'navigate_to_store') {
    return {
      action: {
        type: 'NAVIGATE_TO_STORE',
        storeUsername: args.storeUsername
      },
      resultText: `Navegando a @${args.storeUsername}.`
    };
  }

  return { action: null, resultText: 'Acción ejecutada.' };
}

// Helper function to turn Colombian peso amounts and numbers into natural spoken Spanish words
function convertNumbersToNaturalSpokenSpanish(text: string): string {
  return text
    // Emojis and markdown removal
    .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[*_#`~>]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    // Multipliers (e.g. 1x, 2x)
    .replace(/\b1x\s+/gi, 'una porción de ')
    .replace(/\b2x\s+/gi, 'dos porciones de ')
    .replace(/\b3x\s+/gi, 'tres porciones de ')
    // Currency conversions to natural words
    .replace(/\$\s*([0-9]{1,3})\.000\s*(?:COP|cop|pesos)?/gi, '$1 mil pesos')
    .replace(/\$\s*([0-9]{1,3})\.500\s*(?:COP|cop|pesos)?/gi, '$1 mil quinientos pesos')
    .replace(/\$\s*([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)?/gi, '$1 pesos')
    .replace(/([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)/gi, '$1 pesos')
    .replace(/\$/g, '')
    .replace(/\bd[oó]lares\b/gi, 'pesos')
    .replace(/\bd[oó]lar\b/gi, 'peso')
    .replace(/([0-9]+)\.000\s*pesos/gi, '$1 mil pesos')
    .replace(/([0-9]+)\.500\s*pesos/gi, '$1 mil quinientos pesos')
    .replace(/([0-9]+)\.([0-9]{3})\s*pesos/gi, '$1 mil $2 pesos')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate OpenAI Text-to-Speech (Powered by OpenAI with voice "marin")
export async function generateOpenAITTS(openai: OpenAI, text: string): Promise<{ audio: string; mimeType: string }> {
  const cleanText = convertNumbersToNaturalSpokenSpanish(text).substring(0, 500);

  const candidateTTSModels = [
    "gpt-4o-mini-tts",
    "gpt-4o-mini-audio-preview",
    "tts-1"
  ];

  let lastErr: any = null;
  for (const modelName of candidateTTSModels) {
    try {
      const mp3Response = await openai.audio.speech.create({
        model: modelName as any,
        voice: "marin" as any,
        input: cleanText,
        response_format: "mp3",
        speed: 1.0
      });

      const buffer = Buffer.from(await mp3Response.arrayBuffer());
      return {
        audio: buffer.toString('base64'),
        mimeType: 'audio/mp3'
      };
    } catch (err: any) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("Failed to generate OpenAI TTS");
}

// Process voice assistant message using OpenAI ChatGPT (GPT-4o / GPT-4o-mini)
export async function processOpenAIVoiceAssistantMessage(
  openai: OpenAI,
  userMessage: string,
  history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [],
  context: VoiceAssistantContext
) {
  let { products = [], stores = [], cart = [], deliveryFee = 4000, recentOrders = [] } = context;

  // Filter open stores strictly: isClosed === true means CLOSED; isClosed === false means OPEN
  const openStores = stores.filter(s => s.isClosed !== true && !s.suspended);

  const openStoreUids = new Set<string>();
  const openStoreUsernames = new Set<string>();
  openStores.forEach(s => {
    if (s.uid) openStoreUids.add(s.uid);
    if (s.username) openStoreUsernames.add(s.username.toLowerCase());
  });

  const openProducts = products.filter(p => {
    if (p.active === false) return false;
    return (
      (p.userId && openStoreUids.has(p.userId)) ||
      (p.storeUsername && openStoreUsernames.has(p.storeUsername.toLowerCase()))
    );
  });

  products = openProducts;
  stores = openStores;

  const activeStoresList = openStores
    .map(s => `- ${s.displayName} (@${s.username}): ${s.bio || 'Restaurante / Tienda'}`)
    .slice(0, 25)
    .join('\n');

  const productsSample = openProducts
    .slice(0, 45)
    .map(p => `[ID: ${p.id}] ${p.name} - ${p.price.toLocaleString('es-CO')} pesos (${p.storeName || 'Tienda'}) - ${p.category || 'General'}`)
    .join('\n');

  const cartItemsSummary = cart.length > 0 
    ? cart.map(c => `- ${c.quantity}x ${c.name} (${(c.price * c.quantity).toLocaleString('es-CO')} pesos)`).join('\n')
    : 'El carrito está actualmente vacío.';

  const systemPrompt = `Eres "IAMesero" (iamesero), el mesero y asistente virtual inteligente con Inteligencia Artificial de LinnkPro.Store.
Hablas con una voz cálida, humana, amable y natural, con acento cordial colombiano.
Tu propósito es atender a los clientes en su mesa o domicilio, recomendar platos deliciosos de los restaurantes disponibles, responder dudas y tomar sus pedidos de manera fluida y conversacional.

ESTILO DE VOZ Y CONVERSACIÓN:
- Habla como una persona real: amable, atenta, espontánea y con calidez ("¡Hola! Qué gusto saludarte", "¡Con mucho gusto!", "Te cuento que tenemos...", "¡Quedó listo en tu carrito!").
- Respuestas breves y sonoras: de 1 a 3 frases claras y agradables de escuchar.
- No uses listas infinitas, viñetas ni símbolos raros que suenen robóticos al hablarse.

REGLAS FUNDAMENTALES Y OBLIGATORIAS:
1. DIRECTIVA OBLIGATORIA DE CATÁLOGO DISPONIBLE (availableCatalog):
   - Solo puedes recomendar, mencionar, agregar al carrito o vender productos presentes en availableCatalog.
   - Si un producto no aparece en availableCatalog, debes asumir que actualmente no está disponible.
   - NUNCA inventes productos, precios, ingredientes ni disponibilidad.
   - NUNCA menciones, recomiendes ni vendas productos pertenecientes a tiendas cerradas (isClosed === true).
2. DISPONIBILIDAD:
   - Tienes acceso a los restaurantes y tiendas activas listadas abajo.
   - Si el usuario pregunta qué restaurantes o tiendas están abiertos, responde mencionando los nombres de los restaurantes disponibles (ej: "${openStores.map(s => s.displayName).slice(0, 3).join(', ') || 'nuestros restaurantes afiliados'}") y pregúntale qué se le antoja comer hoy.
3. MONEDA Y PRECIOS:
   - La moneda oficial es PESOS COLOMBIANOS (COP).
   - NUNCA uses el símbolo '$' ni digas 'dólares'. Di y escribe siempre 'pesos' (ej: "15.000 pesos", "veinte mil pesos").
3. NUNCA inventes productos ni precios que no existan en las herramientas del catálogo.
4. Para buscar platos usa 'search_products_and_stores' o 'list_open_restaurants'.
5. Para agregar usa 'add_to_cart'.
6. Para pedir:
   - Solicita o confirma los datos de entrega (Nombre, Teléfono, Dirección y Método de Pago).
   - Llama a 'request_order_confirmation' para que el cliente revise.
   - Llama a 'create_order' solo cuando el cliente dé confirmación final ("Sí, confirma", "Haz el pedido").

INFORMACIÓN ACTUAL DE LA PLATAFORMA:
Tiendas y Restaurantes Abiertos:
${activeStoresList || 'Restaurantes de LinnkPro'}

Catálogo disponible:
${productsSample || 'Consulta mediante herramientas.'}

Carrito actual:
${cartItemsSummary}

Valor de domicilio base: ${deliveryFee.toLocaleString('es-CO')} pesos.`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Append history
  if (history && history.length > 0) {
    for (const h of history.slice(-6)) {
      const text = h.parts?.map((p: any) => p.text).join(' ').trim();
      if (text) {
        messages.push({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: text
        });
      }
    }
  }

  // Current user message
  messages.push({ role: 'user', content: userMessage });

  const executedActions: any[] = [];
  let responseText = '';

  let completion: any = null;
  let lastOpenAIError: any = null;

  try {
    const candidateModels = ['gpt-4o-mini', 'gpt-4o'];

    for (const model of candidateModels) {
      try {
        completion = await openai.chat.completions.create({
          model,
          messages,
          tools: openAITools,
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 300
        });
        if (completion && completion.choices?.[0]?.message) {
          break;
        }
      } catch (mErr: any) {
        lastOpenAIError = mErr;
        // If quota/rate limit error (429), avoid trying next OpenAI model since whole account has no credits
        if (mErr?.status === 429 || mErr?.code === 'insufficient_quota' || mErr?.message?.includes('credits') || mErr?.message?.includes('429')) {
          throw mErr;
        }
      }
    }

    if (!completion || !completion.choices?.[0]?.message) {
      if (lastOpenAIError) {
        throw lastOpenAIError;
      }
      throw new Error("No OpenAI completion choices available");
    }

    const message = completion.choices[0].message;

    // If ChatGPT decided to call tools
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolMessages: any[] = [...messages, message];

      for (const toolCall of message.tool_calls) {
        const funcName = toolCall.function.name;
        let args: any = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {}

        const toolRes = executeAssistantToolCall(funcName, args, {
          products,
          stores,
          cart,
          deliveryFee,
          recentOrders
        });

        if (toolRes.action) {
          executedActions.push(toolRes.action);
        }

        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolRes.resultText || 'Ejecutado con éxito.'
        });
      }

      // Ask ChatGPT for final natural conversational voice reply given the tool results
      try {
        const secondCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: toolMessages,
          temperature: 0.7,
          max_tokens: 250
        });
        responseText = secondCompletion.choices?.[0]?.message?.content || '';
      } catch (err) {
        console.warn("Second completion for ChatGPT tools failed:", err);
      }
    } else {
      responseText = message.content || '';
    }

    if (!responseText) {
      responseText = message.content || '';
    }
  } catch (err: any) {
    if (err?.status === 429 || err?.code === 'insufficient_quota' || err?.message?.includes('credits') || err?.message?.includes('429')) {
      // Re-throw so the server router can immediately switch to Gemini
      throw err;
    }
    console.warn("OpenAI ChatGPT execution warning:", err?.message || err);
    return handleLocalHeuristicResponse(userMessage, products, stores, cart, deliveryFee);
  }

  if (!responseText) {
    const heuristic = handleLocalHeuristicResponse(userMessage, products, stores, cart, deliveryFee);
    return { ...heuristic, engine: 'chatgpt_heuristic' };
  }

  const speechText = responseText
    .replace(/\$\s*([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)?/gi, '$1 pesos')
    .replace(/([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)/gi, '$1 pesos')
    .replace(/\$/g, '')
    .replace(/\bd[oó]lares\b/gi, 'pesos')
    .replace(/\bd[oó]lar\b/gi, 'peso')
    .replace(/[*_#`~]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/([0-9]+)\.000\s*pesos/gi, '$1 mil pesos')
    .replace(/([0-9]+)\.500\s*pesos/gi, '$1 mil quinientos pesos')
    .trim();

  return {
    text: responseText,
    speechText,
    actions: executedActions,
    engine: 'chatgpt'
  };
}

export const DEFAULT_PLATFORM_STORES: CatalogStore[] = [];

export const DEFAULT_PLATFORM_PRODUCTS: CatalogProduct[] = [];

export async function processVoiceAssistantMessage(
  ai: GoogleGenAI,
  userMessage: string,
  history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [],
  context: VoiceAssistantContext
) {
  let { products = [], stores = [], cart = [], deliveryFee = 4000, recentOrders = [] } = context;

  // Filter only currently open stores strictly: isClosed === true means CLOSED; isClosed === false means OPEN
  const openStores = stores.filter(s => s.isClosed !== true && !s.suspended);


  const openStoreUids = new Set<string>();
  const openStoreUsernames = new Set<string>();
  openStores.forEach(s => {
    if (s.uid) openStoreUids.add(s.uid);
    if (s.username) openStoreUsernames.add(s.username.toLowerCase());
  });

  const openProducts = products.filter(p => {
    if (p.active === false) return false;
    return (
      (p.userId && openStoreUids.has(p.userId)) ||
      (p.storeUsername && openStoreUsernames.has(p.storeUsername.toLowerCase()))
    );
  });

  // Ensure all downstream tool invocations and heuristics operate on open catalog
  products = openProducts;
  stores = openStores;

  // Build summary of stores and key products to prime the model
  const activeStoresList = openStores
    .map(s => `- ${s.displayName} (@${s.username}): ${s.bio || 'Restaurante / Tienda'}`)
    .slice(0, 30)
    .join('\n');

  const productsSample = openProducts
    .slice(0, 50)
    .map(p => `[ID: ${p.id}] ${p.name} - ${p.price.toLocaleString('es-CO')} pesos (${p.storeName || 'Tienda'}) - ${p.category || 'General'}`)
    .join('\n');

  const cartItemsSummary = cart.length > 0 
    ? cart.map(c => `- ${c.quantity}x ${c.name} (${(c.price * c.quantity).toLocaleString('es-CO')} pesos)`).join('\n')
    : 'El carrito está actualmente vacío.';

  const systemInstruction = `Eres "IAMesero" (iamesero), el mesero y asistente virtual por voz de LinnkPro.Store. Hablas con una voz cálida, humana, amable y natural, con acento cordial colombiano.
Tu propósito es atender a los clientes en su mesa o domicilio, recomendar platos deliciosos de los restaurantes disponibles, responder dudas y tomar sus pedidos de manera fluida y conversacional.

ESTILO DE VOZ Y CONVERSACIÓN HUMANA:
- Habla como una persona real: amable, atenta, espontánea y con calidez ("¡Hola! Qué gusto saludarte", "¡Con mucho gusto!", "Te cuento que tenemos...", "¡Quedó listo en tu carrito!").
- Respuestas breves y sonoras: de 1 a 3 frases claras y agradables de escuchar.
- No uses listas infinitas, viñetas ni símbolos raros que suenen robóticos al hablarse. Menciona 2 o 3 opciones destacadas y pregunta al usuario cuál prefiere.

REGLAS FUNDAMENTALES Y OBLIGATORIAS:
1. DISPONIBILIDAD DE TIENDAS Y RESTAURANTES:
   - Tienes acceso a los restaurantes y tiendas activas en la lista inferior.
   - Si el usuario pregunta qué restaurantes o tiendas están abiertos, responde con entusiasmo mencionando los nombres de los restaurantes disponibles (por ejemplo: "${openStores.map(s => s.displayName).slice(0, 3).join(', ') || 'nuestros restaurantes afiliados'}") y pregúntale qué se le antoja comer hoy.
   - Si hay productos o tiendas disponibles, NUNCA digas que no hay restaurantes abiertos.
2. MONEDA Y PRECIOS (ESTRICTO):
   - La moneda oficial es PESOS COLOMBIANOS (COP).
   - NUNCA uses el símbolo de dólar '$' ni digas la palabra 'dólares'.
   - Siempre di y escribe la palabra 'pesos' (por ejemplo: "cuesta doce mil pesos", "25.000 pesos", "por solo quince mil pesos").
3. NUNCA inventes productos, restaurantes, precios ni pedidos. Utiliza SIEMPRE las funciones/herramientas provistas para consultar los datos reales de la plataforma.
4. Si el usuario pide algo genérico como "Quiero una hamburguesa", "¿Qué hay de comer?" o "¿Qué restaurantes hay abiertos?", usa las herramientas para encontrar opciones reales, responde mencionando los platos y precios exactos en pesos, y ofrécele agregarlos a su carrito.
5. Si el usuario te pide agregar al carrito ("agrega una", "quiero 2 hamburguesas"), llama a 'add_to_cart'.
6. Si el usuario pregunta qué tiene en el carrito, llama a 'get_cart'.
7. Para realizar un pedido:
   - Primero pide o confirma con el usuario sus datos de entrega: Nombre, Teléfono, Dirección y Método de Pago (Efectivo contra entrega o Transferencia).
   - Llama a 'request_order_confirmation' para presentar el resumen.
   - NUNCA llames a 'create_order' hasta que el usuario dé una confirmación explícita (ej: "Sí, confirmo", "Haz el pedido", "Adelante").
8. Si el usuario consulta cómo va su pedido, usa 'get_order_status'.

INFORMACIÓN ACTUAL DE LA PLATAFORMA:
Tiendas y Restaurantes Abiertos:
${activeStoresList || 'Restaurantes de LinnkPro'}

Catálogo disponible de tiendas abiertas:
${productsSample || 'Consulta mediante herramientas.'}

Carrito actual del usuario:
${cartItemsSummary}

Valor de domicilio base: ${deliveryFee.toLocaleString('es-CO')} pesos.`;

  // Build contents with strictly valid role alternation starting with 'user'
  const contentsPayload: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  if (history && history.length > 0) {
    for (const h of history.slice(-6)) {
      if ((h.role === 'user' || h.role === 'model') && Array.isArray(h.parts)) {
        const textPart = h.parts.map((p: any) => p?.text || '').join(' ').trim();
        if (textPart) {
          // If first message is 'model', skip it so conversation starts with 'user'
          if (contentsPayload.length === 0 && h.role === 'model') {
            continue;
          }
          // If consecutive role is identical to previous, merge parts
          if (contentsPayload.length > 0 && contentsPayload[contentsPayload.length - 1].role === h.role) {
            contentsPayload[contentsPayload.length - 1].parts[0].text += `\n${textPart}`;
          } else {
            contentsPayload.push({
              role: h.role,
              parts: [{ text: textPart }]
            });
          }
        }
      }
    }
  }

  // Ensure latest user message is appended cleanly without consecutive 'user' roles
  const cleanUserMsg = userMessage.trim();
  if (contentsPayload.length > 0 && contentsPayload[contentsPayload.length - 1].role === 'user') {
    contentsPayload[contentsPayload.length - 1].parts[0].text += `\n${cleanUserMsg}`;
  } else {
    contentsPayload.push({
      role: 'user',
      parts: [{ text: cleanUserMsg }]
    });
  }

  // Prioritize stable production models with immediate fallback on 503 (high demand) or 429 (rate limits)
  const candidateModels = [
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.1-pro-preview'
  ];
  let response: any = null;
  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      response = await ai.models.generateContent({
        model: modelName,
        contents: contentsPayload,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: assistantTools }],
          temperature: 0.7,
        }
      });
      if (response && response.text) break;
    } catch (err: any) {
      lastError = err;
      const isUnavailable = err?.status === 503 || err?.code === 503 || err?.message?.includes('503') || err?.message?.includes('high demand') || err?.message?.includes('UNAVAILABLE');
      const isRateLimit = err?.status === 429 || err?.code === 429 || err?.message?.includes('429') || err?.message?.includes('quota');
      
      if (isUnavailable || isRateLimit) {
        console.warn(`Voice assistant model ${modelName} temporarily busy (${isUnavailable ? '503 High Demand' : '429 Rate Limit'}). Switching immediately to next available model...`);
      } else {
        console.warn(`Voice assistant model ${modelName} error:`, err?.message || err);
      }
    }
  }

  // If all remote models hit demand peaks (503/429) or failed, do graceful local NLP heuristic handling instantly
  if (!response || !response.text) {
    return handleLocalHeuristicResponse(userMessage, products, stores, cart, deliveryFee);
  }

  let responseText = response.text || '';
  const executedActions: any[] = [];
  const functionCalls = response.functionCalls;

  // Handle function calls if model chose to invoke tools
  if (functionCalls && functionCalls.length > 0) {
    for (const fc of functionCalls) {
      const callName = fc.name;
      const args: any = fc.args || {};

      if (callName === 'search_products_and_stores') {
        const queryTerm = (args.query || '').toLowerCase().trim();
        const storeTerm = (args.storeName || '').toLowerCase().trim();
        const categoryTerm = (args.category || '').toLowerCase().trim();

        const rawTokens = queryTerm.split(/\s+/).map((t: string) => t.replace(/[^a-záéíóúüñ0-9]/gi, '')).filter((t: string) => t.length >= 3);

        const matches = products.filter(p => {
          if (p.active === false) return false;
          const pName = (p.name || '').toLowerCase();
          const pDesc = (p.description || '').toLowerCase();
          const pCat = (p.category || '').toLowerCase();
          const pStore = (p.storeName || '').toLowerCase();

          const exactMatch = queryTerm ? (pName.includes(queryTerm) || pDesc.includes(queryTerm) || pCat.includes(queryTerm)) : true;
          const tokenMatch = rawTokens.some((tok: string) => {
            const singular = tok.endsWith('s') ? tok.slice(0, -1) : tok;
            return pName.includes(tok) || pName.includes(singular) ||
                   pDesc.includes(tok) || pDesc.includes(singular) ||
                   pCat.includes(tok) || pCat.includes(singular);
          });

          const matchCat = categoryTerm ? pCat.includes(categoryTerm) : true;
          const matchStore = storeTerm ? pStore.includes(storeTerm) : true;
          return (exactMatch || tokenMatch) && matchCat && matchStore;
        });

        // Also find matching stores
        const matchingStores = stores.filter(s => 
          !s.isClosed && (s.displayName.toLowerCase().includes(queryTerm) || s.username.toLowerCase().includes(queryTerm))
        );

        executedActions.push({
          type: 'PRODUCTS_SEARCHED',
          query: args.query,
          results: (matches.length > 0 ? matches : products).slice(0, 10),
          stores: matchingStores.slice(0, 5)
        });

        if (!responseText) {
          if (matches.length > 0) {
            const topNames = matches.slice(0, 3).map(m => `${m.name} por ${m.price.toLocaleString('es-CO')} pesos en ${m.storeName || 'la tienda'}`).join(', ');
            responseText = `Encontré ${matches.length} opción(es) para "${args.query}": ${topNames}. ¿Te gustaría que agregue alguna a tu carrito?`;
          } else if (products.length > 0) {
            const topGeneral = products.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos en ${p.storeName || 'el restaurante'}`).join(', ');
            responseText = `Tenemos deliciosos platos disponibles como: ${topGeneral}. ¿Cuál te gustaría ordenar?`;
          } else {
            responseText = `No encontré platos activos de tiendas abiertas en este momento. ¿Deseas consultar nuestras tiendas registradas?`;
          }
        }
      } 
      else if (callName === 'list_open_restaurants') {
        executedActions.push({
          type: 'OPEN_STORES_LISTED',
          stores: stores.slice(0, 10)
        });

        if (!responseText) {
          if (stores.length > 0) {
            const storeNames = stores.slice(0, 4).map(s => s.displayName).join(', ');
            responseText = `Tenemos abiertos restaurantes como ${storeNames}. ¿Cuál te gustaría ver o qué se te antoja ordenar?`;
          } else {
            responseText = `Puedes consultar nuestras tiendas y productos en la plataforma LinnkPro. ¿Qué deseas ordenar?`;
          }
        }
      }
      else if (callName === 'get_product_details') {
        const term = (args.productIdOrName || '').toLowerCase();
        const found = products.find(p => p.id === args.productIdOrName || p.name.toLowerCase().includes(term));
        executedActions.push({
          type: 'PRODUCT_DETAILS',
          product: found || null
        });

        if (!responseText) {
          if (found) {
            responseText = `${found.name} cuesta ${found.price.toLocaleString('es-CO')} pesos en ${found.storeName || 'la tienda'}. ${found.description || ''}. ¿Deseas agregarlo a tu pedido?`;
          } else {
            responseText = `No encontré los detalles de ese producto. ¿Deseas buscar otro?`;
          }
        }
      }
      else if (callName === 'get_restaurant_menu') {
        const term = (args.storeNameOrUsername || '').toLowerCase();
        const targetStore = stores.find(s => 
          s.displayName.toLowerCase().includes(term) || s.username.toLowerCase().includes(term) || s.uid === term
        );
        const storeProducts = targetStore 
          ? products.filter(p => p.userId === targetStore.uid && p.active !== false)
          : [];

        executedActions.push({
          type: 'RESTAURANT_MENU',
          store: targetStore || null,
          products: storeProducts
        });

        if (!responseText) {
          if (targetStore) {
            responseText = `El restaurante ${targetStore.displayName} tiene ${storeProducts.length} productos en su menú. ¿Deseas verlos o pedir alguno?`;
          } else {
            responseText = `No encontré el restaurante solicitado. Puedes consultar los restaurantes abiertos en la plataforma.`;
          }
        }
      }
      else if (callName === 'get_cart') {
        const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
        executedActions.push({
          type: 'CART_SUMMARY',
          cart,
          totalAmount,
          itemCount
        });

        if (!responseText) {
          if (itemCount === 0) {
            responseText = `Tu carrito de compras está actualmente vacío. Dime qué se te antoja y lo agrego de inmediato.`;
          } else {
            responseText = `Tienes ${itemCount} producto(s) en tu carrito con un subtotal de ${totalAmount.toLocaleString('es-CO')} pesos. ¿Deseas agregar algo más o confirmar tu pedido?`;
          }
        }
      }
      else if (callName === 'add_to_cart') {
        const targetProduct = products.find(p => p.id === args.productId || p.name.toLowerCase().includes((args.productId || '').toLowerCase()));
        if (targetProduct) {
          executedActions.push({
            type: 'ADD_TO_CART',
            product: targetProduct,
            quantity: args.quantity || 1,
            variant: args.variant
          });

          if (!responseText) {
            responseText = `¡Listo! Agregué ${args.quantity || 1} ${targetProduct.name} a tu carrito por ${targetProduct.price.toLocaleString('es-CO')} pesos. ¿Deseas algo más o procedemos con la entrega?`;
          }
        } else if (!responseText) {
          responseText = `No pude encontrar el producto exacto para agregar al carrito. ¿Puedes repetirme el nombre?`;
        }
      }
      else if (callName === 'update_cart_quantity') {
        executedActions.push({
          type: 'UPDATE_CART_QUANTITY',
          productId: args.productId,
          quantity: args.quantity
        });

        if (!responseText) {
          responseText = `He actualizado la cantidad en tu carrito.`;
        }
      }
      else if (callName === 'remove_from_cart') {
        executedActions.push({
          type: 'REMOVE_FROM_CART',
          productId: args.productId
        });

        if (!responseText) {
          responseText = `Eliminé el producto de tu carrito.`;
        }
      }
      else if (callName === 'clear_cart') {
        executedActions.push({
          type: 'CLEAR_CART'
        });

        if (!responseText) {
          responseText = `He vaciado tu carrito de compras.`;
        }
      }
      else if (callName === 'request_order_confirmation') {
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const storesSet = new Set(cart.map(i => i.userId));
        const totalDelivery = storesSet.size * deliveryFee;
        const grandTotal = subtotal + totalDelivery;

        executedActions.push({
          type: 'ORDER_CONFIRMATION_REQUESTED',
          orderProposal: {
            customerName: args.customerName,
            customerPhone: args.customerPhone,
            customerAddress: args.customerAddress,
            paymentMethod: args.paymentMethod || 'delivery_cash',
            notes: args.notes || '',
            items: cart,
            subtotal,
            deliveryFee: totalDelivery,
            grandTotal,
            storesCount: storesSet.size
          }
        });

        if (!responseText) {
          responseText = `He preparado el resumen de tu pedido por un total de ${grandTotal.toLocaleString('es-CO')} pesos para entrega a nombre de ${args.customerName || 'Cliente'}. ¿Confirmas el pedido?`;
        }
      }
      else if (callName === 'create_order') {
        if (args.isConfirmed) {
          const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          const storesSet = new Set(cart.map(i => i.userId));
          const totalDelivery = storesSet.size * deliveryFee;
          const grandTotal = subtotal + totalDelivery;

          executedActions.push({
            type: 'ORDER_CREATE_CONFIRMED',
            orderData: {
              customerName: args.customerName,
              customerPhone: args.customerPhone,
              customerAddress: args.customerAddress,
              paymentMethod: args.paymentMethod || 'delivery_cash',
              notes: args.notes || '',
              items: cart,
              subtotal,
              deliveryFee: totalDelivery,
              grandTotal
            }
          });

          if (!responseText) {
            responseText = `¡Excelente! Tu pedido ha sido confirmado con éxito. El restaurante iniciará la preparación de inmediato.`;
          }
        }
      }
      else if (callName === 'get_order_status') {
        let matchedOrder = null;
        if (args.orderNumber) {
          matchedOrder = recentOrders.find(o => o.orderNumber === args.orderNumber);
        }
        if (!matchedOrder && args.customerPhone) {
          matchedOrder = recentOrders.find(o => (o.customerPhone || '').includes(args.customerPhone));
        }
        if (!matchedOrder && recentOrders.length > 0) {
          matchedOrder = recentOrders[0];
        }

        executedActions.push({
          type: 'ORDER_STATUS_RESULT',
          order: matchedOrder || null
        });

        if (!responseText) {
          if (matchedOrder) {
            responseText = `Tu pedido #${matchedOrder.orderNumber} se encuentra en estado "${matchedOrder.status}". ${matchedOrder.deliveryDriverName ? `Tu repartidor es ${matchedOrder.deliveryDriverName}.` : ''}`;
          } else {
            responseText = `No encontré pedidos recientes asociados a ese número o teléfono.`;
          }
        }
      }
      else if (callName === 'navigate_to_store') {
        executedActions.push({
          type: 'NAVIGATE_TO_STORE',
          storeUsername: args.storeUsername
        });

        if (!responseText) {
          responseText = `Navegando al restaurante @${args.storeUsername}...`;
        }
      }
    }
  }

  if (!responseText) {
    responseText = `¡Hola! Con gusto te ayudo. Puedes pedirme platos, consultar menús de restaurantes o pedir lo que desees.`;
  }

  // Clean speech text for TTS audio, converting dollar symbols/words strictly into pesos
  const speechText = responseText
    .replace(/\$\s*([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)?/gi, '$1 pesos')
    .replace(/([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)/gi, '$1 pesos')
    .replace(/\$/g, '')
    .replace(/\bd[oó]lares\b/gi, 'pesos')
    .replace(/\bd[oó]lar\b/gi, 'peso')
    .replace(/[*_#`~]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();

  return {
    text: responseText,
    speechText,
    actions: executedActions,
    functionCalls: functionCalls || []
  };
}

/**
 * Fallback heuristic processor when remote AI APIs are rate limited or temporarily unreachable.
 * Ensures the user can still search products, add items to cart, check cart, and make orders smoothly.
 */
export function processFallbackVoiceAssistantMessage(
  userMessage: string,
  history: any[] = [],
  context: VoiceAssistantContext
) {
  const { products = [], stores = [], cart = [], deliveryFee = 4000 } = context;

  return handleLocalHeuristicResponse(userMessage, products, stores, cart, deliveryFee);
}

function handleLocalHeuristicResponse(
  userMessage: string,
  rawProducts: any[],
  rawStores: any[],
  cart: any[],
  deliveryFee: number
) {
  let stores = (rawStores || []).filter((s: any) => !s.isClosed);
  if (stores.length === 0 && (rawStores || []).length > 0) {
    stores = rawStores;
  }

  // If stores list was empty but products are provided, infer open stores
  if (stores.length === 0 && (rawProducts || []).length > 0) {
    const storeMap = new Map<string, any>();
    (rawProducts || []).forEach((p: any) => {
      if (p.active !== false) {
        const sKey = p.userId || p.storeUsername || p.storeName || 'tienda';
        if (!storeMap.has(sKey)) {
          storeMap.set(sKey, {
            uid: p.userId || sKey,
            username: p.storeUsername || sKey,
            displayName: p.storeName || p.storeUsername || 'Restaurante',
            bio: 'Restaurante y tienda oficial en LinnkPro',
            isClosed: false
          });
        }
      }
    });
    stores = Array.from(storeMap.values());
  }

  const openStoreUids = new Set<string>();
  stores.forEach((s: any) => {
    if (s.uid) openStoreUids.add(s.uid);
    if (s.username) openStoreUids.add(s.username.toLowerCase());
    if (s.displayName) openStoreUids.add(s.displayName.toLowerCase());
  });

  const products = (rawProducts || []).filter((p: any) => {
    if (p.active === false) return false;
    if (stores.length === 0) return true;
    if (!p.userId && !p.storeUsername && !p.storeName) return true;
    return (
      (p.userId && openStoreUids.has(p.userId)) ||
      (p.storeUsername && openStoreUids.has(p.storeUsername.toLowerCase())) ||
      (p.storeName && openStoreUids.has(p.storeName.toLowerCase())) ||
      openStoreUids.size === 0
    );
  });

  const lower = userMessage.toLowerCase().trim();
  const executedActions: any[] = [];
  let responseText = '';

  // 0. Query about open restaurants or stores
  if (
    (lower.includes('restaurante') || lower.includes('tienda') || lower.includes('local') || lower.includes('negocio') || lower.includes('lugar')) &&
    (lower.includes('abierto') || lower.includes('hay') || lower.includes('cuales') || lower.includes('cuáles') || lower.includes('disponible') || lower.includes('lista') || lower.includes('ver') || lower.includes('mostrar') || lower.includes('abiertos'))
  ) {
    executedActions.push({
      type: 'OPEN_STORES_LISTED',
      stores: stores.slice(0, 8)
    });
    if (stores.length > 0) {
      const topStores = stores.slice(0, 4).map((s: any) => s.displayName).join(', ');
      responseText = `Actualmente tenemos abiertos restaurantes como: ${topStores}. ¿Deseas ver el menú de alguno o te gustaría ordenar algo en particular?`;
    } else if (products.length > 0) {
      const topProds = products.slice(0, 3).map((p: any) => `${p.name} en ${p.storeName || 'nuestra tienda'}`).join(', ');
      responseText = `Tenemos deliciosos platos listos para ti como: ${topProds}. ¿Te gustaría que agregue alguno a tu pedido?`;
    } else {
      responseText = `Tenemos varios restaurantes afiliados en LinnkPro. ¿Qué te gustaría comer hoy?`;
    }
  }
  // 1. Check cart request
  else if (lower.includes('carrito') || lower.includes('que tengo') || lower.includes('qué tengo') || lower.includes('mis platos') || lower.includes('ver orden')) {
    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    executedActions.push({
      type: 'CART_SUMMARY',
      cart,
      totalAmount,
      itemCount
    });

    if (cart.length === 0) {
      responseText = 'Tu carrito de compras está vacío actualmente. Puedes pedirme hamburguesas, pizzas, pollo o consultar los menús disponibles.';
    } else {
      const itemsList = cart.map(i => `${i.quantity}x ${i.name}`).join(', ');
      responseText = `Tienes ${itemCount} plato(s) en tu carrito: ${itemsList}. Subtotal: ${totalAmount.toLocaleString('es-CO')} pesos. ¿Deseas confirmar tu pedido?`;
    }
  }
  // 2. Add to cart request (e.g. "quiero una hamburguesa", "agrega 2 pizzas")
  else if (lower.includes('quiero') || lower.includes('agrega') || lower.includes('pedir') || lower.includes('ordenar') || lower.includes('añade') || lower.includes('dame')) {
    // Extract quantity if mentioned
    let qty = 1;
    const matchNum = lower.match(/\b(\d+)\b/);
    if (matchNum) {
      qty = parseInt(matchNum[1], 10);
    } else if (lower.includes('dos') || lower.includes('2')) {
      qty = 2;
    } else if (lower.includes('tres') || lower.includes('3')) {
      qty = 3;
    }

    // Find best product match
    const candidate = products.find(p => {
      if (p.active === false) return false;
      const pName = (p.name || '').toLowerCase();
      const pWords = pName.split(/\s+/);
      return pWords.some(w => w.length > 3 && lower.includes(w)) || lower.includes(pName);
    });

    if (candidate) {
      executedActions.push({
        type: 'ADD_TO_CART',
        product: candidate,
        quantity: qty
      });
      responseText = `¡Listo! He agregado ${qty} ${candidate.name} a tu carrito (${(candidate.price * qty).toLocaleString('es-CO')} pesos). ¿Deseas algo más o quieres confirmar tu pedido?`;
    } else {
      // Search matching products
      const searchMatches = products.filter(p => p.active !== false && (
        lower.includes((p.name || '').toLowerCase()) || 
        (p.name || '').toLowerCase().split(/\s+/).some((w: string) => w.length > 3 && lower.includes(w)) ||
        (p.category && lower.includes(p.category.toLowerCase()))
      ));

      if (searchMatches.length > 0) {
        executedActions.push({
          type: 'PRODUCTS_SEARCHED',
          query: userMessage,
          results: searchMatches.slice(0, 5),
          stores: []
        });
        const names = searchMatches.slice(0, 3).map(m => `${m.name} por ${m.price.toLocaleString('es-CO')} pesos en ${m.storeName || 'tienda'}`).join(', ');
        responseText = `Encontré estas opciones disponibles: ${names}. ¿Cuál de ellos deseas que agregue a tu carrito?`;
      } else if (products.length > 0) {
        const topAvailable = products.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos en ${p.storeName || 'tienda'}`).join(', ');
        responseText = `Tenemos deliciosos platos disponibles como: ${topAvailable}. ¿Cuál te gustaría ordenar?`;
      } else {
        responseText = `No encontré platos activos de tiendas abiertas en este momento. Por favor revisa nuestras tiendas disponibles.`;
      }
    }
  }
  // 3. Search / Menu queries (pollo, pizza, hamburguesa, comidas, etc.)
  else if (
    lower.includes('pizza') || 
    lower.includes('hamburguesa') || 
    lower.includes('pollo') || 
    lower.includes('pechuga') || 
    lower.includes('alita') || 
    lower.includes('broaster') || 
    lower.includes('asado') || 
    lower.includes('salchipapa') || 
    lower.includes('perro') || 
    lower.includes('carne') || 
    lower.includes('bebida') || 
    lower.includes('sushi') || 
    lower.includes('menu') || 
    lower.includes('menú') || 
    lower.includes('platos') || 
    lower.includes('restaurantes') ||
    lower.includes('comida') ||
    lower.includes('comer')
  ) {
    const rawTokens = lower.split(/\s+/).map((t: string) => t.replace(/[^a-záéíóúüñ0-9]/gi, '')).filter((t: string) => t.length >= 3);

    const searchMatches = products.filter(p => {
      if (p.active === false) return false;
      const pName = (p.name || '').toLowerCase();
      const pCat = (p.category || '').toLowerCase();
      const pDesc = (p.description || '').toLowerCase();

      // Check specific food concepts
      if (lower.includes('pollo') || lower.includes('pollos')) {
        if (pName.includes('pollo') || pCat.includes('pollo') || pDesc.includes('pollo') || pName.includes('pechuga') || pName.includes('alitas') || pName.includes('broaster')) {
          return true;
        }
      }
      if (lower.includes('hamburguesa') || lower.includes('burger')) {
        if (pName.includes('hamburguesa') || pCat.includes('hamburguesa') || pName.includes('burger') || pDesc.includes('angus')) {
          return true;
        }
      }
      if (lower.includes('pizza')) {
        if (pName.includes('pizza') || pCat.includes('pizza')) {
          return true;
        }
      }

      // Token matching
      const tokenMatch = rawTokens.some((tok: string) => {
        const singular = tok.endsWith('s') ? tok.slice(0, -1) : tok;
        return pName.includes(tok) || pName.includes(singular) ||
               pDesc.includes(tok) || pDesc.includes(singular) ||
               pCat.includes(tok) || pCat.includes(singular);
      });

      return tokenMatch || lower.includes(pName);
    });

    const finalResults = searchMatches.length > 0 ? searchMatches : products;

    executedActions.push({
      type: 'PRODUCTS_SEARCHED',
      query: userMessage,
      results: finalResults.slice(0, 8),
      stores: stores.slice(0, 4)
    });

    if (searchMatches.length > 0) {
      const topItems = searchMatches.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos en ${p.storeName || 'el restaurante'}`).join(', ');
      responseText = `Encontré ${searchMatches.length} opción(es) disponibles: ${topItems}. ¿Te gustaría que agregue alguna a tu pedido?`;
    } else if (products.length > 0) {
      const topGeneral = products.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos en ${p.storeName || 'el restaurante'}`).join(', ');
      responseText = `Tenemos deliciosos platos disponibles como: ${topGeneral}. ¿Cuál te gustaría ordenar?`;
    } else {
      responseText = `No encontré platos disponibles de tiendas abiertas en este momento. Puedes consultar más tarde o revisar nuestras tiendas.`;
    }
  }
  // 4. Confirm order request
  else if (lower.includes('confirm') || lower.includes('hacer pedido') || lower.includes('enviar pedido') || lower.includes('finalizar')) {
    if (cart.length === 0) {
      responseText = 'Tu carrito está vacío. Agrega primero los platos que deseas ordenar.';
    } else {
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const grandTotal = subtotal + deliveryFee;
      executedActions.push({
        type: 'ORDER_CONFIRMATION_REQUESTED',
        orderProposal: {
          itemsCount: cart.length,
          subtotal,
          deliveryFee,
          grandTotal,
          customerName: 'Cliente',
          customerPhone: '',
          customerAddress: 'Dirección de entrega',
          paymentMethod: 'delivery_cash'
        }
      });
      responseText = `El total de tu pedido es ${grandTotal.toLocaleString('es-CO')} pesos con domicilio incluido. Por favor confirma tus datos de entrega para enviarlo a los restaurantes.`;
    }
  }
  // 5. Default greeting & assistance
  else {
    if (products.length > 0) {
      const sample = products.slice(0, 3).map(p => `${p.name} por ${p.price.toLocaleString('es-CO')} pesos en ${p.storeName || 'el restaurante'}`).join(', ');
      responseText = `¡Hola! Soy tu asistente LinnkPro. Tenemos platos disponibles como: ${sample}. ¿Qué te gustaría ordenar hoy?`;
    } else {
      responseText = '¡Hola! Soy tu asistente LinnkPro. Puedo ayudarte a buscar platos, agregarlos a tu carrito o completar tu pedido. ¿Qué te gustaría ordenar hoy?';
    }
  }

  const speechText = responseText
    .replace(/\$\s*([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)?/gi, '$1 pesos')
    .replace(/([0-9]+(?:[.,][0-9]+)*)\s*(?:COP|cop)/gi, '$1 pesos')
    .replace(/\$/g, '')
    .replace(/\bd[oó]lares\b/gi, 'pesos')
    .replace(/\bd[oó]lar\b/gi, 'peso')
    .replace(/[*_#`~]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();

  return {
    text: responseText,
    speechText,
    actions: executedActions,
    functionCalls: []
  };
}
