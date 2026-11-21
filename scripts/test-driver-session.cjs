const {test} = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const {readFileSync} = require('node:fs');
const output = ts.transpileModule(readFileSync('src/lib/driverSessionObserver.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exported={};
new Function('exports',output)(exported);
function harness() {
  let next, error, stops=0;
  const states=[], requests=[];
  const stop=exported.observeDriverSession((n,e)=>{next=n;error=e;return()=>stops++;},user=>new Promise((resolve,reject)=>requests.push({user,resolve,reject})),state=>states.push(state));
  return {states,requests,next:user=>next(user),error:()=>error(),stop,stops:()=>stops};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('waits for Firebase hydration and valid registered driver without login flash',async()=>{
 const h=harness();
 assert.equal(h.states.at(-1).checking,true);
 h.next({uid:'driver'});
 assert.ok(h.states.every(s=>s.checking));
 h.requests[0].resolve({id:'registered'});await flush();
 assert.equal(h.states.at(-1).driver.id,'registered');
 assert.equal(h.states.at(-1).checking,false);h.stop();
});
test('anonymous and unregistered users remain on login; Google uses same observer',async()=>{
 const h=harness();h.next(null);
 assert.equal(h.states.at(-1).driver,null);assert.equal(h.states.at(-1).checking,false);
 assert.equal(h.requests.length,0);
 h.next({uid:'buyer'});h.requests[0].resolve(null);await flush();
 assert.match(h.states.at(-1).error,/regístrate/);
 h.next({uid:'registered'});h.requests[1].resolve({id:'driver'});await flush();
 assert.equal(h.states.at(-1).driver.id,'driver');h.stop();
});
test('expired sessions and Firestore failures end loading without granting access',async()=>{
 const h=harness();h.next({uid:'expired'});h.requests[0].reject(new Error('expired'));await flush();
 assert.equal(h.states.at(-1).checking,false);assert.equal(h.states.at(-1).driver,null);assert.ok(h.states.at(-1).error);
 h.error();assert.equal(h.states.at(-1).checking,false);h.stop();
});
test('logout, account switch and unmount invalidate late verifications',async()=>{
 const h=harness();h.next({uid:'old'});h.next(null);
 h.requests[0].resolve({id:'old'});await flush();assert.equal(h.states.at(-1).driver,null);
 h.next({uid:'first'});h.next({uid:'second'});
 h.requests[2].resolve({id:'second'});await flush();
 h.requests[1].resolve({id:'first'});await flush();assert.equal(h.states.at(-1).driver.id,'second');
 h.next({uid:'last'});h.stop();const count=h.states.length;
 h.requests[3].resolve({id:'last'});await flush();assert.equal(h.states.length,count);assert.equal(h.stops(),1);
});

test('clearing a driver cache preserves another module authentication mode',()=>{
 const values=new Map([['ryyco_driver_session','cached'],['ryyco_auth_mode','seller']]);
 const code=ts.transpileModule(readFileSync('src/lib/driverSessionStorage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const storage={};
 new Function('exports','require',code)(storage,()=>({safeGetItem:key=>values.get(key),safeRemoveItem:key=>values.delete(key)}));
 storage.clearDriverSessionStorage();
 assert.equal(values.has('ryyco_driver_session'),false);
 assert.equal(values.get('ryyco_auth_mode'),'seller');
 values.set('ryyco_auth_mode','driver');storage.clearDriverSessionStorage();
 assert.equal(values.has('ryyco_auth_mode'),false);
});
