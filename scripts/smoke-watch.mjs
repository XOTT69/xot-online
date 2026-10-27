import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveLocalAssets} from './smoke-assets.mjs';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
let releaseStream,releaseLoad;const streamGate=new Promise(r=>{releaseStream=r;}),loadGate=new Promise(r=>{releaseLoad=r;});
try{
 const page=await browser.newPage({viewport:{width:1550,height:950}}),errors=[],forbidden=[];let streamWaiting=false,plays=0;
 await serveLocalAssets(page,origin);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/anilibria|ashdi\.vip|\/lumio\.js|online_mod/.test(r.url()))forbidden.push(r.url());});
 await page.exposeFunction('xotWatchPlay',()=>{plays++;});
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:30000});await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery);await page.waitForTimeout(2500);
 const uk=page.getByText('Українська',{exact:true});if(await uk.count())await uk.first().click();await page.waitForFunction(()=>Lampa.Activity.active());
 await page.evaluate(()=>{
  Lampa.Storage.set('xot_native_last_sources',{460458:'eneyida',153312:'eneyida'});Lampa.Storage.set('xot_native_voices',{});Lampa.Storage.set('xot_favorite_voices',[]);Lampa.Storage.set('video_quality_default',720);Lampa.Storage.set('player_timecode','again');
  $('body').append('<div class="full-start__buttons xot-test-fixture"></div>');
  const play=Lampa.Player.play;Lampa.Player.play=function(data){window.xotWatchPlay();return play.apply(this,arguments);};
 });
 await page.addScriptTag({url:origin+'/m.js'});await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__);
 const movie={id:460458,title:'Оселя зла: Вітаємо у Раккун-Сіті',original_title:'Resident Evil: Welcome to Raccoon City',release_date:'2021-11-24',source:'tmdb'};
 const series={id:153312,name:'Король Талси',original_name:'Tulsa King',first_air_date:'2022-11-13',source:'tmdb'};
 async function open(card){await page.evaluate(card=>Lampa.Listener.send('full',{type:'complite',data:{movie:card},object:{activity:{render:()=>$('body')}}}),card);await page.waitForTimeout(450);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));await page.waitForFunction(()=>$('.xot-native-row.selector').length>0,null,{timeout:35000});}
 async function seed(card,season,episode,time,duration,percent,age=0){await page.evaluate(({card,season,episode,time,duration,percent,age})=>{
  const tv=Boolean(card.name||card.first_air_date),hash=Lampa.Utils.hash(['xot',tv?'tv':'movie',card.id,season||0,episode||0].join(':'));
  Lampa.Timeline.update(Object.assign({},Lampa.Timeline.link?Lampa.Timeline.link(card,season,episode):{},{hash,time,duration,percent,updated:Date.now()-age,received:true}));
 },{card,season,episode,time,duration,percent,age});}
 async function playing(position){await page.waitForFunction(position=>[...document.querySelectorAll('video')].some(v=>v.currentTime>=position&&!v.paused&&!v.error),position,{timeout:35000});return page.evaluate(()=>{const v=[...document.querySelectorAll('video')].find(v=>!v.paused&&v.videoWidth>0),p=Lampa.Player.playdata();return {season:p.season,episode:p.episode,time:v.currentTime,width:v.videoWidth,title:p.title,forced:p.xot_continue,applied:p.xot_resume_applied,setting:Lampa.Storage.get('player_timecode')};});}
 async function choose(text){await page.waitForFunction(text=>$('.selectbox .selector').filter(function(){return $(this).text().includes(text);}).length>0,text);await page.evaluate(text=>$('.selectbox .selector').filter(function(){return $(this).text().includes(text);}).first().trigger('hover:enter'),text);}
 await open(movie);await seed(movie,0,0,2760,6447,43);
 await page.waitForFunction(()=>$('.xot-watch-status').text().includes('43%')&&$('.xot-continue-row.selector').length===1);
 await page.evaluate(()=>$('.xot-continue-row.selector').trigger('hover:enter'));const resumedMovie=await playing(2759);assert.equal(resumedMovie.forced,true);assert.equal(resumedMovie.applied,true);assert.equal(resumedMovie.setting,'again');assert.equal(await page.evaluate(()=>$('body').hasClass('selectbox--open')),false);
 await page.evaluate(()=>Lampa.Player.close());await page.waitForFunction(()=>$('.xot-watch-status').text().includes('43%'));
 // Cancelling a load before canplay must not overwrite the saved mark with zero.
 const beforeCancel=await page.evaluate(()=>Lampa.Timeline.view(Lampa.Utils.hash('xot:movie:460458:0:0')));
 const blockMedia=url=>/(?:^|\.)(?:hdvbua\.pro|tortuga\.tw)$/.test(url.hostname);
 await page.route(blockMedia,async route=>{await loadGate;await route.abort().catch(()=>{});});
 await page.evaluate(()=>$('.xot-continue-row.selector').trigger('hover:enter'));await page.waitForFunction(()=>Lampa.Player.opened());await page.evaluate(()=>Lampa.Player.close());releaseLoad();await page.unroute(blockMedia);
 const afterCancel=await page.evaluate(()=>Lampa.Timeline.view(Lampa.Utils.hash('xot:movie:460458:0:0')));assert.equal(afterCancel.time,beforeCancel.time);assert.equal(afterCancel.percent,beforeCancel.percent);
 await page.evaluate(()=>Lampa.Activity.backward());await open(series);
 await page.evaluate(()=>$('.xot--voice').trigger('hover:enter'));await choose('HDrezka Studio');
 await seed(series,1,1,3000,3000,100,30000);await seed(series,1,2,600,3000,20,20000);await seed(series,2,2,720,3000,24,10000);await seed(series,2,3,3000,3000,100,1000);
 await page.waitForFunction(()=>$('.xot-continue-row.selector[data-season="2"][data-episode="2"]').length===1&&$('.xot-watched').text().includes('Переглянуто'));
 assert.ok((await page.locator('.xot-watch-progress').count())>0);await page.evaluate(()=>Lampa.Storage.set('player_timecode','ask'));
 if(process.env.XOT_SCREENSHOT)await page.screenshot({path:process.env.XOT_SCREENSHOT});
 await page.evaluate(()=>$('.xot-continue-row.selector').trigger('hover:enter'));const resumedSeries=await playing(719);assert.equal(resumedSeries.season,2);assert.equal(resumedSeries.episode,2);assert.ok(resumedSeries.title.includes('HDrezka Studio'));assert.equal(resumedSeries.setting,'ask');assert.equal(await page.evaluate(()=>$('body').hasClass('selectbox--open')),false);
 await page.evaluate(()=>Lampa.Player.close());await seed(series,2,2,3000,3000,100);
 await page.waitForFunction(()=>$('.xot-continue-row.selector[data-season="1"][data-episode="2"]').length===1);
 await seed(series,1,2,3000,3000,100);await page.waitForFunction(()=>$('.xot-continue-row').length===0);
 await page.route(origin+'/api/eneyida',async route=>{const input=route.request().postDataJSON();if(input.action==='stream'&&input.season===2&&input.episode===3){streamWaiting=true;await streamGate;await route.fulfill({json:{items:[]}}).catch(()=>{});return;}await route.continue();});
 await seed(series,2,3,700,3000,23);await page.waitForFunction(()=>$('.xot-continue-row.selector[data-episode="3"]').length===1);await page.evaluate(()=>$('.xot-continue-row.selector').trigger('hover:enter'));
 const until=Date.now()+6000;while(!streamWaiting&&Date.now()<until)await page.waitForTimeout(100);assert.equal(streamWaiting,true);const beforeLate=plays;await page.evaluate(()=>Lampa.Activity.backward());releaseStream();await page.waitForTimeout(800);assert.equal(plays,beforeLate);assert.equal(await page.evaluate(()=>Lampa.Player.opened()),false);
 const history=await page.evaluate(()=>Lampa.Storage.get('xot_watch_history_'+Lampa.Timeline.filename(),[]));assert.ok(history.some(r=>r.card==='tmdb:movie:460458'));assert.ok(history.some(r=>r.card==='tmdb:tv:153312'&&r.season===2&&r.episode===2));assert.ok(!history.some(r=>r.card==='tmdb:tv:153312'&&r.episode===3));assert.ok(!/https:|\.m3u8|device_token/.test(JSON.stringify(history)));
 assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);console.log(JSON.stringify({origin,resumedMovie,resumedSeries,completedEpisodesSkipped:true,crossSeasonResume:true,cancelledLoadPreservesProgress:true,lateResumeSuppressed:true,metadataOnlyHistory:true,noAnimeRequests:true,errors},null,2));
}catch(error){console.error(error);for(const page of browser.contexts().flatMap(c=>c.pages()))console.error(await page.evaluate(()=>({rows:window.jQuery?$('.xot-native-row').text():null,continuation:window.jQuery?$('.xot-continue-row').text():null,select:window.jQuery?$('.selectbox').text():null,videos:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,error:v.error?.message}))})).catch(()=>({})));throw error;}finally{releaseLoad();releaseStream();await browser.close();}
