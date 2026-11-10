import {JOINT_SERVOS,JOINT_RANGES,SERVO_PROFILES,normalizeActuation,jointTargetAngle,advanceJointTarget,jointTargetTorque,jointServoTorque} from './robot-actuation.mjs?v=robot51';
import {RewardFeedback,rewardLocations} from './robot-reward-feedback.mjs?v=robot51';
import {distalActivity} from './robot-attention.mjs?v=robot51';
import {sampleEnvironment} from './robot-sensors.mjs?v=robot51';
import {PUSH_PARTS} from './robot-impact.mjs?v=robot51';
import {normalizeEvaluationSettings,monitorCases} from './robot-evaluation.mjs?v=robot51';
import {motionQuality,walkingSupport,WALK_CRITERIA} from './robot-performance.mjs?v=robot51';
import {makeTerrain,terrainHeight,rockVertices} from './robot-terrain.mjs?v=robot51';
import { World, Vec2, Box, Circle, Polygon, RevoluteJoint } from './vendor/planck.mjs';
import {normalizeCommand,commandState,COMMAND_CASES} from './robot-goals.mjs?v=robot51';
export const DT = 1 / 60;
import {POLICY_SIZE,policyActions} from './robot-policy.mjs?v=robot51';
import {REWARDS,rewardBreakdown} from './robot-rewards.mjs?v=robot51';
export {POLICY_SIZE} from './robot-policy.mjs?v=robot51';
export const STAGES = {
  balance: { label: '균형 잡기', speed: 0, duration: 10 },
  recover: { label: '넘어졌다 일어서기', speed: 0, duration: 10 },
  walk: { label: '앞으로 걷기', speed: .55, duration: 10 },
  run: { label: '빠르게 달리기', speed: 1.4, duration: 10 },
  obstacles: { label: '장애물 통과', speed: .65, duration: 12 },
};
export const LOCKED_DISTAL_JOINTS=Object.freeze([]);
export const JOINTS = ['waist','neck','leftHip','leftKnee','leftAnkle','rightHip','rightKnee','rightAnkle','leftShoulder','leftElbow','rightShoulder','rightElbow'];
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const PUSH_INTERVALS=Object.freeze([0,.5,1,2,3,5,10,30]);
export function normalizePushSettings(raw={}){const low=Number(raw?.pushMin),high=Number(raw?.pushMax),valid=Number.isFinite(low)&&Number.isFinite(high)&&low>=.1&&high<=30&&low<=high;return {autoPush:raw?.autoPush!==false,pushMin:valid?low:1,pushMax:valid?high:6,pushInterval:PUSH_INTERVALS.includes(Number(raw?.pushInterval))?Number(raw.pushInterval):0};}
export const WAIST_RESISTANCE=Object.freeze({stiffness:55,damping:9,maxTorque:110});
export function seeded(seed) { return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; }
const wrap = a => Math.atan2(Math.sin(a),Math.cos(a));
export class RobotWorld {
  constructor(stage='balance', options={}) {
    this.actuation=normalizeActuation(options);this.distalLocked=false;this.stage = STAGES[stage] ? stage : 'balance'; this.task=STAGES[this.stage];this.controlStride=['walk','run'].includes(this.stage)?6:3;
    this.duration=Number.isInteger(options.observationSeconds)&&options.observationSeconds>=1&&options.observationSeconds<=3600?options.observationSeconds:this.task.duration;
    this.rewardFeedback=options.record||options.rewardEffects?new RewardFeedback():null;this.rewardContactPoints=[];
    this.seed=options.seed??1;this.random=seeded(this.seed);this.time=0;this.reward=0;this.energy=0;this.steps=0;
    this.endOnFall=options.endOnFall===true&&this.stage==='balance';this.balanceLostTime=0;this.qualityTime=0;this.longestUpright=0;this.falls=0;this.recoveries=0;this.uprightTime=0;this.stableTime=0;this.walkingTime=0;this.stableStandingTime=0;this.supportedDistance=0;this.finalUpright=false;this.isDown=false;this.downTime=0;this.impactCost=0;this.passed=new Set();this.contacts=new Map();
    this.world=new World(Vec2(0,-9.81));this.world.setAutoClearForces(false);this.bodies=[];this.parts={};this.joints={};this.motors=[];
    this.terrain=makeTerrain(options.terrain,options.terrainVariant);this.terrainSegments=this.terrain.segments;this.groundHeight=x=>terrainHeight(this.terrainSegments,x);
    const floor=this.world.createBody({userData:'ground'});floor.createFixture(Box(500,.15,Vec2(0,-.15)),{friction:options.friction??this.terrain.friction});
    for(const s of this.terrainSegments)if(s.y0>0||s.y1>0){const body=options.groupStatic===false?this.world.createBody({userData:'ground'}):floor;body.createFixture(Polygon([Vec2(s.x0,-.2),Vec2(s.x1,-.2),Vec2(s.x1,s.y1),Vec2(s.x0,s.y0)]),{friction:s.friction??this.terrain.friction});}
    let ceiling;for(const s of this.terrain.ceilings||[]){const body=options.groupStatic===false?this.world.createBody({userData:'obstacle'}):(ceiling??=this.world.createBody({userData:'obstacle'}));body.createFixture(Polygon([Vec2(s.x0,s.y0),Vec2(s.x1,s.y1),Vec2(s.x1,Math.max(s.y0,s.y1)+6),Vec2(s.x0,Math.max(s.y0,s.y1)+6)]),{friction:.85});}
    this.obstacles=[...this.terrain.obstacles];

    for(const o of this.obstacles){const body=this.world.createBody({position:Vec2(o.x,(o.bottom??this.groundHeight(o.x))+o.height/2),userData:'obstacle'});body.createFixture(['rock','stalactite'].includes(o.shape)?Polygon(rockVertices(o).map(p=>Vec2(...p))):o.shape==='pipe'?Circle(o.height/2):Box(o.width/2,o.height/2),{friction:.8,filterMaskBits:o.side==='left'?3:o.side==='right'?5:0xffff});}
    const lying=this.stage==='recover' && options.startStanding!==true;
    this.spawnAngle=lying?(this.random()<.5?Math.PI/2:-Math.PI/2):(Number.isFinite(options.spawnTilt)?clamp(options.spawnTilt,-.12,.12):(this.random()-.5)*(options.spawnRange??.025));
    this.spawnY=(lying?.34:1.03)+this.groundHeight(0);
    this.makeRobot();this.motors.sort((a,b)=>JOINTS.indexOf(a.name)-JOINTS.indexOf(b.name));this.initialX=this.parts.pelvis.getPosition().x;this.lastX=this.initialX;this.furthestX=this.initialX;this.forwardContact=null;this.lastHeight=this.parts.pelvis.getPosition().y;
    this.lastRelativeHeight=this.parts.pelvis.getPosition().y-this.groundHeight(this.parts.pelvis.getPosition().x);this.lastPosture=Math.max(0,Math.cos(this.parts.torso.getAngle()));this.command=null;this.commandAnchor=this.initialX;this.commandSchedule=(options.commandSchedule||[]).map(s=>({time:s.time,command:normalizeCommand(s.command)}));this.nextCommand=0;if(options.command)this.setCommand(options.command);
    this.actions=Array(JOINTS.length).fill(0);this.activeTorques=Array(JOINTS.length).fill(0);this.rewardTerms={};this.positiveRewardTotal=0;this.negativeRewardTotal=0;if(lying)this.isDown=true;
    this.pushes = options.pushes ? options.pushes.map(p=>({...p})) : [];
    const pushSettings=normalizePushSettings(options);
    if(options.disturbances!==false&&pushSettings.autoPush&&!options.pushes){
      const interval=pushSettings.pushInterval;let time=interval>0?.6+this.random()*.4:.9+this.random()*Math.max(.1,this.duration-2.4);
      do{this.pushes.push({time,strength:pushSettings.pushMin+this.random()*(pushSettings.pushMax-pushSettings.pushMin),direction:this.random()*360,location:PUSH_PARTS[Math.floor(this.random()*PUSH_PARTS.length)],duration:0});time+=interval;}while(interval>0&&time<this.duration-.1);
    }
    this.impactEvents=[];this.pushSequence=0;this.nextPushIndex=0;this.pushesApplied=0;this.pushRecoveryTime=0;this.lastPushAt=-Infinity;this.obstacleHeight=options.obstacleHeight??.14;
    const contact=(contact,amount)=>{
      const a=contact.getFixtureA().getBody().getUserData(),b=contact.getFixtureB().getBody().getUserData();
      const name=a==='ground'||a==='obstacle'?b:b==='ground'||b==='obstacle'?a:null;
      if(typeof name==='string')this.contacts.set(name,Math.max(0,(this.contacts.get(name)||0)+amount));
    };
    this.world.on('begin-contact',c=>contact(c,1));this.world.on('end-contact',c=>contact(c,-1));
    // Track actual upward-facing support contacts, including hands/body and obstacle tops.
    this.world.on('post-solve',contact=>{
      const a=contact.getFixtureA().getBody().getUserData(),b=contact.getFixtureB().getBody().getUserData(),staticA=a==='ground'||a==='obstacle',staticB=b==='ground'||b==='obstacle';
      if(staticA===staticB)return;const wm=contact.getWorldManifold();if(!wm?.pointCount||(staticA?wm.normal.y:-wm.normal.y)<.2)return;
      for(let i=0;i<wm.pointCount;i++){const p=wm.points[i];if(Number.isFinite(p.x)&&p.x>this.initialX&&p.x>(this.forwardContact?.x??this.initialX))this.forwardContact={x:p.x,y:p.y,distance:p.x-this.initialX,body:staticA?b:a,basis:'forward-contact-v1',terrain:this.terrain.kind,variant:this.terrain.variant};}
    });
    const impactTimes=new WeakMap();
    this.world.on('pre-solve',(contact,old)=>{
      const a=contact.getFixtureA().getBody(),b=contact.getFixtureB().getBody(),an=a.getUserData(),bn=b.getUserData();
      if(![an,bn].some(n=>n==='ground'||n==='obstacle')||![an,bn].some(n=>['head','torso','pelvis'].includes(n)))return;
      // A resting contact carries weight every solver step; it is not a collision.
      if(old.pointCount>0||this.time-(impactTimes.get(contact)??-Infinity)<.12)return;
      const wm=contact.getWorldManifold();if(!wm?.pointCount)return;let closing=0;
      for(let i=0;i<wm.pointCount;i++){const va=a.getLinearVelocityFromWorldPoint(wm.points[i]),vb=b.getLinearVelocityFromWorldPoint(wm.points[i]);closing=Math.max(closing,-((vb.x-va.x)*wm.normal.x+(vb.y-va.y)*wm.normal.y));}
      if(closing<=REWARDS.impactSpeed)return;const mass=a.getMass()||b.getMass();const energy=.5*mass*(closing*closing-REWARDS.impactSpeed**2);this.impactCost+=energy;if(this.rewardFeedback){const body=['head','torso','pelvis'].includes(an)?an:bn;this.rewardContactPoints.push({body,point:[wm.points[0].x,wm.points[0].y],weight:energy});}impactTimes.set(contact,this.time);
    });
  }
  transform(x,y){const dy=y-1.03,c=Math.cos(this.spawnAngle),s=Math.sin(this.spawnAngle);return Vec2(c*x-s*dy,this.spawnY+s*x+c*dy);}
  part(name,x,y,w,h,mass,color,circle=false){
    const body=this.world.createDynamicBody({position:this.transform(x,y),angle:this.spawnAngle,linearDamping:.05,angularDamping:.12,allowSleep:false,userData:name});
    const shape=circle?Circle(w):Box(w/2,h/2),area=circle?Math.PI*w*w:w*h;
    body.createFixture(shape,{density:mass/area,friction:name.includes('Foot')||name.includes('Toe')?1.2:.5,restitution:.015,filterGroupIndex:-1,filterCategoryBits:name.startsWith('left')?2:name.startsWith('right')?4:1});
    const item={name,body,w,h,circle,color};this.bodies.push(item);this.parts[name]=body;return body;
  }
  joint(name,a,b,x,y,lower,upper,torque){
    const locked=this.distalLocked&&LOCKED_DISTAL_JOINTS.includes(name);if(locked)lower=upper=0;
    const joint=this.world.createJoint(RevoluteJoint({enableLimit:true,lowerAngle:lower,upperAngle:upper,enableMotor:false,maxMotorTorque:torque,motorSpeed:0,collideConnected:false},a,b,this.transform(x,y)));
    this.joints[name]=joint;this.motors.push({name,joint,lower,upper,torque,kp:JOINT_SERVOS[name].kp*SERVO_PROFILES[this.actuation.servoProfile].kp,kd:JOINT_SERVOS[name].kd*SERVO_PROFILES[this.actuation.servoProfile].kd,target:0,locked,bodyA:a,bodyB:b});
  }
  makeRobot(){
    const pelvis=this.part('pelvis',0,1.06,.3,.18,4,'#536d8c');
    const torso=this.part('torso',0,1.375,.32,.45,6,'#6788ac');
    const head=this.part('head',0,1.75,.13,.13,1,'#bdcbdc',true);
    this.joint('waist',pelvis,torso,0,1.15,...JOINT_RANGES.waist,95);this.joint('neck',torso,head,0,1.62,...JOINT_RANGES.neck,8);
    for(const [side,color] of [['left','#8fa8c5'],['right','#d6a174']]){
      const thigh=this.part(side+'Thigh',0,.805,.11,.45,1.4,color);
      const shin=this.part(side+'Shin',0,.355,.085,.45,1,color);
      const foot=this.part(side+'Foot',.07,.08,.25,.1,.5,color);
      foot.createFixture(Box(.04,.035,Vec2(.165,-.015)),{density:.15/(.08*.07),friction:1.2,restitution:.015,filterGroupIndex:-1,filterCategoryBits:side==='left'?2:4});this.parts[side+'ToePart']=foot;
      this.joint(side+'Hip',pelvis,thigh,0,1.03,...JOINT_RANGES[side+'Hip'],80);
      // Facing +X: knees flex backward (negative), elbows forward (positive).
      this.joint(side+'Knee',thigh,shin,0,.58,...JOINT_RANGES[side+'Knee'],80);
      this.joint(side+'Ankle',shin,foot,0,.13,...JOINT_RANGES[side+'Ankle'],45);

      const sx=0; // Both shoulders project onto the same side-view axis, like the hips.
      const upper=this.part(side+'UpperArm',sx,1.39,.085,.3,.7,color);
      const lower=this.part(side+'Forearm',sx,1.105,.073,.27,.5,color);
      lower.createFixture(Box(.045,.065,Vec2(0,-.2)),{density:.2/(.09*.13),friction:.5,restitution:.015,filterGroupIndex:-1,filterCategoryBits:side==='left'?2:4});this.parts[side+'Hand']=lower;
      this.joint(side+'Shoulder',torso,upper,sx,1.54,...JOINT_RANGES[side+'Shoulder'],25);
      this.joint(side+'Elbow',upper,lower,sx,1.24,...JOINT_RANGES[side+'Elbow'],20);

    }
  }
  push(strength=4,direction=0,location='torso',duration=0){
    const body=location==='shoulder'?this.parts.torso:this.parts[location]||this.parts.torso,angle=direction*Math.PI/180;
    const vector=Vec2(Math.cos(angle)*strength,Math.sin(angle)*strength);
    const point=location==='shoulder'?body.getWorldPoint(Vec2(.12,.2)):location.endsWith('Hand')?body.getWorldPoint(Vec2(0,-.2)):location.endsWith('ToePart')?body.getWorldPoint(Vec2(.165,-.015)):body.getWorldCenter();
    this.impactEvents.push({id:++this.pushSequence,time:this.time,scheduledTime:this.time,strength,direction,requestedLocation:location,location:body.getUserData(),point:[point.x,point.y]});if(this.impactEvents.length>12)this.impactEvents.shift();
    if(duration>0)this.sustainedPush={body,vector,localPoint:body.getLocalPoint(point),remaining:duration};
    else body.applyLinearImpulse(vector,point,true);
  }
  setCommand(raw){this.command=raw?normalizeCommand(raw):null;this.commandAnchor=this.parts.pelvis.getPosition().x;this.commandChanged=true;this.lastGoalError=this.goalState().error;}
  goalState(){return commandState(this.command,this.parts.pelvis.getPosition().x,this.command?this.commandAnchor:this.initialX,this.task.speed,true);}
  resistWaist(){const j=this.joints.waist,t=clamp(-WAIST_RESISTANCE.stiffness*j.getJointAngle()-WAIST_RESISTANCE.damping*j.getJointSpeed(),-WAIST_RESISTANCE.maxTorque,WAIST_RESISTANCE.maxTorque);j.getBodyB().applyTorque(t,true);j.getBodyA().applyTorque(-t,true);return t;}
  readVision(){const p=this.parts.pelvis.getPosition(),goal=this.goalState();this.lastVision=sampleEnvironment(this.terrain,this.obstacles,p,{left:this.parts.leftFoot.getPosition(),right:this.parts.rightFoot.getPosition()},{...this.parts.head.getPosition(),angle:this.parts.head.getAngle()},goal.target<0?-1:1);this.lastVisionStep=this.steps;return this.lastVision;}
  observations(){const torso=this.parts.torso,pelvis=this.parts.pelvis,p=pelvis.getPosition(),v=pelvis.getLinearVelocity(),a=torso.getAngle(),goal=this.goalState(),vision=this.readVision(),direction=goal.target<0?-1:1,ahead=side=>{const foot=this.parts[side+'Foot'].getPosition(),seen=vision.samples.filter(s=>s.side===side&&s.hit&&(s.x-foot.x)*direction>0&&(s.x-foot.x)*direction<.6&&(s.kind==='ground'||s.kind==='obstacle'&&s.object?.shape!=='stalactite'));return seen.length?clamp((Math.max(...seen.map(s=>s.y))-this.groundHeight(foot.x))/.6,-1,1):-1;};
   return [Math.sin(a),Math.cos(a),clamp(torso.getAngularVelocity()/8,-1,1),clamp((p.y-this.groundHeight(p.x))/1.2,-1,1),clamp(v.x/3,-1,1),clamp(v.y/3,-1,1),goal.target/2,((this.contacts.get('leftFoot')||0)+(this.contacts.get('leftToePart')||0))>0?1:0,((this.contacts.get('rightFoot')||0)+(this.contacts.get('rightToePart')||0))>0?1:0,ahead('left'),ahead('right'),vision.values[21],...this.motors.map(m=>m.joint.getJointAngle()/Math.PI),...this.motors.map(m=>clamp(m.joint.getJointSpeed()/8,-1,1)),clamp(goal.error/5,-1,1),goal.positioned?1:0,goal.low?1:0,...vision.values];
  }

  control(weights){
   if(this.policyWeights!==weights){this.policyWeights=weights;this.zeroPolicy=weights.every(v=>v===0);}
   if(this.steps%this.controlStride===0||this.commandChanged)this.actions=this.zeroPolicy?Array(JOINTS.length).fill(0):policyActions(weights,this.observations());this.commandChanged=false;
  }
  applyActuation(dt){let work=0;for(let i=0;i<this.motors.length;i++){const m=this.motors[i];m.joint.enableMotor(false);if(m.locked){this.activeTorques[i]=0;continue;}m.target=advanceJointTarget(m.target,jointTargetAngle(this.actions[i],m.lower,m.upper),this.actuation.targetSpeed,dt);const speed=m.joint.getJointSpeed(),torque=jointTargetTorque(m,m.target,m.joint.getJointAngle(),speed);this.activeTorques[i]=torque;this.torqueLoad+=(torque/m.torque)**2*dt/this.motors.length;if(torque){m.bodyB.applyTorque(torque,true);m.bodyA.applyTorque(-torque,true);}work+=Math.abs(torque*speed)*dt;}return work;}
  applyScheduledCommands(){while(this.nextCommand<this.commandSchedule.length&&this.time>=this.commandSchedule[this.nextCommand].time)this.setCommand(this.commandSchedule[this.nextCommand++].command);}
  step(weights=Array(POLICY_SIZE).fill(0),report=true,actions=null){
    this.applyScheduledCommands();
    this.impactCost=0;if(this.rewardFeedback)this.rewardContactPoints=[];this.torqueLoad=0;const previousActions=[...this.actions];if(actions)this.actions=actions;else this.control(weights);if(this.distalLocked)this.actions=this.actions.map((v,i)=>this.motors[i].locked?0:v);const previousTargets=this.motors.map(m=>m.target);let work=0;
    // Sample once per action interval, sharing the same measurements with policy and reward.
    if(this.steps%this.controlStride===0&&this.lastVisionStep!==this.steps)this.readVision();
    while(this.nextPushIndex<this.pushes.length&&this.time>=this.pushes[this.nextPushIndex].time){const p=this.pushes[this.nextPushIndex++];this.push(p.strength,p.direction,p.location,p.duration||0);this.impactEvents.at(-1).scheduledTime=p.time;this.pushesApplied++;this.lastPushAt=this.time;}
    // Smaller steps resolve loaded servos and fast motion; joint constraints enforce anatomical limits.
    const stressed=this.motors.some((m,i)=>Math.abs(m.joint.getJointSpeed())>4.5||Math.abs(jointServoTorque(m,this.actions[i],m.joint.getJointAngle(),m.joint.getJointSpeed()))>m.torque*.1),substeps=stressed?12:2;
    for(let i=0;i<substeps;i++){this.resistWaist();work+=this.applyActuation(DT/substeps);if(this.sustainedPush&&this.sustainedPush.remaining>0){this.sustainedPush.body.applyForce(this.sustainedPush.vector,this.sustainedPush.body.getWorldPoint(this.sustainedPush.localPoint),true);this.sustainedPush.remaining-=DT/substeps;}this.world.step(DT/substeps,stressed?10:8,stressed?16:10);this.world.clearForces();}this.energy+=work;this.time+=DT;this.steps++;
    const actionChange=this.motors.reduce((sum,m,i)=>sum+((m.target-previousTargets[i])/DT)**2,0)*DT/this.motors.length;
    const pelvis=this.parts.pelvis,torso=this.parts.torso,pos=pelvis.getPosition(),velocity=pelvis.getLinearVelocity();
    const angle=wrap(torso.getAngle()),footDown=['leftFoot','rightFoot','leftToePart','rightToePart'].some(n=>(this.contacts.get(n)||0)>0);
    const relativeHeight=pos.y-this.groundHeight(pos.x);
    const goal=this.goalState(),posture=Math.max(0,Math.cos(angle)),quality=clamp((relativeHeight-(goal.low?.25:.3))/(goal.low?.37:.6),0,1)*posture*(footDown?1:.1),upright=relativeHeight>(goal.low?.42:.75)&&Math.abs(angle)<(goal.low?.8:.5)&&footDown;
    if(Math.abs(pos.x-this.initialX)>Math.abs(this.furthestX-this.initialX))this.furthestX=pos.x;
    const bodyDown=['head','torso','pelvis'].some(n=>(this.contacts.get(n)||0)>0),motion=motionQuality(relativeHeight,angle,footDown,bodyDown,goal.low);this.qualityTime+=motion*DT;
    if(this.time>.2)this.balanceLostTime=upright?0:this.balanceLostTime+DT;
    const low=relativeHeight<(goal.low?.3:.5)||Math.abs(angle)>1;let newFall=false,recovered=false;
    if(low){this.downTime+=DT;if(!this.isDown&&this.downTime>.15){this.isDown=true;this.falls++;newFall=true;}}else this.downTime=0;
    if(upright){this.uprightTime+=DT;this.stableTime+=DT;this.longestUpright=Math.max(this.longestUpright,this.stableTime);if(this.time-this.lastPushAt<REWARDS.pushWindow)this.pushRecoveryTime+=DT;}else this.stableTime=0;
    if(this.isDown&&this.stableTime>.8){this.isDown=false;this.recoveries++;recovered=true;}
    const walkSupport=walkingSupport({motionQuality:motion,down:this.isDown,newFall,bodyDown});this.finalUpright=upright&&!this.isDown&&!bodyDown;this.stableStandingTime=this.finalUpright?this.stableStandingTime+DT:0;
    if(this.stage==='walk'||this.stage==='run'){const dx=pos.x-this.lastX;this.supportedDistance+=dx>0?dx*walkSupport:dx;if(this.finalUpright&&Math.sign(goal.target)*velocity.x>=WALK_CRITERIA.minSpeed&&Math.abs(goal.target)>0)this.walkingTime+=DT;}
    let passed=0;for(const [i,o]of this.obstacles.entries())if(o.x>this.initialX+.3&&!this.passed.has(i)&&pos.x>o.x+o.width/2+REWARDS.obstacleClearance&&upright){this.passed.add(i);passed++;}
    const progressLimit=Math.max(.15,Math.abs(goal.target)*this.duration),anchor=this.command?this.commandAnchor:this.initialX,progressPotential=x=>clamp(Math.sign(goal.target)*(x-anchor),-progressLimit,progressLimit);
    const distal=distalActivity(this.motors,this.actions,previousActions,!!this.rewardFeedback);
    const terms=rewardBreakdown(this.stage,{dt:DT,upright,quality,motionQuality:motion,visionCoverage:this.lastVision?.coverage??0,distalMotion:distal.motion,distalChange:distal.change,torqueLoad:this.torqueLoad,actionChange,boundedProgress:progressPotential(pos.x)-progressPotential(this.lastX),heightProgress:relativeHeight-this.lastRelativeHeight,postureProgress:posture-this.lastPosture,speed:velocity.x,target:goal.target,angle,height:relativeHeight,distance:goal.distance,dx:pos.x-this.lastX,commanded:!!this.command,goalProgress:goal.positioned?Math.abs(this.lastGoalError??goal.error)-Math.abs(goal.error):0,goalError:goal.error,positioned:goal.positioned,lowPosture:goal.low,dy:pos.y-this.lastHeight,newFall,recovered,down:this.isDown,bodyDown,failedBalance:this.falls>0,afterPush:this.time-this.lastPushAt<REWARDS.pushWindow,impactCost:this.impactCost,work,passed});
    if(this.stage==='balance'&&newFall)terms.forfeiture=-Math.max(0,this.reward);
    const numerical=![pos.x,pos.y,velocity.x,...Object.values(terms)].every(Number.isFinite);
    for(const key in terms){const value=terms[key];if(Number.isFinite(value)){this.reward+=value;this.rewardTerms[key]=(this.rewardTerms[key]||0)+value;}}
    this.terminationReason=numerical?'numerical':pos.x< -62||pos.x>94||pos.y<-.8?'bounds':this.steps>=Math.round(this.duration/DT)?'duration':this.endOnFall&&this.balanceLostTime>.2?'fall':null;
    if(this.terminationReason==='fall'){const penalty=-REWARDS.remainingFailure*Math.max(0,this.duration-this.time)-(this.falls===0?REWARDS.balanceFall+Math.max(0,this.reward):0);this.reward+=penalty;this.rewardTerms.failure=(this.rewardTerms.failure||0)+penalty;terms.failure=penalty;}
    else if(this.terminationReason&&this.terminationReason!=='duration'){const penalty=Math.min(0,-20-8*this.duration-this.reward);this.reward+=penalty;this.rewardTerms.failure=(this.rewardTerms.failure||0)+penalty;terms.failure=penalty;}
    for(const value of Object.values(terms))if(Number.isFinite(value)){if(value>0)this.positiveRewardTotal+=value;else this.negativeRewardTotal-=value;}
    this.lastRelativeHeight=relativeHeight;this.lastPosture=posture;this.lastX=pos.x;this.lastHeight=pos.y;this.lastGoalError=goal.error;
    this.done=!!this.terminationReason;
    if(this.rewardFeedback)this.rewardFeedback.collect(this.time,terms,term=>rewardLocations(this,term,distal),this.done||newFall||recovered||passed>0||this.impactCost>0);
    return report?this.metrics():undefined;
  }
  metrics(){const p=this.parts.pelvis.getPosition(),goal=this.goalState();return {forwardContact:this.forwardContact?{...this.forwardContact}:null,walkingTime:this.walkingTime,supportedDistance:this.supportedDistance,finalUpright:this.finalUpright,stableTime:this.stableStandingTime,motionQuality:this.qualityTime/Math.max(this.time,DT),longestUpright:this.longestUpright,plannedDuration:this.duration,terminationReason:this.terminationReason,time:this.time,reward:this.reward,rewardTerms:{...this.rewardTerms},positiveRewardTotal:this.positiveRewardTotal,negativeRewardTotal:this.negativeRewardTotal,furthestX:this.furthestX,furthestDistance:this.furthestX-this.initialX,distance:p.x-this.initialX,speed:(p.x-this.initialX)/Math.max(this.time,DT),height:p.y-this.groundHeight(p.x),falls:this.falls,recoveries:this.recoveries,passed:this.passed.size,upright:this.uprightTime/Math.max(this.time,DT),energy:this.energy,pushes:this.pushesApplied,pushResistance:this.pushRecoveryTime,done:!!this.done,recovering:this.isDown,targetSpeed:goal.target,goalDistance:goal.error,command:this.command?{...this.command}:null};}
  snapshot(){return {time:this.time,...(this.rewardFeedback?{rewardEvents:this.rewardFeedback.snapshot()}:{}),hits:this.impactEvents.filter(h=>this.time-h.time<.7).map(h=>({...h,point:[...h.point]})),parts:this.bodies.map(p=>{const v=p.body.getPosition();return [v.x,v.y,p.body.getAngle()]}),metrics:this.metrics()};}
}
export function robotGeometry(sim){
 return {parts:sim.bodies.map(({name,w,h,circle,color})=>({name,w,h,circle,color,attachments:name.endsWith('Forearm')?[{name:name.replace('Forearm','Hand'),x:0,y:-.2,w:.09,h:.13}]:name.endsWith('Foot')?[{name:name.replace('Foot','ToePart'),x:.165,y:-.015,w:.08,h:.07}]:[]})),joints:sim.motors.map(m=>({name:m.name,a:sim.bodies.findIndex(p=>p.body===m.joint.getBodyA()),b:sim.bodies.findIndex(p=>p.body===m.joint.getBodyB()),anchor:[m.joint.getLocalAnchorA().x,m.joint.getLocalAnchorA().y]}))};
}
export function episode(weights,stage='balance',seed=1,options={}){
  const sim=new RobotWorld(stage,{...(stage==='balance'?{command:{mode:'hold'}}:{}),seed,...options}),trace=[];
  while(!sim.done){sim.step(weights,false);if(options.record&&sim.steps%2===0)trace.push(sim.snapshot());}
  if(options.record&&trace.at(-1)?.time!==sim.time)trace.push(sim.snapshot());return {metrics:sim.metrics(),pushPlan:sim.pushes.map(p=>({...p})),commandSchedule:sim.commandSchedule.map(p=>structuredClone(p)),trace,...(options.summaryOnly?{}:robotGeometry(sim)),obstacles:sim.obstacles,terrain:sim.terrain};
}
export function passedStage(metrics,stage,requiredDuration=STAGES[stage].duration){
  if(metrics.terminationReason!=='duration'||!metrics.done||metrics.time+DT/2<requiredDuration)return false;
  if(stage==='balance')return metrics.upright>.95&&metrics.falls===0&&Math.abs(metrics.distance)<1&&metrics.height>.75;
  if(stage==='recover')return metrics.recoveries>=1&&metrics.height>.75;
  if(stage==='walk'){const c=WALK_CRITERIA;return metrics.distance>=c.speed*requiredDuration*c.distanceRatio&&metrics.supportedDistance>=c.speed*requiredDuration*c.supportedRatio&&metrics.upright>=c.uprightRatio&&metrics.walkingTime+DT/2>=requiredDuration*c.movingRatio&&metrics.falls===0&&metrics.finalUpright===true&&!metrics.recovering&&metrics.stableTime+DT/2>=Math.min(c.settleSeconds,requiredDuration/3);}
  if(stage==='run')return metrics.distance>=1.4*requiredDuration*.5&&metrics.supportedDistance>=1.4*requiredDuration*.35&&metrics.walkingTime>=requiredDuration*.45&&metrics.upright>=.7&&metrics.falls===0&&metrics.finalUpright===true;
  return metrics.passed>=1&&metrics.upright>.5;
}

export const VALIDATION_CASES = [
 {id:'still',label:'정지',seed:31,pushes:[]},
 {id:'light',label:'앞뒤 2 N·s',seed:1000,pushes:[{time:2,strength:2,direction:0,location:'torso'},{time:5,strength:2,direction:180,location:'torso'}]},
 {id:'medium',label:'어깨·골반 4 N·s',seed:2047,pushes:[{time:2,strength:4,direction:180,location:'shoulder'},{time:5,strength:4,direction:0,location:'pelvis'}]},
 {id:'strong',label:'앞뒤 6 N·s',seed:4093,pushes:[{time:1.8,strength:6,direction:0,location:'shoulder'},{time:4.8,strength:6,direction:180,location:'torso'}]},
];
export function evaluateAbility(weights,stage,environment={},validationCases=VALIDATION_CASES){
 const cases=validationCases.map(c=>{const metrics=episode(weights,stage,c.seed,{...environment,observationSeconds:c.seconds??normalizeEvaluationSettings(environment).validationSeconds,pushes:c.pushes,disturbances:false,summaryOnly:true}).metrics;return {id:c.id,label:c.label,passed:passedStage(metrics,stage,c.seconds??normalizeEvaluationSettings(environment).validationSeconds),reward:metrics.reward,metrics};});
 return {meanReward:cases.reduce((s,c)=>s+c.reward,0)/cases.length,passRate:cases.filter(c=>c.passed).length/cases.length,cases};
}
export function evaluateAbilities(weights,environment={}){return Object.fromEntries(Object.keys(STAGES).map(stage=>[stage,evaluateAbility(weights,stage,environment)]));}

export function evaluateCommands(weights,environment={}){return COMMAND_CASES.reduce((total,c)=>total+episode(weights,'walk',71,{...environment,observationSeconds:normalizeEvaluationSettings(environment).validationSeconds,disturbances:false,pushes:[],command:null,commandSchedule:c.schedule,summaryOnly:true}).metrics.reward,0)/COMMAND_CASES.length;}

// Monitoring only: never used to select the integrated model.
export const MONITOR_CASES=monitorCases();
