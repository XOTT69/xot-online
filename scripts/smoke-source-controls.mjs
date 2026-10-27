// Real Lampa UI with deterministic source responses. No fixture video is played.
// Actual Serialno playback is tested separately by smoke:serialno.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveLocalAssets} from './smoke-assets.mjs';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1500,height:900}}),exceptions=[],calls=[],forbidden=[];
 await serveLocalAssets(page,origin);
 page.on('pageerror',e=>exceptions.push(e.message));
 page.on('request',r=>{if(/\/api\/anilibria|\/lumio\.js|online_mod/.test(r.url()))forbidden.push(r.url());});
 await page.route(origin+'/api/providers',r=>r.fulfill({json:{providers:[]}}));
 for(const provider of ['eneyida','uaserials','kinovezha','filmix','ufdub','rezka','serialno'])await page.route(origin+'/api/'+provider,async route=>{
  const body=route.request().postDataJSON();calls.push({provider,action:body.action});
  if(provider==='kinovezha')return route.fulfill({status:502,json:{error:'kinovezha_access_denied'}});
  if(['filmix','ufdub','rezka','serialno'].includes(provider))return route.fulfill({json:{results:[]}});
  if(body.action==='search')return route.fulfill({json:{results:[{id:'101',path:'/101-fixture.html',title:body.movie?.titles[0]||body.title,year:2022,series:false}]}});
  const variants=(translation,voice)=>[1080,720].map(quality=>({provider,source:provider,title:'Fixture',translation,voice_id:provider+':'+voice,language:'uk',quality:quality+'p',url:'https://fixture.invalid/movie/'+quality+'.m3u8',season:null,episode:null}));
  return route.fulfill({json:{title:'Fixture',items:variants('Українська · Студія А','a').concat(provider==='eneyida'?variants('Українська · Студія Б','b'):[])}});
 });
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery);await page.waitForTimeout(2500);
 const uk=page.getByText('Українська',{exact:true});if(await uk.count())await uk.first().click();await page.waitForFunction(()=>Lampa.Activity.active());
 await page.evaluate(()=>{
  Lampa.Storage.set('xot_native_source','ufdub');Lampa.Storage.set('xot_native_last_sources',{});Lampa.Storage.set('xot_source_preferences',null);Lampa.Storage.set('xot_native_voices',{});
  $('body').append('<div class="full-start__buttons xot-test-fixture"></div>');
 });
 await page.addScriptTag({url:origin+'/m.js'});await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__);
 const card={id:990012,title:'Перевірка джерел',original_title:'Source Control Fixture',release_date:'2022-01-01',source:'tmdb'};
 async function choose(text,contains=false){
  await page.waitForFunction(({text,contains})=>$('.selectbox .selector').filter(function(){return contains?$(this).text().includes(text):$(this).text().trim()===text;}).length>0,{text,contains});
  await page.evaluate(({text,contains})=>$('.selectbox .selector').filter(function(){return contains?$(this).text().includes(text):$(this).text().trim()===text;}).first().trigger('hover:enter'),{text,contains});
 }
 async function filter(text){await page.evaluate(()=>$('.filter--filter').trigger('hover:enter'));await choose(text);}
 async function source(text){await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));await choose(text);}
 async function ready(){await page.waitForFunction(()=>$('.xot-native-row.selector').length===2&&$('.xot-native-row').text().includes('Студія Б'));await page.waitForTimeout(150);}
 function count(provider,action='search'){return calls.filter(c=>c.provider===provider&&c.action===action).length;}
 await page.evaluate(card=>Lampa.Listener.send('full',{type:'complite',data:{movie:card},object:{activity:{render:()=>$('body')}}}),card);
 await page.waitForTimeout(450);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));await ready();
 assert.equal(await page.evaluate(()=>Lampa.Activity.active().xot_source),'all','A new card ignores last global UFDub selection');
 assert.equal(await page.evaluate(()=>$('.xot-native-row.selector').first().text().includes('Eneyida / UASerials')),true);
 for(const id of ['ufdub','rezka','serialno'])assert.equal(count(id),0);
 await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));
 const initialPicker=await page.evaluate(()=>$('.selectbox .selector').map(function(){return $(this).text().trim();}).get());
 assert.ok(!initialPicker.some(t=>/AniLibria|аніме|UFDub|HDRezka/.test(t)));await page.evaluate(()=>Lampa.Select.close());
 await filter('Діагностика пошуку');
 const diagnostics=await page.evaluate(()=>$('.selectbox').text());
 for(const fragment of ['KinoVezha обмежила доступ','Filmix · Пошук не повернув','Serialno · серіали · Джерело лише для серіалів','UFDub · Вимкнено','HDRezka · Вимкнено'])assert.ok(diagnostics.includes(fragment),fragment);
 assert.ok(!diagnostics.includes('AniLibria'));await page.evaluate(()=>Lampa.Select.close());
 await source('Serialno · серіали');await page.waitForFunction(()=>$('.xot-native-row').text().includes('лише серіали'));assert.equal(count('serialno'),0);await source('Усі джерела');await ready();
 // Cached search cannot cache video addresses: every post remains a fresh request.
 const searchBefore=count('eneyida'),postBefore=count('eneyida','post');
 await source('Eneyida');await page.waitForFunction(()=>$('.xot-native-row.selector').length===1&&$('.xot-native-row').text().includes('Студія А'));
 assert.equal(count('eneyida'),searchBefore);assert.equal(count('eneyida','post'),postBefore+1);
 await filter('Діагностика пошуку');assert.ok((await page.evaluate(()=>$('.selectbox').text())).includes('кеш пошуку'));await page.evaluate(()=>Lampa.Select.close());
 await source('Усі джерела');await ready();
 // Editing settings makes no source requests until the changes are applied.
 await filter('Налаштування балансерів');const beforeSettings=calls.length;
 await choose('UFDub',true);await choose('Увімкнути джерело');
 await choose('KinoVezha',true);await choose('Вимкнути джерело');
 await choose('UASerials',true);await choose('Перемістити вище');
 assert.equal(calls.length,beforeSettings);const failedBefore=count('kinovezha');
 await choose('Готово');await ready();
 assert.equal(count('kinovezha'),failedBefore);assert.equal(count('ufdub'),2);
 assert.equal(await page.evaluate(()=>$('.xot-native-row.selector').first().text().includes('UASerials / Eneyida')),true);
 await page.evaluate(()=>$('.filter--sort').trigger('hover:enter'));
 const changedPicker=await page.evaluate(()=>$('.selectbox .selector').map(function(){return $(this).text().trim();}).get());
 assert.equal(changedPicker[1],'UASerials');assert.ok(changedPicker.includes('UFDub'));assert.ok(!changedPicker.includes('KinoVezha'));await page.evaluate(()=>Lampa.Select.close());
 const cachedBefore=count('eneyida');await filter('Діагностика пошуку');await choose('Повторити пошук без кешу');await ready();assert.equal(count('eneyida'),cachedBefore+2);assert.equal(count('kinovezha'),failedBefore);
 // Specific voice choices stay available after a cross-catalog row was merged.
 await page.evaluate(()=>$('.xot--voice').trigger('hover:enter'));await choose('Eneyida · Українська · Студія Б');
 await page.waitForFunction(()=>$('.xot-native-row.selector').length===1);assert.equal(await page.evaluate(()=>$('.xot-native-row.selector').text().includes('Студія Б')),true);
 await page.evaluate(()=>$('.xot--voice').trigger('hover:enter'));await choose('Автовибір української');await ready();
 // Turning everything off must leave settings reachable and perform no searches.
 await filter('Налаштування балансерів');
 for(const name of ['Eneyida','UASerials','Filmix','Serialno','UFDub']){await choose(name,true);await choose('Вимкнути джерело');}
 const disabledCount=calls.length;await choose('Готово');
 await page.waitForFunction(()=>$('.xot-native-row').text().includes('Увімкни джерела'));assert.equal(calls.length,disabledCount);
 await filter('Налаштування балансерів');await choose('Відновити початковий порядок і вибір');await choose('Готово');await ready();
 const preferences=await page.evaluate(()=>Lampa.Storage.get('xot_source_preferences'));assert.deepEqual(preferences.disabled,['ufdub','rezka']);
 assert.deepEqual(forbidden,[]);assert.deepEqual(exceptions,[]);
 console.log(JSON.stringify({origin,defaultSource:'all',initialPicker,changedPicker,mergedRows:2,voicesPreserved:true,searchCacheHit:true,postsRemainFresh:true,explicitRetryBypassesCache:true,settingsAppliedOnce:true,allDisabledRecovery:true,noAnimeRequests:true,requests:calls.length,exceptions},null,2));
}catch(error){
 console.error(error);for(const page of browser.contexts().flatMap(c=>c.pages()))console.error(await page.evaluate(()=>({rows:window.jQuery?$('.xot-native-row').text():null,select:window.jQuery?$('.selectbox').text():null,activity:window.Lampa?.Activity?.active()?.component})).catch(()=>({})));throw error;
}finally{await browser.close();}
