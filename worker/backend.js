// Private server credentials never reach the browser or the source site.
function backendOrigin(value,token){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!token)throw Error('backend_not_configured');
 return url.origin;
}
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','x-content-type-options':'nosniff'};
async function postBackend(origin,route,token,raw,signal,fetcher){
 const upstream=await fetcher(new URL(route,origin),{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:raw,redirect:'manual',signal});
 if(upstream.status>=300&&upstream.status<400)throw Error('backend_redirect_rejected');
 const body=await upstream.text();
 if(body.length>2*1024*1024)throw Error('backend_response_too_large');
 let data;try{data=JSON.parse(body);}catch{throw Error('backend_invalid_response');}
 if(!data||typeof data!=='object')throw Error('backend_invalid_response');
 return new Response(JSON.stringify(data),{status:upstream.status,headers});
}
export async function forwardNative(request,env){
 const origin=backendOrigin(env.XOT_BACKEND_URL,env.XOT_BACKEND_TOKEN);
 const route=new URL(request.url).pathname;
 if(!['/api/filmix','/api/rezka'].includes(route))throw Error('backend_invalid_route');
 const raw=await request.text();
 if(raw.length>4096)return Response.json({error:'request_too_large'},{status:413,headers});
 return postBackend(origin,route,env.XOT_BACKEND_TOKEN,raw,AbortSignal.any([request.signal,AbortSignal.timeout(22000)]),fetch);
}
function pause(ms,signal){
 return new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});
 });
}
export async function forwardRezka(request,env,{fetcher=fetch,wait=pause}={}){
 const origin=backendOrigin(env.XOT_REZKA_BACKEND_URL,env.XOT_REZKA_BACKEND_TOKEN);
 if(new URL(request.url).pathname!=='/api/rezka')throw Error('backend_invalid_route');
 const raw=await request.text();
 if(raw.length>4096)return Response.json({error:'request_too_large'},{status:413,headers});
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(100000)]);
 // Render Free can sleep. Wake only for a user request; no periodic keepalive.
 // At most 18 health requests + one API request, below the Free subrequest cap.
 for(let attempt=0;attempt<18;attempt++){
  signal.throwIfAborted();
  let ready=false;
  try{
   const response=await fetcher(new URL('/healthz',origin),{method:'GET',redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
   if(response.status>=300&&response.status<400)throw Error('backend_redirect_rejected');
   if(![200,502,503,504].includes(response.status))throw Error('backend_unavailable');
   const body=await response.text();if(body.length>65536)throw Error('backend_response_too_large');
   if(response.ok){try{ready=JSON.parse(body)?.ok===true;}catch{}}
  }catch(error){
   if(signal.aborted)throw signal.reason;
   if(!/abort|timeout/i.test(String(error?.name)+' '+String(error?.message)))throw error;
  }
  if(ready)return postBackend(origin,'/api/rezka',env.XOT_REZKA_BACKEND_TOKEN,raw,signal,fetcher);
  if(attempt<17)await wait(5000,signal);
 }
 throw Error('backend_unavailable');
}
