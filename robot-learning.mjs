import {episode,POLICY_SIZE,STAGES,passedStage,clamp,seeded} from './robot-core.mjs';
const gaussian=random=>Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(2*Math.PI*random());
export class RobotLearner {
 constructor(stage='balance',saved=null,seed=Date.now(),options={}){
  this.stage=STAGES[stage]?stage:'balance';this.options=options;this.random=seeded(seed);
  this.mean=Array(POLICY_SIZE).fill(0);this.spread=Array.from({length:POLICY_SIZE},(_,i)=>i<16?.6:.15);this.weights=Array(POLICY_SIZE).fill(0);this.attempts=0;this.modelAttempt=0;this.history=[];this.pending=[];
  if(saved&&RobotLearner.valid(saved)){for(const key of ['mean','spread','weights','attempts','modelAttempt','history'])this[key]=structuredClone(saved[key]);}
  this.history=this.history.slice(-100);
  this.evaluateBest();if(!this.history.length)this.record(this.bestReward);
 }
 static valid(saved){return saved&&['mean','spread','weights'].every(k=>Array.isArray(saved[k])&&saved[k].length===POLICY_SIZE&&saved[k].every(v=>Number.isFinite(v)&&Math.abs(v)<20))&&saved.spread.every(v=>v>=.03&&v<5)&&Number.isInteger(saved.attempts)&&saved.attempts>=0&&saved.attempts<1e9&&Number.isInteger(saved.modelAttempt)&&saved.modelAttempt>=0&&saved.modelAttempt<=saved.attempts&&Number.isFinite(saved.bestReward)&&Math.abs(saved.bestReward)<1e6&&Number.isFinite(saved.success)&&saved.success>=0&&saved.success<=1&&Array.isArray(saved.history)&&saved.history.length<=1000&&saved.history.every(v=>v&&Number.isInteger(v.attempts)&&v.attempts>=0&&v.attempts<=saved.attempts&&Number.isFinite(v.best)&&Math.abs(v.best)<1e6&&Number.isFinite(v.candidate)&&Math.abs(v.candidate)<1e6);}
 evaluate(weights){const samples=[31,1000].map(seed=>episode(weights,this.stage,seed,this.options).metrics);return {reward:samples.reduce((s,m)=>s+m.reward,0)/2,success:samples.filter(m=>passedStage(m,this.stage)).length/2,metrics:samples[0]};}
 evaluateBest(){const e=this.evaluate(this.weights);this.bestReward=e.reward;this.success=e.success;this.metrics=e.metrics;}
 record(candidate){const row={attempts:this.attempts,best:this.bestReward,candidate,success:this.success};if(this.history.at(-1)?.attempts===this.attempts)this.history[this.history.length-1]=row;else this.history.push(row);this.history=this.history.slice(-100);}
 checkpoint(){if(!this.pending.length)return;const winner=this.pending.reduce((a,b)=>a.score>=b.score?a:b);const evaluated=this.evaluate(winner.weights);if(evaluated.reward>this.bestReward){this.weights=[...winner.weights];this.bestReward=evaluated.reward;this.success=evaluated.success;this.metrics=evaluated.metrics;this.modelAttempt=this.attempts;}this.record(evaluated.reward);}
 trainOne(){
  const weights=this.pending.length===0?[...this.weights]:this.mean.map((m,i)=>clamp(m+this.spread[i]*gaussian(this.random),-4,4));
  const group=Math.floor((this.attempts-this.pending.length)/12),score=episode(weights,this.stage,100+group,this.options).metrics.reward;
  this.pending.push({weights,score});this.attempts++;
  if(this.pending.length>=12){this.checkpoint();const elite=[...this.pending].sort((a,b)=>b.score-a.score).slice(0,4);for(let i=0;i<POLICY_SIZE;i++){const m=elite.reduce((s,e)=>s+e.weights[i],0)/4;const variance=elite.reduce((s,e)=>s+(e.weights[i]-m)**2,0)/4;this.mean[i]=.25*this.mean[i]+.75*m;this.spread[i]=Math.max(i<16?.08:.035,Math.sqrt(variance)*1.05);}this.pending=[];}
  return {attempts:this.attempts,score,weights};
 }
 snapshot(){return {version:1,stage:this.stage,options:this.options,weights:[...this.weights],mean:[...this.mean],spread:[...this.spread],attempts:this.attempts,modelAttempt:this.modelAttempt,history:structuredClone(this.history),bestReward:this.bestReward,success:this.success,metrics:{...this.metrics}};}
}
