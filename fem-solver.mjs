import {mesh,prepare,elementStiffness,assemble,zeroMatrix,constraints,factor,matvec} from './fem-core.mjs?v=1';
import {integrate,zeroState,vonMises,elasticMatrix} from './fem-material.mjs?v=1';
export function solveElastic(options={}) {
 const model=mesh(options.nx||8,2,2),elements=[],K=zeroMatrix(model.nodes.length*3),events=[],elementMatrices=[],D=elasticMatrix();
 const record=(stage,detail={})=>events.push({stage,frame:0,...detail});
 model.elements.forEach((ids,element)=>{
  const el=prepare({...model,elements:[ids]})[0];elements.push(el);
  record('shape',{element});record('B',{element});record('D',{element});
  const Ke=elementStiffness(el,D);elementMatrices.push(Ke);record('Ke',{element});
  assemble(K,Ke,el.dofs);record('assembly',{element,assembled:element+1});
 });
 const {free}=constraints(model,0);
 const solve=factor(free.map(i=>free.map(j=>K[i][j]))), frames=[];
 const peak=options.delta??.005, steps=options.steps||12;
 for(let step=0;step<=2*steps;step++) {
  const delta=peak*(step<=steps?step/steps:2-step/steps), {prescribed}=constraints(model,delta), U=Array(K.length).fill(0);
  for(const [i,v] of prescribed)U[i]=v;
  const rhs=free.map(i=>-[...prescribed].reduce((s,[j,v])=>s+K[i][j]*v,0));
  record('boundary',{frame:step});
  const uf=solve(rhs);free.forEach((i,j)=>U[i]=uf[j]);record('solve',{frame:step});
  const force=matvec(K,U),strains=elements.map(el=>el.points.map(p=>matvec(p.B,el.dofs.map(i=>U[i]))));
  record('strain',{frame:step});
  const points=strains.map(el=>el.map(strain=>{
   const r=integrate(strain,zeroState());
   return {strain,stress:r.stress,mises:vonMises(r.stress),peeq:0};
  }));
  record('stress',{frame:step});
  const reaction=model.nodes.reduce((s,[x],i)=>s+(Math.abs(x-model.L)<1e-12?force[3*i+2]:0),0);
  frames.push({step,delta,U,force,points,reaction,residual:Math.hypot(...free.map(i=>force[i])),phase:step<=steps?'가력':'변위 0으로 복귀'});
  record('reaction',{frame:step});
 }
 return {model,elements,K,free,frames,events,elementMatrices,mode:'elastic'};
}
