// Learned joint targets, not a gait or a balance controller. Gains are physical
// actuator settings; both CEM and PPO use this same inner torque loop.
export const CONTROL_KIND='joint-target-velocity-residual-pd-12joint-combat-v10';
export const JOINT_SERVOS=Object.freeze({
 waist:Object.freeze({kp:700,kd:52.5}),neck:Object.freeze({kp:55,kd:5}),
 leftHip:Object.freeze({kp:630,kd:42}),rightHip:Object.freeze({kp:630,kd:42}),
 leftKnee:Object.freeze({kp:525,kd:35}),rightKnee:Object.freeze({kp:525,kd:35}),
 leftAnkle:Object.freeze({kp:350,kd:24.5}),rightAnkle:Object.freeze({kp:350,kd:24.5}),
 leftShoulder:Object.freeze({kp:160,kd:11}),rightShoulder:Object.freeze({kp:160,kd:11}),
 leftElbow:Object.freeze({kp:125,kd:9}),rightElbow:Object.freeze({kp:125,kd:9}),
});
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const SERVO_PROFILES=Object.freeze({soft:{kp:.65,kd:.8},standard:{kp:1,kd:1},firm:{kp:1.35,kd:1.2}});
export const JOINT_RANGES=Object.freeze({waist:[-1.4,.9],neck:[-1.05,1.05],leftHip:[-.65,2.1],rightHip:[-.65,2.1],leftKnee:[-2.6,0],rightKnee:[-2.6,0],leftAnkle:[-1.1,1.1],rightAnkle:[-1.1,1.1],leftShoulder:[-1.05,3.05],rightShoulder:[-1.05,3.05],leftElbow:[0,2.6],rightElbow:[0,2.6]});
export function normalizeActuation(raw={}){const speed=Number(raw?.targetSpeed);return {servoProfile:Object.hasOwn(SERVO_PROFILES,raw?.servoProfile)?raw.servoProfile:'standard',targetSpeed:Number.isInteger(speed)&&speed>=30&&speed<=5000?speed:180,targetVelocity:Number.isFinite(Number(raw?.targetVelocity))?clamp(Number(raw.targetVelocity),30,5000):360,residualTorque:Number.isFinite(Number(raw?.residualTorque))?clamp(Number(raw.residualTorque),0,1):.2,actuationVersion:3};}
export function jointTargetAngle(action,lower,upper){
 const a=clamp(Number.isFinite(action)?action:0,-1,1);
 // Both exploration signs are useful for one-way knees/elbows, while zero
 // still means a straight joint. No initial crouch or gait is prescribed.
 return lower===0?Math.abs(a)*upper:upper===0?Math.abs(a)*lower:a*(a<0?-lower:upper);
}
export function advanceJointTarget(current,desired,speedDegrees,dt){const step=speedDegrees*Math.PI/180*dt;return current+clamp(desired-current,-step,step);}
export function jointTargetTorque(motor,target,angle,speed,targetVelocity=0,residual=0){
 let torque=clamp(motor.kp*(target-angle)+motor.kd*(targetVelocity-speed)+residual*motor.torque,-motor.torque,motor.torque);
 torque*=clamp(1-Math.sign(torque)*speed/(motor.speedLimit||9),0,1);
 return torque;
}
export function jointServoTorque(motor,action,angle,speed){return jointTargetTorque(motor,jointTargetAngle(action,motor.lower,motor.upper),angle,speed);}
export function jointExplorationScale(name){return 1/Math.max(...JOINT_RANGES[name].map(Math.abs));}
