// Task assessment only. This module never supplies actions, forces or pose corrections.
import {clamp} from './robotdog-rig.mjs?v=dog21';
export const RECOVERY_PROTOCOL='roll-to-stand-v1';
export const RECOVERY_HOLD=1.2;
export const RECOVERY_LABELS=['웅크린 자세','옆으로 누운 자세','거의 뒤집힌 자세','완전히 뒤집힌 자세'];
export function recoveryPose(level,random,{exact=false,jitter=false}={}){
 const stage=clamp(Math.floor(level??1),0,3),side=random()<.5?-1:1;
 const angle=stage===0?.05+random()*.25:stage===1?1.05+random()*.65:stage===2?2.2+random()*.55:exact?Math.PI:Math.PI-random()*.08;
 return{level:stage,roll:side*angle,pitch:exact?0:(random()-.5)*(stage===0?.1:.16),yaw:jitter?(random()-.5)*.6:0,jointNoise:jitter?(stage===0?.08:.16):0,crouch:stage===0};
}
export function recoveryAssessment({up,height,footCount,footFraction,otherForce=0,kneeForce=0,angularSpeed=0,speed=0}){
 const orientation=clamp((up+1)/2,0,1),upright=clamp(up,0,1),rise=clamp((height-.13)/.36,0,1),feet=clamp(footFraction,0,1)*Math.min(1,footCount/3),ready=up>.9&&rise>.75&&footCount>=3&&footFraction>.85&&otherForce<33.8*9.81*.15&&kneeForce<10&&angularSpeed<1.2&&speed<.35;
 return{up,orientation,upright,rise,feet,ready,potential:.30*orientation+.45*rise*upright*feet+.25*upright*feet};
}
export class RecoveryProgress{
 constructor(state){this.best=state.potential;this.side=false;this.feet=false;this.stood=false;this.startedInverted=state.up<-.4;this.recoveredAt=null;}
 step(state,{dt,time,hold,grounded}){
  // New ground-contact progress is rewarded once. A retreat cannot reset this frontier.
  const delta=grounded?Math.max(0,state.potential-this.best):0;if(grounded)this.best=Math.max(this.best,state.potential);
  let milestone=0;if(!this.side&&this.startedInverted&&grounded&&state.up>=-.15){this.side=true;milestone+=.75;}
  if(!this.feet&&grounded&&state.upright>.35&&state.feet>.4){this.feet=true;milestone+=1;}
  if(!this.stood&&state.ready&&hold>=RECOVERY_HOLD){this.stood=true;this.recoveredAt=time;milestone+=4;}
  return{progress:20*delta,milestone,posture:dt*3*state.rise*state.upright*state.feet,hold:state.ready?dt*4:0,regression:-dt*.8*Math.max(0,this.best-state.potential),time:state.ready?0:-dt*.25};
 }
}
