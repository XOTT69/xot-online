// Optional private Node backend. The client still calls the same Worker API.
export async function forwardNative(request,env){
 const url=new URL(env.XOT_BACKEND_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!env.XOT_BACKEND_TOKEN)throw Error('backend_not_configured');
 const route=new URL(request.url).pathname;
 if(!['/api/filmix','/api/rezka'].includes(route))throw Error('backend_invalid_route');
 const raw=await request.text();
 if(raw.length>4096)return new Response(JSON.stringify({error:'request_too_large'}),{status:413});
 const target=new URL(route,url.origin);
 const upstream=await fetch(target,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.XOT_BACKEND_TOKEN},body:raw,redirect:'manual',signal:AbortSignal.timeout(22000)});
 if(upstream.status>=300&&upstream.status<400)throw Error('backend_redirect_rejected');
 const body=await upstream.text();
 if(body.length>2*1024*1024)throw Error('backend_response_too_large');
 let data;try{data=JSON.parse(body);}catch{throw Error('backend_invalid_response');}
 if(!data||typeof data!=='object')throw Error('backend_invalid_response');
 return new Response(JSON.stringify(data),{status:upstream.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','x-content-type-options':'nosniff'}});
}
