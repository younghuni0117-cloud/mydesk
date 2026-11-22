import {DOG,policy,rotate,clamp} from './robotdog-rig.mjs?v=dog21';
export class DogExecution{
 constructor(){this.kind='stop';this.speed=.6;this.yaw=0;this.filteredSpeed=0;this.filteredYaw=0;this.active='balance';this.recovering=false;this.manualRecovery=false;this.lowTime=0;this.uprightTime=0;this.controlTick=0;this.action=Array(12).fill(0);this.previousAction=Array(12).fill(0);this.transition=1;this.switches=[];}
 command(kind,speed=this.speed,yaw){this.speed=clamp(Number(speed)||0,0,10);this.yaw=clamp(Number(yaw??(kind==='stop'?0:this.yaw))||0,-1.5,1.5);if(kind==='recover')this.manualRecovery=true;else{this.kind=kind==='backward'?'backward':kind==='forward'?'forward':'stop';}}
 step(world,model){const dt=DOG.dt,up=rotate([0,1,0],world.a)[1],height=world.posePotential(),feet=world.contacts.filter(Boolean).length;
  this.lowTime=up<.45||height<.30?this.lowTime+dt:0;this.uprightTime=(world.assessRecovery?world.assessRecovery().ready:up>.90&&height>.75&&feet>=3)?this.uprightTime+dt:0;
  if(this.manualRecovery){this.recovering=true;this.manualRecovery=false;this.uprightTime=0;}else if(this.lowTime>.18)this.recovering=true;
  if(this.recovering&&this.uprightTime>1.2){this.recovering=false;this.lowTime=0;}
  const moving=this.kind!=='stop'&&this.speed>.02,rotating=Math.abs(this.yaw)>.03,next=this.recovering?'recovery':moving?(this.kind==='backward'?'backward':'forward'):rotating?'turn':'balance';
  if(next!==this.active){this.previousAction=[...this.action];this.transition=0;this.switches.push({time:world.time,from:this.active,to:next});this.switches=this.switches.slice(-20);this.active=next;this.controlTick=0;}
  const goal=this.active==='recovery'?'recover':this.active==='balance'?'stand':moving?(this.kind==='backward'?'backward':'move'):'turn';
  const speedTarget=moving?this.speed:0,yawTarget=['forward','backward','turn'].includes(this.active)?this.yaw:0;this.filteredSpeed+=clamp(speedTarget-this.filteredSpeed,-1.5*dt,1.5*dt);this.filteredYaw+=clamp(yawTarget-this.filteredYaw,-2*dt,2*dt);world.setCommand(goal,moving?this.filteredSpeed:0,this.filteredYaw);
  if(this.controlTick++%DOG.controlSteps===0){const nextAction=policy(model.policies[this.active].weights,world.observations());this.transition=Math.min(1,this.transition+DOG.dt*DOG.controlSteps/.15);this.action=nextAction.map((v,i)=>this.previousAction[i]*(1-this.transition)+v*this.transition);}
  world.stepAction(this.action);return this.active;
 }
 snapshot(){return{kind:this.kind,speed:this.speed,yaw:this.yaw,active:this.active,recovering:this.recovering,transition:this.transition,switches:this.switches.map(v=>({...v}))};}
}
