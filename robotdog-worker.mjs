import {yieldToMessages} from './robotdog-scheduler.mjs?v=dog22';
import {DogTrainer,validModel,freshModel,POLICY_IDS} from './robotdog-learning.mjs?v=dog26';
let generation=0,trainer=null,paused=false;
self.onmessage=async({data})=>{
 if(data.type==='kick'){trainer?.queueKick(data.strength);return;}
 if(data.type==='pause'){paused=true;if(trainer)postMessage({type:'checkpoint',model:trainer.checkpoint()});return;}if(data.type==='resume'){paused=false;return;}
 if(data.type==='stop'){generation++;paused=false;if(trainer)postMessage({type:'done',model:trainer.checkpoint()});return;}
 if(data.type!=='train')return;const current=++generation,count=Math.max(1,Math.min(100000,Number(data.count)||100));paused=false;
 try{trainer=new DogTrainer(validModel(data.model)?data.model:freshModel(),data.options);trainer.onPhase=phase=>{if(current===generation)postMessage({type:'phase',...phase});};trainer.isPaused=()=>paused;trainer.isCancelled=()=>current!==generation;for(let i=0;i<count;i++){while(paused&&current===generation)await new Promise(r=>setTimeout(r,100));if(current!==generation)return;const result=await trainer.trial(i%2===0);if(current!==generation)return;postMessage({type:'progress',completed:i+1,count,...result,model:trainer.checkpoint()});await yieldToMessages();}if(current===generation){for(const id of POLICY_IDS)await trainer.update(id);postMessage({type:'done',model:trainer.checkpoint()});}}catch(error){if(current===generation)postMessage({type:'error',message:error.message,model:trainer?.checkpoint()});}
};
