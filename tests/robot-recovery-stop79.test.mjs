import test from 'node:test';import assert from 'node:assert/strict';
import {recoveryEarlyStopReady,recoveryAssistOptions,updateRecoveryPractice} from '../robot-recovery.mjs';
import {taskProfile,loadTaskSettings} from '../robot-task-settings.mjs';
import {RobotWorld,POLICY_SIZE,evaluateAbility,VALIDATION_CASES} from '../robot-core.mjs';
import {ParallelRollouts} from '../robot-rollouts.mjs';
const zero=Array(POLICY_SIZE).fill(0);
function standingTrial(options={}){const w=new RobotWorld('recover',{startStanding:true,recoveryEarlyStopTraining:true,recoveryEarlyStop:true,disturbances:false,observationSeconds:4,...options});w.world.setGravity({x:0,y:0});w.applyActuation=()=>0;w.resistWaist=()=>{};w.contacts.set('leftFoot',1);w.isDown=true;return w;}
test('successful termination requires genuine recovery and two continuous seconds without assistance',()=>{
 const ready={enabled:true,recoveries:1,finalUpright:true,stableTime:2,unassistedTime:2};assert.equal(recoveryEarlyStopReady(ready),true);
 for(const override of [{enabled:false},{recoveries:0},{finalUpright:false},{stableTime:1.99},{unassistedTime:1.99}])assert.equal(recoveryEarlyStopReady({...ready,...override}),false);
 const w=standingTrial();while(!w.done)w.step(zero);assert.equal(w.terminationReason,'recovered');assert.ok(Math.abs(w.time-2)<1e-6);assert.equal(w.rewardTerms.failure,undefined);assert.ok(w.reward>0);
 const p=updateRecoveryPractice({}, {...w.metrics(),recoveryAssistAutoReduce:true,recoveryAssistTimeAutoReduce:true});assert.equal(p.assistReductionN,1);assert.equal(p.assistTimeReduction,.01);assert.equal(p.successRate,.05);
 const helped=standingTrial();helped.applyRecoveryAssist=()=>{helped.recoveryAssistForce=helped.time<1?10:0;};while(!helped.done)helped.step(zero);assert.equal(helped.terminationReason,'recovered');assert.ok(helped.time>=3-1e-6);
});
test('unchecked option and integrated execution finish at full duration, and unstable standing resets the timer',()=>{
 for(const options of [{recoveryEarlyStop:false},{recoveryEarlyStopTraining:false}]){const w=standingTrial(options);while(!w.done)w.step(zero);assert.equal(w.terminationReason,'duration');assert.ok(Math.abs(w.time-4)<1e-6);}
 const w=standingTrial();for(let i=0;i<60;i++)w.step(zero);w.contacts.clear();w.step(zero);assert.equal(w.recoveryUnassistedStable,0);w.contacts.set('leftFoot',1);while(!w.done)w.step(zero);assert.ok(w.time>3);assert.equal(w.terminationReason,'recovered');
});
test('setting persists per task and validation ignores training early termination',async()=>{
 assert.equal(taskProfile('recover').recoveryEarlyStop,false);const p=taskProfile('recover',{recoveryEarlyStop:true});assert.equal(loadTaskSettings({taskSettings:{recover:p}}).recover.recoveryEarlyStop,true);assert.equal(recoveryAssistOptions(p).recoveryEarlyStop,true);
 const cases=VALIDATION_CASES.slice(0,2).map(c=>({...c,seconds:1})),env={recoveryEarlyStopTraining:true,recoveryEarlyStop:true},pool=new ParallelRollouts({enabled:false});
 try{const a=evaluateAbility(zero,'recover',env,cases),b=await pool.ability(zero,'recover',env,()=>true,cases);assert.deepEqual(a,b);for(const c of a.cases)assert.equal(c.metrics.recoveryEarlyStop,false);}finally{pool.close();}
});
