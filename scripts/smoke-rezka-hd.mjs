// Public production flow only: no Render credentials, API interception or local relay.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveLocalAssets} from './smoke-assets.mjs';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required'],...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],privateCalls=[];
 await serveLocalAssets(page,origin);page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{const url=new URL(r.url());if(url.hostname.endsWith('.onrender.com')&&url.pathname==='/api/rezka')privateCalls.push('private API reached browser');});
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:45000});await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery);await page.waitForTimeout(2500);
 const uk=page.getByText('Українська',{exact:true});if(await uk.count())await uk.first().click();await page.waitForFunction(()=>Lampa.Activity.active());
 await page.evaluate(()=>{
  Lampa.Storage.set('xot_source_preferences',{order:[],disabled:['ufdub','rezka']});Lampa.Storage.set('xot_rezka_hd_enabled',false);
  Lampa.Storage.set('xot_native_last_sources',{361743:'rezka',153312:'rezka'});Lampa.Storage.set('video_quality_default',720);Lampa.Storage.set('player_timecode','again');$('body').append('<div class="full-start__buttons xot-test-fixture"></div>');
 });
 await page.addScriptTag({url:origin+'/m.js'});await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__);
 assert.deepEqual(await page.evaluate(()=>Lampa.Storage.get('xot_source_preferences').disabled),['ufdub'],'The connected source is enabled once on upgrade');
 async function open(card){await page.evaluate(card=>Lampa.Listener.send('full',{type:'complite',data:{movie:card},object:{activity:{render:()=>$('body')}}}),card);await page.waitForTimeout(450);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));await page.waitForFunction(()=>$('.xot-native-row.selector').length>0,null,{timeout:120000});}
 async function playing(){await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>1&&!v.paused&&!v.error),null,{timeout:60000});return page.evaluate(()=>{const v=[...document.querySelectorAll('video')].find(v=>v.currentTime>1&&!v.paused&&!v.error),p=Lampa.Player.playdata();return {source:p.xot_source,voice:p.xot_item.translation,season:p.season,episode:p.episode,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,duration:v.duration,qualities:Object.keys(p.quality||{[p.xot_item.quality]:p.url})};});}
 await open({id:361743,title:'Топ Ґан: Меверік',original_title:'Top Gun: Maverick',release_date:'2022-05-24',source:'tmdb'});await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));
 const movie=await playing();assert.ok(movie.width>=1200||movie.height>=720);assert.ok(movie.qualities.every(q=>parseInt(q)>=720));
 await page.evaluate(()=>Lampa.PlayerVideo.to(60));await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>61&&!v.paused&&!v.seeking),null,{timeout:30000});
 await page.evaluate(()=>Lampa.Player.close());await page.waitForTimeout(400);await page.evaluate(()=>Lampa.Activity.backward());
 await open({id:153312,name:'Король Талси',original_name:'Tulsa King',first_air_date:'2022-11-13',source:'tmdb'});await page.waitForFunction(()=>$('.xot-native-row.selector').text().includes('Серія 1'),null,{timeout:120000});await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));
 const first=await playing();assert.equal(first.episode,1);assert.ok(first.width>=1200||first.height>=720);
 await page.evaluate(()=>Lampa.PlayerPlaylist.next());await page.waitForFunction(()=>Lampa.Player.playdata()?.episode===2,null,{timeout:120000});const next=await playing();assert.equal(next.episode,2);assert.equal(next.voice,first.voice);assert.ok(next.width>=1200||next.height>=720);await page.evaluate(()=>Lampa.Player.close());
 await page.evaluate(()=>Lampa.Activity.active().activity.component.changeSource('all'));await page.waitForFunction(()=>$('.xot-native-row.selector').text().includes('HDRezka'),null,{timeout:120000});
 const aggregate=await page.locator('.xot-native-row').allTextContents();assert.ok(aggregate.every(t=>!t.includes('480p')));assert.deepEqual(privateCalls,[]);assert.deepEqual(errors,[]);
 if(process.env.XOT_SCREENSHOT){await page.waitForTimeout(1500);await page.screenshot({path:process.env.XOT_SCREENSHOT});}
 console.log(JSON.stringify({origin,secretNotInBrowser:true,enabledOnUpgrade:true,movie,seek60:true,first,next,aggregateIncludesRezka:true,errors},null,2));
}catch(error){for(const p of browser.contexts().flatMap(c=>c.pages()))console.error(await p.evaluate(()=>({rows:window.jQuery?$('.xot-native-row').text().slice(0,900):'',menu:window.jQuery?$('.selectbox').text().slice(0,400):'',videos:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,width:v.videoWidth,error:v.error?.message}))})).catch(()=>({})));throw error;}finally{await browser.close();}
