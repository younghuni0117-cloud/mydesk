import {BlogManagement} from './blog-auth.mjs?v=update69';
import {loadNavigation,navigationState,saveNavigation} from './site-navigation.mjs?v=update69';
import {orderedMenus,menuPath,folderOptions,descendantIds,reorderMenu,removeMenu,safeMenuHref} from './navigation-data.mjs?v=update69';
import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
const $=id=>document.getElementById(id);let token='',posts=[],editingId=null,deletingId=null,busy=false;
const state=()=>navigationState(),menus=()=>state().menus;
function status(message,error=false){$('menu-status').textContent=message;$('menu-status').classList.toggle('is-error',error);}
function path(id){return menuPath(menus(),id).map(m=>m.label).join(' / ');}
function selectOptions(element,options,selected){element.replaceChildren(...options.map(item=>{const o=document.createElement('option');o.value=item.id;o.textContent=item.label;return o;}));if(options.some(o=>o.id===selected))element.value=selected;}
function render(){
 $('menu-add').hidden=!token;$('menu-auth').textContent=token?'관리 설정':'관리 연결';$('menu-tree').replaceChildren();
 for(const m of orderedMenus(menus())){
  const row=document.createElement('div');row.className='menu-row';row.dataset.id=m.id;row.style.setProperty('--depth',m.depth);
  const info=document.createElement('div');info.className='menu-row-info';const label=document.createElement('strong');label.textContent=m.label;const small=document.createElement('small'),count=posts.filter(p=>p.menu_id===m.id).length;small.textContent=m.kind==='folder'?`글 메뉴 · 직접 등록 ${count}개`:m.href;info.append(label,small);row.append(info);
  if(token){const visibility=document.createElement('label'),check=document.createElement('input');visibility.className='menu-visibility';check.type='checkbox';check.checked=m.hidden===true;check.disabled=busy;check.dataset.visibility=m.id;check.setAttribute('aria-label',m.label+' 숨김');visibility.append(check,document.createTextNode('숨김'));row.append(visibility);const actions=document.createElement('div');actions.className='menu-row-actions';const siblings=menus().filter(n=>n.parent_id===m.parent_id),index=siblings.findIndex(n=>n.id===m.id);
   for(const [action,text,disabled] of [['up','↑',index===0],['down','↓',index===siblings.length-1],['edit','수정·이동',false],...(m.kind==='folder'?[['add','하위 추가',false]]:[]),['delete','삭제',false]]){
    const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.action=action;button.disabled=busy||disabled;button.setAttribute('aria-label',m.label+' '+({up:'위로 이동',down:'아래로 이동'}[action]||text));actions.append(button);
   }row.append(actions);
  }$('menu-tree').append(row);
 }
}
async function refresh(){
 await loadNavigation(true);
 try{const response=await fetch(SHARED_MODEL_URL.replace(/robot_shared_model$/,'blog_posts')+'?select=id,title,menu_id',{headers:{apikey:SHARED_MODEL_KEY}});if(!response.ok)throw Error();posts=await response.json();if(!state().online)throw Error();status('');}
 catch{status('인터넷 연결을 확인해 주세요. 서버에 연결된 후 변경할 수 있습니다.',true);}
 render();
}
function edit(id=null,parent=null){
 const m=menus().find(n=>n.id===id);editingId=m?.id||null;$('menu-edit-title').textContent=m?'메뉴 수정·이동':'메뉴 추가';$('menu-label').value=m?.label||'';$('menu-kind').value=m?.kind||'folder';$('menu-href').value=m?.href||'';$('menu-hidden').checked=m?.hidden===true;
 const excluded=m?descendantIds(menus(),m.id):new Set();selectOptions($('menu-parent'),[{id:'',label:'최상위 메뉴'},...folderOptions(menus(),excluded)],m?.parent_id||parent||'');updateKind();$('menu-edit-error').textContent='';$('menu-edit-dialog').showModal();$('menu-label').focus();
}
function updateKind(){const link=$('menu-kind').value==='link';$('menu-href-label').hidden=!link;$('menu-href').required=link;}
$('menu-kind').onchange=updateKind;$('menu-add').onclick=()=>edit();$('menu-refresh').onclick=refresh;
$('menu-edit-cancel').onclick=()=>$('menu-edit-dialog').close();$('menu-delete-cancel').onclick=()=>$('menu-delete-dialog').close();
async function save(next,moves=[]){if(!token)throw Error('관리 비밀번호로 먼저 연결해 주세요.');await saveNavigation(next,token,moves);await refresh();}
$('menu-edit-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;const kind=$('menu-kind').value,href=kind==='link'?$('menu-href').value.trim():null;
 if(kind==='link'&&!safeMenuHref(href)){$('menu-edit-error').textContent='페이지 주소는 .html 경로나 https 주소로 입력해 주세요.';return;}
 if(kind==='link'&&editingId&&(menus().some(m=>m.parent_id===editingId)||posts.some(p=>p.menu_id===editingId))){$('menu-edit-error').textContent='하위 메뉴와 글을 다른 곳으로 옮긴 뒤 페이지 연결로 바꿀 수 있습니다.';return;}
 const item={...menus().find(m=>m.id===editingId),hidden:$('menu-hidden').checked,id:editingId||crypto.randomUUID(),parent_id:$('menu-parent').value||null,label:$('menu-label').value.trim(),kind,href};const next=editingId?menus().map(m=>m.id===editingId?item:m):[...menus(),item];
 busy=true;$('menu-save').disabled=true;
 try{await save(next);$('menu-edit-dialog').close();status('메뉴를 저장했습니다.');}catch(error){$('menu-edit-error').textContent=error.message;}finally{busy=false;$('menu-save').disabled=false;render();}
});
$('menu-tree').addEventListener('change',async e=>{
 const check=e.target.closest('input[data-visibility]');if(!check||busy)return;
 const next=menus().map(m=>m.id===check.dataset.visibility?{...m,hidden:check.checked}:m);
 busy=true;render();try{await save(next);status('숨김 설정을 저장했습니다.');}catch(error){status(error.message,true);}finally{busy=false;render();}
});
$('menu-tree').addEventListener('click',async e=>{
 const button=e.target.closest('button[data-action]');if(!button||busy)return;const id=button.closest('[data-id]').dataset.id,action=button.dataset.action;
 if(action==='edit'){edit(id);return;}if(action==='add'){edit(null,id);return;}
 if(action==='delete'){
  deletingId=id;const m=menus().find(n=>n.id===id),count=posts.filter(p=>p.menu_id===id).length;
  $('menu-delete-description').textContent=`“${m.label}” 메뉴를 삭제할까요? 이 메뉴에 직접 등록된 글은 ${count}개입니다.`;
  selectOptions($('menu-transfer'),folderOptions(menus(),new Set([id])),m.parent_id);
  $('menu-transfer-label').hidden=!count;$('menu-transfer').required=!!count;$('menu-delete-error').textContent=count&&!$('menu-transfer').options.length?'글을 옮길 메뉴가 없습니다. 다른 글 메뉴를 먼저 만들어 주세요.':'';
  $('menu-delete-save').disabled=!!count&&!$('menu-transfer').options.length;$('menu-delete-dialog').showModal();return;
 }
 busy=true;render();try{await save(reorderMenu(menus(),id,action==='up'?-1:1));status('메뉴 순서를 변경했습니다.');}catch(error){status(error.message,true);}finally{busy=false;render();}
});
$('menu-delete-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;const count=posts.filter(p=>p.menu_id===deletingId).length,moves=count?[{from_id:deletingId,to_id:$('menu-transfer').value}]:[];
 busy=true;$('menu-delete-save').disabled=true;
 try{await save(removeMenu(menus(),deletingId),moves);$('menu-delete-dialog').close();status('메뉴를 삭제했습니다. 글과 하위 메뉴는 유지했습니다.');}catch(error){$('menu-delete-error').textContent=error.message;}finally{busy=false;$('menu-delete-save').disabled=false;render();}
});
const management=new BlogManagement({onChange:value=>{token=value;render();}});$('menu-auth').onclick=()=>management.open();
await loadNavigation();await management.init();await refresh();
