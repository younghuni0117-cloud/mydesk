import {WEIGHTS,initialWeights,rng,episode,clamp} from './robotdog-core.mjs?v=dog1';
export const MODEL_KEY='mydesk.robotdog.v1';
export function validModel(m){return m?.version===1&&Array.isArray(m.weights)&&m.weights.length===WEIGHTS&&m.weights.every(v=>Number.isFinite(v)&&Math.abs(v)<=8)&&Number.isSafeInteger(m.attempts)&&m.attempts>=0&&Array.isArray(m.history)&&m.history.length<=500&&m.history.every(p=>Number.isSafeInteger(p.attempt)&&Number.isFinite(p.reward)&&Number.isFinite(p.best)&&Number.isFinite(p.target));}
export function freshModel(){return {version:1,weights:initialWeights(),attempts:0,history:[],best:null,target:0,seconds:6};}
export function loadModel(storage=globalThis.localStorage){try{const m=JSON.parse(storage?.getItem(MODEL_KEY)||'null');return validModel(m)?m:freshModel();}catch{return freshModel();}}
export function saveModel(model,storage=globalThis.localStorage){try{if(!validModel(model))return false;storage?.setItem(MODEL_KEY,JSON.stringify(model));return !!storage;}catch{return false;}}
export class DogSearch{
 constructor(model=freshModel(),target=0,seconds=6,seed=83){this.model=structuredClone(model);this.target=target;this.seconds=seconds;this.random=rng(seed+model.attempts);this.mean=[...model.weights];this.sigma=Array(WEIGHTS).fill(.14);this.batch=[];this.scores=[];this.best=this.validate(model.weights);this.model.best=this.best;this.model.target=target;this.model.seconds=seconds;}
 normal(){return Math.sqrt(-2*Math.log(Math.max(1e-8,this.random())))*Math.cos(2*Math.PI*this.random());}
 validate(weights){return [712,991].reduce((sum,seed)=>sum+episode(weights,{target:this.target,seconds:this.seconds,seed}).score,0)/2;}
 trial(record=false){const slot=this.batch.length,weights=slot===0?[...this.model.weights]:this.mean.map((v,i)=>clamp(v+this.normal()*this.sigma[i],-8,8)),result=episode(weights,{target:this.target,seconds:this.seconds,seed:301+Math.floor(this.model.attempts/8)%7},record);this.model.attempts++;this.batch.push({weights,score:result.score});this.scores.push(result.score);this.scores=this.scores.slice(-10);
  if(this.batch.length===8){this.batch.sort((a,b)=>b.score-a.score);const elite=this.batch.slice(0,2),candidate=elite[0].weights,score=this.validate(candidate);if(score>this.best){this.best=score;this.model.weights=[...candidate];}for(let i=0;i<WEIGHTS;i++){const mean=(elite[0].weights[i]+elite[1].weights[i])/2,sd=Math.abs(elite[0].weights[i]-elite[1].weights[i])/2;this.mean[i]=.4*this.mean[i]+.6*mean;this.sigma[i]=clamp(.7*this.sigma[i]+.3*sd,.025,.28);}this.batch=[];}
  this.model.best=this.best;const reward=this.scores.reduce((a,b)=>a+b,0)/this.scores.length;this.model.history.push({attempt:this.model.attempts,reward,best:this.best,target:this.target});if(this.model.history.length>500)this.model.history.splice(0,this.model.history.length-500);return {reward,best:this.best,result,attempts:this.model.attempts};
 }
}
