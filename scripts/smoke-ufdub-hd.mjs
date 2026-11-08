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
  Lampa.Storage.set('xot_source_preferences',{order:[],disabled:['rezka']});Lampa.Storage.set('xot_native_source','ufdub');Lampa.Storage.set('xot_native_last_sources',{1024:'ufdub',777001:'ufdub'});Lampa.Storage.set('video_quality_default',1080);
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
 const movie=await playing();assert.ok(movie.width>=1280);assert.ok(movie.duration>5000);assert.deepEqual(movie.qualities,['1080p']);
 // Native MP4 byte ranges must also allow seeking beyond the opening frame.
 await page.evaluate(()=>{const v=[...document.querySelectorAll('video')].find(v=>!v.paused);v.currentTime=60;});
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>61&&!v.paused&&!v.seeking),null,{timeout:30000});
 await page.evaluate(()=>Lampa.Player.close());await page.waitForTimeout(400);await page.evaluate(()=>Lampa.Activity.backward());
 console.log(JSON.stringify({origin,movie,seek60:true,metadataVerified:true,exceptions},null,2));assert.deepEqual(exceptions,[]);
}finally{releaseEpisode();await browser.close();}
