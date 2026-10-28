import test from 'node:test';
import assert from 'node:assert/strict';
import entry from '../api/rezka.js';
import {createVercelRezka} from '../server/vercel-rezka.mjs';
import {runRezkaDiagnostics} from '../vercel-public/diagnostics.js';

const token='test-vercel-private-token-with-more-than-32-characters';
const req=(body,auth=token)=>new Request('https://test.vercel.app/api/rezka',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+auth},body:JSON.stringify(body)});
const path='/films/action/123-example.html';
const html='<input id="post_id" value="123"><div class="b-post__title">Example</div><script>sof.tv.initCDNMoviesEvents(123,42);</script><ul id="translators-list"><li data-translator_id="42">Українська</li><li data-translator_id="7">Original</li></ul>';

test('Vercel entry exports a Web Standard handler and health does not contact the source',async()=>{
 assert.equal(typeof entry.fetch,'function');let calls=0;
 const handle=createVercelRezka({env:{XOT_SERVER_TOKEN:token},fetcher:async()=>{calls++;throw Error('unexpected');}});
 const response=await handle(new Request('https://test.vercel.app/api/rezka'));
 assert.deepEqual(await response.json(),{ok:true,service:'xot-rezka',configured:true,upstream_diagnostics:true,guest_sessions:true});assert.equal(calls,0);
});
test('Vercel fails closed without configuration or matching authorization before any source fetch',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('unexpected');};
 for(const secret of [undefined,'short']){
  const handle=createVercelRezka({env:{XOT_SERVER_TOKEN:secret},fetcher});
  assert.equal((await handle(req({action:'probe'}))).status,503);
 }
 const handle=createVercelRezka({env:{XOT_SERVER_TOKEN:token},fetcher});
 assert.equal((await handle(req({action:'probe'},'wrong'))).status,401);
 assert.equal((await handle(req({action:'probe'},'x'.repeat(token.length)))).status,401);
 assert.equal((await handle(new Request('https://test.vercel.app/api/rezka',{method:'DELETE'}))).status,405);
 assert.equal(calls,0);
});
test('Vercel uses the existing movie parser and never forwards the backend secret to Rezka',async()=>{
 let seen;
 const handle=createVercelRezka({env:{XOT_SERVER_TOKEN:token},fetcher:async(url,options)=>{seen={url:String(url),options};return new Response(html);}});
 const response=await handle(req({action:'post',path})),post=await response.json();
 assert.equal(post.id,'123');assert.equal(post.translations.length,2);
 assert.equal(seen.url,'https://rezka.ag'+path);assert.ok(!JSON.stringify(seen).includes(token));
 assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(post).includes(token));
});
test('Vercel preserves a real source denial and rejects unsupported requests without source traffic',async()=>{
 let calls=0;const handle=createVercelRezka({env:{XOT_SERVER_TOKEN:token},fetcher:async()=>{calls++;return new Response('Denied',{status:403});}});
 const denied=await handle(req({action:'post',path}));assert.equal(denied.status,502);assert.equal((await denied.json()).error,'rezka_access_denied');
 const invalid=await handle(req({action:'post',path:'https://untrusted.example/file'}));assert.equal(invalid.status,400);
 const large=await handle(req({action:'search',title:'x'.repeat(5000)}));assert.equal(large.status,413);assert.equal(calls,1);
});
test('Vercel keeps series voice, flags and episode when resolving video',async()=>{
 let form;
 const handle=createVercelRezka({env:{XOT_SERVER_TOKEN:token},fetcher:async(url,options)=>{form=new URLSearchParams(options.body);return Response.json({success:true,url:'[720p]https://cdn.example/episode.m3u8'});}});
 const response=await handle(req({action:'stream',id:456,translator_id:42,series:true,season:2,episode:3,is_ads:'1'}));
 assert.equal(form.get('action'),'get_stream');assert.equal(form.get('translator_id'),'42');assert.equal(form.get('season'),'2');assert.equal(form.get('episode'),'3');assert.equal(form.get('is_ads'),'1');
 assert.equal((await response.json()).items[0].url,'https://cdn.example/episode.m3u8');
});

test('Authenticated video diagnostics preserve failure status and redact URLs and long tokens',async()=>{
 const handle=createVercelRezka({env:{XOT_SERVER_TOKEN:token},fetcher:async()=>Response.json({success:false,message:'Video unavailable https://example.com/?key=private '+token})});
 const request=req({action:'stream',id:123,translator_id:42});request.headers.set('x-xot-diagnostics','1');
 const response=await handle(request),data=await response.json();
 assert.equal(response.status,502);assert.equal(data.error,'rezka_stream_unavailable');
 assert.equal(data.diagnostics[0].action,'get_movie');assert.equal(data.diagnostics[0].success,false);
 assert.ok(data.diagnostics[0].message.includes('[URL]'));assert.ok(!JSON.stringify(data).includes(token));assert.ok(!JSON.stringify(data).includes('example.com'));
 const unauthorized=req({action:'stream',id:123,translator_id:42},'wrong');unauthorized.headers.set('x-xot-diagnostics','1');
 assert.deepEqual(await (await handle(unauthorized)).json(),{error:'unauthorized'});
});

const translations=[{id:'42',title:'Українська',is_ads:'1'},{id:'7',title:'Original'}];
function diagnosticAPI(){
 const calls=[];
 return {calls,call:async body=>{
  calls.push(body);
  if(body.action==='search')return {results:[{id:'51876',path:'/series/drama/51876-tulsa.html'}]};
  if(body.action==='post')return {id:body.path.startsWith('/films/')?'47946':'51876',path:body.path,series:body.path.startsWith('/series/'),translations};
  if(body.action==='episodes')return {seasons:[{season:1,episodes:[1,2]}]};
  return {items:[{quality:'720p',url:'https://cdn.example/video.m3u8?secret=private-video-token'}]};
 }};
}
test('Diagnostic checks resolve a movie and an existing series episode without exposing signed media URLs',async()=>{
 const {calls,call}=diagnosticAPI(),report=[];await runRezkaDiagnostics(call,row=>report.push(row));
 assert.equal(report.length,2);assert.ok(report.every(row=>row.ok));assert.ok(report.every(row=>row.detail.includes('720p')));
 assert.ok(!JSON.stringify(report).includes('private-video-token'));assert.ok(!JSON.stringify(report).includes('https://'));
 const streams=calls.filter(row=>row.action==='stream');assert.equal(streams.length,2);assert.equal(streams[1].season,1);assert.equal(streams[1].episode,1);assert.equal(streams[1].translator_id,'42');assert.equal(streams[1].is_ads,'1');
});
test('Diagnostic reports blocked video as failure even after a successful catalog response',async()=>{
 const {call}=diagnosticAPI(),report=[];
 await runRezkaDiagnostics(body=>body.action==='stream'?Promise.reject(Error('rezka_access_denied')):call(body),row=>report.push(row));
 assert.equal(report.length,2);assert.ok(report.every(row=>!row.ok&&row.detail==='rezka_access_denied'));
 assert.ok(report.every(row=>row.stage==='stream'));
});
test('Diagnostic rejects the wrong card, redacts errors and selects an episode that actually exists',async()=>{
 const report=[];let streams=0;
 await runRezkaDiagnostics(async body=>{
  if(body.action==='post'&&body.path.startsWith('/films/'))return {id:'999',series:false,translations};
  if(body.action==='stream'){streams++;return {items:[]};}
  throw Error('https://upstream.example/?secret='+token);
 },row=>report.push(row));
 assert.equal(streams,0);assert.equal(report[0].detail,'rezka_movie_mismatch');assert.equal(report[1].detail,'invalid_response');assert.ok(!JSON.stringify(report).includes(token));
 const api=diagnosticAPI(),second=[];
 await runRezkaDiagnostics(body=>body.action==='episodes'?{seasons:[{season:1,episodes:[2]}]}:api.call(body),row=>second.push(row));
 assert.equal(second[1].ok,true);const episodeStreams=api.calls.filter(row=>row.action==='stream');assert.equal(episodeStreams.length,2);assert.equal(episodeStreams[1].episode,2);
});
test('Cancelling diagnostic work stops before the next title is requested',async()=>{
 let calls=0;const report=[];
 await assert.rejects(()=>runRezkaDiagnostics(async()=>{calls++;throw new DOMException('Cancelled','AbortError');},row=>report.push(row)),{name:'AbortError'});
 assert.equal(calls,1);assert.equal(report.length,0);
});
