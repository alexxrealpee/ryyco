/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import { z } from 'zod';
import { saveOrder } from './firebase';
import { 
  getClientAvailableCatalog, 
  validateStoreAndProductBeforeCart, 
  validateCartBeforeOrder 
} from './catalogManager';
import { 
  getStoredCart, 
  addProductToCart, 
  updateCartQuantity, 
  removeProductFromCart, 
  clearAllCart, 
  calculateCartSummary,
  GeneralCartItem
} from './cartHelper';
import { OrderItem } from '../types';

export interface RealtimeMeseroCallbacks {
  onStateChange: (state: 'idle' | 'listening' | 'processing' | 'speaking') => void;
  onTranscriptDelta: (text: string, isFinal: boolean, sender: 'user' | 'assistant') => void;
  onCartUpdated?: (cart: GeneralCartItem[]) => void;
  onOrderCreated?: (order: OrderItem) => void;
  onError?: (err: Error | string) => void;
}

export class RealtimeMeseroManager {
  private session: RealtimeSession | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private callbacks: RealtimeMeseroCallbacks;
  private isConnected: boolean = false;
  private currentAssistantTranscript: string = '';

  constructor(callbacks: RealtimeMeseroCallbacks) {
    this.callbacks = callbacks;
  }

  // Define the 12 Realtime Tools with @openai/agents tool and zod schema
  private buildTools() {
    const buscarRestaurantesTool = tool({
      name: 'buscarRestaurantes',
      description: 'Busca y lista los restaurantes y tiendas actualmente abiertas y disponibles en LinnkPro (isClosed === false).',
      parameters: z.object({
        query: z.string().optional().describe('Nombre del restaurante o tipo de cocina (ej: hamburguesas, sushi, café)')
      }),
      execute: async ({ query }) => {
        try {
          const catalog = getClientAvailableCatalog();
          const openStores = catalog.stores || [];

          let filtered = openStores;
          if (query && query.trim()) {
            const q = query.toLowerCase().trim();
            filtered = openStores.filter(s => 
              (s.displayName && s.displayName.toLowerCase().includes(q)) ||
              (s.username && s.username.toLowerCase().includes(q)) ||
              (s.bio && s.bio.toLowerCase().includes(q)) ||
              catalog.products.some(p => (p.userId === s.uid || p.storeUsername === s.username) && (p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q))))
            );
          }

          if (filtered.length === 0) {
            if (openStores.length === 0) {
              return {
                resultado: "En este momento no hay restaurantes abiertos.",
                restaurantesDisponibles: []
              };
            }
            return {
              resultado: "No encontré ese restaurante entre los abiertos actualmente.",
              restaurantesDisponibles: openStores.slice(0, 8).map(s => s.displayName || s.username)
            };
          }

          return {
            total: filtered.length,
            restaurantes: filtered.map(s => ({
              nombre: s.displayName || s.username,
              usuario: s.username,
              descripcion: s.bio || 'Restaurante asociado a LinnkPro',
              estado: 'Abierto y disponible para pedidos'
            }))
          };
        } catch (e: any) {
          return { error: "No fue posible consultar los restaurantes en este momento." };
        }
      }
    });

    const buscarProductosTool = tool({
      name: 'buscarProductos',
      description: 'Busca platos, bebidas o productos en el menú de tiendas abiertas (isClosed === false).',
      parameters: z.object({
        query: z.string().describe('Término de búsqueda (ej: hamburguesa, limonada, pizza)'),
        categoria: z.string().optional().describe('Categoría opcional')
      }),
      execute: async ({ query, categoria }) => {
        try {
          const catalog = getClientAvailableCatalog();
          const availableProducts = catalog.products || [];
          const q = query.toLowerCase().trim();
          
          let matches = availableProducts.filter(p => 
            p.active !== false && 
            (p.name.toLowerCase().includes(q) || 
             (p.description && p.description.toLowerCase().includes(q)) || 
             (p.category && p.category.toLowerCase().includes(q)))
          );

          if (categoria && categoria.trim()) {
            const c = categoria.toLowerCase().trim();
            matches = matches.filter(p => p.category && p.category.toLowerCase().includes(c));
          }

          if (matches.length === 0) {
            return {
              encontrados: 0,
              mensaje: `No encontré ningún plato disponible llamado "${query}" en las tiendas abiertas actualmente.`
            };
          }

          return {
            encontrados: matches.length,
            platos: matches.slice(0, 6).map(p => ({
              id: p.id,
              nombre: p.name,
              precio: `$${p.price.toLocaleString('es-CO')} pesos`,
              precioNumero: p.price,
              descripcion: p.description || 'Sin descripción',
              categoria: p.category || 'General',
              restaurante: p.storeName || 'Restaurante Asociado',
              disponible: true
            }))
          };
        } catch (e: any) {
          return { error: "Error al buscar los platos en el catálogo disponible." };
        }
      }
    });

    const buscarProductoTool = tool({
      name: 'buscarProducto',
      description: 'Obtiene los detalles precisos e ingredientes de un plato específico disponible en availableCatalog.',
      parameters: z.object({
        nombreOId: z.string().describe('Nombre o ID del producto')
      }),
      execute: async ({ nombreOId }) => {
        try {
          const catalog = getClientAvailableCatalog();
          const target = nombreOId.toLowerCase().trim();
          const found = catalog.products.find(p => p.id === nombreOId || p.name.toLowerCase().includes(target));

          if (!found) {
            return { 
              encontrado: false, 
              mensaje: `El plato "${nombreOId}" no se encuentra disponible actualmente en ninguna tienda abierta.` 
            };
          }

          return {
            encontrado: true,
            id: found.id,
            nombre: found.name,
            precio: `$${found.price.toLocaleString('es-CO')} pesos`,
            precioNumero: found.price,
            descripcion: found.description || 'Plato preparado al momento con los mejores ingredientes.',
            categoria: found.category || 'General',
            restaurante: found.storeName || 'Restaurante Asociado',
            disponible: true
          };
        } catch (e) {
          return { error: "Error al obtener detalles del plato." };
        }
      }
    });

    const obtenerMenuTool = tool({
      name: 'obtenerMenu',
      description: 'Obtiene el menú completo de un restaurante específico si se encuentra abierto (isClosed === false).',
      parameters: z.object({
        restaurante: z.string().describe('Nombre o nombre de usuario del restaurante')
      }),
      execute: async ({ restaurante }) => {
        try {
          const catalog = getClientAvailableCatalog();
          const rQuery = restaurante.toLowerCase().trim();
          
          const targetStore = catalog.stores.find(s => 
            (s.displayName && s.displayName.toLowerCase().includes(rQuery)) ||
            (s.username && s.username.toLowerCase().includes(rQuery))
          );

          if (!targetStore) {
            return {
              encontrado: false,
              mensaje: `El restaurante "${restaurante}" se encuentra cerrado en este momento o no está disponible.`
            };
          }

          const storeProducts = catalog.products.filter(p => 
            p.userId === targetStore.uid || 
            (p.storeUsername && p.storeUsername.toLowerCase() === targetStore.username?.toLowerCase())
          );

          return {
            restaurante: targetStore.displayName || targetStore.username,
            totalPlatos: storeProducts.length,
            menu: storeProducts.map(p => ({
              id: p.id,
              nombre: p.name,
              precio: `$${p.price.toLocaleString('es-CO')} pesos`,
              descripcion: p.description || '',
              categoria: p.category || 'General'
            }))
          };
        } catch (e) {
          return { error: "Error al consultar el menú del restaurante." };
        }
      }
    });

    const obtenerCategoriasTool = tool({
      name: 'obtenerCategorias',
      description: 'Obtiene las categorías gastronómicas disponibles de las tiendas actualmente abiertas.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const catalog = getClientAvailableCatalog();
          const catSet = new Set<string>();
          catalog.products.forEach(p => {
            if (p.category && p.category.trim()) catSet.add(p.category.trim());
          });
          const list = Array.from(catSet);
          return {
            categorias: list.length > 0 ? list : ['Comida Rápida', 'Hamburguesas', 'Pizzas', 'Bebidas', 'Postres']
          };
        } catch (e) {
          return { categorias: ['Comida Rápida', 'Hamburguesas', 'Pizzas', 'Bebidas', 'Postres'] };
        }
      }
    });

    const agregarAlCarritoTool = tool({
      name: 'agregarAlCarrito',
      description: 'Agrega un plato o producto al carrito de compras del usuario previa validación estricta de tienda abierta.',
      parameters: z.object({
        nombreProducto: z.string().describe('Nombre del producto a agregar'),
        cantidad: z.number().optional().describe('Cantidad de unidades a agregar'),
        variante: z.string().optional().describe('Variante seleccionada si aplica')
      }),
      execute: async ({ nombreProducto, cantidad, variante }) => {
        try {
          const count = typeof cantidad === 'number' && cantidad > 0 ? cantidad : 1;
          const catalog = getClientAvailableCatalog();
          const target = nombreProducto.toLowerCase().trim();
          
          let productToAdd = catalog.products.find(p => p.name.toLowerCase() === target);
          if (!productToAdd) {
            productToAdd = catalog.products.find(p => p.name.toLowerCase().includes(target));
          }

          if (!productToAdd) {
            return {
              exito: false,
              mensaje: `No fue posible agregar "${nombreProducto}" porque no se encuentra en el catálogo de tiendas abiertas actualmente.`
            };
          }

          // Strict Live Firestore Validation before adding to cart
          const validation = await validateStoreAndProductBeforeCart(productToAdd.id, productToAdd.userId);
          if (!validation.valid) {
            return {
              exito: false,
              mensaje: validation.reason || `Lo sentimos, la tienda de este plato se encuentra cerrada.`
            };
          }

          const updatedCart = addProductToCart(productToAdd, count, variante);
          if (this.callbacks.onCartUpdated) {
            this.callbacks.onCartUpdated(updatedCart);
          }

          const summary = calculateCartSummary(updatedCart);

          return {
            exito: true,
            agregado: {
              nombre: productToAdd.name,
              cantidad: count,
              precioUnitario: `$${productToAdd.price.toLocaleString('es-CO')} pesos`,
              totalItem: `$${(productToAdd.price * count).toLocaleString('es-CO')} pesos`
            },
            resumenCarrito: {
              totalProductos: summary.totalItems,
              subtotal: `$${summary.subtotal.toLocaleString('es-CO')} pesos`,
              domicilio: `$${summary.deliveryFee.toLocaleString('es-CO')} pesos`,
              totalPagar: `$${summary.grandTotal.toLocaleString('es-CO')} pesos`
            },
            mensaje: `He agregado ${count} ${productToAdd.name} a tu carrito con éxito.`
          };
        } catch (e: any) {
          return { exito: false, error: e?.message || "Error al agregar producto al carrito." };
        }
      }
    });

    const actualizarCantidadCarritoTool = tool({
      name: 'actualizarCantidadCarrito',
      description: 'Modifica la cantidad de un producto que ya se encuentra en el carrito.',
      parameters: z.object({
        nombreProducto: z.string().describe('Nombre del producto a modificar'),
        nuevaCantidad: z.number().describe('Nueva cantidad deseada (0 para eliminar)')
      }),
      execute: async ({ nombreProducto, nuevaCantidad }) => {
        try {
          const currentCart = getStoredCart();
          const target = nombreProducto.toLowerCase().trim();
          const item = currentCart.find(i => 
            i.product.name.toLowerCase().includes(target) || 
            i.id.toLowerCase().includes(target)
          );

          if (!item) {
            return {
              exito: false,
              mensaje: `El producto "${nombreProducto}" no se encuentra actualmente en tu carrito.`
            };
          }

          // Live validation
          if (nuevaCantidad > 0) {
            const validation = await validateStoreAndProductBeforeCart(item.product.id, item.product.userId);
            if (!validation.valid) {
              return {
                exito: false,
                mensaje: validation.reason || `No es posible modificar este producto porque la tienda se encuentra cerrada.`
              };
            }
          }

          const updatedCart = updateCartQuantity(item.id, Math.max(0, nuevaCantidad));
          if (this.callbacks.onCartUpdated) {
            this.callbacks.onCartUpdated(updatedCart);
          }

          const summary = calculateCartSummary(updatedCart);
          return {
            exito: true,
            mensaje: nuevaCantidad <= 0 
              ? `Se eliminó ${item.product.name} de tu carrito.` 
              : `Se actualizó la cantidad de ${item.product.name} a ${nuevaCantidad}.`,
            resumenCarrito: {
              totalProductos: summary.totalItems,
              totalPagar: `$${summary.grandTotal.toLocaleString('es-CO')} pesos`
            }
          };
        } catch (e: any) {
          return { exito: false, error: "Error al actualizar cantidad en el carrito." };
        }
      }
    });

    const eliminarDelCarritoTool = tool({
      name: 'eliminarDelCarrito',
      description: 'Elimina un producto del carrito de compras.',
      parameters: z.object({
        nombreProducto: z.string().describe('Nombre del producto a eliminar')
      }),
      execute: async ({ nombreProducto }) => {
        try {
          const currentCart = getStoredCart();
          const target = nombreProducto.toLowerCase().trim();
          const item = currentCart.find(i => 
            i.product.name.toLowerCase().includes(target) || 
            i.id.toLowerCase().includes(target)
          );

          if (!item) {
            return {
              exito: false,
              mensaje: `El producto "${nombreProducto}" no estaba en tu carrito.`
            };
          }

          const updatedCart = removeProductFromCart(item.id);
          if (this.callbacks.onCartUpdated) {
            this.callbacks.onCartUpdated(updatedCart);
          }

          const summary = calculateCartSummary(updatedCart);
          return {
            exito: true,
            mensaje: `Eliminé ${item.product.name} de tu carrito.`,
            totalRestante: summary.totalItems,
            totalPagar: `$${summary.grandTotal.toLocaleString('es-CO')} pesos`
          };
        } catch (e) {
          return { exito: false, error: "Error al eliminar producto del carrito." };
        }
      }
    });

    const obtenerCarritoTool = tool({
      name: 'obtenerCarrito',
      description: 'Consulta los productos actuales en el carrito, subtotal, costo de envío y total a pagar.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const cart = getStoredCart();
          if (cart.length === 0) {
            return {
              vacio: true,
              mensaje: "Tu carrito está actualmente vacío. ¿Qué se te antoja pedir hoy?"
            };
          }

          const summary = calculateCartSummary(cart);
          return {
            vacio: false,
            items: cart.map(i => ({
              nombre: i.product.name,
              cantidad: i.quantity,
              precioUnitario: `$${i.product.price.toLocaleString('es-CO')} pesos`,
              totalItem: `$${(i.product.price * i.quantity).toLocaleString('es-CO')} pesos`
            })),
            totalArticulos: summary.totalItems,
            subtotal: `$${summary.subtotal.toLocaleString('es-CO')} pesos`,
            domicilio: `$${summary.deliveryFee.toLocaleString('es-CO')} pesos`,
            totalPagar: `$${summary.grandTotal.toLocaleString('es-CO')} pesos`
          };
        } catch (e) {
          return { error: "Error al consultar el carrito." };
        }
      }
    });

    const vaciarCarritoTool = tool({
      name: 'vaciarCarrito',
      description: 'Vacía por completo el carrito de compras.',
      parameters: z.object({}),
      execute: async () => {
        try {
          const updatedCart = clearAllCart();
          if (this.callbacks.onCartUpdated) {
            this.callbacks.onCartUpdated(updatedCart);
          }
          return {
            exito: true,
            mensaje: "He vaciado completamente tu carrito de compras."
          };
        } catch (e) {
          return { error: "Error al vaciar el carrito." };
        }
      }
    });

    const crearPedidoTool = tool({
      name: 'crearPedido',
      description: 'Crea y confirma el pedido formalmente previa validación estricta contra Firestore de tiendas abiertas.',
      parameters: z.object({
        nombreCliente: z.string().describe('Nombre del cliente'),
        telefono: z.string().describe('Teléfono de contacto'),
        direccion: z.string().describe('Dirección de entrega o número de mesa'),
        metodoPago: z.enum(['whatsapp', 'transfer', 'delivery_cash', 'cod']).optional().describe('Método de pago'),
        notas: z.string().optional().describe('Notas o especificaciones para la cocina o entrega')
      }),
      execute: async ({ nombreCliente, telefono, direccion, metodoPago = 'delivery_cash', notas = '' }) => {
        try {
          const cart = getStoredCart();
          if (cart.length === 0) {
            return {
              exito: false,
              mensaje: "No se puede crear el pedido porque tu carrito está vacío. Agrega platos primero."
            };
          }

          // Strict Live Validation against Firestore before saving order
          const validation = await validateCartBeforeOrder(cart);
          if (!validation.valid) {
            return {
              exito: false,
              mensaje: validation.reason || "No se pudo completar el pedido debido a que una de las tiendas está cerrada."
            };
          }

          const summary = calculateCartSummary(cart);
          const firstItem = cart[0];
          const storeOwnerId = firstItem.product.userId || 'store_general';

          const newOrder: OrderItem = {
            id: 'ord_' + Date.now(),
            orderNumber: Math.floor(1000 + Math.random() * 9000),
            storeOwnerId,
            customerName: nombreCliente,
            customerPhone: telefono,
            customerAddress: direccion,
            notes: notas,
            items: cart.map(i => ({
              productId: i.product.id,
              name: i.product.name,
              price: i.product.price,
              quantity: i.quantity,
              selectedVariant: i.selectedVariant,
              imageURL: i.product.imageURL
            })),
            deliveryFee: summary.deliveryFee,
            totalAmount: summary.grandTotal,
            paymentMethod: (metodoPago || 'delivery_cash') as 'delivery_cash' | 'whatsapp' | 'transfer' | 'cod',
            status: 'pending',
            deliveryStep: 'accepted',
            createdAt: new Date().toISOString()
          };

          const saved = await saveOrder(newOrder);
          
          // Clear cart after successful order creation
          clearAllCart();
          if (this.callbacks.onCartUpdated) {
            this.callbacks.onCartUpdated([]);
          }
          if (this.callbacks.onOrderCreated) {
            this.callbacks.onOrderCreated(saved);
          }

          return {
            exito: true,
            numeroPedido: saved.orderNumber,
            id: saved.id,
            totalPagar: `$${saved.totalAmount.toLocaleString('es-CO')} pesos`,
            mensaje: `¡Excelente, ${nombreCliente}! Tu pedido #${saved.orderNumber} ha sido creado y confirmado con éxito por un total de $${saved.totalAmount.toLocaleString('es-CO')} pesos. El restaurante ya está preparando tu orden.`
          };
        } catch (e: any) {
          return { exito: false, error: e?.message || "Error al crear el pedido." };
        }
      }
    });

    const consultarPedidoTool = tool({
      name: 'consultarPedido',
      description: 'Consulta el estado de un pedido reciente.',
      parameters: z.object({
        pedidoId: z.string().optional().describe('ID o número de pedido')
      }),
      execute: async ({ pedidoId }) => {
        try {
          const storedOrders = JSON.parse(localStorage.getItem('linnk_orders_all') || '[]');
          if (storedOrders.length === 0) {
            return {
              mensaje: "No encontré pedidos recientes registrados en tu sesión."
            };
          }

          let matched = storedOrders[storedOrders.length - 1];
          if (pedidoId && pedidoId.trim()) {
            const p = pedidoId.trim().toLowerCase();
            const found = storedOrders.find((o: any) => 
              (o.id && o.id.toLowerCase().includes(p)) || 
              (o.orderNumber && o.orderNumber.toString().includes(p))
            );
            if (found) matched = found;
          }

          const statusMap: Record<string, string> = {
            'pending': 'Pendiente de confirmación por el restaurante',
            'processing': 'En preparación en la cocina',
            'shipped': 'En camino con el domiciliario',
            'delivered': 'Entregado con éxito',
            'cancelled': 'Cancelado'
          };

          return {
            numeroPedido: matched.orderNumber,
            restaurante: matched.storeName,
            estado: statusMap[matched.status] || matched.status,
            total: `$${matched.totalAmount.toLocaleString('es-CO')} pesos`,
            direccion: matched.customerAddress,
            domiciliario: matched.deliveryDriverName || 'Asignando repartidor'
          };
        } catch (e) {
          return { error: "Error al consultar el pedido." };
        }
      }
    });

    return [
      buscarRestaurantesTool,
      buscarProductosTool,
      buscarProductoTool,
      obtenerMenuTool,
      obtenerCategoriasTool,
      agregarAlCarritoTool,
      actualizarCantidadCarritoTool,
      eliminarDelCarritoTool,
      obtenerCarritoTool,
      vaciarCarritoTool,
      crearPedidoTool,
      consultarPedidoTool
    ];
  }

  public async start(): Promise<void> {
    if (this.isConnected) return;

    this.callbacks.onStateChange('processing');

    try {
      // 1. Request microphone permissions first
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      this.localStream = mediaStream;

      // 2. Fetch ephemeral Realtime session token from our secure backend
      const endpointCandidates = [
        '/api/realtime/session',
        '/api/realtime-session',
        '/api/realtime/client_secrets'
      ];

      let ephemeralKey: string | null = null;
      let lastErrorMessage = '';

      for (const endpoint of endpointCandidates) {
        try {
          const sessionResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({})
          });

          const responseText = await sessionResponse.text();
          let sessionData: any = null;

          try {
            sessionData = JSON.parse(responseText);
          } catch (pErr) {
            // Response was not JSON (e.g. HTML 404/200 page from static proxy)
            lastErrorMessage = `Endpoint ${endpoint} retornó HTML o formato no válido`;
            continue;
          }

          if (!sessionResponse.ok) {
            lastErrorMessage = sessionData?.error || `Error ${sessionResponse.status} en ${endpoint}`;
            continue;
          }

          const token = sessionData?.value || sessionData?.client_secret?.value;
          if (token) {
            ephemeralKey = token;
            break;
          }
        } catch (fetchErr: any) {
          lastErrorMessage = fetchErr?.message || 'Error de conexión';
        }
      }

      if (!ephemeralKey) {
        throw new Error(lastErrorMessage || "No se pudo obtener el token efímero de OpenAI Realtime. Por favor intenta de nuevo.");
      }

      // 3. Build Realtime Agent with all 12 tools and strict availableCatalog directive
      const tools = this.buildTools();
      const agent = new RealtimeAgent({
        name: 'Mesero IA LinnkPro',
        instructions: `Eres "IAMesero", la mesera virtual de LinnkPro.Store.
Hablas con la voz femenina "marin" en español colombiano natural, cálido, acogedor, respetuoso y amable.

DIRECTIVA OBLIGATORIA DE CATÁLOGO DISPONIBLE (availableCatalog):
- Solo puedes recomendar, mencionar, agregar al carrito o vender productos presentes en availableCatalog.
- Si un producto no aparece en availableCatalog, debes asumir que actualmente no está disponible.
- NUNCA inventes productos, precios, ingredientes ni disponibilidad.
- NUNCA menciones ni vendas productos pertenecientes a tiendas cerradas (isClosed === true).

PAUTAS DE LENGUAJE HABLADO NATURAL:
1. Habla como una mesera atenta y profesional atendiendo una mesa ("¡Hola! Qué gusto saludarte", "¡Con mucho gusto!", "¡Claro que sí!").
2. Sé concisa y directa: evita párrafos largos. Menciona 2 o 3 opciones destacadas a la vez.
3. Pronuncia los precios en pesos colombianos de forma natural (ejemplo: "veinticinco mil pesos", "doce mil quinientos pesos").
4. Utiliza tus herramientas en tiempo real para verificar restaurantes abiertos, platos, precios y carrito.
5. Cuando el cliente pida agregar un plato, utiliza 'agregarAlCarrito' inmediatamente.
6. Permite que el usuario te hable o interrumpa con total fluidez.`,
        tools
      });

      // 4. Create audio element for remote WebRTC stream
      if (!this.remoteAudioElement) {
        this.remoteAudioElement = new Audio();
        this.remoteAudioElement.autoplay = true;
      }

      // 5. Connect RealtimeSession with WebRTC
      this.session = new RealtimeSession(agent, {
        transport: 'webrtc',
        apiKey: ephemeralKey,
        config: {
          voice: 'marin'
        }
      });

      // 6. Listen to RealtimeSession lifecycle events for continuous hands-free voice
      this.session.on('audio_start', () => {
        this.callbacks.onStateChange('speaking');
      });

      this.session.on('audio_stopped', () => {
        this.callbacks.onStateChange('listening');
      });

      this.session.on('audio_interrupted', () => {
        this.callbacks.onStateChange('listening');
      });

      this.session.on('agent_start', () => {
        this.callbacks.onStateChange('processing');
      });

      this.session.on('agent_end', (_ctx: any, _agent: any, output: string) => {
        if (output && output.trim()) {
          this.callbacks.onTranscriptDelta(output.trim(), true, 'assistant');
        }
        this.callbacks.onStateChange('listening');
      });

      this.session.on('error', (err: any) => {
        console.warn("Realtime session error:", err);
        if (this.callbacks.onError) {
          this.callbacks.onError(err?.message || 'Error en la sesión de voz Realtime');
        }
      });

      const handleRawRealtimeEvent = (ev: any) => {
        if (!ev || !ev.type) return;

        switch (ev.type) {
          case 'response.audio_transcript.delta': {
            const delta = ev.delta || '';
            this.currentAssistantTranscript += delta;
            this.callbacks.onTranscriptDelta(this.currentAssistantTranscript, false, 'assistant');
            this.callbacks.onStateChange('speaking');
            break;
          }
          case 'response.audio_transcript.done': {
            const finalTranscript = ev.transcript || this.currentAssistantTranscript;
            if (finalTranscript) {
              this.callbacks.onTranscriptDelta(finalTranscript, true, 'assistant');
            }
            this.currentAssistantTranscript = '';
            this.callbacks.onStateChange('listening');
            break;
          }
          case 'input_audio_buffer.speech_started': {
            this.callbacks.onStateChange('listening');
            break;
          }
          case 'input_audio_buffer.speech_stopped': {
            this.callbacks.onStateChange('processing');
            break;
          }
          case 'conversation.item.input_audio_transcription.completed': {
            const transcript = ev.transcript || '';
            if (transcript.trim()) {
              this.callbacks.onTranscriptDelta(transcript.trim(), true, 'user');
            }
            break;
          }
          case 'error': {
            console.warn("Realtime transport error:", ev.error);
            break;
          }
        }
      };

      (this.session as any).on?.('transport_event', (event: any) => {
        handleRawRealtimeEvent(event);
      });

      const transport = (this.session as any).transport;
      transport?.on?.('*', (event: any) => {
        handleRawRealtimeEvent(event);
      });

      // Connect session with WebRTC media stream and remote audio element
      await this.session.connect({
        mediaStream: this.localStream,
        audioElement: this.remoteAudioElement
      } as any);

      this.isConnected = true;
      this.callbacks.onStateChange('listening');
    } catch (error: any) {
      this.stop();
      if (this.callbacks.onError) {
        this.callbacks.onError(error?.message || "No fue posible iniciar la sesión de voz WebRTC.");
      }
      throw error;
    }
  }

  public stop(): void {
    try {
      if (this.session) {
        (this.session as any).close?.();
        this.session = null;
      }
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }
      if (this.remoteAudioElement) {
        this.remoteAudioElement.pause();
        this.remoteAudioElement.srcObject = null;
      }
    } catch (e) {}

    this.isConnected = false;
    this.callbacks.onStateChange('idle');
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }
}
