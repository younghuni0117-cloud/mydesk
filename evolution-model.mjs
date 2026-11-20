import {Pendulum as OneLink,parameters as oneParameters,validatePhysics as validateOne,angleError} from './evolution-core.mjs?v=render6';
import {TwoLink,twoParameters,validateTwoPhysics} from './evolution-two-core.mjs?v=render6';
import {PPO,policyAction as oneAction} from './evolution-ppo.mjs?v=render6';
import {VectorPPO,vectorPolicyAction} from './evolution-vector-ppo.mjs?v=render6';
import {missionOf} from './evolution-missions.mjs?v=render6';
export const isTwo=c=>c?.structure==='two-link';
export function parameters(c={}){if(c.structure&&!['one-link','two-link'].includes(c.structure))throw Error('아직 지원하지 않는 로봇 구조입니다.');if(isTwo(c)&&c.mission&&c.mission!=='balance')throw Error('2-Link는 현재 균형 잡기만 지원합니다.');return isTwo(c)?twoParameters(c):oneParameters(c);}
export function Pendulum(c={}){return isTwo(c)?new TwoLink(c):new OneLink(c);}
export const createPPO=(c={},seed=3197)=>isTwo(c)?new VectorPPO(seed):new PPO(seed);
export const policyAction=(p,o)=>p.kind==='vector-ppo-v1'?vectorPolicyAction(p,o):oneAction(p,o);
export const validatePhysics=c=>isTwo(c)?validateTwoPhysics():validateOne();
export const torqueCommand=(world,action)=>Array.isArray(action)?action.map(v=>v*world.config.maxTorque):action*world.config.maxTorque;
export const poseMagnitude=w=>isTwo(w.config)?Math.max(...w.angles.map(q=>Math.abs(angleError(q)))):Math.abs(angleError(w.theta));
export const missionFor=c=>isTwo(c)?{...missionOf('balance'),stages:[{min:0,max:3,omega:.05},{min:0,max:5,omega:.075}]}:missionOf(c.mission);
export function interpolateFrame(a,b,t,p){if(!b.links)return null;const angles=b.links.map((v,i)=>(a.links?.[i]?.theta??v.theta)+(v.theta-(a.links?.[i]?.theta??v.theta))*t),links=[];let base={...b.base};for(let i=0;i<2;i++){const tip={x:base.x+Math.sin(angles[i])*p.length,y:base.y+Math.cos(angles[i])*p.length};links.push({...b.links[i],theta:angles[i],base:{...base},tip,com:{x:(base.x+tip.x)/2,y:(base.y+tip.y)/2}});base=tip;}return {...b,theta:angles[0],theta2:angles[1],links,tip:links[1].tip,com:{x:(links[0].com.x+links[1].com.x)/2,y:(links[0].com.y+links[1].com.y)/2}};}
