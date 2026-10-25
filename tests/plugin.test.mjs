import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const plugin=readFileSync(new URL('../public/online.js',import.meta.url),'utf8');

test('Lampa plugin has valid JavaScript syntax',()=>{assert.doesNotThrow(()=>new Script(plugin));});
test('source menu has a select implementation',()=>{
  assert.match(plugin,/function select\(/);
  assert.match(plugin,/Lampa\.Select\.show\(/);
});
test('Archive is not presented as an online source',()=>{
  assert.doesNotMatch(plugin,/Internet Archive|id:'archive'/);
});
test('XOT launch path is available',()=>{
  assert.match(plugin,/function launchBalancer\(/);
  assert.match(plugin,/component:'online_mod'/);
});

test('selected provider overrides stale per-film balancer',()=>{assert.match(plugin,/saved\[card\.id\]=src\.id/);assert.match(plugin,/storageSet\('online_mod_last_balanser',saved\)/);});
test('redundant top balancer switcher is hidden only on XOT source activity',()=>{assert.match(plugin,/body\.xot-source-focused \.filter--sort/);assert.match(plugin,/unmarkSourcePanel\(\)/);});
