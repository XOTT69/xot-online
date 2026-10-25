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
 assert.equal((await reply.json()).error,'filmix_unavailable');
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
