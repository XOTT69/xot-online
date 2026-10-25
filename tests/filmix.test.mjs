import test from 'node:test';
import assert from 'node:assert/strict';
import {flattenFilmixPost,handleFilmix} from '../worker/filmix.js';
function req(body){
 return new Request('https://xot.test/api/filmix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({device_id:'0123456789abcdef0123456789abcdef',...body})});
}
test('Filmix movie: separate translations and permitted quality options',()=>{
 const result=flattenFilmixPost({title:'Example',player_links:{movie:[{translation:'UA',link:'https://media.example/v_[1080,720,480].mp4'}]}},720);
 assert.deepEqual(result.map(x=>x.quality),['720p','480p']);
 assert.equal(result[0].translation,'UA');
 assert.equal(result[0].url,'https://media.example/v_720.mp4');
});
test('Filmix TV: episodes across seasons and translations',()=>{
 const a=flattenFilmixPost({title:'Series',player_links:{playlist:{'2':{'UA':[{link:'https://media.example/s2e1_%s.mp4'},{link:'https://media.example/s2e2_%s.mp4'}]}}}},480);
 assert.equal(a.filter(x=>x.quality==='480p').length,2);
 assert.equal(a[0].season,2);
 assert.equal(a[a.length-1].episode,2);
});
test('reject arbitrary host, malformed credentials and invalid film ids',async()=>{
 assert.equal((await handleFilmix(req({action:'search',title:'Matrix',device_id:'oops'}),{})).status,400);
 assert.equal((await handleFilmix(req({action:'post',id:'abc'}),{})).status,400);
 const reply=await handleFilmix(req({action:'search',title:'Matrix'}),{FILMIX_API_BASE:'https://example.org/api/v2/'});
 assert.equal(reply.status,502);
 assert.equal((await reply.json()).error,'filmix_https_required');
});
test('device pairing does not leak secrets into a GET route',async()=>{
 const get=new Request('https://xot.test/api/filmix?device_token=secret');
 const result=await handleFilmix(get,{});
 assert.equal(result.status,405);
});
test('Filmix search forwards the title with the device token on the upstream connection only',async()=>{
 const old=globalThis.fetch;let seen='';
 try{
  globalThis.fetch=async input=>{
   seen=String(input);
   return new Response(JSON.stringify([{id:99,title:'The Matrix',original_title:'Матриця',year:1999}]),{status:200});
  };
  const r=await handleFilmix(req({action:'search',title:'The Matrix',device_token:'testtoken'}),{});
  const data=await r.json();
  assert.equal(r.status,200);
  assert.equal(data.results[0].title,'The Matrix');
  assert.ok(seen.includes('story=The+Matrix'));
  assert.ok(seen.includes('user_dev_token=testtoken'));
  assert.ok(!JSON.stringify(data).includes('testtoken'));
 }finally{globalThis.fetch=old;}
});

test('device pairing verifies changed token, not merely missing user_code',async()=>{
 const original=globalThis.fetch;
 let step='pair',lastURL='';
 try{
  globalThis.fetch=async url=>{
   lastURL=String(url);
   const payload=step==='pair'?{user_code:'ABCD',user_dev_token:'temporary'}:
    step==='pending'?{user_code:'ABCD',user_dev_token:'temporary'}:
    {user_code:'ABCD',user_dev_token:'permanent'};
   return new Response(JSON.stringify(payload),{status:200});
  };
  const pair=await (await handleFilmix(req({action:'pair'}),{})).json();
  assert.equal(pair.status,'pending');assert.equal(pair.user_code,'ABCD');
  assert.equal(pair.temp_token,'temporary');assert.ok(!pair.device_token);
  assert.ok(!lastURL.includes('user_dev_token='));
  step='pending';
  const wait=await (await handleFilmix(req({action:'confirm',temp_token:pair.temp_token}),{})).json();
  assert.equal(wait.status,'pending');
  assert.ok(!wait.device_token);
  assert.ok(!lastURL.includes('user_dev_token='));
  step='linked';
  const linked=await (await handleFilmix(req({action:'confirm',temp_token:pair.temp_token}),{})).json();
  assert.equal(linked.status,'linked');assert.equal(linked.device_token,'permanent');
  assert.ok(!lastURL.includes('user_dev_token='));
 }finally{globalThis.fetch=original;}
});
test('device without initial temporary token may still activate',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({user_dev_token:'linked_token'}));
  const result=await (await handleFilmix(req({action:'confirm',temp_token:''}),{})).json();
  assert.equal(result.status,'linked');
 }finally{globalThis.fetch=original;}
});
test('Filmix health probe never forwards any saved account token',async()=>{
 const old=globalThis.fetch;let endpoint='';
 try{
  globalThis.fetch=async url=>{endpoint=String(url);return new Response(JSON.stringify({version:'2.2.0'}));};
  const r=await (await handleFilmix(req({action:'probe',device_token:'sensitive_account_token'}),{})).json();
  assert.equal(r.status,'reachable');
  assert.ok(endpoint.includes('/check_update'));
  assert.ok(!endpoint.includes('sensitive_account_token'));
 }finally{globalThis.fetch=old;}
});

test('Filmix dictionary playlist retains non-consecutive episode numbers',()=>{
 const post={title:'Series',player_links:{playlist:{'1':{'UA':{
  '5':{link:'https://video.example/episode5_[720,480].mp4'},
  '2':{link:'https://video.example/episode2_[720,480].mp4'}
 }}}}};
 const rows=flattenFilmixPost(post,480);
 assert.deepEqual(rows.map(x=>x.episode),[2,5]);
 assert.equal(rows[0].season,1);
});
