import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingPreviewSpec} from '../robot-training-preview.mjs';
import {RobotWorld} from '../robot-core.mjs';
import {TRAINING_COURSES,trainingCondition,groundTestSpec} from '../robot-training-ground.mjs';
import {trainingStatusLines} from '../robot-training-view.mjs';

test('manual ground observation uses configured friction, mass and high step limits, not validation defaults',()=>{
 const options={terrain:'training',trainingGround:{frictionMin:.35,frictionMax:.35,massVariation:0,stepMax:.3,slopeMax:35}},model={attempts:0,searchSeed:91};
 const courses=new Set();
 for(let i=0;i<9;i++){
  const saved={...model,attempts:i},spec=trainingPreviewSpec(options,saved);courses.add(spec.course);
  assert.deepEqual(spec,trainingCondition(i,91,options.trainingGround,1));
  const world=new RobotWorld('balance',{...options,trainingSpec:spec,disturbances:false});
  assert.equal(world.terrain.friction,.35);assert.ok(Math.abs(world.metrics().mass-70)<1e-8);assert.equal(world.pushes.length,0);
  const text=trainingStatusLines(world.terrain,world.metrics(),0)[0];assert.match(text,/마찰 0.35/);assert.match(text,/질량 \+0.0%/);
  if(spec.course.startsWith('highSteps')){assert.equal(world.terrain.stairHeight,.3);assert.match(text,/30cm/);}
 }
 assert.equal(courses.size,TRAINING_COURSES.length);assert.equal(model.attempts,0);
});
test('recent model replay keeps its exact curriculum condition and fixed terrain stays isolated',()=>{
 const trial={trainingSpec:trainingCondition(3,42,{frictionMax:.6},.15)};
 assert.equal(trainingPreviewSpec({terrain:'training',trainingGround:{frictionMax:2}},null,trial),trial.trainingSpec);
 assert.equal(trainingPreviewSpec({terrain:'meadow'},null,trial),undefined);
 assert.equal(trainingPreviewSpec({terrain:'training'},null).level,1);
});
test('explicit benchmark ground remains independent from user observation settings',()=>{
 const before=groundTestSpec(0);
 trainingPreviewSpec({terrain:'training',trainingGround:{frictionMin:0,frictionMax:0,stepMax:.3,massVariation:.3}});
 assert.deepEqual(groundTestSpec(0),before);
 const world=new RobotWorld('balance',{terrain:'training',trainingSpec:before,disturbances:false});assert.equal(world.terrain.friction,1.1);
});
