import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRezkaSearch,parseRezkaPost,parseRezkaEpisodes,parseRezkaStreams,parseRezkaMetadata,handleRezka} from '../worker/rezka.js';
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
 const old=globalThis.fetch;let seen='';try{globalThis.fetch=async url=>{seen=String(url);return new Response(search);};const r=await handleRezka(req({action:'search',title:'Example',origin:'https://attacker.example'}),{});assert.equal(r.status,200);assert.equal(new URL(seen).origin,'https://rezka.ag');}finally{globalThis.fetch=old;}
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
test('generic page links and sidebar recommendations are not search results',()=>{
 const home=`<ul><li><a href="${path}">Example &amp; Film</a></li></ul><aside>${search}</aside><div class="related">${search}</div>`;
 assert.deepEqual(parseRezkaSearch(home),[]);
});
test('Rezka movie identity filtering rejects unrelated films from the same year',async()=>{
 const old=globalThis.fetch;
 try{
  const other=search.replaceAll('123','987').replace('Example &amp; Film','Different film');
  globalThis.fetch=async()=>new Response(search+other);
  const response=await handleRezka(req({action:'search',title:'Example',movie:{titles:['Example & Film'],year:'2021',series:false}}),{});
  const results=(await response.json()).results;assert.equal(results.length,1);assert.equal(results[0].id,'123');
  const noMatch=await handleRezka(req({action:'search',title:'Something',movie:{titles:['Selected movie'],year:'2021',series:false}}),{});
  assert.deepEqual((await noMatch.json()).results,[]);
 }finally{globalThis.fetch=old;}
});
test('malformed movie identity is rejected before making an upstream request',async()=>{
 const response=await handleRezka(req({action:'search',title:'Film',movie:{titles:'Film'}}),{});assert.equal(response.status,400);
});
test('Nested translator markup produces one row per ID without losing other voices',()=>{
 const html=film.replace('<li data-translator_id="42" data-ads="1">Українська</li>','<li data-translator_id="42"><a class="b-prem_translator" data-translator_id="42" data-ads="1">Українська</a></li>');
 const post=parseRezkaPost(html,path);assert.equal(post.translations.length,2);assert.equal(post.translations[0].id,'42');assert.equal(post.translations[0].is_ads,'1');assert.equal(post.translations[0].premium,true);
});
test('Original title and release date belong to the film metadata and stale post IDs are rejected',()=>{
 const html=film+'<div class="b-post__origtitle">Original Example</div><table class="b-post__info"><tr><td>Дата выхода:</td><td>19 мая 2021 года</td></tr></table>';
 const metadata=parseRezkaMetadata(html,path);assert.equal(metadata.original_title,'Original Example');assert.equal(metadata.year,2021);assert.equal(metadata.series,false);
 assert.throws(()=>parseRezkaPost(html,path.replace('123','999')),/rezka_movie_mismatch/);
});
test('Original-title search checks a bounded set of candidate metadata instead of returning a false empty list',async()=>{
 let calls=0;const fetcher=async url=>{calls++;return new Response(new URL(url).pathname==='/search/'?search:film+'<div class="b-post__origtitle">Original Example</div><table class="b-post__info"><tr><td>Год:</td><td>2021</td></tr></table>');};
 const r=await handleRezka(req({action:'search',title:'Original Example',movie:{titles:['Original Example'],year:'2021',series:false}}),{},fetcher);const data=await r.json();assert.equal(r.status,200);assert.equal(data.results.length,1);assert.equal(data.results[0].original_title,'Original Example');assert.equal(calls,2);
});
test('Post identity is checked again before returning voices',async()=>{
 const r=await handleRezka(req({action:'post',path,movie:{titles:['Different film'],year:'2021',series:false}}),{},async()=>new Response(film));assert.equal(r.status,502);assert.equal((await r.json()).error,'rezka_movie_mismatch');
});
test('Protected or empty playback responses never report successful playable results',async()=>{
 const denied=await handleRezka(req({action:'stream',id:123,translator_id:42}),{},async()=>Response.json({success:false,message:'Для просмотра необходимо войти в аккаунт Premium'}));assert.equal((await denied.json()).error,'rezka_auth_required');
 const empty=await handleRezka(req({action:'stream',id:123,translator_id:42}),{},async()=>Response.json({success:true,url:''}));assert.equal((await empty.json()).error,'rezka_stream_unavailable');
});

test('Fresh anonymous playback uses the page nonce, its cookies and exact page referer',async()=>{
 let calls=0;
 const response=await handleRezka(req({action:'stream',path,id:123,translator_id:42,favs:'untrusted-client-nonce'}),{},async(url,options)=>{
  calls++;
  if(options.method==='GET')return new Response(film+'<input id="ctrl_favs" value="fresh-page-nonce">',{headers:{'set-cookie':'PHPSESSID=guest-session; Path=/; HttpOnly; Secure'}});
  const form=new URLSearchParams(options.body);
  assert.equal(form.get('favs'),'fresh-page-nonce');assert.equal(form.get('translator_id'),'42');assert.equal(options.headers.cookie,'PHPSESSID=guest-session');assert.equal(options.headers.referer,'https://rezka.ag'+path);
  return Response.json({success:true,url:'[720p]https://cdn.example/film.m3u8'});
 });
 assert.equal(response.status,200);assert.equal(calls,2);const data=await response.json();assert.equal(data.items[0].quality,'720p');assert.ok(!JSON.stringify(data).includes('guest-session'));assert.ok(!JSON.stringify(data).includes('fresh-page-nonce'));
});
test('Guest sessions are isolated between simultaneous requests',async()=>{
 const seen=[];
 const fetcher=async(url,options)=>{
  if(options.method==='GET'){
   const id=new URL(url).pathname.includes('456-')?'456':'123';await Promise.resolve();
   return new Response(film.replaceAll('123',id)+'<input id="ctrl_favs" value="nonce-'+id+'">',{headers:{'set-cookie':'PHPSESSID=guest-'+id+'; Path=/'}});
  }
  const form=new URLSearchParams(options.body);seen.push(form.get('id'));
  assert.equal(options.headers.cookie,'PHPSESSID=guest-'+form.get('id'));assert.equal(form.get('favs'),'nonce-'+form.get('id'));
  return Response.json({success:true,url:'[720p]https://cdn.example/video.m3u8'});
 };
 const responses=await Promise.all(['123','456'].map(id=>handleRezka(req({action:'stream',path:path.replace('123',id),id,translator_id:42}),{},fetcher)));
 assert.ok(responses.every(response=>response.status===200));assert.deepEqual(seen.sort(),['123','456']);
});
test('A validated source redirect keeps guest cookies on their own origin',async()=>{
 let calls=0;
 const response=await handleRezka(req({action:'stream',path,id:123,translator_id:42}),{},async(url,options)=>{
  calls++;
  if(new URL(url).origin==='https://rezka.ag')return new Response('',{status:302,headers:{location:'https://hdrezka-home.tv'+path,'set-cookie':'PHPSESSID=first-origin; Path=/'}});
  if(options.method==='GET'){
   assert.equal(options.headers.cookie,undefined);
   return new Response(film+'<input id="ctrl_favs" value="redirect-nonce">',{headers:{'set-cookie':'PHPSESSID=second-origin; Path=/'}});
  }
  assert.equal(new URL(url).origin,'https://hdrezka-home.tv');assert.equal(options.headers.cookie,'PHPSESSID=second-origin');assert.equal(options.headers.referer,'https://hdrezka-home.tv'+path);
  return Response.json({success:true,url:'[720p]https://cdn.example/video.m3u8'});
 });
 assert.equal(response.status,200);assert.equal(calls,3);
});
test('Bad session paths are rejected before fetch and missing page tokens stop before video',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response(film);};
 const wrong=await handleRezka(req({action:'stream',path:path.replace('123','999'),id:123,translator_id:42}),{},fetcher);assert.equal(wrong.status,400);assert.equal(calls,0);
 const missing=await handleRezka(req({action:'stream',path,id:123,translator_id:42}),{},fetcher);assert.equal((await missing.json()).error,'rezka_session_required');assert.equal(calls,1);
});
test('Expired sessions and premium-only replies have distinct errors with no invented stream',async()=>{
 const expired=await handleRezka(req({action:'stream',id:123,translator_id:42}),{},async()=>Response.json({success:false,message:'Время сессии истекло. Пожалуйста, обновите страницу и повторите попытку'}));assert.equal((await expired.json()).error,'rezka_session_expired');
 const premium=await handleRezka(req({action:'stream',id:123,translator_id:42}),{},async()=>Response.json({success:true,premium_content:1,url:''}));assert.equal((await premium.json()).error,'rezka_auth_required');
});
