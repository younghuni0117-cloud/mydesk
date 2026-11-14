import test from 'node:test';
import assert from 'node:assert/strict';
import {bagStrikeReward,BagStrikeContacts,BagStrikeRecovery,BAG_REWARDS} from '../robot-strike-rewards.mjs';
import {CombatWorld,DT,POLICY_SIZE} from '../robot-core.mjs';
import {RobotLearner} from '../robot-learning.mjs';
import {Vec2} from '../vendor/planck.mjs';
import {impactDamage} from '../robot-combat.mjs';
import {rewardBreakdown} from '../robot-rewards.mjs';
test('valid bag impacts are strongly rewarded with a bounded, monotonic impact/speed bonus',()=>{
 assert.equal(bagStrikeReward({impulse:30,closing:.4}),0);assert.equal(bagStrikeReward({impulse:.1,closing:10}),0);
 const weak=bagStrikeReward({impulse:1,closing:1.3}),medium=bagStrikeReward({impulse:10,closing:4}),strong=bagStrikeReward({impulse:50,closing:10});
 assert.ok(weak>=8&&weak<medium&&medium<strong&&strong<=90);assert.ok(strong>2*impactDamage({impulse:50,closing:10,target:'torso'}));assert.ok(bagStrikeReward({impulse:1e8,closing:1e8})<=90);assert.equal(bagStrikeReward({impulse:NaN,closing:3}),0);
});
test('all fixtures of a limb must separate; contact jitter and holding cannot repeat the bonus',()=>{
 const c=new BagStrikeContacts(),a={},b={};c.begin(a,0);c.begin(a,0);assert.equal(c.claim(a),true);assert.equal(c.claim(a),false);c.end(a,.2);assert.equal(c.claim(a),false);c.begin(a,.5);assert.equal(c.claim(a),false);c.end(a,.6);c.end(a,.6);c.begin(a,.61);assert.equal(c.claim(a),false);c.end(a,.65);c.begin(a,.8);assert.equal(c.claim(a),true);c.begin(b,.8);assert.equal(c.claim(b),true);
});
test('post-hit recovery is a one-off outcome reward; combinations require that recovery',()=>{
 const r=new BagStrikeRecovery();assert.equal(r.step(1,1,true),0);assert.equal(r.strike(1),0);assert.equal(r.step(1.1,.1,true),0);assert.equal(r.step(1.2,.1,false),0);assert.equal(r.step(1.3,.1,true),0);assert.equal(r.step(1.4,.1,true),0);assert.equal(r.step(1.5,.1,true),3);assert.equal(r.step(1.6,1,true),0);assert.equal(r.strike(1.7),2);assert.equal(r.strike(1.8),0);assert.equal(r.step(4,.3,true),0);assert.equal(r.strike(5),0);
 assert.ok(BAG_REWARDS.fall>=bagStrikeReward({impulse:1000,closing:20})+BAG_REWARDS.combination+BAG_REWARDS.recovery);
});
test('bag fall/down costs cover an isolated maximal hit without changing other task penalties',()=>{
 const state={dt:.1,newFall:true,down:true,upright:false,motionQuality:.2,speed:0,target:0,angle:1,height:.3,distance:0,dx:0,impactCost:0,work:0};
 for(const stage of ['punch','kick']){const terms=rewardBreakdown(stage,state);assert.equal(terms.fall,-100);assert.equal(terms.down,-.4);assert.ok(terms.fall+bagStrikeReward({impulse:1000,closing:20})+BAG_REWARDS.recovery+BAG_REWARDS.combination<0);}
 assert.equal(rewardBreakdown('fight',state).fall,-12);assert.equal(rewardBreakdown('balance',state).fall,-30);
});
function launch(w,kind,speed=8){const limb=kind==='punch'?w.parts.rightForearm:w.parts.rightFoot;const joint=kind==='punch'?'rightElbow':'rightAnkle';if(w.joints[joint]){w.world.destroyJoint(w.joints[joint]);delete w.joints[joint];}const q=w.bag.body.getPosition();limb.setPosition(Vec2(q.x-.65,q.y));limb.setAngle(kind==='punch'?Math.PI/2:0);limb.setAngularVelocity(0);limb.setLinearVelocity(Vec2(speed,0));return limb;}
test('actual hand and foot collisions transfer momentum and get the new reward at the impact location',()=>{
 for(const kind of ['punch','kick']){const w=new CombatWorld(kind,{record:true,bagMass:20,disturbances:false}),limb=launch(w,kind);for(let i=0;i<90;i++){w.time=i/240;w.world.step(1/240,10,16);}const hits=w.combatHits.filter(e=>e.kind===kind&&e.attacker===0);assert.ok(hits.length>0,kind+' physically hits bag');assert.ok(w.bag.body.getLinearVelocity().length()>.01);assert.ok(w.rewardTerms.strike>=8);assert.ok(w.rewardFeedback.snapshot().some(e=>e.value>=8&&e.body===limb.getUserData()));const count=w.combatState.hits;w.time+=1;w.registerStrike(limb,w.bag.body,50,{closing:10,point:[w.bag.body.getPosition().x-.22,w.bag.body.getPosition().y]});assert.equal(w.combatState.hits,count,'same contact never repeats reward');limb.setPosition(Vec2(-4,1.2));limb.setLinearVelocity(Vec2(0,0));for(let i=0;i<40;i++){w.time+=1/240;w.world.step(1/240,10,16);}w.bag.body.setPosition(Vec2(.05,1.2));w.bag.body.setAngle(0);w.bag.body.setLinearVelocity(Vec2(0,0));launch(w,kind);for(let i=0;i<90;i++){w.time+=1/240;w.world.step(1/240,10,16);}assert.ok(w.combatState.hits>count,'genuine separation allows a new hit');}
});
test('wrong attack type is penalized and body ramming is never an eligible attack',()=>{
 const w=new CombatWorld('punch',{bagMass:20,disturbances:false});launch(w,'kick');for(let i=0;i<70;i++){w.time=i/240;w.world.step(1/240,10,16);}assert.ok(w.combatState.kicks>0);assert.ok(w.rewardTerms.strike<0);assert.equal(w.bagStrikeRecovery.hit,null);const before=w.combatState.hits;w.time+=1;w.registerStrike(w.parts.torso,w.bag.body,100,{closing:20,point:[0,1.2]});assert.equal(w.combatState.hits,before);
});
test('reward upgrade retains policy, training counts and history while re-evaluating the old score basis',()=>{
 const old=new RobotLearner(null,42,{}, {deferEvaluation:true}).snapshot();old.environment.combatVersion=3;old.weights[0]=.4;old.attempts=40;old.taskAttempts.punch=40;old.algorithmAttempts.ppo=40;const next=new RobotLearner(old,42,{}, {deferEvaluation:true});assert.equal(next.id,old.id);assert.deepEqual(next.weights,old.weights);assert.equal(next.attempts,40);assert.equal(next.taskAttempts.punch,40);assert.equal(next.environment.combatVersion,4);assert.equal(next.evaluationPending,true);assert.deepEqual(next.history,old.history);assert.ok(RobotLearner.valid(next.snapshot()));
});
