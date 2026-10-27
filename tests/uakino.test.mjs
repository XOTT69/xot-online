import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUakinoSearch,parseUakinoPost,ashdiURL,handleUakino} from '../worker/uakino.js';
import worker from '../worker/index.js';
const path='/filmy/25003-resident-evil-welcome-to-raccoon-city-2021.html',master='https://ashdi.vip/video27/film/hls/index.m3u8';
const req=body=>new Request('https://xot.test/api/uakino',{method:'POST',body:JSON.stringify(body)});
const searchCard=(path,title,year)=>`<div class="movie-item short-item"><a class="movie-title" href="https://uakino.eu${path}">${title}</a><div class="movie-desk-item">Рік виходу: <a>${year}</a></div></div>`;
const moviePage=`<div id="dle-content"><h1><span class="solototle">Оселя зла: Вітаємо в Раккун-Сіті</span></h1><span class="origintitle">Resident Evil: Welcome to Raccoon City</span><article><div class="film-poster"><img src="/uploads/posts/tt6920084/poster.webp"></div><div class="fi-item"><div class="fi-label"><h2>Рік виходу:</h2></div><div class="fi-desc">2021</div></div><div class="fi-item"><div class="fi-label">Мова озвучення:</div><div class="fi-desc">Український (LeDoyen)</div></div><div data-uakino-player-tabs data-news-id="25003" data-season="0"><div data-player-panel="uacdn"><textarea class="uakino-embed__source">https://franko.uacdn.online/show/kinopoisk/1</textarea></div><div data-player-panel="ashdi"><textarea class="uakino-embed__source">https://ashdi.vip/vod/52850</textarea></div><div data-player-panel="trailer"><textarea class="uakino-embed__source">https://ashdi.vip/vod/999</textarea></div></div></article></div>`;
const seriesPath='/seriesss/22922-tulsa-king-1-season-2022.html';
const seriesPage=`<div id="dle-content"><h1><span class="solototle">Король Талси 1 сезон</span></h1><span class="origintitle">Tulsa King 1 season</span><div class="fi-item"><div class="fi-label">Рік виходу:</div><div class="fi-desc">2022</div></div><div data-uakino-player-tabs data-season="1" data-episodes-total="9" data-last-episode="9"><div data-player-panel="ashdi"><div class="ashdi-smart"></div></div></div></div>`;
const hls='#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x794\n1080/index.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1280x528\n720/index.m3u8';
test('UAKino search reads only semantic cards and derives an original title from the published slug',()=>{
 const html=`<aside>${searchCard('/filmy/9-other-2021.html','Other',2021)}</aside><div id="dle-content">${searchCard(path,'Оселя зла: Вітаємо в Раккун-Сіті',2021)}${searchCard(seriesPath,'Король Талси 1 сезон',2022)}</div>`;
 const result=parseUakinoSearch(html);assert.equal(result.length,2);assert.equal(result[0].original_title,'resident evil welcome to raccoon city');assert.equal(result[1].title,'Король Талси');assert.equal(result[1].original_title,'tulsa king');assert.equal(result[1].series,true);assert.deepEqual(parseUakinoSearch(html.replaceAll('https://uakino.eu','https://attacker.example')),[]);
});
test('UAKino post reads the film identity and excludes protected players and same-host trailers',()=>{
 const post=parseUakinoPost(moviePage,path);assert.deepEqual(post.players,['https://ashdi.vip/vod/52850']);assert.equal(post.imdb_id,'tt6920084');assert.equal(post.year,2021);assert.equal(post.language,'uk');assert.equal(post.series,false);
});
test('UAKino series pages retain the series identity rather than treating each season as another show',()=>{
 const post=parseUakinoPost(seriesPage,seriesPath);assert.equal(post.title,'Король Талси');assert.equal(post.original_title,'Tulsa King');assert.equal(post.year,2022);assert.equal(post.season,1);assert.equal(post.episodes_total,9);assert.equal(post.series,true);
});
test('Ashdi URLs are limited to public HTTPS player routes and its own HLS hosts',()=>{
 assert.equal(ashdiURL('https://ashdi.vip/serial/2047?season=1&episode=1',true).toString(),'https://ashdi.vip/serial/2047');
 for(const url of ['https://ashdi.vip.attacker.example/a.m3u8','https://127.0.0.1/a.m3u8','http://ashdi.vip/a.m3u8','https://user:pass@ashdi.vip/a.m3u8','https://ashdi.vip:8443/a.m3u8'])assert.throws(()=>ashdiURL(url),/invalid_url/);
 assert.throws(()=>ashdiURL('https://ashdi.vip/player/stats',true),/invalid_url/);
});
test('Invalid UAKino paths, actions and URLs fail before any request',async()=>{
 const old=globalThis.fetch;let calls=0;try{globalThis.fetch=async()=>{calls++;throw Error();};
 for(const body of [{action:'post',path:'//attacker.example/a.html'},{action:'post',path:'/filmy/../../private.html'},{action:'search',title:'x'.repeat(201)},{action:'stream',url:'https://localhost/a.m3u8'},{action:'unknown'}])assert.equal((await handleUakino(req(body))).status,400);assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});
test('UAKino rechecks the opened page before requesting its video host',async()=>{
 const old=globalThis.fetch;let calls=0;try{globalThis.fetch=async()=>{calls++;return new Response(moviePage);};
 const response=await handleUakino(req({action:'post',path,movie:{titles:['Wrong movie'],year:2021,series:false}}));assert.equal(response.status,502);assert.equal((await response.json()).error,'uakino_movie_mismatch');assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});
test('UAKino movie resolves only the published Ashdi player and actual HLS variants',async()=>{
 const old=globalThis.fetch,calls=[];try{globalThis.fetch=async(url,options)=>{const u=String(url);calls.push({url:u,redirect:options.redirect});return new Response(u.endsWith('.html')?moviePage:u.includes('/vod/')?`<script>new Playerjs({file:${JSON.stringify(master)}})</script>`:hls);};
 const response=await worker.fetch(req({action:'post',path}),{}),data=await response.json();assert.equal(response.status,200);assert.deepEqual(data.items.map(x=>x.quality),['1080p','720p']);assert.equal(data.items[0].provider,'uakino');assert.equal(data.items[0].language,'uk');assert.equal(calls.length,3);assert.ok(calls.every(x=>x.redirect==='manual'));assert.ok(!calls.some(x=>/999|uacdn/.test(x.url)));
 }finally{globalThis.fetch=old;}
});
test('The current smart_playlist protocol loads full series data without per-episode network fan-out',async()=>{
 const old=globalThis.fetch,calls=[];try{
 const playlist=JSON.stringify([{title:'Studio A',folder:[{title:'Сезон 1',folder:[{title:'Серія 1',file:master}]},{title:'Сезон 2',folder:[{title:'Серія 1',file:master.replace('/film/','/series/')}]}]}]);
 globalThis.fetch=async(url,options)=>{const u=String(url);calls.push({url:u,body:options.body});return new Response(u.endsWith('.html')?seriesPage:u.includes('smart_playlist')?JSON.stringify({ok:true,html:'<iframe src="https://ashdi.vip/serial/2047?season=1&amp;nopl=1&amp;episode=1"></iframe>'}):`<script>new Playerjs({file:${JSON.stringify(playlist)}})</script>`);};
 const response=await handleUakino(req({action:'post',path:seriesPath})),data=await response.json();assert.equal(response.status,200);assert.equal(data.items.length,2);assert.deepEqual(data.items.map(x=>x.season),[1,2]);assert.equal(calls.length,3);assert.equal(calls[2].url,'https://ashdi.vip/serial/2047');assert.equal(new URLSearchParams(calls[1].body).get('news_id'),'22922');assert.equal(data.items[0].needs_resolve,true);
 }finally{globalThis.fetch=old;}
});
test('UAKino never follows an off-site redirect or converts an access restriction into empty results',async()=>{
 const old=globalThis.fetch;try{
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://attacker.example/'}});assert.equal((await(await handleUakino(req({action:'search',title:'Film'}))).json()).error,'uakino_redirect');
 globalThis.fetch=async()=>new Response('denied',{status:403});assert.equal((await(await handleUakino(req({action:'search',title:'Film'}))).json()).error,'uakino_access_denied');
 }finally{globalThis.fetch=old;}
});

test('Ashdi regional restrictions are reported without another host or IP fallback',async()=>{
 const old=globalThis.fetch,calls=[];try{
 globalThis.fetch=async url=>{calls.push(String(url));return new Response(String(url).endsWith('.html')?moviePage:'<title>Змініть країну перегляду</title><h1>Плеєр недоступний для перегляду</h1>в цій країні');};
 const response=await handleUakino(req({action:'post',path}));assert.equal(response.status,502);assert.equal((await response.json()).error,'uakino_region_restricted');assert.equal(calls.length,2);
 }finally{globalThis.fetch=old;}
});
