import {parseDocument, DomUtils} from 'htmlparser2';
import {sameMovie} from './matching.js';

const DEFAULT_ORIGIN='https://hdrezka.ag';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','x-content-type-options':'nosniff'};
const ID=/^\d{1,10}$/;
const text=node=>DomUtils.textContent(node).replace(/\s+/g,' ').trim();
const all=(root,predicate)=>DomUtils.findAll(predicate,root.children||[]);
const hasClass=(node,name)=>(node.attribs?.class||'').split(/\s+/).includes(name);
const first=(root,predicate)=>all(root,predicate)[0];
const limit=(value,size=200)=>String(value||'').trim().slice(0,size);
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});

function trustedOrigin(value){
 const url=new URL(value);
 // Host comes only from deployment configuration; no client-supplied upstreams.
 if(url.protocol!=='https:'||url.username||url.password||url.port||!/(?:^|\.)(?:hdrezka\.(?:ag|tv|me|cm|la|ink|buzz|loan|rest|center|fyi|run|today|win|tips|solutions)|hdrezka-home\.tv|rezka\.ag|rezka-ua\.net)$/.test(url.hostname))throw Error('rezka_invalid_origin');
 return url.origin;
}
function originOf(env){return trustedOrigin(env?.XOT_REZKA_ORIGIN||DEFAULT_ORIGIN);}
function pathOf(value){
 const path=String(value||'');
 if(!/^\/(?:films|series|animation|cartoons)\/[a-z0-9_/-]+\.html$/i.test(path)||path.includes('..')||path.length>500)throw Error('rezka_invalid_path');
 return path;
}
async function upstream(origin,path,form,redirects=0){
 const url=new URL(path,origin);
 if(url.origin!==origin)throw Error('rezka_invalid_path');
 const headers={accept:form?'application/json':'text/html','user-agent':'XOT-Lampa/0.3.0','referer':origin+'/'};
 if(form){headers['content-type']='application/x-www-form-urlencoded';headers['x-requested-with']='XMLHttpRequest';headers.origin=origin;}
 const response=await fetch(url,{method:form?'POST':'GET',headers,body:form?new URLSearchParams(form).toString():undefined,redirect:'manual',signal:AbortSignal.timeout(8000)});
 if(response.status>=300&&response.status<400){
  const next=new URL(response.headers.get('location')||origin,url);
  try{trustedOrigin(next);}catch{throw Error('rezka_mirror_redirect');}
  if(redirects>=3)throw Error('rezka_mirror_redirect');
  return upstream(next.origin,next.pathname+next.search,form,redirects+1);
 }
 if(response.status===403||response.status===429)throw Error('rezka_access_denied');
 if(!response.ok)throw Error('rezka_http_'+response.status);
 const body=await response.text();
 if(body.length>2*1024*1024)throw Error('rezka_response_too_large');
 if(/cf-chl-|Just a moment|captcha-container|<title>[^<]*(?:Проверяем[^<]*не бот|verify[^<]*human)/i.test(body))throw Error('rezka_access_denied');
 if(!form)return {body,origin};
 let data;try{data=JSON.parse(body);}catch{throw Error('rezka_invalid_response');}
 if(!data||data.success===false)throw Error('rezka_stream_unavailable');
 return data;
}
export function parseRezkaSearch(html,origin=DEFAULT_ORIGIN){
 const root=parseDocument(html),seen=new Set(),results=[];
 const candidates=all(root,node=>hasClass(node,'b-content__inline_item')).filter(node=>{
  for(let parent=node.parent;parent;parent=parent.parent){
   if(['aside','nav','header','footer'].includes(parent.name)||/(?:^|\s)(?:b-sidelist|b-post__related|recommendations|related)(?:\s|$)/.test(parent.attribs?.class||''))return false;
  }
  return true;
 });
 for(const node of candidates){
  const content=first(node,n=>hasClass(n,'b-content__inline_item-link'))||node;
  const link=first(content,n=>n.name==='a'&&n.attribs?.href);
  if(!link)continue;
  let path;try{const u=new URL(link.attribs.href,origin);if(u.origin!==origin)continue;path=pathOf(u.pathname);}catch{continue;}
  const id=node.attribs?.['data-id']||path.match(/\/(\d+)-[^/]+\.html$/)?.[1];
  if(!ID.test(String(id))||seen.has(id))continue;
  const title=limit(text(link));if(!title)continue;
  seen.add(id);
  const detail=all(content,n=>n.name==='div'||n.name==='span').map(text).join(' ')||text(content),year=detail.match(/\b(19\d{2}|20\d{2})\b/);
  results.push({id:String(id),path,title,original_title:'',year:year?Number(year[1]):null,series:path.startsWith('/series/')?true:path.startsWith('/films/')?false:undefined});
 }
 return results.slice(0,50);
}
export function parseRezkaPost(html,path){
 const root=parseDocument(html);
 const init=html.match(/\.initCDN(Movies|Series)Events\(\s*(\d+)\s*,\s*(\d+)/);
 const id=first(root,n=>n.attribs?.id==='post_id')?.attribs?.value||init?.[2];
 if(!ID.test(String(id)))throw Error('rezka_player_not_found');
 const list=first(root,n=>n.attribs?.id==='translators-list');
 const translations=list?all(list,n=>ID.test(n.attribs?.['data-translator_id']||'')).map(n=>({id:n.attribs['data-translator_id'],title:limit(text(n),120),is_camrip:n.attribs['data-camrip']||'0',is_ads:n.attribs['data-ads']||'0',is_director:n.attribs['data-director']||'0'})):[];
 if(!translations.length&&init)translations.push({id:init[3],title:'Основне озвучення',is_camrip:'0',is_ads:'0',is_director:'0'});
 if(!translations.length)throw Error('rezka_translations_not_found');
 const titleNode=first(root,n=>hasClass(n,'b-post__title'));
 return {id:String(id),path,title:titleNode?limit(text(titleNode)):'',series:init?.[1]==='Series'||path.startsWith('/series/'),translations};
}
export function parseRezkaEpisodes(html){
 const root=parseDocument(html),seasons=new Map();
 for(const node of all(root,n=>hasClass(n,'b-simple_episode__item'))){
  const season=Number(node.attribs['data-season_id']),episode=Number(node.attribs['data-episode_id']);
  if(!Number.isInteger(season)||!Number.isInteger(episode)||season<1||episode<1)continue;
  if(!seasons.has(season))seasons.set(season,new Set());seasons.get(season).add(episode);
 }
 return [...seasons].sort((a,b)=>a[0]-b[0]).map(([season,episodes])=>({season,episodes:[...episodes].sort((a,b)=>a-b)}));
}
export function parseRezkaStreams(value){
 // Decode the public player's base64 representation, never execute page scripts.
 let data=String(value||'');
 if(data.length>100000)throw Error('rezka_response_too_large');
 if(/^#(?:h|9)/.test(data)){
  data=data.slice(2);
  for(const marker of ['$$!!@$$@^!@#$$@','@@@@@!##!^^^','####^!!##!@@','^^^!@##!!##','$$#!!@#!@##'])data=data.split('//_//'+btoa(marker)).join('');
  try{data=atob(data);}catch{throw Error('rezka_unsupported_stream_format');}
 }
 const items=[];
 for(const match of data.matchAll(/\[([^\]]{1,30})\]([^\[]+)/g)){
  const quality=match[1].trim();
  for(const raw of match[2].replace(/,\s*$/,'').split(/\s+or\s+/)){
   try{
    const u=new URL(raw.trim());
    if(u.protocol!=='https:'||u.username||u.password||!/(?:\.mp4|\.m3u8|\.mpd)(?:$|:hls:)/i.test(u.pathname))continue;
    // Keep each quality once, preferring the first HTTPS variant returned by Rezka.
    if(!items.some(x=>x.quality===quality))items.push({quality,url:u.toString()});
   }catch{}
  }
 }
 if(!items.length&&data.startsWith('#'))throw Error('rezka_unsupported_stream_format');
 return items;
}
function safeError(error){
 const code=String(error?.message||'');
 if(/^rezka_(?:invalid_origin|invalid_path|mirror_redirect|access_denied|http_\d{3}|response_too_large|invalid_response|stream_unavailable|player_not_found|translations_not_found|unsupported_stream_format)$/.test(code))return code;
 return /abort|timeout/i.test(code)?'rezka_timeout':'rezka_unavailable';
}
export async function handleRezka(request,env={}){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let input;try{const raw=await request.text();if(raw.length>4096)return reply({error:'request_too_large'},413);input=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'invalid_request'},400);
 const action=limit(input.action,24);
 if(!['probe','search','post','episodes','stream'].includes(action))return reply({error:'invalid_action'},400);
 if(action==='search'&&(!input.title||String(input.title).length>200))return reply({error:'invalid_query'},400);
 if(action==='search'&&input.movie){
  const movie=input.movie;
  if(typeof movie!=='object'||Array.isArray(movie)||!Array.isArray(movie.titles)||movie.titles.length>8||movie.titles.some(title=>typeof title!=='string'||title.length>200)||movie.year&&!/^\d{4}$/.test(String(movie.year)))return reply({error:'invalid_movie'},400);
 }
 if(['episodes','stream'].includes(action)&&(!ID.test(String(input.id||''))||!ID.test(String(input.translator_id||''))))return reply({error:'invalid_id'},400);
 if(action==='stream'&&input.series&&(!ID.test(String(input.season||''))||!ID.test(String(input.episode||''))))return reply({error:'invalid_episode'},400);
 if(action==='post'){try{pathOf(input.path);}catch{return reply({error:'rezka_invalid_path'},400);}}
 try{
  const origin=originOf(env);
  if(action==='probe'){await upstream(origin,'/');return reply({status:'reachable',origin});}
  if(action==='search'){
   const params=new URLSearchParams({do:'search',subaction:'search',q:limit(input.title)});
   const html=await upstream(origin,'/search/?'+params);
   let results=parseRezkaSearch(html.body,html.origin);
   if(input.movie){
    const movie=input.movie;
    results=results.filter(item=>sameMovie(item,{title:movie.titles[0],alternative_titles:movie.titles.slice(1),year:movie.year,series:typeof movie.series==='boolean'?movie.series:undefined}));
   }
   return reply({results});
  }
  if(action==='post'){
   const path=pathOf(input.path),page=await upstream(origin,path);
   return reply(parseRezkaPost(page.body,path));
  }
  const form={id:String(input.id),translator_id:String(input.translator_id),action:action==='episodes'?'get_episodes':input.series?'get_stream':'get_movie'};
  if(action==='stream'&&input.series){form.season=String(input.season);form.episode=String(input.episode);}
  for(const key of ['is_camrip','is_ads','is_director'])form[key]=input[key]==='1'?'1':'0';
  const data=await upstream(origin,'/ajax/get_cdn_series/?t='+Date.now(),form);
  if(action==='episodes')return reply({seasons:parseRezkaEpisodes(String(data.episodes||''))});
  return reply({items:parseRezkaStreams(data.url).map(item=>({title:limit(input.title)||'Відео',provider:'rezka',source:'HDRezka',translation:limit(input.translation,120),season:input.series?Number(input.season):null,episode:input.series?Number(input.episode):null,...item}))});
 }catch(error){return reply({error:safeError(error)},502);}
}
