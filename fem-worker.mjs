import {solveElastic} from './fem-solver.mjs?v=3';
self.onmessage=({data})=>{try {self.postMessage({type:'result',result:solveElastic(data)});}catch(e){self.postMessage({type:'error',message:e.message});}};
