const {test}=require('node:test');const assert=require('node:assert/strict');
const {deliverOrder,buildMessage,deliveryOrder}=require('../functions/orderPush.cjs');
test('native payload has visible notification and role destination; web remains data only',()=>{
 for(const role of ['admin','seller','driver']){const message=buildMessage('token',role,'order',{orderNumber:1},true);assert(message.notification);assert.equal(message.android.notification.channelId,'ryyco_orders_v2');assert.equal(message.data.role,role);assert.equal(message.android.priority,'high');assert.equal(message.android.notification.sound,'ryyco_order');assert.equal(message.android.notification.defaultVibrateTimings,true);assert.equal(message.android.notification.visibility,'public');}
 assert.equal(buildMessage('t','seller','o',{},false).notification,undefined);
 assert(!deliveryOrder({orderType:'pickup'}));assert(!deliveryOrder({orderType:'table'}));assert(!deliveryOrder({driverId:'d'}));
});
test('cloud dispatch isolates stores and available approved drivers, skips invalid tokens and retries without duplication',async()=>{
 const records=new Map(Object.entries({
  'orders/o':{status:'pending',orderType:'delivery',storeOwnerId:'s'},
  'admin_fcm_tokens/a':{token:'a'.repeat(60),active:true,device:'android'},
  'seller_fcm_tokens/s':{token:'s'.repeat(60),active:true,storeOwnerId:'s',device:'android'},
  'seller_fcm_tokens/other':{token:'x'.repeat(60),active:true,storeOwnerId:'other'},
  'driver_fcm_tokens/d':{token:'d'.repeat(60),active:true,driverId:'d',device:'android'},
  'driver_fcm_tokens/off':{token:'f'.repeat(60),active:true,driverId:'off'},
  'driver_fcm_tokens/pending':{token:'p'.repeat(60),active:true,driverId:'pending'},
  'driver_fcm_tokens/fake':{token:'driver_native_push_'+'z'.repeat(60),active:true,driverId:'d'},
  'drivers/d':{status:'approved',isAvailable:true},'drivers/off':{status:'approved',isAvailable:false},'drivers/pending':{status:'pending',isAvailable:true}
 }));
 const ref=key=>({get:async()=>snap(key),set:async value=>records.set(key,value),update:async value=>records.set(key,{...records.get(key),...value}),delete:async()=>records.delete(key)});
 const snap=key=>({ref:ref(key),data:()=>records.get(key),get:field=>records.get(key)?.[field]});
 const db = {
   collection: name => ({
     doc: id => ref(`${name}/${id}`),
     where: (field, op, value) => ({
       get: async () => ({ docs: [...records].filter(([key,v]) => key.startsWith(name+'/') && v[field] === value).map(([key]) => snap(key)) })
     })
   }),
   runTransaction: fn => fn({ get: ref => ref.get(), set: (ref,value) => ref.set(value) })
 };
 const sent=[];const messaging={send:async message=>sent.push(message)};
 await deliverOrder(db,messaging,'o');assert.deepEqual(sent.map(m=>m.data.role),['admin','seller','driver']);
 await deliverOrder(db,messaging,'o');assert.equal(sent.length,3);
 records.set('orders/o',{status:'delivered'});await deliverOrder(db,messaging,'o');assert.equal(sent.length,3);
});
