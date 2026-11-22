import {LEGS,rotate,inverseRotate,collisionSamples,SPOT,legPoints,linkPoint,DOG} from './robotdog-rig.mjs?v=dog31';

// First physical surface along the incoming ray. Never strike through a nearer limb to reach an inner target.
export function strikeSurface(world,target,direction){
 const norm=Math.hypot(...direction)||1,d=direction.map(v=>v/norm),centre=rotate(target.local,world.a).map((v,i)=>v+world.p[i]),origin=centre.map((v,i)=>v-2*d[i]);
 let nearest=Infinity,result=target;
 const choose=(t,descriptor)=>{if(t>=0&&t<nearest){nearest=t;const point=origin.map((v,i)=>v+t*d[i]);result={...descriptor,local:inverseRotate(point.map((v,i)=>v-world.p[i]),world.a)};}};
 const o=inverseRotate(origin.map((v,i)=>v-world.p[i]),world.a),ray=inverseRotate(d,world.a),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const hull=(shape,points,descriptor)=>{for(let i=0;i<shape.triangles.length;i+=3){const a=points[shape.triangles[i]],b=points[shape.triangles[i+1]],c=points[shape.triangles[i+2]],e1=sub(b,a),e2=sub(c,a),h=cross(ray,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)continue;const inv=1/det,s=sub(o,a),u=dot(s,h)*inv;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(ray,q)*inv;if(v<0||u+v>1)continue;choose(dot(e2,q)*inv,descriptor);}};
 const body=SPOT.collisions.body_collision;hull(body,body.vertices,{affected:0,part:target.affected===0?target.part:'몸통'});
 for(let l=0;l<4;l++){const leg=LEGS[l],q=world.q.slice(l*3,l*3+3);for(const affected of [2,3]){const shape=SPOT.collisions[leg.parts[affected-1].collision];hull(shape,shape.vertices.map(p=>linkPoint(leg,q,affected,p)),{leg:l,affected,part:leg.label+(affected===2?' 상부 다리':' 하부 다리')});}const foot=rotate(legPoints(leg,q)[3],world.a).map((v,i)=>v+world.p[i]),offset=sub(origin,foot),b=dot(offset,d),disc=b*b-dot(offset,offset)+DOG.footRadius**2;if(disc>=0)choose(-b-Math.sqrt(disc),{leg:l,affected:3,part:leg.label+' 발'});}

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
