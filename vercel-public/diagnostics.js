// Keep reports free of credentials, arbitrary upstream text and signed URLs.
const codes=new Set(['unauthorized','backend_not_configured','backend_unavailable','invalid_json','invalid_request','invalid_query','invalid_movie','invalid_id','invalid_episode','request_too_large','rezka_access_denied','rezka_auth_required','rezka_timeout','rezka_unavailable','rezka_invalid_response','rezka_movie_mismatch','rezka_player_not_found','rezka_translations_not_found','rezka_stream_unavailable','rezka_mirror_redirect','rezka_unsupported_stream_format']);
export function diagnosticCode(value){return codes.has(value)?value:'invalid_response';}
function check(value,code){if(!value)throw Error(code);}
function voice(post){
 const rows=(post.translations||[]).filter(row=>/^\d{1,10}$/.test(row.id));
 const free=rows.filter(row=>!row.premium),choices=free.length?free:rows;
 const chosen=choices.find(row=>/укра[їи]н/iu.test(row.title))||choices[0];
 check(chosen,'rezka_translations_not_found');return chosen;
}
function streamInput(post,selected,extra={}){
 return {action:'stream',id:post.id,translator_id:selected.id,series:post.series,is_camrip:selected.is_camrip,is_ads:selected.is_ads,is_director:selected.is_director,...extra};
}
function qualities(data){
 const items=(data.items||[]).filter(item=>{try{return new URL(item.url).protocol==='https:';}catch{return false;}});
 check(items.length,'rezka_stream_unavailable');
 return [...new Set(items.map(item=>String(item.quality||'').match(/^(?:240|360|480|720|1080|1440|2160)p(?: Ultra)?$/)?.[0]).filter(Boolean))].join(', ')||'HTTPS';
}
export async function runRezkaDiagnostics(call,report){
 async function step(label,run){
  try{const detail=await run();report({label,ok:true,detail});}
  catch(error){if(error.name==='AbortError')throw error;report({label,ok:false,detail:diagnosticCode(error.message)});}
 }
 await step('Фільм «Топ Ґан: Меверік», 2022',async()=>{
  const post=await call({action:'post',path:'/films/action/47946-top-gan-meverik-2022-latest.html',movie:{titles:['Top Gun: Maverick','Топ Ган: Мэверик'],year:2022,series:false}});
  check(post.id==='47946'&&post.series===false,'rezka_movie_mismatch');
  const selected=voice(post),data=await call(streamInput(post,selected));
  return post.translations.length+' озвучень; посилання: '+qualities(data);
 });
 await step('Серіал «Король Талси», 2022',async()=>{
  const movie={titles:['Tulsa King','Король Талсы'],year:2022,series:true};
  const search=await call({action:'search',title:'Король Талсы',movie});
  const result=(search.results||[]).find(row=>row.id==='51876');check(result,'rezka_player_not_found');
  const post=await call({action:'post',path:result.path,movie});check(post.id==='51876'&&post.series===true,'rezka_movie_mismatch');
  const selected=voice(post),inventory=await call({action:'episodes',id:post.id,translator_id:selected.id});
  const first=(inventory.seasons||[]).find(row=>Number(row.season)===1&&(row.episodes||[]).includes(1));check(first,'rezka_stream_unavailable');
  const data=await call(streamInput(post,selected,{season:1,episode:1}));
  return 'Сезонів: '+inventory.seasons.length+'; серія 1×1: '+qualities(data);
 });
}
