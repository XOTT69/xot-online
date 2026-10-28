import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createRezkaHost} from '../server/rezka-host.mjs';
const secret='test-render-private-token-at-least-32-characters';
async function start(t,fetcher){
 const server=createRezkaHost({env:{XOT_SERVER_TOKEN:secret},fetcher});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));return 'http://127.0.0.1:'+server.address().port;
}
test('Node diagnostic host serves the page and only known assets while keeping source requests private',async t=>{
 assert.throws(()=>createRezkaHost({env:{}}),/at least 32/);let calls=0;
 const origin=await start(t,async()=>{calls++;throw Error('unexpected source access');});
 assert.deepEqual(await (await fetch(origin+'/healthz')).json(),{ok:true,service:'xot-rezka'});
 const page=await fetch(origin+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/default-src 'self'/);assert.ok((await page.text()).includes('Перевірка підключення'));
 assert.equal((await fetch(origin+'/style.css')).headers.get('content-type'),'text/css; charset=utf-8');
 assert.equal((await fetch(origin+'/check.js',{method:'HEAD'})).status,200);
 assert.equal((await fetch(origin+'/server/rezka-host.mjs')).status,404);assert.equal((await fetch(origin+'/.env')).status,404);
 assert.equal((await fetch(origin+'/api/filmix',{method:'POST',body:'{}'})).status,404);
 assert.equal((await fetch(origin+'/api/rezka',{method:'POST',body:'{}'})).status,401);
 assert.equal((await (await fetch(origin+'/api/rezka')).json()).configured,true);assert.equal(calls,0);
});
test('Node host preserves authentication, fresh page sessions and bounded request bodies end to end',async t=>{
 let calls=0;
 const origin=await start(t,async(url,options)=>{
  calls++;
  if(options.method==='GET')return new Response('<input id="post_id" value="123"><input id="ctrl_favs" value="page-nonce"><script>sof.tv.initCDNMoviesEvents(123,42);</script>',{headers:{'set-cookie':'PHPSESSID=anonymous; Path=/; HttpOnly'}});
  assert.equal(options.headers.cookie,'PHPSESSID=anonymous');assert.ok(!JSON.stringify(options.headers).includes(secret));assert.equal(new URLSearchParams(options.body).get('favs'),'page-nonce');
  return Response.json({success:true,url:'[720p]https://cdn.example/movie.m3u8'});
 });
 const headers={authorization:'Bearer '+secret,'content-type':'application/json'};
 const response=await fetch(origin+'/api/rezka',{method:'POST',headers,body:JSON.stringify({action:'stream',id:123,translator_id:42,path:'/films/action/123-example.html'})});
 assert.equal(response.status,200);assert.equal((await response.json()).items[0].quality,'720p');assert.equal(calls,2);
 const large=await fetch(origin+'/api/rezka',{method:'POST',headers,body:'x'.repeat(5000)});assert.equal(large.status,413);assert.equal(calls,2);
});
