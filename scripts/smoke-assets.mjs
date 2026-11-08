import {readFile} from 'node:fs/promises';

// Exercise local client changes against the real APIs before publishing assets.
export async function serveLocalAssets(page,origin){
 if(process.env.XOT_LOCAL_ASSETS!=='1')return;
 for(const name of ['m.js','online.js']){
  const body=await readFile(new URL('../public/'+name,import.meta.url),'utf8');
  await page.route(origin+'/'+name+'*',route=>route.fulfill({body,contentType:'application/javascript; charset=utf-8',headers:{'access-control-allow-origin':'*','cache-control':'no-store'}}));
 }
}
