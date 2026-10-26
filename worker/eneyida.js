import {parseDocument, DomUtils} from 'htmlparser2';
import {sameMovie} from './matching.js';

const ORIGIN='https://eneyida.tv';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type','x-content-type-options':'nosniff'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const clean=(value,max=200)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
const all=(node,predicate)=>DomUtils.findAll(predicate,node.children||[]);
const first=(node,predicate)=>all(node,predicate)[0];
const hasClass=(node,name)=>(node.attribs?.class||'').split(/\s+/).includes(name);
const text=node=>node?clean(DomUtils.textContent(node)):'';

function pagePath(value){
 if(typeof value!=='string'||!/^\/\d{1,8}-[a-z0-9-]+\.html$/i.test(value)||value.length>500)throw Error('eneyida_invalid_path');
 return value;
}
// Upstreams are fixed to the site's public players/CDNs, never arbitrary client URLs.
export function trustedURL(value,kind='media'){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('eneyida_invalid_url');
 const host=url.hostname;
 if(kind==='page'){
  if(url.origin!==ORIGIN)throw Error('eneyida_invalid_url');
 }else if(kind==='player'){
  if(!['hdvbua.pro','tortuga.tw','tortuga.wtf'].includes(host)||!/^\/(?:vid|vod|embd|embed)\/[a-z0-9/_-]+$/i.test(url.pathname)||url.searchParams.has('tr'))throw Error('eneyida_invalid_url');
 }else if(!/(?:^|\.)(?:hdvbua\.pro|tortuga\.tw|tortuga\.wtf)$/.test(host)||!url.pathname.endsWith('.m3u8'))throw Error('eneyida_invalid_url');
 return url;
}
async function upstream(value,kind,{form,referer=ORIGIN+'/'}={},redirects=0){
 const url=trustedURL(value,kind),headers={accept:kind==='media'?'application/vnd.apple.mpegurl':'text/html','user-agent':'Mozilla/5.0',referer};
 if(form)headers['content-type']='application/x-www-form-urlencoded';
 const response=await fetch(url,{method:form?'POST':'GET',headers,body:form?new URLSearchParams(form).toString():undefined,redirect:'manual',signal:AbortSignal.timeout(8000)});
 if(response.status>=300&&response.status<400){
  if(redirects>=2||!response.headers.get('location'))throw Error('eneyida_redirect');
  const next=trustedURL(new URL(response.headers.get('location'),url),kind);
  // Search must not silently turn into a GET of the homepage after a redirect.
  if(form)throw Error('eneyida_redirect');
  return upstream(next,kind,{referer},redirects+1);
 }
 if([403,429].includes(response.status))throw Error('eneyida_access_denied');
 if(!response.ok)throw Error('eneyida_http_'+response.status);
 const reader=response.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw Error('eneyida_response_too_large');}chunks.push(value);}
 const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
 const body=new TextDecoder().decode(joined);
 if(/cf-chl-|<title>\s*(?:Just a moment|Attention Required)|captcha-container/i.test(body))throw Error('eneyida_access_denied');
 return {body,url};
}
export function parseEneyidaSearch(html){
 const root=parseDocument(html),content=first(root,n=>n.attribs?.id==='dle-content');
 if(!content)return [];
 const results=[],seen=new Set();
 for(const node of all(content,n=>n.name==='article'&&hasClass(n,'short'))){
  const link=first(node,n=>n.name==='a'&&hasClass(n,'short_title'));
  if(!link)continue;
  let path;try{const u=trustedURL(new URL(link.attribs.href,ORIGIN),'page');path=pagePath(u.pathname);}catch{continue;}
  const id=path.match(/^\/(\d+)/)[1],title=text(link);
  if(!title||seen.has(id))continue;seen.add(id);
  const subtitle=text(first(node,n=>hasClass(n,'short_subtitle'))),year=subtitle.match(/^(19\d{2}|20\d{2})/);
  results.push({id,path,title,original_title:clean(subtitle.replace(/^(?:19|20)\d{2}\s*[•·]?\s*/,'')),year:year?Number(year[0]):null,series:/\d+\s*сезон/iu.test(text(node))});
 }
 return results.slice(0,50);
}
export function parseEneyidaPost(html,path){
 const root=parseDocument(html),article=first(root,n=>n.name==='article'&&hasClass(n,'full'));
 if(!article)throw Error('eneyida_player_not_found');
 const info=first(article,n=>n.attribs?.id==='full_info'),fields=info?all(info,n=>n.name==='li'):[];
 const year=text(fields.find(n=>/^Рік:/u.test(text(n)))).match(/\b(19\d{2}|20\d{2})\b/);
 const sound=clean(text(fields.find(n=>/^Звук:/u.test(text(n)))).replace(/^Звук:\s*/u,''));
 const players=[];
 for(const frame of all(article,n=>n.name==='iframe')){
  let tab=null,excluded=false;
  for(let parent=frame.parent;parent&&parent!==article;parent=parent.parent){
   if(/trailer/i.test(parent.attribs?.id||'')||/trailer/i.test(parent.attribs?.class||''))excluded=true;
   if(hasClass(parent,'tabs_b'))tab=parent;
  }
  if(!tab||excluded)continue;
  try{const url=trustedURL(frame.attribs.src,'player').toString();if(!players.includes(url))players.push(url);}catch{}
 }
 if(!players.length)throw Error('eneyida_player_not_found');
 if(players.length>8)throw Error('eneyida_response_too_large');
 return {id:path.match(/^\/(\d+)/)?.[1],path,title:text(first(article,n=>n.name==='h1')),original_title:text(first(article,n=>hasClass(n,'full_header-subtitle'))),year:year?Number(year[1]):null,series:fields.some(n=>/^Жанр:/u.test(text(n))&&/серіал/iu.test(text(n))),translation:sound?'Українська · '+sound:'Українська',players};
}

// Read public PlayerJS data literals. Page scripts are never evaluated.
export function playerFile(html){
 const root=parseDocument(html);
 for(const script of all(root,n=>n.name==='script'&&!n.attribs?.src)){
  const source=DomUtils.textContent(script),start=source.search(/new\s+Playerjs\s*\(/i);
  if(start<0)continue;
  const fragment=source.slice(start),match=/\bfile\s*:\s*/.exec(fragment);
  if(!match)continue;
  const at=match.index+match[0].length,quote=fragment[at];
  if(quote==='"'||quote==="'"){
   let value='';
   for(let i=at+1;i<fragment.length;i++){
    const c=fragment[i];if(c===quote)return value;
    if(c!=='\\'){value+=c;continue;}
    const escaped=fragment[++i];
    if(escaped==='u'){
     const hex=fragment.slice(i+1,i+5);if(!/^[a-f0-9]{4}$/i.test(hex))throw Error('eneyida_player_format');
     value+=String.fromCharCode(parseInt(hex,16));i+=4;
    }else if(['"',"'",'\\','/'].includes(escaped))value+=escaped;
    else if(escaped==='n')value+='\n';else if(escaped==='r')value+='\r';else if(escaped==='t')value+='\t';
    else throw Error('eneyida_player_format');
   }
  }
  if(quote==='['){
   let depth=0,inString=false,escaped=false;
   for(let i=at;i<fragment.length;i++){
    const c=fragment[i];if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;continue;}
    if(c==='"')inString=true;else if(c==='[')depth++;else if(c===']'&&!--depth)return fragment.slice(at,i+1);
   }
  }
 }
 throw Error('eneyida_player_format');
}
function decodePublicFile(value){
 const raw=String(value||'').trim();if(raw.startsWith('https://')||raw.startsWith('['))return raw;
 // Legacy Tortuga public player representation; this is not media decryption.
 try{
  const base=raw.replace(/[^A-Za-z0-9+/]/g,'');if(base.length%4===1)throw Error();
  const bytes=Uint8Array.from(atob(base+'='.repeat((4-base.length%4)%4)),c=>c.charCodeAt(0));
  const decoded=new TextDecoder().decode(Uint8Array.from(bytes.slice(1),(c,i)=>c^((bytes[0]+7*i+13)%256)));
  if(decoded.startsWith('https://')||decoded.startsWith('['))return decoded;
  const reversed=new TextDecoder().decode(bytes).split('').reverse().join('');
  if(reversed.startsWith('https://')||reversed.startsWith('['))return reversed;
 }catch{}
 throw Error('eneyida_player_format');
}
export function playerInventory(file,post){
 const value=decodePublicFile(file);let data=value;
 if(value.startsWith('[')){try{data=JSON.parse(value);}catch{throw Error('eneyida_player_format');}}
 const items=[],seen=new Set();let nodes=0;
 const ordinal=(label,word)=>Number(label.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*'+word,'iu'))?.[1]||label.match(new RegExp(word+'\\s*(\\d+(?:\\.\\d+)?)','iu'))?.[1])||null;
 function walk(node,context={},depth=0){
  if(++nodes>10000||depth>12)throw Error('eneyida_response_too_large');
  if(Array.isArray(node)){for(const child of node)walk(child,context,depth+1);return;}
  if(typeof node==='string')node={file:node};
  if(!node||typeof node!=='object')return;
  const label=clean(node.title),season=ordinal(label,'сезон'),episode=ordinal(label,'(?:серія|серия|епізод|episode)');
  const next={...context};
  if(season)next.season=season;
  if(episode)next.episode=episode;
  if(label&&!season&&!episode)next.translation=label;
  if(Array.isArray(node.folder)){walk(node.folder,next,depth+1);return;}
  if(typeof node.file!=='string')return;
  let url;try{url=trustedURL(node.file).toString();}catch{return;}
  const translation=next.translation||post.translation||'Українська',s=next.season||(post.series?1:null),e=next.episode||null;
  if(post.series&&!e)return;
  const key=[url,s,e,translation].join('|');if(seen.has(key))return;seen.add(key);
  items.push({title:post.title,source:'Eneyida',provider:'eneyida',translation,voice_id:'eneyida:'+translation,season:s,episode:e,url,quality:'Авто',needs_resolve:true});
 }
 walk(data);
 return items;
}

export function hlsQualities(body,base){
 if(!body.trimStart().startsWith('#EXTM3U'))throw Error('eneyida_invalid_playlist');
 const lines=body.split(/\r?\n/),items=[];
 if(lines.some(l=>/^#EXT-X-(?:KEY|SESSION-KEY):/.test(l)&&(/METHOD=SAMPLE-AES|KEYFORMAT="(?!identity")/i.test(l))))throw Error('eneyida_unsupported_stream');
 let pending=null,hasAudio=false;
 for(const line of lines){
  if(/^#EXT-X-MEDIA:.*TYPE=AUDIO/.test(line)&&/URI=/.test(line))hasAudio=true;
  if(line.startsWith('#EXT-X-STREAM-INF:')){pending=line;continue;}
  if(!pending||!line.trim()||line.startsWith('#'))continue;
  const resolution=pending.match(/RESOLUTION=(\d+)x(\d+)/i),width=Number(resolution?.[1]),pixels=Number(resolution?.[2]);
  const height=width>=3800||pixels>=2160?2160:width>=2500||pixels>=1440?1440:width>=1900||pixels>=1080?1080:width>=1200||pixels>=720?720:width>=800||pixels>=480?480:width>=600||pixels>=360?360:null;
  let url;try{url=trustedURL(new URL(line.trim(),base)).toString();}catch{pending=null;continue;}
  if(height&&!items.some(item=>item.quality===height+'p'))items.push({quality:height+'p',url});
  pending=null;
 }
 // Keep the master when video-only variants depend on a separate audio group.
 if(hasAudio&&items.length)return [{quality:'Авто',url:trustedURL(base).toString(),available_qualities:items.map(item=>item.quality)}];
 if(items.length)return items.sort((a,b)=>parseInt(b.quality)-parseInt(a.quality));
 if(lines.some(line=>line.startsWith('#EXTINF:')))return [{quality:'Авто',url:trustedURL(base).toString()}];
 throw Error('eneyida_invalid_playlist');
}
async function resolve(item){
 const {body,url}=await upstream(item.url,'media');
 return hlsQualities(body,url).map(variant=>({...item,...variant,needs_resolve:false}));
}
export async function handleEneyida(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let input;try{const raw=await request.text();if(raw.length>8192)return reply({error:'request_too_large'},413);input=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'invalid_request'},400);
 if(!['search','post','stream'].includes(input.action))return reply({error:'invalid_action'},400);
 if(input.action==='search'&&(typeof input.title!=='string'||!input.title.trim()||input.title.length>200))return reply({error:'invalid_query'},400);
 if(input.movie&&(!Array.isArray(input.movie.titles)||!input.movie.titles.length||input.movie.titles.length>8||input.movie.titles.some(t=>typeof t!=='string'||t.length>200)||input.movie.year&&!/^\d{4}$/.test(String(input.movie.year))))return reply({error:'invalid_movie'},400);
 try{
  if(input.action==='post')pagePath(input.path);
  if(input.action==='stream')trustedURL(input.url);
 }catch{return reply({error:input.action==='post'?'eneyida_invalid_path':'eneyida_invalid_url'},400);}
 try{
  if(input.action==='search'){
   const {body}=await upstream(ORIGIN+'/','page',{form:{do:'search',subaction:'search',story:input.title.trim()}});
   let results=parseEneyidaSearch(body);
   if(input.movie){const m=input.movie;results=results.filter(item=>sameMovie(item,{title:m.titles[0],alternative_titles:m.titles.slice(1),year:m.year,series:typeof m.series==='boolean'?m.series:undefined}));}
   return reply({results});
  }
  if(input.action==='stream'){
   const item={title:clean(input.title)||'Відео',source:'Eneyida',provider:'eneyida',translation:clean(input.translation)||'Українська',voice_id:clean(input.voice_id,240),season:Number(input.season)>0?Number(input.season):null,episode:Number(input.episode)>0?Number(input.episode):null,url:input.url};
   return reply({items:await resolve(item)});
  }
  const page=await upstream(ORIGIN+input.path,'page'),post=parseEneyidaPost(page.body,input.path);
  if(input.movie){const m=input.movie;if(!sameMovie(post,{title:m.titles[0],alternative_titles:m.titles.slice(1),year:m.year,series:typeof m.series==='boolean'?m.series:undefined}))throw Error('eneyida_movie_mismatch');}
  const groups=await Promise.all(post.players.map(async url=>{const player=await upstream(url,'player',{referer:page.url.toString()});return playerInventory(playerFile(player.body),post);}));
  let items=[...new Map(groups.flat().map(item=>[[item.url,item.season,item.episode,item.translation].join('|'),item])).values()];
  if(!items.length)throw Error('eneyida_stream_unavailable');
  // Resolve a movie's qualities immediately; episodes are resolved only on selection.
  if(!post.series&&items.length<=8)items=(await Promise.all(items.map(item=>resolve(item).catch(()=>[item])))).flat();
  const {players,...metadata}=post;
  return reply({...metadata,items});
 }catch(error){
  const code=String(error?.message||'');
  return reply({error:/^eneyida_(?:invalid_url|invalid_path|redirect|access_denied|http_\d{3}|response_too_large|player_not_found|player_format|invalid_playlist|unsupported_stream|stream_unavailable|movie_mismatch)$/.test(code)?code:/timeout|abort/i.test(code)?'eneyida_timeout':'eneyida_unavailable'},502);
 }
}
