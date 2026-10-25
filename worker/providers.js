function clean(value) { return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ').trim().replace(/\s+/g, ' '); }
function score(a, b) { a=clean(a);b=clean(b); if (!a||!b) return 0; if (a===b) return 1; if (a.includes(b)||b.includes(a)) return .7; const aa=new Set(a.split(' ')); const bb=b.split(' '); return bb.filter(x=>aa.has(x)).length/Math.max(aa.size,bb.length); }
async function archiveSearch(query) {
  // Public Archive catalog search. Search results are only catalog candidates,
  // not claims that a film is licensed or available for playback.
  if (!query.title) return [];
  const sanitized=query.title.replace(/["\\:()]/g,' ').trim();
  const q='title:("'+sanitized+'") AND mediatype:movies';
  const u=new URL('https://archive.org/advancedsearch.php');
  u.searchParams.set('q',q);u.searchParams.set('fl[]','identifier');
  u.searchParams.append('fl[]','title');u.searchParams.append('fl[]','year');
  u.searchParams.set('rows','15');u.searchParams.set('output','json');
  const res=await fetch(u.toString(),{headers:{accept:'application/json'},signal:AbortSignal.timeout(6500)});
  if(!res.ok) throw new Error('Archive search HTTP '+res.status);
  const data=await res.json();
  return (data.response?.docs||[]).filter(d=>d.identifier&&score(d.title,query.title)>=.7)
    .slice(0,10).map(d=>({title:String(d.title),identifier:String(d.identifier),year:d.year||null}));
}
export const providers=[{id:'archive',name:'Internet Archive',search:archiveSearch}];
export function normalize(item,provider) {
  if(!item||typeof item!=='object'||!item.title) return null;
  return {provider:provider.id,title:String(item.title).slice(0,200),
    identifier:String(item.identifier||'').slice(0,150),
    year:item.year||null, quality:null,language:null};
}
export async function archiveVariants(identifier) {
  if(!/^[a-zA-Z0-9_\.\-]{1,150}$/.test(identifier)) throw new Error('invalid_identifier');
  const res=await fetch('https://archive.org/metadata/'+encodeURIComponent(identifier),
    {headers:{accept:'application/json'},signal:AbortSignal.timeout(6500)});
  if(!res.ok) throw new Error('Archive metadata HTTP '+res.status);
  const data=await res.json();
  if(data.is_dark||data.is_collection||data.metadata?.is_restricted) return [];
  return (data.files||[]).filter(f=>typeof f.name==='string' &&
    /\.(mp4|webm|m4v)$/i.test(f.name) && !/preview|sample|thumb/i.test(f.name))
    .slice(0,30).map(f=>({
      title:f.name.slice(0,200),
      quality:(f.name.match(/(2160|1080|720|480|360)p/i)||[])[0]||'Авто',
      url:'https://archive.org/download/'+encodeURIComponent(identifier)+'/'+f.name.split('/').map(encodeURIComponent).join('/')
    }));
}
