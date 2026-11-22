import {LEGS,rotate,inverseRotate,collisionSamples} from './robotdog-rig.mjs?v=dog17';

// First physical surface along the incoming ray. Never strike through a nearer limb to reach an inner target.
export function strikeSurface(world,target,direction){
 const norm=Math.hypot(...direction)||1,d=direction.map(v=>v/norm),centre=rotate(target.local,world.a).map((v,i)=>v+world.p[i]),origin=centre.map((v,i)=>v-2*d[i]);
 let nearest=Infinity,result=target;
 const choose=(t,descriptor)=>{if(t>=0&&t<nearest){nearest=t;const point=origin.map((v,i)=>v+t*d[i]);result={...descriptor,local:inverseRotate(point.map((v,i)=>v-world.p[i]),world.a)};}};
 const o=inverseRotate(origin.map((v,i)=>v-world.p[i]),world.a),ray=inverseRotate(d,world.a),low=[-.48,-.12,-.125],high=[.505,.14,.125];let enter=0,exit=4;
 for(let j=0;j<3;j++){if(Math.abs(ray[j])<1e-9){if(o[j]<low[j]||o[j]>high[j])exit=-1;}else{const a=(low[j]-o[j])/ray[j],b=(high[j]-o[j])/ray[j];enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}}
 if(exit>=enter){const x=o[0]+enter*ray[0];choose(enter,{affected:0,part:x>.42?'전면':x<-.4?'후면':'몸통'});}
 for(const sample of collisionSamples(world.p,world.a,world.q)){
  if(sample.leg==null)continue;const offset=origin.map((v,i)=>v-sample.p[i]),b=offset.reduce((s,v,i)=>s+v*d[i],0),c=offset.reduce((s,v)=>s+v*v,0)-sample.radius**2,disc=b*b-c;
  if(disc>=0)choose(-b-Math.sqrt(disc),{leg:sample.leg,affected:sample.affected,part:LEGS[sample.leg].label+(sample.foot!=null?' 발':sample.affected===2?' 상부 다리':' 하부 다리')});
 }
 return result;
}
export function inwardDirection(world,target){
 const local=target.affected===0&&Math.abs(target.local[0])>.38?[Math.sign(target.local[0]),0,0]:[0,0,Math.sign(target.local[2])||1],out=rotate(local,world.a),n=Math.hypot(out[0],out[2])||1;
 return[-out[0]/n,0,-out[2]/n];
}

// Keep the contact phase on the same simulation timestamp as the impulse during interpolated replay.
export function interpolateStrike(a,b,time,alpha){
 if(!b)return a;if(!a||a.id!==b.id)return time>=(b.started??b.time)?b:a;
 if(a.phase==='windup'&&b.phase==='impact'&&time>=b.time)return b;
 if(a.phase==='windup'&&b.phase==='windup')return{...a,point:a.point.map((v,i)=>v+(b.point[i]-v)*alpha),impulse:a.impulse.map((v,i)=>v+(b.impulse[i]-v)*alpha)};
 return a;
}
