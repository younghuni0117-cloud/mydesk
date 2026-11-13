import test from 'node:test';import assert from 'node:assert/strict';
import {CombatWorld,POLICY_SIZE} from '../robot-core.mjs';
import {bagAttachment,bagRopePath,interpolateBag,BAG_ROPE_LENGTH} from '../robot-bag.mjs';
import {interpolateFrame,traceFrame} from '../robot-view.mjs';
import {combatSettings} from '../robot-combat.mjs';
import {Vec2} from '../vendor/planck.mjs';
const zero=Array(POLICY_SIZE).fill(0);
test('bag weight changes real mass and inertia, and only punch/kick use it',()=>{
 for(const task of ['punch','kick'])for(const mass of [.5,5.07,50,200]){const w=new CombatWorld(task,{bagMass:mass,disturbances:false});assert.ok(Math.abs(w.bag.body.getMass()-mass)<1e-9);assert.ok(Math.abs(w.bag.body.getInertia()-mass*(.44**2+.96**2)/12)<1e-9);assert.equal(w.bag.rope.getType(),'rope-joint');assert.equal(w.snapshot().bag.mass,mass);}
 assert.equal(combatSettings({bagMass:201}).bagMass,5.07);assert.equal(combatSettings({bagMass:25.5}).bagMass,25.5);
 const a=new CombatWorld('defend',{bagMass:.5}),b=new CombatWorld('defend',{bagMass:200});assert.equal(a.bag.body.getMass(),b.bag.body.getMass());
});
test('slack rope lets a bag move upward and recovers tension without detaching after impact',()=>{
 for(const mass of [.5,50,200]){const w=new CombatWorld('punch',{bagMass:mass,observationSeconds:4,disturbances:false}),body=w.bag.body;body.setLinearVelocity(Vec2(0,2));for(let i=0;i<6;i++)w.step(zero);let snapshot=w.snapshot().bag,hook=bagAttachment(snapshot);assert.ok(Math.hypot(hook[0]-snapshot.anchor[0],hook[1]-snapshot.anchor[1])<BAG_ROPE_LENGTH-.05);
  body.applyLinearImpulse(Vec2(mass*3,mass*1.5),body.getWorldCenter(),true);while(!w.done){w.step(zero);snapshot=w.snapshot().bag;hook=bagAttachment(snapshot);assert.ok(Math.hypot(hook[0]-snapshot.anchor[0],hook[1]-snapshot.anchor[1])<=BAG_ROPE_LENGTH+.04);assert.ok(snapshot.position.every(Number.isFinite));}
 }
});
test('bag live and recorded poses interpolate continuously and cable ends exactly at rotating hook',()=>{
 const w=new CombatWorld('kick'),a=w.snapshot();w.bag.body.setPosition(Vec2(.4,1.6));w.bag.body.setAngle(.8);const b=w.snapshot();b.time=a.time+.04;
 const mid=interpolateFrame(a,b,.5),bag=mid.bag;assert.ok(Math.abs(bag.position[0]-(a.bag.position[0]+b.bag.position[0])/2)<1e-9);assert.equal(bag.angle,.4);assert.deepEqual(traceFrame([a,b],.02).bag.position,bag.position);
 const points=bagRopePath(bag,.02);assert.deepEqual(points[0],bag.anchor);const hook=bagAttachment(bag);assert.ok(Math.hypot(points.at(-1)[0]-hook[0],points.at(-1)[1]-hook[1])<1e-12);
 assert.notDeepEqual(points[16],[(bag.anchor[0]+hook[0])/2,(bag.anchor[1]+hook[1])/2]);assert.ok(points.flat().every(Number.isFinite));
 const wrapped=interpolateBag({...a.bag,angle:3.1},{...b.bag,angle:-3.1},.5);assert.ok(Math.abs(wrapped.angle-Math.PI)<1e-9);
});
test('new bag conditions preserve learned model while serial/worker validation use the selected mass',async()=>{
 const {RobotLearner}=await import('../robot-learning.mjs'),{ParallelRollouts}=await import('../robot-rollouts.mjs'),{evaluateAbility,VALIDATION_CASES}=await import('../robot-core.mjs');
 const l=new RobotLearner(null,42,{}, {deferEvaluation:true}),old=l.snapshot();old.environment.combatVersion=2;delete old.environment.bagMass;old.weights[0]=.4;old.attempts=10;old.taskAttempts.punch=10;old.algorithmAttempts.ppo=10;
 const updated=new RobotLearner(old,42,{bagMass:40},{deferEvaluation:true});assert.equal(updated.id,old.id);assert.deepEqual(updated.weights,old.weights);assert.equal(updated.attempts,10);assert.equal(updated.evaluationPending,true);assert.equal(updated.environment.bagMass,40);assert.equal(updated.environment.combatVersion,3);
 const cases=VALIDATION_CASES.slice(0,2).map(c=>({...c,seconds:1})),pool=new ParallelRollouts({enabled:false});try{const a=evaluateAbility(zero,'punch',{bagMass:25.5},cases),b=await pool.ability(zero,'punch',{bagMass:25.5},()=>true,cases);assert.deepEqual(a,b);assert.ok(a.cases.every(c=>c.metrics.combat.bagMass===25.5));}finally{pool.close();}
});
