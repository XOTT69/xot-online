import {parseDocument,DomUtils} from 'htmlparser2';
import {sameMovie,normalizeTitle} from './matching.js';
import {trustedURL,loadPublicPlayer,resolvePlayerItem} from './eneyida.js';

const SITES={kinovezha:{origin:'https://kinovezha.tv',name:'KinoVezha'},uaserials:{origin:'https://uaserials.com',name:'UASerials'}};
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','x-content-type-options':'nosniff'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const clean=(value,max=200)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
const all=(node,predicate)=>DomUtils.findAll(predicate,node.children||[]);
const first=(node,predicate)=>all(node,predicate)[0];
const cls=(node,name)=>(node.attribs?.class||'').split(/\s+/).includes(name);
const text=node=>node?clean(DomUtils.textContent(node)):'';
function pagePath(value){if(typeof value!=='string'||!/^\/\d{1,8}-[a-z0-9-]+\.html$/i.test(value)||value.length>500)throw Error('invalid_path');return value;}
export async function siteFetch(site,path,form,options={}){
 const url=new URL(path,site.origin);if(url.origin!==site.origin)throw Error('invalid_path');
 const headers={accept:options.ajax?'application/json':'text/html','user-agent':'Mozilla/5.0',referer:options.referer||site.origin+'/'};
 if(options.ajax){headers['x-requested-with']='XMLHttpRequest';headers.origin=site.origin;}
 if(form)headers['content-type']='application/x-www-form-urlencoded';
 const response=await fetch(url,{method:form?'POST':'GET',headers,body:form?new URLSearchParams(form).toString():undefined,redirect:'manual',signal:AbortSignal.timeout(8000)});
 if([403,429].includes(response.status))throw Error('access_denied');
 if(response.status>=300&&response.status<400)throw Error('redirect');
 if(!response.ok)throw Error('http_'+response.status);
 const reader=response.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw Error('response_too_large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 const html=new TextDecoder().decode(bytes);
 if(/cf-chl-|<title>\s*(?:Just a moment|Attention Required)|captcha-container/i.test(html))throw Error('access_denied');
 return html;
}
export function parseUkrainianSearch(html,provider){
 const site=SITES[provider];if(!site)throw Error('invalid_provider');
 const root=parseDocument(html),content=first(root,n=>n.attribs?.id==='dle-content');if(!content)return [];
 const cards=all(content,n=>cls(n,provider==='kinovezha'?'movie-item':'uas-card')||(provider==='uaserials'&&cls(n,'short-item'))),results=[],seen=new Set();
 for(const card of cards){
  const link=provider==='kinovezha'?first(card,n=>n.name==='a'&&cls(n,'movie-item__link')):card.name==='a'?card:first(card,n=>n.name==='a'&&n.attribs?.href);
  if(!link)continue;let path;
  try{const url=new URL(link.attribs.href,site.origin);if(url.origin!==site.origin)continue;path=pagePath(url.pathname);}catch{continue;}
  const id=path.match(/^\/(\d+)/)[1];if(seen.has(id))continue;
  const title=text(first(card,n=>cls(n,provider==='kinovezha'?'movie-item__title':'uas-card__title')||provider==='uaserials'&&cls(n,'th-title')));if(!title)continue;
  const meta=first(card,n=>cls(n,'movie-item__meta'));
  const original=provider==='kinovezha'?all(meta||card,n=>n.name==='span').map(text).filter(v=>!/^\d{4}$/.test(v)).join(' '):text(first(card,n=>cls(n,'uas-card__orig')||cls(n,'th-title-oname')));
  const yearNode=first(card,n=>cls(n,'uas-card__year'))||(meta&&first(meta,n=>n.name==='span'&&/^(?:19|20)\d{2}$/.test(text(n))));
  const year=text(yearNode||meta||card).match(/\b(19\d{2}|20\d{2})\b/);
  seen.add(id);results.push({id,path,title,original_title:original,year:year?Number(year[1]):null});
 }
 return results.slice(0,50);
}

// The site's browser player uses this public format for its tab URLs; no user
// credential or media key is involved. Decode data only, never execute scripts.
export async function decodeUASerialsTabs(value){
 let data;try{data=typeof value==='string'?JSON.parse(value):value;}catch{throw Error('player_format');}
 if(!data||typeof data.salt!=='string'||!(/^[a-f0-9]{2,1024}$/i.test(data.salt))||data.salt.length%2||!(/^[a-f0-9]{32}$/i.test(data.iv||''))||typeof data.ciphertext!=='string'||data.ciphertext.length>250000)throw Error('player_format');
 const hex=value=>Uint8Array.from(value.match(/../g),v=>parseInt(v,16));
 try{
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode('297796CCB81D255125'),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:hex(data.salt),iterations:999,hash:'SHA-512'},material,{name:'AES-CBC',length:256},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-CBC',iv:hex(data.iv)},key,Uint8Array.from(atob(data.ciphertext),c=>c.charCodeAt(0)));
  let tabs=JSON.parse(new TextDecoder().decode(plain));if(typeof tabs==='string')tabs=JSON.parse(tabs);
  if(!Array.isArray(tabs)||tabs.length>12)throw Error();return tabs;
 }catch{throw Error('player_format');}
}
export async function parseUkrainianPost(html,path,provider){
 const site=SITES[provider];if(!site)throw Error('invalid_provider');
 const root=parseDocument(html),content=first(root,n=>n.attribs?.id==='dle-content');if(!content)throw Error('player_not_found');
 const fields=all(content,n=>n.name==='li'),field=label=>text(fields.find(n=>text(n).startsWith(label+':'))).replace(label+':','').trim();
 const title=text(first(content,n=>cls(n,provider==='kinovezha'?'inner-page__title':'oname_ua')))||text(first(content,n=>n.name==='h1'));
 const original_title=text(first(content,n=>cls(n,provider==='kinovezha'?'inner-page__subtitle':'oname')));
 const year=field('Рік').match(/\b(19\d{2}|20\d{2})\b/),series=/серіал/iu.test(field('Жанр'));
 const translation=field('Переклад')||field('Озвучення')||'Українська',players=[];
 function add(value){try{const url=trustedURL(value,'player').toString();if(!players.includes(url))players.push(url);}catch{}}
 if(provider==='kinovezha'){
  const player=first(content,n=>cls(n,'inner-page__player'));
  if(player){
   const select=first(player,n=>cls(n,'tabs-block__select--player'));
   const labels=select?all(select,n=>n.name==='span').map(text):[];
   const panels=all(player,n=>cls(n,'tabs-block__content'));
   panels.forEach((panel,i)=>{if(!/^(?:Плеєр|Онлайн)/iu.test(labels[i]||''))return;for(const frame of all(panel,n=>n.name==='iframe'))add(frame.attribs.src);});
  }
 }else{
  const control=first(content,n=>n.name==='player-control'&&n.attribs?.['data-tag1']);if(!control)throw Error('player_not_found');
  const tabs=await decodeUASerialsTabs(control.attribs['data-tag1']);
  for(const tab of tabs){if(/^(?:Плеєр|Онлайн)/iu.test(clean(tab.tabName)))add(tab.url);}
 }
 if(!title||!players.length)throw Error('player_not_found');
 return {id:path.match(/^\/(\d+)/)?.[1],path,title,original_title,year:year?Number(year[1]):null,series,translation,players,provider,source:site.name};
}
function movieQuery(movie){return {title:movie.titles[0],alternative_titles:movie.titles.slice(1),year:movie.year,series:typeof movie.series==='boolean'?movie.series:undefined};}
// These public players share archive IDs (vod/vid and embed/embd). The alternate
// host is also used by Eneyida. Never trust an ID alone: an alternate player's
// readable media filename must independently match the catalog's original title
// and movie year. Opaque or mismatching alternate media is not returned.
export function matchesMirrorMedia(item,post){
 const expected=normalizeTitle(post.original_title);if(!expected)return false;
 let parts;try{parts=decodeURIComponent(new URL(item.url).pathname).split('/');}catch{return false;}
 for(const part of parts){
  const match=post.series?part.match(/^(.+?)[._ -]s\d{1,2}e\d+/i):part.match(/^(.+?)[._ -]((?:19|20)\d{2})(?:[._ -]|$)/i);
  if(match&&normalizeTitle(match[1])===expected&&(post.series||Number(match[2])===post.year))return true;
 }
 return false;
}
export async function catalogPlayer(url,post,referer){
 try{return await loadPublicPlayer(url,post,referer);}catch(error){
  // No CAPTCHA, authentication, or 403/429 fallback: only the unavailable public
  // Tortuga page that responds with a non-player document may use its public alias.
  if(error?.message!=='eneyida_player_format')throw error;
  const parsed=trustedURL(url,'player'),match=parsed.pathname.match(/^\/(vod|embed)\/(\d+)$/);
  if(!['tortuga.tw','tortuga.wtf'].includes(parsed.hostname)||!match)throw error;
  const alternate='https://hdvbua.pro/'+(match[1]==='vod'?'vid':'embd')+'/'+match[2];
  const items=(await loadPublicPlayer(alternate,post,referer)).filter(item=>matchesMirrorMedia(item,post));
  if(!items.length)throw Error('movie_mismatch');
  return items.map(item=>({...item,player_source:'HDVB UA'}));
 }
}
export async function handleUkrainian(request,provider){
 const site=SITES[provider];if(!site)return reply({error:'invalid_provider'},400);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let input;try{const raw=await request.text();if(raw.length>8192)return reply({error:'request_too_large'},413);input=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'invalid_request'},400);
 if(!['search','post','stream'].includes(input.action))return reply({error:'invalid_action'},400);
 if(input.action==='search'&&(typeof input.title!=='string'||!input.title.trim()||input.title.length>200))return reply({error:'invalid_query'},400);
 if(input.movie&&(!Array.isArray(input.movie.titles)||!input.movie.titles.length||input.movie.titles.length>8||input.movie.titles.some(t=>typeof t!=='string'||t.length>200)||input.movie.year&&!/^\d{4}$/.test(String(input.movie.year))))return reply({error:'invalid_movie'},400);
 try{if(input.action==='post')pagePath(input.path);if(input.action==='stream')trustedURL(input.url);}catch{return reply({error:provider+'_'+(input.action==='post'?'invalid_path':'invalid_url')},400);}
 try{
  if(input.action==='search'){
   const html=provider==='kinovezha'?await siteFetch(site,'/',{do:'search',subaction:'search',story:input.title.trim()}):await siteFetch(site,'/search/'+encodeURIComponent(input.title.trim())+'/');
   let results=parseUkrainianSearch(html,provider);if(input.movie)results=results.filter(item=>sameMovie(item,movieQuery(input.movie)));
   return reply({results});
  }
  if(input.action==='stream')return reply({items:await resolvePlayerItem({title:clean(input.title)||'Відео',source:site.name,provider,translation:clean(input.translation)||'Українська',voice_id:clean(input.voice_id,240),season:Number(input.season)>0?Number(input.season):null,episode:Number(input.episode)>0?Number(input.episode):null,url:input.url})});
  const html=await siteFetch(site,input.path),post=await parseUkrainianPost(html,input.path,provider);
  if(input.movie&&!sameMovie(post,movieQuery(input.movie)))throw Error('movie_mismatch');
  let items=(await Promise.all(post.players.map(url=>catalogPlayer(url,post,site.origin+input.path)))).flat();
  items=[...new Map(items.map(item=>[[item.url,item.season,item.episode,item.voice_id].join('|'),item])).values()];
  if(!items.length)throw Error('stream_unavailable');
  if(!post.series&&items.length<=8)items=(await Promise.all(items.map(item=>resolvePlayerItem(item).catch(()=>[item])))).flat();
  const {players,...metadata}=post;return reply({...metadata,items});
 }catch(error){
  let code=String(error?.message||'').replace(/^eneyida_/,'');
  if(!/^(?:access_denied|redirect|http_\d{3}|response_too_large|player_not_found|player_format|invalid_playlist|unsupported_stream|stream_unavailable|movie_mismatch|invalid_url)$/.test(code))code=/timeout|abort/i.test(code)?'timeout':'unavailable';
  return reply({error:provider+'_'+code},502);
 }
}
