import test from 'node:test';import assert from 'node:assert/strict';
import {RobotWorld,POLICY_SIZE,STAGES} from '../robot-core.mjs';
import {HUMAN_SEGMENTS,ROBOT_MASS,ROBOT_BODY_VERSION,STANDARD_GRAVITY,MOTOR_TORQUES} from '../robot-body.mjs';
import {RobotLearner} from '../robot-learning.mjs';
import {groundTestSpec} from '../robot-training-ground.mjs';
import {RevoluteJoint} from '../vendor/planck.mjs';
const zero=Array(POLICY_SIZE).fill(0);
test('70 kg anatomy has prescribed mass, COM and inertia including rigid hands and feet, in either facing',()=>{
 for(const facing of [-1,1]){const w=new RobotWorld('balance',{facing,spawnTilt:0});assert.equal(w.totalMass,70);assert.equal(w.world.getGravity().y,-STANDARD_GRAVITY);
  for(const {name,body}of w.bodies){const s=HUMAN_SEGMENTS[name],c=body.getLocalCenter();assert.equal(body.getMass(),s.mass);assert.deepEqual({...c},{x:s.center.x*facing,y:s.center.y});assert.ok(Math.abs(body.getInertia()-body.getMass()*(s.radius**2+c.x**2+c.y**2))<1e-9);}
  for(const m of w.motors)assert.equal(m.torque,MOTOR_TORQUES[m.name]);
 }
 const w=new RobotWorld('recover',{terrain:'training',trainingSpec:{...groundTestSpec(0),massScales:Array(13).fill(1.1)}});assert.ok(Math.abs(w.totalMass-77)<1e-9);for(const {name,body}of w.bodies)assert.ok(Math.abs(body.getMass()-HUMAN_SEGMENTS[name].mass*1.1)<1e-9);
});
test('passively suspending the head lets feet swing under it without a scripted action',()=>{
 const w=new RobotWorld('recover',{seed:42,recoveryStart:'lying-front',disturbances:false,observationSeconds:4});for(const {body}of w.bodies){const p=body.getPosition();body.setPosition({x:p.x,y:p.y+3});}
 const head=w.parts.head;w.world.createJoint(RevoluteJoint({},w.world.createBody(),head,head.getWorldCenter()));w.applyActuation=()=>0;w.resistWaist=()=>{};
 const initial=head.getPosition().y-w.parts.leftFoot.getPosition().y;while(!w.done)w.step(zero);const final=head.getPosition().y-w.parts.leftFoot.getPosition().y;assert.ok(initial<.2);assert.ok(final>1.4);assert.ok(w.snapshot().parts.flat().every(Number.isFinite));
});
test('body upgrade keeps trained policy and counts but re-evaluates old physical conditions',()=>{
 const old=new RobotLearner(null,42,{}, {deferEvaluation:true}).snapshot();old.environment.bodyVersion=7;delete old.environment.gravity;old.weights[0]=.42;old.attempts=123;old.taskAttempts.recover=123;old.algorithmAttempts.ppo=123;
 const l=new RobotLearner(old,42,{}, {deferEvaluation:true});assert.equal(l.id,old.id);assert.deepEqual(l.weights,old.weights);assert.equal(l.attempts,123);assert.equal(l.taskAttempts.recover,123);assert.equal(l.evaluationPending,true);assert.equal(l.environment.bodyVersion,ROBOT_BODY_VERSION);assert.equal(l.environment.gravity,STANDARD_GRAVITY);assert.deepEqual(l.history,old.history);
});
