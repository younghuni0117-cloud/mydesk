import {surface} from './robotdog-terrain.mjs?v=dog31';
import {SPOT} from './assets/spot/definition.mjs?v=dog31';
export {SPOT};
export const RIG_VERSION=9;
export const TRAINING_EPOCH='menagerie-spot-20261122';
const node=name=>SPOT.nodes.find(n=>n.name===name),body=node('body'),bounds=SPOT.collisions.body_collision.bounds;
export const DOG={mass:SPOT.nodes.reduce((s,n)=>s+n.inertial.mass,0),chassisMass:body.inertial.mass,armMass:0,partMasses:{body:body.inertial.mass,hip:node('fl_hip').inertial.mass,upper:node('fl_uleg').inertial.mass,lower:node('fl_lleg').inertial.mass,foot:0},body:bounds[1].map((v,i)=>v-bounds[0][i]),upper:Math.hypot(...node('fl_lleg').pos),upperOffset:node('fl_lleg').pos,lower:Math.hypot(...SPOT.footOffset),hipOffset:Math.hypot(...node('fl_uleg').pos),footRadius:SPOT.footRadius,gravity:9.81,dt:1/120,controlSteps:4,motorKp:SPOT.actuator.kp,motorKd:SPOT.actuator.kd};
export const LEGS=[['FL','앞 왼쪽','fl'],['FR','앞 오른쪽','fr'],['RL','뒤 왼쪽','hl'],['RR','뒤 오른쪽','hr']].map(([id,label,prefix])=>{const parts=['hip','uleg','lleg'].map(p=>node(prefix+'_'+p)),[x,y,z]=parts[0].pos;return{id,label,prefix,x,y,z,side:Math.sign(z),parts,ranges:parts.map(n=>n.joint.range)};});
export const LIMITS=LEGS[0].ranges,REST=SPOT.home,TORQUES=Array(3).fill(SPOT.actuator.limit);
export const jointLimits=(leg,k)=>leg.ranges[k];
export const GOALS={stand:'균형 유지',move:'앞으로 걷기',backward:'뒤로 걷기',turn:'방향 전환',recover:'일어나기',push:'외력 견디기'},GOAL_IDS=Object.keys(GOALS);
export const goalKind=g=>Object.hasOwn(GOALS,g)?g:'stand';
export const OBS=68,HIDDEN=24,WEIGHTS=(OBS+1)*HIDDEN+(HIDDEN+1)*12;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function rotate(v,a){const [x,y,z]=v,cx=Math.cos(a[0]),sx=Math.sin(a[0]),cy=Math.cos(a[1]),sy=Math.sin(a[1]),cz=Math.cos(a[2]),sz=Math.sin(a[2]),y1=y*cx-z*sx,z1=y*sx+z*cx,x2=x*cy+z1*sy,z2=-x*sy+z1*cy;return [x2*cz-y1*sz,x2*sz+y1*cz,z2];}
export const inverseRotate=(v,a)=>{const cz=Math.cos(a[2]),sz=Math.sin(a[2]),cy=Math.cos(a[1]),sy=Math.sin(a[1]),cx=Math.cos(a[0]),sx=Math.sin(a[0]),x=v[0]*cz+v[1]*sz,y=-v[0]*sz+v[1]*cz,z=v[2],x1=x*cy-z*sy,z1=x*sy+z*cy;return [x1,y*cx+z1*sx,-y*sx+z1*cx];};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
// Joint coordinates remain the original MJCF angles: Rx followed by two local -Z axes.
export function jointRotate(q,affected,v){const angle=affected===1?0:-(q[1]+(affected===3?q[2]:0));return rotate(rotate(v,[0,0,angle]),[q[0],0,0]);}
export function legPoints(leg,q){const hip=[leg.x,leg.y,leg.z],mount=add(hip,jointRotate(q,1,leg.parts[1].pos)),knee=add(mount,jointRotate(q,2,leg.parts[2].pos)),foot=add(knee,jointRotate(q,3,SPOT.footOffset));return[hip,mount,knee,foot];}
export function jointAxes(q){return[[1,0,0],[0,Math.sin(q[0]),-Math.cos(q[0])],[0,Math.sin(q[0]),-Math.cos(q[0])]];}
export function linkPoint(leg,q,affected,point){return add(legPoints(leg,q)[affected-1],jointRotate(q,affected,point));}
export function footJacobian(q,leg=LEGS[0]){const p=legPoints(leg,q),axes=jointAxes(q);return axes.map((axis,k)=>cross(axis,p[3].map((v,i)=>v-p[k][i])));}
export function actionTarget(action,leg,j){const [low,high]=jointLimits(leg,j),a=clamp(action,-1,1);return a===1?high:a===-1?low:REST[j]+a*(a>=0?high-REST[j]:REST[j]-low);}
export function policy(weights,obs){const hidden=Array(HIDDEN);let p=0;for(let h=0;h<HIDDEN;h++){let s=weights[p++];for(let i=0;i<OBS;i++)s+=weights[p++]*obs[i];hidden[h]=Math.tanh(s);}return Array.from({length:12},()=>{let s=weights[p++];for(let h=0;h<HIDDEN;h++)s+=weights[p++]*hidden[h];return Math.tanh(s);});}
export function initialWeights(seed=81){const r=rng(seed);return Array.from({length:WEIGHTS},(_,i)=>(r()-.5)*(i<(OBS+1)*HIDDEN?.2:.02));}
export function collisionSamples(p,a,q){const out=[],emit=(local,extra)=>out.push({local,p:rotate(local,a).map((v,i)=>v+p[i]),radius:.001,...extra});
 for(const [i,point] of SPOT.collisions.body_collision.support.entries())emit(point,{affected:0,part:'body',key:'b'+i});
 for(let l=0;l<4;l++){const leg=LEGS[l],angles=q.slice(l*3,l*3+3);for(let affected=2;affected<=3;affected++){const hull=SPOT.collisions[leg.parts[affected-1].collision];for(const [i,point]of hull.support.entries())emit(linkPoint(leg,angles,affected,point),{leg:l,affected,part:affected===2&&point[1]<-.25||affected===3&&point[1]>-.05?'knee':affected===2?'upper':'lower',key:`l${l}s${affected}p${i}`});}emit(legPoints(leg,angles)[3],{radius:DOG.footRadius,leg:l,affected:3,foot:l,part:'foot',key:'f'+l});}
 return out;}
export function clearanceCorrection(frame){let lift=0;for(const s of collisionSamples(frame.p,frame.a,frame.q)){const g=surface(frame.terrain,s.p[0],s.p[2]);lift=Math.max(lift,g.height+s.radius+.004-s.p[1]);}return lift;}
