import {Biped,bipedParameters,validateBipedPhysics} from './evolution-biped-core.mjs?v=biped7';
import {BIPED_MISSION} from './evolution-biped-core.mjs?v=biped7';
import {Pendulum as OneLink,parameters as oneParameters,validatePhysics as validateOne,angleError} from './evolution-core.mjs?v=biped7';
import {TwoLink,twoParameters,validateTwoPhysics} from './evolution-two-core.mjs?v=biped7';
import {PPO,policyAction as oneAction} from './evolution-ppo.mjs?v=biped7';
import {VectorPPO,vectorPolicyAction} from './evolution-vector-ppo.mjs?v=biped7';
import {missionOf} from './evolution-missions.mjs?v=biped7';
export const isBiped=c=>c?.structure==='biped';
export const isTwo=c=>c?.structure==='two-link';
export function parameters(c={}){if(c.structure&&!['one-link','two-link','biped'].includes(c.structure))throw Error('아직 지원하지 않는 로봇 구조입니다.');if(isTwo(c)&&c.mission&&c.mission!=='balance')throw Error('2-Link는 현재 균형 잡기만 지원합니다.');return isBiped(c)?bipedParameters(c):isTwo(c)?twoParameters(c):oneParameters(c);}
export function Pendulum(c={}){return isBiped(c)?new Biped(c):isTwo(c)?new TwoLink(c):new OneLink(c);}
export const createPPO=(c={},seed=3197)=>isBiped(c)?new VectorPPO(seed,{inputs:28,outputs:6,size:32}):isTwo(c)?new VectorPPO(seed):new PPO(seed);
export const policyAction=(p,o)=>p.kind==='vector-ppo-v1'?vectorPolicyAction(p,o):oneAction(p,o);
export const validatePhysics=c=>isBiped(c)?validateBipedPhysics():isTwo(c)?validateTwoPhysics():validateOne();
export const torqueCommand=(world,action)=>Array.isArray(action)?action.map((v,i)=>v*(isBiped(world.config)?world.motorLimits()[i]:world.config.maxTorque)):action*world.config.maxTorque;
export const poseMagnitude=w=>isTwo(w.config)?Math.max(...w.angles.map(q=>Math.abs(angleError(q)))):Math.abs(angleError(w.theta));
export const missionFor=c=>isBiped(c)?BIPED_MISSION:isTwo(c)?{...missionOf('balance'),stages:[{min:0,max:3,omega:.05},{min:0,max:5,omega:.075}]}:missionOf(c.mission);
export function interpolateFrame(a,b,t,p){if(b.structure==='biped'){const mix=(x,y)=>x+(y-x)*t,bodies=b.bodies.map((v,i)=>({...v,x:mix(a.bodies?.[i]?.x??v.x,v.x),y:mix(a.bodies?.[i]?.y??v.y,v.y),angle:mix(a.bodies?.[i]?.angle??v.angle,v.angle)}));return {...b,bodies,jointPoints:b.jointPoints.map((q,i)=>({x:mix(a.jointPoints?.[i]?.x??q.x,q.x),y:mix(a.jointPoints?.[i]?.y??q.y,q.y)})),com:{x:mix(a.com.x,b.com.x),y:mix(a.com.y,b.com.y)}};}if(!b.links)return null;const angles=b.links.map((v,i)=>(a.links?.[i]?.theta??v.theta)+(v.theta-(a.links?.[i]?.theta??v.theta))*t),links=[];let base={...b.base};for(let i=0;i<2;i++){const tip={x:base.x+Math.sin(angles[i])*p.length,y:base.y+Math.cos(angles[i])*p.length};links.push({...b.links[i],theta:angles[i],base:{...base},tip,com:{x:(base.x+tip.x)/2,y:(base.y+tip.y)/2}});base=tip;}return {...b,theta:angles[0],theta2:angles[1],links,tip:links[1].tip,com:{x:(links[0].com.x+links[1].com.x)/2,y:(links[0].com.y+links[1].com.y)/2}};}

export const hasFailed=w=>isBiped(w.config)?w.fallen():poseMagnitude(w)>.35;
export const zeroCommand=c=>isBiped(c)?Array(6).fill(0):isTwo(c)?[0,0]:0;
