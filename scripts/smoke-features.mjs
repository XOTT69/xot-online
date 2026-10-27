import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveLocalAssets} from './smoke-assets.mjs';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
let releaseRezka,releaseEpisode;
const rezkaGate=new Promise(resolve=>{releaseRezka=resolve;}),episodeGate=new Promise(resolve=>{releaseEpisode=resolve;});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),exceptions=[],streams=[],removedRequests=[];let unrelatedPosts=0,episodeWaiting=false,aggregateMode=false,emptyMode=false,rezkaPending=0;
 await serveLocalAssets(page,origin);
 await page.route(origin+'/api/providers',route=>route.fulfill({json:{providers:[{id:'catalog',name:'XOT Catalog',enabled:true}]}}));
 await page.route(origin+'/api/search*',route=>route.fulfill({json:{results:[{title:'Unrelated movie',year:2021,provider:'catalog',url:'https://cdn.example/unrelated.m3u8',quality:'1080p',score:100}],provider_status:[]}}));
 page.on('pageerror',error=>exceptions.push(error.message));
 page.on('request',request=>{if(/ashdi\.vip|\/api\/uakino(?:[/?]|$)/i.test(request.url()))removedRequests.push(request.url());});
 await page.route(origin+'/api/rezka',async route=>{rezkaPending++;await rezkaGate;try{await route.fulfill({status:502,json:{error:'rezka_access_denied'}});}catch{}finally{rezkaPending--;}});
 const unavailableFixture={translation:'XOT unavailable fixture',voice_id:'locked',quality_cap:480,available_qualities:['1080p'],season:99,episode:1,reason:'quality_limit'};
 await page.route(origin+'/api/filmix',async route=>{
  const input=route.request().postDataJSON();
  if(emptyMode){return route.fulfill({json:input.action==='search'?{results:[{id:162271,title:'Tulsa King',year:2022,series:true}]}:{title:'Tulsa King',items:[],unavailable:[unavailableFixture]}});}
  if(aggregateMode&&input.action==='post'){const response=await route.fetch(),data=await response.json();data.unavailable=(data.unavailable||[]).concat(unavailableFixture);return route.fulfill({response,json:data});}
  await route.continue();
 });
 for(const id of ['kinovezha','uaserials'])await page.route(origin+'/api/'+id,route=>emptyMode?route.fulfill({json:{results:[]}}):route.continue());
 await page.route(origin+'/api/anilibria',async route=>{const body=route.request().postDataJSON();if(body.action==='post')unrelatedPosts++;await route.fulfill({json:{results:[{id:999,title:'Unrelated movie',year:2021,series:false}]}});});
 await page.route(origin+'/api/eneyida',async route=>{
  const body=route.request().postDataJSON();
  if(emptyMode)return route.fulfill({json:{results:[]}});
  if(body.action==='stream'){
   streams.push(body);
   if(body.season===2&&body.episode===3){episodeWaiting=true;await episodeGate;try{await route.fulfill({json:{items:[]}});}catch{}return;}
  }
  await route.continue();
 });
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery,{timeout:30000});await page.waitForTimeout(2500);
 const ukrainian=page.getByText('Українська',{exact:true});if(await ukrainian.count())await ukrainian.first().click();
 await page.waitForFunction(()=>Lampa.Activity.active());
 await page.evaluate(()=>{
  Lampa.Storage.set('xot_native_source','uakino');Lampa.Storage.set('xot_native_last_sources',{460458:'uakino'});Lampa.Storage.set('xot_native_voices',{});Lampa.Storage.set('xot_prefer_ukrainian',true);Lampa.Storage.set('video_quality_default',1080);
  $('body').append('<div class="full-start__buttons xot-test-fixture"></div>');
  const original=Lampa.Player.play;window.xotPlays=[];Lampa.Player.play=function(data){window.xotPlays.push({url:data.url,qualities:Object.keys(data.quality||{}),title:data.title});return original.apply(this,arguments);};
 });
 await page.addScriptTag({url:origin+'/m.js'});await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__);
 const movie={id:460458,title:'Оселя зла: Вітаємо у Раккун-Сіті',original_title:'Resident Evil: Welcome to Raccoon City',release_date:'2021-11-24',source:'tmdb',imdb_id:'tt6920084'};
 async function open(card){await page.evaluate(card=>Lampa.Listener.send('full',{type:'complite',data:{movie:card},object:{activity:{render:()=>$('body')}}}),card);await page.waitForTimeout(450);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));}
 async function choose(contains,exact=false){
  await page.waitForFunction(({contains,exact})=>$('.selectbox .selector').filter(function(){return exact?$(this).text().trim()===contains:$(this).text().includes(contains);}).length>0,{contains,exact});
  await page.evaluate(({contains,exact})=>$('.selectbox .selector').filter(function(){return exact?$(this).text().trim()===contains:$(this).text().includes(contains);}).first().trigger('hover:enter'),{contains,exact});
 }
 async function playing(){await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(video=>video.currentTime>1&&!video.paused&&!video.error),{timeout:30000});}
 await open(movie);
 await page.waitForFunction(()=>$('.xot-native-row').length===1&&$('.xot-native-row').text().includes('Український'),{timeout:30000});
 await page.evaluate(()=>$('.xot--voice').trigger('hover:enter'));await choose('Русский');
 await page.waitForFunction(()=>$('.xot-native-row').length===1&&$('.xot-native-row').text().includes('Русский'));
 await page.evaluate(()=>Lampa.Activity.backward());await page.waitForTimeout(600);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));
 await page.waitForFunction(()=>$('.xot-native-row').length===1&&$('.xot-native-row').text().includes('Русский'),{timeout:30000});
 await page.evaluate(()=>$('.xot--voice').trigger('hover:enter'));await choose('Автовибір української',true);
 await page.waitForFunction(()=>$('.xot-native-row').length===1&&$('.xot-native-row').text().includes('Український'));
 await page.evaluate(()=>$('.filter--filter').trigger('hover:enter'));await choose('Бажана якість');await choose('2160p',true);
 await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));await playing();
 const fallback=await page.evaluate(()=>({preferred:Lampa.Storage.get('video_quality_default'),qualities:window.xotPlays.at(-1).qualities}));assert.equal(fallback.preferred,2160);assert.deepEqual(fallback.qualities,['480p']);
 await page.evaluate(()=>Lampa.Player.close());
 aggregateMode=true;await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));await choose('Усі джерела',true);
 await page.waitForFunction(()=>$('.xot-native-row.selector').length>=2,{timeout:20000});
 assert.ok(rezkaPending>0,'Other sources are visible while Rezka is still pending');
 const partial=await page.evaluate(()=>$('.xot-native-row.selector:not(.xot-source-status)').map(function(){return $(this).find('.xot-native-row__title').text();}).get());
 assert.equal(await page.locator('.xot-source-status').count(),0);assert.equal(await page.evaluate(()=>$('.xot-native-row').text().includes('HDRezka')),false);
 const rezkaResponse=page.waitForResponse(response=>response.url()===origin+'/api/rezka');releaseRezka();await rezkaResponse;
 await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>$('.xot-native-row').text().includes('обмеження')),false);
 assert.equal(await page.evaluate(()=>$('.xot-native-row').text().includes('XOT unavailable fixture')),false);
 await page.evaluate(()=>$('.xot--voice').trigger('hover:enter'));assert.equal(await page.evaluate(()=>$('.selectbox').text().includes('XOT unavailable fixture')),false);await page.evaluate(()=>Lampa.Select.close());
 await page.evaluate(()=>$('.filter--filter').trigger('hover:enter'));assert.equal(await page.evaluate(()=>$('.selectbox').text().includes('Сезон 99')),false);await page.evaluate(()=>Lampa.Select.close());
 assert.equal(unrelatedPosts,0);assert.equal(await page.evaluate(()=>$('.xot-native-row').text().includes('Unrelated movie')),false);
 await page.waitForFunction(()=>$('.xot-native-row.selector:not(.xot-source-status)').filter(function(){return $(this).text().includes('Eneyida');}).length>0);
 if(process.env.XOT_SCREENSHOT){await page.waitForTimeout(1000);await page.screenshot({path:process.env.XOT_SCREENSHOT});}
 await page.evaluate(()=>$('.xot-native-row.selector:not(.xot-source-status)').filter(function(){return $(this).text().includes('Eneyida');}).first().trigger('hover:enter'));await playing();
 assert.equal(await page.evaluate(()=>Lampa.Player.playdata().xot_source),'eneyida');
 await page.evaluate(()=>{const data=Lampa.Player.playdata();Lampa.PlayerPanel.listener.send('quality',{name:'720p',url:data.quality['720p']});});
 await page.waitForFunction(()=>Lampa.Storage.get('video_quality_default')===720&&[...document.querySelectorAll('video')].some(v=>v.videoWidth===1280&&v.currentTime>1));
 await page.evaluate(()=>Lampa.Player.close());await page.evaluate(()=>Lampa.Activity.backward());
 await page.evaluate(()=>{Lampa.Storage.set('xot_native_source','eneyida');Lampa.Storage.set('xot_native_last_sources',{});});
 await open({id:153312,name:'Король Талси',original_name:'Tulsa King',first_air_date:'2022-11-13',source:'tmdb'});
 await page.waitForFunction(()=>$('.xot-native-row.selector').text().includes('Серія 1'),{timeout:30000});
 await page.evaluate(()=>$('.filter--filter').trigger('hover:enter'));await choose('Сезон 1',true);await choose('Сезон 2',true);
 await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));await playing();
 const queue=await page.evaluate(()=>Lampa.PlayerPlaylist.get().map(item=>({season:item.season,episode:item.episode,title:item.title,lazy:typeof item.url==='function'})));
 assert.ok(queue.length>1);assert.ok(queue.some(item=>item.lazy));assert.equal(streams.length,1);
 await page.evaluate(()=>Lampa.PlayerPlaylist.next());
 await page.waitForFunction(()=>Lampa.Player.playdata()?.season===2&&Lampa.Player.playdata()?.episode===2&&[...document.querySelectorAll('video')].some(v=>v.currentTime>1&&!v.paused&&!v.error),{timeout:30000});
 const next=await page.evaluate(()=>({season:Lampa.Player.playdata().season,episode:Lampa.Player.playdata().episode,title:Lampa.Player.playdata().title,preferred:Lampa.Storage.get('video_quality_default'),width:document.querySelector('video').videoWidth}));
 assert.equal(next.preferred,720);assert.equal(next.width,1280);assert.ok(next.title.includes('HDrezka Studio'));assert.equal(streams.length,2);
 await page.evaluate(()=>{Lampa.Storage.set('playlist_next',true);Lampa.PlayerVideo.listener.send('ended',{});});
 await page.waitForTimeout(400);assert.equal(episodeWaiting,true,'Auto-next requests only the next episode');
 await page.evaluate(()=>Lampa.Player.close());releaseEpisode();await page.waitForTimeout(600);
 assert.equal(await page.evaluate(()=>Lampa.Player.opened()),false,'A late episode response must not reopen a closed player');
 emptyMode=true;await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));await choose('Усі джерела',true);
 await page.waitForFunction(()=>$('.xot-native-row').text().includes('Доступних джерел не знайдено'),{timeout:30000});
 assert.equal(await page.locator('.xot-native-row').count(),2,'One empty message and one retry replace individual source failures');
 assert.equal(await page.locator('.xot--voice:visible').count(),0,'Unavailable-only voices are excluded from aggregate filters');
 assert.equal(await page.evaluate(()=>/UAKino|HDRezka|fixture|помилка|недоступне/.test($('.xot-native-row').text())),false);
 await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));
 assert.equal(await page.evaluate(()=>/UAKino|Ashdi/i.test($('.selectbox').text())),false,'The removed balancer is absent from the picker');
 await choose('HDRezka',true);
 await page.waitForFunction(()=>$('.xot-native-row').text().includes('обмеження доступу'));
 await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));await choose('Filmix',true);
 await page.waitForFunction(()=>$('.xot-native-row').text().includes('XOT unavailable fixture'));
 assert.equal(await page.locator('.xot--voice:visible').count(),1,'An individual balancer still explains unavailable voices');
 assert.deepEqual(exceptions,[]);
 assert.deepEqual(removedRequests,[]);
 console.log(JSON.stringify({origin,removedSource:{oldPreferenceFallsBack:true,absentFromPicker:true,requests:removedRequests.length},ukrainianDefault:true,manualVoiceRestored:true,allSources:{partial,failedSourceDidNotBlock:true,onlyFoundResults:true,emptyAndUnavailableHidden:true,emptyMessageAndRetry:true,individualDiagnosticsPreserved:true,unrelatedPosts},quality:{fallback,nextPreferred:next.preferred},playlist:{entries:queue.length,lazy:true,next,lateResponseCancelled:true},exceptions},null,2));
}catch(error){for(const page of browser.contexts().flatMap(c=>c.pages()))console.error(await page.evaluate(()=>({rows:window.jQuery?$('.xot-native-row').text():null,select:window.jQuery?$('.selectbox').text():null,playing:window.Lampa?.Player.playdata?.()})).catch(()=>({})));throw error;}
finally{releaseRezka();releaseEpisode();await browser.close();}
