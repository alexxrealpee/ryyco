const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ryyco-catalog-'));
const php = process.env.PHP_BINARY || 'php';
const quote = value => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const helper = path.resolve('public/api/catalog-live.php');
function run(source) {
  const file = path.join(temporary, 'test.php');
  fs.writeFileSync(file, source);
  const result = spawnSync(php, [file], {encoding:'utf8'});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout;
}
try {
  const rows = [{document:{name:'projects/p/databases/d/documents/products/a',fields:{
    name:{stringValue:'Almuerzo'},price:{integerValue:'12000'},active:{booleanValue:false},
    variants:{arrayValue:{values:[{mapValue:{fields:{name:{stringValue:'Grande'},price:{doubleValue:15000.5}}}}]}}}},readTime:'2026-10-25T12:00:00Z'}];
  const decoded = JSON.parse(run(`<?php require ${quote(helper)}; echo json_encode(catalogDocuments(json_decode(${quote(JSON.stringify(rows))}, true), 'products'));`));
  assert.deepEqual(decoded, [{id:'a',name:'Almuerzo',price:12000,active:false,variants:[{name:'Grande',price:15000.5}]}]);
  for (const bad of [[],[{error:{message:'denied'}}],[{}]]) {
    assert.equal(run(`<?php require ${quote(helper)}; try { catalogDocuments(json_decode(${quote(JSON.stringify(bad))}, true), 'products'); echo 'BAD'; } catch (Throwable $e) { echo 'rejected'; }`),'rejected');
  }
  assert.equal(run(`<?php require ${quote(helper)}; echo json_encode(catalogDocuments([['readTime'=>'now']], 'profiles'));`),'[]');
  const image = 'data:image/png;base64,' + Buffer.from('image-fixture').toString('base64');
  const folder = path.join(temporary, 'catalog-images');
  const extracted = run(`<?php require ${quote(helper)}; echo catalogExternalize(${quote(image)}, ${quote(folder)});`);
  assert.match(extracted, /^\/catalog-images\/[a-f0-9]{64}\.png$/);
  assert.equal(fs.readFileSync(path.join(folder,path.basename(extracted)),'utf8'),'image-fixture');
  assert.equal(run(`<?php require ${quote(helper)}; echo catalogExternalize(${quote(image)}, ${quote(folder)});`),extracted);
  const blocked = path.join(temporary,'not-a-directory'); fs.writeFileSync(blocked,'');
  assert.equal(run(`<?php require ${quote(helper)}; echo catalogExternalize(${quote(image)}, ${quote(blocked)});`),image,'No broken URL if Hostinger denies image writes');
  assert.equal(run(`<?php require ${quote(helper)}; echo catalogExternalize('https://example.com/photo.webp', ${quote(folder)});`),'https://example.com/photo.webp');
  const route = fs.readFileSync('public/api/catalog-available.php','utf8')
    .replace("require_once __DIR__ . '/catalog-live.php';",`require_once ${quote(helper)};`)
    .replace('catalogReadLive($initial ? 18 : 0)', 'testLive()');
  const live = JSON.parse(run(route.replace('<?php',"<?php function testLive() { return ['stores'=>[['uid'=>'s','isClosed'=>true]],'products'=>[['id'=>'a','price'=>9000]]]; }")));
  assert.equal(live.source,'firestore-server');
  assert.equal(live.complete,true);
  assert.equal(live.isPartial,false);
  assert.equal(live.totalProducts,1);
  assert.equal(live.catalog.stores[0].isClosed,true,'Raw current closure is retained');
  const first = JSON.parse(run(route.replace('<?php', "<?php $_GET['initial']='true'; function testLive() { return ['stores'=>[['uid'=>'s']], 'products'=>[['id'=>'a']]]; }")));
  assert.equal(first.storesComplete,true);
  assert.equal(first.complete,false);
  assert.equal(first.isPartial,true);
  assert.equal(first.totalProducts,null, 'Initial batch never claims to know the complete product count');
  const failed = JSON.parse(run(route.replace('<?php',"<?php function testLive() { throw new RuntimeException('secret error detail'); }")));
  assert.equal(failed.source,'static-cache');
  assert.equal(failed.complete,false);
  assert(!JSON.stringify(failed).includes('secret error detail'));
  // Exercise the metadata route with a fake transport, including actual cursor construction.
  const helperSource = fs.readFileSync(helper,'utf8').split('function catalogHttpJson(')[0];
  const fakeHelper = path.join(temporary,'catalog-helper.php');
  const fixtures = Array.from({length:12},(_,i)=>({document:{name:'projects/p/databases/d/documents/products/p'+i,
    updateTime:'2026-10-26T00:00:00Z',fields:{name:{stringValue:'Meal '+i},price:{integerValue:'12000'},
    active:{booleanValue:true},variantsText:{stringValue:'Pequeña,Grande'},packagingCost:{integerValue:'1000'}}},readTime:'now'}));
  fs.writeFileSync(fakeHelper,helperSource+`function catalogHttpJson($url,$body) {
    $q=$body['structuredQuery'];
    if ($q['limit']!==12 || $q['orderBy'][0]['field']['fieldPath']!=='__name__') throw new RuntimeException('unbounded query');
    if (in_array('imageURL',array_column($q['select']['fields'],'fieldPath'))) throw new RuntimeException('image in metadata');
    if (isset($_GET['after']) && (!$q['startAt']['values'][0]['referenceValue'] || $q['startAt']['before']!==false)) throw new RuntimeException('wrong cursor');
    return json_decode(${quote(JSON.stringify(fixtures))},true);
  }`);
  const metadataRoute=fs.readFileSync('public/api/catalog-page.php','utf8').replace("require_once __DIR__ . '/catalog-live.php';",`require_once ${quote(fakeHelper)};`);
  const metadata=JSON.parse(run(metadataRoute));
  assert.equal(metadata.items.length,12);assert.equal(metadata.hasMore,true);assert.equal(metadata.cursor,'p11');
  assert.equal(metadata.items[0].packagingCost,1000);assert.equal(metadata.items[0].variantsText,'Pequeña,Grande');
  assert.match(metadata.items[0].imageURL,/catalog-image\.php\?kind=products/);
  const next=JSON.parse(run(metadataRoute.replace('<?php',"<?php $_GET['after']='p11';")));
  assert.equal(next.kind,'products');
  const invalid=JSON.parse(run(metadataRoute.replace('<?php',"<?php $_GET['after']='../bad';")));
  assert(invalid.error);
  // Real image route: versioned cache skips repeat Firestore reads; old versions
  // never acquire an immutable mapping to a newer photograph.
  const imageHelper=path.join(temporary,'image-helper.php');
  const imageDirectory=path.join(temporary,'route-images');
  const imageDoc={updateTime:'v1',fields:{imageURL:{stringValue:image}}};
  fs.writeFileSync(imageHelper,helperSource+`function catalogHttpJson($url,$body=null) {
    if (isset($_GET['mustCache'])) throw new RuntimeException('unexpected repeat read');
    return json_decode(${quote(JSON.stringify(imageDoc))},true);
  }`);
  const imageRoute=fs.readFileSync('public/api/catalog-image.php','utf8')
    .replace("require_once __DIR__ . '/catalog-live.php';",`require_once ${quote(imageHelper)};`)
    .replace("__DIR__ . '/../catalog-images'",quote(imageDirectory));
  const imageRequest=(version,extra='')=>imageRoute.replace('<?php',`<?php
    $_GET=['kind'=>'products','id'=>'p1','v'=>${quote(version)}]; ${extra}
    register_shutdown_function(function(){echo json_encode(['status'=>http_response_code()]);});`);
  assert.equal(JSON.parse(run(imageRequest('v1'))).status,302);
  assert.equal(JSON.parse(run(imageRequest('v1',"$_GET['mustCache']=true;"))).status,302,'Cache hit avoids Firestore');
  assert.equal(JSON.parse(run(imageRequest('old-version'))).status,302);
  assert.equal(fs.readdirSync(imageDirectory).filter(name=>name.endsWith('.json')).length,1,'Mismatched version is not cached');
  assert.equal(JSON.parse(run(imageRequest('v1',"$_GET['id']='../bad';"))).status,400);
  console.log('PASS image route cache reuse, version invalidation and invalid ID rejection');
  console.log('PASS metadata page bounds, cursor, image separation and preservation of ordering fields');
  console.log('PASS PHP catalog: typed live data, empty/error distinction, immutable images, write fallback, current availability and unconfirmed fallback');
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
