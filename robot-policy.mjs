// A state-feedback neural policy. There are no gait clocks, target poses or reflex controllers.
export const POLICY_KIND='direct-torque-mlp-v1';
export const POLICY_INPUTS=44,POLICY_HIDDEN=12,POLICY_OUTPUTS=16;
export const POLICY_SIZE=POLICY_INPUTS*POLICY_HIDDEN+POLICY_HIDDEN+POLICY_HIDDEN*POLICY_OUTPUTS+POLICY_OUTPUTS;
export function policyActions(weights,observations){
 const hidden=Array(POLICY_HIDDEN),actions=Array(POLICY_OUTPUTS);let cursor=0;
 for(let h=0;h<POLICY_HIDDEN;h++){let sum=0;for(let i=0;i<POLICY_INPUTS;i++)sum+=(weights[cursor++]||0)*(observations[i]||0);hidden[h]=sum;}
 for(let h=0;h<POLICY_HIDDEN;h++)hidden[h]=Math.tanh(hidden[h]+(weights[cursor++]||0));
 for(let o=0;o<POLICY_OUTPUTS;o++){let sum=0;for(let h=0;h<POLICY_HIDDEN;h++)sum+=(weights[cursor++]||0)*hidden[h];actions[o]=sum;}
 for(let o=0;o<POLICY_OUTPUTS;o++)actions[o]=Math.tanh(actions[o]+(weights[cursor++]||0));
 return actions;
}
