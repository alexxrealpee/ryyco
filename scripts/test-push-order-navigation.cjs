const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('cold-start order destination waits for authorized data and opens once', () => {
  let href = 'https://localhost/?view=seller&tab=orders&pushOrder=order-42';
  let cleanup;
  const listeners = new Map(), opened = [];
  const window = {
    location: { get href() { return href; } },
    history: { replaceState: (_, __, url) => { href = new URL(url, href).href; } },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name)
  };
  const react = { useRef: value => ({ current: value }), useEffect: fn => { cleanup?.(); cleanup = fn(); } };
  const context = { exports: {}, require: () => react, URL, window };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/usePushOrderNavigation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, context);
  const render = orders => context.exports.usePushOrderNavigation('seller', orders, order => opened.push(order.id), () => {});
  render([]);
  assert(href.includes('pushOrder=order-42'));
  render([{ id: 'another-store-order' }]);
  assert.equal(opened.length, 0);
  render([{ id: 'order-42' }]);
  assert.deepEqual(opened, ['order-42']);
  assert(!href.includes('pushOrder'));
  listeners.get('popstate')();
  assert.equal(opened.length, 1);
  cleanup();
  assert.equal(listeners.size, 0);
});
