import {createHmac,timingSafeEqual} from 'node:crypto';
import {mediaURL} from '../worker/rezka.js';

const headers={'access-control-allow-origin':'*','access-control-expose-headers':'Content-Range, Accept-Ranges, Content-Length','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const MAX_PART=32*1024*1024;
function upstreamURL(value){
 const url=mediaURL(value);
 if(!/\.(?:m3u8|ts|m4s|mp4|aac|key)(?:$|:hls:)/i.test(url.pathname))throw Error('invalid_media');return url;
}
export function signRezkaMedia(value,origin,secret,expires=Math.floor(Date.now()/1000)+21600){
 const url=upstreamURL(value);const payload=Buffer.from(JSON.stringify({u:url.href,e:expires})).toString('base64url');
 const signature=createHmac('sha256',secret).update(payload).digest('base64url');
 return origin+'/media/'+signature+'/'+payload+(url.pathname.endsWith('.m3u8')?'/index.m3u8':'/fragment');
}
function verify(request,secret){
 const path=new URL(request.url).pathname,match=path.match(/^\/media\/([a-zA-Z0-9_-]{43})\/([a-zA-Z0-9_-]{1,10000})\/(?:index\.m3u8|fragment)$/);
 if(!match)throw Error('unauthorized');const expected=createHmac('sha256',secret).update(match[2]).digest(),received=Buffer.from(match[1],'base64url');
 if(expected.length!==received.length||!timingSafeEqual(expected,received))throw Error('unauthorized');
 const data=JSON.parse(Buffer.from(match[2],'base64url')),now=Math.floor(Date.now()/1000);
 if(!Number.isInteger(data.e)||data.e<now||data.e>now+21660)throw Error('unauthorized');return {url:upstreamURL(data.u),expires:data.e};
}
async function fetchMedia(url,request,fetcher){
 let current=url;const range=request.headers.get('range');if(range&&!/^bytes=\d+-\d*$/.test(range))throw Error('invalid_range');
 for(let count=0;count<3;count++){
  const response=await fetcher(current,{method:'GET',headers:range?{range}:{},redirect:'manual',signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)])});
  if(response.status<300||response.status>=400)return {response,url:current};
  await response.body?.cancel();const next=response.headers.get('location');if(!next||count===2)throw Error('media_redirect');current=upstreamURL(new URL(next,current));
 }
}
async function manifestBody(response){
 const reader=response.body?.getReader();if(!reader)throw Error('empty');let size=0,text='';const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024)throw Error('too_large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}return text;
}
export function rewriteRezkaManifest(text,base,origin,secret,expires){
 if(!text.trimStart().startsWith('#EXTM3U'))throw Error('not_hls');
 if(/METHOD=SAMPLE-AES|KEYFORMAT="(?!identity)/i.test(text))throw Error('unsupported');
 let pending=null;const result=[];
 function signed(uri){return signRezkaMedia(new URL(uri,base),origin,secret,expires);}
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim();
  if(line.startsWith('#EXT-X-STREAM-INF:')){pending=line;continue;}
  if(line.startsWith('#EXT-X-I-FRAME-STREAM-INF:'))continue;
  if(!line||line.startsWith('#')){result.push(line.replace(/URI="([^"]+)"/g,(_,uri)=>'URI="'+signed(uri)+'"'));continue;}
  if(pending){const m=pending.match(/RESOLUTION=(\d+)x(\d+)/i);if(!m||Number(m[1])<1200&&Number(m[2])<720){pending=null;continue;}result.push(pending);pending=null;}
  result.push(signed(line));
 }
 if(pending)throw Error('invalid_hls');return result.join('\n');
}
export async function handleRezkaRelay(request,{secret,origin,fetcher=fetch}={}){
 if(!secret||secret.length<32)return new Response(null,{status:503,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'GET, HEAD, OPTIONS','access-control-allow-headers':'Range'}});
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers});
 let source;try{source=verify(request,secret);}catch{return new Response(null,{status:403,headers});}
 try{
  const {response,url}=await fetchMedia(source.url,request,fetcher);
  if(![200,206].includes(response.status)){await response.body?.cancel();return new Response(null,{status:response.status===416?416:502,headers});}
  if(url.pathname.endsWith('.m3u8')){
   const text=rewriteRezkaManifest(await manifestBody(response),url,origin,secret,source.expires);
   return new Response(request.method==='HEAD'?null:text,{headers:{...headers,'content-type':'application/vnd.apple.mpegurl; charset=utf-8'}});
  }
  // Relay fragments only. Whole MP4 downloads are outside this free HLS path.
  if(/\.mp4$/i.test(url.pathname)&&!request.headers.has('range')){await response.body?.cancel();return new Response(null,{status:416,headers});}
  const length=Number(response.headers.get('content-length'));if(length>MAX_PART){await response.body?.cancel();return new Response(null,{status:413,headers});}
  const type=response.headers.get('content-type')||'application/octet-stream';if(/text\/html|application\/json/i.test(type)){await response.body?.cancel();throw Error('not_media');}
  const resultHeaders={...headers,'content-type':type,'accept-ranges':'bytes'};
  for(const key of ['content-length','content-range'])if(response.headers.has(key))resultHeaders[key]=response.headers.get(key);
  if(request.method==='HEAD'){await response.body?.cancel();return new Response(null,{status:response.status,headers:resultHeaders});}
  let bytes=0;const reader=response.body.getReader();
  const body=new ReadableStream({async pull(controller){try{const {done,value}=await reader.read();if(done){controller.close();return;}bytes+=value.length;if(bytes>MAX_PART){await reader.cancel();throw Error('fragment_too_large');}controller.enqueue(value);}catch(error){controller.error(error);}},cancel(){return reader.cancel();}});
  return new Response(body,{status:response.status,headers:resultHeaders});
 }catch{return new Response(null,{status:502,headers});}
}
