import test from 'node:test';
import assert from 'node:assert/strict';
import {World,Vec2,Box,RevoluteJoint} from '../vendor/planck.mjs';
import {JOINT_SERVOS,jointTargetAngle,jointServoTorque,CONTROL_KIND} from '../robot-actuation.mjs';
import {RobotWorld,JOINTS,POLICY_SIZE} from '../robot-core.mjs';
import {RobotLearner,migrateModel} from '../robot-learning.mjs';
import {PPOOptimizer,ppoEpisode} from '../robot-ppo.mjs';
import {executeTrial} from '../robot-rollouts.mjs';
import {RobotSharedStorage} from '../robot-shared-storage.mjs';
import {sharedAPI,localMemory} from './mock-shared-api.mjs';

test('angle targets preserve asymmetric anatomical limits and bounded damped torque',()=>{
 const world=new RobotWorld('balance',{autoPush:false});
 for(const m of world.motors){
  assert.ok(JOINT_SERVOS[m.name]);
  assert.equal(jointTargetAngle(-1,m.lower,m.upper),m.lower);
  assert.equal(jointTargetAngle(1,m.lower,m.upper),m.upper);
  assert.equal(Math.abs(jointTargetAngle(0,m.lower,m.upper)),0);
  for(const action of [-5,-1,-.2,0,.2,1,5])for(const angle of [-3,0,3])for(const speed of [-20,-1,0,1,20]){
   const t=jointServoTorque(m,action,angle,speed);
   assert.ok(Number.isFinite(t)&&Math.abs(t)<=m.torque);
  }
  assert.equal(Math.abs(jointServoTorque(m,0,0,0)),0);
  assert.ok(jointServoTorque(m,0,0,1)<0,'damps positive speed');
  assert.ok(jointServoTorque(m,0,0,-1)>0,'damps negative speed');
  assert.equal(jointServoTorque(m,1,-10,10),0,'no driving past speed envelope');
 }
 assert.equal(jointTargetAngle(.5,-2.6,0),0);
 assert.equal(jointTargetAngle(-.5,-2.6,0),-1.3);
 assert.equal(jointTargetAngle(-.5,0,2.6),0);
 assert.equal(jointTargetAngle(.5,0,2.6),1.3);
});

test('a physical servo reaches a learned target and returns after an impulse without teleporting',()=>{
 const world=new World(Vec2(0,0)),base=world.createBody(),body=world.createDynamicBody();
 body.createFixture(Box(.1,.3),{density:20});
 const joint=world.createJoint(RevoluteJoint({enableLimit:true,lowerAngle:-1,upperAngle:1},base,body,Vec2(0,0)));
 const motor={...JOINT_SERVOS.leftElbow,lower:-1,upper:1,torque:20},dt=1/720;
 const advance=()=>{const t=jointServoTorque(motor,.4,joint.getJointAngle(),joint.getJointSpeed());body.applyTorque(t);world.step(dt);};
 advance();assert.ok(joint.getJointAngle()>0&&joint.getJointAngle()<.01);
 for(let i=0;i<1440;i++)advance();
 assert.ok(Math.abs(joint.getJointAngle()-.4)<.002);
 body.applyAngularImpulse(.15);const before=Math.abs(joint.getJointSpeed());
 for(let i=0;i<1440;i++)advance();
 assert.ok(Math.abs(joint.getJointAngle()-.4)<.002);
 assert.ok(Math.abs(joint.getJointSpeed())<before*.01);
});

test('all real robot joints resist angle error even with zero learned outputs',()=>{
 const w=new RobotWorld('balance',{autoPush:false,spawnTilt:0});
 w.actions=Array(JOINTS.length).fill(0);w.torqueLoad=0;
 w.parts.head.setAngle(.3);
 const neck=w.motors.findIndex(m=>m.name==='neck');
 assert.ok(Math.abs(w.joints.neck.getJointAngle()-.3)<1e-12);
 w.applyActuation(1/720);
 assert.ok(w.activeTorques[neck]<0);
 assert.ok(w.torqueLoad>0);
 const knee=w.motors.findIndex(m=>m.name==='leftKnee');
 w.actions[knee]=-.3;w.applyActuation(1/720);
 assert.ok(w.activeTorques[knee]<0);
});

const legacyFixture=()=>{
 const old=new RobotLearner(null,42,{terrain:'meadow',validationSeconds:1,monitorSeconds:1}).snapshot();
 Object.assign(old,{version:6,physicsVersion:5,policyKind:'direct-torque-12joint-mlp-v6',attempts:12,modelAttempt:8,algorithmAttempts:{cem:4,ppo:8},taskAttempts:{balance:12,recover:0,walk:0,run:0,obstacles:0},controllerArchive:undefined});
 delete old.environment.controlKind;
 old.weights[624]=.2;old.ppo=new PPOOptimizer(old.weights,42).snapshot();
 old.ppo.actorAdam.t=10;old.ppo.actorAdam.m[0]=.01;
 old.ppo.buffer=[{obs:Array(65).fill(0),latent:Array(12).fill(0),value:0,reward:1,nextValue:0,oldLogP:0,done:false}];
 return old;
};

test('migration preserves the full torque controller and counters while separating new angle learning',()=>{
 const old=legacyFixture(),unchanged=structuredClone(old),m=migrateModel(old);
 assert.deepEqual(old,unchanged);assert.equal(m.version,7);assert.equal(m.policyKind,CONTROL_KIND);
 assert.deepEqual(m.controllerArchive.model,old);assert.ok(m.weights.every(v=>v===0));assert.equal(m.ppo,null);assert.deepEqual(m.pending,[]);
 assert.equal(m.attempts,12);assert.deepEqual(m.taskAttempts,old.taskAttempts);assert.deepEqual(m.history,old.history);
 const l=new RobotLearner(m,42,{terrain:'meadow',validationSeconds:1,monitorSeconds:1});
 assert.deepEqual(l.controllerArchive.model,old);assert.equal(l.environment.controlKind,CONTROL_KIND);
 assert.ok(l.history.some(r=>r.environment===JSON.stringify(l.environment)));
 const saved=l.snapshot();assert.ok(RobotLearner.valid(saved));assert.equal(migrateModel(saved),saved);
 assert.deepEqual(new RobotLearner(saved,42,l.environment).controllerArchive.model,old);
 assert.equal(migrateModel({...old,weights:[1]}),null);
});

test('PPO and CEM rollouts, observations and shared reload use the same angle controller',async()=>{
 const l=new RobotLearner(null,42,{validationSeconds:1,monitorSeconds:1});
 l.setBalanceTrainingSettings({trainingSeconds:1,balanceEarlyStop:false});l.setTrainingPushSettings({autoPush:false});
 for(const algorithm of ['ppo','cem']){
  l.setAlgorithm(algorithm);const p=l.prepareTrial({record:true}),a=executeTrial(p);
  assert.ok(Number.isFinite(a.metrics.reward));assert.ok(a.trace.length>0);
  if(algorithm==='ppo')assert.deepEqual(a.metrics,ppoEpisode(p).metrics);
  l.completeTrial(p,a);
 }
 const old=legacyFixture(),api=sharedAPI(old),a=new RobotSharedStorage(migrateModel,{local:localMemory(),fetcher:api.fetch,url:'https://example.test/rest/v1/model',key:'test'});
 const loaded=await a.load();assert.equal(loaded.blocked,false);assert.equal(loaded.model.version,7);assert.deepEqual(loaded.model.controllerArchive.model,JSON.parse(JSON.stringify(old)));
 assert.equal((await a.publish(loaded.model,{force:true})).ok,true);
 const b=new RobotSharedStorage(migrateModel,{local:localMemory(),fetcher:api.fetch,url:'https://example.test/rest/v1/model',key:'test'});
 assert.deepEqual((await b.load()).model,JSON.parse(JSON.stringify(loaded.model)));
});
