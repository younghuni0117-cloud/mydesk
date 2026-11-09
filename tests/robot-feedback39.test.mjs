import test from 'node:test';import assert from 'node:assert/strict';
import {RewardFeedback,rewardLocations,rewardPopups,rewardText,drawRewardPopups,REWARD_FEEDBACK_LIFETIME} from '../robot-reward-feedback.mjs';
import {RobotWorld,POLICY_SIZE,episode,STAGES} from '../robot-core.mjs';
import {PPOOptimizer,ppoEpisode} from '../robot-ppo.mjs';
import {interpolateFrame} from '../robot-view.mjs';
const zero=Array(POLICY_SIZE).fill(0),point=()=>[{body:'torso',point:[1,2],weight:1}],total=t=>t.reduce((s,e)=>s+e.value,0),events=r=>[...new Map(r.trace.flatMap(f=>f.rewardEvents||[]).map(e=>[e.id,e])).values()];
test('positive and negative scores remain separate and continuous scores batch while discrete costs flush immediately',()=>{
 const f=new RewardFeedback();f.collect(.1,{standing:3,tilt:-5},point);assert.equal(f.snapshot().length,0);f.collect(.5,{},point);assert.deepEqual(f.snapshot().map(e=>e.value),[3,-5]);f.collect(.55,{fall:-30},point,true);assert.equal(f.snapshot().at(-1).value,-30);assert.equal(f.snapshot().at(-1).time,.55);const saved=f.snapshot();saved[0].point[0]=999;assert.equal(f.snapshot()[0].point[0],1);f.collect(2,{},point);assert.equal(f.snapshot().length,0);
});
test('all five real episodes account for every score including late failure and preserve original physics/rewards',()=>{
 for(const stage of Object.keys(STAGES)){const recorded=episode(zero,stage,31,{record:true,endOnFall:true,autoPush:false}),plain=episode(zero,stage,31,{autoPush:false,endOnFall:true});assert.deepEqual(recorded.metrics,plain.metrics);assert.ok(Math.abs(total(events(recorded))-recorded.metrics.reward)<1e-7,stage);assert.equal(recorded.trace.at(-1).time,recorded.metrics.time);assert.equal(plain.trace.length,0);assert.ok(events(recorded).every(e=>e.point.every(Number.isFinite)));}
 const w=new RobotWorld('walk',{autoPush:false});w.step(zero);assert.equal(w.rewardFeedback,null);assert.equal(w.snapshot().rewardEvents,undefined);
});
test('PPO recording preserves experience rewards and includes the final cost when the final physics step is odd',()=>{
 const o=new PPOOptimizer(zero,31),prepared={weights:zero,critic:o.critic,logStd:Array(16).fill(-4),task:'balance',seed:31,options:{record:true,endOnFall:true,autoPush:false,observationSeconds:3}};const r=ppoEpisode(prepared);assert.equal(r.trace.at(-1).time,r.metrics.time);assert.ok(Math.abs(total(events(r))-r.metrics.reward)<1e-7);assert.ok(Math.abs(r.experience.reduce((s,e)=>s+e.reward,0)-r.metrics.reward)<1e-7);assert.ok(events(r).some(e=>e.value<0));
});
test('body attribution uses actual head, feet, distal joint and contact coordinates',()=>{
 const w=new RobotWorld('balance',{record:true,autoPush:false}),head=w.parts.head.getWorldCenter();assert.deepEqual(rewardLocations(w,'gaze',{}),[{body:'head',point:[head.x,head.y],weight:1}]);assert.deepEqual(rewardLocations(w,'support',{}).map(p=>p.body),['leftFoot','rightFoot']);const distal={parts:[{body:'leftHand',motion:2,change:1},{body:'rightToePart',motion:1,change:0}]};assert.deepEqual(rewardLocations(w,'distalMotion',distal).map(p=>[p.body,p.weight]),[['leftHand',2],['rightToePart',1]]);w.rewardContactPoints=[{body:'head',point:[2,3],weight:4}];assert.equal(rewardLocations(w,'impact',distal),w.rewardContactPoints);
});
test('blue/red signed text floats and fades, keeps tiny nonzero scores nonzero, and never changes stored events',()=>{
 const frame={time:.55,rewardEvents:[{id:1,time:.5,value:3,point:[1,2]},{id:2,time:.5,value:-5,point:[1,2]},{id:3,time:.5,value:.999,point:[1,2]},{id:4,time:.5,value:-.999,point:[1,2]},{id:5,time:.5,value:1,point:[1,2]},{id:6,time:.5,value:-1,point:[1,2]}]},before=JSON.stringify(frame),drawn=[];const c={save(){},restore(){},measureText:()=>({width:20}),strokeText(){},fillText(text,x,y){drawn.push({text,x,y,color:this.fillStyle,alpha:this.globalAlpha,font:this.font});}};drawRewardPopups(c,frame,x=>x*10,y=>-y*10);assert.deepEqual(drawn.map(d=>[d.text,d.color]),[['+3','#2873c2'],['−5','#cb4850'],['+1','#2873c2'],['−1','#cb4850']]);assert.ok(drawn.every(d=>d.alpha>0&&d.alpha<=1&&d.font.includes('11px')));assert.equal(JSON.stringify(frame),before);assert.equal(rewardPopups({...frame,time:.5+REWARD_FEEDBACK_LIFETIME+.01}).length,0);assert.equal(rewardPopups({...frame,time:.4}).length,0);assert.notEqual(rewardText(.00000000001),'+0');
});
test('interpolation includes each reward event once, at its real time, without exposing future scores',()=>{
 const event={id:1,time:.5,value:3,point:[0,1]},a={time:.49,parts:[[0,0,0]],rewardEvents:[]},b={time:.51,parts:[[1,0,0]],rewardEvents:[event]};assert.equal(interpolateFrame(a,b,.25).rewardEvents.length,0);assert.equal(interpolateFrame(a,b,.75).rewardEvents.length,1);assert.equal(interpolateFrame({...a,rewardEvents:[event]},b,1).rewardEvents.length,1);assert.equal(a.rewardEvents.length,0);
});
