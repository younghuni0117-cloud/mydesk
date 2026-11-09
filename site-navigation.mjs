import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
import {DEFAULT_MENUS,validateMenus,menuPath,legacyMenuId,safeMenuHref} from './navigation-data.mjs?v=menus1';
const endpoint=SHARED_MODEL_URL.replace(/robot_shared_model$/,'site_navigation'),key='mydesk.navigation.v1';
let state={id:'main',menus:structuredClone(DEFAULT_MENUS),revision:0,online:false},loading=null,selection;
try{const cached=JSON.parse(localStorage.getItem(key)||'null');if(cached){validateMenus(cached.menus);state={...cached,online:false};}}catch{}
export const navigationState=()=>state;
function saveCache(){try{localStorage.setItem(key,JSON.stringify(state));}catch{}}
export function selectNavigationMenu(id){selection=id;renderNavigation();}
export function acceptNavigation(row){validateMenus(row.menus);state={...row,online:true};saveCache();renderNavigation();window.dispatchEvent(new CustomEvent('navigation-updated',{detail:state}));return state;}
export async function loadNavigation(refresh=false){
 if(loading&&!refresh)return loading;
 loading=(async()=>{try{const response=await fetch(endpoint+'?id=eq.main&select=id,menus,revision,updated_at',{headers:{apikey:SHARED_MODEL_KEY}});if(!response.ok)throw Error('Unavailable');const [row]=await response.json();if(!row)throw Error('Missing');return acceptNavigation(row);}catch{state.online=false;renderNavigation();return state;}})();return loading;
}
export async function saveNavigation(menus,token,postMoves=[]){
 validateMenus(menus);if(!state.online)throw Error('서버에 연결된 후 메뉴를 수정해 주세요.');
 const response=await fetch(endpoint.replace(/site_navigation$/,'rpc/blog_navigation_save'),{method:'POST',headers:{apikey:SHARED_MODEL_KEY,'Content-Type':'application/json','x-client-info':'mydesk-blog/'+token},body:JSON.stringify({expected_revision:state.revision,new_menus:menus,post_moves:postMoves})});
 if(!response.ok){let detail;try{detail=await response.json();}catch{}throw Error(detail?.message||'메뉴를 저장하지 못했습니다. 관리 연결과 인터넷 연결을 확인해 주세요.');}
 return acceptNavigation(await response.json());
}
function makeLink(label,href,active=false){const a=document.createElement('a');a.className='nav-item';a.textContent=label;a.href=href;if(active){a.classList.add('is-current');a.setAttribute('aria-current','page');}if(href.startsWith('https://')&&new URL(href).origin!==location.origin){a.target='_blank';a.rel='noopener noreferrer';}return a;}
export function renderNavigation(){
 const nav=document.querySelector('#sidebar nav');if(!nav)return;
 const open=new Set([...nav.querySelectorAll('details[open]')].map(el=>el.dataset.menuId)),menus=state.menus,query=new URLSearchParams(location.search),selected=selection??legacyMenuId(query,menus),ancestors=new Set(menuPath(menus,selected).map(m=>m.id));
 const currentFile=location.pathname.split('/').pop()||'index.html';
 function build(parent){const fragment=document.createDocumentFragment();for(const m of menus.filter(m=>m.parent_id===parent)){
  const href=m.kind==='folder'?'blog.html?menu='+encodeURIComponent(m.id):m.href;
  if(m.kind==='link'&&!safeMenuHref(href))continue;
  const active=m.kind==='folder'?document.body.dataset.page==='blog'&&selected===m.id:!href.startsWith('https://')&&href.split(/[?#]/)[0]===currentFile;
  if(m.kind==='folder'&&menus.some(c=>c.parent_id===m.id)){
   const d=document.createElement('details');d.className='nav-group';d.dataset.menuId=m.id;d.open=open.has(m.id)||ancestors.has(m.id)||['learning','experiments'].includes(m.id);
   const summary=document.createElement('summary'),label=document.createElement('a');label.className='nav-folder-link';label.textContent=m.label;label.href=href;if(active)label.setAttribute('aria-current','page');summary.append(label);d.append(summary);
   const children=document.createElement('div');children.className='nav-submenu';children.append(build(m.id));d.append(children);fragment.append(d);
  }else{const a=makeLink(m.label,href,active);a.dataset.menuId=m.id;fragment.append(a);}
 }return fragment;}
 nav.replaceChildren(build(null));window.syncCalendarMenuLinks?.();
}
renderNavigation();
