import {STANDARD_GRAVITY,ROBOT_BODY_VERSION,ROBOT_MASS,HUMAN_SEGMENTS,MOTOR_TORQUES,segmentMassData} from './robot-body.mjs?v=update83';
import {recoveryEarlyStopReady,recoveryAssistLocation,recoveryAssistOutput,recoveryStart,recoveryPotential,recoveryLimitCost,recoveryTestStart} from './robot-recovery.mjs?v=update83';
import {COMBAT_RULES,isCombat,combatSettings,opponentFeatures,freshFighter,updateDownState,matchVerdict,impactDamage} from './robot-combat.mjs?v=update83';
import {trainingCondition,makeTrainingTerrain,groundTestSpec,validationGround} from './robot-training-ground.mjs?v=update83';
import {taskEnvironment} from './robot-task-settings.mjs?v=update83';
import {JOINT_SERVOS,JOINT_RANGES,SERVO_PROFILES,normalizeActuation,jointTargetAngle,advanceJointTarget,jointTargetTorque,jointServoTorque} from './robot-actuation.mjs?v=update83';
import {RewardFeedback,rewardLocations} from './robot-reward-feedback.mjs?v=update83';
import {distalActivity} from './robot-attention.mjs?v=update83';
import {sampleEnvironment,sensedSurface} from './robot-sensors.mjs?v=update83';
import {PUSH_PARTS} from './robot-impact.mjs?v=update83';
import {normalizeEvaluationSettings,monitorCases} from './robot-evaluation.mjs?v=update83';
import {motionQuality,walkingSupport,WALK_CRITERIA,RECOVERY_CRITERIA,recoveryStanding} from './robot-performance.mjs?v=update83';
import {makeTerrain,terrainHeight,rockVertices} from './robot-terrain.mjs?v=update83';
import { World, Vec2, Box, Circle, Polygon, RevoluteJoint, DistanceJoint } from './vendor/planck.mjs';
import {normalizeCommand,commandState,COMMAND_CASES} from './robot-goals.mjs?v=update83';
export const DT = 1 / 60;
import {POLICY_SIZE,policyActions,POLICY_TASK_SLOTS} from './robot-policy.mjs?v=update83';
import {REWARDS,rewardBreakdown} from './robot-rewards.mjs?v=update83';
export {POLICY_SIZE} from './robot-policy.mjs?v=update83';
export const STAGES = {
  balance: { label: '균형 잡기', speed: 0, duration: 10 },
  recover: { label: '일어나기', speed: 0, duration: 10 },
  walk: { label: '앞으로 걷기', speed: .55, duration: 10 },
  punch: {label:'펀치 공격',speed:0,duration:15},
  kick: {label:'발차기 공격',speed:0,duration:15},
  defend: {label:'방어',speed:0,duration:20},
  fight: {label:'격투',speed:0,duration:30},
};
export const LOCKED_DISTAL_JOINTS=Object.freeze([]);
export const JOINTS = ['waist','neck','leftHip','leftKnee','leftAnkle','rightHip','rightKnee','rightAnkle','leftShoulder','leftElbow','rightShoulder','rightElbow'];
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const PUSH_INTERVALS=Object.freeze([0,.5,1,2,3,5,10,30]);
export function normalizePushSettings(raw={}){const low=Number(raw?.pushMin),high=Number(raw?.pushMax),valid=Number.isFinite(low)&&Number.isFinite(high)&&low>=.1&&high<=100&&low<=high;return {autoPush:raw?.autoPush!==false,pushMin:valid?low:1,pushMax:valid?high:6,pushInterval:PUSH_INTERVALS.includes(Number(raw?.pushInterval))?Number(raw.pushInterval):0};}
export const WAIST_RESISTANCE=Object.freeze({stiffness:190,damping:31,maxTorque:330});
export function seeded(seed) { return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; }
const wrap = a => Math.atan2(Math.sin(a),Math.cos(a));
export class RobotWorld {
  constructor(stage='balance', options={}) {
    options=taskEnvironment(options,stage);this.trainingSpec=options.terrain==='training'?(options.trainingSpec||groundTestSpec(options.terrainVariant||0)):null;this.massIndex=0;this.actuation=normalizeActuation(options);this.distalLocked=false;this.stage = STAGES[stage] ? stage : 'balance'; this.task=STAGES[this.stage];this.controlStride=['walk','run'].includes(this.stage)?6:3;
    this.duration=Number.isInteger(options.observationSeconds)&&options.observationSeconds>=1&&options.observationSeconds<=3600?options.observationSeconds:this.task.duration;
    this.rewardFeedback=options.record||options.rewardEffects?new RewardFeedback():null;this.rewardContactPoints=[];
    this.seed=options.seed??1;this.random=seeded(this.seed);this.time=0;this.reward=0;this.energy=0;this.steps=0;
    this.endOnFall=options.endOnFall===true&&this.stage==='balance';this.balanceLostTime=0;this.qualityTime=0;this.longestUpright=0;this.falls=0;this.recoveries=0;this.uprightTime=0;this.stableTime=0;this.walkingTime=0;this.stableStandingTime=0;this.supportedDistance=0;this.finalUpright=false;this.isDown=false;this.downTime=0;this.impactCost=0;this.passed=new Set();this.contacts=new Map();
    this.world=options.sharedWorld||new World(Vec2(0,-STANDARD_GRAVITY));this.facing=options.facing===-1?-1:1;this.spawnX=options.spawnX||0;this.collisionGroup=options.collisionGroup??-1;this.externalPhysics=options.externalPhysics===true;this.ccdMode=options.ccdMode==='always'?'always':'adaptive';this.ccdEnabled=true;this.world.setAutoClearForces(false);this.bodies=[];this.parts={};this.joints={};this.motors=[];
    this.terrain=this.trainingSpec?makeTrainingTerrain(this.trainingSpec):makeTerrain(options.terrain,options.terrainVariant);this.terrainSegments=this.terrain.segments;this.groundHeight=x=>terrainHeight(this.terrainSegments,x);
    const floor=options.sharedFloor||this.world.createBody({userData:'ground'});if(!options.sharedFloor)floor.createFixture(Box(500,.15,Vec2(0,-.15)),{friction:options.friction??this.terrain.friction});
    for(const s of this.terrainSegments)if((s.y0>0||s.y1>0)&&s.x1-s.x0>1e-5){const body=options.groupStatic===false?this.world.createBody({userData:'ground'}):floor;body.createFixture(Polygon([Vec2(s.x0,-.2),Vec2(s.x1,-.2),Vec2(s.x1,s.y1),Vec2(s.x0,s.y0)]),{friction:options.friction??s.friction??this.terrain.friction});}
    let ceiling;for(const s of this.terrain.ceilings||[]){const body=options.groupStatic===false?this.world.createBody({userData:'obstacle'}):(ceiling??=this.world.createBody({userData:'obstacle'}));body.createFixture(Polygon([Vec2(s.x0,s.y0),Vec2(s.x1,s.y1),Vec2(s.x1,Math.max(s.y0,s.y1)+6),Vec2(s.x0,Math.max(s.y0,s.y1)+6)]),{friction:.85});}
    this.obstacles=[...this.terrain.obstacles];

    for(const o of this.obstacles){const body=this.world.createBody({position:Vec2(o.x,(o.bottom??this.groundHeight(o.x))+o.height/2),userData:'obstacle'});body.createFixture(['rock','stalactite'].includes(o.shape)?Polygon(rockVertices(o).map(p=>Vec2(...p))):o.shape==='pipe'?Circle(o.height/2):Box(o.width/2,o.height/2),{friction:.8,filterMaskBits:o.side==='left'?3:o.side==='right'?5:0xffff});}
    this.endOnRecovery=this.stage==='recover'&&options.recoveryEarlyStopTraining===true&&options.recoveryEarlyStop===true;this.recoveryUnassistedStable=0;this.recoveryAssistLocation=recoveryAssistLocation(options.recoveryAssistLocation);this.recoveryAssistLimit=this.stage==='recover'&&options.recoveryAssistTraining===true?clamp(Number(options.recoveryAssistForce)||0,0,5000):0;this.recoveryAssistBaseForce=clamp(Number(options.recoveryAssistBaseForce??options.recoveryAssistForce)||0,0,5000);this.recoveryAssistSeconds=this.recoveryAssistLimit>0?clamp(Number(options.recoveryAssistSeconds??3)||0,0,20):0;this.recoveryAssistTimeAutoReduce=options.recoveryAssistTimeAutoReduce===true;this.recoveryAssistWindow=0;this.recoveryAssistStarted=false;this.recoveryAssistAutoReduce=options.recoveryAssistAutoReduce===true;this.recoveryAssistForce=0;this.recoveryAssistMaxUsed=0;this.recoveryAssistImpulse=0;this.recoveryAssistStall=0;this.recoveryAssistElapsed=0;
    const recovering=this.stage==='recover'&&options.startStanding!==true;this.recoveryStart=recovering?recoveryStart(this.random,options):null;const lying=this.recoveryStart?.kind.startsWith('lying');
    this.spawnAngle=this.recoveryStart?this.recoveryStart.angle:(Number.isFinite(options.spawnTilt)?clamp(options.spawnTilt,-.12,.12):(this.random()-.5)*(options.spawnRange??.025));
    this.spawnY=(lying?.34:1.03)+this.groundHeight(this.spawnX||0);
    this.makeRobot();if(this.recoveryStart)this.applyRecoveryStart(this.recoveryStart);if(this.trainingSpec||this.recoveryStart)this.placeOnTerrain();this.totalMass=this.bodies.reduce((sum,part)=>sum+part.body.getMass(),0);this.motors.sort((a,b)=>JOINTS.indexOf(a.name)-JOINTS.indexOf(b.name));this.initialX=this.parts.pelvis.getPosition().x;this.lastX=this.initialX;this.furthestX=this.initialX;this.forwardContact=null;this.lastHeight=this.parts.pelvis.getPosition().y;
    this.lastRelativeHeight=this.parts.pelvis.getPosition().y-this.groundHeight(this.parts.pelvis.getPosition().x);this.lastPosture=Math.max(0,Math.cos(this.parts.torso.getAngle()));this.lastRecoveryPotential=recoveryPotential(this.lastRelativeHeight,this.parts.torso.getAngle());this.command=null;this.commandAnchor=this.initialX;this.commandSchedule=(options.commandSchedule||[]).map(s=>({time:s.time,command:normalizeCommand(s.command)}));this.nextCommand=0;if(options.command)this.setCommand(options.command);
    this.actions=Array(JOINTS.length*3).fill(0);this.activeTorques=Array(JOINTS.length).fill(0);this.rewardTerms={};this.positiveRewardTotal=0;this.negativeRewardTotal=0;if(recovering)this.isDown=true;
    this.pushes = options.pushes ? options.pushes.map(p=>({...p})) : [];
    const pushSettings=normalizePushSettings(this.trainingSpec?{...options,autoPush:this.trainingSpec.pushEnabled,pushInterval:this.trainingSpec.pushInterval,pushMin:.1,pushMax:this.trainingSpec.pushMax}:options);
    if(options.disturbances!==false&&pushSettings.autoPush&&!options.pushes){
      const interval=this.trainingSpec?this.trainingSpec.pushInterval:pushSettings.pushInterval;let time=interval>0?.6+this.random()*.4:.9+this.random()*Math.max(.1,this.duration-2.4);
      do{this.pushes.push({time,strength:pushSettings.pushMin+this.random()*(pushSettings.pushMax-pushSettings.pushMin),direction:this.random()*360,location:PUSH_PARTS[Math.floor(this.random()*PUSH_PARTS.length)],duration:0});time+=interval;}while(interval>0&&time<this.duration-.1);
    }
    this.impactEvents=[];this.pushSequence=0;this.nextPushIndex=0;this.pushesApplied=0;this.pushRecoveryTime=0;this.lastPushAt=-Infinity;this.obstacleHeight=options.obstacleHeight??.14;
    const contact=(contact,amount)=>{
      const a=contact.getFixtureA().getBody().getUserData(),b=contact.getFixtureB().getBody().getUserData();
      const name=a==='ground'||a==='obstacle'?b:b==='ground'||b==='obstacle'?a:null;
      if(typeof name==='string'&&[contact.getFixtureA().getBody(),contact.getFixtureB().getBody()].some(body=>body.robotOwner===this))this.contacts.set(name,Math.max(0,(this.contacts.get(name)||0)+amount));
    };
    this.world.on('begin-contact',c=>contact(c,1));this.world.on('end-contact',c=>contact(c,-1));
    // Track actual upward-facing support contacts, including hands/body and obstacle tops.
    this.world.on('post-solve',contact=>{
      const a=contact.getFixtureA().getBody().getUserData(),b=contact.getFixtureB().getBody().getUserData(),staticA=a==='ground'||a==='obstacle',staticB=b==='ground'||b==='obstacle';
      if(staticA===staticB||![contact.getFixtureA().getBody(),contact.getFixtureB().getBody()].some(body=>body.robotOwner===this))return;const wm=contact.getWorldManifold();if(!wm?.pointCount||(staticA?wm.normal.y:-wm.normal.y)<.2)return;
      for(let i=0;i<wm.pointCount;i++){const p=wm.points[i];if(Number.isFinite(p.x)&&p.x>this.initialX&&p.x>(this.forwardContact?.x??this.initialX))this.forwardContact={x:p.x,y:p.y,distance:p.x-this.initialX,body:staticA?b:a,basis:'forward-contact-v1',terrain:this.terrain.kind,variant:this.terrain.variant};}
    });
    const impactTimes=new WeakMap();
    this.world.on('pre-solve',(contact,old)=>{
      const a=contact.getFixtureA().getBody(),b=contact.getFixtureB().getBody(),an=a.getUserData(),bn=b.getUserData();
      if(![a,b].some(body=>body.robotOwner===this))return;
      if(![an,bn].some(n=>n==='ground'||n==='obstacle')||![an,bn].some(n=>['head','torso','pelvis'].includes(n)))return;
      // A resting contact carries weight every solver step; it is not a collision.
      if(old.pointCount>0||this.time-(impactTimes.get(contact)??-Infinity)<.12)return;
      const wm=contact.getWorldManifold();if(!wm?.pointCount)return;let closing=0;
      for(let i=0;i<wm.pointCount;i++){const va=a.getLinearVelocityFromWorldPoint(wm.points[i]),vb=b.getLinearVelocityFromWorldPoint(wm.points[i]);closing=Math.max(closing,-((vb.x-va.x)*wm.normal.x+(vb.y-va.y)*wm.normal.y));}
      if(closing<=REWARDS.impactSpeed)return;const mass=a.getMass()||b.getMass();const energy=.5*mass*(closing*closing-REWARDS.impactSpeed**2);this.impactCost+=energy;if(this.rewardFeedback){const body=['head','torso','pelvis'].includes(an)?an:bn;this.rewardContactPoints.push({body,point:[wm.points[0].x,wm.points[0].y],weight:energy});}impactTimes.set(contact,this.time);
    });
  }
  applyRecoveryStart(pose){
    for(const m of this.motors){const angle=m.bodyA.getAngle()+(pose.joints[m.name]||0)*this.facing,anchor=m.bodyA.getWorldPoint(m.joint.getLocalAnchorA()),local=m.joint.getLocalAnchorB(),c=Math.cos(angle),s=Math.sin(angle);m.bodyB.setTransform(Vec2(anchor.x-c*local.x+s*local.y,anchor.y-s*local.x-c*local.y),angle);m.bodyB.setLinearVelocity(Vec2(0,0));m.bodyB.setAngularVelocity(0);}
  }
  placeOnTerrain(){
    // Place the assembled rigid geometry, including hands/soles, just above the
    // actual floor. Moving every body together preserves all joint anchors and
    // starts with zero velocity; no pose, motor action or warm-up is prescribed.
    let shift=-Infinity;const nearby=this.obstacles.filter(o=>Math.abs(o.x)<2);let side='both';
    const sample=point=>{const surface=side==='both'?Math.max(sensedSurface(this.terrain,nearby,point.x,'left'),sensedSurface(this.terrain,nearby,point.x,'right')):sensedSurface(this.terrain,nearby,point.x,side);shift=Math.max(shift,surface-point.y);};
    for(const part of this.bodies)for(let fixture=part.body.getFixtureList();fixture;fixture=fixture.getNext()){
      side=part.name.startsWith('left')?'left':part.name.startsWith('right')?'right':'both';const shape=fixture.getShape();
      if(shape.getType()==='circle'){const center=part.body.getWorldPoint(shape.getCenter());for(let i=0;i<64;i++){const angle=i*Math.PI/32;sample({x:center.x+shape.getRadius()*Math.cos(angle),y:center.y+shape.getRadius()*Math.sin(angle)});}}
      else {const vertices=shape.m_vertices;for(let i=0;i<vertices.length;i++){const a=part.body.getWorldPoint(vertices[i]),b=part.body.getWorldPoint(vertices[(i+1)%vertices.length]),count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.025));for(let j=0;j<=count;j++)sample({x:a.x+(b.x-a.x)*j/count,y:a.y+(b.y-a.y)*j/count});}}
    }
    if(Number.isFinite(shift)){shift+=.025;for(const part of this.bodies){const p=part.body.getPosition();part.body.setPosition(Vec2(p.x,p.y+shift));}this.spawnY+=shift;}
  }
  transform(x,y){const dy=y-1.03,c=Math.cos(this.spawnAngle),s=Math.sin(this.spawnAngle);return Vec2(this.spawnX+this.facing*(c*x-s*dy),this.spawnY+s*x+c*dy);}
  part(name,x,y,w,h,color,circle=false){
    const body=this.world.createDynamicBody({position:this.transform(x,y),angle:this.spawnAngle*this.facing,linearDamping:.05,angularDamping:.12,allowSleep:false,bullet:isCombat(this.stage),userData:name});
    body.robotOwner=this;const massScale=this.trainingSpec?.massScales?.[this.massIndex++]??1;const mass=HUMAN_SEGMENTS[name].mass,shape=circle?Circle(w):Box(w/2,h/2),area=circle?Math.PI*w*w:w*h;
    body.createFixture(shape,{density:mass*massScale/area,friction:name.includes('Foot')||name.includes('Toe')?1.2:.5,restitution:.015,filterGroupIndex:this.collisionGroup,filterCategoryBits:name.startsWith('left')?2:name.startsWith('right')?4:1});
    const item={name,body,w,h,circle,color,massScale};this.bodies.push(item);this.parts[name]=body;return body;
  }
  joint(name,a,b,x,y,lower,upper){
    const torque=MOTOR_TORQUES[name],locked=this.distalLocked&&LOCKED_DISTAL_JOINTS.includes(name);if(locked)lower=upper=0;
    const joint=this.world.createJoint(RevoluteJoint({enableLimit:true,lowerAngle:this.facing===1?lower:-upper,upperAngle:this.facing===1?upper:-lower,enableMotor:false,maxMotorTorque:torque,motorSpeed:0,collideConnected:false},a,b,this.transform(x,y)));
    this.joints[name]=joint;this.motors.push({name,joint,lower,upper,torque,speedLimit:isCombat(this.stage)?24:9,kp:JOINT_SERVOS[name].kp*SERVO_PROFILES[this.actuation.servoProfile].kp,kd:JOINT_SERVOS[name].kd*SERVO_PROFILES[this.actuation.servoProfile].kd,target:0,locked,bodyA:a,bodyB:b});
  }
  makeRobot(){
    const pelvis=this.part('pelvis',0,1.06,.3,.18,'#536d8c');
    const torso=this.part('torso',0,1.375,.32,.45,'#6788ac');
    const head=this.part('head',0,1.75,.13,.13,'#bdcbdc',true);
    this.joint('waist',pelvis,torso,0,1.15,...JOINT_RANGES.waist);this.joint('neck',torso,head,0,1.62,...JOINT_RANGES.neck);
    for(const [side,color] of [['left','#8fa8c5'],['right','#d6a174']]){
      const thigh=this.part(side+'Thigh',0,.805,.11,.45,color);
      const shin=this.part(side+'Shin',0,.355,.085,.45,color);
      const foot=this.part(side+'Foot',.07,.08,.25,.1,color);
      foot.createFixture(Box(.04,.035,Vec2(.165*this.facing,-.015)),{density:0,friction:1.2,restitution:.015,filterGroupIndex:this.collisionGroup,filterCategoryBits:side==='left'?2:4});this.parts[side+'ToePart']=foot;
      this.joint(side+'Hip',pelvis,thigh,0,1.03,...JOINT_RANGES[side+'Hip']);
      // Facing +X: knees flex backward (negative), elbows forward (positive).
      this.joint(side+'Knee',thigh,shin,0,.58,...JOINT_RANGES[side+'Knee']);
      this.joint(side+'Ankle',shin,foot,0,.13,...JOINT_RANGES[side+'Ankle']);

      const sx=0; // Both shoulders project onto the same side-view axis, like the hips.
      const upper=this.part(side+'UpperArm',sx,1.39,.085,.3,color);
      const lower=this.part(side+'Forearm',sx,1.105,.073,.27,color);
      lower.createFixture(Box(.045,.065,Vec2(0,-.2)),{density:0,friction:.5,restitution:.015,filterGroupIndex:this.collisionGroup,filterCategoryBits:side==='left'?2:4});this.parts[side+'Hand']=lower;
      this.joint(side+'Shoulder',torso,upper,sx,1.54,...JOINT_RANGES[side+'Shoulder']);
      this.joint(side+'Elbow',upper,lower,sx,1.24,...JOINT_RANGES[side+'Elbow']);

    }
    for(const {name,body,massScale} of this.bodies)body.setMassData(segmentMassData(name,massScale,this.facing));
  }
  push(strength=4,direction=0,location='torso',duration=0){
    const body=location==='shoulder'?this.parts.torso:this.parts[location]||this.parts.torso,angle=direction*Math.PI/180;
    const vector=Vec2(Math.cos(angle)*strength,Math.sin(angle)*strength);
    const point=location==='shoulder'?body.getWorldPoint(Vec2(.12,.2)):location.endsWith('Hand')?body.getWorldPoint(Vec2(0,-.2)):location.endsWith('ToePart')?body.getWorldPoint(Vec2(.165*this.facing,-.015)):body.getWorldCenter();
    this.impactEvents.push({id:++this.pushSequence,time:this.time,scheduledTime:this.time,strength,direction,requestedLocation:location,location:body.getUserData(),point:[point.x,point.y]});if(this.impactEvents.length>12)this.impactEvents.shift();
    if(duration>0)this.sustainedPush={body,vector,localPoint:body.getLocalPoint(point),remaining:duration};
    else body.applyLinearImpulse(vector,point,true);
  }
  setCommand(raw){this.command=raw?normalizeCommand(raw):null;this.commandAnchor=this.parts.pelvis.getPosition().x;this.commandChanged=true;this.lastGoalError=this.goalState().error;}
  goalState(){return commandState(this.command,this.parts.pelvis.getPosition().x,this.command?this.commandAnchor:this.initialX,this.task.speed,true);}
  resistWaist(){const j=this.joints.waist,t=clamp(-WAIST_RESISTANCE.stiffness*j.getJointAngle()-WAIST_RESISTANCE.damping*j.getJointSpeed(),-WAIST_RESISTANCE.maxTorque,WAIST_RESISTANCE.maxTorque);j.getBodyB().applyTorque(t,true);j.getBodyA().applyTorque(-t,true);return t;}
  readVision(){const p=this.parts.pelvis.getPosition(),goal=this.goalState();this.lastVision=sampleEnvironment(this.terrain,this.obstacles,p,{left:this.parts.leftFoot.getPosition(),right:this.parts.rightFoot.getPosition()},{...this.parts.head.getPosition(),angle:this.parts.head.getAngle()},goal.target<0?-1:1);this.lastVisionStep=this.steps;return this.lastVision;}
  observations(){const torso=this.parts.torso,pelvis=this.parts.pelvis,p=pelvis.getPosition(),v=pelvis.getLinearVelocity(),a=torso.getAngle()*this.facing,goal=this.goalState(),vision=this.readVision(),direction=goal.target<0?-1:1,ahead=side=>{const foot=this.parts[side+'Foot'].getPosition(),seen=vision.samples.filter(s=>s.side===side&&s.hit&&(s.x-foot.x)*direction>0&&(s.x-foot.x)*direction<.6&&(s.kind==='ground'||s.kind==='obstacle'&&s.object?.shape!=='stalactite'));return seen.length?clamp((Math.max(...seen.map(s=>s.y))-this.groundHeight(foot.x))/.6,-1,1):-1;};
   return [Math.sin(a),Math.cos(a),clamp(torso.getAngularVelocity()*this.facing/8,-1,1),clamp((p.y-this.groundHeight(p.x))/1.2,-1,1),clamp(v.x*this.facing/3,-1,1),clamp(v.y/3,-1,1),goal.target/2,((this.contacts.get('leftFoot')||0)+(this.contacts.get('leftToePart')||0))>0?1:0,((this.contacts.get('rightFoot')||0)+(this.contacts.get('rightToePart')||0))>0?1:0,ahead('left'),ahead('right'),vision.values[21],...this.motors.map(m=>m.joint.getJointAngle()*this.facing/Math.PI),...this.motors.map(m=>clamp(m.joint.getJointSpeed()*this.facing/8,-1,1)),clamp(goal.error/5,-1,1),goal.positioned?1:0,goal.low?1:0,...(this.previousPolicyActions||Array(36).fill(0)),...POLICY_TASK_SLOTS.map(s=>s===this.stage?1:0),...opponentFeatures(this,this.combatOpponent,this.combatState,this.opponentState),...vision.values];
  }

  control(weights){
   if(this.policyWeights!==weights){this.policyWeights=weights;this.zeroPolicy=weights.every(v=>v===0);}
   if(this.steps%this.controlStride===0||this.commandChanged)this.actions=this.zeroPolicy?Array(JOINTS.length*3).fill(0):policyActions(weights,this.observations());this.commandChanged=false;
  }
  recoveryAssistTarget(){
    const location=this.recoveryAssistLocation,body=this.parts[location==='head'?'head':location==='pelvis'?'pelvis':'torso'];
    const point=location==='shoulder'?this.joints.leftShoulder.getAnchorA():location==='abdomen'?body.getWorldPoint(Vec2(0,-.15)):body.getWorldCenter();
    return {body,point};
  }
  applyRecoveryAssist(dt){
    if(!this.recoveryAssistLimit||!this.recoveryAssistSeconds||this.stage!=='recover')return;
    const {body,point}=this.recoveryAssistTarget(),pelvis=this.parts.pelvis,p=pelvis.getPosition(),height=p.y-this.groundHeight(p.x),lying=this.isDown&&height<.65&&Math.abs(this.parts.torso.getAngle())>.8;
    this.recoveryAssistStall=lying?this.recoveryAssistStall+dt:height>.75||!this.isDown?0:this.recoveryAssistStall;
    if(this.recoveryAssistStall>1.2)this.recoveryAssistStarted=true;
    if(this.recoveryAssistStarted){if(this.recoveryAssistWindow+1e-9>=this.recoveryAssistSeconds){this.recoveryAssistForce=0;return;}this.recoveryAssistWindow=Math.min(this.recoveryAssistSeconds,this.recoveryAssistWindow+dt);}
    this.recoveryAssistElapsed=this.recoveryAssistStall>1.2?this.recoveryAssistElapsed+dt:0;
    this.recoveryAssistForce=recoveryAssistOutput({force:this.recoveryAssistLimit,height,verticalSpeed:body.getLinearVelocityFromWorldPoint(point).y,stallSeconds:this.recoveryAssistStall,rampSeconds:this.recoveryAssistElapsed});
    this.recoveryAssistMaxUsed=Math.max(this.recoveryAssistMaxUsed,this.recoveryAssistForce);this.recoveryAssistImpulse+=this.recoveryAssistForce*dt;
    if(this.recoveryAssistForce>0)body.applyForce(Vec2(0,this.recoveryAssistForce),point,true);
  }
  applyActuation(dt){let work=0;for(let i=0;i<this.motors.length;i++){const m=this.motors[i];m.joint.enableMotor(false);if(m.locked){this.activeTorques[i]=0;continue;}m.target=advanceJointTarget(m.target,jointTargetAngle(this.actions[i],m.lower,m.upper),this.actuation.targetSpeed,dt);const speed=m.joint.getJointSpeed()*this.facing,torque=jointTargetTorque(m,m.target,m.joint.getJointAngle()*this.facing,speed,(this.actions[12+i]||0)*this.actuation.targetVelocity*Math.PI/180,(this.actions[24+i]||0)*this.actuation.residualTorque);this.activeTorques[i]=torque;this.torqueLoad+=(torque/m.torque)**2*dt/this.motors.length;if(torque){m.bodyB.applyTorque(torque*this.facing,true);m.bodyA.applyTorque(-torque*this.facing,true);}work+=Math.abs(torque*speed)*dt;}return work;}
  configureContinuousCollision(dt){
    // Keep the original physical time steps and constraint iterations. Only skip
    // expensive swept collision searches when every body's conservative travel
    // bound is well below the thinnest robot fixture; fast impacts keep CCD.
    const needed=this.ccdMode==='always'||this.bodies.some(({body})=>{const v=body.getLinearVelocity();return (Math.abs(v.x)+Math.abs(v.y)+.5*Math.abs(body.getAngularVelocity()))*dt>.012;});
    if(needed!==this.ccdEnabled){this.world.setContinuousPhysics(needed);this.ccdEnabled=needed;}return needed;
  }
  applyScheduledCommands(){while(this.nextCommand<this.commandSchedule.length&&this.time>=this.commandSchedule[this.nextCommand].time)this.setCommand(this.commandSchedule[this.nextCommand++].command);}
  step(weights=Array(POLICY_SIZE).fill(0),report=true,actions=null){
    this.applyScheduledCommands();
    this.impactCost=0;if(this.rewardFeedback)this.rewardContactPoints=[];this.torqueLoad=0;const previousActions=[...this.actions];if(actions)this.actions=Array.from({length:36},(_,i)=>clamp(Number(actions[i])||0,-1,1));else this.control(weights);if(this.steps%this.controlStride===0)this.previousPolicyActions=previousActions;if(this.distalLocked)this.actions=this.actions.map((v,i)=>this.motors[i].locked?0:v);const previousTargets=this.motors.map(m=>m.target);let work=0;
    // Sample once per action interval, sharing the same measurements with policy and reward.
    if(this.steps%this.controlStride===0&&this.lastVisionStep!==this.steps)this.readVision();
    while(this.nextPushIndex<this.pushes.length&&this.time>=this.pushes[this.nextPushIndex].time){const p=this.pushes[this.nextPushIndex++];this.push(p.strength,p.direction,p.location,p.duration||0);this.impactEvents.at(-1).scheduledTime=p.time;this.pushesApplied++;this.lastPushAt=this.time;}
    // Smaller steps resolve loaded servos and fast motion; joint constraints enforce anatomical limits.
    const stressed=this.motors.some((m,i)=>Math.abs(m.joint.getJointSpeed())>4.5||Math.abs(jointTargetTorque(m,jointTargetAngle(this.actions[i],m.lower,m.upper),m.joint.getJointAngle(),m.joint.getJointSpeed(),(this.actions[12+i]||0)*this.actuation.targetVelocity*Math.PI/180,(this.actions[24+i]||0)*this.actuation.residualTorque))>m.torque*.1),substeps=isCombat(this.stage)?12:stressed?12:2;
    if(!this.externalPhysics)for(let i=0;i<substeps;i++){this.resistWaist();if(this.physicsPartner){this.physicsPartner.resistWaist();this.physicsPartner.torqueLoad??=0;this.physicsPartner.externalWork=(this.physicsPartner.externalWork||0)+this.physicsPartner.applyActuation(DT/substeps);this.physicsPartner.configureContinuousCollision(DT/substeps);}work+=this.applyActuation(DT/substeps);this.applyRecoveryAssist(DT/substeps);if(this.sustainedPush&&this.sustainedPush.remaining>0){this.sustainedPush.body.applyForce(this.sustainedPush.vector,this.sustainedPush.body.getWorldPoint(this.sustainedPush.localPoint),true);this.sustainedPush.remaining-=DT/substeps;}this.configureContinuousCollision(DT/substeps);this.world.step(DT/substeps,stressed?10:8,stressed?16:10);this.world.clearForces();}if(this.externalPhysics){work=this.externalWork||0;this.externalWork=0;}this.energy+=work;this.time+=DT;this.steps++;
    const commandChange=this.actions.reduce((sum,v,i)=>sum+(v-(previousActions[i]||0))**2*(i>=12?.15:0),0);
    const actionChange=commandChange+this.motors.reduce((sum,m,i)=>sum+((m.target-previousTargets[i])/DT)**2,0)*DT/this.motors.length;
    const pelvis=this.parts.pelvis,torso=this.parts.torso,pos=pelvis.getPosition(),velocity=pelvis.getLinearVelocity();
    const angle=wrap(torso.getAngle()),footDown=['leftFoot','rightFoot','leftToePart','rightToePart'].some(n=>(this.contacts.get(n)||0)>0);
    const relativeHeight=pos.y-this.groundHeight(pos.x);
    const goal=this.goalState(),posture=Math.max(0,Math.cos(angle)),quality=clamp((relativeHeight-(goal.low?.25:.3))/(goal.low?.37:.6),0,1)*posture*(footDown?1:.1),upright=relativeHeight>(goal.low?.42:.75)&&Math.abs(angle)<(goal.low?.8:.5)&&footDown;
    if(Math.abs(pos.x-this.initialX)>Math.abs(this.furthestX-this.initialX))this.furthestX=pos.x;
    const bodyDown=['head','torso','pelvis'].some(n=>(this.contacts.get(n)||0)>0),motion=motionQuality(relativeHeight,angle,footDown,bodyDown,goal.low);this.qualityTime+=motion*DT;
    if(this.time>.2)this.balanceLostTime=upright?0:this.balanceLostTime+DT;
    const low=relativeHeight<(goal.low?.3:.5)||Math.abs(angle)>1;let newFall=false,recovered=false;
    if(low){this.downTime+=DT;if(!this.isDown&&this.downTime>.15){this.isDown=true;this.falls++;newFall=true;}}else this.downTime=0;
    const recoveryStable=recoveryStanding({height:relativeHeight,angle,footDown,bodyDown,vx:velocity.x,vy:velocity.y,angularSpeed:torso.getAngularVelocity()});
    if(upright)this.uprightTime+=DT;
    if(this.stage==='recover'?recoveryStable:upright){this.stableTime+=DT;this.longestUpright=Math.max(this.longestUpright,this.stableTime);if(this.time-this.lastPushAt<REWARDS.pushWindow)this.pushRecoveryTime+=DT;}else this.stableTime=0;
    if(this.isDown&&(this.stage==='recover'?this.stableTime+DT/2>=RECOVERY_CRITERIA.settleSeconds:this.stableTime>.8)){this.isDown=false;this.recoveries++;recovered=true;}
    const walkSupport=walkingSupport({motionQuality:motion,down:this.isDown,newFall,bodyDown});this.finalUpright=(this.stage==='recover'?recoveryStable:upright)&&!this.isDown&&!bodyDown;this.stableStandingTime=this.stage==='recover'?this.stableTime:this.finalUpright?this.stableStandingTime+DT:0;
    this.recoveryUnassistedStable=this.stage==='recover'&&recoveryStable&&this.recoveryAssistForce<=1e-6?this.recoveryUnassistedStable+DT:0;
    if(this.stage==='walk'||this.stage==='run'){const dx=pos.x-this.lastX;this.supportedDistance+=dx>0?dx*walkSupport:dx;if(this.finalUpright&&Math.sign(goal.target)*velocity.x>=WALK_CRITERIA.minSpeed&&Math.abs(goal.target)>0)this.walkingTime+=DT;}
    let passed=0;for(const [i,o]of this.obstacles.entries())if(o.x>this.initialX+.3&&!this.passed.has(i)&&pos.x>o.x+o.width/2+REWARDS.obstacleClearance&&upright){this.passed.add(i);passed++;}
    const progressLimit=Math.max(.15,Math.abs(goal.target)*this.duration),anchor=this.command?this.commandAnchor:this.initialX,progressPotential=x=>clamp(Math.sign(goal.target)*(x-anchor),-progressLimit,progressLimit);
    const distal=distalActivity(this.motors,this.actions,previousActions,!!this.rewardFeedback);
    const terms=rewardBreakdown(this.stage,{dt:DT,recoveryPotential:recoveryPotential(relativeHeight,angle),recoveryPotentialProgress:recoveryPotential(relativeHeight,angle)-this.lastRecoveryPotential,recoveryLimitCost:this.stage==='recover'?recoveryLimitCost(this.motors,this.facing):0,recoveryStable,firstRecovery:this.recoveries===1,recoveryHeightProgress:clamp(relativeHeight,.15,.9)-clamp(this.lastRelativeHeight,.15,.9),upright,quality,motionQuality:motion,visionCoverage:this.lastVision?.coverage??0,distalMotion:distal.motion,distalChange:distal.change,torqueLoad:this.torqueLoad,actionChange,boundedProgress:progressPotential(pos.x)-progressPotential(this.lastX),heightProgress:relativeHeight-this.lastRelativeHeight,postureProgress:posture-this.lastPosture,speed:velocity.x,target:goal.target,angle,height:relativeHeight,distance:goal.distance,dx:pos.x-this.lastX,commanded:!!this.command,goalProgress:goal.positioned?Math.abs(this.lastGoalError??goal.error)-Math.abs(goal.error):0,goalError:goal.error,positioned:goal.positioned,lowPosture:goal.low,dy:pos.y-this.lastHeight,newFall,recovered,down:this.isDown,bodyDown,failedBalance:this.falls>0,afterPush:this.time-this.lastPushAt<REWARDS.pushWindow,impactCost:this.impactCost,work,passed});
    this.lastRecoveryPotential=recoveryPotential(relativeHeight,angle);
    if(this.stage==='balance'&&newFall)terms.forfeiture=-Math.max(0,this.reward);
    const numerical=![pos.x,pos.y,velocity.x,...Object.values(terms)].every(Number.isFinite);
    for(const key in terms){const value=terms[key];if(Number.isFinite(value)){this.reward+=value;this.rewardTerms[key]=(this.rewardTerms[key]||0)+value;}}
    this.terminationReason=numerical?'numerical':pos.x< -62||pos.x>94||pos.y<-.8?'bounds':this.steps>=Math.round(this.duration/DT)?'duration':this.endOnFall&&this.balanceLostTime>.2?'fall':recoveryEarlyStopReady({enabled:this.endOnRecovery,recoveries:this.recoveries,finalUpright:this.finalUpright,stableTime:this.stableTime,unassistedTime:this.recoveryUnassistedStable})?'recovered':null;
    if(this.terminationReason==='fall'){const penalty=-REWARDS.remainingFailure*Math.max(0,this.duration-this.time)-(this.falls===0?REWARDS.balanceFall+Math.max(0,this.reward):0);this.reward+=penalty;this.rewardTerms.failure=(this.rewardTerms.failure||0)+penalty;terms.failure=penalty;}
    else if(this.terminationReason&&!['duration','recovered'].includes(this.terminationReason)){const penalty=Math.min(0,-20-8*this.duration-this.reward);this.reward+=penalty;this.rewardTerms.failure=(this.rewardTerms.failure||0)+penalty;terms.failure=penalty;}
    for(const value of Object.values(terms))if(Number.isFinite(value)){if(value>0)this.positiveRewardTotal+=value;else this.negativeRewardTotal-=value;}
    this.lastRelativeHeight=relativeHeight;this.lastPosture=posture;this.lastX=pos.x;this.lastHeight=pos.y;this.lastGoalError=goal.error;
    this.done=!!this.terminationReason;
    if(this.rewardFeedback)this.rewardFeedback.collect(this.time,terms,term=>rewardLocations(this,term,distal),this.done||newFall||recovered||passed>0||this.impactCost>0);
    return report?this.metrics():undefined;
  }
  metrics(){const p=this.parts.pelvis.getPosition(),goal=this.goalState();return {mass:this.totalMass,nominalMass:ROBOT_MASS,bodyVersion:ROBOT_BODY_VERSION,gravity:STANDARD_GRAVITY,task:this.stage,recoveryEarlyStop:this.endOnRecovery,recoveryUnassistedStable:this.recoveryUnassistedStable,recoveryAssistLocation:this.recoveryAssistLocation,recoveryAssistLimit:this.recoveryAssistLimit,recoveryAssistSeconds:this.recoveryAssistSeconds,recoveryAssistUsedSeconds:this.recoveryAssistWindow,recoveryAssistBaseForce:this.recoveryAssistBaseForce,recoveryAssistTimeAutoReduce:this.recoveryAssistTimeAutoReduce,recoveryAssistForce:this.recoveryAssistForce,recoveryAssistMaxUsed:this.recoveryAssistMaxUsed,recoveryAssistImpulse:this.recoveryAssistImpulse,recoveryAssistAutoReduce:this.recoveryAssistAutoReduce,recoveryStart:this.recoveryStart?.kind??null,trainingSpec:this.trainingSpec,forwardContact:this.forwardContact?{...this.forwardContact}:null,walkingTime:this.walkingTime,supportedDistance:this.supportedDistance,finalUpright:this.finalUpright,stableTime:this.stableStandingTime,motionQuality:this.qualityTime/Math.max(this.time,DT),longestUpright:this.longestUpright,plannedDuration:this.duration,terminationReason:this.terminationReason,time:this.time,reward:this.reward,rewardTerms:{...this.rewardTerms},positiveRewardTotal:this.positiveRewardTotal,negativeRewardTotal:this.negativeRewardTotal,furthestX:this.furthestX,furthestDistance:this.furthestX-this.initialX,distance:p.x-this.initialX,speed:(p.x-this.initialX)/Math.max(this.time,DT),height:p.y-this.groundHeight(p.x),falls:this.falls,recoveries:this.recoveries,passed:this.passed.size,upright:this.uprightTime/Math.max(this.time,DT),energy:this.energy,pushes:this.pushesApplied,pushResistance:this.pushRecoveryTime,done:!!this.done,recovering:this.isDown,targetSpeed:goal.target,goalDistance:goal.error,command:this.command?{...this.command}:null};}
  snapshot(){return {time:this.time,...(this.rewardFeedback?{rewardEvents:this.rewardFeedback.snapshot()}:{}),hits:this.impactEvents.filter(h=>this.time-h.time<.7).map(h=>({...h,point:[...h.point]})),parts:this.bodies.map(p=>{const v=p.body.getPosition();return [v.x,v.y,p.body.getAngle()]}),metrics:this.metrics()};}
}
export function robotGeometry(sim){
 return {parts:sim.bodies.map(({name,w,h,circle,color})=>({name,w,h,circle,color,attachments:name.endsWith('Forearm')?[{name:name.replace('Forearm','Hand'),x:0,y:-.2,w:.09,h:.13}]:name.endsWith('Foot')?[{name:name.replace('Foot','ToePart'),x:.165,y:-.015,w:.08,h:.07}]:[]})),joints:sim.motors.map(m=>({name:m.name,a:sim.bodies.findIndex(p=>p.body===m.joint.getBodyA()),b:sim.bodies.findIndex(p=>p.body===m.joint.getBodyB()),anchor:[m.joint.getLocalAnchorA().x,m.joint.getLocalAnchorA().y]}))};
}
// Two articulated bodies share one solver; neither actor receives scripted poses.
export class CombatWorld extends RobotWorld{
 constructor(stage='fight',options={}){
  super(stage,{...options,spawnX:options.spawnX??-.85,disturbances:false,pushes:[],ccdMode:'always',collisionGroup:-1});
  this.combatOptions=combatSettings(options);this.combatState=freshFighter();this.rivalState=freshFighter();this.avoided=0;this.threats=new Map();this.combatHits=[];this.hitTimes=new Map();this.approaches=new WeakMap();this.decision={done:false,winner:null,reason:null};
  this.drill=['punch','kick'].includes(stage)?'bag':stage==='defend'?'limited':'selfplay';
  this.opponentWeights=options.opponentWeights||null;
  if(this.drill==='bag'||this.drill==='limited'){
   const glove=stage==='defend',x=.05,y=this.groundHeight(x)+1.2,anchor=this.world.createBody();
   const body=this.world.createDynamicBody({position:Vec2(x,y),gravityScale:glove?0:1,linearDamping:glove?0:.15,angularDamping:.3,bullet:true,userData:glove?'trainingGlove':'combatBag'});
   body.createFixture(glove?Circle(.14):Box(.22,.48),{density:glove?50:12,friction:.45,restitution:.08,filterGroupIndex:-2});
   if(!glove)this.world.createJoint(DistanceJoint({length:1.55,frequencyHz:0,dampingRatio:.05},anchor,body,Vec2(x,y+2.03),Vec2(x,y+.48)));
   this.bag={body,anchor:[x,y+2.03],radius:glove?.14:.22,height:glove?.28:.96,glove};this.combatOpponent=this.bag;this.nextBagSwing=.4;
   if(glove)body.setPosition(Vec2(4,y));

  }else{
   const floor=this.world.getBodyList();let ground=floor;for(let b=floor;b;b=b.getNext())if(b.getUserData()==='ground'){ground=b;break;}
   this.opponent=new RobotWorld(stage,{...options,terrain:'meadow',trainingSpec:null,sharedWorld:this.world,sharedFloor:ground,spawnX:.85,facing:-1,collisionGroup:-2,externalPhysics:true,disturbances:false,pushes:[],ccdMode:'always',seed:(options.seed??31)+101});
   this.physicsPartner=this.opponent;this.combatOpponent=this.opponent;this.opponent.combatOpponent=this;this.opponent.combatState=this.rivalState;this.opponent.opponentState=this.combatState;
  }
  this.opponentState=this.rivalState;
  this.world.on('pre-solve',contact=>{const wm=contact.getWorldManifold();if(!wm?.pointCount)return;const a=contact.getFixtureA().getBody(),b=contact.getFixtureB().getBody();if(!this.isCrossContact(a,b))return;let closing=0;for(let i=0;i<wm.pointCount;i++){const va=a.getLinearVelocityFromWorldPoint(wm.points[i]),vb=b.getLinearVelocityFromWorldPoint(wm.points[i]);closing=Math.max(closing,-((vb.x-va.x)*wm.normal.x+(vb.y-va.y)*wm.normal.y));}this.approaches.set(contact,{closing,point:[wm.points[0].x,wm.points[0].y]});});
  this.world.on('post-solve',(contact,impulse)=>{const a=contact.getFixtureA().getBody(),b=contact.getFixtureB().getBody();if(!this.isCrossContact(a,b))return;const approach=this.approaches.get(contact);if(!approach)return;const total=Array.from(impulse.normalImpulses||[]).reduce((sum,n)=>sum+Math.max(0,n||0),0);this.registerStrike(a,b,total,approach);this.registerStrike(b,a,total,approach);});
 }
 isCrossContact(a,b){return a.robotOwner&&b.robotOwner&&a.robotOwner!==b.robotOwner||this.bag&&(a===this.bag.body&&b.robotOwner||b===this.bag.body&&a.robotOwner);}
 registerStrike(attacker,target,impulse,approach){
  const owner=attacker.robotOwner,isBag=this.bag?.body===attacker,targetBag=this.bag?.body===target;if(!owner&&!isBag)return;
  const name=attacker.getUserData(),kind=isBag?(this.bag.glove?'punch':'bag'):name.endsWith('Forearm')?'punch':name.endsWith('Foot')?'kick':null;if(!kind)return;
  if(!isBag&&kind==='punch'&&attacker.getLocalPoint(Vec2(...approach.point)).y>-.08)return;
  const attackerIndex=owner===this||targetBag?0:1,targetIndex=targetBag?1:target.robotOwner===this?0:1;if(attackerIndex===targetIndex&&!targetBag&&!isBag)return;
  const targetName=targetBag?'torso':target.getUserData(),damage=impactDamage({impulse,closing:approach.closing,target:targetName}),key=attackerIndex+':'+name+':'+targetIndex;
  if(!damage||this.time-(this.hitTimes.get(key)??-Infinity)<COMBAT_RULES.contactCooldown)return;this.hitTimes.set(key,this.time);
  const states=[this.combatState,this.rivalState],source=states[attackerIndex],dest=states[targetIndex];if(!targetBag){dest.health=Math.max(0,dest.health-damage);dest.damageTaken+=damage;}source.damageDealt+=damage;source.hits++;if(kind==='punch')source.punches++;if(kind==='kick')source.kicks++;
  const guard=/Arm|Forearm|Foot|Shin/.test(targetName);if(guard)dest.blocks++;
  const event={id:this.combatHits.length?this.combatHits.at(-1).id+1:1,time:this.time,point:approach.point,damage,impulse,speed:approach.closing,kind,attacker:attackerIndex,target:targetIndex,blocked:guard};this.combatHits.push(event);if(this.combatHits.length>20)this.combatHits.shift();
  const matching=this.stage==='fight'||this.stage===kind;
  if(attackerIndex===0)this.addCombatReward(matching?damage*2:-damage*.15,'strike');else if(this.opponent)this.addCombatReward(damage*2,'strike',this.opponent);
  if(targetIndex===0&&!targetBag)this.addCombatReward(-damage*(this.stage==='defend'?(guard?.5:2):1.5),'damage');else if(!targetBag&&this.opponent)this.addCombatReward(-damage*1.5,'damage',this.opponent);
  if(guard&&targetIndex===0)this.addCombatReward(Math.min(3,impulse*.1),'block');
 }
 addCombatReward(value,key,actor=this){if(!Number.isFinite(value))return;actor.reward+=value;actor.rewardTerms[key]=(actor.rewardTerms[key]||0)+value;if(value>0)actor.positiveRewardTotal+=value;else actor.negativeRewardTotal-=value;if(actor.rewardFeedback)actor.rewardFeedback.collect(this.time,{[key]:value},()=>[{body:'torso',point:[actor.parts.torso.getPosition().x,actor.parts.torso.getPosition().y],weight:1}],true);}
 step(weights=Array(POLICY_SIZE).fill(0),report=true,actions=null){
  if(this.done)return report?this.metrics():undefined;const other=this.opponent,previous=other?.actions;
  if(other){other.control(this.opponentWeights||weights);this.partnerActions=other.actions.map((a,i)=>this.drill==='sparring'?(i%12===10||i%12===11?0:i%12>=2&&i%12<=7?a*.5:a):a);other.actions=this.partnerActions;other.torqueLoad=0;}
  if(this.bag?.glove){
   const body=this.bag.body;
   if(this.gloveEnds&&this.time>=this.gloveEnds){body.setLinearVelocity(Vec2(0,0));body.setPosition(Vec2(50,5));this.gloveEnds=0;this.threats.clear();}
   if(this.time>=this.nextBagSwing){
    const target=this.parts[this.random()<.5?'head':'torso'].getPosition(),side=this.random()<.5?-1:1,speed=1.5+this.random()*5.5;
    const start=Vec2(target.x+side*1.5,target.y+(this.random()-.5)*.18),dx=target.x-start.x,dy=target.y-start.y,distance=Math.hypot(dx,dy);
    body.setPosition(start);body.setLinearVelocity(Vec2(dx/distance*speed,dy/distance*speed));body.setAngularVelocity(0);this.bag.direction=-side;
    this.gloveEnds=this.time+3.1/speed;this.nextBagSwing=this.gloveEnds+.6+this.random()*1.2;this.threats.clear();
   }
  }
  const oldDistance=this.targetDistance(),before=this.reward;super.step(weights,false,actions);
  if(other){other.actions=previous;other.step(this.opponentWeights||weights,false,this.partnerActions);}
  const states=[this.combatState,this.rivalState],robots=[this,other];for(let i=0;i<robots.length;i++){const w=robots[i];if(!w)continue;updateDownState(states[i],{dt:DT,bodyDown:['head','torso','pelvis'].some(n=>(w.contacts.get(n)||0)>0),height:w.parts.pelvis.getPosition().y-w.groundHeight(w.parts.pelvis.getPosition().x),standing:Math.abs(w.parts.torso.getAngle())<.5&&w.parts.pelvis.getPosition().y-w.groundHeight(w.parts.pelvis.getPosition().x)>.75&&['leftFoot','rightFoot'].some(n=>(w.contacts.get(n)||0)>0)&&!['torso','pelvis','head'].some(n=>(w.contacts.get(n)||0)>0)});}
  // Distance potential rewards approach, never indefinite standing or raw limb speed.
  if(this.stage!=='defend')this.addCombatReward((Math.max(0,oldDistance-.5)-Math.max(0,this.targetDistance()-.5))*1.5,'range');
  this.trackThreats();
  if(this.stage==='defend'&&this.finalUpright)this.addCombatReward(DT*.25,'avoidance');
  this.decision=this.bag?{done:this.time+DT/2>=this.duration||this.combatState.health<=0||this.combatState.count>=10,winner:this.combatState.health<=0||this.combatState.count>=10?'right':null,reason:this.combatState.health<=0?'health':this.combatState.count>=10?'count':'duration'}:matchVerdict(states,this.time,this.duration);
  if(this.decision.done){this.done=true;this.terminationReason=this.decision.reason==='time'||this.decision.reason==='duration'?'duration':this.decision.reason;if(this.decision.winner)this.addCombatReward(this.decision.winner==='left'?20:this.decision.winner==='right'?-20:0,'outcome');}if(other)other.done=this.done;
  if(!Number.isFinite(this.reward-before)){this.done=true;this.terminationReason='numerical';}
  return report?this.metrics():undefined;
 }
 trackThreats(){const head=this.parts.head.getPosition(),velocity=this.parts.head.getLinearVelocity(),bodies=this.bag?[this.bag.body]:['leftForearm','rightForearm','leftFoot','rightFoot'].map(n=>this.opponent.parts[n]);for(let i=0;i<bodies.length;i++){const body=bodies[i],p=body.getPosition(),v=body.getLinearVelocity(),dx=head.x-p.x,dy=head.y-p.y,distance=Math.hypot(dx,dy),closing=((v.x-velocity.x)*dx+(v.y-velocity.y)*dy)/Math.max(.01,distance);let threat=this.threats.get(i);if(!threat&&distance<.9&&closing>1.2){threat={start:this.time,minimum:distance,damage:this.combatState.damageTaken,head:[head.x,head.y],blocks:this.combatState.blocks};this.threats.set(i,threat);}if(!threat)continue;threat.minimum=Math.min(threat.minimum,distance);if(closing<0&&distance>threat.minimum+.2&&this.time-threat.start>.1){if(this.combatState.damageTaken===threat.damage&&this.combatState.blocks===threat.blocks&&this.finalUpright&&Math.hypot(head.x-threat.head[0],head.y-threat.head[1])>.08){this.avoided++;if(this.stage==='defend'||this.stage==='fight')this.addCombatReward(1,'evade');}this.threats.delete(i);}else if(this.time-threat.start>1.5)this.threats.delete(i);}}
 targetDistance(){const p=this.parts.pelvis.getPosition(),q=this.opponent?.parts.pelvis.getPosition()||this.bag?.body.getPosition();return q?Math.hypot(q.x-p.x,q.y-p.y):0;}
 metrics(){const m=super.metrics();if(!this.combatState)return m;return {...m,combat:{fighters:[{...this.combatState},{...this.rivalState}],drill:this.drill,winner:this.decision?.winner||null,reason:this.decision?.reason||null,remaining:Math.max(0,this.duration-this.time),avoided:this.avoided,countSeconds:2}};}
 snapshot(){const frame=super.snapshot();return {...frame,facing:1,opponent:this.opponent?{...this.opponent.snapshot(),facing:-1}:null,bag:this.bag?{position:[this.bag.body.getPosition().x,this.bag.body.getPosition().y],angle:this.bag.body.getAngle(),anchor:[...this.bag.anchor],radius:this.bag.radius,height:this.bag.height,glove:this.bag.glove,direction:this.bag.direction||-1}:null,combatHits:this.combatHits.filter(e=>this.time-e.time<.4)};}
}

export const createRobotWorld=(stage='balance',options={})=>isCombat(stage)?new CombatWorld(stage,options):new RobotWorld(stage,options);
export function episode(weights,stage='balance',seed=1,options={}){
  const sim=createRobotWorld(stage,{...(stage==='balance'?{command:{mode:'hold'}}:{}),seed,...options}),trace=[];
  while(!sim.done){sim.step(weights,false);if(options.record&&sim.steps%2===0)trace.push(sim.snapshot());}
  if(options.record&&trace.at(-1)?.time!==sim.time)trace.push(sim.snapshot());return {task:sim.stage,metrics:sim.metrics(),pushPlan:sim.pushes.map(p=>({...p})),commandSchedule:sim.commandSchedule.map(p=>structuredClone(p)),trace,...(options.summaryOnly?{}:robotGeometry(sim)),obstacles:sim.obstacles,terrain:sim.terrain};
}
export function passedStage(metrics,stage,requiredDuration=STAGES[stage].duration){
  if(isCombat(stage)){const c=metrics.combat?.fighters?.[0];if(!c||!metrics.done)return false;return metrics.upright>.4&&(stage==='defend'?c.health>=90&&(c.blocks>0||metrics.combat.avoided>0):stage==='punch'?c.punches>=1:stage==='kick'?c.kicks>=1:metrics.combat.winner==='left'||c.damageDealt>c.damageTaken+2);}
  if(metrics.terminationReason!=='duration'||!metrics.done||metrics.time+DT/2<requiredDuration)return false;
  if(stage==='balance')return metrics.upright>.95&&metrics.falls===0&&Math.abs(metrics.distance)<1&&metrics.height>.75;
  if(stage==='recover')return metrics.recoveries>=1&&metrics.height>RECOVERY_CRITERIA.height&&metrics.finalUpright===true&&!metrics.recovering&&metrics.stableTime+DT/2>=RECOVERY_CRITERIA.settleSeconds;
  if(stage==='walk'){const c=WALK_CRITERIA;return metrics.distance>=c.speed*requiredDuration*c.distanceRatio&&metrics.supportedDistance>=c.speed*requiredDuration*c.supportedRatio&&metrics.upright>=c.uprightRatio&&metrics.walkingTime+DT/2>=requiredDuration*c.movingRatio&&metrics.falls===0&&metrics.finalUpright===true&&!metrics.recovering&&metrics.stableTime+DT/2>=Math.min(c.settleSeconds,requiredDuration/3);}
  if(stage==='run')return metrics.distance>=1.4*requiredDuration*.5&&metrics.supportedDistance>=1.4*requiredDuration*.35&&metrics.walkingTime>=requiredDuration*.45&&metrics.upright>=.7&&metrics.falls===0&&metrics.finalUpright===true;

  return false;
}

export const VALIDATION_CASES = [
 {id:'still',label:'정지',seed:31,pushes:[]},
 {id:'light',label:'앞뒤 2 N·s',seed:1000,pushes:[{time:2,strength:2,direction:0,location:'torso'},{time:5,strength:2,direction:180,location:'torso'}]},
 {id:'medium',label:'어깨·골반 4 N·s',seed:2047,pushes:[{time:2,strength:4,direction:180,location:'shoulder'},{time:5,strength:4,direction:0,location:'pelvis'}]},
 {id:'strong',label:'앞뒤 6 N·s',seed:4093,pushes:[{time:1.8,strength:6,direction:0,location:'shoulder'},{time:4.8,strength:6,direction:180,location:'torso'}]},
];
export function evaluateAbility(weights,stage,environment={},validationCases=VALIDATION_CASES){
 environment=taskEnvironment(environment,stage);
 const cases=validationCases.map((c,i)=>{const metrics=episode(weights,stage,c.seed,{...environment,...(stage==='recover'?{recoveryEarlyStopTraining:false,recoveryAssistTraining:false,recoveryStart:recoveryTestStart(i,validationCases.length)}:{}),...(isCombat(stage)?{combatDrill:stage==='fight'?'selfplay':stage==='defend'?'limited':'bag',opponentWeights:Array(POLICY_SIZE).fill(0)}:{}),...(environment.terrain==='training'?{trainingSpec:validationGround(c,i)}:{}),observationSeconds:c.seconds??normalizeEvaluationSettings(environment).validationSeconds,pushes:c.pushes,disturbances:false,summaryOnly:true}).metrics;return {id:c.id,label:c.label,passed:passedStage(metrics,stage,c.seconds??normalizeEvaluationSettings(environment).validationSeconds),reward:metrics.reward,metrics};});
 return {meanReward:cases.reduce((s,c)=>s+c.reward,0)/cases.length,passRate:cases.filter(c=>c.passed).length/cases.length,cases};
}
export function evaluateAbilities(weights,environment={}){return Object.fromEntries(Object.keys(STAGES).map(stage=>[stage,evaluateAbility(weights,stage,environment)]));}

export function evaluateCommands(weights,environment={}){environment=taskEnvironment(environment,'walk');return COMMAND_CASES.reduce((total,c)=>total+episode(weights,'walk',71,{...environment,observationSeconds:normalizeEvaluationSettings(environment).validationSeconds,disturbances:false,pushes:[],command:null,commandSchedule:c.schedule,summaryOnly:true}).metrics.reward,0)/COMMAND_CASES.length;}

// Monitoring only: never used to select the integrated model.
export const MONITOR_CASES=monitorCases();
