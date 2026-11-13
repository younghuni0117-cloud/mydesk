// Episode returns are training telemetry, never evidence for model promotion.
export const TRAINING_REWARD_WINDOW=20;
export const TRAINING_REWARD_POINTS=640;
export function loadTrainingRewards(raw,tasks){
 const out={};
 for(const task of tasks){const s=raw?.[task];if(!s||typeof s.environment!=='string'||s.environment.length>30000||!Number.isFinite(s.horizon)||!Number.isSafeInteger(s.segment)||s.segment<0)continue;
  const recent=(Array.isArray(s.recent)?s.recent:[]).filter(Number.isFinite).slice(-TRAINING_REWARD_WINDOW);
  const points=(Array.isArray(s.points)?s.points:[]).filter(p=>p&&Number.isSafeInteger(p.attempts)&&p.attempts>0&&Number.isFinite(p.overall)&&Number.isSafeInteger(p.segment)&&p.segment>=0&&Number.isInteger(p.count)&&p.count>0&&p.count<=TRAINING_REWARD_WINDOW).slice(-TRAINING_REWARD_POINTS).map(p=>({...p}));
  out[task]={environment:s.environment,horizon:s.horizon,segment:s.segment,recent,points};
 }return out;
}
function compact(points){
 if(points.length<=TRAINING_REWARD_POINTS)return points;
 // Keep the latest 320 trials at full resolution; thin older history evenly.
 const tail=points.slice(-320),head=points.slice(0,-320);
 return [...head.filter((_,i)=>i%2===0),...tail];
}
export function recordTrainingReward(history,task,attempts,reward,environment,horizon){
 if(!Number.isSafeInteger(attempts)||attempts<1||!Number.isFinite(reward)||!Number.isFinite(horizon))return null;
 let s=history[task];if(s?.points.at(-1)?.attempts>=attempts)return s;
 if(!s)s=history[task]={environment,horizon,segment:0,recent:[],points:[]};
 if(s.environment!==environment||s.horizon!==horizon){s.environment=environment;s.horizon=horizon;s.segment++;s.recent=[];}
 s.recent.push(reward);if(s.recent.length>TRAINING_REWARD_WINDOW)s.recent.shift();
 s.points.push({attempts,overall:s.recent.reduce((a,b)=>a+b,0)/s.recent.length,count:s.recent.length,segment:s.segment});s.points=compact(s.points);return s;
}
export function trainingRewardRows(model,task,environment=JSON.stringify(model.environment)){
 const s=model.trainingRewards?.[task];if(!s||s.environment!==environment||!Array.isArray(s.points))return [];
 return s.points.filter(p=>p&&p.segment===s.segment&&Number.isFinite(p.overall)&&Number.isSafeInteger(p.attempts)&&p.attempts<=model.taskAttempts[task]).map(p=>({...p,candidate:null}));
}
