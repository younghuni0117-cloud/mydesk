import test from 'node:test';import assert from 'node:assert/strict';
import {TRAINING_COURSES,normalizeGround,trainingCondition,mixedTask,makeTrainingTerrain,terrainReviewCases,validationGround} from '../robot-training-ground.mjs';
import {RobotWorld,episode,JOINTS} from '../robot-core.mjs';
import {POLICY_SIZE,POLICY_INPUTS,POLICY_OUTPUTS,BIAS_START,initialPolicy,policyActions} from '../robot-policy.mjs';
import {networkForward,networkGradient,PPOOptimizer,ppoEpisode} from '../robot-ppo.mjs';
import {jointTargetTorque,normalizeActuation} from '../robot-actuation.mjs';
import {RobotLearner,migrateModel} from '../robot-learning.mjs';
const zero=Array(POLICY_SIZE).fill(0);
test('36 outputs and previous-action/task inputs agree across actor, critic, gradients and physical control',()=>{
 const w=new RobotWorld('walk'),obs=w.observations();assert.equal(obs.length,POLICY_INPUTS);assert.equal(POLICY_OUTPUTS,36);assert.equal(POLICY_SIZE,1968);assert.deepEqual(obs.slice(75,80),[0,0,1,0,0]);
 const weights=initialPolicy(31).map((v,i)=>v+.015*Math.sin(i)),delta=Array.from({length:36},(_,i)=>Math.cos(i)),forward=networkForward(weights,obs).z.map(Math.tanh);assert.equal(forward.length,36);policyActions(weights,obs).forEach((x,i)=>assert.ok(Math.abs(x-forward[i])<1e-12));
 const gradient=networkGradient(weights,obs,delta),f=weights=>networkForward(weights,obs).z.reduce((sum,v,i)=>sum+v*delta[i],0);
 for(const k of [0,950,960,1000,BIAS_START,BIAS_START+23,POLICY_SIZE-1]){const a=[...weights],b=[...weights];a[k]+=1e-6;b[k]-=1e-6;assert.ok(Math.abs((f(a)-f(b))/2e-6-gradient[k])<1e-6,`gradient ${k}`);}
 const m={kp:100,kd:5,torque:20};assert.equal(jointTargetTorque(m,0,0,0,1,0),5);assert.equal(jointTargetTorque(m,0,0,0,0,.2),4);assert.equal(jointTargetTorque(m,1,0,0,5,.5),20);
 assert.equal(jointTargetTorque(m,0,0,10,20,.5),0);assert.equal(normalizeActuation().actuationVersion,3);
 for(let i=0;i<15;i++)w.step(zero,false,Array.from({length:36},(_,j)=>j===12?.5:j===24?.2:0));assert.equal(w.actions.length,36);assert.ok(w.activeTorques.every(Number.isFinite));assert.ok(w.activeTorques.every((v,i)=>Math.abs(v)<=w.motors[i].torque+1e-8));
});
test('course proportions, change period, mixtures and bounded domains are reproducible',()=>{
 const specs=Array.from({length:TRAINING_COURSES.length},(_,i)=>trainingCondition(i,42));assert.deepEqual(new Set(specs.map(s=>s.course)),new Set(TRAINING_COURSES));assert.deepEqual(specs[0],trainingCondition(0,42));assert.deepEqual(trainingCondition(0,42,{changeEvery:5}),trainingCondition(4,42,{changeEvery:5}));
 const legacyWeights={weights:{flat:5,uphill:0,downhill:0,slopes:0,stones:0,lowSteps:0,highSteps:0}};assert.equal(new Set(Array.from({length:TRAINING_COURSES.length},(_,i)=>trainingCondition(i,42,legacyWeights).course)).size,TRAINING_COURSES.length);
 const tasks=Array.from({length:10},(_,i)=>mixedTask('walk',i,42));assert.deepEqual(tasks,['walk','run','obstacles','balance','recover','walk','run','obstacles','balance','recover']);
 for(const t of ['balance','recover','walk','run','obstacles'])assert.equal(tasks.filter(x=>x===t).length,2);
 assert.ok(Array.from({length:10},(_,i)=>mixedTask('run',i,42,{mixMode:'selected'})).every(t=>t==='run'));
 const random=Array.from({length:50},(_,i)=>mixedTask('walk',i,42,{mixMode:'random'}));assert.ok(new Set(random).size===5);assert.notDeepEqual(random.slice(0,10),tasks);assert.deepEqual(random,Array.from({length:50},(_,i)=>mixedTask('walk',i,42,{mixMode:'random'})));

 for(const s of specs){assert.ok(s.massScales.every(v=>v>=.85&&v<=1.15));assert.equal(s.motorScale,undefined);assert.ok(s.friction>=.2&&s.friction<=1.3);assert.equal(s.delaySteps,undefined);}
 assert.equal(normalizeGround({massVariation:20}).massVariation,.3);
});
test('simple slopes, steps and stones are physical courses; physics stays fixed within an episode',()=>{
 for(const course of TRAINING_COURSES){const spec={...trainingCondition(0,42),course,label:course},terrain=makeTrainingTerrain(spec);assert.ok(terrain.segments.every(s=>s.x1>s.x0&&Number.isFinite(s.y0)));if(course==='flat')assert.equal(new Set(terrain.segments.map(s=>s.y0)).size,1);if(course==='stones')assert.ok(terrain.obstacles.length>0);else assert.equal(terrain.obstacles.length,0);}
 const a=new RobotWorld('balance',{terrain:'training',trainingSpec:{...trainingCondition(0,42),course:'flat',massScales:Array(13).fill(1.1),motorScale:1.1,gainScale:1,speedScale:1,delaySteps:1},disturbances:false}),b=new RobotWorld();assert.ok(a.parts.torso.getMass()>b.parts.torso.getMass());assert.equal(a.motors[0].torque,b.motors[0].torque);
 const frozen=structuredClone(a.trainingSpec),command=Array(36).fill(.1);a.step(zero,false,command);assert.deepEqual(a.actions,command);for(let i=1;i<=a.controlStride;i++)a.step(zero,false,command);assert.deepEqual(a.actions,command);assert.deepEqual(a.trainingSpec,frozen);
 const plain=new RobotWorld('walk',{terrain:'meadow',trainingGround:{massVariation:.3,motorVariation:.3}});assert.equal(plain.trainingSpec,null);assert.equal(plain.parts.torso.getMass(),b.parts.torso.getMass());assert.equal(plain.motors[0].torque,b.motors[0].torque);
});
test('rollouts train all 36 outputs through PPO, with finite optimizer state and held-out tests',()=>{
 const optimizer=new PPOOptimizer(zero,42);for(let i=0;i<6;i++){const p={weights:optimizer.actor,critic:optimizer.critic,logStd:optimizer.logStd,task:i%2?'walk':'balance',seed:42+i,options:{terrain:'training',trainingSpec:trainingCondition(i,42),observationSeconds:1,disturbances:false}};const trial=ppoEpisode(p);assert.ok(Number.isFinite(trial.metrics.reward));for(const row of trial.experience){assert.equal(row.obs.length,POLICY_INPUTS);assert.equal(row.latent.length,36);}optimizer.buffer.push(...trial.experience);}
 optimizer.update();assert.ok(optimizer.updates>0);assert.ok(optimizer.actorAdam.t>0);assert.ok(PPOOptimizer.valid(optimizer.snapshot()));assert.ok(optimizer.actor.some((v,i)=>i>=BIAS_START&&v!==0));
 const cases=terrainReviewCases(6);assert.equal(cases.length,5);assert.equal(validationGround(cases[4],4).course,'stones');const held=validationGround({id:'unseen-left',seed:700001},0);assert.equal(held.course,'stones');assert.notDeepEqual(held,trainingCondition(0,42));
});
test('new architecture rejects retired model shape before any cache can upload it',()=>{assert.equal(migrateModel({version:8,policyKind:'joint-target-pd-12joint-mlp-v8',weights:Array(1020).fill(0)}),null);});
