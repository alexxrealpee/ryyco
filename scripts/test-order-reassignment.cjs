const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const names = ['releaseDriverAndReassignOrderTransaction', 'updateOrderDeliveryStep', 'updateOrderDriverPaymentInfo', 'reportOrderEventuality'];
const source = ts.createSourceFile('firebase.ts', fs.readFileSync('src/lib/firebase.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const code = ts.transpileModule(source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(source)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const original = () => ({ id:'o',storeOwnerId:'s',status:'confirmed',deliveryType:'ryyco',orderType:'delivery',deliveryStep:'at_store',
  deliveryDriverId:'old',driverId:'old',deliveryDriverName:'Anterior',orderNumber:100,deliveryCode:'8327',
  customerPhone:'3101234567',items:[{name:'Almuerzo',price:12000,quantity:1}],totalAmount:19000,
  driverPaidToRestaurant:true,driverPaidAmount:12000,driverPaidAt:'2026-11-07T12:00:00Z',restaurantPaymentStatus:'not_paid',
  eventualityReport:{reason:'Llanta pinchada',driverId:'old',resolved:false},orderStatusHistory:[] });
function setup(order=original(), options={}) {
  const records = new Map([['orders/o',structuredClone(order)], ['delivery_tracking/o',{driverId:'old',lat:1,lng:1}]]);
  const cache = new Map([['linnk_orders_all',JSON.stringify([order])],['linnk_orders_s',JSON.stringify([order])]]);
  let cacheWrites=0, commits=0;
  const context = { exports:{}, console:{error(){},warn(){}}, db:{},
    doc:(_,collection,id)=>`${collection}/${id}`, deleteField:()=>({__delete:true}),
    cleanUndefined:data=>JSON.parse(JSON.stringify(data)), getOrderDeliveryCode:o=>o.deliveryCode,
    applyOrderTimeTransition:(o,status)=>({orderStatusHistory:[...(o.orderStatusHistory||[]),{status}]}),
    localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>{cacheWrites++;cache.set(k,v);}},
    runTransaction:async (_,fn)=>{
      let staged=[];
      const transaction={get:async ref=>({exists:()=>records.has(ref),data:()=>structuredClone(records.get(ref))}),
        update:(ref,data)=>staged.push(['update',ref,data]),delete:ref=>staged.push(['delete',ref])};
      let result=await fn(transaction);
      if(options.reassignDuringCommit){options.reassignDuringCommit=false;records.set('orders/o',{...records.get('orders/o'),deliveryDriverId:'new',driverId:'new'});staged=[];result=await fn(transaction);}
      if(options.failCommit) throw new Error('Commit rejected');
      for(const [kind,ref,data] of staged){if(kind==='delete') records.delete(ref);else{const next={...records.get(ref),...data};for(const key of Object.keys(next))if(next[key]?.__delete)delete next[key];records.set(ref,next);}}
      commits+=staged.length?1:0;return result;
    },
  };
  vm.runInNewContext(code,context);
  return { api:context.exports,records,cache,get cacheWrites(){return cacheWrites;},get commits(){return commits;} };
}
const details={reason:'Llanta pinchada',expectedDriverId:'old'};
test('release is atomic, preserves money and items, records history, and is not repeated',async()=>{
  const t=setup(); const result=await t.api.releaseDriverAndReassignOrderTransaction('o','real-admin@example.com',details);
  assert(result.success);assert(!t.records.has('delivery_tracking/o'));
  const o=t.records.get('orders/o');assert.equal(o.status,'pending');assert.equal(o.driverId,'');assert.equal(o.deliveryDriverId,'');assert(!('deliveryStep' in o));
  assert.equal(o.driverPaidAmount,12000);assert.equal(o.driverPaidToRestaurant,true);assert.equal(o.restaurantPaymentStatus,'already_paid');
  assert.equal(o.totalAmount,19000);assert.equal(o.items[0].name,'Almuerzo');assert(o.eventualityReport.resolved);
  assert.equal(o.reassignmentHistory[0].authorizedBy,'real-admin@example.com');assert(o.reassignmentId);assert.equal(t.commits,1);
  assert.equal(JSON.parse(t.cache.get('linnk_orders_all'))[0].driverId,'');
  assert.equal((await t.api.releaseDriverAndReassignOrderTransaction('o','admin',details)).success,false);assert.equal(t.commits,1);
});
test('picked up food needs recovery; terminal and unassigned orders cannot be released',async()=>{
  for(const change of [{status:'delivered'},{status:'cancelled'},{deliveryStep:'delivered'},{driverId:'',deliveryDriverId:''},{orderType:'pickup'},{deliveryType:'restaurant'}]){
    const t=setup({...original(),...change});assert.equal((await t.api.releaseDriverAndReassignOrderTransaction('o','admin',details)).success,false);assert.equal(t.commits,0);
  }
  const t=setup({...original(),status:'picked_up',deliveryStep:undefined});
  assert.equal((await t.api.releaseDriverAndReassignOrderTransaction('o','admin',details)).success,false);
  assert.equal((await t.api.releaseDriverAndReassignOrderTransaction('o','admin',{...details,foodRecoveryCoordinated:true})).success,true);
});
test('failed commits and changed assignments never update local caches or delete GPS',async()=>{
  for(const options of [{failCommit:true},{reassignDuringCommit:true}]){
    const t=setup(original(),options);const result=await t.api.releaseDriverAndReassignOrderTransaction('o','admin',details);
    assert.equal(result.success,false);assert.equal(t.cacheWrites,0);assert(t.records.has('delivery_tracking/o'));assert.equal(t.commits,0);
  }
});
test('late steps, payments and reports from a released driver are rejected',async()=>{
  const t=setup({...original(),driverId:'new',deliveryDriverId:'new'});
  await assert.rejects(t.api.updateOrderDeliveryStep('o','delivered','old',7000,'8327'),/asignado/);
  await assert.rejects(t.api.updateOrderDriverPaymentInfo('o',{driverPaidAmount:1},'old'),/disponible/);
  await assert.rejects(t.api.reportOrderEventuality('o',{driverId:'old',reason:'Otra'}),/activo/);
  assert.equal(t.commits,0);assert.equal(t.cacheWrites,0);
});
test('concurrent reassignment cannot be overwritten by a delivery step',async()=>{
  const t=setup(original(),{reassignDuringCommit:true});
  await assert.rejects(t.api.updateOrderDeliveryStep('o','to_client','old'),/asignado/);
  assert.equal(t.records.get('orders/o').deliveryDriverId,'new');assert.equal(t.records.get('orders/o').status,'confirmed');
});
test('assigned driver can still progress, report an issue and register a payment',async()=>{
  const t=setup();
  await t.api.updateOrderDeliveryStep('o','to_store','old');assert.equal(t.records.get('orders/o').deliveryStep,'to_store');
  await t.api.reportOrderEventuality('o',{driverId:'old',reason:'Llanta pinchada'});assert.equal(t.records.get('orders/o').eventualityReport.reason,'Llanta pinchada');
  await t.api.updateOrderDriverPaymentInfo('o',{restaurantPaymentStatus:'already_paid'},'old');assert.equal(t.records.get('orders/o').restaurantPaymentStatus,'already_paid');
});
