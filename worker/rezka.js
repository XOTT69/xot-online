import {parseDocument,DomUtils} from 'htmlparser2';
import {sameMovie} from './matching.js';

const DEFAULT_ORIGIN='https://rezka.ag';
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
 if(url.protocol!=='https:'||url.username||url.password||url.port||!/(?:^|\.)(?:hdrezka\.(?:ag|tv|me|cm|la|ink|buzz|loan|rest|center|fyi|run|today|win|tips|solutions)|hdrezka-home\.tv|rezka\.ag|rezka-ua\.(?:net|tv|pub))$/.test(url.hostname))throw Error('rezka_invalid_origin');
 return url.origin;
}
function originOf(env){return trustedOrigin(env?.XOT_REZKA_ORIGIN||DEFAULT_ORIGIN);}
function pathOf(value){
 const path=String(value||'');
 if(!/^\/(?:films|series|animation|cartoons)\/[a-z0-9_/-]+\.html$/i.test(path)||path.includes('..')||path.length>500)throw Error('rezka_invalid_path');
 return path;
}
function rememberCookies(response,url,session){
 if(!session)return;
 const values=response.headers.getSetCookie?.()||(response.headers.get('set-cookie')||'').split(/,(?=\s*[\w-]+=)/);
 if(!session.cookies.has(url.origin))session.cookies.set(url.origin,new Map());
 const jar=session.cookies.get(url.origin);
 for(const value of values){
  const [pair,...attrs]=value.split(';'),match=pair.trim().match(/^([\w-]+)=([^\r\n;]*)$/);if(!match)continue;
  const key=match[1],options=new Map(attrs.map(attr=>{const at=attr.indexOf('=');return [attr.slice(0,at<0?undefined:at).trim().toLowerCase(),at<0?'':attr.slice(at+1).trim()];}));
  if(!match[2]||Number(options.get('max-age'))<=0&&options.has('max-age')||options.has('expires')&&Date.parse(options.get('expires'))<Date.now()){jar.delete(key);continue;}
  jar.set(key,{value:match[2],path:options.get('path')||url.pathname.slice(0,url.pathname.lastIndexOf('/')+1)});
 }
}
async function upstream(origin,path,form,redirects=0,fetcher=fetch,session){
 const url=new URL(path,origin);
 if(url.origin!==origin)throw Error('rezka_invalid_path');
 const headers={accept:form?'application/json':'text/html','user-agent':'XOT-Lampa/0.3.16','referer':origin+'/'};
 if(session){
  const cookies=[...(session.cookies.get(url.origin)||new Map())].filter(([,cookie])=>url.pathname.startsWith(cookie.path)).map(([key,cookie])=>key+'='+cookie.value);
  if(cookies.length)headers.cookie=cookies.join('; ');
  if(session.referer&&new URL(session.referer).origin===origin)headers.referer=session.referer;
 }
 if(form){headers['content-type']='application/x-www-form-urlencoded';headers['x-requested-with']='XMLHttpRequest';headers.origin=origin;}
 const response=await fetcher(url,{method:form?'POST':'GET',headers,body:form?new URLSearchParams(form).toString():undefined,redirect:'manual',signal:AbortSignal.timeout(8000)});
 rememberCookies(response,url,session);
 if(response.status>=300&&response.status<400){
  const next=new URL(response.headers.get('location')||origin,url);
  try{trustedOrigin(next);}catch{throw Error('rezka_mirror_redirect');}
  if(redirects>=3)throw Error('rezka_mirror_redirect');
  return upstream(next.origin,next.pathname+next.search,form,redirects+1,fetcher,session);
 }
 if(response.status===403||response.status===429)throw Error('rezka_access_denied');
 if(!response.ok)throw Error('rezka_http_'+response.status);
 const body=await response.text();
 if(body.length>2*1024*1024)throw Error('rezka_response_too_large');
 if(/cf-chl-|Just a moment|captcha-container|<title>[^<]*(?:Проверяем[^<]*не бот|verify[^<]*human)/i.test(body))throw Error('rezka_access_denied');
 if(!form)return {body,origin};
 let data;try{data=JSON.parse(body);}catch{throw Error('rezka_invalid_response');}
 if(!data||data.success===false){
  const message=String(data?.message||data?.error||'');
  if(/premium|премиум|преміум|авториз|войдите|войти в аккаунт|увійдіть/i.test(message))throw Error('rezka_auth_required');
  if(/сесси[ия]|сесі[яї]|session/i.test(message))throw Error('rezka_session_expired');
  throw Error('rezka_stream_unavailable');
 }
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
export function parseRezkaMetadata(html,path,root=parseDocument(html)){
 pathOf(path);const titleNode=first(root,n=>hasClass(n,'b-post__title')),original=first(root,n=>hasClass(n,'b-post__origtitle'));
 const info=first(root,n=>hasClass(n,'b-post__info')),dateRow=info&&all(info,n=>n.name==='tr').find(n=>/^(?:Год|Дата выхода|Рік)/u.test(text(n))),year=dateRow&&text(dateRow).match(/\b(?:19|20)\d{2}\b/);
 const imdb=first(info||root,n=>n.name==='a'&&/^https?:\/\/(?:www\.)?imdb\.com\/title\/tt\d+(?:\/|$)/i.test(n.attribs?.href||''))?.attribs?.href.match(/\/title\/(tt\d+)/)?.[1],kind=html.match(/\.initCDN(Movies|Series)Events\(/)?.[1];
 return {id:path.match(/\/(\d+)-[^/]+\.html$/)?.[1],path,title:titleNode?limit(text(titleNode)):'',original_title:original?limit(text(original)):'',year:year?Number(year[0]):null,series:kind?kind==='Series':path.startsWith('/series/')?true:path.startsWith('/films/')?false:undefined,...(imdb?{imdb_id:imdb}:{})};
}
export function parseRezkaPost(html,path,root=parseDocument(html)){
 const init=html.match(/\.initCDN(Movies|Series)Events\(\s*(\d+)\s*,\s*(\d+)/);
 const id=first(root,n=>n.attribs?.id==='post_id')?.attribs?.value||init?.[2];
 if(!ID.test(String(id)))throw Error('rezka_player_not_found');
 const metadata=parseRezkaMetadata(html,path,root);if(metadata.id&&String(id)!==metadata.id)throw Error('rezka_movie_mismatch');
 const list=first(root,n=>n.attribs?.id==='translators-list');
 const seen=new Set(),translations=[];
 if(list)for(const node of all(list,n=>ID.test(n.attribs?.['data-translator_id']||''))){
  const voiceId=node.attribs['data-translator_id'];if(seen.has(voiceId)||all(node,n=>n.attribs?.['data-translator_id']===voiceId).length)continue;seen.add(voiceId);
  translations.push({id:voiceId,title:limit(text(node),120),is_camrip:node.attribs['data-camrip']||'0',is_ads:node.attribs['data-ads']||'0',is_director:node.attribs['data-director']||'0',...(hasClass(node,'b-prem_translator')?{premium:true}:{})});
 }
 if(!translations.length&&init)translations.push({id:init[3],title:'Основне озвучення',is_camrip:'0',is_ads:'0',is_director:'0'});
 if(!translations.length)throw Error('rezka_translations_not_found');
 return {...metadata,id:String(id),series:init?.[1]==='Series'||metadata.series,translations};
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
    // The player's "or" entries are real CDN alternatives. Retain them instead
    // of discarding a working address when the first CDN is unavailable.
    const existing=items.find(x=>x.quality===quality),url=u.toString();
    if(!existing)items.push({quality,url});
    else if(existing.url!==url&&!(existing.alternatives||[]).includes(url)){
     if(!existing.alternatives)existing.alternatives=[];existing.alternatives.push(url);
    }
   }catch{}
  }
 }
 if(!items.length&&data.startsWith('#'))throw Error('rezka_unsupported_stream_format');
 return items;
}
export function mediaURL(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port||!/(?:^|\.)(?:voidboost\.(?:cc|net|one|tv|com|io)|ukrtelcdn\.net|sambray\.org)$/i.test(url.hostname))throw Error('rezka_unsupported_stream_format');
 return url;
}
async function resolveMedia(value,fetcher){
 let url=mediaURL(value);
 for(let redirects=0;redirects<=2;redirects++){
  const hls=/\.m3u8$/i.test(url.pathname),response=await fetcher(url,{method:'GET',headers:hls?{}:{range:'bytes=0-4095'},redirect:'manual',signal:AbortSignal.timeout(5000)});
  if(response.status>=300&&response.status<400){
   await response.body?.cancel();
   const next=response.headers.get('location');if(!next||redirects===2)throw Error('rezka_stream_unavailable');url=mediaURL(new URL(next,url));continue;
  }
  if(![200,206].includes(response.status)){await response.body?.cancel();throw Error('rezka_stream_unavailable');}
  const reader=response.body?.getReader();if(!reader)throw Error('rezka_stream_unavailable');
  let chunk;try{chunk=await reader.read();}finally{await reader.cancel();}
  const bytes=chunk?.value||new Uint8Array(),text=new TextDecoder().decode(bytes.slice(0,4096));
  if(hls?text.trimStart().startsWith('#EXTM3U'):bytes.length>=8&&String.fromCharCode(...bytes.slice(4,8))==='ftyp')return url.href;
  throw Error('rezka_stream_unavailable');
 }
 throw Error('rezka_stream_unavailable');
}
export async function resolveRezkaStreams(items,fetcher=fetch){
 const resolved=await Promise.all(items.slice(0,6).map(async item=>{
  for(const candidate of [item.url,...item.alternatives||[]].slice(0,2)){
   try{const url=await resolveMedia(candidate,fetcher),{alternatives,...metadata}=item;return {...metadata,url};}catch{}
  }
  return null;
 }));
 const result=resolved.filter(Boolean);if(!result.length)throw Error('rezka_stream_unavailable');return result;
}
function safeError(error){
 const code=String(error?.message||'');
 if(/^rezka_(?:invalid_origin|invalid_path|mirror_redirect|access_denied|auth_required|session_expired|session_required|movie_mismatch|http_\d{3}|response_too_large|invalid_response|stream_unavailable|player_not_found|translations_not_found|unsupported_stream_format)$/.test(code))return code;
 return /abort|timeout/i.test(code)?'rezka_timeout':'rezka_unavailable';
}
export async function handleRezka(request,env={},fetcher=fetch){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let input;try{const raw=await request.text();if(raw.length>4096)return reply({error:'request_too_large'},413);input=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'invalid_request'},400);
 const action=limit(input.action,24);
 if(!['probe','search','post','episodes','stream'].includes(action))return reply({error:'invalid_action'},400);
 if(action==='search'&&(!input.title||String(input.title).length>200))return reply({error:'invalid_query'},400);
 if(['search','post'].includes(action)&&input.movie){
  const movie=input.movie;
  if(typeof movie!=='object'||Array.isArray(movie)||!Array.isArray(movie.titles)||!movie.titles.length||movie.titles.length>8||movie.titles.some(title=>typeof title!=='string'||!title.trim()||title.length>200)||movie.year&&!/^\d{4}$/.test(String(movie.year))||movie.series!==undefined&&typeof movie.series!=='boolean')return reply({error:'invalid_movie'},400);
 }
 if(['episodes','stream'].includes(action)&&(!ID.test(String(input.id||''))||!ID.test(String(input.translator_id||''))))return reply({error:'invalid_id'},400);
 if(action==='stream'&&input.series&&(!ID.test(String(input.season||''))||!ID.test(String(input.episode||''))))return reply({error:'invalid_episode'},400);
 if(action==='post'){try{pathOf(input.path);}catch{return reply({error:'rezka_invalid_path'},400);}}
 if(['episodes','stream'].includes(action)&&input.path!==undefined){
  try{pathOf(input.path);}catch{return reply({error:'rezka_invalid_path'},400);}
  if(input.path.match(/\/(\d+)-[^/]+\.html$/)?.[1]!==String(input.id))return reply({error:'rezka_movie_mismatch'},400);
 }
 try{
  const origin=originOf(env),session={cookies:new Map(),referer:null};let targetOrigin=origin;
  const load=(path,form)=>upstream(targetOrigin,path,form,0,fetcher,session),query=input.movie&&{title:input.movie.titles[0],alternative_titles:input.movie.titles.slice(1),year:input.movie.year,series:input.movie.series};
  if(action==='probe'){await load('/');return reply({status:'reachable',origin});}
  if(action==='search'){
   const params=new URLSearchParams({do:'search',subaction:'search',q:limit(input.title)});
   const html=await load('/search/?'+params);
   let results=parseRezkaSearch(html.body,html.origin);
   if(input.movie){
    const exact=results.filter(item=>sameMovie(item,query));
    if(exact.length)results=exact;
    else{
     const candidates=results.filter(item=>(!query.year||!item.year||Number(query.year)===item.year)&&(query.series===undefined||item.series===undefined||query.series===item.series)).slice(0,3);
     const checked=await Promise.all(candidates.map(async item=>{const page=await load(item.path);return {...item,...parseRezkaMetadata(page.body,item.path)};}));
     results=checked.filter(item=>sameMovie(item,query));
    }
   }
   return reply({results});
  }
  if(action==='post'){
   const path=pathOf(input.path),page=await load(path),post=parseRezkaPost(page.body,path);
   if(query&&!sameMovie(post,query))throw Error('rezka_movie_mismatch');
   return reply(post);
  }
  const form={id:String(input.id),translator_id:String(input.translator_id),action:action==='episodes'?'get_episodes':input.series?'get_stream':'get_movie'};
  if(input.path){
   // Start a fresh anonymous page session inside this invocation. The source's
   // own player sends ctrl_favs with the corresponding guest cookies. Nothing
   // is shared between users or returned to the browser.
   const page=await load(input.path),root=parseDocument(page.body),post=parseRezkaPost(page.body,input.path,root);
   if(post.id!==String(input.id)||post.series!==(action==='episodes'||Boolean(input.series)))throw Error('rezka_movie_mismatch');
   if(!post.translations.some(voice=>voice.id===String(input.translator_id)))throw Error('rezka_translations_not_found');
   const favs=first(root,node=>node.attribs?.id==='ctrl_favs')?.attribs?.value;
   if(typeof favs!=='string'||!favs||favs.length>512)throw Error('rezka_session_required');
   targetOrigin=page.origin;session.referer=page.origin+input.path;form.favs=favs;
  }
  if(action==='stream'&&input.series){form.season=String(input.season);form.episode=String(input.episode);}
  for(const key of ['is_camrip','is_ads','is_director'])form[key]=input[key]==='1'?'1':'0';
  const data=await load('/ajax/get_cdn_series/?t='+Date.now(),form);
  if(data.premium_content===1||data.premium_content==='1')throw Error('rezka_auth_required');
  if(action==='episodes')return reply({seasons:parseRezkaEpisodes(String(data.episodes||''))});
  let items=parseRezkaStreams(data.url);if(!items.length)throw Error('rezka_stream_unavailable');
  if(env.XOT_VERIFY_MEDIA==='1')items=await resolveRezkaStreams(items,fetcher);
  return reply({items:items.map(item=>({title:limit(input.title)||'Відео',provider:'rezka',source:'HDRezka',voice_id:String(input.translator_id),translation:limit(input.translation,120),season:input.series?Number(input.season):null,episode:input.series?Number(input.episode):null,...item}))});
 }catch(error){return reply({error:safeError(error)},502);}
}
