import {parseDocument,DomUtils} from 'htmlparser2';
import {sameMovie} from './matching.js';
import {siteFetch} from './ukrainian.js';

const SITE={origin:'https://ufdub.com'},PLAYER={origin:'https://video.ufdub.com'};
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','x-content-type-options':'nosniff'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const clean=(v,max=200)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
const all=(node,predicate)=>DomUtils.findAll(predicate,node?.children||[]);
const first=(node,predicate)=>all(node,predicate)[0];
const cls=(node,name)=>(node.attribs?.class||'').split(/\s+/).includes(name);
const text=node=>node?clean(DomUtils.textContent(node),1000):'';
const aliases=value=>value.split(/\s+\/\s+/).map(v=>clean(v)).filter(Boolean);
function pathInfo(path){
 if(typeof path!=='string'||path.length>500)throw Error('invalid_path');
 const m=path.match(/^\/(film|serial|cartoon|cartoon-serial|anime|donghua|dorama)\/(\d{1,8})-[a-z0-9-]+\.html$/i);
 if(!m)throw Error('invalid_path');
 return {id:m[2],series:['serial','cartoon-serial','dorama'].includes(m[1])?true:['film','cartoon'].includes(m[1])?false:undefined};
}
function checkedURL(value,origin,pathname){
 if(typeof value!=='string'||value.length>4096)throw Error('invalid_url');
 const u=new URL(value);if(u.origin!==origin||u.username||u.password||u.hash||u.pathname!==pathname)throw Error('invalid_url');return u;
}
export function episodeURL(value,id){
 const u=checkedURL(value,SITE.origin,'/video/VIDEOS.php'),keys=[...u.searchParams.keys()];
 if(!/^\d{1,8}$/.test(String(id))||u.searchParams.get('ID')!==String(id)||!/^\d{1,5}$/.test(u.searchParams.get('POS')||'')||!Number(u.searchParams.get('POS'))||!u.searchParams.get('Seriya')||keys.length!==4||new Set(keys).size!==4||keys.some(k=>!['ID','TAB','Seriya','POS'].includes(k)))throw Error('invalid_url');
 return u;
}
function playerURL(value,id){
 const u=checkedURL(value,PLAYER.origin,'/V2/VP.php');
 if(u.searchParams.get('ID')!==id||[...u.searchParams.keys()].some(k=>!['ID','Name'].includes(k))||u.searchParams.getAll('ID').length!==1)throw Error('invalid_url');return u;
}
function titleParts(node){
 if(!node)return [];
 // The search template has stale sibling original-title fields. Trust only the
 // chosen link, its own subtitle, and its corresponding poster's full alt text.
 return aliases((node.children||[]).map(n=>n.type==='text'?n.data:n.name==='br'?' / ':text(n)).join(' '));
}
export function parseUFDubSearch(html){
 const root=parseDocument(html),results=[],seen=new Set();
 // Main content ends before sidebar recommendations, which reuse .short cards.
 const content=first(root,n=>cls(n,'cont'));if(!content)return [];
 for(const card of all(content,n=>cls(n,'short'))){
  const link=first(card,n=>n.name==='a'&&cls(n,'short-t'));if(!link)continue;
  let path,info;try{const u=new URL(link.attribs.href,SITE.origin);if(u.origin!==SITE.origin||u.username||u.password||u.search||u.hash)continue;path=u.pathname;info=pathInfo(path);}catch{continue;}
  if(seen.has(info.id))continue;
  const parts=titleParts(link),poster=first(card,n=>n.name==='img'&&n.attribs?.alt),alt=aliases(poster?.attribs.alt||'');
  if(!parts.length)continue;seen.add(info.id);
  results.push({...info,path,title:parts[0],original_title:parts[1]||alt[1]||'',alternative_titles:[...new Set([...parts.slice(1),...alt])],year:null});
 }
 return results.slice(0,50);
}
export function parseUFDubPost(html,path){
 const info=pathInfo(path),root=parseDocument(html),article=first(root,n=>n.name==='article'&&cls(n,'full'));
 if(!article)throw Error('player_not_found');
 const h1=first(article,n=>n.name==='h1'),original=first(h1,n=>cls(n,'short-t-or'));
 const title=clean((h1?.children||[]).filter(n=>n!==original).map(n=>n.type==='text'?n.data:n.name==='br'?' ':text(n)).join(' '));
 const names=aliases(text(original)),yearField=all(article,n=>cls(n,'fi-col-item')).find(n=>text(first(n,c=>c.name==='span'))==='Рік:');
 const year=text(yearField).match(/\b(?:19|20)\d{2}\b/),frame=first(article,n=>n.name==='iframe'&&n.attribs?.id==='input_video_player');
 if(!title||!frame)throw Error('player_not_found');
 return {...info,path,title,original_title:names[0]||'',alternative_titles:names.slice(1),year:year?Number(year[0]):null,player:playerURL(frame.attribs.src,info.id).href};
}

// Parse only arrays and string literals from the public player. No eval, imported
// player scripts, expressions, functions, cookies, or guessed unpublished episodes.
export function literalArray(input,start=0){
 let i=start,nodes=0;const skip=()=>{while(/\s/.test(input[i]||'')&&i<input.length)i++;};
 function value(depth){
  skip();if(++nodes>10000||depth>4)throw Error('player_format');
  if(input[i]==='['){i++;const out=[];skip();while(input[i]!==']'){
   out.push(value(depth+1));skip();if(input[i]===']')break;if(input[i++]!==',')throw Error('player_format');skip();
  }i++;return out;}
  const quote=input[i++];if(quote!=="'"&&quote!=='"')throw Error('player_format');let out='';
  while(i<input.length){let c=input[i++];if(c===quote)return out;if(c==='\\'){
   c=input[i++];if(c==='u'){const code=input.slice(i,i+4);if(!/^[a-f0-9]{4}$/i.test(code))throw Error('player_format');out+=String.fromCharCode(parseInt(code,16));i+=4;}
   else if(['\\',"'",'"','/'].includes(c))out+=c;else if(c==='n')out+='\n';else if(c==='r')out+='\r';else if(c==='t')out+='\t';else throw Error('player_format');
  }else {if(c==='\n'||c==='\r')throw Error('player_format');out+=c;}
   if(out.length>4096)throw Error('player_format');
  }throw Error('player_format');
 }
 const result=value(0);if(!Array.isArray(result))throw Error('player_format');return result;
}
export function parseUFDubPlayer(html,post){
 const root=parseDocument(html);let rows;
 for(const script of all(root,n=>n.name==='script'&&!n.attribs?.src)){
  const code=DomUtils.textContent(script),match=/\ba\s*=\s*(\[)/.exec(code);
  if(match){rows=literalArray(code,match.index+match[0].length-1);break;}
 }
 if(!rows)throw Error('player_format');
 const published=[];
 for(const row of rows){
  if(!Array.isArray(row)||row.length!==3||row.some(v=>typeof v!=='string')||row[1]!=='mp4'||/трейлер|trailer/iu.test(row[0]))continue;
  let url;try{url=episodeURL(row[2],post.id);}catch{continue;}
  published.push({label:clean(row[0]),url});
 }
 if(!published.length)throw Error('stream_unavailable');
 const numbered=published.some(row=>/^\[\d{1,4}\]|серія\s*\d/iu.test(row.label));
 const series=post.series===undefined?(numbered||published.length>1):post.series;
 const seen=new Set(),items=[];
 for(const {label,url} of published){
  const tab=clean(url.searchParams.get('TAB')),sn=tab.match(/(?:сезон|season)\s*(\d{1,2})/iu),ep=label.match(/^\[(\d{1,4})\]|серія\s*(\d{1,4})/iu);
  const season=series?(sn?Number(sn[1]):1):null,episode=series?(ep?Number(ep[1]||ep[2]):Number(url.searchParams.get('POS'))):null;
  if(series&&(!season||!episode))continue;
  const edition=!tab||/^основа$/iu.test(tab)||sn?'':tab,translation='Українська · UFDub'+(edition?' · '+edition:'');
  const voice_id=edition||'uk',key=[season,episode,voice_id].join('|');if(seen.has(key))continue;seen.add(key);
  items.push({provider:'ufdub',source:'UFDub',title:post.title,post_id:post.id,resolve_url:url.href,needs_resolve:true,quality:'MP4',translation,voice_id,season,episode,language:'uk'});
 }
 if(!items.length)throw Error('stream_unavailable');return {series,items};
}
export function mediaRedirect(value){
 if(typeof value!=='string')throw Error('unsupported_stream');
 // Node exposes raw UTF-8 header bytes as Latin-1; Workers can expose Unicode.
 if(/[^\x00-\x7f]/.test(value)&&[...value].every(c=>c.charCodeAt(0)<=255)){
  try{value=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(value,c=>c.charCodeAt(0)));}catch{throw Error('unsupported_stream');}
 }
 let u;try{u=new URL(value);}catch{throw Error('unsupported_stream');}
 if(u.origin!=='https://api.ufdub.com'||u.username||u.password||u.hash||u.search||!/^\/UFDUB_UPLOAD\/VIDEO\/[^/]+\.mp4$/i.test(u.pathname))throw Error('unsupported_stream');
 return u.href;
}
async function resolve(item){
 const url=episodeURL(item.resolve_url,item.post_id);
 const response=await fetch(url,{headers:{accept:'*/*',referer:PLAYER.origin+'/'},redirect:'manual',signal:AbortSignal.timeout(8000)});
 try{
  if([403,429].includes(response.status))throw Error('access_denied');
  if(![301,302,303,307,308].includes(response.status))throw Error('stream_unavailable');
  return {...item,url:mediaRedirect(response.headers.get('location')),needs_resolve:false,quality:'Авто'};
 }finally{await response.body?.cancel();}
}
const movieQuery=movie=>({title:movie.titles[0],alternative_titles:movie.titles.slice(1),year:movie.year,series:movie.series});
export async function handleUFDub(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let input;try{const raw=await request.text();if(raw.length>8192)return reply({error:'request_too_large'},413);input=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input)||!['search','post','stream'].includes(input.action))return reply({error:'invalid_request'},400);
 if(input.movie&&(!Array.isArray(input.movie.titles)||!input.movie.titles.length||input.movie.titles.length>8||input.movie.titles.some(t=>typeof t!=='string'||!t.trim()||t.length>200)||input.movie.year&&!/^\d{4}$/.test(String(input.movie.year))||input.movie.series!==undefined&&typeof input.movie.series!=='boolean'))return reply({error:'invalid_movie'},400);
 try{
  if(input.action==='search'&&(typeof input.title!=='string'||!input.title.trim()||input.title.length>200))throw Error('invalid_query');
  if(input.action==='post')pathInfo(input.path);
  if(input.action==='stream')episodeURL(input.resolve_url,input.post_id);
 }catch(error){return reply({error:'ufdub_'+(error.message==='invalid_path'?'invalid_path':input.action==='search'?'invalid_query':'invalid_url')},400);}
 try{
  if(input.action==='search'){
   let results=parseUFDubSearch(await siteFetch(SITE,'/index.php?do=search',{do:'search',subaction:'search',story:input.title.trim()}));
   if(input.movie)results=results.filter(item=>sameMovie(item,movieQuery(input.movie)));return reply({results});
  }
  if(input.action==='stream')return reply({items:[await resolve({provider:'ufdub',source:'UFDub',title:clean(input.title)||'Відео',post_id:String(input.post_id),resolve_url:input.resolve_url,translation:clean(input.translation)||'Українська · UFDub',voice_id:clean(input.voice_id)||'uk',season:Number(input.season)>0?Number(input.season):null,episode:Number(input.episode)>0?Number(input.episode):null,language:'uk'})]});
  const post=parseUFDubPost(await siteFetch(SITE,input.path),input.path);
  if(input.movie&&!sameMovie(post,movieQuery(input.movie)))throw Error('movie_mismatch');
  const url=new URL(post.player),inventory=parseUFDubPlayer(await siteFetch(PLAYER,url.pathname+url.search,undefined,{referer:SITE.origin+post.path}),post);
  if(input.movie&&!sameMovie({...post,series:inventory.series},movieQuery(input.movie)))throw Error('movie_mismatch');
  // Only one published redirect is checked here; later episodes resolve on play.
  // This keeps even large playlists within the free Worker's subrequest budget.
  inventory.items[0]=await resolve(inventory.items[0]);
  const {player,...metadata}=post;return reply({...metadata,...inventory});
 }catch(error){
  let code=String(error?.message||'');if(!/^(?:access_denied|redirect|http_\d{3}|response_too_large|player_not_found|player_format|unsupported_stream|stream_unavailable|movie_mismatch|invalid_url)$/.test(code))code=/timeout|abort/i.test(code)?'timeout':'unavailable';
  return reply({error:'ufdub_'+code},502);
 }
}
