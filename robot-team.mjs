import {STAGES} from './robot-core.mjs?v=robot9';
import {overallScore,preservesAbilities} from './robot-learning.mjs?v=robot9';
export class RobotTeam {
 constructor(factory=()=>new Worker(new URL('./robot-worker.mjs?v=robot9',import.meta.url),{type:'module'})){this.factory=factory;this.lanes=[];this.generation=0;this.model=null;this.settings={};this.running=false;}
 emit(data){this.onmessage?.({data});}
 terminate(){this.generation++;for(const l of this.lanes)l.worker.terminate();this.lanes=[];}
 counts(){const completed=this.lanes.reduce((n,l)=>n+l.completed,0),taskAttempts={...this.base.taskAttempts};if(this.running||this.job)taskAttempts[this.focus]+=completed;this.model.attempts=this.base.attempts+completed;this.model.taskAttempts=taskAttempts;return completed;}
 launch(data,training=false){this.terminate();this.initData=data;this.running=training;this.job=training;this.cancelled=false;this.focus=data.focus||data.stage;this.target=data.target||0;this.started=Date.now();this.base=structuredClone(data.saved);const generation=this.generation,count=Math.max(1,Math.min(10,data.robotCount||1));
  for(let i=0;i<count;i++){const lane={worker:this.factory(),completed:0,ready:false,done:false,preview:null,target:Math.floor(this.target/count)+(i<this.target%count?1:0)};this.lanes.push(lane);lane.worker.onerror=()=>{if(generation!==this.generation)return;this.postMessage({type:'stop'});this.emit({type:'error',message:'로봇 학습 스레드 오류입니다. 완료한 기록은 유지됩니다.'});};lane.worker.onmessage=({data:message})=>{if(generation!==this.generation)return;this.receive(lane,message,training);};lane.worker.postMessage({...this.settings,type:'settings'});lane.worker.postMessage({...data,type:'init',seed:Date.now()+i*104729});}
 }
 receive(lane,data,training){
  if(data.type==='error'){this.emit(data);this.postMessage({type:'stop'});return;}
  if(data.type==='model'){
   if(!training){if(lane===this.lanes[0]){this.model=data.model;this.emit(data);}return;}
   const next=data.model;
   if(overallScore(next.abilities)>overallScore(this.model.abilities)+1e-7&&preservesAbilities(this.model.abilities,next.abilities)){const current=this.model;this.model={...structuredClone(next),id:this.base.id,policyVersion:current.policyVersion+1,history:current.history,modelAttempt:this.base.attempts+this.lanes.reduce((n,l)=>n+l.completed,0)};}
   const completed=this.counts();if(completed){const score=overallScore(this.model.abilities);const row={attempts:this.model.attempts,task:this.focus,overall:score,candidate:overallScore(next.abilities),accepted:false};if(this.model.history.at(-1)?.attempts===row.attempts)this.model.history[this.model.history.length-1]=row;else this.model.history.push(row);this.model.history=this.model.history.slice(-120);this.model.revision++;this.emit({type:'model',model:structuredClone(this.model)});}return;
  }
  if(data.type==='ready'){lane.ready=true;if(training){if(this.cancelled||!lane.target)this.finish(lane);else lane.worker.postMessage({type:'train',count:lane.target,focus:this.focus,internalTeam:true});}else if(this.lanes.every(l=>l.ready))this.emit({type:'ready'});return;}
  if(data.type==='preview'){lane.preview=data;this.emit({...data,attempts:this.model?.attempts||data.attempts,scenes:this.lanes.map(l=>l.preview?.scene||null),team:this.lanes.length});return;}
  if(data.type==='progress'){lane.completed=data.completed;const completed=this.counts();this.emit({...data,completed,target:this.target,attempts:this.model.attempts,taskAttempts:{...this.model.taskAttempts},remainingMs:(Date.now()-this.started)/Math.max(1,completed)*(this.target-completed)});return;}
  if(data.type==='done'){this.finish(lane);}
 }
 finish(lane){lane.done=true;if(!this.lanes.every(l=>l.done))return;const completed=this.counts();this.running=false;this.job=false;this.model.updatedAt=new Date().toISOString();this.emit({type:'model',model:structuredClone(this.model)});this.emit({type:'done',completed,target:this.target,cancelled:this.cancelled});}
 postMessage(data){
  if(data.type==='settings'){this.settings=data;for(const l of this.lanes)l.worker.postMessage(data);return;}
  if(data.type==='init'){this.launch(data);return;}
  if(data.type==='train'){if(this.running||!this.model)return;this.launch({...this.initData,saved:structuredClone(this.model),focus:data.focus,target:data.count},true);this.emit({type:'training',active:true});return;}
  if(data.type==='stop'){this.cancelled=true;for(const l of this.lanes)l.worker.postMessage(data);return;}
  if(data.type==='goal'){this.launch({...this.initData,saved:structuredClone(this.model),stage:data.stage,focus:data.stage});return;}
  for(const l of this.lanes)l.worker.postMessage(data);
 }
}
