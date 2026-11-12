import test from 'node:test';import assert from 'node:assert/strict';
import {CombatWorld,POLICY_SIZE} from '../robot-core.mjs';
import {Vec2} from '../vendor/planck.mjs';
const zero=Array(POLICY_SIZE).fill(0);
test('each task keeps its intended physical training apparatus, even with old saved drill choices',()=>{
 for(const drill of ['auto','bag','limited','sparring','selfplay']){
  const fight=new CombatWorld('fight',{combatDrill:drill});assert.ok(fight.opponent);assert.equal(fight.bag,undefined);
  for(const task of ['punch','kick']){const w=new CombatWorld(task,{combatDrill:drill});assert.ok(w.bag&&!w.bag.glove);assert.equal(w.opponent,undefined);assert.equal(w.snapshot().bag.height,.96);}
  const defense=new CombatWorld('defend',{combatDrill:drill});assert.equal(defense.bag.glove,true);assert.equal(defense.opponent,undefined);
 }
});
test('incoming gloves vary direction, speed and height, and their actual velocity enters observations',()=>{
 const launches=[];
 for(let seed=1;seed<=16;seed++){
  const w=new CombatWorld('defend',{seed,observationSeconds:2});w.nextBagSwing=0;w.step(zero,false);
  const v=w.bag.body.getLinearVelocity(),snapshot=w.snapshot();launches.push({speed:Math.hypot(v.x,v.y),direction:Math.sign(v.x),y:snapshot.bag.position[1]});
  const before=w.observations();w.bag.body.setLinearVelocity(Vec2(0,0));assert.notDeepEqual(w.observations(),before);assert.ok(snapshot.bag.glove);
 }
 assert.ok(launches.every(x=>x.speed>=1.4&&x.speed<=7.1));assert.equal(new Set(launches.map(x=>x.direction)).size,2);assert.ok(Math.max(...launches.map(x=>x.y))-Math.min(...launches.map(x=>x.y))>.2);
});
test('training glove transfers physical momentum and damage, rather than visual-only contact',()=>{
 const w=new CombatWorld('defend',{observationSeconds:2});const head=w.parts.head.getPosition();w.bag.body.setPosition(Vec2(head.x+.65,head.y));w.bag.body.setLinearVelocity(Vec2(-7,0));
 for(let i=0;i<50;i++){w.time=i/240;w.world.step(1/240,10,16);}
 assert.ok(w.combatState.damageTaken>0);assert.ok(w.combatHits.some(h=>h.kind==='punch'&&h.target===0));assert.ok(w.bodies.some(({body})=>Math.abs(body.getLinearVelocity().x)>.1));
});
