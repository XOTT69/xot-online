// Public AniLiberty/AniLibria API. No account, token, proxy or external runtime.
const API='https://api.anilibria.app/api/v1';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const text=(value,max=200)=>String(value||'').trim().slice(0,max);
function blocked(release){return release.is_blocked_by_geo===true||release.is_blocked_by_copyrights===true;}
function validURL(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&/\.m3u8$/i.test(url.pathname);}catch{return false;}}
export function normalizeRelease(release){
 if(!release||!/^\d{1,8}$/.test(String(release.id))||blocked(release))return null;
 const name=release.name||{},title=text(name.main||name.english);if(!title)return null;
 return {id:Number(release.id),title,original_title:text(name.english||name.alternative),year:Number(release.year)||null,series:release.type?.value!=='MOVIE'};
}
export function releaseStreams(release){
 if(!release||blocked(release))return [];
 const episodes=Array.isArray(release.episodes)?release.episodes:[],series=release.type?.value!=='MOVIE'||episodes.length>1,items=[];
 for(const episode of episodes){
  const ordinal=Number(episode.ordinal);
  if(series&&(!Number.isFinite(ordinal)||ordinal<=0))continue;
  for(const height of [1080,720,480]){
   const url=episode['hls_'+height];if(!validURL(url))continue;
   items.push({title:text(release.name?.main||release.name?.english)||'Аніме',source:'AniLibria',provider:'anilibria',translation:'AniLibria',season:series?1:null,episode:series?ordinal:null,quality:height+'p',url});
  }
 }
 return items.slice(0,3000);
}
async function upstream(path){
 const response=await fetch(API+path,{headers:{accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(7500)});
 if(!response.ok)throw Error('anilibria_http_'+response.status);
 const raw=await response.text();if(raw.length>4*1024*1024)throw Error('anilibria_response_too_large');
 try{return JSON.parse(raw);}catch{throw Error('anilibria_invalid_response');}
}
export async function handleAnilibria(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let input;try{const raw=await request.text();if(raw.length>4096)return reply({error:'request_too_large'},413);input=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'invalid_request'},400);
 if(!['search','post'].includes(input.action))return reply({error:'invalid_action'},400);
 if(input.action==='search'&&(typeof input.title!=='string'||!input.title.trim()||input.title.length>200))return reply({error:'invalid_query'},400);
 if(input.action==='post'&&!/^\d{1,8}$/.test(String(input.id||'')))return reply({error:'invalid_id'},400);
 try{
  if(input.action==='search'){
   const payload=await upstream('/app/search/releases?'+new URLSearchParams({query:input.title.trim()}));
   const releases=Array.isArray(payload)?payload:payload?.data;
   if(!Array.isArray(releases))throw Error('anilibria_invalid_response');
   return reply({results:releases.slice(0,50).map(normalizeRelease).filter(Boolean)});
  }
  const release=await upstream('/anime/releases/'+input.id);
  if(!normalizeRelease(release))return reply({error:blocked(release||{})?'anilibria_restricted':'anilibria_invalid_response'},502);
  return reply({title:text(release.name.main||release.name.english),items:releaseStreams(release)});
 }catch(error){
  const code=String(error?.message||'');
  return reply({error:/^anilibria_(?:http_\d{3}|response_too_large|invalid_response)$/.test(code)?code:/timeout|abort/i.test(code)?'anilibria_timeout':'anilibria_unavailable'},502);
 }
}
