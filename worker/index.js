import {handleFilmix} from './filmix.js';
import {handleRezka} from './rezka.js';
import {handleAnilibria} from './anilibria.js';
import {forwardNative} from './backend.js';
import {providers,normalize} from './providers.js';
import {buildQueries,matchScore} from './matching.js';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','x-content-type-options':'nosniff'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers});}
function safeError(error){
 const msg=String(error&&error.message||'unknown');
 if(/^kodik_(public_token_unavailable|public_token_not_found|bad_response)$/.test(msg))return msg;
 if(/^kodik_http_\d{3}$/.test(msg))return msg;
 if(/timeout|abort/i.test(msg))return 'upstream_timeout';
 return 'upstream_request_failed';
}
function getQuery(url){return {title:(url.searchParams.get('title')||'').trim(),tmdb_id:(url.searchParams.get('tmdb_id')||'').trim(),year:(url.searchParams.get('year')||'').trim(),alternative_titles:url.searchParams.getAll('alt').filter(x=>x.length<=200).slice(0,8)};}
function check(q){return ((q.title && q.title.length<=200)||/^\d{1,12}$/.test(q.tmdb_id))&&(!q.year||/^\d{4}$/.test(q.year));}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(['/api/filmix','/api/rezka'].includes(url.pathname)&&request.method==='POST'&&env.XOT_BACKEND_URL){
  try{return await forwardNative(request,env);}catch{return json({error:'backend_unavailable'},502);}
 }
 if(url.pathname==='/api/filmix')return handleFilmix(request,env);
 if(url.pathname==='/api/rezka')return handleRezka(request,env);
 if(url.pathname==='/api/anilibria')return handleAnilibria(request);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'GET, OPTIONS'}});
 if(url.pathname==='/m.js'||url.pathname==='/online.js'){
  if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(!env.ASSETS)return json({error:'assets_not_configured'},503);
  const asset=await env.ASSETS.fetch(request);
  const response=new Response(request.method==='HEAD'?null:asset.body,asset);
  response.headers.set('access-control-allow-origin','*');
  response.headers.set('cache-control','no-store');
  response.headers.set('x-content-type-options','nosniff');
  if(asset.ok)response.headers.set('content-type','application/javascript; charset=utf-8');
  return response;
 }
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 if(url.pathname==='/api/health')return json({ok:true,service:'xot-online',provider_count:providers.filter(p=>!p.enabled||p.enabled(env)).length,native_balancers:['filmix','rezka','anilibria'],features:{filmix_device_flow:true,native_balancers:true}});
 if(url.pathname==='/api/providers')return json({providers:providers.map(p=>({id:p.id,name:p.name,enabled:!p.enabled||p.enabled(env)}))});
 if(url.pathname==='/api/query-plan'||url.pathname==='/api/search'){
  const query=getQuery(url);if(!check(query))return json({error:'invalid_query'},400);
  const titles=buildQueries(query);
  if(url.pathname==='/api/query-plan')return json({titles,tmdb_id:query.tmdb_id||null,year:query.year||null});
  const providerFilter=(url.searchParams.get('provider')||'').trim();
  if(providerFilter&&!/^[a-z_]{2,40}$/.test(providerFilter))return json({error:'invalid_provider'},400);
  const available=providers.filter(p=>(!providerFilter||p.id===providerFilter)&&(!p.enabled||p.enabled(env)));
  const jobs=available.flatMap(provider=>titles.map(title=>({provider,title})));
  const settled=await Promise.allSettled(jobs.map(async job=>{
   const found=await Promise.race([job.provider.search({...query,title:job.title},env),new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),6500))]);
   return (Array.isArray(found)?found:[]).map(item=>normalize(item,job.provider)).filter(Boolean);
  }));
  const result=settled.flatMap((r,i)=>r.status==='fulfilled'?r.value:[]).map(item=>({...item,score:matchScore(item,query)})).filter(item=>item.score>=65);
  const unique=[...new Map(result.map(item=>[item.provider+'|'+(item.url||item.id||item.title)+'|'+(item.episode||''),item])).values()];
  return json({query:{title:query.title,year:query.year,tmdb_id:query.tmdb_id},configured_providers:available.map(p=>p.id),results:unique.sort((a,b)=>b.score-a.score),provider_status:jobs.map((job,i)=>({id:job.provider.id,query:job.title,ok:settled[i].status==='fulfilled',error:settled[i].status==='rejected'?safeError(settled[i].reason):null}))});
 }
 return env.ASSETS?env.ASSETS.fetch(request):json({error:'not_found'},404);
}};
