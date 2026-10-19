const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');

async function main() {
  const dom = new JSDOM(`<div id="modal" style="position:fixed;top:0;bottom:0;width:390px">
    <header><input id="search" type="search"></header>
    <section style="overflow-y:auto"><input id="address"><textarea></textarea><select><option>A</option></select></section>
    </div><input id="outside"><input id="checkbox" type="checkbox">`, { pretendToBeVisual: true });
  const win = dom.window;
  Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement,
    HTMLInputElement: win.HTMLInputElement, getComputedStyle: win.getComputedStyle.bind(win) });
  const viewport = new win.EventTarget();
  Object.assign(viewport, { height: 844, offsetTop: 0, scale: 1 });
  Object.defineProperty(win, 'visualViewport', { value: viewport, configurable: true });
  const mobile = new win.EventTarget();
  mobile.matches = true;
  win.matchMedia = () => mobile;
  let width = 390, height = 844;
  Object.defineProperty(document.documentElement, 'clientWidth', { get: () => width });
  Object.defineProperty(document.documentElement, 'clientHeight', { get: () => height });
  Object.defineProperty(win, 'innerHeight', { get: () => height });
  const frames = new Map(); let id = 0;
  win.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  win.cancelAnimationFrame = key => frames.delete(key);
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); };
  const resize = (visibleHeight, top = 0) => {
    viewport.height = visibleHeight; viewport.offsetTop = top;
    viewport.dispatchEvent(new win.Event('resize')); flush();
  };
  const rect = (top, bottom, w = 390) => ({ top, bottom, left: 0, right: w, width: w, height: bottom - top });
  const modal = document.querySelector('#modal');
  modal.getBoundingClientRect = () => rect(0, 844);
  const panel = document.querySelector('section');
  Object.defineProperty(panel, 'scrollHeight', { value: 1100 });
  Object.defineProperty(panel, 'clientHeight', { value: 360 });
  let internalScrolls = 0, pageScrolls = 0;
  panel.scrollBy = ({ top }) => { internalScrolls++; panel.scrollTop += top; };
  win.scrollBy = () => pageScrolls++;
  const address = document.querySelector('#address');
  address.getBoundingClientRect = () => rect(500 - panel.scrollTop, 536 - panel.scrollTop);
  const search = document.querySelector('#search');
  search.getBoundingClientRect = () => rect(60, 96);
  document.querySelector('textarea').getBoundingClientRect = () => rect(50, 90);
  document.querySelector('select').getBoundingClientRect = () => rect(50, 90);

  const result = await build({ entryPoints: ['src/lib/mobileInputViewport.ts'], bundle: true,
    platform: 'node', format: 'cjs', write: false });
  const m = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, m, m.exports);
  const install = m.exports.installMobileInputViewport;
  const stop = install(); flush();
  address.focus(); flush();
  assert.equal(internalScrolls, 0, 'Focus alone does not force scrolling before keyboard opens');
  resize(360);
  assert(modal.hasAttribute('data-ryyco-keyboard-overlay'));
  assert(panel.hasAttribute('data-ryyco-keyboard-panel'));
  assert.equal(document.documentElement.style.getPropertyValue('--ryyco-visible-height'), '360px');
  assert.equal(internalScrolls, 1, 'Only the occluded form container scrolls');
  assert.equal(pageScrolls, 0, 'No background page jump inside a modal');
  viewport.offsetTop = 24;
  viewport.dispatchEvent(new win.Event('scroll')); flush();
  assert.equal(internalScrolls, 1, 'Reading or scrolling while typing must not force refocus');
  assert.equal(document.documentElement.style.getPropertyValue('--ryyco-visible-top'), '24px');
  search.focus(); flush();
  assert(!panel.hasAttribute('data-ryyco-keyboard-panel'));
  assert(document.querySelector('header').hasAttribute('data-ryyco-keyboard-panel'));
  assert.equal(internalScrolls, 1, 'Already visible input is not scrolled');
  document.querySelector('textarea').focus(); flush();
  assert(panel.hasAttribute('data-ryyco-keyboard-panel'), 'Textareas share the global handling');
  document.querySelector('select').focus(); flush();
  assert(panel.hasAttribute('data-ryyco-keyboard-panel'), 'Selects share the global handling');
  modal.setAttribute('data-ryyco-managed-viewport', 'chat');
  const previousScrolls = internalScrolls;
  resize(300);
  assert(!modal.hasAttribute('data-ryyco-keyboard-overlay'), 'Chat manages its own viewport');
  assert(!panel.hasAttribute('data-ryyco-keyboard-panel'), 'Chat panel must not become a generic scroll container');
  assert.equal(internalScrolls, previousScrolls, 'Global handler never scrolls managed chat');
  modal.removeAttribute('data-ryyco-managed-viewport');
  viewport.scale = 2; resize(220);
  assert(!modal.hasAttribute('data-ryyco-keyboard-overlay'), 'Manual pinch zoom remains under user control');
  assert.equal(pageScrolls, 0);
  viewport.scale = 1; resize(844);
  assert(!modal.hasAttribute('data-ryyco-keyboard-overlay'), 'Original modal layout returns after keyboard closes');
  resize(780);
  assert(!modal.hasAttribute('data-ryyco-keyboard-overlay'), 'Browser toolbar movement is not a keyboard');
  width = 844; height = 390; resize(390);
  assert(!modal.hasAttribute('data-ryyco-keyboard-overlay'), 'Rotation resets the height baseline');
  mobile.matches = false; resize(200);
  assert(!modal.hasAttribute('data-ryyco-keyboard-overlay'), 'Desktop layout is untouched');
  mobile.matches = true; document.querySelector('#checkbox').focus(); flush(); resize(180);
  assert(!modal.hasAttribute('data-ryyco-keyboard-overlay'), 'Non-text input does not trigger keyboard layout');
  stop(); resize(160);
  assert.equal(frames.size, 0, 'Cleanup removes viewport listeners');
  assert.equal(document.documentElement.style.getPropertyValue('--ryyco-visible-height'), '');
  Object.defineProperty(win, 'visualViewport', { value: null });
  assert.doesNotThrow(() => install()(), 'Older browsers retain their native viewport behavior');
  dom.window.close();
  console.log('PASS mobile inputs: visible and obscured fields, modal scrolling, focus changes, textarea/select, pinch zoom, toolbar, rotation, desktop, cleanup, fallback');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
