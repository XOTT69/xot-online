import {timingSafeEqual} from 'node:crypto';
import {handleRezka} from '../worker/rezka.js';

const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const diagnosticOrigins=Object.freeze({primary:'https://rezka.ag',home:'https://hdrezka-home.tv',ua:'https://rezka-ua.pub',tv:'https://hdrezka.tv'});

function safeMessage(value){
 return String(typeof value==='string'?value:'')
  .replace(/https?:\/\/[^\s<>"']+/giu,'[URL]')
  .replace(/[A-Za-z0-9+/_-]{24,}={0,2}/g,'[дані]')
  .replace(/[\u0000-\u001f]/g,' ').slice(0,220);
}

// Explicit, authenticated diagnostics expose only status/flags and a redacted
// source error. Never return request headers, cookies or media URLs.
async function traceFetch(fetcher,url,options,traces){
 const response=await fetcher(url,options);
 if(options?.method==='GET'&&/\/(?:films|series)\//.test(new URL(url).pathname)&&traces.length<8){
  try{
   const html=await response.clone().text(),init=html.match(/\.initCDN(?:Movies|Series)Events\(\s*(\d+)\s*,\s*(\d+)/);
   const block=html.slice(init?.index||0,html.indexOf('</script>',init?.index||0));
   const streams=block.match(/['"]streams['"]\s*:\s*("(?:\\.|[^"\\])*"|false|null)/);
   let value;try{value=streams?JSON.parse(streams[1]):undefined;}catch{}
   traces.push({action:'page',status:response.status,initial_voice:init?.[2]||null,initial_stream_type:typeof value,initial_stream_present:typeof value==='string'&&Boolean(value)});
  }catch{}
 }
 if(options?.method==='POST'&&traces.length<8){
  const form=new URLSearchParams(options.body),action=form.get('action');
  if(['get_movie','get_stream','get_episodes'].includes(action)){
   const trace={action,status:response.status,favs_present:Boolean(form.get('favs')),cookies_present:Boolean(options.headers?.cookie)};
   try{
    const raw=await response.clone().text();
    if(raw.length<=100000){
     const data=JSON.parse(raw);
     trace.success=typeof data?.success==='boolean'?data.success:null;
     trace.has_video=typeof data?.url==='string'&&Boolean(data.url);
     trace.url_type=data?.url===null?'null':Array.isArray(data?.url)?'array':typeof data?.url;
     trace.url_length=typeof data?.url==='string'?data.url.length:null;
     trace.fields=Object.keys(data||{}).filter(key=>/^[a-z_][a-z0-9_]{0,30}$/i.test(key)).slice(0,20);
     trace.premium_content=data?.premium_content===1||data?.premium_content==='1';
     trace.message=safeMessage(data?.message||data?.error);
    }
   }catch{}
   traces.push(trace);
  }
 }
 return response;
}

// A server-to-server endpoint. The token is never included in source requests.
export function createVercelRezka({env=process.env,fetcher=fetch}={}){
 return async request=>{
  const token=env.XOT_SERVER_TOKEN,configured=typeof token==='string'&&token.length>=32;
  if(request.method==='GET')return reply({ok:true,service:'xot-rezka',configured,upstream_diagnostics:true,guest_sessions:true,diagnostic_routes:true});
  if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,allow:'GET, POST'}});
  if(!configured)return reply({error:'backend_not_configured'},503);
  const expected=Buffer.from('Bearer '+token),supplied=Buffer.from(request.headers.get('authorization')||'');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply({error:'unauthorized'},401);
  try{
   const diagnose=request.headers.get('x-xot-diagnostics')==='1',traces=[];
   const route=request.headers.get('x-xot-rezka-route'),profile=request.headers.get('x-xot-client');
   if((route||profile)&&(!diagnose||route&&!Object.hasOwn(diagnosticOrigins,route)||profile&&!['native','compatible'].includes(profile)))return reply({error:'invalid_diagnostic_route'},400);
   const origin=route?diagnosticOrigins[route]:env.XOT_REZKA_ORIGIN;
   const transport=profile==='compatible'?(url,options)=>fetcher(url,{...options,headers:{...options.headers,'user-agent':'Mozilla/5.0 (compatible; XOT-Lampa/0.3.16)'}}):fetcher;
   const response=await handleRezka(request,{XOT_REZKA_ORIGIN:origin},diagnose?(url,options)=>traceFetch(transport,url,options,traces):transport);
   if(!diagnose)return response;
   return reply({...await response.json(),diagnostics:traces,diagnostic_route:route||'configured',diagnostic_client:profile||'native'},response.status);
  }catch{return reply({error:'backend_unavailable'},502);}
 };
}
