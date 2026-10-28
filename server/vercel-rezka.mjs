import {timingSafeEqual} from 'node:crypto';
import {handleRezka} from '../worker/rezka.js';

const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>Response.json(data,{status,headers});

// A server-to-server endpoint. The token is never included in source requests.
export function createVercelRezka({env=process.env,fetcher=fetch}={}){
 return async request=>{
  const token=env.XOT_SERVER_TOKEN,configured=typeof token==='string'&&token.length>=32;
  if(request.method==='GET')return reply({ok:true,service:'xot-rezka',configured});
  if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,allow:'GET, POST'}});
  if(!configured)return reply({error:'backend_not_configured'},503);
  const expected=Buffer.from('Bearer '+token),supplied=Buffer.from(request.headers.get('authorization')||'');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply({error:'unauthorized'},401);
  try{
   return await handleRezka(request,{XOT_REZKA_ORIGIN:env.XOT_REZKA_ORIGIN},fetcher);
  }catch{return reply({error:'backend_unavailable'},502);}
 };
}
