export const DT=.04,STEPS=500,ACTION_COUNT=27;
export const SWING=Object.freeze({pivotHeight:5.50,ropeLength:4.30,maxAngle:1.3});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hipTargets=[-.42,0,.42],kneeTargets=[.12,.75,1.38];
export function actionTargets(action){if(!Number.isInteger(action)||action<0||action>=ACTION_COUNT)throw new RangeError('Invalid swing action');return {hip:hipTargets[Math.floor(action/9)],leftKnee:kneeTargets[Math.floor(action/3)%3],rightKnee:kneeTargets[action%3]};}
export class SwingLearner{
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){this.q=new Map();this.episodes=0;this.history=[];this.resetEpisode();}
 resetEpisode(){this.theta=.07;this.omega=0;this.hip=0;this.hipV=0;this.leftKnee=.18;this.rightKnee=.18;this.leftKneeV=0;this.rightKneeV=0;this.steps=0;this.total=0;this.peak=0;this.exploring=false;}
 get knee(){return (this.leftKnee+this.rightKnee)/2;}
 state(){const bin=(v,a,b,n)=>Math.min(n-1,Math.floor((clamp(v,a,b)-a)/(b-a)*n));return [bin(this.theta,-1.3,1.3,15),bin(this.omega,-3,3,15),bin(this.hip,-.5,.5,3),bin(this.leftKnee,0,1.45,3),bin(this.rightKnee,0,1.45,3)].join(',');}
 values(s,create=true){if(!this.q.has(s)){if(!create)return new Float64Array(ACTION_COUNT);this.q.set(s,new Float64Array(ACTION_COUNT));}return this.q.get(s);}
 choose(s,epsilon,learn=true){this.exploring=learn&&this.random()<epsilon;if(this.exploring)return Math.floor(this.random()*ACTION_COUNT);const q=this.values(s,learn),max=Math.max(...q),best=[];q.forEach((v,i)=>{if(v===max)best.push(i);});return learn?best[Math.floor(this.random()*best.length)]:best.includes(9)?9:best[0];}
 physics(action,objective){const target=actionTargets(action),oldH=this.hip,oldL=this.leftKnee,oldR=this.rightKnee;
  for(let i=0;i<4;i++){const dt=DT/4,ha=clamp(28*(target.hip-this.hip)-7*this.hipV,-14,14);this.hipV+=ha*dt;this.hip=clamp(this.hip+this.hipV*dt,-.5,.5);
   for(const side of ['left','right']){const key=side+'Knee',v=key+'V',a=clamp(25*(target[key]-this[key])-7*this[v],-16,16);this[v]+=a*dt;this[key]=clamp(this[key]+this[v]*dt,.06,1.45);}
   // Standing: bending lowers the centre of mass, increasing its distance from the pivot.
   const length=SWING.ropeLength-(.85-.20*this.knee/1.45),lengthV=.20/1.45*(this.leftKneeV+this.rightKneeV)/2,offset=.14*Math.sin(this.hip);
   const accel=-9.81/length*(Math.sin(this.theta)+offset/length*Math.cos(this.theta))-.045*this.omega-2*lengthV/length*this.omega-.12*ha;
   this.omega=clamp(this.omega+accel*dt,-4.8,4.8);this.theta+=this.omega*dt;
   if(Math.abs(this.theta)>SWING.maxAngle){this.theta=clamp(this.theta,-SWING.maxAngle,SWING.maxAngle);this.omega*=-.2;}
  }
  const height=SWING.ropeLength*(1-Math.cos(this.theta));this.peak=Math.max(this.peak,height);
  const effort=(this.hip-oldH)**2+(this.leftKnee-oldL)**2+(this.rightKnee-oldR)**2,stability=clamp(1-.35*(this.hip/.5)**2-.25*Math.abs(this.leftKnee-this.rightKnee)/1.45-.25*Math.min(1,effort/.012),0,1);
  return objective*height/(SWING.ropeLength*(1-Math.cos(SWING.maxAngle)))+(1-objective)*stability-.006*(Math.abs(this.hipV)+Math.abs(this.leftKneeV)+Math.abs(this.rightKneeV));
 }
 snapshot(){return {theta:this.theta,omega:this.omega,time:this.steps*DT,hip:this.hip,leftKnee:this.leftKnee,rightKnee:this.rightKnee};}
 step(epsilon,objective,learn=true){const s=this.state(),action=this.choose(s,epsilon,learn),reward=this.physics(action,objective);this.total+=reward;this.steps++;
  const done=this.steps>=STEPS;if(learn){const q=this.values(s),target=reward+(done?0:.98*Math.max(...this.values(this.state())));q[action]+=.12*(target-q[action]);}
  if(done){const result={reward:this.total/STEPS,peak:this.peak};if(learn){this.episodes++;this.history.push(result);if(this.history.length>100)this.history.shift();}this.resetEpisode();return result;}return null;
 }
}
