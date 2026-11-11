/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './config';
import {
  RyycoSupplier,
  SupplierProduct,
  B2BPurchaseOrder,
  B2BRecurringSchedule,
  ProblemReport,
  SupplierApplication,
  B2BOrderStatus,
  PaymentStatus,
  OrderHistoryEvent,
  ProductAvailability,
  B2BCartItem,
  RyycoCommissionRate,
} from '../types/ryycoB2B';

/**
 * Conexión a Cloud Firestore.
 * Colección raíz: /suppliers
 * Subcolecciones derivadas por cada proveedor:
 *  - /suppliers/{supplierId}/products/{productId}
 *  - /suppliers/{supplierId}/orders/{orderId}
 *  - /suppliers/{supplierId}/schedules/{scheduleId}
 *  - /suppliers/{supplierId}/problem_reports/{reportId}
 */
export async function seedInitialFirestoreData(): Promise<void> {
  console.log('🔥 Cloud Firestore conectado a arquitectura jerárquica /suppliers/{supplierId}/...');
}

/**
 * Resetea y purga colecciones a 0 para iniciar de cero la base de datos limpia.
 */
export async function wipeAllDatabaseData(): Promise<void> {
  try {
    // 1. Purgar colecciones globales
    const globals = [
      'supplier_applications',
      'b2b_carts',
      'supplier_products',
      'b2b_orders',
      'b2b_recurring_schedules',
      'b2b_problem_reports',
    ];
    for (const g of globals) {
      const snap = await getDocs(collection(db, g)).catch(() => null);
      if (snap) {
        for (const d of snap.docs) {
          await deleteDoc(doc(db, g, d.id)).catch(() => {});
        }
      }
    }

    // 2. Purgar proveedores y sus subcolecciones
    const supSnap = await getDocs(collection(db, 'suppliers')).catch(() => null);
    if (supSnap) {
      for (const s of supSnap.docs) {
        const prodSnap = await getDocs(collection(db, 'suppliers', s.id, 'products')).catch(() => null);
        if (prodSnap) {
          for (const p of prodSnap.docs) {
            await deleteDoc(doc(db, 'suppliers', s.id, 'products', p.id)).catch(() => {});
          }
        }
        const ordSnap = await getDocs(collection(db, 'suppliers', s.id, 'orders')).catch(() => null);
        if (ordSnap) {
          for (const o of ordSnap.docs) {
            await deleteDoc(doc(db, 'suppliers', s.id, 'orders', o.id)).catch(() => {});
          }
        }
        await deleteDoc(doc(db, 'suppliers', s.id)).catch(() => {});
      }
    }
    console.log('🧹 Base de datos RYYCO purgada a 0 exitosamente.');
  } catch (err) {
    console.warn('Nota durante purga de base de datos:', err);
  }
}

export async function cleanLegacyMockDataFromFirestore(): Promise<void> {
  // No-op seguro para no purgar datos reales al recargar el navegador
}


/**
 * Sanitiza cualquier objeto removiendo campos undefined para Cloud Firestore
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      clean[key] = sanitizeFirestorePayload(val);
    } else if (Array.isArray(val)) {
      clean[key] = val.map((item) =>
        item !== null && typeof item === 'object' && !(item instanceof Date)
          ? sanitizeFirestorePayload(item)
          : item
      );
    } else {
      clean[key] = val;
    }
  }
  return clean as T;
}

export function deduplicateSuppliers(list: RyycoSupplier[]): RyycoSupplier[] {
  const seenIds = new Set<string>();
  const seenNits = new Set<string>();
  const result: RyycoSupplier[] = [];
  for (const s of list) {
    if (!s || !s.id) continue;
    const cleanNit = (s.nit || '').trim();
    if (seenIds.has(s.id) || (cleanNit && seenNits.has(cleanNit))) {
      continue;
    }
    seenIds.add(s.id);
    if (cleanNit) seenNits.add(cleanNit);
    result.push(s);
  }
  return result;
}

export function deduplicateProducts(list: SupplierProduct[]): SupplierProduct[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const result: SupplierProduct[] = [];
  for (const p of list) {
    if (!p || !p.id) continue;
    const key = `${p.supplierId || p.supplierTradeName}-${(p.sku || p.name || '').trim().toLowerCase()}`;
    if (seenIds.has(p.id) || (key && seenKeys.has(key))) continue;
    seenIds.add(p.id);
    if (key) seenKeys.add(key);
    result.push(p);
  }
  return result;
}

/* ======================================================== */
/* 1. PROVEEDORES (Colección Raíz /suppliers)               */
/* ======================================================== */

export function subscribeToSuppliers(
  onUpdate: (suppliers: RyycoSupplier[]) => void
): () => void {
  const colRef = collection(db, 'suppliers');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: RyycoSupplier[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as RyycoSupplier;
        items.push({ ...data, id: d.id || data.id });
      });
      onUpdate(deduplicateSuppliers(items));
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'suppliers');
    }
  );
}

export async function saveSupplierInFirestore(
  supplier: RyycoSupplier
): Promise<void> {
  const path = `suppliers/${supplier.id}`;
  try {
    const payload = sanitizeFirestorePayload(supplier);
    await setDoc(doc(db, 'suppliers', supplier.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteSupplierFromFirestore(supplierId: string): Promise<void> {
  const path = `suppliers/${supplierId}`;
  try {
    // Eliminar subcolecciones de productos y pedidos del proveedor
    const prodsSnap = await getDocs(collection(db, 'suppliers', supplierId, 'products')).catch(() => null);
    if (prodsSnap) {
      for (const p of prodsSnap.docs) {
        await deleteDoc(doc(db, 'suppliers', supplierId, 'products', p.id)).catch(() => {});
      }
    }
    const ordsSnap = await getDocs(collection(db, 'suppliers', supplierId, 'orders')).catch(() => null);
    if (ordsSnap) {
      for (const o of ordsSnap.docs) {
        await deleteDoc(doc(db, 'suppliers', supplierId, 'orders', o.id)).catch(() => {});
      }
    }
    await deleteDoc(doc(db, 'suppliers', supplierId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/* ======================================================== */
/* 2. INSUMOS DERIVADOS (/suppliers/{supplierId}/products)   */
/* ======================================================== */

/**
 * Guarda o actualiza un insumo en la subcolección del proveedor
 */
export async function saveProductInFirestore(
  product: SupplierProduct
): Promise<void> {
  if (!product.supplierId) {
    throw new Error('No se puede guardar un insumo sin supplierId asignado.');
  }
  const path = `suppliers/${product.supplierId}/products/${product.id}`;
  try {
    const payload = sanitizeFirestorePayload(product);
    await setDoc(doc(db, 'suppliers', product.supplierId, 'products', product.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Elimina un insumo de la subcolección del proveedor
 */
export async function deleteProductFromFirestore(
  productId: string,
  supplierId?: string
): Promise<void> {
  if (supplierId) {
    const path = `suppliers/${supplierId}/products/${productId}`;
    try {
      await deleteDoc(doc(db, 'suppliers', supplierId, 'products', productId));
      return;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  // Si no se proporcionó supplierId, buscar en collectionGroup
  try {
    const groupSnap = await getDocs(query(collectionGroup(db, 'products'), where('id', '==', productId)));
    for (const d of groupSnap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `collectionGroup/products/${productId}`);
  }
}

/**
 * Actualiza la disponibilidad del insumo en la subcolección del proveedor
 */
export async function updateProductAvailabilityInFirestore(
  productId: string,
  availability: ProductAvailability,
  supplierId?: string
): Promise<void> {
  if (supplierId) {
    const path = `suppliers/${supplierId}/products/${productId}`;
    try {
      await updateDoc(doc(db, 'suppliers', supplierId, 'products', productId), { availability });
      return;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  try {
    const groupSnap = await getDocs(query(collectionGroup(db, 'products'), where('id', '==', productId)));
    for (const d of groupSnap.docs) {
      await updateDoc(d.ref, { availability });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `collectionGroup/products/${productId}`);
  }
}

/**
 * Actualiza el precio mayorista en la subcolección del proveedor
 */
export async function updateProductPriceInFirestore(
  productId: string,
  newPriceCop: number,
  supplierId?: string
): Promise<void> {
  if (supplierId) {
    const path = `suppliers/${supplierId}/products/${productId}`;
    try {
      await updateDoc(doc(db, 'suppliers', supplierId, 'products', productId), { priceCop: newPriceCop });
      return;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  try {
    const groupSnap = await getDocs(query(collectionGroup(db, 'products'), where('id', '==', productId)));
    for (const d of groupSnap.docs) {
      await updateDoc(d.ref, { priceCop: newPriceCop });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `collectionGroup/products/${productId}`);
  }
}

/**
 * Suscripción EXCLUSIVA para el dashboard del proveedor:
 * Lee ÚNICA y exclusivamente /suppliers/{supplierId}/products.
 * Cero riesgo de mezcla de datos.
 */
export function subscribeToSupplierProducts(
  supplierId: string,
  onUpdate: (products: SupplierProduct[]) => void
): () => void {
  if (!supplierId) {
    onUpdate([]);
    return () => {};
  }
  const colRef = collection(db, 'suppliers', supplierId, 'products');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: SupplierProduct[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as SupplierProduct;
        items.push({ ...data, id: d.id || data.id, supplierId });
      });
      onUpdate(deduplicateProducts(items));
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, `suppliers/${supplierId}/products`);
    }
  );
}

/**
 * Suscripción GLOBAL de productos para el Catálogo de Restaurantes / Marketplace:
 * Utiliza collectionGroup('products') para unir los insumos de todos los proveedores homologados.
 */
export function subscribeToProducts(
  onUpdate: (products: SupplierProduct[]) => void
): () => void {
  const grpRef = collectionGroup(db, 'products');
  return onSnapshot(
    grpRef,
    (snapshot) => {
      const items: SupplierProduct[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as SupplierProduct;
        // El supplierId se deriva de la ruta del documento /suppliers/{supplierId}/products/{productId}
        const derivedSupplierId = data.supplierId || d.ref.parent.parent?.id || '';
        items.push({ ...data, id: d.id || data.id, supplierId: derivedSupplierId });
      });
      onUpdate(deduplicateProducts(items));
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'collectionGroup(products)');
    }
  );
}

export async function fetchProductsFromFirestore(): Promise<SupplierProduct[]> {
  try {
    const snap = await getDocs(collectionGroup(db, 'products'));
    const items: SupplierProduct[] = [];
    snap.forEach((d) => {
      const data = d.data() as SupplierProduct;
      const derivedSupplierId = data.supplierId || d.ref.parent.parent?.id || '';
      items.push({ ...data, id: d.id || data.id, supplierId: derivedSupplierId });
    });
    return deduplicateProducts(items);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'collectionGroup(products)');
  }
}

/* ======================================================== */
/* 3. PEDIDOS DERIVADOS (/suppliers/{supplierId}/orders)     */
/* ======================================================== */

/**
 * Guarda un pedido corporativo derivándolo en la subcolección del proveedor correspondiente
 */
export async function saveOrderInFirestore(
  order: B2BPurchaseOrder
): Promise<void> {
  if (!order.supplierId) {
    throw new Error('No se puede crear un pedido sin supplierId asignado.');
  }
  const path = `suppliers/${order.supplierId}/orders/${order.id}`;
  try {
    const payload = sanitizeFirestorePayload(order);
    await setDoc(doc(db, 'suppliers', order.supplierId, 'orders', order.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export const createOrderInFirestore = saveOrderInFirestore;


/**
 * Suscripción EXCLUSIVA de pedidos para el dashboard de un proveedor:
 * Lee ÚNICA y exclusivamente /suppliers/{supplierId}/orders.
 */
export function subscribeToSupplierOrders(
  supplierId: string,
  onUpdate: (orders: B2BPurchaseOrder[]) => void
): () => void {
  if (!supplierId) {
    onUpdate([]);
    return () => {};
  }
  const colRef = collection(db, 'suppliers', supplierId, 'orders');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: B2BPurchaseOrder[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as B2BPurchaseOrder;
        items.push({ ...data, id: d.id || data.id, supplierId });
      });
      items.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      onUpdate(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, `suppliers/${supplierId}/orders`);
    }
  );
}

/**
 * Suscripción de pedidos para el restaurante comprador o administrador:
 * - Si se pasa restaurantUid: filtra los pedidos de ese restaurante con collectionGroup('orders').
 * - Si se pasa supplierId: escucha /suppliers/{supplierId}/orders.
 * - Si no se pasa filtro: collectionGroup('orders') para el panel de administración general.
 */
export function subscribeToOrders(
  onUpdate: (orders: B2BPurchaseOrder[]) => void,
  filter?: { restaurantUid?: string; supplierId?: string }
): () => void {
  if (filter?.supplierId) {
    return subscribeToSupplierOrders(filter.supplierId, onUpdate);
  }

  let q;
  if (filter?.restaurantUid) {
    q = query(collectionGroup(db, 'orders'), where('restaurantUid', '==', filter.restaurantUid));
  } else {
    q = collectionGroup(db, 'orders');
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const items: B2BPurchaseOrder[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as B2BPurchaseOrder;
        const derivedSupplierId = data.supplierId || d.ref.parent.parent?.id || '';
        items.push({ ...data, id: d.id || data.id, supplierId: derivedSupplierId });
      });
      items.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      onUpdate(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'collectionGroup(orders)');
    }
  );
}

/**
 * Actualiza el estado de un pedido en la subcolección del proveedor
 */
export async function updateOrderStatusInFirestore(
  orderId: string,
  newStatus: B2BOrderStatus,
  newEvent: OrderHistoryEvent,
  supplierId?: string
): Promise<void> {
  if (supplierId) {
    const path = `suppliers/${supplierId}/orders/${orderId}`;
    try {
      const orderDoc = doc(db, 'suppliers', supplierId, 'orders', orderId);
      await updateDoc(orderDoc, {
        status: newStatus,
        history: [sanitizeFirestorePayload(newEvent)],
      });
      return;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  try {
    const groupSnap = await getDocs(query(collectionGroup(db, 'orders'), where('id', '==', orderId)));
    for (const d of groupSnap.docs) {
      await updateDoc(d.ref, {
        status: newStatus,
        history: [sanitizeFirestorePayload(newEvent)],
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `collectionGroup/orders/${orderId}`);
  }
}

/**
 * Actualiza el estado de pago del pedido en la subcolección del proveedor
 */
export async function updateOrderPaymentInFirestore(
  orderId: string,
  paymentStatus: PaymentStatus,
  newEvent: OrderHistoryEvent,
  supplierId?: string
): Promise<void> {
  if (supplierId) {
    const path = `suppliers/${supplierId}/orders/${orderId}`;
    try {
      const orderDoc = doc(db, 'suppliers', supplierId, 'orders', orderId);
      await updateDoc(orderDoc, {
        paymentStatus,
        history: [sanitizeFirestorePayload(newEvent)],
      });
      return;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  try {
    const groupSnap = await getDocs(query(collectionGroup(db, 'orders'), where('id', '==', orderId)));
    for (const d of groupSnap.docs) {
      await updateDoc(d.ref, {
        paymentStatus,
        history: [sanitizeFirestorePayload(newEvent)],
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `collectionGroup/orders/${orderId}`);
  }
}

/**
 * Actualiza cualquier detalle del pedido (estados de preparación, despacho, PIN, etc.)
 */
export async function updateOrderDetailsInFirestore(
  orderId: string,
  updates: Partial<B2BPurchaseOrder>,
  event?: OrderHistoryEvent,
  supplierId?: string
): Promise<void> {
  const payload: Record<string, any> = sanitizeFirestorePayload(updates);
  if (event) {
    const currentHistory = updates.history || [];
    payload.history = [sanitizeFirestorePayload(event), ...currentHistory];
  }

  if (supplierId) {
    const path = `suppliers/${supplierId}/orders/${orderId}`;
    try {
      const orderDoc = doc(db, 'suppliers', supplierId, 'orders', orderId);
      await updateDoc(orderDoc, payload);
      return;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  try {
    const groupSnap = await getDocs(query(collectionGroup(db, 'orders'), where('id', '==', orderId)));
    for (const d of groupSnap.docs) {
      await updateDoc(d.ref, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `collectionGroup/orders/${orderId}`);
  }
}

/* ======================================================== */
/* 4. BOLSA CORPORATIVA POR RESTAURANTE (/b2b_carts)        */
/* ======================================================== */

export function subscribeToCart(
  restaurantUid: string,
  onUpdate: (items: B2BCartItem[]) => void
): () => void {
  if (!restaurantUid) {
    onUpdate([]);
    return () => {};
  }
  const cartDocRef = doc(db, 'b2b_carts', restaurantUid);
  return onSnapshot(
    cartDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onUpdate(Array.isArray(data?.items) ? (data.items as B2BCartItem[]) : []);
      } else {
        onUpdate([]);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `b2b_carts/${restaurantUid}`);
    }
  );
}

export async function saveCartInFirestore(
  restaurantUid: string,
  items: B2BCartItem[]
): Promise<void> {
  if (!restaurantUid) return;
  const path = `b2b_carts/${restaurantUid}`;
  try {
    const payload = sanitizeFirestorePayload({
      restaurantUid,
      items,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'b2b_carts', restaurantUid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function clearCartInFirestore(restaurantUid: string): Promise<void> {
  if (!restaurantUid) return;
  const path = `b2b_carts/${restaurantUid}`;
  try {
    await setDoc(doc(db, 'b2b_carts', restaurantUid), {
      restaurantUid,
      items: [],
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/* ======================================================== */
/* 5. POSTULACIONES DE PROVEEDORES (/supplier_applications) */
/* ======================================================== */

export function subscribeToApplications(
  onUpdate: (apps: SupplierApplication[]) => void
): () => void {
  const colRef = collection(db, 'supplier_applications');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: SupplierApplication[] = [];
      snapshot.forEach((d) => items.push({ ...(d.data() as SupplierApplication), id: d.id }));
      onUpdate(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'supplier_applications');
    }
  );
}

export async function saveApplicationInFirestore(
  application: SupplierApplication
): Promise<void> {
  const path = `supplier_applications/${application.id}`;
  try {
    const payload = sanitizeFirestorePayload(application);
    await setDoc(doc(db, 'supplier_applications', application.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/* ======================================================== */
/* 6. PROGRAMACIONES RECURRENTES Y REPORTES                 */
/* ======================================================== */

export function subscribeToSchedules(
  onUpdate: (schedules: B2BRecurringSchedule[]) => void
): () => void {
  const grpRef = collectionGroup(db, 'schedules');
  return onSnapshot(
    grpRef,
    (snapshot) => {
      const items: B2BRecurringSchedule[] = [];
      snapshot.forEach((d) => items.push({ ...(d.data() as B2BRecurringSchedule), id: d.id }));
      onUpdate(items);
    },
    () => {
      // Si la colección de schedules está vacía, no fallar
      onUpdate([]);
    }
  );
}

export async function saveRecurringScheduleInFirestore(
  schedule: B2BRecurringSchedule
): Promise<void> {
  const path = `suppliers/${schedule.supplierId}/schedules/${schedule.id}`;
  try {
    await setDoc(doc(db, 'suppliers', schedule.supplierId, 'schedules', schedule.id), sanitizeFirestorePayload(schedule));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveProblemReportInFirestore(
  report: ProblemReport,
  orderId: string,
  event: OrderHistoryEvent,
  supplierId?: string
): Promise<void> {
  const sid = supplierId || 'general';
  const path = `suppliers/${sid}/problem_reports/${report.id}`;
  try {
    await setDoc(doc(db, 'suppliers', sid, 'problem_reports', report.id), sanitizeFirestorePayload(report));
    if (supplierId) {
      await updateDoc(doc(db, 'suppliers', supplierId, 'orders', orderId), {
        problemReport: sanitizeFirestorePayload(report),
        history: [sanitizeFirestorePayload(event)],
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/* ======================================================== */
/* 7. COMISIONES CENTRALES RYYCO (/ryyco_config)            */
/* ======================================================== */

export const DEFAULT_COMMISSION_RATES: RyycoCommissionRate[] = [
  {
    id: 'frutas_verduras',
    category: 'Frutas y Verduras',
    percentage: 4.0,
    description: 'Productos frescos, tubérculos, hortalizas y frutas de la región',
    appliesTo: 'subtotal_productos',
  },
  {
    id: 'carnicos',
    category: 'Cárnicos y Embutidos',
    percentage: 3.5,
    description: 'Carnes de res, cerdo, pollo, hamburguesas y embutidos mayoristas',
    appliesTo: 'subtotal_productos',
  },
  {
    id: 'lacteos',
    category: 'Lácteos y Quesos',
    percentage: 3.0,
    description: 'Quesos mozzarella, campesino, leche, cremas y mantequillas',
    appliesTo: 'subtotal_productos',
  },
  {
    id: 'aceites',
    category: 'Aceites y Abarrotes',
    percentage: 2.5,
    description: 'Aceites para fritura profunda, salsas, harinas y víveres secos',
    appliesTo: 'subtotal_productos',
  },
  {
    id: 'empaques',
    category: 'Empaques Biodegradables',
    percentage: 4.5,
    description: 'Cajas kraft, vasos, bolsas y contenedores ecológicos de alimentos',
    appliesTo: 'subtotal_productos',
  },
  {
    id: 'bebidas',
    category: 'Bebidas y Licores',
    percentage: 3.5,
    description: 'Jugos, pulpas congeladas, gaseosas, cervezas y licores de bar',
    appliesTo: 'subtotal_productos',
  },
  {
    id: 'general',
    category: 'General / Por defecto',
    percentage: 3.0,
    description: 'Tarifa base para insumos generales no clasificados',
    appliesTo: 'subtotal_productos',
  },
];

export function subscribeToCommissionRates(
  onUpdate: (rates: RyycoCommissionRate[]) => void
): () => void {
  const docRef = doc(db, 'ryyco_config', 'commissions');
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (Array.isArray(data?.rates) && data.rates.length > 0) {
          onUpdate(data.rates as RyycoCommissionRate[]);
          return;
        }
      }
      onUpdate(DEFAULT_COMMISSION_RATES);
    },
    () => {
      onUpdate(DEFAULT_COMMISSION_RATES);
    }
  );
}

export async function saveCommissionRatesInFirestore(
  rates: RyycoCommissionRate[]
): Promise<void> {
  const path = 'ryyco_config/commissions';
  try {
    const payload = sanitizeFirestorePayload({
      id: 'commissions',
      rates,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'ryyco_config', 'commissions'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function calculateOrderCommission(
  subtotalCop: number,
  totalAmountCop: number,
  category: string,
  rates: RyycoCommissionRate[]
): { percent: number; feeCop: number; netPayoutCop: number } {
  const matched =
    rates.find((r) => r.category.toLowerCase() === (category || '').toLowerCase()) ||
    rates.find((r) => r.category === 'General / Por defecto') ||
    DEFAULT_COMMISSION_RATES[0];

  const percent = matched?.percentage ?? 3.0;
  const base = matched?.appliesTo === 'total_con_flete' ? totalAmountCop : subtotalCop;
  const feeCop = Math.round(base * (percent / 100));
  const netPayoutCop = Math.max(0, totalAmountCop - feeCop);

  return { percent, feeCop, netPayoutCop };
}
