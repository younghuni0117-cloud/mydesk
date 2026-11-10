import test from 'node:test';import assert from 'node:assert/strict';
import {cameraFrame,reanchorCamera,cameraPreferences} from '../robot-camera.mjs';
import {RobotWorld} from '../robot-core.mjs';import {POLICY_SIZE} from '../robot-policy.mjs';
import {trainingCondition,TRAINING_COURSES} from '../robot-training-ground.mjs';
test('terrain relief never changes zoom; reanchoring preserves robot pixels and chosen fixed/follow views',()=>{
 const input={width:390,height:360,zoom:1.37,panX:.4,panY:.2,follow:false,root:[1.2,2.3],datum:1};
 const first=cameraFrame(input),root=[0,16.2],datum=15,anchor=reanchorCamera({...input,root,datum,previous:{x:input.root[0],relativeY:input.root[1]-input.datum}}),next=cameraFrame({...input,...anchor,root,datum});
 assert.equal(first.scale,next.scale);assert.ok(Math.abs((input.root[0]-first.camera)-(root[0]-next.camera))<1e-12);assert.ok(Math.abs((first.ground-input.root[1]*first.scale)-(next.ground-root[1]*next.scale))<1e-10);
 const following=cameraFrame({...input,root,datum,follow:true});assert.equal(following.scale,first.scale);assert.equal(following.camera,root[0]);assert.deepEqual(cameraPreferences({zoom:1.37,panX:3,panY:-1}),{zoom:1.37,panX:3,panY:-1});
});
function clearance(world){let minimum=Infinity;const take=p=>minimum=Math.min(minimum,p.y-world.groundHeight(p.x));for(const item of world.bodies)for(let f=item.body.getFixtureList();f;f=f.getNext()){const shape=f.getShape();if(shape.getType()==='circle'){const center=item.body.getWorldPoint(shape.getCenter());for(let i=0;i<64;i++){const a=i*Math.PI/32;take({x:center.x+shape.getRadius()*Math.cos(a),y:center.y+shape.getRadius()*Math.sin(a)});}}else for(const v of shape.m_vertices)take(item.body.getWorldPoint(v));}return minimum;}
test('every training course starts both standing and lying robots on the real floor, without penetration or an initial launch',()=>{
 for(const course of TRAINING_COURSES)for(const task of ['balance','recover'])for(const seed of [1,2]){const spec={...trainingCondition(0,42),course,angle:35},w=new RobotWorld(task,{terrain:'training',trainingSpec:spec,seed,disturbances:false});const gap=clearance(w);assert.ok(gap>=.023&&gap<=.027,`${course} ${task} ${seed}: gap ${gap}`);assert.ok(w.bodies.every(p=>p.body.getLinearVelocity().lengthSquared()===0));const before=w.parts.pelvis.getPosition().y;w.step(Array(POLICY_SIZE).fill(0));assert.ok(w.parts.pelvis.getPosition().y-before<.01,`${course} ${task}: launch`);}
});
