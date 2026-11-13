import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeGround,trainingCondition,makeTrainingTerrain,groundTestSpec} from '../robot-training-ground.mjs';
import {RobotWorld,normalizePushSettings,STAGES} from '../robot-core.mjs';
import {taskProfile} from '../robot-task-settings.mjs';
import {trainingStatusLines} from '../robot-training-view.mjs';
test('stone heights stay inside the configured range with reproducible variation and scaled widths',()=>{
 for(const level of [.15,1]){
 const spec={...trainingCondition(0,42,{rockMin:.12,rockMax:.35},level),course:'stones'},terrain=makeTrainingTerrain(spec);
 assert.ok(terrain.obstacles.length>50);assert.ok(terrain.obstacles.every(o=>o.height>=.12&&o.height<=.35));assert.ok(new Set(terrain.obstacles.map(o=>o.height)).size>20);
 assert.deepEqual(makeTrainingTerrain(spec),terrain);
 const small=makeTrainingTerrain({...spec,rockMin:.01,rockMax:.01}),big=makeTrainingTerrain({...spec,rockMin:.3,rockMax:.3});assert.ok(big.obstacles.reduce((s,o)=>s+o.width,0)>small.obstacles.reduce((s,o)=>s+o.width,0));
 const world=new RobotWorld('walk',{terrain:'training',trainingSpec:spec,disturbances:false});assert.equal(world.obstacles.length,terrain.obstacles.length);assert.equal(world.observations().length,141);
 }
 const defaults=normalizeGround();assert.equal(defaults.rockMin,.015);assert.equal(defaults.rockMax,.1);assert.equal(normalizeGround({rockMin:.2,rockMax:.1}).rockMax,.2);
});
test('100 N·s settings reach the actual hammer schedule without the legacy 30 cap and keep fractional interval',()=>{
 assert.equal(normalizeGround({pushMax:100}).pushMax,100);assert.equal(normalizePushSettings({pushMin:1,pushMax:100}).pushMax,100);assert.equal(taskProfile('balance',{pushMin:1,pushMax:100}).pushMax,100);
 const spec={...trainingCondition(0,42,{pushProbability:1,pushMax:100,pushInterval:1.5}),course:'flat'};
 assert.equal(spec.pushMax,100);const w=new RobotWorld('balance',{terrain:'training',trainingSpec:spec,observationSeconds:10});assert.ok(w.pushes.some(p=>p.strength>30));assert.ok(w.pushes.every(p=>p.strength<=100));assert.ok(w.pushes.length>2);assert.ok(Math.abs(w.pushes[1].time-w.pushes[0].time-1.5)<1e-9);
 const p=w.parts.torso,before=p.getLinearVelocity().x;w.push(100,0);assert.ok(Math.abs((p.getLinearVelocity().x-before)*p.getMass()-100)<1e-7);
 assert.ok(trainingCondition(0,42,{pushMax:.1},.15).pushMax<=.1);
});
test('terrain status begins with the displayed task and uses the requested slash-separated format',()=>{
 const terrain=makeTrainingTerrain({...groundTestSpec(0),course:'highSteps',step:.141,friction:.86});
 assert.equal(trainingStatusLines(terrain,{mass:70},0,STAGES.balance.label)[0],'균형 잡기 / 높은 오르막 계단 / 높이 14.1cm / 마찰 0.86 / 질량 +0.0%');
});
test('training stair limits accept 0–50 cm for both directions and low steps never exceed the selected maximum',()=>{
 for(const maximum of [0,.03,.5])for(const level of [.15,1]){
  assert.equal(normalizeGround({stepMax:maximum}).stepMax,maximum);
  for(let i=0;i<9;i++){
   const spec=trainingCondition(i,42,{stepMax:maximum},level);if(!spec.course.includes('Steps'))continue;
   assert.ok(spec.step>=0&&spec.step<=maximum);
   const terrain=makeTrainingTerrain(spec);assert.equal(terrain.stairHeight,spec.step);assert.ok(terrain.segments.every(s=>Number.isFinite(s.y0)&&Number.isFinite(s.y1)));
   if(maximum===0){assert.ok(terrain.segments.every(s=>Math.abs(s.y0-.16)<1e-8&&Math.abs(s.y1-.16)<1e-8));assert.match(trainingStatusLines(terrain,{mass:70})[0],/높이 0cm/);}
   const world=new RobotWorld('balance',{terrain:'training',trainingSpec:spec,disturbances:false});assert.ok(world.bodies.every(p=>Number.isFinite(p.body.getPosition().y)));
  }
 }
 assert.equal(normalizeGround({stepMax:-1}).stepMax,0);assert.equal(normalizeGround({stepMax:1}).stepMax,.5);
});
test('maximum slope supports zero through sixty degrees without a hidden five-degree floor',()=>{
 for(const maximum of [0,1,60])for(const level of [.15,1])for(let i=0;i<9;i++){
  const spec=trainingCondition(i,42,{slopeMax:maximum},level);assert.ok(spec.angle>=0&&spec.angle<=maximum);
  if(!['uphill','downhill','slopes','stones'].includes(spec.course))continue;
  const terrain=makeTrainingTerrain(spec);
  for(const s of terrain.segments){const degrees=Math.abs(Math.atan2(s.y1-s.y0,s.x1-s.x0)*180/Math.PI);assert.ok(degrees<=maximum+1e-8);}
  if(maximum===0)assert.ok(terrain.segments.every(s=>Math.abs(s.y0-s.y1)<1e-8));
  const world=new RobotWorld('balance',{terrain:'training',trainingSpec:spec,disturbances:false});assert.ok(world.bodies.every(p=>Number.isFinite(p.body.getPosition().y)));
 }
 assert.equal(normalizeGround({slopeMax:-1}).slopeMax,0);assert.equal(normalizeGround({slopeMax:90}).slopeMax,60);
});
