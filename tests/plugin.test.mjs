import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext, Script} from 'node:vm';
const plugin=readFileSync(new URL('../public/online.js',import.meta.url),'utf8');
const loader=readFileSync(new URL('../public/m.js',import.meta.url),'utf8');
const movie={id:460458,title:'Оселя зла: Вітаємо у Раккун-Сіті',original_title:'Resident Evil: Welcome to Raccoon City',release_date:'2021-11-24',imdb_id:'tt6920084',source:'tmdb'};

function harness({card=movie,ready=true,stored={},early=false}={}) {
 const values={...stored},components={},scripts=[],pushes=[],notices=[],menus=[],timers=new Map(),listeners={};
 let now=1000,nextTimer=0,button=null;
 const empty={length:0,remove(){}};
 const area={length:1,first(){return this;},find(){return button||empty;},append(node){button=node;}};
 function jquery(input){
  if(typeof input==='string'&&input.includes('full-start-new__buttons'))return area;
  return {length:1,handlers:{},values:{},data(key,value){if(arguments.length===2){this.values[key]=value;return this;}return this.values[key];},on(events,fn){events.split(' ').forEach(e=>this.handlers[e]=fn);return this;}};
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
 function boot(){runInNewContext(plugin,context);advance(350);}
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
test('XOT remembers its own global source without reading Online MOD preferences',()=>{
 const h=harness({stored:{xot_native_source:'rezka',online_mod_balanser:'filmix'}});h.boot();h.enter();assert.equal(h.pushes[0].xot_source,'rezka');assert.equal(h.values.online_mod_balanser,'filmix');
});
test('per-film XOT source overrides its global preference',()=>{
 const h=harness({stored:{xot_native_source:'filmix',xot_native_last_sources:{[movie.id]:'rezka'}}});h.boot();h.enter();assert.equal(h.pushes[0].xot_source,'rezka');
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
