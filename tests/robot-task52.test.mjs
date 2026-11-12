import test from 'node:test';
import assert from 'node:assert/strict';
import {TASK_DEFAULTS,loadTaskSettings,taskProfile,taskEnvironments,taskEnvironment,applySharedTaskEnvironment} from '../robot-task-settings.mjs';
import {RobotWorld,POLICY_SIZE,evaluateAbility,VALIDATION_CASES} from '../robot-core.mjs';
import {ParallelRollouts} from '../robot-rollouts.mjs';
import {RobotLearner} from '../robot-learning.mjs';

test('each ability has its own suitable duration, disturbance and motion defaults',()=>{
 const map=loadTaskSettings({});
 assert.deepEqual(Object.values(map).map(p=>[p.trainingSeconds,p.validationSeconds,p.monitorSeconds]),[[10,10,30],[30,30,60],[15,15,45],[20,20,60],[15,10,30],[15,10,30],[20,15,30],[30,20,45]]);
 assert.equal(map.recover.autoPush,false);assert.equal(map.fight.autoPush,false);
 assert.equal(map.balance.autoPush,true);assert.equal(map.run.targetSpeed,240);
 assert.ok(Object.values(map).every(p=>p.algorithm==='ppo'&&p.attemptCount===10000&&p.monitorSeconds>=p.validationSeconds));
 map.recover.trainingSeconds=45;assert.equal(map.balance.trainingSeconds,10);assert.equal(TASK_DEFAULTS.recover.trainingSeconds,30);
 map.walk.trainingSeconds=19;map.recover=taskProfile('recover');assert.equal(map.walk.trainingSeconds,19);assert.equal(map.recover.trainingSeconds,30);
});

test('legacy edits migrate only to their selected task and per-task settings survive JSON reload',()=>{
 const map=loadTaskSettings({focus:'recover',trainingSeconds:47,validationSeconds:40,monitorSeconds:60,autoPush:true});
 assert.equal(map.recover.trainingSeconds,47);assert.equal(map.recover.validationSeconds,40);assert.equal(map.recover.autoPush,true);
 assert.equal(map.balance.trainingSeconds,10);assert.equal(map.walk.trainingSeconds,15);
 assert.deepEqual(loadTaskSettings(JSON.parse(JSON.stringify({taskSettings:map,focus:'walk',trainingSeconds:99}))),map);
 const otherDevice=loadTaskSettings({},map);assert.equal(otherDevice.recover.trainingSeconds,47);
 assert.equal(taskProfile('run',{targetSpeed:1600}).targetSpeed,240);
 assert.equal(taskProfile('recover',{trainingSeconds:0}).trainingSeconds,30);
});

test('task-specific physical settings are shared without overwriting another task or local learning horizon',()=>{
 const map=loadTaskSettings({});map.recover.trainingSeconds=45;map.walk.validationSeconds=18;
 const changed=taskEnvironments(map);changed.recover={...changed.recover,servoProfile:'soft',targetSpeed:120,validationSeconds:35};
 applySharedTaskEnvironment(map,{taskEnvironments:changed});assert.equal(map.recover.trainingSeconds,45);assert.equal(map.recover.validationSeconds,35);assert.equal(map.walk.validationSeconds,18);
 const env={servoProfile:'firm',targetSpeed:360,taskEnvironments:taskEnvironments(map)};
 const w=new RobotWorld('recover',env);assert.equal(w.actuation.servoProfile,'soft');assert.equal(w.actuation.targetSpeed,120);
 assert.equal(taskEnvironment(env,'walk').validationSeconds,18);
});

test('serial and parallel validation both run the selected task duration rather than one global duration',async()=>{
 const map=loadTaskSettings({});for(const p of Object.values(map)){p.validationSeconds=6;p.monitorSeconds=10;}
 map.recover.validationSeconds=7;
 const env={validationSeconds:20,taskEnvironments:taskEnvironments(map)},weights=Array(POLICY_SIZE).fill(0),cases=[VALIDATION_CASES[0]],pool=new ParallelRollouts({enabled:false});
 for(const [task,seconds]of [['balance',6],['recover',7]]){
  const serial=evaluateAbility(weights,task,env,cases),parallel=await pool.ability(weights,task,env,()=>true,cases);
  assert.ok(Math.abs(serial.cases[0].metrics.time-seconds)<1e-8);assert.deepEqual(parallel,serial);
 }
 pool.close();
});

test('profile metadata and per-task validation settings preserve one integrated learner',()=>{
 const map=loadTaskSettings({});for(const p of Object.values(map)){p.validationSeconds=6;p.monitorSeconds=10;}
 const env={taskEnvironments:taskEnvironments(map),trainingGround:{focusRatio:1}},l=new RobotLearner(null,42,env);l.taskSettings=map;
 const id=l.id;for(const task of Object.keys(map)){l.setFocus(task);l.setBalanceTrainingSettings(map[task]);l.setCurriculum(false);assert.equal(l.prepareTrial().options.observationSeconds,map[task].trainingSeconds);assert.equal(l.id,id);}
 l.setFocus('recover');l.setBalanceTrainingSettings({trainingSeconds:2});l.setTrainingPushSettings({autoPush:false});for(const algorithm of ['ppo','cem']){l.setAlgorithm(algorithm);const result=l.trainOne();assert.ok(Number.isFinite(result.score));assert.ok(result.trainingSeconds===2);}
 const saved=l.snapshot();saved.ppo.buffer=[{obs:Array(141).fill(0),latent:Array(36).fill(0),value:0,reward:1,nextValue:0,oldLogP:0,done:false}];const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reorder(x)])):v;const loaded=new RobotLearner(reorder(saved),42,reorder(env));assert.equal(loaded.environmentChanged,false);assert.deepEqual(loaded.ppo.buffer,saved.ppo.buffer);assert.deepEqual(loaded.taskSettings,map);assert.deepEqual(loaded.weights,l.weights);assert.equal(loaded.attempts,l.attempts);assert.equal(loaded.id,id);
});
