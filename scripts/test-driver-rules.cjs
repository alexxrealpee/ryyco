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
  console.log('PASS: 17 driver access, approval, credential and migration checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
