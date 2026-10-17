import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/orderNotificationSound.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function setup() {
  const sources = [];
  const urls = [];
  const listeners = {};
  class AudioContext {
    state = 'running';
    destination = {};
    resume() { this.state = 'running'; return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve({ duration: 3 }); }
    createBufferSource() {
      const item = { connect() {}, disconnect() {}, start() { sources.push(item); } };
      return item;
    }
  }
  const context = { exports: {}, console,
    window: { AudioContext, addEventListener(name, callback) { listeners[name] = callback; } },
    fetch: async url => { urls.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; }
  };
  vm.runInNewContext(code, context);
  return { play: context.exports.playOrderNotificationSound, sources, urls, listeners };
}

test('plays supplied MP3 once for simultaneous notification channels and reuses buffer', async () => {
  const { play, sources, urls } = setup();
  await Promise.all([play(), play(), play()]);
  assert.equal(sources.length, 1);
  assert.deepEqual(urls, ['/sounds/ryyco-notificacion-3-segundos.mp3']);
  sources[0].onended();
  await play();
  assert.equal(sources.length, 2);
  assert.equal(urls.length, 1);
});

test('user gesture prepares sound without playing an unsolicited notification', async () => {
  const { listeners, sources, play } = setup();
  listeners.pointerdown();
  await play();
  assert.equal(sources.length, 1);
});
