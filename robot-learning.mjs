import {POLICY_KIND} from './robot-policy.mjs?v=robot18';
import {episode,POLICY_SIZE,STAGES,VALIDATION_CASES,evaluateAbility,evaluateAbilities,clamp,seeded,normalizePushSettings} from './robot-core.mjs?v=robot18';
export const MODEL_VERSION=3;
export const ALLOWED_ATTEMPTS=[100,200,500,1000,2000,5000,10000,100000];
const stages=Object.keys(STAGES),gaussian=r=>Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r());
const vector=a=>Array.isArray(a)&&a.length===POLICY_SIZE&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<20);
export const overallScore=abilities=>stages.reduce((sum,s)=>sum+Math.tanh(abilities[s].meanReward/40),0)*20;
export function preservesAbilities(previous,next){
 return stages.every(s=>next[s].meanReward>=previous[s].meanReward-Math.max(1,Math.abs(previous[s].meanReward)*.02)&&previous[s].cases.every((c,i)=>!c.passed||next[s].cases[i].passed));
}
export function compactHistory(rows){if(rows.length<=160)return rows;const keep=new Set([0,...rows.map((_,i)=>i).slice(-40)]);for(const task of stages){const indices=rows.flatMap((r,i)=>r.task===task?[i]:[]);if(indices.length)keep.add(indices[0]);for(const i of indices.slice(-12))keep.add(i);}const rest=rows.map((_,i)=>i).filter(i=>!keep.has(i)),budget=Math.max(0,120-keep.size);for(let i=0;i<Math.min(budget,rest.length);i++)keep.add(rest[Math.floor(i*rest.length/Math.min(budget,rest.length))]);return [...keep].sort((a,b)=>a-b).map(i=>rows[i]);}
export class RobotLearner {
 constructor(saved=null,seed=Date.now(),environment={}){
  this.environment=environment;
  this.random=seeded(seed);this.id=globalThis.crypto?.randomUUID?.()||`robot-${Date.now()}-${seed}`;
  this.weights=Array(POLICY_SIZE).fill(0);this.mean=[...this.weights];this.spread=Array(POLICY_SIZE).fill(.3);
  this.attempts=0;this.taskAttempts=Object.fromEntries(stages.map(s=>[s,0]));this.modelAttempt=0;this.revision=0;this.policyVersion=0;this.history=[];this.pending=[];this.focus='balance';
  if(RobotLearner.valid(saved))for(const k of ['id','weights','mean','spread','attempts','taskAttempts','modelAttempt','revision','policyVersion','history'])this[k]=structuredClone(saved[k]);

  if(saved&&JSON.stringify(saved.environment||{})!==JSON.stringify(environment))this.history=[];
  this.abilities=evaluateAbilities(this.weights,this.environment);this.bestReward=overallScore(this.abilities);
  if(!this.history.length||!this.history.some(r=>r.rewards&&r.taskAttempts)){this.record(this.bestReward,false);this.history.at(-1).baseline=true;}
 }
 static valid(s){
  return s&&s.version===3&&s.physicsVersion===3&&s.policyKind===POLICY_KIND&&typeof s.id==='string'&&s.id.length<150&&['weights','mean','spread'].every(k=>vector(s[k]))&&['mean','spread'].every(k=>s[k].length===s.weights.length)&&s.spread.every(v=>v>=.03&&v<5)
   &&Number.isSafeInteger(s.attempts)&&s.attempts>=0&&s.attempts<1e12&&Number.isSafeInteger(s.modelAttempt)&&s.modelAttempt>=0&&s.modelAttempt<=s.attempts
   &&['revision','policyVersion'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&s.taskAttempts&&stages.every(k=>Number.isSafeInteger(s.taskAttempts[k])&&s.taskAttempts[k]>=0)&&stages.reduce((sum,k)=>sum+s.taskAttempts[k],0)===s.attempts
   &&s.abilities&&stages.every(k=>s.abilities[k]&&Number.isFinite(s.abilities[k].meanReward)&&Math.abs(s.abilities[k].meanReward)<1e6&&Number.isFinite(s.abilities[k].passRate)&&s.abilities[k].passRate>=0&&s.abilities[k].passRate<=1&&Array.isArray(s.abilities[k].cases)&&s.abilities[k].cases.length===4&&s.abilities[k].cases.every((c,i)=>c.id===VALIDATION_CASES[i].id&&typeof c.passed==='boolean'))
   &&Array.isArray(s.history)&&s.history.length<=200&&s.history.every(r=>r&&Number.isSafeInteger(r.attempts)&&r.attempts>=0&&r.attempts<=s.attempts&&(!r.taskAttempts||(stages.every(k=>Number.isSafeInteger(r.taskAttempts[k])&&r.taskAttempts[k]>=0&&r.taskAttempts[k]<=s.taskAttempts[k])&&stages.reduce((sum,k)=>sum+r.taskAttempts[k],0)===r.attempts))&&Number.isFinite(r.overall)&&Math.abs(r.overall)<=101&&Number.isFinite(r.candidate)&&Math.abs(r.candidate)<=101&&(!r.rewards||stages.every(s=>Number.isFinite(r.rewards[s])&&Math.abs(r.rewards[s])<1e6))&&(!r.candidateRewards||stages.every(s=>Number.isFinite(r.candidateRewards[s])&&Math.abs(r.candidateRewards[s])<1e6)));
 }
 record(candidate,accepted,candidateAbilities=this.abilities){const row={attempts:this.attempts,taskAttempts:{...this.taskAttempts},task:this.focus,overall:this.bestReward,candidate,accepted,rewards:Object.fromEntries(stages.map(s=>[s,this.abilities[s].meanReward])),candidateRewards:Object.fromEntries(stages.map(s=>[s,candidateAbilities[s].meanReward]))};if(this.history.at(-1)?.attempts===this.attempts)this.history[this.history.length-1]=row;else this.history.push(row);this.history=compactHistory(this.history);}
 setFocus(stage){if(STAGES[stage])this.focus=stage;}
 setTrainingPushSettings(settings){this.trainingPush=normalizePushSettings(settings);}
 trainOne(){
  const weights=this.pending.length===0?[...this.weights]:this.mean.map((m,i)=>clamp(m+this.spread[i]*gaussian(this.random),-4,4));
  const task=this.focus,seed=100+this.attempts;
  const trial=episode(weights,task,seed,{...this.environment,...normalizePushSettings(this.trainingPush),disturbances:true}),result=trial.metrics;
  this.attempts++;this.taskAttempts[task]++;this.pending.push({weights,score:result.reward,task});
  return {attempts:this.attempts,task,score:result.reward,weights,seed,pushPlan:trial.pushPlan,pushes:result.pushes};
 }
 adopt(weights,abilities){
  const score=overallScore(abilities),accepted=score>this.bestReward+1e-7&&preservesAbilities(this.abilities,abilities);
  if(accepted){this.weights=[...weights];this.abilities=abilities;this.bestReward=score;this.modelAttempt=this.attempts;this.policyVersion++;}
  this.revision++;this.record(score,accepted,abilities);return accepted;
 }
 updateDistribution(){if(this.pending.length<12)return;const elite=[...this.pending].sort((a,b)=>b.score-a.score).slice(0,4);for(let i=0;i<POLICY_SIZE;i++){const m=elite.reduce((sum,c)=>sum+c.weights[i],0)/elite.length;this.mean[i]=.45*this.weights[i]+.55*m;this.spread[i]=clamp(.65*this.spread[i]+.35*Math.sqrt(elite.reduce((sum,c)=>sum+(c.weights[i]-m)**2,0)/elite.length)*1.2,.06,.8);}this.pending=[];}
 async checkpointAsync(yieldControl=async()=>{},active=()=>true){
  if(!this.pending.length)return null;
  const winner=this.pending.reduce((a,b)=>a.score>=b.score?a:b);
  if(winner.weights.every((w,i)=>w===this.weights[i])){this.revision++;this.record(this.bestReward,false);this.updateDistribution();return false;}
  const abilities={};
  for(const task of stages){if(!active())return null;abilities[task]=evaluateAbility(winner.weights,task,this.environment);await yieldControl();}
  if(!active())return null;const accepted=this.adopt(winner.weights,abilities);this.updateDistribution();return accepted;
 }
 checkpoint(){if(!this.pending.length)return;const winner=this.pending.reduce((a,b)=>a.score>=b.score?a:b);this.adopt(winner.weights,evaluateAbilities(winner.weights,this.environment));this.updateDistribution();}
 snapshot(){return {version:3,physicsVersion:3,policyKind:POLICY_KIND,environment:{...this.environment},id:this.id,weights:[...this.weights],mean:[...this.mean],spread:[...this.spread],attempts:this.attempts,taskAttempts:{...this.taskAttempts},modelAttempt:this.modelAttempt,revision:this.revision,policyVersion:this.policyVersion,abilities:structuredClone(this.abilities),history:structuredClone(this.history),updatedAt:new Date().toISOString()};}
}
