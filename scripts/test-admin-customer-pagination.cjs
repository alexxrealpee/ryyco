const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const { build } = require('esbuild');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');

test('customer pages limit Firestore to four profiles and query only their phones', async () => {
  const requests = [];
  const docs = Array.from({length:4}, (_, i) => ({ id: `310000000${i}`, data: () => ({name:`Client ${i}`}) }));
  const firestore = {
    collection: (_, name) => name, documentId: () => '__name__',
    orderBy: field => ({orderBy:field}), startAfter: cursor => ({cursor}),
    limit: count => ({limit:count}), where: (...args) => ({where:args}), query: (...args) => args,
    getDocs: async q => {
      requests.push(q);
      const rows = q[0] === 'customers' ? (q.some(c => c?.cursor) ? [] : docs) : [{id:'same-order',data:()=>({customerPhone:'3100000000'})}];
      return {docs:rows,size:rows.length};
    }
  };
  const code = ts.transpileModule(readFileSync('src/lib/adminCustomerPage.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports = {};
  new Function('exports','require',code)(exports, id => id === 'firebase/firestore' ? firestore : {db:{}});
  const page = await exports.fetchAdminCustomerPage(null);
  assert.equal(page.profiles.length,4);
  assert.equal(page.orders.length,1);
  assert.equal(page.hasMore,true);
  assert.deepEqual(requests[0], ['customers',{orderBy:'__name__'},{limit:4}]);
  assert.equal(requests.filter(q=>q[0]==='orders').length,4);
  assert.ok(requests.slice(1).every(q=>q[1].where[0]==='customerPhone' && q[1].where[1]==='in'));
  const last = await exports.fetchAdminCustomerPage(page.cursor);
  assert.equal(last.hasMore,false);
  assert.deepEqual(requests.at(-1)[2],{cursor:docs[3]});
});

test('loading is incremental, deduplicated, retryable and safe after unmount', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const requests=[]; let resolve, reject, state;
  globalThis.customerPageMock = cursor => { requests.push(cursor); return new Promise((res,rej)=>{resolve=res;reject=rej;}); };
  const result = await build({entryPoints:['src/hooks/useAdminCustomerPages.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['react'],plugins:[{name:'mock',setup(b){
    b.onResolve({filter:/adminCustomerPage$/},()=>({path:'mock',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const fetchAdminCustomerPage = (...args) => globalThis.customerPageMock(...args);'}));
  }}]});
  const module={exports:{}};
  new Function('module','exports','require',result.outputFiles[0].text)(module,module.exports,require);
  function Harness(){state=module.exports.useAdminCustomerPages();return null;}
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Harness))));
  assert.equal(requests.length,1);
  await React.act(async()=>{void state.loadNext();void state.loadNext();});
  assert.equal(requests.length,1);
  const profiles=Array.from({length:4},(_,i)=>({id:String(i)}));
  await React.act(async()=>resolve({profiles,orders:[],cursor:'four',hasMore:true}));
  assert.equal(state.profiles.length,4);
  await React.act(async()=>{void state.loadNext();});
  assert.equal(requests.at(-1),'four');
  await React.act(async()=>reject(new Error('offline')));
  assert.ok(state.error);assert.equal(state.profiles.length,4);
  await React.act(async()=>{void state.loadNext();});
  assert.equal(requests.at(-1),'four');
  await React.act(async()=>resolve({profiles:[profiles[3],{id:'next'}],orders:[],cursor:'next',hasMore:false}));
  assert.equal(state.profiles.length,5);
  await React.act(async()=>{void state.loadNext();});
  assert.equal(requests.length,3);
  await React.act(async()=>root.unmount());
  dom.window.close();delete globalThis.customerPageMock;
});
