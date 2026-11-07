import {RobotLearner,ALLOWED_ATTEMPTS,overallScore} from './robot-learning.mjs?v=robot14';
import {STAGES,evaluateAbilities} from './robot-core.mjs?v=robot14';
let learner=null,stage='balance',focus='balance',initToken=0,job=null,environment={},interval=20,lastCandidate=null;
const sendModel=()=>postMessage({type:'model',model:learner.snapshot()});
const yieldControl=()=>new Promise(r=>setTimeout(r,0));
function preview(){postMessage({type:'preview',stage,source:lastCandidate?'candidate':'best',weights:[...(lastCandidate||learner.weights)],policyVersion:learner.policyVersion,attempts:learner.attempts});}
async function initialize(data,token){
 environment=data.environment||{};learner=new RobotLearner(data.saved||null,data.seed??Date.now(),environment);stage=STAGES[data.stage]?data.stage:'balance';focus=STAGES[data.focus]?data.focus:stage;learner.setFocus(focus);
 if(Array.isArray(data.legacy)&&!data.saved){
  let best=learner.bestReward;
  for(const old of data.legacy.slice(0,3)){if(!Array.isArray(old.weights)||![32,128].includes(old.weights.length)||old.weights.some(v=>!Number.isFinite(v)))continue;const weights=Array.from({length:128},(_,i)=>old.weights[i]||0),a=evaluateAbilities(weights,environment),score=overallScore(a);if(score>best){learner.weights=[...weights];learner.mean=[...weights];learner.abilities=a;learner.bestReward=score;best=score;}await yieldControl();if(token!==initToken)return;}
  if(data.legacyCounts){for(const task of Object.keys(STAGES))learner.taskAttempts[task]=Math.max(0,Math.floor(Number(data.legacyCounts[task])||0));learner.attempts=Object.values(learner.taskAttempts).reduce((a,b)=>a+b,0);learner.modelAttempt=learner.attempts;}
  learner.history=[];learner.record(learner.bestReward,false);
 }
 if(token!==initToken)return;sendModel();preview();postMessage({type:'ready'});
}
self.onmessage=async({data})=>{
 try{
  if(data.type==='stop'){if(job)job.cancelled=true;return;}
  if(data.type==='settings'){interval=[10,20,50,100].includes(data.interval)?data.interval:interval;return;}
  if(data.type==='init'){if(job)job.cancelled=true;job=null;await initialize(data,++initToken);return;}
  if(data.type==='goal'){stage=STAGES[data.stage]?data.stage:stage;preview();postMessage({type:'goal',stage});return;}
  if(data.type==='preview'){if(learner)preview();return;}
  if(data.type!=='train'||!learner||job)return;
  const target=Number(data.count);if(!(ALLOWED_ATTEMPTS.includes(target)||(data.internalTeam&&Number.isInteger(target)&&target>0&&target<=100000)))throw Error('지원하는 시도 횟수를 선택해 주세요.');
  focus=STAGES[data.focus]?data.focus:focus;if(learner.focus!==focus){learner.pending=[];learner.mean=[...learner.weights];learner.setFocus(focus);}const current={cancelled:false};job=current;let completed=0;const started=Date.now();postMessage({type:'training',active:true});
  while(completed<target&&job===current&&!current.cancelled){
   const result=learner.trainOne();lastCandidate=result.weights;completed++;
   postMessage({type:'progress',completed,target,attempts:learner.attempts,taskAttempts:{...learner.taskAttempts},task:focus,score:result.score,remainingMs:(Date.now()-started)/completed*(target-completed)});
   if(learner.pending.length>=12){await learner.checkpointAsync(yieldControl,()=>job===current&&!current.cancelled);if(job!==current)return;sendModel();}
   if(completed===1||completed%interval===0||completed===target)preview();
   await new Promise(r=>setTimeout(r,0));
  }
  if(job!==current)return;
  // Preserve counters even if a validation pass was interrupted.
  if(!current.cancelled)await learner.checkpointAsync(yieldControl,()=>job===current&&!current.cancelled);
  sendModel();preview();job=null;postMessage({type:'done',completed,target,cancelled:current.cancelled});
 }catch(error){job=null;postMessage({type:'error',message:error.message||'학습 오류가 발생했습니다.'});}
};
