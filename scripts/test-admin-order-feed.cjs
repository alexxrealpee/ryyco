const assert = require('node:assert/strict');
const { test } = require('node:test');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

test('admin orders load four at a time and preserve the cursor around live updates', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin?tab=orders' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const arrivals = [];
  const requests = [];
  let receive, rejectLive, finishPage, rejectPage, unsubscribed = 0;
  globalThis.adminOrderTest = {
    deduplicateOrders: rows => rows,
    subscribeToRecentAdminOrders: (next, error) => {
      receive = next;
      rejectLive = error;
      return () => unsubscribed++;
    },
    fetchAdminOrdersBatch: cursor => {
      requests.push(cursor.id);
      return new Promise((resolve, reject) => { finishPage = resolve; rejectPage = reject; });
    }
  };

  const result = await build({
    entryPoints: ['src/hooks/useAdminOrderFeed.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react'], plugins: [{ name: 'order-firebase-mock', setup(builder) {
      builder.onResolve({ filter: /^\.\.\/lib\/firebase$/ }, () => ({ path: 'firebase', namespace: 'mock-orders' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock-orders' }, () => ({
        contents: 'export const { deduplicateOrders, subscribeToRecentAdminOrders, fetchAdminOrdersBatch } = globalThis.adminOrderTest;'
      }));
    } }]
  });
  const moduleObject = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, moduleObject, moduleObject.exports);
  const { useAdminOrderFeed } = moduleObject.exports;
  const makeOrder = n => ({ id: String(n).padStart(2, '0'), createdAt: new Date(n * 1000).toISOString(), status: 'pending' });
  const page = (...numbers) => {
    const orders = numbers.map(makeOrder);
    const tail = orders.at(-1);
    return { orders, hasMore: orders.length === 4, lastDoc: tail ? { id: tail.id, get: () => tail.createdAt } : null };
  };
  let state;
  function Probe() {
    state = useAdminOrderFeed((latest, incoming) => arrivals.push(...incoming.map(order => order.id)));
    return null;
  }
  const root = createRoot(dom.window.document.getElementById('root'));
  const ids = () => state.orders.map(order => order.id);
  const { act } = React;
  try {
    await act(async () => root.render(React.createElement(Probe)));
    assert.equal(state.loading, true);
    await act(async () => receive(page(8, 7, 6, 5)));
    assert.deepEqual(ids(), ['08', '07', '06', '05']);
    assert.deepEqual(requests, []);
    assert.deepEqual(arrivals, []);

    await act(async () => { void state.loadNext(); void state.loadNext(); });
    assert.deepEqual(requests, ['05'], 'simultaneous scroll events share one request');
    await act(async () => receive(page(9, 8, 7, 6)));
    assert.deepEqual(arrivals, ['09']);
    await act(async () => finishPage(page(4, 3, 2, 1)));
    assert.deepEqual(ids(), ['09', '08', '07', '06', '05', '04', '03', '02', '01']);

    await act(async () => { void state.loadNext(); });
    assert.equal(requests.at(-1), '01');
    await act(async () => rejectPage(Error('offline')));
    assert.match(state.error, /siguientes pedidos/);
    await act(async () => { void state.retry(); });
    assert.equal(requests.at(-1), '01', 'retry keeps the last confirmed cursor');
    await act(async () => finishPage(page()));
    assert.equal(state.hasMore, false);

    await act(async () => receive(page(8, 7, 6, 5)));
    assert(!ids().includes('09'), 'a removed order within the recent window is removed');
    assert.deepEqual(arrivals, ['09'], 'an older order returning to the live window is not a new order');

    await act(async () => receive(page(20, 19, 18, 17)));
    assert.deepEqual(ids(), ['20', '19', '18', '17'], 'a burst cannot leave a hole above cached history');
    await act(async () => { void state.loadNext(); });
    assert.equal(requests.at(-1), '17');
    await act(async () => finishPage(page(16, 15, 14, 13)));
    assert.equal(ids().length, 8);

    await act(async () => rejectLive(Error('stream closed')));
    assert.match(state.error, /sincronizar/);
    await act(async () => { await state.retry(); });
    assert.equal(unsubscribed, 1);
    assert.equal(state.loading, true);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.adminOrderTest;
  }
});
