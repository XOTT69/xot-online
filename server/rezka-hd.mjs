import {mediaURL} from '../worker/rezka.js';
import {tsDimensions} from './video-dimensions.mjs';

async function fetchPart(value,fetcher,range=false){
 let url=mediaURL(value);
 for(let count=0;count<3;count++){
  const response=await fetcher(url,{headers:range?{range:'bytes=0-65535'}:{},redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(response.status>=300&&response.status<400){await response.body?.cancel();const next=response.headers.get('location');if(!next||count===2)throw Error('redirect');url=mediaURL(new URL(next,url));continue;}
  if(![200,206].includes(response.status)){await response.body?.cancel();throw Error('unavailable');}
  const reader=response.body?.getReader();if(!reader)throw Error('empty');const chunks=[];let size=0;
  try{while(size<65536){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,65536-size);chunks.push(part);size+=part.length;}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return {bytes,url};
 }
}
export async function rezkaVideoDimensions(value,fetcher=fetch){
 let url=mediaURL(value);
 for(let depth=0;depth<3;depth++){
  const manifest=await fetchPart(url,fetcher),text=new TextDecoder().decode(manifest.bytes);
  if(!text.trimStart().startsWith('#EXTM3U')||/#EXT-X-KEY:.*METHOD=(?!NONE)/i.test(text))throw Error('unsupported');
  const first=text.split(/\r?\n/).map(row=>row.trim()).find(row=>row&&!row.startsWith('#'));if(!first)throw Error('empty');
  url=mediaURL(new URL(first,manifest.url));if(url.pathname.endsWith('.m3u8'))continue;
  if(!/\.(?:ts|m4s)(?:$|\?)/i.test(url.pathname))throw Error('unsupported');
  const part=await fetchPart(url,fetcher,true),dimensions=tsDimensions(part.bytes);if(!dimensions)throw Error('unknown_dimensions');
  return {width:dimensions.width,height:dimensions.height};
 }
 throw Error('playlist_depth');
}
export async function verifiedRezkaHD(items,fetcher=fetch){
 const candidates=items.filter(item=>parseInt(item.quality)>=720&&new URL(item.url).pathname.endsWith('.m3u8')).slice(0,4);
 const checked=await Promise.allSettled(candidates.map(async item=>{
  const {width,height}=await rezkaVideoDimensions(item.url,fetcher);
  const quality=width>=3800||height>=2160?2160:width>=2500||height>=1440?1440:width>=1900||height>=1080?1080:width>=1200||height>=720?720:0;
  return quality?{...item,quality:quality+'p',video_width:width,video_height:height}:null;
 }));
 const result=[...new Map(checked.flatMap(row=>row.status==='fulfilled'&&row.value?[row.value]:[]).map(row=>[row.quality,row])).values()];
 if(!result.length)throw Error('rezka_hd_unavailable');return result.sort((a,b)=>parseInt(b.quality)-parseInt(a.quality));
}
