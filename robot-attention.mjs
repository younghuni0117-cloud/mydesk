// Soft costs measured from actual motion. They never constrain angles or choose actions.
export const DISTAL_JOINTS=Object.freeze({neck:2.5});
export function distalActivity(motors,actions,previousActions,detailed=false){
 let motion=0,change=0,count=0;const parts=detailed?[]:null;
 for(let i=0;i<motors.length;i++){const m=motors[i],limit=DISTAL_JOINTS[m.name];if(!limit)continue;if(m.locked){count++;continue;}const excess=Math.min(3,Math.max(0,Math.abs(m.joint.getJointSpeed())-limit)/limit);const delta=((actions[i]||0)-(previousActions[i]||0))**2;motion+=excess*excess;change+=delta;if(parts)parts.push({body:m.bodyB.getUserData(),motion:excess*excess,change:delta});count++;}
 return {motion:motion/Math.max(1,count),change:change/Math.max(1,count),...(parts?{parts}:{})};
}
