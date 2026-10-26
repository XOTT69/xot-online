// Live end-to-end check: actual Lampa, source menu, CDN playback and lazy episodes.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),exceptions=[],forbidden=[],streamRequests=[];
 page.on('pageerror',e=>exceptions.push(e.message));
 page.on('request',r=>{
  if(r.resourceType()==='script'&&/online_mod|\/lumio\.js/.test(r.url()))forbidden.push(r.url());
  if(r.url()===origin+'/api/eneyida'&&r.method()==='POST'){const input=r.postDataJSON();if(input.action==='stream')streamRequests.push(input);}
 });
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery,{timeout:30000});
 await page.waitForTimeout(2500);
 const ukrainian=page.getByText('Українська',{exact:true});if(await ukrainian.count())await ukrainian.first().click();
 await page.waitForFunction(()=>Lampa.Activity.active(),{timeout:20000});
 await page.evaluate(()=>{
  Lampa.Storage.set('xot_native_source','filmix');Lampa.Storage.set('xot_native_last_sources',{});
  $('body').append('<div class="full-start__buttons xot-test-fixture"></div>');
  const original=Lampa.Player.play;window.xotPlayed=[];
  Lampa.Player.play=function(data){window.xotPlayed.push(data);return original.apply(this,arguments);};
 });
 await page.addScriptTag({url:origin+'/m.js'});
 await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__,{timeout:15000});
 async function openCard(card){
  await page.evaluate(card=>Lampa.Listener.send('full',{type:'complite',data:{movie:card},object:{activity:{render:()=>$('body')}}}),card);
  await page.waitForTimeout(400);
  await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));
  await page.waitForFunction(()=>Lampa.Activity.active()?.component==='xot_online');
 }
 await openCard({id:460458,title:'Оселя зла: Вітаємо у Раккун-Сіті',original_title:'Resident Evil: Welcome to Raccoon City',release_date:'2021-11-24',imdb_id:'tt6920084',source:'tmdb',vote_average:5.9});
 await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));
 await page.waitForFunction(()=>$('.selectbox').text().includes('Eneyida'));
 await page.evaluate(()=>$('.selectbox .selector').filter(function(){return $(this).text().trim()==='Eneyida';}).first().trigger('hover:enter'));
 await page.waitForFunction(()=>Lampa.Storage.get('xot_native_source')==='eneyida'&&$('.xot-native-row.selector').text().includes('LeDoyen')&&$('.xot-native-row__note').text().includes('1080p'),{timeout:30000});
 const movieRows=await page.evaluate(()=>$('.xot-native-row').map(function(){return {title:$(this).find('.xot-native-row__title').text(),note:$(this).find('.xot-native-row__note').text()};}).get());
 assert.equal(movieRows.length,1);
 if(process.env.XOT_SCREENSHOT){await page.waitForTimeout(1500);await page.screenshot({path:process.env.XOT_SCREENSHOT});}
 const playback=[];
 for(const quality of [720,1080]){
  await page.evaluate(quality=>{Lampa.Storage.set('video_quality_default',quality);$('.xot-native-row.selector').first().trigger('hover:enter');},quality);
  await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>1&&!v.paused&&!v.error),{timeout:30000});
  const state=await page.evaluate(()=>{
   const video=[...document.querySelectorAll('video')].find(v=>v.currentTime>1&&!v.paused&&!v.error),play=window.xotPlayed.at(-1);
   return {width:video.videoWidth,height:video.videoHeight,duration:video.duration,time:video.currentTime,selectedURL:play.url,qualities:Object.keys(play.quality),error:video.error?.code||null};
  });
  assert.deepEqual(state.qualities.sort(),['1080p','480p','720p']);assert.equal(state.width,quality===720?1280:1920);assert.ok(state.duration>6000);assert.equal(state.error,null);
  playback.push({requestedQuality:quality,...state});
  await page.evaluate(()=>Lampa.Player.close());
  await page.waitForTimeout(500);
 }
 assert.equal(streamRequests.length,0,'Movie qualities should be resolved before playback');
 await page.evaluate(()=>Lampa.Activity.backward());
 await openCard({id:153312,name:'Король Талси',original_name:'Tulsa King',first_air_date:'2022-11-13',source:'tmdb',vote_average:8});
 await page.waitForFunction(()=>Lampa.Storage.get('xot_native_source')==='eneyida'&&$('.xot-native-row.selector').text().includes('Серія 1'),{timeout:30000});
 assert.equal(streamRequests.length,0,'Opening a series must not resolve every episode');
 const seasonOne=await page.evaluate(()=>$('.xot-native-row.selector').length);
 // Exercise season switching through the real filter menu.
 await page.evaluate(()=>$('.filter--filter').trigger('hover:enter'));
 await page.waitForFunction(()=>$('.selectbox').text().includes('Сезон 1'));
 await page.evaluate(()=>$('.selectbox .selector').filter(function(){return $(this).text().trim()==='Сезон 1';}).first().trigger('hover:enter'));
 await page.waitForFunction(()=>$('.selectbox').text().includes('Сезон 2'));
 await page.evaluate(()=>$('.selectbox .selector').filter(function(){return $(this).text().trim()==='Сезон 2';}).first().trigger('hover:enter'));
 await page.waitForFunction(()=>!$('body').hasClass('selectbox--open')&&$('.xot-native-row.selector').length>0);
 await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>1&&!v.paused&&!v.error),{timeout:30000});
 const episode=await page.evaluate(()=>{const play=window.xotPlayed.at(-1);return {season:play.season,episode:play.episode,qualities:Object.keys(play.quality),title:play.title};});
 assert.equal(streamRequests.length,1);assert.equal(streamRequests[0].season,2);assert.equal(episode.season,2);assert.equal(episode.episode,1);assert.ok(episode.qualities.includes('720p'));
 assert.deepEqual(exceptions,[]);assert.equal(forbidden.length,0);
 console.log(JSON.stringify({origin,source:'eneyida',movieRows,playback,series:{seasonOneRows:seasonOne,resolvedEpisodes:streamRequests.length,played:episode},thirdPartyScripts:forbidden.length,exceptions},null,2));
}catch(error){
 console.error(error);
 for(const page of browser.contexts().flatMap(context=>context.pages())){
  console.error(await page.evaluate(()=>({rows:window.jQuery?$('.xot-native-row').text():null,select:window.jQuery?$('.selectbox').text():null,filters:window.jQuery?$('.filter').text():null})).catch(()=>({})));
 }
 throw error;
}finally{await browser.close();}
