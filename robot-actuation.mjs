// Learned joint targets, not a gait or a balance controller. Gains are physical
// actuator settings; both CEM and PPO use this same inner torque loop.
export const CONTROL_KIND='joint-target-pd-12joint-mlp-v7';
export const JOINT_SERVOS=Object.freeze({
 waist:Object.freeze({kp:200,kd:15}),neck:Object.freeze({kp:12,kd:1}),
 leftHip:Object.freeze({kp:180,kd:12}),rightHip:Object.freeze({kp:180,kd:12}),
 leftKnee:Object.freeze({kp:150,kd:10}),rightKnee:Object.freeze({kp:150,kd:10}),
 leftAnkle:Object.freeze({kp:100,kd:7}),rightAnkle:Object.freeze({kp:100,kd:7}),
 leftShoulder:Object.freeze({kp:45,kd:3}),rightShoulder:Object.freeze({kp:45,kd:3}),
 leftElbow:Object.freeze({kp:35,kd:2.5}),rightElbow:Object.freeze({kp:35,kd:2.5}),
});
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function jointTargetAngle(action,lower,upper){
 const a=clamp(Number.isFinite(action)?action:0,-1,1);
 // Zero means zero relative joint angle. Asymmetric knees/elbows keep their
 // anatomical range, with no fixed crouch or prescribed walking posture.
 return clamp(a*(a<0?-lower:upper),lower,upper);
}
export function jointServoTorque(motor,action,angle,speed){
 const target=jointTargetAngle(action,motor.lower,motor.upper);
 let torque=clamp(motor.kp*(target-angle)-motor.kd*speed,-motor.torque,motor.torque);
 // The existing motor speed envelope limits driving, while braking remains
 // available at high speed. The physics solver enforces joint angle limits.
 torque*=clamp(1-Math.sign(torque)*speed/9,0,1);
 return torque;
}
