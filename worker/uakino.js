import {parseDocument,DomUtils} from 'htmlparser2';
import {sameMovie} from './matching.js';
import {siteFetch} from './ukrainian.js';
import {playerFile,playerInventory,hlsQualities} from './eneyida.js';

const SITE={origin:'https://uakino.eu',name:'UAKino'};
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','x-content-type-options':'nosniff'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const clean=(value,max=240)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
const all=(node,predicate)=>DomUtils.findAll(predicate,node.children||[]);
const first=(node,predicate)=>all(node,predicate)[0];
const cls=(node,name)=>(node.attribs?.class||'').split(/\s+/).includes(name);
const text=node=>node?clean(DomUtils.textContent(node)):'';
function pathOf(value){
 if(typeof value!=='string'||value.length>500||!/^\/(?:filmy|seriesss|cartoon|animeukr)(?:\/[a-z0-9_-]+)*\/\d{1,8}-[a-z0-9-]+\.html$/i.test(value))throw Error('invalid_path');return value;
}
function baseTitle(value,series){return clean(series?value.replace(/\s+\d+\s*(?:сезон|season)(?:\s.*)?$/iu,''):value);}
function imdb(node){return first(node,n=>n.name==='img'&&/\/tt\d+\//.test(n.attribs?.src||''))?.attribs.src.match(/\/(tt\d+)\//)?.[1]||null;}
export function ashdiURL(value,player=false){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('invalid_url');
 if(player){if(url.hostname!=='ashdi.vip'||!/^\/(?:vod|serial)\/\d{1,9}$/.test(url.pathname))throw Error('invalid_url');url.search='';}
 else if(!/(?:^|\.)ashdi\.vip$/.test(url.hostname)||!url.pathname.endsWith('.m3u8'))throw Error('invalid_url');
 return url;
}
async function ashdiFetch(value,player=false,referer=SITE.origin+'/'){
 const url=ashdiURL(value,player),body=await siteFetch({origin:url.origin},url.pathname+url.search,undefined,{referer});
 if(/Змініть країну перегляду|недоступний для перегляду[\s\S]{0,200}в цій країні/iu.test(body))throw Error('region_restricted');
 return body;
}
export function parseUakinoSearch(html){
 const root=parseDocument(html),content=first(root,n=>n.attribs?.id==='dle-content');if(!content)return [];
 const items=[],seen=new Set();
 for(const card of all(content,n=>cls(n,'movie-item')&&cls(n,'short-item'))){
  const link=first(card,n=>n.name==='a'&&cls(n,'movie-title'));if(!link)continue;
  let path;try{const url=new URL(link.attribs.href,SITE.origin);if(url.origin!==SITE.origin)continue;path=pathOf(url.pathname);}catch{continue;}
  const id=path.match(/\/(\d+)-[^/]+\.html$/)[1];if(seen.has(id))continue;
  const series=path.startsWith('/seriesss/')||!!first(card,n=>cls(n,'full-season'));
  const year=all(card,n=>cls(n,'movie-desk-item')).map(text).find(v=>/^Рік виходу:/u.test(v))?.match(/\b(19\d{2}|20\d{2})\b/);
  const slug=path.split('/').pop().replace(/^\d+-/,'').replace(/-(?:19|20)\d{2}\.html$/,'').replace(/\.html$/,'');
  seen.add(id);items.push({id,path,title:baseTitle(text(link),series),original_title:baseTitle(slug.replace(/-/g,' '),series),year:year?Number(year[1]):null,series,imdb_id:imdb(card)});
 }
 return items.slice(0,50);
}
export function parseUakinoPost(html,path){
 const root=parseDocument(html),content=first(root,n=>n.attribs?.id==='dle-content');if(!content)throw Error('player_not_found');
 const section=first(content,n=>n.attribs&&'data-uakino-player-tabs' in n.attribs);if(!section)throw Error('player_not_found');
 const series=path.startsWith('/seriesss/')||Number(section.attribs['data-season'])>0;
 const fields=all(content,n=>cls(n,'fi-item')),field=label=>{
  const node=fields.find(n=>text(first(n,v=>cls(v,'fi-label'))).replace(/:$/,'')===label);return text(node&&first(node,n=>cls(n,'fi-desc')));
 };
 const year=field('Рік виходу').match(/\b(19\d{2}|20\d{2})\b/),translation=field('Мова озвучення')||'Українська',players=[];
 for(const panel of all(section,n=>n.attribs?.['data-player-panel']==='ashdi')){
  for(const node of all(panel,n=>n.name==='textarea'&&cls(n,'uakino-embed__source')||n.name==='iframe')){
   try{const url=ashdiURL(node.name==='iframe'?node.attribs.src:text(node),true).toString();if(!players.includes(url))players.push(url);}catch{}
  }
 }
 const title=baseTitle(text(first(content,n=>cls(n,'solototle'))),series),original_title=baseTitle(text(first(content,n=>cls(n,'origintitle'))),series);
 if(!title||!original_title)throw Error('invalid_response');
 const poster=first(content,n=>cls(n,'film-poster'));
 return {id:path.match(/\/(\d+)-[^/]+\.html$/)?.[1],path,title,original_title,year:year?Number(year[1]):null,series,imdb_id:imdb(poster||content),translation,language:/укра[їи]н|\bukr\b/i.test(translation)?'uk':undefined,players,season:Number(section.attribs['data-season'])||1,episodes_total:Number(section.attribs['data-episodes-total'])||0,last_episode:Number(section.attribs['data-last-episode'])||0};
}
async function resolve(item){
 const url=ashdiURL(item.url),body=await ashdiFetch(url);
 return hlsQualities(body,url,ashdiURL).map(variant=>({...item,...variant,needs_resolve:false}));
}
function query(movie){return {title:movie.titles[0],alternative_titles:movie.titles.slice(1),year:movie.year,series:typeof movie.series==='boolean'?movie.series:undefined,imdb_id:movie.imdb_id};}
export async function handleUakino(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let input;try{const raw=await request.text();if(raw.length>8192)return reply({error:'request_too_large'},413);input=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'invalid_request'},400);
 if(!['search','post','stream'].includes(input.action))return reply({error:'invalid_action'},400);
 if(input.action==='search'&&(typeof input.title!=='string'||!input.title.trim()||input.title.length>200))return reply({error:'invalid_query'},400);
 if(input.movie&&(!Array.isArray(input.movie.titles)||!input.movie.titles.length||input.movie.titles.length>8||input.movie.titles.some(v=>typeof v!=='string'||v.length>200)||input.movie.year&&!/^\d{4}$/.test(String(input.movie.year))||input.movie.imdb_id&&!/^tt\d{6,10}$/.test(input.movie.imdb_id)))return reply({error:'invalid_movie'},400);
 try{if(input.action==='post')pathOf(input.path);if(input.action==='stream')ashdiURL(input.url);}catch(error){return reply({error:'uakino_'+error.message},400);}
 try{
  if(input.action==='search'){
   const body=await siteFetch(SITE,'/index.php',{do:'search',subaction:'search',story:input.title.trim()});let results=parseUakinoSearch(body);
   if(input.movie)results=results.filter(item=>sameMovie(item,query(input.movie)));return reply({results});
  }
  if(input.action==='stream')return reply({items:await resolve({title:clean(input.title)||'Відео',provider:'uakino',source:'UAKino',translation:clean(input.translation)||'Українська',voice_id:clean(input.voice_id),season:Number(input.season)>0?Number(input.season):null,episode:Number(input.episode)>0?Number(input.episode):null,url:input.url,language:input.language==='uk'?'uk':undefined})});
  const body=await siteFetch(SITE,input.path),post=parseUakinoPost(body,input.path);
  if(input.movie&&!sameMovie(post,query(input.movie)))throw Error('movie_mismatch');
  if(post.series&&!post.players.length){
   const raw=await siteFetch(SITE,'/index.php?controller=ajax&mod=smart_playlist',{news_id:post.id,season:post.season,episodes_total:post.episodes_total,last_episode:post.last_episode},{ajax:true,referer:SITE.origin+post.path});
   let data;try{data=JSON.parse(raw);}catch{throw Error('invalid_response');}
   if(!data?.ok||typeof data.html!=='string')throw Error('player_not_found');
   const root=parseDocument(data.html);
   for(const frame of all(root,n=>n.name==='iframe')){try{const url=ashdiURL(frame.attribs.src,true).toString();if(!post.players.includes(url))post.players.push(url);}catch{}}
  }
  if(!post.players.length)throw Error('player_not_found');
  if(post.players.length>4)throw Error('response_too_large');
  const groups=await Promise.all(post.players.map(async url=>playerInventory(playerFile(await ashdiFetch(url,true,SITE.origin+post.path)),{...post,provider:'uakino',source:'UAKino'},ashdiURL)));
  let items=[...new Map(groups.flat().map(item=>[[item.url,item.season,item.episode,item.voice_id].join('|'),item])).values()];
  if(!items.length)throw Error('stream_unavailable');
  if(!post.series&&items.length<=8)items=(await Promise.all(items.map(item=>resolve(item).catch(()=>[item])))).flat();
  const {players,episodes_total,last_episode,season,...metadata}=post;
  return reply({...metadata,items});
 }catch(error){
  let code=String(error?.message||'').replace(/^eneyida_/,'');
  if(!/^(?:region_restricted|access_denied|redirect|http_\d{3}|response_too_large|player_not_found|player_format|invalid_playlist|unsupported_stream|stream_unavailable|movie_mismatch|invalid_url|invalid_response)$/.test(code))code=/timeout|abort/i.test(code)?'timeout':'unavailable';
  return reply({error:'uakino_'+code},502);
 }
}
