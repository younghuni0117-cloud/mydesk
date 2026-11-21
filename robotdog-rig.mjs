import {surface} from './robotdog-terrain.mjs?v=dog14';
export const RIG_VERSION=7;
export const TRAINING_EPOCH='level-body-20261121';
export const DOG={mass:33.8,chassisMass:24.0,armMass:0,partMasses:{body:24,hip:.9,upper:1.3,lower:.2,foot:.05},body:[.88,.22,.22],upper:.35255,lower:.36,hipOffset:.110945,footRadius:.034,gravity:9.81,dt:1/120,controlSteps:4};
export const LEGS=[{id:'FL',label:'앞 왼쪽',x:.34,y:.015,z:.055,side:1},{id:'FR',label:'앞 오른쪽',x:.34,y:.015,z:-.055,side:-1},{id:'RL',label:'뒤 왼쪽',x:-.34,y:.015,z:.055,side:1},{id:'RR',label:'뒤 오른쪽',x:-.34,y:.015,z:-.055,side:-1}];
export const LIMITS=[[-.65,.65],[-1.4,1.25],[.245,2.79]],REST=[0,-.68,1.36],TORQUES=[45,45,115];
export const jointLimits=(leg,k)=>k===0?(leg.side===1?[-.65,.22]:[-.22,.65]):LIMITS[k];
export const GOALS={stand:'균형 유지',move:'앞으로 걷기',backward:'뒤로 걷기',turn:'방향 전환',recover:'일어나기',push:'외력 견디기'},GOAL_IDS=Object.keys(GOALS);
export const goalKind=g=>Object.hasOwn(GOALS,g)?g:'stand';
export const OBS=68,HIDDEN=24,WEIGHTS=(OBS+1)*HIDDEN+(HIDDEN+1)*12;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function rotate(v,a){const [x,y,z]=v,cx=Math.cos(a[0]),sx=Math.sin(a[0]),cy=Math.cos(a[1]),sy=Math.sin(a[1]),cz=Math.cos(a[2]),sz=Math.sin(a[2]),y1=y*cx-z*sx,z1=y*sx+z*cx,x2=x*cy+z1*sy,z2=-x*sy+z1*cy;return [x2*cz-y1*sz,x2*sz+y1*cz,z2];}
export const inverseRotate=(v,a)=>{const cz=Math.cos(a[2]),sz=Math.sin(a[2]),cy=Math.cos(a[1]),sy=Math.sin(a[1]),cx=Math.cos(a[0]),sx=Math.sin(a[0]),x=v[0]*cz+v[1]*sz,y=-v[0]*sz+v[1]*cz,z=v[2],x1=x*cy-z*sy,z1=x*sy+z*cy;return [x1,y*cx+z1*sx,-y*sx+z1*cx];};
export function legPoints(leg,q){const[a,h,k]=q,hip=[leg.x,leg.y,leg.z],turn=p=>[p[0],p[1]*Math.cos(a)-p[2]*Math.sin(a),p[1]*Math.sin(a)+p[2]*Math.cos(a)],mount=[0,0,leg.side*DOG.hipOffset],knee=[DOG.upper*Math.sin(h),-DOG.upper*Math.cos(h),mount[2]],foot=[knee[0]+DOG.lower*Math.sin(h+k),knee[1]-DOG.lower*Math.cos(h+k),mount[2]];return [hip,...[mount,knee,foot].map(p=>turn(p).map((v,i)=>v+hip[i]))];}
export function footJacobian(q,leg=LEGS[0]){const[a,h,k]=q,co=Math.cos(a),si=Math.sin(a),x=DOG.upper*Math.sin(h)+DOG.lower*Math.sin(h+k),y=-DOG.upper*Math.cos(h)-DOG.lower*Math.cos(h+k),z=leg.side*DOG.hipOffset;return [[0,-y*si-z*co,y*co-z*si],[-y,x*co,x*si],[DOG.lower*Math.cos(h+k),DOG.lower*Math.sin(h+k)*co,DOG.lower*Math.sin(h+k)*si]];}
export function policy(weights,obs){const hidden=Array(HIDDEN);let p=0;for(let h=0;h<HIDDEN;h++){let s=weights[p++];for(let i=0;i<OBS;i++)s+=weights[p++]*obs[i];hidden[h]=Math.tanh(s);}return Array.from({length:12},()=>{let s=weights[p++];for(let h=0;h<HIDDEN;h++)s+=weights[p++]*hidden[h];return Math.tanh(s);});}
export function initialWeights(seed=81){const r=rng(seed);return Array.from({length:WEIGHTS},(_,i)=>(r()-.5)*(i<(OBS+1)*HIDDEN?.2:.02));}
export function collisionSamples(p,a,q){const out=[];for(let l=0;l<4;l++){const pts=legPoints(LEGS[l],q.slice(l*3,l*3+3));for(let segment=1;segment<3;segment++)for(const t of [0,.25,.5,.75,1]){const local=pts[segment].map((x,j)=>x+(pts[segment+1][j]-x)*t);if(segment===2){const a=q[l*3],angle=q[l*3+1]+q[l*3+2],bow=.04*Math.sin(Math.PI*t);local[0]+=bow*Math.cos(angle);local[1]+=bow*Math.sin(angle)*Math.cos(a);local[2]+=bow*Math.sin(angle)*Math.sin(a);}out.push({local,p:rotate(local,a).map((x,j)=>x+p[j]),radius:segment===1?.045:(t<.2?.026:.021),leg:l,part:(segment===1&&t===1)||(segment===2&&t===0)?'knee':segment===1?'upper':'lower',affected:segment===1?2:3,key:`l${l}s${segment}t${t}`});}out.push({local:pts[3],p:rotate(pts[3],a).map((x,j)=>x+p[j]),radius:DOG.footRadius,leg:l,affected:3,foot:l,key:`f${l}`});}
 for(const x of [-.48,0,.505])for(const y of [-.12,.14])for(const z of [-.125,.125]){const local=[x,y,z];out.push({local,p:rotate(local,a).map((v,j)=>v+p[j]),radius:.008,affected:0,key:`b${x},${y},${z}`});}return out;}
export function clearanceCorrection(frame){let lift=0;for(const s of collisionSamples(frame.p,frame.a,frame.q)){const g=surface(frame.terrain,s.p[0],s.p[2]);lift=Math.max(lift,g.height+s.radius+.004-s.p[1]);}return lift;}
