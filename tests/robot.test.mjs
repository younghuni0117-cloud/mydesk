import test from 'node:test';
import assert from 'node:assert/strict';
import {RobotWorld,JOINTS,POLICY_SIZE,episode,robotGeometry} from '../robot-core.mjs';
import {RobotLearner} from '../robot-learning.mjs';
const zero=Array(POLICY_SIZE).fill(0);
test('16 independently driven joints connect 17 rigid bodies',()=>{
 const s=new RobotWorld('walk',{assist:0});
 assert.equal(s.bodies.length,17);assert.equal(s.motors.length,16);assert.equal(new Set(JOINTS).size,16);
 assert.deepEqual(new Set(Object.keys(s.joints)),new Set(JOINTS));
 const altered=[...zero];altered[16+JOINTS.indexOf('leftKnee')]=2;
 const other=new RobotWorld('walk',{assist:0});for(let i=0;i<60;i++){s.step(zero);other.step(altered)}
 assert.notEqual(s.joints.leftKnee.getJointAngle(),other.joints.leftKnee.getJointAngle());
 assert.equal(robotGeometry(s).joints.length,16);
});
test('push direction, strength and application location change actual physics',()=>{
 const a=new RobotWorld('balance',{assist:0}),b=new RobotWorld('balance',{assist:0});
 a.push(2,0,'torso');b.push(8,180,'shoulder');
 assert.ok(a.parts.torso.getLinearVelocity().x>0);assert.ok(b.parts.torso.getLinearVelocity().x<0);
 assert.ok(b.parts.torso.getAngularVelocity()!==0,'off-centre shoulder impulse rotates torso');
 assert.ok(Math.abs(b.parts.torso.getLinearVelocity().x)>Math.abs(a.parts.torso.getLinearVelocity().x));
});
test('assisted motion is physical and can walk, move faster and recover',()=>{
 const walk=episode(zero,'walk',31,{assist:.6}),run=episode(zero,'run',31,{assist:.6}),recover=episode(zero,'recover',31,{assist:.6});
 assert.ok(walk.metrics.distance>1.5&&walk.metrics.upright>.6);
 assert.ok(run.metrics.speed>walk.metrics.speed);
 assert.ok(recover.metrics.recoveries>=1&&recover.metrics.height>.75);
 const unaided=episode(zero,'walk',31,{assist:0});assert.notEqual(unaided.metrics.reward,walk.metrics.reward,'assistance must not be hidden');
});
test('preview frames are actual physics snapshots and contain all joints',()=>{
 const result=episode(zero,'walk',31,{assist:.6,record:true});
 assert.ok(result.trace.length>100);assert.equal(result.parts.length,17);assert.equal(result.joints.length,16);
 assert.notDeepEqual(result.trace[0].parts,result.trace.at(-1).parts);
 assert.ok(result.trace.every(f=>f.parts.flat().every(Number.isFinite)));
 assert.equal(new RobotWorld('obstacles').obstacles.length,4);
});
test('learner counts real trials, searches policies and preserves its best validation score',()=>{
 const l=new RobotLearner('balance',null,42,{assist:0});const before=l.bestReward;
 for(let i=0;i<48;i++)l.trainOne();l.checkpoint();
 assert.equal(l.attempts,48);assert.ok(l.bestReward>=before);assert.ok(l.mean.some(v=>v!==0));
 assert.ok(l.history.every((r,i,a)=>i===0||r.best>=a[i-1].best));
 const saved=l.snapshot();assert.ok(RobotLearner.valid(saved));assert.equal(new RobotLearner('balance',saved,42,{assist:0}).attempts,48);
 assert.equal(RobotLearner.valid({...saved,weights:[NaN]}),false);
});
