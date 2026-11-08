import {parseDocument,DomUtils} from 'htmlparser2';
import {sameMovie} from './matching.js';
import {trustedURL,resolvePlayerItem} from './eneyida.js';
import {siteFetch,catalogPlayer} from './ukrainian.js';

const SITE={origin:'https://serialno.tv'},HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','x-content-type-options':'nosniff'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const clean=(v,max=200)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
const all=(node,test)=>DomUtils.findAll(test,node?.children||[]);
const first=(node,test)=>all(node,test)[0];
const cls=(node,name)=>(node.attribs?.class||'').split(/\s+/).includes(name);
const text=node=>node?clean(DomUtils.textContent(node),1000):'';
function pagePath(value){if(typeof value!=='string'||value.length>500||!/^\/\d{1,8}-[a-z0-9-]+\.html$/i.test(value))throw Error('invalid_path');return value;}
function yearField(node){const row=all(node,n=>n.name==='li').find(n=>/^Рік:/u.test(text(n))),match=text(row).match(/\b(?:19|20)\d{2}\b/);return match?Number(match[0]):null;}
export function parseSerialnoSearch(html){
 const root=parseDocument(html),content=first(root,n=>n.attribs?.id==='dle-content'),seen=new Set(),results=[];
 if(!content)return [];
 for(const card of all(content,n=>cls(n,'th-item'))){
  const link=first(card,n=>n.name==='a'&&cls(n,'th-in'));if(!link)continue;let path;
  try{const u=new URL(link.attribs.href,SITE.origin);if(u.origin!==SITE.origin||u.username||u.password||u.search||u.hash)continue;path=pagePath(u.pathname);}catch{continue;}
  const id=path.match(/^\/(\d+)/)[1],title=text(first(link,n=>cls(n,'th-title')));if(!title||seen.has(id))continue;
  seen.add(id);results.push({id,path,title,original_title:text(first(card,n=>cls(n,'foriginal'))),year:yearField(card),series:true});
 }
 return results.slice(0,50);
}
function parseMetadata(html,path){
 pagePath(path);const root=parseDocument(html),article=first(root,n=>n.name==='article'&&cls(n,'full'));
 if(!article)throw Error('player_not_found');
 const title=text(first(article,n=>n.name==='h1')),original_title=text(first(article,n=>cls(n,'foriginal'))),fields=first(article,n=>cls(n,'flist'));
 if(!title)throw Error('player_not_found');
 return {article,post:{id:path.match(/^\/(\d+)/)[1],path,title,original_title,year:yearField(fields||article),series:true,translation:'Українська',provider:'serialno',source:'Serialno'}};
}
export function parseSerialnoPost(html,path){
 const {article,post}=parseMetadata(html,path);
 const tabs=first(article,n=>cls(n,'tabs-sel')),labels=all(tabs,n=>n.name==='span').map(text),panels=all(article,n=>cls(n,'tabs-b')&&cls(n,'video-box')),players=[];
 panels.forEach((panel,i)=>{
  if(!/^(?:Дивитися онлайн|Плеєр(?:\s|$))/iu.test(labels[i]||''))return;
  for(const frame of all(panel,n=>n.name==='iframe'))try{const url=trustedURL(frame.attribs.src||frame.attribs['data-src'],'player').href;if(!players.includes(url))players.push(url);}catch{}
 });
 if(!players.length)throw Error('player_not_found');
 return {...post,players};
}
const movieQuery=m=>({title:m.titles[0],alternative_titles:m.titles.slice(1),year:m.year,series:m.series});
export async function handleSerialno(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let input;try{const raw=await request.text();if(raw.length>8192)return reply({error:'request_too_large'},413);input=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input)||!['search','post','stream'].includes(input.action))return reply({error:'invalid_request'},400);
 if(input.movie&&(!Array.isArray(input.movie.titles)||!input.movie.titles.length||input.movie.titles.length>8||input.movie.titles.some(t=>typeof t!=='string'||!t.trim()||t.length>200)||input.movie.year&&!/^\d{4}$/.test(String(input.movie.year))||input.movie.series!==undefined&&typeof input.movie.series!=='boolean'))return reply({error:'invalid_movie'},400);
 if(input.action==='search'&&(typeof input.title!=='string'||!input.title.trim()||input.title.length>200))return reply({error:'invalid_query'},400);
 try{if(input.action==='post')pagePath(input.path);if(input.action==='stream')trustedURL(input.url);}catch{return reply({error:'serialno_'+(input.action==='post'?'invalid_path':'invalid_url')},400);}
 try{
  if(input.action==='search'){
   if(input.movie?.series===false)return reply({results:[]});
   const results=parseSerialnoSearch(await siteFetch(SITE,'/',{do:'search',subaction:'search',story:input.title.trim()}));
   if(!input.movie)return reply({results});
   const query=movieQuery(input.movie),exact=results.filter(item=>sameMovie(item,query));
   if(exact.length)return reply({results:exact});
   // Search cards can omit the original title even when that title matched the
   // site's full-text search. Inspect a bounded set of same-year pages as data.
   const candidates=results.filter(item=>!item.year||!query.year||item.year===Number(query.year)).slice(0,4);
   const checked=await Promise.allSettled(candidates.map(async item=>{const {post}=parseMetadata(await siteFetch(SITE,item.path),item.path);return sameMovie(post,query)?post:null;}));
   const matches=checked.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]);
   if(!matches.length&&checked.some(result=>result.status==='rejected'))throw checked.find(result=>result.status==='rejected').reason;
   return reply({results:matches});
  }
  if(input.action==='stream')return reply({items:await resolvePlayerItem({provider:'serialno',source:'Serialno',title:clean(input.title)||'Відео',translation:clean(input.translation)||'Українська',voice_id:clean(input.voice_id,240),season:Number(input.season)>0?Number(input.season):1,episode:Number(input.episode)>0?Number(input.episode):null,url:input.url})});
  const post=parseSerialnoPost(await siteFetch(SITE,input.path),input.path);
  if(input.movie&&!sameMovie(post,movieQuery(input.movie)))throw Error('movie_mismatch');
  const settled=await Promise.allSettled(post.players.map(url=>catalogPlayer(url,post,SITE.origin+post.path)));
  let items=settled.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  items=[...new Map(items.map(item=>[[item.url,item.season,item.episode,item.voice_id].join('|'),item])).values()];
  if(!items.length)throw settled.find(r=>r.status==='rejected')?.reason||Error('stream_unavailable');
  const {players,...metadata}=post;return reply({...metadata,items});
 }catch(error){
  let code=String(error?.message||'').replace(/^eneyida_/,'');if(!/^(?:access_denied|redirect|http_\d{3}|response_too_large|player_not_found|player_format|invalid_playlist|unsupported_stream|stream_unavailable|movie_mismatch|invalid_url)$/.test(code))code=/timeout|abort/i.test(code)?'timeout':'unavailable';
  return reply({error:'serialno_'+code},502);
 }
}
