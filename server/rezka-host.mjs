import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createVercelRezka} from './vercel-rezka.mjs';

const assets=new Map([
 ['/',{file:'index.html',type:'text/html; charset=utf-8'}],
 ['/style.css',{file:'style.css',type:'text/css; charset=utf-8'}],
 ['/check.js',{file:'check.js',type:'text/javascript; charset=utf-8'}],
 ['/diagnostics.js',{file:'diagnostics.js',type:'text/javascript; charset=utf-8'}]
]);
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};

// Same adapter and diagnostic page as Vercel, served by a plain Node process.
export function createRezkaHost({env=process.env,fetcher=fetch}={}){
 if(typeof env.XOT_SERVER_TOKEN!=='string'||env.XOT_SERVER_TOKEN.length<32)throw Error('XOT_SERVER_TOKEN must contain at least 32 characters');
 const handle=createVercelRezka({env,fetcher});let active=0;
 const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const reply=(status,data)=>{res.writeHead(status,{...headers,'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  if(pathname==='/healthz'&&req.method==='GET')return reply(200,{ok:true,service:'xot-rezka'});
  if(assets.has(pathname)&&['GET','HEAD'].includes(req.method)){
   try{const asset=assets.get(pathname),body=await readFile(new URL('../vercel-public/'+asset.file,import.meta.url));res.writeHead(200,{...headers,'content-type':asset.type});res.end(req.method==='HEAD'?undefined:body);}catch{return reply(500,{error:'assets_unavailable'});}
   return;
  }
  if(pathname!=='/api/rezka')return reply(404,{error:'not_found'});
  if(!['GET','POST'].includes(req.method))return reply(405,{error:'method_not_allowed'});
  if(active>=12)return reply(429,{error:'backend_busy'});active++;
  try{
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>4096){reply(413,{error:'request_too_large'});return;}chunks.push(chunk);}
   const request=new Request('http://localhost/api/rezka',{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   const response=await handle(request);
   res.writeHead(response.status,{...headers,...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.headersSent)reply(502,{error:'backend_unavailable'});else res.end();}
  finally{active--;}
 });
 server.requestTimeout=45000;server.headersTimeout=10000;return server;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const server=createRezkaHost();
 server.listen(Number(process.env.PORT||8788),'0.0.0.0',()=>console.info('XOT Rezka diagnostic host listening'));
 const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
