(function(){
'use strict';
if(!window.Lampa||window.__XOT_ONLINE_INITIALIZED__)return;
window.__XOT_ONLINE_INITIALIZED__=true;
var API_BASE=(function(){var ss=document.getElementsByTagName('script');for(var i=ss.length-1;i>=0;i--)if(ss[i].src&&/\/online\.js(?:\?|$)/.test(ss[i].src))return new URL(ss[i].src).origin;return location.origin;})();
function notify(t){if(Lampa.Noty&&Lampa.Noty.show)Lampa.Noty.show(t);else console.log('[XOT]',t);}
function title(c){return(c&&(c.title||c.name||c.original_title||c.original_name))||'';}
function cardOf(e){return(e&&(e.data||(e.object&&e.object.card)||e.movie))||(Lampa.Activity&&Lampa.Activity.active&&Lampa.Activity.active().card)||null;}
function get(path){return fetch(API_BASE+path,{headers:{accept:'application/json'}}).then(function(r){if(!r.ok)throw Error('HTTP '+r.status);return r.json();});}
function select(items,heading,done){
  if(!Lampa.Select||!Lampa.Select.show)return notify('ХОТ: меню вибору недоступне');
  Lampa.Select.show({title:heading,items:items,onSelect:function(value){
    if(Lampa.Controller&&Lampa.Controller.toggle)Lampa.Controller.toggle('content');
    done(value);
  },onBack:function(){if(Lampa.Controller&&Lampa.Controller.toggle)Lampa.Controller.toggle('content');}});
}
function play(item,heading){
  if(!item||!item.url||!/^https:\/\/archive\.org\/download\//.test(item.url))return notify('ХОТ: непідтримуваний потік');
  try{Lampa.Player.play({url:item.url,title:heading});if(Lampa.Player.playlist)Lampa.Player.playlist([{url:item.url,title:heading}]);}
  catch(e){console.error('[XOT]',e);notify('ХОТ: помилка плеєра');}
}
function variants(item){
  if(!item||item.provider!=='archive'||!item.identifier)return notify('ХОТ: джерело не підтримується');
  notify('ХОТ: шукаємо відеофайли...');
  get('/api/variants?provider=archive&identifier='+encodeURIComponent(item.identifier)).then(function(r){
    if(!r.variants||!r.variants.length)return notify('ХОТ: сумісних відеофайлів немає');
    select(r.variants.map(function(v){return{title:v.quality+' · '+v.title,subtitle:'Мова оригіналу · Internet Archive',video:v};}),
      'ХОТ · Вибір файлу',function(chosen){if(chosen&&chosen.video)play(chosen.video,item.title);});
  }).catch(function(e){console.warn('[XOT]',e);notify('ХОТ: не вдалося отримати файли');});
}
function open(card){
  if(!card||!title(card))return notify('ХОТ: немає назви фільму');
  var p=new URLSearchParams();p.set('title',title(card));if(card.id)p.set('tmdb_id',String(card.id));
  var d=card.release_date||card.first_air_date;if(d)p.set('year',String(d).slice(0,4));
  notify('ХОТ: пошук...');
  get('/api/search?'+p.toString()).then(function(r){
    if(!r.results||!r.results.length)return notify('ХОТ: збігів не знайдено у підключених джерелах');
    select(r.results.map(function(x){return{title:x.title+(x.year?' ('+x.year+')':''),subtitle:'Internet Archive · збіг назви',result:x};}),
      'ХОТ · Результати',function(x){if(x&&x.result)variants(x.result);});
  }).catch(function(e){console.warn('[XOT]',e);notify('ХОТ: API або джерело недоступні');});
}
function button(e){
  var c=cardOf(e);if(!c||typeof window.jQuery!=='function')return;
  var $=window.jQuery;var area=$('.full-start-new__buttons, .full-start__buttons').first();
  if(!area.length||area.find('.xot-online-button').length)return;
  var b=$('<div class="full-start__button selector xot-online-button" tabindex="0"><span>ХОТ</span></div>');
  b.on('hover:enter click',function(){open(c);});area.append(b);
}
if(Lampa.Listener&&Lampa.Listener.follow)Lampa.Listener.follow('full',function(e){if(e&&['complite','complete','render'].indexOf(e.type)!==-1)setTimeout(function(){button(e);},0);});
console.info('[XOT] Loaded with Internet Archive provider support');
})();
