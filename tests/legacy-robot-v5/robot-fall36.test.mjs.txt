import test from 'node:test';import assert from 'node:assert/strict';
import {RobotWorld,DT,POLICY_SIZE,episode} from '../robot-core.mjs';
import {REWARDS,REWARD_VERSION,rewardBreakdown} from '../robot-rewards.mjs';
import {RobotLearner,migrateModel} from '../robot-learning.mjs';
import {compareAbilities} from '../robot-performance.mjs';
import {PPOOptimizer,ppoEpisode} from '../robot-ppo.mjs';
const zero=Array(POLICY_SIZE).fill(0),environment={terrain:'meadow',visionVersion:1};
// Freeze dynamics only in this reward-accounting fixture; the application still uses normal physics.
function controlled(stage='balance',endOnFall=false){const w=new RobotWorld(stage,{...environment,seed:31,autoPush:false,pushes:[],spawnRange:0,spawnTilt:0,observationSeconds:4,endOnFall,command:{mode:'hold'}});w.world.step=()=>{};w.contacts=new Map([['leftFoot',1]]);pose(w,true);return w;}
function pose(w,standing){w.parts.pelvis.setPosition({x:0,y:w.groundHeight(0)+(standing?1:.25)});w.parts.pelvis.setLinearVelocity({x:0,y:0});w.parts.torso.setAngle(standing?0:1.2);}
function steps(w,n){for(let i=0;i<n&&!w.done;i++)w.step(zero);}
const state={dt:1,upright:true,quality:1,motionQuality:1,speed:0,target:0,angle:0,height:1,distance:0,dx:0,dy:0,newFall:false,recovered:false,afterPush:true,impactCost:0,work:0,passed:0,commanded:true,positioned:true,goalError:0,goalProgress:0};
test('balance has an explicit fall/down penalty and recovery cannot refund a failed attempt',()=>{
 const fall=rewardBreakdown('balance',{...state,newFall:true,failedBalance:true,down:true,recovered:true});assert.equal(fall.fall,-REWARDS.balanceFall);assert.equal(fall.down,-REWARDS.balanceDown);assert.ok(Object.values(fall).every(n=>n<=0));assert.equal(fall.recovery,0);
 const recovered=rewardBreakdown('balance',{...state,failedBalance:true,recovered:true});assert.ok(Object.values(recovered).every(n=>n<=0));assert.equal(rewardBreakdown('recover',{...state,recovered:true}).recovery,8);assert.equal(rewardBreakdown('walk',{...state,newFall:true}).fall,-REWARDS.walkFall);
});
test('a late fall revokes accumulated positive reward; continuing and getting up cannot earn it back',()=>{
 const stable=controlled();steps(stable,240);assert.equal(stable.falls,0);assert.equal(stable.terminationReason,'duration');assert.ok(stable.reward>0);
 const w=controlled();steps(w,180);assert.ok(w.reward>0);pose(w,false);while(!w.falls&&!w.done)w.step(zero);assert.equal(w.falls,1);assert.ok(w.reward<=-30);assert.ok(w.rewardTerms.forfeiture<0);assert.equal(w.rewardTerms.fall,-30);const failed=w.reward,standing=w.rewardTerms.standing;
 pose(w,true);while(!w.done)w.step(zero);assert.equal(w.recoveries,1);assert.equal(w.rewardTerms.recovery,0);assert.equal(w.rewardTerms.standing,standing);assert.ok(w.reward<=failed);assert.ok(w.rewardTerms.down<0);assert.ok(w.reward<stable.reward);assert.ok(Math.abs(w.reward-Object.values(w.rewardTerms).reduce((a,b)=>a+b,0))<1e-8);
});
test('early balance-loss termination also forfeits positive points before a physical fall counter fires',()=>{
 const w=controlled('balance',true);steps(w,60);assert.ok(w.reward>0);w.parts.pelvis.setPosition({x:0,y:w.groundHeight(0)+.65});while(!w.done)w.step(zero);assert.equal(w.falls,0);assert.equal(w.terminationReason,'fall');assert.ok(w.reward<=-30);assert.ok(w.rewardTerms.failure<=-30);
});
test('a new fall is charged once, while lying down is charged continuously',()=>{
 const w=controlled();pose(w,false);steps(w,60);assert.equal(w.falls,1);assert.equal(w.rewardTerms.fall,-30);const down=w.rewardTerms.down;steps(w,60);assert.equal(w.rewardTerms.fall,-30);assert.ok(Math.abs(w.rewardTerms.down-down+8)<1e-9);
});
test('validation and CEM rank a completed fall-free attempt above a fallen high-score candidate',()=>{
 const ability=(falls,upright,reward)=>({passRate:0,meanReward:reward,cases:[{passed:false,metrics:{terminationReason:'duration',done:true,time:10,plannedDuration:10,falls,upright,motionQuality:upright,longestUpright:upright*10}}]});assert.ok(compareAbilities(ability(0,.9,50),ability(1,.99,370),'balance')>0);
 const learner=Object.assign(Object.create(RobotLearner.prototype),{attempts:0,taskAttempts:{balance:0},algorithm:'cem',algorithmAttempts:{cem:0},pending:[]});const prepared=i=>({index:i,weights:zero,task:'balance',seed:1,options:{}}),trial=m=>({metrics:{upright:.99,time:10,longestUpright:9.9,done:true,terminationReason:'duration',...m}});learner.completeTrial(prepared(0),trial({falls:1,reward:370}));learner.completeTrial(prepared(1),trial({falls:0,reward:50}));assert.ok(learner.pending[0].score<=-30);assert.ok(learner.pending[1].score>learner.pending[0].score);
});
test('PPO receives the complete physical fall cost including forfeiture',()=>{
 const optimizer=new PPOOptimizer(zero,31),r=ppoEpisode({weights:zero,critic:optimizer.critic,logStd:Array(16).fill(-4),task:'balance',seed:31,options:{...environment,observationSeconds:4,endOnFall:false,pushes:[{time:.1,strength:30,direction:0,location:'torso'}],summaryOnly:true}});assert.ok(r.metrics.falls>0);assert.ok(r.metrics.reward<=-30);assert.ok(r.experience.some(row=>row.reward<=-30));assert.ok(Math.abs(r.experience.reduce((s,row)=>s+row.reward,0)-r.metrics.reward)<1e-8);assert.ok(r.experience.every(row=>Number.isFinite(row.reward)));
});
test('v5 reward migration preserves learned model, optimizer moments, counts and old graphs without mixing old rollout scores',()=>{
 const learner=new RobotLearner(null,42,environment);learner.setAlgorithm('ppo');const old=learner.snapshot();old.rewardVersion=5;old.attempts=12345;old.taskAttempts.balance=12345;old.algorithmAttempts.ppo=12345;old.weights[783]=.1;old.mean[784]=.03;old.ppo.actor[783]=.2;old.ppo.actorAdam.m[100]=.001;old.ppo.actorAdam.t=12;old.ppo.critic[5]=.1;old.history=old.history.map(r=>({...r,rewardVersion:5}));old.ppo.buffer=[{obs:Array(73).fill(0),latent:Array(16).fill(0),value:0,reward:370,nextValue:0,oldLogP:0,done:true}];old.searchArchive={ppo:structuredClone(old.ppo)};old.pending=[{weights:[...old.weights],score:370,task:'balance'}];old.validationBank={task:'balance',weights:[...old.weights],ability:structuredClone(old.abilities.balance)};const bytes=JSON.stringify(old),next=migrateModel(old);
 assert.ok(RobotLearner.valid(next));assert.equal(next.rewardVersion,REWARD_VERSION);for(const field of ['id','weights','mean','spread','attempts','taskAttempts','algorithmAttempts','history'])assert.deepEqual(next[field],old[field]);for(const field of ['actor','critic','actorAdam','criticAdam','stdAdam','updates'])assert.deepEqual(next.ppo[field],old.ppo[field]);assert.deepEqual(next.ppo.buffer,[]);assert.deepEqual(next.searchArchive.ppo.buffer,[]);assert.deepEqual(next.pending,[]);assert.equal(next.validationBank,null);assert.equal(next.generalization,null);assert.equal(JSON.stringify(old),bytes);
 const restored=new RobotLearner(old,42,environment);assert.equal(restored.attempts,12345);assert.deepEqual(restored.weights,old.weights);assert.deepEqual(restored.ppo.actor,old.ppo.actor);assert.ok(restored.history.some(r=>r.rewardVersion===5));assert.ok(restored.history.some(r=>r.rewardVersion===REWARD_VERSION&&r.baseline));assert.equal(JSON.stringify(old),bytes);assert.equal(migrateModel({...old,weights:[NaN]}),null);
});
