import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {buildQueries,matchScore} from '../worker/matching.js';
const request=path=>worker.fetch(new Request('https://xot.test'+path),{});
test('health shows zero independent API providers',async()=>{const r=await request('/api/health');assert.equal((await r.json()).provider_count,0);});
test('providers registry is empty',async()=>{const list=(await (await request('/api/providers')).json()).providers;assert.equal(list.length,7);assert.equal(list[0].id,'uakino');assert.equal(list[0].enabled,false);assert.equal(list[5].id,'catalog');assert.equal(list[5].enabled,false);assert.equal(list[6].id,'kodik');assert.equal(list[6].enabled,false);});
test('invalid search rejected',async()=>{assert.equal((await request('/api/search')).status,400);});
test('archive variants removed',async()=>{assert.equal((await request('/api/variants?provider=archive&identifier=test')).status,404);});
test('query plan deduplicates case and punctuation',()=>{assert.deepEqual(buildQueries({title:'A Mind in Chaos',alternative_titles:['a mind in chaos','Інша назва']}),['A Mind in Chaos','Інша назва']);});
test('matching prioritizes exact title and year',()=>{assert.equal(matchScore({title:'A Mind in Chaos',year:2026},{title:'A Mind in Chaos',year:2026}),100);assert.ok(matchScore({title:'Different movie',year:1993},{title:'A Mind in Chaos',year:2026})<65);});
test('query plan endpoint exposes alternatives',async()=>{const r=await request('/api/query-plan?title=Film&alt=Movie&alt=Film');assert.deepEqual((await r.json()).titles,['Film','Movie']);});


test('catalog provider enables only with a configured endpoint',async()=>{const r=await worker.fetch(new Request('https://xot.test/api/providers'),{XOT_CATALOG_URL:'https://media.example/api'});const list=(await r.json()).providers;assert.equal(list.find(p=>p.id==='catalog').enabled,true);});

test('UA providers not configured do not report playable results',async()=>{const r=await request('/api/search?title=Matrix&provider=uakino');const j=await r.json();assert.equal(r.status,200);assert.deepEqual(j.configured_providers,[]);assert.deepEqual(j.results,[]);});
test('UA provider becomes enabled with an API URL',async()=>{const r=await worker.fetch(new Request('https://xot.test/api/providers'),{XOT_UAKINO_API_URL:'https://example.org/search'});const j=await r.json();assert.equal(j.providers.find(p=>p.id==='uakino').enabled,true);});

test('plugin entrypoints return JavaScript with CORS and no stale cache',async()=>{
 for(const path of ['/m.js','/online.js?v=0.2.0']){
  const r=await worker.fetch(new Request('https://xot.test'+path),{ASSETS:{fetch:async()=>new Response('/* plugin */',{headers:{'content-type':'text/plain','cache-control':'public, max-age=86400'}})}});
  assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^application\/javascript/);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(await r.text(),'/* plugin */');
 }
});
test('missing asset binding returns a diagnostic response',async()=>{const r=await request('/m.js');assert.equal(r.status,503);assert.equal((await r.json()).error,'assets_not_configured');});
test('asset failures preserve their error status and content type',async()=>{const r=await worker.fetch(new Request('https://xot.test/m.js'),{ASSETS:{fetch:async()=>new Response('Not Found',{status:404,headers:{'content-type':'text/plain'}})}});assert.equal(r.status,404);assert.equal(r.headers.get('content-type'),'text/plain');});
test('HEAD checks for plugin URLs have the same headers and no response body',async()=>{
 const r=await worker.fetch(new Request('https://xot.test/m.js',{method:'HEAD'}),{ASSETS:{fetch:async()=>new Response('/* plugin */')}});
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^application\/javascript/);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal(await r.text(),'');
});
