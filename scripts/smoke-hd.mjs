// Real Lampa UI: controlled SD policy checks followed by live Kinostrain video.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveLocalAssets} from './smoke-assets.mjs';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required'],...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],calls=[];let fixtureMode=true;await serveLocalAssets(page,origin);
 page.on('pageerror',error=>errors.push(error.message));
 await page.route(origin+'/api/*',async route=>{
  const request=route.request();if(request.method()!=='POST')return route.continue();const body=request.postDataJSON(),provider=new URL(request.url()).pathname.split('/').at(-1);calls.push({provider,action:body.action});
  if(!fixtureMode)return route.continue();
  if(!['filmix','eneyida'].includes(provider))return route.fulfill({json:{results:[]}});
  if(body.action==='search')return route.fulfill({json:{results:[{id:1,path:'/1-fixture.html',title:'HD Fixture',original_title:'HD Fixture',year:2022,series:false}]}});
  return route.fulfill({json:{title:'HD Fixture',items:(provider==='filmix'?[480]:[480,720,1080]).map(q=>({provider,translation:provider==='filmix'?'SD only':'Українська · HD',quality:q+'p',url:'https://fixture.invalid/'+q+'.m3u8'}))}});
 });
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:45000});await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery);await page.waitForTimeout(2500);
 const uk=page.getByText('Українська',{exact:true});if(await uk.count())await uk.first().click();await page.waitForFunction(()=>Lampa.Activity.active());
 await page.evaluate(()=>{Lampa.Storage.set('video_quality_default',480);Lampa.Storage.set('player_timecode','again');Lampa.Storage.set('xot_native_last_sources',{});$('body').append('<div class="full-start__buttons xot-test-fixture"></div>');});
 await page.addScriptTag({url:origin+'/m.js'});await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__);
 async function open(card,source){
  await page.evaluate(({card,source})=>{const sources=Lampa.Storage.get('xot_native_last_sources',{});sources[card.id]=source;Lampa.Storage.set('xot_native_last_sources',sources);Lampa.Listener.send('full',{type:'complite',data:{movie:card},object:{activity:{render:()=>$('body')}}});},{card,source});
  await page.waitForTimeout(450);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));await page.waitForFunction(()=>Lampa.Activity.active()?.component==='xot_online');
 }
 const fixture={id:990017,title:'HD Fixture',original_title:'HD Fixture',release_date:'2022-01-01',source:'tmdb'};
 await open(fixture,'all');await page.waitForFunction(()=>$('.xot-native-row.selector').length===1&&$('.xot-native-row').text().includes('Українська · HD'));
 const rows=await page.locator('.xot-native-row').allTextContents();assert.ok(rows.every(t=>!t.includes('480p')&&!t.includes('SD only')));assert.ok(rows.join('').includes('1080p · 720p'));
 assert.equal(await page.evaluate(()=>Lampa.Storage.get('video_quality_default')),480,'Reading a legacy preference must not change other plugins');assert.ok((await page.locator('.xot--quality').innerText()).includes('720p'));
 await page.evaluate(()=>$('.xot--quality').trigger('hover:enter'));await page.waitForFunction(()=>$('.selectbox').text().includes('2160p'));
 const options=await page.locator('.selectbox').innerText();assert.ok(!options.includes('480p'));await page.evaluate(()=>Lampa.Select.close());
 // A direct Filmix selection must explain the HD minimum without listing SD.
 await page.evaluate(()=>Lampa.Activity.active().activity.component.changeSource('filmix'));await page.waitForFunction(()=>$('.xot-native-row').text().includes('від 720p'));assert.equal(await page.locator('.xot-native-row.selector').count(),0);
 await page.evaluate(()=>Lampa.Activity.backward());fixtureMode=false;
 // Live movie and two episodes: actual decoding, seeking and native next action.
 await open({id:361743,title:'Топ Ґан: Меверік',original_title:'Top Gun: Maverick',release_date:'2022-05-24',source:'tmdb'},'kinostrain');
 await page.waitForFunction(()=>$('.xot-native-row.selector').text().includes('Postmodern'),null,{timeout:40000});
 if(process.env.XOT_SCREENSHOT){await page.waitForTimeout(1600);await page.screenshot({path:process.env.XOT_SCREENSHOT});}
 await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));
 async function playing(){await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>1&&!v.paused&&!v.error),null,{timeout:45000});return page.evaluate(()=>{const v=[...document.querySelectorAll('video')].find(v=>v.currentTime>1&&!v.paused&&!v.error),p=Lampa.Player.playdata();return {source:p.xot_source,season:p.season,episode:p.episode,qualityKeys:Object.keys(p.quality),width:v.videoWidth,height:v.videoHeight,duration:v.duration,time:v.currentTime};});}
 const movie=await playing();assert.ok(movie.width>=1200||movie.height>=720);assert.ok(movie.qualityKeys.every(q=>parseInt(q)>=720));assert.ok(movie.duration>5000);
 await page.evaluate(()=>Lampa.PlayerVideo.to(60));await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>61&&!v.paused&&!v.seeking),null,{timeout:30000});
 await page.evaluate(()=>Lampa.Player.close());await page.waitForTimeout(1800);if(process.env.XOT_SCREENSHOT)await page.screenshot({path:process.env.XOT_SCREENSHOT});await page.evaluate(()=>Lampa.Activity.backward());
 await open({id:124364,name:'Ззовні',original_name:'From',first_air_date:'2022-02-20',source:'tmdb'},'kinostrain');
 await page.waitForFunction(()=>$('.xot-native-row.selector').text().includes('Серія 1'),null,{timeout:40000});await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));
 const first=await playing();assert.equal(first.episode,1);assert.ok(first.width>=1200||first.height>=720);
 await page.evaluate(()=>Lampa.PlayerPlaylist.next());await page.waitForFunction(()=>Lampa.Player.playdata()?.episode===2,null,{timeout:40000});const next=await playing();assert.equal(next.episode,2);assert.ok(next.qualityKeys.every(q=>parseInt(q)>=720));
 await page.evaluate(()=>Lampa.Player.close());await page.waitForFunction(()=>$('.xot-native-row.focus').data('xot-watch-item')?.episode===2);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({origin,sdHidden:true,legacyPreferencePreserved:true,headerQuality:true,sdSourceEmpty:true,seriesFocusAfterNext:true,movie,first,next,errors},null,2));
}catch(error){for(const p of browser.contexts().flatMap(c=>c.pages()))console.error(await p.evaluate(()=>({rows:window.jQuery?$('.xot-native-row').text().slice(0,900):'',menu:window.jQuery?$('.selectbox').text().slice(0,500):'',open:window.jQuery?$('body').hasClass('selectbox--open'):null,focus:window.jQuery?$('.focus').map(function(){return {cls:this.className,text:$(this).text().slice(0,80)};}).get():[],controller:window.Lampa?.Controller.enabled()?.name,views:window.Lampa?.Storage.get('xot_series_views'),videos:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,width:v.videoWidth,error:v.error?.message}))})).catch(()=>({})));throw error;}finally{await browser.close();}
