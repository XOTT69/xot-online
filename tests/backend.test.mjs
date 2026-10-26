import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createBackend} from '../server/index.mjs';
import {forwardNative} from '../worker/backend.js';
const secret='xot-test-private-token-at-least-32-characters';

test('private backend requires a real token, rejects unauthorized clients and delegates native routes',async t=>{
 assert.throws(()=>createBackend({token:'short'}),/at least 32/);
 let seen;
 const server=createBackend({token:secret,handler:async request=>{seen=await request.json();return new Response(JSON.stringify({items:[]}));}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(origin+'/healthz')).status,200);
 assert.equal((await fetch(origin+'/api/filmix',{method:'POST',body:'{}'})).status,401);
 const response=await fetch(origin+'/api/filmix',{method:'POST',headers:{authorization:'Bearer '+secret},body:JSON.stringify({action:'search',title:'Example'})});
 assert.equal(response.status,200);assert.deepEqual(seen,{action:'search',title:'Example'});
 assert.equal((await fetch(origin+'/api/arbitrary',{method:'POST',headers:{authorization:'Bearer '+secret},body:'{}'})).status,404);
 assert.equal((await fetch(origin+'/api/rezka',{method:'POST',headers:{authorization:'Bearer '+secret},body:'x'.repeat(5000)})).status,413);
});
test('Worker-to-server bridge forwards only approved routes over HTTPS with server authorization',async()=>{
 const old=globalThis.fetch;let seen;
 try{
  globalThis.fetch=async(url,options)=>{seen={url:String(url),options};return new Response(JSON.stringify({results:[]}));};
  const request=new Request('https://xot.test/api/rezka',{method:'POST',body:JSON.stringify({action:'search',title:'Example'})});
  const response=await forwardNative(request,{XOT_BACKEND_URL:'https://api.example.com',XOT_BACKEND_TOKEN:secret});
  assert.equal(response.status,200);assert.equal(seen.url,'https://api.example.com/api/rezka');assert.equal(seen.options.headers.authorization,'Bearer '+secret);assert.equal(seen.options.redirect,'manual');assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.ok(!(await response.text()).includes(secret));
  await assert.rejects(()=>forwardNative(new Request('https://xot.test/api/filmix',{method:'POST',body:'{}'}),{XOT_BACKEND_URL:'http://api.example.com',XOT_BACKEND_TOKEN:secret}),/backend_not_configured/);
 }finally{globalThis.fetch=old;}
});
test('backend redirects never receive the private authorization token',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response('',{status:302,headers:{location:'https://elsewhere.example'}});};await assert.rejects(()=>forwardNative(new Request('https://xot.test/api/filmix',{method:'POST',body:'{}'}),{XOT_BACKEND_URL:'https://api.example.com',XOT_BACKEND_TOKEN:secret}),/backend_redirect_rejected/);assert.equal(calls,1);}finally{globalThis.fetch=old;}
});
