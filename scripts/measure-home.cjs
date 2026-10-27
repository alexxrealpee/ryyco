// Reproducible browser measurement; no database writes. Artifacts stay under build/performance.
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), http=require('node:http'), tls=require('node:tls');
const {spawn}=require('node:child_process');
const {gzipSync}=require('node:zlib');
const runtime=process.env.RYYCO_NODE_MODULES || 'C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(path.join(runtime,'playwright'));
const local=process.argv.includes('--local');
const label=process.argv.find(a=>a.startsWith('--label='))?.split('=')[1] || (local?'after':'before');
const output=path.resolve('build/performance');fs.mkdirSync(output,{recursive:true});
const children=[];let server,browser;
(async()=>{
 let url='https://ryyco.com/';
 if(local){
  const ca=path.join(output,'ca.pem');fs.writeFileSync(ca,tls.rootCertificates.join('\n'));
  const php=process.env.PHP_BINARY || path.join(os.tmpdir(),'ryyco-php-8.3.36/php.exe');
  const root=path.resolve(process.argv.find(a=>a.startsWith('--root='))?.slice(7)||'dist');
  for(let i=0;i<4;i++){
   const child=spawn(php,['-d',`extension_dir=${path.dirname(php)}/ext`,'-d','extension=curl','-d',`curl.cainfo=${ca}`,'-S',`127.0.0.1:${8891+i}`,'-t',root],{stdio:['ignore','ignore','pipe'],windowsHide:true});children.push(child);
   child.stderr.pipe(fs.createWriteStream(path.join(output,label+'-php-'+i+'.log')));
  }
  let worker=0;const encoded=new Map();
  server=http.createServer((req,res)=>{
   if(req.url.startsWith('/api/')){
    if(req.url.startsWith('/api/catalog/available'))req.url=req.url.replace('/api/catalog/available','/api/catalog-available.php');
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.endsWith('.php')){res.writeHead(404,{'Content-Type':'application/json'});res.end('{}');return;}
    const proxy=http.request({hostname:'127.0.0.1',port:8891+(worker++%4),path:req.url,method:req.method,headers:req.headers},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});
    proxy.on('error',()=>{res.writeHead(503);res.end();});req.pipe(proxy);return;
   }
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   let file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
   if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
   const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
   const compress=/javascript|text\/|json|svg/.test(type);
   const data=compress?(encoded.get(file)||gzipSync(fs.readFileSync(file))):fs.readFileSync(file);if(compress)encoded.set(file,data);
   res.writeHead(200,{'Content-Type':type,'Cache-Control':type==='text/html'?'no-store':'public,max-age=31536000',...(compress?{'Content-Encoding':'gzip'}:{}),'Content-Length':data.length});res.end(data);
  });
  await new Promise(resolve=>server.listen(8890,'127.0.0.1',resolve));url='http://127.0.0.1:8890/';
 }
 browser=await chromium.launch({executablePath:process.env.CHROME_BINARY||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];
 page.on('response',async r=>{if(r.url().includes('catalog-page.php')){try{const d=await r.json();console.log(JSON.stringify({api:r.url(),status:r.status(),kind:d.kind,source:d.source,items:d.items?.length,hasMore:d.hasMore,cursor:d.cursor,error:d.error}));}catch(e){console.log(JSON.stringify({api:r.url(),status:r.status(),bodyError:e.message}));}}});page.on('pageerror',e=>errors.push(e.message));
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.addInitScript(()=>{
  window.__fetchTrace=[];
  const originalFetch=window.fetch.bind(window);
  window.fetch=async (...args)=>{
   const response=await originalFetch(...args);
   if(String(args[0]).includes('catalog-page')) response.clone().json().then(data=>{
    window.__fetchTrace.push({url:String(args[0]),status:response.status,kind:data.kind,items:data.items?.length,error:data.error});
   }).catch(error=>window.__fetchTrace.push({url:String(args[0]),status:response.status,error:error.message}));
   return response;
  };
  document.addEventListener('load', event=>{
   const image=event.target;
   if(!(image instanceof HTMLImageElement))return;
   if(image.hasAttribute('data-logo-state')&&!window.__measure.logoImage)window.__measure.logoImage=performance.now();
   if(image.hasAttribute('data-image-state')&&!window.__measure.productImage)window.__measure.productImage=performance.now();
  },true);
  window.__measure={};new MutationObserver(()=>{
   const t=performance.now(),text=document.body?.innerText||'';
   if(!window.__measure.store&&document.querySelector('[title$="(Abierto ahora)"]'))window.__measure.store=t;
   if(!window.__measure.product&&document.querySelector('[data-product-id]'))window.__measure.product=t;
   if(!window.__measure.sixProducts&&document.querySelectorAll('[data-product-id]').length>=6)window.__measure.sixProducts=t;
   if(!window.__measure.error&&text.includes('Reintentar'))window.__measure.error=t;
  }).observe(document,{childList:true,subtree:true});
 });
 const results=[];
 for(const visit of (process.argv.includes('--once')?['cold']:['cold','reload','repeat'])){
  const started=Date.now();await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('button',{name:/Explorar restaurantes abiertos/}).click({timeout:3000}).catch(()=>{});
  await page.waitForSelector('[data-product-id]',{timeout:40000}).catch(()=>{});
  await page.waitForFunction(()=>document.querySelectorAll('[data-product-id]').length>=6,{},{timeout:30000}).catch(()=>{});
  await page.getByRole('button',{name:/Explorar restaurantes abiertos/}).click({timeout:3000}).catch(()=>{});
  const result=await page.evaluate(()=>({timings:window.__measure,marks:performance.getEntriesByType('mark').filter(m=>m.name.startsWith('ryyco:')).map(m=>({name:m.name,ms:m.startTime,detail:m.detail})),products:document.querySelectorAll('[data-product-id]').length,
   fetchTrace:window.__fetchTrace,text:document.body.innerText.slice(-1600),paint:performance.getEntriesByType('paint').map(p=>({name:p.name,ms:p.startTime})),
   resources:performance.getEntriesByType('resource').map(r=>({name:r.name.replace(/\?.*/,''),ms:Math.round(r.duration),bytes:r.transferSize,decoded:r.decodedBodySize}))}));
  results.push({visit,elapsed:Date.now()-started,...result});console.log(JSON.stringify({visit,timings:result.timings,marks:result.marks,products:result.products}));
  if(visit==='cold')await page.screenshot({path:path.join(output,label+'-mobile.png'),fullPage:true});
 }
 // After initial metrics, test that scrolling reveals another page without duplicate cards.
 const beforeScroll=await page.locator('[data-product-id]').count();
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 await page.waitForFunction(count=>document.querySelectorAll('[data-product-id]').length>count,beforeScroll,{timeout:20000}).catch(()=>{});
 const scroll=await page.locator('[data-product-id]').evaluateAll(nodes=>({count:nodes.length,unique:new Set(nodes.map(n=>n.getAttribute('data-product-id'))).size}));
 await page.waitForTimeout(16000);
 const settled=await page.evaluate(()=>({products:document.querySelectorAll('[data-product-id]').length,stores:document.querySelectorAll('[title$="(Abierto ahora)"]').length,error:document.body.innerText.includes('Reintentar')}));
 fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify({network:{downBytesPerSecond:200000,latencyMs:150,cpuSlowdown:4},results,scroll,settled,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close();for(const child of children)child.kill();});
