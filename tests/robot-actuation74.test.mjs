import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeActuation,jointTargetTorque} from '../robot-actuation.mjs';
import {loadTaskSettings,taskProfile,taskEnvironments,applySharedTaskEnvironment} from '../robot-task-settings.mjs';
import {createRobotWorld,STAGES,POLICY_SIZE} from '../robot-core.mjs';
test('5000-degree targets and 100-percent residual survive per-task save and shared environment reload',()=>{
 const high={targetSpeed:5000,targetVelocity:5000,residualTorque:1};assert.deepEqual({...normalizeActuation(high)}, {...normalizeActuation(),...high});
 const map=loadTaskSettings({taskSettings:{recover:high}});assert.equal(map.recover.targetSpeed,5000);assert.equal(map.recover.targetVelocity,5000);assert.equal(map.recover.residualTorque,1);
 const restored=loadTaskSettings(JSON.parse(JSON.stringify({taskSettings:map})));assert.deepEqual(restored,map);
 const shared=loadTaskSettings({});applySharedTaskEnvironment(shared,{taskEnvironments:taskEnvironments(map)});assert.deepEqual(shared.recover,map.recover);
 for(const task of Object.keys(STAGES)){const previous={targetSpeed:1440,targetVelocity:1440,residualTorque:.5};for(const [k,v]of Object.entries(previous))assert.equal(taskProfile(task,previous)[k],v);}
 assert.equal(normalizeActuation({targetVelocity:6000,residualTorque:2}).targetVelocity,5000);assert.equal(normalizeActuation({residualTorque:2}).residualTorque,1);
});
test('full residual torque adds to PD output before the unchanged physical torque and speed caps',()=>{
 const motor={kp:180,kd:12,torque:80,speedLimit:12};for(const angle of [-3,0,3])for(const speed of [-100,-12,0,12,100])for(const direction of [-1,1]){
  const torque=jointTargetTorque(motor,angle+.5,angle,speed,direction*5000*Math.PI/180,direction);assert.ok(Number.isFinite(torque));assert.ok(Math.abs(torque)<=80);
 }
 assert.equal(jointTargetTorque(motor,0,0,0,0,1),80);assert.equal(jointTargetTorque(motor,0,0,12,100,1),0);
});
test('maximal targets and reversals retain finite physics, joint target limits and motor torque caps in all skills',()=>{
 const weights=Array(POLICY_SIZE).fill(0);
 for(const stage of Object.keys(STAGES))for(const seed of [31,77]){
  const w=createRobotWorld(stage,{seed,targetSpeed:5000,targetVelocity:5000,residualTorque:1,observationSeconds:2,autoPush:false});
  while(!w.done){const actions=Array.from({length:36},(_,i)=>Math.sin(w.steps*.7+i*1.3)>.0?1:-1);w.step(weights,false,actions);
   assert.ok(Number.isFinite(w.reward),stage);for(const [i,m]of w.motors.entries()){assert.ok(Math.abs(w.activeTorques[i])<=m.torque+1e-9,stage);assert.ok(m.target>=m.lower-1e-10&&m.target<=m.upper+1e-10,stage);}
   assert.ok(w.snapshot().parts.flat().every(Number.isFinite),stage);
  }
 }
});
