import {providers,normalize} from './providers.js';
import {buildQueries,matchScore} from './matching.js';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','x-content-type-options':'nosniff'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers});}
function getQuery(url){return {title:(url.searchParams.get('title')||'').trim(),tmdb_id:(url.searchParams.get('tmdb_id')||'').trim(),year:(url.searchParams.get('year')||'').trim(),alternative_titles:url.searchParams.getAll('alt').filter(x=>x.length<=200).slice(0,8)};}
function check(q){return ((q.title && q.title.length<=200)||/^\d{1,12}$/.test(q.tmdb_id))&&(!q.year||/^\d{4}$/.test(q.year));}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'GET, OPTIONS'}});
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 if(url.pathname==='/api/health')return json({ok:true,service:'xot-online',provider_count:providers.length});
 if(url.pathname==='/api/providers')return json({providers:providers.map(p=>({id:p.id,name:p.name}))});
 if(url.pathname==='/api/query-plan'||url.pathname==='/api/search'){
  const query=getQuery(url);if(!check(query))return json({error:'invalid_query'},400);
  const titles=buildQueries(query);
  if(url.pathname==='/api/query-plan')return json({titles,tmdb_id:query.tmdb_id||null,year:query.year||null});
  const jobs=providers.flatMap(provider=>titles.map(title=>({provider,title})));
  const settled=await Promise.allSettled(jobs.map(async job=>{
   const found=await Promise.race([job.provider.search({...query,title:job.title},env),new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),6500))]);
   return (Array.isArray(found)?found:[]).map(item=>normalize(item,job.provider)).filter(Boolean);
  }));
  const result=settled.flatMap((r,i)=>r.status==='fulfilled'?r.value:[]).map(item=>({...item,score:matchScore(item,query)})).filter(item=>item.score>=65);
  const unique=[...new Map(result.map(item=>[item.provider+'|'+item.title+'|'+(item.year||''),item])).values()];
  return json({query:{title:query.title,year:query.year,tmdb_id:query.tmdb_id},results:unique.sort((a,b)=>b.score-a.score),provider_status:jobs.map((job,i)=>({id:job.provider.id,query:job.title,ok:settled[i].status==='fulfilled'}))});
 }
 return env.ASSETS?env.ASSETS.fetch(request):json({error:'not_found'},404);
}};
