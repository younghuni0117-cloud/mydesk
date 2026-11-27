import test from 'node:test';
import assert from 'node:assert/strict';
import {solveElastic} from '../fem-solver.mjs';
import {playbackState,partialStiffness,eventMatrix,tractions,STAGES} from '../fem-playback.mjs';
import {assemble,zeroMatrix,matvec} from '../fem-core.mjs';
const r=solveElastic({nx:4,steps:2});
test('recorded event sequence covers actual assembly and each solved increment without invented Newton steps',()=>{
 assert.equal(r.events.length,r.elements.length*5+r.frames.length*5);
 for(let i=0;i<r.elements.length;i++)assert.deepEqual(r.events.slice(i*5,i*5+5).map(e=>e.stage),['shape','B','D','Ke','assembly']);
 for(let i=0;i<r.frames.length;i++){const events=r.events.filter(e=>e.element===undefined&&e.frame===i);assert.deepEqual(events.map(e=>e.stage),['boundary','solve','strain','stress','reaction']);}
 assert.ok(r.events.every(e=>STAGES[e.stage]));assert.ok(!r.events.some(e=>/newton/i.test(e.stage)));
});
test('partial assembly reproduces scatter-add and final global matrix, no future element contribution',()=>{
 const K=zeroMatrix(r.K.length);assemble(K,r.elementMatrices[0],r.elements[0].dofs);
 assert.deepEqual(partialStiffness(r,1),K);assert.deepEqual(partialStiffness(r,r.elements.length),r.K);
 assert.ok(eventMatrix(r,r.events[0],0,0,'K').A.every(row=>row.every(v=>v===0)));
 assert.deepEqual(eventMatrix(r,r.events[4],0,0).A,K);
});
test('boundary preview, displacement, strain, stress and reaction unlock only in their calculation stage',()=>{
 const find=stage=>r.events.findIndex(e=>e.stage===stage&&e.frame===2);
 const bc=playbackState(r,find('boundary')),solved=playbackState(r,find('solve')),strain=playbackState(r,find('strain')),stress=playbackState(r,find('stress')),reaction=playbackState(r,find('reaction'));
 assert.equal(bc.geometryReady,false);assert.equal(bc.display.U[r.model.nodes.findIndex(p=>p[0]===r.model.L)*3+2],-.005);
 assert.deepEqual(solved.display.U,r.frames[2].U);assert.equal(solved.stressReady,false);assert.ok(solved.display.points.flat().every(p=>p.mises===0));
 assert.equal(strain.strainReady,true);assert.equal(strain.stressReady,false);assert.equal(stress.stressReady,true);assert.equal(stress.reactionReady,false);assert.equal(reaction.reactionReady,true);
 const original=r.frames[2].U[0];solved.display.U[0]=999;assert.equal(r.frames[2].U[0],original);
});
test('selected Gauss point matrices agree with actual computed strain and stress',()=>{
 const event=r.events.find(e=>e.stage==='stress'&&e.frame===2),element=3,point=5,el=r.elements[element];
 const B=eventMatrix(r,event,element,point,'B').A,D=eventMatrix(r,event,element,point,'D').A;
 assert.deepEqual(matvec(B,el.dofs.map(i=>r.frames[2].U[i])),r.frames[2].points[element][point].strain);
 assert.deepEqual(matvec(D,r.frames[2].points[element][point].strain),r.frames[2].points[element][point].stress);
 assert.equal(eventMatrix(r,event,element,point,'N').A[0].length,8);assert.equal(eventMatrix(r,event,element,point,'J').A.length,3);
});
test('stress cube uses traction σn with equal and opposite face forces, including signed shear',()=>{
 const faces=tractions([10,20,30,4,-5,6]);
 assert.deepEqual(faces.find(f=>f.axis===0&&f.sign===1).traction,[10,4,6]);
 assert.deepEqual(faces.find(f=>f.axis===1&&f.sign===1).traction,[4,20,-5]);
 for(let axis=0;axis<3;axis++){const [a,b]=faces.filter(f=>f.axis===axis);a.traction.forEach((v,j)=>assert.equal(v,-b.traction[j]));}
});
