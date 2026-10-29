
const LOGO='/landing-presentation/assets/f5df91435146707c.png', BRAIN='/landing-presentation/assets/360184472a71b04e.png';
const ICONS={
compass:'<circle cx="12" cy="12" r="9"/><path d="m15.7 8.3-2.6 5.1-4.8 2.3 2.4-4.9z"/>',
network:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="m7 7 4 9m6-9-4 9M7 6h10"/>',
brain:'<path d="M12 18V5a3.5 3.5 0 0 0-6.7-1.5A4.5 4.5 0 0 0 3 11a4 4 0 0 0 2.2 6.5A4 4 0 0 0 12 18Zm0 0V5a3.5 3.5 0 0 1 6.7-1.5A4.5 4.5 0 0 1 21 11a4 4 0 0 1-2.2 6.5A4 4 0 0 1 12 18Z"/><path d="M8 8c-2 0-3 2-2 3m10-3c2 0 3 2 2 3"/>',
mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/>',
chart:'<path d="M3 3v18h18M7 15l4-5 4 3 5-7"/>',
store:'<path d="M3 10h18l-2-6H5l-2 6Zm2 0v10h14V10M9 20v-7h6v7"/>',
cart:'<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h2l3 13h13l2-9H5"/>',
users:'<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-3a6 6 0 0 1 12 0v3m2-9a5 5 0 0 1 6 5v4"/>',
steps:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="6" cy="18" r="1"/>',
price:'<path d="M3 4h12l6 6-11 11L3 14Z"/><circle cx="8" cy="9" r="1.5"/>',
rocket:'<path d="M5 15c2-7 8-11 15-12 1 7-4 13-11 16l-4-4Zm5-5 4 4M4 20l-1 3 4-1"/><circle cx="16" cy="8" r="2"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const ext=(url,label,cls='cta')=>`<a class="${cls}" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const sectionHead=(k,t,lead)=>`<div><div class="eyebrow">${k}</div><h2 class="focus-title">${t}</h2><p class="focus-lead">${lead}</p></div>`;
const features=[
 ['Mesero Virtual IA','Tus clientes pueden preguntar, recibir recomendaciones y pedir platos hablando con voz natural.'],
 ['Administrador IA','Consulta pedidos, ventas del día y balance mensual a través de una conversación por voz.'],
 ['Menú digital y QR','Catálogo organizado con fotos, precios y categorías, accesible desde el celular o la mesa.'],
 ['Domicilios','Herramientas para coordinar entregas y conectar pedidos con domiciliarios registrados.'],
 ['Publicidad digital','Promoción de negocios gastronómicos a través de TikTok, Facebook e Instagram.'],
 ['Directorio de Ipiales','Los restaurantes pueden aparecer junto a otros establecimientos locales para ganar visibilidad.'],
 ['Panel en tiempo real','Actualiza platos, precios y fotografías, y consulta la información de tus pedidos.'],
 ['Sin comisión sobre ventas','La propuesta comercial se basa en suscripción mensual, no en retener comisión por cada venta del restaurante.']
];
const scenes=[
 {short:'Descubre RYYCO',sub:'Gastronomía inteligente',icon:'compass',category:'PORTADA',render:()=>`<div class="split"><div>${sectionHead('Tecnología nacida en Ipiales, Nariño','Descubre qué <span class="accent">quieren comer tus clientes.</span>','RYYCO conecta a personas y restaurantes en un ecosistema gastronómico impulsado por inteligencia artificial. Pide platos hablando con un Mesero Virtual y administra tu negocio con un Administrador IA por voz.')}<div class="actions">${ext('https://ryyco.com/','Descubrir restaurantes ↗','cta yellow')}${ext('https://ryyco.com/signup','Registrar mi restaurante ↗','cta')}</div><p class="mini-note" style="margin-top:22px">Menús y pedidos · Voz natural e IA · Domicilios y publicidad</p></div><div class="visualbox"><img class="bigbrain" src="${BRAIN}" alt="Cerebro con sinapsis"><img class="biglogo" src="${LOGO}" alt="RYYCO"><span class="visual-caption">RYYCO · GASTRONOMÍA INTELIGENTE</span></div></div>`},
 {short:'Ecosistema',sub:'8 posibilidades',icon:'network',category:'ECOSISTEMA',render:()=>`${sectionHead('Una plataforma, muchas posibilidades','Tu restaurante, <span class="accent">mucho más conectado.</span>','Una solución pensada para que los negocios gastronómicos se concentren en su comida mientras RYYCO facilita herramientas de atención, comercio, publicidad y gestión.')}<div class="feature-grid">${features.map((f,i)=>`<article class="tile"><span class="tile-num">${String(i+1).padStart(2,'0')}</span><h3>${f[0]}</h3><p>${f[1]}</p></article>`).join('')}</div>`},
 {short:'RYYCO Vivo',sub:'Inteligencia artificial',icon:'brain',category:'INTELIGENCIA ARTIFICIAL',render:()=>`${sectionHead('RYYCO Vivo · Inteligencia artificial','La tecnología que <span class="accent">conversa contigo.</span>','Dos experiencias complementarias: una para las personas que quieren pedir comida y otra para los restaurantes que necesitan comprender su operación.')}<div class="ai-grid"><article class="ai-card"><div class="label">01 · Para clientes</div><div class="big-icon" style="color:#70e8f4">◉</div><h3>Mesero Virtual</h3><p>Atención gastronómica por voz natural. Tus clientes pueden recibir recomendaciones y ayuda para armar sus pedidos hablando.</p><button class="cta" data-goto="3" type="button">Explorar el Mesero Virtual →</button></article><article class="ai-card"><div class="label">02 · Para restaurantes</div><div class="big-icon" style="color:#f2c14b">▥</div><h3>Administrador IA</h3><p>Información del negocio conversando. Consulta pedidos, ventas y platos destacados según los datos registrados en el panel.</p><button class="cta" data-goto="4" type="button">Explorar el Administrador IA →</button></article></div>`},
 {short:'Mesero Virtual',sub:'Pide con tu voz',icon:'mic',category:'MESERO VIRTUAL',render:()=>`<div class="split equal"><div>${sectionHead('Mesero Virtual IA','Hablar, elegir y <span class="accent">pedir con naturalidad.</span>','Una experiencia de atención gastronómica por voz natural para las personas que quieren explorar menús, recibir recomendaciones y elegir platos.')}<div class="voice-lines" aria-label="Ondas de voz animadas"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><p class="mini-note">Conversación ilustrativa. No se realizan pedidos ni se activa el micrófono en esta demostración.</p></div><div class="chat"><div class="bubble person"><b>Cliente</b>«Tengo hambre, ¿qué hamburguesa me recomiendas?»</div><div class="bubble bot"><b>Mesero Virtual IA</b>«Puedo recomendarte una hamburguesa especial y ayudarte a agregarla al pedido. ¿Quieres ver las opciones?»</div>${ext('https://ryyco.com/','Explorar platos en RYYCO ↗','cta yellow')}</div></div>`},
 {short:'Administrador IA',sub:'Datos por voz',icon:'chart',category:'ADMINISTRADOR IA',render:()=>`<div class="split equal"><div>${sectionHead('Administrador IA','Tu restaurante tiene <span class="accent">mucho que contarte.</span>','Los propietarios pueden hacer preguntas sobre pedidos, ventas del día, balance mensual y platos destacados usando información de su panel.')}<div class="stats"><div class="stat"><b class="goldtext">Ventas y pedidos</b><small>Consulta información registrada del negocio</small></div><div class="stat"><b>Platos destacados</b><small>Apoyo al análisis de la operación</small></div></div><p class="mini-note" style="margin-top:15px">Ejemplo conceptual; los mensajes y datos mostrados no representan ventas reales.</p></div><div class="chat"><div class="bubble person"><b>Propietario</b>«¿Cómo van mis ventas de hoy y cuáles platos se pidieron más?»</div><div class="bubble bot"><b>Administrador IA</b>«Puedo mostrarte pedidos, ventas y los platos destacados según la información registrada en tu panel.»</div>${ext('https://ryyco.com/signup','Conocer las herramientas ↗','cta')}</div></div>`},
 {short:'Herramientas',sub:'Para tu negocio',icon:'store',category:'SOLUCIONES',render:()=>`<div class="split"><div>${sectionHead('Vitrina digital','Diseñado para <span class="accent">emprendedores y marcas.</span>','Presenta tu catálogo, administra pedidos y ofrece una experiencia digital moderna. Con RYYCO puedes configurar una tienda pública y compartirla con tus clientes.')}<div class="actions">${ext('https://ryyco.com/signup','Explorar el registro ↗','cta yellow')}</div></div><div class="showcase"><div class="benefit"><span class="tick">✓</span><b>Analíticas de ventas, visitas y conversión</b></div><div class="benefit"><span class="tick">✓</span><b>Pagos directos, transferencias y contra entrega</b></div><div class="benefit"><span class="tick">✓</span><b>Variantes: tallas, sabores y personalizaciones</b></div><div class="benefit"><span class="tick">✓</span><b>Enlace público, carrito y pedidos por WhatsApp o directos</b></div></div></div>`},
 {short:'Vitrina y catálogo',sub:'Demo interactiva',icon:'cart',category:'CATÁLOGO',render:()=>`<div class="split equal"><div>${sectionHead('Demo · Restaurante RYYCO','Tu restaurante, <span class="accent">en la palma de la mano.</span>','Prueba el catálogo ilustrativo: selecciona categorías, agrega productos al carrito de ejemplo y descubre cómo se organiza una vitrina digital.')}<p class="mini-note" style="margin-top:20px">Los productos y precios son ilustrativos. Esta demostración no genera pedidos reales.</p><div class="actions">${ext('https://ryyco.com/','Visitar la plataforma ↗','cta yellow')}</div></div><div class="shop-demo"><div class="shop-head"><b>✦ DEMO · Restaurante RYYCO</b><small>ryyco.com/tu-restaurante</small></div><div class="filters" id="filters"><button class="filter active" type="button" data-cat="todos">Todos</button><button class="filter" type="button" data-cat="hamburguesas">Hamburguesas</button><button class="filter" type="button" data-cat="rapidas">Comidas rápidas</button></div><div class="product-grid" id="products"><div class="product" data-product-cat="hamburguesas"><div class="food-drawing">🍔</div><b>Hamburguesa especial</b><div class="product-bottom"><small>$28.000</small><button type="button" data-add aria-label="Agregar hamburguesa especial">+</button></div></div><div class="product" data-product-cat="rapidas"><div class="food-drawing">🍟</div><b>Papas con toppings</b><div class="product-bottom"><small>$18.000</small><button type="button" data-add aria-label="Agregar papas con toppings">+</button></div></div><div class="product" data-product-cat="hamburguesas"><div class="food-drawing">🍔</div><b>Hamburguesa doble</b><div class="product-bottom"><small>$32.000</small><button type="button" data-add aria-label="Agregar hamburguesa doble">+</button></div></div><div class="product" data-product-cat="rapidas"><div class="food-drawing">🌭</div><b>Perro especial</b><div class="product-bottom"><small>$22.000</small><button type="button" data-add aria-label="Agregar perro especial">+</button></div></div></div><div class="cartbar"><span>🛒 Pedido de demostración: <b id="cartCount">0 productos</b></span><button id="resetCart" type="button">Reiniciar</button></div></div></div>`},
 {short:'Restaurantes',sub:'Aliados en Ipiales',icon:'users',category:'COMUNIDAD',render:()=>`${sectionHead('Restaurantes de Ipiales','Un ecosistema que crece <span class="accent">con negocios locales.</span>','Restaurantes destacados en la plataforma de Ipiales. Puedes explorar sus vitrinas a través de RYYCO.')}<div class="partner-grid"><a class="partner" href="https://ryyco.com/senorbarril" target="_blank" rel="noopener noreferrer"><span class="drawing">🥩</span><b>Señor Barril</b><small>Parrilla y asados</small></a><a class="partner" href="https://ryyco.com/lacasadeloscaldos" target="_blank" rel="noopener noreferrer"><span class="drawing">🍲</span><b>La Casa de los Caldos</b><small>Caldos y tradición</small></a><a class="partner" href="https://ryyco.com/unsolotoque2" target="_blank" rel="noopener noreferrer"><span class="drawing">🍤</span><b>Un Solo Toque 2</b><small>Cevichería</small></a><a class="partner" href="https://ryyco.com/pollostop" target="_blank" rel="noopener noreferrer"><span class="drawing">🍗</span><b>Pollo Stop</b><small>Pollo asado y broaster</small></a></div><p class="mini-note">Selección basada en el listado de establecimientos de la landing original. Disponibilidad y estado de apertura sujetos a la plataforma en vivo.</p>`},
 {short:'Cómo empezar',sub:'Tres pasos',icon:'steps',category:'REGISTRO',render:()=>`${sectionHead('Empieza en tres pasos','Tu restaurante digital <span class="accent">comienza aquí.</span>','Configura tu presencia en RYYCO, presenta tus productos y comparte tu enlace con quienes quieren conocerte.')}<div class="steps"><article class="step"><div class="stepnum">01</div><h3>Regístrate en segundos</h3><p>Elige un nombre de usuario para que tu tienda tenga su propio enlace público dentro de RYYCO.</p></article><article class="step"><div class="stepnum">02</div><h3>Completa tu catálogo</h3><p>Agrega imágenes, precios, descuentos, disponibilidad y variantes de tus productos.</p></article><article class="step"><div class="stepnum">03</div><h3>Recibe pedidos directos</h3><p>Comparte tu enlace. Tus clientes podrán elegir productos y coordinar compras a través de la plataforma o WhatsApp.</p></article></div><form id="claimStore" class="claim-store"><label for="storeSlug">Elige el enlace de tu restaurante</label><div><span>ryyco.com/</span><input id="storeSlug" name="storeSlug" required maxlength="60" pattern="[a-zA-Z0-9._-]+" placeholder="tu-restaurante" autocomplete="off"><button class="cta yellow" type="submit">Crear mi tienda</button></div></form><div class="actions" style="margin-top:0">${ext('https://ryyco.com/signup','Registrar restaurante ↗','cta yellow')}</div>`},
 {short:'Planes',sub:'Tarifas y beneficios',icon:'price',category:'PLANES',render:()=>`${sectionHead('Planes disponibles','Tarifas claras, <span class="accent">sin comisiones por pedido.</span>','Escoge un plan según la cantidad de productos que necesitas mostrar. Estos son los valores anunciados en la landing actual de RYYCO.')}<div class="pricing"><article class="plan"><div class="plan-name">Plan Básico</div><p class="plan-lead">Para empezar con tu primera vitrina digital.</p><div class="quota">Hasta <b>5 productos</b></div><div class="price">$49.000 <small>COP/mes</small></div><div class="monthly">Facturación mensual</div>${ext('https://ryyco.com/signup','Elegir plan ↗','cta')}</article><article class="plan"><div class="plan-name">Plan Medio</div><p class="plan-lead">Para tiendas y restaurantes en crecimiento.</p><div class="quota">Hasta <b>12 productos</b></div><div class="price">$79.000 <small>COP/mes</small></div><div class="monthly">Facturación mensual</div>${ext('https://ryyco.com/signup','Elegir plan ↗','cta')}</article><article class="plan featured"><div class="plan-name">Plan Avanzado</div><p class="plan-lead">Para marcas con catálogos más amplios.</p><div class="quota">Hasta <b>24 productos</b></div><div class="price">$99.000 <small>COP/mes</small></div><div class="monthly">Facturación mensual</div>${ext('https://ryyco.com/signup','Elegir plan ↗','cta yellow')}</article><article class="plan"><div style="color:#ffcd64;font-size:9px;letter-spacing:.12em;font-weight:900">PERSONALIZADO</div><div class="plan-name">Plan Especial</div><p class="plan-lead">Para empresas con mayor catálogo y necesidades específicas.</p><div class="quota">Más de <b>24 productos</b></div><div class="price" style="font-size:20px">A convenir</div><div class="monthly">Asesoría directa</div>${ext('https://wa.me/573219730865?text=Hola%20RYYCO,%20estoy%20interesado%20en%20el%20Plan%20Especial%20para%20mi%20tienda.','Contactar asesor ↗','cta')}</article></div>`},
 {short:'Tu próximo paso',sub:'Construye con RYYCO',icon:'rocket',category:'CIERRE',render:()=>`<div class="closing"><div>${sectionHead('Tu próximo paso','¿Listo para llevar tu restaurante a <span class="accent">otro nivel?</span>','Tú preparas la comida. RYYCO aporta herramientas digitales, publicidad y conexión con el ecosistema gastronómico.')}<div class="actions">${ext('https://ryyco.com/signup','Comenzar mi tienda ↗','cta yellow')}${ext('https://ryyco.com/','Buscar comida ↗','cta')}</div><div class="links" style="margin-top:29px"><a target="_blank" rel="noopener noreferrer" href="https://ryyco.com/domiciliario">Portal domiciliario</a><a target="_blank" rel="noopener noreferrer" href="https://ryyco.com/driver-register">Ser domiciliario</a><a target="_blank" rel="noopener noreferrer" href="https://ryyco.com/privacidad">Política de privacidad</a><a target="_blank" rel="noopener noreferrer" href="#buyer-terms">Términos compradores</a><a href="#seller-terms">Términos vendedores</a><a href="#letter">Carta de presentación</a><a href="https://ryyco.com/login">Acceso vendedor</a><a target="_blank" rel="noopener noreferrer" href="https://wa.me/573219730865?text=Hola,%20necesito%20informaci%C3%B3n%20de%20RYYCO">Soporte</a></div><p class="mini-note" style="margin-top:15px">© 2026 RYYCO · Ipiales, Nariño, Colombia · Todos los derechos reservados. </p></div><div class="orb-art"><img src="${LOGO}" alt="Logo RYYCO"></div></div>`}
];
const maparea=document.getElementById('maparea'),nodesEl=document.getElementById('nodes'),rail=document.getElementById('rail'),wrap=document.getElementById('focusWrap'),overview=document.getElementById('overview'),content=document.getElementById('focusContent'),focusEl=document.getElementById('focus');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let active=-1,paused=reducedMotion.matches,last=0,elapsed=0,returnTimer=0,cartCount=0;
const orbitPositions=[];
// Posiciones escalonadas para evitar que una tarjeta tape a otra. Movimiento orbital sutil alrededor de su propia ancla.
const anchors=[[.50,.14],[.79,.17],[.87,.34],[.88,.55],[.77,.75],[.60,.87],[.38,.87],[.16,.73],[.12,.53],[.13,.32],[.23,.14]];
scenes.forEach((scene,i)=>{
 const button=document.createElement('button');button.className='node';button.type='button';button.innerHTML=`<span class="num">${String(i+1).padStart(2,'0')}</span><span class="art">${icon(scene.icon)}</span><span class="node-copy"><b>${scene.short}</b><small>${scene.sub}</small></span>`;button.setAttribute('aria-label','Abrir '+scene.short);button.addEventListener('click',()=>openScene(i,button));nodesEl.appendChild(button);
 const nav=document.createElement('button');nav.className='rail-btn';nav.type='button';nav.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span>${scene.short}`;nav.addEventListener('click',()=>openScene(i,button));rail.appendChild(nav);
 orbitPositions.push({x:anchors[i][0],y:anchors[i][1],phase:i*.83,speed:.00034+(i%3)*.00006,radius:5+(i%3)*2});
});
const mobileAnchors=[[.50,.055],[.79,.15],[.83,.32],[.84,.52],[.76,.71],[.67,.86],[.34,.86],[.16,.72],[.12,.52],[.14,.33],[.19,.15]];
let sceneWidth=0,sceneHeight=0;
new ResizeObserver(()=>{sceneWidth=maparea.clientWidth;sceneHeight=maparea.clientHeight}).observe(maparea);
function positionNodes(ms){if(!last)last=ms;if(!paused&&!reducedMotion.matches&&active===-1)elapsed+=Math.min(60,ms-last);last=ms;const W=sceneWidth||maparea.clientWidth,H=sceneHeight||maparea.clientHeight;for(let i=0;i<orbitPositions.length;i++){const p=orbitPositions[i];const anchor=W<620?mobileAnchors[i]:[p.x,p.y];let a=elapsed*p.speed+p.phase;let radius=W<620?3:p.radius;const half=W<620?55:90;const x=Math.max(half,Math.min(W-half,anchor[0]*W+Math.cos(a)*radius)),y=anchor[1]*H+Math.sin(a)*radius*.75;const node=nodesEl.children[i];node.style.left=`${x}px`;node.style.top=`${y}px`;node.style.transform='translate(-50%,-50%)';}if(!document.hidden)requestAnimationFrame(positionNodes)}requestAnimationFrame(positionNodes);
document.addEventListener("visibilitychange",()=>{last=0;if(!document.hidden)requestAnimationFrame(positionNodes)});
function openScene(idx,source){if(idx<0||idx>=scenes.length)return;const fresh=active===-1;active=idx;const scene=scenes[idx];document.getElementById('focusNum').textContent=`${String(idx+1).padStart(2,'0')} / ${scenes.length}`;document.getElementById('focusCategory').textContent=scene.category;document.getElementById('pagerIndex').textContent=`${String(idx+1).padStart(2,'0')} / ${scenes.length}`;document.getElementById('focusFooter').textContent=`RYYCO · ${scene.short} · Ipiales, Nariño`;content.innerHTML=scene.render();content.scrollTop=0;
 document.querySelectorAll('.rail-btn').forEach((x,j)=>x.classList.toggle('active',idx===j));
 let rect=source?.getBoundingClientRect();let x=rect?rect.left+rect.width/2-innerWidth/2:0,y=rect?rect.top+rect.height/2-innerHeight/2:0;focusEl.style.setProperty('--from-x',Math.round(x)+'px');focusEl.style.setProperty('--from-y',Math.round(y)+'px');if(fresh){wrap.classList.remove('show');focusEl.offsetHeight;wrap.classList.add('show');overview.classList.add('in-focus')}else{focusEl.animate([{opacity:.65,transform:'scale(.98)'},{opacity:1,transform:'scale(1)'}],{duration:360,easing:'ease-out'})}wrap.inert=false;wrap.setAttribute('aria-hidden','false');overview.inert=true;document.querySelector('.top').inert=true;document.getElementById('closeFocus').focus({preventScroll:true});setupDemo();}
function closeScene(){if(active===-1)return;const previous=active;active=-1;overview.inert=false;document.querySelector('.top').inert=false;nodesEl.children[previous]?.focus({preventScroll:true});wrap.inert=true;wrap.classList.remove('show');overview.classList.remove('in-focus');wrap.setAttribute('aria-hidden','true');document.querySelectorAll('.rail-btn').forEach(x=>x.classList.remove('active'))}
function adjacent(delta){const target=active===-1?(delta===1?0:scenes.length-1):Math.min(scenes.length-1,Math.max(0,active+delta));openScene(target,nodesEl.children[target]);}
function setupDemo(){const fs=content.querySelectorAll('[data-cat]');fs.forEach(f=>f.addEventListener('click',()=>{fs.forEach(x=>x.classList.toggle('active',x===f));content.querySelectorAll('[data-product-cat]').forEach(p=>p.hidden=!(f.dataset.cat==='todos'||p.dataset.productCat===f.dataset.cat));}));let ctr=content.querySelector('#cartCount');const update=()=>{if(ctr)ctr.textContent=cartCount===1?'1 producto':cartCount+' productos'};update();content.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>{cartCount++;update();b.textContent='✓';setTimeout(()=>{if(b.isConnected)b.textContent='+'},550)}));content.querySelector('#resetCart')?.addEventListener('click',()=>{cartCount=0;update()});content.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>openScene(Number(b.dataset.goto),nodesEl.children[Number(b.dataset.goto)])));}
document.getElementById('closeFocus').addEventListener('click',closeScene);document.getElementById('mapTop').addEventListener('click',closeScene);document.getElementById('backdrop').addEventListener('click',closeScene);document.getElementById('pauseMotion').addEventListener('click',()=>{paused=!paused;document.getElementById('app').classList.toggle('motion-paused',paused);document.getElementById('pauseMotion').innerHTML=paused?'<span class="sym">▶</span><span>Reanudar órbitas</span>':'<span class="sym">Ⅱ</span><span>Pausar órbitas</span>';});document.getElementById('fullscreen').addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch(e){}});document.addEventListener('keydown',(e)=>{if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='Escape'||e.key.toLowerCase()==='m'){closeScene();return}if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();adjacent(1)}else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();adjacent(-1)}});
window.addEventListener('resize',()=>{last=0});

/* Navegación de escenas mediante rueda, trackpad y deslizamiento táctil. 
   Si una escena tiene contenido largo, primero se permite desplazar ese contenido;
   solo al llegar a sus extremos se cambia de escena. */
let scrollAccum=0;
let lastWheelAt=0;
let lastSceneScrollAt=-10000;
const SCENE_SCROLL_GUARD=980;
const SCROLL_IDLE_RESET=260;
function editableTarget(node){return Boolean(node?.closest?.('input,textarea,select,[contenteditable="true"]'));}
function atContentEdge(direction){
  if(active===-1)return true;
  const max=content.scrollHeight-content.clientHeight;
  if(max<5)return true;
  return direction>0 ? content.scrollTop>=max-4 : content.scrollTop<=4;
}
function switchSceneOnScroll(direction){
  const now=performance.now();
  if(now-lastSceneScrollAt<SCENE_SCROLL_GUARD)return false;
  if(active===-1){if(direction<0)return false;openScene(0,nodesEl.children[0]);}
  else{
    const target=active+direction;
    if(target<0){closeScene();}
    else if(target>=scenes.length){return false;}
    else{openScene(target,nodesEl.children[target]);}
  }
  lastSceneScrollAt=now;
  scrollAccum=0;
  return true;
}
window.addEventListener('wheel',event=>{
  if(event.ctrlKey||event.metaKey||editableTarget(event.target))return;
  const direction=Math.sign(event.deltaY);
  if(!direction)return;
  const targetInContent=active!==-1 && content.contains(event.target);
  const atEdge=atContentEdge(direction);
  // Do not trap scrolling inside long content blocks.
  if(targetInContent && !atEdge){scrollAccum=0;return;}
  event.preventDefault();
  const now=performance.now();
  if(now-lastWheelAt>SCROLL_IDLE_RESET || Math.sign(scrollAccum)!==direction)scrollAccum=0;
  lastWheelAt=now;
  const amount=event.deltaMode===1?Math.abs(event.deltaY)*18:event.deltaMode===2?Math.abs(event.deltaY)*window.innerHeight:Math.abs(event.deltaY);
  scrollAccum+=direction*Math.min(amount,180);
  if(Math.abs(scrollAccum)>=65)switchSceneOnScroll(direction);
},{passive:false});
let swipeStart=null;
window.addEventListener('touchstart',event=>{
  if(event.touches.length!==1||editableTarget(event.target)){swipeStart=null;return;}
  const t=event.touches[0];
  swipeStart={x:t.clientX,y:t.clientY,startScrollTop:content.scrollTop,inContent:content.contains(event.target),maxScroll:Math.max(0,content.scrollHeight-content.clientHeight),at:performance.now()};
},{passive:true});
window.addEventListener('touchend',event=>{
  if(!swipeStart||event.changedTouches.length!==1)return;
  const t=event.changedTouches[0];
  const dx=t.clientX-swipeStart.x,dy=t.clientY-swipeStart.y;
  const start=swipeStart;swipeStart=null;
  if(Math.abs(dy)<60||Math.abs(dy)<Math.abs(dx)*1.2)return;
  const direction=dy<0?1:-1;
  if(active!==-1 && start.inContent && start.maxScroll>5){
    // An ordinary vertical swipe inside an extended chapter must keep scrolling it.
    const startedAtEdge=direction>0?start.startScrollTop>=start.maxScroll-5:start.startScrollTop<=5;
    if(!startedAtEdge||!atContentEdge(direction))return;
  }
  switchSceneOnScroll(direction);
},{passive:true});
window.addEventListener('touchcancel',()=>{swipeStart=null},{passive:true});


// Only explicit local navigation actions are sent to the React application.
function applicationAction(action, username) {
  if(window.parent!==window) window.parent.postMessage({type:'ryyco-landing-action',action,username},location.origin);
}
document.addEventListener('click',event=>{
 const link=event.target.closest('a');if(!link)return;
 const url=new URL(link.href,location.href);
 const modalActions={'#buyer-terms':'buyer-terms','#seller-terms':'seller-terms','#letter':'letter'};
 if(modalActions[url.hash]){event.preventDefault();applicationAction(modalActions[url.hash]);return}
 if(url.hostname!=='ryyco.com')return;
 const routes={'/':'tienda','/signup':'signup','/login':'login','/domiciliario':'driver-portal','/driver-register':'driver-register'};
 if(routes[url.pathname]){event.preventDefault();applicationAction(routes[url.pathname]);}
 else if(url.pathname!=='/privacidad'){event.preventDefault();applicationAction('profile',decodeURIComponent(url.pathname.slice(1)));}
});
document.addEventListener('submit',event=>{
 if(event.target.id!=='claimStore')return;
 event.preventDefault();
 const name=new FormData(event.target).get('storeSlug').toString().trim().toLowerCase().replace(/[^a-z0-9._-]/g,'');
 if(name)applicationAction('signup',name);
});
document.getElementById('previousScene').addEventListener('click',()=>adjacent(-1));
document.getElementById('nextScene').addEventListener('click',()=>adjacent(1));
document.addEventListener('keydown',event=>{
 if(event.key!=='Tab'||active<0)return;
 const elements=[...wrap.querySelectorAll('a,button,input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&!el.hidden);
 const first=elements[0],last=elements.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
});
