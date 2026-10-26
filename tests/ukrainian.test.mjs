import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync,createCipheriv} from 'node:crypto';
import {decodeUASerialsTabs,parseUkrainianSearch,parseUkrainianPost,handleUkrainian,matchesMirrorMedia} from '../worker/ukrainian.js';
import worker from '../worker/index.js';
const path='/123-movie.html',master='https://calypso.tortuga.tw/t/film/index.m3u8';
const req=body=>new Request('https://xot.test/api/uaserials',{method:'POST',body:JSON.stringify(body)});
const tabs=[{tabName:'Плеєр',url:'https://tortuga.tw/vod/123'},{tabName:'Трейлер',url:'https://tortuga.tw/vod/999'}];
function encodedTabs(value=tabs){
 const salt=Buffer.from('0123456789abcdef','hex'),iv=Buffer.from('0123456789abcdef0123456789abcdef','hex');
 const key=pbkdf2Sync('297796CCB81D255125',salt,999,32,'sha512'),aes=createCipheriv('aes-256-cbc',key,iv);
 return JSON.stringify({salt:salt.toString('hex'),iv:iv.toString('hex'),ciphertext:Buffer.concat([aes.update(JSON.stringify(value)),aes.final()]).toString('base64')});
}
const uaPage=(tabData=encodedTabs())=>`<main><div id="dle-content"><h1><span class="oname_ua">Назва</span></h1><div class="oname">Movie</div><ul><li>Рік: 2021</li><li>Жанр: Фільм, Бойовик</li><li>Переклад: Студія</li></ul><player-control data-tag1='${tabData}'></player-control></div></main>`;
const kinoPage=`<div id="dle-content"><div class="inner-page"><h1 class="inner-page__title">Назва</h1><div class="inner-page__subtitle">Movie</div><ul><li>Рік: 2021</li><li>Жанр: Фільм</li></ul><div class="inner-page__player tabs-block"><div class="tabs-block__select--player"><span>Плеєр</span><span>Трейлер</span></div><div class="tabs-block__content"><iframe src="https://tortuga.tw/vod/123"></iframe></div><div class="tabs-block__content"><iframe src="https://tortuga.tw/vod/999"></iframe></div></div></div></div>`;
const uaCard=(id,title,original,year)=>`<a class="uas-card" data-uas-type="post" href="https://uaserials.com/${id}-movie.html"><span class="uas-card__year">${year}</span><span class="uas-card__title">${title}</span><span class="uas-card__orig">${original}</span></a>`;
test('UASerials reads current search cards including marked original names, excluding unrelated areas',()=>{
 const html=`<aside>${uaCard(9,'Other','Other',2021)}</aside><div id="dle-content">${uaCard(123,'Назва','<mark>Movie</mark>',2021)}${uaCard(2,'Other','Other',2021)}</div>`;
 const items=parseUkrainianSearch(html,'uaserials');assert.equal(items.length,2);assert.equal(items[0].original_title,'Movie');assert.equal(items[0].year,2021);assert.deepEqual(parseUkrainianSearch(html.replaceAll('https://uaserials.com','https://attacker.example'),'uaserials'),[]);
});
test('KinoVezha search returns semantic film cards and their original title/year',()=>{
 const items=parseUkrainianSearch('<div id="dle-content"><div class="movie-item"><a class="movie-item__link" href="/123-movie.html"><div class="movie-item__title">Назва</div></a><div class="movie-item__meta"><span>2021</span><span>Movie</span></div></div></div>','kinovezha');assert.equal(items[0].title,'Назва');assert.equal(items[0].original_title,'Movie');assert.equal(items[0].year,2021);
});
test('UASerials public player tab format interoperates with its PBKDF2/AES representation',async()=>{
 assert.deepEqual(await decodeUASerialsTabs(encodedTabs()),tabs);
 await assert.rejects(decodeUASerialsTabs('{"salt":"invalid"}'),/player_format/);
 const data=JSON.parse(encodedTabs());data.ciphertext='invalid';await assert.rejects(decodeUASerialsTabs(data),/player_format/);
});
test('Both site parsers exclude trailers even when their URLs use the same video host',async()=>{
 for(const [provider,html] of [['uaserials',uaPage()],['kinovezha',kinoPage]]){
  const post=await parseUkrainianPost(html,path,provider);assert.deepEqual(post.players,['https://tortuga.tw/vod/123']);assert.equal(post.title,'Назва');assert.equal(post.original_title,'Movie');assert.equal(post.series,false);
 }
});
test('Player tab URLs are not arbitrary upstreams, executable scripts, or off-site embeds',async()=>{
 await assert.rejects(parseUkrainianPost(uaPage(encodedTabs([{tabName:'Плеєр',url:'https://attacker.example/vod/123'}])),path,'uaserials'),/player_not_found/);
 await assert.rejects(parseUkrainianPost(kinoPage.replace('https://tortuga.tw/vod/123','https://tortuga.tw.attacker.example/vod/123'),path,'kinovezha'),/player_not_found/);
});
test('Invalid input for both adapters fails before network access',async()=>{
 const old=globalThis.fetch;let count=0;try{globalThis.fetch=async()=>{count++;throw Error();};
 for(const provider of ['kinovezha','uaserials'])for(const body of [{action:'post',path:'//attacker.example/123.html'},{action:'stream',url:'https://localhost/a.m3u8'},{action:'search',title:'x'.repeat(201)},{action:'search',title:'Movie',movie:{titles:['Movie'],year:'bad'}},{action:'unknown'}])assert.equal((await handleUkrainian(req(body),provider)).status,400);
 assert.equal(count,0);
 }finally{globalThis.fetch=old;}
});
test('Opening a different film is rejected before requesting any video player',async()=>{
 const old=globalThis.fetch;let count=0;try{globalThis.fetch=async()=>{count++;return new Response(uaPage());};
 const response=await handleUkrainian(req({action:'post',path,movie:{titles:['Wrong'],year:2021,series:false}}),'uaserials');assert.equal(response.status,502);assert.equal((await response.json()).error,'uaserials_movie_mismatch');assert.equal(count,1);
 }finally{globalThis.fetch=old;}
});
test('Site requests never follow redirects to another host or report access restrictions as empty results',async()=>{
 const old=globalThis.fetch;try{
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://attacker.example/'}});assert.equal((await(await handleUkrainian(req({action:'search',title:'Movie'}),'uaserials')).json()).error,'uaserials_redirect');
  globalThis.fetch=async()=>new Response('restricted',{status:403});assert.equal((await(await handleUkrainian(req({action:'search',title:'Movie'}),'kinovezha')).json()).error,'kinovezha_access_denied');
 }finally{globalThis.fetch=old;}
});
test('A UASerials movie traverses only its chosen public player and real HLS variants',async()=>{
 const old=globalThis.fetch,calls=[];try{
 globalThis.fetch=async url=>{const u=String(url);calls.push(u);return new Response(u.endsWith('.html')?uaPage():u.includes('/vod/')?`<script>new Playerjs({file:${JSON.stringify(master)}});</script>`:'#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x800\n1080/index.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1280x532\n720/index.m3u8');};
 const response=await worker.fetch(req({action:'post',path}),{}),data=await response.json();assert.equal(response.status,200);assert.deepEqual(data.items.map(x=>x.quality),['1080p','720p']);assert.equal(data.items[0].provider,'uaserials');assert.equal(data.items[0].source,'UASerials');assert.equal(calls.length,3);assert.ok(!calls.some(url=>url.endsWith('/999')));
 }finally{globalThis.fetch=old;}
});
test('Native source health and POST preflights expose both new adapters',async()=>{
 const health=await(await worker.fetch(new Request('https://xot.test/api/health'),{})).json();for(const id of ['kinovezha','uaserials']){assert.ok(health.native_balancers.includes(id));assert.equal((await worker.fetch(new Request('https://xot.test/api/'+id,{method:'OPTIONS'}),{})).status,204);}
});
test('An alternate player must independently match the full original title and movie year',()=>{
 const movie={original_title:'Movie',year:2021,series:false},url='https://s30.hdvbua.pro/media/movie_2021_webdl/hls/index.m3u8';
 assert.equal(matchesMirrorMedia({url},movie),true);assert.equal(matchesMirrorMedia({url}, {...movie,year:2022}),false);assert.equal(matchesMirrorMedia({url:url.replace('movie_','movie_two_')},movie),false);assert.equal(matchesMirrorMedia({url:master},movie),false);
 assert.equal(matchesMirrorMedia({url:'https://s30.hdvbua.pro/media/tulsa.king.s02e01/hls/index.m3u8'},{original_title:'Tulsa King',series:true}),true);
});
test('Unavailable public Tortuga pages may use only an identity-checked public archive alias',async()=>{
 const old=globalThis.fetch,calls=[];try{
 globalThis.fetch=async url=>{const u=String(url);calls.push(u);return new Response(u.endsWith('.html')?kinoPage:u.startsWith('https://tortuga.tw/')?'<html><h1>404 Not Found</h1></html>':u.includes('/vid/')?'<script>new Playerjs({file:"https://s30.hdvbua.pro/media/movie_2021_webdl/hls/index.m3u8"});</script>':'#EXTM3U\n#EXTINF:10,\na.ts\n#EXT-X-ENDLIST');};
 const response=await handleUkrainian(req({action:'post',path}),'kinovezha'),data=await response.json();assert.equal(response.status,200);assert.equal(data.items[0].player_source,'HDVB UA');assert.ok(calls.includes('https://hdvbua.pro/vid/123'));assert.ok(!calls.some(x=>x.includes('/999')));
 }finally{globalThis.fetch=old;}
});
