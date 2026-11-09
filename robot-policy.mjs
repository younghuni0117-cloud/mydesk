import {TERRAIN_SENSOR_COUNT} from './robot-sensors.mjs?v=robot46';
export const POLICY_KIND='direct-torque-12joint-mlp-v6';
export const POLICY_BODY_INPUTS=39,POLICY_INPUTS=39+TERRAIN_SENSOR_COUNT,POLICY_HIDDEN=12,POLICY_OUTPUTS=12;
export const OUTPUT_START=POLICY_BODY_INPUTS*POLICY_HIDDEN+POLICY_HIDDEN;
export const BIAS_START=OUTPUT_START+POLICY_HIDDEN*POLICY_OUTPUTS;
export const FEEDBACK_START=BIAS_START+POLICY_OUTPUTS;
export const POLICY_BASE_SIZE=FEEDBACK_START+6*POLICY_OUTPUTS,SENSOR_WEIGHT_OFFSET=POLICY_BASE_SIZE;
export const POLICY_SIZE=POLICY_BASE_SIZE+TERRAIN_SENSOR_COUNT*POLICY_HIDDEN;
export function policyActions(w,obs){const hidden=Array(POLICY_HIDDEN),actions=Array(POLICY_OUTPUTS);for(let h=0;h<POLICY_HIDDEN;h++){let s=w[POLICY_BODY_INPUTS*POLICY_HIDDEN+h]||0;for(let i=0;i<POLICY_BODY_INPUTS;i++)s+=(w[h*POLICY_BODY_INPUTS+i]||0)*(obs[i]||0);for(let j=0;j<TERRAIN_SENSOR_COUNT;j++)s+=(w[SENSOR_WEIGHT_OFFSET+h*TERRAIN_SENSOR_COUNT+j]||0)*(obs[POLICY_BODY_INPUTS+j]||0);hidden[h]=Math.tanh(s);}for(let o=0;o<POLICY_OUTPUTS;o++){let s=w[BIAS_START+o]||0;for(let h=0;h<POLICY_HIDDEN;h++)s+=(w[OUTPUT_START+o*POLICY_HIDDEN+h]||0)*hidden[h];const f=feedbackFeatures(obs,o);for(let j=0;j<6;j++)s+=(w[FEEDBACK_START+o*6+j]||0)*f[j];actions[o]=Math.tanh(s);}return actions;}
export function initialPolicy(seed=42,outputs=POLICY_OUTPUTS){let n=seed>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;},base=POLICY_BODY_INPUTS*12+12+12*outputs+outputs+(outputs===POLICY_OUTPUTS?outputs*6:0),w=Array(base+12*TERRAIN_SENSOR_COUNT).fill(0);for(let h=0;h<12;h++)for(let i=0;i<POLICY_BODY_INPUTS;i++)w[h*POLICY_BODY_INPUTS+i]=(random()-.5)*.5;for(let j=base;j<w.length;j++)w[j]=(random()-.5)*.2;return w;}
export function feedbackFeatures(obs,joint){return [(obs[12+joint]||0)*Math.PI,(obs[24+joint]||0)*8,(obs[0]||0)*4,(obs[2]||0)*8,(obs[4]||0)*3,(obs[6]||0)*2];}
export function upgradePolicyWeights(w){return Array.isArray(w)&&w.length===POLICY_SIZE&&w.every(Number.isFinite)?[...w]:null;}
export function extendV3Weights(){return null;}
