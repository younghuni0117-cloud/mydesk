import {BipedTrainer,bipedEvaluate,bipedObserve,bipedAdvance} from './evolution-biped-training.mjs?v=biped7';
import {Trainer as OneTrainer,evaluate as oneEvaluate,observe as oneObserve,advance as oneAdvance} from './evolution-training.mjs?v=biped7';
import {TwoTrainer,twoEvaluate,twoObserve,twoAdvance} from './evolution-two-training.mjs?v=biped7';
import {isTwo,isBiped} from './evolution-model.mjs?v=biped7';
export {ROLLOUT,BALANCE} from './evolution-training.mjs?v=biped7';
export function Trainer(config={},seed=3197){return isBiped(config)?new BipedTrainer(config,seed):isTwo(config)?new TwoTrainer(config,seed):new OneTrainer(config,seed);}
export const observe=w=>isBiped(w.config)?bipedObserve(w):isTwo(w.config)?twoObserve(w):oneObserve(w);
export const advance=(w,a)=>isBiped(w.config)?bipedAdvance(w,a):isTwo(w.config)?twoAdvance(w,a):oneAdvance(w,a);
export const evaluate=(policy,config={},confirm=false,probeStage=null)=>isBiped(config)?bipedEvaluate(policy,config,confirm,probeStage):isTwo(config)?twoEvaluate(policy,config,confirm,probeStage):oneEvaluate(policy,config,confirm,probeStage);
