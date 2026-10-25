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


test('upper balancer switcher remains available',()=>{assert.doesNotMatch(plugin,/xot-source-focused|xot-hide-switcher/);});


test('UA providers do not open a browser and report pending player integration',()=>{
 assert.match(plugin,/id:'uaserials'/);
 assert.match(plugin,/id:'uakino'/);
 assert.match(plugin,/id:'uafilm'/);
 assert.match(plugin,/mode:'pending'/);
 assert.doesNotMatch(plugin,/window\.open\(|www\.google\.com\/search/);
});
