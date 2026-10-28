import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSerialnoSearch,parseSerialnoPost,handleSerialno} from '../worker/serialno.js';
import worker from '../worker/index.js';
const path='/1515-zzovni.html',player='https://tortuga.tw/embed/1516';
const media='https://s30.hdvbua.pro/media/from.s01e01/hls/index.m3u8';
const req=body=>new Request('https://xot.test/api/serialno',{method:'POST',body:JSON.stringify(body)});
const card=(id,title='Ззовні',year=2022)=>`<div class="th-item"><a class="th-in" href="https://serialno.tv/${id}-show.html"><div class="th-title">${title}</div></a><p>Події 1999 року</p><ul class="th-tip-list"><li><span>Рік:</span>${year}</li></ul></div>`;
const page=(title='Ззовні',original='From')=>`<article class="article full ignore-select"><h1>${title}</h1><div class="foriginal">${original}</div><ul class="flist"><li><span>Рік:</span>2022 (Триває)</li></ul><div class="tabs-sel"><span>Дивитися онлайн</span><span>Плеєр 2</span><span>Трейлер</span></div><div class="tabs-b video-box"><iframe src="${player}"></iframe></div><div class="tabs-b video-box"><iframe src="https://ashdi.vip/serial/1419"></iframe></div><div class="tabs-b video-box"><iframe src="https://tortuga.tw/vod/999"></iframe></div></article><aside><h1>Other</h1></aside>`;
const inventory=[{title:'1 сезон',folder:[{title:'1 серія',file:media},{title:'3 серія',file:media.replace('e01','e03')}]},{title:'2 сезон',folder:[{title:'1 серія',file:media.replace('s01','s02')}]}];
async function mocked(fetcher,run){const old=globalThis.fetch;try{globalThis.fetch=fetcher;await run();}finally{globalThis.fetch=old;}}
test('Serialno parses semantic search cards and page identity, excluding sidebars and trailers',()=>{
 const rows=parseSerialnoSearch('<div id="dle-content">'+card(1515)+'</div><aside>'+card(999)+'</aside>');assert.equal(rows.length,1);assert.equal(rows[0].title,'Ззовні');assert.equal(rows[0].year,2022);assert.equal(rows[0].series,true);
 const post=parseSerialnoPost(page(),path);assert.equal(post.original_title,'From');assert.equal(post.year,2022);assert.deepEqual(post.players,[player]);
 assert.equal(parseSerialnoSearch('<div id="dle-content">'+card(1515).replace('serialno.tv','attacker.example')+'</div>').length,0);
 assert.throws(()=>parseSerialnoPost(page().replace(player,'https://attacker.example/embed/1516'),path),/player_not_found/);
});
test('Serialno rejects malformed input and does not search a movie card',async()=>{
 await mocked(async()=>assert.fail('Unexpected upstream'),async()=>{
  for(const body of [{action:'post',path:'//attacker.example/'},{action:'stream',url:'https://localhost/a.m3u8'},{action:'search',title:'x'.repeat(201)},{action:'search',title:'From',movie:{titles:['From'],series:'true'}}])assert.equal((await handleSerialno(req(body))).status,400);
  assert.deepEqual((await(await handleSerialno(req({action:'search',title:'Movie',movie:{titles:['Movie'],year:2022,series:false}}))).json()).results,[]);
 });
});
test('An exact Ukrainian search result requires no extra page requests',async()=>{
 let calls=0;await mocked(async()=>{calls++;return new Response('<div id="dle-content">'+card(1515)+'</div>');},async()=>{
  const r=await handleSerialno(req({action:'search',title:'Ззовні',movie:{titles:['Ззовні','From'],year:2022,series:true}})),data=await r.json();assert.equal(r.status,200);assert.equal(data.results.length,1);assert.equal(calls,1);
 });
});
test('Original-title lookup verifies missing card metadata without fetching a player',async()=>{
 const calls=[];await mocked(async(url,options)=>{const u=String(url);calls.push(u);return new Response(options.method==='POST'?'<div id="dle-content">'+card(1,'З нуля')+card(2)+'</div>':u.includes('/1-')?page('З нуля','From Scratch'):page());},async()=>{
  const r=await handleSerialno(req({action:'search',title:'From',movie:{titles:['From'],year:2022,series:true}})),data=await r.json();assert.equal(r.status,200);assert.equal(data.results.length,1);assert.equal(data.results[0].original_title,'From');assert.equal(data.results[0].id,'2');assert.equal(data.results[0].players,undefined);assert.equal(calls.length,3);assert.ok(calls.every(u=>u.startsWith('https://serialno.tv/')));
 });
});
test('Metadata enrichment is bounded and does not turn access failures into empty searches',async()=>{
 let calls=0;await mocked(async(url,options)=>{calls++;return new Response(options.method==='POST'?'<div id="dle-content">'+Array.from({length:12},(_,i)=>card(i+1,'Інша назва')).join('')+'</div>':page('Other','Other'));},async()=>{
  const r=await handleSerialno(req({action:'search',title:'From',movie:{titles:['From'],year:2022,series:true}}));assert.equal(r.status,200);assert.equal(calls,5);
 });
 await mocked(async(url,options)=>options.method==='POST'?new Response('<div id="dle-content">'+card(1,'Other')+'</div>'):new Response('Restricted',{status:403}),async()=>{
  const r=await handleSerialno(req({action:'search',title:'From',movie:{titles:['From'],year:2022,series:true}}));assert.equal((await r.json()).error,'serialno_access_denied');
 });
});
test('Series inventory retains episode ordinals and accepts only an identity-checked public archive alias',async()=>{
 const calls=[];await mocked(async url=>{const u=String(url);calls.push(u);return new Response(u.endsWith('.html')?page():u===player?'<html>404 Not Found</html>':'<script>new Playerjs({file:'+JSON.stringify(JSON.stringify(inventory))+'})</script>');},async()=>{
  const r=await worker.fetch(req({action:'post',path,movie:{titles:['From'],year:2022,series:true}}),{}),data=await r.json();assert.equal(r.status,200);assert.equal(data.items.length,3);assert.deepEqual(data.items.map(i=>[i.season,i.episode]),[[1,1],[1,3],[2,1]]);assert.ok(data.items.every(i=>i.provider==='serialno'&&i.needs_resolve&&i.language===undefined));assert.equal(calls.length,3);assert.ok(calls.includes('https://hdvbua.pro/embd/1516'));assert.ok(!calls.some(u=>/ashdi|\/999/.test(u)));
 });
});
test('Wrong series/year is rejected before any player is requested',async()=>{
 for(const movie of [{titles:['Other'],year:2022,series:true},{titles:['From'],year:2023,series:true},{titles:['From'],year:2022,series:false}]){
  let calls=0;await mocked(async()=>{calls++;return new Response(page());},async()=>{const r=await handleSerialno(req({action:'post',path,movie}));assert.equal((await r.json()).error,'serialno_movie_mismatch');assert.equal(calls,1);});
 }
});
test('Restricted public players do not trigger an alternate archive request',async()=>{
 const calls=[];await mocked(async url=>{const u=String(url);calls.push(u);return u.endsWith('.html')?new Response(page()):new Response('Restricted',{status:403});},async()=>{
  const r=await handleSerialno(req({action:'post',path}));assert.equal((await r.json()).error,'serialno_access_denied');assert.equal(calls.length,2);
 });
});
test('Selected Serialno episode resolves actual HLS variants and preserves its voice',async()=>{
 await mocked(async()=>new Response('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\n1080/index.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\n720/index.m3u8'),async()=>{
  const r=await handleSerialno(req({action:'stream',url:media,title:'Ззовні',season:2,episode:3,voice_id:'serialno:ua',translation:'Студія'})),data=await r.json();assert.equal(r.status,200);assert.deepEqual(data.items.map(i=>i.quality),['1080p','720p']);assert.ok(data.items.every(i=>i.season===2&&i.episode===3&&i.voice_id==='serialno:ua'&&!i.needs_resolve));
 });
 const preflight=await worker.fetch(new Request('https://xot.test/api/serialno',{method:'OPTIONS'}),{});assert.equal(preflight.status,204);assert.ok(preflight.headers.get('access-control-allow-methods').includes('POST'));
});
