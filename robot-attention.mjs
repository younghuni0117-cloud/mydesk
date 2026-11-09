// Soft costs measured from actual motion. They never constrain angles or choose actions.
export const DISTAL_JOINTS=Object.freeze({neck:2.5,leftWrist:4,rightWrist:4,leftToe:4,rightToe:4});
export function distalActivity(motors,actions,previousActions){
 let motion=0,change=0,count=0;
 for(let i=0;i<motors.length;i++){const m=motors[i],limit=DISTAL_JOINTS[m.name];if(!limit)continue;const excess=Math.min(3,Math.max(0,Math.abs(m.joint.getJointSpeed())-limit)/limit);motion+=excess*excess;change+=((actions[i]||0)-(previousActions[i]||0))**2;count++;}
 return {motion:motion/Math.max(1,count),change:change/Math.max(1,count)};
}
