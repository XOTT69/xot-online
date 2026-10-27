(function () {
'use strict';
if (!window.Lampa || window.__XOT_ONLINE_INITIALIZED__) return;
var VERSION='0.3.15', DEFAULT_API='https://xot-online.ai-beta69690.workers.dev';
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
var lastCard=null,buttonTimers=[],screenCounter=0,searchCache=new Map(),episodeCache=new Map(),watchEditing=false,menuEpoch=0;
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
function nextUnwatched(entries,card){
 if(!seriesCard(card))return null;
 var ordered=entries.filter(function(row){return row.item.season>0&&row.item.episode>0;}).slice().sort(function(a,b){return a.item.season-b.item.season||a.item.episode-b.item.episode;});
 var anchor=ordered.filter(function(row){return row.progress.watched;}).sort(function(a,b){return Math.max(b.progress.updated,b.record&&b.record.updated||0)-Math.max(a.progress.updated,a.record&&a.record.updated||0)||b.item.season-a.item.season||b.item.episode-a.item.episode;})[0];
 if(!anchor)return null;
 var previous=anchor,mode='episode';
 for(var i=ordered.indexOf(anchor)+1;i<ordered.length;i++){
  var row=ordered[i],a=previous.item,b=row.item;
  if(a.season===b.season){if(b.episode-a.episode>1)return null;}
  else{
   if(b.season!==a.season+1||b.episode!==1)return null;
   var meta=(Array.isArray(card.seasons)?card.seasons:[]).find(function(s){return s.season_number===a.season;}),count=meta&&Number(meta.episode_count);
   if(count>0){if(a.episode!==count)return null;}else mode='season';
  }
  if(!row.progress.watched)return {item:b,progress:row.progress,record:anchor.record,mode:mode};
  previous=row;
 }
 return null;
}
function watchValues(mark){
 mark=mark||{};var result={};['percent','time','duration'].forEach(function(key){var value=Number(mark[key]);result[key]=Number.isFinite(value)?Math.max(0,key==='percent'?Math.min(100,value):value):0;});return result;
}
function sameWatchValues(a,b){return ['percent','time','duration'].every(function(key){return Number(a[key])===Number(b[key]);});}
function undoEligible(mark,entry){return !!entry.applied&&sameWatchValues(watchValues(mark),entry.after)&&(!entry.updated||Number(mark.updated)===entry.updated);}
var QUALITY_PROFILES={economy:{title:'Економний',cap:720},balanced:{title:'Збалансований',cap:1080},maximum:{title:'Максимальна',cap:2160}};
function qualityLimit(){var cap=Number(get('video_quality_default',1080));return [480,720,1080,1440,2160].includes(cap)?cap:1080;}
function qualityProfile(){var key=get('xot_quality_profile','custom');return QUALITY_PROFILES[key]&&QUALITY_PROFILES[key].cap===qualityLimit()?key:'custom';}
function sourceHealth(){
 var value=get('xot_source_health_'+watchProfile(),{}),result={};if(!value||typeof value!=='object'||Array.isArray(value))return result;
 Object.keys(value).filter(function(key){return /^[a-z][a-z0-9_]{1,40}$/.test(key)&&!['constructor','prototype','__proto__'].includes(key);}).slice(0,50).forEach(function(key){var row=value[key];if(!row||!Array.isArray(row.samples))return;result[key]={samples:row.samples.filter(function(v){return typeof v==='boolean';}).slice(-10),startup:Math.max(0,Math.min(30000,Number(row.startup)||0)),updated:Number(row.updated)||0};});return result;
}
function recordSourceHealth(data,ok,elapsed){
 if(!data||!data.xot_verified||data.xot_profile!==watchProfile()||data.xot_health_recorded==='failure'||ok&&data.xot_health_recorded)return;
 var id=data.xot_source;if(!/^[a-z][a-z0-9_]{1,40}$/.test(id||''))return;
 var previousOutcome=data.xot_health_recorded;data.xot_health_recorded=ok?'success':'failure';var health=sourceHealth(),previous=health[id],samples=Array.isArray(previous&&previous.samples)?previous.samples.filter(function(v){return typeof v==='boolean';}).slice(-10):[];
 if(previousOutcome==='success'&&!ok&&samples.length)samples[samples.length-1]=false;else samples.push(!!ok);samples=samples.slice(-10);health[id]={samples:samples,startup:ok?Math.min(30000,Math.max(0,Number(elapsed)||0)):Number(previous&&previous.startup)||0,updated:Date.now()};
 var keys=Object.keys(health).sort(function(a,b){return (Number(health[b].updated)||0)-(Number(health[a].updated)||0);});var bounded={};keys.slice(0,50).forEach(function(key){bounded[key]=health[key];});set('xot_source_health_'+watchProfile(),bounded);
}
function rankedGroups(groups,order){
 if(!get('xot_smart_sort',true))return groups;
 var favorites=favoriteVoices(),health=sourceHealth(),cap=qualityLimit();
 function score(group){
  var item=group.items[0],favorite=favorites.findIndex(function(v){return v.key===favoriteIdentity(item);}),language=favorite>=0?favorite:get('xot_prefer_ukrainian',true)&&ukrainian(item)?20:30;
  var qualities=group.items.flatMap(function(row){return row.available_qualities||[row.quality];}).map(function(q){return parseInt(q)||0;}),under=qualities.filter(function(q){return q>0&&q<=cap;}),best=under.length?Math.max.apply(null,under):0;
  var row=health[item.provider],samples=row&&Array.isArray(row.samples)?row.samples.filter(function(v){return typeof v==='boolean';}):[],failures=samples.length>=2?samples.filter(function(v){return !v;}).length/samples.length:0;
  return [language,failures,best?cap-best:cap+1,samples.length>=2?Math.min(30000,Number(row.startup)||0):30000,order.indexOf(item.provider)];
 }
 return groups.map(function(group,index){return {group:group,index:index,score:score(group)};}).sort(function(a,b){
  var ai=a.group.items[0],bi=b.group.items[0],episode=(ai.season||0)-(bi.season||0)||(ai.episode||0)-(bi.episode||0);if(episode)return episode;
  for(var i=0;i<a.score.length;i++)if(a.score[i]!==b.score[i])return a.score[i]-b.score[i];return a.index-b.index;
 }).map(function(row){return row.group;});
}
function subtitleOptions(){
 var value=get('xot_subtitles',{});if(!value||typeof value!=='object')value={};
 return {language:['native','uk','en','off'].includes(value.language)?value.language:'native',size:['small','normal','large'].includes(value.size)?value.size:null,delay:Number.isFinite(value.delay)?Math.max(-120,Math.min(120,value.delay)):0};
}
function publishedSubtitles(item){
 var list=item.subtitles||item.subtitle||[];if(!Array.isArray(list))return [];
 var seen=new Set();return list.filter(function(row){try{var u=new URL(row.url);if(u.protocol!=='https:'||u.username||u.password||u.port||!u.pathname.match(/\.(?:srt|vtt)$/i)||u.href.length>4000||seen.has(u.href))return false;seen.add(u.href);return true;}catch(e){return false;}}).slice(0,20).map(function(row,index){return {index:index,label:String(row.label||row.language||'Субтитри').slice(0,100),language:String(row.language||'').slice(0,20),url:row.url};});
}
function introSettings(card){
 var saved=get('xot_intros_'+watchProfile(),{}),value=saved&&saved[watchCardKey(card)];
 if(!seriesCard(card)||!value||!Number.isFinite(value.start)||!Number.isFinite(value.end)||value.start<0||value.end<=value.start||value.end>900)return null;
 return {start:value.start,end:value.end};
}
function episodeKey(item){return Number(item.season)+'|'+Number(item.episode);}
function cleanSeason(value,n){
 if(!value||!Array.isArray(value.episodes)||value.season_number!==undefined&&Number(value.season_number)!==n)return null;
 return {season_number:n,name:typeof value.name==='string'?value.name.slice(0,160):'Сезон '+n,episodes:value.episodes.filter(function(ep){return ep&&Number(ep.episode_number)>0&&Number(ep.episode_number)<=100000&&(ep.season_number===undefined||Number(ep.season_number)===n);}).slice(0,200).map(function(ep){return {season:n,episode:Number(ep.episode_number),name:typeof ep.name==='string'?ep.name.slice(0,200):'',overview:typeof ep.overview==='string'?ep.overview.slice(0,2500):'',air_date:typeof ep.air_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(ep.air_date)?ep.air_date:''};})};
}
function futureEpisode(info){return !!(info&&info.air_date&&info.air_date>new Date(Date.now()).toISOString().slice(0,10));}
function seasonCacheKey(card,n){return [card.source||'tmdb',card.id,n,get('tmdb_lang','uk')].join('|');}
function checkEpisodeDates(card,keys,signal){
 var seasons=Array.from(new Set(keys.map(function(key){return Number(key.split('|')[0]);}))).sort(function(a,b){return b-a;}).slice(0,2),api=Lampa.Api&&Lampa.Api.sources&&Lampa.Api.sources.tmdb;
 if(!api||typeof api.seasons!=='function'||!/^\d+$/.test(String(card.id))||!['tmdb','cub'].includes(card.source||'tmdb'))return Promise.resolve(keys);
 return Promise.all(seasons.map(function(n){
  var key=seasonCacheKey(card,n),cached=episodeCache.get(key);if(cached&&cached.until>Date.now())return Promise.resolve(cached.data);
  return new Promise(function(resolve){var finished=false,timer=setTimeout(function(){finish(null);},8000),abort=function(){finish(null);};
   function finish(data){if(finished)return;finished=true;clearTimeout(timer);if(signal)signal.removeEventListener('abort',abort);if(!(signal&&signal.aborted)){episodeCache.set(key,{data:data,until:Date.now()+(data?21600000:60000)});while(episodeCache.size>40)episodeCache.delete(episodeCache.keys().next().value);}resolve(data);}
   if(signal&&signal.aborted)return finish(null);if(signal)signal.addEventListener('abort',abort,{once:true});
   try{api.seasons({id:card.id},[n],function(data){finish(cleanSeason(data&&data[n],n));});}catch(e){finish(null);}
  });
 })).then(function(data){var future=new Set(data.filter(Boolean).flatMap(function(season){return season.episodes.filter(futureEpisode).map(episodeKey);}));return keys.filter(function(key){return !future.has(key);});});
}
function trackedShows(){
 var list=get('xot_tracked_shows_'+watchProfile(),[]);if(!Array.isArray(list))return [];
 return list.filter(function(row){return row&&row.card&&seriesCard(row.card)&&typeof row.card.id!=='undefined'&&typeof row.provider==='string'&&Number.isFinite(row.updated);}).slice(0,30).map(function(row){
  var card={id:String(row.card.id).slice(0,80),name:String(row.card.name||row.card.title||'').slice(0,200),original_name:String(row.card.original_name||'').slice(0,200),first_air_date:String(row.card.first_air_date||'').slice(0,10),source:String(row.card.source||'tmdb').slice(0,40)};
  function keys(value){return Array.isArray(value)?Array.from(new Set(value.filter(function(key){return /^\d{1,3}\|\d{1,6}(?:\.\d+)?$/.test(key);}))).slice(-1000):[];}
  return {card:card,provider:row.provider.slice(0,40),translation:String(row.translation||'').slice(0,200),language:String(row.language||'').slice(0,20),episodes:keys(row.episodes),pending:keys(row.pending),checked:Number(row.checked)||0,updated:row.updated};
 });
}
function storeTrackedShows(list){set('xot_tracked_shows_'+watchProfile(),list.slice(0,30));}
function seriesInventory(items,record){
 var expected=favoriteIdentity(record);return Array.from(new Set(items.filter(function(item){return item.season>0&&item.episode>0&&(!record.translation||favoriteIdentity(item)===expected);}).map(episodeKey))).sort(function(a,b){var aa=a.split('|').map(Number),bb=b.split('|').map(Number);return aa[0]-bb[0]||aa[1]-bb[1];}).slice(-1000);
}
function mergeSeriesCheck(record,keys){
 var previous=new Set(record.episodes),last=record.episodes.slice().sort(function(a,b){var aa=a.split('|').map(Number),bb=b.split('|').map(Number);return bb[0]-aa[0]||bb[1]-aa[1];})[0],anchor=last&&last.split('|').map(Number);
 var added=record.episodes.length?keys.filter(function(key){var numbers=key.split('|').map(Number);return !previous.has(key)&&(!anchor||numbers[0]>anchor[0]||numbers[0]===anchor[0]&&numbers[1]>anchor[1]);}):[];
 return Object.assign({},record,{episodes:Array.from(new Set(record.episodes.concat(keys))).slice(-1000),pending:Array.from(new Set(record.pending.concat(added))).slice(-1000),checked:Date.now()});
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
 menuEpoch++;Lampa.Select.show({title:heading,items:items,onSelect:function(item){menuEpoch++;closeSelect();done(item);},onBack:function(){menuEpoch++;if(back)back();}});
}
function registerScreen(){
 if(window.__XOT_COMPONENT_READY__)return true;
 if(!Lampa.Component||!Lampa.Component.add||typeof window.jQuery!=='function')return false;
 Lampa.Component.add('xot_online',function(params){
  var self=this,$=window.jQuery,card=params.movie,files=new Lampa.Explorer(params),scroll=new Lampa.Scroll({mask:true,over:true}),filter=new Lampa.Filter(params);
  var sources=BASE_SOURCES.slice(),sourceId=params.xot_source||preferredSource(card),query=params.search||title(card),manual=false;
  var providerController=new AbortController(),providerTimer=null,voiceButton=null,allGroups=[],playbackRequest=null,playbackSerial=0,owner='xot_'+(++screenCounter),playingOwned=false,advancing=false;
  var backupContext=null,bootTimer=null,lastPosition=0,backupEpisode='',failedFamilies=new Set(),postVerified=true,singleDiagnostic=null,sourceSettingsDirty=false;
  var progressTimer=null,progressDirty=false,watchHashes=new Set(),ownedWork=null,watchStarted=false,lastWatchSave=0,watchFocus=null,restoreWatchFocus=null,suppressRowEnterUntil=0,watchNoticeNode=null,watchNoticeTimer=null;
  var seasonMetadata={},seasonRequests={},metadataSerial=0,metadataTimers=[],updatesController=new AbortController(),updatesStarted=false,comfortButton=null,introButton=null,readyTimer=null;
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
   node.on('hover:focus',function(){last=node[0];if(node.data('xot-watch-item'))watchFocus=node.data('xot-watch-item');if(scroll.update)scroll.update(node,true);});
   node.on('hover:enter click',function(){var now=Date.now();if(watchEditing||now<suppressRowEnterUntil||now-time<450)return;time=now;menuEpoch++;if(node.data('xot-upcoming'))return showEpisodeInfo(node.data('xot-watch-item'));action();});
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
  function episodeInfo(item){var data=seasonMetadata[item.season];return data&&data.episodes.find(function(ep){return ep.episode===Number(item.episode);});}
  function displayDate(value){return value?value.split('-').reverse().join('.'):'';}
  function metadataRow(row,item){
   row.find('.xot-episode-meta').remove();row.data('xot-upcoming',false);var info=episodeInfo(item);if(!info)return;
   var future=futureEpisode(info);row.data('xot-upcoming',future);
   var heading=row.find('.xot-native-row__title'),original=row.data('xot-original-title');if(original===undefined){original=heading.text();row.data('xot-original-title',original);}heading.text(future?original.replace(/^▶\s*/, ''):original);
   $('<div class="xot-episode-meta"></div>').text([info.name,info.air_date?(future?'Очікується: ':'')+displayDate(info.air_date):''].filter(Boolean).join(' · ')).appendTo(row);
  }
  function ensureSeasonMetadata(n,done){
   if(!seriesCard(card)||!(n>0))return done&&done(null);
   if(seasonMetadata[n])return done&&done(seasonMetadata[n]);
   if(seasonRequests[n]){if(done)seasonRequests[n].push(done);return;}
   var api=Lampa.Api&&Lampa.Api.sources&&Lampa.Api.sources.tmdb;
   if(!api||typeof api.seasons!=='function'||!/^\d+$/.test(String(card.id))||!['tmdb','cub'].includes(card.source||'tmdb'))return done&&done(null);
   var key=seasonCacheKey(card,n),cached=episodeCache.get(key),token=metadataSerial;
   if(cached&&cached.until>Date.now()){seasonMetadata[n]=cached.data;return done&&done(cached.data);}
   seasonRequests[n]=done?[done]:[];var queue=seasonRequests[n];
   function finish(data){
    if(destroyed||token!==metadataSerial||seasonRequests[n]!==queue)return;
    var callbacks=seasonRequests[n];delete seasonRequests[n];if(data)seasonMetadata[n]=data;episodeCache.set(key,{data:data,until:Date.now()+(data?21600000:60000)});while(episodeCache.size>40)episodeCache.delete(episodeCache.keys().next().value);
    files.render().find('.xot-watch-editable').each(function(){var row=$(this);metadataRow(row,row.data('xot-watch-item'));});
    callbacks.forEach(function(call){call(data);});
   }
   var timer=setTimeout(function(){finish(null);},10000);metadataTimers.push(timer);
   try{api.seasons({id:card.id},[n],function(data){clearTimeout(timer);finish(cleanSeason(data&&data[n],n));});}catch(e){clearTimeout(timer);finish(null);}
  }
  function returnFromComfort(){if(Lampa.Player.opened&&Lampa.Player.opened()){if(Lampa.PlayerPanel&&Lampa.PlayerPanel.toggle)Lampa.PlayerPanel.toggle();}else self.start();}
  function comfortMenu(){
   var profile=qualityProfile(),rows=[{title:'Профіль якості: '+(QUALITY_PROFILES[profile]?QUALITY_PROFILES[profile].title:'Вручну · '+qualityLimit()+'p'),action:'profile'},{title:'Сортування: '+(get('xot_smart_sort',true)?'розумне':'за порядком балансерів'),action:'ranking'},{title:'Субтитри',subtitle:'Мова, розмір і затримка · вбудований плеєр',action:'subtitles'}];
   if(seriesCard(card)&&postVerified)rows.push({title:'Заставка серіалу',subtitle:introSettings(card)?watchTime(introSettings(card).start)+' — '+watchTime(introSettings(card).end):'Вимкнено',action:'intro'});
   rows.push({title:'Готово',action:'done'});
   select(rows,'Зручний перегляд',function(row){
    if(row.action==='profile')return profileMenu();if(row.action==='subtitles')return subtitlesMenu();if(row.action==='intro')return introMenu();
    if(row.action==='ranking'){set('xot_smart_sort',!get('xot_smart_sort',true));if(!(Lampa.Player.opened&&Lampa.Player.opened()))refreshAfterPlayer();return comfortMenu();}
    returnFromComfort();
   },returnFromComfort);
  }
  function profileMenu(){
   select(Object.keys(QUALITY_PROFILES).map(function(key){var profile=QUALITY_PROFILES[key];return {title:profile.title,subtitle:'Бажана якість до '+profile.cap+'p · за наявності у джерела',key:key,selected:qualityProfile()===key};}).concat([{title:'Вибрати якість вручну',key:'custom'}]),'Профіль якості',function(row){
    if(row.key==='custom')return choosePreferredQuality(comfortMenu);
    set('xot_quality_profile',row.key);set('video_quality_default',QUALITY_PROFILES[row.key].cap);updateFilter();if(!(Lampa.Player.opened&&Lampa.Player.opened()))refreshAfterPlayer();comfortMenu();
   },comfortMenu);
  }
  function subtitlesMenu(){
   var options=subtitleOptions(),labels={native:'Як у Lampa',uk:'Українська',en:'Англійська',off:'Вимкнено'},data=playerData(),owned=data&&data.xot_owner===owner&&Lampa.Player.opened(),rows=[];
   if(owned)rows.push({title:'Обрати доступну доріжку',subtitle:'Доріжки поточного відео',action:'tracks'});
   rows=rows.concat([{title:'Мова: '+labels[options.language],action:'language'},{title:'Розмір: '+({small:'малий',normal:'звичайний',large:'великий'}[options.size]||'як у Lampa'),action:'size'},{title:'Затримка: '+(options.delay>0?'+':'')+options.delay+' с',subtitle:'Плюс — показувати пізніше · зовнішні SRT/VTT',action:'delay'},{title:'Назад',action:'back'}]);
   select(rows,'Субтитри',function(row){
    if(row.action==='back')return comfortMenu();
    if(row.action==='tracks'){
     var button=Lampa.PlayerPanel&&Lampa.PlayerPanel.render&&Lampa.PlayerPanel.render().find('.player-panel__subs');
     if(button&&button.length&&!button.hasClass('hide')){returnFromComfort();button.trigger('hover:enter');}else {watchNotice('Це відео не повернуло доступних субтитрів.');subtitlesMenu();}return;
    }
    var choices=row.action==='language'?Object.keys(labels).map(function(key){return {title:labels[key],value:key};}):row.action==='size'?[{title:'Як у Lampa',value:null},{title:'Малий',value:'small'},{title:'Звичайний',value:'normal'},{title:'Великий',value:'large'}]:[-10,-5,-3,-2,-1,0,1,2,3,5,10].map(function(value){return {title:(value>0?'+':'')+value+' с',value:value};});
    select(choices,'Налаштування субтитрів',function(choice){options[row.action]=choice.value;set('xot_subtitles',options);applySubtitleOptions(playerData(),true);subtitlesMenu();},subtitlesMenu);
   },comfortMenu);
  }
  function applySubtitleOptions(data,live){
   if(!data||data.xot_owner!==owner||data.xot_profile!==watchProfile())return;
   var options=subtitleOptions();set('player_subs_shift_time',String(options.delay));
   if(options.size){set('subtitles_size',options.size);if(Lampa.PlayerPanel&&Lampa.PlayerPanel.listener)Lampa.PlayerPanel.listener.send('subs',{type:'subtitles_size',value:options.size});}
   var video=Lampa.PlayerVideo&&Lampa.PlayerVideo.video&&Lampa.PlayerVideo.video();if(!video||options.language==='native')return;
   var tracks=Array.from(video.customSubs||[]).concat(Array.from(video.textTracks||[]));
   var track=options.language==='off'?null:tracks.find(function(row){return voiceLanguage({translation:row.label,language:row.language})===options.language;});
   if(options.language!=='off'&&!track)return;
   tracks.forEach(function(row){row.mode='disabled';row.selected=false;});if(track){track.mode='showing';track.selected=true;}
   if(Lampa.PlayerPanel&&Lampa.PlayerPanel.listener)Lampa.PlayerPanel.listener.send('subsview',{status:!!track});
  }
  function introMenu(){
   var settings=introSettings(card),profile=watchProfile();
   select([{title:settings?'Заставка: '+watchTime(settings.start)+' — '+watchTime(settings.end):'Налаштувати заставку',action:'duration'},{title:'Початок: '+watchTime(settings?settings.start:0),action:'start'},{title:'Вимкнути пропуск заставки',action:'off'},{title:'Назад',action:'back'}],'Заставка · '+title(card),function(row){
    if(row.action==='back')return comfortMenu();
    function save(value){if(destroyed||profile!==watchProfile())return returnFromComfort();var saved=get('xot_intros_'+profile,{});if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};if(value)saved[watchCardKey(card)]=value;else delete saved[watchCardKey(card)];var keys=Object.keys(saved);while(keys.length>100)delete saved[keys.shift()];set('xot_intros_'+profile,saved);updateIntroButton();introMenu();}
    if(row.action==='off')return save(null);
    var values=row.action==='start'?[0,15,30,45,60,90,120,180,240,300]:[15,30,45,60,90,120,150,180];
    select(values.map(function(value){return {title:watchTime(value),value:value};}),row.action==='start'?'Початок заставки':'Тривалість заставки',function(choice){var start=row.action==='start'?choice.value:settings?settings.start:0,duration=row.action==='duration'?choice.value:settings?settings.end-settings.start:60;save({start:start,end:start+duration});},introMenu);
   },comfortMenu);
  }
  function installPlayerControls(data){
   if(!data||data.xot_owner!==owner||!Lampa.PlayerPanel||!Lampa.PlayerPanel.render)return;
   removePlayerControls();var panel=Lampa.PlayerPanel.render(),area=panel.find('.player-panel__tv-visible').first();if(!area.length)return;
   comfortButton=$('<div class="button selector xot-player-comfort" tabindex="0"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16M8 4v6m8-1v6M10 14v6" fill="none" stroke="currentColor" stroke-width="2"/></svg><div class="tooltip">ХОТ · Зручний перегляд</div></div>').appendTo(area);
   comfortButton.on('hover:enter click',comfortMenu);
   introButton=$('<div class="button selector xot-player-intro hide" tabindex="0"><svg viewBox="0 0 24 24"><path d="m4 5 9 7-9 7V5Zm11 0v14h3V5Z" fill="currentColor"/></svg><div class="tooltip">Пропустити заставку</div></div>').prependTo(area);
   introButton.on('hover:enter click',function(){var work=playerData(),video=Lampa.PlayerVideo.video(),settings=introSettings(card);if(!work||work.xot_owner!==owner||!settings||video.currentTime<settings.start||video.currentTime>=settings.end||!(video.duration>settings.end+1))return;Lampa.PlayerVideo.to(settings.end);updateIntroButton();if(Lampa.PlayerPanel.toPlayer)Lampa.PlayerPanel.toPlayer();});
   updateIntroButton();
  }
  function removePlayerControls(){if(comfortButton)comfortButton.remove();if(introButton)introButton.remove();comfortButton=null;introButton=null;}
  function updateIntroButton(){
   if(!introButton)return;var data=playerData(),settings=introSettings(card),video=Lampa.PlayerVideo&&Lampa.PlayerVideo.video&&Lampa.PlayerVideo.video();
   var visible=!!(data&&data.xot_owner===owner&&data.xot_verified&&data.xot_profile===watchProfile()&&data.episode&&settings&&video&&video.currentTime>=settings.start&&video.currentTime<settings.end&&video.duration>settings.end+1);introButton.toggleClass('hide',!visible).toggleClass('selector',visible);
   if(!visible&&introButton.hasClass('focus')&&comfortButton&&Lampa.Controller.enabled&&Lampa.Controller.enabled().name==='player_panel')Lampa.Controller.collectionFocus(comfortButton[0],Lampa.PlayerPanel.render());
  }
  function seasonMenu(){
   var cardSeasons=Array.isArray(card.seasons)?card.seasons:[],known=Array.from(new Set(resumeInventory().map(function(item){return item.season;}).filter(Boolean).concat(cardSeasons.map(function(item){return Number(item.season_number);}).filter(function(n){return n>0&&n<=999;})))).sort(function(a,b){return a-b;});
   select(known.map(function(n){var available=new Set(resumeInventory().filter(function(item){return item.season===n;}).map(function(item){return item.episode;})).size,meta=cardSeasons.find(function(s){return Number(s.season_number)===n;});return {title:meta&&meta.name||'Сезон '+n,subtitle:'Серій у джерелах: '+available+(meta&&meta.episode_count?' · у сезоні: '+meta.episode_count:''),season:n};}).concat(known.length?[]:[{title:'Даних про сезони поки немає'}]),'Серії та сезони',function(row){
    if(!row.season)return self.start();var intent=menuEpoch,profile=watchProfile();
    ensureSeasonMetadata(row.season,function(data){if(destroyed||!active()||intent!==menuEpoch||profile!==watchProfile()||Lampa.Player.opened&&Lampa.Player.opened())return;var inventory=watchEntries().filter(function(entry){return entry.item.season===row.season;}),entries=data?data.episodes:inventory.map(function(entry){return entry.item;});
     select(entries.map(function(item){var progress=watchProgress(timeline(item)),available=continueGroups({item:item}).length>0;return {title:'Серія '+item.episode+(item.name?' · '+item.name:''),subtitle:futureEpisode(item)?'Очікується '+displayDate(item.air_date):available?(progress.watched?'Переглянуто':'Є у джерелах')+(item.air_date?' · '+displayDate(item.air_date):''):'У поточних джерелах не знайдено',item:item};}).concat(entries.length?[]:[{title:'Даних про серії поки немає'}]),'Сезон '+row.season,function(option){if(!option.item)return seasonMenu();showEpisodeInfo(option.item,function(){seasonMenu();});},seasonMenu);
    });
   },self.start);
  }
  function showEpisodeInfo(item,back){
   back=back||self.start;var intent=menuEpoch,profile=watchProfile();ensureSeasonMetadata(Number(item.season),function(){if(destroyed||!active()||intent!==menuEpoch||profile!==watchProfile()||Lampa.Player.opened&&Lampa.Player.opened())return;var info=episodeInfo(item)||item,groups=continueGroups({item:item}),rows=[{title:info.name||'Серія '+item.season+'×'+item.episode,subtitle:info.overview||'Опису цієї серії поки немає.',info:true}];
    if(futureEpisode(info))rows.push({title:'Очікується '+displayDate(info.air_date),info:true});else if(groups.length)rows.push({title:'Дивитися серію',play:true});
    rows.push({title:'Назад',back:true});select(rows,'Серія '+item.season+'×'+item.episode,function(row){if(row.play){var progress=watchProgress(timeline(item));return launchContinue({item:item,progress:progress,record:null},'Озвучення серії',progress.unfinished);}if(row.back)return back();showEpisodeInfo(item,back);},back);
   });
  }
  function trackCurrent(item,automatic){
   if(!postVerified||!seriesCard(card)||!item||!item.provider||!sourceEnabled(item.provider))return;
   var key=watchCardKey(card),profile=watchProfile(),muted=get('xot_unfollowed_'+profile,[]);if(automatic&&Array.isArray(muted)&&muted.includes(key))return;
   var list=trackedShows(),existing=list.find(function(row){return watchCardKey(row.card)===key;}),record={card:{id:card.id,name:card.name||title(card),original_name:card.original_name||card.original_title||'',first_air_date:card.first_air_date||'',source:card.source||'tmdb'},provider:item.provider,translation:item.translation||'',language:voiceLanguage(item),episodes:[],pending:[],checked:0,updated:Date.now()};
   var keys=seriesInventory(resumeInventory().filter(function(row){return row.provider===item.provider&&!futureEpisode(episodeInfo(row));}),record);
   if(existing&&existing.provider===record.provider&&favoriteIdentity(existing)===favoriteIdentity(record)){record=mergeSeriesCheck(existing,keys);record.updated=Date.now();}
   else record.episodes=keys;
   record.pending=record.pending.filter(function(value){return value!==episodeKey(item);});
   if(!automatic&&Array.isArray(muted))set('xot_unfollowed_'+profile,muted.filter(function(value){return value!==key;}));
   storeTrackedShows([record].concat(list.filter(function(row){return watchCardKey(row.card)!==key;})));updateUpdatesBadge();
  }
  function updateCurrentTracking(){
   if(!postVerified||!seriesCard(card))return;
   var list=trackedShows(),record=list.find(function(row){return watchCardKey(row.card)===watchCardKey(card);});if(!record)return;
   if(sourceId==='all'&&!allGroups.some(function(group){return group.source.id===record.provider&&group.status==='ready';}))return;
   if(sourceId!=='all'&&sourceId!==record.provider)return;
   var items=resumeInventory().filter(function(item){return item.provider===record.provider&&!futureEpisode(episodeInfo(item));}),keys=seriesInventory(items,record);if(!keys.length)return;
   var merged=mergeSeriesCheck(record,keys);if(JSON.stringify(merged.episodes)===JSON.stringify(record.episodes)&&JSON.stringify(merged.pending)===JSON.stringify(record.pending))return;
   storeTrackedShows(list.map(function(row){return row===record?merged:row;}));
  }
  function updateUpdatesBadge(){
   if(destroyed)return;var count=trackedShows().reduce(function(sum,row){return sum+row.pending.length;},0),button=filter.render().find('.filter--filter');button.find('.xot-updates-count').remove();
   if(count)$('<span class="xot-updates-count"></span>').text(count>99?'99+':count).attr('aria-label','Нових серій: '+count).appendTo(button);
  }
  function updatesMenu(){
   var profile=watchProfile(),list=trackedShows().filter(function(row){return row.pending.length;}),rows=list.map(function(record){return {title:safeText(title(record.card)),subtitle:'Нових серій: '+record.pending.length+' · '+safeText(record.translation||record.provider),record:record};});
   if(!rows.length)rows.push({title:'Нових серій поки не знайдено',subtitle:'Перевіряємо доступність у збереженому джерелі й озвученні',info:true});
   rows.push({title:'Перевірити оновлення',subtitle:'До 3 серіалів за одну перевірку',check:true});rows.push({title:'Автоперевірка: '+(get('xot_updates_enabled',true)?'увімкнено':'вимкнено'),toggle:true});rows.push({title:'Назад',back:true});
   select(rows,'Нові серії',function(row){
    if(destroyed||profile!==watchProfile())return self.start();
    if(row.back)return self.start();if(row.toggle){set('xot_updates_enabled',!get('xot_updates_enabled',true));return updatesMenu();}
    if(row.check){watchNotice('Перевіряємо оновлення серіалів…');checkUpdates(true,function(){if(!destroyed&&active())watchNotice('Перевірку серіалів завершено.');});self.start();return;}
    if(row.info)return updatesMenu();
    var record=row.record;select([{title:'Відкрити серіал',subtitle:record.pending.map(function(key){return key.replace('|','×');}).join(', ').slice(0,240),open:true},{title:'Позначити оновлення прочитаними',read:true},{title:'Назад',back:true}],safeText(title(record.card)),function(option){
     if(destroyed||profile!==watchProfile())return self.start();
     if(option.open)return open(record.card);if(option.read){var latest=trackedShows();storeTrackedShows(latest.map(function(current){return watchCardKey(current.card)===watchCardKey(record.card)?Object.assign({},current,{pending:[]}):current;}));updateFilter();}updatesMenu();
    },updatesMenu);
   },self.start);
  }
  function trackingMenu(){
   var profile=watchProfile(),key=watchCardKey(card),record=trackedShows().find(function(row){return watchCardKey(row.card)===key;}),groups=resumeInventory(),target=watchFocus||groups.find(function(item){return selectionVoice(item)===voice;})||groups[0];
   select([{title:record?'Не відстежувати цей серіал':'Відстежувати цей серіал',subtitle:record?record.provider+' · '+record.translation:'За обраним джерелом та озвученням',toggle:true},{title:'Нові серії',updates:true},{title:'Назад',back:true}],'Оновлення серіалу',function(row){
    if(destroyed||profile!==watchProfile())return self.start();
    if(row.back)return self.start();if(row.updates)return updatesMenu();
    if(record){storeTrackedShows(trackedShows().filter(function(row){return watchCardKey(row.card)!==key;}));var muted=get('xot_unfollowed_'+watchProfile(),[]);set('xot_unfollowed_'+watchProfile(),Array.from(new Set((Array.isArray(muted)?muted:[]).concat([key]))).slice(-100));}
    else if(target)trackCurrent(target,false);else watchNotice('Спочатку знайди доступні серії.');
    updateFilter();trackingMenu();
   },self.start);
  }
  function checkUpdates(force,done){
   if(updatesStarted||destroyed)return done&&done();if(!force&&!get('xot_updates_enabled',true))return;
   var profile=watchProfile(),list=trackedShows().filter(function(row){return sourceEnabled(row.provider)&&sources.some(function(s){return s.id===row.provider&&s.id!=='rezka';})&&(force||Date.now()-row.checked>600000);}).sort(function(a,b){return a.checked-b.checked||b.updated-a.updated;}).slice(0,3);if(!list.length)return done&&done();
   updatesStarted=true;
   function check(record){
    var jobController=new AbortController(),cancel=function(){jobController.abort();},timer=setTimeout(cancel,12000),operation={signal:jobController.signal};updatesController.signal.addEventListener('abort',cancel,{once:true});
    var queries=names(record.card).slice(0,2),movie={titles:names(record.card),year:String(record.card.first_air_date||'').slice(0,4),series:true},found=[];
    var currentRecords=trackedShows();storeTrackedShows(currentRecords.map(function(row){return watchCardKey(row.card)===watchCardKey(record.card)?Object.assign({},row,{checked:Date.now()}):row;}));
    function search(index){
     if(index>=queries.length)return Promise.resolve();
     return (force?request(record.provider,'search',{title:queries[index],movie:movie},operation.signal):cachedSearch(record.provider,{title:queries[index],movie:movie},operation.signal).then(function(result){return result.data;})).then(function(data){found=(data.results||[]).filter(function(item){return matches(item,record.card);});return found.length===1?null:search(index+1);});
    }
    return search(0).then(function(){if(found.length!==1)return null;return request(record.provider,'post',{id:found[0].id,path:found[0].path,movie:movie},operation.signal);}).then(function(data){
     if(!data||destroyed||profile!==watchProfile()||updatesController.signal.aborted)return;
     var keys=seriesInventory((data.items||[]).filter(streamItem),record);if(!keys.length)return;
     return checkEpisodeDates(record.card,keys,operation.signal).then(function(aired){if(destroyed||profile!==watchProfile()||operation.signal.aborted)return;var latest=trackedShows();storeTrackedShows(latest.map(function(row){return watchCardKey(row.card)===watchCardKey(record.card)&&row.provider===record.provider&&favoriteIdentity(row)===favoriteIdentity(record)?mergeSeriesCheck(row,aired):row;}));});
    }).catch(function(){}).then(function(){clearTimeout(timer);updatesController.signal.removeEventListener('abort',cancel);});
   }
   // Small bounded metadata checks; no periodic polling or video manifest loads.
   var chain=Promise.resolve();list.forEach(function(record){chain=chain.then(function(){if(destroyed||profile!==watchProfile())return;return check(record);});});
   chain.then(function(){updatesStarted=false;if(destroyed||profile!==watchProfile())return;updateFilter();if(done)done();});
  }
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
   controls.push({title:'Зручний перегляд',subtitle:'Профілі якості, сортування, субтитри'+(seriesCard(card)?', заставка':''),action:'comfort'});
   if(seriesCard(card))controls.push({title:'Серії та сезони',subtitle:'Назви, дати виходу й опис серій',action:'episode_details'});
   if(seriesCard(card))controls.push({title:'Відстеження серіалу',action:'tracking'});
   if(trackedShows().length)controls.push({title:'Нові серії · '+trackedShows().reduce(function(sum,row){return sum+row.pending.length;},0),action:'updates'});
   if(watchEntries().length)controls.push({title:'Позначки перегляду',subtitle:'Дії для серії та сезону · також утримуй OK на рядку',action:'watch_controls'});
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
   updateUpdatesBadge();
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
   finish();updateFilter();self.start();if(season)ensureSeasonMetadata(season);
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
   var groups=rankedGroups(displayGroups(scoped,sourceId==='all'),order);
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
   updateCurrentTracking();updateFilter();self.start();if(season)ensureSeasonMetadata(season);
  }
  function timeline(item){
   if(!postVerified||!Lampa.Timeline||typeof Lampa.Timeline.view!=='function')return null;
   var hash=watchHash(card,item);if(hash===null)return null;watchHashes.add(String(hash));
   var meta=null;try{if(Lampa.Timeline.link){var linked=seriesCard(card)?Object.assign({},card,{original_name:card.original_name||card.original_title||card.name}):card;meta=Lampa.Timeline.link(linked,item.season,item.episode);}}catch(e){}
   return Lampa.Timeline.view(hash,meta);
  }
  function watchRowKey(item){return [watchHash(card,item),item.provider||'',voiceKey(item)].join('|');}
  function watchRow(row,item){
   if(source().kind==='catalog'&&!matches(item,card))return row;
   var mark=timeline(item),progress=watchProgress(mark);if(!mark)return row;
   row.data('xot-watch-item',item).attr('data-xot-watch',mark.hash).addClass('xot-watch-editable');
   metadataRow(row,item);
   if(restoreWatchFocus!==null&&watchRowKey(item)===restoreWatchFocus){last=row[0];restoreWatchFocus=null;}
   row.on('hover:long contextmenu',function(event){if(event){event.preventDefault();event.stopPropagation();}suppressRowEnterUntil=Date.now()+900;watchFocus=item;last=row[0];watchMenu(item);});
   if(!progress.time&&!progress.percent)return row;
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
  function watchEntries(){
   if(!postVerified||source().kind==='catalog'&&!streams.some(function(item){return matches(item,card);}))return [];
   var candidates=new Map();
   resumeInventory().concat(unavailable.filter(function(item){return source().kind!=='catalog'||matches(item,card);})).forEach(function(item){var key=[item.season||0,item.episode||0].join('|');if(!candidates.has(key))candidates.set(key,{item:item,record:null});});
   watchHistory().filter(function(row){return row.card===watchCardKey(card);}).forEach(function(record){var key=[record.season,record.episode].join('|'),candidate=candidates.get(key);if(!candidate){candidate={item:record,record:null};candidates.set(key,candidate);}if(!candidate.record||candidate.record.updated<record.updated)candidate.record=record;});
   return Array.from(candidates.values()).map(function(row){return {item:row.item,record:row.record,progress:watchProgress(timeline(row.item))};});
  }
  function resumeTarget(){return latestUnfinished(watchEntries());}
  function watchNotice(message){
   clearTimeout(watchNoticeTimer);if(watchNoticeNode)watchNoticeNode.remove();
   if(destroyed||!active())return;
   watchNoticeNode=$('<div class="xot-watch-notice" role="status" aria-live="polite"></div>').text(message).appendTo('body');
   watchNoticeTimer=setTimeout(function(){if(watchNoticeNode)watchNoticeNode.remove();watchNoticeNode=null;},2800);
  }
  function undoJournal(){
   var journal=get('xot_watch_undo_'+watchProfile(),null);
   if(!journal||journal.card!==watchCardKey(card)||!Array.isArray(journal.items)||journal.items.length>2000)return null;
   if(!journal.items.every(function(entry){return entry&&entry.before&&entry.after&&sameWatchValues(watchValues(entry.before),entry.before)&&sameWatchValues(watchValues(entry.after),entry.after)&&Number.isFinite(entry.season)&&entry.season>=0&&Number.isFinite(entry.episode)&&entry.episode>=0&&String(entry.hash)===String(watchHash(card,entry));}))return null;
   return journal.items.some(function(entry){return entry.applied;})?journal:null;
  }
  function watchMenu(item,seasonMode){
   if(watchEditing)return watchNotice('Зберігаємо позначки…');
   if(!postVerified)return self.start();
   var profile=watchProfile(),entries=watchEntries(),target=item||watchFocus||entries[0]&&entries[0].item;
   if(!target)return self.start();
   var series=seriesCard(card),n=Number(target.season)||season,rows=[],progress=watchProgress(timeline(target)),batch=entries.filter(function(row){return row.item.season===n;});
   if(seasonMode){
    rows.push({title:'Позначити серії переглянутими',subtitle:batch.length+' відомих серій · усі озвучення',watched:true});
    rows.push({title:'Скинути позначки серій',subtitle:'Сезон '+n+' · '+batch.length+' відомих серій',watched:false});
   }else{
    if(!progress.watched)rows.push({title:'Позначити переглянутим',watched:true});
    if(progress.time||progress.percent)rows.push({title:progress.watched?'Позначити не переглянутим':'Скинути прогрес',watched:false});
    if(series&&batch.length)rows.push({title:'Позначки сезону '+n,subtitle:batch.length+' відомих серій',season:true});
    if(series)rows.push({title:'Про серію',details:true});
    if(series)rows.push({title:'Обрати іншу серію',episodes:true});
   }
   if(undoJournal())rows.push({title:'Скасувати останню зміну',undo:true});
   rows.push({title:'Готово',done:true});
   select(rows,seasonMode?'Сезон '+n:series?'Серія '+target.season+'×'+target.episode:'Позначки фільму',function(option){
    if(profile!==watchProfile()||destroyed)return self.start();
    if(option.done)return self.start();if(option.undo)return changeWatch([],false,true);
    if(option.details)return showEpisodeInfo(target,function(){watchMenu(target);});
    if(option.season)return watchMenu(target,true);
    if(option.episodes)return select(entries.slice().sort(function(a,b){return (a.item.season||0)-(b.item.season||0)||(a.item.episode||0)-(b.item.episode||0);}).map(function(row){return {title:'Серія '+row.item.season+'×'+row.item.episode,subtitle:row.progress.watched?'Переглянуто':row.progress.unfinished?'Продовжити з '+watchTime(row.progress.time):'',item:row.item};}),'Позначки серій',function(option){watchMenu(option.item);},function(){watchMenu(target);});
    changeWatch(seasonMode?batch.map(function(row){return row.item;}):[target],option.watched,false,target);
   },self.start);
  }
  function changeWatch(items,watched,undo,target){
   if(destroyed||!active()||watchEditing||Lampa.Player.opened&&Lampa.Player.opened())return;
   var profile=watchProfile(),key='xot_watch_undo_'+profile,journal=undo?undoJournal():{card:watchCardKey(card),created:Date.now(),items:[]},skipped=0,index=0;
   if(!journal)return self.start();
   if(!undo){
    var seen=new Set();items.forEach(function(item){var mark=timeline(item);if(!mark||typeof mark.handler!=='function'||seen.has(String(mark.hash)))return;seen.add(String(mark.hash));var before=watchValues(mark),after=watched?{percent:100,time:before.duration||before.time,duration:before.duration}:{percent:0,time:0,duration:before.duration};if(!sameWatchValues(before,after))journal.items.push({hash:mark.hash,season:Number(item.season)||0,episode:Number(item.episode)||0,before:before,after:after,applied:false});});
    if(!journal.items.length)return self.start();
   }
   if(journal.items.length>2000)return watchNotice('Забагато серій для однієї зміни.');
   function persist(){Lampa.Storage.set(key,journal);if(JSON.stringify(get(key,null))!==JSON.stringify(journal))throw Error('storage');}
   try{persist();}catch(e){watchNotice('Не вдалося зберегти скасування. Позначки не змінено.');return self.start();}
   watchEditing=true;cancelPlayback();clearTimeout(progressTimer);suppressRowEnterUntil=Date.now()+600;
   var anchor=target||watchFocus;if(anchor)restoreWatchFocus=watchRowKey(anchor);
   function finishEdit(message){watchEditing=false;suppressRowEnterUntil=Date.now()+600;if(!destroyed&&profile===watchProfile()&&active()){watchNotice(message);refreshAfterPlayer();}}
   function chunk(){
    if(destroyed||profile!==watchProfile())return finishEdit('Зміну зупинено.');
    try{
     var end=Math.min(index+12,journal.items.length);
     for(;index<end;index++){
      var entry=journal.items[index],mark=timeline(entry);if(!mark||typeof mark.handler!=='function'){skipped++;continue;}
      if(undo&&(!undoEligible(mark,entry)||watchHistory().some(function(record){return record.card===journal.card&&record.season===entry.season&&record.episode===entry.episode&&record.updated>journal.created;}))){skipped++;entry.applied=false;continue;}
      var values=undo?entry.before:entry.after;mark.handler(values.percent,values.time,values.duration);
      var saved=timeline(entry);entry.after=watchValues(saved);entry.updated=Number(saved.updated)||0;entry.applied=!undo;
     }
     persist();
    }catch(e){return finishEdit('Не всі позначки збережено. Перевір результат у списку.');}
    if(index<journal.items.length)return setTimeout(chunk,0);
    finishEdit(undo?'Зміну скасовано'+(skipped?' · новіший прогрес збережено':''):'Позначки збережено · скасувати можна у меню перегляду');
   }
   chunk();
  }
  function continueGroups(target){
   var order=orderedSources(sources).map(function(s){return s.id;});
   return rankedGroups(displayGroups(resumeInventory().filter(function(item){return !futureEpisode(episodeInfo(item))&&(item.season||0)===(target.item.season||0)&&(item.episode||0)===(target.item.episode||0);}).sort(function(a,b){return order.indexOf(a.provider)-order.indexOf(b.provider);}),false),order);
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
   var target=resumeTarget();if(!target)return appendNext();
   var groups=continueGroups(target),choice=continueChoice(groups,target),episode=target.item.episode?' · '+target.item.season+'×'+target.item.episode:'';
   var note=watchTime(target.progress.time)+(target.progress.duration?' із '+watchTime(target.progress.duration):'')+(target.progress.duration||target.progress.percent?' · '+target.progress.percent+'%':'');
   if(groups.length)note+=' · '+(choice?choice.items[0].translation||'Оригінал':'Обери озвучення для продовження');
   else note+=' · '+(sourceId==='all'&&allGroups.some(function(group){return group.status==='loading';})?'Шукаємо цю серію…':'Потік для цього перегляду не знайдено. Вибери інший балансер.');
   var row=line((groups.length?'Продовжити':'Останній перегляд')+episode,note,groups.length?continueWatching:null,!!groups.length).removeClass('xot-native-row').addClass('xot-continue-row');
   row.attr('data-season',target.item.season||0).attr('data-episode',target.item.episode||0);
  }
  function nextTarget(){
   if(sourceId==='all'&&allGroups.some(function(group){return group.status==='loading';}))return null;
   var target=nextUnwatched(watchEntries(),card);return target&&continueGroups(target).length?target:null;
  }
  function appendNext(){
   var target=nextTarget();if(!target)return;
   var navigation=target.mode==='season',label=navigation?'Наступний сезон · '+target.item.season:'Наступна непереглянута · '+target.item.season+'×'+target.item.episode;
   if(navigation&&season===target.item.season)return;
   var choice=continueChoice(continueGroups(target),target);
   line(label,navigation?'Відкрити список серій':choice?choice.items[0].translation||'Оригінал':'Обери озвучення перед переглядом',function(){
    var fresh=nextTarget();if(!fresh)return refreshAfterPlayer();
    if(fresh.mode==='season'){season=fresh.item.season;if(sourceId==='rezka')drawEpisodes();else drawStreams();return;}
    launchContinue(fresh,'Озвучення наступної серії',false);
   },!navigation).removeClass('xot-native-row').addClass('xot-next-row').attr('data-season',target.item.season).attr('data-episode',target.item.episode);
  }
  function continueWatching(){
   var target=resumeTarget();if(!target)return notify('Незавершеного перегляду не знайдено.');
   launchContinue(target,'Озвучення для продовження',true);
  }
  function launchContinue(target,heading,resume){
   var groups=continueGroups(target);if(!groups.length)return notify('Для цього перегляду зараз немає доступного потоку.');
   function launch(group,manualChoice){var item=group.items[0];season=item.season||null;voice=selectionVoice(item);if(manualChoice)saveVoice();playGroup(group.items,resume?target.progress:null);}
   var choice=continueChoice(groups,target);if(choice)return launch(choice,false);
   select(groups.map(function(group){var item=group.items[0];return {title:safeText((item.xot_source_name||item.source||item.provider)+' · '+(item.translation||'Оригінал')),group:group};}),heading,function(row){launch(row.group,true);},self.start);
  }
  function qualityPreference(){return qualityLimit();}
  function choosePreferredQuality(back){
   back=typeof back==='function'?back:self.start;
   select([2160,1440,1080,720,480].map(function(q){return {title:q+'p',value:q,selected:q===qualityPreference()};}),'Бажана якість',function(item){set('xot_quality_profile','custom');set('video_quality_default',item.value);updateFilter();watchNotice('Якість збережено: '+item.value+'p');back();},back);
  }
  function playerData(){try{return Lampa.Player.playdata&&Lampa.Player.playdata();}catch(e){return null;}}
  function onPlayerQuality(event){
   var data=playerData();if(!data||data.xot_owner!==owner)return;
   var value=/^\d+p?$/i.test(event.name)?parseInt(event.name):null;
   if(value!==null&&[480,720,1080,1440,2160].includes(value)){set('xot_quality_profile','custom');set('video_quality_default',value);delete data.xot_backup_declined;armStartup(data);updateFilter();}
  }
  function onPlayerCreate(event){
   var data=event.data;if(!data||data.xot_owner!==owner||!data.quality)return;
   var choices=Object.keys(data.quality).map(function(key){return {quality:key,url:typeof data.quality[key]==='string'?data.quality[key]:data.quality[key].url};});
   var selected=chooseQuality(choices,qualityPreference());if(selected.url)data.url=selected.url;
  }
  function onPlayerStart(data){
   menuEpoch++;
   playingOwned=!!data&&data.xot_owner===owner;if(!playingOwned){cancelBackup();removePlayerControls();return;}
   removePlayerControls();clearTimeout(readyTimer);
   data.xot_started=Date.now();
   ownedWork=data;watchStarted=false;lastWatchSave=0;
   var key=[data.season||0,data.episode||0].join('|');if(key!==backupEpisode){backupEpisode=key;failedFamilies.clear();}
   lastPosition=Number(data.xot_resume)||0;armStartup(data);
  }
  function onPlayerReady(data){
   if(data&&data.xot_owner===owner){installPlayerControls(data);applySubtitleOptions(data);clearTimeout(readyTimer);readyTimer=setTimeout(function(){applySubtitleOptions(data);},100);}
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
  function onVideoSubs(){var data=playerData();if(!data||data.xot_owner!==owner)return;clearTimeout(readyTimer);readyTimer=setTimeout(function(){applySubtitleOptions(data);},0);}
  function onCanPlay(){
   var data=playerData();if(!data||data.xot_owner!==owner)return;clearTimeout(bootTimer);
   if(data.xot_resume>0&&!data.xot_resume_applied){
    data.xot_resume_applied=true;var video=Lampa.PlayerVideo.video(),duration=Number(video.duration)||Infinity;
    if(data.timeline){data.timeline.continued=true;data.timeline.continued_bloc=true;data.timeline.waiting_for_user=false;}
    Lampa.PlayerVideo.to(Math.max(0,Math.min(data.xot_resume,duration-3)));
   }
  }
  function saveWatchMetadata(data){if(data&&data.xot_verified&&data.xot_profile===watchProfile()&&data.xot_item){rememberWatch(card,data.xot_item);if(data.episode)trackCurrent(data.xot_item,true);}}
  function onTimeUpdate(event){
   var data=playerData();if(!data||data.xot_owner!==owner||!Number.isFinite(event.current)||event.current<0)return;
   lastPosition=event.current;if(event.current>0){clearTimeout(bootTimer);if(Number.isFinite(event.duration)&&event.duration>0)recordSourceHealth(data,true,Date.now()-(data.xot_started||Date.now()));}updateIntroButton();
   if(event.current>0&&Number.isFinite(event.duration)&&event.duration>0&&data.timeline&&!data.timeline.waiting_for_user&&!data.timeline.stop_recording){
    watchStarted=true;if(Date.now()-lastWatchSave>=10000){saveWatchMetadata(data);lastWatchSave=Date.now();}
   }
  }
  function onTimelineUpdate(event){
   if(destroyed||event&&event.data&&event.data.hash!==undefined&&!watchHashes.has(String(event.data.hash)))return;
   progressDirty=true;clearTimeout(progressTimer);if(watchEditing)return;progressTimer=setTimeout(function(){if(active()&&!(Lampa.Player.opened&&Lampa.Player.opened())&&!$('body').hasClass('selectbox--open'))refreshAfterPlayer();},100);
  }
  function refreshAfterPlayer(){
   if(destroyed||watchEditing||Lampa.Player.opened&&Lampa.Player.opened())return;
   clearTimeout(progressTimer);progressDirty=false;
   if(sourceId==='all')refreshAggregate();else if(state==='streams')drawStreams();else if(state==='episodes')drawEpisodes();else if(state==='translations')drawRezkaVoices();
   restoreWatchFocus=null;
  }
  function onPlayerDestroy(){
   clearTimeout(readyTimer);removePlayerControls();
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
   recordSourceHealth(work,false,0);
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
   var subtitles=publishedSubtitles(item);if(subtitles.length)play.subtitles=subtitles;
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
   else load=request(which,'stream',Object.assign({},first,{subtitles:undefined,subtitle:undefined}),task.controller.signal);
   load.then(function(data){
    if(!valid())return;
    var resolved=(data.items||[]).filter(function(item){return media(item.url)&&!item.needs_resolve;}).map(function(item){return Object.assign({},item,{provider:which,xot_source_name:first.xot_source_name,subtitles:item.subtitles||first.subtitles||first.subtitle});});
    if(!resolved.length)throw Error('eneyida_stream_unavailable');
    if(loading&&which!=='rezka')streams=streams.filter(function(item){return !(item.provider===first.provider&&item.url===first.url&&item.season===first.season&&item.episode===first.episode&&voiceKey(item)===voiceKey(first));}).concat(resolved);
    finishTask();try{done(resolved);}catch(error){fail(error);}
   }).catch(function(error){if(valid()){finishTask();fail(error);}});
  }
  function playbackFailed(error){
   var data=playerData();if(data&&data.xot_owner===owner&&Lampa.Player.opened&&Lampa.Player.opened())Lampa.Player.close();
   if(data&&data.xot_owner===owner)recordSourceHealth(data,false,0);
   if(!destroyed){if(sourceId==='rezka'){if(post.series)drawEpisodes();else drawRezkaVoices();}else drawStreams();notify(readableError(error));}
  }
  function playlistFor(items,play){
   var first=items[0],inventory=streams;
   if(first.provider==='rezka'&&first.episode&&rezkaVoice)inventory=episodeList.reduce(function(list,group){return list.concat(group.episodes.map(function(n){return {provider:'rezka',title:post.title,translation:rezkaVoice.title,season:group.season,episode:n,needs_resolve:true,xot_rezka_voice:rezkaVoice,xot_post_id:post.id};}));},[]);
   var groups=first.episode?episodeGroups(inventory.filter(function(item){return !futureEpisode(episodeInfo(item));}),first):[];
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
   if(Lampa.PlayerVideo&&Lampa.PlayerVideo.listener){Lampa.PlayerVideo.listener.follow('canplay',onCanPlay);Lampa.PlayerVideo.listener.follow('timeupdate',onTimeUpdate);Lampa.PlayerVideo.listener.follow('subs',onVideoSubs);}
   if(Lampa.Timeline&&Lampa.Timeline.listener){Lampa.Timeline.listener.follow('update',onTimelineUpdate);Lampa.Timeline.listener.follow('read',onTimelineUpdate);}
   var voiceActivated=0;voiceButton.on('hover:enter click',function(){var now=Date.now();if(now-voiceActivated<450)return;voiceActivated=now;chooseVoice();});
   filter.onSearch=function(value){query=String(value||'').trim();if(!query)return;manual=true;params.search=query;filter.render().find('.filter--search div').text(query);lookup();};
   filter.onBack=function(){self.start();};
   filter.onSelect=function(type,a){
    menuEpoch++;
    if(type==='sort')return self.changeSource(a.id);
    closeSelect();
    if(a.action==='retry')return retrySearch();
    if(a.action==='sources')return manageSources();
    if(a.action==='diagnostics')return showDiagnostics();
    if(a.action==='favorite_voices')return manageFavoriteVoices();
    if(a.action==='comfort')return comfortMenu();
    if(a.action==='episode_details')return seasonMenu();
    if(a.action==='tracking')return trackingMenu();
    if(a.action==='updates')return updatesMenu();
    if(a.action==='watch_controls')return watchMenu();
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
   Promise.resolve().then(function(){if(!destroyed){lookup();checkUpdates(false);}});
   return self.render();
  };
  this.render=function(){return files.render();};
  this.start=function(){
   if(destroyed||watchEditing||!active()||Lampa.Player.opened&&Lampa.Player.opened())return;
   if(progressDirty&&!$('body').hasClass('selectbox--open')&&['streams','episodes','translations'].indexOf(state)>=0)return refreshAfterPlayer();
   Lampa.Controller.add('content',{toggle:focus,up:function(){if(window.Navigator&&Navigator.canmove('up'))Navigator.move('up');else Lampa.Controller.toggle('head');},down:function(){if(window.Navigator)Navigator.move('down');},left:function(){if(window.Navigator&&Navigator.canmove('left'))Navigator.move('left');else if(files.toggle)files.toggle();},right:function(){if(window.Navigator)Navigator.move('right');},back:self.back});
   if(!$('body').hasClass('selectbox--open')&&!$('body').hasClass('settings--open'))Lampa.Controller.toggle('content');
  };
  this.back=function(){if(state==='pair')lookup();else if(Lampa.Activity.backward)Lampa.Activity.backward();};
  this.pause=function(){};this.stop=function(){};
  this.destroy=function(){
   var playing=playerData();if(playing&&playing.xot_owner===owner&&Lampa.Player.opened&&Lampa.Player.opened())Lampa.Player.close();
   destroyed=true;stopRequests();providerController.abort();updatesController.abort();metadataSerial++;metadataTimers.forEach(clearTimeout);clearTimeout(readyTimer);removePlayerControls();clearTimeout(providerTimer);clearTimeout(progressTimer);clearTimeout(watchNoticeTimer);if(watchNoticeNode)watchNoticeNode.remove();
   if(Lampa.PlayerPanel&&Lampa.PlayerPanel.listener)Lampa.PlayerPanel.listener.remove('quality',onPlayerQuality);
   if(Lampa.Player.listener){Lampa.Player.listener.remove('create',onPlayerCreate);Lampa.Player.listener.remove('start',onPlayerStart);Lampa.Player.listener.remove('ready',onPlayerReady);Lampa.Player.listener.remove('destroy',onPlayerDestroy);}
   if(Lampa.PlayerVideo&&Lampa.PlayerVideo.listener){Lampa.PlayerVideo.listener.remove('canplay',onCanPlay);Lampa.PlayerVideo.listener.remove('timeupdate',onTimeUpdate);Lampa.PlayerVideo.listener.remove('subs',onVideoSubs);}
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
var style=document.createElement('style');style.textContent='.xot--voice>div{max-width:14em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.xot-native-row,.xot-continue-row,.xot-next-row{position:relative;padding:1.05em 1.2em;margin:.4em 0;border-radius:.4em;background:rgba(255,255,255,.055)}.xot-native-row__title{font-size:1.28em;line-height:1.35}.xot-native-row__note{opacity:.65;margin-top:.35em;font-size:.9em}.xot-native-row.focus,.xot-continue-row.focus,.xot-next-row.focus{outline:.18em solid #fff;background:rgba(255,255,255,.1)}.xot-updates-count{display:inline-block;font-size:.65em;line-height:1.5;min-width:1.5em;text-align:center;margin-left:.6em;border:1px solid rgba(255,255,255,.3);border-radius:1em;opacity:.8}.xot-episode-meta{font-size:.82em;opacity:.65;margin-top:.4em;line-height:1.35}.xot-watch-status{font-size:.82em;opacity:.65;margin-top:.5em}.xot-watch-progress.time-line{position:relative;inset:auto;height:.18em;margin-top:.65em;border-radius:.2em;overflow:hidden;background:rgba(255,255,255,.12)}.xot-watch-progress>div{height:100%;background:rgba(255,255,255,.65)}.xot-continue-row,.xot-next-row{background:rgba(255,255,255,.075);border-left:.16em solid rgba(255,255,255,.3);margin-bottom:.8em}.xot-watch-notice{position:fixed;right:2em;bottom:2em;max-width:30em;padding:.9em 1.1em;border-radius:.4em;border:1px solid rgba(255,255,255,.15);background:rgba(30,30,30,.94);color:#eee;font-size:.9em;line-height:1.4;z-index:200;pointer-events:none}.xot-watch-editable{padding-right:2.5em}.xot-watch-editable.focus:after{content:"⋯";position:absolute;right:.7em;top:.7em;opacity:.55;font-size:1.2em}';document.head.appendChild(style);
Lampa.Listener.follow('full',function(e){if(e&&['complite','complete','render'].indexOf(e.type)>=0){buttonTimers.forEach(clearTimeout);buttonTimers=[setTimeout(function(){button(e);},0),setTimeout(function(){button(e);},350),setTimeout(function(){button(e);},1500)];}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(button,300);},{once:true});else setTimeout(button,300);
console.info('[XOT] Independent balancers '+VERSION);
})();
