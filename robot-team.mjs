// A single coordinator owns the learner. Extra workers only collect physics
// rollouts; there are no independent models or winner-picking between robots.
export class RobotTeam {
 constructor(factory=()=>new Worker(new URL('./robot-worker.mjs?v=update84',import.meta.url),{type:'module'})){
  this.factory=factory;this.lanes=[];this.generation=0;this.settings={};this.model=null;this.running=false;
 }
 emit(data){this.onmessage?.({data});}
 terminate(){this.generation++;for(const lane of this.lanes)lane.worker.terminate();this.lanes=[];this.running=false;}
 postMessage(data){
  if(data.type==='settings'){this.settings=data;this.lanes[0]?.worker.postMessage(data);return;}
  if(data.type==='init'){
   const generation=++this.generation,lane=this.lanes[0]||{worker:this.factory(),ready:false};lane.ready=false;this.running=false;this.lanes=[lane];
   lane.worker.onmessage=({data:message})=>{
    if(generation!==this.generation||(message.generation!==undefined&&message.generation!==generation))return;
    if(message.type==='model')this.model=message.model;
    if(message.type==='ready')lane.ready=true;
    if(message.type==='training')this.running=message.active;
    if(message.type==='done'||message.type==='error')this.running=false;
    this.emit(message);
   };
   lane.worker.onerror=()=>{if(generation!==this.generation)return;this.running=false;this.emit({type:'error',message:'로봇 학습 스레드 오류입니다. 완료한 기록은 유지됩니다.'});};
   lane.worker.postMessage({...this.settings,type:'settings'});lane.worker.postMessage({...data,generation});return;
  }
  const lane=this.lanes[0];if(!lane)return;
  if(data.type==='train'){if(this.running||!lane.ready||!this.model)return;this.running=true;this.emit({type:'training',active:true});}
  lane.worker.postMessage(data);
 }
}
