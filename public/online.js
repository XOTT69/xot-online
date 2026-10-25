(function(){
'use strict';
if(!window.Lampa||window.__XOT_ONLINE_INITIALIZED__)return;
window.__XOT_ONLINE_INITIALIZED__=true;
var API_BASE=(function(){var ss=document.getElementsByTagName('script');for(var i=ss.length-1;i>=0;i--)if(ss[i].src&&/\/online\.js(?:\?|$)/.test(ss[i].src))return new URL(ss[i].src).origin;return location.origin;})();
var lastCard=null,loading=false,pending=null;
try { var theme=document.querySelector('meta[name="theme-color"]'); if (!theme) { theme=document.createElement('meta');theme.setAttribute('name','theme-color');document.head.appendChild(theme); } theme.setAttribute('content','#171717'); } catch(e) {}
var MOD_URL='https://cdn.jsdelivr.net/gh/nb557/plugins@851bcc9bc064ac06dc2b0e7ff6631baba61be511/online_mod.js';
var CONSENT='xot_online_mod_consent_v1';
var SOURCES=[
 {id:'filmix',title:'Filmix',description:'Online MOD · якість залежить від акаунта',mode:'external'},
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
function unwrap(value){if(!value||typeof value!=='object')return null;var candidates=[value.card,value.movie,value.data&&value.data.movie,value.data&&value.data.card,value.object&&value.object.card,value.object&&value.object.movie,value.data,value];for(var i=0;i<candidates.length;i++)if(candidates[i]&&title(candidates[i]))return candidates[i];return null;}
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
function modReady(){try{return !!(Lampa.SettingsApi&&Lampa.SettingsApi.getComponent&&Lampa.SettingsApi.getComponent('online_mod'))||window.__XOT_MOD_LOADED===true;}catch(e){return window.__XOT_MOD_LOADED===true;}}
function launchBalancer(card,src,query){
 if(!Lampa.Activity||!Lampa.Activity.push)return notify('ХОТ: Online MOD не підтримується цією версією Lampa');
 storageSet('online_mod_balanser',src.id);
 // The upstream module can override the selected source with a saved per-film balancer.
 try{
  if(card.id&&Lampa.Storage.cache){
   var saved=Lampa.Storage.cache('online_mod_last_balanser',200,{})||{};
   saved[card.id]=src.id;
   storageSet('online_mod_last_balanser',saved);
  }
 }catch(e){console.warn('[XOT] preference',e);}

 try{var q=query||title(card);Lampa.Activity.push({url:'',title:'ХОТ · '+src.title,component:'online_mod',search:q,search_one:q,search_two:card.original_title||card.original_name||'',movie:card,page:1});}
 catch(e){console.error('[XOT]',e);notify('ХОТ: не вдалося відкрити '+src.title);}
}
function external(card,src,query){
 if(modReady())return launchBalancer(card,src,query);
 pending={card:card,source:src,query:query};
 if(loading)return notify('ХОТ: зовнішній модуль завантажується');
 function load(){
  loading=true;notify('ХОТ: завантажуємо Online MOD...');
  var script=document.createElement('script');script.src=MOD_URL;script.async=true;
  script.onload=function(){loading=false;if(!modReady()){pending=null;return notify('ХОТ: Online MOD не ініціалізувався');}window.__XOT_MOD_LOADED=true;var selected=pending;pending=null;if(selected)launchBalancer(selected.card,selected.source,selected.query);};
  script.onerror=function(){loading=false;pending=null;notify('ХОТ: не вдалося завантажити Online MOD');};
  (document.head||document.documentElement).appendChild(script);
 }
 if(storageGet(CONSENT,false)===true)return load();
 select([{title:'Підключити Online MOD',subtitle:'Зовнішній JavaScript може отримувати дані картки і мережевих запитів',action:'allow'},{title:'Скасувати',action:'cancel'}],
 'ХОТ · Дозвіл на зовнішній модуль',function(choice){
  if(!choice||choice.action!=='allow'){pending=null;return;}
  storageSet(CONSENT,true);load();
 });
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
  var destroyed=false,started=false,serial=0,filmix=[],catalog=[],filmixLoading=false,catalogLoading=false,errorFilmix='',view='home',selected=null,lastFocus=null,pairing=null;
  function text(s){return String(s==null?'':s);}
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
  function render(){
   if(destroyed)return;
   lastFocus=null;
   if(view==='streams')return drawStreams();
   if(view==='pair')return drawPair();
   header('Власний пошук джерел · незалежно від Online MOD');
   line('Filmix · '+(filmixLoading?'пошук…':filmix.length?'знайдено '+filmix.length:'немає збігів'),errorFilmix||'Авторизація за кодом пристрою доступна нижче',function(){filmixLookup();});
   filmix.forEach(function(item){line('Filmix · '+item.title+(item.year?' ('+item.year+')':''),item.original_title||'Натисни для вибору озвучення та якості',function(){showFilmix(item);});});
   line('Прив’язати Filmix за кодом','Активувати пристрій на filmix.gg/consoles',function(){beginPair();});
   if(storageGet('xot_filmix_device_token',''))line('Filmix · від’єднати пристрій','Прибрати збережену авторизацію з цієї Lampa',function(){
    storageSet('xot_filmix_device_token','');storageSet('xot_filmix_pending',null);filmixLookup();
   });
   if(catalogLoading)line('Інші підключені API · пошук…','Перевірка власного каталогу',function(){});
   catalog.forEach(function(item){line((item.source||item.provider||'Каталог')+' · '+item.title,[item.translation,item.quality,item.season?'S'+item.season+'E'+(item.episode||1):''].filter(Boolean).join(' · '),function(){play(item);});});
   if(!filmixLoading&&!catalogLoading&&!filmix.length&&!catalog.length)line('Доступних потоків поки немає','Якщо Filmix недоступний — перевір авторизацію або джерело API',function(){});
   line('Інші джерела · налаштування','Rezka, UAKino, UASerials: окремі адаптери ще потребують підключення',function(){notify('ХОТ: для цих джерел ще немає незалежних робочих API');});
   line('Резерв · Online MOD (необов’язково)','Відкрити сторонній модуль, якщо власне джерело недоступне',function(){
    select(SOURCES.filter(function(x){return x.mode==='external';}).map(function(x){return{title:x.title,subtitle:x.description,source:x};}),'Резервний модуль',function(x){if(x&&x.source)external(card,x.source,title(card));});
   });
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
  function drawStreams(){
   header('Filmix · '+(selected&&selected.title||title(card)));
   line('Назад до результатів','',function(){view='home';render();});
   var items=selected&&selected.items||[];
   if(!items.length)line('Потоки відсутні','Можливо, потрібна авторизація або інша озвучка',function(){});
   items.forEach(function(item){
    line([item.season?'S'+item.season+'E'+item.episode:'Фільм',item.translation,item.quality].filter(Boolean).join(' · '),item.url.replace(/([?&]user_dev_token=)[^&]+/g,'$1***').slice(0,130),function(){play(item);});
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
   }).catch(function(e){if(destroyed)return;header('Filmix · помилка прив’язки');line('Спробувати ще раз',e.message,function(){beginPair(true);});focus();});
  }
  function confirmPair(){
   if(!pairing||!pairing.device_token){notify('ХОТ: спочатку отримай код пристрою');return;}
   header('Filmix · перевіряємо код…');
   filmixRequest('confirm',{device_token:pairing.device_token}).then(function(j){
    if(destroyed)return;
    if(j.status==='linked'&&j.device_token){
     storageSet('xot_filmix_device_token',j.device_token);storageSet('xot_filmix_pending',null);
     pairing=null;view='home';notify('Filmix: пристрій прив’язаний');filmixLookup();
    }else{pairing=Object.assign({},pairing,j);drawPair();notify('Filmix: код ще не підтверджено');}
   }).catch(function(e){if(destroyed)return;drawPair();notify('Filmix: '+e.message);});
  }
  function showFilmix(item){
   header('Filmix · завантаження озвучень…');
   var token=++serial;
   var account=storageGet('xot_filmix_device_token','');
   var plan=account?'free':'guest';
   var profile=account?filmixRequest('profile').then(function(p){return p.pro_plus?'pro_plus':p.pro?'pro':'free';}).catch(function(){return 'free';}):Promise.resolve('guest');
   profile.then(function(p){plan=p;return filmixRequest('post',{id:item.id,plan:plan});}).then(function(j){
    if(destroyed||token!==serial)return;selected={title:item.title,items:j.items||[]};view='streams';render();
   }).catch(function(e){if(destroyed||token!==serial)return;selected={title:item.title,items:[]};view='streams';render();notify('Filmix: '+e.message);});
  }
  function filmixLookup(){
   filmixLoading=true;filmix=[];errorFilmix='';render();
   var token=++serial;
   var titles=uniqueTitles(card).slice(0,3);
   Promise.all(titles.map(function(name){return filmixRequest('search',{title:name}).then(function(r){return r.results||[];});}))
    .then(function(groups){
     if(destroyed||token!==serial)return;
     var all=[].concat.apply([],groups),seen={};
     filmix=all.filter(function(item){if(seen[item.id]||!filmixMatched(item,card))return false;seen[item.id]=true;return true;});
     filmixLoading=false;render();
    }).catch(function(e){if(destroyed||token!==serial)return;errorFilmix='API: '+e.message;filmixLoading=false;render();});
  }
  function catalogLookup(){
   catalogLoading=true;render();
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
   if(!started){started=true;filmixLookup();catalogLookup();}
   if(Lampa.Controller&&Lampa.Controller.add){
    Lampa.Controller.add('content',{toggle:function(){focus();},up:function(){if(window.Navigator)Navigator.move('up');},down:function(){if(window.Navigator)Navigator.move('down');},left:function(){Lampa.Controller.toggle('menu');},right:function(){if(window.Navigator)Navigator.move('right');},back:this.back});
    Lampa.Controller.toggle('content');
   }
  };
  this.back=function(){if(view!=='home'){view='home';render();}else if(Lampa.Activity&&Lampa.Activity.backward)Lampa.Activity.backward();};
  this.pause=function(){};
  this.stop=function(){};
  this.destroy=function(){destroyed=true;serial++;root.remove();};
 });
 return true;
}
function open(card){
 if(!card||!title(card))return notify('ХОТ: немає даних про фільм');
 if(registerScreen()&&Lampa.Activity&&Lampa.Activity.push){
  try{return Lampa.Activity.push({title:'ХОТ · '+title(card),component:'xot_online',movie:card,page:1});}
  catch(error){console.warn('[XOT] screen',error);}
 }
 // Compatibility fallback when custom components are unavailable.
 searchAll(card);
}
function button(e){
 var c=cardOf(e);if(c)lastCard=c;
 if(typeof window.jQuery!=='function')return;
 var $=window.jQuery,area=$('.full-start-new__buttons, .full-start__buttons').first();if(!area.length)return;
 area.find('.xot-online-button').remove();
 var b=$('<div class="full-start__button selector xot-online-button" tabindex="0"><span>ХОТ</span></div>');
 b.on('hover:enter click',function(){var current=activeCard()||lastCard;if(!current||!title(current))return notify('ХОТ: картка недоступна');open(current);});
 area.append(b);
}
if(Lampa.Component&&Lampa.Component.add)registerScreen();
if(Lampa.Listener&&Lampa.Listener.follow)Lampa.Listener.follow('full',function(e){
 if(e&&['complite','complete','render'].indexOf(e.type)!==-1){
  setTimeout(function(){button(e);},0);
  setTimeout(function(){button(e);},350);
 }
});
if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){button();},300);},{once:true});
}else setTimeout(function(){button();},300);
console.info('[XOT] Multi-source selector initialized');
})();
