import {observationScene} from './robot-transfer.mjs?v=robot35';
import {RobotLearner,ALLOWED_ATTEMPTS} from './robot-learning.mjs?v=robot35';
import {ParallelRollouts,executeTrial} from './robot-rollouts.mjs?v=robot35';
import {STAGES} from './robot-core.mjs?v=robot35';
let learner=null,stage='balance',focus='balance',initToken=0,job=null,environment={},interval=20,lastCandidate=null,lastTrial=null,rollouts=null;
const sendModel=()=>postMessage({type:'model',model:learner.snapshot()});
const yieldControl=()=>new Promise(r=>setTimeout(r,0));
function preview(){postMessage({type:'preview',stage,source:lastCandidate?'candidate':'best',weights:[...(lastCandidate||learner.weights)],policyVersion:learner.policyVersion,attempts:learner.attempts,seed:lastTrial?.seed??31,pushPlan:lastTrial?.pushPlan||[],commandSchedule:lastTrial?.commandSchedule||[],scene:observationScene(lastTrial?.scene),endOnFall:lastTrial?.endOnFall,spawnTilt:lastTrial?.spawnTilt,trainingSeconds:lastTrial?.trainingSeconds,terrainVariant:lastTrial?.terrainVariant,spawnRange:lastTrial?.spawnRange});}
async function initialize(data,token){
 rollouts?.close();rollouts=new ParallelRollouts(typeof data.parallel==='boolean'?{enabled:data.parallel}:{});environment=data.environment||{};learner=new RobotLearner(data.saved||null,data.seed??Date.now(),environment);stage=STAGES[data.stage]?data.stage:'balance';focus=STAGES[data.focus]?data.focus:stage;learner.setFocus(focus);
 await rollouts.start();if(token!==initToken)return;sendModel();preview();postMessage({type:'ready',parallelism:rollouts.ready?2:1});
}
self.onmessage=async({data})=>{
 try{
  if(data.type==='stop'){if(job)job.cancelled=true;return;}
  if(data.type==='settings'){interval=[10,20,50,100].includes(data.interval)?data.interval:interval;return;}
  if(data.type==='init'){if(job)job.cancelled=true;job=null;await initialize(data,++initToken);return;}
  if(data.type==='goal'){stage=STAGES[data.stage]?data.stage:stage;lastCandidate=null;lastTrial=null;preview();postMessage({type:'goal',stage});return;}
  if(data.type==='preview'){if(learner)preview();return;}
  if(data.type!=='train'||!learner||job)return;
  const target=Number(data.count);if(!(ALLOWED_ATTEMPTS.includes(target)||(data.internalTeam&&Number.isInteger(target)&&target>0&&target<=100000)))throw Error('지원하는 시도 횟수를 선택해 주세요.');
  focus=STAGES[data.focus]?data.focus:focus;learner.setFocus(focus);learner.setAlgorithm(data.algorithm||learner.algorithm);learner.setCurriculum(data.curriculum);learner.setTrainingPushSettings(data.trainingPush);learner.setTrainingCommand(data.trainingCommand);sendModel();const current={cancelled:false};job=current;let completed=0;const started=Date.now();postMessage({type:'training',active:true});
  while(completed<target&&job===current&&!current.cancelled){
   // Never prepare beyond a CEM update boundary: both trial policies must use
   // exactly the same distribution as their sequential counterparts.
   if(learner.pending.length>=learner.batchSize){postMessage({type:'phase',phase:'validation',completed,target});await learner.checkpointAsync(yieldControl,()=>job===current&&!current.cancelled,rollouts.ready?rollouts:null,completed===target);if(job!==current)return;sendModel();if(current.cancelled)break;}
   const slots=Math.min(rollouts.ready?2:1,target-completed,learner.batchSize-learner.pending.length),prepared=[];
   for(let i=0;i<slots;i++){const next=completed+i+1;prepared.push(learner.prepareTrial({record:next===1||next%interval===0||next===target},i));}
   const remote=slots===2?rollouts.run(prepared[1]):null,first=executeTrial(prepared[0]),trials=[first];if(remote)trials.push(await remote);
   if(job!==current)return;
   for(let i=0;i<trials.length;i++){
    if(i>0&&current.cancelled)break;
    const result=learner.completeTrial(prepared[i],trials[i]);lastCandidate=result.weights;lastTrial=result;completed++;
    postMessage({type:'progress',completed,target,attempts:learner.attempts,taskAttempts:{...learner.taskAttempts},algorithmAttempts:{...learner.algorithmAttempts},task:focus,score:result.score,remainingMs:(Date.now()-started)/completed*(target-completed)});
    if(learner.pending.length>=learner.batchSize){postMessage({type:'phase',phase:'validation',completed,target});await learner.checkpointAsync(yieldControl,()=>job===current&&!current.cancelled,rollouts.ready?rollouts:null,completed===target);if(job!==current)return;sendModel();}
    if(completed===1||completed%interval===0||completed===target)preview();
   }
   await yieldControl();
  }
  if(job!==current)return;
  // Preserve counters even if a validation pass was interrupted.
  if(!current.cancelled&&(learner.pending.length||learner.validationBank)){postMessage({type:'phase',phase:'validation',completed,target});await learner.checkpointAsync(yieldControl,()=>job===current&&!current.cancelled,rollouts.ready?rollouts:null,completed===target);}
  sendModel();preview();job=null;postMessage({type:'done',completed,target,cancelled:current.cancelled});
 }catch(error){job=null;postMessage({type:'error',message:error.message||'학습 오류가 발생했습니다.'});}
};
