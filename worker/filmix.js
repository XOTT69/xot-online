// Independent Filmix device-authorized API adapter.
// The device token is supplied by the Lampa client per request; no credentials
// are stored in Cloudflare, GitHub, or global variables.
const DEFAULT_API='https://filmixapp.cyou/api/v2/';
const DEVICE=/^[a-zA-Z0-9_-]{12,64}$/;
const TOKEN=/^[a-zA-Z0-9._-]{1,256}$/;
const mediaURL=/^https?:\/\/[^/\s]+\/\S+\.(?:mp4|m3u8)(?:[?#].*)?$/i;
const common={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','x-content-type-options':'nosniff'};
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:common});}
function limit(v,max){return String(v||'').trim().slice(0,max);}
function safeURL(api,path,device,token,extra={}){
 const base=new URL(api||DEFAULT_API);
 if(!['http:','https:'].includes(base.protocol)||base.hostname!=='filmixapp.cyou')throw new Error('api_host_not_allowed');
 const url=new URL(base.toString().replace(/\/?$/,'/')+path);
 url.searchParams.set('user_dev_id',device);
 url.searchParams.set('user_dev_name','XOT');
 url.searchParams.set('user_dev_vendor','XOT');
 url.searchParams.set('user_dev_os','web');
 url.searchParams.set('user_dev_apk','2.2.0');
 url.searchParams.set('app_lang','ru-rRU');
 if(token)url.searchParams.set('user_dev_token',token);
 for(const [key,val] of Object.entries(extra))url.searchParams.set(key,val);
 return url;
}
async function call(api,path,device,token,extra){
 const url=safeURL(api,path,device,token,extra);
 const res=await fetch(url,{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(8500),redirect:'error'});
 if(!res.ok)throw new Error('filmix_http_'+res.status);
 const raw=await res.text();
 if(raw.length>1024*1024)throw new Error('filmix_response_too_large');
 let data;try{data=JSON.parse(raw);}catch(e){throw new Error('filmix_invalid_json');}
 if(data&&data.status==='error')throw new Error('filmix_api_error');
 return data;
}
function qualityChoices(url,cap){
 const value=limit(url,3000);
 if(!value)return [];
 let found=value.match(/_\[([\d,]+)\](?=\.(?:mp4|m3u8))/i);
 const qualities=found?found[1].split(',').map(Number).filter(n=>n>=144&&n<=4320):/_(?:%s|%d)(?=\.(?:mp4|m3u8))/i.test(value)?[2160,1440,1080,720,480,360]:[0];
 return [...new Set(qualities)].filter(q=>q===0||q<=cap).map(q=>{
  const concrete=q?value.replace(/_\[[\d,]+\](?=\.(?:mp4|m3u8))/i,'_'+q).replace(/_(?:%s|%d)(?=\.(?:mp4|m3u8))/i,'_'+q):value;
  return mediaURL.test(concrete)?{quality:q?q+'p':'auto',url:concrete}:null;
 }).filter(Boolean);
}
export function flattenFilmixPost(post,cap=480){
 const out=[],links=post&&post.player_links||{},name=limit(post.title,200)||'Відео';
 const add=(voice,link,season,episode)=>{
  for(const choice of qualityChoices(link,cap))out.push({title:name,source:'Filmix',provider:'filmix',translation:limit(voice,90)||'Оригінал',season:season||null,episode:episode||null,...choice});
 };
 const movie=Array.isArray(links.movie)?links.movie:[];
 for(const v of movie)add(v.translation,v.link);
 const seasons=links.playlist&&!Array.isArray(links.playlist)?links.playlist:{};
 for(const [number,voices] of Object.entries(seasons)){
  const season=Number(number)||0;
  if(!season||!voices||typeof voices!=='object')continue;
  for(const [voice,raw] of Object.entries(voices)){
   const episodes=Array.isArray(raw)?raw:Array.isArray(raw&&raw.episodes)?raw.episodes:raw&&typeof raw==='object'?Object.values(raw):[];
   episodes.forEach((item,i)=>{
    const link=typeof item==='string'?item:item&&item.link;
    const num=(item&&Number(item.number||item.episode))||i+1;
    add(voice,link,season,num);
   });
  }
 }
 return out.slice(0,350);
}
function err(e){
 const str=String(e&&e.message||'unavailable');
 if(/^filmix_(?:http_\d{3}|invalid_json|response_too_large|api_error)$/.test(str))return str;
 if(/timeout|abort/i.test(str))return 'filmix_timeout';
 return 'filmix_unavailable';
}
export async function handleFilmix(request,env){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:common});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 const len=Number(request.headers.get('content-length')||0);
 if(len>4096)return reply({error:'request_too_large'},413);
 let input;try{input=await request.json();}catch(e){return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'invalid_request'},400);
 const action=limit(input.action,24),device=limit(input.device_id,70),token=limit(input.device_token,270);
 if(!DEVICE.test(device)||token&&!TOKEN.test(token))return reply({error:'invalid_device_credentials'},400);
 if(!['pair','confirm','search','post','profile'].includes(action))return reply({error:'invalid_action'},400);
 let route='',params={};
 if(action==='pair'||action==='confirm')route='token_request';
 if(action==='search'){route='search';const title=limit(input.title,120);if(!title)return reply({error:'title_required'},400);params.story=title;}
 if(action==='post'){const id=String(input.id||'');if(!/^\d{1,12}$/.test(id))return reply({error:'invalid_id'},400);route='post/'+id;}
 if(action==='profile')route='user_profile';
 try{
  const response=await call(env&&env.FILMIX_API_BASE,route,device,token,params);
  if(action==='pair'||action==='confirm'){
   const userCode=limit(response&&response.user_code,8),deviceToken=limit(response&&(response.user_dev_token||response.code),256);
   if(!deviceToken&&!userCode)return reply({error:'filmix_pairing_response_unrecognized'},502);
   return reply({status:userCode?'pending':'linked',user_code:userCode||null,device_token:deviceToken||token||null,activation_url:'https://filmix.gg/consoles'});
  }
  if(action==='search'){
   const found=Array.isArray(response)?response:Array.isArray(response&&response.results)?response.results:[];
   return reply({results:found.slice(0,45).filter(x=>x&&Number.isInteger(Number(x.id))).map(x=>({id:x.id,title:limit(x.title,200),original_title:limit(x.original_title,200),year:Number(x.year)||null,series:Number(x.section)===7}))});
  }
  if(action==='profile')return reply({linked:Boolean(token),pro:Boolean(response&&response.is_pro),pro_plus:Boolean(response&&response.is_pro_plus)});
  const cap=!token?480:input.plan==='pro_plus'?2160:input.plan==='pro'?1080:720;
  return reply({title:limit(response&&response.title,200),items:flattenFilmixPost(response,cap)});
 }catch(e){return reply({error:err(e)},502);}
}
