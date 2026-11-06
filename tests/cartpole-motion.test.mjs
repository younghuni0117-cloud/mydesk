import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceAfterFailure,polePoints,sceneProjection,CONTACT_RADIUS} from '../cartpole-motion.mjs';
test('all difficulties fall, contact the floor, rebound and settle without penetration',()=>{
 for(const id of ['normal','easy','hard','double']){
  let state=id==='double'?[0,0,.36,.3,.18,.1]:[0,0,.36,.3];
  let impacts=0,hadContact=false,hadRebound=false,lastSpeed=0;
  for(let i=0;i<500;i++){
   const r=advanceAfterFailure(state,id);state=r.state;impacts+=r.impacts;lastSpeed=r.speed;
   const points=polePoints(state,id).slice(1);
   assert.ok(state.every(Number.isFinite));
   assert.ok(points.every(p=>p.y>=CONTACT_RADIUS-1e-4),id+' cannot pass through floor');
   if(r.impacts)hadContact=true;
   if(hadContact&&points.some(p=>p.y>CONTACT_RADIUS+.02)&&r.speed>.1)hadRebound=true;
  }
  assert.ok(impacts>0,id+' hits floor');assert.ok(hadRebound,id+' rebounds');assert.ok(lastSpeed<.08,id+' settles');
 }
});
test('camera keeps the whole pole in view during a boundary failure',()=>{
 for(const id of ['easy','double']){
  let state=id==='double'?[2.41,1,.25,.2,-.1,.3]:[2.41,1,.25,.2];
  for(let i=0;i<400;i++){
   state=advanceAfterFailure(state,id).state;
   const scene=sceneProjection(state,id);
   for(const p of polePoints(state,id)){
    assert.ok(scene.x(p.x)>=39 && scene.x(p.x)<=761);
    assert.ok(scene.y(p.y)>=25 && scene.y(p.y)<=scene.floor);
   }
  }
 }
});
