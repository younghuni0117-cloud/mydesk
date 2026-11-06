import {RobotLearner} from './robot-learning.mjs';
import {STAGES,episode} from './robot-core.mjs';
let learner=null,stage='balance',assist=.6,job=null,source='best',light=true,interval=4,lastCandidate=null;
const key=()=>`${stage}-${Math.round(assist*100)}`;
const sendModel=()=>postMessage({type:'model',key:key(),model:learner.snapshot()});
function preview(){
 const weights=source==='candidate'&&lastCandidate?lastCandidate:learner.weights;
 const result=episode(weights,stage,31,{assist,record:true});
 postMessage({type:'preview',key:key(),stage,assist,source,modelAttempt:learner.modelAttempt,attempts:learner.attempts,scene:result});
}
function initialize(message){
 stage=STAGES[message.stage]?message.stage:'balance';assist=[0,.3,.6].includes(message.assist)?message.assist:.6;
 learner=new RobotLearner(stage,message.saved||null,message.seed??Date.now(),{assist});lastCandidate=null;sendModel();preview();
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
self.onmessage=async({data})=>{
 try{
  if(data.type==='stop'){if(job)job.cancelled=true;return;}
  if(data.type==='settings'){source=data.source||source;light=data.light??light;interval=[4,8,12].includes(data.interval)?data.interval:interval;return;}
  if(data.type==='init'){if(job)job.cancelled=true;job=null;initialize(data);postMessage({type:'ready',key:key()});return;}
  if(data.type==='preview'){if(learner)preview();return;}
  if(data.type!=='train'||!learner||job)return;
  const target=Number(data.count);if(!Number.isInteger(target)||target<1||target>500)throw Error('학습 시도는 1~500회로 입력해 주세요.');
  const current={cancelled:false};job=current;let completed=0;
  postMessage({type:'training',active:true});
  while(completed<target&&job===current&&!current.cancelled){
   const result=learner.trainOne();lastCandidate=result.weights;completed++;
   postMessage({type:'progress',completed,target,attempts:learner.attempts,score:result.score,key:key()});
   if(completed%interval===0||completed===target){learner.checkpoint();sendModel();preview();
    if(data.curriculum&&learner.success===1&&learner.attempts>=24){
      const previous=learner.snapshot(),oldKey=key();const order=Object.keys(STAGES);let next=stage,nextAssist=assist;
      if(assist>0)nextAssist=assist===.6?.3:0;else next=order[Math.min(order.length-1,order.indexOf(stage)+1)];
      if(next!==stage||nextAssist!==assist){
        stage=next;assist=nextAssist;
        const saved=data.bank?.[key()]||{...previous,stage,options:{assist},attempts:0,modelAttempt:0,history:[],mean:[...previous.weights]};
        learner=new RobotLearner(stage,saved,Date.now(),{assist});lastCandidate=null;
        postMessage({type:'advance',from:oldKey,stage,assist});sendModel();preview();
      }
    }
   }
   await pause(light?65:0);
  }
  if(job!==current)return;
  learner.checkpoint();sendModel();preview();job=null;
  postMessage({type:'done',completed,target,cancelled:current.cancelled});
 }catch(error){job=null;postMessage({type:'error',message:error.message||'학습 중 오류가 발생했습니다.'});}
};
