const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

async function bundle(entry, mocks = {}) {
  const output = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs',
    packages: 'external', write: false, plugins: [{ name: 'tracking-mocks', setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        const key = args.path.endsWith('/lib/firebase') ? 'hook' : args.path;
        if (mocks[key]) return { path: key, namespace: 'mock' };
      });
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
    } }] });
  const m = { exports: {} };
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, m, m.exports);
  return m.exports;
}

async function main() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  let clock = 1_800_000_000_000;
  const realNow = Date.now;
  Date.now = () => clock;
  const policy = await bundle('src/lib/deliveryTracking.ts');
  const position = (meters = 0, accuracy = 5, age = 0) => ({ timestamp: clock - age,
    coords: { latitude: 0.83 + meters / 111_195, longitude: -77.64, accuracy, heading: null, speed: 2 } });
  let point = policy.acceptGpsPosition(position(), null, clock);
  assert(point);
  assert.equal(policy.acceptGpsPosition(position(0, 150), point, clock), null);
  assert.equal(policy.acceptGpsPosition(position(0, 5, 20_000), null, clock), null);
  assert.equal(policy.acceptGpsPosition(position(), point, clock), null);
  clock += 4_000;
  assert.equal(policy.acceptGpsPosition(position(10_000), point, clock), null);
  const moved = policy.acceptGpsPosition(position(10), point, clock);
  assert(moved && policy.shouldSendGps(moved, point, 4_000));
  assert(!policy.shouldSendGps(moved, point, 2_000));
  assert(!policy.shouldSendGps(point, point, 29_000));
  assert(policy.shouldSendGps(point, point, 30_000));
  assert(policy.validCoordinates(0, 0));
  assert(!policy.validCoordinates(NaN, 90));
  console.log('PASS GPS: age, accuracy, duplicates, impossible jumps, movement and stationary budget.');

  // Deterministic RAF verifies interpolation stops at an actual received coordinate.
  let frames = new Map(), frameId = 0, rendered;
  window.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  let animationTime = 0;
  const realPerformance = globalThis.performance;
  globalThis.performance = { now: () => animationTime };
  const cancel = policy.animateGps(point, moved, value => { rendered = value; });
  for (animationTime = 0; animationTime <= 3000; animationTime += 100) {
    const batch = [...frames.values()]; frames.clear(); batch.forEach(cb => cb(animationTime));
  }
  assert.equal(frames.size, 0);
  assert.equal(rendered.lat, moved.lat);
  assert.equal(rendered.lng, moved.lng);
  const cancelEarly = policy.animateGps(point, moved, () => {}); cancelEarly(); cancel();
  assert.equal(frames.size, 0);
  globalThis.performance = realPerformance;
  console.log('PASS animation: bounded interpolation and cancellation, no extrapolation.');

  const bridge = { calls: [], stops: [], pending: [], callback: null, watchCount: 0, clears: 0 };
  globalThis.__trackingTest = bridge;
  Object.defineProperty(navigator, 'geolocation', { value: {
    watchPosition(cb) { bridge.callback = cb; bridge.watchCount++; return bridge.watchCount; },
    clearWatch() { bridge.clears++; },
    getCurrentPosition() { throw new Error('Duplicate GPS request'); },
  } });
  const realInterval = globalThis.setInterval, realClear = globalThis.clearInterval;
  let intervals = new Map(), timerId = 0;
  globalThis.setInterval = cb => { intervals.set(++timerId, cb); return timerId; };
  globalThis.clearInterval = id => intervals.delete(id);
  const { useDriverLiveTracking } = await bundle('src/hooks/useDriverLiveTracking.ts', { hook: `
    export const updateDeliveryLiveLocation=data=>new Promise((resolve,reject)=>{globalThis.__trackingTest.calls.push(data);globalThis.__trackingTest.pending.push({resolve,reject})});
    export const stopDeliveryTracking=(id,status)=>{globalThis.__trackingTest.stops.push({id,status});return Promise.resolve()};
  ` });
  let result;
  function Probe(props) { result = useDriverLiveTracking(props); return null; }
  const root = createRoot(document.getElementById('root'));
  const order = { id: 'test-order', status: 'delivering', deliveryStep: 'to_client', orderNumber: 1 };
  const driver = { id: 'driver-test', firstName: 'Test', phone: '' };
  const render = async activeDelivery => React.act(async () => root.render(React.createElement(Probe, { activeDelivery, driver })));
  await render(null);
  assert.equal(bridge.watchCount, 0, 'No GPS observer without an active delivery');
  await render(order);
  assert.equal(bridge.watchCount, 1);
  await React.act(async () => bridge.callback(position()));
  assert.equal(bridge.calls.length, 1);
  clock += 4_000;
  await React.act(async () => bridge.callback(position(10)));
  clock += 4_000;
  await React.act(async () => bridge.callback(position(20)));
  assert.equal(bridge.calls.length, 1, 'Only one GPS write is in flight');
  await React.act(async () => bridge.pending.shift().resolve());
  clock += 4_000;
  await React.act(async () => [...intervals.values()].forEach(cb => cb()));
  assert.equal(bridge.calls.length, 2);
  assert.equal(bridge.calls[1].lat, position(20).coords.latitude, 'Intermediate pending samples are coalesced');
  await React.act(async () => bridge.pending.shift().reject(Object.assign(new Error('offline'), { code: 'unavailable' })));
  assert(result.error.includes('reintentará'));
  clock += 4_000;
  await React.act(async () => [...intervals.values()].forEach(cb => cb()));
  assert.equal(bridge.calls.length, 3);
  await React.act(async () => bridge.pending.shift().resolve());
  const watchesBeforeStep = bridge.watchCount;
  await render({ ...order, deliveryStep: 'at_destination' });
  assert.equal(bridge.watchCount, watchesBeforeStep, 'Delivery step must not recreate GPS watch');
  clock += 31_000;
  await React.act(async () => [...intervals.values()].forEach(cb => cb()));
  assert.equal(bridge.calls.at(-1).gpsTimestamp, undefined, 'Heartbeat does not renew GPS fix time');
  await React.act(async () => bridge.pending.shift().resolve());
  clock += 46_000;
  const previousWatch = bridge.callback;
  const previousCount = bridge.calls.length;
  await React.act(async () => document.dispatchEvent(new window.Event('visibilitychange')));
  assert.equal(bridge.watchCount, watchesBeforeStep + 1, 'Resume replaces a suspended watch');
  await React.act(async () => previousWatch(position(100)));
  assert.equal(bridge.calls.length, previousCount, 'Late callback from the replaced watch is ignored');
  await React.act(async () => bridge.callback(position(30)));
  assert.equal(bridge.calls.length, previousCount + 1, 'Fresh GPS resumes transmission');
  await React.act(async () => bridge.pending.shift().resolve());
  await render({ ...order, status: 'cancelled' });
  assert.equal(bridge.stops.at(-1).status, 'cancelled');
  const count = bridge.calls.length;
  await React.act(async () => bridge.callback(position(100)));
  assert.equal(bridge.calls.length, count, 'Callbacks after cancellation do not send GPS');
  assert.equal(intervals.size, 0);
  const secondOrder = { ...order, id: 'test-delivered-order' };
  await render(secondOrder);
  await React.act(async () => bridge.callback(position(40)));
  await React.act(async () => bridge.pending.shift().resolve());
  await render({ ...secondOrder, status: 'delivered', deliveryStep: 'delivered' });
  assert.deepEqual(bridge.stops.at(-1), { id: secondOrder.id, status: 'delivered' });
  assert.equal(intervals.size, 0);
  await React.act(async () => root.unmount());
  globalThis.setInterval = realInterval; globalThis.clearInterval = realClear;
  console.log('PASS transmitter: single watch, one write, latest sample, recovery, heartbeat and cancellation.');

  const markerState = { position: null };
  globalThis.__googleTrackingMarker = markerState;
  const { AnimatedCourierMarker } = await bundle('src/components/AnimatedCourierMarker.tsx', {
    '@vis.gl/react-google-maps': `
      import React from 'react';
      export function useAdvancedMarkerRef(){const[marker,setMarker]=React.useState(null);return[React.useCallback(value=>setMarker(value),[]),marker]}
      export const AdvancedMarker=React.forwardRef((props,ref)=>{
        React.useLayoutEffect(()=>{ref(globalThis.__googleTrackingMarker);return()=>ref(null)},[ref]);
        return React.createElement('div',null,props.children)
      });
    `,
  });
  const googleRoot = createRoot(document.getElementById('root'));
  const showGoogle = point => React.act(async () => googleRoot.render(React.createElement(AnimatedCourierMarker,
    { point, enabled: true, identity: 'test' }, React.createElement('span', { 'data-courier-heading': true }, 'moto'))));
  await showGoogle(point);
  assert.equal(markerState.position.lat, point.lat);
  await showGoogle(moved);
  for (let t = realPerformance.now(); frames.size && t < realPerformance.now() + 5000; t += 500) {
    const batch = [...frames.values()]; frames.clear(); batch.forEach(cb => cb(t));
  }
  assert.equal(markerState.position.lat, moved.lat);
  await React.act(async () => googleRoot.unmount());
  assert.equal(frames.size, 0);
  console.log('PASS Google marker adapter: imperative movement and animation cleanup (mock Maps API).');

  // Service queue and snapshot chronology without connecting to any real order.
  const store = { operations: [], callbacks: [], auth: { uid: 'auth-driver' } };
  globalThis.__trackingStore = store;
  const { createDeliveryTrackingService } = await bundle('src/lib/deliveryTrackingService.ts', {
    'firebase/auth': `export const getAuth=()=>({currentUser:globalThis.__trackingStore.auth});`,
    'firebase/firestore': `
      export const doc=(_,collection,id)=>({collection,id});
      export const serverTimestamp=()=>({server:true});
      export const deleteField=()=>({delete:true});
      export const setDoc=(ref,data)=>new Promise((resolve,reject)=>globalThis.__trackingStore.operations.push({ref,data,resolve,reject}));
      export const updateDoc=setDoc;
      export const onSnapshot=(_,options,next,error)=>{globalThis.__trackingStore.callbacks.push({next,error,options});return()=>{}};
    `,
  });
  const api = createDeliveryTrackingService({});
  const write = api.updateDeliveryLiveLocation({ orderId: 'o', driverId: 'd', lat: 0, lng: 0, heading: undefined, gpsTimestamp: clock });
  const stopped = api.stopDeliveryTracking('o', 'cancelled');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(store.operations.length, 1);
  assert(!('heading' in store.operations[0].data));
  store.operations[0].resolve(); await write;
  await Promise.resolve(); await Promise.resolve();
  assert.equal(store.operations[1].data.status, 'cancelled');
  assert(store.operations[1].data.lat.delete);
  store.operations[1].resolve(); await stopped;
  const received = [], states = [];
  api.listenToDeliveryTracking('o', data => received.push(data), state => states.push(state));
  const snapshot = (gps, cached = false, server = gps) => ({ id: 'o', exists: () => true,
    metadata: { fromCache: cached, hasPendingWrites: false }, data: () => ({ lat: 0, lng: 0, gpsTimestamp: gps, serverUpdatedAt: { toMillis: () => server }, isTrackingActive: true }) });
  const listener = store.callbacks[0];
  listener.next(snapshot(clock, true));
  listener.next(snapshot(clock, false));
  listener.next(snapshot(clock - 1000, false, clock + 1));
  assert.equal(received.length, 2, 'Older fixes cannot rewind the marker');
  assert.deepEqual(states.slice(0, 2), ['cached', 'live']);
  listener.error({ code: 'permission-denied' });
  assert.equal(states.at(-1), 'error');
  store.auth = null;
  await assert.rejects(api.updateDeliveryLiveLocation({ orderId: 'o', driverId: 'd' }), error => error.code === 'permission-denied');
  Date.now = realNow;
  dom.window.close();
  console.log('PASS Firestore service: serialized stop, undefined filtering, chronology, cache metadata and permissions.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
