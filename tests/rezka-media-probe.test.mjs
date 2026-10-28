import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleRezkaMedia} from '../server/rezka-media-probe.mjs';

const host='https://stream.voidboost.one';
test('Media sample follows a generated HLS variant and reads only the first fragment without credentials',async()=>{
 const seen=[];
 const data=await sampleRezkaMedia([{quality:'720p',url:host+'/master.m3u8'}],async(url,options)=>{
  seen.push({url:String(url),options});
  if(url.pathname==='/master.m3u8')return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvariant.m3u8');
  if(url.pathname==='/variant.m3u8')return new Response('#EXTM3U\n#EXTINF:5,\n1.ts\n#EXTINF:5,\n2.ts');
  return new Response(new Uint8Array([0x47,0,0,0]),{status:206});
 });
 assert.equal(data.manifest_status,200);assert.equal(data.fragment_status,206);assert.equal(data.fragment_type,'ts');assert.equal(data.fragment_url,host+'/1.ts');assert.equal(seen.length,3);
 assert.deepEqual(seen[2].options.headers,{range:'bytes=0-1023'});assert.ok(seen.every(row=>!row.options.headers.authorization&&!row.options.headers.cookie));
});
test('Media sample reports a source denial and rejects untrusted fragment URLs before fetching them',async()=>{
 assert.deepEqual(await sampleRezkaMedia([{url:host+'/master.m3u8'}],async()=>new Response('',{status:404})),{manifest_status:404});
 let calls=0;await assert.rejects(()=>sampleRezkaMedia([{url:host+'/master.m3u8'}],async()=>{calls++;return new Response('#EXTM3U\nhttps://127.0.0.1/private.ts');}),/rezka_unsupported_stream_format/);assert.equal(calls,1);
});
test('Media sample bounds manifest size, depth and redirects',async()=>{
 await assert.rejects(()=>sampleRezkaMedia([{url:host+'/master.m3u8'}],async()=>new Response('#EXTM3U\n'+'x'.repeat(65536))),/media_probe_too_large/);
 let calls=0;const data=await sampleRezkaMedia([{url:host+'/master.m3u8'}],async()=>{calls++;return new Response('#EXTM3U\nmaster.m3u8');});assert.equal(data.error,'media_probe_depth');assert.equal(calls,3);
 calls=0;await assert.rejects(()=>sampleRezkaMedia([{url:host+'/master.m3u8'}],async()=>{calls++;return new Response('',{status:302,headers:{location:host+'/again.m3u8'}});}),/media_probe_redirect/);assert.equal(calls,3);
});
