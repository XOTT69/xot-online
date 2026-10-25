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
 {id:'uafilm',title:'UAFILM',description:'Український каталог · вебпошук',mode:'web',domain:'uafilm.me'},
 {id:'uaserials',title:'UASerials',description:'Український каталог · вебпошук',mode:'web',domain:'uaserials.com'},
 {id:'uakino',title:'UAKino',description:'Український каталог · вебпошук',mode:'web',domain:'uakino.eu'}
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
 var queries=uniqueTitles(card);
 if(!queries.length)return notify('ХОТ: немає назви для пошуку');
 var opts=queries.map(function(q){return {title:q,subtitle:'Пошук на сайті '+source.domain,query:q};});
 select(opts,'ХОТ · '+source.title+' · Каталог',function(selected){
  if(!selected||!selected.query)return;
  // An ordinary site-search link, not a stream or an unverified scraping endpoint.
  var url='https://www.google.com/search?q='+encodeURIComponent('site:'+source.domain+' "'+selected.query+'"');
  try{
   var tab=window.open(url,'_blank','noopener,noreferrer');
   if(!tab)notify('ХОТ: браузер заблокував нову вкладку');
  }catch(error){console.warn('[XOT] Catalog navigation failed',error);notify('ХОТ: не вдалося відкрити вебпошук');}
 });
}
function open(card){
 if(!card||!title(card))return notify('ХОТ: немає даних про фільм');
 select(SOURCES.map(function(s){return{title:s.title,subtitle:s.description,source:s};}),'ХОТ · Оберіть джерело',function(chosen){
  if(!chosen||!chosen.source)return;
  if(chosen.source.mode==='web')return openCatalog(card,chosen.source);
  chooseQuery(card,chosen.source);
 });
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
if(Lampa.Listener&&Lampa.Listener.follow)Lampa.Listener.follow('full',function(e){if(e&&['complite','complete','render'].indexOf(e.type)!==-1)setTimeout(function(){button(e);},0);});
console.info('[XOT] Multi-source selector initialized');
})();
