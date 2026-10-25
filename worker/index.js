import {providers,normalize,archiveVariants} from './providers.js';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','x-content-type-options':'nosniff'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers});}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'GET, OPTIONS'}});
  if(request.method!=='GET') return json({error:'method_not_allowed'},405);
  if(url.pathname==='/api/health') return json({ok:true,service:'xot-online',provider_count:providers.length});
  if(url.pathname==='/api/providers') return json({providers:providers.map(p=>({id:p.id,name:p.name}))});
  if(url.pathname==='/api/search'){
    const query={title:(url.searchParams.get('title')||'').trim(),tmdb_id:(url.searchParams.get('tmdb_id')||'').trim(),year:(url.searchParams.get('year')||'').trim()};
    if((!query.title||query.title.length>200)&& !/^\d{1,12}$/.test(query.tmdb_id))return json({error:'title_or_tmdb_id_required'},400);
    if(query.year&&!/^\d{4}$/.test(query.year))return json({error:'invalid_year'},400);
    const status=await Promise.allSettled(providers.map(p=>p.search(query,env)));
    return json({query,results:status.flatMap((r,i)=>r.status==='fulfilled'?(Array.isArray(r.value)?r.value:[]).map(x=>normalize(x,providers[i])).filter(Boolean):[]),
      provider_status:status.map((r,i)=>({id:providers[i].id,ok:r.status==='fulfilled'}))});
  }
  if(url.pathname==='/api/variants'){
    if(url.searchParams.get('provider')!=='archive')return json({error:'unsupported_provider'},400);
    try{return json({variants:await archiveVariants(url.searchParams.get('identifier')||'')});}
    catch(e){return json({error:e.message==='invalid_identifier'?'invalid_identifier':'source_unavailable'},e.message==='invalid_identifier'?400:502);}
  }
  return env.ASSETS?env.ASSETS.fetch(request):json({error:'not_found'},404);
}};
