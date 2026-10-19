// Isolated browser fixture: real chat/styles, synthetic messages and visual viewport.
// Run from the project root: node scripts/test-order-chat.cjs
// Open /build/order-chat-test.local.html on the local Vite server. No Firebase calls.
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build');
fs.mkdirSync(output, { recursive: true });
const mock = `
let listener;
let messages = Array.from({length:40}, (_,i)=>({id:String(i),senderRole:i%2?'driver':'customer',senderName:'Cliente de prueba',text:'Mensaje de prueba '+(i+1)+' para verificar la conversación.',createdAt:Date.now()}));
export const subscribeToOrderChat=(_,cb)=>{listener=cb;cb([...messages]);return()=>{listener=null}};
export const markOrderChatAsRead=()=>{};
export const playChatChime=()=>{};
export const append=()=>{messages.push({...messages[0],id:String(messages.length),text:'Mensaje nuevo '+(messages.length+1)});listener?.([...messages])};
export const sendOrderChatMessage=async(data)=>{messages.push({...data,id:String(messages.length),createdAt:Date.now()});listener?.([...messages]);return true};
`;
const entry = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import OrderChatModal from './src/components/OrderChatModal';
import {installMobileInputViewport} from './src/lib/mobileInputViewport';
import {append} from 'chat-test-service';
const viewport=new EventTarget();
Object.assign(viewport,{height:innerHeight,offsetTop:0,scale:1});
Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
installMobileInputViewport();
function resize(height,top=0){viewport.height=height;viewport.offsetTop=top;viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'))}
const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,30))));
async function verify(){
 const results=[];
 const shell=document.querySelector('[data-ryyco-managed-viewport]');
 const stream=shell.querySelector('.overflow-y-auto');
 const input=shell.querySelector('input');
 const check=(name,pass)=>{results.push({name,pass});if(!pass)throw new Error(name)};
 const gap=()=>stream.scrollHeight-stream.clientHeight-stream.scrollTop;
 try{
 resize(innerHeight);await settle();stream.scrollTop=stream.scrollHeight;await settle();
 input.focus({preventScroll:true});resize(400,20);await settle();
 check('Composer and header within visual viewport',shell.firstElementChild.getBoundingClientRect().top>=20 && shell.querySelector('form').getBoundingClientRect().bottom<=420.5);
 check('Last message stays at bottom on keyboard open',gap()<2);
 check('Global form handler leaves chat alone',!shell.hasAttribute('data-ryyco-keyboard-overlay'));
 check('Input font at least 16px',parseFloat(getComputedStyle(input).fontSize)>=16);
 stream.scrollTop=200;await settle();resize(300);await settle();
 check('Reading position survives keyboard resize',Math.abs(stream.scrollTop-200)<2);
 append();await settle();check('Incoming message preserves reading position',Math.abs(stream.scrollTop-200)<2);
 resize(innerHeight);await settle();check('Keyboard close preserves reading position',Math.abs(stream.scrollTop-200)<2);
 check('Original chat height restored',Math.abs(shell.firstElementChild.getBoundingClientRect().height-Math.min(innerHeight*.9,innerHeight*.92))<2);
 stream.scrollTop=stream.scrollHeight;await settle();resize(400,20);await settle();append();await settle();
 check('Incoming message follows bottom when pinned',gap()<2);
 check('Only messages scroll, background stays still',scrollY===0 && shell.scrollTop===0 && shell.firstElementChild.scrollTop===0);
 }catch(error){results.push({error:error.message})}
 document.getElementById('results').textContent=JSON.stringify(results);
}
function App(){const[open,setOpen]=useState(true);const[role,setRole]=useState('driver');return <>
<div style={{height:1800}}>Fondo de prueba</div>
<nav style={{position:'fixed',bottom:0,zIndex:200,width:'100%',background:'#fff',color:'#000',fontSize:12,display:'flex',flexWrap:'wrap',gap:8}}>
<button onClick={()=>resize(400,20)}>Teclado 400</button>
<button onClick={()=>resize(300,0)}>Teclado 300</button>
<button onClick={()=>resize(innerHeight)}>Cerrar teclado</button>
<button onClick={()=>{const s=document.querySelector('[data-ryyco-managed-viewport] .overflow-y-auto');s.scrollTop=200}}>Leer anteriores</button>
<button onClick={()=>{const s=document.querySelector('[data-ryyco-managed-viewport] .overflow-y-auto');s.scrollTop=s.scrollHeight}}>Ir al final</button>
<button onClick={append}>Recibir mensaje</button>
<button onClick={()=>setOpen(!open)}>Alternar chat</button>
<button onClick={()=>setRole(role==='driver'?'customer':'driver')}>Cambiar rol</button>
<button onClick={verify}>Ejecutar verificaciones</button><output id='results'/>
</nav>
<OrderChatModal isOpen={open} onClose={()=>setOpen(false)} currentRole={role} currentUserName='Prueba' order={{id:'synthetic-order',orderNumber:'PRUEBA',customerName:'Cliente de prueba',deliveryDriverName:'Domiciliario de prueba',customerAddress:'Dirección de prueba'}}/>
</>};createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
`;
esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,format:'esm',outfile:path.join(output,'order-chat-test.local.js'),plugins:[{
  name:'isolated-chat-service',setup(build){
    build.onResolve({filter:/orderChatService|^chat-test-service$/},()=>({path:'mock-chat',namespace:'mock'}));
    build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'js'}));
  }
}]}).then(()=>{
  fs.writeFileSync(path.join(output,'order-chat-test.local.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba aislada del chat</title></head><body><div id="root"></div><script type="module">import '/src/index.css';</script><script type="module" src="/build/order-chat-test.local.js"></script></body></html>`);
  console.log('Fixture ready: /build/order-chat-test.local.html (synthetic viewport, no Firebase).');
}).catch(error=>{console.error(error);process.exitCode=1});
