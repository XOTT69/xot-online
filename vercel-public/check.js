import {runRezkaDiagnostics,diagnosticCode} from './diagnostics.js';

const $=id=>document.getElementById(id),rows=[];
let controller;
const messages={unauthorized:'Ключ не збігається з XOT_SERVER_TOKEN у Vercel.',backend_not_configured:'Додай XOT_SERVER_TOKEN у Vercel та виконай Redeploy.',rezka_access_denied:'Rezka обмежує доступ із цього сервера.',rezka_auth_required:'Джерело вимагає вхід або доступ до вибраного озвучення.',rezka_session_expired:'Rezka відхилила гостьову сесію. Спробуй повторити перевірку.',rezka_session_required:'Сторінка не повернула гостьовий токен плеєра.',rezka_stream_unavailable:'Rezka відповіла, але не повернула відеопосилання.',rezka_timeout:'Джерело не відповіло вчасно.'};
const stages={search:'пошук',post:'озвучення',episodes:'список серій',stream:'відеопосилання'};
function render(row){
 rows.push(row);const item=document.createElement('li');
 item.textContent=row.label+' — '+(row.ok?row.detail:(messages[row.detail]||row.detail)+(stages[row.stage]?' Етап: '+stages[row.stage]+'.':''));$('results').append(item);
}
function finish(){controller=null;$('start').disabled=false;$('cancel').hidden=true;$('copy').hidden=!rows.length;}
$('check-form').addEventListener('submit',async event=>{
 event.preventDefault();if(controller)return;
 const token=$('token').value;if(token.length<32)return;
 controller=new AbortController();const signal=controller.signal;
 $('start').disabled=true;$('cancel').hidden=false;$('copy').hidden=true;$('results').replaceChildren();rows.length=0;
 $('status').textContent='Перевіряємо фільм і серіал…';
 try{
  await runRezkaDiagnostics(async body=>{
   const timer=new AbortController(),timeout=setTimeout(()=>timer.abort(),45000);
   try{
    const response=await fetch('/api/rezka',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.any([signal,timer.signal]),cache:'no-store',redirect:'error'});
    let data;try{data=await response.json();}catch{throw Error('invalid_response');}
    if(!response.ok||data.error)throw Error(diagnosticCode(data.error));return data;
   }catch(error){if(signal.aborted)throw new DOMException('Cancelled','AbortError');if(timer.signal.aborted)throw Error('rezka_timeout');throw error;}
   finally{clearTimeout(timeout);}
  },render);
  const passed=rows.filter(row=>row.ok).length;
  $('status').textContent=passed===rows.length?'Відеопосилання отримані. Наступний крок — відтворення в Lampa.':'Перевірка завершена: успішно '+passed+' із '+rows.length+'.';
 }catch(error){$('status').textContent=error.name==='AbortError'?'Перевірку скасовано.':'Не вдалося завершити перевірку.';}
 finally{finish();}
});
$('cancel').addEventListener('click',()=>controller?.abort());
$('copy').addEventListener('click',async()=>{
 const report=['ХОТ · Rezka / Vercel',location.origin,...rows.map(row=>row.label+': '+(row.ok?'OK — ':'Помилка — ')+row.detail+(stages[row.stage]?' ['+stages[row.stage]+']':'')),'Це перевірка відеопосилань, не відтворення.'].join('\n');
 try{await navigator.clipboard.writeText(report);$('status').textContent='Звіт скопійовано.';}catch{$('status').textContent='Не вдалося скопіювати звіт. Результати залишилися на сторінці.';}
});
