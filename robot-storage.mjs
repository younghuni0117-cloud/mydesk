// Stable model storage with independent IndexedDB backup. URL query strings are
// deliberately absent from every key. Invalid records never become a fresh model.
export const ROBOT_STORAGE_KEY='mydesk.robot.v5';
const KEYS=[ROBOT_STORAGE_KEY,'mydesk.robot.backup.v5','mydesk.robot.v4','mydesk.robot.backup.v4','mydesk.robot.v3','mydesk.robot.backup.v3'];
export class RobotStorage{
 constructor(migrate){this.migrate=migrate;this.blocked=false;this.records=[];this.force=false;this.database=null;this.id=null;this.warning='';this.readFailed=false;this.writeQueue=Promise.resolve();this.generation=0;}
 read(key){try{return localStorage.getItem(key);}catch{this.readFailed=true;this.warning='브라우저 저장소에 접근할 수 없습니다. 모델 파일을 저장하세요.';return null;}}
 decode(raw){try{return this.migrate(JSON.parse(raw)?.model);}catch{return null;}}
 async db(){if(this.database)return this.database;try{if(!globalThis.indexedDB)return null;}catch{return null;}return new Promise(resolve=>{let done=false;const finish=value=>{if(done){value?.close();return;}done=true;clearTimeout(timer);if(value)this.database=value;resolve(value);},timer=setTimeout(()=>finish(null),1200);try{const request=indexedDB.open('mydesk.robot.local',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('models'))request.result.createObjectStore('models');};request.onsuccess=()=>finish(request.result);request.onerror=()=>finish(null);request.onblocked=()=>finish(null);}catch{finish(null);}});}
 async getDB(key){const db=await this.db();if(!db)return null;return new Promise(resolve=>{try{const r=db.transaction('models').objectStore('models').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null);}catch{resolve(null);}});}
 async putDB(key,value){const db=await this.db();if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction('models','readwrite');tx.objectStore('models').put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}catch{resolve(false);}});}
 async load(){
  const local=KEYS.map(key=>({key,raw:this.read(key)})).filter(r=>r.raw);const backup=await this.getDB('primary'),previous=await this.getDB('previous');this.records=[...local,...[{key:'indexedDB.primary',raw:backup},{key:'indexedDB.previous',raw:previous}].filter(r=>r.raw)];
  const primary=local.find(r=>r.key===ROBOT_STORAGE_KEY),decoded=primary&&this.decode(primary.raw);let chosen=decoded?{...primary,model:decoded}:null;
  {let candidates=this.records.map(r=>({...r,model:this.decode(r.raw)})).filter(r=>r.model&&(!decoded||r.model.id===decoded.id));const current=candidates.filter(r=>{try{return JSON.parse(r.raw).model.version===5;}catch{return false;}});if(current.length)candidates=current;else if(!decoded&&this.records.some(r=>r.key.includes('.v5')||r.key.startsWith('indexedDB.')))candidates=[];candidates.sort((a,b)=>b.model.attempts-a.model.attempts||b.model.policyVersion-a.model.policyVersion||b.model.revision-a.model.revision);chosen=candidates[0]||chosen;}
  this.blocked=(!chosen&&(this.records.length>0||this.readFailed))||!!(primary&&!decoded&&chosen?.model.attempts===0);this.id=chosen?.model.id||null;
  const original=local.find(r=>['mydesk.robot.v4','mydesk.robot.v3'].includes(r.key));if(original){try{if(!this.read('mydesk.robot.archive.original'))localStorage.setItem('mydesk.robot.archive.original',original.raw);}catch{}if(!await this.getDB('original'))await this.putDB('original',original.raw);}
  const archiveRaw=this.read('mydesk.robot.archive.original')||await this.getDB('original');let archive=null;try{archive=JSON.parse(archiveRaw)?.model||null;}catch{}
  if(primary&&!decoded&&chosen){const protectedRaw=primary.raw;this.force=true;try{localStorage.setItem('mydesk.robot.protected.original',protectedRaw);}catch{if(!await this.putDB('protected',protectedRaw)){this.blocked=true;this.warning='원본 기록을 보관할 공간이 부족합니다. 기록을 파일로 저장한 뒤 복구하세요.';}}}
  return {model:chosen?.model||null,archive,blocked:this.blocked,recovered:!!chosen&&chosen.key!==ROBOT_STORAGE_KEY,warning:this.warning};
 }
 save(model){if(!model)return Promise.resolve({ok:false});const snapshot=structuredClone(model),generation=this.generation,force=this.force;this.force=false;const result=this.writeQueue.then(()=>generation===this.generation?this.write(snapshot,force):{ok:false,superseded:true});this.writeQueue=result.catch(()=>({ok:false}));return result;}
 async write(model,force=false){
  if(!model||this.blocked||!this.migrate(model))return {ok:false,blocked:this.blocked};const raw=JSON.stringify({model}),old=this.read(ROBOT_STORAGE_KEY),current=this.decode(old);
  if(!force&&current&&(current.id!==model.id||current.attempts>model.attempts||(current.attempts===model.attempts&&current.policyVersion>model.policyVersion)))return {ok:false,conflict:true};
  if(old&&!current&&!force)return {ok:false,blocked:true};
  let localOK=false;try{if(old&&old!==raw&&current)localStorage.setItem('mydesk.robot.backup.v5',old);}catch{}try{localStorage.setItem(ROBOT_STORAGE_KEY,raw);localOK=true;}catch{}
  this.id=model.id;const oldBackup=await this.getDB('primary');if(oldBackup&&oldBackup!==raw)await this.putDB('previous',oldBackup);const backupOK=await this.putDB('primary',raw);return {ok:localOK||backupOK,localOK,backupOK};
 }
 async authorizeReplacement(){const raw=this.read(ROBOT_STORAGE_KEY);if(raw&&!this.decode(raw)){let kept=false;try{localStorage.setItem('mydesk.robot.protected.original',raw);kept=true;}catch{}if(!kept&&!await this.putDB('protected',raw))throw Error('원본을 보관할 수 없어 덮어쓰지 않았습니다. 원본을 파일로 먼저 저장하세요.');}this.generation++;this.blocked=false;this.force=true;}
 async clear(){this.generation++;await this.writeQueue;this.blocked=false;this.force=true;try{const keys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('mydesk.robot.')&&!['mydesk.robot.options','mydesk.robot.skin'].includes(key))keys.push(key);}for(const key of keys)localStorage.removeItem(key);}catch{throw Error('저장소에 접근할 수 없어 초기화하지 못했습니다.');}const db=await this.db();if(db)await new Promise((resolve,reject)=>{const tx=db.transaction('models','readwrite');tx.objectStore('models').clear();tx.oncomplete=resolve;tx.onerror=reject;tx.onabort=reject;});this.records=[];}
}
