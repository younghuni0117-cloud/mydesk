import test from 'node:test';import assert from 'node:assert/strict';
import {recoveryAssistSettings,recoveryAssistOptions,recoveryAssistOutput,updateRecoveryPractice} from '../robot-recovery.mjs';
import {taskProfile,loadTaskSettings} from '../robot-task-settings.mjs';
import {RobotWorld,POLICY_SIZE,evaluateAbility,VALIDATION_CASES} from '../robot-core.mjs';
import {RobotLearner} from '../robot-learning.mjs';
import {ParallelRollouts} from '../robot-rollouts.mjs';
const zero=Array(POLICY_SIZE).fill(0);
test('numeric per-task setting survives reload; zero disables, default is 120 N',()=>{
 assert.equal(taskProfile('recover').recoveryAssistForce,120);assert.equal(taskProfile('balance').recoveryAssistForce,0);
 const settings={recover:taskProfile('recover',{recoveryAssistForce:237,recoveryAssistAutoReduce:false})};assert.deepEqual(loadTaskSettings({taskSettings:settings}).recover,settings.recover);assert.equal(taskProfile('recover',{recoveryAssistForce:5001}).recoveryAssistForce,120);
 assert.equal(recoveryAssistOptions({recoveryAssistForce:0}).recoveryAssistForce,0);
 assert.equal(recoveryAssistOptions({recoveryAssistForce:500},{assistScale:.5}).recoveryAssistForce,250);
 assert.equal(recoveryAssistOptions({recoveryAssistForce:500,recoveryAssistAutoReduce:false},{assistScale:0}).recoveryAssistForce,500);
 for(let i=0;i<8;i++)assert.equal(recoveryAssistOptions({}, {trials:i}).recoveryAssistForce,i%4===3?0:120);
});
test('successful recoveries reduce force by exactly 1 N and time by 0.01 s, with independent switches',()=>{
 let p={trials:0,successRate:0};const success={terminationReason:'duration',recoveries:1,finalUpright:true,recovering:false,stableTime:2,recoveryStart:'lying-front',recoveryAssistAutoReduce:true,recoveryAssistTimeAutoReduce:true,recoveryAssistBaseForce:1000};
 assert.equal(updateRecoveryPractice(p,{...success,recoveries:0}).assistReductionN,undefined);
 p=updateRecoveryPractice(p,success);assert.equal(recoveryAssistSettings({recoveryAssistForce:1000,recoveryAssistSeconds:5,recoveryAssistTimeAutoReduce:true},p).recoveryAssistForce,999);assert.equal(recoveryAssistSettings({recoveryAssistSeconds:5,recoveryAssistTimeAutoReduce:true},p).recoveryAssistSeconds,4.99);
 const forceOnly=updateRecoveryPractice({}, {...success,recoveryAssistTimeAutoReduce:false});assert.equal(forceOnly.assistReductionN,1);assert.equal(forceOnly.assistTimeReduction,undefined);
 const timeOnly=updateRecoveryPractice({}, {...success,recoveryAssistAutoReduce:false});assert.equal(timeOnly.assistReductionN,undefined);assert.equal(timeOnly.assistTimeReduction,.01);
 for(let i=0;i<5100;i++)p=updateRecoveryPractice(p,success);assert.equal(p.assistReductionN,5000);assert.equal(p.assistTimeReduction,20);
 const settings=recoveryAssistSettings({recoveryAssistForce:1000,recoveryAssistSeconds:5,recoveryAssistTimeAutoReduce:true},p);assert.equal(settings.recoveryAssistForce,0);assert.equal(settings.recoveryAssistSeconds,0);
 assert.equal(updateRecoveryPractice({assistScale:.5},{...success,recoveryAssistBaseForce:120}).assistReductionN,61);
 const learner=new RobotLearner(null,42,{}, {deferEvaluation:true});learner.recoveryPractice=p;const before=learner.snapshot(),after=new RobotLearner(before,42,before.environment,{deferEvaluation:true});assert.deepEqual(after.recoveryPractice,p);assert.deepEqual(after.weights,before.weights);assert.equal(after.id,before.id);
});
test('upward force waits for lying stall, ramps and stops at standing height or upward speed',()=>{
 const s={force:500,height:.3,verticalSpeed:0,stallSeconds:2,rampSeconds:1};assert.equal(recoveryAssistOutput(s),500);assert.equal(recoveryAssistOutput({...s,stallSeconds:1}),0);assert.equal(recoveryAssistOutput({...s,height:.9}),0);assert.equal(recoveryAssistOutput({...s,verticalSpeed:1}),0);
 const assisted=new RobotWorld('recover',{seed:42,recoveryStart:'lying-front',disturbances:false,recoveryAssistTraining:true,recoveryAssistForce:120,recoveryAssistLocation:'pelvis'});
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

test('assistance time window expires once per episode and never restarts after another fall',()=>{
 const w=new RobotWorld('recover',{seed:42,recoveryStart:'lying-front',recoveryAssistTraining:true,recoveryAssistForce:1000,recoveryAssistSeconds:.1});w.recoveryAssistStall=2;w.recoveryAssistElapsed=1;
 for(let i=0;i<12;i++)w.applyRecoveryAssist(1/120);assert.ok(w.metrics().recoveryAssistImpulse>0);assert.ok(w.metrics().recoveryAssistUsedSeconds<=.1);const impulse=w.metrics().recoveryAssistImpulse;w.applyRecoveryAssist(1/120);assert.equal(w.metrics().recoveryAssistForce,0);
 w.recoveryAssistStall=3;w.applyRecoveryAssist(1/120);assert.equal(w.metrics().recoveryAssistImpulse,impulse);
 const off=new RobotWorld('recover',{recoveryAssistTraining:true,recoveryAssistForce:1000,recoveryAssistSeconds:0});off.recoveryAssistStall=2;off.applyRecoveryAssist(1);assert.equal(off.metrics().recoveryAssistImpulse,0);
 assert.equal(taskProfile('recover',{recoveryAssistForce:1000,recoveryAssistSeconds:5,recoveryAssistTimeAutoReduce:true}).recoveryAssistForce,1000);assert.equal(taskProfile('recover',{recoveryAssistSeconds:20.01}).recoveryAssistSeconds,3);
});
test('1000 N assistance remains finite in both lying directions over the full assistance window',()=>{
 for(const kind of ['lying-front','lying-back']){const w=new RobotWorld('recover',{seed:42,recoveryStart:kind,recoveryAssistTraining:true,recoveryAssistForce:1000,recoveryAssistSeconds:5,observationSeconds:8,disturbances:false});while(!w.done)w.step(zero);assert.ok(w.metrics().recoveryAssistMaxUsed>0);assert.ok(w.metrics().recoveryAssistUsedSeconds<=5);assert.equal(w.metrics().recoveryAssistForce,0);assert.ok(w.bodies.every(p=>Number.isFinite(p.body.getPosition().y)));}
});

test('each chosen body location receives upward force at its own point, including physical shoulder and abdomen moments',()=>{
 const torques={};for(const location of ['head','shoulder','abdomen','pelvis']){
  const w=new RobotWorld('recover',{seed:42,recoveryStart:'lying-front',recoveryAssistTraining:true,recoveryAssistForce:120,recoveryAssistLocation:location});
  w.recoveryAssistStall=2;w.recoveryAssistElapsed=1;const {body,point}=w.recoveryAssistTarget(),center=body.getWorldCenter(),before=body.m_torque;
  assert.equal(body,w.parts[location==='head'?'head':location==='pelvis'?'pelvis':'torso']);
  w.applyRecoveryAssist(1/120);const force=w.metrics().recoveryAssistForce;assert.ok(force>0);assert.ok(Math.abs(body.m_force.y-force)<1e-9);assert.ok(Math.abs(body.m_torque-before-(point.x-center.x)*force)<1e-9);torques[location]=body.m_torque-before;
  for(const {body:other}of w.bodies)if(other!==body)assert.equal(other.m_force.y,0);assert.equal(w.metrics().recoveryAssistLocation,location);
  const profile=taskProfile('recover',{recoveryAssistLocation:location});assert.equal(loadTaskSettings({taskSettings:{recover:profile}}).recover.recoveryAssistLocation,location);assert.equal(recoveryAssistOptions(profile).recoveryAssistLocation,location);
  for(let i=0;i<120;i++)w.step(zero);assert.ok(w.bodies.every(p=>Number.isFinite(p.body.getPosition().y)));
 }
 assert.ok(torques.shoulder*torques.abdomen<0);assert.equal(torques.head,0);assert.equal(torques.pelvis,0);assert.equal(taskProfile('recover',{recoveryAssistLocation:'invalid'}).recoveryAssistLocation,'shoulder');
});

test('20-second window and hundredth-second reduction retain precision and legacy reductions on reload',()=>{
 const profile=taskProfile('recover',{recoveryAssistSeconds:20,recoveryAssistTimeAutoReduce:true});assert.equal(profile.recoveryAssistSeconds,20);assert.equal(taskProfile('recover',{recoveryAssistSeconds:19.99}).recoveryAssistSeconds,19.99);
 const success={terminationReason:'recovered',recoveries:1,finalUpright:true,recovering:false,stableTime:2,recoveryAssistTimeAutoReduce:true};let p={assistTimeReduction:5.1,trials:10,successRate:.5};p=updateRecoveryPractice(p,success);assert.equal(p.assistTimeReduction,5.11);assert.equal(recoveryAssistSettings(profile,p).recoveryAssistSeconds,14.89);
 const l=new RobotLearner(null,42,{}, {deferEvaluation:true});l.recoveryPractice=p;const old=l.snapshot();assert.equal(new RobotLearner(old,42,old.environment,{deferEvaluation:true}).recoveryPractice.assistTimeReduction,5.11);
 const w=new RobotWorld('recover',{recoveryAssistTraining:true,recoveryAssistForce:120,recoveryAssistSeconds:20});w.recoveryAssistStall=2;w.recoveryAssistElapsed=1;w.recoveryAssistWindow=19.99;w.recoveryAssistStarted=true;w.applyRecoveryAssist(.01);assert.equal(w.metrics().recoveryAssistUsedSeconds,20);w.applyRecoveryAssist(.01);assert.equal(w.metrics().recoveryAssistForce,0);
});

test('5000 N is accepted, survives reload, decays by 1 N and stays finite at all four body locations',()=>{
 const profile=taskProfile('recover',{recoveryAssistForce:5000});assert.equal(profile.recoveryAssistForce,5000);assert.equal(loadTaskSettings({taskSettings:{recover:profile}}).recover.recoveryAssistForce,5000);assert.equal(recoveryAssistOptions(profile).recoveryAssistForce,5000);
 const practice=updateRecoveryPractice({}, {terminationReason:'recovered',recoveries:1,finalUpright:true,recovering:false,stableTime:2,recoveryAssistAutoReduce:true,recoveryAssistBaseForce:5000});assert.equal(recoveryAssistSettings(profile,practice).recoveryAssistForce,4999);
 for(const location of ['head','shoulder','abdomen','pelvis']){const w=new RobotWorld('recover',{seed:42,recoveryStart:'lying-front',recoveryAssistTraining:true,recoveryAssistForce:5000,recoveryAssistLocation:location,observationSeconds:5,disturbances:false});assert.equal(w.recoveryAssistLimit,5000);while(!w.done)w.step(zero);assert.ok(w.metrics().recoveryAssistMaxUsed>0);assert.ok(w.metrics().recoveryAssistMaxUsed<=5000);assert.ok(w.snapshot().parts.flat().every(Number.isFinite));}
});
