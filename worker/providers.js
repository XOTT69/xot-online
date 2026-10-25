const KODIK_API='https://kodik-api.com/search';
export const providers=[{
 id:'kodik',name:'Kodik',
 enabled(env){return Boolean(env&&env.KODIK_TOKEN);},
 async search(query,env){
  if(!this.enabled(env))return [];
  const url=new URL(KODIK_API);
  url.searchParams.set('token',env.KODIK_TOKEN);
  url.searchParams.set('title',query.title);
  url.searchParams.set('limit','30');
  const response=await fetch(url.toString(),{headers:{accept:'application/json'},signal:AbortSignal.timeout(6000)});
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
 return {provider:provider.id,title:String(item.title).slice(0,200),year:item.year||null,id:item.id||null};
}
