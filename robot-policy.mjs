import {TERRAIN_SENSOR_COUNT} from './robot-sensors.mjs?v=robot39';
// A state-feedback neural policy. There are no gait clocks, target poses or reflex controllers.
export const POLICY_KIND='direct-torque-terrain-mlp-v4';
export const POLICY_BODY_INPUTS=47,POLICY_INPUTS=47+TERRAIN_SENSOR_COUNT,POLICY_HIDDEN=12,POLICY_OUTPUTS=16;
export const POLICY_BASE_SIZE=880,SENSOR_WEIGHT_OFFSET=880;
export const POLICY_SIZE=POLICY_BASE_SIZE+TERRAIN_SENSOR_COUNT*POLICY_HIDDEN;
export function policyActions(weights,observations){
 const hidden=Array(POLICY_HIDDEN),actions=Array(POLICY_OUTPUTS);let cursor=0;
 for(let h=0;h<POLICY_HIDDEN;h++){let sum=0;for(let i=0;i<POLICY_BODY_INPUTS;i++)sum+=(weights[cursor++]||0)*(observations[i]||0);hidden[h]=sum;}
 for(let h=0;h<POLICY_HIDDEN;h++)for(let j=0;j<TERRAIN_SENSOR_COUNT;j++)hidden[h]+=(weights[SENSOR_WEIGHT_OFFSET+h*TERRAIN_SENSOR_COUNT+j]||0)*(observations[POLICY_BODY_INPUTS+j]||0);
 for(let h=0;h<POLICY_HIDDEN;h++)hidden[h]=Math.tanh(hidden[h]+(weights[cursor++]||0));
 for(let o=0;o<POLICY_OUTPUTS;o++){let sum=0;for(let h=0;h<POLICY_HIDDEN;h++)sum+=(weights[cursor++]||0)*hidden[h];actions[o]=sum;}
 for(let o=0;o<POLICY_OUTPUTS;o++){let value=actions[o]+(weights[cursor++]||0);const f=feedbackFeatures(observations,o);for(let j=0;j<6;j++)value+=(weights[784+o*6+j]||0)*f[j];actions[o]=Math.tanh(value);}
 return actions;
}

// Append goal sensor columns with zero influence; old state-feedback is preserved exactly.
export function extendV3Weights(old,spread=false){
 if(!Array.isArray(old)||old.length!==748)return null;
 const next=[];for(let h=0;h<12;h++)next.push(...old.slice(h*44,(h+1)*44),...Array(3).fill(spread ? .3 : 0));
 next.push(...old.slice(44*12));return next;
}

export function initialPolicy(seed=42,outputs=POLICY_OUTPUTS){let n=seed>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;},I=POLICY_BODY_INPUTS,H=POLICY_HIDDEN,base=I*H+H+H*outputs+outputs+(outputs===16?96:0),w=Array(base+H*TERRAIN_SENSOR_COUNT).fill(0),gain=i=>i===0?6:i===2?8:i===4||i===5?3:i>=12&&i<28?3:i>=28&&i<44?4:1;for(let h=0;h<H;h++){for(let i=0;i<I;i++)w[h*I+i]=(random()-.5)*.4*gain(i);w[I*H+h]=-w[h*I+1]-.85*w[h*I+3]-w[h*I+11]-.5*(w[h*I+7]+w[h*I+8]);}for(let j=base;j<w.length;j++)w[j]=(random()-.5)*.2;return w;}

export function feedbackFeatures(obs,joint){return [(obs[12+joint]||0)*Math.PI,(obs[28+joint]||0)*8,(obs[0]||0)*4,(obs[2]||0)*8,(obs[4]||0)*3,(obs[6]||0)*2];}

// Existing 784 learned coefficients stay byte-for-byte as the prefix. New paths
// start at zero and therefore add no posture controller or initial movement.
export function upgradePolicyWeights(old,spread=false){if(!Array.isArray(old)||![784,880,POLICY_SIZE].includes(old.length)||!old.every(Number.isFinite))return null;if(old.length===POLICY_SIZE)return [...old];const base=old.length===784?[...old,...Array(96).fill(spread?.2:0)]:old;return [...base,...Array(POLICY_SIZE-880).fill(spread?.2:0)];}
