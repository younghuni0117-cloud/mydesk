import test from 'node:test';import assert from 'node:assert/strict';
import {SwingLearner,actionTargets,ACTION_COUNT,SWING,STEPS} from '../swing-engine.mjs';
import {standingPose,RIG,cablePoint} from '../swing-pose.mjs';
import {rewardSeries,rewardDomain} from '../swing-chart.mjs';
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
test('standing rider keeps both feet and hands attached with anatomical segment lengths',()=>{
 for(const hip of [-.5,0,.5])for(const leftKnee of [.06,.75,1.45])for(const rightKnee of [.06,.75,1.45]){
  const p=standingPose({hip,leftKnee,rightKnee});assert.ok(p.pelvis[1]>.74,'standing/crouched pelvis stays above feet');
  for(const side of ['left','right']){const l=p.legs[side],a=p.arms[side];assert.ok(Math.abs(distance(l.hip,l.knee)-RIG.thigh)<1e-9);assert.ok(Math.abs(distance(l.knee,l.ankle)-RIG.shin)<1e-9);assert.equal(l.sole[1],.09);assert.ok(Math.abs(distance(a.shoulder,a.elbow)-RIG.upperArm)<1e-9);assert.ok(Math.abs(distance(a.elbow,a.hand)-RIG.forearm)<1e-9);assert.equal(a.hand[0],0);assert.equal(a.hand[1],RIG.gripHeight);assert.equal(Math.abs(a.hand[2]),RIG.ropeSpacing);assert.ok(l.knee[0]>l.ankle[0],'knees bend forward');}
 }
});
test('27 actions include independent left/right knee targets and remain finite over full episodes',()=>{
 assert.equal(ACTION_COUNT,27);assert.notEqual(actionTargets(2).leftKnee,actionTargets(2).rightKnee);let seed=42;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};const l=new SwingLearner(random);let completed=0;
 for(let i=0;i<STEPS*35;i++){const result=l.step(.4,.8);if(result)completed++;for(const x of Object.values(l.snapshot()))assert.ok(Number.isFinite(x));assert.ok(Math.abs(l.theta)<=SWING.maxAngle);assert.ok(l.leftKnee>=.06&&l.leftKnee<=1.45);assert.ok(l.rightKnee>=.06&&l.rightKnee<=1.45);}
 assert.equal(completed,35);assert.equal(l.episodes,35);assert.equal(l.history.length,35);assert.ok([...l.q.values()].some(row=>row.some(v=>v!==0)));
 const before=JSON.stringify([...l.q].map(([s,v])=>[s,[...v]])),history=JSON.stringify(l.history);for(let i=0;i<STEPS*2;i++)l.step(1,.8,false);assert.equal(l.episodes,35);assert.equal(JSON.stringify(l.history),history);assert.equal(JSON.stringify([...l.q].map(([s,v])=>[s,[...v]])),before,'observation cannot update or grow Q table');
});
test('chart uses actual episode indices and an honest trailing ten-episode average',()=>{const h=Array.from({length:100},(_,i)=>({reward:i/100})),s=rewardSeries(h,243);assert.equal(s[0].episode,144);assert.equal(s.at(-1).episode,243);assert.ok(Math.abs(s[9].trend-.045)<1e-9);assert.ok(Math.abs(s.at(-1).trend-.945)<1e-9);for(const rows of [[],[{reward:.2}],[{reward:-.7},{reward:3}]]){const d=rewardDomain(rows);assert.ok(d.max>d.min);for(const p of rows)assert.ok(p.reward>=d.min&&p.reward<=d.max);}});

test('long cables keep end anchors fixed and anatomical limbs connected throughout motion',()=>{
 assert.equal(SWING.ropeLength,4.3);assert.ok(SWING.pivotHeight-SWING.ropeLength>1);
 for(const theta of [-1.3,0,1.3])for(const omega of [-4.8,0,4.8])for(const hip of [-.5,0,.5])for(const leftKnee of [.06,.75,1.45])for(const rightKnee of [.06,.75,1.45]){
  const state={theta,omega,time:7.3,hip,leftKnee,rightKnee},p=standingPose(state);
  assert.ok(Math.abs(cablePoint(0,state)[0])<1e-12);assert.ok(Math.abs(cablePoint(SWING.ropeLength,state)[0])<1e-12);
  for(const side of ['left','right']){const a=p.arms[side],l=p.legs[side];assert.ok(Math.abs(distance(a.shoulder,a.elbow)-RIG.upperArm)<1e-9);assert.ok(Math.abs(distance(a.elbow,a.hand)-RIG.forearm)<1e-9);assert.equal(a.hand[0],cablePoint(RIG.gripHeight,state)[0]);const axis=a.hand.map((v,i)=>v-a.shoulder[i]),len=Math.hypot(...axis),u=axis.map(v=>v/len),delta=a.elbow.map((v,i)=>v-a.shoulder[i]),along=delta.reduce((sum,v,i)=>sum+v*u[i],0),bend=delta.map((v,i)=>v-along*u[i]),pole=[-.65,-1,(side==='left'?1:-1)*.12];assert.ok(bend.reduce((sum,v,i)=>sum+v*pole[i],0)>0,'elbows stay on the downward anatomical bend side, never flip');assert.ok(l.knee[0]>l.hip[0]&&l.knee[0]>l.ankle[0],'knees only bend forward');}
 }
 assert.notEqual(cablePoint(2,{theta:.6,omega:1,time:1})[0],cablePoint(2,{theta:.6,omega:1,time:1.4})[0],'cable has motion-dependent flex');
});
