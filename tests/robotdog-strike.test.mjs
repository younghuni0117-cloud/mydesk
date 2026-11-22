import test from 'node:test';import assert from 'node:assert/strict';
import {DogWorld,DOG} from '../robotdog-core.mjs';
import {kickTargets} from '../robotdog-dynamics.mjs';
import {strikeSurface,inwardDirection} from '../robotdog-strike.mjs';

test('a strike winds up without force, follows its moving target, and applies exactly one physical impulse at contact',()=>{
 const world=new DogWorld({goal:'move',seconds:1,seed:12}),plain=new DogWorld({goal:'move',seconds:1,seed:12});for(const w of [world,plain])w.setPose({p:[0,3,0]});
 const event=world.kick(10),initial=[...event.point];assert.equal(event.phase,'windup');assert.deepEqual(world.v,plain.v);let hits=0;
 while(world.time<.4){const was=event.phase;world.stepAction(Array(12).fill(0));plain.stepAction(Array(12).fill(0));if(event.phase==='windup')assert.deepEqual(world.v,plain.v);if(was==='windup'&&event.phase==='impact'){hits++;assert.ok(world.time>=.22&&world.time<.25);assert.ok(event.point[1]<initial[1]-.1);}
  if(event.phase==='impact'){assert.ok(Math.abs(world.v[0]-plain.v[0]-event.impulse[0]/DOG.mass)<1e-8);assert.ok(Math.abs(world.v[2]-plain.v[2]-event.impulse[2]/DOG.mass)<1e-8);}}
 assert.equal(hits,1);assert.equal(world.pendingStrike,null);assert.ok(world.time<world.seconds);
});
test('side strikes arrive inward from the selected outer side; nearer parts stop a ray before inner targets',()=>{
 const w=new DogWorld({goal:'stand'}),parts=kickTargets(w),left=parts.find(p=>p.part==='앞 왼쪽 상부 다리'),right=parts.find(p=>p.part==='앞 오른쪽 상부 다리');assert.ok(inwardDirection(w,left)[2]>0);assert.ok(inwardDirection(w,right)[2]<0);
 const exposed=strikeSurface(w,right,[0,0,1]);assert.equal(exposed.leg,0);assert.ok(exposed.local[2]<0);assert.equal(exposed.part,'앞 왼쪽 상부 다리');
 const front=strikeSurface(w,parts[0],[-1,0,0]);assert.ok(front.local[0]>.45);assert.equal(front.affected,0);
});
test('pending hits keep the same event identity and cannot stack duplicate impulses; episode length is unchanged',()=>{const w=new DogWorld({goal:'recover',seconds:1});const first=w.kick(7);assert.equal(w.kick(50).id,first.id);assert.equal(first.strength,7);while(!w.done)w.stepAction(Array(12).fill(0));assert.ok(Math.abs(w.time-1)<1e-8);assert.equal(w.kickCount,1);assert.equal(w.kickEvent.phase,'impact');});

test('replay changes to impact at the actual impulse timestamp, never at the later sampled pose',async()=>{const{interpolateStrike}=await import('../robotdog-strike.mjs');const a={id:'hit',phase:'windup',started:0,time:.22,point:[1,2,3],impulse:[0,0,-10]},b={...a,phase:'impact',time:.225,point:[1,1.9,3]};assert.equal(interpolateStrike(a,b,.224,.5).phase,'windup');assert.equal(interpolateStrike(a,b,.225,.6).phase,'impact');assert.equal(interpolateStrike(a,b,.23,.8).phase,'impact');assert.deepEqual(interpolateStrike(a,{...a,point:[1,1.8,3]},.1,.5).point,[1,1.9,3]);});

test('recorded PPO observations include the exact contact transition and its pre-integration pose',async()=>{const{DogTrainer,freshModel}=await import('../robotdog-learning.mjs');const t=new DogTrainer(freshModel(),{goal:'recover',mixed:false,seconds:1});t.queueKick(7);const result=await t.trial(true),trace=result.result.trace,impact=trace.find(f=>f.kick?.phase==='impact');assert.ok(trace.some(f=>f.kick?.phase==='windup'));assert.ok(impact?.kick.contactPose);assert.ok(impact.time-impact.kick.time<=DOG.dt+1e-8);assert.ok(impact.kick.contactPose.q.every(Number.isFinite));assert.equal(impact.kick.manual,true);assert.ok(result.steps>0);});
