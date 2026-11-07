import {episode,POLICY_SIZE,STAGES,VALIDATION_CASES,evaluateAbility,evaluateAbilities,clamp,seeded} from './robot-core.mjs?v=robot6';
export const MODEL_VERSION=2;
export const ALLOWED_ATTEMPTS=[100,200,500,1000,2000,5000,10000,100000];
const stages=Object.keys(STAGES),gaussian=r=>Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r());
const vector=a=>Array.isArray(a)&&a.length===POLICY_SIZE&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<20);
export const overallScore=abilities=>stages.reduce((sum,s)=>sum+Math.tanh(abilities[s].meanReward/40),0)*20;
export function preservesAbilities(previous,next){
 return stages.every(s=>next[s].meanReward>=previous[s].meanReward-Math.max(1,Math.abs(previous[s].meanReward)*.02)&&previous[s].cases.every((c,i)=>!c.passed||next[s].cases[i].passed));
}
export class RobotLearner {
 constructor(saved=null,seed=Date.now()){
  this.random=seeded(seed);this.id=globalThis.crypto?.randomUUID?.()||`robot-${Date.now()}-${seed}`;
  this.weights=Array(POLICY_SIZE).fill(0);this.mean=[...this.weights];this.spread=Array.from({length:POLICY_SIZE},(_,i)=>i<16?.6:.15);
  this.attempts=0;this.taskAttempts=Object.fromEntries(stages.map(s=>[s,0]));this.modelAttempt=0;this.revision=0;this.policyVersion=0;this.history=[];this.pending=[];this.focus='balance';
  if(RobotLearner.valid(saved))for(const k of ['id','weights','mean','spread','attempts','taskAttempts','modelAttempt','revision','policyVersion','history'])this[k]=structuredClone(saved[k]);
  this.abilities=evaluateAbilities(this.weights);this.bestReward=overallScore(this.abilities);
  if(!this.history.length)this.record(this.bestReward,false);
 }
 static valid(s){
  return s&&s.version===2&&s.physicsVersion===2&&typeof s.id==='string'&&s.id.length<150&&['weights','mean','spread'].every(k=>vector(s[k]))&&s.spread.every(v=>v>=.03&&v<5)
   &&Number.isSafeInteger(s.attempts)&&s.attempts>=0&&s.attempts<1e12&&Number.isSafeInteger(s.modelAttempt)&&s.modelAttempt>=0&&s.modelAttempt<=s.attempts
   &&['revision','policyVersion'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&s.taskAttempts&&stages.every(k=>Number.isSafeInteger(s.taskAttempts[k])&&s.taskAttempts[k]>=0)&&stages.reduce((sum,k)=>sum+s.taskAttempts[k],0)===s.attempts
   &&s.abilities&&stages.every(k=>s.abilities[k]&&Number.isFinite(s.abilities[k].meanReward)&&Math.abs(s.abilities[k].meanReward)<1e6&&Number.isFinite(s.abilities[k].passRate)&&s.abilities[k].passRate>=0&&s.abilities[k].passRate<=1&&Array.isArray(s.abilities[k].cases)&&s.abilities[k].cases.length===4&&s.abilities[k].cases.every((c,i)=>c.id===VALIDATION_CASES[i].id&&typeof c.passed==='boolean'))
   &&Array.isArray(s.history)&&s.history.length<=200&&s.history.every(r=>r&&Number.isSafeInteger(r.attempts)&&r.attempts>=0&&r.attempts<=s.attempts&&Number.isFinite(r.overall)&&Math.abs(r.overall)<=101&&Number.isFinite(r.candidate)&&Math.abs(r.candidate)<=101);
 }
 record(candidate,accepted){const row={attempts:this.attempts,task:this.focus,overall:this.bestReward,candidate,accepted};if(this.history.at(-1)?.attempts===this.attempts)this.history[this.history.length-1]=row;else this.history.push(row);this.history=this.history.slice(-120);}
 setFocus(stage){if(STAGES[stage])this.focus=stage;}
 trainOne(){
  const weights=this.pending.length===0?[...this.weights]:this.mean.map((m,i)=>clamp(m+this.spread[i]*gaussian(this.random),-4,4));
  const task=this.focus,pushMax=this.attempts<100?2:this.attempts<500?4:6;
  const seed=100+Math.floor((this.attempts-this.pending.length)/12);
  const result=episode(weights,task,seed,{pushMax,disturbances:true}).metrics;
  this.attempts++;this.taskAttempts[task]++;this.pending.push({weights,score:result.reward,task});
  return {attempts:this.attempts,task,score:result.reward,weights};
 }
 adopt(weights,abilities){
  const score=overallScore(abilities),accepted=score>this.bestReward+1e-7&&preservesAbilities(this.abilities,abilities);
  if(accepted){this.weights=[...weights];this.abilities=abilities;this.bestReward=score;this.modelAttempt=this.attempts;this.policyVersion++;}
  this.revision++;this.record(score,accepted);return accepted;
 }
 updateDistribution(){if(this.pending.length<12)return;const elite=[...this.pending].sort((a,b)=>b.score-a.score).slice(0,4);for(let i=0;i<POLICY_SIZE;i++){const m=elite.reduce((sum,c)=>sum+c.weights[i],0)/elite.length;this.mean[i]=.45*this.weights[i]+.55*m;this.spread[i]=Math.max(i<16?.08:.035,Math.sqrt(elite.reduce((sum,c)=>sum+(c.weights[i]-m)**2,0)/elite.length)*1.05);}this.pending=[];}
 async checkpointAsync(yieldControl=async()=>{},active=()=>true){
  if(!this.pending.length)return null;
  const winner=this.pending.reduce((a,b)=>a.score>=b.score?a:b);
  if(winner.weights.every((w,i)=>w===this.weights[i])){this.revision++;this.record(this.bestReward,false);this.updateDistribution();return false;}
  const abilities={};
  for(const task of stages){if(!active())return null;abilities[task]=evaluateAbility(winner.weights,task);await yieldControl();}
  if(!active())return null;const accepted=this.adopt(winner.weights,abilities);this.updateDistribution();return accepted;
 }
 checkpoint(){if(!this.pending.length)return;const winner=this.pending.reduce((a,b)=>a.score>=b.score?a:b);this.adopt(winner.weights,evaluateAbilities(winner.weights));this.updateDistribution();}
 snapshot(){return {version:2,physicsVersion:2,id:this.id,weights:[...this.weights],mean:[...this.mean],spread:[...this.spread],attempts:this.attempts,taskAttempts:{...this.taskAttempts},modelAttempt:this.modelAttempt,revision:this.revision,policyVersion:this.policyVersion,abilities:structuredClone(this.abilities),history:structuredClone(this.history),updatedAt:new Date().toISOString()};}
}
