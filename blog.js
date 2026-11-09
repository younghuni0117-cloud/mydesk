import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
import {sanitizeHTML,textHTML as esc,displayDate,safeURL} from './blog-content.mjs';
const $=id=>document.getElementById(id),endpoint=SHARED_MODEL_URL.replace(/robot_shared_model$/,'blog_posts');
const query=new URLSearchParams(location.search),category=['ai','structural'].includes(query.get('category'))?query.get('category'):null,topic=query.get('topic'),postId=query.get('post');
const names={ai:'AI',structural:'구조해석'},storageKey='mydesk.blog.management';
let managementKey='',posts=[],editing=null,dirty=false,busy=false,offline=false;
try{managementKey=localStorage.getItem(storageKey)||'';}catch{}
const fragment=new URLSearchParams(location.hash.slice(1)),incoming=fragment.get('manage');
if(incoming&&/^[A-Za-z0-9_-]{43}$/.test(incoming)){
 managementKey=incoming;try{localStorage.setItem(storageKey,incoming);}catch{}
 fragment.delete('manage');history.replaceState(null,'',location.pathname+location.search+(fragment.size?'#'+fragment:''));
}
function status(text,error=false){$('blog-status').textContent=text;$('blog-status').classList.toggle('is-error',error);}
function adminUI(){ $('blog-new').hidden=!managementKey;$('blog-manage').textContent=managementKey?'관리 연결됨':'글 관리';}
async function api(path='',options={}){
 const result=await fetch(endpoint+path,{...options,headers:{apikey:SHARED_MODEL_KEY,'Content-Type':'application/json','x-client-info':managementKey?'mydesk-blog/'+managementKey:'mydesk-blog-reader',Prefer:'return=representation',...options.headers}});
 if(!result.ok){if([401,403].includes(result.status))throw Error('관리 권한을 확인해 주세요. 전용 관리 링크로 다시 연결할 수 있습니다.');throw Error('서버에 연결하지 못했습니다. 작성 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.');}
 return result.status===204?[]:result.json();
}
function dates(post){return `<time datetime="${esc(post.created_at)}">등록 ${displayDate(post.created_at)}</time>${post.revision>0?` · <time datetime="${esc(post.updated_at)}">수정 ${displayDate(post.updated_at)}</time>`:''}`;}
function controls(post){return managementKey?`<div class="blog-actions"><button data-edit="${esc(post.id)}">수정</button><button data-delete="${esc(post.id)}">삭제</button></div>`:'';}
function updateTopics(){
 const topics=[...new Map(posts.map(p=>[p.category+'\0'+p.topic,{category:p.category,topic:p.topic}])).values()];
 try{localStorage.setItem('mydesk.blog.topics',JSON.stringify(topics));}catch{}
 window.dispatchEvent(new CustomEvent('blog-topics',{detail:topics}));
 $('blog-topics').replaceChildren(...[...new Set(topics.map(t=>t.topic))].map(t=>{const o=document.createElement('option');o.value=t;return o;}));
}
function render(){
 adminUI();updateTopics();
 const chosen=postId?posts.find(p=>p.id===postId):null;
 $('blog-heading').textContent=chosen?names[chosen.category]:(topic||(names[category]||'정보와 기록'));
 $('blog-breadcrumb').textContent=chosen?names[chosen.category]:(names[category]||'블로그');
 $('blog-description').textContent=chosen?chosen.topic:(category?`${names[category]} 관련 자료와 배움의 기록을 모읍니다.`:'AI와 구조해석의 자료, 개념과 경험을 기록합니다.');
 document.title=(chosen?.title||topic||names[category]||'블로그')+' | My Desk';
 if(postId&&!chosen){$('blog-content').innerHTML='<p class="blog-empty">삭제되었거나 존재하지 않는 글입니다. <a href="blog.html">전체 글 보기</a></p>';return;}
 if(chosen){
  $('blog-content').innerHTML=`<a class="blog-back" href="blog.html?${new URLSearchParams({category:chosen.category,topic:chosen.topic})}">← ${esc(chosen.topic)} 글 목록</a><article><header class="blog-post-heading"><h2>${esc(chosen.title)}</h2><div class="blog-date">${dates(chosen)}</div><p>${esc(chosen.summary)}</p>${controls(chosen)}</header><div class="blog-article">${sanitizeHTML(chosen.body)}</div></article>`;
  window.dispatchEvent(new CustomEvent('blog-topics',{detail:[{category:chosen.category,topic:chosen.topic}]}));
  const group=document.querySelector(`.nav-group[data-category="${chosen.category}"]`);if(group){group.open=true;const a=[...group.querySelectorAll('a')].find(a=>new URL(a.href).searchParams.get('topic')===chosen.topic);if(a){a.classList.add('is-current');a.setAttribute('aria-current','page');}}
  if(location.hash){const el=document.getElementById(decodeURIComponent(location.hash.slice(1)));el?.scrollIntoView();}
 }else{
  const visible=posts.filter(p=>(!category||p.category===category)&&(!topic||p.topic===topic));
  $('blog-content').innerHTML=visible.length?`<div class="blog-grid">${visible.map(p=>`<article class="blog-card"><div class="blog-category">${names[p.category]} / ${esc(p.topic)}</div><a href="blog.html?post=${encodeURIComponent(p.id)}"><h2>${esc(p.title)}</h2></a><p>${esc(p.summary)}</p><div class="blog-date">${dates(p)}</div>${controls(p)}</article>`).join('')}</div>`:'<p class="blog-empty">아직 등록된 글이 없습니다.</p>';
 }
}
async function load(){
 status('글을 불러오는 중입니다.');
 try{posts=await api('?select=*&order=created_at.desc,id.asc');offline=false;status('');}
 catch(error){
  // Read-only original articles remain available during connection outages. No automatic reseeding.
  try{posts=(await (await fetch('blog-seed.json')).json()).map(p=>({...p,created_at:'2026-11-09T00:00:00Z',updated_at:'2026-11-09T00:00:00Z',revision:0}));offline=true;status('연결이 원활하지 않아 기존 자료를 표시합니다. 편집·삭제는 연결 복구 후 가능합니다.',true);}catch{status(error.message,true);return;}
 }
 render();
}
function edit(post=null){
 if(offline){status('서버에 연결된 뒤 작성·수정해 주세요.',true);return;}
 editing=post;dirty=false;$('editor-title').textContent=post?'글 수정':'새 글 작성';
 $('post-category').value=post?.category||category||'ai';$('post-topic').value=post?.topic||topic||'';$('post-title').value=post?.title||'';$('post-summary').value=post?.summary||'';$('post-body').innerHTML=sanitizeHTML(post?.body||'<p><br></p>');
 $('blog-content').hidden=true;$('blog-editor').hidden=false;$('blog-new').hidden=true;$('post-title').focus();
}
function closeEditor(){if(dirty&&!confirm('저장하지 않은 내용이 있습니다. 작성을 취소할까요?'))return;dirty=false;$('blog-content').hidden=false;$('blog-editor').hidden=true;render();}
$('blog-new').onclick=()=>edit();$('post-cancel').onclick=closeEditor;
$('post-form').addEventListener('input',()=>dirty=true);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
$('post-body').addEventListener('paste',event=>{event.preventDefault();const clipboard=event.clipboardData;const html=clipboard.getData('text/html');document.execCommand('insertHTML',false,html?sanitizeHTML(html):esc(clipboard.getData('text/plain')).replace(/\n/g,'<br>'));dirty=true;});
$('post-body').addEventListener('drop',event=>event.preventDefault());
document.querySelector('.editor-tools').addEventListener('mousedown',event=>{if(event.target.closest('button'))event.preventDefault();});
document.querySelector('.editor-tools').addEventListener('click',event=>{
 const action=event.target.closest('[data-format]')?.dataset.format;if(!action)return;
 $('post-body').focus();
 if(action==='link'){const value=prompt('연결할 주소를 입력해 주세요.','https://');if(value){const url=safeURL(value);if(url)document.execCommand('createLink',false,url);else alert('http 또는 https 주소를 입력해 주세요.');}}
 else if(['h2','p'].includes(action))document.execCommand('formatBlock',false,action);
 else document.execCommand(action,false);dirty=true;
});
$('post-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const data={category:$('post-category').value,topic:$('post-topic').value.trim(),title:$('post-title').value.trim(),summary:$('post-summary').value.trim(),body:sanitizeHTML($('post-body').innerHTML)};
 if(!data.title||!data.topic||!$('post-body').textContent.trim()){status('제목, 하위 주제와 본문을 입력해 주세요.',true);return;}
 if(new TextEncoder().encode(data.body).length>1000000){status('본문은 1MB 이하로 입력해 주세요.',true);return;}
 busy=true;$('post-save').disabled=true;status('저장 중입니다.');
 try{
  let saved;
  if(editing){const rows=await api(`?id=eq.${encodeURIComponent(editing.id)}&revision=eq.${editing.revision}`,{method:'PATCH',body:JSON.stringify(data)});if(!rows.length)throw Error('다른 기기에서 글이 변경되었거나 관리 권한이 없습니다. 내용을 복사한 후 다시 확인해 주세요.');saved=rows[0];}
  else{data.id=crypto.randomUUID();[saved]=await api('',{method:'POST',body:JSON.stringify(data)});}
  dirty=false;location.assign('blog.html?post='+encodeURIComponent(saved.id));
 }catch(error){status(error.message,true);}finally{busy=false;$('post-save').disabled=false;}
});
$('blog-content').addEventListener('click',async event=>{
 const editButton=event.target.closest('[data-edit]'),del=event.target.closest('[data-delete]');
 if(editButton){edit(posts.find(p=>p.id===editButton.dataset.edit));return;}
 if(!del||busy)return;
 if(offline){status('서버에 연결된 뒤 삭제해 주세요.',true);return;}
 const post=posts.find(p=>p.id===del.dataset.delete);
 if(!confirm(`“${post.title}” 글을 삭제할까요? 삭제한 글은 복구할 수 없습니다.`))return;
 busy=true;del.disabled=true;
 try{const rows=await api(`?id=eq.${encodeURIComponent(post.id)}&revision=eq.${post.revision}`,{method:'DELETE'});if(!rows.length)throw Error('다른 기기에서 글이 변경되었거나 관리 권한이 없습니다. 새로고침 후 확인해 주세요.');if(postId)location.assign('blog.html?'+new URLSearchParams({category:post.category,topic:post.topic}));else{posts=posts.filter(p=>p.id!==post.id);render();status('글을 삭제했습니다.');}}
 catch(error){status(error.message,true);del.disabled=false;}finally{busy=false;}
});
$('blog-manage').onclick=()=>{
 if(managementKey){if(confirm('이 기기의 글 관리 연결을 해제할까요? 다시 연결하려면 관리 링크가 필요합니다.')){managementKey='';try{localStorage.removeItem(storageKey);}catch{};if(!$('blog-editor').hidden){$('blog-editor').hidden=true;$('blog-content').hidden=false;dirty=false;}render();}return;}
 $('manage-dialog').showModal();
};
$('manage-connect').onclick=()=>{
 let value=$('manage-key').value.trim();try{value=new URLSearchParams(new URL(value).hash.slice(1)).get('manage')||value;}catch{}
 if(!/^[A-Za-z0-9_-]{43}$/.test(value)){$('manage-error').textContent='올바른 관리 링크 또는 관리 키를 입력해 주세요.';return;}
 managementKey=value;try{localStorage.setItem(storageKey,value);}catch{};$('manage-key').value='';$('manage-dialog').close();render();
};
adminUI();load();
