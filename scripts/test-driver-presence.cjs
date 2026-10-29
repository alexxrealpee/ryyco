const assert = require('node:assert/strict');
const {build} = require('esbuild');
const {JSDOM} = require('jsdom');
const React = require('react');
const {createRoot} = require('react-dom/client');
(async () => {
 const dom = new JSDOM('<div id="root"></div>',{url:'https://localhost'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 let callback, watches=0, clears=0;
 navigator.geolocation={watchPosition(fn){callback=fn;return ++watches;},clearWatch(){clears++;}};
 const events=[];
 globalThis.__presenceMock={doc:(_,collection,id)=>id,serverTimestamp:()=>123,setDoc:async(id,data)=>events.push(['write',id,data]),deleteDoc:async(id)=>events.push(['delete',id])};
 const result=await build({entryPoints:['src/hooks/useDriverPresence.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'mock',setup(b){
 b.onResolve({filter:/firebase/},args=>({path:args.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='firebase/firestore'?'export const {doc,serverTimestamp,setDoc,deleteDoc}=globalThis.__presenceMock;':'export const db={};'}));
 }}]});
 const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);
 const {useDriverPresence}=module.exports;
 const root=createRoot(document.getElementById('root'));
 const driver={id:'driver-a',status:'approved',isAvailable:true};
 function App(props){useDriverPresence(props.driver,props.available,props.order||null,props.point||null);return null;}
 async function render(props){await React.act(async()=>{root.render(React.createElement(App,props));await new Promise(r=>setTimeout(r,0));});}
 await render({driver,available:false});assert.equal(watches,0);
 await render({driver,available:true});assert.equal(watches,1);
 await React.act(async()=>{callback({timestamp:Date.now(),coords:{latitude:1,longitude:-77,accuracy:5}});await new Promise(r=>setTimeout(r,0));});
 assert.equal(events[0][0],'write');assert.equal(events[0][1],'driver-a');
 await render({driver,available:false});assert.equal(clears,1);assert.equal(events.at(-1)[0],'delete');
 await render({driver,available:true,order:{id:'order',status:'confirmed',deliveryStep:'accepted'},point:{lat:1,lng:-77,accuracy:5,timestamp:Date.now()}});
 assert.equal(watches,1,'delivery GPS reused without another watcher');assert.equal(events.at(-1)[0],'write');
 await render({driver:null,available:true});assert.equal(events.at(-1)[0],'delete','logout removes position');
 await React.act(async()=>root.unmount());dom.window.close();
 console.log('PASS: unavailable privacy, GPS publishing, stop cleanup, delivery GPS reuse, logout cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
