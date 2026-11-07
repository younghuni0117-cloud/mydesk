import {normalizeCommand,trainingCommands} from './robot-goals.mjs?v=robot23';
import {PPOOptimizer,ppoEpisode} from './robot-ppo.mjs?v=robot23';
import {REWARD_VERSION} from './robot-rewards.mjs?v=robot23';
import {POLICY_KIND,extendV3Weights} from './robot-policy.mjs?v=robot23';
import {episode,POLICY_SIZE,STAGES,VALIDATION_CASES,evaluateAbility,evaluateAbilities,evaluateCommands,clamp,seeded,normalizePushSettings,passedStage} from './robot-core.mjs?v=robot23';
export const MODEL_VERSION=5;
export const ALLOWED_ATTEMPTS=[100,200,500,1000,2000,5000,10000,100000];
const stages=Object.keys(STAGES),gaussian=r=>Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r());
const vector=a=>Array.isArray(a)&&a.length===POLICY_SIZE&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<20);
export const overallScore=abilities=>stages.reduce((sum,s)=>sum+Math.tanh(abilities[s].meanReward/40),0)*20;
export const modelScore=model=>overallScore(model.abilities)+20*Math.tanh((model.goalReward||0)/40);
export function migrateModel(raw){
 if(RobotLearner.valid(raw))return raw;
 if(raw?.version===5&&raw.rewardVersion===2){const next={...structuredClone(raw),rewardVersion:REWARD_VERSION,pending:[],cohortStart:raw.attempts,validationBank:null};if(next.ppo)next.ppo.buffer=[];return RobotLearner.valid(next)?next:null;}
 if(raw?.version===3&&raw.physicsVersion===3&&raw.policyKind==='direct-torque-mlp-v1'){const extended={...raw,version:4,policyKind:POLICY_KIND,goalReward:0};for(const k of ['weights','mean','spread'])extended[k]=extendV3Weights(raw[k],k==='spread');raw=extended;}
 if(raw?.version!==4||raw.physicsVersion!==3||raw.policyKind!==POLICY_KIND)return null;
 const searchSeed=Number.isSafeInteger(raw.searchSeed)?raw.searchSeed:[...String(raw.id)].reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0)|0,42)>>>0;
 const next={...raw,version:5,searchSeed,rewardVersion:REWARD_VERSION,algorithm:'cem',algorithmAttempts:{cem:raw.attempts,ppo:0},ppo:null,focus:'balance',pending:[],cohortStart:raw.attempts,curriculum:Object.fromEntries(stages.map(s=>[s,.15])),history:Array.isArray(raw.history)?raw.history.map(r=>({...r,rewardVersion:1})):raw.history};
 return RobotLearner.valid(next)?next:null;
}
export const preservesAbility=(previous,next)=>previous.cases.every((c,i)=>!c.passed||next.cases[i].passed)&&((previous.passRate??previous.cases.filter(c=>c.passed).length/previous.cases.length)<.5||next.meanReward>=previous.meanReward-Math.max(2,Math.abs(previous.meanReward)*.05));
export function preservesAbilities(previous,next){return stages.every(s=>preservesAbility(previous[s],next[s]));}

export function compactHistory(rows){if(rows.length<=160)return rows;const keep=new Set([0,...rows.map((_,i)=>i).slice(-40)]);for(const task of stages){const indices=rows.flatMap((r,i)=>r.task===task?[i]:[]);if(indices.length)keep.add(indices[0]);for(const i of indices.slice(-12))keep.add(i);}const rest=rows.map((_,i)=>i).filter(i=>!keep.has(i)),budget=Math.max(0,120-keep.size);for(let i=0;i<Math.min(budget,rest.length);i++)keep.add(rest[Math.floor(i*rest.length/Math.min(budget,rest.length))]);return [...keep].sort((a,b)=>a-b).map(i=>rows[i]);}
export class RobotLearner {
 constructor(saved=null,seed=Date.now(),environment={}){
  saved=migrateModel(saved);this.environment=environment;this.searchSeed=seed>>>0;
  this.random=seeded(seed);this.id=globalThis.crypto?.randomUUID?.()||`robot-${Date.now()}-${seed}`;
  this.weights=Array(POLICY_SIZE).fill(0);this.mean=[...this.weights];this.spread=Array(POLICY_SIZE).fill(.3);
  this.validationBank=null;this.lastFullValidationAttempt=0;this.algorithm='ppo';this.algorithmAttempts={cem:0,ppo:0};this.ppo=null;this.cohortStart=0;this.curriculum=Object.fromEntries(stages.map(s=>[s,.15]));this.trainingCurriculum=true;this.attempts=0;this.taskAttempts=Object.fromEntries(stages.map(s=>[s,0]));this.modelAttempt=0;this.revision=0;this.policyVersion=0;this.history=[];this.pending=[];this.focus='balance';
  if(RobotLearner.valid(saved))for(const k of ['id','weights','mean','spread','attempts','taskAttempts','modelAttempt','revision','policyVersion','history','algorithm','algorithmAttempts','ppo','pending','focus','cohortStart','curriculum','searchSeed'])this[k]=structuredClone(saved[k]);

  if(saved?.validationBank&&vector(saved.validationBank.weights)&&stages.includes(saved.validationBank.task)&&Number.isFinite(saved.validationBank.ability?.meanReward)&&saved.validationBank.ability?.cases?.length===4)this.validationBank=structuredClone(saved.validationBank);
  if(Number.isSafeInteger(saved?.lastFullValidationAttempt)&&saved.lastFullValidationAttempt>=0&&saved.lastFullValidationAttempt<=this.attempts)this.lastFullValidationAttempt=saved.lastFullValidationAttempt;
  this.environmentChanged=!!saved&&JSON.stringify(saved.environment||{})!==JSON.stringify(environment);if(this.environmentChanged){this.validationBank=null;this.pending=[];this.cohortStart=this.attempts;}
  this.abilities=evaluateAbilities(this.weights,this.environment);this.goalReward=evaluateCommands(this.weights,this.environment);this.bestReward=modelScore(this);
  if(!this.history.length||this.environmentChanged||this.history.at(-1)?.rewardVersion!==REWARD_VERSION||!this.history.some(r=>r.rewards&&r.taskAttempts)){this.record(this.bestReward,false);this.history.at(-1).baseline=true;}
 }
 static valid(s){
  return s&&s.version===5&&Number.isSafeInteger(s.searchSeed)&&s.searchSeed>=0&&s.searchSeed<=4294967295&&s.rewardVersion===REWARD_VERSION&&['cem','ppo'].includes(s.algorithm)&&s.algorithmAttempts&&Number.isSafeInteger(s.algorithmAttempts.cem)&&s.algorithmAttempts.cem>=0&&Number.isSafeInteger(s.algorithmAttempts.ppo)&&s.algorithmAttempts.ppo>=0&&s.algorithmAttempts.cem+s.algorithmAttempts.ppo===s.attempts&&(!s.ppo||PPOOptimizer.valid(s.ppo))&&stages.includes(s.focus)&&s.curriculum&&stages.every(k=>Number.isFinite(s.curriculum[k])&&s.curriculum[k]>=.1&&s.curriculum[k]<=1)&&Array.isArray(s.pending)&&s.pending.length<=12&&s.pending.every(r=>r&&vector(r.weights)&&Number.isFinite(r.score)&&stages.includes(r.task))&&Number.isSafeInteger(s.cohortStart)&&s.cohortStart>=0&&s.cohortStart<=s.attempts&&s.physicsVersion===3&&s.policyKind===POLICY_KIND&&Number.isFinite(s.goalReward)&&Math.abs(s.goalReward)<1e6&&typeof s.id==='string'&&s.id.length<150&&['weights','mean','spread'].every(k=>vector(s[k]))&&['mean','spread'].every(k=>s[k].length===s.weights.length)&&s.spread.every(v=>v>=.03&&v<5)
   &&Number.isSafeInteger(s.attempts)&&s.attempts>=0&&s.attempts<1e12&&Number.isSafeInteger(s.modelAttempt)&&s.modelAttempt>=0&&s.modelAttempt<=s.attempts
   &&['revision','policyVersion'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&s.taskAttempts&&stages.every(k=>Number.isSafeInteger(s.taskAttempts[k])&&s.taskAttempts[k]>=0)&&stages.reduce((sum,k)=>sum+s.taskAttempts[k],0)===s.attempts
   &&s.abilities&&stages.every(k=>s.abilities[k]&&Number.isFinite(s.abilities[k].meanReward)&&Math.abs(s.abilities[k].meanReward)<1e6&&Number.isFinite(s.abilities[k].passRate)&&s.abilities[k].passRate>=0&&s.abilities[k].passRate<=1&&Array.isArray(s.abilities[k].cases)&&s.abilities[k].cases.length===4&&s.abilities[k].cases.every((c,i)=>c.id===VALIDATION_CASES[i].id&&typeof c.passed==='boolean'))
   &&Array.isArray(s.history)&&s.history.length<=200&&s.history.every(r=>r&&Number.isSafeInteger(r.attempts)&&r.attempts>=0&&r.attempts<=s.attempts&&(!r.taskAttempts||(stages.every(k=>Number.isSafeInteger(r.taskAttempts[k])&&r.taskAttempts[k]>=0&&r.taskAttempts[k]<=s.taskAttempts[k])&&stages.reduce((sum,k)=>sum+r.taskAttempts[k],0)===r.attempts))&&Number.isFinite(r.overall)&&Math.abs(r.overall)<=121&&Number.isFinite(r.candidate)&&Math.abs(r.candidate)<=121&&(!r.rewards||stages.every(s=>Number.isFinite(r.rewards[s])&&Math.abs(r.rewards[s])<1e6))&&(!r.candidateRewards||stages.every(s=>Number.isFinite(r.candidateRewards[s])&&Math.abs(r.candidateRewards[s])<1e6))&&(!r.partialCandidateRewards||(r.validationComplete===false&&Object.keys(r.partialCandidateRewards).every(s=>stages.includes(s)&&Number.isFinite(r.partialCandidateRewards[s])&&Math.abs(r.partialCandidateRewards[s])<1e6))));
 }
 record(candidate,accepted,candidateAbilities=this.abilities,validationComplete=true){const row={attempts:this.attempts,taskAttempts:{...this.taskAttempts},task:this.focus,rewardVersion:REWARD_VERSION,environment:JSON.stringify(this.environment),overall:this.bestReward,candidate,accepted,validationComplete,rewards:Object.fromEntries(stages.map(s=>[s,this.abilities[s].meanReward])),candidateRewards:validationComplete?Object.fromEntries(Object.entries(candidateAbilities).map(([s,a])=>[s,a.meanReward])):undefined,partialCandidateRewards:validationComplete?undefined:Object.fromEntries(Object.entries(candidateAbilities).map(([s,a])=>[s,a.meanReward]))};if(this.history.at(-1)?.attempts===this.attempts&&this.history.at(-1)?.rewardVersion===REWARD_VERSION&&this.history.at(-1)?.environment===JSON.stringify(this.environment))this.history[this.history.length-1]=row;else this.history.push(row);this.history=compactHistory(this.history);}
 setFocus(stage){if(STAGES[stage]&&stage!==this.focus){if(this.algorithm==='ppo'&&this.ppo?.buffer.length){const optimizer=new PPOOptimizer(this.weights,this.searchSeed,this.ppo);optimizer.update(this.random);this.ppo=optimizer.snapshot();}this.validationBank=null;this.focus=stage;this.pending=[];this.cohortStart=this.attempts;}}
 get batchSize(){return this.algorithm==='ppo'?4:12;}
 setAlgorithm(algorithm){const next=algorithm==='ppo'?'ppo':'cem';if(next!==this.algorithm){if(this.algorithm==='ppo'&&this.ppo?.buffer.length){const optimizer=new PPOOptimizer(this.weights,this.searchSeed,this.ppo);optimizer.update(this.random);this.ppo=optimizer.snapshot();}this.pending=[];this.cohortStart=this.attempts;this.validationBank=null;this.algorithm=next;}if(next==='ppo'&&!this.ppo)this.ppo=new PPOOptimizer(this.weights,this.searchSeed).snapshot();}
 setCurriculum(enabled){this.trainingCurriculum=enabled!==false;}
 setTrainingPushSettings(settings){this.trainingPush=normalizePushSettings(settings);}
 setTrainingCommand(command){this.trainingCommand=command?normalizeCommand(command):null;}
 prepareTrial({record=false}={},offset=0){
  const slot=this.pending.length+offset;if(slot===0)this.cohortStart=this.attempts;
  let weights;
  if(this.algorithm==='ppo'){if(!this.ppo)this.ppo=new PPOOptimizer(this.weights,this.searchSeed).snapshot();weights=[...this.ppo.actor];}
  else if(slot===0)weights=[...this.mean];else if(slot===1)weights=[...this.weights];else{const pair=Math.floor((slot-2)/2),random=seeded((this.cohortStart*7919+pair*104729+314159+this.searchSeed)>>>0),direction=this.mean.map(()=>gaussian(random)),sign=slot%2===0?1:-1;weights=this.mean.map((m,i)=>clamp(m+sign*this.spread[i]*direction[i],-4,4));}
  const task=this.focus,index=this.attempts+offset,seed=(0x2468ace0+this.searchSeed+Math.imul(this.cohortStart,2654435761))>>>0,batch=Math.floor(this.cohortStart/12),schedule=this.trainingCurriculum&&Math.max(this.abilities[task].passRate,this.abilities.balance.passRate)<.5?[]:trainingCommands(task,batch);if((!this.trainingCurriculum||Math.max(this.abilities[task].passRate,this.abilities.balance.passRate)>=.5)&&batch%6===5&&this.trainingCommand)schedule.splice(0,schedule.length,{time:0,command:this.trainingCommand});
  const push=normalizePushSettings(this.trainingPush),level=this.trainingCurriculum?this.curriculum[task]:1;push.pushMax=push.pushMin+(push.pushMax-push.pushMin)*level;
  return {weights,task,index,seed,record,algorithm:this.algorithm,critic:this.algorithm==='ppo'?[...this.ppo.critic]:undefined,logStd:this.algorithm==='ppo'?[...this.ppo.logStd]:undefined,noiseSeed:(100003+index+this.searchSeed)>>>0,options:{...this.environment,...push,spawnRange:.025+(this.trainingCurriculum ? .075*level : 0),disturbances:true,commandSchedule:schedule,record,summaryOnly:!record}};
 }
 completeTrial(prepared,trial){
  if(prepared.index!==this.attempts)throw Error('학습 결과의 순서가 일치하지 않습니다.');
  const {weights,task,seed,record}=prepared,result=trial.metrics;this.attempts++;this.taskAttempts[task]++;this.algorithmAttempts[this.algorithm]++;this.pending.push({weights,score:result.reward,task});if(this.algorithm==='ppo')this.ppo.buffer.push(...trial.experience);

  return {attempts:this.attempts,task,score:result.reward,weights,seed,pushPlan:trial.pushPlan,commandSchedule:trial.commandSchedule,pushes:result.pushes,spawnRange:prepared.options.spawnRange,scene:record?trial:null};
 }
 trainOne(options={}){const prepared=this.prepareTrial(options);return this.completeTrial(prepared,prepared.algorithm==='ppo'?ppoEpisode(prepared):episode(prepared.weights,prepared.task,prepared.seed,prepared.options));}

 adopt(weights,abilities,goalReward=evaluateCommands(weights,this.environment)){
  const score=modelScore({abilities,goalReward}),accepted=score>this.bestReward+1e-7&&preservesAbilities(this.abilities,abilities);
  if(accepted){this.weights=[...weights];this.abilities=abilities;this.goalReward=goalReward;this.bestReward=score;this.modelAttempt=this.attempts;this.policyVersion++;for(const task of stages)this.curriculum[task]=Math.max(this.curriculum[task],.15+.85*abilities[task].passRate);}
  this.revision++;this.record(score,accepted,abilities);return accepted;
 }
 updateDistribution(){if(this.algorithm==='ppo'){this.pending=[];this.cohortStart=this.attempts;return;}if(this.pending.length<this.batchSize)return;const elite=[...this.pending].sort((a,b)=>b.score-a.score).slice(0,4);for(let i=0;i<POLICY_SIZE;i++){const m=elite.reduce((sum,c)=>sum+c.weights[i],0)/elite.length;this.mean[i]=.2*this.mean[i]+.8*m;this.spread[i]=clamp(.65*this.spread[i]+.35*Math.sqrt(elite.reduce((sum,c)=>sum+(c.weights[i]-m)**2,0)/elite.length)*1.2,.04,.6);}this.pending=[];this.cohortStart=this.attempts;}
 candidate(){if(this.algorithm==='ppo'){const optimizer=new PPOOptimizer(this.weights,this.searchSeed,this.ppo);optimizer.update(this.random);this.ppo=optimizer.snapshot();return {weights:[...this.ppo.actor]};}return this.pending.reduce((a,b)=>a.score>=b.score?a:b);}

 async checkpointAsync(yieldControl=async()=>{},active=()=>true,validation=null,force=false){
  if(!this.pending.length&&!this.validationBank)return null;
  const winner=this.pending.length?this.candidate():null;
  const full=force||this.attempts-this.lastFullValidationAttempt>=36;
  if(winner&&(this.algorithm!=='ppo'||this.ppo.updates%3===0||force)&&!winner.weights.every((w,i)=>w===this.weights[i])){
   if(!active())return null;
   const ability=validation?await validation.ability(winner.weights,this.focus,this.environment,active):evaluateAbility(winner.weights,this.focus,this.environment);await yieldControl();if(!active()||!ability)return null;
   this.revision++;this.record(this.bestReward,false,{[this.focus]:ability},false);
   if(preservesAbility(this.abilities[this.focus],ability)&&(!this.validationBank||ability.meanReward>this.validationBank.ability.meanReward))this.validationBank={weights:[...winner.weights],task:this.focus,ability};
  }
  if(this.pending.length)this.updateDistribution();
  if(!full||!this.validationBank)return false;
  const bank=this.validationBank,abilities={[bank.task]:bank.ability};
  for(const task of stages.filter(s=>s!==bank.task)){if(!active())return null;abilities[task]=validation?await validation.ability(bank.weights,task,this.environment,active):evaluateAbility(bank.weights,task,this.environment);await yieldControl();if(!active()||!abilities[task])return null;if(!preservesAbility(this.abilities[task],abilities[task])){this.validationBank=null;this.lastFullValidationAttempt=this.attempts;this.revision++;this.record(this.bestReward,false,abilities,false);return false;}}
  const goalReward=validation?await validation.commands(bank.weights,this.environment,active):evaluateCommands(bank.weights,this.environment);if(!active()||goalReward===null)return null;
  this.validationBank=null;this.lastFullValidationAttempt=this.attempts;return this.adopt(bank.weights,abilities,goalReward);
 }
 checkpoint(){if(!this.pending.length)return;const winner=this.candidate();this.adopt(winner.weights,evaluateAbilities(winner.weights,this.environment));this.updateDistribution();}
 snapshot(){return {validationBank:structuredClone(this.validationBank),lastFullValidationAttempt:this.lastFullValidationAttempt,version:5,searchSeed:this.searchSeed,rewardVersion:REWARD_VERSION,algorithm:this.algorithm,algorithmAttempts:{...this.algorithmAttempts},ppo:this.ppo?structuredClone(this.ppo):null,pending:structuredClone(this.pending),focus:this.focus,cohortStart:this.cohortStart,curriculum:{...this.curriculum},goalReward:this.goalReward,physicsVersion:3,policyKind:POLICY_KIND,environment:{...this.environment},id:this.id,weights:[...this.weights],mean:[...this.mean],spread:[...this.spread],attempts:this.attempts,taskAttempts:{...this.taskAttempts},modelAttempt:this.modelAttempt,revision:this.revision,policyVersion:this.policyVersion,abilities:structuredClone(this.abilities),history:structuredClone(this.history),updatedAt:new Date().toISOString()};}
}
