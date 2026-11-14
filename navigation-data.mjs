export const DEFAULT_MENUS=[
 {id:'home',parent_id:null,label:'홈',kind:'link',href:'index.html'},
 {id:'calendar',parent_id:null,label:'가족 달력',kind:'link',href:'calendar.html'},
 {id:'restaurants',parent_id:null,label:'맛집 기록',kind:'link',href:'restaurants.html'},
 {id:'career',parent_id:null,label:'커리어',kind:'folder',href:null},
 {id:'experienced-jobs',parent_id:'career',label:'경력직 공고',kind:'folder',href:null},
 {id:'learning',parent_id:null,label:'학습정보',kind:'folder',href:null},
 {id:'ai',parent_id:'learning',label:'AI',kind:'folder',href:null},
 {id:'reinforcement-learning',parent_id:'ai',label:'강화학습',kind:'folder',href:null},
 {id:'simulation',parent_id:'learning',label:'Simulation',kind:'folder',href:null},
 {id:'physicsnemo',parent_id:'simulation',label:'PhysicsNeMo',kind:'folder',href:null},
 {id:'experiments',parent_id:null,label:'강화학습 체험',kind:'folder',href:null},
 {id:'maze',parent_id:'experiments',label:'미로 탐험',kind:'link',href:'maze.html'},
 {id:'cartpole',parent_id:'experiments',label:'카트폴',kind:'link',href:'cartpole.html'},
 {id:'robot',parent_id:'experiments',label:'로봇 강화학습',kind:'link',href:'robot.html'},
 {id:'swing',parent_id:'experiments',label:'그네타기 강화학습',kind:'link',href:'swing.html'}
];
export function safeMenuHref(href){
 if(typeof href!=='string'||/\s/.test(href))return false;
 if(/^[a-zA-Z0-9_-]+\.html(?:[?#][^\s]*)?$/.test(href))return true;
 try{const u=new URL(href);return /^https:\/\//.test(href)&&u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}
}
export function validateMenus(menus){
 if(!Array.isArray(menus)||menus.length>100)throw Error('메뉴는 최대 100개까지 만들 수 있습니다.');
 const ids=new Map();
 for(const menu of menus){
  if(!menu||typeof menu!=='object'||typeof menu.id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(menu.id)||ids.has(menu.id))throw Error('메뉴 ID가 올바르지 않거나 중복되었습니다.');
  if(typeof menu.label!=='string'||!menu.label.trim()||menu.label.length>80)throw Error('메뉴 이름은 1~80자로 입력해 주세요.');
  if(!['folder','link'].includes(menu.kind)||(menu.kind==='link'&&!safeMenuHref(menu.href)))throw Error('페이지 주소는 .html 경로나 https 주소로 입력해 주세요.');
  if(menu.parent_id!==null&&typeof menu.parent_id!=='string')throw Error('상위 메뉴를 선택해 주세요.');
  if(menu.hidden!==undefined&&typeof menu.hidden!=='boolean')throw Error('숨김 설정이 올바르지 않습니다.');
  ids.set(menu.id,menu);
 }
 for(const menu of menus){
  let current=menu,depth=0;const seen=new Set();
  while(current){
   if(seen.has(current.id))throw Error('자기 자신이나 하위 메뉴 안으로 이동할 수 없습니다.');
   if(++depth>8)throw Error('메뉴는 8단계까지 만들 수 있습니다.');
   seen.add(current.id);
   if(current.parent_id===null)break;
   const parent=ids.get(current.parent_id);if(!parent||parent.kind!=='folder')throw Error('상위 메뉴가 없거나 글 메뉴가 아닙니다.');current=parent;
  }
 }
 return menus;
}
export function menuPath(menus,id){const path=[],seen=new Set();let m=menus.find(m=>m.id===id);while(m&&!seen.has(m.id)){seen.add(m.id);path.unshift(m);m=menus.find(p=>p.id===m.parent_id);}return path;}
export function visibleMenus(menus){return menus.filter(m=>!menuPath(menus,m.id).some(p=>p.hidden===true));}
export function descendantIds(menus,id){const ids=new Set([id]);for(let n=0;n<menus.length;n++){let changed=false;for(const m of menus)if(ids.has(m.parent_id)&&!ids.has(m.id)){ids.add(m.id);changed=true;}if(!changed)break;}return ids;}
export function orderedMenus(menus,parent=null,depth=0){return menus.filter(m=>m.parent_id===parent).flatMap(m=>[{...m,depth},...orderedMenus(menus,m.id,depth+1)]);}
export function folderOptions(menus,excluded=new Set()){return orderedMenus(menus).filter(m=>m.kind==='folder'&&!excluded.has(m.id)).map(m=>({id:m.id,label:menuPath(menus,m.id).map(p=>p.label).join(' / ')}));}
export function legacyMenuId(query,menus){
 if(query.has('menu'))return query.get('menu');
 if(query.get('topic')==='PhysicsNeMo')return 'physicsnemo';
 if(query.get('topic')==='강화학습')return 'reinforcement-learning';
 return query.get('category')==='structural'?'simulation':query.get('category')==='ai'?'ai':null;
}
export function postMenuId(post){return post.menu_id||(post.category==='ai'?'reinforcement-learning':'physicsnemo');}
export function locationFields(menus,id){const menu=menus.find(m=>m.id===id);if(!menu||menu.kind!=='folder')throw Error('글을 저장할 메뉴를 선택해 주세요.');return {menu_id:id,category:menuPath(menus,id).some(m=>m.id==='ai')?'ai':'structural',topic:menu.label};}
export function reorderMenu(menus,id,direction){const copy=structuredClone(menus),item=copy.find(m=>m.id===id),siblings=copy.filter(m=>m.parent_id===item.parent_id),index=siblings.findIndex(m=>m.id===id),other=siblings[index+direction];if(!other)return copy;const a=copy.findIndex(m=>m.id===id),b=copy.findIndex(m=>m.id===other.id);[copy[a],copy[b]]=[copy[b],copy[a]];return copy;}
export function removeMenu(menus,id){const item=menus.find(m=>m.id===id);return menus.filter(m=>m.id!==id).map(m=>m.parent_id===id?{...m,parent_id:item.parent_id}:m);}

// Introduce the new experiment to older shared/cached navigation without replacing custom menus.
export function withSwingMenu(menus){
 if(menus.some(m=>m.id==='swing'||m.href==='swing.html'))return menus;
 const robot=menus.find(m=>m.id==='robot'||m.href==='robot.html');
 if(!robot)return menus;
 const next=menus.slice();next.splice(next.indexOf(robot)+1,0,{id:'swing',parent_id:robot.parent_id,label:'그네타기 강화학습',kind:'link',href:'swing.html'});
 return next;
}
