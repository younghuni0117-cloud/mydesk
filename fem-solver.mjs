import {mesh,linearSystem,constraints,factor,matvec} from './fem-core.mjs?v=1';
import {integrate,zeroState,vonMises} from './fem-material.mjs?v=1';
export function solveElastic(options={}) {
 const model=mesh(options.nx||8,2,2), {elements,K}=linearSystem(model), {free}=constraints(model,0);
 const solve=factor(free.map(i=>free.map(j=>K[i][j]))), frames=[];
 const peak=options.delta??.005, steps=options.steps||12;
 for(let step=0;step<=2*steps;step++) {
  const delta=peak*(step<=steps?step/steps:2-step/steps), {prescribed}=constraints(model,delta), U=Array(K.length).fill(0);
  for(const [i,v] of prescribed)U[i]=v;
  const rhs=free.map(i=>-[...prescribed].reduce((s,[j,v])=>s+K[i][j]*v,0));
  const uf=solve(rhs);free.forEach((i,j)=>U[i]=uf[j]);
  const force=matvec(K,U), points=elements.map(el=>el.points.map(p=>{
   const strain=matvec(p.B,el.dofs.map(i=>U[i])), r=integrate(strain,zeroState());
   return {strain,stress:r.stress,mises:vonMises(r.stress),peeq:0};
  }));
  const reaction=model.nodes.reduce((s,[x],i)=>s+(Math.abs(x-model.L)<1e-12?force[3*i+2]:0),0);
  frames.push({step,delta,U,force,points,reaction,residual:Math.hypot(...free.map(i=>force[i])),phase:step<=steps?'가력':'변위 0으로 복귀'});
 }
 return {model,elements,K,free,frames,mode:'elastic'};
}
