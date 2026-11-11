import {BlogManagement} from './blog-auth.mjs?v=update69';
import {loadNavigation,navigationState,selectNavigationMenu} from './site-navigation.mjs?v=update69';
import {folderOptions,visibleMenus,descendantIds,legacyMenuId,postMenuId,locationFields} from './navigation-data.mjs?v=update69';
import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
import {sanitizeHTML,textHTML as esc,displayDate,safeURL} from './blog-content.mjs?v=crash1';
const $=id=>document.getElementById(id),endpoint=SHARED_MODEL_URL.replace(/robot_shared_model$/,'blog_posts');
const query=new URLSearchParams(location.search),postId=query.get('post');
let menus=navigationState().menus,selectedMenu=legacyMenuId(query,menus),moving=null;
function menuSelect(element,selected){element.replaceChildren(...folderOptions(menus).map(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.label;return o;}));if(selected&&menus.some(m=>m.id===selected&&m.kind==='folder'))element.value=selected;}

let managementKey='',posts=[],editing=null,dirty=false,busy=false,offline=false;
function status(text,error=false){$('blog-status').textContent=text;$('blog-status').classList.toggle('is-error',error);}
function adminUI(){ $('blog-new').hidden=!managementKey||!$('blog-editor').hidden||!folderOptions(menus).length;$('blog-manage').textContent=managementKey?'글 관리 설정':'글 관리';}
async function api(path='',options={}){
 const result=await fetch(endpoint+path,{cache:'no-store',...options,headers:{apikey:SHARED_MODEL_KEY,'Content-Type':'application/json','x-client-info':managementKey?'mydesk-blog/'+managementKey:'mydesk-blog-reader',Prefer:'return=representation',...options.headers}});
 if(!result.ok){if([401,403].includes(result.status))throw Error('관리 권한을 확인해 주세요. 글 관리에서 비밀번호로 다시 연결할 수 있습니다.');throw Error('서버에 연결하지 못했습니다. 작성 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.');}
 return result.status===204?[]:result.json();
}
const lockIcon='<span class="post-lock" role="img" aria-label="비공개"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="8" width="12" height="9" rx="2"/><path d="M6.5 8V5.5a3.5 3.5 0 0 1 7 0V8"/></svg></span>';
const postTitle=post=>(post.is_private?lockIcon:'')+esc(post.title);
async function rpc(name,args){
 const response=await fetch(endpoint.replace(/blog_posts$/,'rpc/blog_post_'+name),{method:'POST',cache:'no-store',headers:{apikey:SHARED_MODEL_KEY,'Content-Type':'application/json','x-client-info':managementKey?'mydesk-blog/'+managementKey:'mydesk-blog-reader'},body:JSON.stringify(args)});
 if(!response.ok)throw Error('글 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
 const result=await response.json();if(!result.ok)throw Error(result.message||'요청을 처리하지 못했습니다.');return result.post;
}
async function unlock(post,password=null){
 const full=await rpc('read',{post_id:post.id,post_password:password});
 posts=posts.map(p=>p.id===post.id?{...full,_unlocked:true}:p);return {...full,_unlocked:true};
}
function privacyFields(){
 const checked=$('post-private').checked,existing=editing?.is_private;
 $('post-password-fields').hidden=!checked;
 for(const id of ['post-password','post-password-confirm']){$(id).disabled=!checked;$(id).required=checked&&!existing;}
 $('post-password-note').textContent=existing?'비밀번호를 변경하려면 새로 입력하세요. 두 칸을 비워두면 기존 비밀번호를 유지합니다.':'8자 이상으로 설정해 주세요. 한글은 UTF-8 기준 72바이트 이내로 입력해 주세요.';
}
$('post-private').onchange=privacyFields;
function dates(post){return `<time datetime="${esc(post.created_at)}">등록 ${displayDate(post.created_at)}</time>`;}
function controls(post){return managementKey?`<div class="blog-actions"><button data-edit="${esc(post.id)}">수정</button><button data-move="${esc(post.id)}">이동</button><button data-delete="${esc(post.id)}">삭제</button></div>`:'';}
function render(){
 adminUI();
 const chosen=postId?posts.find(p=>p.id===postId):null,id=chosen?postMenuId(chosen):selectedMenu,menu=menus.find(m=>m.id===id);
 $('blog-heading').textContent=menu?.label||'학습정보';
 $('blog-breadcrumb').textContent=menu?.label||'학습정보';
 $('blog-description').textContent=chosen?'':'관심 있는 자료와 배움의 기록을 메뉴별로 모읍니다.';$('blog-description').hidden=!!chosen;
 document.title=(chosen?.title||menu?.label||'학습정보')+' | My Desk';
 selectNavigationMenu(id);
 if(postId&&!chosen){$('blog-content').innerHTML='<p class="blog-empty">삭제되었거나 존재하지 않는 글입니다. <a href="blog.html">전체 글 보기</a></p>';return;}
 if(chosen){
  $('blog-content').innerHTML=`<a class="blog-back" href="blog.html?menu=${encodeURIComponent(id)}">← ${esc(menu?.label||'전체')} 글 목록</a><article><header class="blog-post-heading"><h2>${postTitle(chosen)}</h2><div class="blog-date">${dates(chosen)}</div><p>${esc(chosen.summary)}</p>${controls(chosen)}</header>${chosen.is_private&&!chosen._unlocked?`<form id="post-unlock-form" class="post-unlock"><p>비공개 글입니다. 글 비밀번호를 입력해 주세요.</p><label>비밀번호<input id="post-unlock-password" type="password" autocomplete="off" required></label><button type="submit">글 열기</button><p id="post-unlock-error" role="status"></p></form>`:`<div class="blog-article">${sanitizeHTML(chosen.body)}</div>`}</article>`;
  if(location.hash){try{document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();}catch{}}
 }else{
  if(id&&!menu){$('blog-content').innerHTML='<p class="blog-empty">이 메뉴는 이동하거나 삭제되었습니다. <a href="blog.html">전체 글 보기</a></p>';return;}
  const allowed=id?descendantIds(menus,id):null,visible=posts.filter(p=>!allowed||allowed.has(postMenuId(p))),children=visibleMenus(menus).filter(m=>m.parent_id===id);
  const submenus=children.length?`<nav class="blog-submenus" aria-label="하위 메뉴">${children.map(m=>`<a href="${m.kind==='folder'?'blog.html?menu='+encodeURIComponent(m.id):esc(m.href)}"${m.href?.startsWith('https://')?' target="_blank" rel="noopener noreferrer"':''}>${esc(m.label)}</a>`).join('')}</nav>`:'';
  $('blog-content').innerHTML=submenus+(visible.length?`<div class="blog-grid">${visible.map(p=>`<article class="blog-card"><a href="blog.html?post=${encodeURIComponent(p.id)}"><h2>${postTitle(p)}</h2></a><p>${esc(p.summary)}</p><div class="blog-date">${dates(p)}</div>${controls(p)}</article>`).join('')}</div>`:'<p class="blog-empty">아직 등록된 글이 없습니다.</p>');
 }
}
async function load(){
 status('글을 불러오는 중입니다.');
 try{posts=await api('?select=*&order=created_at.desc,id.asc');offline=false;status('');}
 catch(error){offline=true;posts=[];status('글을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.',true);$('blog-content').replaceChildren();return;}
 if(postId&&managementKey){const p=posts.find(p=>p.id===postId);if(p?.is_private)try{await unlock(p);}catch(error){status(error.message,true);}}

 render();
}
async function edit(post=null){
 if(post?.is_private){try{post=await unlock(post);}catch(error){status(error.message,true);return;}}
 if(offline){status('서버에 연결된 뒤 작성·수정해 주세요.',true);return;}
 editing=post;dirty=false;$('post-private').checked=!!post?.is_private;$('post-password').value='';$('post-password-confirm').value='';privacyFields();$('editor-title').textContent=post?'글 수정':'새 글 작성';
 menuSelect($('post-menu'),post?postMenuId(post):selectedMenu);$('post-title').value=post?.title||'';$('post-summary').value=post?.summary||'';$('post-body').innerHTML=sanitizeHTML(post?.body||'<p><br></p>');
 $('blog-content').hidden=true;$('blog-editor').hidden=false;$('blog-new').hidden=true;$('post-title').focus();
}
function closeEditor(){if(dirty&&!confirm('저장하지 않은 내용이 있습니다. 작성을 취소할까요?'))return;dirty=false;$('post-password').value='';$('post-password-confirm').value='';$('blog-content').hidden=false;$('blog-editor').hidden=true;render();}
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
 const data={...placement,is_private:$('post-private').checked,title:$('post-title').value.trim(),summary:$('post-summary').value.trim(),body:sanitizeHTML($('post-body').innerHTML)};
 if(!data.title||!data.menu_id||!$('post-body').textContent.trim()){status('제목, 글 위치와 본문을 입력해 주세요.',true);return;}
 if(new TextEncoder().encode(data.body).length>1000000){status('본문은 1MB 이하로 입력해 주세요.',true);return;}
 const password=$('post-password').value;
 if(data.is_private){
  if(password!==$('post-password-confirm').value){status('글 비밀번호와 확인 입력이 일치하지 않습니다.',true);return;}
  if((!editing?.is_private||password)&&(password.length<8||new TextEncoder().encode(password).length>72)){status('글 비밀번호는 8자 이상, UTF-8 기준 72바이트 이하로 입력해 주세요.',true);return;}
 }
 busy=true;$('post-save').disabled=true;status('저장 중입니다.');
 try{
  data.id=editing?.id||crypto.randomUUID();
  const saved=await rpc('save',{payload:data,expected_revision:editing?.revision??null,post_password:data.is_private?(password||null):null});
  $('post-password').value='';$('post-password-confirm').value='';
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
 try{const rows=await api(`?id=eq.${encodeURIComponent(moving.id)}&revision=eq.${moving.revision}`,{method:'PATCH',body:JSON.stringify(locationFields(menus,$('post-move-menu').value))});if(!rows.length)throw Error('다른 기기에서 글이 변경되었습니다. 새로고침 후 다시 이동해 주세요.');posts=posts.map(p=>p.id===moving.id?(p._unlocked&&rows[0].is_private?{...rows[0],body:p.body,summary:p.summary,_unlocked:true}:rows[0]):p);$('post-move-dialog').close();render();status('글을 새 메뉴로 이동했습니다.');}
 catch(error){$('post-move-error').textContent=error.message;}finally{busy=false;$('post-move-save').disabled=false;}
});
$('blog-content').addEventListener('submit',async event=>{
 if(event.target.id!=='post-unlock-form')return;event.preventDefault();
 const form=event.target,button=form.querySelector('button'),password=$('post-unlock-password').value;
 button.disabled=true;$('post-unlock-error').textContent='';
 try{await unlock(posts.find(p=>p.id===postId),password);render();}catch(error){$('post-unlock-error').textContent=error.message;$('post-unlock-password').value='';}finally{button.disabled=false;}
});
const management=new BlogManagement({onChange:token=>{const changed=managementKey!==token;managementKey=token;adminUI();if(changed){posts=posts.map(p=>p.is_private?{...p,body:'',summary:'',_unlocked:false}:p);if(posts.length)load();}else if(posts.length||!$('blog-content').textContent)render();},canDisconnect:()=>!dirty||confirm('작성 중인 내용이 있습니다. 연결을 해제하면 저장하기 전에 다시 연결해야 합니다. 계속할까요?')});
$('blog-manage').onclick=()=>management.open();
window.addEventListener('navigation-updated',event=>{menus=event.detail.menus;selectedMenu=legacyMenuId(query,menus);if($('blog-editor').hidden)render();});
adminUI();
await loadNavigation();menus=navigationState().menus;
await management.init();
load();
