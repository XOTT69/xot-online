(function(){
'use strict';
if(!window.Lampa||window.__XOT_ONLINE_INITIALIZED__)return;
window.__XOT_ONLINE_INITIALIZED__=true;
var API_BASE=(function(){var ss=document.getElementsByTagName('script');for(var i=ss.length-1;i>=0;i--)if(ss[i].src&&/\/online\.js(?:\?|$)/.test(ss[i].src))return new URL(ss[i].src).origin;return window.__XOT_API_BASE__||'https://xot-online.ai-beta69690.workers.dev';})();
var lastCard=null,loading=false,pending=null,buttonTimers=[];
try { var theme=document.querySelector('meta[name="theme-color"]'); if (!theme) { theme=document.createElement('meta');theme.setAttribute('name','theme-color');document.head.appendChild(theme); } theme.setAttribute('content','#171717'); } catch(e) {}
var MOD_URL='https://cdn.jsdelivr.net/gh/nb557/plugins@851bcc9bc064ac06dc2b0e7ff6631baba61be511/online_mod.js';
var SOURCES=[
 {id:'filmix',title:'Filmix',description:'Вибір озвучення та якості через Online MOD',mode:'external'},
 {id:'rezka2',title:'HDRezka',description:'Online MOD · доступ залежить від мережі',mode:'external'},
 {id:'kodik',title:'Kodik',description:'Online MOD · серіали',mode:'external'},
 {id:'cdnvideohub',title:'CDNVideoHub',description:'Online MOD',mode:'external'},
 {id:'anilibria2',title:'AniLibria',description:'Online MOD · аніме',mode:'external'},
 {id:'uafilm',title:'UAFILM',description:'UA · очікує API для Lampa',mode:'pending',domain:'uafilm.me'},
 {id:'uaserials',title:'UASerials',description:'UA · очікує API для Lampa',mode:'pending',domain:'uaserials.com'},
 {id:'uakino',title:'UAKino',description:'UA · очікує API для Lampa',mode:'pending',domain:'uakino.eu'}
];
function notify(s){if(Lampa.Noty&&Lampa.Noty.show)Lampa.Noty.show(s);else console.log('[XOT]',s);}
function title(c){return(c&&(c.title||c.name||c.original_title||c.original_name))||'';}
function uniqueTitles(card){var result=[];function add(v){v=String(v||'').trim();if(v&&!result.some(function(x){return x.toLowerCase()===v.toLowerCase();}))result.push(v);}add(card.title);add(card.name);add(card.original_title);add(card.original_name);var alt=card.alternative_titles;if(alt&&Array.isArray(alt.results))alt.results.forEach(function(x){add(x.title||x.name);});return result;}
function unwrap(value){if(!value||typeof value!=='object')return null;var candidates=[value.card,value.movie,value.data&&value.data.movie,value.data&&value.data.card,value.object&&value.object.card,value.object&&value.object.movie,value.data,value];for(var i=0;i<candidates.length;i++)if(candidates[i]&&title(candidates[i])&&!candidates[i].activity&&!candidates[i].component)return candidates[i];return null;}
function activeCard(){try{var a=Lampa.Activity&&Lampa.Activity.active&&Lampa.Activity.active();return unwrap(a)||unwrap(a&&a.params)||null;}catch(e){return null;}}
function cardOf(e){return unwrap(e)||activeCard();}
function storageGet(k,d){try{return Lampa.Storage.get(k,d);}catch(e){return d;}}
function storageSet(k,v){try{Lampa.Storage.set(k,v);}catch(e){console.warn('[XOT] Storage error',e);}}
function select(items,heading,done){
 if(!Lampa.Select||typeof Lampa.Select.show!=='function')return notify('ХОТ: меню Lampa.Select недоступне');
 try{
  Lampa.Select.show({
   title:heading,items:items,
   onSelect:function(item){
    if(Lampa.Controller&&Lampa.Controller.toggle)Lampa.Controller.toggle('content');
    if(typeof done==='function')done(item);
   },
   onBack:function(){if(Lampa.Controller&&Lampa.Controller.toggle)Lampa.Controller.toggle('content');}
  });
 }catch(error){console.error('[XOT] select',error);notify('ХОТ: помилка відкриття меню');}
}
// Component registration, rather than a settings entry, determines readiness.
function modReady(){
 try{
  if(Lampa.Component&&typeof Lampa.Component.get==='function')return typeof Lampa.Component.get('online_mod')==='function';
  return window.__XOT_MOD_LOADED===true||!!(Lampa.SettingsApi&&Lampa.SettingsApi.getComponent&&Lampa.SettingsApi.getComponent('online_mod'));
 }catch(e){return false;}
}
function preferredSource(card){
 var id=storageGet('online_mod_balanser','filmix');
 try{
  if(card.id&&Lampa.Storage.field&&Lampa.Storage.field('online_mod_save_last_balanser')===true&&Lampa.Storage.cache){
   id=(Lampa.Storage.cache('online_mod_last_balanser',200,{})||{})[card.id]||id;
  }
 }catch(e){}
 if(typeof id!=='string'||!/^[a-z][a-z0-9_-]{1,40}$/.test(id))id='filmix';
 return SOURCES.filter(function(s){return s.id===id&&s.mode==='external';})[0]||{id:id,title:id};
}
function launchBalancer(card,src,query){
 if(!Lampa.Activity||!Lampa.Activity.push)return notify('ХОТ: Online MOD не підтримується цією версією Lampa');
 storageSet('online_mod_balanser',src.id);
 try{
  if(card.id&&Lampa.Storage.field&&Lampa.Storage.field('online_mod_save_last_balanser')===true&&Lampa.Storage.cache){
   var saved=Lampa.Storage.cache('online_mod_last_balanser',200,{})||{};
   saved[card.id]=src.id;
   storageSet('online_mod_last_balanser',saved);
  }
 }catch(e){console.warn('[XOT] preference',e);}
 // Preserve every movie identifier and both TV/movie title formats for native search.
 var movie=Object.assign({},card);
 movie.title=movie.title||movie.name||movie.original_title||movie.original_name;
 movie.original_title=movie.original_title||movie.original_name||movie.title;
 try{var q=query||title(movie);Lampa.Activity.push({url:'',title:'ХОТ · '+title(movie),component:'online_mod',search:q,search_one:q,search_two:movie.original_title,movie:movie,page:1});}
 catch(e){console.error('[XOT]',e);notify('ХОТ: не вдалося відкрити '+src.title);}
}
function external(card,src,query){
 if(modReady())return launchBalancer(card,src,query);
 pending={card:card,source:src,query:query};
 if(loading)return;
 loading=true;notify('ХОТ: завантажуємо Online MOD…');
 var script=document.createElement('script'),timer=null,finished=false;
 script.src=MOD_URL;script.async=true;
 function finish(ok){
  if(finished)return;finished=true;clearTimeout(timer);loading=false;
  script.onload=script.onerror=null;
  var selected=pending;pending=null;
  if(!ok){if(script.parentNode)script.parentNode.removeChild(script);return notify('ХОТ: Online MOD недоступний. Перевір мережу та натисни ХОТ ще раз.');}
  window.__XOT_MOD_LOADED=true;
  if(selected)launchBalancer(selected.card,selected.source,selected.query);
 }
 script.onload=function(){finish(modReady());};
 script.onerror=function(){finish(false);};
 timer=setTimeout(function(){finish(false);},15000);
 (document.head||document.documentElement).appendChild(script);
}
function chooseQuery(card,source){
 var candidates=[];
 function add(value,label){value=String(value||'').trim();if(value&&!candidates.some(function(c){return c.query.toLowerCase()===value.toLowerCase();}))candidates.push({title:value,subtitle:label,query:value});}
 add(card.title||card.name,'Назва у Lampa');
 add(card.original_title||card.original_name,'Оригінальна назва');
 if(card.alternative_titles&&card.alternative_titles.results)card.alternative_titles.results.slice(0,6).forEach(function(v){add(v.title,'Альтернативна назва');});
 // Filmix and Rezka search local catalogs; an English title often yields fewer matches.
 // Offer all known titles, but do not claim one query will work for every provider.
 if(candidates.length<=1)return external(card,source,title(card));
 candidates.push({title:'Допомога з пошуком',subtitle:'Чому джерело може не знаходити відео',query:'__help__'});
 select(candidates,'ХОТ · '+source.title+' · Варіант пошуку',function(selected){if(selected&&selected.query){if(selected.query==='__help__')return showHelp(source);external(card,source,selected.query);}});
}
function showHelp(source){
 var info=source.id==='rezka2'?'HDRezka може не відповідати на запити із Safari через обмеження мережі або браузера. Це не означає, що зник інтернет. Спробуй інше джерело або Lampa Android.':'Пошук залежить від API джерела. Спробуй оригінальну чи альтернативну назву.';
 select([{title:'Пошук за іншою назвою',subtitle:'Повернутися до вибору назви',action:'query'},{title:'Інформація',subtitle:info,action:'info'}],'ХОТ · '+source.title+' · Діагностика',function(v){if(v&&v.action==='query'){var card=activeCard()||lastCard;if(card)chooseQuery(card,source);}else notify(info);});
}
function openCatalog(card,source){
 notify('ХОТ: '+source.title+' — потрібен підключений API потоків.');
}
function searchAll(card,sourceId){
 if(!window.fetch)return notify('ХОТ: браузер не підтримує мережеві запити');
 var urls=uniqueTitles(card);
 var p=new URLSearchParams();
 p.set('title',title(card));
 urls.slice(1,8).forEach(function(q){p.append('alt',q);});
 if(card.release_date||card.first_air_date)p.set('year',String(card.release_date||card.first_air_date).slice(0,4));
 if(card.id)p.set('tmdb_id',String(card.id));
 if(sourceId)p.set('provider',sourceId);
 notify('ХОТ: шукаємо доступні потоки…');
 fetch(API_BASE+'/api/search?'+p.toString()).then(function(resp){if(!resp.ok)throw Error('API '+resp.status);return resp.json();}).then(function(data){
  var ready=(data.results||[]).filter(function(x){return x.url&&/^https:\/\//.test(x.url)&&/\.(m3u8|mp4|mpd)(?:[?#]|$)/i.test(x.url);});
  if(!ready.length){
   var configured=(data.configured_providers||[]);
   select([
    {title:'Filmix · дивитися в Lampa',subtitle:'Пошук через Online MOD',source:SOURCES[0]},
    {title:'HDRezka · дивитися в Lampa',subtitle:'Пошук через Online MOD',source:SOURCES[1]},
    {title:'Kodik · дивитися в Lampa',subtitle:'Пошук через Online MOD',source:SOURCES[2]}
   ],'ХОТ · '+(sourceId&&!configured.length?'API джерела не підключено':'Прямих потоків не знайдено'),function(choice){
    if(choice&&choice.source)chooseQuery(card,choice.source);
   });
   return;
  }
  select(ready.map(function(item){return {title:item.title+(item.episode?' · S'+item.season+'E'+item.episode:''),subtitle:[item.source||item.provider,item.translation,item.quality].filter(Boolean).join(' · '),item:item};}),
   'ХОТ · Знайдені відео',function(choice){
    if(!choice||!choice.item)return;
    if(!Lampa.Player||!Lampa.Player.play)return notify('ХОТ: плеєр Lampa недоступний');
    var f=choice.item;
    try{Lampa.Player.play({url:f.url,title:f.title,quality:'auto',season:f.season,episode:f.episode});}catch(e){notify('ХОТ: помилка запуску відео');}
   });
 }).catch(function(err){console.warn('[XOT] API search',err);notify('ХОТ: помилка серверного пошуку');});
}
function safeText(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function playerItems(rows){return (rows||[]).filter(function(v){return v.url&&/^https:\/\//i.test(v.url)&&/\.(m3u8|mp4|mpd)(?:[?#]|$)/i.test(v.url);});}
function filmixIdentity(){
 var id=storageGet('xot_filmix_device_id','');
 if(/^[0-9a-f]{32}$/.test(id))return id;
 var bytes=new Uint8Array(16);
 if(window.crypto&&window.crypto.getRandomValues)window.crypto.getRandomValues(bytes);
 else for(var i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
 id=Array.prototype.map.call(bytes,function(n){return n.toString(16).padStart(2,'0');}).join('');
 storageSet('xot_filmix_device_id',id);return id;
}
function filmixRequest(action,opts){
 var data=Object.assign({action:action,device_id:filmixIdentity(),device_token:storageGet('xot_filmix_device_token','')},opts||{});
 return fetch(API_BASE+'/api/filmix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
  .then(function(r){return r.json().then(function(body){if(!r.ok||body.error)throw Error(body.error||'API '+r.status);return body;});});
}
function filmixMatched(item,card){
 var titles=uniqueTitles(card).map(function(x){return x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();});
 var values=[item.title,item.original_title].filter(Boolean).map(function(x){return x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();});
 var date=String(card.release_date||card.first_air_date||'').slice(0,4),year=String(item.year||'');
 if(date&&year&&Math.abs(Number(date)-Number(year))>1)return false;
 return titles.some(function(t){return values.some(function(v){return t===v||(t.length>5&&v.length>5&&(t.indexOf(v)!==-1||v.indexOf(t)!==-1));});});
}
function registerScreen(){
 if(window.__XOT_COMPONENT_READY__)return true;
 if(!Lampa.Component||!Lampa.Component.add||typeof window.jQuery!=='function')return false;
 window.__XOT_COMPONENT_READY__=true;
 Lampa.Component.add('xot_online',function(params){
  var $=window.jQuery,card=params.movie||{},root=$('<div class="xot-screen" style="padding:1.2em 2em 3em;min-height:70vh;overflow:auto;max-height:85vh"></div>');
  var destroyed=false,started=false,serial=0,filmix=[],catalog=[],apiProviders=[],filmixLoading=false,catalogLoading=false,errorFilmix='',view='home',selected=null,lastFocus=null,pairing=null,streamChoice={season:null,episode:null,voice:null};
  function text(s){return String(s==null?'':s);}
  function readableError(code){var errors={filmix_unavailable:'Не вдалося з’єднатися з Filmix API через HTTPS',filmix_timeout:'Filmix API не відповів вчасно',filmix_http_401:'Filmix відхилив авторизацію пристрою',filmix_http_403:'Доступ до Filmix API обмежено',filmix_http_404:'Адреса Filmix API змінилася',filmix_https_required:'Безпечне HTTPS-з’єднання недоступне',filmix_invalid_json:'Filmix повернув невідомий формат відповіді'};return errors[code]||code||'невідома помилка';}
  function line(head,note,action){
   var el=$('<div class="selector xot-line" tabindex="0" style="padding:.75em 1em;margin:.35em 0;border-radius:.55em;background:rgba(255,255,255,.07);cursor:pointer"></div>');
   $('<div style="font-size:1.08em"></div>').text(head).appendTo(el);
   if(note)$('<div style="font-size:.78em;opacity:.72;margin-top:.16em"></div>').text(note).appendTo(el);
   el.on('hover:enter click',function(){lastFocus=el;action();});root.append(el);return el;
  }
  function header(sub){
   root.empty().append($('<div style="font-size:1.5em;margin:0 0 .45em"></div>').text('ХОТ · '+title(card)));
   if(sub)root.append($('<div style="opacity:.75;margin-bottom:.85em"></div>').text(sub));
  }
  function focus(){
   if(Lampa.Controller&&Lampa.Controller.collectionSet){
    try{Lampa.Controller.collectionSet(root,root);Lampa.Controller.collectionFocus(lastFocus||false,root);}catch(e){}
   }
  }

  function section(label,description){
   var wrapper=$('<div style="margin:1.4em 0 .4em"></div>');
   $('<div style="font-size:1.16em;font-weight:600"></div>').text(label).appendTo(wrapper);
   if(description)$('<div style="font-size:.79em;opacity:.68;margin-top:.2em"></div>').text(description).appendTo(wrapper);
   root.append(wrapper);
  }
  function toolsView(){
   header('Незалежні API · керування');
   line('← Джерела','Повернутися до онлайн-джерел',function(){view='home';render();});
   section('Filmix · власний адаптер','Експериментальний HTTPS API. Якщо він недоступний, користуйся Filmix через Online MOD.');
   line('Знайти Filmix · '+(filmixLoading?'шукаємо…':filmix.length?'знайдено '+filmix.length:errorFilmix?'помилка API':'не перевірено'),
    errorFilmix?readableError(errorFilmix):'Пошук за відомими назвами',function(){filmixLookup();});
   filmix.forEach(function(item){
    line(item.title+(item.year?' ('+item.year+')':''),'Обрати серію, озвучення та якість',function(){showFilmix(item);});
   });
   line('Прив’язати Filmix за кодом','Активація у власному акаунті filmix.gg/consoles',function(){beginPair();});
   line('Перевірити HTTPS-з’єднання Filmix','Без передавання особистого токена',function(){
    filmixRequest('probe',{device_token:''}).then(function(r){notify('Filmix: '+(r.status==='reachable'?'API відповідає':'незрозуміла відповідь'));})
     .catch(function(e){notify('Filmix: '+readableError(e.message));});
   });
   if(storageGet('xot_filmix_device_token',''))line('Від’єднати Filmix','Видалити токен із локального сховища Lampa',function(){
    storageSet('xot_filmix_device_token','');storageSet('xot_filmix_pending',null);filmix=[];errorFilmix='';render();
   });
   section('Інші API','Ці джерела працюють лише з налаштованим JSON API, який повертає відтворювані HTTPS-потоки');
   apiProviders.forEach(function(p){
    line(p.name+' · '+(p.enabled?'налаштовано':'не підключено'),
     p.enabled?'Сервер має адресу API; доступність відео не підтверджена':
      'Немає налаштованого незалежного API для цього джерела',function(){
       if(p.enabled){catalogLookup();notify('ХОТ: повторний пошук '+p.name);}
       else notify('ХОТ: '+p.name+' — потрібно налаштувати API у Worker');
     });
   });
   if(!apiProviders.length)line('Стан серверних API невідомий','Список джерел ще не завантажено',function(){catalogLookup();});
   section('Online MOD','Параметри адаптерів джерел, включно з авторизацією');
   line('Налаштування Online MOD','Дзеркала, акаунти та балансери всередині Lampa',function(){
    if(Lampa.Settings&&typeof Lampa.Settings.create==='function'&&modReady()){
     try{Lampa.Settings.create('online_mod');}catch(e){notify('ХОТ: налаштування Online MOD недоступні');}
    }else notify('Спершу відкрий будь-яке джерело та дозволь завантаження Online MOD');
   });
   line('Повторити пошук','Оновити незалежні результати',function(){filmixLookup();catalogLookup();});
   focus();
  }
  function render(){
   if(destroyed)return;
   lastFocus=null;
   if(view==='streams')return drawStreams();
   if(view==='pair')return drawPair();
   if(view==='tools')return toolsView();
   header('Обери джерело — пошук і перегляд усередині Lampa');
   section('Онлайн-джерела','Адаптери з перевіреною в lampa69 інтеграцією Online MOD; їхня фактична доступність залежить від мережі й акаунтів');
   SOURCES.filter(function(s){return s.mode==='external';}).forEach(function(source){
    line(source.title,source.description+' · відкрити пошук',function(){external(card,source,title(card));});
   });
   section('Незалежний пошук','Власний API — лише коли повертає справжнє відео, без переходу на вебсайти');
   if(catalogLoading)line('Шукаємо у підключених API…','Результати з’являться нижче',function(){});
   catalog.forEach(function(item){
    line((item.source||item.provider||'Каталог')+' · '+item.title,
     [item.translation,item.quality,item.season?'S'+item.season+'E'+(item.episode||1):''].filter(Boolean).join(' · '),
     function(){play(item);});
   });
   if(!catalogLoading&&!catalog.length)line('Поки немає прямих потоків',
    'Незалежні джерела без налаштованого API не видають фальшиві результати',function(){view='tools';render();});
   line('Filmix · незалежний пошук (експеримент)',filmix.length?'Знайдено: '+filmix.length:'Окремо від Online MOD, може бути недоступний',function(){
    view='tools';render();if(!filmix.length)filmixLookup();
   });
   line('Налаштування джерел','Filmix за кодом, статус інших API, авторизація Online MOD',function(){view='tools';render();});
   focus();
  }
  function play(item){
   if(!Lampa.Player||!Lampa.Player.play)return notify('ХОТ: плеєр недоступний');
   try{
    var p={url:item.url,title:item.title+(item.episode?' · '+item.season+'x'+item.episode:''),quality:item.quality||'auto'};
    Lampa.Player.play(p);
    if(Lampa.Player.playlist)Lampa.Player.playlist([p]);
   }catch(e){console.warn('[XOT] play',e);notify('ХОТ: не вдалося запустити відео');}
  }
  function streamBack(){
   if(streamChoice.voice!==null)streamChoice.voice=null;
   else if(streamChoice.episode!==null)streamChoice.episode=null;
   else if(streamChoice.season!==null)streamChoice.season=null;
   else view='home';
   render();
  }
  function drawStreams(){
   var all=selected&&selected.items||[];
   header('Filmix · '+(selected&&selected.title||title(card)));
   line('Назад','Попередній крок або результати',streamBack);
   if(!all.length){
    line('Немає відтворюваних HTTPS-потоків','Перевір Filmix API, авторизацію й доступність відео',function(){});
    focus();return;
   }
   var seasons=[...new Set(all.filter(function(x){return x.season;}).map(function(x){return Number(x.season);}))]
    .sort(function(a,b){return a-b;});
   if(seasons.length&&streamChoice.season===null){
    line('Обери сезон','Знайдено сезонів: '+seasons.length,function(){});
    seasons.forEach(function(season){
     line('Сезон '+season,'Відкрити список серій',function(){streamChoice.season=season;render();});
    });
    focus();return;
   }
   var scoped=all.filter(function(x){return streamChoice.season===null||Number(x.season)===streamChoice.season;});
   if(seasons.length&&streamChoice.episode===null){
    var episodes=[...new Set(scoped.map(function(x){return Number(x.episode);}).filter(Boolean))]
      .sort(function(a,b){return a-b;});
    line('Сезон '+streamChoice.season+' · обери серію','Знайдено серій: '+episodes.length,function(){});
    episodes.forEach(function(episode){
     line('Серія '+episode,'Вибрати озвучення',function(){streamChoice.episode=episode;render();});
    });
    focus();return;
   }
   if(streamChoice.episode!==null)scoped=scoped.filter(function(x){return Number(x.episode)===streamChoice.episode;});
   if(streamChoice.voice===null){
    var voices=[...new Set(scoped.map(function(x){return x.translation||'Оригінал';}))];
    line('Обери озвучення','Доступно: '+voices.length,function(){});
    voices.forEach(function(voice){line(voice,'Вибрати якість відео',function(){streamChoice.voice=voice;render();});});
    focus();return;
   }
   scoped=scoped.filter(function(x){return (x.translation||'Оригінал')===streamChoice.voice;});
   line((streamChoice.episode!==null?'Серія '+streamChoice.episode+' · ':'')+streamChoice.voice,'Обери якість відео',function(){});
   scoped.forEach(function(item){
    line(item.quality||'Авто','Відтворити у вбудованому плеєрі Lampa',function(){play(item);});
   });
   focus();
  }
  function drawPair(){
   header('Filmix · прив’язка пристрою');
   line('Назад до результатів','',function(){view='home';render();});
   if(pairing&&pairing.user_code)line('Код: '+pairing.user_code,'Введи код у своєму акаунті на filmix.gg/consoles',function(){
    if(Lampa.Utils&&Lampa.Utils.copyTextToClipboard)Lampa.Utils.copyTextToClipboard(pairing.user_code,function(){notify('ХОТ: код скопійовано');});
   });
   line('Перевірити прив’язку','Після введення коду на сайті Filmix',function(){confirmPair();});
   line('Отримати новий код','Створити новий запит на прив’язку',function(){beginPair(true);});
   focus();
  }
  function beginPair(fresh){
   view='pair';
   pairing=fresh?null:storageGet('xot_filmix_pending',null);
   if(pairing&&pairing.user_code){drawPair();return;}
   header('Отримуємо код Filmix…');
   filmixRequest('pair',{device_token:''}).then(function(j){
    if(destroyed)return;
    pairing=j;storageSet('xot_filmix_pending',j);drawPair();
   }).catch(function(e){if(destroyed)return;header('Filmix · помилка прив’язки');line('Спробувати ще раз',readableError(e.message),function(){beginPair(true);});focus();});
  }
  function confirmPair(){
   if(!pairing||!pairing.user_code){notify('ХОТ: спочатку отримай код пристрою');return;}
   header('Filmix · перевіряємо код…');
   filmixRequest('confirm',{device_token:'',temp_token:pairing.temp_token||''}).then(function(j){
    if(destroyed)return;
    if(j.status==='linked'&&j.device_token){
     storageSet('xot_filmix_device_token',j.device_token);storageSet('xot_filmix_pending',null);
     pairing=null;view='home';notify('Filmix: пристрій прив’язаний');filmixLookup();
    }else{pairing=Object.assign({},pairing,{status:'pending'});drawPair();notify('Filmix: код ще не підтверджено');}
   }).catch(function(e){if(destroyed)return;drawPair();notify('Filmix: '+readableError(e.message));});
  }
  function showFilmix(item){
   header('Filmix · завантаження озвучень…');
   var token=++serial;
   filmixRequest('post',{id:item.id}).then(function(j){
    if(destroyed||token!==serial)return;selected={title:item.title,items:j.items||[]};streamChoice={season:null,episode:null,voice:null};view='streams';render();
   }).catch(function(e){if(destroyed||token!==serial)return;selected={title:item.title,items:[]};view='streams';render();notify('Filmix: '+e.message);});
  }
  function filmixLookup(){
   filmixLoading=true;filmix=[];errorFilmix='';render();
   var token=++serial;
   var titles=uniqueTitles(card).slice(0,3);
   Promise.all(titles.map(function(name){return filmixRequest('search',{title:name}).then(function(r){return {results:r.results||[]};}).catch(function(e){return {error:e.message};});}))
    .then(function(groups){
     if(destroyed||token!==serial)return;
     var all=[].concat.apply([],groups.map(function(g){return g.results||[];})),seen={};
     if(!all.length)errorFilmix=(groups.find(function(g){return g.error;})||{}).error||'';
     filmix=all.filter(function(item){if(seen[item.id]||!filmixMatched(item,card))return false;seen[item.id]=true;return true;});
     filmixLoading=false;render();
    }).catch(function(e){if(destroyed||token!==serial)return;errorFilmix='API: '+readableError(e.message);filmixLoading=false;render();});
  }
  function catalogLookup(){
   catalogLoading=true;render();
   fetch(API_BASE+'/api/providers').then(function(r){return r.json();}).then(function(j){if(destroyed)return;apiProviders=j.providers||[];if(view==='tools')render();}).catch(function(){});
   var p=new URLSearchParams(),v=uniqueTitles(card);p.set('title',title(card));v.slice(1,8).forEach(function(q){p.append('alt',q);});
   if(card.release_date||card.first_air_date)p.set('year',String(card.release_date||card.first_air_date).slice(0,4));
   if(card.id)p.set('tmdb_id',String(card.id));
   fetch(API_BASE+'/api/search?'+p.toString()).then(function(r){return r.json();}).then(function(j){
    if(destroyed)return;catalog=playerItems(j.results||[]);catalogLoading=false;render();
   }).catch(function(){if(destroyed)return;catalog=[];catalogLoading=false;render();});
  }
  this.create=function(){return root;};
  this.render=function(){return root;};
  this.start=function(){
   if(!started){started=true;catalogLookup();}
   if(Lampa.Controller&&Lampa.Controller.add){
    Lampa.Controller.add('content',{toggle:function(){focus();},up:function(){if(window.Navigator)Navigator.move('up');},down:function(){if(window.Navigator)Navigator.move('down');},left:function(){Lampa.Controller.toggle('menu');},right:function(){if(window.Navigator)Navigator.move('right');},back:this.back});
    Lampa.Controller.toggle('content');
   }
  };
  this.back=function(){if(view==='streams')streamBack();else if(view!=='home'){view=view==='pair'?'tools':'home';render();}else if(Lampa.Activity&&Lampa.Activity.backward)Lampa.Activity.backward();};
  this.pause=function(){};
  this.stop=function(){};
  this.destroy=function(){destroyed=true;serial++;root.remove();};
 });
 return true;
}
function open(card){
 if(!card||!title(card))return notify('ХОТ: немає даних про фільм');
 external(card,preferredSource(card),title(card));
}
function openTools(card){
 if(!card||!title(card))return notify('ХОТ: немає даних про фільм');
 if(registerScreen()&&Lampa.Activity&&Lampa.Activity.push){
  try{return Lampa.Activity.push({title:'ХОТ · '+title(card),component:'xot_online',movie:card,page:1});}
  catch(error){console.warn('[XOT] screen',error);}
 }
 searchAll(card);
}
function button(e){
 var c=cardOf(e);if(c)lastCard=c;
 if(typeof window.jQuery!=='function')return;
 var $=window.jQuery,scope=null;
 try{scope=e&&e.object&&e.object.activity&&e.object.activity.render();}catch(error){}
 var area=(scope?scope.find('.full-start-new__buttons, .full-start__buttons'):$('.full-start-new__buttons, .full-start__buttons')).first();if(!area.length)return;
 var existing=area.find('.xot-online-button');
 if(existing.length){existing.data('xot-card',c);return;}
 var b=$('<div class="full-start__button selector xot-online-button" tabindex="0"><span>ХОТ</span></div>');
 b.data('xot-card',c);
 var lastActivation=0;
 b.on('hover:enter click',function(){
  var now=Date.now();if(now-lastActivation<500)return;lastActivation=now;
  var current=b.data('xot-card')||activeCard()||lastCard;
  if(!current||!title(current))return notify('ХОТ: картка недоступна');
  open(current);
 });
 b.on('hover:long contextmenu',function(event){
  if(event&&event.preventDefault)event.preventDefault();
  lastActivation=Date.now();openTools(b.data('xot-card')||activeCard()||lastCard);
 });
 area.append(b);
}
if(Lampa.Component&&Lampa.Component.add)registerScreen();
if(Lampa.Listener&&Lampa.Listener.follow)Lampa.Listener.follow('full',function(e){
 if(e&&['complite','complete','render'].indexOf(e.type)!==-1){
  buttonTimers.forEach(clearTimeout);
  buttonTimers=[setTimeout(function(){button(e);},0),setTimeout(function(){button(e);},350)];
 }
});
if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){button();},300);},{once:true});
}else setTimeout(function(){button();},300);
console.info('[XOT] Direct Online MOD launch initialized');
})();
