// Runs only against the local Firestore emulator with synthetic data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(host || '')) throw Error('Local emulator required');
const base = `http://${host}/v1/projects/demo-ryyco-security/databases/(default)/documents/`;
const id = 'driver_test_example_com';
const toFields = data => Object.fromEntries(Object.entries(data).map(([k,v]) => [k,
  typeof v === 'boolean' ? {booleanValue:v} : typeof v === 'number' ? {integerValue:String(v)} : {stringValue:v}]));
function token(uid, email, provider='google.com', verified=true) {
  const now = Math.floor(Date.now()/1000);
  return [ {alg:'none',typ:'JWT'}, {sub:uid,user_id:uid,email,email_verified:verified,
    aud:'demo-ryyco-security',iss:'https://securetoken.google.com/demo-ryyco-security',iat:now,exp:now+3600,
    firebase:{sign_in_provider:provider,identities:{}}} ].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.';
}
async function request(path, bearer, data) {
  return fetch(base+path,{method:data?'PATCH':'GET',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},
    ...(data?{body:JSON.stringify({fields:toFields(data)})}:{})});
}
const owner = token('google-owner','test@example.com');
const other = token('other','other@example.com');
const pending = {id,uid:'google-owner',email:'test@example.com',status:'pending',isAvailable:false,isOnline:false,rating:5,ratingCount:0,completedDeliveriesCount:0,totalEarnings:0};
(async()=>{
  assert.equal((await request(`drivers/${id}`,null,pending)).status,403,'anonymous registration');
  assert.equal((await request(`drivers/${id}`,owner,{...pending,status:'approved'})).status,403,'self approval on create');
  assert.equal((await request(`drivers/${id}`,owner,{...pending,password:'not-a-real-password'})).status,403,'plaintext credential');
  assert.equal((await request(`drivers/${id}`,owner,pending)).status,200,'verified pending registration');
  assert.equal((await request(`drivers/${id}`,null)).status,403,'anonymous profile read');
  assert.equal((await request(`drivers/${id}`,other)).status,403,'other driver read');
  assert.equal((await request('drivers',owner)).status,403,'profile enumeration');
  assert.equal((await request(`drivers/${id}`,owner)).status,200,'own profile');
  assert.equal((await request(`drivers/${id}`,token('google-owner','test@example.com','google.com',false))).status,403,'unverified identity');
  assert.equal((await request(`drivers/${id}`,owner,{...pending,status:'approved'})).status,403,'self approval update');
  assert.equal((await request(`drivers/${id}`,owner,{...pending,uid:'attacker'})).status,403,'UID reassignment');
  assert.equal((await request(`drivers/${id}`,owner,{...pending,isAvailable:true})).status,403,'pending online');
  assert.equal((await request(`drivers/${id}`,owner,{...pending,phone:'3000000000'})).status,200,'profile edit');
  await request('users/other','owner',{role:'admin'});
  assert.equal((await request(`drivers/${id}`,other,{...pending,status:'approved'})).status,403,'editable admin role bypass');
  const admin=token('admin','alexxrealpee@gmail.com');
  assert.equal((await request(`drivers/${id}`,admin,{...pending,status:'approved'})).status,200,'trusted admin approval');
  assert.equal((await request(`drivers/${id}`,owner,{...pending,status:'approved',totalEarnings:999999})).status,403,'financial totals protected');
  // Legacy credentials can be removed by the verified owner, preserving status and ID.
  await request(`drivers/${id}`,'owner',{...pending,uid:id,password:'synthetic-legacy'});
  assert.equal((await request(`drivers/${id}`,owner,pending)).status,200,'legacy migration');
  const location = {lat:1,lng:-77,accuracy:10,gpsTimestamp:Date.now()};
  async function writePresence(bearer, overrides = {}) {
    return fetch(base.slice(0,-1)+':commit', {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${bearer}`},
      body:JSON.stringify({writes:[{update:{name:`projects/demo-ryyco-security/databases/(default)/documents/driver_presence/${id}`,fields:toFields({...location,gpsTimestamp:Date.now(),...overrides})},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]})});
  }
  assert.equal((await writePresence(owner)).status,403,'pending driver GPS blocked');
  await request(`drivers/${id}`,admin,{...pending,status:'approved',isAvailable:true,isOnline:true});
  assert.equal((await writePresence(owner)).status,200,'available owner GPS');
  assert.equal((await writePresence(other)).status,403,'other identity GPS spoofing');
  assert.equal((await writePresence(owner,{lat:91})).status,403,'invalid coordinates');
  assert.equal((await writePresence(owner,{gpsTimestamp:Date.now()-60000})).status,403,'stale GPS rejected');
  assert.equal((await request(`driver_presence/${id}`,null)).status,403,'GPS not public');
  assert.equal((await request('driver_presence',other)).status,403,'drivers cannot enumerate GPS');
  assert.equal((await request('driver_presence',admin)).status,200,'admin live map access');
  await request(`drivers/${id}`,admin,{...pending,status:'approved'});
  assert.equal((await writePresence(owner)).status,403,'offline driver GPS blocked');
  assert.equal((await fetch(base+`driver_presence/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${owner}`}})).status,200,'offline owner cleanup');
  assert.equal((await request('admin_fcm_tokens/fake',other,{adminUid:'other',token:'test'})).status,403,'editable profile admin cannot register admin push');
  assert.equal((await request('admin_fcm_tokens/admin',admin,{adminUid:'admin',token:'test'})).status,200,'verified admin push');
  assert.equal((await request('seller_fcm_tokens/own',other,{storeOwnerId:'other',sellerUid:'other',token:'test'})).status,200,'own restaurant push');
  assert.equal((await request('seller_fcm_tokens/spoof',other,{storeOwnerId:'victim',sellerUid:'victim',token:'test'})).status,403,'another restaurant token denied');
  assert.equal((await request('driver_fcm_tokens/own',owner,{driverId:id,token:'test'})).status,200,'verified driver push');
  assert.equal((await request('driver_fcm_tokens/spoof',other,{driverId:id,token:'test'})).status,403,'another driver token denied');
  console.log('PASS: 33 driver, private GPS and notification access checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
