import {recoveryTestStart} from './robot-recovery.mjs?v=update79';
import {groundTestSpec,validationGround} from './robot-training-ground.mjs?v=update79';
import {normalizeRobotCount} from './robot-training-options.mjs?v=update79';
import {taskEnvironment} from './robot-task-settings.mjs?v=update79';
import {normalizeEvaluationSettings} from './robot-evaluation.mjs?v=update79';
import {packRollout} from './robot-transfer.mjs?v=update79';
import {RobotWorld,createRobotWorld,episode,VALIDATION_CASES,passedStage} from './robot-core.mjs?v=update79';
import {COMMAND_CASES} from './robot-goals.mjs?v=update79';
import {ppoEpisode} from './robot-ppo.mjs?v=update79';
export const executeTrial=p=>packRollout(p.algorithm==='ppo'?ppoEpisode(p):episode(p.weights,p.task,p.seed,p.options),p);
// Initial environment checks yield in small physics chunks, so a new terrain
// request can cancel old work instead of waiting for an entire long episode.
export async function inspectTrial(prepared,active=()=>true){const {task,seed,options,weights}=prepared,sim=createRobotWorld(task,{...(task==='balance'?{command:{mode:'hold'}}:{}),seed,...options});while(!sim.done){if(!active())return null;for(let i=0;i<32&&!sim.done;i++)sim.step(weights,false);await new Promise(resolve=>setTimeout(resolve,0));}return {metrics:sim.metrics()};}
// One learner/coordinator computes the first rollout; up to four physics-only
// workers compute the others. Results always return in prepared index order.
export class ParallelRollouts {
 constructor({count=2,enabled=(globalThis.navigator?.hardwareConcurrency||1)>=4,factory=()=>new Worker(new URL('./robot-rollout-worker.mjs?v=update79',import.meta.url),{type:'module'})}={}){
  this.width=enabled?normalizeRobotCount(count):1;this.lanes=[];this.nextId=0;
  for(let i=1;i<this.width;i++){
   const lane={worker:null,ready:false,pending:null};lane.waiting=new Promise(resolve=>lane.resolveReady=resolve);this.lanes.push(lane);
   try{
    lane.worker=factory();lane.worker.onmessage=({data})=>{
     if(!lane.worker)return;
     if(data.type==='ready'){lane.ready=true;lane.resolveReady(true);return;}
     if(!lane.pending||data.id!==lane.pending.id)return;
     if(data.type==='result'){const pending=lane.pending;lane.pending=null;pending.resolve(data.trial);}
     else this.disableLane(lane);
    };
    lane.worker.onerror=event=>{event.preventDefault?.();this.disableLane(lane);};lane.worker.onmessageerror=()=>this.disableLane(lane);
   }catch{this.disableLane(lane);}
  }
 }
 get ready(){return this.lanes.some(l=>l.ready);}
 get concurrency(){return 1+this.lanes.filter(l=>l.ready).length;}
 get worker(){return this.lanes.find(l=>l.worker)?.worker||null;}
 async start(){await Promise.all(this.lanes.map(async lane=>{let timer;await Promise.race([lane.waiting,new Promise(resolve=>{timer=setTimeout(()=>{this.disableLane(lane);resolve(false);},2500);})]);clearTimeout(timer);}));return this.ready;}
 disableLane(lane,discard=false){lane.ready=false;lane.worker?.terminate();lane.worker=null;lane.resolveReady(false);if(lane.pending){const pending=lane.pending;lane.pending=null;try{pending.resolve(discard?null:executeTrial(pending.prepared));}catch(error){pending.reject(error);}}}
 disable(){for(const lane of this.lanes)this.disableLane(lane);}
 run(prepared){
  const lane=this.lanes.find(l=>l.ready&&!l.pending);
  if(!lane)return Promise.resolve(executeTrial(prepared));
  return new Promise((resolve,reject)=>{lane.pending={id:++this.nextId,prepared,resolve,reject};try{lane.worker.postMessage({type:'rollout',id:this.nextId,prepared});}catch{this.disableLane(lane);}});
 }
 async batch(prepared){if(!prepared.length)return [];const remote=[];try{for(const p of prepared.slice(1))remote.push(this.run(p));const first=executeTrial(prepared[0]);return [first,...await Promise.all(remote)];}catch(error){await Promise.allSettled(remote);throw error;}}
 async pair(first,second){return this.batch(second?[first,second]:[first]);}
 async ability(weights,stage,environment={},active=()=>true,validationCases=VALIDATION_CASES,interruptible=false){
  environment=taskEnvironment(environment,stage);const cases=[];
  for(let i=0;i<validationCases.length;i+=this.width){
   if(!active())return null;const group=validationCases.slice(i,i+this.width),specs=group.map((c,j)=>({weights,task:stage,seed:c.seed,options:{...environment,...(stage==='recover'?{recoveryEarlyStopTraining:false,recoveryAssistTraining:false,recoveryStart:recoveryTestStart(i+j,validationCases.length)}:{}),...(environment.terrain==='training'?{trainingSpec:validationGround(c,i+j)}:{}),observationSeconds:c.seconds??normalizeEvaluationSettings(environment).validationSeconds,pushes:c.pushes,disturbances:false,summaryOnly:true}})),trials=interruptible&&this.width===1?[await inspectTrial(specs[0],active)]:await this.batch(specs);
   if(!active()||trials.some(t=>!t))return null;
   for(let j=0;j<trials.length;j++){const c=group[j],metrics=trials[j].metrics;cases.push({id:c.id,label:c.label,passed:passedStage(metrics,stage,c.seconds??normalizeEvaluationSettings(environment).validationSeconds),reward:metrics.reward,metrics});}
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {meanReward:cases.reduce((s,c)=>s+c.reward,0)/cases.length,passRate:cases.filter(c=>c.passed).length/cases.length,cases};
 }
 async commands(weights,environment={},active=()=>true,interruptible=false){
  environment=taskEnvironment(environment,'walk');let total=0;
  for(let i=0;i<COMMAND_CASES.length;i+=this.width){
   if(!active())return null;const specs=COMMAND_CASES.slice(i,i+this.width).map(c=>({weights,task:'walk',seed:71,options:{...environment,observationSeconds:normalizeEvaluationSettings(environment).validationSeconds,disturbances:false,pushes:[],command:null,commandSchedule:c.schedule,summaryOnly:true}})),trials=interruptible&&this.width===1?[await inspectTrial(specs[0],active)]:await this.batch(specs);
   if(!active()||trials.some(t=>!t))return null;for(const trial of trials)total+=trial.metrics.reward;await new Promise(resolve=>setTimeout(resolve,0));
  }
  return total/COMMAND_CASES.length;
 }
 close(){for(const lane of this.lanes)this.disableLane(lane,true);}
}
