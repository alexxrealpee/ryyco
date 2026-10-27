import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('__RYYCO_PRODUCTS__'));
test('stores and products start independently; no full collection or image prefetch',async()=>{
 const calls=[];let productsDone;
 const context={window:{},location:{pathname:'/'},AbortController,setTimeout,clearTimeout,
 fetch:url=>{calls.push(url);return url.includes('stores')?Promise.resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({kind:'stores'})}):new Promise(resolve=>{productsDone=resolve});}};
 vm.runInNewContext(code,context);
 assert.equal((await context.window.__RYYCO_STORES__).kind,'stores');
 assert.equal(calls.length,2);assert(calls.every(url=>url.includes('limit=12')));
 productsDone({ok:false});assert.equal(await context.window.__RYYCO_PRODUCTS__,null);
});
test('non-home routes do not download the home catalog',()=>{
 let calls=0;vm.runInNewContext(code,{window:{},location:{pathname:'/driver-portal'},fetch:()=>{calls++;}});assert.equal(calls,0);
});
test('offline resolves both requests safely',async()=>{
 const context={window:{},location:{pathname:'/'},AbortController,setTimeout,clearTimeout,fetch:async()=>{throw Error('offline')}};
 vm.runInNewContext(code,context);assert.equal(await context.window.__RYYCO_STORES__,null);assert.equal(await context.window.__RYYCO_PRODUCTS__,null);
});
