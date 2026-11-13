import test from 'node:test';import assert from 'node:assert/strict';
import {recoveryPotential,recoveryStart,recoveryLyingProbability,updateRecoveryPractice,recoveryTestStart} from '../robot-recovery.mjs';
import {RobotWorld,seeded,POLICY_SIZE,evaluateAbility,VALIDATION_CASES} from '../robot-core.mjs';
import {rewardBreakdown} from '../robot-rewards.mjs';
import {RobotLearner} from '../robot-learning.mjs';
import {ParallelRollouts} from '../robot-rollouts.mjs';
test('height only earns progress when torso is upright; cyclic arches cannot farm progress',()=>{
 assert.ok(recoveryPotential(.9,0)>recoveryPotential(.9,1.4)*20);assert.ok(recoveryPotential(.5,0)>recoveryPotential(.9,Math.PI/2));assert.equal(recoveryPotential(.9,Math.PI),0);
 const s={dt:.1,height:.9,angle:0,speed:0,target:0,distance:0,dx:0,impactCost:100,work:100,torqueLoad:100,actionChange:100,recoveryPotential:1};
 const up=rewardBreakdown('recover',{...s,recoveryPotentialProgress:.2}),down=rewardBreakdown('recover',{...s,recoveryPotentialProgress:-.2});assert.equal(up.rise+down.rise,0);
 for(const key of ['torque','smoothness','effort','impact','distalMotion','distalChange'])assert.equal(up[key],0);
 assert.ok(Math.abs(rewardBreakdown('recover',{...s,recoveryLimitCost:1}).jointLimit+.02)<1e-10);
});
test('early random starts cover several easy poses and both lying directions, shifting only after genuine success',()=>{
 const random=seeded(42),kinds=new Set();let lying=0;for(let i=0;i<1000;i++){const p=recoveryStart(random,{recoveryLyingProbability:.1});kinds.add(p.kind);if(p.kind.startsWith('lying'))lying++;}
 assert.equal(kinds.size,5);assert.ok(lying>60&&lying<140);assert.equal(recoveryLyingProbability({successRate:0}),.1);
 let practice={};for(let i=0;i<100;i++)practice=updateRecoveryPractice(practice,{terminationReason:'duration',recoveries:1,finalUpright:true,recovering:false,stableTime:2});assert.ok(recoveryLyingProbability(practice)>.74);
 assert.equal(updateRecoveryPractice({}, {recoveries:0,finalUpright:false,stableTime:0}).successRate,0);assert.equal(recoveryLyingProbability({},false),.6);
 assert.equal(recoveryTestStart(0,2),'lying-front');assert.equal(recoveryTestStart(1,2),'lying-back');
});
test('initial pose construction preserves anchors, legal joints, floor clearance and zero velocities without motor commands',()=>{
 for(const kind of ['seated','kneeling','crouched','lying-front','lying-back']){
  const w=new RobotWorld('recover',{seed:42,recoveryStart:kind,disturbances:false});assert.equal(w.metrics().recoveryStart,kind);assert.equal(w.isDown,true);
  for(const m of w.motors){const a=m.joint.getAnchorA(),b=m.joint.getAnchorB();assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8,kind+' '+m.name);const q=m.joint.getJointAngle();assert.ok(q>=m.lower-1e-8&&q<=m.upper+1e-8,m.name);assert.equal(m.target,0);assert.equal(m.joint.isMotorEnabled(),false);}
  let minimum=Infinity;for(const {body}of w.bodies){assert.equal(body.getLinearVelocity().length(),0);assert.equal(body.getAngularVelocity(),0);for(let f=body.getFixtureList();f;f=f.getNext()){const shape=f.getShape();if(shape.getType()==='circle')minimum=Math.min(minimum,body.getWorldPoint(shape.getCenter()).y-shape.getRadius());else for(const v of shape.m_vertices)minimum=Math.min(minimum,body.getWorldPoint(v).y);}}
  assert.ok(minimum>=.024,kind+' floor '+minimum);assert.ok(w.metrics().height<.75,kind);w.step(Array(POLICY_SIZE).fill(0));assert.ok(Number.isFinite(w.reward));
 }
});
test('objective update keeps learned weights/counts/history, invalidates old evaluations and persists practice',()=>{
 const l=new RobotLearner(null,42,{}, {deferEvaluation:true}),old=l.snapshot();delete old.environment.recoveryVersion;old.weights[0]=.25;old.attempts=100;old.taskAttempts.recover=100;old.algorithmAttempts.ppo=100;
 const next=new RobotLearner(old,42,{}, {deferEvaluation:true});assert.deepEqual(next.weights,old.weights);assert.equal(next.attempts,100);assert.deepEqual(next.history,old.history);assert.equal(next.evaluationPending,true);assert.equal(next.environment.recoveryVersion,2);
 next.recoveryPractice={trials:10,successRate:.4};const restored=new RobotLearner(next.snapshot(),42,next.environment,{deferEvaluation:true});assert.deepEqual(restored.recoveryPractice,next.recoveryPractice);
});
test('serial and worker validation use the same fixed initial states, independent of curriculum success',async()=>{
 const weights=Array(POLICY_SIZE).fill(0),pool=new ParallelRollouts({enabled:false}),cases=VALIDATION_CASES.slice(0,2).map(c=>({...c,seconds:1}));
 try{const a=evaluateAbility(weights,'recover',{},cases),b=await pool.ability(weights,'recover',{},()=>true,cases);assert.deepEqual(a,b);assert.deepEqual(a.cases.map(c=>c.metrics.recoveryStart),['lying-front','lying-back']);}finally{pool.close();}
});
