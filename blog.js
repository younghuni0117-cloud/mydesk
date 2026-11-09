import {BlogManagement} from './blog-auth.mjs?v=menus1';
import {loadNavigation,navigationState,selectNavigationMenu} from './site-navigation.mjs?v=menus1';
import {menuPath,folderOptions,descendantIds,legacyMenuId,postMenuId,locationFields} from './navigation-data.mjs?v=menus1';
import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
import {sanitizeHTML,textHTML as esc,displayDate,safeURL} from './blog-content.mjs?v=crash1';
const $=id=>document.getElementById(id),endpoint=SHARED_MODEL_URL.replace(/robot_shared_model$/,'blog_posts');
const query=new URLSearchParams(location.search),postId=query.get('post');
let menus=navigationState().menus,selectedMenu=legacyMenuId(query,menus),moving=null;
function pathLabel(id){return menuPath(menus,id).map(m=>m.label).join(' / ');}
function menuSelect(element,selected){element.replaceChildren(...folderOptions(menus).map(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.label;return o;}));if(selected&&menus.some(m=>m.id===selected&&m.kind==='folder'))element.value=selected;}

let managementKey='',posts=[],editing=null,dirty=false,busy=false,offline=false;
function status(text,error=false){$('blog-status').textContent=text;$('blog-status').classList.toggle('is-error',error);}
function adminUI(){ $('blog-new').hidden=!managementKey||!$('blog-editor').hidden||!folderOptions(menus).length;$('blog-manage').textContent=managementKey?'글 관리 설정':'글 관리';}
async function api(path='',options={}){
 const result=await fetch(endpoint+path,{...options,headers:{apikey:SHARED_MODEL_KEY,'Content-Type':'application/json','x-client-info':managementKey?'mydesk-blog/'+managementKey:'mydesk-blog-reader',Prefer:'return=representation',...options.headers}});
 if(!result.ok){if([401,403].includes(result.status))throw Error('관리 권한을 확인해 주세요. 글 관리에서 비밀번호로 다시 연결할 수 있습니다.');throw Error('서버에 연결하지 못했습니다. 작성 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.');}
 return result.status===204?[]:result.json();
}
function dates(post){return `<time datetime="${esc(post.created_at)}">등록 ${displayDate(post.created_at)}</time>${post.revision>0?` · <time datetime="${esc(post.updated_at)}">수정 ${displayDate(post.updated_at)}</time>`:''}`;}
function controls(post){return managementKey?`<div class="blog-actions"><button data-edit="${esc(post.id)}">수정</button><button data-move="${esc(post.id)}">이동</button><button data-delete="${esc(post.id)}">삭제</button></div>`:'';}
function render(){
 adminUI();
 const chosen=postId?posts.find(p=>p.id===postId):null,id=chosen?postMenuId(chosen):selectedMenu,menu=menus.find(m=>m.id===id);
 $('blog-heading').textContent=menu?.label||'학습정보';
 $('blog-breadcrumb').textContent=menu?pathLabel(id):'학습정보';
 $('blog-description').textContent=chosen?pathLabel(id):'관심 있는 자료와 배움의 기록을 메뉴별로 모읍니다.';
 document.title=(chosen?.title||menu?.label||'학습정보')+' | My Desk';
 selectNavigationMenu(id);
 if(postId&&!chosen){$('blog-content').innerHTML='<p class="blog-empty">삭제되었거나 존재하지 않는 글입니다. <a href="blog.html">전체 글 보기</a></p>';return;}
 if(chosen){
  $('blog-content').innerHTML=`<a class="blog-back" href="blog.html?menu=${encodeURIComponent(id)}">← ${esc(menu?.label||'전체')} 글 목록</a><article><header class="blog-post-heading"><h2>${esc(chosen.title)}</h2><div class="blog-date">${dates(chosen)}</div><p>${esc(chosen.summary)}</p>${controls(chosen)}</header><div class="blog-article">${sanitizeHTML(chosen.body)}</div></article>`;
  if(location.hash){try{document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();}catch{}}
 }else{
  if(id&&!menu){$('blog-content').innerHTML='<p class="blog-empty">이 메뉴는 이동하거나 삭제되었습니다. <a href="blog.html">전체 글 보기</a></p>';return;}
  const allowed=id?descendantIds(menus,id):null,visible=posts.filter(p=>!allowed||allowed.has(postMenuId(p))),children=menus.filter(m=>m.parent_id===id);
  const submenus=children.length?`<nav class="blog-submenus" aria-label="하위 메뉴">${children.map(m=>`<a href="${m.kind==='folder'?'blog.html?menu='+encodeURIComponent(m.id):esc(m.href)}"${m.href?.startsWith('https://')?' target="_blank" rel="noopener noreferrer"':''}>${esc(m.label)}</a>`).join('')}</nav>`:'';
  $('blog-content').innerHTML=submenus+(visible.length?`<div class="blog-grid">${visible.map(p=>`<article class="blog-card"><div class="blog-category">${esc(pathLabel(postMenuId(p)))}</div><a href="blog.html?post=${encodeURIComponent(p.id)}"><h2>${esc(p.title)}</h2></a><p>${esc(p.summary)}</p><div class="blog-date">${dates(p)}</div>${controls(p)}</article>`).join('')}</div>`:'<p class="blog-empty">아직 등록된 글이 없습니다.</p>');
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
 menuSelect($('post-menu'),post?postMenuId(post):selectedMenu);$('post-title').value=post?.title||'';$('post-summary').value=post?.summary||'';$('post-body').innerHTML=sanitizeHTML(post?.body||'<p><br></p>');
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
 let placement;try{placement=locationFields(menus,$('post-menu').value);}catch(error){status(error.message,true);return;}
 const data={...placement,title:$('post-title').value.trim(),summary:$('post-summary').value.trim(),body:sanitizeHTML($('post-body').innerHTML)};
 if(!data.title||!data.menu_id||!$('post-body').textContent.trim()){status('제목, 글 위치와 본문을 입력해 주세요.',true);return;}
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
 const editButton=event.target.closest('[data-edit]'),del=event.target.closest('[data-delete]'),move=event.target.closest('[data-move]');
 if(move){if(offline){status('서버에 연결된 뒤 이동해 주세요.',true);return;}moving=posts.find(p=>p.id===move.dataset.move);$('post-move-name').textContent=moving.title;menuSelect($('post-move-menu'),postMenuId(moving));$('post-move-error').textContent='';$('post-move-dialog').showModal();return;}
 if(editButton){edit(posts.find(p=>p.id===editButton.dataset.edit));return;}
 if(!del||busy)return;
 if(offline){status('서버에 연결된 뒤 삭제해 주세요.',true);return;}
 const post=posts.find(p=>p.id===del.dataset.delete);
 if(!confirm(`“${post.title}” 글을 삭제할까요? 삭제한 글은 복구할 수 없습니다.`))return;
 busy=true;del.disabled=true;
 try{const rows=await api(`?id=eq.${encodeURIComponent(post.id)}&revision=eq.${post.revision}`,{method:'DELETE'});if(!rows.length)throw Error('다른 기기에서 글이 변경되었거나 관리 권한이 없습니다. 새로고침 후 확인해 주세요.');if(postId)location.assign('blog.html?menu='+encodeURIComponent(postMenuId(post)));else{posts=posts.filter(p=>p.id!==post.id);render();status('글을 삭제했습니다.');}}
 catch(error){status(error.message,true);del.disabled=false;}finally{busy=false;}
});
$('post-move-cancel').onclick=()=>$('post-move-dialog').close();
$('post-move-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!moving)return;
 if($('post-move-menu').value===postMenuId(moving)){$('post-move-dialog').close();return;}
 busy=true;$('post-move-save').disabled=true;
 try{const rows=await api(`?id=eq.${encodeURIComponent(moving.id)}&revision=eq.${moving.revision}`,{method:'PATCH',body:JSON.stringify(locationFields(menus,$('post-move-menu').value))});if(!rows.length)throw Error('다른 기기에서 글이 변경되었습니다. 새로고침 후 다시 이동해 주세요.');posts=posts.map(p=>p.id===moving.id?rows[0]:p);$('post-move-dialog').close();render();status('글을 새 메뉴로 이동했습니다.');}
 catch(error){$('post-move-error').textContent=error.message;}finally{busy=false;$('post-move-save').disabled=false;}
});
const management=new BlogManagement({onChange:token=>{managementKey=token;adminUI();if(posts.length||!$('blog-content').textContent)render();},canDisconnect:()=>!dirty||confirm('작성 중인 내용이 있습니다. 연결을 해제하면 저장하기 전에 다시 연결해야 합니다. 계속할까요?')});
$('blog-manage').onclick=()=>management.open();
window.addEventListener('navigation-updated',event=>{menus=event.detail.menus;selectedMenu=legacyMenuId(query,menus);if($('blog-editor').hidden)render();});
adminUI();
await loadNavigation();menus=navigationState().menus;
await management.init();
load();
