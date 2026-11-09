import test from 'node:test';import assert from 'node:assert/strict';
import {RobotWorld,POLICY_SIZE,JOINTS,LOCKED_DISTAL_JOINTS,robotGeometry} from '../robot-core.mjs';
import {RobotLearner} from '../robot-learning.mjs';
import {PPOOptimizer} from '../robot-ppo.mjs';
import {rewardPopupLayout,robotScreenBounds,RewardFeedback,REWARD_FEEDBACK_INTERVAL} from '../robot-reward-feedback.mjs';
const zero=Array(POLICY_SIZE).fill(0),environment={terrain:'meadow',visionVersion:2,distalLocked:true};
test('four distal joints remain physical joints with neutral limits and no actuation under learned/random commands and impacts',()=>{
 const w=new RobotWorld('walk',{autoPush:false});assert.equal(w.bodies.length,17);assert.equal(w.motors.length,16);assert.ok(Math.abs(w.bodies.reduce((s,p)=>s+p.body.getMass(),0)-19.9)<1e-8);
 for(let i=0;i<240;i++){if(i===30){w.push(15,90,'leftHand');w.push(15,270,'rightToePart');}w.step(zero,false,Array.from({length:16},(_,j)=>Math.sin(i*.3+j)));for(const name of LOCKED_DISTAL_JOINTS){const j=JOINTS.indexOf(name);assert.equal(w.joints[name].getLowerLimit(),0);assert.equal(w.joints[name].getUpperLimit(),0);assert.equal(w.actions[j],0);assert.equal(w.activeTorques[j],0);assert.ok(Math.abs(w.joints[name].getJointAngle())<.04,name);}}
 assert.notEqual(w.joints.leftKnee.getLowerLimit(),w.joints.leftKnee.getUpperLimit());assert.notEqual(w.joints.leftElbow.getLowerLimit(),w.joints.leftElbow.getUpperLimit());
 const free=new RobotWorld('walk',{distalLocked:false});assert.equal(free.joints.leftToe.getLowerLimit(),-.35);assert.equal(free.joints.leftWrist.getLowerLimit(),-1.2);
});
test('locking keeps trained weights, optimizer moments, counts and history while invalidating only old-condition replay/candidate caches',()=>{
 const old=new RobotLearner(null,42,{...environment,distalLocked:false}).snapshot();old.attempts=12345;old.taskAttempts.balance=12345;old.algorithmAttempts.ppo=12345;old.ppo=new PPOOptimizer(zero,42).snapshot();old.ppo.actor[783]=.1;old.ppo.actorAdam.m[2]=.01;old.ppo.actorAdam.t=12;old.ppo.buffer=[{obs:Array(73).fill(0),latent:Array(16).fill(0),value:0,reward:1,nextValue:0,oldLogP:0,done:true}];old.searchArchive={ppo:structuredClone(old.ppo)};old.pending=[{weights:zero,score:1,task:'balance'}];const before=JSON.stringify(old),next=new RobotLearner(old,42,environment);assert.deepEqual(next.weights,old.weights);assert.deepEqual(next.ppo.actor,old.ppo.actor);assert.deepEqual(next.ppo.actorAdam,old.ppo.actorAdam);assert.equal(next.attempts,12345);assert.deepEqual(next.taskAttempts,old.taskAttempts);assert.deepEqual(next.ppo.buffer,[]);assert.deepEqual(next.searchArchive.ppo.buffer,[]);assert.deepEqual(next.pending,[]);assert.ok(next.history.some(r=>r.environment===JSON.stringify(old.environment)));assert.ok(next.history.some(r=>r.environment===JSON.stringify(environment)&&r.baseline));assert.equal(JSON.stringify(old),before);
});
test('CEM per-joint trials perturb active joints rather than wasting a whole trial on a disabled joint',()=>{
 const l=new RobotLearner(null,42,environment);l.setAlgorithm('cem');for(const offset of [8,9,10,11,20,21,22,23]){const p=l.prepareTrial({},offset),changed=JOINTS.filter((_,j)=>p.weights.slice(784+j*6,784+(j+1)*6).some((v,i)=>v!==l.mean[784+j*6+i]));assert.ok(changed.length>0);assert.ok(changed.every(j=>!LOCKED_DISTAL_JOINTS.includes(j)));}
});
test('score boxes avoid the entire robot silhouette and each other, including a folded pose and narrow screen',()=>{
 const w=new RobotWorld('balance',{autoPush:false}),frame=w.snapshot(),parts=robotGeometry(w).parts;
 for(const width of [320,390,900])for(const rotation of [0,.8,1.5]){const f={...frame,time:.2,parts:frame.parts.map(p=>[p[0],p[1],rotation]),rewardEvents:Array.from({length:8},(_,i)=>({id:i,time:0,value:i%2?-5:3,point:[0,.3+i*.18]}))},X=x=>width/2+x*100,Y=y=>300-y*100,bounds=robotScreenBounds(f,parts,X,Y),rows=rewardPopupLayout(f,X,Y,{parts,width,height:400});assert.ok(rows.length>0);for(let i=0;i<rows.length;i++){const b=rows[i].box;assert.ok(b.right<=bounds.left||b.left>=bounds.right||b.bottom<=bounds.top||b.top>=bounds.bottom);assert.ok(b.left>=2&&b.right<=width-2&&b.top>=2&&b.bottom<=398);for(const r of rows.slice(0,i))assert.ok(b.right<=r.box.left||b.left>=r.box.right||b.bottom<=r.box.top||b.top>=r.box.bottom);}}
});
test('continuous score batches are half as frequent without dropping rewards',()=>{
 const f=new RewardFeedback(),point=()=>[{body:'torso',point:[0,1],weight:1}];assert.equal(REWARD_FEEDBACK_INTERVAL,1);for(let i=1;i<=9;i++)f.collect(i/10,{standing:1},point);assert.equal(f.snapshot().length,0);f.collect(1,{standing:1},point);assert.equal(f.snapshot().length,1);assert.equal(f.snapshot()[0].value,10);
});
