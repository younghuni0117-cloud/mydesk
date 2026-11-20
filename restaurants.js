import {RestaurantStore,photoURL,restaurantPayload,safeBlogURL,hasRestaurantPosition} from './restaurant-data.mjs?v=food6';
import {FoodMap,FoodRegions} from './restaurant-map.mjs?v=food6';
import {locateRestaurant} from './restaurant-geocode.mjs?v=food6';
import {BlogManagement} from './blog-auth.mjs';
// Refresh an old cached form before binding new fields; stored records are never reset.
if(document.body.dataset.foodRelease!=='food6'){
 const url=new URL(location.href);
 if(!(url.searchParams.get('food-update')||'').startsWith('food6-')){url.searchParams.set('food-update','food6-'+Date.now());location.replace(url.href);}
 else{const status=document.getElementById('food-status');if(status)status.textContent='화면 파일을 새로 불러와 주세요. 저장 기록은 유지됩니다.';}
}else{
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],selected=null,token='',map,regions,paths=[],editing=null,dirty=false,saving=false,refreshing=false,photoScale=1;
const store=new RestaurantStore({token:()=>token}),cacheKey='mydesk.restaurants.v1';
const management=new BlogManagement({onChange:value=>{token=value;renderList();},canDisconnect:()=>!saving});
$('food-manage').onclick=()=>management.open();
const filtered=()=>{const q=$('food-search').value.trim().toLowerCase(),filter=$('food-filter').value;return rows.filter(r=>(filter==='all'||r.visit_state===filter)&&[r.name,r.address,r.dish,r.menu_text,r.notes].join(' ').toLowerCase().includes(q));};
function renderList(){const open=new Set([...document.querySelectorAll('.food-record[open]')].map(e=>e.dataset.id)),list=filtered();$('food-count').textContent=`${list.length}곳`;$('food-list').innerHTML=list.length?list.map((r,i)=>`<details class="food-record${r.id===selected?' is-selected':''}" data-id="${esc(r.id)}" ${open.has(r.id)?'open':''}><summary><span class="food-record-number">${String(i+1).padStart(2,'0')}</span><div><strong class="food-record-name">${esc(r.name)}</strong><div class="food-record-brief"><span>${esc(r.address.split(' ').slice(0,2).join(' '))}</span>${r.dish?`<span>${esc(r.dish)}</span>`:''}${!hasRestaurantPosition(r)?'<span class="food-position-pending">지도 위치 확인 전</span>':''}<span>${r.visit_state==='visited'?'다녀온 곳':'저장한 곳'}</span>${r.visited_on?`<span>${esc(r.visited_on)}</span>`:''}</div></div></summary><div class="food-record-body"><p>${safeBlogURL(r.blog_url)?`<a href="${esc(safeBlogURL(r.blog_url))}" data-open-blog="${esc(r.id)}">${esc(r.address)}</a>`:esc(r.address)}</p>${safeBlogURL(r.blog_url)?`<p class="food-blog-address"><a href="${esc(safeBlogURL(r.blog_url))}" data-open-blog="${esc(r.id)}">블로그 · ${esc(r.blog_url)}</a></p>`:''}${r.price?`<p>${esc(r.dish)} · ${esc(r.price)}</p>`:''}${r.menu_text?`<h3>메뉴판 정보</h3><p>${esc(r.menu_text)}</p>`:''}${r.photos?.length?`<h3>메뉴판 사진</h3><div class="food-menu-photos">${r.photos.filter(photoURL).map((p,n)=>`<button type="button" data-photo="${esc(p)}" aria-label="${esc(r.name)} 메뉴판 ${n+1} 확대"><img src="${esc(photoURL(p))}" alt="${esc(r.name)} 메뉴판 ${n+1}" loading="lazy"></button>`).join('')}</div>`:''}${r.notes?`<h3>후기·메모</h3><p>${esc(r.notes)}</p>`:''}<div class="food-detail-actions"><a href="https://map.naver.com/p/search/${encodeURIComponent(r.name+' '+r.address)}" target="_blank" rel="noopener noreferrer">네이버 지도 ↗</a>${r.source_url&&/^https:\/\//.test(r.source_url)?`<a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">기본 정보 출처 ↗</a>`:''}${token?`<button data-edit="${esc(r.id)}">수정</button><button data-delete="${esc(r.id)}">삭제</button>`:''}</div></div></details>`).join(''):'<p class="food-empty">검색 조건에 맞는 맛집이 없어요. 새로운 곳을 기록해 보세요.</p>';map?.setRows(list,selected);}
function selectRecord(id){selected=id;renderList();const record=[...document.querySelectorAll('.food-record')].find(e=>e.dataset.id===id);if(record){record.open=true;record.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});}}
function saveCache(){try{localStorage.setItem(cacheKey,JSON.stringify(rows));}catch{}}
async function refresh(){if(refreshing||saving)return;refreshing=true;$('food-refresh').disabled=true;try{rows=await store.list();saveCache();renderList();$('food-status').textContent=rows.length?'':'첫 맛집을 등록해 보세요.';$('food-status').classList.remove('is-error');}catch(e){$('food-status').textContent=(rows.length?'저장된 기록을 표시하고 있어요. ':'')+e.message;$('food-status').classList.add('is-error');}finally{refreshing=false;$('food-refresh').disabled=false;}}
$('food-search').oninput=renderList;$('food-filter').onchange=renderList;$('food-refresh').onclick=refresh;
$('food-list').onclick=async e=>{const blog=e.target.closest('[data-open-blog]');if(blog){e.preventDefault();openBlog(rows.find(r=>r.id===blog.dataset.openBlog));return;}const p=e.target.closest('[data-photo]'),edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(p)openPhoto(photoURL(p.dataset.photo));if(edit)openEditor(rows.find(r=>r.id===edit.dataset.edit));if(del){const r=rows.find(r=>r.id===del.dataset.delete);if(confirm(`「${r.name}」 기록을 삭제할까요?`)){try{await store.remove(r.id,r.revision);rows=rows.filter(x=>x.id!==r.id);saveCache();renderList();}catch(error){$('food-status').textContent=error.message;$('food-status').classList.add('is-error');}}}};
function openBlog(row){
 const url=safeBlogURL(row?.blog_url);if(!url)return;
 $('food-blog-title').textContent=row.name+' · 블로그';$('food-blog-original').href=url;
 const frame=document.createElement('iframe');frame.title=row.name+' 블로그 내용';frame.referrerPolicy='no-referrer';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups');frame.src=url;
 $('food-blog-frame').replaceChildren(frame);$('food-blog-dialog').showModal();
}
$('food-blog-close').onclick=()=>$('food-blog-dialog').close();
$('food-blog-dialog').addEventListener('close',()=>{$('food-blog-frame').replaceChildren();$('food-blog-original').removeAttribute('href');});
function openEditor(row=null){
 editing=row?structuredClone(row):{id:crypto.randomUUID(),lat:null,lon:null,photos:[]};$('food-form').reset();$('food-editor-title').textContent=row?'맛집 기록 수정':'맛집 등록';
 for(const [key,id] of Object.entries({name:'food-name',address:'food-address',blog_url:'food-blog-url'}))$(id).value=row?.[key]||'';
 $('food-form-error').textContent='';dirty=false;$('food-editor').showModal();$('food-name').focus();
}
function closeEditor(){if(saving)return;if(dirty&&!confirm('입력 중인 내용을 닫을까요? 아직 저장하지 않은 내용은 사라집니다.'))return;$('food-editor').close();editing=null;dirty=false;}
$('food-create').onclick=()=>openEditor();$('food-close').onclick=$('food-cancel').onclick=closeEditor;$('food-editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});$('food-form').oninput=()=>dirty=true;
const positions=new Map();
$('food-form').onsubmit=async e=>{
 e.preventDefault();if(saving)return;
 const payload={...editing,name:$('food-name').value.trim(),address:$('food-address').value.trim(),blog_url:$('food-blog-url').value.trim()};
 // Validate text before any network lookup. Retain all existing menu/photo fields on edits.
 payload.lat=null;payload.lon=null;
 try{restaurantPayload(payload);}catch(error){$('food-form-error').textContent=error.message;return;}
 saving=true;const controls=[...$('food-form').elements];controls.forEach(n=>n.disabled=true);$('food-form-error').textContent='';
 try{
  let position=editing.address?.trim()===payload.address&&hasRestaurantPosition(editing)?{lat:editing.lat,lon:editing.lon}:positions.get(payload.address);
  if(!position){$('food-save').textContent='주소 확인 중…';position=await locateRestaurant(payload.address);if(position)positions.set(payload.address,position);}
  Object.assign(payload,position||{lat:null,lon:null});$('food-save').textContent='저장 중…';
  const saved=await store.save(payload,editing.revision??null);rows=[saved,...rows.filter(r=>r.id!==saved.id)];selected=saved.id;saveCache();dirty=false;$('food-editor').close();renderList();
  const detail=[...document.querySelectorAll('.food-record')].find(d=>d.dataset.id===saved.id);if(detail)detail.open=true;
  $('food-status').textContent=hasRestaurantPosition(saved)?'기록을 저장했어요.':'기록을 저장했어요. 주소 위치를 찾지 못해 지도 표시 전 목록에 보관했습니다.';$('food-status').classList.remove('is-error');
 }catch(error){$('food-form-error').textContent=error.name==='AbortError'?'저장 응답이 늦어지고 있어요. 입력은 유지되니 다시 저장해 주세요.':error.message;}
 finally{saving=false;controls.forEach(n=>n.disabled=false);$('food-save').textContent='저장';}
};
function openPhoto(url){if(!url)return;photoScale=1;$('food-photo-large').src=url;$('food-photo-large').style.width='100%';$('food-photo-original').href=url;$('food-photo-dialog').showModal();}
$('food-photo-close').onclick=()=>$('food-photo-dialog').close();$('food-photo-plus').onclick=()=>{photoScale=Math.min(4,photoScale+.5);$('food-photo-large').style.width=photoScale*100+'%';};$('food-photo-minus').onclick=()=>{photoScale=Math.max(1,photoScale-.5);$('food-photo-large').style.width=photoScale*100+'%';};
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'[]');if(Array.isArray(cached))rows=cached;}catch{}
renderList();refresh();management.init();
fetch('assets/korea-food-map.json?v=food3').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{paths=data;regions=new FoodRegions({paths,onSelect:selectRecord});map=new FoodMap({paths,onSelect:selectRecord,onRegion:name=>regions.open(name)});regions.attach(map);renderList();}).catch(()=>{$('food-map-empty').hidden=false;$('food-map-empty').textContent='지도를 불러오지 못했어요. 아래 목록에서 기록을 확인할 수 있어요.';});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('food-editor').open)refresh();});setInterval(()=>{if(!document.hidden&&!$('food-editor').open)refresh();},60000);

}
