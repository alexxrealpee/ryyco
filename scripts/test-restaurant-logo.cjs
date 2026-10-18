const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
async function main() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const result = await build({ entryPoints: ['src/components/RestaurantLogo.tsx'], bundle: true,
    write: false, platform: 'node', format: 'cjs', external: ['react', 'react/jsx-runtime'] });
  const m = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, m, m.exports);
  const Logo = m.exports.default;
  let parentRenders = 0;
  function List() {
    parentRenders++;
    return React.createElement('section', null,
      ['Alpha', 'Beta'].map(name => React.createElement('button', { key: name },
        React.createElement(Logo, { src: '/' + name + '.webp', name, priority: name === 'Alpha' }),
        React.createElement('span', null, name))));
  }
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(List)));
  const buttons = [...document.querySelectorAll('button')];
  const images = [...document.querySelectorAll('img')];
  assert.equal(buttons.length, 2);
  assert(buttons[0].textContent.includes('Alpha'));
  assert(images.every(img => img.dataset.logoState === 'loading'));
  await act(async () => images[0].dispatchEvent(new dom.window.Event('load')));
  assert.equal(images[0].dataset.logoState, 'loaded');
  assert.equal(images[1].dataset.logoState, 'loading');
  await act(async () => images[1].dispatchEvent(new dom.window.Event('error')));
  assert.equal(images[1].dataset.logoState, 'error');
  assert.equal(parentRenders, 1, 'Logo completion never updates the list or counter');
  assert.equal(document.querySelectorAll('button')[0], buttons[0]);
  assert.equal(document.querySelectorAll('button')[1], buttons[1]);
  assert(buttons[1].textContent.includes('Beta'));
  await act(async () => root.unmount());
  dom.window.close();
  console.log('PASS logos: immediate names, independent downloads and failures, stable buttons and parent render');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
