import {trainingCondition} from './robot-training-ground.mjs?v=update76';

// Manual observation uses the configured distribution. Fixed validation specs
// belong to evaluation only; a recorded trial must retain its exact condition.
export function trainingPreviewSpec(options,model=null,trial=null){
 if(options.terrain!=='training')return undefined;
 if(trial?.trainingSpec)return trial.trainingSpec;
 return trainingCondition(model?.attempts??0,model?.searchSeed??31,options.trainingGround,1);
}
