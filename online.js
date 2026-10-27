(function () {
'use strict';
if (!window.Lampa || window.__XOT_ONLINE_INITIALIZED__) return;
var VERSION='0.3.13', DEFAULT_API='https://xot-online.ai-beta69690.workers.dev';
var API_BASE=window.__XOT_API_BASE__ || (function () {
 var scripts=document.getElementsByTagName('script');
 for(var i=scripts.length-1;i>=0;i--){
  if(/\/online\.js(?:[?#]|$)/.test(scripts[i].src||'')){
   var u=new URL(scripts[i].src);
   return /(?:raw\.githubusercontent\.com|cdn\.jsdelivr\.net)$/.test(u.hostname)?DEFAULT_API:u.origin;
  }
 }
 return DEFAULT_API;
})();
var BASE_SOURCES=[{id:'all',title:'Усі джерела',kind:'aggregate'},{id:'eneyida',title:'Eneyida',kind:'native'},{id:'uaserials',title:'UASerials',kind:'native'},{id:'kinovezha',title:'KinoVezha',kind:'native'},{id:'filmix',title:'Filmix',kind:'native'},{id:'serialno',title:'Serialno · серіали',kind:'native',seriesOnly:true},{id:'ufdub',title:'UFDub',kind:'native'},{id:'rezka',title:'HDRezka',kind:'native'}];
var lastCard=null,buttonTimers=[],screenCounter=0,searchCache=new Map();
function notify(message){if(Lampa.Noty)Lampa.Noty.show(message);}
function get(key,fallback){try{
 if(Lampa.Storage.value){var raw=Lampa.Storage.value(key);if(raw==='false')return false;if(raw==='true')return true;}
 return Lampa.Storage.get(key,fallback);
}catch(e){return fallback;}}
function set(key,value){try{Lampa.Storage.set(key,typeof value==='boolean'?String(value):value);}catch(e){}}
function sourcePreferences(){
 var value=get('xot_source_preferences',null),valid=function(id){return typeof id==='string'&&/^[a-z][a-z0-9_]{1,40}$/.test(id)&&id!=='all'&&id!=='anilibria';};
 if(!value||typeof value!=='object'||Array.isArray(value))return {order:[],disabled:['ufdub','rezka']};
 return {order:Array.isArray(value.order)?Array.from(new Set(value.order.filter(valid))).slice(0,50):[],disabled:Array.isArray(value.disabled)?Array.from(new Set(value.disabled.filter(valid))).slice(0,50):['ufdub','rezka']};
}
function sourceEnabled(id){return id==='all'||sourcePreferences().disabled.indexOf(id)<0;}
function orderedSources(list,includeDisabled){
 var preferences=sourcePreferences(),order=preferences.order.concat(list.map(function(s){return s.id;})).filter(function(id,i,a){return a.indexOf(id)===i;});
 return list.filter(function(s){return s.id!=='anilibria'&&(includeDisabled||sourceEnabled(s.id));}).slice().sort(function(a,b){return a.id==='all'?-1:b.id==='all'?1:order.indexOf(a.id)-order.indexOf(b.id);});
}
function title(card){return card&&(card.title||card.name||card.original_title||card.original_name)||'';}
function unwrap(value){
 if(!value||typeof value!=='object')return null;
 var candidates=[value.card,value.movie,value.data&&value.data.movie,value.data&&value.data.card,value.object&&value.object.card,value.object&&value.object.movie,value.data,value];
 for(var i=0;i<candidates.length;i++)if(candidates[i]&&title(candidates[i])&&!candidates[i].activity&&!candidates[i].component)return candidates[i];
 return null;
}
function activeCard(){try{var active=Lampa.Activity.active();return unwrap(active)||unwrap(active&&active.params);}catch(e){return null;}}
function names(card){
 var result=[];
 [card.title,card.name,card.original_title,card.original_name].concat(card.xot_search_titles||[],card.names||[],(card.alternative_titles&&card.alternative_titles.results||[]).concat(card.alternative_titles&&card.alternative_titles.titles||[]).map(function(x){return x.title||x.name;})).forEach(function(value){
  value=String(value||'').trim();if(value&&!result.some(function(x){return x.toLowerCase()===value.toLowerCase();}))result.push(value);
 });
 return result.slice(0,8);
}
function normalized(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[’`']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function matches(item,card){
 var year=Number(String(card.release_date||card.first_air_date||'').slice(0,4));
 if(year&&item.year&&year!==Number(item.year))return false;
 if(typeof item.series==='boolean'&&item.series!==Boolean(card.name||card.first_air_date||card.media_type==='tv'))return false;
 if(card.imdb_id&&item.imdb_id)return card.imdb_id===item.imdb_id;
 var expected=names(card).map(normalized);
 return [item.title,item.original_title].concat(item.alternative_titles||[]).filter(function(value){return typeof value==='string';}).map(normalized).some(function(value){return expected.indexOf(value)>=0;});
}
function publicPlayerSource(id){return ['eneyida','kinovezha','uaserials','ufdub','serialno'].indexOf(id)>=0;}
function voiceKey(item){return item.voice_id||item.translation||'Оригінал';}
function ukrainian(item){
 var language=String(item.language||item.lang||item.audio_language||'').toLowerCase();
 if(/^(?:uk|ua|ukr)(?:[-_]|$)|ukrainian/.test(language))return true;
 return /укра[їи]н|(?:^|[^a-zа-яієїґ])(?:укр|ukr|ua|uk)(?:$|[^a-zа-яієїґ])|ukrainian|🇺🇦/i.test(item.translation||'');
}
function voiceLanguage(item){
 if(ukrainian(item))return 'uk';
 var language=String(item.language||item.lang||item.audio_language||'').toLowerCase().split(/[-_]/)[0];
 if(/^(ru|rus|russian)$/.test(language)||/русск|російськ|\brussian\b/i.test(item.translation||''))return 'ru';
 if(/^(en|eng|english)$/.test(language)||/англійськ|английск|\benglish\b/i.test(item.translation||''))return 'en';
 return /^[a-z]{2,3}$/.test(language)?language:'';
}
function favoriteIdentity(item){
 var label=String(item.translation||item.title||'').replace(/\b(?:2160|1440|1080|720|480|360)p\+?|\b(?:4k|uhd|fhd|hdr10\+?|hdr|sdr)\b/gi,'');
 return normalized(label)+'|'+voiceLanguage(item);
}
function favoriteVoices(){
 var list=get('xot_favorite_voices',[]);if(!Array.isArray(list))return [];
 var seen=new Set();return list.filter(function(row){if(!row||typeof row.title!=='string'||!row.title.trim()||row.title.length>200||typeof row.language!=='string'||!/^(?:[a-z]{2,3})?$/.test(row.language))return false;var key=favoriteIdentity({translation:row.title,language:row.language});if(seen.has(key))return false;seen.add(key);return true;}).slice(0,20).map(function(row){return {title:row.title,language:row.language,key:favoriteIdentity({translation:row.title,language:row.language})};});
}
function favoriteVoice(items,order){
 var favorites=favoriteVoices(),found=items.filter(function(item){return favorites.some(function(row){return row.key===favoriteIdentity(item);});});
 found.sort(function(a,b){var ai=favorites.findIndex(function(row){return row.key===favoriteIdentity(a);}),bi=favorites.findIndex(function(row){return row.key===favoriteIdentity(b);});return ai-bi||order.indexOf(a.provider)-order.indexOf(b.provider);});
 return found[0]||null;
}
function seriesCard(card){return Boolean(card.name||card.first_air_date||card.media_type==='tv');}
function watchCardKey(card){
 var id=String(card.id||''),source=String(card.source||'tmdb').replace(/[^a-z0-9_-]/gi,'').slice(0,40)||'tmdb';
 return [source,seriesCard(card)?'tv':'movie',/^[a-z0-9_-]{1,80}$/i.test(id)?id:normalized(card.original_title||card.original_name||title(card)).slice(0,160)+'|'+String(card.release_date||card.first_air_date||'').slice(0,4)].join(':');
}
function watchHash(card,item){
 if(!Lampa.Utils||typeof Lampa.Utils.hash!=='function')return null;
 // Keep the original XOT hash so existing progress survives this update.
 return Lampa.Utils.hash(['xot',seriesCard(card)?'tv':'movie',card.id||card.original_title||title(card),item.season||0,item.episode||0].join(':'));
}
function watchProfile(){
 try{var name=Lampa.Timeline&&Lampa.Timeline.filename&&Lampa.Timeline.filename();return /^file_view(?:_[a-z0-9_-]+)?$/i.test(name)?name:'file_view';}catch(e){return 'file_view';}
}
function watchHistory(){
 var list=get('xot_watch_history_'+watchProfile(),[]);if(!Array.isArray(list))return [];
  return list.filter(function(row){return row&&typeof row.card==='string'&&row.card.length<=250&&Number.isFinite(row.season)&&row.season>=0&&row.season<=999&&Number.isFinite(row.episode)&&row.episode>=0&&row.episode<=100000&&Number.isFinite(row.updated)&&row.updated>=0;}).slice(0,200).map(function(row){return {card:row.card,season:row.season,episode:row.episode,updated:row.updated,provider:typeof row.provider==='string'?row.provider.slice(0,40):'',voice_id:typeof row.voice_id==='string'?row.voice_id.slice(0,240):'',translation:typeof row.translation==='string'?row.translation.slice(0,200):'',language:typeof row.language==='string'&&/^[a-z]{2,3}$/.test(row.language)?row.language:''};});
}
function rememberWatch(card,item){
 var key=watchCardKey(card),season=Number(item.season)||0,episode=Number(item.episode)||0;
 if(seriesCard(card)&&(!(season>0)||!(episode>0)))return;
 var row={card:key,season:season,episode:episode,provider:String(item.provider||'').slice(0,40),voice_id:String(voiceKey(item)).slice(0,240),translation:String(item.translation||'').slice(0,200),language:voiceLanguage(item),updated:Date.now()};
 var list=watchHistory().filter(function(old){return !(old.card===key&&old.season===season&&old.episode===episode);});
 try{set('xot_watch_history_'+watchProfile(),[row].concat(list).slice(0,200));}catch(e){}
}
function watchProgress(mark){
 mark=mark||{};var time=Number(mark.time),duration=Number(mark.duration),percent=Number(mark.percent),updated=Number(mark.updated);
 time=Number.isFinite(time)&&time>0?time:0;duration=Number.isFinite(duration)&&duration>0?duration:0;
 percent=Number.isFinite(percent)?Math.max(0,Math.min(100,percent)):0;
 if(duration&&time)percent=Math.max(percent,Math.min(100,time/duration*100));percent=Math.round(percent);
 return {time:duration?Math.min(time,duration):time,duration:duration,percent:percent,watched:percent>=90,unfinished:time>0&&percent<90,updated:Number.isFinite(updated)&&updated>0?updated:0};
}
function watchTime(value){
 value=Number(value);value=Number.isFinite(value)?Math.max(0,Math.floor(value)):0;var hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),seconds=value%60;
 return (hours?hours+':':'')+(hours?('0'+minutes).slice(-2):minutes)+':'+('0'+seconds).slice(-2);
}
function latestUnfinished(candidates){
 return candidates.filter(function(row){return row.progress.unfinished;}).sort(function(a,b){return Math.max(b.progress.updated,b.record&&b.record.updated||0)-Math.max(a.progress.updated,a.record&&a.record.updated||0)||(b.item.season||0)-(a.item.season||0)||(b.item.episode||0)-(a.item.episode||0);})[0]||null;
}
function chooseQuality(items,preferred){
 var quality={};items.forEach(function(item){if(media(item.url))quality[item.quality||'Авто']=item.url;});
 var keys=Object.keys(quality).sort(function(a,b){return (parseInt(b)||0)-(parseInt(a)||0);});
 var auto=keys.filter(function(k){return !parseInt(k);})[0];
 var key=preferred===0?(auto||keys[0]):keys.filter(function(k){return parseInt(k)>0&&parseInt(k)<=preferred;})[0]||auto||keys[keys.length-1];
 return {url:quality[key],quality:quality};
}
function episodeGroups(items,current){
 var groups=new Map();
 items.filter(function(item){return item.episode>0&&item.season>0&&item.provider===current.provider&&voiceKey(item)===voiceKey(current);}).forEach(function(item){var key=item.season+'|'+item.episode;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
 return Array.from(groups.values()).sort(function(a,b){return a[0].season-b[0].season||a[0].episode-b[0].episode;});
}
function groupSignature(items){
 var first=items[0];
 return JSON.stringify([first.season||0,first.episode||0,normalized(first.translation||voiceKey(first)),ukrainian(first)?'uk':String(first.language||first.lang||'').toLowerCase(),items.map(function(item){return [item.url||item.resolve_url,item.quality||'Авто',!!item.needs_resolve,item.available_qualities||[],item.audio_track||null,item.subtitle||null];}).sort(function(a,b){return JSON.stringify(a).localeCompare(JSON.stringify(b));})]);
}
function displayGroups(items,aggregate){
 var byVoice=new Map(),rows=[];
 items.forEach(function(item){var key=[item.provider,item.season||0,item.episode||0,voiceKey(item)].join('|');if(!byVoice.has(key))byVoice.set(key,[]);byVoice.get(key).push(item);});
 byVoice.forEach(function(group){
  var item=group[0],signature=aggregate?groupSignature(group):null;
  var existing=aggregate&&rows.find(function(row){return row.signature===signature&&row.providers.indexOf(item.provider)<0;});
  if(existing){existing.providers.push(item.provider);existing.names.push(item.xot_source_name||item.source||item.provider);}
  else rows.push({items:group,signature:signature,providers:[item.provider],names:[item.xot_source_name||item.source||item.provider]});
 });
 return rows;
}
function deliveryFamily(value){
 try{var host=new URL(value).hostname;if(/(?:^|\.)(?:hdvbua\.pro|tortuga\.(?:tw|wtf))$/.test(host))return 'hdvbua';if(/(?:^|\.)ufdub\.com$/.test(host))return 'ufdub';return host;}catch(e){return '';}
}
function backupGroups(items,current,blocked){
 var groups=new Map(),seen=new Set();
 items.filter(function(item){return streamItem(item)&&!blocked.has(deliveryFamily(item.url||item.resolve_url))&&(current.episode?item.season===current.season&&item.episode===current.episode:!item.episode);}).forEach(function(item){var key=item.provider+'|'+voiceKey(item);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
 return Array.from(groups.values()).filter(function(group){var key=group.map(function(item){return item.url||item.resolve_url;}).sort().join('|');if(seen.has(key))return false;seen.add(key);return true;});
}

function safeText(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function media(value){try{var u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&/\.(?:m3u8|mp4|mpd)(?:$|:hls:)/i.test(u.pathname);}catch(e){return false;}}
function streamItem(item){
 if(media(item.url))return true;
 if(item.provider!=='ufdub'||item.needs_resolve!==true||!/^\d{1,8}$/.test(String(item.post_id)))return false;
 try{var u=new URL(item.resolve_url),keys=Array.from(u.searchParams.keys());return u.origin==='https://ufdub.com'&&!u.username&&!u.password&&!u.hash&&u.pathname==='/video/VIDEOS.php'&&u.searchParams.get('ID')===String(item.post_id)&&/^[1-9]\d{0,4}$/.test(u.searchParams.get('POS')||'')&&Boolean(u.searchParams.get('Seriya'))&&keys.length===4&&new Set(keys).size===4&&keys.every(function(k){return ['ID','TAB','Seriya','POS'].indexOf(k)>=0;});}catch(e){return false;}
}
function identity(){
 var id=get('xot_filmix_device_id','');if(/^[a-f0-9]{32}$/.test(id))return id;
 var bytes=new Uint8Array(16);
 if(window.crypto&&window.crypto.getRandomValues)window.crypto.getRandomValues(bytes);else for(var i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);
 id=Array.prototype.map.call(bytes,function(n){return ('0'+n.toString(16)).slice(-2);}).join('');set('xot_filmix_device_id',id);return id;
}
function preferredSource(card){
 var saved=get('xot_native_last_sources',{}),id=saved[card.id];
 if(['uakino','anilibria'].indexOf(id)>=0||!sourceEnabled(id))return 'all';
 return typeof id==='string'&&/^[a-z][a-z0-9_]{1,40}$/.test(id)?id:'all';
}
function readableError(error){
 var code=error&&error.message||String(error||'');
 var eneyidaErrors={eneyida_movie_mismatch:'Сторінка Eneyida не відповідає вибраному фільму. Уточни назву через пошук угорі.',eneyida_access_denied:'Eneyida обмежила доступ. Спробуй інший балансер.',eneyida_timeout:'Eneyida не відповіла вчасно.',eneyida_player_not_found:'На сторінці Eneyida не знайдено доступного плеєра.',eneyida_player_format:'Eneyida змінила формат плеєра.',eneyida_invalid_playlist:'Eneyida не повернула придатного відеоплейліста.',eneyida_stream_unavailable:'Для цього фільму або серії Eneyida не повернула відео.',eneyida_unsupported_stream:'Цей формат відео Eneyida поки не підтримується.',eneyida_unavailable:'Eneyida зараз недоступна. Повтори запит або вибери інший балансер.'};
 var publicError=code.match(/^(kinovezha|uaserials|ufdub|serialno)_(.+)$/);
 if(publicError){var name={kinovezha:'KinoVezha',uaserials:'UASerials',ufdub:'UFDub',serialno:'Serialno'}[publicError[1]];return (eneyidaErrors['eneyida_'+publicError[2]]||'Eneyida не відповіла коректно. Повтори запит або вибери інший балансер.').replace(/Eneyida/g,name);}
 if(eneyidaErrors[code])return eneyidaErrors[code];
 var errors={anilibria_unavailable:'AniLibria зараз недоступна. Спробуй інший балансер.',anilibria_timeout:'AniLibria не відповіла вчасно.',anilibria_restricted:'AniLibria обмежила доступ до цього релізу.',anilibria_invalid_response:'AniLibria змінила формат відповіді.',filmix_unavailable:'Filmix зараз недоступний. Перемкни балансер або повтори пошук.',filmix_timeout:'Filmix не відповів вчасно.',filmix_http_403:'Filmix обмежив доступ.',filmix_http_401:'Filmix відхилив авторизацію. Від’єднай пристрій або перевір акаунт.',filmix_invalid_json:'Filmix повернув невідомий формат відповіді.',rezka_access_denied:'HDRezka повернула 403 або обмеження доступу. Спробуй інший балансер.',rezka_mirror_redirect:'Адреса HDRezka змінилася. Потрібно оновити адресу джерела на сервері.',rezka_player_not_found:'На сторінці HDRezka не знайдено доступного плеєра.',rezka_stream_unavailable:'Це відео або озвучення HDRezka зараз недоступне.',rezka_timeout:'HDRezka не відповіла вчасно.',rezka_unavailable:'Не вдалося з’єднатися з HDRezka.',rezka_unsupported_stream_format:'HDRezka змінила формат відповіді плеєра.',request_timeout:'Сервер не відповів вчасно. Повтори запит.',invalid_response:'Сервер повернув некоректну відповідь.'};
 return errors[code]||'Джерело не відповіло коректно ('+code.slice(0,70)+').';
}
function jsonRequest(path,body,signal){
 var options={signal:signal};
 if(body){options.method='POST';options.headers={'Content-Type':'application/json'};options.body=JSON.stringify(body);}
 return fetch(API_BASE+path,options).then(function(response){return response.json().catch(function(){throw Error('invalid_response');}).then(function(data){if(!response.ok||data.error)throw Error(data.error||'http_'+response.status);return data;});});
}
function request(source,action,data,signal){
 var body=Object.assign({},data||{},{action:action});
 if(source==='filmix'){
  body.device_id=identity();
  if(body.device_token===undefined)body.device_token=get('xot_filmix_device_token','');
 }
 return jsonRequest('/api/'+source,body,signal);
}
function cachedSearch(source,payload,signal){
 // Session memory only: cache catalog metadata, never post/stream URLs, failures
 // or authenticated Filmix responses. Account tokens never enter cache keys.
 var cacheable=source!=='filmix'||!get('xot_filmix_device_token','');
 var key=JSON.stringify([API_BASE,source,payload.title,payload.movie||null]),entry=cacheable&&searchCache.get(key);
 if(entry&&entry.until>Date.now())return Promise.resolve({data:JSON.parse(entry.data),cached:true});
 if(entry)searchCache.delete(key);
 return request(source,'search',payload,signal).then(function(data){
  if(cacheable&&!(signal&&signal.aborted)&&Array.isArray(data.results)&&data.results.length<=200){
   var metadata={results:data.results.map(function(item){var clean={};['id','path','title','original_title','year','series','imdb_id'].forEach(function(field){if(['string','number','boolean'].indexOf(typeof item[field])>=0)clean[field]=item[field];});if(Array.isArray(item.alternative_titles))clean.alternative_titles=item.alternative_titles.filter(function(v){return typeof v==='string';}).slice(0,20);return clean;})},encoded=JSON.stringify(metadata);
   if(encoded.length<=150000){searchCache.set(key,{until:Date.now()+(metadata.results.length?300000:60000),data:encoded});while(searchCache.size>80)searchCache.delete(searchCache.keys().next().value);}
  }
  return {data:data,cached:false};
 });
}
function closeSelect(){if(window.jQuery('body').hasClass('selectbox--open')&&Lampa.Select.close)Lampa.Select.close();}
function select(items,heading,done,back){
 Lampa.Select.show({title:heading,items:items,onSelect:function(item){closeSelect();done(item);},onBack:back});
}
function registerScreen(){
 if(window.__XOT_COMPONENT_READY__)return true;
 if(!Lampa.Component||!Lampa.Component.add||typeof window.jQuery!=='function')return false;
 Lampa.Component.add('xot_online',function(params){
  var self=this,$=window.jQuery,card=params.movie,files=new Lampa.Explorer(params),scroll=new Lampa.Scroll({mask:true,over:true}),filter=new Lampa.Filter(params);
  var sources=BASE_SOURCES.slice(),sourceId=params.xot_source||preferredSource(card),query=params.search||title(card),manual=false;
  var providerController=new AbortController(),providerTimer=null,voiceButton=null,allGroups=[],playbackRequest=null,playbackSerial=0,owner='xot_'+(++screenCounter),playingOwned=false,advancing=false;
  var backupContext=null,bootTimer=null,lastPosition=0,backupEpisode='',failedFamilies=new Set(),postVerified=true,singleDiagnostic=null,sourceSettingsDirty=false;
  var progressTimer=null,progressDirty=false,watchHashes=new Set(),ownedWork=null,watchStarted=false,lastWatchSave=0;
  var state='loading',destroyed=false,created=false,serial=0,controller=null,deadline=null,last=null,candidates=[],streams=[],unavailable=[],qualityCap=null,post=null,rezkaVoice=null,episodeList=[],season=null,voice=null,pairing=null;
  if(!sources.some(function(s){return s.id===sourceId;})||!sourceEnabled(sourceId))sourceId='all';
  function source(){return sources.filter(function(s){return s.id===sourceId;})[0]||sources[0];}
  function current(token){return !destroyed&&token===serial;}
  function active(){try{return Lampa.Activity.active().activity===self.activity;}catch(e){return false;}}
  function focus(){if(!active())return;Lampa.Controller.collectionSet(files.render(),files.render());Lampa.Controller.collectionFocus(last||false,files.render());}
  function cancelPlayback(){playbackSerial++;if(playbackRequest){playbackRequest.controller.abort();clearTimeout(playbackRequest.timer);playbackRequest=null;}}
  function cancelBackup(){if(backupContext){backupContext.controller.abort();clearTimeout(backupContext.timer);backupContext=null;}clearTimeout(bootTimer);}
  function stopRequests(){serial++;if(controller)controller.abort();clearTimeout(deadline);controller=null;cancelPlayback();cancelBackup();}
  function begin(){
   stopRequests();controller=new AbortController();
   var token=serial;
   deadline=setTimeout(function(){if(current(token)){
    if(sourceId==='all'){
     if(controller)controller.abort();allGroups.forEach(function(g){if(g.status==='loading'){g.status='error';g.error=Error('request_timeout');}});finish();refreshAggregate();
    }else{stopRequests();showError(Error('request_timeout'));}
   }},24000);
   return {token:token,signal:controller.signal};
  }
  function finish(){clearTimeout(deadline);if(self.activity)self.activity.loader(false);}
  function clear(){last=null;scroll.clear();if(scroll.reset)scroll.reset();}
  function bind(node,action){
   var time=0;
   node.on('hover:focus',function(){last=node[0];if(scroll.update)scroll.update(node,true);});
   node.on('hover:enter click',function(){var now=Date.now();if(now-time<450)return;time=now;action();});
   return node;
  }
  function line(head,note,action,playable){
   var row=$('<div class="selector xot-native-row" tabindex="0"></div>');
   $('<div class="xot-native-row__title"></div>').text((playable?'▶  ':'')+head).appendTo(row);
   if(note)$('<div class="xot-native-row__note"></div>').text(note).appendTo(row);
   if(action){bind(row,action);if(!last)last=row[0];}else row.removeClass('selector');
   scroll.append(row);return row;
  }
  function listedItems(){return sourceId==='all'?streams:streams.concat(unavailable);}
  function voiceItems(){
   if(sourceId==='rezka')return (post&&post.translations||[]).map(function(v){return {id:v.id,title:v.title,rezka:v};});
   return Array.from(new Map(listedItems().filter(function(item){return !season||!item.season||item.season===season;}).map(function(item){return [selectionVoice(item),{id:selectionVoice(item),title:(sourceId==='all'?(item.xot_source_name||item.source||item.provider)+' · ':'')+(item.translation||'Оригінал')}];})).values());
  }
  function selectionVoice(item){return (sourceId==='all'?item.provider+'|':'')+voiceKey(item);}
  function voicePreferenceKey(){return [card.name||card.first_air_date?'tv':'movie',card.id||card.original_title||title(card),sourceId].join(':');}
  function saveVoice(){
   var saved=get('xot_native_voices',{}),selected=voiceItems().filter(function(v){return v.id===voice;})[0];
   saved[voicePreferenceKey()]=selected?{id:selected.id,title:selected.title}:null;
   var keys=Object.keys(saved);if(keys.length>200)delete saved[keys[0]];set('xot_native_voices',saved);
  }
  function restoreVoice(){
   var stored=get('xot_native_voices',{}),saved=stored[voicePreferenceKey()],options=voiceItems();
   if(Object.prototype.hasOwnProperty.call(stored,voicePreferenceKey())&&saved===null){voice=null;return;}
   var found=saved&&options.filter(function(v){return v.id===saved.id&&v.title===saved.title;})[0];
   if(!found&&saved)found=options.filter(function(v){return v.title===saved.title;})[0];
   var available=streams.filter(function(item){return !season||!item.season||item.season===season;}),preferred=!Object.prototype.hasOwnProperty.call(stored,voicePreferenceKey())&&favoriteVoice(available,orderedSources(sources).map(function(s){return s.id;}));
   var ua=available.filter(ukrainian)[0];
   voice=found?found.id:preferred?selectionVoice(preferred):get('xot_prefer_ukrainian',true)&&ua?(sourceId==='all'?'__uk__':selectionVoice(ua)):null;
  }
  function chooseVoice(){
   var options=voiceItems();if(!options.length)return notify('Спочатку дочекайся завантаження озвучень.');
   if(sourceId==='rezka')return select(options.map(function(v){return {title:safeText(v.title),voice:v.rezka,selected:rezkaVoice&&rezkaVoice.id===v.id};}),'Озвучення',function(v){if(post.series)chooseRezkaVoice(v.voice);else loadRezkaStream(v.voice,null,null);},self.start);
   var favorites=favoriteVoices(),automatic=!Object.prototype.hasOwnProperty.call(get('xot_native_voices',{}),voicePreferenceKey())&&(favorites.length||get('xot_prefer_ukrainian',true));
   return select([{title:favorites.length?'Автовибір: улюблені, потім українська':'Автовибір української',value:'__auto__',selected:!!automatic},{title:'Усі озвучення',value:null,selected:!voice&&!automatic},{title:'Улюблені озвучення · налаштувати',favorites:true}].concat(options.map(function(v){return {title:safeText(v.title),value:v.id,selected:v.id===voice&&!automatic};})),'Озвучення',function(v){
    if(v.favorites)return manageFavoriteVoices();
    if(v.value==='__auto__'){var saved=get('xot_native_voices',{});delete saved[voicePreferenceKey()];set('xot_native_voices',saved);set('xot_prefer_ukrainian',true);restoreVoice();}else{voice=v.value;saveVoice();}drawStreams();
   },self.start);
  }
  function applyFavorites(list){
   try{set('xot_favorite_voices',list.map(function(row){return {title:row.title,language:row.language};}));}catch(e){return notify('Не вдалося зберегти улюблені озвучення.');}
   if(sourceId==='rezka'){
    if(post&&!Object.prototype.hasOwnProperty.call(get('xot_native_voices',{}),voicePreferenceKey())){var preferred=favoriteVoice((post.translations||[]).map(function(v){return {voice_id:v.id,translation:v.title};}),[]);if(preferred&&preferred.voice_id!==(rezkaVoice&&rezkaVoice.id)){var option=post.translations.find(function(v){return v.id===preferred.voice_id;});if(post.series)return chooseRezkaVoice(option,false);voice=option.id;rezkaVoice=option;}}
    if(state==='episodes')drawEpisodes();else if(state==='translations')drawRezkaVoices();else updateFilter();
   }else{restoreVoice();if(state==='streams')drawStreams();else updateFilter();}
  }
  function manageFavoriteVoices(){
   var list=favoriteVoices(),labels={uk:'українська',ru:'російська',en:'англійська'};
   select(list.map(function(row,i){return {title:(i+1)+'. '+safeText(row.title),subtitle:labels[row.language]||row.language,index:i};}).concat([{title:'Додати з озвучень цієї картки',add:true}]).concat(list.length?[{title:'Очистити список',clear:true}]:[]).concat([{title:'Готово',done:true}]),'Улюблені озвучення · усі картки',function(option){
    if(option.done)return self.start();if(option.clear){applyFavorites([]);return manageFavoriteVoices();}
    if(option.add){
     var current=sourceId==='rezka'?(post&&post.translations||[]).map(function(v){return {translation:v.title};}):streams,seen=new Set();
     var available=current.filter(function(item){var key=favoriteIdentity(item);if(!item.translation||seen.has(key)||list.some(function(row){return row.key===key;}))return false;seen.add(key);return true;});
     if(!available.length){notify('Нових доступних озвучень у цій картці немає.');return manageFavoriteVoices();}
     return select(available.map(function(item){return {title:safeText(item.translation),subtitle:labels[voiceLanguage(item)]||voiceLanguage(item),item:item};}),'Додати улюблене озвучення',function(row){if(list.length>=20){notify('У списку вже 20 озвучень.');return manageFavoriteVoices();}applyFavorites(list.concat({title:row.item.translation,language:voiceLanguage(row.item)}));manageFavoriteVoices();},manageFavoriteVoices);
    }
    var index=option.index,actions=[];if(index>0)actions.push({title:'Перемістити вище',move:-1});if(index<list.length-1)actions.push({title:'Перемістити нижче',move:1});actions.push({title:'Прибрати зі списку',remove:true},{title:'Назад',back:true});
    select(actions,safeText(list[index].title),function(action){if(action.back)return manageFavoriteVoices();var entry=list.splice(index,1)[0];if(!action.remove)list.splice(index+action.move,0,entry);applyFavorites(list);manageFavoriteVoices();},manageFavoriteVoices);
   },self.start);
  }
  function retrySearch(){searchCache.clear();lookup();}
  function saveSources(preferences){
   set('xot_source_preferences',preferences);
   if(!sourceEnabled(sourceId)){sourceId='all';params.xot_source='all';}
   sourceSettingsDirty=true;stopRequests();updateFilter();
  }
  function finishSourceSettings(){if(sourceSettingsDirty){sourceSettingsDirty=false;lookup();}else self.start();}
  function manageSources(){
   var list=orderedSources(sources,true).filter(function(s){return s.id!=='all';});
   select(list.map(function(s,i){return {title:(sourceEnabled(s.id)?'✓ ':'○ ')+(i+1)+'. '+s.title,subtitle:sourceEnabled(s.id)?'Увімкнено':'Вимкнено',source:s};}).concat([{title:'Відновити початковий порядок і вибір',reset:true},{title:'Готово',done:true}]),'Налаштування балансерів',function(item){
    if(item.done)return finishSourceSettings();
    if(item.reset){set('xot_source_preferences',null);saveSources(sourcePreferences());return manageSources();}
    var which=item.source,index=list.findIndex(function(s){return s.id===which.id;});
    var actions=[{title:sourceEnabled(which.id)?'Вимкнути джерело':'Увімкнути джерело',action:'toggle'}];
    if(index>0)actions.push({title:'Перемістити вище',action:'up'});
    if(index<list.length-1)actions.push({title:'Перемістити нижче',action:'down'});
    actions.push({title:'Назад до списку',action:'back'});
    select(actions,which.title,function(option){
     if(option.action==='back')return manageSources();
     var preferences=sourcePreferences();
     if(option.action==='toggle')preferences.disabled=sourceEnabled(which.id)?preferences.disabled.concat(which.id):preferences.disabled.filter(function(id){return id!==which.id;});
     else {var order=list.map(function(s){return s.id;}),next=index+(option.action==='up'?-1:1);order.splice(index,1);order.splice(next,0,which.id);preferences.order=order;}
     saveSources(preferences);manageSources();
    },manageSources);
   },finishSourceSettings);
  }
  function diagnosticStatus(group){
   if(group.status==='disabled')return 'Вимкнено в налаштуваннях';
   if(group.status==='skipped')return 'Джерело лише для серіалів';
   if(group.status==='loading')return group.phase==='post'?'Отримуємо відео…':'Пошук…';
   if(group.status==='error')return readableError(group.error);
   if(group.status==='ambiguous')return 'Знайдено кілька збігів — потрібен ручний вибір';
   if(group.status==='ready')return 'Знайдено варіантів: '+(group.count||0);
   if(group.status==='open')return 'Знайдено озвучення; відео ще не перевірено';
   if(group.reason==='locked')return 'Збіг є, доступного відео немає';
   if(group.reason==='mismatch')return 'Результати не відповідають назві, року або типу картки';
   return 'Пошук не повернув підтвердженого збігу';
  }
  function showDiagnostics(){
   var groups=sourceId==='all'?allGroups:singleDiagnostic?[singleDiagnostic]:[];
   var rows=groups.map(function(group){
    var extra=group.cache_hits?' · кеш пошуку':'';
    return {title:safeText(group.source.title+' · '+diagnosticStatus(group)),subtitle:safeText((group.queries||[]).join(' / ')+extra),group:group};
   });
   select(rows.concat([{title:'Повторити пошук без кешу',retry:true},{title:'Налаштування балансерів',settings:true}]),'Діагностика пошуку',function(item){
    if(item.retry)return retrySearch();if(item.settings)return manageSources();
    var group=item.group;
    select([{title:safeText(diagnosticStatus(group)),info:true}].concat(sourceEnabled(group.source.id)&&group.status!=='skipped'?[{title:'Відкрити '+group.source.title,open:true}]:[]).concat([{title:'Назад до діагностики',back:true}]),group.source.title,function(option){if(option.open)return self.changeSource(group.source.id);showDiagnostics();},showDiagnostics);
   },self.start);
  }
  function updateFilter(){
   filter.set('sort',orderedSources(sources).map(function(s){return {title:s.title,id:s.id,selected:s.id===sourceId};}));
   filter.render().find('.filter--sort span').text('Балансер');filter.chosen('sort',[source().title]);
   var controls=[{title:'Повторити пошук',action:'retry'}];
   controls.push({title:'Налаштування балансерів',action:'sources'});
   controls.push({title:'Діагностика пошуку',action:'diagnostics'});
   controls.push({title:'Улюблені озвучення',action:'favorite_voices'});
   controls.push({title:'Бажана якість: '+qualityPreference()+'p',action:'quality'});
   controls.push({title:'Українська автоматично: '+(get('xot_prefer_ukrainian',true)?'увімкнено':'вимкнено'),action:'ukrainian'});
   if(candidates.length>1)controls.push({title:'Вибрати інший збіг',action:'candidates'});
   var seasons=sourceId==='rezka'?episodeList.map(function(s){return s.season;}):Array.from(new Set(listedItems().map(function(s){return s.season;}).filter(Boolean))).sort(function(a,b){return a-b;});
   if(seasons.length)controls.push({title:'Сезон '+(season||seasons[0]),action:'season',seasons:seasons});
   var options=voiceItems();
   if(options.length)controls.push({title:'Озвучення: '+(voice==='__uk__'?'українська · авто':sourceId==='rezka'?rezkaVoice&&rezkaVoice.title||'обрати':(options.filter(function(v){return v.id===voice;})[0]||{}).title||'усі'),action:'voice'});
   if(voiceButton){
    var selected=sourceId==='rezka'?rezkaVoice&&rezkaVoice.title:(options.filter(function(v){return v.id===voice;})[0]||{}).title;
    voiceButton.toggleClass('hide',!options.length).toggleClass('selector',!!options.length);
    voiceButton.find('div').text(voice==='__uk__'?'Українська · авто':selected||'Усі · '+options.length);
   }
   if(sourceId==='filmix'){
    controls.push({title:'Filmix · прив’язати пристрій за кодом',action:'pair'});
    if(get('xot_filmix_device_token',''))controls.push({title:'Filmix · від’єднати пристрій',action:'logout'});
   }
   filter.set('filter',controls);
  }
  function showError(error){
   if(destroyed)return;finish();state='error';clear();
   if(singleDiagnostic){singleDiagnostic.status='error';singleDiagnostic.error=error;}
   line(source().title+' · джерело недоступне',readableError(error));
   line('Повторити запит','Пошук у вибраному джерелі',retrySearch);
   line('Вибрати інший балансер',orderedSources(sources).map(function(s){return s.title;}).join(', '),function(){filter.show('Балансер','sort');});
   if(sourceId==='filmix'&&get('xot_filmix_device_token',''))line('Спробувати без акаунта','Видалити локальний токен Filmix і виконати анонімний пошук',function(){set('xot_filmix_device_token','');lookup();});
   updateFilter();self.start();
  }
  function loading(message){state='loading';clear();line(message||'Пошук у '+source().title+'…','');if(self.activity)self.activity.loader(true);updateFilter();}
  function showCandidates(){
   stopRequests();state='candidates';clear();
   if(singleDiagnostic&&singleDiagnostic.status!=='skipped'){singleDiagnostic.status=candidates.length?'ambiguous':'empty';singleDiagnostic.count=candidates.length;}
   if(!candidates.length){line(manual?'Нічого не знайдено':'Не знайдено підтвердженого збігу','Уточни назву через пошук угорі або вибери інший балансер.');line('Повторити пошук','',retrySearch);}
   candidates.forEach(function(item){line(item.title+(item.year?' ('+item.year+')':''),item.original_title||'Відкрити озвучення і серії',function(){openPost(item);});});
   finish();updateFilter();self.start();
  }
  function searchSource(which,operation){
   if(which.kind==='catalog'){
    var p=new URLSearchParams({title:query,provider:which.id});
    if(!manual)names(card).filter(function(n){return n!==query;}).forEach(function(n){p.append('alt',n);});
    if(card.release_date||card.first_air_date)p.set('year',String(card.release_date||card.first_air_date).slice(0,4));
    if(card.id)p.set('tmdb_id',card.id);
    return jsonRequest('/api/search?'+p,null,operation.signal).then(function(data){
     var failed=(data.provider_status||[]).filter(function(s){return !s.ok;});
     if(!(data.results||[]).length&&failed.length)throw Error(failed[0].error);
     return {catalog:data.results||[],search:{queries:[query],cache_hits:0}};
    });
   }else{
    var queries=manual?[query]:names(card).slice(0,4);
    return Promise.all(queries.map(function(name){var payload={title:name};if((which.id==='rezka'||publicPlayerSource(which.id))&&!manual)payload.movie={titles:names(card),year:String(card.release_date||card.first_air_date||'').slice(0,4),series:Boolean(card.name||card.first_air_date||card.media_type==='tv')};return cachedSearch(which.id,payload,operation.signal).then(function(result){return {items:result.data.results||[],cached:result.cached};}).catch(function(error){return {error:error};});})).then(function(groups){
     var values=[],seen={};
     groups.forEach(function(g){(g.items||[]).forEach(function(item){if(!seen[item.id]){seen[item.id]=true;values.push(item);}});});
     if(!values.length&&groups.some(function(g){return g.error;}))throw groups.filter(function(g){return g.error;})[0].error;
     var rawCount=values.length;values=values.filter(function(item){return manual||matches(item,card);});
     values.sort(function(a,b){return Number(matches(b,card))-Number(matches(a,card));});
     return {candidates:values,search:{queries:queries,cache_hits:groups.filter(function(g){return g.cached;}).length,raw_count:rawCount,reason:rawCount&&!values.length?'mismatch':null}};
    });
   }
  }
  function postPayload(item,which,force){
   var payload={id:item.id,path:item.path};
   if(publicPlayerSource(which.id)&&(!manual||force))payload.movie={titles:names(card),year:String(card.release_date||card.first_air_date||'').slice(0,4),series:Boolean(card.name||card.first_air_date||card.media_type==='tv')};
   return payload;
  }
  function rememberAliases(which,exact){
   if(which.id!=='filmix')return;
   var aliases=card.xot_search_titles||[];exact.forEach(function(item){[item.title,item.original_title].forEach(function(name){if(name&&aliases.indexOf(name)<0)aliases.push(name);});});card.xot_search_titles=aliases.slice(0,8);
  }
  function refreshAggregate(){
   if(destroyed||sourceId!=='all')return;
   if(!allGroups.some(function(g){return g.status==='loading';}))finish();
   restoreVoice();
   if(!playbackRequest&&!(Lampa.Player.opened&&Lampa.Player.opened()))drawStreams();
  }
  function lookupAll(operation){
   allGroups=orderedSources(sources,true).filter(function(which){return which.id!=='all';}).map(function(which){return {source:which,status:!sourceEnabled(which.id)?'disabled':which.seriesOnly&&!Boolean(card.name||card.first_air_date||card.media_type==='tv')?'skipped':'loading',queries:manual?[query]:names(card).slice(0,4)};});
   allGroups.forEach(function(group){
    if(group.status!=='loading')return;
    var which=group.source;
    searchSource(which,operation).then(function(data){
     if(!current(operation.token)||group.status!=='loading')return null;
     Object.assign(group,data.search||{});
     if(data.catalog)return {items:data.catalog.filter(function(item){return matches(item,card);})};
     var exact=(data.candidates||[]).filter(function(item){return matches(item,card);});rememberAliases(which,exact);
     if(exact.length!==1){group.status=exact.length>1||manual&&data.candidates.length?'ambiguous':'empty';return null;}
     group.phase='post';return request(which.id,'post',postPayload(exact[0],which),operation.signal);
    }).then(function(data){
     if(!current(operation.token))return;
     if(data&&group.status==='loading'){
      group.data=data;
      if(which.id==='rezka'){group.status='open';}
      else{
       var found=(data.items||[]).filter(streamItem).map(function(item){return Object.assign({},item,{provider:which.id,xot_source_name:which.title});});
       var locked=(data.unavailable||[]).map(function(item){return Object.assign({},item,{provider:which.id,xot_source_name:which.title,quality_cap:data.quality_cap});});
       streams=streams.concat(found);unavailable=unavailable.concat(locked);group.count=new Set(found.map(function(item){return [item.season,item.episode,voiceKey(item)].join('|');})).size;
       group.status=found.length?'ready':'empty';
       if(!found.length&&locked.length)group.reason='locked';
      }
     }
     refreshAggregate();
    }).catch(function(error){if(current(operation.token)&&group.status==='loading'){group.status='error';group.error=error;refreshAggregate();}});
   });
   drawStreams();
  }
  function lookup(){
   var operation=begin(),which=source();candidates=[];streams=[];unavailable=[];qualityCap=null;post=null;rezkaVoice=null;episodeList=[];season=null;voice=null;allGroups=[];
   singleDiagnostic=which.id==='all'?null:{source:which,status:'loading',queries:manual?[query]:names(card).slice(0,4)};
   postVerified=true;loading('Пошук у '+which.title+'…');
   if(which.id==='all')return lookupAll(operation);
   if(which.seriesOnly&&!Boolean(card.name||card.first_air_date||card.media_type==='tv')){singleDiagnostic.status='skipped';clear();state='candidates';line(which.title+' · лише серіали','Для цього фільму вибери «Усі джерела» або інший балансер.');finish();updateFilter();self.start();return;}
   searchSource(which,operation).then(function(data){
    if(!current(operation.token))return;finish();
    Object.assign(singleDiagnostic,data.search||{});
    if(data.catalog){streams=data.catalog.filter(function(x){return media(x.url);});singleDiagnostic.status=streams.length?'ready':'empty';singleDiagnostic.count=streams.length;state='streams';drawStreams();return;}
    candidates=data.candidates;var exact=candidates.filter(function(item){return matches(item,card);});
    rememberAliases(which,exact);
    if(exact.length===1)return openPost(exact[0]);
    showCandidates();
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function openPost(item){
   var operation=begin();postVerified=matches(item,card);loading('Завантажуємо озвучення '+source().title+'…');
   if(singleDiagnostic){singleDiagnostic.status='loading';singleDiagnostic.phase='post';}
   request(sourceId,'post',postPayload(item,source()),operation.signal).then(function(data){
    if(!current(operation.token))return;finish();post=data;post.title=data.title||item.title;
    if(sourceId!=='rezka'){streams=(data.items||[]).filter(streamItem);unavailable=data.unavailable||[];qualityCap=data.quality_cap||null;if(singleDiagnostic){singleDiagnostic.status=streams.length?'ready':'empty';singleDiagnostic.count=displayGroups(streams,false).length;if(!streams.length&&unavailable.length)singleDiagnostic.reason='locked';}restoreVoice();state='streams';drawStreams();}
    else{
     if(singleDiagnostic)singleDiagnostic.status='open';
     var saved=get('xot_native_voices',{})[voicePreferenceKey()],options=data.translations||[];
     var preferred=saved&&options.filter(function(v){return v.id===saved.id&&v.title===saved.title;})[0];
     if(!Object.prototype.hasOwnProperty.call(get('xot_native_voices',{}),voicePreferenceKey())){var favorite=favoriteVoice(options.map(function(v){return {voice_id:v.id,translation:v.title};}),[]);if(favorite)preferred=options.find(function(v){return v.id===favorite.voice_id;});}
     if(!preferred&&get('xot_prefer_ukrainian',true))preferred=options.filter(function(v){return ukrainian({translation:v.title});})[0];
     voice=preferred?preferred.id:null;rezkaVoice=preferred||null;
     if(data.series)chooseRezkaVoice(preferred||options[0],false);else{state='translations';drawRezkaVoices();}
    }
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function drawRezkaVoices(){
   clear();state='translations';
   appendContinue();
   (post.translations||[]).filter(function(v){return !voice||v.id===voice;}).forEach(function(v){watchRow(line(v.title,'Обрати якість відео',function(){loadRezkaStream(v,null,null);},true),{provider:'rezka',translation:v.title});});
   if(!post.translations.length)line('Озвучень не знайдено','Перевір інший балансер.');
   finish();updateFilter();self.start();
  }
  function chooseRezkaVoice(v,manualChoice){
   if(!v)return showError(Error('rezka_stream_unavailable'));
   var operation=begin();rezkaVoice=v;voice=v.id;if(manualChoice!==false)saveVoice();loading('Завантажуємо серії…');
   request('rezka','episodes',{id:post.id,translator_id:v.id},operation.signal).then(function(data){
    if(!current(operation.token))return;finish();episodeList=data.seasons||[];
    if(!episodeList.some(function(s){return s.season===season;}))season=episodeList[0]&&episodeList[0].season;
    state='episodes';drawEpisodes();
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function drawEpisodes(){
   clear();state='episodes';var group=episodeList.filter(function(s){return s.season===season;})[0];
   appendContinue();
   if(!group)line('Серій не знайдено','Спробуй інше озвучення або балансер.');
   else group.episodes.forEach(function(n){watchRow(line('Серія '+n,rezkaVoice.title,function(){loadRezkaStream(rezkaVoice,season,n);},true),{provider:'rezka',season:season,episode:n,translation:rezkaVoice.title});});
   finish();updateFilter();self.start();
  }
  function loadRezkaStream(v,s,e){
   var operation=begin(),previous=post.series?'episodes':'translations';rezkaVoice=v;voice=v.id;if(!post.series)saveVoice();loading('Отримуємо відео…');
   request('rezka','stream',Object.assign({},v,{id:post.id,translator_id:v.id,title:post.title,translation:v.title,series:post.series,season:s,episode:e,favs:post.favs||''}),operation.signal).then(function(data){
    if(!current(operation.token))return;finish();state=previous;
    var items=(data.items||[]).filter(function(item){return media(item.url);});
    if(!items.length){notify('HDRezka: відтворюваних потоків не знайдено');return previous==='episodes'?drawEpisodes():drawRezkaVoices();}
    if(previous==='episodes')drawEpisodes();else drawRezkaVoices();
    playGroup(items);
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function drawStreams(){
   clear();state='streams';
   var seasons=Array.from(new Set(listedItems().map(function(s){return s.season;}).filter(Boolean))).sort(function(a,b){return a-b;});
   if(seasons.length&&!seasons.includes(season))season=seasons[0];
   if(voice&&voice!=='__uk__'&&!voiceItems().some(function(v){return v.id===voice;}))restoreVoice();
   var scoped=streams.filter(function(item){return (!seasons.length||item.season===season)&&(!voice||voice==='__uk__'?(!voice||ukrainian(item)):selectionVoice(item)===voice);});
   var order=orderedSources(sources).map(function(s){return s.id;});
   scoped.sort(function(a,b){return order.indexOf(a.provider)-order.indexOf(b.provider)||(a.season||0)-(b.season||0)||(a.episode||0)-(b.episode||0);});
   var groups=displayGroups(scoped,sourceId==='all');
   var locked=sourceId==='all'?[]:unavailable.filter(function(item){return (!seasons.length||item.season===season)&&(!voice||voice==='__uk__'?(!voice||ukrainian(item)):selectionVoice(item)===voice);});
   var pending=sourceId==='all'&&allGroups.some(function(g){return g.status==='loading';});
   var opened=sourceId==='all'?allGroups.filter(function(group){return group.status==='open'&&group.data&&group.data.translations&&group.data.translations.length;}):[];
   appendContinue();
   if(!groups.length&&!locked.length&&!opened.length){
    if(pending)line('Шукаємо джерела…','Знайдені варіанти з’являтимуться тут.');
    else if(sourceId==='all'&&!streams.length){line('Доступних джерел не знайдено',orderedSources(sources).length>1?'Спробуй повторити пошук або вибрати балансер угорі.':'Увімкни джерела у Фільтр → Налаштування балансерів.');line('Повторити пошук','',retrySearch);}
    else line('Немає доступних потоків','Спробуй інший балансер, сезон або озвучення.');
   }
   groups.forEach(function(group){var items=group.items,first=items[0],qualities=items.reduce(function(all,x){return all.concat(x.available_qualities||[x.quality]);},[]).filter(function(v,i,a){return a.indexOf(v)===i;});
    watchRow(line((sourceId==='all'?group.names.join(' / ')+' · ':'')+(first.episode?'Серія '+first.episode+' · ':'')+(first.translation||'Оригінал'),qualities.join(' · '),function(){playGroup(items);},true),first);
   });
   locked.forEach(function(item){
    var note=item.reason==='quality_limit'?'У API є лише '+(item.available_qualities||[]).join(', ')+'. Поточний ліміт якості — '+(item.quality_cap||qualityCap)+'p.':'Для цього озвучення API не повернув придатного HTTPS-потоку.';
    watchRow(line((sourceId==='all'?(item.xot_source_name||item.source||item.provider)+' · ':'')+(item.episode?'Серія '+item.episode+' · ':'')+item.translation,note),item);
   });
   opened.forEach(function(group){
    line(group.source.title,'Відкрити знайдені озвучення та серії',function(){self.changeSource(group.source.id);});
   });
   if(!pending)finish();else if(self.activity)self.activity.loader(false);
   updateFilter();self.start();
  }
  function timeline(item){
   if(!postVerified||!Lampa.Timeline||typeof Lampa.Timeline.view!=='function')return null;
   var hash=watchHash(card,item);if(hash===null)return null;watchHashes.add(String(hash));
   var meta=null;try{if(Lampa.Timeline.link){var linked=seriesCard(card)?Object.assign({},card,{original_name:card.original_name||card.original_title||card.name}):card;meta=Lampa.Timeline.link(linked,item.season,item.episode);}}catch(e){}
   return Lampa.Timeline.view(hash,meta);
  }
  function watchRow(row,item){
   if(source().kind==='catalog'&&!matches(item,card))return row;
   var mark=timeline(item),progress=watchProgress(mark);if(!mark||!progress.time&&!progress.percent)return row;
   row.toggleClass('xot-watched',progress.watched).attr('data-xot-watch',mark.hash);
   var status=(progress.watched?'✓ Переглянуто · '+progress.percent+'%':progress.duration||progress.percent?'Переглянуто: '+progress.percent+'%':'Час перегляду')+(progress.time?' · '+watchTime(progress.time)+(progress.duration?' із '+watchTime(progress.duration):''):'');
   $('<div class="xot-watch-status"></div>').text(status).appendTo(row);
   var bar=$('<div class="time-line xot-watch-progress"><div></div></div>').attr('data-hash',mark.hash);bar.find('div').css('width',progress.percent+'%');row.append(bar);return row;
  }
  function resumeInventory(){
   if(!postVerified)return [];
   if(sourceId==='rezka'&&post){
    var translations=post.translations||[];
    if(!post.series)return translations.map(function(v){return {provider:'rezka',translation:v.title,voice_id:v.id,title:post.title,needs_resolve:true,xot_rezka_voice:v,xot_post_id:post.id};});
    if(!rezkaVoice)return [];
    return episodeList.flatMap(function(group){return group.episodes.map(function(n){return {provider:'rezka',translation:rezkaVoice.title,voice_id:rezkaVoice.id,title:post.title,season:group.season,episode:n,needs_resolve:true,xot_rezka_voice:rezkaVoice,xot_post_id:post.id};});});
   }
   return streams.filter(function(item){return (source().kind!=='catalog'||matches(item,card))&&(!seriesCard(card)||item.season>0&&item.episode>0);});
  }
  function resumeTarget(){
   if(!postVerified||source().kind==='catalog'&&!streams.some(function(item){return matches(item,card);}))return null;
   var candidates=new Map();
   resumeInventory().forEach(function(item){var key=[item.season||0,item.episode||0].join('|');if(!candidates.has(key))candidates.set(key,{item:item,record:null});});
   watchHistory().filter(function(row){return row.card===watchCardKey(card);}).forEach(function(record){var key=[record.season,record.episode].join('|'),candidate=candidates.get(key);if(!candidate){candidate={item:record,record:null};candidates.set(key,candidate);}if(!candidate.record||candidate.record.updated<record.updated)candidate.record=record;});
   return latestUnfinished(Array.from(candidates.values()).map(function(row){return {item:row.item,record:row.record,progress:watchProgress(timeline(row.item))};}));
  }
  function continueGroups(target){
   var order=orderedSources(sources).map(function(s){return s.id;});
   return displayGroups(resumeInventory().filter(function(item){return (item.season||0)===(target.item.season||0)&&(item.episode||0)===(target.item.episode||0);}).sort(function(a,b){return order.indexOf(a.provider)-order.indexOf(b.provider);}),false);
  }
  function continueChoice(groups,target){
   var saved=get('xot_native_voices',{}),manual=Object.prototype.hasOwnProperty.call(saved,voicePreferenceKey()),specific=saved[voicePreferenceKey()];
   if(manual&&specific)return groups.find(function(group){var item=group.items[0],label=(sourceId==='all'?(item.xot_source_name||item.source||item.provider)+' · ':'')+(item.translation||'Оригінал');return label===specific.title;})||null;
   if(!manual){var favorite=favoriteVoice(groups.map(function(group){return group.items[0];}),orderedSources(sources).map(function(s){return s.id;}));if(favorite)return groups.find(function(group){return group.items[0]===favorite;});}
   if(target.record){
    var record=target.record;
    return groups.find(function(group){var item=group.items[0];return item.provider===record.provider&&String(voiceKey(item))===record.voice_id&&favoriteIdentity(item)===favoriteIdentity(record);})||groups.find(function(group){return record.translation&&favoriteIdentity(group.items[0])===favoriteIdentity(record);})||null;
   }
   return groups.find(function(group){return selectionVoice(group.items[0])===voice;})||(get('xot_prefer_ukrainian',true)&&groups.find(function(group){return ukrainian(group.items[0]);}))||groups[0]||null;
  }
  function appendContinue(){
   var target=resumeTarget();if(!target)return;
   var groups=continueGroups(target),choice=continueChoice(groups,target),episode=target.item.episode?' · '+target.item.season+'×'+target.item.episode:'';
   var note=watchTime(target.progress.time)+(target.progress.duration?' із '+watchTime(target.progress.duration):'')+(target.progress.duration||target.progress.percent?' · '+target.progress.percent+'%':'');
   if(groups.length)note+=' · '+(choice?choice.items[0].translation||'Оригінал':'Обери озвучення для продовження');
   else note+=' · '+(sourceId==='all'&&allGroups.some(function(group){return group.status==='loading';})?'Шукаємо цю серію…':'Потік для цього перегляду не знайдено. Вибери інший балансер.');
   var row=line((groups.length?'Продовжити':'Останній перегляд')+episode,note,groups.length?continueWatching:null,!!groups.length).removeClass('xot-native-row').addClass('xot-continue-row');
   row.attr('data-season',target.item.season||0).attr('data-episode',target.item.episode||0);
  }
  function continueWatching(){
   var target=resumeTarget();if(!target)return notify('Незавершеного перегляду не знайдено.');
   var groups=continueGroups(target);if(!groups.length)return notify('Для цього перегляду зараз немає доступного потоку.');
   function launch(group,manualChoice){var item=group.items[0];season=item.season||null;voice=selectionVoice(item);if(manualChoice)saveVoice();playGroup(group.items,target.progress);}
   var choice=continueChoice(groups,target);if(choice)return launch(choice,false);
   select(groups.map(function(group){var item=group.items[0];return {title:safeText((item.xot_source_name||item.source||item.provider)+' · '+(item.translation||'Оригінал')),group:group};}),'Озвучення для продовження',function(row){launch(row.group,true);},self.start);
  }
  function qualityPreference(){var value=Number(get('video_quality_default',1080));return [480,720,1080,1440,2160].includes(value)?value:1080;}
  function choosePreferredQuality(){
   select([2160,1440,1080,720,480].map(function(q){return {title:q+'p',value:q,selected:q===qualityPreference()};}),'Бажана якість',function(item){set('video_quality_default',item.value);updateFilter();notify('Якість збережено: '+item.value+'p');self.start();},self.start);
  }
  function playerData(){try{return Lampa.Player.playdata&&Lampa.Player.playdata();}catch(e){return null;}}
  function onPlayerQuality(event){
   var data=playerData();if(!data||data.xot_owner!==owner)return;
   var value=/^\d+p?$/i.test(event.name)?parseInt(event.name):null;
   if(value!==null&&[480,720,1080,1440,2160].includes(value)){set('video_quality_default',value);delete data.xot_backup_declined;armStartup(data);updateFilter();}
  }
  function onPlayerCreate(event){
   var data=event.data;if(!data||data.xot_owner!==owner||!data.quality)return;
   var choices=Object.keys(data.quality).map(function(key){return {quality:key,url:typeof data.quality[key]==='string'?data.quality[key]:data.quality[key].url};});
   var selected=chooseQuality(choices,qualityPreference());if(selected.url)data.url=selected.url;
  }
  function onPlayerStart(data){
   playingOwned=!!data&&data.xot_owner===owner;if(!playingOwned){cancelBackup();return;}
   ownedWork=data;watchStarted=false;lastWatchSave=0;
   var key=[data.season||0,data.episode||0].join('|');if(key!==backupEpisode){backupEpisode=key;failedFamilies.clear();}
   lastPosition=Number(data.xot_resume)||0;armStartup(data);
  }
  function onPlayerReady(data){
   if(!data||data.xot_owner!==owner||data.xot_source!=='ufdub')return;
   var url;try{url=new URL(data.url);}catch(e){return;}
   if(url.origin!=='https://api.ufdub.com'||!/^\/UFDUB_UPLOAD\/VIDEO\/[^/]+\.mp4$/i.test(url.pathname))return;
   var video=Lampa.PlayerVideo.video();
   // UFDub publishes ordinary MP4s without CORS headers. Lampa creates every
   // HTML5 video with crossorigin=anonymous; use normal native MP4 embedding
   // for this source only. HLS, other sources and native TV objects are untouched.
   if(video&&video.removeAttribute&&video.hasAttribute('crossorigin')){
    video.removeAttribute('crossorigin');video.load();var playing=video.play();if(playing&&playing.catch)playing.catch(function(){});
   }
  }
  function armStartup(data){clearTimeout(bootTimer);bootTimer=setTimeout(function(){if(!destroyed&&playerData()===data&&Lampa.Player.opened())offerBackup(data);},15000);}
  function onCanPlay(){
   var data=playerData();if(!data||data.xot_owner!==owner)return;clearTimeout(bootTimer);
   if(data.xot_resume>0&&!data.xot_resume_applied){
    data.xot_resume_applied=true;var video=Lampa.PlayerVideo.video(),duration=Number(video.duration)||Infinity;
    if(data.timeline){data.timeline.continued=true;data.timeline.continued_bloc=true;data.timeline.waiting_for_user=false;}
    Lampa.PlayerVideo.to(Math.max(0,Math.min(data.xot_resume,duration-3)));
   }
  }
  function saveWatchMetadata(data){if(data&&data.xot_verified&&data.xot_profile===watchProfile()&&data.xot_item)rememberWatch(card,data.xot_item);}
  function onTimeUpdate(event){
   var data=playerData();if(!data||data.xot_owner!==owner||!Number.isFinite(event.current)||event.current<0)return;
   lastPosition=event.current;if(event.current>0)clearTimeout(bootTimer);
   if(event.current>0&&Number.isFinite(event.duration)&&event.duration>0&&data.timeline&&!data.timeline.waiting_for_user&&!data.timeline.stop_recording){
    watchStarted=true;if(Date.now()-lastWatchSave>=10000){saveWatchMetadata(data);lastWatchSave=Date.now();}
   }
  }
  function onTimelineUpdate(event){
   if(destroyed||event&&event.data&&event.data.hash!==undefined&&!watchHashes.has(String(event.data.hash)))return;
   progressDirty=true;clearTimeout(progressTimer);progressTimer=setTimeout(function(){if(active()&&!(Lampa.Player.opened&&Lampa.Player.opened())&&!$('body').hasClass('selectbox--open'))refreshAfterPlayer();},100);
  }
  function refreshAfterPlayer(){
   if(destroyed||Lampa.Player.opened&&Lampa.Player.opened())return;
   clearTimeout(progressTimer);progressDirty=false;
   if(sourceId==='all')refreshAggregate();else if(state==='streams')drawStreams();else if(state==='episodes')drawEpisodes();else if(state==='translations')drawRezkaVoices();
  }
  function onPlayerDestroy(){
   if(playingOwned){if(watchStarted)saveWatchMetadata(ownedWork);ownedWork=null;watchStarted=false;playingOwned=false;if(backupContext&&backupContext.shown)closeSelect();cancelBackup();if(playbackRequest)cancelPlayback();if(!advancing)Promise.resolve().then(refreshAfterPlayer);}
  }
  function backupValid(context){return backupContext===context&&current(context.token)&&playerData()===context.work&&Lampa.Player.opened();}
  function leaveBackup(context){
   if(!backupValid(context))return;
   context.work.xot_backup_declined=true;cancelBackup();if(Lampa.Player.toggle)Lampa.Player.toggle();
  }
  function offerBackup(work){
   if(destroyed||!work||work.xot_owner!==owner||playerData()!==work||!Lampa.Player.opened()||backupContext||work.xot_backup_declined)return;
   clearTimeout(bootTimer);
   if(!work.xot_verified){work.xot_backup_declined=true;return notify('Для цього ручного збігу вибери інший балансер у списку джерел.');}
   var item=work.xot_item,video=Lampa.PlayerVideo.video(),position=Math.max(lastPosition,Number(video&&video.currentTime)||0);
   [work.url].concat(Object.values(work.quality||{}).map(function(value){return typeof value==='string'?value:value.url;})).forEach(function(url){if(media(url))failedFamilies.add(deliveryFamily(url));});
   var context={work:work,item:item,position:position,token:serial,controller:new AbortController(),timer:null,choices:[],shown:false};backupContext=context;
   if(Lampa.PlayerVideo.pause)Lampa.PlayerVideo.pause();notify('Шукаємо резервні джерела для цього відео…');
   function showChoices(){
    if(!backupValid(context)||context.shown)return;context.shown=true;clearTimeout(context.timer);
    var seen=new Set(),choices=context.choices.filter(function(choice){var key=choice.items.map(function(row){return row.url||row.resolve_url;}).sort().join('|');if(seen.has(key))return false;seen.add(key);return true;});
    choices.sort(function(a,b){return Number(ukrainian(b.items[0])===ukrainian(item))-Number(ukrainian(a.items[0])===ukrainian(item));});
    var options=choices.map(function(choice){return {title:safeText(choice.source.title+' · '+(choice.items[0].translation||'Оригінал')),subtitle:safeText(Array.from(new Set(choice.items.flatMap(function(row){return row.available_qualities||[row.quality];}).filter(Boolean))).join(' · ')),choice:choice};});
    if(!options.length)options.push({title:'Повторити пошук резерву',retry:true});
    options.push({title:'Повернутися до плеєра',cancel:true});
    select(options,choices.length?'Резервне джерело · '+(item.episode?'серія '+item.season+'×'+item.episode:'цей фільм'):'Резервних джерел поки немає',function(option){
     if(!backupValid(context))return;
     if(option.cancel)return leaveBackup(context);
     if(option.retry){cancelBackup();return offerBackup(work);}
     launchBackup(context,option.choice);
    },function(){leaveBackup(context);});
   }
   context.show=showChoices;
   context.timer=setTimeout(function(){if(backupValid(context)){context.controller.abort();showChoices();}},20000);
   var operation={signal:context.controller.signal};
   Promise.allSettled(orderedSources(sources).filter(function(which){return which.id!=='all'&&which.id!=='rezka'&&which.id!==work.xot_source&&(!which.seriesOnly||Boolean(item.episode));}).map(function(which){
    return searchSource(which,operation).then(function(data){
     if(!backupValid(context)||context.shown)return null;
     if(data.catalog)return {items:data.catalog.filter(function(row){return matches(row,card);})};
     var exact=(data.candidates||[]).filter(function(row){return matches(row,card);});
     if(exact.length!==1)return null;
     return request(which.id,'post',postPayload(exact[0],which,true),operation.signal);
    }).then(function(data){
     if(!data||!backupValid(context)||context.shown)return;
     var inventory=(data.items||[]).filter(streamItem).map(function(row){return Object.assign({},row,{provider:which.id,xot_source_name:which.title});});
     backupGroups(inventory,item,failedFamilies).forEach(function(group){context.choices.push({source:which,data:data,inventory:inventory,items:group});});
    });
   })).then(showChoices);
  }
  function launchBackup(context,choice){
   if(!backupValid(context))return;
   notify('Завантажуємо '+choice.source.title+'…');
   resolveForPlayback(choice.items,function(resolved){
    if(!backupValid(context))return;
    var first=choice.items[0],inventory=choice.inventory.filter(function(row){return !(row.season===first.season&&row.episode===first.episode&&voiceKey(row)===voiceKey(first));}).concat(resolved);
    if(sourceId==='all'){
     streams=streams.filter(function(row){return row.provider!==choice.source.id;}).concat(inventory);
     var group=allGroups.find(function(row){return row.source.id===choice.source.id;});if(group){group.data=choice.data;group.status='ready';group.count=inventory.length;}
    }else{
     sourceId=choice.source.id;params.xot_source=sourceId;set('xot_native_source',sourceId);
     var saved=get('xot_native_last_sources',{});if(card.id){saved[card.id]=sourceId;set('xot_native_last_sources',saved);}streams=inventory;unavailable=choice.data.unavailable||[];
    }
    post=choice.data;postVerified=true;season=first.season||null;voice=selectionVoice(first);saveVoice();state='streams';updateFilter();
    var play=playable(resolved,context.position),list=playlistFor(resolved,play);cancelBackup();
    play.callback=function(){if(Lampa.Player.playlist)Lampa.Player.playlist(list);delete play.callback;};
    advancing=true;
    try{
     if(Lampa.PlayerPlaylist&&Lampa.PlayerPlaylist.listener)Lampa.PlayerPlaylist.listener.send('select',{item:play});
     else{Lampa.Player.close();Lampa.Player.play(play);play.callback();}
    }finally{advancing=false;}
   },function(error){if(!backupValid(context))return;notify(readableError(error));context.shown=false;context.choices=context.choices.filter(function(row){return row!==choice;});context.show();});
  }
  function playable(items,resume){
   var selected=chooseQuality(items,qualityPreference()),item=items[0];
   if(!selected.url)throw Error('eneyida_stream_unavailable');
   var verified=source().kind==='catalog'?matches(item,card):postVerified,mark=verified?timeline(item):null,originalMark=mark;
   if(resume>0&&mark)mark=Object.assign({},mark,{time:resume,percent:0,continued:false});
   var play=Object.assign(selected,{title:title(card)+' / '+(item.translation||'Оригінал')+(item.episode?' / '+item.season+'×'+item.episode:''),season:item.season,episode:item.episode,card:card,isonline:true,timeline:mark,xot_owner:owner,xot_source:item.provider||sourceId,xot_item:item,xot_verified:verified,xot_profile:watchProfile(),xot_resume:resume||0,error:function(work){offerBackup(work);}});
   if(resume>0&&mark&&typeof originalMark.handler==='function')mark.handler=function(percent,time,duration){if(play.xot_resume_applied)originalMark.handler(percent,time,duration);};
   return play;
  }
  function resolveForPlayback(items,done,fail){
   cancelPlayback();var task={controller:new AbortController(),token:serial,id:playbackSerial,timer:null};playbackRequest=task;
   function valid(){return current(task.token)&&playbackRequest===task&&playbackSerial===task.id;}
   function finishTask(){clearTimeout(task.timer);if(playbackRequest===task)playbackRequest=null;}
   task.timer=setTimeout(function(){if(valid()){task.controller.abort();finishTask();fail(Error('request_timeout'));}},20000);
   var first=items[0],which=first.provider||sourceId,loading=items.some(function(item){return item.needs_resolve;});
   var load;
   if(!loading)load=Promise.resolve({items:items});
   else if(which==='rezka')load=request('rezka','stream',Object.assign({},first.xot_rezka_voice,{id:first.xot_post_id,translator_id:first.xot_rezka_voice.id,title:post.title,translation:first.translation,series:Boolean(first.episode),season:first.season,episode:first.episode,favs:post.favs||''}),task.controller.signal);
   else load=request(which,'stream',first,task.controller.signal);
   load.then(function(data){
    if(!valid())return;
    var resolved=(data.items||[]).filter(function(item){return media(item.url)&&!item.needs_resolve;}).map(function(item){return Object.assign({},item,{provider:which,xot_source_name:first.xot_source_name});});
    if(!resolved.length)throw Error('eneyida_stream_unavailable');
    if(loading&&which!=='rezka')streams=streams.filter(function(item){return !(item.provider===first.provider&&item.url===first.url&&item.season===first.season&&item.episode===first.episode&&voiceKey(item)===voiceKey(first));}).concat(resolved);
    finishTask();try{done(resolved);}catch(error){fail(error);}
   }).catch(function(error){if(valid()){finishTask();fail(error);}});
  }
  function playbackFailed(error){
   var data=playerData();if(data&&data.xot_owner===owner&&Lampa.Player.opened&&Lampa.Player.opened())Lampa.Player.close();
   if(!destroyed){if(sourceId==='rezka'){if(post.series)drawEpisodes();else drawRezkaVoices();}else drawStreams();notify(readableError(error));}
  }
  function playlistFor(items,play){
   var first=items[0],inventory=streams;
   if(first.provider==='rezka'&&first.episode&&rezkaVoice)inventory=episodeList.reduce(function(list,group){return list.concat(group.episodes.map(function(n){return {provider:'rezka',title:post.title,translation:rezkaVoice.title,season:group.season,episode:n,needs_resolve:true,xot_rezka_voice:rezkaVoice,xot_post_id:post.id};}));},[]);
   var groups=first.episode?episodeGroups(inventory,first):[];
   if(!groups.length)return [play];
   return groups.map(function(group){
    var item=group[0];if(item.season===first.season&&item.episode===first.episode)return play;
    var entry={title:title(card)+' / '+(item.translation||'Оригінал')+' / '+item.season+'×'+item.episode,season:item.season,episode:item.episode,card:card,isonline:true,xot_owner:owner,xot_source:item.provider||sourceId};
    entry.url=function(ready){
     if(destroyed)return;
     resolveForPlayback(group,function(resolved){Object.assign(entry,playable(resolved));advancing=true;try{ready();}finally{advancing=false;}},playbackFailed);
    };
    return entry;
   });
  }
  function playGroup(items,continueProgress){
   failedFamilies.clear();backupEpisode=[items[0].season||0,items[0].episode||0].join('|');cancelBackup();
   resolveForPlayback(items,function(resolved){
    var play=playable(resolved,continueProgress&&continueProgress.time),list=playlistFor(resolved,play);
    if(continueProgress)play.xot_continue=true;
    if(sourceId!=='rezka'&&!(Lampa.Player.opened&&Lampa.Player.opened()))drawStreams();
    try{Lampa.Player.play(play);if(Lampa.Player.playlist)Lampa.Player.playlist(list);if(card.id&&Lampa.Favorite)Lampa.Favorite.add('history',card,100);}catch(error){playbackFailed(error);}
   },playbackFailed);
  }
  function pairingView(){
   clear();state='pair';
   if(pairing&&pairing.user_code)line('Код Filmix: '+pairing.user_code,'Введи код у своєму акаунті filmix.gg/consoles',function(){if(Lampa.Utils.copyTextToClipboard)Lampa.Utils.copyTextToClipboard(pairing.user_code,function(){notify('Код скопійовано');});});
   line('Перевірити прив’язку','Після введення коду на сайті Filmix',confirmPair);
   line('Отримати новий код','',function(){beginPair(true);});
   line('До результатів','',lookup);finish();self.start();
  }
  function beginPair(fresh){
   stopRequests();pairing=fresh?null:get('xot_filmix_pending',null);if(pairing&&pairing.user_code)return pairingView();
   var operation=begin();loading('Отримуємо код Filmix…');
   request('filmix','pair',{device_token:''},operation.signal).then(function(data){if(!current(operation.token))return;pairing=data;set('xot_filmix_pending',data);pairingView();}).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function confirmPair(){
   if(!pairing)return beginPair();var operation=begin();loading('Перевіряємо прив’язку Filmix…');
   request('filmix','confirm',{device_token:'',temp_token:pairing.temp_token||''},operation.signal).then(function(data){
    if(!current(operation.token))return;
    if(data.status==='linked'&&data.device_token){set('xot_filmix_device_token',data.device_token);set('xot_filmix_pending',null);notify('Filmix: пристрій прив’язаний');lookup();}
    else{notify('Код ще не підтверджено');pairingView();}
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  this.changeSource=function(id){
   if(!sourceEnabled(id)||!sources.some(function(s){return s.id===id;}))return;
   var playing=playerData();if(playing&&playing.xot_owner===owner&&Lampa.Player.opened&&Lampa.Player.opened())Lampa.Player.close();
   sourceId=id;params.xot_source=id;set('xot_native_source',id);
   var saved=get('xot_native_last_sources',{});if(card.id){saved[card.id]=id;var keys=Object.keys(saved);if(keys.length>200)delete saved[keys[0]];set('xot_native_last_sources',saved);}
   closeSelect();lookup();
  };
  this.create=function(){
   if(created)return self.render();created=true;
   scroll.body().addClass('torrent-list');files.appendHead(filter.render());files.appendFiles(scroll.render());scroll.minus(files.render().find('.explorer__files-head'));
   voiceButton=$('<div class="simple-button simple-button--filter selector xot--voice"><span>Озвучення</span><div></div></div>');
   voiceButton.insertBefore(filter.render().find('.filter--filter'));
   if(Lampa.PlayerPanel&&Lampa.PlayerPanel.listener)Lampa.PlayerPanel.listener.follow('quality',onPlayerQuality);
   if(Lampa.Player.listener){Lampa.Player.listener.follow('create',onPlayerCreate);Lampa.Player.listener.follow('start',onPlayerStart);Lampa.Player.listener.follow('ready',onPlayerReady);Lampa.Player.listener.follow('destroy',onPlayerDestroy);}
   if(Lampa.PlayerVideo&&Lampa.PlayerVideo.listener){Lampa.PlayerVideo.listener.follow('canplay',onCanPlay);Lampa.PlayerVideo.listener.follow('timeupdate',onTimeUpdate);}
   if(Lampa.Timeline&&Lampa.Timeline.listener){Lampa.Timeline.listener.follow('update',onTimelineUpdate);Lampa.Timeline.listener.follow('read',onTimelineUpdate);}
   var voiceActivated=0;voiceButton.on('hover:enter click',function(){var now=Date.now();if(now-voiceActivated<450)return;voiceActivated=now;chooseVoice();});
   filter.onSearch=function(value){query=String(value||'').trim();if(!query)return;manual=true;params.search=query;filter.render().find('.filter--search div').text(query);lookup();};
   filter.onBack=function(){self.start();};
   filter.onSelect=function(type,a){
    if(type==='sort')return self.changeSource(a.id);
    closeSelect();
    if(a.action==='retry')return retrySearch();
    if(a.action==='sources')return manageSources();
    if(a.action==='diagnostics')return showDiagnostics();
    if(a.action==='favorite_voices')return manageFavoriteVoices();
    if(a.action==='quality')return choosePreferredQuality();
    if(a.action==='ukrainian'){
     set('xot_prefer_ukrainian',!get('xot_prefer_ukrainian',true));var preferences=get('xot_native_voices',{});delete preferences[voicePreferenceKey()];set('xot_native_voices',preferences);
     if(sourceId==='rezka')return lookup();restoreVoice();if(state==='streams')drawStreams();else updateFilter();return;
    }
    if(a.action==='candidates')return showCandidates();
    if(a.action==='pair')return beginPair();
    if(a.action==='logout'){set('xot_filmix_device_token','');set('xot_filmix_pending',null);return lookup();}
    if(a.action==='season')return select(a.seasons.map(function(n){return {title:'Сезон '+n,value:n,selected:n===season};}),'Сезон',function(v){season=v.value;if(sourceId==='rezka')drawEpisodes();else drawStreams();},self.start);
    if(a.action==='voice')return chooseVoice();
    if(a.action==='rezka_voice')return select(post.translations.map(function(v){return {title:safeText(v.title),voice:v};}),'Озвучення',function(v){chooseRezkaVoice(v.voice);},self.start);
   };
   updateFilter();
   providerTimer=setTimeout(function(){providerController.abort();},5000);
   jsonRequest('/api/providers',null,providerController.signal).then(function(data){
    clearTimeout(providerTimer);if(destroyed)return;
    var added=(data.providers||[]).filter(function(p){return p.enabled&&p.id!=='kodik'&&!sources.some(function(s){return s.id===p.id;});});added.forEach(function(p){sources.push({id:p.id,title:p.name,kind:'catalog'});});
    if(params.xot_source!==sourceId&&sourceEnabled(params.xot_source)&&sources.some(function(s){return s.id===params.xot_source;}))return self.changeSource(params.xot_source);
    if(sourceId==='all'&&added.length&&!sourceSettingsDirty)return lookup();
    updateFilter();
   }).catch(function(){clearTimeout(providerTimer);});
   // Defer until Lampa attaches the activity to the component.
   Promise.resolve().then(function(){if(!destroyed)lookup();});
   return self.render();
  };
  this.render=function(){return files.render();};
  this.start=function(){
   if(destroyed||!active()||Lampa.Player.opened&&Lampa.Player.opened())return;
   if(progressDirty&&!$('body').hasClass('selectbox--open')&&['streams','episodes','translations'].indexOf(state)>=0)return refreshAfterPlayer();
   Lampa.Controller.add('content',{toggle:focus,up:function(){if(window.Navigator&&Navigator.canmove('up'))Navigator.move('up');else Lampa.Controller.toggle('head');},down:function(){if(window.Navigator)Navigator.move('down');},left:function(){if(window.Navigator&&Navigator.canmove('left'))Navigator.move('left');else if(files.toggle)files.toggle();},right:function(){if(window.Navigator)Navigator.move('right');},back:self.back});
   if(!$('body').hasClass('selectbox--open')&&!$('body').hasClass('settings--open'))Lampa.Controller.toggle('content');
  };
  this.back=function(){if(state==='pair')lookup();else if(Lampa.Activity.backward)Lampa.Activity.backward();};
  this.pause=function(){};this.stop=function(){};
  this.destroy=function(){
   var playing=playerData();if(playing&&playing.xot_owner===owner&&Lampa.Player.opened&&Lampa.Player.opened())Lampa.Player.close();
   destroyed=true;stopRequests();providerController.abort();clearTimeout(providerTimer);clearTimeout(progressTimer);
   if(Lampa.PlayerPanel&&Lampa.PlayerPanel.listener)Lampa.PlayerPanel.listener.remove('quality',onPlayerQuality);
   if(Lampa.Player.listener){Lampa.Player.listener.remove('create',onPlayerCreate);Lampa.Player.listener.remove('start',onPlayerStart);Lampa.Player.listener.remove('ready',onPlayerReady);Lampa.Player.listener.remove('destroy',onPlayerDestroy);}
   if(Lampa.PlayerVideo&&Lampa.PlayerVideo.listener){Lampa.PlayerVideo.listener.remove('canplay',onCanPlay);Lampa.PlayerVideo.listener.remove('timeupdate',onTimeUpdate);}
   if(Lampa.Timeline&&Lampa.Timeline.listener){Lampa.Timeline.listener.remove('update',onTimelineUpdate);Lampa.Timeline.listener.remove('read',onTimelineUpdate);}
   filter.destroy();scroll.destroy();files.destroy();
  };
 });
 window.__XOT_COMPONENT_READY__=true;return true;
}
function open(card,settings){
 if(!card||!title(card))return notify('ХОТ: немає даних про фільм');
 if(!registerScreen())return notify('ХОТ: ця версія Lampa не підтримує власний екран');
 var movie=Object.assign({},card);movie.title=title(card);movie.original_title=movie.original_title||movie.original_name||movie.title;
 Lampa.Activity.push({title:'ХОТ · '+movie.title,component:'xot_online',movie:movie,search:movie.title,search_one:movie.title,search_two:movie.original_title,xot_source:settings?'filmix':preferredSource(movie),page:1});
}
function button(event){
 var card=unwrap(event)||activeCard();if(card)lastCard=card;
 if(typeof window.jQuery!=='function')return;
 var $=window.jQuery,scope=null;
 try{scope=event&&event.object&&event.object.activity&&event.object.activity.render();}catch(e){}
 var area=(scope?scope.find('.full-start-new__buttons, .full-start__buttons'):$('.full-start-new__buttons, .full-start__buttons')).first();if(!area.length)return;
 function place(node){
  var watch=area.children('.button--play, .view--online, .view--torrent').last();
  if(watch.length){if(node.prev()[0]!==watch[0])node.insertAfter(watch);}
  else{var utility=area.children('.button--book, .view--book, .button--subscribe, .button--options').first();if(utility.length)node.insertBefore(utility);else if(area.children().first()[0]!==node[0])area.prepend(node);}
 }
 var existing=area.find('.xot-online-button');if(existing.length){existing.data('xot-card',card);place(existing);return;}
 var node=$('<div class="full-start__button selector xot-online-button" tabindex="0" title="ХОТ — онлайн-перегляд" aria-label="ХОТ — онлайн-перегляд"><svg class="xot-online-icon" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="6" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m13 10 9 6-9 6V10Z" fill="currentColor"/><path d="M8 2v6M24 2v6M8 24v6M24 24v6" stroke="currentColor" stroke-width="2"/></svg><span>ХОТ</span></div>'),activated=0;
 node.data('xot-card',card);
 node.on('hover:enter click',function(){var now=Date.now();if(now-activated<500)return;activated=now;open(node.data('xot-card')||activeCard()||lastCard);});
 node.on('hover:long contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault();activated=Date.now();open(node.data('xot-card')||activeCard()||lastCard,true);});
 place(node);
}
if(!registerScreen())return;
window.__XOT_ONLINE_INITIALIZED__=true;
var style=document.createElement('style');style.textContent='.xot--voice>div{max-width:14em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.xot-native-row,.xot-continue-row{padding:1.05em 1.2em;margin:.4em 0;border-radius:.4em;background:rgba(255,255,255,.055)}.xot-native-row__title{font-size:1.28em;line-height:1.35}.xot-native-row__note{opacity:.65;margin-top:.35em;font-size:.9em}.xot-native-row.focus,.xot-continue-row.focus{outline:.18em solid #fff;background:rgba(255,255,255,.1)}.xot-watch-status{font-size:.82em;opacity:.85;margin-top:.5em}.xot-watch-progress.time-line{position:relative;inset:auto;height:.24em;margin-top:.65em;border-radius:.2em;overflow:hidden;background:rgba(255,255,255,.2)}.xot-watch-progress>div{height:100%;background:#fff}.xot-watched .xot-watch-status{color:#a8e8b0}.xot-continue-row{background:rgba(255,255,255,.11);border-left:.22em solid rgba(255,255,255,.7);margin-bottom:.8em}';document.head.appendChild(style);
Lampa.Listener.follow('full',function(e){if(e&&['complite','complete','render'].indexOf(e.type)>=0){buttonTimers.forEach(clearTimeout);buttonTimers=[setTimeout(function(){button(e);},0),setTimeout(function(){button(e);},350),setTimeout(function(){button(e);},1500)];}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(button,300);},{once:true});else setTimeout(button,300);
console.info('[XOT] Independent balancers '+VERSION);
})();
