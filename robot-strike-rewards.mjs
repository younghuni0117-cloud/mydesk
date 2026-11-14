import {impactDamage} from './robot-combat.mjs?v=update87';
// Physical outcomes only: never prescribe a punch, kick or recovery motion.
export const BAG_REWARDS=Object.freeze({base:8,impactBonus:22,fall:100,downPerSecond:4,recovery:3,combination:2,separationSeconds:.08,recoverySeconds:.3,recoveryWindow:1.5,combinationWindow:3});
export function bagStrikeReward({impulse,closing}){
 if(!Number.isFinite(impulse)||!Number.isFinite(closing)||impulse<=.15||closing<1.2)return 0;
 const speed=.35+.65*Math.max(0,Math.min(1,(closing-1.2)/5));
 return BAG_REWARDS.base+2*impactDamage({impulse,closing,target:'torso'})+BAG_REWARDS.impactBonus*(1-Math.exp(-Math.max(0,impulse-.15)/10))*speed;
}
export class BagStrikeContacts{
 constructor(){this.limbs=new WeakMap();}
 begin(limb,time){let s=this.limbs.get(limb);if(!s){s={count:0,credited:false,separatedAt:-Infinity};this.limbs.set(limb,s);}if(s.count===0&&time-s.separatedAt>=BAG_REWARDS.separationSeconds-1e-9)s.credited=false;s.count++;}
 end(limb,time){const s=this.limbs.get(limb);if(s&&s.count>0&&--s.count===0)s.separatedAt=time;}
 claim(limb){const s=this.limbs.get(limb);if(!s||s.count<=0||s.credited)return false;s.credited=true;return true;}
}
export class BagStrikeRecovery{
 constructor(){this.hit=null;}
 strike(time){const combo=this.hit?.recovered&&time-this.hit.time<=BAG_REWARDS.combinationWindow?BAG_REWARDS.combination:0;this.hit={time,stable:0,recovered:false};return combo;}
 step(time,dt,standing){const hit=this.hit;if(!hit||hit.recovered||time-hit.time>BAG_REWARDS.recoveryWindow)return 0;hit.stable=standing?hit.stable+dt:0;if(hit.stable+1e-9<BAG_REWARDS.recoverySeconds)return 0;hit.recovered=true;return BAG_REWARDS.recovery;}
}
