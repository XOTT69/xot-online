import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {buildQueries,matchScore} from '../worker/matching.js';
const request=path=>worker.fetch(new Request('https://xot.test'+path),{});
test('health shows zero independent API providers',async()=>{const r=await request('/api/health');assert.equal((await r.json()).provider_count,0);});
test('providers registry is empty',async()=>{const list=(await (await request('/api/providers')).json()).providers;assert.equal(list.length,1);assert.equal(list[0].id,'kodik');assert.equal(list[0].enabled,false);});
test('invalid search rejected',async()=>{assert.equal((await request('/api/search')).status,400);});
test('archive variants removed',async()=>{assert.equal((await request('/api/variants?provider=archive&identifier=test')).status,404);});
test('query plan deduplicates case and punctuation',()=>{assert.deepEqual(buildQueries({title:'A Mind in Chaos',alternative_titles:['a mind in chaos','Інша назва']}),['A Mind in Chaos','Інша назва']);});
test('matching prioritizes exact title and year',()=>{assert.equal(matchScore({title:'A Mind in Chaos',year:2026},{title:'A Mind in Chaos',year:2026}),100);assert.ok(matchScore({title:'Different movie',year:1993},{title:'A Mind in Chaos',year:2026})<65);});
test('query plan endpoint exposes alternatives',async()=>{const r=await request('/api/query-plan?title=Film&alt=Movie&alt=Film');assert.deepEqual((await r.json()).titles,['Film','Movie']);});

test('without token Kodik search returns no invented matches',async()=>{const r=await request('/api/search?title=Matrix');assert.equal(r.status,200);assert.deepEqual((await r.json()).results,[]);});
