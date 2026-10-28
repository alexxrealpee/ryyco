import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let reply, request;
const code=ts.transpileModule(readFileSync('server/catalogPage.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{},URLSearchParams,AbortSignal,Buffer,fetch:async(url,options)=>{request={url,options};return {ok:true,json:async()=>reply};}};
vm.runInNewContext(code,context);
async function call(handler,query) {
  const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.body=data;return this;},sendStatus(n){this.code=n;},type(t){this.contentType=t;return this;},send(b){this.body=b;},redirect(n,url){this.code=n;this.location=url;}};
  await context.exports[handler]({query},res);return res;
}
reply=[{document:{name:'projects/demo/databases/(default)/documents/products/p1',updateTime:'version1',fields:{name:{stringValue:'Producto'},price:{integerValue:'12000'},active:{booleanValue:true},addons:{arrayValue:{values:[{mapValue:{fields:{price:{integerValue:'1000'}}}}]}}}}}];
let r=await call('catalogPage',{kind:'products',limit:'1',after:'p0'});
assert.equal(r.code,200);assert.equal(r.body.source,'firestore-server');assert.equal(r.body.items[0].price,12000);assert.equal(r.body.items[0].addons[0].price,1000);
assert.equal(r.body.hasMore,true);assert.equal(r.body.cursor,'p1');assert.match(r.body.items[0].imageURL,/catalog-image.php/);
let q=JSON.parse(request.options.body).structuredQuery;
assert.equal(q.limit,1);assert.equal(q.startAt.before,false);assert.ok(q.startAt.values[0].referenceValue.endsWith('/products/p0'));
assert.ok(!q.select.fields.some(f=>f.fieldPath==='imageURL'),'do not fetch image bytes with metadata');
reply=[{readTime:'now'}];r=await call('catalogPage',{kind:'stores'});assert.equal(r.body.items.length,0);assert.equal(r.body.hasMore,false);
assert.equal(JSON.parse(request.options.body).structuredQuery.limit,undefined);
reply=[];assert.equal((await call('catalogPage',{kind:'products'})).code,503);
assert.equal((await call('catalogPage',{kind:'invalid'})).code,400);
assert.equal((await call('catalogPage',{after:'../secret'})).code,400);
reply={updateTime:'v1',fields:{imageURL:{stringValue:'data:image/png;base64,aGVsbG8='}}};
r=await call('catalogImage',{kind:'products',id:'p1',v:'v1'});assert.equal(r.body.toString(),'hello');assert.match(r.headers['Cache-Control'],/immutable/);
r=await call('catalogImage',{kind:'products',id:'p1',v:'old'});assert.equal(r.headers['Cache-Control'],'no-store');
reply={fields:{imageURL:{stringValue:'javascript:alert(1)'}}};assert.equal((await call('catalogImage',{kind:'products',id:'p1'})).code,404);
console.log('PASS Node catalog: projected metadata, cursor pagination, confirmation, nested prices, independent images and versioned cache');
