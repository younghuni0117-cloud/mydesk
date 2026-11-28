export const COLORS=['yellow','pink','blue','green','purple'];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const validKey=k=>typeof k==='string'&&/^[A-Za-z0-9_-]{43}$/.test(k);
export function newKey(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function boardPoint(client,rect,view){return {x:(client.x-rect.left-view.x)/view.z,y:(client.y-rect.top-view.y)/view.z};}
export function zoomAt(view,z,point){z=clamp(z,.35,2.5);return {x:point.x-(point.x-view.x)*z/view.z,y:point.y-(point.y-view.y)*z/view.z,z};}
export function place(notes,origin){let x=origin.x,y=origin.y;for(let i=0;i<40;i++){if(!notes.some(n=>n.status==='active'&&Math.abs(n.x-x)<35&&Math.abs(n.y-y)<35))break;x+=28;y+=24;}return {x:clamp(x,-10000,10000),y:clamp(y,-10000,10000)};}
export function newNote(notes,origin,now=new Date().toISOString()) {return {id:crypto.randomUUID(),text:'',color:'yellow',createdAt:now,updatedAt:now,...place(notes,origin),width:230,height:220,rotation:(Math.random()-.5)*3,z:Math.max(0,...notes.map(n=>n.z))+1,status:'active'};}
export function validNote(n){return !!n&&typeof n.id==='string'&&/^[-a-zA-Z0-9_]{1,80}$/.test(n.id)&&typeof n.text==='string'&&n.text.length<=10000&&COLORS.includes(n.color)&&['active','archived','trashed'].includes(n.status)&&Number.isFinite(Date.parse(n.createdAt))&&Number.isFinite(Date.parse(n.updatedAt))&&['x','y'].every(k=>Number.isFinite(n[k])&&Math.abs(n[k])<=10000)&&Number.isFinite(n.width)&&n.width>=160&&n.width<=600&&Number.isFinite(n.height)&&n.height>=140&&n.height<=700&&Number.isFinite(n.rotation)&&Math.abs(n.rotation)<=5&&Number.isSafeInteger(n.z)&&n.z>=0&&n.z<=1000000000;}
export function changeStatus(note,status){if(!['active','archived','trashed'].includes(status))throw Error('메모 상태 오류');return {...note,status,updatedAt:new Date().toISOString()};}
export function createdDate(note){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(note.createdAt)).replace(/\s/g,'').replace(/\.$/,'');}
