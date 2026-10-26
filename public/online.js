(function () {
'use strict';
if (!window.Lampa || window.__XOT_ONLINE_INITIALIZED__) return;
var VERSION='0.3.3', DEFAULT_API='https://xot-online.ai-beta69690.workers.dev';
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
var BASE_SOURCES=[{id:'filmix',title:'Filmix',kind:'native'},{id:'eneyida',title:'Eneyida',kind:'native'},{id:'rezka',title:'HDRezka',kind:'native'},{id:'anilibria',title:'AniLibria · аніме',kind:'native'}];
var lastCard=null,buttonTimers=[];
function notify(message){if(Lampa.Noty)Lampa.Noty.show(message);}
function get(key,fallback){try{return Lampa.Storage.get(key,fallback);}catch(e){return fallback;}}
function set(key,value){try{Lampa.Storage.set(key,value);}catch(e){}}
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
 return [item.title,item.original_title].filter(Boolean).map(normalized).some(function(value){return expected.indexOf(value)>=0;});
}
function voiceKey(item){return item.voice_id||item.translation||'Оригінал';}

function safeText(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function media(value){try{var u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&/\.(?:m3u8|mp4|mpd)(?:$|:hls:)/i.test(u.pathname);}catch(e){return false;}}
function identity(){
 var id=get('xot_filmix_device_id','');if(/^[a-f0-9]{32}$/.test(id))return id;
 var bytes=new Uint8Array(16);
 if(window.crypto&&window.crypto.getRandomValues)window.crypto.getRandomValues(bytes);else for(var i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);
 id=Array.prototype.map.call(bytes,function(n){return ('0'+n.toString(16)).slice(-2);}).join('');set('xot_filmix_device_id',id);return id;
}
function preferredSource(card){
 var saved=get('xot_native_last_sources',{}),id=saved[card.id]||get('xot_native_source','filmix');
 return /^[a-z][a-z0-9_]{1,40}$/.test(id)?id:'filmix';
}
function readableError(error){
 var code=error&&error.message||String(error||'');
 var eneyidaErrors={eneyida_movie_mismatch:'Сторінка Eneyida не відповідає вибраному фільму. Уточни назву через пошук угорі.',eneyida_access_denied:'Eneyida обмежила доступ. Спробуй інший балансер.',eneyida_timeout:'Eneyida не відповіла вчасно.',eneyida_player_not_found:'На сторінці Eneyida не знайдено доступного плеєра.',eneyida_player_format:'Eneyida змінила формат плеєра.',eneyida_invalid_playlist:'Eneyida не повернула придатного відеоплейліста.',eneyida_stream_unavailable:'Для цього фільму або серії Eneyida не повернула відео.',eneyida_unsupported_stream:'Цей формат відео Eneyida поки не підтримується.',eneyida_unavailable:'Eneyida зараз недоступна. Повтори запит або вибери інший балансер.'};
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
  var providerController=new AbortController(),providerTimer=null;
  var state='loading',destroyed=false,created=false,serial=0,controller=null,deadline=null,last=null,candidates=[],streams=[],unavailable=[],qualityCap=null,post=null,rezkaVoice=null,episodeList=[],season=null,voice=null,pairing=null;
  if(!sources.some(function(s){return s.id===sourceId;}))sourceId='filmix';
  function source(){return sources.filter(function(s){return s.id===sourceId;})[0]||sources[0];}
  function current(token){return !destroyed&&token===serial;}
  function active(){try{return Lampa.Activity.active().activity===self.activity;}catch(e){return false;}}
  function focus(){if(!active())return;Lampa.Controller.collectionSet(files.render(),files.render());Lampa.Controller.collectionFocus(last||false,files.render());}
  function stopRequests(){serial++;if(controller)controller.abort();clearTimeout(deadline);controller=null;}
  function begin(){
   stopRequests();controller=new AbortController();
   var token=serial;
   deadline=setTimeout(function(){if(current(token)){stopRequests();showError(Error('request_timeout'));}},24000);
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
  function updateFilter(){
   filter.set('sort',sources.map(function(s){return {title:s.title,id:s.id,selected:s.id===sourceId};}));
   filter.render().find('.filter--sort span').text('Балансер');filter.chosen('sort',[source().title]);
   var controls=[{title:'Повторити пошук',action:'retry'}];
   if(candidates.length>1)controls.push({title:'Вибрати інший збіг',action:'candidates'});
   var seasons=sourceId==='rezka'?episodeList.map(function(s){return s.season;}):Array.from(new Set(streams.concat(unavailable).map(function(s){return s.season;}).filter(Boolean))).sort(function(a,b){return a-b;});
   if(seasons.length)controls.push({title:'Сезон '+(season||seasons[0]),action:'season',seasons:seasons});
   if(sourceId!=='rezka'&&streams.concat(unavailable).some(function(s){return s.season;}))controls.push({title:'Озвучення: '+((streams.concat(unavailable).filter(function(s){return voiceKey(s)===voice;})[0]||{}).translation||'усі'),action:'voice'});
   if(sourceId==='rezka'&&post&&post.series)controls.push({title:'Озвучення: '+(rezkaVoice&&rezkaVoice.title||'обрати'),action:'rezka_voice'});
   if(sourceId==='filmix'){
    controls.push({title:'Filmix · прив’язати пристрій за кодом',action:'pair'});
    if(get('xot_filmix_device_token',''))controls.push({title:'Filmix · від’єднати пристрій',action:'logout'});
   }
   filter.set('filter',controls);
  }
  function showError(error){
   if(destroyed)return;finish();state='error';clear();
   line(source().title+' · джерело недоступне',readableError(error));
   line('Повторити запит','Пошук у вибраному джерелі',lookup);
   line('Вибрати інший балансер',sources.map(function(s){return s.title;}).join(', '),function(){filter.show('Балансер','sort');});
   if(sourceId==='filmix'&&get('xot_filmix_device_token',''))line('Спробувати без акаунта','Видалити локальний токен Filmix і виконати анонімний пошук',function(){set('xot_filmix_device_token','');lookup();});
   updateFilter();self.start();
  }
  function loading(message){state='loading';clear();line(message||'Пошук у '+source().title+'…','');if(self.activity)self.activity.loader(true);updateFilter();}
  function showCandidates(){
   stopRequests();state='candidates';clear();
   if(!candidates.length){line(manual?'Нічого не знайдено':'Не знайдено підтвердженого збігу','Уточни назву через пошук угорі або вибери інший балансер.');line('Повторити пошук','',lookup);}
   candidates.forEach(function(item){line(item.title+(item.year?' ('+item.year+')':''),item.original_title||'Відкрити озвучення і серії',function(){openPost(item);});});
   finish();updateFilter();self.start();
  }
  function lookup(){
   var operation=begin(),which=source();candidates=[];streams=[];unavailable=[];qualityCap=null;post=null;rezkaVoice=null;episodeList=[];season=null;voice=null;
   loading('Пошук у '+which.title+'…');
   var search;
   if(which.kind==='catalog'){
    var p=new URLSearchParams({title:query,provider:which.id});
    if(!manual)names(card).filter(function(n){return n!==query;}).forEach(function(n){p.append('alt',n);});
    if(card.release_date||card.first_air_date)p.set('year',String(card.release_date||card.first_air_date).slice(0,4));
    if(card.id)p.set('tmdb_id',card.id);
    search=jsonRequest('/api/search?'+p,null,operation.signal).then(function(data){
     var failed=(data.provider_status||[]).filter(function(s){return !s.ok;});
     if(!(data.results||[]).length&&failed.length)throw Error(failed[0].error);
     return {catalog:data.results||[]};
    });
   }else{
    var queries=manual?[query]:names(card).slice(0,4);
    search=Promise.all(queries.map(function(name){var payload={title:name};if((which.id==='rezka'||which.id==='eneyida')&&!manual)payload.movie={titles:names(card),year:String(card.release_date||card.first_air_date||'').slice(0,4),series:Boolean(card.name||card.first_air_date||card.media_type==='tv')};return request(which.id,'search',payload,operation.signal).then(function(data){return {items:data.results||[]};}).catch(function(error){return {error:error};});})).then(function(groups){
     var values=[],seen={};
     groups.forEach(function(g){(g.items||[]).forEach(function(item){if(!seen[item.id]){seen[item.id]=true;values.push(item);}});});
     if(!values.length&&groups.some(function(g){return g.error;}))throw groups.filter(function(g){return g.error;})[0].error;
     values=values.filter(function(item){return manual||matches(item,card);});
     values.sort(function(a,b){return Number(matches(b,card))-Number(matches(a,card));});
     return {candidates:values};
    });
   }
   search.then(function(data){
    if(!current(operation.token))return;finish();
    if(data.catalog){streams=data.catalog.filter(function(x){return media(x.url);});state='streams';drawStreams();return;}
    candidates=data.candidates;var exact=candidates.filter(function(item){return matches(item,card);});
    if(which.id==='filmix'&&exact.length){
     var aliases=card.xot_search_titles||[];exact.forEach(function(item){[item.title,item.original_title].forEach(function(name){if(name&&aliases.indexOf(name)<0)aliases.push(name);});});card.xot_search_titles=aliases.slice(0,8);
    }
    if(exact.length===1)return openPost(exact[0]);
    showCandidates();
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function openPost(item){
   var operation=begin();loading('Завантажуємо озвучення '+source().title+'…');
   var payload={id:item.id,path:item.path};
   if(sourceId==='eneyida'&&!manual)payload.movie={titles:names(card),year:String(card.release_date||card.first_air_date||'').slice(0,4),series:Boolean(card.name||card.first_air_date||card.media_type==='tv')};
   request(sourceId,'post',payload,operation.signal).then(function(data){
    if(!current(operation.token))return;finish();post=data;post.title=data.title||item.title;
    if(sourceId!=='rezka'){streams=(data.items||[]).filter(function(x){return media(x.url);});unavailable=data.unavailable||[];qualityCap=data.quality_cap||null;state='streams';drawStreams();}
    else if(data.series){chooseRezkaVoice(data.translations[0]);}
    else{state='translations';drawRezkaVoices();}
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function drawRezkaVoices(){
   clear();state='translations';
   (post.translations||[]).forEach(function(v){line(v.title,'Обрати якість відео',function(){loadRezkaStream(v,null,null);},true);});
   if(!post.translations.length)line('Озвучень не знайдено','Перевір інший балансер.');
   finish();updateFilter();self.start();
  }
  function chooseRezkaVoice(v){
   var operation=begin();rezkaVoice=v;loading('Завантажуємо серії…');
   request('rezka','episodes',{id:post.id,translator_id:v.id},operation.signal).then(function(data){
    if(!current(operation.token))return;finish();episodeList=data.seasons||[];
    if(!episodeList.some(function(s){return s.season===season;}))season=episodeList[0]&&episodeList[0].season;
    state='episodes';drawEpisodes();
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function drawEpisodes(){
   clear();state='episodes';var group=episodeList.filter(function(s){return s.season===season;})[0];
   if(!group)line('Серій не знайдено','Спробуй інше озвучення або балансер.');
   else group.episodes.forEach(function(n){line('Серія '+n,rezkaVoice.title,function(){loadRezkaStream(rezkaVoice,season,n);},true);});
   finish();updateFilter();self.start();
  }
  function loadRezkaStream(v,s,e){
   var operation=begin(),previous=post.series?'episodes':'translations';loading('Отримуємо відео…');
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
   var seasons=Array.from(new Set(streams.concat(unavailable).map(function(s){return s.season;}).filter(Boolean))).sort(function(a,b){return a-b;});
   if(seasons.length&&!seasons.includes(season))season=seasons[0];
   var scoped=streams.filter(function(item){return (!seasons.length||item.season===season)&&(!voice||voiceKey(item)===voice);});
   var groups=new Map();
   scoped.forEach(function(item){var key=[item.season||'',item.episode||'',voiceKey(item)].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
   var locked=unavailable.filter(function(item){return (!seasons.length||item.season===season)&&(!voice||voiceKey(item)===voice);});
   if(!groups.size&&!locked.length)line('Немає доступних потоків','Спробуй інший балансер, озвучення або авторизацію.');
   groups.forEach(function(items){var first=items[0],qualities=items.reduce(function(all,x){return all.concat(x.available_qualities||[x.quality]);},[]).filter(function(v,i,a){return a.indexOf(v)===i;});
    line((first.episode?'Серія '+first.episode+' · ':'')+(first.translation||'Оригінал'),qualities.join(' · '),function(){playGroup(items);},true);
   });
   locked.forEach(function(item){
    var note=item.reason==='quality_limit'?'У API є лише '+(item.available_qualities||[]).join(', ')+'. Поточний ліміт якості — '+qualityCap+'p.':'Для цього озвучення API не повернув придатного HTTPS-потоку.';
    line((item.episode?'Серія '+item.episode+' · ':'')+item.translation,note);
   });
   finish();updateFilter();self.start();
  }
  function timeline(item){
   if(!Lampa.Timeline||!Lampa.Utils.hash)return null;
   return Lampa.Timeline.view(Lampa.Utils.hash(['xot',card.name||card.first_air_date?'tv':'movie',card.id||card.original_title||title(card),item.season||0,item.episode||0].join(':')));
  }
  function playGroup(items){
   if(sourceId==='eneyida'&&items.some(function(item){return item.needs_resolve;})){
    var operation=begin();loading('Перевіряємо якості відео Eneyida…');
    request('eneyida','stream',items[0],operation.signal).then(function(data){
     if(!current(operation.token))return;finish();
     var resolved=(data.items||[]).filter(function(item){return media(item.url)&&!item.needs_resolve;});
     if(!resolved.length)throw Error('eneyida_stream_unavailable');
     var original=items[0];streams=streams.filter(function(item){return !(item.url===original.url&&item.season===original.season&&item.episode===original.episode&&voiceKey(item)===voiceKey(original));}).concat(resolved);
     drawStreams();playGroup(resolved);
    }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError'){drawStreams();notify(readableError(error));}});
    return;
   }
   var quality={};items.forEach(function(item){if(media(item.url))quality[item.quality||'Авто']=item.url;});
   var keys=Object.keys(quality).sort(function(a,b){return (parseInt(b)||0)-(parseInt(a)||0);});
   if(!keys.length)return notify('ХОТ: немає доступного відео');
   var preferred=Number(get('video_quality_default',1080)),key=keys.filter(function(k){return (parseInt(k)||0)<=preferred;})[0]||keys[keys.length-1],item=items[0];
   var play={url:quality[key],quality:quality,title:title(card)+' / '+(item.translation||'Оригінал')+(item.episode?' / '+item.season+'×'+item.episode:''),season:item.season,episode:item.episode,card:card,isonline:true,timeline:timeline(item)};
   try{Lampa.Player.play(play);if(Lampa.Player.playlist)Lampa.Player.playlist([play]);if(card.id&&Lampa.Favorite)Lampa.Favorite.add('history',card,100);}catch(error){notify('ХОТ: не вдалося запустити відео');}
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
   if(!sources.some(function(s){return s.id===id;}))return;
   sourceId=id;params.xot_source=id;set('xot_native_source',id);
   var saved=get('xot_native_last_sources',{});if(card.id){saved[card.id]=id;var keys=Object.keys(saved);if(keys.length>200)delete saved[keys[0]];set('xot_native_last_sources',saved);}
   closeSelect();lookup();
  };
  this.create=function(){
   if(created)return self.render();created=true;
   scroll.body().addClass('torrent-list');files.appendHead(filter.render());files.appendFiles(scroll.render());scroll.minus(files.render().find('.explorer__files-head'));
   filter.onSearch=function(value){query=String(value||'').trim();if(!query)return;manual=true;params.search=query;filter.render().find('.filter--search div').text(query);lookup();};
   filter.onBack=function(){self.start();};
   filter.onSelect=function(type,a){
    if(type==='sort')return self.changeSource(a.id);
    closeSelect();
    if(a.action==='retry')return lookup();
    if(a.action==='candidates')return showCandidates();
    if(a.action==='pair')return beginPair();
    if(a.action==='logout'){set('xot_filmix_device_token','');set('xot_filmix_pending',null);return lookup();}
    if(a.action==='season')return select(a.seasons.map(function(n){return {title:'Сезон '+n,value:n,selected:n===season};}),'Сезон',function(v){season=v.value;if(sourceId==='rezka')drawEpisodes();else drawStreams();},self.start);
    if(a.action==='voice')return select([{title:'Усі озвучення',value:null}].concat(Array.from(new Map(streams.concat(unavailable).map(function(s){return [voiceKey(s),s.translation||'Оригінал'];}))).map(function(v){return {title:safeText(v[1]),value:v[0]};})),'Озвучення',function(v){voice=v.value;drawStreams();},self.start);
    if(a.action==='rezka_voice')return select(post.translations.map(function(v){return {title:safeText(v.title),voice:v};}),'Озвучення',function(v){chooseRezkaVoice(v.voice);},self.start);
   };
   updateFilter();
   providerTimer=setTimeout(function(){providerController.abort();},5000);
   jsonRequest('/api/providers',null,providerController.signal).then(function(data){
    clearTimeout(providerTimer);if(destroyed)return;
    (data.providers||[]).filter(function(p){return p.enabled&&p.id!=='kodik';}).forEach(function(p){sources.push({id:p.id,title:p.name,kind:'catalog'});});
    if(params.xot_source!==sourceId&&sources.some(function(s){return s.id===params.xot_source;}))return self.changeSource(params.xot_source);
    updateFilter();
   }).catch(function(){clearTimeout(providerTimer);});
   // Defer until Lampa attaches the activity to the component.
   Promise.resolve().then(function(){if(!destroyed)lookup();});
   return self.render();
  };
  this.render=function(){return files.render();};
  this.start=function(){
   if(destroyed||!active())return;
   Lampa.Controller.add('content',{toggle:focus,up:function(){if(window.Navigator&&Navigator.canmove('up'))Navigator.move('up');else Lampa.Controller.toggle('head');},down:function(){if(window.Navigator)Navigator.move('down');},left:function(){if(window.Navigator&&Navigator.canmove('left'))Navigator.move('left');else if(files.toggle)files.toggle();},right:function(){if(window.Navigator)Navigator.move('right');},back:self.back});
   if(!$('body').hasClass('selectbox--open')&&!$('body').hasClass('settings--open'))Lampa.Controller.toggle('content');
  };
  this.back=function(){if(state==='pair')lookup();else if(Lampa.Activity.backward)Lampa.Activity.backward();};
  this.pause=function(){};this.stop=function(){};
  this.destroy=function(){destroyed=true;stopRequests();providerController.abort();clearTimeout(providerTimer);filter.destroy();scroll.destroy();files.destroy();};
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
 var existing=area.find('.xot-online-button');if(existing.length){existing.data('xot-card',card);return;}
 var node=$('<div class="full-start__button selector xot-online-button" tabindex="0"><span>ХОТ</span></div>'),activated=0;
 node.data('xot-card',card);
 node.on('hover:enter click',function(){var now=Date.now();if(now-activated<500)return;activated=now;open(node.data('xot-card')||activeCard()||lastCard);});
 node.on('hover:long contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault();activated=Date.now();open(node.data('xot-card')||activeCard()||lastCard,true);});
 area.append(node);
}
if(!registerScreen())return;
window.__XOT_ONLINE_INITIALIZED__=true;
var style=document.createElement('style');style.textContent='.xot-native-row{padding:1.05em 1.2em;margin:.4em 0;border-radius:.4em;background:rgba(255,255,255,.055)}.xot-native-row__title{font-size:1.28em;line-height:1.35}.xot-native-row__note{opacity:.65;margin-top:.35em;font-size:.9em}.xot-native-row.focus{outline:.18em solid #fff;background:rgba(255,255,255,.1)}';document.head.appendChild(style);
Lampa.Listener.follow('full',function(e){if(e&&['complite','complete','render'].indexOf(e.type)>=0){buttonTimers.forEach(clearTimeout);buttonTimers=[setTimeout(function(){button(e);},0),setTimeout(function(){button(e);},350)];}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(button,300);},{once:true});else setTimeout(button,300);
console.info('[XOT] Independent balancers '+VERSION);
})();
