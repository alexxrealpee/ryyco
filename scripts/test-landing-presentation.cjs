const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync('public/landing-presentation/index.html','utf8');
const js = fs.readFileSync('public/landing-presentation/presentation.js','utf8');
const dom = new JSDOM(html,{url:'http://localhost:3000/landing-presentation/index.html',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document,messages=[];
w.matchMedia=()=>({matches:false});
w.ResizeObserver=class{observe(){} disconnect(){}};
w.requestAnimationFrame=()=>0;
w.HTMLElement.prototype.animate=()=>({});
Object.defineProperty(w,'parent',{value:{postMessage:(message,origin)=>messages.push({message,origin})}});
w.eval(js);
const nodes=[...d.querySelectorAll('.node')];
assert.equal(nodes.length,11);
for(let i=0;i<11;i++){
 nodes[i].click();
 assert(d.querySelector('.focus-title'));
 assert.equal(d.querySelector('#focusNum').textContent,String(i+1).padStart(2,'0')+' / 11');
 d.querySelector('#closeFocus').click();
 assert.equal(d.querySelector('#focusWrap').getAttribute('aria-hidden'),'true');
}
nodes[8].click();
d.querySelector('#storeSlug').value='Plato.Rico';
d.querySelector('#claimStore').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
assert.deepEqual({...messages.at(-1).message},{type:'ryyco-landing-action',action:'signup',username:'plato.rico'});
nodes[10].click();
for(const [hash,action] of [['#buyer-terms','buyer-terms'],['#seller-terms','seller-terms'],['#letter','letter']]){
 d.querySelector('a[href="'+hash+'"]').click();
 assert.equal(messages.at(-1).message.action,action);
}
nodes[6].click();
d.querySelector('[data-add]').click();assert.equal(d.querySelector('#cartCount').textContent,'1 producto');
d.querySelector('[data-cat="hamburguesas"]').click();
assert([...d.querySelectorAll('[data-product-cat="rapidas"]')].every(p=>p.hidden));
d.querySelector('#resetCart').click();assert.equal(d.querySelector('#cartCount').textContent,'0 productos');
d.querySelector('#nextScene').click();assert.equal(d.querySelector('#focusCategory').textContent,'COMUNIDAD');
d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
assert.equal(d.querySelector('#focusWrap').inert,true);
w.dispatchEvent(new w.WheelEvent('wheel',{deltaY:100,cancelable:true}));
assert.equal(d.querySelector('#focusCategory').textContent,'PORTADA');
for(const el of d.querySelectorAll('img[src],script[src],link[href]')){
 const url=el.getAttribute('src')||el.getAttribute('href');
 if(url.startsWith('/landing-presentation/'))assert(fs.existsSync(path.join('public',url)),url);
}
dom.window.close();
console.log('PASS 11 scenes, scroll, keyboard, registration, terms, letter, demo filters/cart and extracted assets.');
