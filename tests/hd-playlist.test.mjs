import test from 'node:test';
import assert from 'node:assert/strict';
import {filterHDMaster,handleHDPlaylist} from '../worker/hd-playlist.js';
const base='https://cdn.hdvbua.pro/movie/master.m3u8?token=private';
const master='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="UK",URI="uk/audio.m3u8"\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="UK",URI="uk/subs.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=854x352,AUDIO="a",SUBTITLES="s"\n480.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200,RESOLUTION=1280x528,AUDIO="a",SUBTITLES="s"\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=300,RESOLUTION=1920x794,AUDIO="a",SUBTITLES="s"\n1080.m3u8';
test('HD master removes SD while preserving cropped HD, separate audio and subtitles with absolute URLs',()=>{
 const result=filterHDMaster(master,base);assert.doesNotMatch(result,/480|854x352/);assert.match(result,/RESOLUTION=1280x528/);assert.match(result,/RESOLUTION=1920x794/);assert.match(result,/URI="https:\/\/cdn.hdvbua.pro\/movie\/uk\/audio.m3u8"/);assert.match(result,/SUBTITLES="s"/);
});
test('HD master fails closed for unknown or low resolution and private or credential-bearing renditions',()=>{
 for(const body of ['#EXTM3U\n#EXTINF:5,\nvideo.ts','#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\na.m3u8',master.replace(/1280x528|1920x794/g,'640x360')])assert.throws(()=>filterHDMaster(body,base));
 for(const uri of ['https://127.0.0.1/video.m3u8','http://cdn.hdvbua.pro/a.m3u8','https://key:secret@cdn.hdvbua.pro/a.m3u8'])assert.throws(()=>filterHDMaster(master.replace('720.m3u8',uri),base));
 assert.throws(()=>filterHDMaster(master.replace('uk/audio.m3u8','https://untrusted.example/a.m3u8'),base));
});
test('HD endpoint allows only published playlist hosts and bounded responses, strips auth and prevents redirect SSRF',async()=>{
 let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(options.headers.authorization,undefined);assert.equal(options.headers.cookie,undefined);return new Response(master);};
 const req=url=>new Request('https://plugin.example/api/hd.m3u8?url='+encodeURIComponent(url),{headers:{authorization:'private',cookie:'private'}});
 assert.equal((await handleHDPlaylist(req('https://127.0.0.1/a.m3u8'),fetcher)).status,400);assert.equal(calls,0);
 const response=await handleHDPlaylist(req(base),fetcher);assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.match(await response.text(),/1080.m3u8/);
 assert.equal((await handleHDPlaylist(req(base),async()=>new Response('',{status:302,headers:{location:'https://127.0.0.1/a.m3u8'}}))).status,502);
 assert.equal((await handleHDPlaylist(req(base),async()=>new Response('x'.repeat(131073)))).status,502);
 assert.equal((await handleHDPlaylist(req(base),async()=>new Response(master.replace(/1280x528|1920x794/g,'640x360')))).status,502);
});
