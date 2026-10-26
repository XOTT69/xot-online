import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEneyidaSearch,parseEneyidaPost,playerFile,playerInventory,hlsQualities,handleEneyida} from '../worker/eneyida.js';
import worker from '../worker/index.js';

const path='/6785-resident-evil.html',master='https://s30.hdvbua.pro/media/film/index.m3u8';
const req=body=>new Request('https://xot.test/api/eneyida',{method:'POST',body:JSON.stringify(body)});
const card=(id,title,original,year,extra='')=>`<article class="short"><a class="short_title" href="https://eneyida.tv/${id}-film.html">${title}</a><div class="short_subtitle"><a>${year}</a> &bull; ${original}</div>${extra}</article>`;
const search=`<aside>${card(9,'Wrong','Wrong',2021)}</aside><div id="dle-content">${card(6785,'Оселя зла: Вітаємо в Раккун-Сіті','Resident Evil: Welcome to Raccoon City',2021)}${card(7688,'Оселя зла','Resident Evil',2022,'<span>1 сезон 8 серія</span>')}</div>`;
const page=`<article class="full"><h1>Оселя зла: Вітаємо в Раккун-Сіті</h1><div class="full_header-subtitle">Resident Evil: Welcome to Raccoon City</div><ul id="full_info"><li>Рік: 2021</li><li>Жанр: фільм • жахи</li><li>Звук: LeDoyen # DUB</li></ul><div class="tabs_b visible"><iframe src="https://hdvbua.pro/vid/72599"></iframe></div><div class="tabs_b" id="trailer_place"><iframe src="https://hdvbua.pro/vid/72156?tr=1"></iframe></div></article>`;
const masterBody='#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x794,BANDWIDTH=2128000\n1080/index.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1280x528,BANDWIDTH=1096000\n720/index.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=854x352,BANDWIDTH=714000\n480/index.m3u8\n';
const player=file=>`<script>new Playerjs({id:"main",file:${JSON.stringify(file)}});</script>`;

test('Eneyida parses only search cards, preserves English identity, year and series type',()=>{
 const results=parseEneyidaSearch(search);assert.equal(results.length,2);assert.equal(results[0].original_title,'Resident Evil: Welcome to Raccoon City');assert.equal(results[0].year,2021);assert.equal(results[0].series,false);assert.equal(results[1].series,true);
});
test('Eneyida rejects off-site card links and pages without the search container',()=>{
 assert.deepEqual(parseEneyidaSearch(search.replaceAll('https://eneyida.tv/','https://attacker.example/')),[]);assert.deepEqual(parseEneyidaSearch(card(1,'Film','Film',2021)),[]);
});
test('Eneyida excludes the same-host trailer and gets voice details from the film',()=>{
 const post=parseEneyidaPost(page,path);assert.deepEqual(post.players,['https://hdvbua.pro/vid/72599']);assert.equal(post.translation,'Українська · LeDoyen # DUB');assert.equal(post.series,false);assert.equal(post.year,2021);
 assert.throws(()=>parseEneyidaPost(page.replace('https://hdvbua.pro/vid/72599','https://attacker.example/vid/72599'),path),/player_not_found/);
});
test('PlayerJS data is parsed as literals without executing JavaScript',()=>{
 assert.equal(playerFile(player(master)),master);
 assert.equal(playerFile(player(master).replace('new Playerjs','new TortugaCore')),master);
 const file=JSON.stringify([{title:'Укр. Дуб.',file:master}]);assert.equal(playerFile(`<script>new Playerjs({file:'${file}'});</script>`),file);
 assert.equal(playerFile(`<script>new Playerjs({file:${file}});</script>`),file);
 assert.throws(()=>playerFile('<script>new Playerjs({file:(globalThis.compromised=true)});</script>'),/player_format/);
 assert.equal(globalThis.compromised,undefined);
});
test('Eneyida keeps movie voices and only trusted HTTPS HLS media',()=>{
 const post=parseEneyidaPost(page,path);
 const items=playerInventory(JSON.stringify([{title:'Dub A',file:master},{title:'Dub B',file:master},{title:'Embed',file:'https://hdvbua.pro/embed/1'},{title:'Offsite',file:'https://hdvbua.pro.attacker.example/a.m3u8'}]),post);
 assert.equal(items.length,2);assert.deepEqual(items.map(x=>x.translation),['Dub A','Dub B']);assert.equal(items[0].episode,null);assert.equal(items[0].needs_resolve,true);assert.notEqual(items[0].voice_id,items[1].voice_id);
});
test('Eneyida preserves both voice-first and season-first episode trees',()=>{
 const post={title:'Show',series:true},episode={title:'3 серія',file:master};
 for(const tree of [[{title:'Voice A',folder:[{title:'2 сезон',folder:[episode]}]}],[{title:'2 сезон',folder:[{title:'Voice A',folder:[episode]}]}]]){
  const items=playerInventory(JSON.stringify(tree),post);assert.equal(items.length,1);assert.equal(items[0].season,2);assert.equal(items[0].episode,3);assert.equal(items[0].translation,'Voice A');
 }
});
test('Eneyida reports excessive playlist nesting rather than silently dropping episodes',()=>{
 let tree={title:'1 серія',file:master};for(let i=0;i<20;i++)tree={folder:[tree]};assert.throws(()=>playerInventory(JSON.stringify([tree]),{series:true}),/response_too_large/);
});
test('Tortuga packed episode voices and subtitle tails preserve all voices and clean URLs',()=>{
 const data=[{title:'Сезон 2',folder:[{title:'Серія 3',file:'{Studio A}'+master+'(subtitle:[UK]https://tortuga.tw/uk.vtt);{Studio B}'+master.replace('/film/','/dub/')+'(subtitle:)'}]}];
 const items=playerInventory(JSON.stringify(data),{title:'Series',series:true,provider:'uaserials',source:'UASerials'});assert.equal(items.length,2);assert.deepEqual(items.map(x=>x.translation),['Studio A','Studio B']);assert.equal(items[0].season,2);assert.equal(items[0].episode,3);assert.equal(items[0].url,master);assert.equal(items[0].provider,'uaserials');
});
test('HLS quality uses cropped cinema width and resolves relative HTTPS variants',()=>{
 const items=hlsQualities(masterBody,master);assert.deepEqual(items.map(x=>x.quality),['1080p','720p','480p']);assert.equal(items[0].url,'https://s30.hdvbua.pro/media/film/1080/index.m3u8');
 assert.deepEqual(hlsQualities(masterBody.replace('1920x794','3840x1588'),master).map(x=>x.quality),['2160p','720p','480p']);
 assert.equal(hlsQualities(masterBody.replace('1920x794','1440x1080'),master)[0].quality,'1080p');
});
test('Separate audio groups stay attached to their HLS master',()=>{
 const items=hlsQualities('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"\n'+masterBody,master);assert.equal(items.length,1);assert.equal(items[0].url,master);assert.equal(items[0].quality,'Авто');assert.deepEqual(items[0].available_qualities,['1080p','720p','480p']);
});
test('Non-video pages, foreign variants and unsupported DRM are rejected',()=>{
 assert.throws(()=>hlsQualities('<html>not video</html>',master),/invalid_playlist/);
 assert.throws(()=>hlsQualities(masterBody.replaceAll(/\n(?:1080|720|480)\/index.m3u8/g,'\nhttps://attacker.example/a.m3u8'),master),/invalid_playlist/);
 assert.throws(()=>hlsQualities('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm"\n#EXTINF:10\na.ts',master),/unsupported_stream/);
});
test('Eneyida validates input before any upstream request',async()=>{
 const old=globalThis.fetch;let calls=0;try{globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
 for(const body of [{action:'post',path:'//attacker.example/a.html'},{action:'post',path:'/1-../2.html'},{action:'stream',url:'https://localhost/a.m3u8'},{action:'stream',url:'https://s30.hdvbua.pro:8443/a.m3u8'},{action:'stream',url:'https://user:pass@hdvbua.pro/a.m3u8'},{action:'search',title:'x'.repeat(201)},{action:'search',title:'Film',movie:{titles:['Film'],year:'invalid'}},{action:'episodes'}])assert.equal((await handleEneyida(req(body))).status,400);
 assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});
test('Worker search uses the public form, filters unrelated films and never forwards client secrets',async()=>{
 const old=globalThis.fetch;let seen;try{
 globalThis.fetch=async(url,options)=>{seen={url:String(url),options};return new Response(search);};
 const response=await worker.fetch(req({action:'search',title:'Оселя зла',device_token:'private-token',movie:{titles:['Resident Evil: Welcome to Raccoon City'],year:2021,series:false}}),{});
 assert.equal(response.status,200);assert.equal((await response.json()).results.length,1);assert.equal(seen.url,'https://eneyida.tv/');assert.equal(seen.options.redirect,'manual');assert.equal(new URLSearchParams(seen.options.body).get('story'),'Оселя зла');assert.ok(!JSON.stringify(seen).includes('private-token'));
 }finally{globalThis.fetch=old;}
});
test('Worker movie post resolves actual qualities and never requests its trailer',async()=>{
 const old=globalThis.fetch,calls=[];try{
 globalThis.fetch=async url=>{const u=String(url);calls.push(u);return new Response(u.endsWith('.html')?page:u.includes('/vid/')?player(master):masterBody);};
 const response=await worker.fetch(req({action:'post',path}),{}),data=await response.json();assert.equal(response.status,200);assert.deepEqual(data.items.map(x=>x.quality),['1080p','720p','480p']);assert.equal(calls.length,3);assert.ok(!calls.some(x=>x.includes('72156')));assert.equal(data.items[0].needs_resolve,false);
 }finally{globalThis.fetch=old;}
});
test('Series post inventories every episode without requesting each video playlist',async()=>{
 const old=globalThis.fetch,calls=[];try{
 const file=JSON.stringify([{title:'Voice',folder:[{title:'1 сезон',folder:Array.from({length:25},(_,i)=>({title:(i+1)+' серія',file:master.replace('/film/',`/ep${i+1}/`)}))}]}]);
 globalThis.fetch=async url=>{calls.push(String(url));return new Response(String(url).endsWith('.html')?page.replace('Жанр: фільм','Жанр: серіал'):player(file));};
 const response=await handleEneyida(req({action:'post',path})),data=await response.json();assert.equal(response.status,200);assert.equal(data.items.length,25);assert.equal(calls.length,2);assert.equal(data.items[24].episode,25);assert.equal(data.items[24].needs_resolve,true);
 }finally{globalThis.fetch=old;}
});
test('Eneyida rechecks the opened movie page before fetching its player',async()=>{
 const old=globalThis.fetch;let calls=0;try{globalThis.fetch=async()=>{calls++;return new Response(page);};
 const response=await handleEneyida(req({action:'post',path,movie:{titles:['Unrelated film'],year:2021,series:false}}));assert.equal(response.status,502);assert.equal((await response.json()).error,'eneyida_movie_mismatch');assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});
test('Episode stream resolves qualities and preserves season, episode and voice',async()=>{
 const old=globalThis.fetch;try{globalThis.fetch=async()=>new Response(masterBody);
 const response=await handleEneyida(req({action:'stream',url:master,season:2,episode:3,translation:'Dub',voice_id:'voice-1'})),data=await response.json();assert.equal(data.items.length,3);assert.equal(data.items[0].episode,3);assert.equal(data.items[0].season,2);assert.equal(data.items[0].voice_id,'voice-1');assert.equal(data.items[0].needs_resolve,false);
 }finally{globalThis.fetch=old;}
});
test('Upstream access restrictions and off-site redirects are errors, not empty results',async()=>{
 const old=globalThis.fetch;try{
 globalThis.fetch=async()=>new Response('denied',{status:403});assert.equal((await (await handleEneyida(req({action:'search',title:'Film'}))).json()).error,'eneyida_access_denied');
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://attacker.example/vid/1'}});assert.equal((await (await handleEneyida(req({action:'post',path}))).json()).error,'eneyida_invalid_url');
 globalThis.fetch=async()=>new Response('<title>Just a moment...</title>');assert.equal((await (await handleEneyida(req({action:'search',title:'Film'}))).json()).error,'eneyida_access_denied');
 }finally{globalThis.fetch=old;}
});
test('Eneyida preflight and health advertise the independent adapter',async()=>{
 const preflight=await worker.fetch(new Request('https://xot.test/api/eneyida',{method:'OPTIONS'}),{});assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-methods'),/POST/);
 const health=await (await worker.fetch(new Request('https://xot.test/api/health'),{})).json();assert.ok(health.native_balancers.includes('eneyida'));
});
