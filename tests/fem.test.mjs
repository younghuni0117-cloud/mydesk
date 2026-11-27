import test from 'node:test';
import assert from 'node:assert/strict';
import {mesh,prepare,shape,elementStiffness,matvec,factor} from '../fem-core.mjs';
import {elasticMatrix,integrate,zeroState,vonMises,principal,MATERIAL} from '../fem-material.mjs';
import {solveElastic} from '../fem-solver.mjs';
import {DEFAULT_MENUS,withFEMMenu} from '../navigation-data.mjs';
test('Hex8 partition, volume, affine displacement patch, stiffness symmetry and rigid modes',()=>{
 const m=mesh(1,1,1),e=prepare(m)[0],K=elementStiffness(e);
 assert.ok(Math.abs(shape(.1,.2,.3).N.reduce((a,b)=>a+b)-1)<1e-12);
 assert.ok(Math.abs(e.points.reduce((s,p)=>s+p.det,0)-.0144)<1e-12);
 const u=m.elements[0].flatMap(n=>{const [x,y,z]=m.nodes[n];return [.01*x+.02*y,.03*y,.04*z];});
 for(const p of e.points){const strain=matvec(p.B,u);[.01,.03,.04,.02,0,0].forEach((v,i)=>assert.ok(Math.abs(strain[i]-v)<1e-12));}
 const max=Math.max(...K.flat().map(Math.abs));for(let i=0;i<24;i++)for(let j=0;j<24;j++)assert.ok(Math.abs(K[i][j]-K[j][i])<max*1e-12);
 for(let axis=0;axis<3;axis++){const rigid=Array.from({length:24},(_,i)=>i%3===axis?1:0);assert.ok(Math.max(...matvec(K,rigid).map(Math.abs))<max*1e-12);}
});
test('pivoted linear solve',()=>assert.deepEqual(factor([[0,2],[1,3]])([4,7]),[1,2]));
test('elastic load/unload constraints, equilibrium, energy and reactions',()=>{
 const r=solveElastic({nx:4,steps:2}),f=r.frames[2];
 r.model.nodes.forEach(([x],n)=>{if(x===0)for(let j=0;j<3;j++)assert.equal(f.U[3*n+j],0);if(x===1)assert.equal(f.U[3*n+2],-.005);});
 assert.ok(f.residual<1e-6);const sums=[0,1,2].map(j=>f.force.reduce((s,v,i)=>s+(i%3===j?v:0),0));sums.forEach(v=>assert.ok(Math.abs(v)<1e-6));
 assert.ok(f.U.reduce((s,v,i)=>s+v*f.force[i],0)>0);assert.ok(r.frames.at(-1).U.every(v=>Math.abs(v)<1e-12));assert.ok(r.frames.at(-1).points.flat().every(p=>p.mises===0));
});
test('cantilever reaction converges toward independent beam theory',()=>{
 const E=MATERIAL.E,I=.12**4/12,exact=3*E*I*.005;
 const errors=[4,12,24].map(nx=>Math.abs(Math.abs(solveElastic({nx,steps:1}).frames[1].reaction)/exact-1));
 assert.ok(errors[2]<errors[0]);assert.ok(errors[2]<.1,JSON.stringify(errors));
});
test('J2 radial return yield consistency, plastic incompressibility and state immutability',()=>{
 const old=zeroState(),r=integrate([.01,0,0,0,0,0],old,true);
 assert.ok(r.yielded);assert.ok(Math.abs(vonMises(r.stress)-(MATERIAL.yield+MATERIAL.H*r.state.peeq))<1e-5);
 assert.ok(Math.abs(r.state.plastic.slice(0,3).reduce((a,b)=>a+b))<1e-12);assert.equal(old.peeq,0);
 assert.deepEqual(principal([3,2,1,0,0,0]),[3,2,1]);assert.ok(Math.abs(principal([0,0,0,2,0,0])[0]-2)<1e-12);
});
test('new top-level menu preserves legacy nested simulation and existing menus',()=>{
 const old=DEFAULT_MENUS.filter(m=>!['simulation-lab','fem-live'].includes(m.id)),next=withFEMMenu(old);
 assert.deepEqual(next.slice(0,old.length),old);assert.equal(next.find(m=>m.id==='simulation').parent_id,'learning');assert.equal(next.find(m=>m.id==='fem-live').parent_id,'simulation-lab');assert.deepEqual(withFEMMenu(next),next);
});
