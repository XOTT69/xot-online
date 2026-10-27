// Live UFDub checks use the public guest playlist and Lampa's native player.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveLocalAssets} from './smoke-assets.mjs';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
let releaseEpisode;const episodeGate=new Promise(resolve=>{releaseEpisode=resolve;});let holdEpisode=false,episodeWaiting=false;
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),exceptions=[],forbidden=[],resolvers=[],plays=[],mediaErrors=[];
 await serveLocalAssets(page,origin);
 page.on('pageerror',error=>exceptions.push(error.message));
 page.on('requestfailed',r=>{if(/ufdub\.com/.test(r.url()))mediaErrors.push({url:r.url().split('?')[0],failure:r.failure()?.errorText});});
 page.on('request',r=>{
  if(r.resourceType()==='script'&&/online_mod|\/lumio\.js|(?:video|api)\.ufdub\.com/.test(r.url()))forbidden.push(r.url());
  if(r.url()===origin+'/api/ufdub'&&r.method()==='POST'){const body=r.postDataJSON();if(body.action==='stream')resolvers.push(body);}
 });
 await page.route(origin+'/api/ufdub',async route=>{
  const body=route.request().postDataJSON();
  if(body.action==='stream'&&holdEpisode){episodeWaiting=true;await episodeGate;try{await route.fulfill({json:{items:[]}});}catch{}return;}
  await route.continue();
 });
 await page.exposeFunction('xotLogPlay',data=>plays.push(data));
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery,null,{timeout:30000});await page.waitForTimeout(2500);
 const uk=page.getByText('Українська',{exact:true});if(await uk.count())await uk.first().click();
 await page.waitForFunction(()=>Lampa.Activity.active(),null,{timeout:20000});
 await page.evaluate(()=>{
  Lampa.Storage.set('xot_native_source','ufdub');Lampa.Storage.set('xot_native_last_sources',{});Lampa.Storage.set('video_quality_default',1080);
  $('body').append('<div class="full-start__buttons xot-test-fixture"></div>');
  const original=Lampa.Player.play;window.xotPlayed=[];Lampa.Player.play=function(data){window.xotPlayed.push({title:data.title,season:data.season,episode:data.episode,qualities:Object.keys(data.quality||{})});window.xotLogPlay(window.xotPlayed.at(-1));return original.apply(this,arguments);};
 });
 await page.addScriptTag({url:origin+'/m.js'});await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__);
 async function open(card){
  await page.evaluate(card=>Lampa.Listener.send('full',{type:'complite',data:{movie:card},object:{activity:{render:()=>$('body')}}}),card);await page.waitForTimeout(450);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));
  await page.waitForFunction(()=>Lampa.Activity.active()?.component==='xot_online');
  await page.waitForFunction(()=>$('.xot-native-row.selector').length>0,null,{timeout:40000});
  assert.equal(await page.evaluate(()=>$('.xot-native-row').text().includes('джерело недоступне')),false);
 }
 async function playing(){
  await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>1&&!v.paused&&!v.error),null,{timeout:45000});
  return page.evaluate(()=>{const v=[...document.querySelectorAll('video')].find(v=>v.currentTime>1&&!v.paused&&!v.error),data=Lampa.Player.playdata();return {width:v.videoWidth,height:v.videoHeight,duration:v.duration,time:v.currentTime,episode:data.episode,season:data.season,qualities:window.xotPlayed.at(-1).qualities,crossOrigin:v.getAttribute('crossorigin')};});
 }
 await open({id:1024,title:'Небесні створіння',original_title:'Heavenly Creatures',release_date:'1994-09-02',source:'tmdb'});
 assert.equal(await page.locator('.xot-native-row.selector').count(),1);await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));
 const movie=await playing();assert.ok(movie.width>=1280);assert.ok(movie.duration>5000);assert.deepEqual(movie.qualities,['Авто']);
 // Native MP4 byte ranges must also allow seeking beyond the opening frame.
 await page.evaluate(()=>{const v=[...document.querySelectorAll('video')].find(v=>!v.paused);v.currentTime=60;});
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>61&&!v.paused&&!v.seeking),null,{timeout:30000});
 await page.evaluate(()=>Lampa.Player.close());await page.waitForTimeout(400);await page.evaluate(()=>Lampa.Activity.backward());
 await open({id:777001,name:'РОКУХОДО: Чотири відтінки затишку',original_name:'Rokuhou-dou Yotsuiro Biyori',first_air_date:'2018-04-11',source:'tmdb'});
 const count=await page.locator('.xot-native-row.selector').count();assert.ok(count>=2);assert.equal(resolvers.length,0,'Opening a series resolves only the first redirect within post');
 assert.equal(await page.locator('.xot--voice.selector:visible').count(),1);
 if(process.env.XOT_SCREENSHOT)await page.screenshot({path:process.env.XOT_SCREENSHOT});
 await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));
 const first=await playing();assert.equal(first.episode,1);assert.ok(first.duration>1000);
 await page.evaluate(()=>{Lampa.PlayerPlaylist.next();});
 await page.waitForFunction(()=>Lampa.Player.playdata()?.episode===2,null,{timeout:30000});
 const next=await playing();assert.equal(resolvers.length,1);assert.equal(resolvers[0].episode,2);assert.equal(next.episode,2);assert.equal(next.season,1);
 // Closing while a later episode is resolving must prevent delayed playback.
 holdEpisode=true;await page.evaluate(()=>{Lampa.PlayerPlaylist.next();});await page.waitForFunction(()=>Lampa.Player.playdata()?.episode===2);
 const deadline=Date.now()+5000;while(!episodeWaiting&&Date.now()<deadline)await page.waitForTimeout(100);
 assert.equal(episodeWaiting,true);await page.evaluate(()=>Lampa.Player.close());const before=plays.length;releaseEpisode();await page.waitForTimeout(1000);assert.equal(plays.length,before);assert.equal(await page.evaluate(()=>Lampa.Player.opened()),false);
 await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));
 await page.waitForFunction(()=>$('.selectbox').text().includes('Усі джерела'));
 await page.evaluate(()=>$('.selectbox .selector').filter(function(){return $(this).text().trim()==='Усі джерела';}).first().trigger('hover:enter'));
 await page.waitForFunction(()=>$('.xot-native-row.selector').filter(function(){return $(this).text().includes('UFDub');}).length===5,null,{timeout:35000});
 assert.equal(await page.evaluate(()=>$('.xot-native-row.selector').filter(function(){return $(this).text().includes('UFDub')&&$(this).text().includes('Серія 3');}).length),1,'Aggregate search retains unresolved published episodes');
 assert.deepEqual(exceptions,[]);assert.deepEqual(forbidden,[]);
 console.log(JSON.stringify({origin,movie,seekSeconds:60,series:{guestEpisodes:count,first,next,lazyRequests:resolvers.length,latePlaybackSuppressed:true},aggregateUFDubEpisodes:5,thirdPartyPlayerScripts:forbidden.length,exceptions},null,2));
}catch(error){
 console.error(error);
 for(const page of browser.contexts().flatMap(c=>c.pages()))console.error(await page.evaluate(()=>({text:document.body.innerText.slice(-2000),rows:window.jQuery?$('.xot-native-row').text():null,videos:[...document.querySelectorAll('video')].map(v=>({width:v.videoWidth,time:v.currentTime,error:v.error?.message,paused:v.paused})),player:window.Lampa?.Player?.opened()})).catch(()=>({})));
 throw error;
}finally{releaseEpisode();await browser.close();}
