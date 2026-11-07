const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  const sent = [], transcripts = [], states = [], errors = [], sessions = [];
  const track = { enabled: true, stops: 0, stop() { this.stops++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  let captures = 0;
  class Transport {
    constructor(config) { this.options = config; this.handlers = {}; }
    on(name, fn) { this.handlers[name] = fn; }
    updateSessionConfig() {}
    sendEvent(event) { sent.push(event); }
  }
  class Session {
    constructor(agent, config) { sessions.push(this); this.events = {}; this.config = config.config; this.transport = config.transport; }
    on(name, fn) { this.events[name] = fn; }
    async connect(config) {
      assert.equal(config.apiKey, 'test-session');
      this.peer = new EventTarget();
      await this.transport.options.changePeerConnection(this.peer);
      await options.connect?.();
      if (!options.deferReady) {
        this.events.transport_event({ type: 'session.updated' });
        this.audioReady();
      }
    }
    audioReady() {
      const event = new Event('track');
      event.track = { kind: 'audio', readyState: 'live' };
      this.peer.dispatchEvent(event);
    }
    interrupt() { sent.push({ type: 'interrupted' }); }
    close() { this.closed = true; }
  }
  const catalog = { version: 1, stores: [], products: [], profilesMap: {}, isLoaded: true };
  const modules = {
    '@openai/agents': { tool: definition => definition },
    '@openai/agents/realtime': { RealtimeSession: Session, OpenAIRealtimeWebRTC: Transport, RealtimeAgent: class {} },
    zod: require('zod'), './firebase': {}, './cartHelper': {},
    './catalogManager': { getClientAvailableCatalog: () => catalog, subscribeToAvailableCatalog: () => () => {}, isRestaurantOpenNow: () => false },
    './apiConfig': { smartApiFetch: options.fetch || (async () => new Response(JSON.stringify({ value: 'test-session' }))) },
  };
  const context = { exports: {}, require: name => modules[name], console: { log() {}, warn() {} }, setTimeout, clearTimeout, AbortSignal, AbortController,
    navigator: { mediaDevices: { getUserMedia: async () => { captures++; return options.microphone ? options.microphone() : stream; } } }, window: {},
    Audio: class { paused = false; play() { return Promise.resolve(); } pause() {} },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/realtimeMeseroAgent.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const manager = new context.exports.RealtimeMeseroManager({ onStateChange: state => states.push(state), onTranscriptDelta: (text, final, sender) => transcripts.push({ text, final, sender }), onError: error => errors.push(error) });
  return { manager, sent, transcripts, states, errors, sessions, track, stream, captures: () => captures,
    event: event => sessions.at(-1).events.transport_event(event) };
}
test('single captured stream reaches WebRTC and microphone is enabled', async () => {
  const t = setup();
  try {
    await t.manager.start();
    assert.equal(t.captures(), 1);
    assert.equal(t.sessions[0].transport.options.mediaStream, t.stream);
    assert(t.sessions[0].transport.options.audioElement);
    assert.equal(t.track.enabled, true);
    assert(t.states.includes('connecting'));
  } finally { t.manager.stop(); }
});
test('greeting waits for both confirmed session and live audio, and happens once', async () => {
  for (const audioFirst of [false, true]) {
    const t = setup({ deferReady: true });
    try {
      const starting = t.manager.start({ shouldGreet: true });
      while (!t.sessions.at(-1)?.peer) await tick();
      await tick();
      const acknowledge = () => t.event({ type: 'session.updated' });
      const audio = () => t.sessions[0].audioReady();
      t.manager.triggerInitialGreeting();
      (audioFirst ? audio : acknowledge)(); await tick();
      assert.equal(t.manager.getIsConnected(), false);
      assert.equal(t.track.enabled, false);
      assert.equal(t.states.at(-1), 'connecting');
      assert.equal(t.sent.filter(e => e.type === 'response.create').length, 0);
      (audioFirst ? acknowledge : audio)(); await starting;
      acknowledge(); audio(); t.manager.triggerInitialGreeting();
      assert.equal(t.manager.getIsConnected(), true);
      assert.equal(t.track.enabled, true);
      assert.equal(t.sent.filter(e => e.type === 'response.create').length, 1);
    } finally { t.manager.stop(); }
  }
});
test('cancel while waiting for readiness never greets; a new call can start', async () => {
  const t = setup({ deferReady: true });
  const starting = t.manager.start({ shouldGreet: true });
  const rejected = assert.rejects(starting, /finalizada/);
  while (!t.sessions.at(-1)?.peer) await tick();
  t.manager.stop(); await rejected;
  t.event({ type: 'session.updated' }); t.sessions[0].audioReady(); await tick();
  assert.equal(t.sent.filter(e => e.type === 'response.create').length, 0);
  assert(t.track.stops > 0);
  try {
    const restart = t.manager.start({ shouldGreet: true });
    while (t.sessions.length < 2 || !t.sessions[1].peer) await tick();
    t.event({ type: 'session.updated' }); t.sessions[1].audioReady(); await restart;
    assert.equal(t.sent.filter(e => e.type === 'response.create').length, 1);
  } finally { t.manager.stop(); }
});
test('noise does not interrupt; human speech waits for cancellation before one new response', async () => {
  const t = setup();
  try {
    await t.manager.start();
    assert.equal(t.sessions[0].config.audio.input.turnDetection.interruptResponse, false);
    t.event({ type: 'response.created' });
    t.event({ type: 'input_audio_buffer.speech_started' });
    t.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'noise', transcript: '[ruido]' });
    assert.equal(t.sent.length, 0);
    const speech = { type: 'conversation.item.input_audio_transcription.completed', item_id: 'human', transcript: 'Quiero una hamburguesa' };
    t.event(speech); t.event(speech);
    assert.equal(t.sent.filter(e => e.type === 'interrupted').length, 1);
    assert.equal(t.sent.filter(e => e.type === 'response.create').length, 0);
    t.event({ type: 'response.done', response: { status: 'cancelled' } });
    assert.equal(t.sent.filter(e => e.type === 'response.create').length, 1);
    assert.equal(t.transcripts.filter(e => e.sender === 'user').length, 1);
  } finally { t.manager.stop(); }
});
test('duplicate transcript ignored; completion does not hide continuing audio', async () => {
  const t = setup();
  try {
    await t.manager.start(); t.event({ type: 'response.created' }); t.sessions[0].events.audio_start();
    const delta = { type: 'response.output_audio_transcript.delta', event_id: 'delta-1', delta: 'Hola' };
    t.event(delta); t.event(delta);
    assert.deepEqual(t.transcripts.map(t => t.text), ['Hola']);
    t.event({ type: 'response.output_audio_transcript.done', transcript: 'Hola' });
    t.event({ type: 'response.done' }); assert.equal(t.states.at(-1), 'speaking');
    t.sessions[0].events.audio_stopped(); assert.equal(t.states.at(-1), 'listening');
  } finally { t.manager.stop(); }
});
test('cancel during microphone permission releases late stream and never connects', async () => {
  const mic = deferred(), t = setup({ microphone: () => mic.promise });
  const starting = t.manager.start(); const rejected = assert.rejects(starting, /finalizada/);
  t.manager.stop(); mic.resolve(t.stream); await rejected; await tick();
  assert.equal(t.sessions.length, 0); assert(t.track.stops > 0); assert.equal(t.manager.getIsConnected(), false);
});
test('cancel during connect ignores late events and cannot revive old call', async () => {
  const connecting = deferred(), t = setup({ connect: () => connecting.promise });
  const starting = t.manager.start(); const rejected = assert.rejects(starting, /finalizada/);
  while (!t.sessions.length) await tick();
  t.manager.stop(); connecting.resolve(); await rejected;
  t.sessions[0].events.audio_start();
  assert.equal(t.states.at(-1), 'idle'); assert(t.sessions[0].closed); assert.equal(t.manager.getIsConnected(), false);
});
test('disconnect releases microphone and reports error', async () => {
  const t = setup(); await t.manager.start();
  t.sessions[0].transport.handlers.connection_change('disconnected');
  assert.equal(t.manager.getIsConnected(), false); assert(t.track.stops > 0); assert.equal(t.errors.length, 1);
});
