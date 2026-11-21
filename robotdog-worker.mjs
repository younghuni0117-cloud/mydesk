import {DogTrainer,validModel,freshModel} from './robotdog-learning.mjs?v=dog11';
let generation=0,trainer=null,paused=false;
self.onmessage=async({data})=>{
 if(data.type==='kick'){trainer?.queueKick(data.strength);return;}
 if(data.type==='pause'){paused=true;if(trainer)postMessage({type:'checkpoint',model:trainer.checkpoint()});return;}if(data.type==='resume'){paused=false;return;}
 if(data.type==='stop'){generation++;paused=false;if(trainer)postMessage({type:'done',model:trainer.checkpoint()});return;}
 if(data.type!=='train')return;const current=++generation,count=Math.max(1,Math.min(100000,Number(data.count)||100));paused=false;
 try{trainer=new DogTrainer(validModel(data.model)?data.model:freshModel(),data.options);for(let i=0;i<count;i++){while(paused&&current===generation)await new Promise(r=>setTimeout(r,100));if(current!==generation)return;const started=performance.now(),result=await trainer.trial(i%2===0);if(current!==generation)return;postMessage({type:'progress',completed:i+1,count,...result,model:trainer.checkpoint()});await new Promise(r=>setTimeout(r,Math.max(12,Math.min(80,(performance.now()-started)*.4))));}if(current===generation){await trainer.update();postMessage({type:'done',model:trainer.checkpoint()});}}catch(error){if(current===generation)postMessage({type:'error',message:error.message,model:trainer?.checkpoint()});}
};
