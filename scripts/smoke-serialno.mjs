import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveLocalAssets} from './smoke-assets.mjs';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),requests=[],exceptions=[],forbidden=[];
 await serveLocalAssets(page,origin);page.on('pageerror',e=>exceptions.push(e.message));
 page.on('request',r=>{if(/\/api\/anilibria|ashdi\.vip|online_mod|\/lumio\.js/.test(r.url()))forbidden.push(r.url());if(r.url()===origin+'/api/serialno'&&r.method()==='POST')requests.push(r.postDataJSON());});
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:30000});await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery);await page.waitForTimeout(2500);
 const uk=page.getByText('Українська',{exact:true});if(await uk.count())await uk.first().click();await page.waitForFunction(()=>Lampa.Activity.active());
 await page.evaluate(()=>{
  Lampa.Storage.set('xot_native_source','serialno');Lampa.Storage.set('xot_native_last_sources',{124364:'serialno'});Lampa.Storage.set('video_quality_default',1080);Lampa.Storage.set('player_timecode','again');
  $('body').append('<div class="full-start__buttons xot-test-fixture"></div>');
 });
 await page.addScriptTag({url:origin+'/m.js'});await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__);
 await page.evaluate(()=>Lampa.Listener.send('full',{type:'complite',data:{movie:{id:124364,name:'Ззовні',original_name:'From',first_air_date:'2022-02-20',source:'tmdb'}},object:{activity:{render:()=>$('body')}}}));await page.waitForTimeout(450);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));
 await page.waitForFunction(()=>$('.xot-native-row.selector').text().includes('Серія 1'),null,{timeout:35000});
 assert.equal(requests.filter(r=>r.action==='stream').length,0);
 await page.evaluate(()=>$('.xot-native-row.selector').first().trigger('hover:enter'));
 async function playing(){await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentTime>1&&!v.paused&&!v.error),null,{timeout:35000});return page.evaluate(()=>{const v=[...document.querySelectorAll('video')].find(v=>v.currentTime>1&&!v.paused&&!v.error),p=Lampa.Player.playdata();return {source:p.xot_source,season:p.season,episode:p.episode,title:p.title,width:v.videoWidth,height:v.videoHeight,duration:v.duration,time:v.currentTime};});}
 const first=await playing();assert.equal(first.source,'serialno');assert.equal(first.episode,1);assert.ok(first.width>=1280);assert.ok(first.duration>1000);
 await page.evaluate(()=>Lampa.PlayerPlaylist.next());await page.waitForFunction(()=>Lampa.Player.playdata()?.episode===2,null,{timeout:30000});const next=await playing();assert.equal(next.season,first.season);assert.equal(next.episode,2);assert.equal(requests.filter(r=>r.action==='stream').length,2);
 await page.evaluate(()=>Lampa.Player.close());
 assert.deepEqual(exceptions,[]);assert.deepEqual(forbidden,[]);
 console.log(JSON.stringify({origin,first,next,streamRequests:requests.filter(r=>r.action==='stream').length,noAnimeOrAshdi:true,exceptions},null,2));
}catch(error){console.error(error);for(const page of browser.contexts().flatMap(c=>c.pages()))console.error(await page.evaluate(()=>({rows:window.jQuery?$('.xot-native-row').text():null,select:window.jQuery?$('.selectbox').text():null,videos:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,width:v.videoWidth,error:v.error?.message}))})).catch(()=>({})));throw error;}finally{await browser.close();}
