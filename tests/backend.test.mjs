import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createBackend} from '../server/index.mjs';
import {forwardNative,forwardRezka} from '../worker/backend.js';
import worker from '../worker/index.js';
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

const rezkaEnv={XOT_REZKA_BACKEND_URL:'https://api.example.com',XOT_REZKA_BACKEND_TOKEN:secret};
const rezkaRequest=options=>new Request('https://xot.test/api/rezka',{method:'POST',body:JSON.stringify({action:'search',title:'Example'}),...options});
test('Dedicated Rezka bridge waits for a sleeping host and sends the secret only to its API',async()=>{
 const calls=[];let waits=0;
 const response=await forwardRezka(rezkaRequest({headers:{authorization:'untrusted','x-xot-rezka-route':'home'}}),rezkaEnv,{wait:async()=>{waits++;},fetcher:async(url,options)=>{
  calls.push({path:new URL(url).pathname,options});
  if(calls.length===1)return new Response('Waking up',{status:503});
  if(calls.length===2)return Response.json({ok:true});
  return Response.json({results:[]});
 }});
 assert.equal(response.status,200);assert.equal(waits,1);assert.deepEqual(calls.map(x=>x.path),['/healthz','/healthz','/api/rezka']);
 assert.equal(calls[0].options.headers,undefined);assert.equal(calls[2].options.headers.authorization,'Bearer '+secret);assert.equal(calls[2].options.headers['x-xot-rezka-route'],undefined);assert.equal(calls[2].options.redirect,'manual');assert.ok(!(await response.text()).includes(secret));
});
test('Dedicated Rezka bridge stops promptly when a waiting caller cancels',async()=>{
 const controller=new AbortController();let calls=0;
 const work=forwardRezka(rezkaRequest({signal:controller.signal}),rezkaEnv,{fetcher:async()=>{calls++;queueMicrotask(()=>controller.abort());return new Response('Waking up',{status:503});}});
 await assert.rejects(()=>work,{name:'AbortError'});assert.equal(calls,1);
});
test('Dedicated Rezka bridge rejects redirects, invalid routes and oversized bodies before leaking credentials',async()=>{
 let calls=0;const options={fetcher:async()=>{calls++;return new Response('',{status:302,headers:{location:'https://elsewhere.example'}});}};
 await assert.rejects(()=>forwardRezka(rezkaRequest(),rezkaEnv,options),/backend_redirect_rejected/);assert.equal(calls,1);
 const big=await forwardRezka(new Request('https://xot.test/api/rezka',{method:'POST',body:'x'.repeat(5000)}),rezkaEnv,options);assert.equal(big.status,413);assert.equal(calls,1);
 await assert.rejects(()=>forwardRezka(new Request('https://xot.test/api/filmix',{method:'POST',body:'{}'}),rezkaEnv,options),/backend_invalid_route/);assert.equal(calls,1);
});
test('A Rezka backend never redirects Filmix and other APIs away from their existing adapters',async()=>{
 const old=globalThis.fetch;const calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new URL(url).pathname==='/healthz'?Response.json({ok:true}):Response.json({results:[]});};
  const env={...rezkaEnv};
  const filmix=await worker.fetch(new Request('https://xot.test/api/filmix',{method:'POST',body:JSON.stringify({action:'invalid'})}),env);assert.equal(filmix.status,400);assert.equal(calls.length,0);
  assert.equal((await worker.fetch(rezkaRequest(),env)).status,200);assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/healthz','/api/rezka']);
 }finally{globalThis.fetch=old;}
});
