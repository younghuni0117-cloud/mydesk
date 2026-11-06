import { World, Vec2, Box, Circle, RevoluteJoint } from './vendor/planck.mjs';
export const DT = 1 / 60;
export const POLICY_SIZE = 32;
export const STAGES = {
  balance: { label: '균형 잡기', speed: 0, duration: 8 },
  recover: { label: '넘어졌다 일어서기', speed: 0, duration: 10 },
  walk: { label: '앞으로 걷기', speed: .55, duration: 10 },
  run: { label: '빠르게 달리기', speed: 1.4, duration: 10 },
  obstacles: { label: '장애물 통과', speed: .65, duration: 12 },
};
export const JOINTS = ['waist','neck','leftHip','leftKnee','leftAnkle','leftToe','rightHip','rightKnee','rightAnkle','rightToe','leftShoulder','leftElbow','leftWrist','rightShoulder','rightElbow','rightWrist'];
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function seeded(seed) { return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; }
const wrap = a => Math.atan2(Math.sin(a),Math.cos(a));
export class RobotWorld {
  constructor(stage='balance', options={}) {
    this.stage = STAGES[stage] ? stage : 'balance'; this.task=STAGES[this.stage];
    this.seed=options.seed??1;this.random=seeded(this.seed);this.time=0;this.reward=0;this.energy=0;this.steps=0;
    this.falls=0;this.recoveries=0;this.uprightTime=0;this.stableTime=0;this.isDown=false;this.downTime=0;this.recoveryClock=0;this.impactCost=0;this.passed=new Set();this.contacts=new Map();
    this.assist=clamp(options.assist??.6,0,.8);
    this.world=new World(Vec2(0,-9.81));this.bodies=[];this.parts={};this.joints={};this.motors=[];
    const floor=this.world.createBody({userData:'ground'});floor.createFixture(Box(500,.15,Vec2(0,-.15)),{friction:1.1});
    this.obstacles=[];
    if(this.stage==='obstacles')for(const [i,x] of [2,4.2,6.4,8.6].entries()){
      const height=(options.obstacleHeight??.14)+(i%2)*.04;
      const body=this.world.createBody({position:Vec2(x,height/2),userData:'obstacle'});body.createFixture(Box(.16,height/2),{friction:.8});this.obstacles.push({x,width:.32,height});
    }
    const lying=this.stage==='recover' && options.startStanding!==true;
    this.spawnAngle=lying?(this.random()<.5?Math.PI/2:-Math.PI/2):(this.random()-.5)*.025;
    this.spawnY=lying?.34:1.03;
    this.makeRobot();this.initialX=this.parts.pelvis.getPosition().x;this.lastX=this.initialX;this.lastHeight=this.parts.pelvis.getPosition().y;
    this.phaseOffset=Math.PI/2;
    this.nextPush=3+(this.random()*.6);this.autoPush=options.autoPush??this.stage==='balance';this.obstacleHeight=options.obstacleHeight??.14;
    const contact=(contact,amount)=>{
      const a=contact.getFixtureA().getBody().getUserData(),b=contact.getFixtureB().getBody().getUserData();
      const name=a==='ground'||a==='obstacle'?b:b==='ground'||b==='obstacle'?a:null;
      if(typeof name==='string')this.contacts.set(name,Math.max(0,(this.contacts.get(name)||0)+amount));
    };
    this.world.on('begin-contact',c=>contact(c,1));this.world.on('end-contact',c=>contact(c,-1));
    this.world.on('post-solve',(c,impulse)=>{
      const names=[c.getFixtureA().getBody().getUserData(),c.getFixtureB().getBody().getUserData()];
      if(names.includes('ground')||names.includes('obstacle'))if(names.some(n=>['head','torso','pelvis'].includes(n)))this.impactCost+=Math.min(4,impulse.normalImpulses.reduce((a,b)=>a+b,0)*.06);
    });
  }
  transform(x,y){const dy=y-1.03,c=Math.cos(this.spawnAngle),s=Math.sin(this.spawnAngle);return Vec2(c*x-s*dy,this.spawnY+s*x+c*dy);}
  part(name,x,y,w,h,mass,color,circle=false){
    const body=this.world.createDynamicBody({position:this.transform(x,y),angle:this.spawnAngle,linearDamping:.05,angularDamping:.12,allowSleep:false,userData:name});
    const shape=circle?Circle(w):Box(w/2,h/2),area=circle?Math.PI*w*w:w*h;
    body.createFixture(shape,{density:mass/area,friction:name.includes('Foot')||name.includes('Toe')?1.2:.5,restitution:.015,filterGroupIndex:-1});
    const item={name,body,w,h,circle,color};this.bodies.push(item);this.parts[name]=body;return body;
  }
  joint(name,a,b,x,y,lower,upper,torque){
    const joint=this.world.createJoint(RevoluteJoint({enableLimit:true,lowerAngle:lower,upperAngle:upper,enableMotor:true,maxMotorTorque:torque,motorSpeed:0,collideConnected:false},a,b,this.transform(x,y)));
    this.joints[name]=joint;this.motors.push({name,joint,lower,upper,torque});
  }
  makeRobot(){
    const pelvis=this.part('pelvis',0,1.06,.3,.18,4,'#536d8c');
    const torso=this.part('torso',0,1.375,.32,.45,6,'#6788ac');
    const head=this.part('head',0,1.75,.13,.13,1,'#bdcbdc',true);
    this.joint('waist',pelvis,torso,0,1.15,-.65,.65,70);this.joint('neck',torso,head,0,1.62,-.6,.6,8);
    for(const [side,color] of [['left','#8fa8c5'],['right','#d6a174']]){
      const thigh=this.part(side+'Thigh',0,.805,.11,.45,1.4,color);
      const shin=this.part(side+'Shin',0,.355,.085,.45,1,color);
      const foot=this.part(side+'Foot',.07,.08,.25,.1,.5,color);
      const toe=this.part(side+'ToePart',.255,.08,.12,.06,.15,color);
      this.joint(side+'Hip',pelvis,thigh,0,1.03,-1.2,1.2,80);
      this.joint(side+'Knee',thigh,shin,0,.58,-2.5,.1,80);
      this.joint(side+'Ankle',shin,foot,0,.13,-1.1,1.1,45);
      this.joint(side+'Toe',foot,toe,.195,.08,-.7,.7,12);
      const sx=side==='left'?-.12:.12;
      const upper=this.part(side+'UpperArm',sx,1.39,.075,.28,.7,color);
      const lower=this.part(side+'Forearm',sx,1.12,.065,.26,.5,color);
      const hand=this.part(side+'Hand',sx,.93,.09,.12,.2,color);
      this.joint(side+'Shoulder',torso,upper,sx,1.53,-2.5,2.5,25);
      this.joint(side+'Elbow',upper,lower,sx,1.25,-2.4,2.4,20);
      this.joint(side+'Wrist',lower,hand,sx,.99,-1.2,1.2,8);
    }
  }
  push(strength=4,direction=0,location='torso',duration=0){
    const body=location==='shoulder'?this.parts.torso:this.parts[location]||this.parts.torso,angle=direction*Math.PI/180;
    const vector=Vec2(Math.cos(angle)*strength,Math.sin(angle)*strength);
    const point=location==='shoulder'?body.getWorldPoint(Vec2(.12,.2)):body.getWorldCenter();
    if(duration>0)this.sustainedPush={body,vector,localPoint:body.getLocalPoint(point),remaining:duration};
    else body.applyLinearImpulse(vector,point,true);
  }
  control(weights){
    const p=i=>Math.tanh(weights[i]||0),pelvis=this.parts.pelvis,torso=this.parts.torso;
    const pa=wrap(pelvis.getAngle()),ta=wrap(torso.getAngle()),tw=torso.getAngularVelocity(),height=pelvis.getPosition().y;
    const low=height<.5||Math.abs(ta)>1;
    if(low){this.downTime+=DT;if(!this.isDown&&this.downTime>.15){this.isDown=true;this.falls++;this.reward-=12;this.recoveryClock=0;}}
    else this.downTime=0;
    let targets={waist:clamp(-pa-.1*tw,-.5,.5),neck:-.25*ta};
    const recovering=this.isDown && this.stableTime<.8;
    if(recovering){
      this.recoveryClock+=DT;const t=this.recoveryClock%(3.2+.6*p(15));
      const folded=t<.65, pushing=t>=.65&&t<1.9;
      for(const side of ['left','right']){
        const back=pa<0;
        targets[side+'Hip']=back?(folded?1.15:pushing?.95:.25):(folded?-.9:pushing?-.6:.2);
        targets[side+'Knee']=back?(folded?-.65:pushing?-.5:-.45):(folded?-1.8:pushing?-1.1:-.45);
        targets[side+'Ankle']=clamp(-pa-targets[side+'Hip']-targets[side+'Knee'],-1.05,1.05);
        targets[side+'Toe']=0;
        const face=ta>0?-1:1;
        targets[side+'Shoulder']=face*(folded?1.1:pushing?1.6:.1);
        targets[side+'Elbow']=face*(folded?-1.4:pushing?-.2:-.35);
        targets[side+'Wrist']=-face*.4;
      }
      targets.waist=clamp(-pa*.4,-.6,.6);
    }else{
      const speed=this.task.speed, frequency=speed===0?0:(this.stage==='run'?2.2:1.2)+.5*p(3);
      const phase=this.time*frequency*2*Math.PI+this.phaseOffset;
      const ramp=clamp((this.time-1.2)/1.5,0,1);
      const stride=speed===0?0:((this.stage==='run'?.27:.12)+.08*p(0))*ramp;
      const lean=speed===0?0:-.035-.035*p(4);
      const correction=clamp(-(.2+.15*p(5))*(ta-lean)-(.04+.03*p(6))*tw,-.3,.3);
      for(const [index,side] of ['left','right'].entries()){
        const phaseLeg=phase+index*Math.PI,swing=Math.max(0,Math.sin(phaseLeg));
        let lift=speed===0?0:((this.stage==='run'?.16:.065)+.04*p(1))*ramp;
        const ahead=this.obstacles.find(o=>o.x>pelvis.getPosition().x-.3);
        if(ahead&&ahead.x-pelvis.getPosition().x<.9)lift=Math.max(lift,ahead.height+.12+.05*p(2));
        const ankleY=.12+lift*swing;
        const down=clamp(height-ankleY,.45,.89);
        const dx=clamp(-stride*Math.cos(phaseLeg)+correction+.06*p(7)-.035,-.36,.36);
        const r2=clamp(dx*dx+down*down,.04,.899*.899);
        const knee=-Math.acos(clamp((r2-2*.45*.45)/(2*.45*.45),-1,1));
        const hip=Math.atan2(dx,down)-knee/2;
        targets[side+'Hip']=hip-pa;
        targets[side+'Knee']=knee+.08*p(10);
        targets[side+'Ankle']=clamp(-hip-knee+(1.6+.6*p(5))*(ta-lean)+(.3+.12*p(6))*tw+.1*p(2),-1.05,1.05);
        targets[side+'Toe']=.16*swing*p(11);
        targets[side+'Shoulder']=-.4*stride*Math.cos(phaseLeg)*(1+.8*p(8));
        targets[side+'Elbow']=-.25;
        targets[side+'Wrist']=0;
      }
      targets.waist=clamp(-pa-(.2+.15*p(9))*tw,-.6,.6);
    }
    let work=0;
    let mass=0,comX=0,comV=0;for(const part of this.bodies){const m=part.body.getMass();mass+=m;comX+=m*part.body.getPosition().x;comV+=m*part.body.getLinearVelocity().x;}comX/=mass;comV/=mass;
    const supports=['left','right'].filter(side=>(this.contacts.get(side+'Foot')||0)+(this.contacts.get(side+'ToePart')||0)>0);
    const supportX=supports.length?supports.reduce((sum,side)=>sum+this.parts[side+'Foot'].getPosition().x,0)/supports.length:comX;
    const kp=10+5*p(12),kd=.6+.25*p(13),gain=1+.25*p(14);
    for(const [i,name] of JOINTS.entries()){
      const motor=this.motors.find(m=>m.name===name),joint=motor.joint;
      const target=clamp((targets[name]||0)+(recovering?.45:.13)*p(16+i),motor.lower+.01,motor.upper-.01);
      joint.setMotorSpeed(clamp(kp*(target-joint.getJointAngle())-kd*joint.getJointSpeed(),-9,9));joint.setMaxMotorTorque(motor.torque*gain);

      work+=Math.abs(joint.getMotorTorque(1/DT)*joint.getJointSpeed())*DT;
    }
    return work;
  }
  step(weights=Array(POLICY_SIZE).fill(0)){
    this.impactCost=0;const work=this.control(weights);this.energy+=work;
    if(this.assist>0){
      const hip=this.parts.pelvis,torso=this.parts.torso,mass=this.bodies.reduce((s,p)=>s+p.body.getMass(),0),v=hip.getLinearVelocity();
      const lift=clamp(mass*9.81+500*(1.02-hip.getPosition().y)-70*v.y,0,mass*9.81*2);
      hip.applyForceToCenter(Vec2(0,this.assist*lift),true);
      hip.applyTorque(this.assist*(-120*wrap(hip.getAngle())-22*hip.getAngularVelocity()),true);
      torso.applyTorque(this.assist*(-80*wrap(torso.getAngle())-14*torso.getAngularVelocity()),true);
    }
    if(this.sustainedPush&&this.sustainedPush.remaining>0){this.sustainedPush.body.applyForce(this.sustainedPush.vector,this.sustainedPush.body.getWorldPoint(this.sustainedPush.localPoint),true);this.sustainedPush.remaining-=DT;}
    if(this.autoPush&&this.time>=this.nextPush){this.push((this.random()<.5?-1:1)*1.5);this.nextPush=Infinity;}
    this.world.step(DT,8,3);this.time+=DT;this.steps++;
    const pelvis=this.parts.pelvis,torso=this.parts.torso,pos=pelvis.getPosition(),velocity=pelvis.getLinearVelocity();
    const angle=wrap(torso.getAngle()),footDown=['leftFoot','rightFoot','leftToePart','rightToePart'].some(n=>(this.contacts.get(n)||0)>0);
    const upright=pos.y>.75&&Math.abs(angle)<.5&&footDown;
    if(upright){this.uprightTime+=DT;this.stableTime+=DT;}else this.stableTime=0;
    if(this.isDown&&this.stableTime>.8){this.isDown=false;this.recoveries++;this.reward+=8;}
    const dx=pos.x-this.lastX;
    const target=this.task.speed,tracking=Math.exp(-Math.pow(velocity.x-target,2)/.3);
    let r=DT*((upright?2:.1)+tracking*2-1.2*angle*angle-.8*Math.max(0,.9-pos.y));
    if(target>0)r+=clamp(dx,-.08,.08)*(upright?5:.1);else r-=DT*.8*Math.abs(pos.x);
    if(this.stage==='recover')r+=2*(pos.y-this.lastHeight);
    r-=this.impactCost*.5;
    r-=.003*work;
    for(const [i,o]of this.obstacles.entries())if(!this.passed.has(i)&&pos.x>o.x+o.width/2+.2&&upright){this.passed.add(i);r+=10;}
    this.reward+=r;this.lastX=pos.x;this.lastHeight=pos.y;
    this.done=this.steps>=Math.round(this.task.duration/DT)||Math.abs(pos.x)>40||pos.y<-.8||!Number.isFinite(this.reward);
    return this.metrics();
  }
  metrics(){const p=this.parts.pelvis.getPosition();return {time:this.time,reward:this.reward,distance:p.x-this.initialX,speed:(p.x-this.initialX)/Math.max(this.time,DT),height:p.y,falls:this.falls,recoveries:this.recoveries,passed:this.passed.size,upright:this.uprightTime/Math.max(this.time,DT),energy:this.energy,done:!!this.done,recovering:this.isDown};}
  snapshot(){return {time:this.time,parts:this.bodies.map(p=>{const v=p.body.getPosition();return [v.x,v.y,p.body.getAngle()]}),metrics:this.metrics()};}
}
export function robotGeometry(sim){
 return {parts:sim.bodies.map(({name,w,h,circle,color})=>({name,w,h,circle,color})),joints:sim.motors.map(m=>({name:m.name,a:sim.bodies.findIndex(p=>p.body===m.joint.getBodyA()),b:sim.bodies.findIndex(p=>p.body===m.joint.getBodyB()),anchor:[m.joint.getLocalAnchorA().x,m.joint.getLocalAnchorA().y]}))};
}
export function episode(weights,stage='balance',seed=1,options={}){
  const sim=new RobotWorld(stage,{seed,...options}),trace=[];
  while(!sim.done){sim.step(weights);if(options.record&&sim.steps%4===0)trace.push(sim.snapshot());}
  return {metrics:sim.metrics(),trace,...robotGeometry(sim),obstacles:sim.obstacles};
}
export function passedStage(metrics,stage){
  if(stage==='balance')return metrics.upright>.8&&Math.abs(metrics.distance)<1;
  if(stage==='recover')return metrics.recoveries>=1&&metrics.height>.75;
  if(stage==='walk')return metrics.distance>1.5&&metrics.upright>.6;
  if(stage==='run')return metrics.distance>4&&metrics.upright>.5;
  return metrics.passed>=1&&metrics.upright>.5;
}
