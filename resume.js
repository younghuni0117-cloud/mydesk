import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
import {sanitizeHTML} from './blog-content.mjs?v=crash1';
const $=id=>document.getElementById('resume-'+id),endpoint=SHARED_MODEL_URL.replace(/robot_shared_model$/,'rpc/blog_post_read');
let serial=0,controller=null,idle=null,unlocked=false;
function lock(message='이력서가 잠겼습니다.'){
 serial++;controller?.abort();controller=null;clearTimeout(idle);unlocked=false;$('view').replaceChildren();$('view').hidden=true;$('actions').hidden=true;$('unlock').hidden=false;$('password').value='';$('open').disabled=false;$('status').textContent=message;
}
function activity(){if(unlocked){clearTimeout(idle);idle=setTimeout(()=>lock('10분간 사용하지 않아 잠겼습니다.'),600000);}}
$('unlock').addEventListener('submit',async event=>{event.preventDefault();const password=$('password').value;if(!password)return;const current=++serial;controller?.abort();controller=new AbortController();const request=controller,timeout=setTimeout(()=>request.abort(),15000);$('open').disabled=true;$('status').textContent='비밀번호 확인 중';try{
 const response=await fetch(endpoint,{method:'POST',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:request.signal,headers:{apikey:SHARED_MODEL_KEY,'Content-Type':'application/json','x-client-info':'mydesk-blog-reader'},body:JSON.stringify({post_id:'career-resume-main',post_password:password})});
 if(!response.ok)throw Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');const result=await response.json();if(current!==serial||document.hidden)return;if(!result.ok)throw Error(result.message||'비밀번호를 확인해 주세요.');if(!result.post?.is_private||typeof result.post.body!=='string')throw Error('비공개 설정을 확인할 수 없습니다. 글 관리에서 확인해 주세요.');
 $('view').innerHTML=sanitizeHTML(result.post.body);$('view').hidden=false;$('actions').hidden=false;$('unlock').hidden=true;unlocked=true;$('status').textContent='다른 화면으로 이동하면 자동으로 잠깁니다.';activity();
 }catch(error){if(current===serial)$('status').textContent=error.name==='AbortError'?'응답이 지연됩니다. 잠시 후 다시 시도해 주세요.':error.message;}finally{clearTimeout(timeout);if(current===serial){$('password').value='';$('open').disabled=false;controller=null;}}
});
$('lock').onclick=()=>lock();$('copy').onclick=async()=>{if(!unlocked)return;try{await navigator.clipboard.writeText($('view').innerText);if(unlocked)$('status').textContent='정리본을 복사했습니다.';}catch{if(unlocked)$('status').textContent='복사 권한을 확인해 주세요.';}};
for(const type of ['pointerdown','keydown','scroll'])document.addEventListener(type,activity,{passive:true,capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)lock();});window.addEventListener('pagehide',()=>lock());window.addEventListener('pageshow',e=>{if(e.persisted)lock();});
