import test from 'node:test';
import assert from 'node:assert/strict';
import {CartPole,postureReward,stationary,LENGTHS,DT} from '../cartpole-evolution-core.mjs';
const base={angle:0,speed:0,cartSpeed:0,stability:1,mean:1,all:1,action:0,acquired:true,impacted:false,progress:0,recovered:0};
const total=parts=>Object.values(parts).reduce((a,b)=>a+b,0);
test('upright resting beats drifting and rotating, without penalizing a target position',()=>{
 const rest=postureReward(base),moving=postureReward({...base,cartSpeed:1}),rotating=postureReward({...base,speed:2});
 assert.ok(total(rest)>total(moving));assert.ok(total(rest)>total(rotating));
 assert.deepEqual(postureReward({...base,x:-4}),postureReward({...base,x:4}));
 const down=postureReward({...base,angle:Math.PI,cartSpeed:2});assert.ok(Math.abs(down.drift)<1e-8);
});
test('impact recovery temporarily relaxes velocity penalties and then returns to stopping objective',()=>{
 const early=postureReward({...base,cartSpeed:1,speed:1,impacted:true,impactAge:.2}),late=postureReward({...base,cartSpeed:1,speed:1,impacted:true,impactAge:1.2});
 assert.ok(early.drift>late.drift);assert.ok(early.rotation>late.rotation);assert.equal(early.rest,late.rest);
});
test('upright translation does not accumulate the stationary success timer',()=>{
 const e=new CartPole(1,()=>.5,{gravity:0,damping:0,cartDamping:0,jointFriction:0});
 e.links[0].setTransform({x:0,y:LENGTHS[0]/2},0);
 e.cart.setLinearVelocity({x:.4,y:0});e.links[0].setLinearVelocity({x:.4,y:0});
 for(let i=0;i<50;i++)e.step(0,30);
 assert.equal(e.result().hold,0);assert.equal(e.result().success,false);
 e.cart.setLinearVelocity({x:0,y:0});e.links[0].setLinearVelocity({x:0,y:0});
 for(let i=0;i<Math.round(20/DT);i++)e.step(0,30);
 assert.equal(e.result().success,true);
 assert.equal(stationary(.15,.5),true);assert.equal(stationary(-.151,0),false);assert.equal(stationary(0,.501),false);
});
