import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext, Script} from 'node:vm';
const plugin=readFileSync(new URL('../public/online.js',import.meta.url),'utf8');
const loader=readFileSync(new URL('../public/m.js',import.meta.url),'utf8');
const movie={id:460458,title:'Оселя зла: Вітаємо у Раккун-Сіті',original_title:'Resident Evil: Welcome to Raccoon City',release_date:'2021-11-24',imdb_id:'tt6920084',source:'tmdb'};

function harness({card=movie,ready=true,stored={},early=false,expose=false}={}) {
 const values={...stored},components={},scripts=[],pushes=[],notices=[],menus=[],timers=new Map(),listeners={};
 let now=1000,nextTimer=0,button=null;
 const empty={length:0,remove(){},first(){return this;},last(){return this;}};
 const area={length:1,first(){return this;},find(){return button||empty;},append(node){button=node;},prepend(node){button=node;},children(){return empty;}};
 function jquery(input){
  if(typeof input==='string'&&input.includes('full-start-new__buttons'))return area;
  return {0:{},length:1,handlers:{},values:{},data(key,value){if(arguments.length===2){this.values[key]=value;return this;}return this.values[key];},on(events,fn){events.split(' ').forEach(e=>this.handlers[e]=fn);return this;}};
 }
 if(ready)components.online_mod=function(){};
 const Lampa={
  Component:{get:name=>components[name],add:(name,fn)=>{components[name]=fn;}},
  Storage:{get:(key,fallback)=>key in values?values[key]:fallback,set:(key,v)=>{values[key]=v;},field:key=>values[key],cache:(key,n,fallback)=>values[key]||fallback},
  Activity:{active:()=>({movie:card}),push:p=>pushes.push(p)},
  SettingsApi:{getComponent:()=>false},
  Listener:{follow:(name,fn)=>{listeners[name]=fn;}},
  Select:{show:menu=>menus.push(menu)},Noty:{show:msg=>notices.push(msg)}
 };
 const head={appendChild(node){node.parentNode=this;if(node.tag==='script')scripts.push(node);},removeChild(node){node.parentNode=null;}};
 const document={readyState:'complete',currentScript:null,querySelector:()=>null,
  getElementsByTagName:()=>[],createElement:tag=>({tag,setAttribute(){}}),head};
 const context={Lampa,document,jQuery:jquery,URL,URLSearchParams,Uint8Array,console:{info(){},log(){},warn(){},error(){}},
  Date:{now:()=>now},setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id)};
 context.window=context;
 if(early)delete context.Lampa;
 function advance(ms){const end=now+ms;let count=0;while(true){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;if(++count>1000)throw Error('timer loop');now=due[1].at;timers.delete(due[0]);due[1].fn();}now=end;}
 function boot(){const code=expose?plugin.replace(/\}\)\(\);\s*$/, 'window.__testMatching={matches:matches,names:names,get:get,voiceKey:voiceKey,ukrainian:ukrainian,chooseQuality:chooseQuality,episodeGroups:episodeGroups,backupGroups:backupGroups,deliveryFamily:deliveryFamily,streamItem:streamItem,sourcePreferences:sourcePreferences,sourceEnabled:sourceEnabled,orderedSources:orderedSources,preferredSource:preferredSource,displayGroups:displayGroups,cachedSearch:cachedSearch,favoriteIdentity:favoriteIdentity,favoriteVoices:favoriteVoices,favoriteVoice:favoriteVoice,watchCardKey:watchCardKey,watchHash:watchHash,watchProfile:watchProfile,watchHistory:watchHistory,rememberWatch:rememberWatch,watchProgress:watchProgress,watchTime:watchTime,latestUnfinished:latestUnfinished,clearSearchCache:function(){searchCache.clear();},cacheKeys:function(){return Array.from(searchCache.keys());}};})();'):plugin;runInNewContext(code,context);advance(350);}
 function enter(){assert.ok(button,'movie button is mounted');button.handlers['hover:enter']();}
 return {context,Lampa,values,components,scripts,pushes,notices,menus,timers,listeners,boot,advance,enter,get button(){return button;}};
}

test('both entry scripts parse',()=>{assert.doesNotThrow(()=>new Script(plugin));assert.doesNotThrow(()=>new Script(loader));});
test('XOT opens its own movie component without loading a third-party module',()=>{
 const h=harness();h.boot();h.enter();assert.equal(h.pushes.length,1);assert.equal(h.pushes[0].component,'xot_online');assert.equal(h.pushes[0].search,movie.title);assert.equal(h.pushes[0].search_two,movie.original_title);assert.equal(h.pushes[0].movie.imdb_id,movie.imdb_id);assert.equal(h.scripts.length,0);assert.equal(h.menus.length,0);
});
test('the independent plugin contains no Online MOD or Lumio runtime dependency',()=>{assert.doesNotMatch(plugin,/online_mod|putScriptAsync|mitsu\.tv|lumio\.js/);});
test('TV names normalize without mutating the original card',()=>{
 const card={id:1,name:'Серіал',original_name:'Series',first_air_date:'2025-01-01'};const h=harness({card});h.boot();h.enter();assert.equal(h.pushes[0].movie.title,'Серіал');assert.equal(h.pushes[0].movie.original_title,'Series');assert.equal(card.title,undefined);
});
test('A new card opens all sources regardless of the last global selection',()=>{
 const h=harness({stored:{xot_native_source:'ufdub',online_mod_balanser:'filmix'}});h.boot();h.enter();assert.equal(h.pushes[0].xot_source,'all');assert.equal(h.values.online_mod_balanser,'filmix');
});
test('An enabled source explicitly selected for this card is remembered',()=>{
 const h=harness({stored:{xot_native_source:'filmix',xot_native_last_sources:{[movie.id]:'eneyida'}}});h.boot();h.enter();assert.equal(h.pushes[0].xot_source,'eneyida');
});
test('hover and click from one activation open one activity',()=>{const h=harness();h.boot();h.enter();h.button.handlers.click();assert.equal(h.pushes.length,1);});
test('repeated initialization does not duplicate the button',()=>{const h=harness();h.boot();const button=h.button;h.boot();assert.equal(h.button,button);h.enter();assert.equal(h.pushes.length,1);});
test('reused buttons receive the newest movie',()=>{
 const h=harness();h.boot();const original=h.button;h.listeners.full({type:'complite',data:{movie:{id:2,title:'Next movie'}}});h.advance(350);h.enter();assert.equal(h.button,original);assert.equal(h.pushes[0].movie.id,2);
});
test('activity metadata cannot become a movie card',()=>{const h=harness({card:null});h.Lampa.Activity.active=()=>({title:'Main',component:'main',activity:{}});h.boot();h.enter();assert.equal(h.pushes.length,0);});
test('loader uses the Worker origin without putScriptAsync',()=>{const h=harness();h.context.document.currentScript={src:'https://plugin.example/m.js'};runInNewContext(loader,h.context);assert.equal(new URL(h.scripts[0].src).origin,'https://plugin.example');assert.equal(h.context.__XOT_API_BASE__,'https://plugin.example');});
test('loader waits for Lampa during startup',()=>{const h=harness({early:true});runInNewContext(loader,h.context);assert.equal(h.scripts.length,0);h.context.Lampa=h.Lampa;h.advance(100);assert.equal(h.scripts.length,1);});
test('loader errors allow another attempt',()=>{const h=harness();runInNewContext(loader,h.context);h.scripts[0].onerror();assert.equal(h.context.__XOT_LOADER_PENDING__,false);runInNewContext(loader,h.context);assert.equal(h.scripts.length,2);});
test('an unrelated script does not redirect the loader to the Lampa origin',()=>{const h=harness();h.context.document.currentScript={src:'https://lampa.example/app.min.js'};runInNewContext(loader,h.context);assert.equal(new URL(h.scripts[0].src).origin,'https://xot-online.ai-beta69690.workers.dev');});


test('client refuses same-year unrelated titles, sequels and remakes by default',()=>{
 const h=harness({expose:true});h.boot();const {matches}=h.context.__testMatching;
 assert.equal(matches({title:'A different movie',year:2021,series:false},movie),false);
 assert.equal(matches({title:movie.original_title+' 2',year:2021,series:false},movie),false);
 assert.equal(matches({title:movie.original_title,year:2020,series:false},movie),false);
 assert.equal(matches({title:movie.original_title,year:2021,series:false},movie),true);
 assert.equal(matches({title:'Обитель зла: Раккун-Сити',year:2021,series:false},{...movie,xot_search_titles:['Обитель зла: Раккун-Сити']}),true);
});
test('client retains distinct voice IDs when displayed labels are the same',()=>{
 const h=harness({expose:true});h.boot();const {voiceKey}=h.context.__testMatching;
 assert.notEqual(voiceKey({voice_id:'one',translation:'Voice'}),voiceKey({voice_id:'two',translation:'Voice'}));
});
test('Ukrainian preference recognizes explicit language labels without guessing from studio names',()=>{
 const h=harness({expose:true});h.boot();const {ukrainian}=h.context.__testMatching;
 for(const item of [{translation:'Дубльований [Український | 1080p+]'},{translation:'Украинский'},{translation:'UKR · Studio'},{translation:'Оригінал',language:'uk-UA'},{translation:'UA'},{translation:'🇺🇦'}])assert.equal(ukrainian(item),true);
 for(const translation of ['Русский','Оригинал','HDrezka Studio','AMC','Dual audio'])assert.equal(ukrainian({translation}),false);
});
test('A disabled language preference survives Lampa truthy-default storage behavior',()=>{
 const h=harness({expose:true,stored:{xot_prefer_ukrainian:false}});
 h.Lampa.Storage.get=(key,fallback)=>h.values[key]||fallback||'';
 h.Lampa.Storage.value=key=>key in h.values?String(h.values[key]):'';
 h.boot();assert.equal(h.context.__testMatching.get('xot_prefer_ukrainian',true),false);assert.equal(h.context.__testMatching.get('unset',true),true);
});
test('Quality selection keeps a requested cap and falls back only to available secure streams',()=>{
 const h=harness({expose:true});h.boot();const {chooseQuality}=h.context.__testMatching;
 const items=[480,1080,720].map(q=>({quality:q+'p',url:'https://cdn.example/'+q+'.m3u8'}));
 assert.equal(chooseQuality(items,720).url,'https://cdn.example/720.m3u8');assert.equal(chooseQuality(items,2160).url,'https://cdn.example/1080.m3u8');assert.equal(chooseQuality(items,0).url,'https://cdn.example/1080.m3u8');
 assert.equal(chooseQuality(items.filter(x=>x.quality!=='720p'),720).url,'https://cdn.example/480.m3u8');
 assert.equal(chooseQuality([{quality:'Авто',url:'https://cdn.example/master.m3u8'}],1080).url,'https://cdn.example/master.m3u8');
 assert.equal(chooseQuality([{quality:'2160p',url:'javascript:alert(1)'}],2160).url,undefined);
});
test('Episode queues sort seasons and original episode numbers without mixing sources or voices',()=>{
 const h=harness({expose:true});h.boot();const {episodeGroups}=h.context.__testMatching;
 const row=(season,episode,provider='eneyida',voice_id='ua')=>({season,episode,provider,voice_id});
 const items=[row(2,1),row(1,10),row(1,1),row(1,1),row(2,2,'filmix'),row(2,2,'eneyida','ru'),row(0,0)];
 const groups=episodeGroups(items,row(1,1));assert.equal(groups.length,3);assert.deepEqual(JSON.parse(JSON.stringify(groups.map(x=>[x[0].season,x[0].episode]))),[[1,1],[1,10],[2,1]]);assert.equal(groups[0].length,2);
});


test('Backup candidates preserve exact episode, reject failed delivery families and collapse shared URLs',()=>{
 const h=harness({expose:true});h.boot();const {backupGroups,deliveryFamily}=h.context.__testMatching;
 assert.equal(deliveryFamily('https://cdn.hdvbua.pro/a.m3u8'),deliveryFamily('https://tortuga.tw/a.m3u8'));
 const row=(provider,season,episode,url='https://cdn.example/one.m3u8')=>({provider,season,episode,url,voice_id:'uk'});
 const rows=[row('catalog_a',2,3),row('catalog',2,3),row('catalog_a',1,3),row('catalog_a',2,4),row('kinovezha',2,3,'https://hdvbua.pro/a.m3u8'),row('bad',2,3,'javascript:alert(1)')];
 const groups=backupGroups(rows,{season:2,episode:3},new Set(['hdvbua']));assert.equal(groups.length,1);assert.equal(groups[0][0].provider,'catalog_a');
 assert.equal(backupGroups(rows,{season:2,episode:3},new Set(['hdvbua','cdn.example'])).length,0);
 assert.equal(backupGroups(rows,{},new Set()).length,0,'A movie must not fall back to a series');
});
test('Only native UFDub descriptors can enter lazy queues and they cannot be played as media URLs',()=>{
 const h=harness({expose:true});h.boot();const {streamItem,chooseQuality,backupGroups,deliveryFamily,matches}=h.context.__testMatching;
 const item={provider:'ufdub',post_id:'454',needs_resolve:true,resolve_url:'https://ufdub.com/video/VIDEOS.php?ID=454&TAB=Main&Seriya=Three&POS=3',season:1,episode:3,voice_id:'uk'};
 assert.equal(streamItem(item),true);assert.equal(chooseQuality([item],1080).url,undefined);assert.equal(backupGroups([item],{season:1,episode:3},new Set()).length,1);
 assert.equal(deliveryFamily(item.resolve_url),deliveryFamily('https://api.ufdub.com/UFDUB_UPLOAD/VIDEO/one.mp4'));assert.equal(backupGroups([item],{season:1,episode:3},new Set(['ufdub'])).length,0);
 for(const bad of [{...item,provider:'catalog'},{...item,post_id:'999'},{...item,resolve_url:item.resolve_url.replace('ufdub.com','attacker.example')},{...item,resolve_url:item.resolve_url+'&ID=454'},{...item,needs_resolve:false}])assert.equal(streamItem(bad),false);
 assert.equal(matches({title:'Alternate',alternative_titles:[movie.original_title],year:2021,series:false},movie),true);assert.equal(matches({title:'Alternate',alternative_titles:[movie.original_title+' 2'],year:2021,series:false},movie),false);
});
test('Source settings preserve order, suppress disabled/removed sources and cannot disable All',()=>{
 const h=harness({expose:true,stored:{xot_source_preferences:{order:['filmix','anilibria','eneyida'],disabled:['all','eneyida']},xot_native_last_sources:{[movie.id]:'eneyida'}}});h.boot();h.enter();const api=h.context.__testMatching;
 assert.equal(h.pushes[0].xot_source,'all');assert.equal(api.sourceEnabled('all'),true);
 const list=[{id:'all'},{id:'eneyida'},{id:'filmix'},{id:'anilibria'},{id:'ufdub'}];
 assert.deepEqual(JSON.parse(JSON.stringify(api.orderedSources(list).map(s=>s.id))),['all','filmix','ufdub']);
 assert.deepEqual(JSON.parse(JSON.stringify(api.orderedSources(list,true).map(s=>s.id))),['all','filmix','eneyida','ufdub']);
 for(const removed of ['uakino','anilibria']){h.values.xot_native_last_sources[movie.id]=removed;assert.equal(api.preferredSource(movie),'all');}
});
test('Initial preferences leave anime out and disable optional UFDub and unavailable Rezka',()=>{
 const h=harness({expose:true});h.boot();const api=h.context.__testMatching;
 assert.equal(api.sourceEnabled('ufdub'),false);assert.equal(api.sourceEnabled('rezka'),false);assert.equal(api.sourceEnabled('eneyida'),true);assert.doesNotMatch(plugin,/id:'anilibria'/);
 h.values.xot_source_preferences={order:['ufdub'],disabled:[]};assert.equal(api.sourceEnabled('ufdub'),true);
});
test('Identical multi-quality video groups merge across catalogs without losing voices or episode identity',()=>{
 const h=harness({expose:true});h.boot();const {displayGroups}=h.context.__testMatching;
 const row=(provider,quality=1080,extra={})=>({provider,source:provider,title:'Show',season:1,episode:3,translation:'Студія',voice_id:provider+':studio',quality:quality+'p',url:'https://cdn.example/show/'+quality+'.m3u8?token=one',...extra});
 const first=[row('eneyida'),row('eneyida',720)],second=[row('uaserials',720),row('uaserials')];
 const merged=displayGroups(first.concat(second),true);assert.equal(merged.length,1);assert.equal(merged[0].names.length,2);assert.equal(merged[0].items[0].provider,'eneyida');assert.equal(merged[0].items.length,2);
 assert.equal(displayGroups(first.concat(second),false).length,2);
 for(const extra of [{translation:'Інша студія'},{episode:4},{season:2},{url:'https://cdn.example/show/1080.m3u8?token=two'},{audio_track:'second'},{language:'ru'},{needs_resolve:true}])assert.equal(displayGroups([row('eneyida'),row('uaserials',1080,extra)],true).length,2);
 assert.equal(displayGroups([row('eneyida'),row('eneyida',1080,{voice_id:'different-id'})],true).length,2);
 assert.equal(displayGroups(first.concat([row('uaserials')]),true).length,2,'Partial quality inventories must not silently replace each other');
});
test('Search cache stores only metadata, expires and separates movie identity',async()=>{
 const h=harness({expose:true});h.boot();const api=h.context.__testMatching;let calls=0;
 h.context.fetch=async()=>{calls++;return {ok:true,json:async()=>({results:[{id:1,title:'Movie',year:2022,path:'/1-movie.html',url:'https://cdn.example/temporary.m3u8',device_token:'not-metadata'}]})};};
 const payload={title:'Movie',movie:{titles:['Movie'],year:2022,series:false}};
 assert.equal((await api.cachedSearch('eneyida',payload)).cached,false);const hit=await api.cachedSearch('eneyida',payload);assert.equal(hit.cached,true);assert.equal(calls,1);assert.equal(hit.data.results[0].url,undefined);assert.equal(hit.data.results[0].device_token,undefined);
 hit.data.results[0].title='Changed';assert.equal((await api.cachedSearch('eneyida',payload)).data.results[0].title,'Movie');
 await api.cachedSearch('eneyida',{...payload,movie:{...payload.movie,year:2023}});assert.equal(calls,2);
 h.advance(300001);assert.equal((await api.cachedSearch('eneyida',payload)).cached,false);assert.equal(calls,3);
 api.clearSearchCache();await api.cachedSearch('eneyida',payload);assert.equal(calls,4);
});
test('Empty searches expire sooner; errors and aborted requests are never cached',async()=>{
 const h=harness({expose:true});h.boot();const api=h.context.__testMatching;let calls=0,bad=false;
 h.context.fetch=async()=>{calls++;return {ok:!bad,json:async()=>bad?{error:'access_denied'}:{results:[]}};};
 const payload={title:'Missing'};await api.cachedSearch('eneyida',payload);await api.cachedSearch('eneyida',payload);assert.equal(calls,1);h.advance(60001);await api.cachedSearch('eneyida',payload);assert.equal(calls,2);
 api.clearSearchCache();bad=true;await assert.rejects(api.cachedSearch('eneyida',payload),/access_denied/);await assert.rejects(api.cachedSearch('eneyida',payload),/access_denied/);assert.equal(calls,4);
 bad=false;await api.cachedSearch('eneyida',payload,{aborted:true});await api.cachedSearch('eneyida',payload);assert.equal(calls,6);
});
test('Authenticated Filmix searches bypass guest cache and never put tokens in cache keys',async()=>{
 const h=harness({expose:true});h.boot();const api=h.context.__testMatching;let calls=0;
 h.context.fetch=async()=>{calls++;return {ok:true,json:async()=>({results:[{id:1,title:'Movie'}]})};};
 const payload={title:'Movie'};await api.cachedSearch('filmix',payload);await api.cachedSearch('filmix',payload);assert.equal(calls,1);
 h.values.xot_filmix_device_token='private-filmix-token';await api.cachedSearch('filmix',payload);await api.cachedSearch('filmix',payload);assert.equal(calls,3);assert.ok(!api.cacheKeys().some(k=>k.includes('private-filmix-token')));
});
test('Watch hashes preserve old XOT progress and distinguish movie, series and episodes',()=>{
 const h=harness({expose:true});h.Lampa.Utils={hash:value=>value};h.boot();const api=h.context.__testMatching;
 assert.equal(api.watchHash(movie,{}),'xot:movie:460458:0:0');
 const series={id:460458,name:'Show',original_name:'Show',source:'tmdb'};
 assert.equal(api.watchHash(series,{season:2,episode:3}),'xot:tv:460458:2:3');assert.notEqual(api.watchHash(series,{season:1,episode:3}),api.watchHash(series,{season:2,episode:3}));
 assert.notEqual(api.watchCardKey(movie),api.watchCardKey(series));assert.notEqual(api.watchCardKey(movie),api.watchCardKey({...movie,source:'other'}));
});
test('Progress is bounded, completion follows Lampa’s 90 percent threshold and unknown positions are not invented',()=>{
 const h=harness({expose:true});h.boot();const {watchProgress,watchTime}=h.context.__testMatching;
 assert.equal(watchProgress({time:43,duration:100,percent:0}).percent,43);assert.equal(watchProgress({time:43,duration:100}).unfinished,true);
 assert.equal(watchProgress({percent:89,time:89,duration:100}).watched,false);assert.equal(watchProgress({percent:90,time:90,duration:100}).watched,true);assert.equal(watchProgress({percent:90,time:90,duration:100}).unfinished,false);
 const bad=watchProgress({percent:Infinity,time:-3,duration:NaN,updated:Infinity});assert.deepEqual(JSON.parse(JSON.stringify(bad)),{time:0,duration:0,percent:0,watched:false,unfinished:false,updated:0});
 assert.equal(watchProgress({percent:300,time:200,duration:100}).time,100);assert.equal(watchProgress({percent:300}).percent,100);assert.equal(watchProgress({percent:25}).unfinished,false);
 assert.equal(watchProgress({time:60}).unfinished,true);assert.equal(watchTime(3605),'1:00:05');assert.equal(watchTime(Infinity),'0:00');
});
test('Continue chooses the latest unfinished episode across seasons, even when that episode is missing from current results',()=>{
 const h=harness({expose:true});h.boot();const {latestUnfinished,watchProgress}=h.context.__testMatching;
 const row=(season,episode,updated,percent=30,record=null)=>({item:{season,episode},progress:watchProgress({time:percent,duration:100,percent,updated}),record});
 const recent=row(2,2,500),completed=row(2,3,900,100),old=row(1,2,100),missing=row(3,8,700,20,{updated:800});
 assert.equal(latestUnfinished([recent,completed,old]).item.episode,2);assert.equal(latestUnfinished([recent,completed,old]).item.season,2);
 assert.equal(latestUnfinished([recent,missing]).item.season,3);assert.equal(latestUnfinished([completed]),null);
 assert.equal(latestUnfinished([row(1,1,0),row(2,1,0)]).item.season,2);
});
test('Watch history is profile-scoped, stores only metadata and keeps the latest source/voice for each episode',()=>{
 const h=harness({expose:true});let profile='file_view_11';h.Lampa.Timeline={filename:()=>profile};h.boot();const api=h.context.__testMatching;
 const item={provider:'eneyida',translation:'Studio',voice_id:'one',url:'https://cdn.example/signed-secret.m3u8',device_token:'private-token'};
 api.rememberWatch(movie,item);assert.equal(api.watchHistory().length,1);assert.equal(api.watchHistory()[0].voice_id,'one');
 h.advance(1000);api.rememberWatch(movie,{...item,provider:'uaserials',voice_id:'two'});assert.equal(api.watchHistory().length,1);assert.equal(api.watchHistory()[0].provider,'uaserials');
 const stored=JSON.stringify(h.values.xot_watch_history_file_view_11);assert.ok(!/signed-secret|private-token|https:|device_token/.test(stored));
 profile='file_view_22';assert.equal(api.watchHistory().length,0);api.rememberWatch(movie,item);profile='file_view_11';assert.equal(api.watchHistory()[0].voice_id,'two');
 h.values.xot_watch_history_file_view_11=[{card:api.watchCardKey(movie),season:0,episode:0,updated:2,translation:{bad:true},url:'secret'}];const clean=api.watchHistory()[0];assert.equal(clean.translation,'');assert.equal(clean.url,undefined);
});
test('Favorite voices ignore quality labels but retain language and exact studio identity',()=>{
 const h=harness({expose:true});h.boot();const {favoriteIdentity}=h.context.__testMatching;
 assert.equal(favoriteIdentity({translation:'Студія [Українська | 1080p+]'}),favoriteIdentity({translation:'Студія [Українська | 720p]'}));
 assert.notEqual(favoriteIdentity({translation:'Studio',language:'uk'}),favoriteIdentity({translation:'Studio',language:'ru'}));assert.notEqual(favoriteIdentity({translation:'Studio'}),favoriteIdentity({translation:'Studio 2'}));assert.notEqual(favoriteIdentity({translation:'Studio'}),favoriteIdentity({translation:'Studio',language:'uk'}));
});
test('Global favorite order outranks source order and never guesses another studio or language',()=>{
 const h=harness({expose:true,stored:{xot_favorite_voices:[{title:'Studio B',language:'uk'},{title:'Studio A',language:'uk'}]}});h.boot();const api=h.context.__testMatching;
 const items=[{provider:'eneyida',translation:'Studio A',language:'uk'},{provider:'uaserials',translation:'Studio B',language:'uk'},{provider:'eneyida',translation:'Studio B',language:'uk'},{provider:'filmix',translation:'Studio B',language:'ru'}];
 assert.equal(api.favoriteVoice(items,['eneyida','uaserials','filmix']).provider,'eneyida');assert.equal(api.favoriteVoice(items,['uaserials','eneyida','filmix']).provider,'uaserials');assert.equal(api.favoriteVoice([{provider:'filmix',translation:'Studio B',language:'ru'}],['filmix']),null);
 h.values.xot_favorite_voices=[{title:'Studio A',language:'uk'},{title:'Studio A',language:'uk'},{title:'',language:'uk'},null];assert.equal(api.favoriteVoices().length,1);
});
