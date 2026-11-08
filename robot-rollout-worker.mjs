import {executeTrial} from './robot-rollouts.mjs?v=robot34';
import {episode} from './robot-core.mjs?v=robot34';
import {ppoEpisode} from './robot-ppo.mjs?v=robot34';
self.onmessage=({data})=>{
 if(data.type!=='rollout')return;
 try{const p=data.prepared;postMessage({type:'result',id:data.id,trial:executeTrial(p)});}
 catch(error){postMessage({type:'failure',id:data.id,message:error.message});}
};
postMessage({type:'ready'});
