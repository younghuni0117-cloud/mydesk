import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {RobotObservation} from '../robot-observation.mjs';import {POLICY_SIZE} from '../robot-core.mjs';
const weights=Array(POLICY_SIZE).fill(0);
test('observation client discards stale terrain frames, pauses once and queues commands while loading',()=>{
 const sent=[],worker={postMessage:d=>sent.push(d),terminate(){}},client=new RobotObservation(()=>worker),frame={time:0,parts:[[0,1,0]],metrics:{task:'balance',done:false}};
 client.start('balance',{},weights);const first=client.generation;client.start('punch',{},weights);worker.onmessage({data:{type:'ready',generation:first,frame,geometry:{parts:[{name:'torso'}]}}});assert.equal(client.ready,false);
 const current=client.generation;client.push(3,0,'torso');assert.equal(sent.at(-1).generation,current);worker.onmessage({data:{type:'ready',generation:current,stage:'punch',duration:10,frame,geometry:{parts:[{name:'torso'}]},terrain:{kind:'meadow'},obstacles:[],pushes:[]}});assert.equal(client.world.stage,'punch');assert.deepEqual(client.world.parts.torso.getPosition(),{x:0,y:1});client.setPaused(true);const count=sent.length;client.setPaused(true);assert.equal(sent.length,count);
 client.stop();worker.onmessage({data:{type:'frame',generation:current,previous:frame,frame:{...frame,time:99}}});assert.equal(client.current.time,0);assert.equal(client.ready,false);
});
test('worker runs exact physical steps off the page, pauses, changes terrain and applies queued pushes',async()=>{
 const w=new Worker(new URL('./robot-observation-harness.mjs',import.meta.url)),events=[],waiters=[];w.on('message',d=>{events.push(d);for(const resolve of [...waiters])resolve();});
 const wait=predicate=>new Promise((resolve,reject)=>{const check=()=>{const found=events.find(predicate);if(found){clearTimeout(timer);waiters.splice(waiters.indexOf(check),1);resolve(found);}};const timer=setTimeout(()=>reject(Error('observation test timed out')),10000);waiters.push(check);check();});
 try{await wait(d=>d.type==='harness-ready');w.postMessage({type:'start',generation:1,stage:'balance',options:{terrain:'stones',observationSeconds:4,disturbances:false},weights});const ready=await wait(d=>d.type==='ready'&&d.generation===1);assert.equal(ready.geometry.parts.length,13);assert.equal(ready.frame.time,0);const moving=await wait(d=>d.type==='frame'&&d.generation===1&&d.frame.time>.1);assert.ok(moving.frame.time>moving.previous.time);assert.equal(moving.frame.vision.samples.length,34);
  w.postMessage({type:'pause',generation:1,paused:true});await wait(d=>d.type==='paused'&&d.paused);const frames=events.filter(d=>d.type==='frame').length;await new Promise(r=>setTimeout(r,80));assert.equal(events.filter(d=>d.type==='frame').length,frames);
  w.postMessage({type:'start',generation:2,stage:'punch',options:{terrain:'meadow',bagMass:25.5,observationSeconds:2},weights});w.postMessage({type:'push',generation:2,args:[3,0,'torso']});const bag=await wait(d=>d.type==='ready'&&d.generation===2);assert.equal(bag.frame.bag.mass,25.5);assert.ok(bag.frame.hits.some(h=>h.strength===3));
  w.postMessage({type:'start',generation:3,stage:'kick',options:{terrain:'meadow',bagMass:40,observationSeconds:2},weights});const kick=await wait(d=>d.type==='ready'&&d.generation===3);assert.equal(kick.stage,'kick');assert.equal(kick.frame.bag.mass,40);w.postMessage({type:'stop',generation:3});await wait(d=>d.type==='stopped'&&d.generation===3);
 }finally{await w.terminate();}
});
