// Real Lampa/CDN playback; inject a player failure, then exercise a distinct CDN.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveLocalAssets} from './smoke-assets.mjs';
const aggregate=process.env.XOT_BACKUP_AGGREGATE==='1';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
let releaseStreams;const streamGate=new Promise(resolve=>{releaseStreams=resolve;});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),exceptions=[],removedRequests=[];let wrongPosts=0,backupSearches=0;
 await serveLocalAssets(page,origin);
 page.on('pageerror',error=>exceptions.push(error.message));
 await page.route(origin+'/api/anilibria',route=>{if(route.request().postDataJSON().action==='post')wrongPosts++;return route.fulfill({json:{results:[{id:999,title:'Another series',year:2022,series:true}]}});});
 page.on('request',r=>{if(r.url()===origin+'/api/filmix'&&r.postDataJSON()?.action==='search')backupSearches++;if(/ashdi\.vip|\/api\/uakino(?:[/?]|$)/i.test(r.url()))removedRequests.push(r.url());});
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery,{timeout:30000});await page.waitForTimeout(2500);
 const uk=page.getByText('Українська',{exact:true});if(await uk.count())await uk.first().click();
 await page.waitForFunction(()=>Lampa.Activity.active());
 await page.evaluate(aggregate=>{
  Lampa.Storage.set('xot_native_source',aggregate?'all':'eneyida');Lampa.Storage.set('xot_prefer_ukrainian','false');Lampa.Storage.set('xot_native_last_sources',{153312:aggregate?'all':'eneyida'});Lampa.Storage.set('video_quality_default',720);Lampa.Storage.set('player_timecode','again');
  $('body').append('<div class="full-start__buttons xot-test-fixture"></div>');
 },aggregate);
 await page.addScriptTag({url:origin+'/m.js'});await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__);
 await page.evaluate(()=>Lampa.Listener.send('full',{type:'complite',data:{movie:{id:153312,name:'Король Талси',original_name:'Tulsa King',first_air_date:'2022-11-13',source:'tmdb'}},object:{activity:{render:()=>$('body')}}}));
 await page.waitForTimeout(450);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));
 await page.waitForFunction(aggregate=>$('.xot-native-row.selector:not(.xot-source-status)').filter(function(){return $(this).text().includes('Серія 1')&&(!aggregate||$(this).text().includes('Eneyida'));}).length>0,aggregate,{timeout:30000});
 async function choose(text){
  await page.waitForFunction(text=>$('.selectbox .selector').filter(function(){return $(this).text().trim()===text;}).length>0,text);
  await page.evaluate(text=>$('.selectbox .selector').filter(function(){return $(this).text().trim()===text;}).first().trigger('hover:enter'),text);
 }
 await page.evaluate(()=>$('.filter--filter').trigger('hover:enter'));await choose('Сезон 1');await choose('Сезон 2');
 await page.evaluate(aggregate=>$('.xot-native-row.selector:not(.xot-source-status)').filter(function(){return !aggregate||$(this).text().includes('Eneyida');}).first().trigger('hover:enter'),aggregate);
 await page.waitForFunction(()=>document.querySelector('video')?.currentTime>1&&!document.querySelector('video')?.paused,{timeout:30000});
 await page.evaluate(()=>Lampa.PlayerVideo.to(65));
 await page.waitForFunction(()=>document.querySelector('video')?.currentTime>=65,{timeout:15000});
 const beforeSearch=backupSearches,maxSearches=await page.evaluate(()=>{const c=Lampa.Player.playdata().card;return Math.min(4,new Set([c.title,c.name,c.original_title,c.original_name,...(c.xot_search_titles||[])].filter(Boolean).map(x=>x.toLowerCase())).size);});
 await page.evaluate(()=>{Lampa.PlayerVideo.listener.send('error',{fatal:true});Lampa.PlayerVideo.listener.send('error',{fatal:true});});
 await page.waitForFunction(()=>$('.selectbox').text().includes('Резервне джерело'),{timeout:30000});
 const choices=await page.evaluate(()=>$('.selectbox .selector').map(function(){return $(this).text().trim();}).get());
 assert.ok(choices.some(v=>v.includes('Filmix')));assert.ok(!choices.some(v=>/KinoVezha|UASerials|Another/.test(v)),'Shared failed CDN and unrelated films cannot be backups');
 assert.equal(wrongPosts,0);assert.ok(backupSearches-beforeSearch<=maxSearches,'Repeated fatal events must not duplicate backup searches');
 await page.evaluate(()=>$('.selectbox .selector').filter(function(){return $(this).text().includes('Filmix')&&$(this).text().includes('Dnipro');}).first().trigger('hover:enter'));
 await page.waitForFunction(()=>Lampa.Player.playdata()?.xot_source==='filmix'&&document.querySelector('video')?.currentTime>=64&&document.querySelector('video')?.videoWidth>0&&!document.querySelector('video')?.paused,{timeout:30000});
 const switched=await page.evaluate(()=>{const p=Lampa.Player.playdata(),v=document.querySelector('video');return {source:p.xot_source,season:p.season,episode:p.episode,position:v.currentTime,width:v.videoWidth,queue:Lampa.PlayerPlaylist.get().map(x=>({season:x.season,episode:x.episode,lazy:typeof x.url==='function'}))};});
 assert.ok(switched.width>0);assert.equal(switched.season,2);assert.equal(switched.episode,1);assert.ok(switched.queue.some(x=>x.season===2&&x.episode===2&&x.lazy));
 await page.evaluate(()=>Lampa.PlayerPlaylist.next());
 await page.waitForFunction(()=>Lampa.Player.playdata()?.xot_source==='filmix'&&Lampa.Player.playdata()?.episode===2&&document.querySelector('video')?.currentTime>1&&!document.querySelector('video')?.paused,{timeout:30000});
 // Closing a player during backup lookup must suppress late dialogs/playback.
 await page.route(origin+'/api/eneyida',async route=>{await new Promise(resolve=>setTimeout(resolve,1500));await route.continue().catch(()=>{});});
 await page.evaluate(()=>{const data=Lampa.Player.playdata();data.error(data);Lampa.Player.close();});await page.waitForTimeout(3000);
 assert.equal(await page.evaluate(()=>Lampa.Player.opened()),false);assert.equal(await page.evaluate(()=>$('body').hasClass('selectbox--open')),false);
 await page.unroute(origin+'/api/eneyida');
 await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));await choose('Eneyida');
 await page.waitForFunction(()=>$('.xot-native-row.selector').text().includes('Серія 1'),{timeout:30000});
 await page.route(url=>/(?:^|\.)hdvbua\.pro$/.test(url.hostname),async route=>{await streamGate;await route.abort().catch(()=>{});});
 await page.evaluate(()=>{window.xotStartupFatalErrors=0;Lampa.PlayerVideo.listener.follow('error',event=>{if(event.fatal)window.xotStartupFatalErrors++;});});
 const stalledAt=Date.now();await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));
 await page.waitForFunction(()=>$('.selectbox').text().includes('Резервне джерело'),{timeout:45000});
 const startupDelay=Date.now()-stalledAt,startupFatalErrors=await page.evaluate(()=>window.xotStartupFatalErrors);
 // HLS can emit a fatal network error before the startup watchdog expires.
 if(!startupFatalErrors)assert.ok(startupDelay>=14000,'Without a fatal event, the startup watchdog waits before offering a backup');
 assert.equal(await page.evaluate(()=>document.querySelector('video')?.videoWidth||0),0,'The stalled video never became playable');
 await page.evaluate(()=>Lampa.Player.close());releaseStreams();assert.equal(await page.evaluate(()=>$('body').hasClass('selectbox--open')),false,'Closing the player also closes its backup dialog');
 assert.deepEqual(exceptions,[]);
 assert.deepEqual(removedRequests,[]);
 console.log(JSON.stringify({origin,aggregate,choices,switched,nextEpisodePlayed:true,unrelatedPosts:wrongPosts,removedSourceRequests:removedRequests.length,lateBackupCancelled:true,startup:{trigger:startupFatalErrors?'fatal':'watchdog',elapsedMs:startupDelay},exceptions},null,2));
}catch(error){for(const page of browser.contexts().flatMap(c=>c.pages()))console.error(await page.evaluate(()=>({rows:window.jQuery?$('.xot-native-row').text():null,select:window.jQuery?$('.selectbox').text():null,source:window.Lampa?.Player.playdata?.()?.xot_source,video:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,width:v.videoWidth,paused:v.paused,error:v.error?.code}))})).catch(()=>({})));throw error;}
finally{releaseStreams();await browser.close();}
