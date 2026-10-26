// Manual integration check against real Lampa and live providers, not a CI unit test.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),exceptions=[],forbidden=[];
 page.on('pageerror',e=>exceptions.push(e.message));
 page.on('request',r=>{if(r.resourceType()==='script'&&/online_mod|\/lumio\.js/.test(r.url()))forbidden.push(r.url());});
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery,{timeout:30000});
 await page.waitForTimeout(2500);
 const ukrainian=page.getByText('Українська',{exact:true});if(await ukrainian.count())await ukrainian.first().click();
 await page.waitForFunction(()=>Lampa.Activity.active(),{timeout:20000});
 await page.evaluate(()=>{
  window.xotTestMovie={id:460458,title:'Оселя зла: Вітаємо у Раккун-Сіті',original_title:'Resident Evil: Welcome to Raccoon City',release_date:'2021-11-24',imdb_id:'tt6920084',source:'tmdb',overview:'Перевірка власних балансерів ХОТ',vote_average:5.9};
  Lampa.Storage.set('xot_native_source','filmix');Lampa.Storage.set('xot_native_last_sources',{});
  $('body').append('<div class="full-start__buttons xot-test-fixture"></div>');
 });
 await page.addScriptTag({url:origin+'/m.js'});
 await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__,{timeout:15000});
 await page.evaluate(()=>Lampa.Listener.send('full',{type:'complite',data:{movie:xotTestMovie},object:{activity:{render:()=>$('body')}}}));
 await page.waitForTimeout(400);
 await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));
 await page.waitForFunction(()=>Lampa.Activity.active()?.component==='xot_online'&&$('.xot-native-row').text().includes('Дубльований [Український'),{timeout:30000});
 if(process.env.XOT_SCREENSHOT){await page.waitForTimeout(1500);await page.screenshot({path:process.env.XOT_SCREENSHOT});}
 await page.evaluate(()=>{
  const play=Lampa.Player.play;window.xotPlayCalled=false;
  Lampa.Player.play=function(){window.xotPlayCalled=true;return play.apply(this,arguments);};
  $('.xot-native-row.selector').filter(function(){return $(this).text().includes('Дубльований [Український');}).first().trigger('hover:enter');
 });
 await page.waitForFunction(()=>window.xotPlayCalled&&[...document.querySelectorAll('video')].some(v=>v.currentTime>1&&!v.paused&&!v.error),{timeout:20000});
 const playback=await page.evaluate(()=>[...document.querySelectorAll('video')].map(v=>({readyState:v.readyState,time:v.currentTime,error:v.error?.code||null,paused:v.paused})));
 await page.evaluate(()=>Lampa.Player.close());
 // Exercise the actual upper balancer menu rather than a replacement controller.
 await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));
 await page.waitForFunction(()=>$('.selectbox').text().includes('HDRezka'));
 await page.evaluate(()=>$('.selectbox .selector').filter(function(){return $(this).text().trim()==='HDRezka';}).first().trigger('hover:enter'));
 await page.waitForFunction(()=>Lampa.Storage.get('xot_native_source')==='rezka'&&$('.xot-native-row').text().includes('Раккун-Сити'),{timeout:30000});
 await page.evaluate(()=>$('.xot-native-row.selector').filter(function(){return $(this).text().includes('Раккун-Сити');}).first().trigger('hover:enter'));
 await page.waitForFunction(()=>$('.xot-native-row').text().includes('джерело недоступне')||$('.xot-native-row').text().includes('Обрати якість'),{timeout:30000});
 const rezka=await page.evaluate(()=>({source:Lampa.Storage.get('xot_native_source'),status:$('.xot-native-row').text().includes('джерело недоступне')?'restricted':'translations',message:$('.xot-native-row__note').first().text()}));
 assert.equal(forbidden.length,0,'Third-party plugin was loaded');assert.deepEqual(exceptions,[]);
 console.log(JSON.stringify({origin,component:'xot_online',playback,rezka,thirdPartyScripts:forbidden.length,exceptions},null,2));
}finally{await browser.close();}
