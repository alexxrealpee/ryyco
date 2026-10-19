// Local browser exercise of the real tracking modal, using synthetic telemetry only.
// Run with --repo to preview the Git checkout's existing design.
const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build');
fs.mkdirSync(output, { recursive: true });
const source = process.argv.includes('--repo') ? './github-sync/src/components/DeliveryTrackingModal' : './src/components/DeliveryTrackingModal';
const stylePath = process.argv.includes('--repo') ? '/github-sync/src/index.css' : '/src/index.css';
const entry = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Modal from '${source}';
import {emit,finish,fail,heartbeat,counts} from 'tracking-preview-store';
window.fetch=async()=>({ok:true,json:async()=>({configured:false})});
const demoOrder={id:'synthetic-delivery',orderNumber:123,customerName:'Cliente de prueba',customerAddress:'Dirección de prueba',customerLat:0.833,customerLng:-77.643,storeLat:0.83,storeLng:-77.64,storeName:'Restaurante de prueba',deliveryDriverId:'synthetic-driver',deliveryDriverName:'Domiciliario de prueba',status:'delivering',deliveryStep:'to_client',deliveryCode:'1234'};
function App(){const[open,setOpen]=useState(true);const[n,setN]=useState(0);return <>
<Modal isOpen={open} onClose={()=>setOpen(false)} order={demoOrder}/>
<nav style={{position:'fixed',bottom:0,zIndex:1000000,background:'white',color:'black',width:'100%',fontSize:12,display:'flex',gap:8,flexWrap:'wrap'}}>
<span>PRUEBA SIMULADA</span>
<button onClick={()=>{emit(0);setN(n+1)}}>Primer GPS</button>
<button onClick={()=>{emit(1);setN(n+1)}}>Mover moto</button>
<button onClick={()=>{emit(1,60);setN(n+1)}}>GPS antiguo</button>
<button onClick={()=>{heartbeat();setN(n+1)}}>Heartbeat</button>
<button onClick={()=>{fail();setN(n+1)}}>Fallar conexión</button>
<button onClick={()=>{emit(2);setN(n+1)}}>Reconectar</button>
<button onClick={()=>{finish('delivered');setN(n+1)}}>Entregar</button>
<button onClick={()=>{finish('cancelled');setN(n+1)}}>Cancelar</button>
<button onClick={()=>setOpen(!open)}>Alternar rastreo</button>
<output>{JSON.stringify(counts())}</output>
</nav></>};createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
`;
const mock = `
let receiver=null,connection=null,orderReceiver=null,last=null,subscriptions=0;
export const db={};
export const doc=(_,collection,id)=>({collection,id});
export const onSnapshot=(ref,cb)=>{orderReceiver=cb;return()=>{orderReceiver=null}};
export const getOrderDeliveryCode=()=> '1234';
export const listenToDeliveryTracking=(id,cb,status)=>{subscriptions++;receiver=cb;connection=status;cb(last);status('live');return()=>{subscriptions--;receiver=null;connection=null}};
export function emit(step,age=0){last={orderId:'synthetic-delivery',driverId:'synthetic-driver',driverName:'Domiciliario de prueba',vehicleType:'moto',lat:0.831+step*.0003,lng:-77.641+step*.0002,gpsTimestamp:Date.now()-age*1000,accuracy:5,heading:step?80:40,isTrackingActive:true,updatedAt:new Date().toISOString(),status:'to_client'};connection?.('live');receiver?.({...last})}
export function heartbeat(){connection?.('live');receiver?.({...last,updatedAt:new Date().toISOString()})}
export function fail(){connection?.('error','Conexión simulada interrumpida')}
export function finish(status){orderReceiver?.({exists:()=>true,id:'synthetic-delivery',data:()=>({status,orderNumber:123,customerAddress:'Dirección de prueba',customerLat:.833,customerLng:-77.643,storeLat:.83,storeLng:-77.64,storeName:'Restaurante de prueba',deliveryStep:status==='delivered'?'delivered':'to_client'})})}
export const counts=()=>({subscriptions});
`;
build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,format:'esm',loader:{'.png':'dataurl'},outfile:path.join(output,'delivery-tracking-preview.js'),plugins:[{
  name:'isolated-tracking',setup(b){
    b.onResolve({filter:/\/firebase$|^firebase\/firestore$|^tracking-preview-store$/},()=>({path:'tracking',namespace:'preview'}));
    b.onResolve({filter:/\/mapsConfig$/},()=>({path:'maps-config',namespace:'preview'}));
    b.onLoad({filter:/.*/,namespace:'preview'},args=>({contents:args.path==='maps-config'
      ? 'export const getGoogleMapsApiKey=()=>"";export const isValidGoogleMapsKey=()=>false;export const clearGoogleMapsApiKey=()=>{};' : mock,loader:'js'}));
  }
}]}).then(()=>{
fs.writeFileSync(path.join(output,'delivery-tracking-preview.html'),`<!doctype html><html><head><meta charset="UTF-8"><title>Prueba local de rastreo — GPS simulado</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/build/delivery-tracking-preview.css"></head><body><div id="root"></div><script type="module">import '${stylePath}';</script><script type="module" src="/build/delivery-tracking-preview.js"></script></body></html>`);
console.log('/build/delivery-tracking-preview.html — synthetic data, real Leaflet, no Firebase writes.');
}).catch(error=>{console.error(error);process.exitCode=1});
