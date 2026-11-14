const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
function load(path, deps = {}) {
 const mod = {exports:{}};
 const code = ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name => deps[name] || require(name),mod,mod.exports);
 return mod.exports;
}
const {validateCheckoutAvailability: validate} = load('src/lib/checkoutValidation.ts');
const order = {storeOwnerId:'s',items:[{productId:'p',name:'Plato',quantity:2,price:10000}]};
test('retry keeps its document ID across reload; completing one seller allows a fresh purchase',()=>{
 const data=new Map();globalThis.sessionStorage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 let module=load('src/lib/pendingCheckout.ts');
 assert.equal(module.pendingCheckoutId('same','s',()=> 'first'),'first');
 module=load('src/lib/pendingCheckout.ts');
 assert.equal(module.pendingCheckoutId('same','s',()=> 'duplicate'),'first');
 module.pendingCheckoutId('other','t',()=> 'other-id');
 module.finishCheckoutAttempt('s');
 assert.equal(module.pendingCheckoutId('same','s',()=> 'next'),'next');
 assert.equal(module.pendingCheckoutId('other','t',()=> 'duplicate'),'other-id');
 delete globalThis.sessionStorage;
});
test('valid checkout reads each product once and accepts an expired but open restaurant', async()=>{
 let reads=0;
 const store=await validate({...order,items:[...order.items,{...order.items[0],quantity:1}]},async()=>({subscriptionStatus:'expired'}),async()=>{reads++;return {active:true,userId:'s',stock:3}},()=>false);
 assert.equal(reads,1);assert.equal(store.subscriptionStatus,'expired');
});
test('closed, missing and archived stores block ordering',async()=>{
 for(const store of [null,{isClosed:true},{archived:true}]) await assert.rejects(validate(order,async()=>store,async()=>({}),s=>!!s.isClosed),/no está disponible/);
});
test('connection failure cannot become a successful validation',async()=>{
 await assert.rejects(validate(order,async()=>{throw Error('offline')},async()=>({}),()=>false),/offline/);
});
test('stock across variants, removed products and foreign sellers are rejected',async()=>{
 for(const product of [null,{active:false,userId:'s'},{userId:'other'},{userId:'s',stock:1}]) await assert.rejects(validate(order,async()=>({}),async()=>product,()=>false),/ya no está disponible/);
 await assert.rejects(validate({...order,items:[...order.items,...order.items]},async()=>({}),async()=>({userId:'s',stock:3}),()=>false));
});
test('invalid amounts and fractional quantities cannot be ordered',async()=>{
 for(const change of [{quantity:0},{quantity:1.5},{price:NaN},{price:-1}]) await assert.rejects(validate({...order,items:[{...order.items[0],...change}]},async()=>({}),async()=>({}),()=>false),/cantidad y el precio/);
});
test('successful part of a multi-store cart is removed, leaving failed stores and later additions',()=>{
 const data=new Map();
 const storage={safeGetItem:k=>data.get(k),safeSetItem:(k,v)=>data.set(k,v)};
 const cart=load('src/lib/cartHelper.ts',{'./safeStorage':storage,'./variantHelper':{getVariantPrice:p=>p.price,extractProductVariants:()=>[]}});
 const a={id:'a',quantity:2,product:{id:'a',userId:'s',name:'A',price:10}};
 const b={id:'b',quantity:1,product:{id:'b',userId:'t',name:'B',price:20}};
 cart.saveStoredCart([{...a,quantity:3},b]);
 const remaining=cart.consumePurchasedCart([a]);
 assert.equal(remaining.length,2);assert.equal(remaining[0].quantity,1);assert.equal(remaining[1].quantity,1);
});
test('checkout draft survives remount and blocked storage does not break edits',async()=>{
 const React=require('react');const {createRoot}=require('react-dom/client');const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://localhost'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
 const {useCheckoutField}=load('src/hooks/useCheckoutField.ts');let field;
 function Probe(){field=useCheckoutField('test','');return React.createElement('p',null,field[0]);}
 let root=createRoot(document.getElementById('root'));
 await React.act(async()=>root.render(React.createElement(Probe)));
 await React.act(async()=>field[1]('Dirección y datos conservados'));
 await React.act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
 await React.act(async()=>root.render(React.createElement(Probe)));
 assert.equal(field[0],'Dirección y datos conservados');
 globalThis.sessionStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 await React.act(async()=>field[1]('Cambio permitido'));assert.equal(field[0],'Cambio permitido');
 await React.act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.sessionStorage;
});
