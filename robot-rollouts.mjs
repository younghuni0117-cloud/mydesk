import {episode,VALIDATION_CASES,passedStage} from './robot-core.mjs?v=robot22';
import {COMMAND_CASES} from './robot-goals.mjs?v=robot22';
import {ppoEpisode} from './robot-ppo.mjs?v=robot22';
export const executeTrial=p=>p.algorithm==='ppo'?ppoEpisode(p):episode(p.weights,p.task,p.seed,p.options);
// One extra physics worker at most: the existing learner computes the other trial.
// The learner alone owns sampling, order, counters and all model updates.
export class ParallelRollouts {
 constructor({enabled=(globalThis.navigator?.hardwareConcurrency||1)>=4,factory=()=>new Worker(new URL('./robot-rollout-worker.mjs?v=robot22',import.meta.url),{type:'module'})}={}){
  this.worker=null;this.ready=false;this.pending=null;this.nextId=0;this.waitingReady=new Promise(resolve=>this.resolveReady=resolve);
  if(!enabled){this.resolveReady(false);return;}
  try{this.worker=factory();this.worker.onmessage=({data})=>{if(!this.worker)return;if(data.type==='ready'){this.ready=true;this.resolveReady(true);return;}if(!this.pending||data.id!==this.pending.id)return;const pending=this.pending;this.pending=null;if(data.type==='result')pending.resolve(data.trial);else{this.disable();pending.resolve(executeTrial(pending.prepared));}};this.worker.onerror=event=>{event.preventDefault?.();this.disable();};this.worker.onmessageerror=()=>this.disable();}
  catch{this.disable();}
 }
 async start(){if(!this.worker)return false;let timer;const result=await Promise.race([this.waitingReady,new Promise(resolve=>{timer=setTimeout(()=>{this.disable();resolve(false);},2500);})]);clearTimeout(timer);return result;}
 disable(){this.ready=false;this.worker?.terminate();this.worker=null;this.resolveReady(false);if(this.pending){const pending=this.pending;this.pending=null;pending.resolve(executeTrial(pending.prepared));}}
 run(prepared){if(!this.ready)return Promise.resolve(executeTrial(prepared));if(this.pending)throw Error('동시에 하나의 보조 계산만 실행할 수 있습니다.');return new Promise(resolve=>{this.pending={id:++this.nextId,prepared,resolve};try{this.worker.postMessage({type:'rollout',id:this.nextId,prepared});}catch{this.disable();}});}
 async pair(first,second){const remote=second?this.run(second):null,local=executeTrial(first);return second?[local,await remote]:[local];}
 async ability(weights,stage,environment={},active=()=>true){
  const cases=[];for(let i=0;i<VALIDATION_CASES.length;i+=2){if(!active())return null;const specs=VALIDATION_CASES.slice(i,i+2).map(c=>({weights,task:stage,seed:c.seed,options:{...environment,pushes:c.pushes,disturbances:false,summaryOnly:true}})),trials=await this.pair(...specs);if(!active())return null;for(let j=0;j<trials.length;j++){const c=VALIDATION_CASES[i+j],metrics=trials[j].metrics;cases.push({id:c.id,label:c.label,passed:passedStage(metrics,stage),reward:metrics.reward,metrics});}}
  return {meanReward:cases.reduce((sum,c)=>sum+c.reward,0)/cases.length,passRate:cases.filter(c=>c.passed).length/cases.length,cases};
 }
 async commands(weights,environment={},active=()=>true){let total=0;for(let i=0;i<COMMAND_CASES.length;i+=2){if(!active())return null;const specs=COMMAND_CASES.slice(i,i+2).map(c=>({weights,task:'walk',seed:71,options:{...environment,observationSeconds:8,disturbances:false,pushes:[],command:null,commandSchedule:c.schedule,summaryOnly:true}})),trials=await this.pair(...specs);if(!active())return null;for(const trial of trials)total+=trial.metrics.reward;}return total/COMMAND_CASES.length;}
 close(){this.disable();}
}
