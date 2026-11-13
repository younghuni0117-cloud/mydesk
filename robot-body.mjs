// Simplified adult proportions for the 1.85 m side-view rig, not a clinical
// anthropometric model. Centres and gyration radii are independent of skin width.
export const STANDARD_GRAVITY=9.80665;
export const ROBOT_BODY_VERSION=8;
export const ROBOT_MASS=70;
const segment=(mass,cx,cy,radius)=>Object.freeze({mass,center:Object.freeze({x:cx,y:cy}),radius});
const thigh=segment(7,0,.03015,.14535),shin=segment(3.15,0,.03015,.1359),foot=segment(1.05,.035,-.005,.11875),upper=segment(2.1,0,.0192,.0966),forearm=segment(1.4,0,-.04,.124);
export const HUMAN_SEGMENTS=Object.freeze({pelvis:segment(10.5,0,0,.09),torso:segment(24.5,0,0,.135),head:segment(5.6,0,0,.09),leftThigh:thigh,rightThigh:thigh,leftShin:shin,rightShin:shin,leftFoot:foot,rightFoot:foot,leftUpperArm:upper,rightUpperArm:upper,leftForearm:forearm,rightForearm:forearm});
export const MOTOR_TORQUES=Object.freeze({waist:330,neck:35,leftHip:280,rightHip:280,leftKnee:260,rightKnee:260,leftAnkle:150,rightAnkle:150,leftShoulder:90,rightShoulder:90,leftElbow:70,rightElbow:70});
export function segmentMassData(name,scale=1,facing=1){const s=HUMAN_SEGMENTS[name],mass=s.mass*scale;return {mass,center:{x:s.center.x*facing,y:s.center.y},I:mass*(s.radius*s.radius+s.center.x*s.center.x+s.center.y*s.center.y)};}
