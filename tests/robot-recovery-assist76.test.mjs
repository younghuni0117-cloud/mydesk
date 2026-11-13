import test from 'node:test';import assert from 'node:assert/strict';
import {recoveryAssistOptions,recoveryAssistOutput,updateRecoveryPractice} from '../robot-recovery.mjs';
import {taskProfile,loadTaskSettings} from '../robot-task-settings.mjs';
import {RobotWorld,POLICY_SIZE,evaluateAbility,VALIDATION_CASES} from '../robot-core.mjs';
import {RobotLearner} from '../robot-learning.mjs';
import {ParallelRollouts} from '../robot-rollouts.mjs';
const zero=Array(POLICY_SIZE).fill(0);
test('numeric per-task setting survives reload; zero disables, default is 120 N',()=>{
 assert.equal(taskProfile('recover').recoveryAssistForce,120);assert.equal(taskProfile('balance').recoveryAssistForce,0);
 const settings={recover:taskProfile('recover',{recoveryAssistForce:237,recoveryAssistAutoReduce:false})};assert.deepEqual(loadTaskSettings({taskSettings:settings}).recover,settings.recover);assert.equal(taskProfile('recover',{recoveryAssistForce:501}).recoveryAssistForce,120);
 assert.equal(recoveryAssistOptions({recoveryAssistForce:0}).recoveryAssistForce,0);
 assert.equal(recoveryAssistOptions({recoveryAssistForce:500},{assistScale:.5}).recoveryAssistForce,250);
 assert.equal(recoveryAssistOptions({recoveryAssistForce:500,recoveryAssistAutoReduce:false},{assistScale:0}).recoveryAssistForce,500);
 for(let i=0;i<8;i++)assert.equal(recoveryAssistOptions({}, {trials:i}).recoveryAssistForce,i%4===3?0:120);
});
test('fade only on genuine completed recovery, reaches zero and persists without resetting model',()=>{
 let p={trials:0,successRate:0};const success={terminationReason:'duration',recoveries:1,finalUpright:true,recovering:false,stableTime:2,recoveryStart:'lying-front',recoveryAssistAutoReduce:true,recoveryAssistMaxUsed:120};
 assert.equal(updateRecoveryPractice(p,{...success,recoveries:0}).assistScale,undefined);
 assert.equal(updateRecoveryPractice(p,{...success,recoveryStart:'seated',recoveryAssistMaxUsed:0}).assistScale,undefined);
 for(let i=0;i<16;i++)p=updateRecoveryPractice(p,success);assert.equal(p.assistScale,0);
 const learner=new RobotLearner(null,42,{}, {deferEvaluation:true});learner.recoveryPractice=p;const before=learner.snapshot(),after=new RobotLearner(before,42,before.environment,{deferEvaluation:true});assert.deepEqual(after.recoveryPractice,p);assert.deepEqual(after.weights,before.weights);assert.equal(after.id,before.id);
});
test('upward force waits for lying stall, ramps and stops at standing height or upward speed',()=>{
 const s={force:500,height:.3,verticalSpeed:0,stallSeconds:2,rampSeconds:1};assert.equal(recoveryAssistOutput(s),500);assert.equal(recoveryAssistOutput({...s,stallSeconds:1}),0);assert.equal(recoveryAssistOutput({...s,height:.9}),0);assert.equal(recoveryAssistOutput({...s,verticalSpeed:1}),0);
 const assisted=new RobotWorld('recover',{seed:42,recoveryStart:'lying-front',disturbances:false,recoveryAssistTraining:true,recoveryAssistForce:120});
 const pelvis=assisted.parts.pelvis,position=pelvis.getPosition();assert.ok(assisted.metrics().height<.65);assisted.recoveryAssistStall=2;assisted.recoveryAssistElapsed=1;
 const before={...pelvis.m_force};assisted.applyRecoveryAssist(1/120);assert.equal(pelvis.m_force.x,before.x);assert.ok(pelvis.m_force.y>before.y);assert.ok(assisted.metrics().recoveryAssistMaxUsed>0);assert.equal(pelvis.getPosition().x,position.x);
 for(const stage of ['balance','recover']){const w=new RobotWorld(stage,{recoveryAssistTraining:stage==='balance',recoveryAssistForce:500});w.applyRecoveryAssist(.1);assert.equal(w.metrics().recoveryAssistMaxUsed,0);}
 for(let i=0;i<180;i++)assisted.step(zero);assert.ok(Number.isFinite(assisted.reward));assert.ok(assisted.bodies.every(p=>Number.isFinite(p.body.getPosition().y)));
});
test('serial and parallel validation explicitly remove assistance even with training options supplied',async()=>{
 const environment={recoveryAssistTraining:true,recoveryAssistForce:500},cases=VALIDATION_CASES.slice(0,2).map(c=>({...c,seconds:2})),pool=new ParallelRollouts({enabled:false});
 try{const a=evaluateAbility(zero,'recover',environment,cases),b=await pool.ability(zero,'recover',environment,()=>true,cases);assert.deepEqual(a,b);for(const c of a.cases)assert.equal(c.metrics.recoveryAssistImpulse,0);}finally{pool.close();}
});

test('PPO prepares training assistance and carries the exact force into preview; other tasks get none',()=>{
 const l=new RobotLearner(null,42,{}, {deferEvaluation:true});l.focus='recover';l.taskSettings=loadTaskSettings({taskSettings:{recover:{recoveryAssistForce:230}}});
 const a=l.prepareIntegratedTrial();assert.equal(a.task,'recover');assert.equal(a.options.recoveryAssistTraining,true);assert.equal(a.options.recoveryAssistForce,230);
 l.recoveryPractice={trials:3,successRate:0,assistScale:.5};assert.equal(l.prepareIntegratedTrial().options.recoveryAssistForce,0);
 l.focus='walk';assert.equal(l.prepareIntegratedTrial().options.recoveryAssistTraining,undefined);
});
