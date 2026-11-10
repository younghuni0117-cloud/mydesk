import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {normalizeRobotCount,samplingBatchSize} from '../robot-training-options.mjs';
import {RobotLearner} from '../robot-learning.mjs';
import {ParallelRollouts,executeTrial} from '../robot-rollouts.mjs';
import {PPOOptimizer,MAX_PPO_EXPERIENCES} from '../robot-ppo.mjs';
class BrowserWorker {
 constructor(){this.worker=new Worker(new URL('./robot-rollout-harness.mjs',import.meta.url));this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({error,preventDefault(){}}));}
 postMessage(data){this.worker.postMessage(data);} terminate(){this.worker.terminate();}
}
const env={validationSeconds:6,monitorSeconds:10,trainingGround:{focusRatio:1}};
test('one to five environments fit complete actor cohorts, including maximum horizons',()=>{
 assert.equal(normalizeRobotCount(undefined),1);assert.equal(normalizeRobotCount(9),5);assert.equal(normalizeRobotCount(2.5),1);
 for(let n=1;n<=5;n++)for(const seconds of [1,10,30,60,120])for(const hz of [10,20]){
  const batch=samplingBatchSize(seconds,hz,n);assert.equal(batch%n,0);assert.ok(batch>=n);assert.ok(batch*seconds*hz+255<=MAX_PPO_EXPERIENCES);
 }
});
test('five real parallel PPO environments match serial physics and pool experience in one actor',async()=>{
 const learner=new RobotLearner(null,42,env),pool=new ParallelRollouts({count:5,enabled:true,factory:()=>new BrowserWorker()});
 try{
  await pool.start();assert.equal(pool.concurrency,5);learner.samplingRobots=5;learner.setAlgorithm('ppo');learner.setCurriculum(false);learner.setBalanceTrainingSettings({trainingSeconds:1,balanceEarlyStop:false});learner.setTrainingPushSettings({autoPush:false});
  const actor=[...learner.ppo.actor],prepared=Array.from({length:5},(_,i)=>{const p=learner.prepareTrial({record:true},i);p.seed+=i*104729;return p;});
  assert.ok(prepared.every(p=>JSON.stringify(p.weights)===JSON.stringify(actor)));assert.equal(new Set(prepared.map(p=>p.noiseSeed)).size,5);
  const results=await pool.batch(prepared);let experiences=0;
  for(let i=0;i<5;i++){const serial=executeTrial(prepared[i]);assert.deepEqual(results[i],serial);experiences+=results[i].experience.length;learner.completeTrial(prepared[i],results[i]);assert.ok(results[i].trace.length>0);}
  assert.equal(learner.attempts,5);assert.equal(learner.taskAttempts.balance,5);assert.equal(learner.algorithmAttempts.ppo,5);assert.equal(learner.ppo.buffer.length,experiences);assert.deepEqual(learner.ppo.actor,actor);assert.ok(RobotLearner.valid(learner.snapshot()));
  assert.notDeepEqual(results[0].trace,results[1].trace);
 }finally{pool.close();}
});
test('CEM candidates use one distribution and preserve serial ordering across five lanes',async()=>{
 const learner=new RobotLearner(null,77,env),pool=new ParallelRollouts({count:5,enabled:true,factory:()=>new BrowserWorker()});
 try{
  await pool.start();learner.samplingRobots=5;learner.setAlgorithm('cem');learner.setCurriculum(false);learner.setBalanceTrainingSettings({trainingSeconds:1,balanceEarlyStop:false});
  for(let offset=0;offset<32;){const n=Math.min(5,32-offset),prepared=Array.from({length:n},(_,i)=>learner.prepareTrial({},i)),results=await pool.batch(prepared);for(let i=0;i<n;i++){assert.deepEqual(results[i].metrics,executeTrial(prepared[i]).metrics);learner.completeTrial(prepared[i],results[i]);}offset+=n;}
  assert.equal(learner.attempts,32);assert.equal(learner.pending.length,32);const before=[...learner.mean];learner.updateDistribution();assert.equal(learner.pending.length,0);assert.notDeepEqual(learner.mean,before);assert.ok(RobotLearner.valid(learner.snapshot()));
 }finally{pool.close();}
});
test('failed helper falls back without losing an episode',async()=>{
 const learner=new RobotLearner(null,42,env);learner.setBalanceTrainingSettings({trainingSeconds:1,balanceEarlyStop:false});
 const pool=new ParallelRollouts({count:5,enabled:true,factory:()=>{throw Error('unavailable');}});try{await pool.start();assert.equal(pool.concurrency,1);const prepared=Array.from({length:5},(_,i)=>learner.prepareTrial({},i)),results=await pool.batch(prepared);assert.equal(results.length,5);for(let i=0;i<5;i++)assert.deepEqual(results[i],executeTrial(prepared[i]));}finally{pool.close();}
});
test('large transient PPO cohorts drain safely before persistence without resetting integrated weights or counters',()=>{
 const learner=new RobotLearner(null,42,env),weights=[...learner.weights];learner.setAlgorithm('ppo');learner.setCurriculum(false);learner.setBalanceTrainingSettings({trainingSeconds:1,balanceEarlyStop:false});const experience=executeTrial(learner.prepareTrial()).experience;learner.ppo.buffer=Array.from({length:5000},(_,i)=>structuredClone(experience[i%experience.length]));
 assert.ok(PPOOptimizer.valid(learner.ppo));learner.flushLargePPOBuffer();assert.equal(learner.ppo.buffer.length,0);assert.ok(learner.ppo.updates>0);assert.ok(learner.ppo.actorAdam.t>0);assert.equal(learner.attempts,0);assert.deepEqual(learner.weights,weights);assert.ok(RobotLearner.valid(learner.snapshot()));assert.ok(Buffer.byteLength(JSON.stringify(learner.snapshot()))<8*1024*1024);
});
test('coordinator enforces one robot even when retired settings request five',async()=>{
 const worker=new Worker(new URL('./robot-worker-harness.mjs',import.meta.url)),messages=[];
 try{
  const done=new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',data=>{messages.push(data);if(data.type==='error')reject(Error(data.message));if(data.type==='harness-ready')worker.postMessage({type:'init',robotCount:5,seed:42,environment:env});if(data.type==='ready'){assert.equal(data.parallelism,1);worker.postMessage({type:'train',count:5,internalTeam:true,algorithm:'ppo',curriculum:false,balanceTraining:{trainingSeconds:1,balanceEarlyStop:false},trainingPush:{autoPush:false}});}if(data.type==='done')resolve(data);});});
  const result=await done;assert.equal(result.completed,5);const models=messages.filter(m=>m.type==='model').map(m=>m.model);assert.equal(new Set(models.map(m=>m.id)).size,1);assert.equal(models.at(-1).attempts,5);assert.equal(models.at(-1).algorithmAttempts.ppo,5);assert.ok(RobotLearner.valid(models.at(-1)));const preview=messages.filter(m=>m.type==='preview').at(-1);assert.equal(preview.scenes.length,1);assert.ok(preview.scenes.every(s=>s.trace.length>0));assert.equal(messages.filter(m=>m.type==='progress').length,5);
 }finally{await worker.terminate();}
});
