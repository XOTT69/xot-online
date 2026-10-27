(function () {
'use strict';
if (!window.Lampa || window.__XOT_ONLINE_INITIALIZED__) return;
var VERSION='0.3.10', DEFAULT_API='https://xot-online.ai-beta69690.workers.dev';
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
var BASE_SOURCES=[{id:'all',title:'Усі джерела',kind:'aggregate'},{id:'filmix',title:'Filmix',kind:'native'},{id:'eneyida',title:'Eneyida',kind:'native'},{id:'kinovezha',title:'KinoVezha',kind:'native'},{id:'uaserials',title:'UASerials',kind:'native'},{id:'rezka',title:'HDRezka',kind:'native'},{id:'anilibria',title:'AniLibria · аніме',kind:'native'}];
var lastCard=null,buttonTimers=[],screenCounter=0;
function notify(message){if(Lampa.Noty)Lampa.Noty.show(message);}
function get(key,fallback){try{
 if(Lampa.Storage.value){var raw=Lampa.Storage.value(key);if(raw==='false')return false;if(raw==='true')return true;}
 return Lampa.Storage.get(key,fallback);
}catch(e){return fallback;}}
function set(key,value){try{Lampa.Storage.set(key,typeof value==='boolean'?String(value):value);}catch(e){}}
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
function publicPlayerSource(id){return ['eneyida','kinovezha','uaserials'].indexOf(id)>=0;}
function voiceKey(item){return item.voice_id||item.translation||'Оригінал';}
function ukrainian(item){
 var language=String(item.language||item.lang||item.audio_language||'').toLowerCase();
 if(/^(?:uk|ua|ukr)(?:[-_]|$)|ukrainian/.test(language))return true;
 return /укра[їи]н|(?:^|[^a-zа-яієїґ])(?:укр|ukr|ua|uk)(?:$|[^a-zа-яієїґ])|ukrainian|🇺🇦/i.test(item.translation||'');
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
function deliveryFamily(value){
 try{var host=new URL(value).hostname;if(/(?:^|\.)(?:hdvbua\.pro|tortuga\.(?:tw|wtf))$/.test(host))return 'hdvbua';return host;}catch(e){return '';}
}
function backupGroups(items,current,blocked){
 var groups=new Map(),seen=new Set();
 items.filter(function(item){return media(item.url)&&!blocked.has(deliveryFamily(item.url))&&(current.episode?item.season===current.season&&item.episode===current.episode:!item.episode);}).forEach(function(item){var key=item.provider+'|'+voiceKey(item);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
 return Array.from(groups.values()).filter(function(group){var key=group.map(function(item){return item.url;}).sort().join('|');if(seen.has(key))return false;seen.add(key);return true;});
}

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
 if(id==='uakino')return 'filmix';
 return /^[a-z][a-z0-9_]{1,40}$/.test(id)?id:'filmix';
}
function readableError(error){
 var code=error&&error.message||String(error||'');
 var eneyidaErrors={eneyida_movie_mismatch:'Сторінка Eneyida не відповідає вибраному фільму. Уточни назву через пошук угорі.',eneyida_access_denied:'Eneyida обмежила доступ. Спробуй інший балансер.',eneyida_timeout:'Eneyida не відповіла вчасно.',eneyida_player_not_found:'На сторінці Eneyida не знайдено доступного плеєра.',eneyida_player_format:'Eneyida змінила формат плеєра.',eneyida_invalid_playlist:'Eneyida не повернула придатного відеоплейліста.',eneyida_stream_unavailable:'Для цього фільму або серії Eneyida не повернула відео.',eneyida_unsupported_stream:'Цей формат відео Eneyida поки не підтримується.',eneyida_unavailable:'Eneyida зараз недоступна. Повтори запит або вибери інший балансер.'};
 var publicError=code.match(/^(kinovezha|uaserials)_(.+)$/);
 if(publicError){var name={kinovezha:'KinoVezha',uaserials:'UASerials'}[publicError[1]];return (eneyidaErrors['eneyida_'+publicError[2]]||'Eneyida не відповіла коректно. Повтори запит або вибери інший балансер.').replace(/Eneyida/g,name);}
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
  var providerController=new AbortController(),providerTimer=null,voiceButton=null,allGroups=[],playbackRequest=null,playbackSerial=0,owner='xot_'+(++screenCounter),playingOwned=false,advancing=false;
  var backupContext=null,bootTimer=null,lastPosition=0,backupEpisode='',failedFamilies=new Set(),postVerified=true;
  var state='loading',destroyed=false,created=false,serial=0,controller=null,deadline=null,last=null,candidates=[],streams=[],unavailable=[],qualityCap=null,post=null,rezkaVoice=null,episodeList=[],season=null,voice=null,pairing=null;
  if(!sources.some(function(s){return s.id===sourceId;}))sourceId='filmix';
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
   var ua=streams.filter(function(item){return (!season||!item.season||item.season===season)&&ukrainian(item);})[0];
   voice=found?found.id:get('xot_prefer_ukrainian',true)&&ua?(sourceId==='all'?'__uk__':selectionVoice(ua)):null;
  }
  function chooseVoice(){
   var options=voiceItems();if(!options.length)return notify('Спочатку дочекайся завантаження озвучень.');
   if(sourceId==='rezka')return select(options.map(function(v){return {title:safeText(v.title),voice:v.rezka,selected:rezkaVoice&&rezkaVoice.id===v.id};}),'Озвучення',function(v){if(post.series)chooseRezkaVoice(v.voice);else loadRezkaStream(v.voice,null,null);},self.start);
   var automatic=!Object.prototype.hasOwnProperty.call(get('xot_native_voices',{}),voicePreferenceKey())&&get('xot_prefer_ukrainian',true);
   return select([{title:'Автовибір української',value:'__auto__',selected:automatic},{title:'Усі озвучення',value:null,selected:!voice&&!automatic}].concat(options.map(function(v){return {title:safeText(v.title),value:v.id,selected:v.id===voice&&!automatic};})),'Озвучення',function(v){
    if(v.value==='__auto__'){var saved=get('xot_native_voices',{});delete saved[voicePreferenceKey()];set('xot_native_voices',saved);set('xot_prefer_ukrainian',true);restoreVoice();}else{voice=v.value;saveVoice();}drawStreams();
   },self.start);
  }
  function updateFilter(){
   filter.set('sort',sources.map(function(s){return {title:s.title,id:s.id,selected:s.id===sourceId};}));
   filter.render().find('.filter--sort span').text('Балансер');filter.chosen('sort',[source().title]);
   var controls=[{title:'Повторити пошук',action:'retry'}];
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
  function searchSource(which,operation){
   if(which.kind==='catalog'){
    var p=new URLSearchParams({title:query,provider:which.id});
    if(!manual)names(card).filter(function(n){return n!==query;}).forEach(function(n){p.append('alt',n);});
    if(card.release_date||card.first_air_date)p.set('year',String(card.release_date||card.first_air_date).slice(0,4));
    if(card.id)p.set('tmdb_id',card.id);
    return jsonRequest('/api/search?'+p,null,operation.signal).then(function(data){
     var failed=(data.provider_status||[]).filter(function(s){return !s.ok;});
     if(!(data.results||[]).length&&failed.length)throw Error(failed[0].error);
     return {catalog:data.results||[]};
    });
   }else{
    var queries=manual?[query]:names(card).slice(0,4);
    return Promise.all(queries.map(function(name){var payload={title:name};if((which.id==='rezka'||publicPlayerSource(which.id))&&!manual)payload.movie={titles:names(card),year:String(card.release_date||card.first_air_date||'').slice(0,4),series:Boolean(card.name||card.first_air_date||card.media_type==='tv')};return request(which.id,'search',payload,operation.signal).then(function(data){return {items:data.results||[]};}).catch(function(error){return {error:error};});})).then(function(groups){
     var values=[],seen={};
     groups.forEach(function(g){(g.items||[]).forEach(function(item){if(!seen[item.id]){seen[item.id]=true;values.push(item);}});});
     if(!values.length&&groups.some(function(g){return g.error;}))throw groups.filter(function(g){return g.error;})[0].error;
     values=values.filter(function(item){return manual||matches(item,card);});
     values.sort(function(a,b){return Number(matches(b,card))-Number(matches(a,card));});
     return {candidates:values};
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
   allGroups=sources.filter(function(which){return which.id!=='all';}).map(function(which){return {source:which,status:'loading'};});
   allGroups.forEach(function(group){
    var which=group.source;
    searchSource(which,operation).then(function(data){
     if(!current(operation.token)||group.status!=='loading')return null;
     if(data.catalog)return {items:data.catalog.filter(function(item){return matches(item,card);})};
     var exact=(data.candidates||[]).filter(function(item){return matches(item,card);});rememberAliases(which,exact);
     if(exact.length!==1){group.status=exact.length>1||manual&&data.candidates.length?'ambiguous':'empty';return null;}
     return request(which.id,'post',postPayload(exact[0],which),operation.signal);
    }).then(function(data){
     if(!current(operation.token))return;
     if(data&&group.status==='loading'){
      group.data=data;
      if(which.id==='rezka'){group.status='open';}
      else{
       var found=(data.items||[]).filter(function(item){return media(item.url);}).map(function(item){return Object.assign({},item,{provider:which.id,xot_source_name:which.title});});
       var locked=(data.unavailable||[]).map(function(item){return Object.assign({},item,{provider:which.id,xot_source_name:which.title,quality_cap:data.quality_cap});});
       streams=streams.concat(found);unavailable=unavailable.concat(locked);group.count=new Set(found.map(function(item){return [item.season,item.episode,voiceKey(item)].join('|');})).size;
       group.status=found.length?'ready':'empty';
      }
     }
     refreshAggregate();
    }).catch(function(error){if(current(operation.token)&&group.status==='loading'){group.status='error';group.error=error;refreshAggregate();}});
   });
   drawStreams();
  }
  function lookup(){
   var operation=begin(),which=source();candidates=[];streams=[];unavailable=[];qualityCap=null;post=null;rezkaVoice=null;episodeList=[];season=null;voice=null;allGroups=[];
   postVerified=true;loading('Пошук у '+which.title+'…');
   if(which.id==='all')return lookupAll(operation);
   searchSource(which,operation).then(function(data){
    if(!current(operation.token))return;finish();
    if(data.catalog){streams=data.catalog.filter(function(x){return media(x.url);});state='streams';drawStreams();return;}
    candidates=data.candidates;var exact=candidates.filter(function(item){return matches(item,card);});
    rememberAliases(which,exact);
    if(exact.length===1)return openPost(exact[0]);
    showCandidates();
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function openPost(item){
   var operation=begin();postVerified=matches(item,card);loading('Завантажуємо озвучення '+source().title+'…');
   request(sourceId,'post',postPayload(item,source()),operation.signal).then(function(data){
    if(!current(operation.token))return;finish();post=data;post.title=data.title||item.title;
    if(sourceId!=='rezka'){streams=(data.items||[]).filter(function(x){return media(x.url);});unavailable=data.unavailable||[];qualityCap=data.quality_cap||null;restoreVoice();state='streams';drawStreams();}
    else{
     var saved=get('xot_native_voices',{})[voicePreferenceKey()],options=data.translations||[];
     var preferred=saved&&options.filter(function(v){return v.id===saved.id&&v.title===saved.title;})[0];
     if(!preferred&&get('xot_prefer_ukrainian',true))preferred=options.filter(function(v){return ukrainian({translation:v.title});})[0];
     voice=preferred?preferred.id:null;rezkaVoice=preferred||null;
     if(data.series)chooseRezkaVoice(preferred||options[0]);else{state='translations';drawRezkaVoices();}
    }
   }).catch(function(error){if(current(operation.token)&&error.name!=='AbortError')showError(error);});
  }
  function drawRezkaVoices(){
   clear();state='translations';
   (post.translations||[]).filter(function(v){return !voice||v.id===voice;}).forEach(function(v){line(v.title,'Обрати якість відео',function(){loadRezkaStream(v,null,null);},true);});
   if(!post.translations.length)line('Озвучень не знайдено','Перевір інший балансер.');
   finish();updateFilter();self.start();
  }
  function chooseRezkaVoice(v){
   if(!v)return showError(Error('rezka_stream_unavailable'));
   var operation=begin();rezkaVoice=v;voice=v.id;saveVoice();loading('Завантажуємо серії…');
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
   var operation=begin(),previous=post.series?'episodes':'translations';rezkaVoice=v;voice=v.id;saveVoice();loading('Отримуємо відео…');
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
   var groups=new Map();
   scoped.forEach(function(item){var key=[item.provider,item.season||'',item.episode||'',voiceKey(item)].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
   var locked=sourceId==='all'?[]:unavailable.filter(function(item){return (!seasons.length||item.season===season)&&(!voice||voice==='__uk__'?(!voice||ukrainian(item)):selectionVoice(item)===voice);});
   var pending=sourceId==='all'&&allGroups.some(function(g){return g.status==='loading';});
   var opened=sourceId==='all'?allGroups.filter(function(group){return group.status==='open'&&group.data&&group.data.translations&&group.data.translations.length;}):[];
   if(!groups.size&&!locked.length&&!opened.length){
    if(pending)line('Шукаємо джерела…','Знайдені варіанти з’являтимуться тут.');
    else if(sourceId==='all'&&!streams.length){line('Доступних джерел не знайдено','Спробуй повторити пошук або вибрати балансер угорі.');line('Повторити пошук','',lookup);}
    else line('Немає доступних потоків','Спробуй інший балансер, сезон або озвучення.');
   }
   Array.from(groups.values()).sort(function(a,b){return (a[0].provider||'').localeCompare(b[0].provider||'')||(a[0].season||0)-(b[0].season||0)||(a[0].episode||0)-(b[0].episode||0);}).forEach(function(items){var first=items[0],qualities=items.reduce(function(all,x){return all.concat(x.available_qualities||[x.quality]);},[]).filter(function(v,i,a){return a.indexOf(v)===i;});
    line((sourceId==='all'?(first.xot_source_name||first.source||first.provider)+' · ':'')+(first.episode?'Серія '+first.episode+' · ':'')+(first.translation||'Оригінал'),qualities.join(' · '),function(){playGroup(items);},true);
   });
   locked.forEach(function(item){
    var note=item.reason==='quality_limit'?'У API є лише '+(item.available_qualities||[]).join(', ')+'. Поточний ліміт якості — '+(item.quality_cap||qualityCap)+'p.':'Для цього озвучення API не повернув придатного HTTPS-потоку.';
    line((sourceId==='all'?(item.xot_source_name||item.source||item.provider)+' · ':'')+(item.episode?'Серія '+item.episode+' · ':'')+item.translation,note);
   });
   opened.forEach(function(group){
    line(group.source.title,'Відкрити знайдені озвучення та серії',function(){self.changeSource(group.source.id);});
   });
   if(!pending)finish();else if(self.activity)self.activity.loader(false);
   updateFilter();self.start();
  }
  function timeline(item){
   if(!Lampa.Timeline||!Lampa.Utils.hash)return null;
   return Lampa.Timeline.view(Lampa.Utils.hash(['xot',card.name||card.first_air_date?'tv':'movie',card.id||card.original_title||title(card),item.season||0,item.episode||0].join(':')));
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
   var key=[data.season||0,data.episode||0].join('|');if(key!==backupEpisode){backupEpisode=key;failedFamilies.clear();}
   lastPosition=Number(data.xot_resume)||0;armStartup(data);
  }
  function armStartup(data){clearTimeout(bootTimer);bootTimer=setTimeout(function(){if(!destroyed&&playerData()===data&&Lampa.Player.opened())offerBackup(data);},15000);}
  function onCanPlay(){
   var data=playerData();if(!data||data.xot_owner!==owner)return;clearTimeout(bootTimer);
   if(data.xot_resume>0&&!data.xot_resume_applied){
    data.xot_resume_applied=true;var video=Lampa.PlayerVideo.video(),duration=Number(video.duration)||Infinity;
    Lampa.PlayerVideo.to(Math.max(0,Math.min(data.xot_resume,duration-3)));
   }
  }
  function onTimeUpdate(event){var data=playerData();if(data&&data.xot_owner===owner&&Number.isFinite(event.current)&&event.current>=0){lastPosition=event.current;if(event.current>0)clearTimeout(bootTimer);}}
  function refreshAfterPlayer(){
   if(destroyed||Lampa.Player.opened&&Lampa.Player.opened())return;
   if(sourceId==='all')refreshAggregate();else if(state==='streams')drawStreams();
  }
  function onPlayerDestroy(){
   if(playingOwned){playingOwned=false;if(backupContext&&backupContext.shown)closeSelect();cancelBackup();if(playbackRequest)cancelPlayback();if(!advancing)Promise.resolve().then(refreshAfterPlayer);}
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
    var seen=new Set(),choices=context.choices.filter(function(choice){var key=choice.items.map(function(row){return row.url;}).sort().join('|');if(seen.has(key))return false;seen.add(key);return true;});
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
   Promise.allSettled(sources.filter(function(which){return which.id!=='all'&&which.id!=='rezka'&&which.id!==work.xot_source;}).map(function(which){
    return searchSource(which,operation).then(function(data){
     if(!backupValid(context)||context.shown)return null;
     if(data.catalog)return {items:data.catalog.filter(function(row){return matches(row,card);})};
     var exact=(data.candidates||[]).filter(function(row){return matches(row,card);});
     if(exact.length!==1)return null;
     return request(which.id,'post',postPayload(exact[0],which,true),operation.signal);
    }).then(function(data){
     if(!data||!backupValid(context)||context.shown)return;
     var inventory=(data.items||[]).filter(function(row){return media(row.url);}).map(function(row){return Object.assign({},row,{provider:which.id,xot_source_name:which.title});});
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
   var mark=timeline(item);if(resume>0&&mark)mark=Object.assign({},mark,{time:resume,percent:0,continued:false});
   return Object.assign(selected,{title:title(card)+' / '+(item.translation||'Оригінал')+(item.episode?' / '+item.season+'×'+item.episode:''),season:item.season,episode:item.episode,card:card,isonline:true,timeline:mark,xot_owner:owner,xot_source:item.provider||sourceId,xot_item:item,xot_verified:source().kind==='catalog'?matches(item,card):postVerified,xot_resume:resume||0,error:function(work){offerBackup(work);}});
  }
  function resolveForPlayback(items,done,fail){
   cancelPlayback();var task={controller:new AbortController(),token:serial,id:playbackSerial,timer:null};playbackRequest=task;
   function valid(){return current(task.token)&&playbackRequest===task&&playbackSerial===task.id;}
   function finishTask(){clearTimeout(task.timer);if(playbackRequest===task)playbackRequest=null;}
   task.timer=setTimeout(function(){if(valid()){task.controller.abort();finishTask();fail(Error('request_timeout'));}},20000);
   var first=items[0],which=first.provider||sourceId,loading=items.some(function(item){return item.needs_resolve;});
   var load;
   if(!loading)load=Promise.resolve({items:items});
   else if(which==='rezka')load=request('rezka','stream',Object.assign({},first.xot_rezka_voice,{id:first.xot_post_id,translator_id:first.xot_rezka_voice.id,title:post.title,translation:first.translation,series:true,season:first.season,episode:first.episode,favs:post.favs||''}),task.controller.signal);
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
  function playGroup(items){
   failedFamilies.clear();backupEpisode=[items[0].season||0,items[0].episode||0].join('|');cancelBackup();
   resolveForPlayback(items,function(resolved){
    var play=playable(resolved),list=playlistFor(resolved,play);
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
   if(!sources.some(function(s){return s.id===id;}))return;
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
   if(Lampa.Player.listener){Lampa.Player.listener.follow('create',onPlayerCreate);Lampa.Player.listener.follow('start',onPlayerStart);Lampa.Player.listener.follow('destroy',onPlayerDestroy);}
   if(Lampa.PlayerVideo&&Lampa.PlayerVideo.listener){Lampa.PlayerVideo.listener.follow('canplay',onCanPlay);Lampa.PlayerVideo.listener.follow('timeupdate',onTimeUpdate);}
   var voiceActivated=0;voiceButton.on('hover:enter click',function(){var now=Date.now();if(now-voiceActivated<450)return;voiceActivated=now;chooseVoice();});
   filter.onSearch=function(value){query=String(value||'').trim();if(!query)return;manual=true;params.search=query;filter.render().find('.filter--search div').text(query);lookup();};
   filter.onBack=function(){self.start();};
   filter.onSelect=function(type,a){
    if(type==='sort')return self.changeSource(a.id);
    closeSelect();
    if(a.action==='retry')return lookup();
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
    if(params.xot_source!==sourceId&&sources.some(function(s){return s.id===params.xot_source;}))return self.changeSource(params.xot_source);
    if(sourceId==='all'&&added.length)return lookup();
    updateFilter();
   }).catch(function(){clearTimeout(providerTimer);});
   // Defer until Lampa attaches the activity to the component.
   Promise.resolve().then(function(){if(!destroyed)lookup();});
   return self.render();
  };
  this.render=function(){return files.render();};
  this.start=function(){
   if(destroyed||!active()||Lampa.Player.opened&&Lampa.Player.opened())return;
   Lampa.Controller.add('content',{toggle:focus,up:function(){if(window.Navigator&&Navigator.canmove('up'))Navigator.move('up');else Lampa.Controller.toggle('head');},down:function(){if(window.Navigator)Navigator.move('down');},left:function(){if(window.Navigator&&Navigator.canmove('left'))Navigator.move('left');else if(files.toggle)files.toggle();},right:function(){if(window.Navigator)Navigator.move('right');},back:self.back});
   if(!$('body').hasClass('selectbox--open')&&!$('body').hasClass('settings--open'))Lampa.Controller.toggle('content');
  };
  this.back=function(){if(state==='pair')lookup();else if(Lampa.Activity.backward)Lampa.Activity.backward();};
  this.pause=function(){};this.stop=function(){};
  this.destroy=function(){
   var playing=playerData();if(playing&&playing.xot_owner===owner&&Lampa.Player.opened&&Lampa.Player.opened())Lampa.Player.close();
   destroyed=true;stopRequests();providerController.abort();clearTimeout(providerTimer);
   if(Lampa.PlayerPanel&&Lampa.PlayerPanel.listener)Lampa.PlayerPanel.listener.remove('quality',onPlayerQuality);
   if(Lampa.Player.listener){Lampa.Player.listener.remove('create',onPlayerCreate);Lampa.Player.listener.remove('start',onPlayerStart);Lampa.Player.listener.remove('destroy',onPlayerDestroy);}
   if(Lampa.PlayerVideo&&Lampa.PlayerVideo.listener){Lampa.PlayerVideo.listener.remove('canplay',onCanPlay);Lampa.PlayerVideo.listener.remove('timeupdate',onTimeUpdate);}
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
var style=document.createElement('style');style.textContent='.xot--voice>div{max-width:14em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.xot-native-row{padding:1.05em 1.2em;margin:.4em 0;border-radius:.4em;background:rgba(255,255,255,.055)}.xot-native-row__title{font-size:1.28em;line-height:1.35}.xot-native-row__note{opacity:.65;margin-top:.35em;font-size:.9em}.xot-native-row.focus{outline:.18em solid #fff;background:rgba(255,255,255,.1)}';document.head.appendChild(style);
Lampa.Listener.follow('full',function(e){if(e&&['complite','complete','render'].indexOf(e.type)>=0){buttonTimers.forEach(clearTimeout);buttonTimers=[setTimeout(function(){button(e);},0),setTimeout(function(){button(e);},350),setTimeout(function(){button(e);},1500)];}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(button,300);},{once:true});else setTimeout(button,300);
console.info('[XOT] Independent balancers '+VERSION);
})();
