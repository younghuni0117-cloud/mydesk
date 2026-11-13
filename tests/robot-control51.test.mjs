import test from 'node:test';
import assert from 'node:assert/strict';
import {RobotWorld,DT,POLICY_SIZE,JOINTS} from '../robot-core.mjs';
import {RobotLearner} from '../robot-learning.mjs';
import {PPOOptimizer} from '../robot-ppo.mjs';
import {normalizeActuation,advanceJointTarget,jointTargetAngle} from '../robot-actuation.mjs';
import {ACTION_EXPLORATION_SCALES} from '../robot-policy.mjs';
import {endBalanceTrialEarly,fullTrialPeriod,effectiveTrainingPush} from '../robot-training-options.mjs';
import {RobotSharedStorage,ROBOT_CACHE_KEY} from '../robot-shared-storage.mjs';
import {sharedAPI,localMemory} from './mock-shared-api.mjs';

test('response profiles change actual restoring torque without changing mass or torque caps',()=>{
 const results={};
 for(const profile of ['soft','standard','firm']){
  const w=new RobotWorld('balance',{servoProfile:profile,autoPush:false,spawnTilt:0});
  w.parts.head.setAngle(.1);w.torqueLoad=0;w.applyActuation(DT/12);
  results[profile]=Math.abs(w.activeTorques[JOINTS.indexOf('neck')]);
  assert.equal(w.motors.find(m=>m.name==='neck').torque,8);
  assert.ok(Math.abs(w.bodies.reduce((s,b)=>s+b.body.getMass(),0)-19.9)<1e-8);
 }
 assert.ok(Math.abs(results.soft/results.standard-.65)<1e-12);
 assert.ok(Math.abs(results.firm/results.standard-1.35)<1e-12);
 assert.deepEqual(normalizeActuation({servoProfile:'invalid',targetSpeed:5001}),{servoProfile:'standard',targetSpeed:180,targetVelocity:360,residualTorque:.2,actuationVersion:3});
});

test('target slew stays within the selected physical speed, including substeps and reversals',()=>{
 let target=0;for(let i=0;i<720;i++)target=advanceJointTarget(target,2,60,1/720);
 assert.ok(Math.abs(target-Math.PI/3)<1e-10);
 assert.equal(advanceJointTarget(1,1.01,180,1),1.01);
 const w=new RobotWorld('walk',{targetSpeed:90,servoProfile:'firm',autoPush:false,observationSeconds:1});
 for(let n=0;n<24;n++){
  const before=w.motors.map(m=>m.target);w.step(Array(POLICY_SIZE).fill(0),false,Array(12).fill(n<12?1:-1));
  for(let i=0;i<12;i++){
   const m=w.motors[i];assert.ok(Math.abs(m.target-before[i])<=Math.PI/2*DT+1e-10);
   assert.ok(m.target>=m.lower-1e-10&&m.target<=m.upper+1e-10);
   assert.ok(Math.abs(w.activeTorques[i])<=m.torque);
  }
 }
});

test('one-way joints use both exploration signs without a prescribed bend at zero',()=>{
 for(const [lo,hi]of [[-2.6,0],[0,2.6]]){
  assert.equal(Math.abs(jointTargetAngle(0,lo,hi)),0);
  for(const a of [.01,.1,.5,1]){
   assert.equal(jointTargetAngle(a,lo,hi),jointTargetAngle(-a,lo,hi));
   assert.ok(Math.abs(jointTargetAngle(a,lo,hi))>0);
  }
 }
 const ppo=new PPOOptimizer(Array(POLICY_SIZE).fill(0),42);
 assert.equal(ACTION_EXPLORATION_SCALES.length,36);
 assert.ok(ppo.logStd[JOINTS.indexOf('neck')]>ppo.logStd[JOINTS.indexOf('leftShoulder')]);
});

test('full trial periods use actual attempts and keep paired CEM conditions together',()=>{
 assert.equal(fullTrialPeriod(7,'cem'),8);assert.equal(fullTrialPeriod(7,'ppo'),7);
 assert.deepEqual(Array.from({length:8},(_,i)=>endBalanceTrialEarly({balanceFullEvery:8},'ppo',i)),[true,true,true,true,true,true,true,false]);
 assert.deepEqual(Array.from({length:8},(_,i)=>endBalanceTrialEarly({balanceFullEvery:8},'cem',i)),[true,true,true,true,true,true,false,false]);
 assert.equal(effectiveTrainingPush({stage:'balance',autoPush:true,curriculum:true,horizon:2,trainingSeconds:10}),false);
 assert.equal(effectiveTrainingPush({stage:'balance',autoPush:true,curriculum:false,horizon:2,trainingSeconds:10}),true);
 assert.equal(effectiveTrainingPush({stage:'walk',autoPush:true,curriculum:true,horizon:2,trainingSeconds:10}),true);
});

test('control settings survive model reload and reach both learning algorithms without losing counters',()=>{
 const env={terrain:'meadow',validationSeconds:6,monitorSeconds:10,servoProfile:'firm',targetSpeed:90};
 const l=new RobotLearner(null,42,env);l.setBalanceTrainingSettings({trainingSeconds:1});
 for(const algorithm of ['cem','ppo']){l.setAlgorithm(algorithm);const p=l.prepareTrial();assert.equal(p.options.servoProfile,'firm');assert.equal(p.options.targetSpeed,90);assert.equal(new RobotWorld(p.task,p.options).actuation.servoProfile,'firm');}
 l.trainOne();const saved=l.snapshot();assert.ok(saved.ppo.buffer.length>0);
 const same=new RobotLearner(saved,42,env);assert.deepEqual(same.ppo.buffer,saved.ppo.buffer);
 const changed=new RobotLearner(saved,42,{...env,servoProfile:'soft',targetSpeed:120});
 assert.equal(changed.id,saved.id);assert.equal(changed.attempts,1);assert.deepEqual(changed.weights,saved.weights);
 assert.deepEqual(changed.ppo.actor,saved.ppo.actor);assert.equal(changed.ppo.buffer.length,0);
 assert.equal(changed.environment.servoProfile,'soft');assert.equal(changed.environment.targetSpeed,120);
 assert.ok(changed.history.some(r=>r.environment===JSON.stringify(changed.environment)));
 assert.ok(RobotLearner.valid(changed.snapshot()));
});

test('current-model local travel survives reload but cannot cross an explicit model reset',async()=>{
 const record=x=>({x,y:0,distance:x,basis:'forward-contact-v1',attempt:1,body:'leftFoot',task:'walk',terrain:'meadow'});
 const model={id:'same',version:8,travelRecord:record(1)},api=sharedAPI(model),local=localMemory();
 local.setItem(ROBOT_CACHE_KEY,JSON.stringify({model:{...model,travelRecord:record(2)}}));
 const options={local,fetcher:api.fetch,url:'https://example.test/model',key:'test'},decode=m=>m?.version===8?m:null;
 assert.equal((await new RobotSharedStorage(decode,options).load()).model.travelRecord.x,2);
 api.replace({...model,id:'reset',travelRecord:null});
 assert.equal((await new RobotSharedStorage(decode,options).load()).model.travelRecord,null);
});
