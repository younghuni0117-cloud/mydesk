import {PUSH_PARTS} from './robot-impact.mjs?v=robot35';
// Evaluation lengths are independent of replay/observation time.
export function normalizeEvaluationSettings(raw={}){
 const validationSeconds=Number.isInteger(raw.validationSeconds)&&raw.validationSeconds>=6&&raw.validationSeconds<=120?raw.validationSeconds:10;
 const monitorSeconds=Number.isInteger(raw.monitorSeconds)&&raw.monitorSeconds>=10&&raw.monitorSeconds<=3600?raw.monitorSeconds:30;
 return {validationSeconds,monitorSeconds:Math.max(validationSeconds,monitorSeconds)};
}
// Two reproducible, held-out schedules; only improved integrated models run these.
export function monitorCases(seconds=30){
 const duration=normalizeEvaluationSettings({monitorSeconds:seconds}).monitorSeconds;
 return [700001,700009].map((seed,index)=>{let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;},count=Math.max(2,Math.floor(duration/5)),gap=(duration-4)/count;
 const pushes=Array.from({length:count},(_,i)=>({time:2+(i+.15+.7*random())*gap,strength:2+4*random(),direction:random()*360,location:PUSH_PARTS[Math.floor(random()*PUSH_PARTS.length)]}));
 return {id:index?'unseen-right':'unseen-left',label:'추가 시험 '+(index?'B':'A'),seed,seconds:duration,pushes};});
}
