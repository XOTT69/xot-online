import {mediaURL} from '../worker/rezka.js';

async function boundedBody(response,limit){
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('media_probe_too_large');chunks.push(value);}
 }finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function get(value,fetcher,range){
 let url=mediaURL(value);
 for(let count=0;count<3;count++){
  const response=await fetcher(url,{method:'GET',headers:range?{range:'bytes=0-1023'}:{},redirect:'manual',signal:AbortSignal.timeout(5000)});
  if(response.status<300||response.status>=400)return {response,url};
  await response.body?.cancel();const next=response.headers.get('location');
  if(!next||count===2)throw Error('media_probe_redirect');url=mediaURL(new URL(next,url));
 }
}

// Owner-only diagnostic. Generated source URLs only, at most three small HLS
// manifests and the first kilobyte of one fragment; never a video relay.
export async function sampleRezkaMedia(items,fetcher=fetch){
 const item=items?.find(row=>row.quality==='720p')||items?.[0];if(!item)return null;
 let next=item.url;
 for(let depth=0;depth<3;depth++){
  const {response,url}=await get(next,fetcher,false),status=response.status;
  if(status!==200){await response.body?.cancel();return {manifest_status:status};}
  const text=new TextDecoder().decode(await boundedBody(response,65536));
  if(!text.trimStart().startsWith('#EXTM3U'))return {manifest_status:status,error:'media_probe_not_hls'};
  const first=text.split(/\r?\n/).map(row=>row.trim()).find(row=>row&&!row.startsWith('#'));
  if(!first)return {manifest_status:status,error:'media_probe_empty'};
  next=mediaURL(new URL(first,url)).href;
  if(/\.m3u8$/i.test(new URL(next).pathname))continue;
  const fragment=await get(next,fetcher,true),reader=fragment.response.body?.getReader();let bytes;
  try{bytes=(await reader?.read())?.value;}finally{await reader?.cancel();}
  return {manifest_status:status,fragment_status:fragment.response.status,fragment_url:fragment.url.href,fragment_bytes:Math.min(bytes?.length||0,1024),fragment_type:bytes?.[0]===0x47?'ts':bytes?.length>=8?String.fromCharCode(...bytes.slice(4,8)):'unknown'};
 }
 return {error:'media_probe_depth'};
}
