import {executeTrial} from './robot-rollouts.mjs?v=update71';
self.onmessage=({data})=>{
 if(data.type!=='rollout')return;
 try{const p=data.prepared;postMessage({type:'result',id:data.id,trial:executeTrial(p)});}
 catch(error){postMessage({type:'failure',id:data.id,message:error.message});}
};
postMessage({type:'ready'});
