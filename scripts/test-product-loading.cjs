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
        ? 'export const {collection,onSnapshot}=globalThis.__productTest; export const query=(collection,...constraints)=>({collection,constraints}); export const limit=n=>({limit:n}); export const orderBy=field=>({orderBy:field}); export const documentId=()=>"__name__"; export const startAfter=id=>({after:id}); export const getDocsFromServer=(...a)=>globalThis.__productTest.getDocsFromServer(...a);'
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
  let reads = 0, fetches = 0;
  globalThis.__productTest = {collection:(_,name)=>name,onSnapshot:()=>()=>{}, getDocsFromServer:async q=>{
    reads++; assert(q.constraints.some(c=>c.limit===12)); throw Error('offline');
  }};
  const products = Array.from({length:30},(_,i)=>({id:String(i).padStart(3,'0'),name:'Meal '+i,userId:'store',active:true,price:10000,imageURL:'/photo-'+i+'.webp'}));
  const page = (items,hasMore) => ({source:'firestore-server',kind:'products',items,cursor:items.at(-1)?.id||null,hasMore});
  const response = body=>({ok:true,json:async()=>body});
  let complete;
  window.__RYYCO_PRODUCTS__ = Promise.resolve(page(products.slice(0,12),true));
  globalThis.fetch = url=>{fetches++;assert(url.includes('after=011'));return new Promise(resolve=>{complete=resolve});};
  const {useProgressiveStoreLoader}=await bundle('src/hooks/useProgressiveStoreLoader.ts',true);
  let state;
  function Probe(){state=useProgressiveStoreLoader();return null;}
  let root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Probe))));
  assert.equal(state.loadedProducts.length,12);
  assert.equal(state.hasMore,true);
  assert.equal(reads,0,'No SDK duplication when server metadata succeeds');
  assert.equal(fetches,0,'No full catalog or second page before requested');
  let pending;
  await act(async()=>{pending=state.loadNextFourProducts();void state.loadNextFourProducts();});
  assert.equal(fetches,1,'One in-flight request per cursor');
  await act(async()=>{complete(response(page(products.slice(12,24),true)));await pending;});
  assert.equal(state.loadedProducts.length,24);
  assert.deepEqual(state.loadedProducts.slice(0,12).map(p=>p.id),products.slice(0,12).map(p=>p.id));
  globalThis.fetch=async url=>{assert(url.includes('after=023'));return response(page(products.slice(24),false));};
  await act(async()=>{await state.loadNextFourProducts();});
  assert.equal(state.loadedProducts.length,30);assert.equal(state.hasMore,false);
  await act(async()=>root.unmount());
  // Failures keep retry available; never convert a failed page into an empty catalog.
  delete window.__RYYCO_PRODUCTS__;
  globalThis.fetch=async()=>({ok:false});
  root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(Probe)));
  assert(state.productsError);assert.equal(state.hasMore,true);
  globalThis.__productTest.getDocsFromServer=async q=>{
    assert(q.constraints.some(c=>c.limit===12));
    return {metadata:{fromCache:false,hasPendingWrites:false},docs:products.slice(0,2).map(p=>({id:p.id,data:()=>p}))};
  };
  await act(async()=>{await state.retryProducts();});
  assert.equal(state.loadedProducts.length,2);assert.equal(state.productsError,null);assert.equal(state.hasMore,false);
  await act(async()=>root.unmount());
  console.log('PASS cursor pages, shared StrictMode request, deferred pages, SDK bounds, retry and stable prefix');

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
  let intersect;
  let disconnected = 0;
  globalThis.IntersectionObserver = class {
    constructor(callback, options) { intersect = callback; assert.equal(options.rootMargin, '200px'); }
    observe() {}
    disconnect() { disconnected++; }
  };
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(card('/far.webp')));
  assert.equal(document.querySelector('img').getAttribute('src'), null, 'Offscreen photo makes no request');
  assert(document.querySelector('h3'), 'Text never waits for image visibility');
  await act(async () => intersect([{isIntersecting:true}]));
  assert.equal(document.querySelector('img').getAttribute('src'), '/far.webp');
  assert(disconnected > 0);
  await act(async () => root.unmount());
  delete globalThis.IntersectionObserver;
  console.log('PASS offscreen images wait until within 200px of viewport');
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement('div', null,
    [1,2,3,4].map(id=>React.createElement(Image,{key:id,src:'/concurrent-'+id+'.webp',name:'Meal',priority:true})))));
  assert.equal(document.querySelectorAll('img[src]').length,3,'Reserve connections by downloading at most three images');
  await act(async()=>document.querySelector('img').dispatchEvent(new dom.window.Event('load')));
  assert.equal(document.querySelectorAll('img[src]').length,4,'Completion releases the next image');
  await act(async()=>root.unmount());
  console.log('PASS image concurrency limit and queue release');

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
