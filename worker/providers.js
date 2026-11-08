const KODIK_API='https://kodik-api.com/search';
// Public token is retrieved from Kodik's published player script on demand.
// Never return token to the client or commit it to the repository.
let publicTokenCache={value:null,expires:0};
async function getKodikToken(env){
 if(env&&env.KODIK_TOKEN)return env.KODIK_TOKEN;
 if(publicTokenCache.value&&Date.now()<publicTokenCache.expires)return publicTokenCache.value;
 const response=await fetch('https://kodik-add.com/add-players.min.js?v=2',{signal:AbortSignal.timeout(5500)});
 if(!response.ok)throw new Error('kodik_public_token_unavailable');
 const script=await response.text();
 const match=script.match(/token\s*[=:]\s*["']([0-9a-f]+)["']/i);
 if(!match)throw new Error('kodik_public_token_not_found');
 publicTokenCache={value:match[1],expires:Date.now()+30*60*1000};
 return match[1];
}
const STREAM_EXT=/\.(m3u8|mp4|mpd)(?:[?#]|$)/i;
function validMedia(url){try{const u=new URL(url);return u.protocol==='https:'&&STREAM_EXT.test(u.pathname);}catch(e){return false;}}
const UA_SOURCES=[
 {id:'uaserials',name:'UASerials',env:'XOT_UASERIALS_API_URL'},
 {id:'uafilm',name:'UAFILM',env:'XOT_UAFILM_API_URL'},
 {id:'filmix_api',name:'Filmix API',env:'XOT_FILMIX_API_URL'},
 {id:'rezka_api',name:'Rezka API',env:'XOT_REZKA_API_URL'}
];
function uaProvider(source){
 return {
  id:source.id,name:source.name,
  enabled(env){return Boolean(env&&env[source.env]);},
  async search(query,env){return catalogProvider.search(query,{XOT_CATALOG_URL:env[source.env]});}
 };
}
const catalogProvider={
 id:'catalog',name:'XOT Catalog',
 enabled(env){return Boolean(env&&env.XOT_CATALOG_URL);},
 async search(query,env){
  if(!this.enabled(env))return [];
  const endpoint=new URL(env.XOT_CATALOG_URL);
  if(endpoint.protocol!=='https:')throw new Error('catalog_invalid_endpoint');
  endpoint.searchParams.set('title',query.title);
  if(query.year)endpoint.searchParams.set('year',query.year);
  if(query.tmdb_id)endpoint.searchParams.set('tmdb_id',query.tmdb_id);
  const response=await fetch(endpoint.toString(),{headers:{accept:'application/json'},signal:AbortSignal.timeout(5500)});
  if(!response.ok)throw new Error('catalog_http_'+response.status);
  const payload=await response.json();
  const rows=Array.isArray(payload)?payload:payload.results;
  if(!Array.isArray(rows))throw new Error('catalog_invalid_response');
  return rows.slice(0,80).filter(x=>x&&validMedia(x.url)).map(x=>({
   title:String(x.title||query.title).slice(0,200),
   year:x.year||null,id:String(x.id||'').slice(0,128),
   url:x.url,translation:String(x.translation||'').slice(0,80),
   quality:String(x.quality||'auto').slice(0,30),
   season:Number(x.season)||null,episode:Number(x.episode)||null,
   source:String(x.source||'catalog').slice(0,40)
  }));
 }
};
export const providers=[...UA_SOURCES.map(uaProvider),catalogProvider,{
 id:'kodik',name:'Kodik',
 enabled(env){return Boolean(env&&env.KODIK_TOKEN);},
 async search(query,env){
  const token=env&&env.KODIK_TOKEN;
  const url=new URL(KODIK_API);
  url.searchParams.set('token',token);
  url.searchParams.set('title',query.title);
  url.searchParams.set('limit','30');
  const response=await fetch(url.toString(),{method:'POST',headers:{accept:'application/json'},signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw new Error('kodik_http_'+response.status);
  const json=await response.json();
  if(!Array.isArray(json.results))throw new Error('kodik_bad_response');
  return json.results.map(item=>({
   title:item.title||item.title_orig||'',
   year:item.year||null,
   id:item.id||null,
   // Embed URLs are not public stream URLs, so never pass them to Lampa.Player.play.
   url:null
  })).filter(item=>item.title);
 }
}];
export function normalize(item,provider){
 if(!item||typeof item!=='object'||!item.title)return null;
 return {provider:provider.id,title:String(item.title).slice(0,200),year:item.year||null,id:item.id||null,url:item.url||null,translation:item.translation||null,quality:item.quality||null,season:item.season||null,episode:item.episode||null,source:item.source||null};
}
