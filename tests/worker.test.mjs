import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const request=path=>worker.fetch(new Request('https://xot.test'+path),{});
test('health lists registered archive provider',async()=>{const r=await request('/api/health');assert.equal(r.status,200);const j=await r.json();assert.equal(j.ok,true);assert.equal(j.provider_count,1);});
test('providers endpoint lists Internet Archive',async()=>{const j=await (await request('/api/providers')).json();assert.equal(j.providers[0].id,'archive');});
test('empty search input rejected',async()=>{assert.equal((await request('/api/search')).status,400);});
test('invalid archive identifier rejected without network fetch',async()=>{const r=await request('/api/variants?provider=archive&identifier=../bad');assert.equal(r.status,400);});
test('unknown provider rejected',async()=>{const r=await request('/api/variants?provider=other&identifier=film');assert.equal(r.status,400);});
