import {Pendulum} from './evolution-core.mjs?v=evolution4';
import {PPO,policyAction} from './evolution-ppo.mjs?v=evolution4';
import {evaluate,observe,advance} from './evolution-training.mjs?v=evolution4';
import {contextKey,checksum} from './evolution-storage.mjs?v=evolution4';
// Evaluation and trajectories never call PPO.update, collect or stochastic action sampling.
export function* comparePolicies(a,b){if(contextKey(a.data.trainer.config)!==contextKey(b.data.trainer.config))throw Error('서로 다른 미션 또는 물리 조건은 비교할 수 없습니다.');const config={...a.data.trainer.config},results=[];
 for(const record of [a,b]){const before=checksum(record.data.trainer.network),ppo=new PPO();ppo.restore(record.data.trainer.network);const policy=ppo.policy(),it=evaluate(policy,config);let r;do{r=it.next();if(!r.done)yield {policy:results.length,phase:'evaluation'};}while(!r.done);const evaluation=r.value,initial=evaluation.cases[0].initial,world=new Pendulum({...config,...initial,diagnostics:false}),frames=[world.frame()];let i=0;while(world.time<evaluation.cases[0].time-1e-8){advance(world,policyAction(policy,observe(world)));frames.push(world.frame());if(++i%30===0)yield {policy:results.length,phase:'trajectory'};}if(checksum(ppo.snapshot())!==before||checksum(record.data.trainer.network)!==before)throw Error('평가 중 정책 상태가 변경되었습니다.');results.push({version:1,policyId:record.id,config,initial,evaluation,frames,fingerprint:before});
 }return {version:1,context:contextKey(config),results};}
