export function normalizeTitle(value) {
 return String(value||'').normalize('NFKC').toLocaleLowerCase()
  .replace(/[’`']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
export function matchScore(candidate, query) {
 const a=normalizeTitle(candidate.title);
 if(!a)return 0;
 let score=0;
 for(const name of buildQueries(query)){
  const b=normalizeTitle(name);if(!b)continue;
  let attempt=a===b?100:(a.includes(b)||b.includes(a)?70:0);
  if(!attempt){const aa=new Set(a.split(' ')),bb=new Set(b.split(' '));attempt=Math.round(65*[...bb].filter(x=>aa.has(x)).length/Math.max(aa.size,bb.size));}
  score=Math.max(score,attempt);
 }
 const cy=Number(candidate.year),qy=Number(query.year);
 if(cy&&qy){if(Math.abs(cy-qy)>1)score-=45;else if(cy===qy)score+=10;}
 return Math.max(0,Math.min(100,score));
}
export function buildQueries(input) {
 const all=[input.title,...(input.alternative_titles||[])].filter(v=>typeof v==='string').map(v=>v.trim()).filter(Boolean);
 const unique=new Map();
 for(const name of all){const key=normalizeTitle(name);if(key&&!unique.has(key))unique.set(key,name);}
 return [...unique.values()].slice(0,10);
}

// A release year or a title fragment alone cannot identify the selected movie.
export function sameMovie(candidate, query){
 const cy=Number(candidate.year),qy=Number(query.year);
 if(cy&&qy&&cy!==qy)return false;
 if(query.series!==undefined&&candidate.series!==undefined&&Boolean(query.series)!==Boolean(candidate.series))return false;
 if(query.imdb_id&&candidate.imdb_id)return query.imdb_id===candidate.imdb_id;
 const expected=buildQueries(query).map(normalizeTitle);
 return [candidate.title,candidate.original_title,...(candidate.alternative_titles||[])].filter(v=>typeof v==='string').map(normalizeTitle).some(value=>value&&expected.includes(value));
}
