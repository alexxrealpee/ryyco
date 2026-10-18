const assert = require('node:assert/strict');
const {build} = require('esbuild');
(async()=>{
 const listeners={};let subscriptions=0,writes=0;
 globalThis.__catalogTest={getApps:()=>[{}],getApp:()=>({}),initializeApp:()=>({}),getFirestore:()=>({}),collection:(_,name)=>name,onSnapshot:(name,options,next,error)=>{subscriptions++;listeners[name]={next,error};return ()=>{};},write:()=>writes++};
 const result=await build({entryPoints:['server/catalogManager.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'catalog-test',setup(b){
 b.onResolve({filter:/^(firebase\/(app|firestore)|fs)$|catalogAssets\.mjs$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='firebase/app'?'export const {getApps,getApp,initializeApp}=globalThis.__catalogTest;':a.path==='firebase/firestore'?'export const {getFirestore,collection,onSnapshot}=globalThis.__catalogTest;export const doc=()=>{};export const getDoc=()=>{};':a.path==='fs'?'export default {existsSync:()=>false};':'export const externalizeCatalogImages=c=>c;export const writeCatalogCaches=()=>globalThis.__catalogTest.write();'}));
 }}]});const m={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,m,m.exports);const api=m.exports;
 const emit=(name,rows,fromCache=false)=>listeners[name].next({metadata:{fromCache,hasPendingWrites:false},forEach:fn=>rows.forEach(row=>fn({id:row.uid||row.id,data:()=>row}))});
 api.initBackendCatalogManager();assert.equal(subscriptions,2);
 const shops=[{uid:'a',username:'Alpha',displayName:'Alpha',isClosed:false},{uid:'b',username:'Beta',displayName:'Beta',isClosed:false}];
 emit('profiles',shops);assert.equal(api.getAvailableCatalog().complete,false);assert.equal(writes,0);
 emit('products',[{id:'1',userId:'a',name:'One',price:1},{id:'2',storeUsername:' BETA ',name:'Two',price:2},{id:'3',userId:'a',storeUsername:'Beta',name:'Three',price:3}],true);
 assert.equal(api.getAvailableCatalog().complete,false);
 emit('products',[{id:'1',userId:'a',name:'One',price:1},{id:'2',storeUsername:' BETA ',name:'Two',price:2},{id:'3',userId:'a',storeUsername:'Beta',name:'Three',price:3}]);
 let catalog=api.getAvailableCatalog();assert.equal(catalog.complete,true);assert.equal(catalog.products.length,3);assert.equal(catalog.products[1].userId,'b');assert.equal(catalog.products[2].userId,'a');
 await Promise.all([api.refreshCatalogFromFirestore(),api.refreshCatalogFromFirestore()]);assert.equal(subscriptions,2,'Healthy listeners are reused without full polling reads');
 emit('profiles',[shops[0],{...shops[1],isClosed:true}]);assert.equal(api.getAvailableCatalog().products.length,2);
 emit('profiles',shops);assert.equal(api.getAvailableCatalog().products.length,3);
 emit('products',[]);assert.equal(api.getAvailableCatalog().complete,true);assert.equal(api.getAvailableCatalog().products.length,0,'Confirmed empty snapshot removes stale products');
 listeners.products.error({code:'unavailable'});assert.equal(api.getAvailableCatalog().complete,false);
 console.log('PASS backend: both collections confirmed, cache rejected, aliases retained, live close/open, empty snapshots, errors, no duplicate reads');
})().catch(e=>{console.error(e);process.exitCode=1});
