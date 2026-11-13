import test from 'node:test';import assert from 'node:assert/strict';
import {recordTrainingReward,loadTrainingRewards,trainingRewardRows,TRAINING_REWARD_POINTS} from '../robot-training-rewards.mjs';
import {RobotLearner,migrateModel} from '../robot-learning.mjs';
test('every completed trial updates only its task using the last twenty true returns',()=>{
 const h={};for(let i=1;i<=25;i++)recordTrainingReward(h,'balance',i,i,'{}',10);
 assert.equal(h.balance.points.length,25);assert.equal(h.balance.points.at(-1).overall,15.5);assert.equal(h.balance.points.at(-1).count,20);
 recordTrainingReward(h,'walk',1,-30,'{}',10);assert.equal(h.walk.points[0].overall,-30);assert.equal(h.balance.points.at(-1).attempts,25);
 recordTrainingReward(h,'balance',25,999,'{}',10);assert.equal(h.balance.points.at(-1).overall,15.5);
 assert.equal(recordTrainingReward(h,'balance',26,NaN,'{}',10),null);
});
test('different environments and horizons never mix averages or draw old points as current evidence',()=>{
 const h={};recordTrainingReward(h,'walk',1,100,'{}',10);recordTrainingReward(h,'walk',2,200,'{}',10);
 recordTrainingReward(h,'walk',3,-10,'{}',30);assert.equal(h.walk.points.at(-1).overall,-10);assert.equal(h.walk.points.length,3);
 let m={environment:{},trainingRewards:h,taskAttempts:{walk:3}};assert.deepEqual(trainingRewardRows(m,'walk').map(x=>x.attempts),[3]);
 recordTrainingReward(h,'walk',4,7,'{"terrain":"hills"}',30);assert.equal(trainingRewardRows(m,'walk').length,0);
 m.environment={terrain:'hills'};m.taskAttempts.walk=4;assert.equal(trainingRewardRows(m,'walk')[0].overall,7);
});
test('dense latest records, full-range endpoints and rolling state survive bounded compaction and reload',()=>{
 const h={};for(let i=1;i<=10000;i++)recordTrainingReward(h,'balance',i,Math.sin(i),'{}',10);
 const s=h.balance;assert.ok(s.points.length<=TRAINING_REWARD_POINTS);assert.equal(s.points[0].attempts,1);assert.equal(s.points.at(-1).attempts,10000);
 assert.deepEqual(s.points.slice(-320).map(x=>x.attempts),Array.from({length:320},(_,i)=>9681+i));
 const restored=loadTrainingRewards(JSON.parse(JSON.stringify(h)),['balance']);recordTrainingReward(restored,'balance',10001,5,'{}',10);recordTrainingReward(h,'balance',10001,5,'{}',10);assert.deepEqual(restored,h);
});
test('learner snapshots persist telemetry without changing validated rewards, weights or legacy history',()=>{
 const l=new RobotLearner(null,42,{}, {deferEvaluation:true});l.algorithm='cem';const before=l.snapshot();
 for(const reward of [4,8])l.completeTrial({index:l.attempts,weights:l.weights,task:'walk',seed:42,record:false,options:{observationSeconds:10}},{metrics:{reward,time:1,pushes:0,terminationReason:'duration'},pushPlan:[],commandSchedule:[]});
 assert.equal(l.trainingRewards.walk.points.at(-1).overall,6);assert.deepEqual(l.weights,before.weights);assert.deepEqual(l.abilities,before.abilities);assert.deepEqual(l.history,before.history);
 const saved=l.snapshot();assert.ok(RobotLearner.valid(saved));const next=new RobotLearner(saved,42,l.environment,{deferEvaluation:true});assert.deepEqual(next.trainingRewards,l.trainingRewards);assert.deepEqual(next.weights,l.weights);assert.equal(next.attempts,2);
 delete saved.trainingRewards;assert.ok(migrateModel(saved));assert.deepEqual(new RobotLearner(saved,42,l.environment,{deferEvaluation:true}).trainingRewards,{});
});
