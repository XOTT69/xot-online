import {trustedURL} from './eneyida.js';

const headers={'access-control-allow-origin':'*','cache-control':'no-store','x-content-type-options':'nosniff'};
function deliveryURL(value,base){
 const url=new URL(value,base);
 if(url.protocol!=='https:'||url.username||url.password||url.port||!/(?:^|\.)(?:hdvbua\.pro|tortuga\.tw|tortuga\.wtf)$/.test(url.hostname)||url.href.length>6000)throw Error('invalid_url');
 return url.href;
}
function hd(line){
 const m=line.slice(line.indexOf(':')+1).match(/(?:^|,)RESOLUTION=(\d+)x(\d+)(?:,|$)/i);if(!m)return false;
 return Number(m[1])>=1200||Number(m[2])>=720;
}
// A small, regenerated master preserves external audio and subtitles. Video,
// audio and subtitle bytes are fetched directly from their published CDN URLs.
export function filterHDMaster(body,base){
 if(!body.trimStart().startsWith('#EXTM3U'))throw Error('invalid_playlist');
 const lines=body.split(/\r?\n/),output=[];let pending=null,count=0;
 for(const raw of lines){
  const line=raw.trim();
  if(line.startsWith('#EXT-X-I-FRAME-STREAM-INF:'))continue;
  if(line.startsWith('#EXT-X-STREAM-INF:')){pending=line;continue;}
  if(!line||line.startsWith('#')){
   if(pending&&line)throw Error('invalid_playlist');
   if(/^#EXT-X-MEDIA:.*TYPE=VIDEO/.test(line))throw Error('unsupported_playlist');
   if(/(?:SAMPLE-AES|KEYFORMAT="(?!identity))/i.test(line))throw Error('unsupported_playlist');
   output.push(line.replace(/URI="([^"]+)"/g,(_,uri)=>'URI="'+deliveryURL(uri,base)+'"'));continue;
  }
  if(!pending)throw Error('invalid_playlist');
  if(hd(pending)){output.push(pending,deliveryURL(line,base));count++;}pending=null;
 }
 if(!count||pending)throw Error('hd_unavailable');
 return output.join('\n')+'\n';
}
export async function handleHDPlaylist(request,fetcher=fetch){
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...headers,allow:'GET, HEAD'}});
 let url;try{const input=new URL(request.url).searchParams.get('url');if(!input||input.length>6000)throw Error();url=trustedURL(input);}catch{return Response.json({error:'invalid_url'},{status:400,headers});}
 try{
  for(let redirects=0;redirects<=2;redirects++){
   const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.any([request.signal,AbortSignal.timeout(8000)]),headers:{accept:'application/vnd.apple.mpegurl'}});
   if(response.status>=300&&response.status<400){
    await response.body?.cancel();const next=response.headers.get('location');if(!next||redirects===2)throw Error();url=trustedURL(new URL(next,url));continue;
   }
   if(!response.ok){await response.body?.cancel();throw Error();}
   const reader=response.body?.getReader();if(!reader)throw Error();let size=0,text='';const decoder=new TextDecoder();
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)throw Error();text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
   const body=filterHDMaster(text,url);
   return new Response(request.method==='HEAD'?null:body,{headers:{...headers,'content-type':'application/vnd.apple.mpegurl; charset=utf-8'}});
  }
 }catch{return Response.json({error:'hd_unavailable'},{status:502,headers});}
}
