import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('__CATALOG_PREFETCH__'));
const catalog = { success: true, catalog: { stores: [], products: [] } };
const response = data => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => data });

function run(fetch) {
  const timers = new Map();
  const context = { window: {}, AbortController, fetch,
    setTimeout(callback, delay) { timers.set(1, { callback, delay }); return 1; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(bootstrap, context);
  return { context, timers };
}

test('successful bootstrap fetches catalog once and clears deadline', async () => {
  const urls = [];
  const { context, timers } = run(async url => { urls.push(url); return response(catalog); });
  assert.equal(await context.window.__CATALOG_PREFETCH__, catalog);
  assert.equal(context.window.__INITIAL_CATALOG_DATA__, catalog);
  assert.deepEqual(urls, ['/api/catalog/available?initial=true']);
  assert.equal(timers.size, 0);
});

test('slow API is aborted after 2500ms and falls back to static catalog', async () => {
  const urls = [];
  const { context, timers } = run((url, options) => {
    urls.push(url);
    if (!options) return Promise.resolve(response(catalog));
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))));
  });
  assert.equal(timers.get(1).delay, 2500);
  timers.get(1).callback();
  assert.equal(await context.window.__CATALOG_PREFETCH__, catalog);
  assert.deepEqual(urls, ['/api/catalog/available?initial=true', '/catalog-initial.json']);
  assert.equal(timers.size, 0);
});

test('offline bootstrap resolves without an unhandled rejection', async () => {
  const { context, timers } = run(async () => { throw new Error('offline'); });
  assert.equal(await context.window.__CATALOG_PREFETCH__, null);
  assert.equal(timers.size, 0);
});
