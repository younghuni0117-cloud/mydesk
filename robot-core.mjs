import {makeTerrain,terrainHeight,rockVertices} from './robot-terrain.mjs?v=robot22';
import { World, Vec2, Box, Circle, Polygon, RevoluteJoint } from './vendor/planck.mjs';
import {normalizeCommand,commandState,COMMAND_CASES} from './robot-goals.mjs?v=robot22';
export const DT = 1 / 60;
import {POLICY_SIZE,policyActions} from './robot-policy.mjs?v=robot22';
import {REWARDS,rewardBreakdown} from './robot-rewards.mjs?v=robot22';
export {POLICY_SIZE} from './robot-policy.mjs?v=robot22';
export const STAGES = {
  balance: { label: '균형 잡기', speed: 0, duration: 8 },
  recover: { label: '넘어졌다 일어서기', speed: 0, duration: 10 },
  walk: { label: '앞으로 걷기', speed: .55, duration: 10 },
  run: { label: '빠르게 달리기', speed: 1.4, duration: 10 },
  obstacles: { label: '장애물 통과', speed: .65, duration: 12 },
};
export const JOINTS = ['waist','neck','leftHip','leftKnee','leftAnkle','leftToe','rightHip','rightKnee','rightAnkle','rightToe','leftShoulder','leftElbow','leftWrist','rightShoulder','rightElbow','rightWrist'];
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function normalizePushSettings(raw={}){const low=Number(raw?.pushMin),high=Number(raw?.pushMax),valid=Number.isFinite(low)&&Number.isFinite(high)&&low>=.1&&high<=30&&low<=high;return {autoPush:raw?.autoPush!==false,pushMin:valid?low:1,pushMax:valid?high:6};}
export const WAIST_RESISTANCE=Object.freeze({stiffness:55,damping:9,maxTorque:110});
export function seeded(seed) { return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; }
const wrap = a => Math.atan2(Math.sin(a),Math.cos(a));
export class RobotWorld {
  constructor(stage='balance', options={}) {
    this.stage = STAGES[stage] ? stage : 'balance'; this.task=STAGES[this.stage];
    this.duration=Number.isInteger(options.observationSeconds)&&options.observationSeconds>=1&&options.observationSeconds<=3600?options.observationSeconds:this.task.duration;
    this.seed=options.seed??1;this.random=seeded(this.seed);this.time=0;this.reward=0;this.energy=0;this.steps=0;
    this.falls=0;this.recoveries=0;this.uprightTime=0;this.stableTime=0;this.isDown=false;this.downTime=0;this.impactCost=0;this.passed=new Set();this.contacts=new Map();
    this.world=new World(Vec2(0,-9.81));this.world.setAutoClearForces(false);this.bodies=[];this.parts={};this.joints={};this.motors=[];
    this.terrain=makeTerrain(options.terrain);this.terrainSegments=this.terrain.segments;this.groundHeight=x=>terrainHeight(this.terrainSegments,x);
    const floor=this.world.createBody({userData:'ground'});floor.createFixture(Box(500,.15,Vec2(0,-.15)),{friction:options.friction??this.terrain.friction});
    for(const s of this.terrainSegments)if(s.y0>0||s.y1>0){const body=this.world.createBody({userData:'ground'});body.createFixture(Polygon([Vec2(s.x0,-.2),Vec2(s.x1,-.2),Vec2(s.x1,s.y1),Vec2(s.x0,s.y0)]),{friction:s.friction??this.terrain.friction});}
    for(const s of this.terrain.ceilings||[]){const body=this.world.createBody({userData:'obstacle'});body.createFixture(Polygon([Vec2(s.x0,s.y0),Vec2(s.x1,s.y1),Vec2(s.x1,Math.max(s.y0,s.y1)+6),Vec2(s.x0,Math.max(s.y0,s.y1)+6)]),{friction:.85});}
    this.obstacles=[...this.terrain.obstacles];

    for(const o of this.obstacles){const body=this.world.createBody({position:Vec2(o.x,(o.bottom??this.groundHeight(o.x))+o.height/2),userData:'obstacle'});body.createFixture(['rock','stalactite'].includes(o.shape)?Polygon(rockVertices(o).map(p=>Vec2(...p))):o.shape==='pipe'?Circle(o.height/2):Box(o.width/2,o.height/2),{friction:.8,filterMaskBits:o.side==='left'?3:o.side==='right'?5:0xffff});}
    const lying=this.stage==='recover' && options.startStanding!==true;
    this.spawnAngle=lying?(this.random()<.5?Math.PI/2:-Math.PI/2):(this.random()-.5)*(options.spawnRange??.025);
    this.spawnY=(lying?.34:1.03)+this.groundHeight(0);
    this.makeRobot();this.motors.sort((a,b)=>JOINTS.indexOf(a.name)-JOINTS.indexOf(b.name));this.initialX=this.parts.pelvis.getPosition().x;this.lastX=this.initialX;this.lastHeight=this.parts.pelvis.getPosition().y;
    this.lastRelativeHeight=this.parts.pelvis.getPosition().y-this.groundHeight(this.parts.pelvis.getPosition().x);this.lastPosture=Math.max(0,Math.cos(this.parts.torso.getAngle()));this.command=null;this.commandAnchor=this.initialX;this.commandSchedule=(options.commandSchedule||[]).map(s=>({time:s.time,command:normalizeCommand(s.command)}));this.nextCommand=0;if(options.command)this.setCommand(options.command);
    this.actions=Array(JOINTS.length).fill(0);this.activeTorques=Array(JOINTS.length).fill(0);this.rewardTerms={};if(lying)this.isDown=true;
    this.pushes = options.pushes ? options.pushes.map(p=>({...p})) : [];
    const pushSettings=normalizePushSettings(options);
    if(options.disturbances!==false&&pushSettings.autoPush&&!options.pushes){
      this.pushes.push({time:.9+this.random()*Math.max(.1,this.duration-2.4),strength:pushSettings.pushMin+this.random()*(pushSettings.pushMax-pushSettings.pushMin),direction:this.random()*360,location:['torso','shoulder','pelvis'][Math.floor(this.random()*3)],duration:0});
    }
    this.nextPushIndex=0;this.pushesApplied=0;this.pushRecoveryTime=0;this.lastPushAt=-Infinity;this.obstacleHeight=options.obstacleHeight??.14;
    const contact=(contact,amount)=>{
      const a=contact.getFixtureA().getBody().getUserData(),b=contact.getFixtureB().getBody().getUserData();
      const name=a==='ground'||a==='obstacle'?b:b==='ground'||b==='obstacle'?a:null;
      if(typeof name==='string')this.contacts.set(name,Math.max(0,(this.contacts.get(name)||0)+amount));
    };
    this.world.on('begin-contact',c=>contact(c,1));this.world.on('end-contact',c=>contact(c,-1));
    const impactTimes=new WeakMap();
    this.world.on('pre-solve',(contact,old)=>{
      const a=contact.getFixtureA().getBody(),b=contact.getFixtureB().getBody(),an=a.getUserData(),bn=b.getUserData();
      if(![an,bn].some(n=>n==='ground'||n==='obstacle')||![an,bn].some(n=>['head','torso','pelvis'].includes(n)))return;
      // A resting contact carries weight every solver step; it is not a collision.
      if(old.pointCount>0||this.time-(impactTimes.get(contact)??-Infinity)<.12)return;
      const wm=contact.getWorldManifold();if(!wm?.pointCount)return;let closing=0;
      for(let i=0;i<wm.pointCount;i++){const va=a.getLinearVelocityFromWorldPoint(wm.points[i]),vb=b.getLinearVelocityFromWorldPoint(wm.points[i]);closing=Math.max(closing,-((vb.x-va.x)*wm.normal.x+(vb.y-va.y)*wm.normal.y));}
      if(closing<=REWARDS.impactSpeed)return;const mass=a.getMass()||b.getMass();this.impactCost+=.5*mass*(closing*closing-REWARDS.impactSpeed**2);impactTimes.set(contact,this.time);
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
    const joint=this.world.createJoint(RevoluteJoint({enableLimit:true,lowerAngle:lower,upperAngle:upper,enableMotor:false,maxMotorTorque:torque,motorSpeed:0,collideConnected:false},a,b,this.transform(x,y)));
    this.joints[name]=joint;this.motors.push({name,joint,lower,upper,torque,bodyA:a,bodyB:b});
  }
  makeRobot(){
    const pelvis=this.part('pelvis',0,1.06,.3,.18,4,'#536d8c');
    const torso=this.part('torso',0,1.375,.32,.45,6,'#6788ac');
    const head=this.part('head',0,1.75,.13,.13,1,'#bdcbdc',true);
    this.joint('waist',pelvis,torso,0,1.15,-1.4,.9,95);this.joint('neck',torso,head,0,1.62,-1.05,1.05,8);
    for(const [side,color] of [['left','#8fa8c5'],['right','#d6a174']]){
      const thigh=this.part(side+'Thigh',0,.805,.11,.45,1.4,color);
      const shin=this.part(side+'Shin',0,.355,.085,.45,1,color);
      const foot=this.part(side+'Foot',.07,.08,.25,.1,.5,color);
      const toe=this.part(side+'ToePart',.235,.065,.08,.07,.15,color);
      this.joint(side+'Hip',pelvis,thigh,0,1.03,-.65,2.1,80);
      // Facing +X: knees flex backward (negative), elbows forward (positive).
      this.joint(side+'Knee',thigh,shin,0,.58,-2.6,0,80);
      this.joint(side+'Ankle',shin,foot,0,.13,-1.1,1.1,45);
      this.joint(side+'Toe',foot,toe,.195,.07,-.35,1.05,12);
      const sx=0; // Both shoulders project onto the same side-view axis, like the hips.
      const upper=this.part(side+'UpperArm',sx,1.39,.085,.3,.7,color);
      const lower=this.part(side+'Forearm',sx,1.105,.073,.27,.5,color);
      const hand=this.part(side+'Hand',sx,.905,.09,.13,.2,color);
      this.joint(side+'Shoulder',torso,upper,sx,1.54,-1.05,3.05,25);
      this.joint(side+'Elbow',upper,lower,sx,1.24,0,2.6,20);
      this.joint(side+'Wrist',lower,hand,sx,.97,-1.2,1.2,8);
    }
  }
  push(strength=4,direction=0,location='torso',duration=0){
    const body=location==='shoulder'?this.parts.torso:this.parts[location]||this.parts.torso,angle=direction*Math.PI/180;
    const vector=Vec2(Math.cos(angle)*strength,Math.sin(angle)*strength);
    const point=location==='shoulder'?body.getWorldPoint(Vec2(.12,.2)):body.getWorldCenter();
    if(duration>0)this.sustainedPush={body,vector,localPoint:body.getLocalPoint(point),remaining:duration};
    else body.applyLinearImpulse(vector,point,true);
  }
  setCommand(raw){this.command=raw?normalizeCommand(raw):null;this.commandAnchor=this.parts.pelvis.getPosition().x;this.commandChanged=true;this.lastGoalError=this.goalState().error;}
  goalState(){return commandState(this.command,this.parts.pelvis.getPosition().x,this.command?this.commandAnchor:this.initialX,this.task.speed,true);}
  resistWaist(){const j=this.joints.waist,t=clamp(-WAIST_RESISTANCE.stiffness*j.getJointAngle()-WAIST_RESISTANCE.damping*j.getJointSpeed(),-WAIST_RESISTANCE.maxTorque,WAIST_RESISTANCE.maxTorque);j.getBodyB().applyTorque(t,true);j.getBodyA().applyTorque(-t,true);return t;}
  observations(){const torso=this.parts.torso,pelvis=this.parts.pelvis,p=pelvis.getPosition(),v=pelvis.getLinearVelocity(),a=torso.getAngle(),goal=this.goalState(),ahead=side=>{const x=this.parts[side+'Foot'].getPosition().x,ground=this.groundHeight(x);let top=Math.max(this.groundHeight(x+.2),this.groundHeight(x+.5));for(const o of this.obstacles)if(o.shape!=='stalactite'&&(o.side==='both'||o.side===side)&&o.x+o.width/2>x&&o.x-o.width/2<x+.6)top=Math.max(top,(o.bottom??this.groundHeight(o.x))+o.height);return clamp((top-ground)/.6,-1,1);};
   return [Math.sin(a),Math.cos(a),clamp(torso.getAngularVelocity()/8,-1,1),clamp((p.y-this.groundHeight(p.x))/1.2,-1,1),clamp(v.x/3,-1,1),clamp(v.y/3,-1,1),goal.target/2,((this.contacts.get('leftFoot')||0)+(this.contacts.get('leftToePart')||0))>0?1:0,((this.contacts.get('rightFoot')||0)+(this.contacts.get('rightToePart')||0))>0?1:0,ahead('left'),ahead('right'),this.terrain.ceilings.length?clamp((terrainHeight(this.terrain.ceilings,p.x)-p.y)/3,-1,1):1,...this.motors.map(m=>m.joint.getJointAngle()/Math.PI),...this.motors.map(m=>clamp(m.joint.getJointSpeed()/8,-1,1)),clamp(goal.error/5,-1,1),goal.positioned?1:0,goal.low?1:0];
  }
  control(weights){
   if(this.policyWeights!==weights){this.policyWeights=weights;this.zeroPolicy=weights.every(v=>v===0);}
   if(this.steps%3===0||this.commandChanged)this.actions=this.zeroPolicy?Array(JOINTS.length).fill(0):policyActions(weights,this.observations());this.commandChanged=false;
  }
  applyActuation(dt){let work=0;for(let i=0;i<this.motors.length;i++){const m=this.motors[i];m.joint.enableMotor(false);let torque=this.actions[i]*m.torque;const angle=m.joint.getJointAngle(),speed=m.joint.getJointSpeed();torque*=torque>0?clamp((m.upper-angle)/.12,0,1):clamp((angle-m.lower)/.12,0,1);torque*=clamp(1-Math.sign(torque)*speed/9,0,1);this.activeTorques[i]=torque;if(torque){m.bodyB.applyTorque(torque,true);m.bodyA.applyTorque(-torque,true);}work+=Math.abs(torque*speed)*dt;}return work;}
  applyScheduledCommands(){while(this.nextCommand<this.commandSchedule.length&&this.time>=this.commandSchedule[this.nextCommand].time)this.setCommand(this.commandSchedule[this.nextCommand++].command);}
  step(weights=Array(POLICY_SIZE).fill(0),report=true,actions=null){
    this.applyScheduledCommands();
    this.impactCost=0;if(actions)this.actions=actions;else this.control(weights);let work=0;
    while(this.nextPushIndex<this.pushes.length&&this.time>=this.pushes[this.nextPushIndex].time){const p=this.pushes[this.nextPushIndex++];this.push(p.strength,p.direction,p.location,p.duration||0);this.pushesApplied++;this.lastPushAt=this.time;}
    // Smaller physical steps keep stiff joints stable under freely explored torques.
    const substeps=this.actions.some(a=>Math.abs(a)>.1)||this.motors.some(m=>Math.abs(m.joint.getJointSpeed())>4.5)?8:2;
    for(let i=0;i<substeps;i++){this.resistWaist();work+=this.applyActuation(DT/substeps);if(this.sustainedPush&&this.sustainedPush.remaining>0){this.sustainedPush.body.applyForce(this.sustainedPush.vector,this.sustainedPush.body.getWorldPoint(this.sustainedPush.localPoint),true);this.sustainedPush.remaining-=DT/substeps;}this.world.step(DT/substeps,8,6);this.world.clearForces();}this.energy+=work;this.time+=DT;this.steps++;
    const pelvis=this.parts.pelvis,torso=this.parts.torso,pos=pelvis.getPosition(),velocity=pelvis.getLinearVelocity();
    const angle=wrap(torso.getAngle()),footDown=['leftFoot','rightFoot','leftToePart','rightToePart'].some(n=>(this.contacts.get(n)||0)>0);
    const relativeHeight=pos.y-this.groundHeight(pos.x);
    const goal=this.goalState(),posture=Math.max(0,Math.cos(angle)),quality=clamp((relativeHeight-(goal.low?.25:.3))/(goal.low?.37:.6),0,1)*posture*(footDown?1:.1),upright=relativeHeight>(goal.low?.42:.75)&&Math.abs(angle)<(goal.low?.8:.5)&&footDown;
    const low=relativeHeight<(goal.low?.3:.5)||Math.abs(angle)>1;let newFall=false,recovered=false;
    if(low){this.downTime+=DT;if(!this.isDown&&this.downTime>.15){this.isDown=true;this.falls++;newFall=true;}}else this.downTime=0;
    if(upright){this.uprightTime+=DT;this.stableTime+=DT;if(this.time-this.lastPushAt<REWARDS.pushWindow)this.pushRecoveryTime+=DT;}else this.stableTime=0;
    if(this.isDown&&this.stableTime>.8){this.isDown=false;this.recoveries++;recovered=true;}
    let passed=0;for(const [i,o]of this.obstacles.entries())if(o.x>this.initialX+.3&&!this.passed.has(i)&&pos.x>o.x+o.width/2+REWARDS.obstacleClearance&&upright){this.passed.add(i);passed++;}
    const terms=rewardBreakdown(this.stage,{dt:DT,upright,quality,heightProgress:relativeHeight-this.lastRelativeHeight,postureProgress:posture-this.lastPosture,speed:velocity.x,target:goal.target,angle,height:relativeHeight,distance:goal.distance,dx:pos.x-this.lastX,commanded:!!this.command,goalProgress:goal.positioned?Math.abs(this.lastGoalError??goal.error)-Math.abs(goal.error):0,goalError:goal.error,positioned:goal.positioned,lowPosture:goal.low,dy:pos.y-this.lastHeight,newFall,recovered,afterPush:this.time-this.lastPushAt<REWARDS.pushWindow,impactCost:this.impactCost,work,passed});
    for(const key in terms){const value=terms[key];this.reward+=value;this.rewardTerms[key]=(this.rewardTerms[key]||0)+value;}
    this.lastRelativeHeight=relativeHeight;this.lastPosture=posture;this.lastX=pos.x;this.lastHeight=pos.y;this.lastGoalError=goal.error;
    this.done=this.steps>=Math.round(this.duration/DT)||Math.abs(pos.x)>40||pos.y<-.8||!Number.isFinite(this.reward);
    return report?this.metrics():undefined;
  }
  metrics(){const p=this.parts.pelvis.getPosition(),goal=this.goalState();return {time:this.time,reward:this.reward,rewardTerms:{...this.rewardTerms},distance:p.x-this.initialX,speed:(p.x-this.initialX)/Math.max(this.time,DT),height:p.y-this.groundHeight(p.x),falls:this.falls,recoveries:this.recoveries,passed:this.passed.size,upright:this.uprightTime/Math.max(this.time,DT),energy:this.energy,pushes:this.pushesApplied,pushResistance:this.pushRecoveryTime,done:!!this.done,recovering:this.isDown,targetSpeed:goal.target,goalDistance:goal.error,command:this.command?{...this.command}:null};}
  snapshot(){return {time:this.time,parts:this.bodies.map(p=>{const v=p.body.getPosition();return [v.x,v.y,p.body.getAngle()]}),metrics:this.metrics()};}
}
export function robotGeometry(sim){
 return {parts:sim.bodies.map(({name,w,h,circle,color})=>({name,w,h,circle,color})),joints:sim.motors.map(m=>({name:m.name,a:sim.bodies.findIndex(p=>p.body===m.joint.getBodyA()),b:sim.bodies.findIndex(p=>p.body===m.joint.getBodyB()),anchor:[m.joint.getLocalAnchorA().x,m.joint.getLocalAnchorA().y]}))};
}
export function episode(weights,stage='balance',seed=1,options={}){
  const sim=new RobotWorld(stage,{seed,...options}),trace=[];
  while(!sim.done){sim.step(weights,false);if(options.record&&sim.steps%2===0)trace.push(sim.snapshot());}
  return {metrics:sim.metrics(),pushPlan:sim.pushes.map(p=>({...p})),commandSchedule:sim.commandSchedule.map(p=>structuredClone(p)),trace,...(options.summaryOnly?{}:robotGeometry(sim)),obstacles:sim.obstacles,terrain:sim.terrain};
}
export function passedStage(metrics,stage){
  if(stage==='balance')return metrics.upright>.95&&metrics.falls===0&&Math.abs(metrics.distance)<1&&metrics.height>.75;
  if(stage==='recover')return metrics.recoveries>=1&&metrics.height>.75;
  if(stage==='walk')return metrics.distance>1.5&&metrics.upright>.6;
  if(stage==='run')return metrics.distance>4&&metrics.upright>.5;
  return metrics.passed>=1&&metrics.upright>.5;
}

export const VALIDATION_CASES = [
 {id:'still',label:'정지',seed:31,pushes:[]},
 {id:'light',label:'앞뒤 2 N·s',seed:1000,pushes:[{time:2,strength:2,direction:0,location:'torso'},{time:5,strength:2,direction:180,location:'torso'}]},
 {id:'medium',label:'어깨·골반 4 N·s',seed:2047,pushes:[{time:2,strength:4,direction:180,location:'shoulder'},{time:5,strength:4,direction:0,location:'pelvis'}]},
 {id:'strong',label:'앞뒤 6 N·s',seed:4093,pushes:[{time:1.8,strength:6,direction:0,location:'shoulder'},{time:4.8,strength:6,direction:180,location:'torso'}]},
];
export function evaluateAbility(weights,stage,environment={}){
 const cases=VALIDATION_CASES.map(c=>{const metrics=episode(weights,stage,c.seed,{...environment,pushes:c.pushes,disturbances:false,summaryOnly:true}).metrics;return {id:c.id,label:c.label,passed:passedStage(metrics,stage),reward:metrics.reward,metrics};});
 return {meanReward:cases.reduce((s,c)=>s+c.reward,0)/cases.length,passRate:cases.filter(c=>c.passed).length/cases.length,cases};
}
export function evaluateAbilities(weights,environment={}){return Object.fromEntries(Object.keys(STAGES).map(stage=>[stage,evaluateAbility(weights,stage,environment)]));}

export function evaluateCommands(weights,environment={}){return COMMAND_CASES.reduce((total,c)=>total+episode(weights,'walk',71,{...environment,observationSeconds:8,disturbances:false,pushes:[],command:null,commandSchedule:c.schedule,summaryOnly:true}).metrics.reward,0)/COMMAND_CASES.length;}
