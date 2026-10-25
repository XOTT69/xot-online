(function(){
'use strict';
if(!window.Lampa||window.__XOT_ONLINE_INITIALIZED__)return;
window.__XOT_ONLINE_INITIALIZED__=true;
var API_BASE=(function(){var ss=document.getElementsByTagName('script');for(var i=ss.length-1;i>=0;i--)if(ss[i].src&&/\/online\.js(?:\?|$)/.test(ss[i].src))return new URL(ss[i].src).origin;return location.origin;})();
var lastCard=null,loading=false,pending=null;
var MOD_URL='https://cdn.jsdelivr.net/gh/nb557/plugins@851bcc9bc064ac06dc2b0e7ff6631baba61be511/online_mod.js';
var CONSENT='xot_online_mod_consent_v1';
var SOURCES=[
 {id:'filmix',title:'Filmix',description:'Online MOD · якість залежить від акаунта',mode:'external'},
 {id:'rezka2',title:'HDRezka',description:'Online MOD · доступ залежить від мережі',mode:'external'},
 {id:'kodik',title:'Kodik',description:'Online MOD · серіали',mode:'external'},
 {id:'cdnvideohub',title:'CDNVideoHub',description:'Online MOD',mode:'external'},
 {id:'anilibria2',title:'AniLibria',description:'Online MOD · аніме',mode:'external'},
 {id:'archive',title:'Internet Archive',description:'Власний адаптер · відкритий каталог',mode:'native'}
];
function notify(s){if(Lampa.Noty&&Lampa.Noty.show)Lampa.Noty.show(s);else console.log('[XOT]',s);}
function title(c){return(c&&(c.title||c.name||c.original_title||c.original_name))||'';}
function unwrap(value){if(!value||typeof value!=='object')return null;var candidates=[value.card,value.movie,value.data&&value.data.movie,value.data&&value.data.card,value.object&&value.object.card,value.object&&value.object.movie,value.data,value];for(var i=0;i<candidates.length;i++)if(candidates[i]&&title(candidates[i]))return candidates[i];return null;}
function activeCard(){try{var a=Lampa.Activity&&Lampa.Activity.active&&Lampa.Activity.active();return unwrap(a)||unwrap(a&&a.params)||null;}catch(e){return null;}}
function cardOf(e){return unwrap(e)||activeCard();}
function storageGet(k,d){try{return Lampa.Storage.get(k,d);}catch(e){return d;}}
function storageSet(k,v){try{Lampa.Storage.set(k,v);}catch(e){console.warn('[XOT] Storage error',e);}}
function get(path){return fetch(API_BASE+path,{headers:{accept:'application/json'}}).then(function(r){if(!r.ok)throw Error('HTTP '+r.status);return r.json();});}
function select(items,heading,done){
 if(!Lampa.Select||!Lampa.Select.show)return notify('ХОТ: меню вибору недоступне');
 Lampa.Select.show({title:heading,items:items,onSelect:function(item){if(Lampa.Controller&&Lampa.Controller.toggle)Lampa.Controller.toggle('content');done(item);},onBack:function(){if(Lampa.Controller&&Lampa.Controller.toggle)Lampa.Controller.toggle('content');}});
}
function play(v,heading){
 if(!v||!v.url||!/^https:\/\/archive\.org\/download\//.test(v.url))return notify('ХОТ: невідоме джерело потоку');
 try{Lampa.Player.play({url:v.url,title:heading});if(Lampa.Player.playlist)Lampa.Player.playlist([{url:v.url,title:heading}]);}
 catch(e){console.error('[XOT]',e);notify('ХОТ: помилка відтворення');}
}
function variants(item){
 if(!item||item.provider!=='archive'||!item.identifier)return notify('ХОТ: джерело недоступне');
 notify('ХОТ: завантаження файлів...');
 get('/api/variants?provider=archive&identifier='+encodeURIComponent(item.identifier)).then(function(r){
  if(!r.variants||!r.variants.length)return notify('ХОТ: немає доступних відеофайлів');
  select(r.variants.map(function(v){return{title:v.quality+' · '+v.title,subtitle:'Аудіодоріжка залежить від файлу',video:v};}),'ХОТ · Якість / файл',function(v){if(v&&v.video)play(v.video,item.title);});
 }).catch(function(e){console.warn('[XOT]',e);notify('ХОТ: не вдалося прочитати файли');});
}
function searchArchive(card){
 var p=new URLSearchParams();p.set('title',title(card));if(card.id)p.set('tmdb_id',String(card.id));var d=card.release_date||card.first_air_date;if(d)p.set('year',String(d).slice(0,4));
 notify('ХОТ: шукаємо в Internet Archive...');
 get('/api/search?'+p.toString()).then(function(r){
  var items=(r.results||[]).filter(function(i){return i.provider==='archive';});
  if(!items.length)return notify('ХОТ: у Internet Archive збігів немає');
  select(items.map(function(x){return{title:x.title+(x.year?' ('+x.year+')':''),subtitle:'Internet Archive',item:x};}),'ХОТ · Internet Archive',function(x){if(x&&x.item)variants(x.item);});
 }).catch(function(e){console.warn('[XOT]',e);notify('ХОТ: помилка пошуку');});
}
function modReady(){try{return !!(Lampa.SettingsApi&&Lampa.SettingsApi.getComponent&&Lampa.SettingsApi.getComponent('online_mod'))||window.__XOT_MOD_LOADED===true;}catch(e){return window.__XOT_MOD_LOADED===true;}}
function launchBalancer(card,src){
 if(!Lampa.Activity||!Lampa.Activity.push)return notify('ХОТ: Online MOD не підтримується цією версією Lampa');
 storageSet('online_mod_balanser',src.id);
 try{
  if(card.id&&Lampa.Storage.cache&&storageGet('online_mod_save_last_balanser',false)===true){
   var saved=Lampa.Storage.cache('online_mod_last_balanser',200,{});
   saved[card.id]=src.id;storageSet('online_mod_last_balanser',saved);
  }
 }catch(e){console.warn('[XOT] preference',e);}
 try{Lampa.Activity.push({url:'',title:'ХОТ · '+src.title,component:'online_mod',search:title(card),search_one:card.title||card.name||title(card),search_two:card.original_title||card.original_name||'',movie:card,page:1});}
 catch(e){console.error('[XOT]',e);notify('ХОТ: не вдалося відкрити '+src.title);}
}
function external(card,src){
 if(modReady())return launchBalancer(card,src);
 pending={card:card,source:src};
 if(loading)return notify('ХОТ: зовнішній модуль завантажується');
 function load(){
  loading=true;notify('ХОТ: завантажуємо Online MOD...');
  var script=document.createElement('script');script.src=MOD_URL;script.async=true;
  script.onload=function(){loading=false;if(!modReady()){pending=null;return notify('ХОТ: Online MOD не ініціалізувався');}window.__XOT_MOD_LOADED=true;var selected=pending;pending=null;if(selected)launchBalancer(selected.card,selected.source);};
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
function open(card){
 if(!card||!title(card))return notify('ХОТ: немає даних про фільм');
 select(SOURCES.map(function(s){return{title:s.title,subtitle:s.description,source:s};}),'ХОТ · Оберіть джерело',function(chosen){
  if(!chosen||!chosen.source)return;
  if(chosen.source.mode==='native')return searchArchive(card);
  external(card,chosen.source);
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
