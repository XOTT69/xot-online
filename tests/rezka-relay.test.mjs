import test from 'node:test';
import assert from 'node:assert/strict';
import {signRezkaMedia,rewriteRezkaManifest,handleRezkaRelay} from '../server/rezka-relay.mjs';
const secret='test-relay-private-key-more-than-32-characters',origin='https://owner.onrender.com',upstream='https://stream.voidboost.one/movie/index.m3u8';
test('Rezka relay signs source URLs, rejects tampering and expiry before contacting the CDN',async()=>{
 const signed=signRezkaMedia(upstream,origin,secret),options={secret,origin,fetcher:async()=>{throw Error('should not fetch');}};
 assert.ok(!signed.includes(secret));assert.equal(new URL(signed).origin,origin);
 assert.equal((await handleRezkaRelay(new Request(signed.replace('/media/','/media/x')),options)).status,403);
 assert.equal((await handleRezkaRelay(new Request(signRezkaMedia(upstream,origin,secret,Math.floor(Date.now()/1000)-1)),options)).status,403);
 assert.throws(()=>signRezkaMedia('https://127.0.0.1/private.m3u8',origin,secret));
});
test('Rezka relay rewrites HLS fragments/audio/keys using expiring signatures and excludes SD variants',()=>{
 const text='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="UK",URI="uk.m3u8"\n#EXT-X-STREAM-INF:RESOLUTION=854x480\n480.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1280x536,AUDIO="a"\n720.m3u8';
 const result=rewriteRezkaManifest(text,upstream,origin,secret,Math.floor(Date.now()/1000)+60);assert.doesNotMatch(result,/854x480/);assert.match(result,/1280x536/);assert.ok(!result.includes('voidboost'));assert.ok(!result.includes(secret));assert.match(result,/URI="https:\/\/owner.onrender.com\/media\//);
 assert.throws(()=>rewriteRezkaManifest('#EXTM3U\nhttps://127.0.0.1/secret.ts',upstream,origin,secret,1));
});
test('Rezka relay serves only bounded CDN fragments, preserves ranges/CORS and sends no owner credentials upstream',async()=>{
 const url=signRezkaMedia('https://stream.voidboost.one/movie/1.ts',origin,secret);let seen;
 const response=await handleRezkaRelay(new Request(url,{headers:{range:'bytes=0-1023',cookie:'private',authorization:'private'}}),{secret,origin,fetcher:async(u,o)=>{seen=o;return new Response(new Uint8Array([0x47,0,0,0]),{status:206,headers:{'content-type':'video/mp2t','content-range':'bytes 0-3/100'}});}});
 assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,4);assert.deepEqual(seen.headers,{range:'bytes=0-1023'});assert.equal(response.headers.get('content-range'),'bytes 0-3/100');assert.equal(response.headers.get('access-control-allow-origin'),'*');
 const tooLarge=await handleRezkaRelay(new Request(url),{secret,origin,fetcher:async()=>new Response('',{headers:{'content-length':String(33*1024*1024)}})});assert.equal(tooLarge.status,413);
 const redirected=await handleRezkaRelay(new Request(url),{secret,origin,fetcher:async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}})});assert.equal(redirected.status,502);
});
