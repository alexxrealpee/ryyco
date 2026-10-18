const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
async function bundle(file, mock = false) {
  const result = await build({ entryPoints: [file], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react', 'react/jsx-runtime'],
    define: { 'import.meta.env.DEV': 'false' }, plugins: mock ? [{ name: 'firebase-mock', setup(b) {
      b.onResolve({ filter: /^firebase\/firestore$|^\.\.\/lib\/firebase$/ }, a => ({ path: a.path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: a.path === 'firebase/firestore'
        ? 'export const {collection,onSnapshot,getDocs}=globalThis.__productTest;'
        : 'export const db={}; export const checkIsStoreClosed=s=>s.isClosed;' }));
    }}] : [] });
  const m = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, m, m.exports);
  return m.exports;
}
async function main() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
    CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
  let reads = 0, fetches = 0, resolveFull;
  globalThis.__productTest = { collection: (_, name) => name, onSnapshot: () => () => {},
    getDocs: async () => { reads++; throw Error('Unexpected Firestore query'); } };
  const products = Array.from({ length: 18 }, (_, i) => ({ id: String(i), name: 'Product ' + i,
    price: 10000 + i, userId: 'store', active: true, category: 'Hamburguesas',
    imageURL: '/image-' + i + '.webp', createdAt: new Date(2026, 9, 18, 0, 0, 18 - i).toISOString() }));
  window.__INITIAL_CATALOG_DATA__ = { isPartial: true, catalog: { products: products.slice(0, 6) } };
  globalThis.fetch = () => { fetches++; return new Promise(resolve => { resolveFull = resolve; }); };
  const { useProgressiveStoreLoader } = await bundle('src/hooks/useProgressiveStoreLoader.ts', true);
  let state;
  function Probe() { state = useProgressiveStoreLoader(); return null; }
  let root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Probe))));
  assert.equal(state.loadedProducts.length, 6);
  const prefix = state.loadedProducts.map(p => p.id);
  let request;
  await act(async () => { request = state.loadNextFourProducts(); await state.loadNextFourProducts(); });
  assert.equal(fetches, 1, 'Concurrent pagination shares one full catalog request');
  await act(async () => { resolveFull({ ok: true, headers: { get: () => 'application/json' },
    json: async () => ({ isPartial: false, catalog: { products: [...products, products[8]] } }) }); await request; });
  assert.equal(state.loadedProducts.length, 18);
  assert.deepEqual(state.loadedProducts.slice(0, 6).map(p => p.id), prefix, 'Existing order never changes');
  assert.equal(new Set(state.loadedProducts.map(p => p.id)).size, 18);
  await act(async () => { await state.loadNextFourProducts(); await state.loadNextFourProducts(); });
  assert.equal(fetches, 1);
  assert.equal(reads, 0);
  assert.equal(state.hasMore, false);
  await act(async () => root.unmount());
  console.log('PASS catalog: initial six, concurrent requests, retained buffer, stable order, no duplicates or extra reads');

  const Image = (await bundle('src/components/ProductCardImage.tsx')).default;
  root = createRoot(document.getElementById('root'));
  const card = src => React.createElement('article', null, React.createElement(Image, { src, name: 'Test meal' }),
    React.createElement('h3', null, 'Test meal'), React.createElement('p', null, '$10.000'), React.createElement('button', null, 'Pedir'));
  await act(async () => root.render(card('/slow.webp')));
  assert.equal(document.querySelector('img').dataset.imageState, 'loading');
  assert(document.querySelector('h3').textContent.includes('Test meal'));
  assert(document.querySelector('button').textContent.includes('Pedir'));
  await act(async () => document.querySelector('img').dispatchEvent(new dom.window.Event('load')));
  assert.equal(document.querySelector('img').dataset.imageState, 'loaded');
  await act(async () => root.render(card('/broken.webp')));
  assert.equal(document.querySelector('img').dataset.imageState, 'loading');
  await act(async () => document.querySelector('img').dispatchEvent(new dom.window.Event('error')));
  assert.equal(document.querySelector('img').dataset.imageState, 'error');
  assert(document.querySelector('article').textContent.includes('Sin Imagen'));
  assert(document.querySelector('button'));
  await act(async () => root.unmount());
  console.log('PASS images: content before photo, successful load, URL change, independent fallback');

  const cart = await bundle('src/lib/cartHelper.ts');
  let writes = 0;
  const nativeSet = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function(key, value) {
    if (key === 'linnkpro_cart_images_cache') writes++;
    return nativeSet.call(this, key, value);
  };
  cart.registerProductImages(products);
  assert.equal(writes, 2, 'One localStorage and one mirrored sessionStorage write per batch');
  cart.registerProductImages(products);
  assert.equal(writes, 2, 'Repeated registration does not rewrite the cache');
  const meal = { ...products[0], variantsText: 'Pequeña, Grande', variantPrices: { Pequeña: 10000, Grande: 15000 } };
  const addon = { id: 'cheese', name: 'Queso', price: 2000 };
  cart.addProductToCart(meal, 1, 'Grande', [addon]);
  cart.addProductToCart(meal, 1, 'Grande', [addon]);
  cart.addProductToCart(meal, 1, 'Pequeña');
  const saved = cart.getStoredCart();
  assert.equal(saved.length, 2);
  assert.equal(saved[0].quantity, 2);
  assert.equal(cart.getCartItemUnitPrice(saved[0]), 17000);
  assert.equal(cart.getCartItemUnitPrice(saved[1]), 10000);
  assert.equal(saved[0].product.imageURL, products[0].imageURL);
  const summary = cart.calculateCartSummary(saved, 7000);
  assert.equal(summary.subtotal, 44000, 'Subtotal includes each variant and addon for both units');
  assert.equal(summary.grandTotal, 51000);
  console.log('PASS cart: batched cache, variants, addons, quantities, image restoration');
  dom.window.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
