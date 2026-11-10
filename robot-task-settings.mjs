import {normalizeActuation} from './robot-actuation.mjs?v=robot55';
import {normalizeBalanceTraining} from './robot-training-options.mjs?v=robot55';
import {normalizeEvaluationSettings} from './robot-evaluation.mjs?v=robot55';

const common={algorithm:'ppo',curriculum:true,attemptCount:10000,servoProfile:'standard',targetSpeed:180,balanceEarlyStop:false,balanceFullTrials:false,balanceFullEvery:8,autoPush:true,pushMin:.5,pushMax:3,pushInterval:0,interval:10};
export const TASK_DEFAULTS=Object.freeze({
 balance:Object.freeze({...common,trainingSeconds:10,validationSeconds:10,monitorSeconds:30,observationSeconds:30,interval:20,balanceEarlyStop:true,balanceFullTrials:true,pushMin:1,pushMax:6}),
 recover:Object.freeze({...common,trainingSeconds:30,validationSeconds:30,monitorSeconds:60,observationSeconds:60,autoPush:false,pushMax:2}),
 walk:Object.freeze({...common,trainingSeconds:15,validationSeconds:15,monitorSeconds:45,observationSeconds:45}),
 run:Object.freeze({...common,trainingSeconds:20,validationSeconds:20,monitorSeconds:60,observationSeconds:60,targetSpeed:240,pushMax:4}),
 obstacles:Object.freeze({...common,trainingSeconds:30,validationSeconds:30,monitorSeconds:60,observationSeconds:60,autoPush:false}),
});
export const TASK_SETTING_KEYS=Object.freeze(Object.keys(TASK_DEFAULTS.balance));
const integer=(x,lo,hi,fallback)=>Number.isInteger(Number(x))&&Number(x)>=lo&&Number(x)<=hi?Number(x):fallback;
export function taskProfile(task,raw={}){
 const d=Object.hasOwn(TASK_DEFAULTS,task)?TASK_DEFAULTS[task]:TASK_DEFAULTS.balance,p={...d};
 for(const k of TASK_SETTING_KEYS)if(raw?.[k]!==undefined)p[k]=raw[k];
 p.trainingSeconds=integer(p.trainingSeconds,1,120,d.trainingSeconds);
 p.validationSeconds=integer(p.validationSeconds,6,120,d.validationSeconds);
 p.monitorSeconds=integer(p.monitorSeconds,10,3600,d.monitorSeconds);
 p.observationSeconds=integer(p.observationSeconds,1,3600,d.observationSeconds);
 p.attemptCount=[100,200,500,1000,2000,5000,10000,100000].includes(Number(p.attemptCount))?Number(p.attemptCount):d.attemptCount;
 p.targetSpeed=integer(p.targetSpeed,30,720,d.targetSpeed);
 p.interval=[10,20,50,100].includes(Number(p.interval))?Number(p.interval):d.interval;
 p.algorithm=p.algorithm==='cem'?'cem':'ppo';p.curriculum=p.curriculum!==false;p.autoPush=p.autoPush!==false;
 const lo=Number(p.pushMin),hi=Number(p.pushMax);if(Number.isFinite(lo)&&Number.isFinite(hi)&&lo>=.1&&hi<=30&&lo<=hi){p.pushMin=lo;p.pushMax=hi;}else{p.pushMin=d.pushMin;p.pushMax=d.pushMax;}
 p.pushInterval=[0,.5,1,2,3,5,10,30].includes(Number(p.pushInterval))?Number(p.pushInterval):0;
 Object.assign(p,normalizeBalanceTraining(p),normalizeEvaluationSettings(p),normalizeActuation(p));delete p.actuationVersion;
 return p;
}
export function loadTaskSettings(saved={},shared={}){
 const map=Object.fromEntries(Object.keys(TASK_DEFAULTS).map(task=>[task,taskProfile(task,{...shared?.[task],...saved?.taskSettings?.[task]})]));
 // Preserve the formerly global controls for the previously selected task only.
 if(!saved?.taskSettings){const task=Object.hasOwn(TASK_DEFAULTS,saved?.focus)?saved.focus:'balance';map[task]=taskProfile(task,{...map[task],...saved});}
 return map;
}
export function taskEnvironments(settings){return Object.fromEntries(Object.keys(TASK_DEFAULTS).map(task=>{const p=taskProfile(task,settings?.[task]);return [task,{...normalizeActuation(p),...normalizeEvaluationSettings(p)}];}));}
export function taskEnvironment(environment={},task){return environment.taskEnvironments?.[task]?{...environment,...environment.taskEnvironments[task]}:environment;}
export function applySharedTaskEnvironment(settings,environment={}){for(const task of Object.keys(TASK_DEFAULTS))if(environment.taskEnvironments?.[task])settings[task]=taskProfile(task,{...settings[task],...environment.taskEnvironments[task]});return settings;}

// JSONB may reorder object keys. Compare actual conditions, not serialization order.
export function canonicalEnvironment(value){if(Array.isArray(value))return value.map(canonicalEnvironment);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonicalEnvironment(v)]));return value;}
export const environmentSignature=value=>JSON.stringify(canonicalEnvironment(value||{}));
