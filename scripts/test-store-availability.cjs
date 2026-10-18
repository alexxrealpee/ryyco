const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = React;

async function main() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document,
    sessionStorage: dom.window.sessionStorage, Image: dom.window.Image,
    IS_REACT_ACT_ENVIRONMENT: true
  });
  let listener;
  let listenerError;
  let subscriptions = 0;
  let activeListeners = 0;
  let productReads = 0;
  globalThis.__storeTest = {
    collection: (_, name) => name,
    onSnapshot: (name, options, next, error) => {
      assert.equal(name, 'profiles');
      assert.equal(options.includeMetadataChanges, true);
      subscriptions++;
      activeListeners++;
      listener = next;
      listenerError = error;
      return () => activeListeners--;
    },
    getDocsFromServer: async name => {
      assert.equal(name, 'products', 'No duplicate profile query');
      productReads++;
      return { metadata: { fromCache: false, hasPendingWrites: false }, docs: [] };
    }
  };
  globalThis.fetch = async () => ({ ok: false });
  console.log('Bundling hook with Firebase test doubles…');
  const result = await build({
    entryPoints: [path.resolve(process.argv[2] || 'src/hooks/useProgressiveStoreLoader.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false,
    external: ['react'], define: { 'import.meta.env.DEV': 'false' }, plugins: [{ name: 'firebase-test-double', setup(b) {
      b.onResolve({ filter: /^firebase\/firestore$|^\.\.\/lib\/firebase$/ }, args => ({ path: args.path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
        args.path === 'firebase/firestore'
          ? 'export const {collection,onSnapshot,getDocsFromServer} = globalThis.__storeTest;'
          : `export const db = {}; export const checkIsStoreClosed = s => s.isClosed || s.suspended || ['expired','suspended'].includes(s.subscriptionStatus);
             export const fetchProductsForStoreFromFirebase = async () => ({products:[],hasMore:false});
             export const fetchOpenRestaurantsFromFirebase = () => {throw Error('Duplicate query')};
             export const fetchAllActiveProductsAndStores = () => {throw Error('Duplicate query')};`
      }));
    }}]
  });
  console.log('Running React lifecycle scenarios…');
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  const useLoader = module.exports.useProgressiveStoreLoader;
  let state;
  let renderedCounts = [];
  function Probe() {
    state = useLoader();
    renderedCounts.push(state.totalOpenCount);
    return React.createElement('div', null, state.isLoadingRestaurants ? 'loading' : String(state.totalOpenCount));
  }
  const stores = Array.from({ length: 10 }, (_, i) => ({ uid: 's' + i, username: 'store' + i, isClosed: false }));
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const deadlines = new Map();
  globalThis.setTimeout = (fn, ms, ...args) => {
    const timer = nativeSetTimeout(fn, ms, ...args);
    if (ms === 15000) deadlines.set(timer, () => fn(...args));
    return timer;
  };
  globalThis.clearTimeout = timer => { deadlines.delete(timer); nativeClearTimeout(timer); };
  const expireDeadline = () => act(async () => {
    for (const [id, fn] of [...deadlines]) { clearTimeout(id); fn(); }
  });
  async function emit(items, fromCache = false, hasPendingWrites = false) {
    await act(async () => listener({ metadata: { fromCache, hasPendingWrites }, forEach: fn => items.forEach(s => fn({ id: s.uid, data: () => s })) }));
  }
  for (const scenario of ['first visit', 'reload with stale session and prefetch']) {
    sessionStorage.clear();
    delete window.__INITIAL_CATALOG_DATA__;
    if (scenario.startsWith('reload')) {
      sessionStorage.setItem('linnk_fast_open_cache', JSON.stringify({ stores: stores.slice(0, 6) }));
      window.__INITIAL_CATALOG_DATA__ = { catalog: { stores: stores.slice(0, 6), products: [] } };
    }
    renderedCounts = [];
    const root = createRoot(document.getElementById('root'));
    const readsBefore = productReads;
    await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Probe))));
    assert.equal(activeListeners, 1);
    assert.equal(productReads - readsBefore, 1, 'StrictMode must reuse the product request');
    assert.equal(state.isLoadingRestaurants, true);
    await emit(stores.slice(0, 6), true);
    assert.equal(state.totalOpenCount, 0);
    await emit(stores, false, true);
    assert.equal(state.isLoadingRestaurants, true);
    await emit(stores);
    assert.equal(state.totalOpenCount, 10);
    assert.equal(state.isLoadingRestaurants, false);
    assert(!renderedCounts.includes(6), 'Never render a partial six-store list');
    // Confirmed updates may arrive over time; each publishes its available names immediately.
    await emit(stores.slice(0, 6));
    assert.equal(state.totalOpenCount, 6);
    await emit(stores);
    assert.equal(state.totalOpenCount, 10);
    const orderBeforePhoto = state.openRestaurants.map(s => s.uid);
    await emit(stores.map((s, i) => i === 9 ? { ...s, photoURL: '/new-logo.webp' } : s));
    assert.deepEqual(state.openRestaurants.map(s => s.uid), orderBeforePhoto, 'Photo changes never reorder existing stores');
    await emit([{ uid: 'new', username: 'new', photoURL: '/new.webp' }, ...stores]);
    assert.deepEqual(state.openRestaurants.map(s => s.uid), [...orderBeforePhoto, 'new'], 'New confirmed stores append without moving existing stores');
    await emit(stores);
    await act(async () => window.dispatchEvent(new window.CustomEvent('linnk:catalog_updated', { detail: { profiles: { s0: { ...stores[0], isClosed: true } } } })));
    assert.equal(state.totalOpenCount, 10, 'Stale catalog cannot overwrite availability');
    await emit(stores.map((s, i) => i === 0 ? { ...s, isClosed: true } : s));
    assert.equal(state.totalOpenCount, 9);
    await emit(stores);
    assert.equal(state.totalOpenCount, 10);
    await emit([]);
    assert.equal(state.totalOpenCount, 0);
    assert.equal(state.isLoadingRestaurants, false);
    assert.deepEqual(state.profilesMap, {});
    // A cache-only reconnect is never presented as confirmed availability.
    await emit(stores);
    await emit(stores, true);
    assert.equal(state.totalOpenCount, 0);
    await expireDeadline();
    assert.equal(state.isLoadingRestaurants, false);
    assert.equal(state.restaurantsError.code, 'deadline-exceeded');
    const beforeRecovery = subscriptions;
    await emit(stores);
    assert.equal(state.totalOpenCount, 10);
    assert.equal(state.restaurantsError, null);
    assert.equal(subscriptions, beforeRecovery, 'Recovery reuses the existing listener');
    await act(async () => window.dispatchEvent(new window.Event('offline')));
    assert.equal(state.restaurantsError.code, 'offline');
    assert.equal(state.totalOpenCount, 0);
    await act(async () => window.dispatchEvent(new window.Event('online')));
    assert.equal(state.isLoadingRestaurants, true);
    await emit(stores);
    await act(async () => listenerError({ code: 'permission-denied' }));
    assert.equal(state.restaurantsError.code, 'permission-denied');
    assert.equal(state.totalOpenCount, 0);
    await act(async () => state.retryRestaurants());
    assert.equal(activeListeners, 1, 'Retry cleans up before attaching another listener');
    assert.equal(state.restaurantsError, null);
    assert.equal(state.isLoadingRestaurants, true);
    // A wholly stalled first response also reaches the bounded error state.
    await expireDeadline();
    assert.equal(state.restaurantsError.code, 'deadline-exceeded');
    assert.equal(state.isLoadingRestaurants, false);
    await emit(stores);
    assert.equal(state.restaurantsError, null);
    await act(async () => root.unmount());
    assert.equal(activeListeners, 0);
    console.log('PASS:', scenario, '— cache ignored, atomic list, live close/open, empty snapshot, cleanup');
  }
  assert.equal(subscriptions, 6, 'Two StrictMode setups plus one explicit retry per mount');
  assert.equal(deadlines.size, 0, 'All timeout handles cleaned up');
  globalThis.setTimeout = nativeSetTimeout;
  globalThis.clearTimeout = nativeClearTimeout;
  dom.window.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
