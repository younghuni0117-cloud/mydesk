import {loadTaskSettings} from './robot-task-settings.mjs?v=update72';
import {observationScene} from './robot-transfer.mjs?v=update72';
import {RobotLearner,ALLOWED_ATTEMPTS,evaluationSignature} from './robot-learning.mjs?v=update72';
import {ParallelRollouts} from './robot-rollouts.mjs?v=update72';
import {STAGES} from './robot-core.mjs?v=update72';
let learner=null,stage='balance',focus='balance',initToken=0,job=null,interval=20,lastCandidate=null,lastTrial=null,rollouts=null,robotCount=1,lastScenes=[];
let activeGeneration=0,evaluationPromise=null;const evaluationCache=new Map();
const emit=data=>postMessage({...data,generation:activeGeneration});
async function evaluateEnvironment(current,pool,token){
 const active=()=>token===initToken,key=current.id+':'+current.policyVersion+':'+evaluationSignature(current.environment);
 const cached=evaluationCache.get(key);
 if(cached){evaluationCache.delete(key);evaluationCache.set(key,cached);current.applyEvaluation(cached.abilities,cached.goalReward);if(active()){sendModel();emit({type:'evaluation',active:false});}return;}
 emit({type:'evaluation',active:true});await yieldControl();const abilities={};
 for(const task of Object.keys(STAGES)){if(!active())return;abilities[task]=await pool.ability(current.weights,task,current.environment,active,undefined,true);if(!active()||!abilities[task])return;}
 const goalReward=await pool.commands(current.weights,current.environment,active,true);if(!active()||goalReward===null)return;
 current.applyEvaluation(abilities,goalReward);evaluationCache.set(key,{abilities,goalReward});while(evaluationCache.size>6)evaluationCache.delete(evaluationCache.keys().next().value);
 sendModel();emit({type:'evaluation',active:false});
}
const sendModel=()=>emit({type:'model',model:learner.snapshot()});
const yieldControl=()=>new Promise(r=>setTimeout(r,0));
function preview(){emit({type:'preview',stage,source:lastCandidate?'candidate':'best',weights:[...(lastCandidate||learner.weights)],policyVersion:learner.policyVersion,attempts:learner.attempts,seed:lastTrial?.seed??31,pushPlan:lastTrial?.pushPlan||[],commandSchedule:lastTrial?.commandSchedule||[],observedTask:lastTrial?.task||stage,trainingSpec:lastTrial?.trainingSpec,scene:lastScenes[0]||null,scenes:lastScenes.slice(0,robotCount),team:robotCount,endOnFall:lastTrial?.endOnFall,spawnTilt:lastTrial?.spawnTilt,trainingSeconds:lastTrial?.trainingSeconds,terrainVariant:lastTrial?.terrainVariant,spawnRange:lastTrial?.spawnRange});}
async function initialize(data,token){
 activeGeneration=data.generation;
 rollouts?.close();robotCount=1;lastCandidate=null;lastTrial=null;lastScenes=[];
 rollouts=new ParallelRollouts({count:robotCount,enabled:robotCount>1&&data.parallel!==false});
 learner=new RobotLearner(data.saved||null,data.seed??Date.now(),data.environment||{},{deferEvaluation:true});learner.samplingRobots=robotCount;
 if(data.taskSettings)learner.taskSettings=loadTaskSettings({taskSettings:data.taskSettings});
 learner.onPhase=(phase,details)=>emit({type:'phase',phase,...details});stage=STAGES[data.stage]?data.stage:'balance';focus=STAGES[data.focus]?data.focus:stage;learner.setFocus(focus);
 await rollouts.start();if(token!==initToken)return;sendModel();preview();emit({type:'ready',parallelism:rollouts.concurrency,robots:robotCount});
 const current=learner,pool=rollouts;if(!current.evaluationPending){const key=current.id+':'+current.policyVersion+':'+evaluationSignature(current.environment);evaluationCache.set(key,{abilities:structuredClone(current.abilities),goalReward:current.goalReward});while(evaluationCache.size>6)evaluationCache.delete(evaluationCache.keys().next().value);}evaluationPromise=current.evaluationPending?evaluateEnvironment(current,pool,token).catch(error=>{if(token===initToken)emit({type:'error',message:'성능 기준 계산 오류: '+error.message});}):null;
}
self.onmessage=async({data})=>{
 try{
  if(data.type==='stop'){if(job){job.cancelled=true;if(job.waiting){emit({type:'done',completed:0,target:job.target,cancelled:true});job=null;}}return;}
  if(data.type==='settings'){interval=[10,20,50,100].includes(data.interval)?data.interval:interval;return;}
  if(data.type==='init'){if(job)job.cancelled=true;job=null;await initialize(data,++initToken);return;}
  if(data.type==='goal'){stage=STAGES[data.stage]?data.stage:stage;lastCandidate=null;lastTrial=null;lastScenes=[];preview();emit({type:'goal',stage});return;}
  if(data.type==='preview'){if(learner)preview();return;}
  if(data.type!=='train'||!learner||job)return;
  const target=Number(data.count);if(!(ALLOWED_ATTEMPTS.includes(target)||(data.internalTeam&&Number.isInteger(target)&&target>0&&target<=100000)))throw Error('지원하는 시도 횟수를 선택해 주세요.');
  const current={cancelled:false,waiting:true,target};job=current;emit({type:'training',active:true});
  if(evaluationPromise){emit({type:'phase',phase:'environment-validation'});await evaluationPromise;if(job!==current)return;if(learner.evaluationPending)throw Error('성능 기준 계산을 마친 뒤 다시 시작해 주세요.');}
  current.waiting=false;
  if(data.taskSettings)learner.taskSettings=loadTaskSettings({taskSettings:data.taskSettings});
  focus=STAGES[data.focus]?data.focus:focus;learner.setFocus(focus);learner.samplingRobots=robotCount;learner.setAlgorithm(data.algorithm||learner.algorithm);learner.setCurriculum(data.curriculum);learner.setBalanceTrainingSettings(data.balanceTraining);learner.setTrainingPushSettings(data.trainingPush);learner.setTrainingCommand(data.trainingCommand);learner.mixtureStart=learner.attempts;
  sendModel();let completed=0;const started=Date.now();emit({type:'training',active:true});
  while(completed<target&&job===current&&!current.cancelled){
   if(learner.pending.length>=learner.batchSize){await learner.checkpointAsync(yieldControl,()=>job===current&&!current.cancelled,rollouts.ready?rollouts:null,false);if(job!==current)return;sendModel();if(current.cancelled)break;}
   const slots=Math.min(robotCount,target-completed,learner.batchSize-learner.pending.length);
   const record=completed===0||Math.floor((completed+slots)/interval)>Math.floor(completed/interval)||completed+slots===target;
   // Freeze one actor for the entire collection group. CEM keeps its paired
   // candidate schedule; all sampling/updates/counters belong to this learner.
   const prepared=Array.from({length:slots},(_,i)=>{
    const p=learner.prepareTrial({record},i);
    if(p.algorithm==='ppo'&&robotCount>1){p.seed=(p.seed+Math.imul(p.index+1,104729))>>>0;if(Number.isFinite(p.options.spawnTilt))p.options.spawnTilt*=.8+i*.1;}
    return p;
   });
   const trials=await rollouts.batch(prepared);if(job!==current)return;
   for(let i=0;i<trials.length;i++){
    if(!trials[i])throw Error('로봇의 경험 수집이 중단되었습니다.');
    const result=learner.completeTrial(prepared[i],trials[i]);completed++;
    if(i===0){lastCandidate=result.weights;lastTrial=result;}
    if(record)lastScenes[i]=observationScene(trials[i]);
    emit({type:'progress',completed,target,attempts:learner.attempts,taskAttempts:{...learner.taskAttempts},algorithmAttempts:{...learner.algorithmAttempts},task:result.task,score:result.score,robotCount,travelRecord:learner.travelRecord,summary:record?{trainingSpec:trials[i].metrics.trainingSpec,attempt:learner.attempts,time:trials[i].metrics.time,reward:trials[i].metrics.reward,pushes:trials[i].metrics.pushes,terminationReason:trials[i].metrics.terminationReason}:null,remainingMs:(Date.now()-started)/completed*(target-completed)});
   }
   if(record)preview();
   if(!current.cancelled&&learner.pending.length>=learner.batchSize){emit({type:'phase',phase:'validation',completed,target});await learner.checkpointAsync(yieldControl,()=>job===current&&!current.cancelled,rollouts.ready?rollouts:null,completed===target);if(job!==current)return;sendModel();}
   await yieldControl();
  }
  if(job!==current)return;
  if(!current.cancelled&&(learner.pending.length||learner.validationBank)){await learner.checkpointAsync(yieldControl,()=>job===current&&!current.cancelled,rollouts.ready?rollouts:null,completed===target);if(job!==current)return;}
  // Completed in-flight episodes are all counted, even after stop. Drain a
  // large cohort before persistence so public snapshots stay compact.
  learner.flushLargePPOBuffer();sendModel();preview();job=null;emit({type:'done',completed,target,cancelled:current.cancelled});
 }catch(error){job=null;emit({type:'error',message:error.message||'학습 오류가 발생했습니다.'});}
};
