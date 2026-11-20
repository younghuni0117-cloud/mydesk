import {Trainer as OneTrainer,evaluate as oneEvaluate,observe as oneObserve,advance as oneAdvance} from './evolution-training.mjs?v=evolution5';
import {TwoTrainer,twoEvaluate,twoObserve,twoAdvance} from './evolution-two-training.mjs?v=evolution5';
import {isTwo} from './evolution-model.mjs?v=evolution5';
export {ROLLOUT,BALANCE} from './evolution-training.mjs?v=evolution5';
export function Trainer(config={},seed=3197){return isTwo(config)?new TwoTrainer(config,seed):new OneTrainer(config,seed);}
export const observe=w=>isTwo(w.config)?twoObserve(w):oneObserve(w);
export const advance=(w,a)=>isTwo(w.config)?twoAdvance(w,a):oneAdvance(w,a);
export const evaluate=(policy,config={},confirm=false,probeStage=null)=>isTwo(config)?twoEvaluate(policy,config,confirm,probeStage):oneEvaluate(policy,config,confirm,probeStage);
