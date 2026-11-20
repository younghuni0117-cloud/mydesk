import {angleError} from './evolution-core.mjs?v=evolution3';
export const MISSIONS={
 balance:{id:'balance',label:'균형 잡기',seconds:6,evaluationSeconds:8,holdSeconds:8,deadline:0,stages:[{min:0,max:5,omega:.1},{min:0,max:8,omega:.15}]},
 recover:{id:'recover',label:'자세 복구',seconds:10,evaluationSeconds:10,holdSeconds:2,deadline:6,stages:[{min:0,max:10,omega:.1},{min:10,max:25,omega:.15},{min:20,max:45,omega:.2},{min:30,max:60,omega:.25}]},
 swing:{id:'swing',label:'Swing-up',seconds:14,evaluationSeconds:14,holdSeconds:2,deadline:10,stages:[{min:0,max:15,omega:.1},{min:15,max:45,omega:.15},{min:40,max:90,omega:.2},{min:90,max:135,omega:.2},{min:150,max:180,omega:.2}]}
};
export const missionOf=value=>MISSIONS[value]||MISSIONS.balance;
export function initialCondition(rng,mission,stage=0,mix=true){const m=missionOf(mission),range=m.stages[Math.min(stage,m.stages.length-1)],easy=m.id!=='balance'&&mix&&rng.uniform()<.2,lo=easy?0:range.min,hi=easy?8:range.max;return {theta:(rng.uniform()<.5?-1:1)*(lo+rng.uniform()*(hi-lo))*Math.PI/180,omega:(rng.uniform()*2-1)*(easy?.1:range.omega)};}
export function missionReward(world,action,failed,mission,stable=false,weights={stability:1}){const error=angleError(world.theta),omega=-world.link.getAngularVelocity(),m=missionOf(mission);if(m.id==='balance'){const terms={alive:1,posture:-8*error*error,velocity:-.1*omega*omega,effort:-.01*action*action,failure:failed?-5:0};return {value:Object.values(terms).reduce((a,b)=>a+b,0),terms};}const terms={alive:0,posture:2*Math.cos(error),velocity:-.03*omega*omega,effort:-.005*action*action,stability:stable?weights.stability:0,failure:0};return {value:Object.values(terms).reduce((a,b)=>a+b,0),terms};}
export const isStable=world=>Math.abs(angleError(world.theta))<8*Math.PI/180&&Math.abs(world.link.getAngularVelocity())<.4;
