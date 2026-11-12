import {SWING} from './swing-engine.mjs?v=swing3';
// A constrained standing rig: soles stay on the plank; hands stay on the ropes.
// These contact constraints do not choose the learned torso or knee actions.
export const RIG=Object.freeze({thigh:.44,shin:.43,upperArm:.34,forearm:.32,ankleHeight:.20,footSpacing:.16,gripHeight:1.35,ropeSpacing:.46});
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),length=a=>Math.hypot(...a);
export function elbowBetween(shoulder,hand,side){const delta=sub(hand,shoulder),distance=length(delta),u=mul(delta,1/Math.max(distance,1e-8)),pole=[-.65,-1,side*.12],v=sub(pole,mul(u,dot(pole,u))),unit=mul(v,1/Math.max(length(v),1e-8)),along=(RIG.upperArm**2-RIG.forearm**2+distance**2)/(2*Math.max(distance,1e-8)),height=Math.sqrt(Math.max(0,RIG.upperArm**2-along**2));return add(add(shoulder,mul(u,along)),mul(unit,height));}
export function standingPose(state){const legs={};for(const [side,sign]of [['left',1],['right',-1]]){const flex=Math.max(.06,Math.min(1.45,state[side+'Knee'])),ankle=[.025,RIG.ankleHeight,sign*RIG.footSpacing],lean=flex*.5,knee=add(ankle,[RIG.shin*Math.sin(lean),RIG.shin*Math.cos(lean),0]),hip=add(knee,[RIG.thigh*Math.sin(lean-flex),RIG.thigh*Math.cos(lean-flex),0]);legs[side]={ankle,knee,hip,sole:[.055,.09,sign*RIG.footSpacing]};}
 const pelvis=mul(add(legs.left.hip,legs.right.hip),.5),axis=[Math.sin(Math.max(-.5,Math.min(.5,state.hip))),Math.cos(Math.max(-.5,Math.min(.5,state.hip))),0],chest=add(pelvis,mul(axis,.49)),neck=add(chest,mul(axis,.09)),head=add(neck,mul(axis,.14));
 const arms={};for(const [side,sign]of [['left',1],['right',-1]]){const shoulder=add(chest,[0,-.025,sign*.205]),hand=[cablePoint(RIG.gripHeight,state)[0],RIG.gripHeight,sign*RIG.ropeSpacing];arms[side]={shoulder,hand,elbow:elbowBetween(shoulder,hand,sign)};}
 return {legs,arms,pelvis,chest,neck,head,axis};
}

// Tensioned cable: fixed ends and a modest, motion-dependent flexible bow.
// This is a visual cable approximation; pendulum forces still use the taut length.
export function cablePoint(height,state={}){const t=Math.max(0,Math.min(1,height/SWING.ropeLength)),bow=.13*Math.sin(state.theta||0)+.10*Math.tanh(state.omega||0),ripple=.035*Math.sin((state.time||0)*5.2+t*5)*Math.min(1,Math.abs(state.omega||0));return [Math.sin(Math.PI*t)*(bow+ripple),height,0];}
