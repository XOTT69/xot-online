import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function request(path) { return worker.fetch(new Request('https://xot.test' + path), {}); }

test('health endpoint works', async () => {
  const r = await request('/api/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});
test('no invented providers', async () => {
  const r = await request('/api/providers');
  assert.deepEqual((await r.json()).providers, []);
});
test('missing query rejected', async () => {
  const r = await request('/api/search');
  assert.equal(r.status, 400);
});
test('empty registry gives honest empty results', async () => {
  const r = await request('/api/search?title=Interstellar');
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).results, []);
});
