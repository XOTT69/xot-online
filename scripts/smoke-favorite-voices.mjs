// Deterministic voice catalogs in real Lampa; fixture streams are never played.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {serveLocalAssets} from './smoke-assets.mjs';
const origin=process.env.XOT_TEST_ORIGIN||'https://xot-online.ai-beta69690.workers.dev';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage(),errors=[];let available=true;await serveLocalAssets(page,origin);page.on('pageerror',e=>errors.push(e.message));
 await page.route(origin+'/api/providers',route=>route.fulfill({json:{providers:[]}}));
 await page.route(origin+'/api/eneyida',async route=>{const input=route.request().postDataJSON();if(input.action==='search')return route.fulfill({json:{results:[{id:input.title.includes('Second')?'102':'101',path:'/101-fixture.html',title:input.movie?.titles[0]||input.title,year:2022,series:false}]}});return route.fulfill({json:{title:'Fixture',items:available?['А','Б'].map(studio=>({provider:'eneyida',title:'Fixture',translation:'Студія '+studio+' [Українська | 1080p+]',language:'uk',voice_id:'studio-'+studio,url:'https://fixture.invalid/'+studio+'.m3u8',quality:'1080p'})):[]}});});
 await page.goto('https://yumata.github.io/lampa/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.Lampa?.Component&&window.jQuery);await page.waitForTimeout(2500);const uk=page.getByText('Українська',{exact:true});if(await uk.count())await uk.first().click();await page.waitForFunction(()=>Lampa.Activity.active());
 await page.evaluate(()=>{Lampa.Storage.set('xot_native_last_sources',{990021:'eneyida',990022:'eneyida'});Lampa.Storage.set('xot_native_voices',{});Lampa.Storage.set('xot_favorite_voices',[]);$('body').append('<div class="full-start__buttons xot-test-fixture"></div>');});
 await page.addScriptTag({url:origin+'/m.js'});await page.waitForFunction(()=>window.__XOT_ONLINE_INITIALIZED__);
 async function choose(text){await page.waitForFunction(text=>$('.selectbox .selector').filter(function(){return $(this).text().includes(text);}).length>0,text);await page.evaluate(text=>$('.selectbox .selector').filter(function(){return $(this).text().includes(text);}).first().trigger('hover:enter'),text);}
 async function open(id){await page.evaluate(id=>Lampa.Listener.send('full',{type:'complite',data:{movie:{id,title:id===990021?'First Fixture':'Second Fixture',original_title:id===990021?'First Fixture':'Second Fixture',release_date:'2022-01-01',source:'tmdb'}},object:{activity:{render:()=>$('body')}}}),id);await page.waitForTimeout(450);await page.evaluate(()=>$('.xot-online-button').trigger('hover:enter'));await page.waitForFunction(()=>$('.xot-native-row.selector').length>0);}
 async function manager(){await page.evaluate(()=>$('.filter--filter').trigger('hover:enter'));await choose('Улюблені озвучення');}
 await open(990021);await manager();await choose('Додати з озвучень');await choose('Студія Б');await choose('Готово');
 await page.waitForFunction(()=>$('.xot-native-row.selector').length===1&&$('.xot-native-row').text().includes('Студія Б'));assert.deepEqual(await page.evaluate(()=>Object.keys(Lampa.Storage.get('xot_native_voices',{}))),[],'Automatic favorite selection is not saved as a manual card override');
 await page.evaluate(()=>Lampa.Activity.backward());await open(990022);await page.waitForFunction(()=>$('.xot-native-row.selector').length===1&&$('.xot-native-row').text().includes('Студія Б'));
 await page.evaluate(()=>$('.xot--voice').trigger('hover:enter'));await choose('Студія А');await page.waitForFunction(()=>$('.xot-native-row').text().includes('Студія А'));
 await page.evaluate(()=>Lampa.Activity.backward());await open(990022);await page.waitForFunction(()=>$('.xot-native-row.selector').length===1&&$('.xot-native-row').text().includes('Студія А'));
 await page.evaluate(()=>$('.xot--voice').trigger('hover:enter'));await choose('Усі озвучення');await page.waitForFunction(()=>$('.xot-native-row.selector').length===2);
 await manager();await choose('Додати з озвучень');await choose('Студія А');await choose('Студія А');await choose('Перемістити вище');await choose('Готово');assert.equal(await page.locator('.xot-native-row.selector').count(),2,'Manual All survives a change in global favorites');
 await page.evaluate(()=>Lampa.Activity.backward());await open(990022);assert.equal(await page.locator('.xot-native-row.selector').count(),2);
 await page.evaluate(()=>$('.xot--voice').trigger('hover:enter'));await choose('Автовибір: улюблені');await page.waitForFunction(()=>$('.xot-native-row.selector').length===1&&$('.xot-native-row').text().includes('Студія А'));
 const favorites=await page.evaluate(()=>Lampa.Storage.get('xot_favorite_voices'));assert.ok(favorites[0].title.includes('Студія А'));assert.ok(favorites[1].title.includes('Студія Б'));assert.ok(!/https:|\.m3u8/.test(JSON.stringify(favorites)));
 // A reused translator ID must not silently replace a missing saved studio.
 await page.evaluate(()=>{
  Lampa.Storage.set('xot_favorite_voices',[]);Lampa.Storage.set('xot_watch_history_'+Lampa.Timeline.filename(),[{card:'tmdb:movie:990022',season:0,episode:0,provider:'eneyida',voice_id:'studio-А',translation:'Зникла студія',language:'uk',updated:Date.now()}]);
  Lampa.Timeline.update({hash:Lampa.Utils.hash('xot:movie:990022:0:0'),time:600,duration:3000,percent:20});
 });
 await page.waitForFunction(()=>$('.xot-continue-row.selector').text().includes('Обери озвучення'));await page.evaluate(()=>$('.xot-continue-row.selector').trigger('hover:enter'));
 await page.waitForFunction(()=>$('.selectbox').text().includes('Озвучення для продовження'));assert.equal(await page.evaluate(()=>Lampa.Player.opened()),false);await page.evaluate(()=>Lampa.Select.close());
 available=false;await page.evaluate(()=>$('.filter--filter').trigger('hover:enter'));await choose('Повторити пошук');
 await page.waitForFunction(()=>$('.xot-continue-row').text().includes('Потік для цього перегляду не знайдено'));assert.equal(await page.locator('.xot-continue-row.selector').count(),0);assert.equal(await page.evaluate(()=>Lampa.Player.opened()),false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({origin,globalFavoriteAcrossCards:true,manualChoiceWins:true,manualAllWins:true,reordering:true,automaticModeRestored:true,missingVoicePrompts:true,unavailableResumeNotPlayed:true,metadataOnly:true,favorites,errors},null,2));
}catch(error){console.error(error);for(const page of browser.contexts().flatMap(c=>c.pages()))console.error(await page.evaluate(()=>({rows:window.jQuery?$('.xot-native-row').text():null,select:window.jQuery?$('.selectbox').text():null})).catch(()=>({})));throw error;}finally{await browser.close();}
