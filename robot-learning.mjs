import {normalizeBalanceTraining,endBalanceTrialEarly} from './robot-training-options.mjs?v=robot49';
import {readTravelRecord,nextTravelRecord} from './robot-study.mjs?v=robot49';
import {normalizeEvaluationSettings,monitorCases} from './robot-evaluation.mjs?v=robot49';
import {compareAbilities} from './robot-performance.mjs?v=robot49';
import {normalizeCommand,trainingCommands} from './robot-goals.mjs?v=robot49';
import {PPOOptimizer,ppoEpisode,upgradePPO} from './robot-ppo.mjs?v=robot49';
import {REWARD_VERSION,REWARDS} from './robot-rewards.mjs?v=robot49';
import {POLICY_KIND,extendV3Weights,initialPolicy,upgradePolicyWeights,POLICY_BODY_INPUTS,POLICY_HIDDEN,POLICY_OUTPUTS,OUTPUT_START,BIAS_START,FEEDBACK_START,SENSOR_WEIGHT_OFFSET} from './robot-policy.mjs?v=robot49';
import {episode,POLICY_SIZE,STAGES,JOINTS,LOCKED_DISTAL_JOINTS,VALIDATION_CASES,evaluateAbility,evaluateAbilities,evaluateCommands,clamp,seeded,normalizePushSettings,passedStage} from './robot-core.mjs?v=robot49';
export const MODEL_VERSION=7;
export const ALLOWED_ATTEMPTS=[100,200,500,1000,2000,5000,10000,100000];
const stages=Object.keys(STAGES),gaussian=r=>Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r());
const vector=a=>Array.isArray(a)&&a.length===POLICY_SIZE&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<20);
const abilityRecord=(a,n)=>a&&Number.isFinite(a.meanReward)&&Math.abs(a.meanReward)<1e6&&Number.isFinite(a.passRate)&&a.passRate>=0&&a.passRate<=1&&Array.isArray(a.cases)&&a.cases.length===n&&a.cases.every(c=>c&&typeof c.passed==='boolean'&&(!c.metrics||['time','upright'].every(k=>Number.isFinite(c.metrics[k]))));
export const overallScore=abilities=>stages.reduce((sum,s)=>sum+Math.tanh(abilities[s].meanReward/40),0)*20;
export const modelScore=model=>overallScore(model.abilities)+20*Math.tanh((model.goalReward||0)/40);
export function migrateModel(raw){
 if(RobotLearner.valid(raw))return raw;
 if(!RobotLearner.valid(raw,true))return null;
 const next=structuredClone(raw);
 // Torque outputs and angle targets have different meanings. Preserve the
 // previous controller verbatim, never reinterpret its weights or experience.
 next.controllerArchive={model:structuredClone(raw)};
 Object.assign(next,{version:MODEL_VERSION,physicsVersion:6,policyKind:POLICY_KIND,
  weights:Array(POLICY_SIZE).fill(0),mean:initialPolicy(raw.searchSeed),spread:Array(POLICY_SIZE).fill(.3),
  ppo:null,pending:[],searchArchive:null,validationBank:null,generalization:null,
  searchState:{lastResetAttempt:raw.attempts,restarts:0},cohortStart:raw.attempts,
  lastFullValidationAttempt:0,modelAttempt:raw.attempts,policyVersion:raw.policyVersion+1,revision:raw.revision+1,
  curriculum:Object.fromEntries(stages.map(s=>[s,.15])),goalReward:0,
  abilities:Object.fromEntries(stages.map(s=>[s,{...raw.abilities[s],meanReward:0,passRate:0,cases:raw.abilities[s].cases.map(c=>({id:c.id,label:c.label,passed:false}))}]))});
 return RobotLearner.valid(next)?next:null;
}
export const preservesAbility=(previous,next)=>previous.cases.every((c,i)=>(!c.passed||next.cases[i].passed)&&(c.metrics?.terminationReason!=='duration'||next.cases[i].metrics?.terminationReason==='duration'))&&((previous.passRate??previous.cases.filter(c=>c.passed).length/previous.cases.length)<.5||next.meanReward>=previous.meanReward-Math.max(2,Math.abs(previous.meanReward)*.05));
export function preservesAbilities(previous,next){return stages.every(s=>preservesAbility(previous[s],next[s]));}

export function compactHistory(rows){if(rows.length<=160)return rows;const keep=new Set([0,...rows.map((_,i)=>i).slice(-40)]);for(const task of stages){const indices=rows.flatMap((r,i)=>r.task===task?[i]:[]);if(indices.length)keep.add(indices[0]);for(const i of indices.slice(-12))keep.add(i);}const rest=rows.map((_,i)=>i).filter(i=>!keep.has(i)),budget=Math.max(0,120-keep.size);for(let i=0;i<Math.min(budget,rest.length);i++)keep.add(rest[Math.floor(i*rest.length/Math.min(budget,rest.length))]);return [...keep].sort((a,b)=>a-b).map(i=>rows[i]);}
export class RobotLearner {
 constructor(saved=null,seed=Date.now(),environment={}){
  saved=migrateModel(saved);this.environment=environment={...environment,controlKind:POLICY_KIND};this.searchSeed=seed>>>0;
  this.random=seeded(seed);this.id=globalThis.crypto?.randomUUID?.()||`robot-${Date.now()}-${seed}`;
  this.weights=Array(POLICY_SIZE).fill(0);this.mean=initialPolicy(this.searchSeed);this.spread=Array(POLICY_SIZE).fill(.3);
  this.validationBank=null;this.generalization=null;this.searchArchive=null;this.searchState={lastResetAttempt:saved?.attempts||0,restarts:0};this.lastFullValidationAttempt=0;this.algorithm='ppo';this.algorithmAttempts={cem:0,ppo:0};this.ppo=null;this.cohortStart=0;this.curriculum=Object.fromEntries(stages.map(s=>[s,.15]));this.trainingCurriculum=true;this.attempts=0;this.taskAttempts=Object.fromEntries(stages.map(s=>[s,0]));this.modelAttempt=0;this.revision=0;this.policyVersion=0;this.history=[];this.pending=[];this.focus='balance';
  if(RobotLearner.valid(saved))for(const k of ['id','weights','mean','spread','attempts','taskAttempts','modelAttempt','revision','policyVersion','history','algorithm','algorithmAttempts','ppo','pending','focus','cohortStart','curriculum','searchSeed'])this[k]=structuredClone(saved[k]);

  this.controllerArchive=saved?.controllerArchive?structuredClone(saved.controllerArchive):null;
  this.trainingBalance=normalizeBalanceTraining(saved?.trainingBalance);
  this.travelRecord=readTravelRecord(saved?.travelRecord);
  if(saved?.searchState&&Number.isSafeInteger(saved.searchState.lastResetAttempt)&&saved.searchState.lastResetAttempt<=this.attempts&&Number.isSafeInteger(saved.searchState.restarts))this.searchState=structuredClone(saved.searchState);
  if(saved?.searchArchive)this.searchArchive=structuredClone(saved.searchArchive);if(saved?.generalization)this.generalization=structuredClone(saved.generalization);
  if(saved?.validationBank&&vector(saved.validationBank.weights)&&stages.includes(saved.validationBank.task)&&Number.isFinite(saved.validationBank.ability?.meanReward)&&saved.validationBank.ability?.cases?.length===4)this.validationBank=structuredClone(saved.validationBank);
  if(Number.isSafeInteger(saved?.lastFullValidationAttempt)&&saved.lastFullValidationAttempt>=0&&saved.lastFullValidationAttempt<=this.attempts)this.lastFullValidationAttempt=saved.lastFullValidationAttempt;
  if(this.mean.slice(0,BIAS_START).every(v=>v===0)){const tail=this.mean.slice(BIAS_START);this.mean=initialPolicy(this.searchSeed);this.mean.splice(BIAS_START,tail.length,...tail);}
  const visionChanged=!!saved&&saved.environment?.visionVersion!==environment.visionVersion,locksChanged=!!saved&&saved.environment?.distalLocked!==environment.distalLocked;if(visionChanged||locksChanged){if(this.ppo)this.ppo.buffer=[];if(this.searchArchive?.ppo)this.searchArchive.ppo.buffer=[];}
  this.environmentChanged=!!saved&&JSON.stringify(saved.environment||{})!==JSON.stringify(environment);if(this.environmentChanged){this.generalization=null;this.validationBank=null;this.pending=[];this.cohortStart=this.attempts;}
  this.abilities=evaluateAbilities(this.weights,this.environment);this.goalReward=evaluateCommands(this.weights,this.environment);this.bestReward=modelScore(this);
  if(!this.history.length||this.environmentChanged||this.history.at(-1)?.rewardVersion!==REWARD_VERSION||!this.history.some(r=>r.rewards&&r.taskAttempts)){this.record(this.bestReward,false);this.history.at(-1).baseline=true;}
 }
 static valid(s,legacy=false){
  return s&&(legacy?!s.controllerArchive:(!s.controllerArchive||RobotLearner.valid(s.controllerArchive.model,true)))&&(!s.searchState||(Number.isSafeInteger(s.searchState.lastResetAttempt)&&s.searchState.lastResetAttempt>=0&&s.searchState.lastResetAttempt<=s.attempts&&Number.isSafeInteger(s.searchState.restarts)&&s.searchState.restarts>=0&&['lastPPOReset','ppoRestarts'].every(k=>s.searchState[k]===undefined||(Number.isSafeInteger(s.searchState[k])&&s.searchState[k]>=0))))&&(!s.validationBank||(stages.includes(s.validationBank.task)&&vector(s.validationBank.weights)&&abilityRecord(s.validationBank.ability,4)))&&(!s.generalization||(stages.includes(s.generalization.task)&&s.generalization.rewardVersion===REWARD_VERSION&&Number.isSafeInteger(s.generalization.attempts)&&s.generalization.attempts<=s.attempts&&abilityRecord(s.generalization.ability,2)))&&(!s.searchArchive||((!s.searchArchive.ppo||PPOOptimizer.valid(s.searchArchive.ppo))&&(!s.searchArchive.cem||[s.searchArchive.cem.mean,s.searchArchive.cem.spread].every(vector))))&&s.version===(legacy?6:MODEL_VERSION)&&Number.isSafeInteger(s.searchSeed)&&s.searchSeed>=0&&s.searchSeed<=4294967295&&s.rewardVersion===REWARD_VERSION&&['cem','ppo'].includes(s.algorithm)&&s.algorithmAttempts&&Number.isSafeInteger(s.algorithmAttempts.cem)&&s.algorithmAttempts.cem>=0&&Number.isSafeInteger(s.algorithmAttempts.ppo)&&s.algorithmAttempts.ppo>=0&&s.algorithmAttempts.cem+s.algorithmAttempts.ppo===s.attempts&&(!s.ppo||PPOOptimizer.valid(s.ppo))&&stages.includes(s.focus)&&s.curriculum&&stages.every(k=>Number.isFinite(s.curriculum[k])&&s.curriculum[k]>=.1&&s.curriculum[k]<=1)&&Array.isArray(s.pending)&&s.pending.length<=32&&s.pending.every(r=>r&&vector(r.weights)&&Number.isFinite(r.score)&&stages.includes(r.task))&&Number.isSafeInteger(s.cohortStart)&&s.cohortStart>=0&&s.cohortStart<=s.attempts&&s.physicsVersion===(legacy?5:6)&&s.policyKind===(legacy?'direct-torque-12joint-mlp-v6':POLICY_KIND)&&Number.isFinite(s.goalReward)&&Math.abs(s.goalReward)<1e6&&typeof s.id==='string'&&s.id.length<150&&['weights','mean','spread'].every(k=>vector(s[k]))&&['mean','spread'].every(k=>s[k].length===s.weights.length)&&s.spread.every(v=>v>=.03&&v<5)
   &&Number.isSafeInteger(s.attempts)&&s.attempts>=0&&s.attempts<1e12&&Number.isSafeInteger(s.modelAttempt)&&s.modelAttempt>=0&&s.modelAttempt<=s.attempts
   &&['revision','policyVersion'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&s.taskAttempts&&stages.every(k=>Number.isSafeInteger(s.taskAttempts[k])&&s.taskAttempts[k]>=0)&&stages.reduce((sum,k)=>sum+s.taskAttempts[k],0)===s.attempts
   &&s.abilities&&stages.every(k=>s.abilities[k]&&Number.isFinite(s.abilities[k].meanReward)&&Math.abs(s.abilities[k].meanReward)<1e6&&Number.isFinite(s.abilities[k].passRate)&&s.abilities[k].passRate>=0&&s.abilities[k].passRate<=1&&Array.isArray(s.abilities[k].cases)&&s.abilities[k].cases.length===4&&s.abilities[k].cases.every((c,i)=>c.id===VALIDATION_CASES[i].id&&typeof c.passed==='boolean'))
   &&Array.isArray(s.history)&&s.history.length<=200&&s.history.every(r=>r&&Number.isSafeInteger(r.attempts)&&r.attempts>=0&&r.attempts<=s.attempts&&(!r.taskAttempts||(stages.every(k=>Number.isSafeInteger(r.taskAttempts[k])&&r.taskAttempts[k]>=0&&r.taskAttempts[k]<=s.taskAttempts[k])&&stages.reduce((sum,k)=>sum+r.taskAttempts[k],0)===r.attempts))&&Number.isFinite(r.overall)&&Math.abs(r.overall)<=121&&Number.isFinite(r.candidate)&&Math.abs(r.candidate)<=121&&(!r.rewards||stages.every(s=>Number.isFinite(r.rewards[s])&&Math.abs(r.rewards[s])<1e6))&&(!r.candidateRewards||stages.every(s=>Number.isFinite(r.candidateRewards[s])&&Math.abs(r.candidateRewards[s])<1e6))&&(!r.partialCandidateRewards||(r.validationComplete===false&&Object.keys(r.partialCandidateRewards).every(s=>stages.includes(s)&&Number.isFinite(r.partialCandidateRewards[s])&&Math.abs(r.partialCandidateRewards[s])<1e6))));
 }
 record(candidate,accepted,candidateAbilities=this.abilities,validationComplete=true){const row={attempts:this.attempts,taskAttempts:{...this.taskAttempts},task:this.focus,rewardVersion:REWARD_VERSION,environment:JSON.stringify(this.environment),overall:this.bestReward,candidate,accepted,validationComplete,rewards:Object.fromEntries(stages.map(s=>[s,this.abilities[s].meanReward])),candidateRewards:validationComplete?Object.fromEntries(Object.entries(candidateAbilities).map(([s,a])=>[s,a.meanReward])):undefined,partialCandidateRewards:validationComplete?undefined:Object.fromEntries(Object.entries(candidateAbilities).map(([s,a])=>[s,a.meanReward]))};if(this.history.at(-1)?.attempts===this.attempts&&this.history.at(-1)?.rewardVersion===REWARD_VERSION&&this.history.at(-1)?.environment===JSON.stringify(this.environment))this.history[this.history.length-1]=row;else this.history.push(row);this.history=compactHistory(this.history);}
 setFocus(stage){if(STAGES[stage]&&stage!==this.focus){if(this.algorithm==='ppo'&&this.ppo?.buffer.length){const optimizer=new PPOOptimizer(this.weights,this.searchSeed,this.ppo);optimizer.update(this.random);this.ppo=optimizer.snapshot();}this.validationBank=null;this.searchState.lastResetAttempt=this.attempts;this.focus=stage;this.pending=[];this.cohortStart=this.attempts;}}
 get batchSize(){if(this.algorithm!=='ppo')return 32;const hz=['walk','run'].includes(this.focus)?10:20;return Math.max(1,Math.min(8,Math.floor(3840/(this.trainingBalance.trainingSeconds*hz))));}
 setAlgorithm(algorithm){const next=algorithm==='ppo'?'ppo':'cem',changed=next!==this.algorithm;
  if(changed){if(this.algorithm==='ppo'&&this.ppo?.buffer.length){const optimizer=new PPOOptimizer(this.weights,this.searchSeed,this.ppo);optimizer.update(this.random);this.ppo=optimizer.snapshot();}this.pending=[];this.cohortStart=this.attempts;this.validationBank=null;this.algorithm=next;this.searchState.lastResetAttempt=this.attempts;}
  if(next==='ppo'&&!this.ppo)this.ppo=new PPOOptimizer(this.weights,this.searchSeed).snapshot();
  else if(changed){const weights=next==='ppo'?this.ppo.actor:this.mean,ability=evaluateAbility(weights,this.focus,this.environment);
   if(compareAbilities(ability,this.abilities[this.focus],this.focus)<0||!preservesAbility(this.abilities[this.focus],ability)){
    this.searchArchive={...(this.searchArchive||{}),[next]:next==='ppo'?structuredClone(this.ppo):{mean:[...this.mean],spread:[...this.spread]},at:this.attempts};
    if(next==='ppo')this.ppo=new PPOOptimizer(this.weights,this.searchSeed).snapshot();else{this.mean=[...this.weights];this.spread=this.spread.map(v=>clamp(v,.06,.2));}
   }
  }
 }
 recoverPPOSearch(ability){if(this.algorithm!=='ppo'||!this.ppo||(compareAbilities(ability,this.abilities[this.focus],this.focus)>=0&&preservesAbility(this.abilities[this.focus],ability))||this.attempts-Math.max(this.modelAttempt,this.searchState.lastPPOReset??0)<2048)return false;
  const previous=this.ppo;this.searchArchive={...(this.searchArchive||{}),ppo:structuredClone(previous),at:this.attempts};const optimizer=new PPOOptimizer(this.weights,this.searchSeed);optimizer.critic=[...previous.critic];optimizer.criticAdam=structuredClone(previous.criticAdam);optimizer.updates=previous.updates;const restarts=this.searchState.ppoRestarts||0;optimizer.logStd.fill(Math.log([.1,.14,.18][restarts%3]));this.ppo=optimizer.snapshot();this.searchState.ppoRestarts=restarts+1;this.searchState.lastPPOReset=this.attempts;return true;
 }
 balanceHorizon(){const m=this.abilities.balance.cases[0]?.metrics,t=m?.longestUpright??0;return Math.min(this.trainingBalance.trainingSeconds,t<1.5?2:t<3.5?4:this.trainingBalance.trainingSeconds);}
 setBalanceTrainingSettings(raw){const settings=normalizeBalanceTraining(raw);if(this.algorithm==='cem'&&JSON.stringify(settings)!==JSON.stringify(this.trainingBalance)){this.pending=[];this.cohortStart=this.attempts;}if(this.algorithm==='ppo'&&this.ppo?.buffer.length>255){const optimizer=new PPOOptimizer(this.weights,this.searchSeed,this.ppo);optimizer.update(this.random);this.ppo=optimizer.snapshot();this.pending=[];this.cohortStart=this.attempts;}this.trainingBalance=settings;}
 setCurriculum(enabled){this.trainingCurriculum=enabled!==false;}
 setTrainingPushSettings(settings){this.trainingPush=normalizePushSettings(settings);}
 setTrainingCommand(command){this.trainingCommand=command?normalizeCommand(command):null;}
 prepareTrial({record=false}={},offset=0){
  const horizon=this.balanceHorizon(),fullHorizon=this.trainingBalance.trainingSeconds;
  const trialSlot=this.pending.length+offset,slot=this.algorithm==='cem'&&this.focus==='balance'?Math.floor(trialSlot/2):trialSlot;if(trialSlot===0)this.cohortStart=this.attempts;
  let weights;
  if(this.algorithm==='ppo'){if(!this.ppo)this.ppo=new PPOOptimizer(this.weights,this.searchSeed).snapshot();weights=[...this.ppo.actor];}
  else if(slot===0)weights=[...this.mean];else if(slot===1)weights=[...this.weights];else{const pair=Math.floor((slot-2)/2),random=seeded((this.cohortStart*7919+pair*104729+314159+this.searchSeed)>>>0),movable=JOINTS.map((_,i)=>i).filter(i=>this.environment.distalLocked===false||!LOCKED_DISTAL_JOINTS.includes(JOINTS[i])),joint=movable[(Math.floor(this.cohortStart/32)+this.searchSeed+pair*5)%movable.length],hidden=(Math.floor(this.cohortStart/32)+pair)%12,sign=slot%2===0?1:-1;
   weights=this.mean.map((m,i)=>{const noise=gaussian(random),broad=['walk','run'].includes(this.focus)&&pair%5===4,neural=(this.focus!=='balance'||horizon===fullHorizon)&&pair%4===3,selected=broad?i>=BIAS_START&&i<FEEDBACK_START:neural?(i<POLICY_BODY_INPUTS*12&&Math.floor(i/POLICY_BODY_INPUTS)===hidden)||(i>=POLICY_BODY_INPUTS*12&&i<OUTPUT_START&&i-POLICY_BODY_INPUTS*12===hidden)||(i>=OUTPUT_START&&i<BIAS_START&&(i-OUTPUT_START)%12===hidden)||(i>=SENSOR_WEIGHT_OFFSET&&Math.floor((i-SENSOR_WEIGHT_OFFSET)/26)===hidden):pair%3===0?i>=BIAS_START&&i<FEEDBACK_START:pair%3===1?(i>=FEEDBACK_START+joint*6&&i<FEEDBACK_START+(joint+1)*6)||i===BIAS_START+joint:i>=FEEDBACK_START&&i<SENSOR_WEIGHT_OFFSET&&(i-FEEDBACK_START)%6===hidden%6,scale=broad?.7:pair%3===0?.4:pair%3===1?.4:.3;return clamp(m+(selected&&(i>=BIAS_START||this.focus!=='balance'||horizon>2)?sign*this.spread[i]*noise*scale:0),-4,4);});}

  const task=this.focus,index=this.attempts+offset,seed=(0x2468ace0+this.searchSeed+Math.imul(this.cohortStart,2654435761))>>>0,batch=Math.floor(this.cohortStart/32),schedule=this.trainingCurriculum&&Math.max(this.abilities[task].passRate,this.abilities.balance.passRate)<.5?[]:trainingCommands(task,batch);if((!this.trainingCurriculum||Math.max(this.abilities[task].passRate,this.abilities.balance.passRate)>=.5)&&batch%6===5&&this.trainingCommand)schedule.splice(0,schedule.length,{time:0,command:this.trainingCommand});
  if(task==='balance')schedule.splice(0,schedule.length,{time:0,command:{mode:'hold'}});
  const push=normalizePushSettings(this.trainingPush),level=this.trainingCurriculum?this.curriculum[task]:1;push.pushMax=push.pushMin+(push.pushMax-push.pushMin)*level;if(task==='balance'&&this.trainingCurriculum&&horizon<fullHorizon)push.autoPush=false;
  return {weights,task,index,seed,record,group:slot,reference:this.algorithm==='cem'&&slot===1,algorithm:this.algorithm,critic:this.algorithm==='ppo'?[...this.ppo.critic]:undefined,logStd:this.algorithm==='ppo'?[...this.ppo.logStd]:undefined,noiseSeed:(100003+index+this.searchSeed)>>>0,options:{...this.environment,...push,terrainVariant:task==='balance'&&horizon<fullHorizon?0:(batch+this.searchSeed)%4,...(task==='balance'?{spawnTilt:(index%2?1:-1)*(this.trainingCurriculum?(horizon===2?.004:horizon===4?.008:.018):.025)}:{}),observationSeconds:task==='balance'&&this.trainingCurriculum?horizon:fullHorizon,spawnRange:.025+(this.trainingCurriculum ? .075*level : 0),disturbances:true,commandSchedule:schedule,record,summaryOnly:!record,endOnFall:task==='balance'&&endBalanceTrialEarly(this.trainingBalance,this.algorithm,this.algorithm==='cem'?2*Math.floor((this.taskAttempts.balance-this.pending.length)/2)+trialSlot:this.taskAttempts.balance+offset)}};
 }
 completeTrial(prepared,trial){
  if(prepared.index!==this.attempts)throw Error('학습 결과의 순서가 일치하지 않습니다.');
  const {weights,task,seed,record}=prepared,result=trial.metrics;this.attempts++;this.taskAttempts[task]++;this.algorithmAttempts[this.algorithm]++;this.pending.push({weights,score:task==='balance'?(result.done&&result.terminationReason==='duration'&&result.falls===0?Math.max(0,20*result.upright*result.time+2*(result.longestUpright||0)+.01*result.reward):Math.min(-REWARDS.balanceFall,result.reward)):result.reward,task,reference:prepared.reference,group:prepared.group});if(this.algorithm==='ppo')this.ppo.buffer.push(...trial.experience);

  this.travelRecord=nextTravelRecord(this.travelRecord,result,{attempt:this.attempts,task,terrain:result.forwardContact?.terrain||this.environment.terrain||'meadow'});
  return {attempts:this.attempts,task,score:result.reward,weights,seed,pushPlan:trial.pushPlan,commandSchedule:trial.commandSchedule,pushes:result.pushes,spawnRange:prepared.options.spawnRange,endOnFall:prepared.options.endOnFall,spawnTilt:prepared.options.spawnTilt,trainingSeconds:prepared.options.observationSeconds,terrainVariant:prepared.options.terrainVariant,scene:record?trial:null};
 }
 trainOne(options={}){const prepared=this.prepareTrial(options);return this.completeTrial(prepared,prepared.algorithm==='ppo'?ppoEpisode(prepared):episode(prepared.weights,prepared.task,prepared.seed,prepared.options));}

 adopt(weights,abilities,goalReward=evaluateCommands(weights,this.environment)){
  const score=modelScore({abilities,goalReward}),accepted=compareAbilities(abilities[this.focus],this.abilities[this.focus],this.focus)>0&&preservesAbilities(this.abilities,abilities);
  if(accepted){this.weights=[...weights];this.abilities=abilities;this.goalReward=goalReward;this.bestReward=score;this.modelAttempt=this.attempts;this.policyVersion++;this.generalization=null;this.searchState.lastResetAttempt=this.attempts;for(const task of stages)this.curriculum[task]=Math.max(this.curriculum[task],.15+.85*abilities[task].passRate);}
  this.revision++;this.record(score,accepted,abilities);return accepted;
 }
 updateDistribution(){if(this.algorithm==='ppo'){this.pending=[];this.cohortStart=this.attempts;return;}if(this.pending.length<this.batchSize)return;const elite=this.searchCohort().filter(r=>!r.reference).sort((a,b)=>b.score-a.score).slice(0,8);for(let i=0;i<POLICY_SIZE;i++){if(this.focus==='balance'&&this.balanceHorizon()<=2&&i<BIAS_START)continue;const m=elite.reduce((sum,c)=>sum+c.weights[i],0)/elite.length;this.mean[i]=.2*this.mean[i]+.8*m;this.spread[i]=clamp(.65*this.spread[i]+.35*Math.sqrt(elite.reduce((sum,c)=>sum+(c.weights[i]-m)**2,0)/elite.length)*1.2,.04,.6);}if(this.attempts-this.searchState.lastResetAttempt>=4096){this.searchArchive={...(this.searchArchive||{}),cem:{mean:[...this.mean],spread:[...this.spread]},at:this.attempts};this.mean=this.searchState.restarts%3===2?initialPolicy(this.searchSeed+this.searchState.restarts):[...this.weights];const scale=[.08,.14,.22][this.searchState.restarts%3];this.spread=this.spread.map(v=>clamp(Math.max(v,scale),.04,.35));this.searchState.restarts++;this.searchState.lastResetAttempt=this.attempts;}this.pending=[];this.cohortStart=this.attempts;}
 searchCohort(){const groups=new Map();this.pending.forEach((r,i)=>{const key=r.group??i;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});return [...groups.values()].map(rows=>({...rows[0],score:.7*rows.reduce((s,r)=>s+r.score,0)/rows.length+.3*Math.min(...rows.map(r=>r.score))}));}
 candidate(force=false){if(this.algorithm==='ppo'){if(this.ppo.buffer.length<(force?64:256))return null;const optimizer=new PPOOptimizer(this.weights,this.searchSeed,this.ppo);optimizer.update(this.random);this.ppo=optimizer.snapshot();return {weights:[...this.ppo.actor]};}return this.searchCohort().reduce((a,b)=>a.score>=b.score?a:b);}

 async checkpointAsync(yieldControl=async()=>{},active=()=>true,validation=null,force=false){
  if(!this.pending.length&&!this.validationBank)return null;
  const winner=this.pending.length?this.candidate(force):null;
  const full=force||this.attempts-this.lastFullValidationAttempt>=36;
  if(winner&&(this.algorithm!=='ppo'||this.ppo.updates%2===0||force)&&!winner.weights.every((w,i)=>w===this.weights[i])){
   if(!active())return null;
   this.onPhase?.('candidate-validation',{task:this.focus,seconds:normalizeEvaluationSettings(this.environment).validationSeconds});
   const ability=validation?await validation.ability(winner.weights,this.focus,this.environment,active):evaluateAbility(winner.weights,this.focus,this.environment);await yieldControl();if(!active()||!ability)return null;
   this.revision++;this.record(this.bestReward,false,{[this.focus]:ability},false);
   if(preservesAbility(this.abilities[this.focus],ability)&&compareAbilities(ability,this.abilities[this.focus],this.focus)>0&&(!this.validationBank||compareAbilities(ability,this.validationBank.ability,this.focus)>0))this.validationBank={weights:[...winner.weights],task:this.focus,ability};
   if(!this.validationBank)this.recoverPPOSearch(ability);
  }
  if(this.pending.length)this.updateDistribution();
  if(!full||!this.validationBank)return false;
  this.onPhase?.('full-validation',{seconds:normalizeEvaluationSettings(this.environment).validationSeconds});
  const bank=this.validationBank,abilities={[bank.task]:bank.ability};
  for(const task of stages.filter(s=>s!==bank.task)){if(!active())return null;abilities[task]=validation?await validation.ability(bank.weights,task,this.environment,active):evaluateAbility(bank.weights,task,this.environment);await yieldControl();if(!active()||!abilities[task])return null;if(!preservesAbility(this.abilities[task],abilities[task])){this.validationBank=null;this.lastFullValidationAttempt=this.attempts;this.revision++;this.record(this.bestReward,false,abilities,false);return false;}}
  const goalReward=validation?await validation.commands(bank.weights,this.environment,active):evaluateCommands(bank.weights,this.environment);if(!active()||goalReward===null)return null;
  this.validationBank=null;this.lastFullValidationAttempt=this.attempts;const accepted=this.adopt(bank.weights,abilities,goalReward);
  if(accepted&&active()){this.onPhase?.('monitor',{seconds:normalizeEvaluationSettings(this.environment).monitorSeconds});const seconds=normalizeEvaluationSettings(this.environment).monitorSeconds,cases=monitorCases(seconds);const ability=validation?await validation.ability(bank.weights,this.focus,this.environment,active,cases):evaluateAbility(bank.weights,this.focus,this.environment,cases);if(ability)this.generalization={task:this.focus,attempts:this.attempts,rewardVersion:REWARD_VERSION,seconds,ability};}
  return accepted;
 }
 checkpoint(){if(!this.pending.length)return;const winner=this.candidate(true);if(!winner)return;this.adopt(winner.weights,evaluateAbilities(winner.weights,this.environment));this.updateDistribution();}
 snapshot(){return {controllerArchive:this.controllerArchive?structuredClone(this.controllerArchive):null,trainingBalance:{...this.trainingBalance},travelRecord:structuredClone(this.travelRecord),searchState:structuredClone(this.searchState),searchArchive:structuredClone(this.searchArchive),generalization:structuredClone(this.generalization),validationBank:structuredClone(this.validationBank),lastFullValidationAttempt:this.lastFullValidationAttempt,version:MODEL_VERSION,searchSeed:this.searchSeed,rewardVersion:REWARD_VERSION,algorithm:this.algorithm,algorithmAttempts:{...this.algorithmAttempts},ppo:this.ppo?structuredClone(this.ppo):null,pending:structuredClone(this.pending),focus:this.focus,cohortStart:this.cohortStart,curriculum:{...this.curriculum},goalReward:this.goalReward,physicsVersion:6,policyKind:POLICY_KIND,environment:{...this.environment},id:this.id,weights:[...this.weights],mean:[...this.mean],spread:[...this.spread],attempts:this.attempts,taskAttempts:{...this.taskAttempts},modelAttempt:this.modelAttempt,revision:this.revision,policyVersion:this.policyVersion,abilities:structuredClone(this.abilities),history:structuredClone(this.history),updatedAt:new Date().toISOString()};}
}
