import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionsSPS,tsDimensions} from '../server/video-dimensions.mjs';
import {verifiedRezkaHD,rezkaVideoDimensions} from '../server/rezka-hd.mjs';
const sd=Buffer.from('674d4028eca06c1ef37ff828002808800001f480005dc0078c18cb','hex'),hd=Buffer.from('67640029acd9405005bb011000003e90000bb800f1831960','hex');
function ts(sps){const bytes=new Uint8Array(564).fill(0xff);for(let at=0;at<564;at+=188){bytes.set([0x47,at===0?0x41:0x01,0x00,0x10],at);}bytes.set([0,0,1,0xe0,0,0,0x80,0,0,0,0,1],4);bytes.set(sps,16);bytes.set([0,0,1,0x68],16+sps.length);return bytes;}
test('Real AVC sequence headers distinguish mislabeled 480p from actual 720p',()=>{
 assert.deepEqual(dimensionsSPS(sd),{width:854,height:480});assert.deepEqual(dimensionsSPS(hd),{width:1280,height:720});assert.equal(tsDimensions(ts(sd)).width,854);assert.equal(tsDimensions(ts(hd)).height,720);assert.equal(tsDimensions(new Uint8Array(1024)),null);
});
test('Rezka HD probing relabels actual video, drops SD and never exposes an unverified advertised quality',async()=>{
 const host='https://stream.voidboost.one',calls=[];
 const fetcher=async(url,options)=>{calls.push({url:String(url),headers:options.headers});return url.pathname.endsWith('.m3u8')?new Response('#EXTM3U\n#EXTINF:5,\n'+(url.pathname.includes('1080')?'hd.ts':'sd.ts')):new Response(ts(url.pathname.endsWith('hd.ts')?hd:sd),{status:206});};
 const result=await verifiedRezkaHD([{quality:'720p',url:host+'/720.m3u8'},{quality:'1080p',url:host+'/1080.m3u8'}],fetcher);
 assert.equal(result.length,1);assert.equal(result[0].quality,'720p');assert.equal(result[0].video_width,1280);assert.ok(result[0].url.endsWith('/1080.m3u8'));assert.equal(calls.filter(row=>row.headers.range==='bytes=0-65535').length,2);
 await assert.rejects(()=>verifiedRezkaHD([{quality:'1080p',url:host+'/720.m3u8'}],fetcher),/rezka_hd_unavailable/);
});
test('Rezka dimension probe rejects private fragment URLs, encrypted streams and recursive manifests',async()=>{
 const url='https://stream.voidboost.one/index.m3u8';let calls=0;
 await assert.rejects(()=>rezkaVideoDimensions(url,async()=>{calls++;return new Response('#EXTM3U\nhttps://127.0.0.1/private.ts');}));assert.equal(calls,1);
 await assert.rejects(()=>rezkaVideoDimensions(url,async()=>new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="a.key"\n1.ts')),/unsupported/);
 calls=0;await assert.rejects(()=>rezkaVideoDimensions(url,async()=>{calls++;return new Response('#EXTM3U\nindex.m3u8');}),/playlist_depth/);assert.equal(calls,3);
});
