import {sameMovie} from './matching.js';
import {trustedURL,resolvePlayerItem} from './eneyida.js';
import {catalogPlayer} from './ukrainian.js';

const ORIGIN='https://kinostrain.com',headers={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const clean=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,200);
export function kinostrainPath(path){
 if(typeof path!=='string'||path.length>250||!/^\/(?:movie-[a-z0-9-]+|[a-z0-9-]+\/season-[1-9]\d{0,2})$/.test(path))throw Error('invalid_path');return path;
}
function searchRow(row){
 if(!row||!['movie','serial','cartoon-movie','cartoon-serial'].includes(row.type)||row.format==='anime'||!/^[a-z0-9-]{1,180}$/.test(row.slug))return null;
 const series=row.type.endsWith('serial'),n=Number(row.firstReadySeason?.number)||1;
 return {id:String(row.id||row.slug),path:series?'/'+row.slug+'/season-'+n:'/movie-'+row.slug,title:clean(row.name),original_title:clean(row.originalName),year:Number(row.yearStart)||null,series};
}
export function parseKinostrainSearch(data){return (Array.isArray(data?.data)?data.data:[]).map(searchRow).filter(row=>row&&row.title).slice(0,20);}
async function read(url,fetcher){
 const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{accept:'application/json,text/html'}});
 if([403,429].includes(response.status))throw Error('access_denied');if(!response.ok||response.status>=300)throw Error('http_'+response.status);
 const reader=response.body?.getReader();if(!reader)throw Error('invalid_response');let size=0,body='';const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000)throw Error('response_too_large');body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}finally{await reader.cancel();}
 if(/cf-chl-|<title>\s*(?:Just a moment|Attention Required)/i.test(body))throw Error('access_denied');return body;
}
// Nuxt's devalue payload is indexed JSON, not executable JavaScript. Resolve
// only the selected content branch with explicit cycle/depth/size limits.
export function parseKinostrainPost(html,path){
 kinostrainPath(path);const payload=html.match(/<script\b(?=[^>]*\bid=["']__NUXT_DATA__["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
 if(!payload)throw Error('player_not_found');let table;try{table=JSON.parse(payload[1]);}catch{throw Error('player_format');}
 if(!Array.isArray(table)||table.length>30000)throw Error('player_format');
 const slug=path.startsWith('/movie-')?path.slice(7):path.split('/')[1],season=path.includes('/season-')?Number(path.split('/season-')[1]):null;
 const key='content-'+(season?slug+'-s'+season:'movie-'+slug),record=table.find(row=>row&&typeof row==='object'&&!Array.isArray(row)&&Object.hasOwn(row,key));
 if(!record)throw Error('player_not_found');let visits=0;
 function resolve(index,depth=0,seen=new Set()){
  if(!Number.isInteger(index))throw Error('player_format');if(index<0)return null;
  if(index>=table.length||depth>40||++visits>15000||seen.has(index))throw Error('player_format');
  const value=table[index];if(value===null||typeof value!=='object')return value;
  const next=new Set(seen);next.add(index);
  if(Array.isArray(value)){
   if(['Reactive','ShallowReactive','Ref','ShallowRef'].includes(value[0]))return resolve(value[1],depth+1,next);
   return value.map(ref=>resolve(ref,depth+1,next));
  }
  const result=Object.create(null);
  for(const [name,ref]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(name))throw Error('player_format');result[name]=resolve(ref,depth+1,next);}return result;
 }
 function objectAt(index){let value=table[index];for(let depth=0;depth<4&&Array.isArray(value)&&['Reactive','ShallowReactive','Ref','ShallowRef'].includes(value[0]);depth++)value=table[value[1]];if(!value||Array.isArray(value)||typeof value!=='object')throw Error('player_format');return value;}
 const wrapper=objectAt(record[key]),source=objectAt(wrapper.data),data=Object.create(null);
 // Cast, recommendations, comments and image galleries are not player data.
 // Avoid inflating their devalue graphs on the free Worker's CPU budget.
 for(const name of ['id','name','originalName','slug','type','format','yearStart'])if(Object.hasOwn(source,name))data[name]=resolve(source[name]);
 const seasons=table[source.seasons];if(!Array.isArray(seasons))throw Error('player_format');
 data.seasons=seasons.map(index=>{const row=objectAt(index),result=Object.create(null);for(const name of ['number','playerData','rightsBlocked','announce'])if(Object.hasOwn(row,name))result[name]=resolve(row[name]);return result;});
 if(!data||data.slug!==slug||!/^(?:movie|serial|cartoon-movie|cartoon-serial)$/.test(data.type)||data.format==='anime')throw Error('movie_mismatch');
 const row=searchRow({...data,firstReadySeason:{number:season||1}});if(!row)throw Error('movie_mismatch');
 const active=(data.seasons||[]).find(s=>Number(s.number)===(season||1));
 if(!active||active.rightsBlocked||active.announce||!active.playerData)throw Error('stream_unavailable');
 const entries=[];
 function add(sources,episode){
  for(const source of Array.isArray(sources?.tortuga)?sources.tortuga:[]){
   let url;try{url=trustedURL(source.link,'player');}catch{continue;}
   const translation=clean(source.name)||'Оригінал',voice_id='kinostrain:'+translation;
   entries.push({provider:'kinostrain',source:'Kinostrain',title:row.title,catalog_path:path,translation,voice_id,season:row.series?season:null,episode:row.series?episode:null,resolve_url:url.href,needs_resolve:true,quality:'Авто'});
  }
 }
 if(row.series){for(const [episode,sources]of Object.entries(active.playerData)){if(/^[1-9]\d{0,3}$/.test(episode))add(sources,Number(episode));}}
 else add(active.playerData['1']||active.playerData,null);
 return {...row,path,seasons:(data.seasons||[]).map(s=>Number(s.number)).filter(n=>n>0&&n<=999),items:entries.slice(0,500)};
}
const query=m=>({title:m.titles[0],alternative_titles:m.titles.slice(1),year:m.year,series:m.series});
export async function handleKinostrain(request,fetcher=fetch){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let input;try{const body=await request.text();if(body.length>8192)return reply({error:'request_too_large'},413);input=JSON.parse(body);}catch{return reply({error:'invalid_json'},400);}
 if(!input||!['search','post','stream'].includes(input.action))return reply({error:'invalid_action'},400);
 if(input.movie&&(!Array.isArray(input.movie.titles)||!input.movie.titles.length||input.movie.titles.length>8||input.movie.titles.some(t=>typeof t!=='string'||!t.trim()||t.length>200)||input.movie.year&&!/^\d{4}$/.test(String(input.movie.year))||input.movie.series!==undefined&&typeof input.movie.series!=='boolean'))return reply({error:'invalid_movie'},400);
 if(input.action==='search'&&(typeof input.title!=='string'||!input.title.trim()||input.title.length>200))return reply({error:'invalid_query'},400);
 try{if(input.action!=='search')kinostrainPath(input.action==='stream'?input.catalog_path:input.path);}catch{return reply({error:'kinostrain_invalid_path'},400);}
 try{
  if(input.action==='search'){
   const data=JSON.parse(await read('https://api.kinostrain.com/api/search?q='+encodeURIComponent(input.title.trim())+'&limit=20',fetcher));let results=parseKinostrainSearch(data);
   if(input.movie)results=results.filter(row=>sameMovie(row,query(input.movie)));return reply({results});
  }
  const path=input.action==='stream'?input.catalog_path:input.path,post=parseKinostrainPost(await read(ORIGIN+path,fetcher),path);
  if(input.movie&&!sameMovie(post,query(input.movie)))throw Error('movie_mismatch');
  if(input.action==='stream'){
   const item=post.items.find(row=>row.voice_id===input.voice_id&&row.episode===(Number(input.episode)||null)&&row.season===(Number(input.season)||null));
   if(!item||item.resolve_url!==input.resolve_url)throw Error('movie_mismatch');
   const raw=await catalogPlayer(item.resolve_url,post,ORIGIN+path,{singleEpisode:post.series}),streams=raw.filter(row=>!row.episode||row.season===item.season&&row.episode===item.episode);
   const resolved=(await Promise.all(streams.slice(0,4).map(row=>resolvePlayerItem({...row,...item,url:row.url,needs_resolve:true})))).flat();
   if(!resolved.length)throw Error('stream_unavailable');return reply({items:resolved});
  }
  // Other seasons publish their own metadata. Load at most four in parallel;
  // individual player/media requests remain lazy until the user selects a row.
  let items=post.items;
  if(post.series){
   const others=post.seasons.filter(n=>n!==Number(path.split('/season-')[1])).slice(0,4),slug=path.split('/')[1];
   const settled=await Promise.allSettled(others.map(async n=>{const p='/'+slug+'/season-'+n;const next=parseKinostrainPost(await read(ORIGIN+p,fetcher),p);if(next.id!==post.id||next.original_title!==post.original_title||next.year!==post.year)throw Error('movie_mismatch');return next.items;}));
   items=items.concat(settled.flatMap(row=>row.status==='fulfilled'?row.value:[]));
  }
  if(!items.length)throw Error('player_not_found');return reply({...post,items});
 }catch(error){let code=String(error?.message||'').replace(/^eneyida_/,'');if(!/^(?:invalid_path|invalid_url|movie_mismatch|access_denied|http_\d{3}|invalid_response|response_too_large|player_format|player_not_found|stream_unavailable|invalid_playlist)$/.test(code))code=/timeout|abort/i.test(code)?'timeout':'unavailable';return reply({error:'kinostrain_'+code},502);}
}
