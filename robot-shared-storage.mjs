import {mergeTravelRecord} from './robot-study.mjs?v=update74';
import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs?v=update74';

export const ROBOT_CACHE_KEY='mydesk.robot.v10';
const CACHE_KEY=ROBOT_CACHE_KEY,MAX_BYTES=8*1024*1024;
class InvalidSharedModel extends Error {}

// One public row, last completed write wins. Local storage is only the current
// working cache: no account, archive, revision history or recovery copies.
export class RobotSharedStorage {
 constructor(migrate,{fetcher=globalThis.fetch?.bind(globalThis),url=SHARED_MODEL_URL,key=SHARED_MODEL_KEY,local=globalThis.localStorage,indexed=globalThis.indexedDB}={}){
  Object.assign(this,{migrate,fetcher,url,key,local,indexed});this.revision=null;this.needsSeed=false;this.pendingModel=null;this.cachedModel=null;this.state='connecting';this.writeQueue=Promise.resolve();this.lastUpload=0;this.lastRead=0;this.busy=0;
 }
 setState(state){this.state=state;this.onstate?.(state);}
 decode(model){try{return this.migrate(model)||null;}catch{return null;}}
 cache(model,pending=!!this.pendingModel){this.cachedModel=model;try{this.local?.setItem(CACHE_KEY,JSON.stringify({model,pending}));}catch{} }
 async request(query,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const response=await this.fetcher(this.url+query,{cache:'no-store',credentials:'omit',...options,headers:{apikey:this.key,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:controller.signal});if(!response.ok)throw Error('공용 저장 서버 응답 오류 ('+response.status+')');const raw=await response.text();if(raw.length>MAX_BYTES*2)throw Error('공용 모델 크기가 너무 큽니다.');return raw?JSON.parse(raw):[];}finally{clearTimeout(timer);}
 }
 accept(row){const model=this.decode(row?.model);if(!model)throw new InvalidSharedModel('공용 모델 형식을 읽을 수 없습니다.');this.revision=String(row.revision);this.needsSeed=false;this.lastRead=Date.now();this.setState('synced');return model;}
 async read(){const rows=await this.request('?id=eq.main&select=model,revision&limit=1');if(!rows.length){this.needsSeed=true;this.setState('empty');return null;}return this.accept(rows[0]);}
 async discardRetiredData(){
  // Only robot learning data is retired. Display preferences and other apps
  // remain untouched. Old caches must never upload into the new model.
  try{const keys=[];for(let i=0;i<this.local?.length;i++){const key=this.local.key(i);if(key?.startsWith('mydesk.robot.')&&![CACHE_KEY,'mydesk.robot.options','mydesk.robot.skin'].includes(key))keys.push(key);}for(const key of keys)this.local.removeItem(key);}catch{}
  if(!this.indexed)return;
  await new Promise(resolve=>{const timer=setTimeout(resolve,1200);try{const request=this.indexed.deleteDatabase('mydesk.robot.local');request.onsuccess=request.onerror=request.onblocked=()=>{clearTimeout(timer);resolve();};}catch{clearTimeout(timer);resolve();}});
 }
 async load(){
  await this.discardRetiredData();
  let pending=false;try{const saved=JSON.parse(this.local?.getItem(CACHE_KEY)||'null'),model=this.decode(saved?.model);if(model){this.cachedModel=model;pending=saved.pending===true;}else if(saved)this.local?.removeItem(CACHE_KEY);}catch{}
  if(pending)this.pendingModel=structuredClone(this.cachedModel);
  try{if(this.pendingModel){const result=await this.publish(this.pendingModel,{force:true});if(!result.ok)throw result.error;}const localModel=this.cachedModel,model=await this.read();if(model){if(localModel?.id===model.id)model.travelRecord=mergeTravelRecord(model.travelRecord,localModel.travelRecord);this.cache(model,false);return {model,blocked:false,source:'shared'};}return {model:this.cachedModel,blocked:false,source:'local'};}
  catch(error){this.setState(error instanceof InvalidSharedModel?'invalid':'offline');return {model:this.cachedModel,blocked:error instanceof InvalidSharedModel,source:'local',error};}
 }
 async save(model){if(!this.decode(model))return {ok:false};this.cache(model);return {ok:true};}
 async seed(model){
  if(!this.needsSeed)return {ok:true,model};this.busy++;this.setState('saving');
  try{const rows=await this.request('?on_conflict=id&select=model,revision',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({id:'main',model})});const shared=rows.length?this.accept(rows[0]):await this.read();if(!shared)throw Error('공용 모델을 저장하지 못했습니다.');this.cache(shared);return {ok:true,model:shared};}
  catch(error){this.setState('offline');return {ok:false,error};}finally{this.busy--;}
 }
 publish(model,{force=false}={}){
  if(!this.decode(model))return Promise.resolve({ok:false,error:Error('유효한 모델만 공유할 수 있습니다.')});
  if(!force&&Date.now()-this.lastUpload<30000)return Promise.resolve({ok:true,skipped:true});
  this.lastUpload=Date.now();const snapshot=structuredClone(model);this.pendingModel=snapshot;this.cache(model,true);this.busy++;
  const operation=this.writeQueue.then(async()=>{this.setState('saving');try{const rows=await this.request('?on_conflict=id&select=revision',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:'main',model:snapshot})});if(!rows.length)throw Error('공용 모델을 저장하지 못했습니다.');this.revision=String(rows[0].revision);this.needsSeed=false;if(this.pendingModel===snapshot)this.pendingModel=null;this.cache(this.cachedModel||snapshot,!!this.pendingModel);this.setState('synced');return {ok:true};}catch(error){this.setState('offline');return {ok:false,error};}finally{this.busy--;}});
  this.writeQueue=operation;return operation;
 }
 async refresh(force=false){
  if(this.busy||this.pendingModel)return {changed:false};
  if(!force){const rows=await this.request('?id=eq.main&select=revision&limit=1');if(rows.length&&String(rows[0].revision)===this.revision){this.setState('synced');return {changed:false};}}
  const previous=this.revision,model=await this.read();if(!model)return {changed:false};this.cache(model,false);return {changed:previous!==this.revision,model};
 }
 async retry(){if(this.pendingModel)return this.publish(this.pendingModel,{force:true});if(this.needsSeed&&this.cachedModel?.attempts>0)return this.seed(this.cachedModel);return {ok:true};}
}
