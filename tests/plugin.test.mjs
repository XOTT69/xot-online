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
test('XOT opens native movie results immediately, without an intermediate menu or API lookup',()=>{
 const h=harness();h.boot();h.enter();assert.equal(h.pushes.length,1);assert.equal(h.pushes[0].component,'online_mod');assert.equal(h.pushes[0].search,movie.title);assert.equal(h.pushes[0].search_two,movie.original_title);assert.equal(h.pushes[0].movie.imdb_id,movie.imdb_id);assert.equal(h.pushes[0].movie.source,'tmdb');assert.equal(h.menus.length,0);
});
test('TV name and original_name are normalized without changing original card',()=>{
 const card={id:1,name:'Серіал',original_name:'Series',first_air_date:'2025-01-01',alternative_titles:{results:[{title:'Alternative'}]}};
 const h=harness({card});h.boot();h.enter();assert.equal(h.pushes[0].movie.title,'Серіал');assert.equal(h.pushes[0].movie.original_title,'Series');assert.equal(h.pushes[0].movie.first_air_date,card.first_air_date);assert.equal(h.pushes[0].movie.alternative_titles.results[0].title,'Alternative');assert.equal(card.title,undefined);
});
test('last global balancer is respected',()=>{const h=harness({stored:{online_mod_balanser:'rezka2'}});h.boot();h.enter();assert.equal(h.values.online_mod_balanser,'rezka2');});
test('per-movie preference takes priority when enabled',()=>{
 const h=harness({stored:{online_mod_balanser:'filmix',online_mod_save_last_balanser:true,online_mod_last_balanser:{[movie.id]:'kodik',99:'filmix'}}});h.boot();h.enter();assert.equal(h.values.online_mod_balanser,'kodik');assert.equal(h.values.online_mod_last_balanser[99],'filmix');
});
test('disabled per-movie preference does not override global selection',()=>{const h=harness({stored:{online_mod_balanser:'rezka2',online_mod_last_balanser:{[movie.id]:'filmix'}}});h.boot();h.enter();assert.equal(h.values.online_mod_balanser,'rezka2');});
test('native balancers outside the old five-item menu are preserved',()=>{const h=harness({stored:{online_mod_balanser:'collaps'}});h.boot();h.enter();assert.equal(h.values.online_mod_balanser,'collaps');});
test('missing module loads once and opens only once',()=>{
 const h=harness({ready:false});h.boot();h.enter();assert.equal(h.scripts.length,1);assert.equal(h.pushes.length,0);h.advance(600);h.enter();assert.equal(h.scripts.length,1);h.components.online_mod=function(){};h.scripts[0].onload();assert.equal(h.pushes.length,1);assert.equal(h.pushes[0].component,'online_mod');assert.equal(h.timers.size,0);
});
test('a settings entry alone never claims an unregistered module is ready',()=>{const h=harness({ready:false});h.Lampa.SettingsApi.getComponent=()=>({});h.boot();h.enter();assert.equal(h.pushes.length,0);assert.equal(h.scripts.length,1);});
test('failed module load permits a retry',()=>{const h=harness({ready:false});h.boot();h.enter();h.scripts[0].onerror();h.advance(600);h.enter();assert.equal(h.scripts.length,2);assert.equal(h.pushes.length,0);assert.ok(h.notices.some(n=>n.includes('недоступний')));});
test('a loaded script without component registration reports failure',()=>{const h=harness({ready:false});h.boot();h.enter();h.scripts[0].onload();assert.equal(h.pushes.length,0);assert.ok(h.notices.some(n=>n.includes('недоступний')));});
test('module timeout clears loading state',()=>{const h=harness({ready:false});h.boot();h.enter();h.advance(15000);h.enter();assert.equal(h.scripts.length,2);});
test('hover and click from one activation do not open duplicate activities',()=>{const h=harness();h.boot();h.enter();h.button.handlers.click();assert.equal(h.pushes.length,1);});
test('long press retains independent tools separately',()=>{const h=harness();h.boot();h.button.handlers['hover:long']({preventDefault(){}});h.enter();assert.equal(h.pushes.length,1);assert.equal(h.pushes[0].component,'xot_online');});
test('repeated initialization does not duplicate listeners or buttons',()=>{const h=harness();h.boot();const button=h.button;h.boot();assert.equal(h.button,button);h.enter();assert.equal(h.pushes.length,1);});
test('loader works without putScriptAsync and uses its own origin',()=>{
 const h=harness();h.context.document.currentScript={src:'https://plugin.example/m.js?test=1'};runInNewContext(loader,h.context);assert.equal(h.scripts.length,1);assert.equal(new URL(h.scripts[0].src).origin,'https://plugin.example');assert.equal(new URL(h.scripts[0].src).pathname,'/online.js');assert.equal(h.context.__XOT_API_BASE__,'https://plugin.example');
});
test('loader waits for Lampa instead of silently exiting during startup',()=>{const h=harness({early:true});runInNewContext(loader,h.context);assert.equal(h.scripts.length,0);h.context.Lampa=h.Lampa;h.advance(100);assert.equal(h.scripts.length,1);});
test('loader error permits reloading and does not silently mark initialization complete',()=>{const h=harness();runInNewContext(loader,h.context);h.scripts[0].onerror();assert.equal(h.context.__XOT_LOADER_PENDING__,false);runInNewContext(loader,h.context);assert.equal(h.scripts.length,2);});
test('loader falls back to the canonical Worker when executed without a script element',()=>{const h=harness();runInNewContext(loader,h.context);assert.equal(new URL(h.scripts[0].src).origin,'https://xot-online.ai-beta69690.workers.dev');});


test('reused movie buttons receive the newest rendered card',()=>{
 const h=harness();h.boot();const original=h.button;
 h.listeners.full({type:'complite',data:{movie:{id:2,title:'Next movie'}}});h.advance(350);h.enter();
 assert.equal(h.button,original);assert.equal(h.pushes[0].movie.id,2);assert.equal(h.pushes[0].search,'Next movie');
});
test('activity titles are never mistaken for a movie card',()=>{
 const h=harness({card:null});h.Lampa.Activity.active=()=>({title:'Main',component:'main',activity:{}});h.boot();h.enter();assert.equal(h.pushes.length,0);
});
test('latest movie request wins while the module is still loading',()=>{
 const h=harness({ready:false});h.boot();h.enter();
 h.listeners.full({type:'complite',data:{movie:{id:2,title:'Next movie'}}});h.advance(600);h.enter();
 h.components.online_mod=function(){};h.scripts[0].onload();assert.equal(h.pushes.length,1);assert.equal(h.pushes[0].movie.id,2);
});
test('an unrelated executing script does not redirect the loader to Lampa origin',()=>{
 const h=harness();h.context.document.currentScript={src:'https://lampa.example/app.min.js'};runInNewContext(loader,h.context);assert.equal(new URL(h.scripts[0].src).origin,'https://xot-online.ai-beta69690.workers.dev');
});
