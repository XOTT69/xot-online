import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKinostrainPost,parseKinostrainSearch,handleKinostrain} from '../worker/kinostrain.js';

function page(data,key='content-movie-fixture'){
 const table=[];function ref(value){const at=table.length;table.push(null);table[at]=Array.isArray(value)?value.map(ref):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,ref(v)])):value;return at;}
 ref({[key]:{data}});return '<script id="__NUXT_DATA__" type="application/json">'+JSON.stringify(table)+'</script>';
}
const movie={id:1,name:'Fixture',originalName:'Original Fixture',slug:'fixture',type:'movie',format:'film',yearStart:2022,seasons:[{number:1,playerData:{tortuga:[{name:'Студія',link:'https://tortuga.tw/vod/123'}],ashdi:[{name:'Excluded',link:'https://ashdi.vip/vod/999'}]},rightsBlocked:false}]};
const postRequest=body=>new Request('https://test/api/kinostrain',{method:'POST',body:JSON.stringify(body)});
test('Kinostrain search exposes complete title/year/type and excludes anime and invalid slugs',()=>{
 const results=parseKinostrainSearch({data:[movie,{...movie,type:'serial',slug:'show',firstReadySeason:{number:2}},{...movie,format:'anime'},{...movie,slug:'../../private'}]});
 assert.equal(results.length,2);assert.equal(results[0].original_title,'Original Fixture');assert.equal(results[0].year,2022);assert.equal(results[1].series,true);assert.equal(results[1].path,'/show/season-2');
});
test('Kinostrain indexed JSON retains published voice and episode identity without executing scripts or including unsupported players',()=>{
 const data=parseKinostrainPost(page(movie),'/movie-fixture');assert.equal(data.id,'1');assert.equal(data.items.length,1);assert.equal(data.items[0].voice_id,'kinostrain:Студія');assert.equal(data.items[0].needs_resolve,true);
 const series={...movie,type:'serial',slug:'show',seasons:[{number:2,playerData:{1:{tortuga:[{name:'DniproFilm',link:'https://tortuga.tw/vod/111'}]},3:{tortuga:[{name:'DniproFilm',link:'https://tortuga.tw/vod/333'}]}}}]};
 const parsed=parseKinostrainPost(page(series,'content-show-s2'),'/show/season-2');assert.deepEqual(parsed.items.map(i=>[i.season,i.episode]),[[2,1],[2,3]]);
 assert.throws(()=>parseKinostrainPost(page({...movie,seasons:[{...movie.seasons[0],rightsBlocked:true}]}),'/movie-fixture'),/stream_unavailable/);
 assert.throws(()=>parseKinostrainPost(page({...movie,slug:'other'}),'/movie-fixture'),/movie_mismatch/);
});
test('Kinostrain rejects cycles, dangerous keys and invalid paths in untrusted Nuxt data',()=>{
 for(const json of ['[{"content-movie-fixture":0}]','[{"content-movie-fixture":1},{"__proto__":1}]'])assert.throws(()=>parseKinostrainPost('<script id="__NUXT_DATA__">'+json+'</script>','/movie-fixture'),/player_format/);
 assert.throws(()=>parseKinostrainPost(page(movie),'https://evil.example/movie-fixture'),/invalid_path/);
});
test('Kinostrain verifies card identity before media and revalidates lazy descriptors against the published season',async()=>{
 let calls=0;const fetcher=async url=>{calls++;assert.ok(String(url).startsWith('https://kinostrain.com/'));return new Response(page(movie));};
 const wrong=await handleKinostrain(postRequest({action:'post',path:'/movie-fixture',movie:{titles:['Unrelated'],year:2022,series:false}}),fetcher);assert.equal((await wrong.json()).error,'kinostrain_movie_mismatch');
 const forged=await handleKinostrain(postRequest({action:'stream',catalog_path:'/movie-fixture',voice_id:'kinostrain:Студія',resolve_url:'https://tortuga.tw/vod/999'}),fetcher);assert.equal((await forged.json()).error,'kinostrain_movie_mismatch');assert.equal(calls,2);
 const invalid=await handleKinostrain(postRequest({action:'post',path:'https://127.0.0.1/private'}),fetcher);assert.equal(invalid.status,400);assert.equal(calls,2);
});
