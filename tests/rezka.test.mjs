import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRezkaSearch,parseRezkaPost,parseRezkaEpisodes,parseRezkaStreams,handleRezka} from '../worker/rezka.js';
const req=body=>new Request('https://xot.test/api/rezka',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const path='/films/fiction/123-example-2021.html';
const search=`<div class="b-content__inline_item" data-id="123"><div class="b-content__inline_item-cover"><a href="${path}"><img></a></div><div class="b-content__inline_item-link"><a href="${path}">Example &amp; Film</a><div>2021, США</div></div></div>`;
const film=`<input value="123" id="post_id"><div class="b-post__title"><h1>Example</h1></div><script>sof.tv.initCDNMoviesEvents(123, 42, 0, 0, 0, {});</script><ul id="translators-list"><li data-translator_id="42" data-ads="1">Українська</li><li data-translator_id="7">Оригінал</li></ul>`;
test('Rezka search parses semantic cards, title entities and year',()=>{assert.deepEqual(parseRezkaSearch(search),[{id:'123',path,title:'Example & Film',original_title:'',year:2021,series:false}]);});
test('Rezka search rejects links to other origins',()=>{assert.deepEqual(parseRezkaSearch(search.replaceAll(path,'https://other.example'+path)),[]);});
test('Rezka post reads translator IDs and movie type without executing scripts',()=>{const post=parseRezkaPost(film,path);assert.equal(post.id,'123');assert.equal(post.series,false);assert.equal(post.translations[0].id,'42');assert.equal(post.translations[0].title,'Українська');assert.equal(post.translations[0].is_ads,'1');});
test('Rezka uses the default voice for pages without a voice list',()=>{const post=parseRezkaPost('<script>sof.tv.initCDNSeriesEvents(456, 9, 1, 1, {});</script>','/series/drama/456-series.html');assert.equal(post.series,true);assert.equal(post.translations[0].id,'9');});
test('Rezka episode parser preserves real numbers across seasons',()=>{const html=[['2','5'],['1','3'],['2','2'],['2','5']].map(([s,e])=>`<li class="b-simple_episode__item" data-season_id="${s}" data-episode_id="${e}">Episode</li>`).join('');assert.deepEqual(parseRezkaEpisodes(html),[{season:1,episodes:[3]},{season:2,episodes:[2,5]}]);});
test('Rezka streams keep HTTPS quality variants and reject embed/script/plain HTTP URLs',()=>{
 const rows=parseRezkaStreams('[1080p]http://cdn.example/a.mp4 or https://cdn.example/a.mp4:hls:manifest.m3u8,[720p]https://cdn.example/b.mp4,[360p]javascript:alert(1),[240p]https://player.example/embed/1');
 assert.deepEqual(rows.map(x=>x.quality),['1080p','720p']);assert.ok(rows.every(x=>x.url.startsWith('https:')));
});
test('Rezka decodes public base64 player format with known padding markers',()=>{const raw='[720p]https://cdn.example/video.m3u8';const encoded='#h'+btoa(raw)+'//_//'+btoa('$$!!@$$@^!@#$$@');assert.equal(parseRezkaStreams(encoded)[0].url,'https://cdn.example/video.m3u8');});
test('unknown stream encodings report an actionable error',()=>{assert.throws(()=>parseRezkaStreams('#9%%%'),/rezka_unsupported_stream_format/);});
test('Rezka rejects invalid IDs, paths and server origins before fetch',async()=>{
 assert.equal((await handleRezka(req({action:'stream',id:'bad',translator_id:7}),{})).status,400);
 assert.equal((await handleRezka(req({action:'post',path:'https://example.org/a.html'}),{})).status,400);
 assert.equal((await handleRezka(req({action:'search',title:'Example'}),{XOT_REZKA_ORIGIN:'https://localhost'})).status,502);
});
test('Rezka surfaces real access restrictions and never claims a successful empty search',async()=>{
 const old=globalThis.fetch;try{globalThis.fetch=async()=>new Response('Forbidden',{status:403});const r=await handleRezka(req({action:'search',title:'Example'}),{});assert.equal(r.status,502);assert.equal((await r.json()).error,'rezka_access_denied');}finally{globalThis.fetch=old;}
});
test('Rezka search only uses the configured upstream, ignoring client-supplied origins',async()=>{
 const old=globalThis.fetch;let seen='';try{globalThis.fetch=async url=>{seen=String(url);return new Response(search);};const r=await handleRezka(req({action:'search',title:'Example',origin:'https://attacker.example'}),{});assert.equal(r.status,200);assert.equal(new URL(seen).origin,'https://hdrezka.ag');}finally{globalThis.fetch=old;}
});
test('Rezka stream request preserves the selected translator, season and episode',async()=>{
 const old=globalThis.fetch;let form;try{globalThis.fetch=async(url,options)=>{form=new URLSearchParams(options.body);return new Response(JSON.stringify({success:true,url:'[720p]https://cdn.example/series.mp4'}));};const r=await handleRezka(req({action:'stream',id:123,translator_id:42,series:true,season:2,episode:5,translation:'UA'}),{});const data=await r.json();assert.equal(r.status,200);assert.equal(form.get('action'),'get_stream');assert.equal(form.get('translator_id'),'42');assert.equal(form.get('season'),'2');assert.equal(form.get('episode'),'5');assert.equal(data.items[0].episode,5);}finally{globalThis.fetch=old;}
});
test('Rezka follows only known HTTPS service mirror redirects',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async url=>{calls++;return calls===1?new Response('',{status:302,headers:{location:'https://hdrezka-home.tv/search/?q=Example'}}):new Response(search);};const response=await handleRezka(req({action:'search',title:'Example'}),{});assert.equal(response.status,200);assert.equal((await response.json()).results.length,1);assert.equal(calls,2);}finally{globalThis.fetch=old;}
});
test('Rezka rejects redirects outside the service and identifies a 200 anti-bot page',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response('',{status:302,headers:{location:'https://attacker.example'}});};const rejected=await handleRezka(req({action:'search',title:'Example'}),{});assert.equal((await rejected.json()).error,'rezka_mirror_redirect');assert.equal(calls,1);globalThis.fetch=async()=>new Response('<title>Проверяем, что вы не бот!</title>');const blocked=await handleRezka(req({action:'post',path}),{});assert.equal((await blocked.json()).error,'rezka_access_denied');}finally{globalThis.fetch=old;}
});
