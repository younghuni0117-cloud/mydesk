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

test('retired models and controller archives cannot enter the new angle model',()=>{
 const fresh=new RobotLearner(null,42,{validationSeconds:6,monitorSeconds:6}).snapshot();
 assert.equal(fresh.version,8);assert.equal(fresh.attempts,0);assert.equal(fresh.travelRecord,null);
 assert.ok(fresh.weights.every(v=>v===0));assert.equal(fresh.ppo,null);assert.ok(!('controllerArchive' in fresh));
 assert.ok(fresh.history.every(r=>r.attempts===0));
 for(const old of [{...fresh,version:6,physicsVersion:5,policyKind:'direct-torque-12joint-mlp-v6'},{...fresh,version:7,policyKind:'joint-target-pd-12joint-mlp-v7'},{...fresh,controllerArchive:{model:{}}}])assert.equal(migrateModel(old),null);
 assert.equal(migrateModel(fresh),fresh);
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
 const fresh=l.snapshot(),api=sharedAPI(fresh),local=localMemory();
 const retired={...fresh,version:7,policyKind:'joint-target-pd-12joint-mlp-v7',attempts:100000};
 for(const key of ['mydesk.robot.v6','mydesk.robot.v5','mydesk.robot.archive.original','mydesk.robot.backup.v4'])local.setItem(key,JSON.stringify({model:retired,pending:true}));
 local.setItem('mydesk.robot.options','settings');local.setItem('mydesk.robot.skin','tin');local.setItem('calendar.test','keep');
 let deleted=0;const indexed={deleteDatabase(name){assert.equal(name,'mydesk.robot.local');deleted++;const request={};queueMicrotask(()=>request.onsuccess());return request;}};
 const a=new RobotSharedStorage(migrateModel,{local,indexed,fetcher:api.fetch,url:'https://example.test/rest/v1/model',key:'test'});
 const loaded=await a.load();assert.equal(loaded.blocked,false);assert.equal(loaded.model.version,8);assert.equal(loaded.model.attempts,2);assert.equal(deleted,1);
 assert.equal(local.getItem('mydesk.robot.v6'),null);assert.equal(local.getItem('mydesk.robot.archive.original'),null);
 assert.equal(local.getItem('mydesk.robot.options'),'settings');assert.equal(local.getItem('mydesk.robot.skin'),'tin');assert.equal(local.getItem('calendar.test'),'keep');
 assert.ok(api.requests.every(r=>r.options.method!=='POST'),'retired pending caches must not upload');
 assert.equal((await a.publish(retired,{force:true})).ok,false);
 assert.equal((await a.publish(fresh,{force:true})).ok,true);
 const b=new RobotSharedStorage(migrateModel,{local:localMemory(),fetcher:api.fetch,url:'https://example.test/rest/v1/model',key:'test'});
 assert.deepEqual((await b.load()).model,JSON.parse(JSON.stringify(fresh)));
});
