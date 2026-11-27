import test from 'node:test';
import assert from 'node:assert/strict';
import {CartPole} from '../cartpole-evolution-core.mjs';
import {options,Trainer,evaluate} from '../cartpole-evolution-training.mjs';
import {PreviewEpisode} from '../cartpole-evolution-preview.mjs';
test('resistance settings preserve zero and bound invalid values',()=>{
 assert.equal(options({jointFriction:0,jointDamping:0}).jointFriction,0);
 assert.equal(options({jointFriction:9,jointDamping:-4}).jointFriction,.2);
 assert.equal(options({jointDamping:9}).jointDamping,.1);
 assert.equal(options({jointDamping:'bad'}).jointDamping,.005);
});
test('friction brake opposes relative rotation, damping dissipates energy at each joint',()=>{
 const run=(jointFriction,jointDamping)=>{const e=new CartPole(2,()=>.5,{gravity:0,cartDamping:0,jointFriction,jointDamping});e.links[0].setAngularVelocity(3);e.links[1].setAngularVelocity(-2);for(let i=0;i<30;i++)e.step(0,30);return e.links.reduce((s,b)=>s+.5*b.getInertia()*b.getAngularVelocity()**2+.5*b.getMass()*b.getLinearVelocity().lengthSquared(),0)+.5*e.cart.getMass()*e.cart.getLinearVelocity().lengthSquared();};
 assert.ok(run(.02,0)<run(0,0));assert.ok(run(0,.02)<run(0,0));
 const e=new CartPole(2,()=>.5,{jointFriction:.02});for(const j of e.joints){assert.equal(j.getMotorSpeed(),0);assert.equal(j.getMaxMotorTorque(),.02);}e.setJointResistance({jointFriction:0,jointDamping:0});assert.ok(e.joints.every(j=>!j.isMotorEnabled()));
});
test('training and real-time model use settings without resetting policy',()=>{
 const t=new Trainer(2,{jointFriction:.01,jointDamping:.02},null,4),weights=t.policy.actor.w.slice(),env=t.envs[0];
 t.configure({jointFriction:.03,jointDamping:.04});assert.equal(t.envs[0],env);assert.equal(env.damping,.04);assert.equal(env.jointFriction,.03);assert.deepEqual(t.policy.actor.w,weights);
 const p=new PreviewEpisode(2,30,t.policy.checkpoint(),false,42,t.config);assert.equal(p.env.damping,.04);assert.equal(p.env.jointFriction,.03);
});
test('training preview, deterministic model and all fixed evaluation trials start downward',()=>{
 const t=new Trainer(2,{},null,123);
 for(const stochastic of [true,false]){
  const p=new PreviewEpisode(2,30,t.policy.checkpoint(),stochastic,42,t.config);
  assert.equal(p.env.startKind,'down');assert.ok(p.env.links.every(b=>Math.cos(b.getAngle())<-.99));
 }
 // Each trial's first call has exactly zero cart speed, angular speeds and actuator state.
 const observed=[];const all=evaluate(2,obs=>{if(obs[1]===0&&obs[4]===0&&obs[7]===0&&obs.at(-2)===0)observed.push(obs);return 0;});
 while(!all.next().done){}
 assert.ok(observed.length>=8);assert.ok(observed.every(obs=>obs[3]<-.99&&obs[6]<-.99));
});
