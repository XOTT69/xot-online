import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const request=path=>worker.fetch(new Request('https://xot.test'+path),{});
test('health shows zero independent API providers',async()=>{const r=await request('/api/health');assert.equal(r.status,200);assert.equal((await r.json()).provider_count,0);});
test('providers registry is empty',async()=>{const r=await request('/api/providers');assert.deepEqual((await r.json()).providers,[]);});
test('invalid search rejected',async()=>{assert.equal((await request('/api/search')).status,400);});
test('archive variants removed',async()=>{assert.equal((await request('/api/variants?provider=archive&identifier=test')).status,404);});
