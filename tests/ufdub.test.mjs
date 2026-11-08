import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUFDubSearch,parseUFDubPost,parseUFDubPlayer,literalArray,episodeURL,mediaRedirect,handleUFDub} from '../worker/ufdub.js';
import worker from '../worker/index.js';
const path='/anime/454-show.html',film='/film/454-movie.html';
const player='https://video.ufdub.com/V2/VP.php?ID=454&Name=Show';
const endpoint=(n,tab='Основа')=>'https://ufdub.com/video/VIDEOS.php?'+new URLSearchParams({ID:'454',TAB:tab,Seriya:'['+n+'] Серія',POS:String(n)});
const media='https://api.ufdub.com/UFDUB_UPLOAD/VIDEO/454-episode.mp4';
const page=(title='Назва',original='Show / Alternate Show')=>`<article class="full"><h1>${title}<br><div class="short-t-or">${original}</div></h1><div class="description">Події 2024 року</div><div class="fi-col-item"><span>Рік:</span><a>2018</a></div><iframe id="input_video_player" src="${player}"></iframe></article><aside><h1>Unrelated</h1></aside>`;
const playlist=(numbers=[1,3,10])=>'<script>a='+JSON.stringify(numbers.map(n=>['['+n+'] Серія','mp4',endpoint(n)]))+';</script>';
const req=body=>new Request('https://xot.test/api/ufdub',{method:'POST',body:JSON.stringify(body)});
async function withFetch(handler,work){const original=globalThis.fetch;try{globalThis.fetch=handler;await work();}finally{globalThis.fetch=original;}}
test('UFDub search ignores stale template originals, sidebars and description years',()=>{
 const card=`<div class="short"><img alt="Назва / Show / Alternate Show"><div class="short-t-or">Wrong show</div><a class="short-t" href="https://ufdub.com${path}">Назва / Show</a><p>Рік 2024</p></div>`;
 const rows=parseUFDubSearch('<div class="cont">'+card+'</div><aside>'+card.replaceAll('454','999')+'</aside>');
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Назва');assert.equal(rows[0].year,null);assert.ok(rows[0].alternative_titles.includes('Alternate Show'));assert.ok(!JSON.stringify(rows).includes('Wrong show'));
 const post=parseUFDubPost(page(),path);assert.equal(post.title,'Назва');assert.equal(post.original_title,'Show');assert.equal(post.year,2018);assert.equal(post.series,undefined);
});
test('UFDub player and parent project IDs and hosts must match',()=>{
 for(const target of [player.replace('454','999'),player.replace('video.ufdub.com','attacker.example'),player.replace('/V2/','/AT/'),player.replace('https:','http:')])assert.throws(()=>parseUFDubPost(page().replace(player,target),path),/invalid_url/);
});
test('Public player data parser accepts escaped strings but never expressions or executable code',()=>{
 assert.deepEqual(literalArray("[['one', 'it\\'s \\u0410',],]"),[['one',"it's А"]]);
 for(const data of ['[fetch("https://attacker.example")]','[(()=>{throw Error()})()]','[window.value]','["x" + "y"]','['.repeat(10)+']'.repeat(10),'["'+ 'x'.repeat(4097)+'"]'])assert.throws(()=>literalArray(data),/player_format/);
});
test('Guest episodes retain published numbers, season and voice without exposing web/audio/trailers',()=>{
 const post=parseUFDubPost(page(),path),rows=[["Трейлер",'mp4',endpoint(1)],['[02] Silent','mp4|Audio',endpoint(2)],['Other','web','https://attacker.example'],['[01] one','mp4',endpoint(1)],['[03] three','mp4',endpoint(3)],['[10] ten','mp4',endpoint(10)],['[11] bad','mp4',endpoint(11).replace('ID=454','ID=999')]];
 const data=parseUFDubPlayer('<script>a='+JSON.stringify(rows)+'</script>',post);assert.equal(data.series,true);assert.deepEqual(data.items.map(i=>i.episode),[1,3,10]);assert.ok(data.items.every(i=>i.needs_resolve&&!i.url&&i.voice_id==='uk'&&i.quality==='MP4'));
 const seasons=parseUFDubPlayer('<script>a='+JSON.stringify([['[01] one','mp4',endpoint(1,'Сезон 2')],['[02] two','mp4',endpoint(2,'Сезон 2')]])+'</script>',post);assert.ok(seasons.items.every(i=>i.season===2&&i.voice_id==='uk'));
});
test('Redirects decode raw UTF-8 headers and preserve already decoded Unicode filenames',()=>{
 const unicode='https://api.ufdub.com/UFDUB_UPLOAD/VIDEO/454-Українська.mp4';
 assert.equal(mediaRedirect(unicode),new URL(unicode).href);assert.equal(mediaRedirect(Buffer.from(unicode).toString('latin1')),new URL(unicode).href);
 for(const url of [media.replace('https:','http:'),media.replace('api.ufdub.com','api.ufdub.com.attacker.example'),media.replace('/UFDUB_UPLOAD/VIDEO/','/other/'),'https://user@api.ufdub.com/UFDUB_UPLOAD/VIDEO/a.mp4',media+'?url=bad'])assert.throws(()=>mediaRedirect(url),/unsupported_stream/);
});
test('Invalid paths, resolver inputs and metadata fail without any upstream request',async()=>{
 await withFetch(async()=>assert.fail('Unexpected network'),async()=>{
  for(const input of [{action:'post',path:'//attacker.example/454.html'},{action:'stream',post_id:'454',resolve_url:endpoint(1).replace('ufdub.com','attacker.example')},{action:'stream',post_id:'999',resolve_url:endpoint(1)},{action:'stream',post_id:'454',resolve_url:endpoint(1)+'&ID=454'},{action:'search',title:'x'.repeat(201)},{action:'search',title:'Show',movie:{titles:['Show'],series:'false'}}])assert.equal((await handleUFDub(req(input))).status,400);
 });
 for(const value of [endpoint(1).replace('POS=1','POS=0'),endpoint(1)+'#x',endpoint(1)+'&extra=1'])assert.throws(()=>episodeURL(value,'454'),/invalid_url/);
});
test('Opening a large series uses only its catalog, public player and first published redirect',async()=>{
 const calls=[];await withFetch(async url=>{calls.push(String(url));return String(url).endsWith('.html')?new Response(page()):String(url).includes('/V2/')?new Response(playlist(Array.from({length:150},(_,i)=>i+1))):new Response(null,{status:302,headers:{location:media}});},async()=>{
  const r=await worker.fetch(req({action:'post',path,movie:{titles:['Alternate Show'],year:2018,series:true}}),{}),data=await r.json();assert.equal(r.status,200);assert.equal(calls.length,3);assert.equal(data.items.length,150);assert.equal(data.items[0].url,media);assert.equal(data.items[0].quality,'Авто');assert.equal(data.items[1].needs_resolve,true);assert.equal(data.items[1].url,undefined);assert.equal(data.player,undefined);
 });
});
test('Wrong title/year and inferred movie-versus-series mismatch never resolve media',async()=>{
 for(const movie of [{titles:['Other'],year:2018,series:true},{titles:['Show'],year:2020,series:true},{titles:['Show'],year:2018,series:false}]){
  const calls=[];await withFetch(async url=>{calls.push(String(url));return new Response(String(url).endsWith('.html')?page():playlist());},async()=>{
   const r=await handleUFDub(req({action:'post',path,movie}));assert.equal((await r.json()).error,'ufdub_movie_mismatch');assert.ok(!calls.some(u=>u.includes('/video/VIDEOS.php')));assert.equal(calls.length,movie.series===false?2:1);
  });
 }
});
test('One selected episode resolves once and preserves season, episode and voice',async()=>{
 let count=0;await withFetch(async(url,options)=>{count++;assert.equal(options.redirect,'manual');assert.equal(new URL(url).searchParams.get('POS'),'3');return new Response(null,{status:302,headers:{location:media}});},async()=>{
  const r=await handleUFDub(req({action:'stream',post_id:'454',resolve_url:endpoint(3,'Сезон 2'),season:2,episode:3,voice_id:'uk',translation:'Українська · UFDub'})),data=await r.json();assert.equal(r.status,200);assert.equal(count,1);assert.deepEqual([data.items[0].season,data.items[0].episode,data.items[0].voice_id],[2,3,'uk']);assert.equal(data.items[0].url,media);assert.equal(data.items[0].needs_resolve,false);
 });
});
test('A native UFDub movie has a single MP4, without guessed resolution variants',async()=>{
 await withFetch(async url=>new Response(String(url).endsWith('.html')?page('Фільм','Movie'):String(url).includes('/V2/')?'<script>a='+JSON.stringify([['Фільм','mp4',endpoint(1)]])+';</script>':null,String(url).includes('/video/')?{status:302,headers:{location:media}}:undefined),async()=>{
  const r=await handleUFDub(req({action:'post',path:film,movie:{titles:['Movie'],year:2018,series:false}})),data=await r.json();assert.equal(r.status,200);assert.equal(data.series,false);assert.equal(data.items[0].episode,null);assert.equal(data.items[0].quality,'Авто');assert.equal(data.items.length,1);
 });
});
test('Access restrictions and unexpected redirects stop at the published endpoint',async()=>{
 for(const [status,location,expected] of [[403,null,'access_denied'],[429,null,'access_denied'],[302,'https://attacker.example/a.mp4','unsupported_stream'],[200,null,'stream_unavailable']]){
  let count=0;await withFetch(async()=>{count++;return new Response(null,{status,headers:location?{location}:undefined});},async()=>{
   const r=await handleUFDub(req({action:'stream',post_id:'454',resolve_url:endpoint(1)}));assert.equal((await r.json()).error,'ufdub_'+expected);assert.equal(count,1);
  });
 }
});
test('UFDub route supports POST preflight and rejects other methods',async()=>{
 const r=await worker.fetch(new Request('https://xot.test/api/ufdub',{method:'OPTIONS'}),{});assert.equal(r.status,204);assert.ok(r.headers.get('access-control-allow-methods').includes('POST'));assert.equal((await handleUFDub(new Request('https://xot.test/api/ufdub'))).status,405);
});
