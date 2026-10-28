import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import worker from '../worker/index.js';

export function createBackend({token,providerEnv={},handler=worker.fetch}={}){
 if(typeof token!=='string'||token.length<32)throw Error('XOT_SERVER_TOKEN must contain at least 32 characters');
 const expected=Buffer.from('Bearer '+token);
 let active=0;
 return createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const reply=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method==='GET'&&pathname==='/healthz')return reply(200,{ok:true});
  const supplied=Buffer.from(req.headers.authorization||'');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply(401,{error:'unauthorized'});
  if(!['/api/filmix','/api/rezka'].includes(pathname)||req.method!=='POST')return reply(404,{error:'not_found'});
  if(active>=12)return reply(429,{error:'backend_busy'});
  active++;
  try{
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>4096){reply(413,{error:'request_too_large'});return;}chunks.push(chunk);}
   const request=new Request('https://xot-backend.internal'+pathname,{method:'POST',headers:{'content-type':'application/json'},body:Buffer.concat(chunks)});
   const response=await handler(request,providerEnv);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.headersSent)reply(502,{error:'backend_unavailable'});else res.end();}
  finally{active--;}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const server=createBackend({token:process.env.XOT_SERVER_TOKEN,providerEnv:{XOT_REZKA_ORIGIN:process.env.XOT_REZKA_ORIGIN,FILMIX_API_BASE:process.env.FILMIX_API_BASE}});
 server.requestTimeout=30000;server.headersTimeout=10000;
 server.listen(Number(process.env.PORT||8788),'0.0.0.0',()=>console.info('XOT native backend listening'));
 const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
