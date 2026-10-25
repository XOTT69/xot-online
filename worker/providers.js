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
export const providers=[{
 id:'kodik',name:'Kodik',
 enabled(){return true;},
 async search(query,env){
  const token=await getKodikToken(env);
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
 return {provider:provider.id,title:String(item.title).slice(0,200),year:item.year||null,id:item.id||null};
}
