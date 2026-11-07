import {episode} from './robot-core.mjs?v=robot21';
self.onmessage=({data})=>{
 if(data.type!=='rollout')return;
 try{const p=data.prepared;postMessage({type:'result',id:data.id,trial:episode(p.weights,p.task,p.seed,p.options)});}
 catch(error){postMessage({type:'failure',id:data.id,message:error.message});}
};
postMessage({type:'ready'});
