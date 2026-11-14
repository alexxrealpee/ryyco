import type { OrderItem, ProductItem, UserProfile } from '../types';

export async function validateCheckoutAvailability(
  order: OrderItem,
  loadStore: (id: string) => Promise<UserProfile | null>,
  loadProduct: (id: string) => Promise<ProductItem | null>,
  isClosed: (store: UserProfile) => boolean,
) {
  if (!order.storeOwnerId || !order.items?.length) throw new Error('Revisa los productos del carrito.');
  const store = await loadStore(order.storeOwnerId);
  if (!store || store.archived || isClosed(store)) throw new Error('El restaurante no está disponible en este momento. Tu carrito se conserva.');
  const quantities = new Map<string, number>();
  for (const item of order.items) {
    if (!item.productId || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.price) || item.price < 0) {
      throw new Error('Revisa la cantidad y el precio de los productos del carrito.');
    }
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  }
  await Promise.all([...quantities].map(async ([id, quantity]) => {
    const product = await loadProduct(id);
    if (!product || product.active === false || product.userId !== order.storeOwnerId || (typeof product.stock === 'number' && product.stock < quantity)) {
      throw new Error(`El producto ${product?.name || order.items.find(i => i.productId === id)?.name || ''} ya no está disponible en la cantidad solicitada. Revisa tu carrito.`);
    }
  }));
  return store;
}
